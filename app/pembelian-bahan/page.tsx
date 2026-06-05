"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type BahanBaku = { id: number; nama: string; satuan: string; kategori: string; stok: number; harga_beli_avg: number; aktif: boolean | null; updated_at: string | null };
type PembelianBahan = { id: number; tanggal: string; supplier_nama: string; total_bayar: number; metode_bayar: string; status_bayar: string; total_item: number; catatan: string | null; created_at: string };
type HutangBahan = { id: number; supplier_nama: string; nominal: number; status: string; created_at: string };
type DetailPembelian = { id: number; bahan_baku_id: number; qty: number; harga_beli: number; bahan_baku?: { nama: string; satuan: string } };
type ItemBeli = { bahan_id: string; nama: string; qty: string; harga_beli: string; satuan: string };
type Toast = { msg: string; type: "success" | "error" | "info" };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const rupiahShort = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${sign}Rp ${(abs / 1_000).toFixed(0)}rb`;
  return rupiahFmt(abs);
};
const tanggalFmt = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const tanggalFull = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

const SATUAN_LIST = ["kg", "liter", "pack", "pcs", "roll", "karung", "lusin", "box", "gram", "ml"];
const PAGE_SIZE = 10;

// Warna pastel per metode/status
const METODE_COLOR: Record<string, string> = { Tunai: "#22c55e", Transfer: "#3b82f6", Hutang: "#f59e0b" };
const STATUS_COLOR: Record<string, string> = { Lunas: "#22c55e", "Belum Lunas": "#f59e0b" };

export default function PembelianBahanPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [bahan, setBahan] = useState<BahanBaku[]>([]);
  const [riwayat, setRiwayat] = useState<PembelianBahan[]>([]);
  const [hutang, setHutang] = useState<HutangBahan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<"beli" | "riwayat" | "hutang" | "stok">("beli");

  // Detail modal
  const [detailModal, setDetailModal] = useState<PembelianBahan | null>(null);
  const [detailItems, setDetailItems] = useState<DetailPembelian[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Form
  const [supplierNama, setSupplierNama] = useState("");
  const [metodeBayar, setMetodeBayar] = useState("Tunai");
  const [catatan, setCatatan] = useState("");
  const [items, setItems] = useState<ItemBeli[]>([{ bahan_id: "", nama: "", qty: "", harga_beli: "", satuan: "" }]);

  // Filter riwayat
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterMetode, setFilterMetode] = useState("Semua");
  const [filterStatus, setFilterStatus] = useState("Semua");
  const [sortField, setSortField] = useState<"created_at" | "total_bayar" | "supplier_nama">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);

  // Filter stok
  const [filterKategoriStok, setFilterKategoriStok] = useState("Semua");
  const [searchStok, setSearchStok] = useState("");

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

  // Buka detail modal
  const openDetail = async (r: PembelianBahan) => {
    setDetailModal(r);
    setLoadingDetail(true);
    try {
      const { data } = await supabase
        .from("detail_pembelian_bahan")
        .select("*, bahan_baku(nama, satuan)")
        .eq("pembelian_bahan_id", r.id);
      setDetailItems(data || []);
    } catch {
      setDetailItems([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Stats
  const now = new Date();
  const bulanMulai = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const riwayatBulanIni = riwayat.filter(r => r.created_at >= bulanMulai);
  const totalBelanjabulan = riwayatBulanIni.reduce((a, r) => a + r.total_bayar, 0);
  const totalHutang = hutang.reduce((a, b) => a + b.nominal, 0);
  const avgTransaksi = riwayat.length > 0 ? riwayat.reduce((a, r) => a + r.total_bayar, 0) / riwayat.length : 0;
  const stokKritis = bahan.filter(b => b.stok <= 0).length;

  // Filter riwayat
  const riwayatFiltered = useMemo(() => {
    let data = [...riwayat];
    if (filterSupplier.trim()) data = data.filter(r => r.supplier_nama.toLowerCase().includes(filterSupplier.toLowerCase()));
    if (filterMetode !== "Semua") data = data.filter(r => r.metode_bayar === filterMetode);
    if (filterStatus !== "Semua") data = data.filter(r => r.status_bayar === filterStatus);
    data.sort((a, b) => {
      let va: any = a[sortField], vb: any = b[sortField];
      if (sortField === "created_at") { va = new Date(va).getTime(); vb = new Date(vb).getTime(); }
      if (sortField === "supplier_nama") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
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

  // Filter stok
  const kategoriList = Array.from(new Set(bahan.map(b => b.kategori).filter(Boolean)));
  const bahanFiltered = useMemo(() => {
    let data = filterKategoriStok === "Semua" ? bahan : bahan.filter(b => b.kategori === filterKategoriStok);
    if (searchStok.trim()) data = data.filter(b => b.nama.toLowerCase().includes(searchStok.toLowerCase()));
    return data;
  }, [bahan, filterKategoriStok, searchStok]);

  // Form helpers
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

  const totalBayar = Math.round(items.reduce((acc, item) => acc + (parseFloat(item.qty || "0") * parseInt(item.harga_beli || "0")), 0));

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
        supplier_nama: supplierNama.trim(), total_item: validItems.length, total_bayar: totalBayar,
        metode_bayar: metodeBayar, status_bayar: metodeBayar === "Hutang" ? "Belum Lunas" : "Lunas",
        catatan: catatan.trim() || null,
      }]).select().single();
      if (errPembelian) throw new Error("Gagal simpan: " + errPembelian.message);
      const now2 = new Date().toISOString();
      for (const item of validItems) {
        const qty = parseFloat(item.qty), harga = parseInt(item.harga_beli), bahanId = parseInt(item.bahan_id);
        await supabase.from("detail_pembelian_bahan").insert([{ pembelian_bahan_id: pembelianData.id, bahan_baku_id: bahanId, qty, harga_beli: harga }]);
        const { error: errRpc } = await supabase.rpc("update_hpp_bahan", { p_bahan_id: bahanId, p_qty: qty, p_harga_beli: harga });
        if (errRpc) {
          const bahanData = bahan.find(b => b.id === bahanId);
          if (bahanData) {
            const stokBaru = (bahanData.stok || 0) + qty;
            const hppBaru = stokBaru > 0 ? Math.round(((bahanData.stok || 0) * (bahanData.harga_beli_avg || 0) + qty * harga) / stokBaru) : harga;
            await supabase.from("bahan_baku").update({ stok: stokBaru, harga_beli_avg: hppBaru, updated_at: now2 }).eq("id", bahanId);
          }
        } else {
          await supabase.from("bahan_baku").update({ updated_at: now2 }).eq("id", bahanId);
        }
      }
      if (metodeBayar !== "Hutang") await supabase.from("kas").insert([{ tipe: "Keluar", kategori: "Beli Bahan", nominal: totalBayar, keterangan: `Beli bahan dari ${supplierNama} (${validItems.length} item)` }]);
      if (metodeBayar === "Hutang") await supabase.from("hutang_supplier_bahan").insert([{ pembelian_bahan_id: pembelianData.id, supplier_nama: supplierNama.trim(), nominal: totalBayar, status: "Belum Lunas" }]);
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

  // Styles
  const inputS: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: isDark ? "rgba(255,255,255,0.05)" : "#f8fffe",
    border: `1.5px solid ${C.border}`, borderRadius: 10,
    color: C.text, fontFamily: C.fontSans, fontSize: 13,
    boxSizing: "border-box", outline: "none", transition: "border-color 0.15s",
  };

  const tabStyle = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, padding: "10px 8px", borderRadius: 10,
    border: `1.5px solid ${active ? color + "60" : C.border}`,
    background: active ? color + "15" : "transparent",
    color: active ? color : C.muted,
    fontWeight: 700, cursor: "pointer", fontSize: 13,
    fontFamily: C.fontSans, transition: "all 0.15s",
  });

  const statCardColors = [
    { bg: isDark ? "rgba(45,212,191,0.1)" : "#ccfbf1", color: "#0f9e8a", border: isDark ? "rgba(45,212,191,0.2)" : "#99f6e4" },
    { bg: isDark ? "rgba(251,191,36,0.1)" : "#fef9c3", color: "#f59e0b", border: isDark ? "rgba(251,191,36,0.2)" : "#fde68a" },
    { bg: isDark ? "rgba(59,130,246,0.1)" : "#dbeafe", color: "#3b82f6", border: isDark ? "rgba(59,130,246,0.2)" : "#bfdbfe" },
    { bg: isDark ? "rgba(239,68,68,0.1)" : "#fee2e2", color: "#ef4444", border: isDark ? "rgba(239,68,68,0.2)" : "#fecaca" },
  ];

  if (loading) return (
    <AppShell>
      <div style={{ minHeight: "100vh", background: C.bgPage, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.fontSans }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12, color: statCardColors[0].color }}>◈</div>
          <div style={{ color: C.muted, fontWeight: 600 }}>Memuat data bahan...</div>
        </div>
      </div>
    </AppShell>
  );

  return (
    <AppShell>
      <style>{`
        input:focus, select:focus, textarea:focus { border-color: ${statCardColors[0].color} !important; outline: none; }
        select option { background: ${isDark ? "#172218" : "#fff"}; color: ${C.text}; }
        .row-hover:hover { background: ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)"} !important; cursor: pointer; }
        .btn-hover:hover { filter: brightness(1.08); transform: translateY(-1px); }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 9999,
          background: toast.type === "success" ? "#22c55e" : toast.type === "error" ? "#ef4444" : "#3b82f6",
          color: "#fff", padding: "12px 20px", borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          fontFamily: C.fontSans, fontWeight: 700, fontSize: 14,
        }}>{toast.msg}</div>
      )}

      {/* Detail Modal */}
      {detailModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setDetailModal(null)}>
          <div style={{ background: C.card, borderRadius: 20, padding: 28, width: "100%", maxWidth: 560, boxShadow: "0 24px 64px rgba(0,0,0,0.3)", border: `1px solid ${C.border}` }}
            onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900, color: C.text, fontFamily: C.fontSans }}>
                  {detailModal.supplier_nama}
                </div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, marginTop: 3 }}>
                  {tanggalFull(detailModal.created_at)}
                </div>
              </div>
              <button onClick={() => setDetailModal(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, lineHeight: 1 }}>×</button>
            </div>

            {/* Badges */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: (METODE_COLOR[detailModal.metode_bayar] || C.accent) + "20", color: METODE_COLOR[detailModal.metode_bayar] || C.accent }}>
                {detailModal.metode_bayar}
              </span>
              <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: (STATUS_COLOR[detailModal.status_bayar] || C.muted) + "20", color: STATUS_COLOR[detailModal.status_bayar] || C.muted }}>
                {detailModal.status_bayar}
              </span>
              <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, background: statCardColors[2].bg, color: statCardColors[2].color }}>
                {detailModal.total_item} bahan
              </span>
            </div>

            {/* Items */}
            <div style={{ background: isDark ? "rgba(255,255,255,0.03)" : "#f8fffe", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12, fontFamily: C.fontMono }}>
                Detail Bahan
              </div>
              {loadingDetail ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: C.muted, fontSize: 13 }}>Memuat detail...</div>
              ) : detailItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px 0", color: C.muted, fontSize: 13 }}>Tidak ada detail</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                    {["BAHAN", "QTY", "HARGA/SAT", "SUBTOTAL"].map(h => (
                      <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.06em" }}>{h}</div>
                    ))}
                  </div>
                  {detailItems.map((d, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{d.bahan_baku?.nama || `Bahan #${d.bahan_baku_id}`}</div>
                      <div style={{ fontSize: 13, color: C.textMid, fontFamily: C.fontMono }}>{d.qty} {d.bahan_baku?.satuan}</div>
                      <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{rupiahShort(d.harga_beli)}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: statCardColors[0].color, fontFamily: C.fontMono }}>{rupiahShort(d.qty * d.harga_beli)}</div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Total */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: statCardColors[0].bg, borderRadius: 12, border: `1px solid ${statCardColors[0].border}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: statCardColors[0].color }}>TOTAL BAYAR</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: statCardColors[0].color, fontFamily: C.fontSans }}>{rupiahFmt(detailModal.total_bayar)}</span>
            </div>

            {detailModal.catatan && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: isDark ? "rgba(255,255,255,0.04)" : "#f8fffe", borderRadius: 10, fontSize: 13, color: C.muted, fontStyle: "italic" }}>
                📝 {detailModal.catatan}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: "24px", fontFamily: C.fontSans, background: C.bgPage, minHeight: "100vh" }}>

        {/* Stats Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total Bahan Aktif", value: `${bahan.length} item`, sub: `${stokKritis} habis stok`, icon: "🧪", tab: "stok" as const, hint: "Lihat stok →", ...statCardColors[0] },
            { label: "Hutang Supplier", value: rupiahShort(totalHutang), sub: `${hutang.length} supplier`, icon: "⚠️", tab: "hutang" as const, hint: "Lihat hutang →", ...statCardColors[1] },
            { label: "Belanja Bulan Ini", value: rupiahShort(totalBelanjabulan), sub: `${riwayatBulanIni.length} transaksi`, icon: "🛒", tab: "riwayat" as const, hint: "Lihat riwayat →", ...statCardColors[2] },
            { label: "Rata-rata Transaksi", value: rupiahShort(avgTransaksi), sub: `${riwayat.length} total`, icon: "📊", tab: "riwayat" as const, hint: "Lihat semua →", ...statCardColors[3] },
          ].map((s, i) => (
            <div key={i} onClick={() => setActiveTab(s.tab)}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
              style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 14, padding: "16px 18px", position: "relative", overflow: "hidden", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: s.color, borderRadius: "14px 14px 0 0" }} />
              <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 10, marginTop: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: s.color, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 3 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{s.sub}</div>
              <div style={{ fontSize: 11, color: s.color, fontWeight: 800 }}>{s.hint}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button onClick={() => setActiveTab("beli")} style={tabStyle(activeTab === "beli", statCardColors[0].color)}>🛒 Input Beli</button>
          <button onClick={() => setActiveTab("riwayat")} style={tabStyle(activeTab === "riwayat", statCardColors[2].color)}>📋 Riwayat ({riwayat.length})</button>
          <button onClick={() => setActiveTab("hutang")} style={tabStyle(activeTab === "hutang", statCardColors[1].color)}>💳 Hutang {hutang.length > 0 ? `(${hutang.length})` : ""}</button>
          <button onClick={() => setActiveTab("stok")} style={tabStyle(activeTab === "stok", statCardColors[3].color)}>📦 Stok Bahan</button>
        </div>

        {/* ── TAB BELI ── */}
        {activeTab === "beli" && (
          <div style={{ background: C.card, padding: 24, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 20 }}>Input Pembelian Bahan</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Supplier / Toko</label>
                <input type="text" value={supplierNama} onChange={e => setSupplierNama(e.target.value)} placeholder="Nama supplier/toko" style={inputS} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Metode Bayar</label>
                <select value={metodeBayar} onChange={e => setMetodeBayar(e.target.value)} style={inputS}>
                  <option value="Tunai">💵 Tunai</option>
                  <option value="Transfer">🏦 Transfer</option>
                  <option value="Hutang">📝 Hutang</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, display: "block", marginBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>Catatan</label>
              <input type="text" value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Opsional" style={inputS} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Bahan yang Dibeli</label>
                <button onClick={addItem} className="btn-hover" style={{ background: statCardColors[0].bg, border: `1px solid ${statCardColors[0].border}`, color: statCardColors[0].color, padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, transition: "all 0.15s" }}>+ Tambah Bahan</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 140px 36px", gap: 8, marginBottom: 6 }}>
                {["BAHAN", "QTY", "SATUAN", "HARGA/SAT", ""].map((h, i) => (
                  <div key={i} style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.06em" }}>{h}</div>
                ))}
              </div>

              {items.map((item, idx) => (
                <div key={idx} style={{ marginBottom: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 140px 36px", gap: 8, alignItems: "center" }}>
                    <select value={item.bahan_id} onChange={e => updateItem(idx, "bahan_id", e.target.value)} style={inputS}>
                      <option value="">— Pilih Bahan —</option>
                      {kategoriList.length > 0
                        ? kategoriList.map(kat => {
                            const bd = bahan.filter(b => b.kategori === kat);
                            return bd.length === 0 ? null : (
                              <optgroup key={kat} label={kat}>
                                {bd.map(b => <option key={b.id} value={b.id}>{b.nama} (stok: {b.stok} {b.satuan})</option>)}
                              </optgroup>
                            );
                          })
                        : bahan.map(b => <option key={b.id} value={b.id}>{b.nama}</option>)
                      }
                    </select>
                    <input type="number" value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} placeholder="0" style={inputS} min="0" step="0.1" />
                    <div style={{ padding: "9px 0", textAlign: "center", fontSize: 13, color: C.muted, fontWeight: 600 }}>{item.satuan || "—"}</div>
                    <input type="number" value={item.harga_beli} onChange={e => updateItem(idx, "harga_beli", e.target.value)} placeholder="Harga/sat" style={inputS} min="0" />
                    <button onClick={() => removeItem(idx)} style={{ background: "#ef444415", border: "1px solid #ef444430", color: "#ef4444", width: 36, height: 38, borderRadius: 8, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                  {item.qty && item.harga_beli && (
                    <div style={{ fontSize: 11, color: statCardColors[0].color, marginTop: 3, paddingLeft: 4, fontWeight: 700, fontFamily: C.fontMono }}>
                      Subtotal: {rupiahFmt(parseFloat(item.qty) * parseInt(item.harga_beli))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Total box */}
            <div style={{ background: statCardColors[0].bg, border: `1px solid ${statCardColors[0].border}`, borderRadius: 12, padding: "14px 18px", marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontWeight: 700, color: C.muted, fontSize: 13 }}>TOTAL BAYAR</span>
                <span style={{ fontWeight: 900, fontSize: 22, color: statCardColors[0].color }}>{rupiahFmt(totalBayar)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>🌙 Zakat Tijarah (2.5%)</span>
                <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700, fontFamily: C.fontMono }}>+{rupiahFmt(Math.floor(totalBayar * 0.025))}</span>
              </div>
            </div>

            {metodeBayar === "Hutang" && (
              <div style={{ background: statCardColors[1].bg, border: `1px solid ${statCardColors[1].border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: statCardColors[1].color, fontWeight: 600 }}>
                ⚠️ Akan dicatat sebagai hutang ke supplier sebesar {rupiahFmt(totalBayar)}
              </div>
            )}

            <button onClick={simpanPembelian} disabled={submitting} className="btn-hover" style={{
              width: "100%", padding: 13, borderRadius: 12,
              background: submitting ? C.dim : statCardColors[0].bg,
              border: `1.5px solid ${submitting ? C.dim : statCardColors[0].color}`,
              color: submitting ? C.muted : statCardColors[0].color,
              fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: C.fontSans, fontSize: 15, transition: "all 0.15s",
            }}>
              {submitting ? "Menyimpan..." : "✓ Simpan Pembelian Bahan"}
            </button>
          </div>
        )}

        {/* ── TAB RIWAYAT ── */}
        {activeTab === "riwayat" && (
          <div style={{ background: C.card, padding: 20, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Riwayat Pembelian</div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>Klik baris untuk detail</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, marginBottom: 16 }}>
              <input type="text" value={filterSupplier} placeholder="🔍 Cari supplier..." onChange={e => { setFilterSupplier(e.target.value); setCurrentPage(1); }} style={{ ...inputS, padding: "8px 12px" }} />
              <select value={filterMetode} onChange={e => { setFilterMetode(e.target.value); setCurrentPage(1); }} style={{ ...inputS, width: 130 }}>
                <option value="Semua">Semua Metode</option>
                <option value="Tunai">Tunai</option>
                <option value="Transfer">Transfer</option>
                <option value="Hutang">Hutang</option>
              </select>
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }} style={{ ...inputS, width: 140 }}>
                <option value="Semua">Semua Status</option>
                <option value="Lunas">Lunas</option>
                <option value="Belum Lunas">Belum Lunas</option>
              </select>
            </div>

            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 0.8fr 0.8fr", gap: 8, padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: 8, marginBottom: 4 }}>
              {[
                { label: "Supplier", field: "supplier_nama" as const },
                { label: "Tanggal", field: "created_at" as const },
                { label: "Total", field: "total_bayar" as const },
                { label: "Metode", field: null },
                { label: "Status", field: null },
              ].map(col => (
                <button key={col.label} onClick={() => col.field && handleSort(col.field)} style={{
                  background: "none", border: "none", color: C.muted, fontSize: 11, fontWeight: 700,
                  textAlign: "left", cursor: col.field ? "pointer" : "default", padding: 0,
                  letterSpacing: "0.06em", fontFamily: C.fontSans, textTransform: "uppercase",
                }}>
                  {col.label}{col.field && (sortField === col.field ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕")}
                </button>
              ))}
            </div>

            {riwayatFiltered.length === 0 && (
              <div style={{ textAlign: "center", color: C.muted, padding: 32, fontSize: 14 }}>Tidak ada data</div>
            )}

            {riwayatPage.map(r => (
              <div key={r.id} className="row-hover" onClick={() => openDetail(r)} style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 1.2fr 0.8fr 0.8fr", gap: 8,
                alignItems: "center", padding: "12px 12px",
                borderBottom: `1px solid ${C.border}`,
                borderRadius: 8, transition: "background 0.12s",
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{r.supplier_nama}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{r.total_item} bahan {r.catatan ? `· ${r.catatan.slice(0, 20)}` : ""}</div>
                </div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(r.created_at)}</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: C.text, fontFamily: C.fontMono }}>{rupiahFmt(r.total_bayar)}</div>
                <div>
                  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: (METODE_COLOR[r.metode_bayar] || C.accent) + "20", color: METODE_COLOR[r.metode_bayar] || C.accent }}>{r.metode_bayar}</span>
                </div>
                <div>
                  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: (STATUS_COLOR[r.status_bayar] || C.muted) + "20", color: STATUS_COLOR[r.status_bayar] || C.muted }}>{r.status_bayar}</span>
                </div>
              </div>
            ))}

            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, color: C.muted }}>{riwayatFiltered.length} hasil · hal {currentPage}/{totalPages}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: "pointer", fontSize: 12 }}>← Prev</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                    if (page < 1 || page > totalPages) return null;
                    return (
                      <button key={page} onClick={() => setCurrentPage(page)} style={{ padding: "6px 10px", background: page === currentPage ? statCardColors[0].bg : "transparent", border: `1px solid ${page === currentPage ? statCardColors[0].border : C.border}`, borderRadius: 8, color: page === currentPage ? statCardColors[0].color : C.muted, cursor: "pointer", fontSize: 12, fontWeight: page === currentPage ? 700 : 400 }}>{page}</button>
                    );
                  })}
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: "pointer", fontSize: 12 }}>Next →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB HUTANG ── */}
        {activeTab === "hutang" && (
          <div style={{ background: C.card, padding: 20, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>Hutang ke Supplier</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Total hutang: <strong style={{ color: statCardColors[1].color }}>{rupiahFmt(totalHutang)}</strong></div>
            {hutang.length === 0 && (
              <div style={{ textAlign: "center", color: "#22c55e", padding: 32, fontSize: 14, fontWeight: 600 }}>Tidak ada hutang supplier 🎉</div>
            )}
            {hutang.map(h => (
              <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{h.supplier_nama}</div>
                  <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{tanggalFmt(h.created_at)}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: statCardColors[1].color, fontFamily: C.fontMono }}>{rupiahFmt(h.nominal)}</div>
                  <button onClick={() => lunaskanHutang(h.id, h.nominal, h.supplier_nama)} className="btn-hover" style={{ background: "#22c55e20", border: "1px solid #22c55e40", color: "#22c55e", padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, transition: "all 0.15s" }}>
                    ✓ Lunas
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB STOK ── */}
        {activeTab === "stok" && (
          <div style={{ background: C.card, padding: 20, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Stok Bahan ({bahan.length})</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Read-only · CRUD di Admin → Master Bahan</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="text" value={searchStok} onChange={e => setSearchStok(e.target.value)} placeholder="🔍 Cari nama..." style={{ ...inputS, width: 140, padding: "7px 10px" }} />
                {["Semua", ...kategoriList].map(k => (
                  <button key={k} onClick={() => setFilterKategoriStok(k)} style={{
                    padding: "5px 12px", borderRadius: 20,
                    border: `1.5px solid ${filterKategoriStok === k ? statCardColors[2].border : C.border}`,
                    background: filterKategoriStok === k ? statCardColors[2].bg : "transparent",
                    color: filterKategoriStok === k ? statCardColors[2].color : C.muted,
                    fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                  }}>{k}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr", gap: 8, padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: 8, marginBottom: 4 }}>
              {["NAMA BAHAN", "KATEGORI", "STOK", "HPP / SAT", "DIPERBARUI"].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</div>
              ))}
            </div>

            {bahanFiltered.length === 0 && (
              <div style={{ textAlign: "center", color: C.muted, padding: 32, fontSize: 14 }}>{searchStok ? "Tidak ditemukan." : "Belum ada bahan."}</div>
            )}

            {bahanFiltered.map(b => {
              const catColor = b.kategori === "Bahan Baku" ? statCardColors[2].color : b.kategori === "Bahan Penolong" ? statCardColors[1].color : statCardColors[0].color;
              const isHabis = b.stok <= 0;
              return (
                <div key={b.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr", gap: 8, alignItems: "center", padding: "10px 12px", borderBottom: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{b.nama}</div>
                  <div>
                    <span style={{ background: catColor + "20", color: catColor, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{b.kategori}</span>
                  </div>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: 14, color: isHabis ? "#ef4444" : C.text, fontFamily: C.fontMono }}>
                      {b.stok} <span style={{ fontSize: 11, fontWeight: 400, color: C.muted }}>{b.satuan}</span>
                    </span>
                    {isHabis && <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginTop: 1 }}>⚠ Habis</div>}
                  </div>
                  <div style={{ fontSize: 12, color: statCardColors[0].color, fontFamily: C.fontMono, fontWeight: 700 }}>{rupiahFmt(b.harga_beli_avg)}/{b.satuan}</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{b.updated_at ? tanggalFmt(b.updated_at) : "—"}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
