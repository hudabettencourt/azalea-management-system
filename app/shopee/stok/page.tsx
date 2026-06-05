"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type StokOpt = { id: number; nama_produk: string; sku: string | null };
type Toko = { id: number; nama: string };

type PreviewRow = {
  toko_id: number;
  toko_nama: string;
  sales_30d: number;
  persentase: number;
  jumlah: number;
  hasHistory: boolean;
  stok_shopee: number | null; // stok terkini di Shopee
};

type PoolRow = {
  id: number;
  stok_barang_id: number;
  total_anggaran: number;
  updated_at: string;
  nama_produk: string;
  sku: string | null;
};

type DistribusiRow = {
  id: number;
  pool_id: number;
  toko_id: number;
  jumlah: number;
  persentase: number;
  last_pushed_at: string | null;
  last_push_status: string | null;
  nama_toko: string;
};

const HISTORY_WINDOW_DAYS = 30;

const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt((str || "").replace(/\./g, ""), 10) || 0;
const fmtInt = (n: number) => Math.round(n).toLocaleString("id-ID");

function sinceDateWIB(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 3600 * 1000)
    .toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
}

function computeDistribution(toko: Toko[], salesByToko: Map<number, number>, totalAnggaran: number): PreviewRow[] {
  const withHistory = toko.filter(t => (salesByToko.get(t.id) || 0) > 0);
  const withoutHistory = toko.filter(t => !(salesByToko.get(t.id) || 0));
  const totalSales = withHistory.reduce((a, t) => a + (salesByToko.get(t.id) || 0), 0);

  const rows: PreviewRow[] = [];
  let allocated = 0;
  for (const t of withHistory) {
    const sales = salesByToko.get(t.id) || 0;
    const persen = totalSales > 0 ? sales / totalSales : 0;
    const jumlah = Math.floor(totalAnggaran * persen);
    allocated += jumlah;
    rows.push({
      toko_id: t.id, toko_nama: t.nama, sales_30d: sales,
      persentase: Math.round(persen * 10000) / 100,
      jumlah, hasHistory: true, stok_shopee: null,
    });
  }
  const sisa = Math.max(0, totalAnggaran - allocated);
  const perTokoSisa = withoutHistory.length > 0 ? Math.floor(sisa / withoutHistory.length) : 0;
  for (const t of withoutHistory) {
    rows.push({
      toko_id: t.id, toko_nama: t.nama, sales_30d: 0,
      persentase: 0, jumlah: perTokoSisa, hasHistory: false, stok_shopee: null,
    });
  }
  if (rows.length > 0) {
    const sum = rows.reduce((a, r) => a + r.jumlah, 0);
    rows[0].jumlah += totalAnggaran - sum;
  }
  return rows;
}

// Recalculate persentase berdasarkan jumlah yang di-edit manual
function recalcPersentase(rows: PreviewRow[]): PreviewRow[] {
  const total = rows.reduce((a, r) => a + r.jumlah, 0);
  return rows.map(r => ({
    ...r,
    persentase: total > 0 ? Math.round((r.jumlah / total) * 10000) / 100 : 0,
  }));
}

export default function ShopeeStokPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [stokOpts, setStokOpts] = useState<StokOpt[]>([]);
  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [pools, setPools] = useState<PoolRow[]>([]);
  const [distribusi, setDistribusi] = useState<DistribusiRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedStokId, setSelectedStokId] = useState<string>("");
  const [anggaranInput, setAnggaranInput] = useState<string>("");
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [previewProduct, setPreviewProduct] = useState<StokOpt | null>(null);
  const [computing, setComputing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [pushingPoolId, setPushingPoolId] = useState<number | null>(null);
  const [loadingShopeeStok, setLoadingShopeeStok] = useState(false);

  // Mode: "otomatis" = hitung distribusi, "manual" = input langsung per toko
  const [mode, setMode] = useState<"otomatis" | "manual">("otomatis");

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [resStok, resToko, resPool, resDist] = await Promise.all([
        supabase.from("stok_barang").select("id, nama_produk, sku").not("sku", "is", null).order("nama_produk"),
        supabase.from("toko_online").select("id, nama")
          .eq("platform", "Shopee").eq("aktif", true)
          .not("shopee_access_token", "is", null).order("nama"),
        supabase.from("shopee_stok_pool")
          .select("id, stok_barang_id, total_anggaran, updated_at, stok_barang:stok_barang_id(nama_produk, sku)")
          .order("updated_at", { ascending: false }),
        supabase.from("shopee_stok_distribusi")
          .select("id, pool_id, toko_id, jumlah, persentase, last_pushed_at, last_push_status, toko_online:toko_id(nama)"),
      ]);

      setStokOpts((resStok.data || []) as StokOpt[]);
      setTokoList((resToko.data || []) as Toko[]);
      setPools(((resPool.data || []) as any[]).map(p => ({
        id: p.id, stok_barang_id: p.stok_barang_id,
        total_anggaran: p.total_anggaran, updated_at: p.updated_at,
        nama_produk: p.stok_barang?.nama_produk || "—",
        sku: p.stok_barang?.sku || null,
      })));
      setDistribusi(((resDist.data || []) as any[]).map(d => ({
        id: d.id, pool_id: d.pool_id, toko_id: d.toko_id,
        jumlah: d.jumlah, persentase: d.persentase || 0,
        last_pushed_at: d.last_pushed_at, last_push_status: d.last_push_status,
        nama_toko: d.toko_online?.nama || "—",
      })));
    } catch (err: any) {
      showToast("Gagal load data: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalAnggaran = useMemo(() => toAngka(anggaranInput), [anggaranInput]);
  const previewSum = useMemo(() => (preview || []).reduce((a, r) => a + (r.jumlah || 0), 0), [preview]);
  const previewValid = preview !== null && (mode === "manual" || previewSum === totalAnggaran);

  // Fetch stok terkini dari Shopee untuk preview
  const fetchShopeeStok = async (rows: PreviewRow[], stokBarangId: number): Promise<PreviewRow[]> => {
    setLoadingShopeeStok(true);
    try {
      const res = await fetch(`/api/shopee/get-stok-per-toko?stok_barang_id=${stokBarangId}`);
      if (!res.ok) return rows;
      const data = await res.json();
      return rows.map(r => ({
        ...r,
        stok_shopee: data.stok?.[r.toko_id] ?? null,
      }));
    } catch {
      return rows;
    } finally {
      setLoadingShopeeStok(false);
    }
  };

  const hitungDistribusi = async () => {
    if (!selectedStokId) return showToast("Pilih produk dulu", "error");
    if (totalAnggaran <= 0) return showToast("Anggaran harus > 0", "error");
    if (tokoList.length === 0) return showToast("Tidak ada toko Shopee aktif terhubung", "error");

    setComputing(true);
    try {
      const since = sinceDateWIB(HISTORY_WINDOW_DAYS);
      const [historiRes, penjualanRes] = await Promise.all([
        supabase.from("detail_penjualan_online")
          .select("qty, penjualan_online_id")
          .eq("stok_barang_id", parseInt(selectedStokId))
          .gte("tanggal_pesanan", since),
        supabase.from("penjualan_online").select("id, toko_id"),
      ]);

      const penjualanToToko = new Map<number, number>(
        (penjualanRes.data || []).map((p: any) => [p.id, p.toko_id]),
      );
      const salesByToko = new Map<number, number>();
      for (const r of historiRes.data || []) {
        const tokoId = penjualanToToko.get((r as any).penjualan_online_id);
        if (!tokoId) continue;
        salesByToko.set(tokoId, (salesByToko.get(tokoId) || 0) + ((r as any).qty || 0));
      }

      let rows = computeDistribution(tokoList, salesByToko, totalAnggaran);
      rows = await fetchShopeeStok(rows, parseInt(selectedStokId));
      setPreview(rows);
      setPreviewProduct(stokOpts.find(s => s.id === parseInt(selectedStokId)) || null);
    } catch (err: any) {
      showToast("Gagal hitung: " + err.message, "error");
    } finally {
      setComputing(false);
    }
  };

  // Mode manual: tampilkan form kosong per toko
  const bukaManual = async () => {
    if (!selectedStokId) return showToast("Pilih produk dulu", "error");
    if (tokoList.length === 0) return showToast("Tidak ada toko Shopee aktif terhubung", "error");

    setComputing(true);
    try {
      let rows: PreviewRow[] = tokoList.map(t => ({
        toko_id: t.id, toko_nama: t.nama, sales_30d: 0,
        persentase: 0, jumlah: 0, hasHistory: false, stok_shopee: null,
      }));
      rows = await fetchShopeeStok(rows, parseInt(selectedStokId));
      setPreview(rows);
      setPreviewProduct(stokOpts.find(s => s.id === parseInt(selectedStokId)) || null);
    } catch (err: any) {
      showToast("Gagal: " + err.message, "error");
    } finally {
      setComputing(false);
    }
  };

  const updatePreviewRow = (toko_id: number, jumlahStr: string) => {
    const jumlah = Math.max(0, parseInt(jumlahStr.replace(/\D/g, ""), 10) || 0);
    setPreview(prev => {
      if (!prev) return null;
      const updated = prev.map(r => r.toko_id === toko_id ? { ...r, jumlah } : r);
      return recalcPersentase(updated); // recalc persentase otomatis
    });
  };

  const resetPreview = () => {
    setPreview(null);
    setPreviewProduct(null);
  };

  const konfirmasiPush = async () => {
    if (!preview || !previewProduct) return;
    setConfirming(true);
    try {
      const totalPool = preview.reduce((a, r) => a + r.jumlah, 0);

      const { data: pool, error: errPool } = await supabase
        .from("shopee_stok_pool")
        .upsert({
          stok_barang_id: previewProduct.id,
          total_anggaran: totalPool,
          updated_at: new Date().toISOString(),
        }, { onConflict: "stok_barang_id" })
        .select("id")
        .single();
      if (errPool || !pool) throw new Error(errPool?.message || "Gagal simpan pool");

      await supabase.from("shopee_stok_distribusi").delete().eq("pool_id", pool.id);
      const rows = preview.map(r => ({
        pool_id: pool.id, toko_id: r.toko_id,
        stok_barang_id: previewProduct.id,
        jumlah: r.jumlah, persentase: r.persentase,
        updated_at: new Date().toISOString(),
      }));
      const { error: errIns } = await supabase.from("shopee_stok_distribusi").insert(rows);
      if (errIns) throw new Error(errIns.message);

      const res = await fetch("/api/shopee/push-stok", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: pool.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Push gagal");
      const ok = data.results.filter((r: any) => r.status === "ok").length;
      const err = data.results.length - ok;
      showToast(`✓ ${previewProduct.nama_produk} tersimpan. Push: ${ok} ok${err > 0 ? `, ${err} error` : ""}`, err > 0 ? "error" : "success");

      setPreview(null); setPreviewProduct(null);
      setSelectedStokId(""); setAnggaranInput("");
      await fetchAll();
    } catch (err: any) {
      showToast("Gagal: " + err.message, "error");
    } finally {
      setConfirming(false);
    }
  };

  const pushOne = async (distribusiId: number) => {
    setPushingId(distribusiId);
    try {
      const res = await fetch("/api/shopee/push-stok", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distribusi_id: distribusiId }),
      });
      const data = await res.json();
      const r = data.results?.[0];
      if (r?.status === "ok") showToast(`✓ ${r.toko}: +${r.tambahan} → total ${r.total}`);
      else showToast(`Gagal: ${r?.message || data.error}`, "error");
      await fetchAll();
    } catch (err: any) {
      showToast("Gagal: " + err.message, "error");
    } finally { setPushingId(null); }
  };

  const pushPool = async (poolId: number) => {
    setPushingPoolId(poolId);
    try {
      const res = await fetch("/api/shopee/push-stok", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: poolId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Gagal push");
      const ok = data.results.filter((r: any) => r.status === "ok").length;
      const err = data.results.length - ok;
      showToast(`Push: ${ok} ok${err > 0 ? `, ${err} error` : ""}`, err > 0 ? "error" : "success");
      await fetchAll();
    } catch (err: any) {
      showToast("Gagal: " + err.message, "error");
    } finally { setPushingPoolId(null); }
  };

  const deletePool = async (poolId: number, nama: string) => {
    if (!confirm(`Hapus pool stok ${nama}?\n\nDistribusi terkait juga akan terhapus.`)) return;
    const { error } = await supabase.from("shopee_stok_pool").delete().eq("id", poolId);
    if (error) showToast("Gagal hapus: " + error.message, "error");
    else { showToast(`🗑 ${nama} dihapus`); await fetchAll(); }
  };

  const inputStyle: React.CSSProperties = {
    padding: "9px 12px",
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontFamily: C.fontSans, fontSize: 13,
    outline: "none", width: "100%", boxSizing: "border-box",
  };

  return (
    <AppShell pageTitle="Shopee · Stok" pageSubtitle="Stok virtual & distribusi otomatis">
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 18px",
          background: toast.type === "success" ? C.green : C.red, color: "#fff",
          borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: C.shadowMd,
        }}>{toast.msg}</div>
      )}

      <div style={{ padding: "24px 28px" }}>
        {/* Form */}
        <div style={{
          background: `${C.accent}06`, border: `1px solid ${C.accent}30`,
          borderRadius: 14, padding: 20, marginBottom: 18,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 14, letterSpacing: 1 }}>
            + SET POOL & DISTRIBUSI
          </div>

          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {(["otomatis", "manual"] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); resetPreview(); }} style={{
                padding: "6px 16px",
                background: mode === m ? `${C.accent}20` : "transparent",
                border: `1.5px solid ${mode === m ? C.accent : C.border}`,
                borderRadius: 20, color: mode === m ? C.accent : C.muted,
                cursor: "pointer", fontSize: 12, fontWeight: mode === m ? 700 : 500,
                fontFamily: C.fontSans,
              }}>
                {m === "otomatis" ? "🤖 Otomatis" : "✏️ Manual per Toko"}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: mode === "otomatis" ? "2fr 1fr auto" : "2fr auto", gap: 12, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" }}>PRODUK *</div>
              <select value={selectedStokId} onChange={e => setSelectedStokId(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">— Pilih produk —</option>
                {stokOpts.map(s => (
                  <option key={s.id} value={s.id}>{s.nama_produk} {s.sku ? `(${s.sku})` : ""}</option>
                ))}
              </select>
            </div>
            {mode === "otomatis" && (
              <div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" }}>ANGGARAN STOK *</div>
                <input value={anggaranInput} onChange={e => setAnggaranInput(formatIDR(e.target.value))}
                  placeholder="0" style={inputStyle} />
              </div>
            )}
            <button
              onClick={mode === "otomatis" ? hitungDistribusi : bukaManual}
              disabled={computing} style={{
                padding: "10px 20px",
                background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`,
                border: "none", color: "#fff", borderRadius: 8,
                cursor: computing ? "wait" : "pointer", fontWeight: 700, fontSize: 13,
                fontFamily: C.fontSans, opacity: computing ? 0.7 : 1, whiteSpace: "nowrap",
              }}>
              {computing ? "Memuat..." : mode === "otomatis" ? "Hitung Distribusi" : "Input Manual →"}
            </button>
          </div>

          {/* Preview table */}
          {preview && previewProduct && (
            <div style={{ marginTop: 18, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
                    {mode === "otomatis" ? "Preview Distribusi" : "Input Manual"}: {previewProduct.nama_produk}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
                    {loadingShopeeStok ? "Mengambil stok Shopee..." : "Stok Shopee saat ini ditampilkan di kolom kanan"}
                  </div>
                </div>
                <button onClick={resetPreview} style={{
                  padding: "6px 12px", background: "transparent",
                  border: `1.5px solid ${C.border}`, color: C.muted,
                  borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
                }}>← Batal</button>
              </div>

              {/* Header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.6fr 0.8fr 0.8fr 80px",
                padding: "8px 16px", fontSize: 10, fontWeight: 700, color: C.muted,
                fontFamily: C.fontMono, letterSpacing: 1, textTransform: "uppercase" as const,
                background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                borderBottom: `1px solid ${C.border}`, gap: 12,
              }}>
                <span>Toko</span>
                {mode === "otomatis" && <span>Histori 30d</span>}
                <span>%</span>
                <span style={{ textAlign: "right" }}>Stok Shopee</span>
                <span style={{ textAlign: "right" }}>Tambah</span>
                <span>Source</span>
              </div>

              {preview.map(row => (
                <div key={row.toko_id} style={{
                  display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.6fr 0.8fr 0.8fr 80px",
                  padding: "10px 16px", borderBottom: `1px solid ${C.border}`,
                  alignItems: "center", gap: 12,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{row.toko_nama}</div>
                  {mode === "otomatis" && <div style={{ fontSize: 12, color: C.textMid, fontFamily: C.fontMono }}>{row.sales_30d} pcs</div>}
                  <div style={{ fontSize: 12, color: C.textMid, fontFamily: C.fontMono }}>{row.persentase.toFixed(1)}%</div>
                  <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: C.blue, fontFamily: C.fontMono }}>
                    {row.stok_shopee === null ? (loadingShopeeStok ? "..." : "—") : fmtInt(row.stok_shopee)}
                  </div>
                  <input
                    value={fmtInt(row.jumlah)}
                    onChange={e => updatePreviewRow(row.toko_id, e.target.value)}
                    style={{ ...inputStyle, padding: "6px 10px", textAlign: "right", fontFamily: C.fontMono, fontWeight: 700 }}
                  />
                  <span style={{
                    fontSize: 10, padding: "3px 8px", borderRadius: 12,
                    background: row.hasHistory ? C.greenDim : C.yellowDim,
                    color: row.hasHistory ? C.green : C.yellow,
                    fontWeight: 700, fontFamily: C.fontMono, alignSelf: "center", textAlign: "center",
                  }}>{mode === "manual" ? "manual" : row.hasHistory ? "histori" : "rata-rata"}</span>
                </div>
              ))}

              {/* Footer */}
              <div style={{
                padding: "14px 16px",
                background: C.greenDim,
                borderTop: `1px solid ${C.border}`,
                display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
              }}>
                <div style={{ fontSize: 12, fontFamily: C.fontMono, color: C.green, fontWeight: 700 }}>
                  Total tambahan: <span style={{ fontSize: 16 }}>{fmtInt(previewSum)}</span>
                </div>
                <button onClick={konfirmasiPush} disabled={confirming || previewSum === 0} style={{
                  padding: "10px 18px",
                  background: previewSum > 0 ? `linear-gradient(135deg, #ee4d2d, #ff6b35)` : C.border,
                  border: "none", color: previewSum > 0 ? "#fff" : C.muted,
                  borderRadius: 10, cursor: previewSum > 0 && !confirming ? "pointer" : "not-allowed",
                  fontWeight: 800, fontSize: 13, fontFamily: C.fontSans, opacity: confirming ? 0.7 : 1,
                }}>
                  {confirming ? "Memproses..." : "✓ Konfirmasi & Push ke Shopee"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pool tersimpan */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: 0 }}>Pool Stok Tersimpan</h2>
          <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{pools.length} pool</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {loading && pools.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>
          )}
          {!loading && pools.length === 0 && (
            <div style={{
              padding: 30, textAlign: "center", color: C.muted, fontFamily: C.fontMono,
              background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12,
            }}>Belum ada pool stok</div>
          )}
          {pools.map(p => {
            const dist = distribusi.filter(d => d.pool_id === p.id);
            return (
              <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: C.shadow }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{p.nama_produk}</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                      {p.sku && <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>SKU: {p.sku}</span>}
                      <span style={{ fontSize: 11, color: C.accent, fontFamily: C.fontMono, fontWeight: 700 }}>
                        Anggaran: {fmtInt(p.total_anggaran)}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => pushPool(p.id)} disabled={pushingPoolId === p.id} style={{
                      padding: "7px 14px", background: `linear-gradient(135deg, #ee4d2d, #ff6b35)`,
                      border: "none", color: "#fff", borderRadius: 6,
                      cursor: pushingPoolId === p.id ? "wait" : "pointer",
                      fontSize: 11, fontFamily: C.fontMono, fontWeight: 700,
                      opacity: pushingPoolId === p.id ? 0.6 : 1,
                    }}>
                      {pushingPoolId === p.id ? "Pushing..." : "↑ Push Semua ke Shopee"}
                    </button>
                    <button onClick={() => deletePool(p.id, p.nama_produk)} style={{
                      padding: "7px 10px", background: `${C.red}15`,
                      border: `1px solid ${C.red}25`, color: C.red,
                      borderRadius: 6, cursor: "pointer", fontSize: 11,
                      fontFamily: C.fontMono, fontWeight: 700,
                    }}>🗑</button>
                  </div>
                </div>
                <div style={{ padding: "8px 18px 14px" }}>
                  {dist.length === 0 && <div style={{ padding: 14, color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Tidak ada distribusi</div>}
                  {dist.map(d => (
                    <div key={d.id} style={{
                      display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 1.5fr auto",
                      gap: 12, alignItems: "center", padding: "10px 4px",
                      borderBottom: `1px solid ${C.border}33`,
                    }}>
                      <div style={{ fontSize: 13, color: C.text, fontWeight: 700 }}>{d.nama_toko}</div>
                      <div style={{ fontSize: 13, color: C.text, fontFamily: C.fontMono }}>{fmtInt(d.jumlah)}</div>
                      <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{d.persentase.toFixed(1)}%</div>
                      <div style={{ fontSize: 11, fontFamily: C.fontMono }}>
                        {d.last_push_status ? (
                          d.last_push_status === "ok"
                            ? <span style={{ color: C.green }}>✓ ok · {d.last_pushed_at ? new Date(d.last_pushed_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : ""}</span>
                            : <span style={{ color: C.red }}>{d.last_push_status}</span>
                        ) : <span style={{ color: C.muted }}>belum di-push</span>}
                      </div>
                      <button onClick={() => pushOne(d.id)} disabled={pushingId === d.id} style={{
                        padding: "5px 12px", background: `${C.blue}15`,
                        border: `1px solid ${C.blue}30`, color: C.blue,
                        borderRadius: 6, cursor: pushingId === d.id ? "wait" : "pointer",
                        fontSize: 11, fontFamily: C.fontMono, fontWeight: 700,
                        opacity: pushingId === d.id ? 0.6 : 1,
                      }}>
                        {pushingId === d.id ? "..." : "↑ Push"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
