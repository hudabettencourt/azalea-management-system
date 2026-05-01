import * as XLSX from "xlsx";

export interface ShopeeIncomeRow {
  order_id: string;
  gross_amount: number;
  total_fee: number;
}

// ── Helper: konversi berbagai format tanggal ke YYYY-MM-DD ──
function parseTanggal(val: any): string {
  if (!val) return "unknown";
  const str = String(val).trim();
  if (!str) return "unknown";

  // Format Excel serial number
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, "0");
      const d = String(date.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  // Format YYYY-MM-DD (sudah benar)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // Format DD/MM/YYYY atau D/M/YYYY
  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const d = String(dmy[1]).padStart(2, "0");
    const m = String(dmy[2]).padStart(2, "0");
    return `${dmy[3]}-${m}-${d}`;
  }

  // Format DD-MM-YYYY
  const dmyDash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmyDash) {
    const d = String(dmyDash[1]).padStart(2, "0");
    const m = String(dmyDash[2]).padStart(2, "0");
    return `${dmyDash[3]}-${m}-${d}`;
  }

  // Format "13 Apr 2026" atau "13 April 2026"
  const bulanMap: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", mei: "05", may: "05",
    jun: "06", jul: "07", agu: "08", aug: "08", sep: "09", okt: "10",
    oct: "10", nov: "11", des: "12", dec: "12",
    januari: "01", februari: "02", maret: "03", april: "04",
    juni: "06", juli: "07", agustus: "08", september: "09",
    oktober: "10", november: "11", desember: "12",
  };
  const wordy = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (wordy) {
    const d = String(wordy[1]).padStart(2, "0");
    const mKey = wordy[2].toLowerCase();
    const m = bulanMap[mKey] || "01";
    return `${wordy[3]}-${m}-${d}`;
  }

  console.warn("⚠️ Format tanggal tidak dikenali:", str);
  return "unknown";
}

export function parseShopeeIncome(buffer: Buffer): ShopeeIncomeRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData: any[][] = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    defval: "",
    blankrows: true,
  });

  console.log(`📊 Total rows: ${rawData.length}`);

  // ── Deteksi format: cek apakah ada kolom "No. Pesanan" (format tabel per pesanan) ──
  let headerRowIdx = -1;
  const colMap: Record<string, number> = {};

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i] as any[];
    const idx = row.findIndex((v: any) => String(v).trim() === "No. Pesanan");
    if (idx !== -1) {
      headerRowIdx = i;
      row.forEach((colName: any, j: number) => {
        if (colName) colMap[String(colName).trim()] = j;
      });
      console.log(`✅ Format TABEL — header di row ${i + 1}`);
      break;
    }
  }

  // ── FORMAT TABEL (per pesanan) ──
  if (headerRowIdx !== -1) {
    const COL_ORDER_ID = colMap["No. Pesanan"];
    const COL_GROSS    = colMap["Harga Asli Produk"];
    const feeColNames  = [
      "Biaya Komisi AMS", "Biaya Administrasi", "Biaya Layanan",
      "Biaya Proses Pesanan", "Biaya Program Hemat Biaya Kirim",
      "Biaya Transaksi", "Biaya Kampanye", "Bea Masuk, PPN & PPh",
      "Biaya Isi Saldo Otomatis (dari Penghasilan)",
    ];
    const feeColIndices = feeColNames
      .filter(n => colMap[n] !== undefined)
      .map(n => colMap[n]);

    const results: ShopeeIncomeRow[] = [];
    for (let i = headerRowIdx + 1; i < rawData.length; i++) {
      const row = rawData[i] as any[];
      const orderIdRaw = row[COL_ORDER_ID];
      if (!orderIdRaw || String(orderIdRaw).trim() === "") continue;
      const order_id    = String(orderIdRaw).trim();
      const gross_amount = Math.abs(parseNumber(row[COL_GROSS]));
      if (gross_amount === 0) continue;
      let total_fee = 0;
      for (const ci of feeColIndices) total_fee += Math.abs(parseNumber(row[ci]));
      results.push({ order_id, gross_amount, total_fee });
    }
    console.log(`📦 Total parsed (tabel): ${results.length}`);
    return results;
  }

  // ── FORMAT SUMMARY (vertikal — "Laporan Penghasilan") ──
  console.log(`✅ Format SUMMARY — baca nilai per label`);

  const labelMap: Record<string, any> = {};
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i] as any[];
    const label1 = String(row[1] || "").trim();
    if (label1) labelMap[label1] = row[2];
    const label0 = String(row[0] || "").trim();
    if (label0 && labelMap[label0] === undefined) labelMap[label0] = row[1];
  }

  // Cek berbagai kemungkinan label tanggal (case-insensitive)
  const findLabel = (keys: string[]): any => {
    for (const key of keys) {
      if (labelMap[key] !== undefined) return labelMap[key];
      const found = Object.keys(labelMap).find(k => k.toLowerCase() === key.toLowerCase());
      if (found) return labelMap[found];
    }
    return undefined;
  };

  const dariRaw = findLabel(["Dari", "dari", "Periode Dari", "Tanggal Mulai"]);
  const keRaw   = findLabel(["Ke", "ke", "ke ", "Sampai", "Periode Ke", "Tanggal Selesai"]);

  const dari = parseTanggal(dariRaw);
  const ke   = parseTanggal(keRaw);

  const gross_amount = Math.abs(parseNumber(findLabel(["Harga Asli Produk"]) ?? 0));
  const feeLabels = [
    "Biaya Komisi AMS", "Biaya Administrasi", "Biaya Layanan",
    "Biaya Proses Pesanan", "Biaya Program Hemat Biaya Kirim",
    "Biaya Transaksi", "Biaya Kampanye", "Bea Masuk, PPN & PPh",
    "Biaya Isi Saldo Otomatis (dari Penghasilan)",
  ];
  let total_fee = 0;
  for (const label of feeLabels) {
    const val = findLabel([label]);
    total_fee += Math.abs(parseNumber(val ?? 0));
  }

  console.log(`💰 Gross: ${gross_amount}, Fee: ${total_fee}`);

  if (gross_amount === 0) {
    console.error("❌ Gross amount = 0, data tidak valid");
    return [];
  }

  const order_id = `SUMMARY_${dari}_${ke}`;

  return [{ order_id, gross_amount, total_fee }];
}

function parseNumber(value: any): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const str = String(value).trim();
  if (str === "" || str === "-") return 0;
  const cleaned = str.replace(/\./g, "").replace(/,/g, ".");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}