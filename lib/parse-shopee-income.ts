import * as XLSX from "xlsx";

export interface ShopeeIncomeRow {
  order_id: string;
  gross_amount: number;
  total_fee: number;
}

export function parseShopeeIncome(buffer: Buffer): ShopeeIncomeRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });

  console.log(`📊 Total rows in Excel: ${rawData.length}`);

  const results: ShopeeIncomeRow[] = [];

  // Header ada di row 6 (index 5), data mulai row 7 (index 6)
  // Col 1  = No. Pesanan
  // Col 7  = Harga Asli Produk (gross)
  // Col 22 = Biaya Komisi AMS
  // Col 23 = Biaya Administrasi
  // Col 24 = Biaya Layanan
  // Col 25 = Biaya Proses Pesanan
  // Col 27 = Biaya Program Hemat Biaya Kirim
  // Col 28 = Biaya Transaksi
  // Col 29 = Biaya Kampanye
  // Semua fee kolom bernilai NEGATIF di Excel → kita ambil Math.abs()

  for (let i = 6; i < rawData.length; i++) {
    const row = rawData[i];

    // Skip baris kosong
    const orderIdRaw = row[1];
    if (!orderIdRaw || String(orderIdRaw).trim() === "") continue;

    const order_id = String(orderIdRaw).trim();

    // Gross amount = Harga Asli Produk (col 7)
    const gross_amount = Math.abs(parseNumber(row[7]));

    // Skip baris yang gross = 0 (baris total/summary)
    if (gross_amount === 0) continue;

    // Fee = jumlah semua biaya (col 22-31), ambil nilai absolut karena negatif di Excel
    const feeColIndices = [22, 23, 24, 25, 27, 28, 29, 30, 31];
    let total_fee = 0;
    for (const colIdx of feeColIndices) {
      total_fee += Math.abs(parseNumber(row[colIdx]));
    }

    console.log(`✅ Row ${i + 1}: Order ${order_id}, Gross ${gross_amount}, Fee ${total_fee}`);

    results.push({ order_id, gross_amount, total_fee });
  }

  console.log(`✅ Total parsed: ${results.length} rows`);
  console.log(`💰 Total gross: ${results.reduce((s, r) => s + r.gross_amount, 0)}`);
  console.log(`💸 Total fee: ${results.reduce((s, r) => s + r.total_fee, 0)}`);

  return results;
}

function parseNumber(value: any): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const str = String(value).trim();
  if (str === "" || str === "-") return 0;
  // Handle format Indonesia: titik = ribuan, koma = desimal
  const cleaned = str.replace(/\./g, "").replace(/,/g, ".");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}