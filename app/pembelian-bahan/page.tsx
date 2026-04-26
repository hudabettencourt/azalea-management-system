"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";

type BahanBaku = { id: number; nama: string; satuan: string; kategori: string; stok: number; harga_beli_avg: number; aktif: boolean | null };
type PembelianBahan = { id: number; tanggal: string; supplier_nama: string; total_bayar: number; metode_bayar: string; status_bayar: string; total_item: number; created_at: string };
type HutangBahan = { id: number; supplier_nama: string; nominal: number; status: string; created_at: string };
type ItemBeli = { bahan_id: string; nama: string; qty: string; harga_beli: string; satuan: string };
type Toast = { msg: string; type: "success" | "error" | "info" };
type EditBahan = { id: number; nama: string; satuan: string; kategori: string } | null;

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

const SATUAN_LIST = ["kg", "liter", "pack", "pcs", "roll", "karung", "lusin", "box", "gram", "ml"];
const KATEGORI_LIST = ["Bahan Baku", "Bahan Penolong", "Packaging"];
const PAGE_SIZE = 10;

export default function PembelianBahanPage() {
  const [bahan, setBahan] = useState<BahanBaku[]>([]);
  const [riwayat, setRiwayat] = useState<PembelianBahan[]>([]);
  const [hutang, setHutang] = useState<HutangBahan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<"beli" | "riwayat" | "hutang" | "master">("beli");

  // Form pembelian
  const [supplierNama, setSupplierNama] = useState("");
  const [metodeBayar, setMetodeBayar] = useState("Tunai");
  const [catatan, setCatatan] = useState("");
  const [items, setItems] = useState<ItemBeli[]>([{ bahan_id: "", nama: "", qty: "", harga_beli: "", satuan: "" }]);

  // Form master bahan baru
  const [namaBaru, setNamaBaru] = useState("");
  const [satuanBaru, setSatuanBaru] = useState("kg");
  const [kategoriBaru, setKategoriBaru] = useState("Bahan Baku");

  // Filter & sort riwayat
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterMetode, setFilterMetode] = useState("Semua");
  const [filterStatus, setFilterStatus] = useState("Semua");
  const [sortField, setSortField] = useState<"created_at" | "total_bayar" | "supplier_nama">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // Filter master
  const [filterKategori, setFilterKategori] = useState("Semua");
  const [searchBahan, setSearchBahan] = useState("");

  // Edit bahan
  const [editBahan, setEditBahan] = useState<EditBahan>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const [resBahan, resRiwayat, resHutang] = await Promise.all([
        supabase.from("bahan_baku").select("*").or("aktif.eq.true,aktif.is.null").order("kategori").order("nama"),
        supabase.from("pembelian_bahan").select("*").order("created_at", { ascending: false }).limit(200),
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

  // ─── Riwayat: filter + sort + paginate ─────────────────────────────────────
  const riwayatFiltered = useMemo(() => {
    let data = [...riwayat];
    if (filterSupplier.trim()) {
      data = data.filter(r => r.supplier_nama.toLowerCase().includes(filterSupplier.toLowerCase()));
    }
    if (filterMetode !== "Semua") data = data.filter(r => r.metode_bayar === filterMetode);
    if (filterStatus !== "Semua") data = data.filter(r => r.status_bayar === filterStatus);
    data.sort((a, b) => {
      let va: any = a[sortField];
      let vb: any = b[sortField];
      if (sortField === "created_at") { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
      if (sortField === "supplier_nama") { return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va); }
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return data;
  }, [riwayat, filterSupplier, filterMetode, filterStatus, sortField, sortDir]);

  const totalPages = Math.ceil(riwayatFiltered.length / PAGE_SIZE);
  const riwayatPage = riwayatFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
    setCurrentPage(1);
  };

  // ─── Master bahan: filter ───────────────────────────────────────────────────
  const kategoriList = Array.from(new Set(bahan.map(b => b.kategori).filter(Boolean)));
  const bahanFiltered = useMemo(() => {
    let data = filterKategori === "Semua" ? bahan : bahan.filter(b => b.kategori === filterKategori);
    if (searchBahan.trim()) data = data.filter(b => b.nama.toLowerCase().includes(searchBahan.toLowerCase()));
    return data;
  }, [bahan, filterKategori, searchBahan]);

  // ─── Form helpers ───────────────────────────────────────────────────────────
  const addItem = () => setItems([...items, { bahan_id: "", nama: "", qty: "", harga_beli: "", satuan: "" }]);
  const removeItem = (idx: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== idx)); };
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

  const totalBayar = Math.round(
  items.reduce((acc, item) => 
    acc + (parseFloat(item.qty || "0") * parseInt(item.harga_beli || "0")), 0
  )
);

  // ─── Simpan pembelian ───────────────────────────────────────────────────────
  const simpanPembelian = async () => {
    if (!supplierNama.trim()) return showToast("Isi nama supplier!", "error");
    const validItems = items.filter(i => i.bahan_id && i.qty && i.harga_beli);
    if (validItems.length === 0) return showToast("Minimal 1 bahan harus diisi!", "error");
    setSubmitting(true);
    try {
      const { data: zakatRows } = await supabase.from("data_zakat").select("saldo_zakat").order("created_at", { ascending: false }).limit(1);
      const saldoZakatLalu = zakatRows?.[0]?.saldo_zakat || 0;
      const zakatBaru = Math.floor(totalBayar * 0.025);

      const { data: pembelianData, error: errPembelian } = await supabase.from("pembelian_bahan").insert([{
        supplier_nama: supplierNama.trim(),
        total_item: validItems.length,
        total_bayar: totalBayar,
        metode_bayar: metodeBayar,
        status_bayar: metodeBayar === "Hutang" ? "Belum Lunas" : "Lunas",
        catatan: catatan.trim() || null,
      }]).select().single();

      if (errPembelian) throw new Error("Gagal simpan: " + errPembelian.message);

      for (const item of validItems) {
        const qty = parseFloat(item.qty);
        const harga = parseInt(item.harga_beli);
        const bahanId = parseInt(item.bahan_id);
        const { error: errDetail } = await supabase.from("detail_pembelian_bahan").insert([{ pembelian_bahan_id: pembelianData.id, bahan_baku_id: bahanId, qty, harga_beli: harga, }]);
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
      fetchData();
      setActiveTab("riwayat");
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
    showToast(`Hutang ke ${nama} lunas!`);
    fetchData();
  };

  const tambahBahan = async () => {
    if (!namaBaru.trim()) return showToast("Isi nama bahan!", "error");
    const { error } = await supabase.from("bahan_baku").insert([{ nama: namaBaru.trim(), satuan: satuanBaru, kategori: kategoriBaru, aktif: true, stok: 0, harga_beli_avg: 0, total_nilai_stok: 0 }]);
    if (error) return showToast("Gagal tambah bahan: " + error.message, "error");
    showToast(`${namaBaru} berhasil ditambahkan!`);
    setNamaBaru("");
    fetchData();
  };

  // ─── Edit bahan ─────────────────────────────────────────────────────────────
  const simpanEditBahan = async () => {
    if (!editBahan) return;
    if (!editBahan.nama.trim()) return showToast("Nama tidak boleh kosong!", "error");
    setEditSubmitting(true);
    const { error } = await supabase.from("bahan_baku").update({ nama: editBahan.nama.trim(), satuan: editBahan.satuan, kategori: editBahan.kategori }).eq("id", editBahan.id);
    setEditSubmitting(false);
    if (error) return showToast("Gagal update: " + error.message, "error");
    showToast("Bahan berhasil diperbarui!");
    setEditBahan(null);
    fetchData();
  };

  const softDeleteBahan = async (id: number) => {
    const { error } = await supabase.from("bahan_baku").update({ aktif: false }).eq("id", id);
    if (error) return showToast("Gagal hapus: " + error.message, "error");
    showToast("Bahan dihapus (soft delete)");
    setConfirmDelete(null);
    fetchData();
  };

  const totalHutang = hutang.reduce((a, b) => a + b.nominal, 0);

  // ─── Styles ─────────────────────────────────────────────────────────────────
  const C = {
    bg: "#100c16", card: "#1a1425", border: "#2a1f3d",
    text: "#e2d9f3", muted: "#7c6d8a", dim: "#5a4f6a",
    accent: "#a78bfa", success: "#34d399", danger: "#f87171", warn: "#fbbf24",
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
    fontWeight: 600, cursor: "pointer", fontSize: "12px",
    fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s",
  });

  const sortIndicator = (field: typeof sortField) => {
    if (sortField !== field) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px", color: C.accent }}>◈</div>
          <div style={{ color: C.muted, fontWeight: 600 }}>Memuat data bahan...</div>
        </div>
      </div>
    </Sidebar>
  );

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: #a78bfa !important; outline: none; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.3; }
        select option { background: #1a1425; color: #e2d9f3; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "24px", right: "24px", zIndex: 9999,
          background: toast.type === "success" ? C.success : toast.type === "error" ? C.danger : "#3b82f6",
          color: "#fff", padding: "14px 20px", borderRadius: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: "14px",
        }}>{toast.msg}</div>
      )}

      {/* Edit Modal */}
      {editBahan && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,8,20,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "28px", width: "400px", maxWidth: "90vw" }}>
            <h3 style={{ margin: "0 0 20px", fontFamily: "'DM Serif Display', serif", color: C.text, fontWeight: 400 }}>Edit Bahan</h3>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>NAMA BAHAN</label>
              <input value={editBahan.nama} onChange={e => setEditBahan({ ...editBahan, nama: e.target.value })} style={inputS} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>SATUAN</label>
                <select value={editBahan.satuan} onChange={e => setEditBahan({ ...editBahan, satuan: e.target.value })} style={inputS}>
                  {SATUAN_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>KATEGORI</label>
                <select value={editBahan.kategori} onChange={e => setEditBahan({ ...editBahan, kategori: e.target.value })} style={inputS}>
                  {KATEGORI_LIST.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setEditBahan(null)} style={{ flex: 1, padding: "10px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Batal</button>
              <button onClick={simpanEditBahan} disabled={editSubmitting} style={{ flex: 2, padding: "10px", background: C.accent + "30", border: `1px solid ${C.accent}60`, borderRadius: "8px", color: C.accent, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}>
                {editSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10,8,20,0.85)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.card, border: `1px solid #f8717140`, borderRadius: "16px", padding: "28px", width: "360px", maxWidth: "90vw", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>🗑</div>
            <h3 style={{ margin: "0 0 8px", color: C.text, fontFamily: "'DM Serif Display', serif", fontWeight: 400 }}>Hapus Bahan?</h3>
            <p style={{ color: C.muted, fontSize: "13px", margin: "0 0 20px" }}>Bahan akan disembunyikan (soft delete). Data historis tetap aman.</p>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "10px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>Batal</button>
              <button onClick={() => softDeleteBahan(confirmDelete)} style={{ flex: 1, padding: "10px", background: "#f8717120", border: "1px solid #f8717140", borderRadius: "8px", color: C.danger, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}>Hapus</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "28px 24px", fontFamily: "'DM Sans', sans-serif", background: C.bg, minHeight: "100vh", maxWidth: "960px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: "26px", color: "#f0eaff", fontWeight: 400 }}>
            🧪 Pembelian Bahan Produksi
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: C.muted, fontFamily: "'DM Mono', monospace" }}>
            Bahan baku, penolong & packaging · Zakat otomatis 2.5%
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "24px" }}>
          {[
            { label: "Total Bahan", value: `${bahan.length} item`, color: "#60a5fa" },
            { label: "Hutang Supplier", value: rupiahFmt(totalHutang), color: C.warn },
            { label: "Total Transaksi", value: `${riwayat.length} pembelian`, color: C.success },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, padding: "16px 20px", borderRadius: "14px", borderLeft: `4px solid ${s.color}` }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>{s.label}</div>
              <div style={{ fontSize: "20px", fontWeight: 700, color: "#f0eaff", fontFamily: "'DM Serif Display', serif" }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button onClick={() => setActiveTab("beli")} style={tabBtn(activeTab === "beli", C.accent)}>🛒 Input Beli</button>
          <button onClick={() => setActiveTab("riwayat")} style={tabBtn(activeTab === "riwayat", "#94a3b8")}>📋 Riwayat</button>
          <button onClick={() => setActiveTab("hutang")} style={tabBtn(activeTab === "hutang", C.warn)}>
            💳 Hutang {hutang.length > 0 && `(${hutang.length})`}
          </button>
          <button onClick={() => setActiveTab("master")} style={tabBtn(activeTab === "master", "#60a5fa")}>📦 Master Bahan</button>
        </div>

        {/* ─── TAB: INPUT BELI ─── */}
        {activeTab === "beli" && (
          <div style={{ background: C.card, padding: "24px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
            <h3 style={{ margin: "0 0 20px", fontFamily: "'DM Serif Display', serif", fontSize: "18px", color: C.text, fontWeight: 400 }}>Input Pembelian Bahan</h3>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>SUPPLIER / TOKO</label>
                <input type="text" value={supplierNama} onChange={e => setSupplierNama(e.target.value)} placeholder="Nama supplier/toko" style={inputS} />
              </div>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>METODE BAYAR</label>
                <select value={metodeBayar} onChange={e => setMetodeBayar(e.target.value)} style={inputS}>
                  <option value="Tunai">💵 Tunai</option>
                  <option value="Transfer">🏦 Transfer</option>
                  <option value="Hutang">📝 Hutang</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>CATATAN</label>
              <input type="text" value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Opsional" style={inputS} />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>
                  BAHAN YANG DIBELI
                  {bahan.length === 0 && <span style={{ color: C.danger, marginLeft: "8px", fontWeight: 400 }}>⚠ Tambah bahan di tab Master dulu</span>}
                </label>
                <button onClick={addItem} style={{ background: C.success + "15", border: `1px solid ${C.success}40`, color: C.success, padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>+ Tambah Bahan</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 140px 30px", gap: "8px", marginBottom: "6px" }}>
                {["BAHAN", "QTY", "SATUAN", "HARGA BELI", ""].map((h, i) => (
                  <div key={i} style={{ fontSize: "10px", fontWeight: 700, color: C.dim, letterSpacing: "0.08em" }}>{h}</div>
                ))}
              </div>

              {items.map((item, idx) => (
                <div key={idx} style={{ marginBottom: "8px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 140px 30px", gap: "8px", alignItems: "center" }}>
                    <select value={item.bahan_id} onChange={e => updateItem(idx, "bahan_id", e.target.value)} style={inputS}>
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
                    <input type="number" value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} placeholder="0" style={inputS} min="0" step="0.1" />
                    <div style={{ padding: "9px 0", textAlign: "center", fontSize: "13px", color: C.muted }}>{item.satuan || "—"}</div>
                    <input type="number" value={item.harga_beli} onChange={e => updateItem(idx, "harga_beli", e.target.value)} placeholder="Harga/satuan" style={inputS} min="0" />
                    <button onClick={() => removeItem(idx)} style={{ background: C.danger + "15", border: `1px solid ${C.danger}30`, color: C.danger, width: "30px", height: "38px", borderRadius: "6px", cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                  {item.qty && item.harga_beli && (
                    <div style={{ fontSize: "11px", color: C.accent, marginTop: "2px", paddingLeft: "4px", fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                      Subtotal: {rupiahFmt(parseFloat(item.qty) * parseInt(item.harga_beli))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{ background: "#0f0b1a", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "14px 16px", marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontWeight: 700, color: C.muted }}>TOTAL BAYAR</span>
                <span style={{ fontWeight: 800, fontSize: "20px", color: "#f0eaff", fontFamily: "'DM Serif Display', serif" }}>{rupiahFmt(totalBayar)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: C.success, fontWeight: 600 }}>🌙 Zakat Tijarah (2.5%)</span>
                <span style={{ fontSize: "12px", color: C.success, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>+{rupiahFmt(Math.floor(totalBayar * 0.025))}</span>
              </div>
            </div>

            {metodeBayar === "Hutang" && (
              <div style={{ background: C.warn + "10", border: `1px solid ${C.warn}40`, borderRadius: "10px", padding: "12px 16px", marginBottom: "12px", fontSize: "13px", color: C.warn }}>
                ⚠️ Akan dicatat sebagai <strong>hutang ke supplier</strong> sebesar {rupiahFmt(totalBayar)}
              </div>
            )}

            <button onClick={simpanPembelian} disabled={submitting} style={{
              width: "100%", padding: "13px", borderRadius: "10px",
              background: submitting ? C.dim : C.accent + "25",
              border: `1px solid ${submitting ? C.dim : C.accent + "60"}`,
              color: submitting ? C.dim : C.accent,
              fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: "'DM Sans', sans-serif", fontSize: "15px",
            }}>
              {submitting ? "Menyimpan..." : "✓ Simpan Pembelian Bahan"}
            </button>
          </div>
        )}

        {/* ─── TAB: RIWAYAT ─── */}
        {activeTab === "riwayat" && (
          <div style={{ background: C.card, padding: "20px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
            <h3 style={{ margin: "0 0 16px", fontFamily: "'DM Serif Display', serif", color: C.text, fontWeight: 400 }}>Riwayat Pembelian Bahan</h3>

            {/* Filter bar */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "10px", marginBottom: "16px" }}>
              <input
                type="text" value={filterSupplier} placeholder="🔍 Cari supplier..."
                onChange={e => { setFilterSupplier(e.target.value); setCurrentPage(1); }}
                style={{ ...inputS, padding: "8px 12px" }}
              />
              <select value={filterMetode} onChange={e => { setFilterMetode(e.target.value); setCurrentPage(1); }} style={{ ...inputS, width: "120px" }}>
                <option value="Semua">Semua Metode</option>
                <option value="Tunai">Tunai</option>
                <option value="Transfer">Transfer</option>
                <option value="Hutang">Hutang</option>
              </select>
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }} style={{ ...inputS, width: "130px" }}>
                <option value="Semua">Semua Status</option>
                <option value="Lunas">Lunas</option>
                <option value="Belum Lunas">Belum Lunas</option>
              </select>
            </div>

            {/* Sort header */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "8px", marginBottom: "8px", paddingBottom: "8px", borderBottom: `1px solid ${C.border}` }}>
              {[
                { label: "Supplier", field: "supplier_nama" as const },
                { label: "Tanggal", field: "created_at" as const },
                { label: "Total", field: "total_bayar" as const },
                { label: "Status", field: null },
              ].map(col => (
                <button key={col.label} onClick={() => col.field && handleSort(col.field)} style={{
                  background: "none", border: "none", color: col.field ? C.muted : C.dim,
                  fontSize: "11px", fontWeight: 700, textAlign: "left", cursor: col.field ? "pointer" : "default",
                  padding: 0, letterSpacing: "0.08em", fontFamily: "'DM Sans', sans-serif",
                }}>
                  {col.label.toUpperCase()}{col.field && sortIndicator(col.field)}
                </button>
              ))}
            </div>

            {riwayatFiltered.length === 0 && (
              <div style={{ textAlign: "center", color: C.dim, padding: "32px", fontSize: "14px" }}>
                Tidak ada data yang cocok dengan filter
              </div>
            )}

            {riwayatPage.map(r => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "8px", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}20` }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "14px", color: C.text }}>{r.supplier_nama}</div>
                  <div style={{ fontSize: "11px", color: C.dim, fontFamily: "'DM Mono', monospace" }}>{r.total_item} bahan · {r.metode_bayar}</div>
                </div>
                <div style={{ fontSize: "12px", color: C.muted, fontFamily: "'DM Mono', monospace" }}>{tanggalFmt(r.created_at)}</div>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#f0eaff", fontFamily: "'DM Mono', monospace" }}>{rupiahFmt(r.total_bayar)}</div>
                <div>
                  <span style={{
                    padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                    background: r.status_bayar === "Lunas" ? C.success + "20" : C.warn + "20",
                    color: r.status_bayar === "Lunas" ? C.success : C.warn,
                  }}>{r.status_bayar}</span>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px", paddingTop: "12px", borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: "12px", color: C.muted }}>
                  {riwayatFiltered.length} hasil · hal {currentPage}/{totalPages}
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

        {/* ─── TAB: HUTANG ─── */}
        {activeTab === "hutang" && (
          <div style={{ background: C.card, padding: "20px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
            <h3 style={{ margin: "0 0 16px", fontFamily: "'DM Serif Display', serif", color: C.text, fontWeight: 400 }}>Hutang ke Supplier Bahan</h3>
            {hutang.length === 0 && <div style={{ textAlign: "center", color: C.success, padding: "32px", fontSize: "14px" }}>Tidak ada hutang supplier 🎉</div>}
            {hutang.map(h => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}20` }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: C.text }}>{h.supplier_nama}</div>
                  <div style={{ fontSize: "12px", color: C.dim, fontFamily: "'DM Mono', monospace" }}>{tanggalFmt(h.created_at)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ fontWeight: 700, fontSize: "15px", color: C.warn, fontFamily: "'DM Mono', monospace" }}>{rupiahFmt(h.nominal)}</div>
                  <button onClick={() => lunaskanHutang(h.id, h.nominal, h.supplier_nama)} style={{ background: C.success + "20", border: `1px solid ${C.success}40`, color: C.success, padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>
                    ✓ Lunas
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── TAB: MASTER BAHAN ─── */}
        {activeTab === "master" && (
          <div>
            {/* Form tambah */}
            <div style={{ background: C.card, padding: "20px", borderRadius: "14px", border: `1px solid ${C.border}`, marginBottom: "16px" }}>
              <h3 style={{ margin: "0 0 16px", fontFamily: "'DM Serif Display', serif", fontSize: "16px", color: C.text, fontWeight: 400 }}>+ Tambah Bahan Baru</h3>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: "10px", alignItems: "end" }}>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>NAMA BAHAN</label>
                  <input type="text" value={namaBaru} onChange={e => setNamaBaru(e.target.value)} onKeyDown={e => e.key === "Enter" && tambahBahan()} placeholder="Nama bahan baru" style={inputS} />
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>SATUAN</label>
                  <select value={satuanBaru} onChange={e => setSatuanBaru(e.target.value)} style={inputS}>
                    {SATUAN_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "11px", fontWeight: 700, color: C.muted, display: "block", marginBottom: "6px", letterSpacing: "0.08em" }}>KATEGORI</label>
                  <select value={kategoriBaru} onChange={e => setKategoriBaru(e.target.value)} style={inputS}>
                    {KATEGORI_LIST.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <button onClick={tambahBahan} style={{ padding: "9px 16px", background: "#60a5fa20", border: "1px solid #60a5fa40", color: "#60a5fa", borderRadius: "8px", cursor: "pointer", fontWeight: 700, fontSize: "13px", fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}>
                  + Tambah
                </button>
              </div>
            </div>

            {/* List bahan */}
            <div style={{ background: C.card, padding: "20px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <h3 style={{ margin: 0, fontFamily: "'DM Serif Display', serif", fontSize: "16px", color: C.text, fontWeight: 400 }}>Daftar Bahan ({bahan.length})</h3>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <input type="text" value={searchBahan} onChange={e => setSearchBahan(e.target.value)} placeholder="🔍 Cari nama..." style={{ ...inputS, width: "140px", padding: "6px 10px" }} />
                  {["Semua", ...kategoriList].map(k => (
                    <button key={k} onClick={() => setFilterKategori(k)} style={{
                      padding: "5px 10px", borderRadius: "6px", border: `1px solid ${filterKategori === k ? C.accent + "60" : C.border}`,
                      background: filterKategori === k ? C.accent + "20" : "transparent",
                      color: filterKategori === k ? C.accent : C.muted,
                      fontSize: "11px", fontWeight: 700, cursor: "pointer",
                    }}>{k}</button>
                  ))}
                </div>
              </div>

              {bahanFiltered.length === 0 && (
                <div style={{ textAlign: "center", color: C.dim, padding: "32px", fontSize: "14px" }}>
                  {searchBahan ? "Tidak ditemukan." : "Belum ada bahan. Tambahkan di atas!"}
                </div>
              )}

              {bahanFiltered.map(b => {
                const catColor = b.kategori === "Bahan Baku" ? "#60a5fa" : b.kategori === "Bahan Penolong" ? C.warn : C.accent;
                return (
                  <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}20` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ background: catColor + "20", color: catColor, padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 700 }}>
                        {b.kategori}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "14px", color: C.text }}>{b.nama}</div>
                        <div style={{ fontSize: "11px", color: C.dim, fontFamily: "'DM Mono', monospace" }}>
                          HPP: {rupiahFmt(b.harga_beli_avg)}/{b.satuan}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, fontSize: "15px", color: b.stok <= 0 ? C.danger : "#f0eaff", fontFamily: "'DM Mono', monospace" }}>
                          {b.stok} {b.satuan}
                        </div>
                        {b.stok <= 0 && <div style={{ fontSize: "10px", color: C.danger, fontWeight: 700 }}>⚠ Habis</div>}
                      </div>
                      <button onClick={() => setEditBahan({ id: b.id, nama: b.nama, satuan: b.satuan, kategori: b.kategori })}
                        style={{ background: C.accent + "15", border: `1px solid ${C.accent}30`, color: C.accent, padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}>
                        Edit
                      </button>
                      <button onClick={() => setConfirmDelete(b.id)}
                        style={{ background: C.danger + "15", border: `1px solid ${C.danger}30`, color: C.danger, padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "11px", fontWeight: 700 }}>
                        Hapus
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
