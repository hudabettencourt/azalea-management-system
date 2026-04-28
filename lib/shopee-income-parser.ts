// lib/shopee-income-parser.ts
// Parser untuk Excel "Income sudah dilepas" dari Shopee
// Extract fee breakdown dan mapping ke transaksi

import * as XLSX from 'xlsx';

export interface ShopeeIncomeRow {
  noPesanan: string;
  noPengajuan: string;
  usernamePembeli: string;
  waktuPesananDibuat: string;
  tanggalDanaRilis: string;
  hargaAsliProduk: number;
  totalDiskonProduk: number;
  biayaKomisiAMS: number;
  biayaAdministrasi: number;
  biayaLayanan: number;
  biayaProsesPesanan: number;
  biayaKampanye: number;
  biayaHematKirim: number;
  biayaTransaksi: number;
  totalPenghasilan: number;
  totalFee: number;
}

export interface FeeUploadResult {
  success: boolean;
  periode: { start: string; end: string };
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

export function parseShopeeIncomeExcel(file: File): Promise<ShopeeIncomeRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: null,
          raw: true,
        }) as any[][];
        
        // Header ALWAYS at row 6 (index 5)
        const headerRowIndex = 5;
        
        if (jsonData.length <= headerRowIndex) {
          throw new Error('File Excel terlalu pendek atau format salah');
        }
        
        const dataRows = jsonData.slice(headerRowIndex + 1);
        
        const parseNumber = (val: any): number => {
          if (!val) return 0;
          if (typeof val === 'number') return Math.abs(val);
          const cleaned = String(val).replace(/\./g, '').replace(/,/g, '.').replace(/[^\d.-]/g, '');
          return Math.abs(parseFloat(cleaned) || 0);
        };
        
        const parsed: ShopeeIncomeRow[] = dataRows
          .filter(row => row && row[1] && String(row[1]).length > 5)
          .map(row => {
            // Fee columns: W-AE (index 22-30) - SEMUA fee Shopee
            const biayaKomisi = parseNumber(row[22]);        // W
            const biayaAdmin = parseNumber(row[23]);         // X
            const biayaLayanan = parseNumber(row[24]);       // Y
            const biayaProses = parseNumber(row[25]);        // Z
            const premi = parseNumber(row[26]);              // AA
            const biayaHemat = parseNumber(row[27]);         // AB
            const biayaTransaksi = parseNumber(row[28]);     // AC
            const biayaKampanye = parseNumber(row[29]);      // AD
            const beaMasukPPN = parseNumber(row[30]);        // AE
            
            // Total fee = sum ALL columns W-AE
            const totalFee = biayaKomisi + biayaAdmin + biayaLayanan + biayaProses + 
                           premi + biayaHemat + biayaTransaksi + biayaKampanye + beaMasukPPN;
            
            return {
              noPesanan: String(row[1] || ''),
              noPengajuan: String(row[2] || ''),
              usernamePembeli: String(row[3] || ''),
              waktuPesananDibuat: String(row[4] || ''),
              tanggalDanaRilis: String(row[6] || ''),
              hargaAsliProduk: parseNumber(row[7]),
              totalDiskonProduk: parseNumber(row[8]),
              biayaKomisiAMS: biayaKomisi,
              biayaAdministrasi: biayaAdmin,
              biayaLayanan: biayaLayanan,
              biayaProsesPesanan: biayaProses,
              biayaKampanye: biayaKampanye,
              biayaHematKirim: biayaHemat,
              biayaTransaksi: biayaTransaksi,
              totalPenghasilan: parseNumber(row[32]),
              totalFee,
            };
          });
        
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Error parsing Excel: ${error}`));
      }
    };
    
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsArrayBuffer(file);
  });
}

export function getPeriodeFromIncome(rows: ShopeeIncomeRow[]): { start: string; end: string } {
  if (rows.length === 0) return { start: '', end: '' };
  
  const dates = rows
    .map(r => {
      const dateStr = r.tanggalDanaRilis;
      if (!dateStr) return null;
      if (dateStr.includes('-')) return new Date(dateStr);
      if (dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/');
        return new Date(`${year}-${month}-${day}`);
      }
      return null;
    })
    .filter(Boolean) as Date[];
  
  if (dates.length === 0) return { start: '', end: '' };
  
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
  
  return {
    start: minDate.toISOString().split('T')[0],
    end: maxDate.toISOString().split('T')[0],
  };
}

export function calculateFeeSummary(rows: ShopeeIncomeRow[]): FeeUploadResult['summary'] {
  const totalGross = rows.reduce((sum, r) => sum + r.hargaAsliProduk, 0);
  const totalFee = rows.reduce((sum, r) => sum + r.totalFee, 0);
  
  return {
    totalTransaksi: rows.length,
    totalGrossAmount: totalGross,
    totalFee,
    feePercentage: totalGross > 0 ? (totalFee / totalGross) * 100 : 0,
    breakdown: {
      biayaKomisi: rows.reduce((sum, r) => sum + r.biayaKomisiAMS, 0),
      biayaAdministrasi: rows.reduce((sum, r) => sum + r.biayaAdministrasi, 0),
      biayaLayanan: rows.reduce((sum, r) => sum + r.biayaLayanan, 0),
      biayaProsesPesanan: rows.reduce((sum, r) => sum + r.biayaProsesPesanan, 0),
      biayaKampanye: rows.reduce((sum, r) => sum + r.biayaKampanye, 0),
      biayaHematKirim: rows.reduce((sum, r) => sum + r.biayaHematKirim, 0),
      biayaTransaksi: rows.reduce((sum, r) => sum + r.biayaTransaksi, 0),
    },
  };
}

export function validateIncomeData(rows: ShopeeIncomeRow[]): string[] {
  const errors: string[] = [];
  
  if (rows.length === 0) {
    errors.push('File Excel kosong atau format tidak sesuai');
    return errors;
  }
  
  const missingOrders = rows.filter(r => !r.noPesanan || r.noPesanan.length < 5);
  if (missingOrders.length > 0) {
    errors.push(`${missingOrders.length} baris tidak punya nomor pesanan yang valid`);
  }
  
  const zeroFees = rows.filter(r => r.totalFee === 0);
  if (zeroFees.length > 0) {
    errors.push(`${zeroFees.length} transaksi dengan fee = 0 (mungkin data tidak lengkap)`);
  }
  
  const negativeIncome = rows.filter(r => r.totalPenghasilan < 0);
  if (negativeIncome.length > 0) {
    errors.push(`${negativeIncome.length} transaksi dengan total penghasilan negatif`);
  }
  
  return errors;
}
