"use client";

// /app/shopee/packing/page.tsx
// Rekap Packing Harian — agregasi SKU + qty dari pesanan PROCESSED
// Menggantikan hitung manual di kertas setiap hari

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type TokoOption = { id: number; nama: string };
type RekapItem = { sku: string; nama_produk: string; qty: number };
type Toast = { msg: string; type: "success" | "error" };

export default function RekapPackingPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [tokoList, setTokoList] = useState<TokoOption[]>([]);
  const [selectedToko, setSelectedToko] = useState<"semua" | number>("semua");
  const [tanggal, setTanggal] = useState(() =>
    new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" })
  );
  const [loading, setLoading] = useState(false);
  const [rekapList, setRekapList] = useState<RekapItem[]>([]);
  const [totalPesanan, setTotalPesanan] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const [sudahFetch, setSudahFetch] = useState(false);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    background: isDark ? "rgba(255,255,255,0.05)" : "#f8fffe",
    border: `1.5px solid ${C.border}`,
    borderRadius: 10,
    color: C.text,
    fontFamily: C.fontSans,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  useEffect(() => {
    supabase
      .from("toko_online")
      .select("id, nama")
      .eq("platform", "Shopee")
      .eq("aktif", true)
      .not("shopee_access_token", "is", null)
      .order("id")
      .then(({ data }) => setTokoList(data || []));
  }, []);

  const fetchRekap = useCallback(async () => {
    setLoading(true);
    setSudahFetch(true);
    try {
      let penjualanQuery = supabase.from("penjualan_online").select("id, toko_id");
      if (selectedToko !== "semua") {
        penjualanQuery = penjualanQuery.eq("toko_id", selectedToko);
      }
      const { data: penjualanData, error: penjualanErr } = await penjualanQuery;
      if (penjualanErr) throw new Error(penjualanErr.message);

      const penjualanIds = (penjualanData || []).map((p: any) => p.id);
      if (penjualanIds.length === 0) {
        setRekapList([]);
        setTotalPesanan(0);
        setLoading(false);
        return;
      }

      const { data: detailData, error: detailErr } = await supabase
        .from("detail_penjualan_online")
        .select("sku, qty, penjualan_online_id, stok_barang(nama_produk)")
        .eq("status_shopee", "PROCESSED")
        .eq("tanggal_pesanan", tanggal)
        .in("penjualan_online_id", penjualanIds);

      if (detailErr) throw new Error(detailErr.message);

      const data = detailData || [];
      const pesananIds = new Set(data.map((d: any) => d.penjualan_online_id));
      setTotalPesanan(pesananIds.size);

      const map: Record<string, { nama_produk: string; qty: number }> = {};
      for (const d of data as any[]) {
        const sku = d.sku || "—";
        const nama = d.stok_barang?.nama_produk || sku;
        if (!map[sku]) map[sku] = { nama_produk: nama, qty: 0 };
        map[sku].qty += Number(d.qty) || 0;
      }

      const result: RekapItem[] = Object.entries(map)
        .map(([sku, v]) => ({ sku, nama_produk: v.nama_produk, qty: v.qty }))
        .sort((a, b) => b.qty - a.qty);

      setRekapList(result);
    } catch (err: any) {
      showToast("Gagal memuat rekap: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [tanggal, selectedToko]);

  const totalQty = rekapList.reduce((s, r) => s + r.qty, 0);

  const tokoLabel =
    selectedToko === "semua"
      ? "Semua Toko"
      : tokoList.find((t) => t.id === selectedToko)?.nama || "-";

  const tanggalLabel = new Date(tanggal + "T00:00:00").toLocaleDateString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
  });

  return (
    <AppShell>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .print-only { display: none; }
        @media print {
          @page { size: 58mm auto; margin: 3mm; }
          body * { visibility: hidden; }
          .print-zone, .print-zone * { visibility: visible; }
          .print-zone {
            position: fixed;
            top: 0; left: 0;
            width: 52mm;
            font-family: monospace;
            color: black;
            font-size: 11px;
            padding: 4mm;
          }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-row {
            display: flex;
            justify-content: space-between;
            padding: 3px 0;
            border-bottom: 1px dashed #999;
            font-size: 11px;
          }
          .print-total {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            border-top: 2px solid black;
            margin-top: 4px;
            font-weight: bold;
            font-size: 12px;
          }
        }
      `}</style>

      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "12px 20px", borderRadius: 10,
          background: toast.type === "success" ? C.accent : C.red,
          color: "#fff", fontSize: 13, fontWeight: 700,
          boxShadow: C.shadowMd, animation: "fadeUp 0.2s ease",
        }}>{toast.msg}</div>
      )}

      {/* ── PRINT ZONE — hanya ini yang tercetak ── */}
      {sudahFetch && rekapList.length > 0 && (
        <div className="print-zone">
          <div style={{ textAlign: "center", fontWeight: 900, fontSize: 13, marginBottom: 2 }}>REKAP PACKING</div>
          <div style={{ textAlign: "center", fontSize: 10, marginBottom: 6 }}>{tanggalLabel} · {tokoLabel}</div>
          <div style={{ borderTop: "1px solid black", marginBottom: 6 }} />
          {rekapList.map((item) => (
            <div key={item.sku} className="print-row">
              <span>{item.sku}</span>
              <span style={{ fontWeight: 700 }}>{item.qty} pcs</span>
            </div>
          ))}
          <div className="print-total">
            <span>TOTAL · {totalPesanan} pesanan</span>
            <span>{totalQty} pcs</span>
          </div>
        </div>
      )}

      {/* ── SCREEN UI ── */}
      <div style={{ padding: "24px 28px", animation: "fadeUp 0.3s ease" }}>

        {/* Header */}
        <div className="no-print" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Rekap Packing Harian</h1>
          <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
            Agregasi SKU dari pesanan yang sudah diproses (PROCESSED)
          </p>
        </div>

        {/* Filter */}
        <div className="no-print" style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "18px 20px", marginBottom: 20,
          boxShadow: C.shadow,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" as const }}>Tanggal</div>
              <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" as const }}>Toko</div>
              <select
                value={selectedToko}
                onChange={(e) => setSelectedToko(e.target.value === "semua" ? "semua" : Number(e.target.value))}
                style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
              >
                <option value="semua">Semua Toko</option>
                {tokoList.map((t) => <option key={t.id} value={t.id}>{t.nama}</option>)}
              </select>
            </div>
            <button
              onClick={fetchRekap}
              disabled={loading}
              style={{
                padding: "10px 24px",
                background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`,
                border: "none", color: "#fff", borderRadius: 10,
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: 13, fontWeight: 700, fontFamily: C.fontSans,
                opacity: loading ? 0.7 : 1, whiteSpace: "nowrap" as const, height: 40,
              }}
            >
              {loading ? "Memuat..." : "🔍 Tampilkan"}
            </button>
          </div>
        </div>

        {/* Hasil */}
        {sudahFetch && (
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, overflow: "hidden", boxShadow: C.shadow,
          }}>
            <div style={{
              padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>REKAP PACKING</div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
                  {tanggalLabel} · {tokoLabel}
                </div>
              </div>
              {rekapList.length > 0 && (
                <button
                  onClick={() => window.print()}
                  className="no-print"
                  style={{
                    padding: "8px 18px",
                    background: `${C.accent}15`,
                    border: `1.5px solid ${C.accent}`,
                    color: C.accent, borderRadius: 10,
                    cursor: "pointer", fontSize: 13, fontWeight: 700,
                  }}
                >
                  🖨️ Print
                </button>
              )}
            </div>

            <div style={{ padding: "20px" }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>
              ) : rekapList.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                  <div style={{ fontSize: 13, color: C.muted, fontFamily: C.fontMono }}>Tidak ada pesanan PROCESSED pada tanggal ini</div>
                </div>
              ) : (
                <>
                  {/* Table header */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 160px 80px",
                    padding: "8px 12px",
                    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                    borderRadius: 8, marginBottom: 4,
                    fontSize: 10, fontWeight: 700, color: C.muted,
                    fontFamily: C.fontMono, letterSpacing: 1, textTransform: "uppercase" as const,
                  }}>
                    <span>Produk</span>
                    <span>SKU</span>
                    <span style={{ textAlign: "right" as const }}>QTY</span>
                  </div>

                  {rekapList.map((item, i) => (
                    <div key={item.sku} style={{
                      display: "grid", gridTemplateColumns: "1fr 160px 80px",
                      padding: "12px 12px",
                      borderBottom: i < rekapList.length - 1 ? `1px solid ${C.border}` : "none",
                      alignItems: "center",
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.nama_produk}</div>
                      <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{item.sku}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: C.accent, fontFamily: C.fontMono, textAlign: "right" as const }}>
                        {item.qty} <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>pcs</span>
                      </div>
                    </div>
                  ))}

                  {/* Total */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 160px 80px",
                    padding: "14px 12px",
                    background: `${C.accent}10`,
                    borderTop: `2px solid ${C.accent}30`,
                    marginTop: 4, borderRadius: "0 0 10px 10px",
                    alignItems: "center",
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.accent }}>
                      TOTAL · {totalPesanan} pesanan
                    </div>
                    <div />
                    <div style={{ fontSize: 20, fontWeight: 900, color: C.accent, fontFamily: C.fontMono, textAlign: "right" as const }}>
                      {totalQty} <span style={{ fontSize: 11, fontWeight: 500 }}>pcs</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {!sudahFetch && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            Pilih tanggal dan toko, lalu klik Tampilkan
          </div>
        )}
      </div>
    </AppShell>
  );
}
