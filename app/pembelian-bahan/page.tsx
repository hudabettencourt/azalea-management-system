"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type BahanBaku = { id: number; nama: string; satuan: string; kategori: string; stok: number; harga_beli_avg: number };
type PembelianBahan = { id: number; tanggal: string; supplier_nama: string; total_bayar: number; metode_bayar: string; status_bayar: string; total_item: number; created_at: string };
type HutangBahan = { id: number; supplier_nama: string; nominal: number; status: string; created_at: string };
type ItemBeli = { bahan_id: string; nama: string; qty: string; harga_beli: string; satuan: string };
type DetailPembelian = { id: number; bahan_baku_id: number; qty: number; harga_beli: number; bahan_baku: { nama: string; satuan: string } };
type Toast = { msg: string; type: "success" | "error" | "info" };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

const T = {
  bg: "#100c16",
  bgCard: "rgba(255,255,255,0.02)",
  sidebar: "#130d1a",
  border: "rgba(232,115,138,0.12)",
  borderStrong: "rgba(232,115,138,0.28)",
  accent: "#e8738a",
  accentDim: "rgba(232,115,138,0.12)",
  accentGlow: "rgba(232,115,138,0.25)",
  text: "#f0e6e9",
  textMid: "#c0a8b4",
  textDim: "#7a6880",
  green: "#6fcf97",
  yellow: "#f2c94c",
  red: "#eb5757",
  fontDisplay: "'DM Serif Display', Georgia, serif",
  fontMono: "'DM Mono', 'Fira Mono', monospace",
  fontSans: "'DM Sans', 'Segoe UI', sans-serif",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 13px",
  background: "rgba(255,255,255,0.04)",
  border: "1.5px solid rgba(232,115,138,0.15)",
  borderRadius: 8, color: "#e0d0d8",
  fontFamily: T.fontSans, fontSize: 13,
  boxSizing: "border-box", outline: "none",
  transition: "border-color 0.2s",
};

export default function PembelianBahanPage() {
  const [bahan, setBahan] = useState<BahanBaku[]>([]);
  const [riwayat, setRiwayat] = useState<PembelianBahan[]>([]);
  const [hutang, setHutang] = useState<HutangBahan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<"beli" | "riwayat" | "hutang" | "master">("beli");

  // Expand detail riwayat
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailMap, setDetailMap] = useState<Record<number, DetailPembelian[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<number | null>(null);

  const [supplierNama, setSupplierNama] = useState("");
  const [metodeBayar, setMetodeBayar] = useState("Tunai");
  const [catatan, setCatatan] = useState("");
  const [items, setItems] = useState<ItemBeli[]>([
    { bahan_id: "", nama: "", qty: "", harga_beli: "", satuan: "" }
  ]);

  const [namaBaru, setNamaBaru] = useState("");
  const [satuanBaru, setSatuanBaru] = useState("kg");
  const [kategoriBaru, setKategoriBaru] = useState("Bahan Baku");
  const [filterKategori, setFilterKategori] = useState("Semua");

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const [resBahan, resRiwayat, resHutang] = await Promise.all([
        supabase.from("bahan_baku").select("*").or("aktif.eq.true,aktif.is.null").order("kategori").order("nama"),
        supabase.from("pembelian_bahan").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("hutang_supplier_bahan").select("*").eq("status", "Belum Lunas").order("created_at", { ascending: false }),
      ]);
      if (resBahan.error) throw new Error("Gagal load bahan: " + resBahan.error.message);
      if (resRiwayat.error) throw new Error("Gagal load riwayat: " + resRiwayat.error.message);
      if (resHutang.error) throw new Error("Gagal load hutang: " + resHutang.error.message);
      setBahan(resBahan.data || []);
      setRiwayat(resRiwayat.data || []);
      setHutang(resHutang.data || []);
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleDetail = async (id: number) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (detailMap[id]) return; // sudah di-cache
    setLoadingDetail(id);
    const { data, error } = await supabase
      .from("detail_pembelian_bahan")
      .select("*, bahan_baku(nama, satuan)")
      .eq("pembelian_bahan_id", id);
    if (!error && data) setDetailMap(prev => ({ ...prev, [id]: data }));
    setLoadingDetail(null);
  };

  const addItem = () => setItems([...items, { bahan_id: "", nama: "", qty: "", harga_beli: "", satuan: "" }]);
  const removeItem = (idx: number) => { if (items.length === 1) return; setItems(items.filter((_, i) => i !== idx)); };

  const updateItem = (idx: number, field: keyof ItemBeli, value: string) => {
    const newItems = [...items];
    if (field === "bahan_id") {
      const b = bahan.find(x => x.id === parseInt(value));
      newItems[idx] = { ...newItems[idx], bahan_id: value, nama: b?.nama || "", satuan: b?.satuan || "", harga_beli: b?.harga_beli_avg ? String(Math.round(b.harga_beli_avg)) : "" };
    } else {
      newItems[idx] = { ...newItems[idx], [field]: value };
    }
    setItems(newItems);
  };

  const totalBayar = items.reduce((acc, item) => acc + (parseFloat(item.qty || "0") * parseInt(item.harga_beli || "0")), 0);

  const simpanPembelian = async () => {
    if (!supplierNama.trim()) return showToast("Isi nama supplier!", "error");
    const validItems = items.filter(i => i.bahan_id && i.qty && i.harga_beli);
    if (validItems.length === 0) return showToast("Minimal 1 bahan harus diisi!", "error");
    setSubmitting(true);
    try {
      const { data: zakatRows } = await supabase.from("data_zakat").select("saldo_zakat").order("created_at", { ascending: false }).limit(1);
      const saldoZakatLalu = zakatRows?.[0]?.saldo_zakat || 0;
      const zakatBaru = Math.floor(totalBayar * 0.025);

      const { data: pembelianData, error: errPembelian } = await supabase
        .from("pembelian_bahan")
        .insert([{ supplier_nama: supplierNama.trim(), total_item: validItems.length, total_bayar: totalBayar, metode_bayar: metodeBayar, status_bayar: metodeBayar === "Hutang" ? "Belum Lunas" : "Lunas", catatan: catatan.trim() || null }])
        .select().single();
      if (errPembelian) throw new Error("Gagal simpan: " + errPembelian.message);

      for (const item of validItems) {
        const qty = parseFloat(item.qty);
        const harga = parseInt(item.harga_beli);
        const bahanId = parseInt(item.bahan_id);
        const { error: errDetail } = await supabase.from("detail_pembelian_bahan").insert([{ pembelian_bahan_id: pembelianData.id, bahan_baku_id: bahanId, qty, harga_beli: harga }]);
        if (errDetail) throw new Error("Gagal simpan detail: " + errDetail.message);
        const { error: errRpc } = await supabase.rpc("update_hpp_bahan", { p_bahan_id: bahanId, p_qty: qty, p_harga_beli: harga });
        if (errRpc) {
          const bahanData = bahan.find(b => b.id === bahanId);
          if (bahanData) {
            const stokBaru = (bahanData.stok || 0) + qty;
            const hppBaru = stokBaru > 0 ? Math.round(((bahanData.stok || 0) * (bahanData.harga_beli_avg || 0) + qty * harga) / stokBaru) : harga;
            await supabase.from("bahan_baku").update({ stok: stokBaru, harga_beli_avg: hppBaru, total_nilai_stok: stokBaru * hppBaru }).eq("id", bahanId);
          }
        }
      }

      if (metodeBayar !== "Hutang") {
        await supabase.from("kas").insert([{ tipe: "Keluar", kategori: "Beli Bahan", nominal: totalBayar, keterangan: `Beli bahan dari ${supplierNama} (${validItems.length} item)` }]);
      }
      if (metodeBayar === "Hutang") {
        await supabase.from("hutang_supplier_bahan").insert([{ pembelian_bahan_id: pembelianData.id, supplier_nama: supplierNama.trim(), nominal: totalBayar, status: "Belum Lunas" }]);
      }
      await supabase.from("data_zakat").insert([{ nominal_belanja: totalBayar, zakat_keluar: 0, saldo_zakat: saldoZakatLalu + zakatBaru, pj: `Beli Bahan - ${supplierNama}` }]);

      showToast(`Pembelian ${rupiahFmt(totalBayar)} berhasil! Zakat +${rupiahFmt(zakatBaru)}`);
      setSupplierNama(""); setMetodeBayar("Tunai"); setCatatan("");
      setItems([{ bahan_id: "", nama: "", qty: "", harga_beli: "", satuan: "" }]);
      fetchData(); setActiveTab("riwayat");
    } catch (err: any) {
      showToast(err.message || "Gagal simpan", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const lunaskanHutang = async (id: number, nominal: number, nama: string) => {
    const { error } = await supabase.from("hutang_supplier_bahan").update({ status: "Lunas" }).eq("id", id);
    if (error) return showToast("Gagal update hutang", "error");
    await supabase.from("kas").insert([{ tipe: "Keluar", kategori: "Hutang Supplier", nominal, keterangan: `Bayar hutang bahan ke ${nama}` }]);
    showToast(`Hutang ke ${nama} lunas!`); fetchData();
  };

  const tambahBahan = async () => {
    if (!namaBaru.trim()) return showToast("Isi nama bahan!", "error");
    const { error } = await supabase.from("bahan_baku").insert([{ nama: namaBaru.trim(), satuan: satuanBaru, kategori: kategoriBaru, aktif: true, stok: 0, harga_beli_avg: 0, total_nilai_stok: 0 }]);
    if (error) return showToast("Gagal tambah bahan: " + error.message, "error");
    showToast(`${namaBaru} berhasil ditambahkan!`); setNamaBaru(""); fetchData();
  };

  const totalHutang = hutang.reduce((a, b) => a + b.nominal, 0);
  const kategoriList = Array.from(new Set(bahan.map(b => b.kategori).filter(Boolean)));
  const bahanFiltered = filterKategori === "Semua" ? bahan : bahan.filter(b => b.kategori === filterKategori);

  const kategoriColor: Record<string, string> = {
    "Bahan Baku": "#3b82f6", "Bahan Penolong": "#f2c94c", "Packaging": "#8b5cf6",
  };

  const tabs = [
    { id: "beli", label: "Input Beli", icon: "🛒" },
    { id: "riwayat", label: "Riwayat", icon: "▤" },
    { id: "hutang", label: `Hutang${hutang.length > 0 ? ` (${hutang.length})` : ""}`, icon: "💳" },
    { id: "master", label: "Master Bahan", icon: "📦" },
  ] as const;

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12, filter: "drop-shadow(0 0 20px #e8738a88)" }}>🧪</div>
        <div style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 12, letterSpacing: 2 }}>MEMUAT DATA BAHAN...</div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { background: ${T.bg}; }
        input:focus, select:focus, textarea:focus { border-color: rgba(232,115,138,0.5) !important; box-shadow: 0 0 0 3px rgba(232,115,138,0.08) !important; outline: none; }
        input, select, textarea { color: #e0d0d8 !important; }
        input::placeholder, textarea::placeholder { color: #5a4860 !important; }
        select option { background: #1a1020; color: #e0d0d8; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(232,115,138,0.2); border-radius: 3px; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 9999,
          background: "#1a1020", border: `1px solid ${toast.type === "success" ? T.green : toast.type === "error" ? T.red : T.accent}44`,
          color: toast.type === "success" ? T.green : toast.type === "error" ? T.red : T.accent,
          padding: "14px 20px", borderRadius: 12,
          fontFamily: T.fontMono, fontWeight: 600, fontSize: 13,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          animation: "fadeUp 0.3s ease",
        }}>{toast.msg}</div>
      )}

      <div style={{ display: "flex", minHeight: "100vh", fontFamily: T.fontSans, background: T.bg, color: T.text }}>

        {/* Sidebar */}
        <aside style={{ width: 220, flexShrink: 0, background: T.sidebar, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "24px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg, #e8738a, #c94f68)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, boxShadow: `0 0 16px ${T.accentGlow}` }}>✿</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>Azalea</div>
                <div style={{ fontSize: 9, color: T.accent, letterSpacing: 2, textTransform: "uppercase", fontFamily: T.fontMono }}>ERP System</div>
              </div>
            </a>
          </div>
          <nav style={{ flex: 1, padding: "16px 12px" }}>
            <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, textTransform: "uppercase", fontFamily: T.fontMono, padding: "0 8px", marginBottom: 8 }}>Pembelian Bahan</div>
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <div key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 2,
                  background: isActive ? T.accentDim : "transparent",
                  borderLeft: isActive ? `2px solid ${T.accent}` : "2px solid transparent",
                  transition: "all 0.15s",
                }}>
                  <span style={{ fontSize: 13 }}>{tab.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? T.text : T.textDim }}>{tab.label}</span>
                </div>
              );
            })}
            <div style={{ height: 1, background: T.border, margin: "16px 0" }} />
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, textDecoration: "none", color: T.textDim, fontSize: 13 }}>
              <span>←</span><span>Kembali ke Beranda</span>
            </a>
          </nav>
          {/* Stats mini */}
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, marginBottom: 8 }}>RINGKASAN</div>
            <div style={{ fontSize: 12, color: T.textMid, marginBottom: 4 }}>{bahan.length} bahan terdaftar</div>
            <div style={{ fontSize: 12, color: hutang.length > 0 ? T.yellow : T.green, fontFamily: T.fontMono }}>{rupiahFmt(totalHutang)} hutang</div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Topbar */}
          <header style={{ height: 58, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`, background: "rgba(16,12,22,0.9)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 100 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1 }}>AZALEA /</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginLeft: 4 }}>🧪 Pembelian Bahan Produksi</span>
            </div>
            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>Zakat otomatis 2.5%</div>
          </header>

          {/* Content */}
          <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
              {[
                { label: "Total Bahan", nilai: `${bahan.length} item`, icon: "📦", accent: "#3b82f6" },
                { label: "Hutang Supplier", nilai: rupiahFmt(totalHutang), icon: "💳", accent: T.yellow },
                { label: "Total Transaksi", nilai: `${riwayat.length} pembelian`, icon: "📋", accent: T.green },
              ].map(s => (
                <div key={s.label} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 22px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, right: 0, width: 70, height: 70, background: `radial-gradient(circle at top right, ${s.accent}18, transparent 70%)`, borderRadius: "0 14px 0 100%" }} />
                  <div style={{ fontSize: 10, letterSpacing: 2, color: T.textDim, textTransform: "uppercase", fontFamily: T.fontMono, marginBottom: 8 }}>{s.icon} {s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>{s.nilai}</div>
                </div>
              ))}
            </div>

            {/* TAB: INPUT BELI */}
            {activeTab === "beli" && (
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", animation: "fadeUp 0.3s ease" }}>
                <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}` }}>
                  <h3 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 18, color: T.text }}>Input Pembelian Bahan</h3>
                </div>
                <div style={{ padding: "24px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: T.textDim, display: "block", marginBottom: 6, fontFamily: T.fontMono, letterSpacing: 1.5, textTransform: "uppercase" }}>Supplier / Toko</label>
                      <input type="text" value={supplierNama} onChange={e => setSupplierNama(e.target.value)} placeholder="Nama supplier/toko" style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: T.textDim, display: "block", marginBottom: 6, fontFamily: T.fontMono, letterSpacing: 1.5, textTransform: "uppercase" }}>Metode Bayar</label>
                      <select value={metodeBayar} onChange={e => setMetodeBayar(e.target.value)} style={inputStyle}>
                        <option value="Tunai">💵 Tunai</option>
                        <option value="Transfer">🏦 Transfer</option>
                        <option value="Hutang">📝 Hutang</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: T.textDim, display: "block", marginBottom: 6, fontFamily: T.fontMono, letterSpacing: 1.5, textTransform: "uppercase" }}>Catatan</label>
                    <input type="text" value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Opsional" style={inputStyle} />
                  </div>

                  {/* Items */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <label style={{ fontSize: 10, fontWeight: 700, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1.5, textTransform: "uppercase" }}>
                        Bahan yang Dibeli
                        {bahan.length === 0 && <span style={{ color: T.red, marginLeft: 8, fontWeight: 400, letterSpacing: 0 }}>⚠ Belum ada bahan</span>}
                      </label>
                      <button onClick={addItem} style={{ background: "rgba(111,207,151,0.1)", border: "1px solid rgba(111,207,151,0.25)", color: T.green, padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.fontMono }}>+ Tambah</button>
                    </div>
                    {/* Header */}
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 150px 32px", gap: 8, marginBottom: 8, padding: "0 4px" }}>
                      {["Bahan", "Qty", "Satuan", "Harga Beli", ""].map(h => (
                        <div key={h} style={{ fontSize: 10, fontWeight: 700, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1 }}>{h}</div>
                      ))}
                    </div>
                    {items.map((item, idx) => (
                      <div key={idx} style={{ marginBottom: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 150px 32px", gap: 8, alignItems: "center" }}>
                          <select value={item.bahan_id} onChange={e => updateItem(idx, "bahan_id", e.target.value)} style={inputStyle}>
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
                          <input type="number" value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} placeholder="0" style={inputStyle} min="0" step="0.1" />
                          <div style={{ padding: "9px 10px", background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.textDim, textAlign: "center", fontFamily: T.fontMono }}>
                            {item.satuan || "—"}
                          </div>
                          <input type="number" value={item.harga_beli} onChange={e => updateItem(idx, "harga_beli", e.target.value)} placeholder="Harga/satuan" style={inputStyle} min="0" />
                          <button onClick={() => removeItem(idx)} style={{ background: "rgba(235,87,87,0.1)", border: "1px solid rgba(235,87,87,0.2)", color: T.red, width: 32, height: 36, borderRadius: 6, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                        </div>
                        {item.qty && item.harga_beli && (
                          <div style={{ fontSize: 11, color: T.accent, marginTop: 3, paddingLeft: 4, fontFamily: T.fontMono }}>
                            Subtotal: {rupiahFmt(parseFloat(item.qty || "0") * parseInt(item.harga_beli || "0"))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Total */}
                  <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 18px", marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: T.textDim, fontFamily: T.fontMono, fontSize: 12, letterSpacing: 1 }}>TOTAL BAYAR</span>
                      <span style={{ fontWeight: 800, fontSize: 22, color: T.text, fontFamily: T.fontDisplay }}>{rupiahFmt(totalBayar)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 11, color: T.green, fontFamily: T.fontMono }}>🌙 Zakat Tijarah (2.5%)</span>
                      <span style={{ fontSize: 11, color: T.green, fontFamily: T.fontMono, fontWeight: 700 }}>+{rupiahFmt(Math.floor(totalBayar * 0.025))}</span>
                    </div>
                  </div>

                  {metodeBayar === "Hutang" && (
                    <div style={{ background: "rgba(242,201,76,0.08)", border: "1px solid rgba(242,201,76,0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 13, color: T.yellow, fontFamily: T.fontSans }}>
                      ⚠️ Akan dicatat sebagai <strong>hutang ke supplier</strong> sebesar {rupiahFmt(totalBayar)}
                    </div>
                  )}

                  <button onClick={simpanPembelian} disabled={submitting} style={{
                    width: "100%", padding: 13, border: "none", borderRadius: 10,
                    background: submitting ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, #c94f68, ${T.accent})`,
                    color: submitting ? T.textDim : "#fff", fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
                    fontFamily: T.fontMono, fontSize: 14,
                    boxShadow: submitting ? "none" : `0 4px 20px ${T.accentGlow}`,
                  }}>
                    {submitting ? "Menyimpan..." : "✓ Simpan Pembelian Bahan"}
                  </button>
                </div>
              </div>
            )}

            {/* TAB: RIWAYAT */}
            {activeTab === "riwayat" && (
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", animation: "fadeUp 0.3s ease" }}>
                <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}` }}>
                  <h3 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 18, color: T.text }}>Riwayat Pembelian Bahan</h3>
                  <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginTop: 4 }}>▶ Klik transaksi untuk lihat rincian bahan</div>
                </div>
                {riwayat.length === 0 && <div style={{ textAlign: "center", color: T.textDim, padding: 40, fontFamily: T.fontMono, fontSize: 13 }}>Belum ada riwayat pembelian bahan</div>}
                {riwayat.map(r => {
                  const isOpen = expandedId === r.id;
                  const details = detailMap[r.id];
                  const isLoadingThis = loadingDetail === r.id;
                  return (
                    <div key={r.id}>
                      {/* Header row */}
                      <div
                        onClick={() => toggleDetail(r.id)}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: isOpen ? "rgba(232,115,138,0.05)" : "transparent", transition: "background 0.15s" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 11, color: isOpen ? T.accent : T.textDim, display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▶</span>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: T.textMid }}>{r.supplier_nama}</div>
                            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginTop: 2 }}>{tanggalFmt(r.created_at)} · {r.total_item} bahan · {r.metode_bayar}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 800, fontSize: 15, color: T.text, fontFamily: T.fontMono }}>{rupiahFmt(r.total_bayar)}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: r.status_bayar === "Lunas" ? T.green : T.yellow, fontFamily: T.fontMono }}>{r.status_bayar}</div>
                        </div>
                      </div>

                      {/* Detail expand */}
                      {isOpen && (
                        <div style={{ background: "rgba(0,0,0,0.25)", borderBottom: `1px solid ${T.border}` }}>
                          {isLoadingThis && (
                            <div style={{ padding: "16px 24px", color: T.textDim, fontFamily: T.fontMono, fontSize: 12 }}>⏳ Memuat rincian...</div>
                          )}
                          {!isLoadingThis && details && details.length > 0 && (
                            <>
                              {/* Kolom header */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 130px 130px", gap: 8, padding: "9px 24px 9px 52px", borderBottom: `1px solid ${T.border}` }}>
                                {["NAMA BAHAN", "QTY", "HARGA / SATUAN", "SUBTOTAL"].map(h => (
                                  <div key={h} style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, fontWeight: 700 }}>{h}</div>
                                ))}
                              </div>
                              {details.map((d, i) => (
                                <div key={d.id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 130px 130px", gap: 8, padding: "11px 24px 11px 52px", borderBottom: i < details.length - 1 ? `1px solid rgba(232,115,138,0.06)` : "none", alignItems: "center" }}>
                                  <div>
                                    <div style={{ fontSize: 13, color: T.textMid, fontWeight: 600 }}>{d.bahan_baku?.nama || "—"}</div>
                                    <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{d.bahan_baku?.satuan}</div>
                                  </div>
                                  <div style={{ fontSize: 13, color: T.text, fontFamily: T.fontMono }}>{d.qty}</div>
                                  <div style={{ fontSize: 13, color: T.text, fontFamily: T.fontMono }}>{rupiahFmt(d.harga_beli)}</div>
                                  <div style={{ fontSize: 13, color: T.accent, fontFamily: T.fontMono, fontWeight: 700 }}>{rupiahFmt(d.qty * d.harga_beli)}</div>
                                </div>
                              ))}
                              {/* Total baris */}
                              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 16, padding: "11px 24px", borderTop: `1px solid ${T.border}` }}>
                                <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1 }}>TOTAL</span>
                                <span style={{ fontSize: 17, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>{rupiahFmt(r.total_bayar)}</span>
                              </div>
                            </>
                          )}
                          {!isLoadingThis && (!details || details.length === 0) && (
                            <div style={{ padding: "16px 24px", color: T.textDim, fontFamily: T.fontMono, fontSize: 12 }}>Tidak ada data rincian tersimpan</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB: HUTANG */}
            {activeTab === "hutang" && (
              <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", animation: "fadeUp 0.3s ease" }}>
                <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}` }}>
                  <h3 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 18, color: T.text }}>Hutang ke Supplier Bahan</h3>
                </div>
                <div>
                  {hutang.length === 0 && <div style={{ textAlign: "center", color: T.textDim, padding: 40, fontFamily: T.fontMono, fontSize: 13 }}>Tidak ada hutang supplier 🎉</div>}
                  {hutang.map(h => (
                    <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", borderBottom: `1px solid ${T.border}` }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: T.textMid }}>{h.supplier_nama}</div>
                        <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginTop: 2 }}>{tanggalFmt(h.created_at)}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: T.yellow, fontFamily: T.fontMono }}>{rupiahFmt(h.nominal)}</div>
                        <button onClick={() => lunaskanHutang(h.id, h.nominal, h.supplier_nama)} style={{ background: "rgba(111,207,151,0.1)", color: T.green, border: "1px solid rgba(111,207,151,0.25)", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.fontMono }}>
                          ✓ Lunas
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: MASTER BAHAN */}
            {activeTab === "master" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                {/* Form tambah */}
                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}` }}>
                    <h3 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 16, color: T.text }}>+ Tambah Bahan Baru</h3>
                  </div>
                  <div style={{ padding: 24 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: T.textDim, display: "block", marginBottom: 6, fontFamily: T.fontMono, letterSpacing: 1.5, textTransform: "uppercase" }}>Nama Bahan</label>
                        <input type="text" value={namaBaru} onChange={e => setNamaBaru(e.target.value)} onKeyDown={e => e.key === "Enter" && tambahBahan()} placeholder="Nama bahan baru" style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: T.textDim, display: "block", marginBottom: 6, fontFamily: T.fontMono, letterSpacing: 1.5, textTransform: "uppercase" }}>Satuan</label>
                        <select value={satuanBaru} onChange={e => setSatuanBaru(e.target.value)} style={inputStyle}>
                          {["kg","liter","pack","pcs","roll","karung","lusin","box"].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: T.textDim, display: "block", marginBottom: 6, fontFamily: T.fontMono, letterSpacing: 1.5, textTransform: "uppercase" }}>Kategori</label>
                        <select value={kategoriBaru} onChange={e => setKategoriBaru(e.target.value)} style={inputStyle}>
                          <option value="Bahan Baku">Bahan Baku</option>
                          <option value="Bahan Penolong">Bahan Penolong</option>
                          <option value="Packaging">Packaging</option>
                        </select>
                      </div>
                      <button onClick={tambahBahan} style={{ padding: "9px 18px", background: `linear-gradient(135deg, #1d4ed8, #3b82f6)`, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: T.fontMono, whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(59,130,246,0.3)" }}>
                        + Tambah
                      </button>
                    </div>
                  </div>
                </div>

                {/* List bahan */}
                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 16, color: T.text }}>Daftar Bahan ({bahan.length})</h3>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {["Semua", ...kategoriList].map(k => (
                        <button key={k} onClick={() => setFilterKategori(k)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${filterKategori === k ? T.borderStrong : T.border}`, cursor: "pointer", background: filterKategori === k ? T.accentDim : "transparent", color: filterKategori === k ? T.accent : T.textDim, fontSize: 11, fontWeight: 700, fontFamily: T.fontMono }}>
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>
                  {bahanFiltered.length === 0 && <div style={{ textAlign: "center", color: T.textDim, padding: 40, fontFamily: T.fontMono, fontSize: 13 }}>Belum ada bahan. Tambahkan di atas!</div>}
                  {bahanFiltered.map(b => (
                    <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ background: `${kategoriColor[b.kategori] || T.textDim}18`, color: kategoriColor[b.kategori] || T.textDim, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: T.fontMono, border: `1px solid ${kategoriColor[b.kategori] || T.textDim}33` }}>
                          {b.kategori}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: T.textMid }}>{b.nama}</div>
                          <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>HPP: {rupiahFmt(b.harga_beli_avg)}/{b.satuan}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: b.stok <= 0 ? T.red : T.text, fontFamily: T.fontMono }}>{b.stok} {b.satuan}</div>
                        {b.stok <= 0 && <div style={{ fontSize: 10, color: T.red, fontFamily: T.fontMono, letterSpacing: 1 }}>⚠ HABIS</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
