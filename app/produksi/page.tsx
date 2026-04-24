"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";

type BahanBaku = { id: number; nama: string; satuan: string; kategori: string; stok: number; harga_beli_avg: number };
type ProduksiBatch = { id: number; nama_produk: string; qty_produksi: number; catatan: string | null; total_hpp: number; created_at: string; operator: string | null };
type BahanPakai = { bahan_id: string; nama: string; qty: string; satuan: string; stok_tersedia: number };
type Toast = { msg: string; type: "success" | "error" | "info" };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const PAGE_SIZE = 10;

export default function ProduksiPage() {
  const [bahan, setBahan] = useState<BahanBaku[]>([]);
  const [riwayat, setRiwayat] = useState<ProduksiBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<"input" | "riwayat">("input");

  // Form produksi
  const [namaProduk, setNamaProduk] = useState("");
  const [qtyProduksi, setQtyProduksi] = useState("");
  const [operator, setOperator] = useState("");
  const [catatan, setCatatan] = useState("");
  const [bahanPakai, setBahanPakai] = useState<BahanPakai[]>([{ bahan_id: "", nama: "", qty: "", satuan: "", stok_tersedia: 0 }]);

  // Filter riwayat
  const [filterNama, setFilterNama] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // Expand detail
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailCache, setDetailCache] = useState<Record<number, any[]>>({});

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const [resBahan, resProduksi] = await Promise.all([
        supabase.from("bahan_baku").select("*").or("aktif.eq.true,aktif.is.null").order("kategori").order("nama"),
        supabase.from("produksi_batch").select("*").order("created_at", { ascending: false }).limit(200),
      ]);
      if (resBahan.error) throw new Error("Gagal load bahan: " + resBahan.error.message);
      if (resProduksi.error) throw new Error("Gagal load produksi: " + resProduksi.error.message);
      setBahan(resBahan.data || []);
      setRiwayat(resProduksi.data || []);
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Bahan pakai helpers ────────────────────────────────────────────────────
  const addBahanPakai = () => setBahanPakai([...bahanPakai, { bahan_id: "", nama: "", qty: "", satuan: "", stok_tersedia: 0 }]);
  const removeBahanPakai = (idx: number) => { if (bahanPakai.length > 1) setBahanPakai(bahanPakai.filter((_, i) => i !== idx)); };
  const updateBahanPakai = (idx: number, field: keyof BahanPakai, value: string) => {
    const newItems = [...bahanPakai];
    if (field === "bahan_id") {
      const b = bahan.find(x => x.id === parseInt(value));
      newItems[idx] = { ...newItems[idx], bahan_id: value, nama: b?.nama || "", satuan: b?.satuan || "", stok_tersedia: b?.stok || 0 };
    } else {
      newItems[idx] = { ...newItems[idx], [field]: value };
    }
    setBahanPakai(newItems);
  };

  // HPP total = sum(qty * harga_beli_avg per bahan)
  const totalHPP = useMemo(() => bahanPakai.reduce((acc, item) => {
    const b = bahan.find(x => x.id === parseInt(item.bahan_id));
    return acc + (parseFloat(item.qty || "0") * (b?.harga_beli_avg || 0));
  }, 0), [bahanPakai, bahan]);

  const hppPerUnit = qtyProduksi && parseFloat(qtyProduksi) > 0 ? totalHPP / parseFloat(qtyProduksi) : 0;

  // Validasi stok cukup
  const stokWarnings = useMemo(() => {
    return bahanPakai.filter(item => {
      if (!item.bahan_id || !item.qty) return false;
      const b = bahan.find(x => x.id === parseInt(item.bahan_id));
      return (b?.stok || 0) < parseFloat(item.qty);
    });
  }, [bahanPakai, bahan]);

  // ─── Simpan produksi ────────────────────────────────────────────────────────
  const simpanProduksi = async () => {
    if (!namaProduk.trim()) return showToast("Isi nama produk!", "error");
    if (!qtyProduksi || parseFloat(qtyProduksi) <= 0) return showToast("Isi qty produksi!", "error");
    const validItems = bahanPakai.filter(i => i.bahan_id && i.qty && parseFloat(i.qty) > 0);
    if (validItems.length === 0) return showToast("Minimal 1 bahan harus diisi!", "error");
    if (stokWarnings.length > 0) return showToast(`Stok tidak cukup: ${stokWarnings.map(i => i.nama).join(", ")}`, "error");

    setSubmitting(true);
    try {
      // Insert header batch produksi
      const { data: batchData, error: errBatch } = await supabase.from("produksi_batch").insert([{
        nama_produk: namaProduk.trim(),
        qty_produksi: parseFloat(qtyProduksi),
        total_hpp: Math.round(totalHPP),
        hpp_per_unit: Math.round(hppPerUnit),
        catatan: catatan.trim() || null,
        operator: operator.trim() || null,
      }]).select().single();

      if (errBatch) throw new Error("Gagal simpan batch: " + errBatch.message);

      // Insert detail + kurangi stok
      for (const item of validItems) {
        const qty = parseFloat(item.qty);
        const bahanId = parseInt(item.bahan_id);
        const b = bahan.find(x => x.id === bahanId);
        const hppBahan = b?.harga_beli_avg || 0;

        const { error: errDetail } = await supabase.from("detail_produksi_bahan").insert([{
          produksi_batch_id: batchData.id,
          bahan_baku_id: bahanId,
          qty_pakai: qty,
          hpp_bahan: Math.round(qty * hppBahan),
        }]);
        if (errDetail) throw new Error("Gagal simpan detail: " + errDetail.message);

        // Kurangi stok bahan
        const stokBaru = Math.max(0, (b?.stok || 0) - qty);
        const { error: errStok } = await supabase.from("bahan_baku").update({
          stok: stokBaru,
          total_nilai_stok: stokBaru * (b?.harga_beli_avg || 0),
        }).eq("id", bahanId);
        if (errStok) throw new Error("Gagal update stok: " + errStok.message);
      }

      showToast(`Produksi ${namaProduk} (${qtyProduksi} pcs) berhasil! HPP: ${rupiahFmt(Math.round(hppPerUnit))}/pcs`);

      // Reset form
      setNamaProduk(""); setQtyProduksi(""); setOperator(""); setCatatan("");
      setBahanPakai([{ bahan_id: "", nama: "", qty: "", satuan: "", stok_tersedia: 0 }]);
      fetchData();
      setActiveTab("riwayat");
    } catch (err: any) {
      showToast(err.message || "Gagal simpan", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Expand detail ──────────────────────────────────────────────────────────
  const toggleDetail = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (detailCache[id]) return;
    const { data } = await supabase
      .from("detail_produksi_bahan")
      .select("*, bahan_baku(nama, satuan)")
      .eq("produksi_batch_id", id);
    setDetailCache(prev => ({ ...prev, [id]: data || [] }));
  };

  // ─── Riwayat filter + paginate ──────────────────────────────────────────────
  const riwayatFiltered = useMemo(() => {
    let data = [...riwayat];
    if (filterNama.trim()) data = data.filter(r => r.nama_produk.toLowerCase().includes(filterNama.toLowerCase()));
    data.sort((a, b) => {
      const va = new Date(a.created_at).getTime();
      const vb = new Date(b.created_at).getTime();
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return data;
  }, [riwayat, filterNama, sortDir]);

  const totalPages = Math.ceil(riwayatFiltered.length / PAGE_SIZE);
  const riwayatPage = riwayatFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ─── Styles ─────────────────────────────────────────────────────────────────
  const C = {
    bg: "#100c16", card: "#1a1425", border: "#2a1f3d",
    text: "#e2d9f3", muted: "#7c6d8a", dim: "#5a4f6a",
    accent: "#a78bfa", success: "#34d399", danger: "#f87171", warn: "#fbbf24",
    blue: "#60a5fa",
  };

  const inputS: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: "#0f0b1a", border: `1.5px solid ${C.border}`, borderRadius: "8px",
    color: C.text, fontFamily: "'DM Sans', sans-serif", fontSize: "13px",
    boxSizing: "border-box", outline: "none",
  };

  const tabBtn = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, padding: "10px 8px", borderRadius: "8px", border: `1px solid ${active ? color + "60" : C.border}`,
    background: active ? color + "20" : "transparent",
    color: active ? color : C.muted,
    fontWeight: 600, cursor: "pointer", fontSize: "13px",
    fontFamily: "'DM Sans', sans-serif",
  });

  const kategoriList = Array.from(new Set(bahan.map(b => b.kategori).filter(Boolean)));

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px", color: C.blue }}>⚙️</div>
          <div style={{ color: C.muted, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>Memuat data produksi...</div>
        </div>
      </div>
    </Sidebar>
  );

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: #a78bfa !important; }
        select option { background: #1a1425; color: #e2d9f3; }
      `}</style>

      {toast && (
        <div style={{
          position: "fixed", top: "24px", right: "24px", zIndex: 9999,
          background: toast.type === "success" ? C.success : toast.type === "error" ? C.danger : C.blue,
          color: "#fff", padding: "14px 20px", borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px",
        }}>{toast.msg}</div>
      )}

      <div style={{ padding: "28px 24px", fontFamily: "'DM Sans', sans-serif", background: C.bg, minHeight: "100vh", maxWidth: "960px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: "26px", color: "#f0eaff", fontWeight: 400 }}>
            ⚙️ Produksi Batch
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: C.muted, fontFamily: "'DM Mono', monospace" }}>
            Input produksi · Kurangi stok bahan otomatis · Hitung HPP
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "24px" }}>
          {[
            { label: "Total Batch", value: `${riwayat.length} batch`, color: C.blue },
            { label: "Total Bahan Aktif", value: `${bahan.length} item`, color: C.accent },
            { label: "Bulan Ini", value: `${riwayat.filter(r => new Date(r.created_at).getMonth() === new Date().getMonth()).length} batch`, color: C.success },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, padding: "16px 20px", borderRadius: "14px", borderLeft: `4px solid ${s.color}` }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>{s.label}</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#f0eaff", fontFamily: "'DM Serif Display', serif" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button onClick={() => setActiveTab("input")} style={tabBtn(activeTab === "input", C.accent)}>⚙️ Input Produksi</button>
          <button onClick={() => setActiveTab("riwayat")} style={tabBtn(activeTab === "riwayat", C.blue)}>📋 Riwayat Batch</button>
        </div>

        {/* ─── TAB: INPUT PRODUKSI ─── */}
        {activeTab === "input" && (
          <div style={{ background: C.card, padding: "24px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
            <h3 style={{ margin: "0 0 20px", fontFamily: "'DM Serif Display', serif", fontSize: "18px", color: C.text, fontWeight: 400 }}>Input Batch Produksi</h3>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>NAMA PRODUK</label>
                <input type="text" value={namaProduk} onChange={e => setNamaProduk(e.target.value)} placeholder="e.g. Kue Nastar, Sirup Jahe..." style={inputS} />
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>QTY PRODUKSI</label>
                <input type="number" value={qtyProduksi} onChange={e => setQtyProduksi(e.target.value)} placeholder="pcs / unit" style={inputS} min="1" />
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>OPERATOR</label>
                <input type="text" value={operator} onChange={e => setOperator(e.target.value)} placeholder="Nama operator (opsional)" style={inputS} />
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>CATATAN</label>
              <input type="text" value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Catatan produksi (opsional)" style={inputS} />
            </div>

            {/* Bahan yang dipakai */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>
                  BAHAN YANG DIPAKAI
                  {bahan.length === 0 && <span style={{ color: C.danger, marginLeft: "8px", fontWeight: 400 }}>⚠ Belum ada bahan di master</span>}
                </label>
                <button onClick={addBahanPakai} style={{ background: C.success + "15", border: `1px solid ${C.success}40`, color: C.success, padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>+ Tambah Bahan</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 80px 140px 30px", gap: "8px", marginBottom: "6px" }}>
                {["BAHAN", "QTY PAKAI", "SATUAN", "HPP BAHAN", ""].map((h, i) => (
                  <div key={i} style={{ fontSize: "10px", fontWeight: 700, color: C.dim, letterSpacing: "0.08em" }}>{h}</div>
                ))}
              </div>

              {bahanPakai.map((item, idx) => {
                const b = bahan.find(x => x.id === parseInt(item.bahan_id));
                const kurang = item.bahan_id && item.qty && (b?.stok || 0) < parseFloat(item.qty || "0");
                return (
                  <div key={idx} style={{ marginBottom: "8px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 80px 140px 30px", gap: "8px", alignItems: "center" }}>
                      <select value={item.bahan_id} onChange={e => updateBahanPakai(idx, "bahan_id", e.target.value)} style={{ ...inputS, borderColor: kurang ? C.danger + "80" : C.border }}>
                        <option value="">— Pilih Bahan —</option>
                        {kategoriList.length > 0
                          ? kategoriList.map(kat => {
                              const bd = bahan.filter(b => b.kategori === kat);
                              if (bd.length === 0) return null;
                              return (
                                <optgroup key={kat} label={kat}>
                                  {bd.map(b => <option key={b.id} value={b.id}>{b.nama} (stok: {b.stok} {b.satuan})</option>)}
                                </optgroup>
                              );
                            })
                          : bahan.map(b => <option key={b.id} value={b.id}>{b.nama} (stok: {b.stok} {b.satuan})</option>)
                        }
                      </select>
                      <input type="number" value={item.qty} onChange={e => updateBahanPakai(idx, "qty", e.target.value)} placeholder="0" style={{ ...inputS, borderColor: kurang ? C.danger + "80" : C.border }} min="0" step="0.1" />
                      <div style={{ padding: "9px 0", textAlign: "center", fontSize: "13px", color: C.muted }}>{item.satuan || "—"}</div>
                      <div style={{ padding: "9px 0", fontSize: "13px", color: C.blue, fontFamily: "'DM Mono', monospace" }}>
                        {b && item.qty ? rupiahFmt(parseFloat(item.qty) * (b.harga_beli_avg || 0)) : "—"}
                      </div>
                      <button onClick={() => removeBahanPakai(idx)} style={{ background: C.danger + "15", border: `1px solid ${C.danger}30`, color: C.danger, width: "30px", height: "38px", borderRadius: "6px", cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                    </div>
                    {kurang && (
                      <div style={{ fontSize: "11px", color: C.danger, marginTop: "2px", paddingLeft: "4px", fontWeight: 600 }}>
                        ⚠ Stok hanya {b?.stok} {item.satuan}, perlu {item.qty}
                      </div>
                    )}
                    {!kurang && item.qty && item.bahan_id && (
                      <div style={{ fontSize: "11px", color: C.success, marginTop: "2px", paddingLeft: "4px", fontWeight: 600 }}>
                        ✓ Stok cukup ({b?.stok} {item.satuan} tersedia)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Summary HPP */}
            <div style={{ background: "#0f0b1a", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px", marginBottom: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: C.muted, fontWeight: 700, letterSpacing: "0.08em", marginBottom: "6px" }}>TOTAL HPP BAHAN</div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: "#f0eaff", fontFamily: "'DM Serif Display', serif" }}>{rupiahFmt(Math.round(totalHPP))}</div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: C.muted, fontWeight: 700, letterSpacing: "0.08em", marginBottom: "6px" }}>HPP PER UNIT</div>
                  <div style={{ fontSize: "22px", fontWeight: 700, color: C.blue, fontFamily: "'DM Serif Display', serif" }}>
                    {hppPerUnit > 0 ? rupiahFmt(Math.round(hppPerUnit)) : "—"}
                  </div>
                  {qtyProduksi && <div style={{ fontSize: "11px", color: C.dim, marginTop: "2px" }}>untuk {qtyProduksi} unit</div>}
                </div>
              </div>
            </div>

            {stokWarnings.length > 0 && (
              <div style={{ background: C.danger + "10", border: `1px solid ${C.danger}40`, borderRadius: "10px", padding: "12px 16px", marginBottom: "12px", fontSize: "13px", color: C.danger }}>
                ❌ Stok tidak cukup: <strong>{stokWarnings.map(i => i.nama).join(", ")}</strong>. Kurangi qty atau lakukan pembelian bahan dulu.
              </div>
            )}

            <button onClick={simpanProduksi} disabled={submitting || stokWarnings.length > 0} style={{
              width: "100%", padding: "13px", borderRadius: "10px",
              background: (submitting || stokWarnings.length > 0) ? "transparent" : C.accent + "25",
              border: `1px solid ${(submitting || stokWarnings.length > 0) ? C.dim : C.accent + "60"}`,
              color: (submitting || stokWarnings.length > 0) ? C.dim : C.accent,
              fontWeight: 700, cursor: (submitting || stokWarnings.length > 0) ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans', sans-serif", fontSize: "15px",
            }}>
              {submitting ? "Menyimpan..." : "✓ Simpan Batch Produksi"}
            </button>
          </div>
        )}

        {/* ─── TAB: RIWAYAT ─── */}
        {activeTab === "riwayat" && (
          <div style={{ background: C.card, padding: "20px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
            <h3 style={{ margin: "0 0 16px", fontFamily: "'DM Serif Display', serif", color: C.text, fontWeight: 400 }}>Riwayat Batch Produksi</h3>

            {/* Filter bar */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              <input
                type="text" value={filterNama} placeholder="🔍 Cari nama produk..."
                onChange={e => { setFilterNama(e.target.value); setCurrentPage(1); }}
                style={{ ...inputS, flex: 1, padding: "8px 12px" }}
              />
              <button onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")} style={{
                padding: "8px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px",
                color: C.muted, cursor: "pointer", fontSize: "12px", fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Tanggal {sortDir === "desc" ? "↓" : "↑"}
              </button>
            </div>

            {riwayatFiltered.length === 0 && (
              <div style={{ textAlign: "center", color: C.dim, padding: "32px", fontSize: "14px" }}>
                {filterNama ? "Tidak ditemukan." : "Belum ada riwayat produksi"}
              </div>
            )}

            {riwayatPage.map(r => (
              <div key={r.id} style={{ borderBottom: `1px solid ${C.border}20`, marginBottom: "2px" }}>
                {/* Row utama */}
                <div
                  onClick={() => toggleDetail(r.id)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", cursor: "pointer" }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: C.text }}>{r.nama_produk}</div>
                    <div style={{ fontSize: "11px", color: C.dim, fontFamily: "'DM Mono', monospace", marginTop: "2px" }}>
                      {tanggalFmt(r.created_at)}{r.operator ? ` · ${r.operator}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", marginRight: "12px" }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: "#f0eaff", fontFamily: "'DM Mono', monospace" }}>{r.qty_produksi} unit</div>
                    <div style={{ fontSize: "11px", color: C.blue, fontFamily: "'DM Mono', monospace" }}>HPP: {rupiahFmt(r.total_hpp)}</div>
                  </div>
                  <div style={{ color: C.muted, fontSize: "12px", minWidth: "20px", textAlign: "center" }}>
                    {expandedId === r.id ? "▲" : "▼"}
                  </div>
                </div>

                {/* Detail expandable */}
                {expandedId === r.id && (
                  <div style={{ background: "#0f0b1a", borderRadius: "8px", padding: "14px", marginBottom: "10px" }}>
                    {!detailCache[r.id] ? (
                      <div style={{ color: C.muted, fontSize: "13px" }}>Memuat detail...</div>
                    ) : detailCache[r.id].length === 0 ? (
                      <div style={{ color: C.dim, fontSize: "13px" }}>Tidak ada detail tersimpan</div>
                    ) : (
                      <>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em", marginBottom: "10px" }}>BAHAN YANG DIPAKAI</div>
                        {detailCache[r.id].map((d: any, i: number) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}30` }}>
                            <div style={{ fontSize: "13px", color: C.text }}>{d.bahan_baku?.nama || `Bahan #${d.bahan_baku_id}`}</div>
                            <div style={{ fontSize: "13px", color: C.muted, fontFamily: "'DM Mono', monospace" }}>
                              {d.qty_pakai} {d.bahan_baku?.satuan} · {rupiahFmt(d.hpp_bahan)}
                            </div>
                          </div>
                        ))}
                        {r.catatan && (
                          <div style={{ marginTop: "10px", fontSize: "12px", color: C.muted, fontStyle: "italic" }}>
                            📝 {r.catatan}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px", paddingTop: "12px", borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: "12px", color: C.muted }}>
                  {riwayatFiltered.length} batch · hal {currentPage}/{totalPages}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                    style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "6px", color: currentPage === 1 ? C.dim : C.muted, cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: "12px" }}>
                    ← Prev
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                    if (page < 1 || page > totalPages) return null;
                    return (
                      <button key={page} onClick={() => setCurrentPage(page)}
                        style={{ padding: "6px 10px", background: page === currentPage ? C.accent + "20" : "transparent", border: `1px solid ${page === currentPage ? C.accent + "60" : C.border}`, borderRadius: "6px", color: page === currentPage ? C.accent : C.muted, cursor: "pointer", fontSize: "12px", fontWeight: page === currentPage ? 700 : 400 }}>
                        {page}
                      </button>
                    );
                  })}
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                    style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "6px", color: currentPage === totalPages ? C.dim : C.muted, cursor: currentPage === totalPages ? "not-allowed" : "pointer", fontSize: "12px" }}>
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Sidebar>
  );
}
