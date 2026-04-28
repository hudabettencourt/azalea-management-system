// lib/parse-shopee-income.ts
import * as XLSX from 'xlsx';

export interface ShopeeIncomeRow {
  noPesanan: string;
  usernamePembeli: string;
  tanggalDanaRilis: string;
  hargaAsliProduk: number;
  totalPenghasilan: number;
  totalFee: number;
}

export function parseShopeeIncome(file: File): Promise<ShopeeIncomeRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as any[][];
        
        // Row 6 (index 5) = header
        const dataRows = rows.slice(6);
        
        const result: ShopeeIncomeRow[] = dataRows
          .filter(r => r && r[1] && String(r[1]).length > 5)
          .map(r => {
            const num = (v: any) => Math.abs(Number(v) || 0);
            
            // Sum columns W-AE (index 22-30)
            let fee = 0;
            for (let i = 22; i <= 30; i++) {
              fee += num(r[i]);
            }
            
            return {
              noPesanan: String(r[1] || ''),
              usernamePembeli: String(r[3] || ''),
              tanggalDanaRilis: String(r[6] || ''),
              hargaAsliProduk: num(r[7]),
              totalPenghasilan: num(r[32]),
              totalFee: fee,
            };
          });
        
        console.log(`✅ Parsed ${result.length} rows`);
        console.log('Sample:', result[0]);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    
    reader.readAsArrayBuffer(file);
  });
}

export function getPeriode(rows: ShopeeIncomeRow[]) {
  if (!rows.length) return { start: '', end: '' };
  
  const dates = rows
    .map(r => new Date(r.tanggalDanaRilis))
    .filter(d => !isNaN(d.getTime()));
  
  const min = new Date(Math.min(...dates.map(d => d.getTime())));
  const max = new Date(Math.max(...dates.map(d => d.getTime())));
  
  return {
    start: min.toISOString().split('T')[0],
    end: max.toISOString().split('T')[0],
  };
}

export function getSummary(rows: ShopeeIncomeRow[]) {
  const totalGross = rows.reduce((s, r) => s + r.hargaAsliProduk, 0);
  const totalFee = rows.reduce((s, r) => s + r.totalFee, 0);
  
  return {
    totalTransaksi: rows.length,
    totalGrossAmount: totalGross,
    totalFee: totalFee,
    feePercentage: totalGross > 0 ? (totalFee / totalGross) * 100 : 0,
  };
}
