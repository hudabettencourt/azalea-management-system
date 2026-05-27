"use client";
import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Toast, formatIDR, toAngka } from "../adminTypes";

interface Props { C: any; isDark: boolean; showToast: (msg: string, type?: Toast["type"]) => void; }

type StokOpt = { id: number; nama_produk: string; sku: string | null };
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

export default function ShopeeStokTab({ C, isDark, showToast }: Props) {
  const [stokOpts, setStokOpts] = useState<StokOpt[]>([]);
  const [pools, setPools] = useState<PoolRow[]>([]);
  const [distribusi, setDistribusi] = useState<DistribusiRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedStokId, setSelectedStokId] = useState<string>("");
  const [anggaranInput, setAnggaranInput] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [pushingPoolId, setPushingPoolId] = useState<number | null>(null);

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    fontFamily: C.fontSans,
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [resStok, resPool, resDist] = await Promise.all([
        supabase.from("stok_barang").select("id, nama_produk, sku").not("sku", "is", null).order("nama_produk"),
        supabase.from("shopee_stok_pool").select("id, stok_barang_id, total_anggaran, updated_at, stok_barang:stok_barang_id(nama_produk, sku)").order("updated_at", { ascending: false }),
        supabase.from("shopee_stok_distribusi").select("id, pool_id, toko_id, jumlah, persentase, last_pushed_at, last_push_status, toko_online:toko_id(nama)"),
      ]);
      setStokOpts((resStok.data || []) as StokOpt[]);
      setPools(((resPool.data || []) as any[]).map(p => ({
        id: p.id,
        stok_barang_id: p.stok_barang_id,
        total_anggaran: p.total_anggaran,
        updated_at: p.updated_at,
        nama_produk: p.stok_barang?.nama_produk || "—",
        sku: p.stok_barang?.sku || null,
      })));
      setDistribusi(((resDist.data || []) as any[]).map(d => ({
        id: d.id,
        pool_id: d.pool_id,
        toko_id: d.toko_id,
        jumlah: d.jumlah,
        persentase: d.persentase || 0,
        last_pushed_at: d.last_pushed_at,
        last_push_status: d.last_push_status,
        nama_toko: d.toko_online?.nama || "—",
      })));
    } catch (err: any) {
      showToast("Gagal load data: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDistribusi = async () => {
    if (!selectedStokId) return showToast("Pilih produk dulu!", "error");
    const anggaran = toAngka(anggaranInput);
    if (anggaran <= 0) return showToast("Anggaran harus > 0", "error");
    setSubmitting(true);
    try {
      const res = await fetch("/api/shopee/set-stok-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stok_barang_id: parseInt(selectedStokId), total_anggaran: anggaran }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Gagal distribusi");
      showToast(`✓ Distribusi ${data.produk}: ${data.distribusi.length} toko`);
      setSelectedStokId("");
      setAnggaranInput("");
      await fetchAll();
    } catch (err: any) {
      showToast("Gagal: " + err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePushOne = async (distribusiId: number) => {
    setPushingId(distribusiId);
    try {
      const res = await fetch("/api/shopee/push-stok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distribusi_id: distribusiId }),
      });
      const data = await res.json();
      const r = data.results?.[0];
      if (r?.status === "ok") showToast(`✓ ${r.toko}: stok ${r.stock} terkirim`);
      else showToast(`Gagal: ${r?.message || data.error}`, "error");
      await fetchAll();
    } catch (err: any) {
      showToast("Gagal: " + err.message, "error");
    } finally {
      setPushingId(null);
    }
  };

  const handlePushAll = async (poolId: number) => {
    setPushingPoolId(poolId);
    try {
      const res = await fetch("/api/shopee/push-stok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    } finally {
      setPushingPoolId(null);
    }
  };

  const handleDelete = async (poolId: number, nama: string) => {
    if (!confirm(`Hapus pool stok ${nama}?`)) return;
    const { error } = await supabase.from("shopee_stok_pool").delete().eq("id", poolId);
    if (error) showToast("Gagal hapus: " + error.message, "error");
    else { showToast(`🗑 Pool ${nama} dihapus`); await fetchAll(); }
  };

  const distByPool = (poolId: number) => distribusi.filter(d => d.pool_id === poolId);

  return (
    <div style={{ animation: "fadeUp 0.3s ease" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.text }}>Stok Shopee Virtual</h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
          Pool stok terpisah dari stok fisik — distribusi otomatis berdasarkan histori 30 hari.
        </p>
      </div>

      {/* ── Form set pool ── */}
      <div style={{ background: `${C.accent}06`, border: `1px solid ${C.accent}30`, borderRadius: 14, padding: 24, marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ SET POOL & DISTRIBUSI</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" }}>PRODUK *</div>
            <select value={selectedStokId} onChange={e => setSelectedStokId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="">— Pilih produk —</option>
              {stokOpts.map(s => (
                <option key={s.id} value={s.id}>
                  {s.nama_produk} {s.sku ? `(${s.sku})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" }}>ANGGARAN STOK *</div>
            <input
              value={anggaranInput}
              onChange={e => setAnggaranInput(formatIDR(e.target.value))}
              placeholder="0"
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleDistribusi}
            disabled={submitting}
            style={{ padding: "9px 20px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: submitting ? 0.6 : 1, whiteSpace: "nowrap" }}>
            {submitting ? "Memproses..." : "Distribusi Otomatis"}
          </button>
        </div>
        {!stokOpts.length && !loading && (
          <div style={{ marginTop: 12, fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>
            Belum ada produk dengan SKU terisi — produk tanpa SKU tidak bisa di-sync ke Shopee.
          </div>
        )}
      </div>

      {/* ── List pools ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {loading && <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>}
        {!loading && pools.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Belum ada pool stok</div>
        )}
        {!loading && pools.map(p => {
          const dist = distByPool(p.id);
          return (
            <div key={p.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{p.nama_produk}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    {p.sku && <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>SKU: {p.sku}</span>}
                    <span style={{ fontSize: 11, color: C.accent, fontFamily: C.fontMono, fontWeight: 600 }}>
                      Anggaran: {p.total_anggaran.toLocaleString("id-ID")}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => handlePushAll(p.id)}
                    disabled={pushingPoolId === p.id}
                    style={{ padding: "6px 14px", background: `linear-gradient(135deg, #ee4d2d, #ff6b35)`, border: "none", color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700, opacity: pushingPoolId === p.id ? 0.6 : 1 }}>
                    {pushingPoolId === p.id ? "Pushing..." : "↑ Push Semua ke Shopee"}
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.nama_produk)}
                    style={{ padding: "6px 10px", background: `${C.red}15`, border: `1px solid ${C.red}25`, color: C.red, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 700 }}>
                    🗑
                  </button>
                </div>
              </div>

              {/* Distribusi table */}
              <div style={{ padding: "8px 20px 14px" }}>
                {dist.length === 0 && <div style={{ padding: 14, color: C.muted, fontFamily: C.fontMono, fontSize: 12 }}>Tidak ada distribusi</div>}
                {dist.map(d => (
                  <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 1.5fr auto", gap: 12, alignItems: "center", padding: "10px 4px", borderBottom: `1px solid ${C.border}33` }}>
                    <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{d.nama_toko}</div>
                    <div style={{ fontSize: 13, color: C.text, fontFamily: C.fontMono }}>{d.jumlah.toLocaleString("id-ID")}</div>
                    <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{d.persentase.toFixed(1)}%</div>
                    <div style={{ fontSize: 11, fontFamily: C.fontMono }}>
                      {d.last_push_status ? (
                        d.last_push_status === "ok"
                          ? <span style={{ color: C.green }}>✓ ok · {d.last_pushed_at ? new Date(d.last_pushed_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : ""}</span>
                          : <span style={{ color: C.red }}>{d.last_push_status}</span>
                      ) : <span style={{ color: C.muted }}>belum di-push</span>}
                    </div>
                    <button
                      onClick={() => handlePushOne(d.id)}
                      disabled={pushingId === d.id}
                      style={{ padding: "5px 12px", background: `${C.blue}15`, border: `1px solid ${C.blue}30`, color: C.blue, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: C.fontMono, fontWeight: 600, opacity: pushingId === d.id ? 0.6 : 1 }}>
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
  );
}
