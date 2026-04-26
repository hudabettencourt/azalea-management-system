"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";

type BahanBaku = { id: number; nama: string; satuan: string; kategori: string; stok: number; harga_beli_avg: number };
type StokBarang = { id: number; nama_produk: string; jumlah_stok: number; sku: string | null };
type ProduksiBatch = {
  id: number;
  nama_produk: string;
  stok_barang_id: number | null;
  qty_produksi: number;
  catatan: string | null;
  total_hpp: number;
  hpp_per_unit: number;
  created_at: string;
  operator: string | null;
};
type BahanPakai = { bahan_id: string; nama: string; qty: string; satuan: string; stok_tersedia: number };
type Toast = { msg: string; type: "success" | "error" | "info" };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
});

const PAGE_SIZE = 10;

const C = {
  bg: "#100c16", card: "#1a1425", border: "#2a1f3d",
  text: "#e2d9f3", textMid: "#c0aed4", muted: "#7c6d8a", dim: "#5a4f6a",
  accent: "#a78bfa", success: "#34d399", danger: "#f87171", warn: "#fbbf24",
  blue: "#60a5fa",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

export default function ProduksiPage() {
  const [bahan, setBahan] = useState<BahanBaku[]>([]);
  const [stokBarang, setStokBarang] = useState<StokBarang[]>([]);
  const [riwayat, setRiwayat] = useState<ProduksiBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<"input" | "riwayat">("input");

  // Form produksi
  const [stokBarangId, setStokBarangId] = useState("");
  const [qtyProduksi, setQtyProduksi] = useState("");
  const [operator, setOperator] = useState("");
  const [catatan, setCatatan] = useState("");
  const [bahanPakai, setBahanPakai] = useState<BahanPakai[]>([
    { bahan_id: "", nama: "", qty: "", satuan: "", stok_tersedia: 0 }
  ]);

  // Filter & pagination riwayat
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
      const [resBahan, resStok, resProduksi] = await Promise.all([
        supabase.from("bahan_baku").select("*").or("aktif.eq.true,aktif.is.null").order("kategori").order("nama"),
        supabase.from("stok_barang").select("id, nama_produk, jumlah_stok, sku").order("nama_produk"),
        supabase.from("produksi_batch").select("*").order("created_at", { ascending: false }).limit(200),
      ]);
      if (resBahan.error) throw new Error("Gagal load bahan: " + resBahan.error.message);
      if (resStok.error) throw new Error("Gagal load produk: " + resStok.error.message);
      if (resProduksi.error) throw new Error("Gagal load produksi: " + resProduksi.error.message);
      setBahan(resBahan.data || []);
      setStokBarang(resStok.data || []);
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

  const hppPerUnit = qtyProduksi && parseFloat(qtyProduksi) > 0
    ? totalHPP / parseFloat(qtyProduksi)
    : 0;

  // Validasi stok bahan cukup
  const stokWarnings = useMemo(() => {
    return bahanPakai.filter(item => {
      if (!item.bahan_id || !item.qty) return false;
      const b = bahan.find(x => x.id === parseInt(item.bahan_id));
      return (b?.stok || 0) < parseFloat(item.qty || "0");
    });
  }, [bahanPakai, bahan]);

  const produkTerpilih = stokBarang.find(s => s.id === parseInt(stokBarangId));

  // ─── Simpan produksi ────────────────────────────────────────────────────────
  const simpanProduksi = async () => {
    if (!stokBarangId) return showToast("Pilih produk yang diproduksi!", "error");
    if (!qtyProduksi || parseFloat(qtyProduksi) <= 0) return showToast("Isi qty produksi!", "error");
    const validItems = bahanPakai.filter(i => i.bahan_id && i.qty && parseFloat(i.qty) > 0);
    if (validItems.length === 0) return showToast("Minimal 1 bahan harus diisi!", "error");
    if (stokWarnings.length > 0) return showToast(`Stok tidak cukup: ${stokWarnings.map(i => i.nama).join(", ")}`, "error");

    const qty = parseFloat(qtyProduksi);
    const hppUnit = Math.round(hppPerUnit);
    const totalHppBulat = Math.round(totalHPP);

    setSubmitting(true);
    try {
      // 1. Insert header batch produksi
      const { data: batchData, error: errBatch } = await supabase
        .from("produksi_batch")
        .insert([{
          stok_barang_id: parseInt(stokBarangId),
          nama_produk: produkTerpilih?.nama_produk || "",
          qty_produksi: qty,
          total_hpp: totalHppBulat,
          hpp_per_unit: hppUnit,
          catatan: catatan.trim() || null,
          operator: operator.trim() || null,
        }])
        .select()
        .single();
      if (errBatch) throw new Error("Gagal simpan batch: " + errBatch.message);

      // 2. Insert detail bahan + kurangi stok bahan
      for (const item of validItems) {
        const qtyBahan = parseFloat(item.qty);
        const bahanId = parseInt(item.bahan_id);
        const b = bahan.find(x => x.id === bahanId);

        const { error: errDetail } = await supabase.from("detail_produksi_bahan").insert([{
          produksi_batch_id: batchData.id,
          bahan_baku_id: bahanId,
          qty_pakai: qtyBahan,
          hpp_bahan: Math.round(qtyBahan * (b?.harga_beli_avg || 0)),
        }]);
        if (errDetail) throw new Error("Gagal simpan detail: " + errDetail.message);

        // Kurangi stok bahan baku
        const stokBaru = Math.max(0, (b?.stok || 0) - qtyBahan);
        await supabase.from("bahan_baku").update({
          stok: stokBaru,
          total_nilai_stok: Math.round(stokBaru * (b?.harga_beli_avg || 0)),
        }).eq("id", bahanId);
      }

      // 3. FIX UTAMA: Tambah stok produk jadi + update HPP di stok_barang
      // Pakai weighted average untuk HPP produk jadi
      const produkSekarang = stokBarang.find(s => s.id === parseInt(stokBarangId));
      const stokLama = produkSekarang?.jumlah_stok || 0;
      const stokBaru = stokLama + qty;

      // HPP weighted average: (stok lama × HPP lama + qty baru × HPP baru) / stok baru
      // Ambil HPP lama dari riwayat produksi terakhir produk ini
      const { data: hppLamaData } = await supabase
        .from("produksi_batch")
        .select("hpp_per_unit, qty_produksi")
        .eq("stok_barang_id", parseInt(stokBarangId))
        .order("created_at", { ascending: false })
        .limit(1);

      const hppLama = hppLamaData?.[0]?.hpp_per_unit || hppUnit;
      const hppBaru = stokBaru > 0
        ? Math.round((stokLama * hppLama + qty * hppUnit) / stokBaru)
        : hppUnit;

      const { error: errStokBarang } = await supabase
        .from("stok_barang")
        .update({
          jumlah_stok: stokBaru,
          // Update HPP di stok_barang kalau ada kolomnya
        })
        .eq("id", parseInt(stokBarangId));
      if (errStokBarang) throw new Error("Gagal update stok produk: " + errStokBarang.message);

      // 4. Catat mutasi stok produk jadi
      await supabase.from("mutasi_stok").insert([{
        stok_barang_id: parseInt(stokBarangId),
        tipe: "Masuk",
        qty,
        keterangan: `Produksi batch #${batchData.id} · HPP ${rupiahFmt(hppUnit)}/pcs`,
      }]);

      showToast(`✓ Produksi ${produkTerpilih?.nama_produk} (${qty} pcs) berhasil! HPP: ${rupiahFmt(hppUnit)}/pcs · Stok jadi: ${stokBaru}`);

      // Reset form
      setStokBarangId(""); setQtyProduksi(""); setOperator(""); setCatatan("");
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

  const inputS: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: "#0f0b1a", border: `1.5px solid ${C.border}`, borderRadius: "8px",
    color: C.text, fontFamily: C.fontSans, fontSize: "13px",
    boxSizing: "border-box", outline: "none",
  };

  const tabBtn = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, padding: "10px 8px", borderRadius: "8px",
    border: `1px solid ${active ? color + "60" : C.border}`,
    background: active ? color + "20" : "transparent",
    color: active ? color : C.muted,
    fontWeight: 600, cursor: "pointer", fontSize: "13px",
    fontFamily: C.fontSans,
  });

  const kategoriList = Array.from(new Set(bahan.map(b => b.kategori).filter(Boolean)));

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px", color: C.blue }}>⚙️</div>
          <div style={{ color: C.muted, fontWeight: 600, fontFamily: C.fontSans }}>Memuat data produksi...</div>
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
          background: toast.type === "success" ? "#0d2b1e" : toast.type === "error" ? "#2b0d0d" : "#0d1a2b",
          border: `1px solid ${toast.type === "success" ? C.success : toast.type === "error" ? C.danger : C.blue}44`,
          color: toast.type === "success" ? C.success : toast.type === "error" ? C.danger : C.blue,
          padding: "14px 20px", borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          fontFamily: C.fontMono, fontWeight: 600, fontSize: "13px", maxWidth: 400,
        }}>{toast.msg}</div>
      )}

      <div style={{ padding: "28px 24px", fontFamily: C.fontSans, background: C.bg, minHeight: "100vh", maxWidth: "960px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: 0, fontFamily: C.fontDisplay, fontSize: "26px", color: "#f0eaff", fontWeight: 400 }}>
            ⚙️ Produksi Batch
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: C.muted, fontFamily: C.fontMono }}>
            Input produksi · Kurangi stok bahan · Tambah stok produk jadi · Hitung HPP otomatis
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
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#f0eaff", fontFamily: C.fontDisplay }}>{s.value}</div>
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
            <h3 style={{ margin: "0 0 20px", fontFamily: C.fontDisplay, fontSize: "18px", color: C.text, fontWeight: 400 }}>
              Input Batch Produksi
            </h3>

            {/* FIX UTAMA: Pilih produk dari stok_barang */}
            <div style={{ background: C.accent + "10", border: `1px solid ${C.accent}30`, borderRadius: "10px", padding: "14px 16px", marginBottom: "20px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: C.accent, display: "block", marginBottom: "8px", letterSpacing: "0.08em" }}>
                PRODUK YANG DIPRODUKSI
              </label>
              <select value={stokBarangId} onChange={e => setStokBarangId(e.target.value)} style={{ ...inputS, background: "#0f0b1a" }}>
                <option value="">— Pilih Produk Jadi —</option>
                {stokBarang.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.nama_produk} {s.sku ? `(${s.sku})` : ""} · stok: {s.jumlah_stok}
                  </option>
                ))}
              </select>
              {produkTerpilih && (
                <div style={{ marginTop: "8px", fontSize: "12px", color: C.muted, fontFamily: C.fontMono }}>
                  Stok sekarang: <strong style={{ color: C.textMid }}>{produkTerpilih.jumlah_stok}</strong> pcs
                  {qtyProduksi && <span style={{ color: C.success, marginLeft: "8px" }}>→ setelah produksi: <strong>{produkTerpilih.jumlah_stok + parseFloat(qtyProduksi || "0")}</strong> pcs</span>}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>QTY PRODUKSI (pcs)</label>
                <input type="number" value={qtyProduksi} onChange={e => setQtyProduksi(e.target.value)} placeholder="Jumlah yang diproduksi" style={inputS} min="1" />
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>OPERATOR</label>
                <input type="text" value={operator} onChange={e => setOperator(e.target.value)} placeholder="Nama operator (opsional)" style={inputS} />
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>CATATAN</label>
                <input type="text" value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Opsional" style={inputS} />
              </div>
            </div>

            {/* Bahan yang dipakai */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>
                  BAHAN YANG DIPAKAI
                  {bahan.length === 0 && <span style={{ color: C.danger, marginLeft: "8px", fontWeight: 400 }}>⚠ Belum ada bahan di master</span>}
                </label>
                <button onClick={addBahanPakai} style={{ background: C.success + "15", border: `1px solid ${C.success}40`, color: C.success, padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>
                  + Tambah Bahan
                </button>
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
                      <select value={item.bahan_id} onChange={e => updateBahanPakai(idx, "bahan_id", e.target.value)}
                        style={{ ...inputS, borderColor: kurang ? C.danger + "80" : C.border }}>
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
                      <input type="number" value={item.qty} onChange={e => updateBahanPakai(idx, "qty", e.target.value)}
                        placeholder="0" style={{ ...inputS, borderColor: kurang ? C.danger + "80" : C.border }} min="0" step="0.1" />
                      <div style={{ padding: "9px 0", textAlign: "center", fontSize: "13px", color: C.muted }}>{item.satuan || "—"}</div>
                      <div style={{ padding: "9px 0", fontSize: "13px", color: C.blue, fontFamily: C.fontMono }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "11px", color: C.muted, fontWeight: 700, letterSpacing: "0.08em", marginBottom: "6px" }}>TOTAL HPP BAHAN</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#f0eaff", fontFamily: C.fontDisplay }}>{rupiahFmt(Math.round(totalHPP))}</div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: C.muted, fontWeight: 700, letterSpacing: "0.08em", marginBottom: "6px" }}>HPP PER UNIT</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: C.blue, fontFamily: C.fontDisplay }}>
                    {hppPerUnit > 0 ? rupiahFmt(Math.round(hppPerUnit)) : "—"}
                  </div>
                  {qtyProduksi && <div style={{ fontSize: "11px", color: C.dim, marginTop: "2px" }}>untuk {qtyProduksi} pcs</div>}
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: C.muted, fontWeight: 700, letterSpacing: "0.08em", marginBottom: "6px" }}>STOK SETELAH PRODUKSI</div>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: C.success, fontFamily: C.fontDisplay }}>
                    {produkTerpilih && qtyProduksi
                      ? `${produkTerpilih.jumlah_stok + parseFloat(qtyProduksi)} pcs`
                      : "—"}
                  </div>
                </div>
              </div>
            </div>

            {stokWarnings.length > 0 && (
              <div style={{ background: C.danger + "10", border: `1px solid ${C.danger}40`, borderRadius: "10px", padding: "12px 16px", marginBottom: "12px", fontSize: "13px", color: C.danger }}>
                ❌ Stok tidak cukup: <strong>{stokWarnings.map(i => i.nama).join(", ")}</strong>
              </div>
            )}

            <button onClick={simpanProduksi} disabled={submitting || stokWarnings.length > 0} style={{
              width: "100%", padding: "13px", borderRadius: "10px",
              background: (submitting || stokWarnings.length > 0) ? "transparent" : C.accent + "25",
              border: `1px solid ${(submitting || stokWarnings.length > 0) ? C.dim : C.accent + "60"}`,
              color: (submitting || stokWarnings.length > 0) ? C.dim : C.accent,
              fontWeight: 700, cursor: (submitting || stokWarnings.length > 0) ? "not-allowed" : "pointer",
              fontFamily: C.fontSans, fontSize: "15px",
            }}>
              {submitting ? "Menyimpan..." : `✓ Simpan Batch Produksi${produkTerpilih ? ` — ${produkTerpilih.nama_produk}` : ""}`}
            </button>
          </div>
        )}

        {/* ─── TAB: RIWAYAT ─── */}
        {activeTab === "riwayat" && (
          <div style={{ background: C.card, padding: "20px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
            <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, color: C.text, fontWeight: 400 }}>Riwayat Batch Produksi</h3>

            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              <input type="text" value={filterNama} placeholder="🔍 Cari nama produk..."
                onChange={e => { setFilterNama(e.target.value); setCurrentPage(1); }}
                style={{ ...inputS, flex: 1, padding: "8px 12px" }}
              />
              <button onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")} style={{
                padding: "8px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px",
                color: C.muted, cursor: "pointer", fontSize: "12px", fontWeight: 600, fontFamily: C.fontSans,
              }}>
                Tanggal {sortDir === "desc" ? "↓" : "↑"}
              </button>
            </div>

            {riwayatFiltered.length === 0 && (
              <div style={{ textAlign: "center", color: C.dim, padding: "32px", fontSize: "14px" }}>
                {filterNama ? "Tidak ditemukan." : "Belum ada riwayat produksi"}
              </div>
            )}

            {riwayatPage.map(r => {
              const produk = stokBarang.find(s => s.id === r.stok_barang_id);
              return (
                <div key={r.id} style={{ borderBottom: `1px solid ${C.border}20`, marginBottom: "2px" }}>
                  <div onClick={() => toggleDetail(r.id)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", cursor: "pointer" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "14px", color: C.text }}>{r.nama_produk}</div>
                      <div style={{ fontSize: "11px", color: C.dim, fontFamily: C.fontMono, marginTop: "2px" }}>
                        {tanggalFmt(r.created_at)}{r.operator ? ` · ${r.operator}` : ""}
                        {produk && <span style={{ color: C.accent, marginLeft: "6px" }}>· stok sekarang: {produk.jumlah_stok}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", marginRight: "12px" }}>
                      <div style={{ fontWeight: 700, fontSize: "14px", color: "#f0eaff", fontFamily: C.fontMono }}>{r.qty_produksi} pcs</div>
                      <div style={{ fontSize: "11px", color: C.blue, fontFamily: C.fontMono }}>
                        HPP/pcs: {rupiahFmt(r.hpp_per_unit)} · Total: {rupiahFmt(r.total_hpp)}
                      </div>
                    </div>
                    <div style={{ color: C.muted, fontSize: "12px", minWidth: "20px", textAlign: "center" }}>
                      {expandedId === r.id ? "▲" : "▼"}
                    </div>
                  </div>

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
                              <span style={{ fontSize: "13px", color: C.text }}>{d.bahan_baku?.nama || `Bahan #${d.bahan_baku_id}`}</span>
                              <span style={{ fontSize: "13px", color: C.muted, fontFamily: C.fontMono }}>
                                {d.qty_pakai} {d.bahan_baku?.satuan} · {rupiahFmt(d.hpp_bahan)}
                              </span>
                            </div>
                          ))}
                          {r.catatan && (
                            <div style={{ marginTop: "10px", fontSize: "12px", color: C.muted, fontStyle: "italic" }}>📝 {r.catatan}</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px", paddingTop: "12px", borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: "12px", color: C.muted }}>{riwayatFiltered.length} batch · hal {currentPage}/{totalPages}</div>
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
