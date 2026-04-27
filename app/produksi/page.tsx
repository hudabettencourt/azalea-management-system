"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";

type BahanBaku = { id: number; nama: string; satuan: string; kategori: string; stok: number; harga_beli_avg: number };
type StokBarang = { id: number; nama_produk: string; jumlah_stok: number; sku: string | null };
type ProduksiBatch = { 
  id: number; 
  stok_barang_id: number;
  nama_produk: string; 
  qty_produksi: number; 
  total_hpp: number; 
  hpp_per_unit: number; 
  gaji_operator: number; // ✅ BARU!
  operator: string | null; 
  catatan: string | null; 
  created_at: string;
};
type BahanPakai = { bahan_id: string; nama: string; qty: string; satuan: string; stok_tersedia: number };
type Toast = { msg: string; type: "success" | "error" | "info" };

const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;
const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => 
  new Date(s).toLocaleDateString("id-ID", { 
    day: "2-digit", 
    month: "short", 
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

const PAGE_SIZE = 15;

const C = {
  bg: "#100c16",
  card: "#1a1425",
  border: "#2a1f3d",
  text: "#e2d9f3",
  textMid: "#c0aed4",
  muted: "#7c6d8a",
  dim: "#3d3050",
  accent: "#a78bfa",
  accentDim: "#a78bfa20",
  success: "#34d399",
  danger: "#f87171",
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
  const [gajiOperator, setGajiOperator] = useState(""); // ✅ BARU!
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
      if (resStok.error) throw new Error("Gagal load stok: " + resStok.error.message);
      if (resProduksi.error) throw new Error("Gagal load riwayat: " + resProduksi.error.message);
      
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

  // Helper: produk terpilih
  const produkTerpilih = useMemo(() => 
    stokBarang.find(s => s.id === parseInt(stokBarangId)), 
    [stokBarang, stokBarangId]
  );

  // Helper: tambah/hapus bahan
  const addBahanPakai = () => setBahanPakai([...bahanPakai, { bahan_id: "", nama: "", qty: "", satuan: "", stok_tersedia: 0 }]);
  const removeBahanPakai = (idx: number) => {
    if (bahanPakai.length > 1) setBahanPakai(bahanPakai.filter((_, i) => i !== idx));
  };
  const updateBahanPakai = (idx: number, field: keyof BahanPakai, value: string) => {
    const newItems = [...bahanPakai];
    if (field === "bahan_id") {
      const b = bahan.find(x => x.id === parseInt(value));
      newItems[idx] = { 
        ...newItems[idx], 
        bahan_id: value, 
        nama: b?.nama || "", 
        satuan: b?.satuan || "",
        stok_tersedia: b?.stok || 0,
      };
    } else {
      newItems[idx] = { ...newItems[idx], [field]: value };
    }
    setBahanPakai(newItems);
  };

  // Validasi & perhitungan
  const validItems = bahanPakai.filter(i => i.bahan_id && i.qty && parseFloat(i.qty) > 0);
  
  const stokWarnings = validItems.filter(i => {
    const b = bahan.find(x => x.id === parseInt(i.bahan_id));
    return b && b.stok < parseFloat(i.qty);
  }).map(i => ({ nama: i.nama }));

  // ✅ PERHITUNGAN HPP INCLUDE GAJI
  const hppBahan = validItems.reduce((total, item) => {
    const qtyBahan = parseFloat(item.qty);
    const b = bahan.find(x => x.id === parseInt(item.bahan_id));
    return total + (qtyBahan * (b?.harga_beli_avg || 0));
  }, 0);

  const gajiOp = toAngka(gajiOperator);
  const totalHPP = hppBahan + gajiOp;
  const qtyProd = parseFloat(qtyProduksi) || 1;
  const hppPerUnit = totalHPP / qtyProd;

  // ✅ SIMPAN PRODUKSI DENGAN GAJI
  const simpanProduksi = async () => {
    if (!stokBarangId) return showToast("Pilih produk yang akan diproduksi!", "error");
    if (!qtyProduksi || parseFloat(qtyProduksi) <= 0) return showToast("Isi qty produksi!", "error");
    const validItems = bahanPakai.filter(i => i.bahan_id && i.qty && parseFloat(i.qty) > 0);
    if (validItems.length === 0) return showToast("Minimal 1 bahan harus diisi!", "error");
    if (stokWarnings.length > 0) return showToast(`Stok tidak cukup: ${stokWarnings.map(i => i.nama).join(", ")}`, "error");

    const qty = parseFloat(qtyProduksi);
    const gajiOpBulat = Math.round(gajiOp);
    const hppUnit = Math.round(hppPerUnit);
    const totalHppBulat = Math.round(totalHPP);

    setSubmitting(true);
    try {
      const timestampWIB = new Date().toISOString().replace('Z', '+07:00');
      
      // 1. Insert header batch produksi
      const { data: batchData, error: errBatch } = await supabase
        .from("produksi_batch")
        .insert([{
          stok_barang_id: parseInt(stokBarangId),
          nama_produk: produkTerpilih?.nama_produk || "",
          qty_produksi: qty,
          total_hpp: totalHppBulat,
          hpp_per_unit: hppUnit,
          gaji_operator: gajiOpBulat, // ✅ BARU!
          catatan: catatan.trim() || null,
          operator: operator.trim() || null,
          created_at: timestampWIB,
        }])
        .select()
        .single();
      
      if (errBatch) throw new Error("Gagal simpan batch: " + errBatch.message);

      // 2. Insert detail bahan + kurangi stok bahan
      for (const item of validItems) {
        const qtyBahan = parseFloat(item.qty);
        const bahanId = parseInt(item.bahan_id);
        const b = bahan.find(x => x.id === bahanId);

        const { error: errDetail } = await supabase
          .from("detail_produksi_bahan")
          .insert([{
            produksi_batch_id: batchData.id,
            bahan_baku_id: bahanId,
            qty_pakai: qtyBahan,
            hpp_bahan: Math.round(qtyBahan * (b?.harga_beli_avg || 0)),
          }]);
        
        if (errDetail) throw new Error("Gagal simpan detail: " + errDetail.message);

        // Kurangi stok bahan baku
        const stokBaru = Math.max(0, (b?.stok || 0) - qtyBahan);
        await supabase
          .from("bahan_baku")
          .update({
            stok: stokBaru,
            total_nilai_stok: Math.round(stokBaru * (b?.harga_beli_avg || 0)),
          })
          .eq("id", bahanId);
      }

      // 3. Tambah stok produk jadi + update HPP weighted average
      const produkSekarang = stokBarang.find(s => s.id === parseInt(stokBarangId));
      const stokLama = produkSekarang?.jumlah_stok || 0;
      const stokBaru = stokLama + qty;

      // HPP weighted average dari riwayat produksi
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
          hpp_per_unit: hppBaru,
        })
        .eq("id", parseInt(stokBarangId));
      
      if (errStokBarang) throw new Error("Gagal update stok produk: " + errStokBarang.message);

      // 4. Catat mutasi stok produk jadi
      await supabase.from("mutasi_stok").insert([{
        stok_barang_id: parseInt(stokBarangId),
        tipe: "Masuk",
        qty,
        keterangan: `Produksi batch #${batchData.id} · HPP ${rupiahFmt(hppUnit)}/pcs${gajiOpBulat > 0 ? ` (incl. gaji ${rupiahFmt(gajiOpBulat)})` : ""}`,
        created_at: timestampWIB,
      }]);

      showToast(
        `✓ Produksi ${produkTerpilih?.nama_produk} (${qty} pcs) berhasil!\n` +
        `HPP: ${rupiahFmt(hppUnit)}/pcs · Stok: ${stokBaru} pcs`
      );

      // Reset form
      setStokBarangId(""); 
      setQtyProduksi(""); 
      setOperator(""); 
      setGajiOperator(""); // ✅ Reset gaji
      setCatatan("");
      setBahanPakai([{ bahan_id: "", nama: "", qty: "", satuan: "", stok_tersedia: 0 }]);
      fetchData();
      setActiveTab("riwayat");
    } catch (err: any) {
      showToast(err.message || "Gagal simpan", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Expand detail batch
  const toggleDetail = async (id: number) => {
    if (expandedId === id) { 
      setExpandedId(null); 
      return; 
    }
    setExpandedId(id);
    if (detailCache[id]) return;
    
    const { data } = await supabase
      .from("detail_produksi_bahan")
      .select("*, bahan_baku(nama, satuan)")
      .eq("produksi_batch_id", id);
    
    setDetailCache(prev => ({ ...prev, [id]: data || [] }));
  };

  // Filter & paginate riwayat
  const riwayatFiltered = useMemo(() => {
    let data = [...riwayat];
    if (filterNama.trim()) {
      data = data.filter(r => r.nama_produk.toLowerCase().includes(filterNama.toLowerCase()));
    }
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
    width: "100%", 
    padding: "9px 12px",
    background: "#0f0b1a", 
    border: `1.5px solid ${C.border}`, 
    borderRadius: "8px",
    color: C.text, 
    fontFamily: C.fontSans, 
    fontSize: "13px",
    boxSizing: "border-box", 
    outline: "none",
  };

  const tabBtn = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, 
    padding: "10px 8px", 
    borderRadius: "8px",
    border: `1px solid ${active ? color + "60" : C.border}`,
    background: active ? color + "20" : "transparent",
    color: active ? color : C.muted,
    fontWeight: 600, 
    cursor: "pointer", 
    fontSize: "13px",
    fontFamily: C.fontSans, 
    transition: "all 0.15s",
  });

  if (loading) {
    return (
      <Sidebar>
        <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>◈</div>
            Memuat data produksi...
          </div>
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: #a78bfa80 !important; outline: none; }
        input::placeholder, textarea::placeholder { color: #3d3050 !important; }
        select option { background: #1a1020; color: #e2d9f3; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a1f3d; border-radius: 2px; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 9999,
          background: "#1a1020",
          border: `1px solid ${toast.type === "success" ? C.success : toast.type === "error" ? C.danger : C.blue}44`,
          color: toast.type === "success" ? C.success : toast.type === "error" ? C.danger : C.blue,
          padding: "14px 18px", borderRadius: "10px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", gap: 10,
          fontFamily: C.fontMono, fontWeight: 600, fontSize: 13,
          maxWidth: 380,
        }}>
          <span style={{ flex: 1, whiteSpace: "pre-line" }}>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{
            background: "none", border: "none", color: "inherit",
            cursor: "pointer", fontSize: 16, opacity: 0.6,
          }}>×</button>
        </div>
      )}

      <div style={{ padding: "28px 24px", fontFamily: C.fontSans, background: C.bg, minHeight: "100vh", maxWidth: "1100px", margin: "0 auto" }}>
        
        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: 0, fontFamily: C.fontDisplay, fontSize: "26px", color: "#f0eaff", fontWeight: 400 }}>
            🏭 Produksi Batch
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: C.muted, fontFamily: C.fontMono }}>
            Input batch produksi · HPP otomatis (bahan + gaji) · Stok update real-time
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "24px" }}>
          {[
            { label: "Total Produk", value: `${stokBarang.length} item`, color: C.blue },
            { label: "Bahan Aktif", value: `${bahan.length} item`, color: C.accent },
            { label: "Bulan Ini", value: `${riwayat.filter(r => new Date(r.created_at).getMonth() === new Date().getMonth()).length} batch`, color: C.success },
          ].map((s, i) => (
            <div key={i} style={{ 
              background: C.card, 
              padding: "16px 20px", 
              borderRadius: "14px", 
              borderLeft: `4px solid ${s.color}` 
            }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>
                {s.label}
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#f0eaff", fontFamily: C.fontDisplay }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button onClick={() => setActiveTab("input")} style={tabBtn(activeTab === "input", C.accent)}>
            ⚙️ Input Produksi
          </button>
          <button onClick={() => setActiveTab("riwayat")} style={tabBtn(activeTab === "riwayat", C.blue)}>
            📋 Riwayat Batch
          </button>
        </div>

        {/* TAB: INPUT PRODUKSI */}
        {activeTab === "input" && (
          <div style={{ background: C.card, padding: "24px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
            <h3 style={{ margin: "0 0 20px", fontFamily: C.fontDisplay, fontSize: "18px", color: C.text, fontWeight: 400 }}>
              Input Batch Produksi
            </h3>

            {/* Pilih produk */}
            <div style={{ 
              background: C.accent + "10", 
              border: `1px solid ${C.accent}30`, 
              borderRadius: "10px", 
              padding: "14px 16px", 
              marginBottom: "20px" 
            }}>
              <label style={{ 
                fontSize: "11px", 
                fontWeight: 700, 
                color: C.accent, 
                display: "block", 
                marginBottom: "8px", 
                letterSpacing: "0.08em" 
              }}>
                PRODUK YANG DIPRODUKSI
              </label>
              <select 
                value={stokBarangId} 
                onChange={e => setStokBarangId(e.target.value)} 
                style={{ ...inputS, background: "#0f0b1a" }}
              >
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
                  {qtyProduksi && (
                    <span style={{ color: C.success, marginLeft: "8px" }}>
                      → setelah produksi: <strong>{produkTerpilih.jumlah_stok + parseFloat(qtyProduksi || "0")}</strong> pcs
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Qty, Operator, Gaji, Catatan */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>
                  QTY (pcs)
                </label>
                <input 
                  type="number" 
                  value={qtyProduksi} 
                  onChange={e => setQtyProduksi(e.target.value)} 
                  placeholder="Jumlah produksi" 
                  style={inputS} 
                  min="1" 
                />
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>
                  OPERATOR
                </label>
                <input 
                  type="text" 
                  value={operator} 
                  onChange={e => setOperator(e.target.value)} 
                  placeholder="Nama operator" 
                  style={inputS} 
                />
              </div>
              
              {/* ✅ FIELD GAJI OPERATOR BARU */}
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>
                  GAJI HARIAN
                </label>
                <input 
                  type="text" 
                  value={gajiOperator} 
                  onChange={e => setGajiOperator(formatIDR(e.target.value))} 
                  placeholder="150.000" 
                  style={inputS} 
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>
                  CATATAN
                </label>
                <input 
                  type="text" 
                  value={catatan} 
                  onChange={e => setCatatan(e.target.value)} 
                  placeholder="Opsional" 
                  style={inputS} 
                />
              </div>
            </div>

            {/* Bahan yang dipakai */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>
                  BAHAN YANG DIPAKAI
                  {bahan.length === 0 && (
                    <span style={{ color: C.danger, marginLeft: "8px", fontWeight: 400 }}>
                      ⚠ Belum ada bahan di master
                    </span>
                  )}
                </label>
                <button 
                  onClick={addBahanPakai} 
                  style={{ 
                    background: C.success + "15", 
                    border: `1px solid ${C.success}40`, 
                    color: C.success, 
                    padding: "6px 12px", 
                    borderRadius: "6px", 
                    cursor: "pointer", 
                    fontSize: "12px", 
                    fontWeight: 600 
                  }}
                >
                  + Tambah Bahan
                </button>
              </div>

              {bahanPakai.map((item, idx) => (
                <div key={idx} style={{ 
                  display: "grid", 
                  gridTemplateColumns: "2fr 1fr 1fr 50px", 
                  gap: "10px", 
                  marginBottom: "10px",
                  padding: "12px",
                  background: "#0f0b1a",
                  borderRadius: "8px",
                  border: `1px solid ${C.border}`,
                }}>
                  <select 
                    value={item.bahan_id} 
                    onChange={e => updateBahanPakai(idx, "bahan_id", e.target.value)}
                    style={{ ...inputS, background: C.card }}
                  >
                    <option value="">— Pilih Bahan —</option>
                    {bahan.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.nama} · stok: {b.stok} {b.satuan}
                      </option>
                    ))}
                  </select>
                  
                  <input 
                    type="number" 
                    value={item.qty} 
                    onChange={e => updateBahanPakai(idx, "qty", e.target.value)}
                    placeholder={`Qty (${item.satuan || "satuan"})`}
                    style={inputS}
                    min="0"
                    step="0.01"
                  />
                  
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    fontSize: "12px", 
                    color: C.muted,
                    fontFamily: C.fontMono,
                  }}>
                    {item.bahan_id && item.qty ? (
                      <>
                        Stok: {item.stok_tersedia} {item.satuan}
                        {parseFloat(item.qty) > item.stok_tersedia && (
                          <span style={{ color: C.danger, marginLeft: "6px" }}>⚠</span>
                        )}
                      </>
                    ) : "—"}
                  </div>

                  <button 
                    onClick={() => removeBahanPakai(idx)}
                    disabled={bahanPakai.length === 1}
                    style={{ 
                      background: bahanPakai.length === 1 ? "transparent" : C.danger + "15",
                      border: `1px solid ${bahanPakai.length === 1 ? C.dim : C.danger + "40"}`,
                      color: bahanPakai.length === 1 ? C.dim : C.danger,
                      padding: "8px",
                      borderRadius: "6px",
                      cursor: bahanPakai.length === 1 ? "not-allowed" : "pointer",
                      fontSize: "14px",
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* ✅ PREVIEW HPP (INCLUDE GAJI) */}
            {qtyProduksi && validItems.length > 0 && (
              <div style={{ 
                background: C.accentDim, 
                border: `1px solid ${C.accent}40`, 
                borderRadius: "10px", 
                padding: "16px", 
                marginBottom: "16px" 
              }}>
                <div style={{ fontSize: "12px", color: C.textMid, marginBottom: "10px", fontWeight: 600 }}>
                  📊 Preview HPP Batch Ini:
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <div style={{ fontSize: "10px", color: C.muted, marginBottom: "4px" }}>HPP Bahan</div>
                    <div style={{ fontSize: "14px", color: C.text, fontWeight: 600, fontFamily: C.fontMono }}>
                      {rupiahFmt(Math.round(hppBahan))}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: "10px", color: C.muted, marginBottom: "4px" }}>Gaji Operator</div>
                    <div style={{ fontSize: "14px", color: C.text, fontWeight: 600, fontFamily: C.fontMono }}>
                      {rupiahFmt(gajiOp)}
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ fontSize: "10px", color: C.muted, marginBottom: "4px" }}>Total HPP</div>
                    <div style={{ fontSize: "14px", color: C.text, fontWeight: 600, fontFamily: C.fontMono }}>
                      {rupiahFmt(Math.round(totalHPP))}
                    </div>
                  </div>
                </div>

                <div style={{ 
                  paddingTop: "12px", 
                  borderTop: `1px dashed ${C.accent}40`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div style={{ fontSize: "11px", color: C.muted }}>
                    HPP per Unit ({qtyProduksi} pcs):
                  </div>
                  <div style={{ 
                    fontSize: "18px", 
                    color: C.accent, 
                    fontWeight: 700,
                    fontFamily: C.fontDisplay,
                  }}>
                    {rupiahFmt(Math.round(hppPerUnit))} / pcs
                  </div>
                </div>

                {gajiOp > 0 && (
                  <div style={{ fontSize: "10px", color: C.muted, marginTop: "8px", fontStyle: "italic" }}>
                    ℹ️ HPP ini sudah termasuk gaji operator. Tidak perlu catat ke Kas lagi.
                  </div>
                )}
              </div>
            )}

            {/* Warning stok */}
            {stokWarnings.length > 0 && (
              <div style={{ 
                background: C.danger + "10", 
                border: `1px solid ${C.danger}40`, 
                borderRadius: "10px", 
                padding: "12px 16px", 
                marginBottom: "12px", 
                fontSize: "13px", 
                color: C.danger 
              }}>
                ❌ Stok tidak cukup: <strong>{stokWarnings.map(i => i.nama).join(", ")}</strong>
              </div>
            )}

            {/* Tombol Simpan */}
            <button 
              onClick={simpanProduksi} 
              disabled={submitting || stokWarnings.length > 0} 
              style={{
                width: "100%", 
                padding: "13px", 
                borderRadius: "10px",
                background: (submitting || stokWarnings.length > 0) ? "transparent" : C.accent + "25",
                border: `1px solid ${(submitting || stokWarnings.length > 0) ? C.dim : C.accent + "60"}`,
                color: (submitting || stokWarnings.length > 0) ? C.dim : C.accent,
                fontWeight: 700, 
                cursor: (submitting || stokWarnings.length > 0) ? "not-allowed" : "pointer",
                fontFamily: C.fontSans, 
                fontSize: "15px",
              }}
            >
              {submitting ? "Menyimpan..." : `✓ Simpan Batch Produksi${produkTerpilih ? ` — ${produkTerpilih.nama_produk}` : ""}`}
            </button>
          </div>
        )}

        {/* TAB: RIWAYAT */}
        {activeTab === "riwayat" && (
          <div style={{ background: C.card, padding: "20px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
            <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, color: C.text, fontWeight: 400 }}>
              Riwayat Batch Produksi
            </h3>

            {/* Filter */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              <input 
                type="text" 
                value={filterNama} 
                placeholder="🔍 Cari nama produk..."
                onChange={e => { setFilterNama(e.target.value); setCurrentPage(1); }}
                style={{ ...inputS, flex: 1, padding: "8px 12px" }}
              />
              <button 
                onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
                style={{ 
                  background: C.blue + "15", 
                  border: `1px solid ${C.blue}40`, 
                  color: C.blue, 
                  padding: "8px 16px", 
                  borderRadius: "8px", 
                  cursor: "pointer", 
                  fontSize: "12px", 
                  fontWeight: 600 
                }}
              >
                {sortDir === "desc" ? "↓ Terbaru" : "↑ Terlama"}
              </button>
            </div>

            {/* List */}
            {riwayatPage.length === 0 && (
              <div style={{ 
                textAlign: "center", 
                color: C.muted, 
                padding: 40, 
                fontFamily: C.fontMono, 
                fontSize: 13 
              }}>
                {filterNama ? "Tidak ada hasil pencarian" : "Belum ada riwayat produksi"}
              </div>
            )}

            {riwayatPage.map(r => (
              <div key={r.id} style={{ marginBottom: "10px" }}>
                <div 
                  onClick={() => toggleDetail(r.id)}
                  style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center", 
                    padding: "14px 18px", 
                    background: expandedId === r.id ? C.accentDim : "#0f0b1a",
                    border: `1px solid ${expandedId === r.id ? C.accent + "40" : C.border}`,
                    borderRadius: "10px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "14px", color: C.text, marginBottom: "4px" }}>
                      {r.nama_produk} · {r.qty_produksi} pcs
                    </div>
                    <div style={{ fontSize: "11px", color: C.muted, fontFamily: C.fontMono }}>
                      {tanggalFmt(r.created_at)}
                      {r.operator && ` · ${r.operator}`}
                      {r.gaji_operator > 0 && (
                        <span style={{ color: C.success, marginLeft: "8px" }}>
                          · gaji {rupiahFmt(r.gaji_operator)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: C.accent, fontFamily: C.fontMono }}>
                      {rupiahFmt(r.hpp_per_unit)} / pcs
                    </div>
                    <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>
                      Total HPP: {rupiahFmt(r.total_hpp)}
                    </div>
                  </div>
                </div>

                {/* Detail bahan */}
                {expandedId === r.id && detailCache[r.id] && (
                  <div style={{ 
                    padding: "12px 18px", 
                    background: "#0f0b1a", 
                    borderRadius: "0 0 10px 10px",
                    border: `1px solid ${C.border}`,
                    borderTop: "none",
                  }}>
                    <div style={{ fontSize: "11px", color: C.muted, marginBottom: "8px", fontWeight: 600 }}>
                      Bahan Terpakai:
                    </div>
                    {detailCache[r.id].map((d: any, i: number) => (
                      <div key={i} style={{ 
                        fontSize: "12px", 
                        color: C.textMid, 
                        padding: "4px 0",
                        display: "flex",
                        justifyContent: "space-between",
                      }}>
                        <span>{d.bahan_baku?.nama || "—"}</span>
                        <span style={{ fontFamily: C.fontMono }}>
                          {d.qty_pakai} {d.bahan_baku?.satuan || ""} · {rupiahFmt(d.hpp_bahan)}
                        </span>
                      </div>
                    ))}
                    
                    {r.gaji_operator > 0 && (
                      <div style={{ 
                        fontSize: "12px", 
                        color: C.success, 
                        padding: "4px 0",
                        marginTop: "8px",
                        paddingTop: "8px",
                        borderTop: `1px dashed ${C.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                      }}>
                        <span>Gaji Operator</span>
                        <span style={{ fontFamily: C.fontMono, fontWeight: 600 }}>
                          {rupiahFmt(r.gaji_operator)}
                        </span>
                      </div>
                    )}

                    {r.catatan && (
                      <div style={{ 
                        fontSize: "11px", 
                        color: C.muted, 
                        marginTop: "8px",
                        fontStyle: "italic",
                      }}>
                        📝 {r.catatan}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ 
                display: "flex", 
                justifyContent: "center", 
                gap: "8px", 
                marginTop: "20px" 
              }}>
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{ 
                    padding: "8px 16px", 
                    borderRadius: "8px",
                    background: currentPage === 1 ? "transparent" : C.accent + "15",
                    border: `1px solid ${currentPage === 1 ? C.dim : C.accent + "40"}`,
                    color: currentPage === 1 ? C.dim : C.accent,
                    cursor: currentPage === 1 ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: "12px",
                  }}
                >
                  ← Prev
                </button>
                
                <div style={{ 
                  padding: "8px 16px", 
                  color: C.textMid, 
                  fontSize: "12px",
                  fontFamily: C.fontMono,
                }}>
                  {currentPage} / {totalPages}
                </div>
                
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{ 
                    padding: "8px 16px", 
                    borderRadius: "8px",
                    background: currentPage === totalPages ? "transparent" : C.accent + "15",
                    border: `1px solid ${currentPage === totalPages ? C.dim : C.accent + "40"}`,
                    color: currentPage === totalPages ? C.dim : C.accent,
                    cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: "12px",
                  }}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </Sidebar>
  );
}
