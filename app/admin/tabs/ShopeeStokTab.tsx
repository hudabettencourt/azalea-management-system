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

  // Mode: "otomatis" = hitung distribusi, "manual" = input langsung per toko
  const [mode, setMode] = useState<"otomatis" | "manual">("otomatis");

  const [selectedStokId, setSelectedStokId] = useState<string>("");
  const [anggaranInput, setAnggaranInput] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [pushingId, setPushingId] = useState<number | null>(null);
  const [pushingPoolId, setPushingPoolId] = useState<number | null>(null);

  // Preview manual mode
  const [previewRows, setPreviewRows] = useState<
    { toko_id: number; toko_nama: string; jumlah: number; persentase: number }[] | null
  >(null);
  const [previewProduct, setPreviewProduct] = useState<{ id: number; nama_produk: string } | null>(null);

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

    if (mode === "otomatis") {
      const anggaran = toAngka(anggaranInput);
      if (anggaran <= 0) return showToast("Anggaran harus > 0", "error");
    }

    setSubmitting(true);
    try {
      if (mode === "otomatis") {
        const anggaran = toAngka(anggaranInput);
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
      } else {
        // Manual mode — buka preview form kosong
        const { data: tokoData } = await supabase
          .from("toko_online")
          .select("id, nama")
          .eq("platform", "Shopee")
          .eq("aktif", true)
          .not("shopee_access_token", "is", null)
          .order("nama");
        const { data: produkData } = await supabase
          .from("stok_barang")
          .select("id, nama_produk")
          .eq("id", parseInt(selectedStokId))
          .single();
        setPreviewProduct(produkData || null);
        setPreviewRows(
          (tokoData || []).map(t => ({
            toko_id: t.id,
            toko_nama: t.nama,
            jumlah: 0,
            persentase: 0,
          })),
        );
        setSubmitting(false);
      }
    } catch (err: any) {
      showToast("Gagal: " + err.message, "error");
    } finally {
      if (mode === "otomatis") setSubmitting(false);
    }
  };

  const updatePreviewRow = (toko_id: number, jumlah: number) => {
    setPreviewRows(prev => {
      if (!prev) return null;
      const updated = prev.map(r =>
        r.toko_id === toko_id ? { ...r, jumlah: Math.max(0, jumlah) } : r
      );
      const total = updated.reduce((a, r) => a + r.jumlah, 0);
      return updated.map(r => ({
        ...r,
        persentase: total > 0 ? Math.round((r.jumlah / total) * 10000) / 100 : 0,
      }));
    });
  };

  const confirmManual = async () => {
    if (!previewRows || !previewProduct) return;
    const totalPool = previewRows.reduce((a, r) => a + r.jumlah, 0);
    if (totalPool <= 0) return showToast("Total stok harus > 0", "error");

    setSubmitting(true);
    try {
      const { data: pool, error: errPool } = await supabase
        .from("shopee_stok_pool")
        .upsert(
          {
            stok_barang_id: previewProduct.id,
            total_anggaran: totalPool,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "stok_barang_id" }
        )
        .select("id")
        .single();
      if (errPool || !pool) throw new Error(errPool?.message || "Gagal simpan pool");

      await supabase.from("shopee_stok_distribusi").delete().eq("pool_id", pool.id);
      const rows = previewRows.map(r => ({
        pool_id: pool.id,
        toko_id: r.toko_id,
        stok_barang_id: previewProduct.id,
        jumlah: r.jumlah,
        persentase: r.persentase,
        updated_at: new Date().toISOString(),
      }));
      const { error: errIns } = await supabase.from("shopee_stok_distribusi").insert(rows);
      if (errIns) throw new Error(errIns.message);

      showToast(`✓ Manual distribusi ${previewProduct.nama_produk}: ${totalPool} ke ${previewRows.length} toko`);
      setPreviewRows(null);
      setPreviewProduct(null);
      setSelectedStokId("");
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
        <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, fontFamily: C.fontMono, marginBottom: 14, letterSpacing: 1 }}>
          + SET POOL & DISTRIBUSI
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {(["otomatis", "manual"] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setPreviewRows(null); setPreviewProduct(null); }}
              style={{
                padding: "6px 14px",
                background: mode === m ? `${C.accent}20` : "transparent",
                border: `1.5px solid ${mode === m ? C.accent : C.border}`,
                borderRadius: 20,
                color: mode === m ? C.accent : C.muted,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: mode === m ? 700 : 500,
                fontFamily: C.fontSans,
              }}
            >
              {m === "otomatis" ? "🤖 Otomatis" : "✏️ Manual per Toko"}
            </button>
          ))}
        </div>

        {!previewRows ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: mode === "otomatis" ? "2fr 1fr auto" : "2fr auto", gap: 12, alignItems: "end" }}>
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
              {mode === "otomatis" && (
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 5, textTransform: "uppercase" }}>ANGGARAN STOK *</div>
                  <input
                    value={anggaranInput}
                    onChange={e => setAnggaranInput(formatIDR(e.target.value))}
                    placeholder="0"
                    style={inputStyle}
                  />
                </div>
              )}
              <button
                onClick={handleDistribusi}
                disabled={submitting}
                style={{ padding: "9px 20px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: submitting ? 0.6 : 1, whiteSpace: "nowrap" }}>
                {submitting ? "Memproses..." : mode === "otomatis" ? "Distribusi Otomatis" : "Input Manual →"}
              </button>
            </div>
            {!stokOpts.length && !loading && (
              <div style={{ marginTop: 12, fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>
                Belum ada produk dengan SKU terisi — produk tanpa SKU tidak bisa di-sync ke Shopee.
              </div>
            )}
          </>
        ) : (
          /* ── Manual edit form ── */
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>
              Input manual: {previewProduct?.nama_produk || "—"}
            </div>

            <div style={{
              display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr auto", gap: 10,
              alignItems: "center", padding: "0 4px 12px", borderBottom: `1px solid ${C.border}`,
              fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1,
              textTransform: "uppercase",
            }}>
              <span>Toko</span>
              <span>Stok</span>
              <span>%</span>
              <span />
            </div>

            {previewRows.map(r => (
              <div key={r.toko_id} style={{
                display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr auto", gap: 10,
                alignItems: "center", padding: "8px 4px", borderBottom: `1px solid ${C.border}33`,
              }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{r.toko_nama}</div>
                <input
                  type="number"
                  min={0}
                  value={r.jumlah || ""}
                  onChange={e => updatePreviewRow(r.toko_id, parseInt(e.target.value) || 0)}
                  placeholder="0"
                  style={inputStyle}
                />
                <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
                  {r.persentase.toFixed(1)}%
                </div>
              </div>
            ))}

            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, fontFamily: C.fontMono }}>
                Total: {previewRows.reduce((a, r) => a + r.jumlah, 0).toLocaleString("id-ID")}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => { setPreviewRows(null); setPreviewProduct(null); setSelectedStokId(""); }}
                  style={{ padding: "8px 14px", background: "transparent", border: `1.5px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontSize: 12 }}
                >Batal</button>
                <button
                  onClick={confirmManual}
                  disabled={submitting || previewRows.reduce((a, r) => a + r.jumlah, 0) === 0}
                  style={{
                    padding: "8px 18px",
                    background: previewRows.reduce((a, r) => a + r.jumlah, 0) > 0
                      ? `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`
                      : C.border,
                    border: "none",
                    color: "#fff",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 13,
                    opacity: submitting || previewRows.reduce((a, r) => a + r.jumlah, 0) === 0 ? 0.5 : 1,
                  }}
                >
                  ✓ Simpan Distribusi
                </button>
              </div>
            </div>
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
