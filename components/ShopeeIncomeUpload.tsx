// components/ShopeeIncomeUpload.tsx
"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  parseShopeeIncomeExcel,
  getPeriodeFromIncome,
  calculateFeeSummary,
  validateIncomeData,
  type ShopeeIncomeRow,
  type FeeUploadResult,
} from "@/lib/shopee-income-parser";

interface Props {
  tokoId: number;
  tokoPlatform: string;
  onSuccess?: (result: FeeUploadResult) => void;
}

export default function ShopeeIncomeUpload({ tokoId, tokoPlatform, onSuccess }: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ShopeeIncomeRow[] | null>(null);
  const [summary, setSummary] = useState<FeeUploadResult['summary'] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

  // Step 1: Parse Excel dan preview
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setErrors([]);
    setPreview(null);
    setSummary(null);

    try {
      const parsed = await parseShopeeIncomeExcel(selectedFile);
      
      // Validate
      const validationErrors = validateIncomeData(parsed);
      if (validationErrors.length > 0) {
        setErrors(validationErrors);
      }
      
      // Calculate summary
      const sum = calculateFeeSummary(parsed);
      setSummary(sum);
      setPreview(parsed);
      
    } catch (error: any) {
      setErrors([error.message || 'Error parsing Excel']);
    }
  };

  // Step 2: Upload ke database
  const handleUpload = async () => {
    if (!preview || !summary) return;

    setUploading(true);
    setErrors([]);

    try {
      const periode = getPeriodeFromIncome(preview);
      
      // 1. Insert ke fee_platform
      const { data: feeData, error: feeError } = await supabase
        .from('fee_platform')
        .insert({
          toko_id: tokoId,
          periode_start: periode.start,
          periode_end: periode.end,
          biaya_komisi: summary.breakdown.biayaKomisi,
          biaya_administrasi: summary.breakdown.biayaAdministrasi,
          biaya_layanan: summary.breakdown.biayaLayanan,
          biaya_proses_pesanan: summary.breakdown.biayaProsesPesanan,
          biaya_kampanye: summary.breakdown.biayaKampanye,
          biaya_hemat_kirim: summary.breakdown.biayaHematKirim,
          biaya_transaksi: summary.breakdown.biayaTransaksi,
          total_fee: summary.totalFee,
          total_penjualan_gross: summary.totalGrossAmount,
          file_excel: file?.name || '',
          catatan: `Upload otomatis - ${summary.totalTransaksi} transaksi`,
        })
        .select()
        .single();

      if (feeError) throw feeError;

      // 2. Update penjualan_online dengan fee per transaksi
      let updatedCount = 0;
      const updateErrors: string[] = [];

      for (const row of preview) {
        // Match by no_pesanan (bisa ada di detail_penjualan_online)
        const { data: detailData } = await supabase
          .from('detail_penjualan_online')
          .select('penjualan_online_id')
          .eq('no_pesanan', row.noPesanan)
          .maybeSingle();

        if (detailData?.penjualan_online_id) {
          const { error: updateError } = await supabase
            .from('penjualan_online')
            .update({
              fee_platform: supabase.raw(`fee_platform + ${row.totalFee}`),
              net_amount: row.totalPenghasilan,
            })
            .eq('id', detailData.penjualan_online_id);

          if (updateError) {
            updateErrors.push(`Error update ${row.noPesanan}: ${updateError.message}`);
          } else {
            updatedCount++;
          }
        }
      }

      // 3. Catat fee ke kas (beban operasional)
      const { error: kasError } = await supabase.from('kas').insert({
        tipe: 'Keluar',
        kategori: `Fee Platform - ${tokoPlatform}`,
        nominal: summary.totalFee,
        keterangan: `Fee ${tokoPlatform} periode ${periode.start} s/d ${periode.end} (${summary.totalTransaksi} transaksi)`,
        created_at: new Date().toISOString(),
      });

      if (kasError) throw kasError;

      // Result
      const result: FeeUploadResult = {
        success: true,
        periode,
        summary,
        transaksiUpdated: updatedCount,
        errors: updateErrors.length > 0 ? updateErrors : undefined,
      };

      if (onSuccess) onSuccess(result);
      
      // Reset form
      setFile(null);
      setPreview(null);
      setSummary(null);
      
      alert(`✅ Upload berhasil!\n\n` +
        `Fee ${tokoPlatform}: Rp ${summary.totalFee.toLocaleString('id-ID')}\n` +
        `Transaksi diupdate: ${updatedCount}/${summary.totalTransaksi}\n` +
        `Periode: ${periode.start} s/d ${periode.end}`
      );

    } catch (error: any) {
      console.error('Upload error:', error);
      setErrors([error.message || 'Error saat upload']);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ 
      background: '#13101e', 
      border: '1px solid #2d2248', 
      borderRadius: 16, 
      padding: 24 
    }}>
      <h3 style={{ 
        fontFamily: "'DM Serif Display', serif", 
        fontSize: 18, 
        color: '#f5f0ff', 
        marginBottom: 16 
      }}>
        Upload Excel Income (Fee Mingguan)
      </h3>

      {/* File Input */}
      <div style={{ marginBottom: 20 }}>
        <label style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#a78bfa20',
          border: '2px dashed #a78bfa',
          borderRadius: 12,
          color: '#a78bfa',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: 14,
        }}>
          📤 Pilih File Excel Income
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </label>
        {file && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#7a6d90' }}>
            File: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(0)} KB)
          </div>
        )}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{
          background: '#f8717120',
          border: '1px solid #f87171',
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
        }}>
          <div style={{ color: '#f87171', fontWeight: 700, marginBottom: 4 }}>
            ⚠ Error:
          </div>
          {errors.map((err, i) => (
            <div key={i} style={{ color: '#f87171', fontSize: 13 }}>• {err}</div>
          ))}
        </div>
      )}

      {/* Preview Summary */}
      {summary && preview && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            background: '#34d39920',
            border: '1px solid #34d399',
            borderRadius: 12,
            padding: 16,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#34d399', marginBottom: 12 }}>
              ✓ Preview Data:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
              <div>
                <div style={{ color: '#7a6d90' }}>Total Transaksi:</div>
                <div style={{ color: '#ede8ff', fontWeight: 700 }}>{summary.totalTransaksi} order</div>
              </div>
              <div>
                <div style={{ color: '#7a6d90' }}>Gross Amount:</div>
                <div style={{ color: '#ede8ff', fontWeight: 700 }}>
                  Rp {summary.totalGrossAmount.toLocaleString('id-ID')}
                </div>
              </div>
              <div>
                <div style={{ color: '#7a6d90' }}>Total Fee:</div>
                <div style={{ color: '#f87171', fontWeight: 700 }}>
                  Rp {summary.totalFee.toLocaleString('id-ID')}
                </div>
              </div>
              <div>
                <div style={{ color: '#7a6d90' }}>Fee %:</div>
                <div style={{ color: '#fbbf24', fontWeight: 700 }}>
                  {summary.feePercentage.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Fee Breakdown */}
            <details style={{ marginTop: 12, cursor: 'pointer' }}>
              <summary style={{ color: '#a78bfa', fontSize: 12, fontWeight: 600 }}>
                Detail Breakdown Fee
              </summary>
              <div style={{ marginTop: 8, fontSize: 12, color: '#c4b8e8' }}>
                <div>Komisi AMS: Rp {summary.breakdown.biayaKomisi.toLocaleString('id-ID')}</div>
                <div>Administrasi: Rp {summary.breakdown.biayaAdministrasi.toLocaleString('id-ID')}</div>
                <div>Layanan: Rp {summary.breakdown.biayaLayanan.toLocaleString('id-ID')}</div>
                <div>Proses Pesanan: Rp {summary.breakdown.biayaProsesPesanan.toLocaleString('id-ID')}</div>
                <div>Kampanye: Rp {summary.breakdown.biayaKampanye.toLocaleString('id-ID')}</div>
                <div>Hemat Kirim: Rp {summary.breakdown.biayaHematKirim.toLocaleString('id-ID')}</div>
                <div>Transaksi: Rp {summary.breakdown.biayaTransaksi.toLocaleString('id-ID')}</div>
              </div>
            </details>
          </div>

          {/* Upload Button */}
          <button
            onClick={handleUpload}
            disabled={uploading || errors.length > 0}
            style={{
              marginTop: 16,
              width: '100%',
              padding: '14px 24px',
              background: uploading ? '#7a6d90' : '#a78bfa',
              color: '#0d0a14',
              border: 'none',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 14,
              cursor: uploading ? 'not-allowed' : 'pointer',
              opacity: errors.length > 0 ? 0.5 : 1,
            }}
          >
            {uploading ? '⏳ Uploading...' : '✅ Upload & Update Database'}
          </button>
        </div>
      )}
    </div>
  );
}
