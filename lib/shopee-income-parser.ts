// lib/shopee-income-parser.ts
// Parser untuk Excel "Income sudah dilepas" dari Shopee
// Extract fee breakdown dan mapping ke transaksi

import * as XLSX from 'xlsx';

export interface ShopeeIncomeRow {
  // Identifiers
  noPesanan: string;
  noPengajuan: string;
  usernamePembeli: string;
  waktuPesananDibuat: string;
  tanggalDanaRilis: string;
  
  // Amounts
  hargaAsliProduk: number;
  totalDiskonProduk: number;
  
  // Fee breakdown (semua negatif di Excel, kita ubah jadi positif)
  biayaKomisiAMS: number;
  biayaAdministrasi: number;
  biayaLayanan: number;
  biayaProsesPesanan: number;
  biayaKampanye: number;
  biayaHematKirim: number;
  biayaTransaksi: number;
  
  // Total
  totalPenghasilan: number;
  totalFee: number; // Calculated: sum of all biaya
}

export interface FeeUploadResult {
  success: boolean;
  periode: {
    start: string;
    end: string;
  };
  summary: {
    totalTransaksi: number;
    totalGrossAmount: number;
    totalFee: number;
    feePercentage: number;
    breakdown: {
      biayaKomisi: number;
      biayaAdministrasi: number;
      biayaLayanan: number;
      biayaProsesPesanan: number;
      biayaKampanye: number;
      biayaHematKirim: number;
      biayaTransaksi: number;
    };
  };
  transaksiUpdated: number;
  errors?: string[];
}

/**
 * Parse Excel "Income sudah dilepas" dari Shopee
 */
export function parseShopeeIncomeExcel(file: File): Promise<ShopeeIncomeRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Convert to JSON - get ALL rows as arrays
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1, // Return as array of arrays
          defval: null,
          raw: true, // Keep numbers as numbers
        }) as any[][];
        
        console.log('Total rows in Excel:', jsonData.length);
        console.log('First 10 rows:', jsonData.slice(0, 10));
        
        // Header is ALWAYS at row index 5 (row 6 in Excel, 0-indexed = 5)
        const headerRowIndex = 5;
        
        if (jsonData.length <= headerRowIndex) {
          throw new Error('File Excel terlalu pendek. Pastikan file adalah Excel Income Shopee yang benar.');
        }
        
        const headers = jsonData[headerRowIndex];
        const dataRows = jsonData.slice(headerRowIndex + 1);
        
        console.log('Headers (row 6):', headers);
        console.log('Data rows:', dataRows.length);
        
        // Parse each row using exact column indices (from analysis)
        const parsed: ShopeeIncomeRow[] = dataRows
          .filter(row => {
            // Filter rows dengan no pesanan valid (col 2)
            if (!Array.isArray(row)) return false;
            const noPesanan = row[1]; // Col 2 (0-indexed = 1)
            return noPesanan && String(noPesanan).length > 5;
          })
          .map(row => {
            const parseNumber = (val: any): number => {
              if (!val) return 0;
              if (typeof val === 'number') return Math.abs(val);
              
              // Handle Indonesian number format
              const cleaned = String(val)
                .replace(/\./g, '')
                .replace(/,/g, '.')
                .replace(/[^\d.-]/g, '');
              
              return Math.abs(parseFloat(cleaned) || 0);
            };
            
            // Extract fee components (all negative in Excel, convert to positive)
            const biayaKomisi = parseNumber(row[22]);      // Col 23
            const biayaAdmin = parseNumber(row[23]);       // Col 24
            const biayaLayanan = parseNumber(row[24]);     // Col 25
            const biayaProses = parseNumber(row[25]);      // Col 26
            const biayaKampanye = parseNumber(row[29]);    // Col 30
            const biayaHemat = parseNumber(row[27]);       // Col 28
            const biayaTransaksi = parseNumber(row[28]);   // Col 29
            
            const totalFee = biayaKomisi + biayaAdmin + biayaLayanan + 
                           biayaProses + biayaKampanye + biayaHemat + biayaTransaksi;
            
            return {
              noPesanan: String(row[1] || ''),                    // Col 2
              noPengajuan: String(row[2] || ''),                  // Col 3
              usernamePembeli: String(row[3] || ''),              // Col 4
              waktuPesananDibuat: String(row[4] || ''),           // Col 5
              tanggalDanaRilis: String(row[6] || ''),             // Col 7
              
              hargaAsliProduk: parseNumber(row[7]),               // Col 8
              totalDiskonProduk: parseNumber(row[8]),             // Col 9
              
              biayaKomisiAMS: biayaKomisi,
              biayaAdministrasi: biayaAdmin,
              biayaLayanan: biayaLayanan,
              biayaProsesPesanan: biayaProses,
              biayaKampanye: biayaKampanye,
              biayaHematKirim: biayaHemat,
              biayaTransaksi: biayaTransaksi,
              
              totalPenghasilan: parseNumber(row[32]),             // Col 33
              totalFee,
            };
          });
        
        console.log('Parsed rows:', parsed.length);
        if (parsed.length > 0) {
          console.log('Sample parsed:', parsed[0]);
        }
        
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Error parsing Excel: ${error}`));
      }
    };
    
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Get periode dari data income
 */
export function getPeriodeFromIncome(rows: ShopeeIncomeRow[]): { start: string; end: string } {
  if (rows.length === 0) {
    return { start: '', end: '' };
  }
  
  // Parse tanggal dana dilepaskan
  const dates = rows
    .map(r => {
      // Format: "2026-04-26" atau "26/04/2026"
      const dateStr = r.tanggalDanaRilis;
      if (!dateStr) return null;
      
      if (dateStr.includes('-')) {
        return new Date(dateStr);
      } else if (dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/');
        return new Date(`${year}-${month}-${day}`);
      }
      return null;
    })
    .filter(Boolean) as Date[];
  
  if (dates.length === 0) {
    return { start: '', end: '' };
  }
  
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
  
  return {
    start: minDate.toISOString().split('T')[0],
    end: maxDate.toISOString().split('T')[0],
  };
}

/**
 * Calculate summary dari parsed data
 */
export function calculateFeeSummary(rows: ShopeeIncomeRow[]): FeeUploadResult['summary'] {
  const totalGross = rows.reduce((sum, r) => sum + r.hargaAsliProduk, 0);
  const totalFee = rows.reduce((sum, r) => sum + r.totalFee, 0);
  
  const breakdown = {
    biayaKomisi: rows.reduce((sum, r) => sum + r.biayaKomisiAMS, 0),
    biayaAdministrasi: rows.reduce((sum, r) => sum + r.biayaAdministrasi, 0),
    biayaLayanan: rows.reduce((sum, r) => sum + r.biayaLayanan, 0),
    biayaProsesPesanan: rows.reduce((sum, r) => sum + r.biayaProsesPesanan, 0),
    biayaKampanye: rows.reduce((sum, r) => sum + r.biayaKampanye, 0),
    biayaHematKirim: rows.reduce((sum, r) => sum + r.biayaHematKirim, 0),
    biayaTransaksi: rows.reduce((sum, r) => sum + r.biayaTransaksi, 0),
  };
  
  return {
    totalTransaksi: rows.length,
    totalGrossAmount: totalGross,
    totalFee,
    feePercentage: totalGross > 0 ? (totalFee / totalGross) * 100 : 0,
    breakdown,
  };
}

/**
 * Validate parsed data
 */
export function validateIncomeData(rows: ShopeeIncomeRow[]): string[] {
  const errors: string[] = [];
  
  if (rows.length === 0) {
    errors.push('File Excel kosong atau format tidak sesuai');
    return errors;
  }
  
  // Check for missing order numbers
  const missingOrders = rows.filter(r => !r.noPesanan || r.noPesanan.length < 5);
  if (missingOrders.length > 0) {
    errors.push(`${missingOrders.length} baris tidak punya nomor pesanan yang valid`);
  }
  
  // Check for zero fees (suspicious)
  const zeroFees = rows.filter(r => r.totalFee === 0);
  if (zeroFees.length > 0) {
    errors.push(`${zeroFees.length} transaksi dengan fee = 0 (mungkin data tidak lengkap)`);
  }
  
  // Check for negative total penghasilan
  const negativeIncome = rows.filter(r => r.totalPenghasilan < 0);
  if (negativeIncome.length > 0) {
    errors.push(`${negativeIncome.length} transaksi dengan total penghasilan negatif`);
  }
  
  return errors;
}
