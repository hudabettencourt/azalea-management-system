import * as XLSX from "xlsx";

export interface ShopeeIncomeRow {
  order_id: string;
  gross_amount: number;
  total_fee: number;
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
  // Baca nilai berdasarkan nama label di col 0 atau col 1
  console.log(`✅ Format SUMMARY — baca nilai per label`);

  const labelMap: Record<string, number> = {};
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i] as any[];
    // Col 1 = label, col 2 = nilai
    const label = String(row[1] || "").trim();
    const nilai  = parseNumber(row[2]);
    if (label) labelMap[label] = nilai;
    // Col 0 = label alternatif, col 1 = nilai
    const label0 = String(row[0] || "").trim();
    const nilai1  = parseNumber(row[1]);
    if (label0 && !labelMap[label0]) labelMap[label0] = nilai1;
  }

  const gross_amount = Math.abs(labelMap["Harga Asli Produk"] || 0);
  const feeLabels = [
    "Biaya Komisi AMS", "Biaya Administrasi", "Biaya Layanan",
    "Biaya Proses Pesanan", "Biaya Program Hemat Biaya Kirim",
    "Biaya Transaksi", "Biaya Kampanye", "Bea Masuk, PPN & PPh",
    "Biaya Isi Saldo Otomatis (dari Penghasilan)",
  ];
  let total_fee = 0;
  for (const label of feeLabels) {
    total_fee += Math.abs(labelMap[label] || 0);
  }

  console.log(`💰 Gross: ${gross_amount}, Fee: ${total_fee}`);

  if (gross_amount === 0) {
    console.error("❌ Gross amount = 0, data tidak valid");
    return [];
  }

  // Format summary = 1 record agregat, pakai periode sebagai order_id
  const dari  = String(labelMap["Dari"] || "").trim() || "unknown";
  const ke    = String(labelMap["ke"] || "").trim() || "unknown";
  const order_id = `SUMMARY_${dari}_${ke}`.replace(/\s/g, "");

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
