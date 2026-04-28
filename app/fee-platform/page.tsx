"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import ShopeeIncomeUpload from "@/components/ShopeeIncomeUpload";

interface Toko {
  id: number;
  nama: string;
  platform: string;
  aktif: boolean;
}

interface FeeHistory {
  id: number;
  periode_start: string;
  periode_end: string;
  total_penjualan_gross: number;
  total_fee: number;
  persentase_fee: number;
  biaya_komisi: number;
  biaya_administrasi: number;
  biaya_layanan: number;
  biaya_proses_pesanan: number;
  created_at: string;
}

export default function FeePlatformPage() {
  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [selectedToko, setSelectedToko] = useState<Toko | null>(null);
  const [feeHistory, setFeeHistory] = useState<FeeHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchToko();
  }, []);

  useEffect(() => {
    if (selectedToko) {
      fetchFeeHistory(selectedToko.id);
    }
  }, [selectedToko]);

  const fetchToko = async () => {
    try {
      const { data, error } = await supabase
        .from('toko_online')
        .select('*')
        .eq('aktif', true)
        .order('id');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setTokoList(data);
        setSelectedToko(data[0]);
      }
    } catch (error) {
      console.error('Error fetching toko:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFeeHistory = async (tokoId: number) => {
    try {
      const { data, error } = await supabase
        .from('fee_platform')
        .select('*')
        .eq('toko_id', tokoId)
        .order('periode_start', { ascending: false });
      
      if (error) throw error;
      setFeeHistory(data || []);
    } catch (error) {
      console.error('Error fetching fee history:', error);
    }
  };

  const handleUploadSuccess = () => {
    if (selectedToko) {
      fetchFeeHistory(selectedToko.id);
    }
  };

  if (loading) {
    return (
      <Sidebar>
        <div style={{ 
          padding: 32, 
          background: '#0d0a14', 
          minHeight: '100vh', 
          color: '#ede8ff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div>Loading...</div>
          </div>
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <div style={{ 
        padding: 32, 
        background: '#0d0a14', 
        minHeight: '100vh', 
        color: '#ede8ff',
        fontFamily: "'DM Sans', sans-serif"
      }}>
        
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ 
            fontFamily: "'DM Serif Display', serif", 
            fontSize: 32, 
            color: '#f5f0ff',
            marginBottom: 8 
          }}>
            Fee Platform 💰
          </h1>
          <p style={{ color: '#7a6d90', fontSize: 14 }}>
            Upload Excel Income mingguan dari Shopee untuk tracking fee marketplace
          </p>
        </div>

        {/* Pilih Toko */}
        {tokoList.length > 0 && (
          <div style={{ 
            marginBottom: 32,
            background: '#13101e',
            border: '1px solid #2d2248',
            borderRadius: 16,
            padding: 24
          }}>
            <label style={{ 
              display: 'block', 
              marginBottom: 12, 
              fontWeight: 600,
              fontSize: 14,
              color: '#c4b8e8'
            }}>
              Pilih Toko:
            </label>
            <select
              value={selectedToko?.id || ''}
              onChange={(e) => {
                const toko = tokoList.find(t => t.id === Number(e.target.value));
                setSelectedToko(toko || null);
              }}
              style={{
                padding: '12px 16px',
                background: '#1a1430',
                border: '1px solid #2d2248',
                borderRadius: 12,
                color: '#ede8ff',
                fontSize: 14,
                width: '100%',
                maxWidth: 500,
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {tokoList.map(toko => (
                <option key={toko.id} value={toko.id}>
                  {toko.nama} ({toko.platform})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Upload Component */}
        {selectedToko && (
          <div style={{ marginBottom: 32 }}>
            <ShopeeIncomeUpload
              tokoId={selectedToko.id}
              tokoPlatform={`${selectedToko.platform} - ${selectedToko.nama}`}
              onSuccess={handleUploadSuccess}
            />
          </div>
        )}

        {/* History Fee */}
        {feeHistory.length > 0 && (
          <div>
            <h2 style={{ 
              fontFamily: "'DM Serif Display', serif", 
              fontSize: 24, 
              color: '#f5f0ff',
              marginBottom: 16 
            }}>
              History Upload Fee
            </h2>
            
            <div style={{ 
              background: '#13101e', 
              border: '1px solid #2d2248', 
              borderRadius: 16, 
              overflow: 'hidden' 
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse',
                  minWidth: 600
                }}>
                  <thead>
                    <tr style={{ 
                      background: '#1a1430', 
                      borderBottom: '1px solid #2d2248' 
                    }}>
                      <th style={{ 
                        padding: '14px 16px', 
                        textAlign: 'left', 
                        color: '#7a6d90', 
                        fontSize: 12, 
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        Periode
                      </th>
                      <th style={{ 
                        padding: '14px 16px', 
                        textAlign: 'right', 
                        color: '#7a6d90', 
                        fontSize: 12, 
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        Gross Amount
                      </th>
                      <th style={{ 
                        padding: '14px 16px', 
                        textAlign: 'right', 
                        color: '#7a6d90', 
                        fontSize: 12, 
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        Total Fee
                      </th>
                      <th style={{ 
                        padding: '14px 16px', 
                        textAlign: 'right', 
                        color: '#7a6d90', 
                        fontSize: 12, 
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        Fee %
                      </th>
                      <th style={{ 
                        padding: '14px 16px', 
                        textAlign: 'center', 
                        color: '#7a6d90', 
                        fontSize: 12, 
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>
                        Detail
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeHistory.map((fee, index) => (
                      <tr 
                        key={fee.id} 
                        style={{ 
                          borderBottom: index < feeHistory.length - 1 ? '1px solid #1e1830' : 'none',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <td style={{ 
                          padding: '14px 16px', 
                          color: '#ede8ff', 
                          fontSize: 13,
                          fontFamily: "'DM Mono', monospace"
                        }}>
                          {new Date(fee.periode_start).toLocaleDateString('id-ID', { 
                            day: '2-digit', 
                            month: 'short' 
                          })} - {new Date(fee.periode_end).toLocaleDateString('id-ID', { 
                            day: '2-digit', 
                            month: 'short', 
                            year: 'numeric' 
                          })}
                        </td>
                        <td style={{ 
                          padding: '14px 16px', 
                          textAlign: 'right', 
                          color: '#c4b8e8', 
                          fontSize: 13,
                          fontFamily: "'DM Mono', monospace"
                        }}>
                          Rp {fee.total_penjualan_gross.toLocaleString('id-ID')}
                        </td>
                        <td style={{ 
                          padding: '14px 16px', 
                          textAlign: 'right', 
                          color: '#f87171', 
                          fontSize: 13, 
                          fontWeight: 600,
                          fontFamily: "'DM Mono', monospace"
                        }}>
                          Rp {fee.total_fee.toLocaleString('id-ID')}
                        </td>
                        <td style={{ 
                          padding: '14px 16px', 
                          textAlign: 'right', 
                          fontSize: 13, 
                          fontWeight: 700,
                          fontFamily: "'DM Mono', monospace"
                        }}>
                          <span style={{
                            padding: '4px 8px',
                            background: fee.persentase_fee > 25 ? '#f8717120' : '#fbbf2420',
                            color: fee.persentase_fee > 25 ? '#f87171' : '#fbbf24',
                            borderRadius: 6,
                            fontSize: 12
                          }}>
                            {fee.persentase_fee.toFixed(2)}%
                          </span>
                        </td>
                        <td style={{ 
                          padding: '14px 16px', 
                          textAlign: 'center' 
                        }}>
                          <details>
                            <summary style={{ 
                              cursor: 'pointer', 
                              color: '#a78bfa', 
                              fontSize: 12,
                              fontWeight: 600
                            }}>
                              Lihat
                            </summary>
                            <div style={{ 
                              marginTop: 8, 
                              padding: 12, 
                              background: '#1a1430', 
                              borderRadius: 8,
                              textAlign: 'left',
                              fontSize: 11,
                              color: '#c4b8e8',
                              fontFamily: "'DM Mono', monospace"
                            }}>
                              <div>Komisi: Rp {fee.biaya_komisi.toLocaleString('id-ID')}</div>
                              <div>Admin: Rp {fee.biaya_administrasi.toLocaleString('id-ID')}</div>
                              <div>Layanan: Rp {fee.biaya_layanan.toLocaleString('id-ID')}</div>
                              <div>Proses: Rp {fee.biaya_proses_pesanan.toLocaleString('id-ID')}</div>
                            </div>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Summary Card */}
            <div style={{ 
              marginTop: 24,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16
            }}>
              <div style={{
                background: '#13101e',
                border: '1px solid #2d2248',
                borderRadius: 12,
                padding: 16
              }}>
                <div style={{ color: '#7a6d90', fontSize: 11, marginBottom: 4 }}>
                  Total Upload
                </div>
                <div style={{ color: '#ede8ff', fontSize: 24, fontWeight: 700 }}>
                  {feeHistory.length}
                </div>
              </div>
              
              <div style={{
                background: '#13101e',
                border: '1px solid #2d2248',
                borderRadius: 12,
                padding: 16
              }}>
                <div style={{ color: '#7a6d90', fontSize: 11, marginBottom: 4 }}>
                  Total Fee (All Time)
                </div>
                <div style={{ color: '#f87171', fontSize: 20, fontWeight: 700 }}>
                  Rp {feeHistory.reduce((sum, f) => sum + f.total_fee, 0).toLocaleString('id-ID')}
                </div>
              </div>

              <div style={{
                background: '#13101e',
                border: '1px solid #2d2248',
                borderRadius: 12,
                padding: 16
              }}>
                <div style={{ color: '#7a6d90', fontSize: 11, marginBottom: 4 }}>
                  Avg Fee %
                </div>
                <div style={{ color: '#fbbf24', fontSize: 20, fontWeight: 700 }}>
                  {(feeHistory.reduce((sum, f) => sum + f.persentase_fee, 0) / feeHistory.length).toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {feeHistory.length === 0 && selectedToko && (
          <div style={{
            background: '#13101e',
            border: '1px dashed #2d2248',
            borderRadius: 16,
            padding: 48,
            textAlign: 'center',
            color: '#7a6d90'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              Belum ada data fee
            </div>
            <div style={{ fontSize: 13 }}>
              Upload Excel Income mingguan untuk mulai tracking fee platform
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
