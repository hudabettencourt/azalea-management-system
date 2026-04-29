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

  // Start from row 7 (index 6) - skip header at row 6
  for (let i = 6; i < rawData.length; i++) {
    const row = rawData[i];

    // Column B (index 1): Order ID
    const orderIdRaw = row[1];
    if (!orderIdRaw || String(orderIdRaw).trim() === "") {
      console.log(`⏭️ Row ${i + 1}: Empty order ID, skipping`);
      continue;
    }
    const order_id = String(orderIdRaw).trim();

    // Column H (index 7): Harga Asli (Gross Amount)
    const gross_amount = parseNumber(row[7]);

    // Columns W-AE (index 22-30): Sum all fee columns
    let total_fee = 0;
    for (let colIdx = 22; colIdx <= 30; colIdx++) {
      const feeValue = parseNumber(row[colIdx]);
      total_fee += feeValue;
    }

    console.log(`✅ Row ${i + 1}: Order ${order_id}, Gross ${gross_amount}, Fee ${total_fee}`);

    results.push({
      order_id,
      gross_amount,
      total_fee
    });
  }

  console.log(`✅ Total parsed rows: ${results.length}`);
  console.log(`💰 Total fee sum: ${results.reduce((sum, r) => sum + r.total_fee, 0)}`);

  return results;
}

function parseNumber(value: any): number {
  if (typeof value === "number") return value;
  if (!value) return 0;

  const str = String(value).trim();
  if (str === "" || str === "-") return 0;

  // Remove thousand separators (dots), replace comma with dot for decimals
  const cleaned = str.replace(/\./g, "").replace(/,/g, ".");
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? 0 : parsed;
}