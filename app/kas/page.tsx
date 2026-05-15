"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type Kas = {
  id: number;
  created_at: string;
  tipe: "Masuk" | "Keluar";
  kategori: string;
  nominal: number;
  keterangan: string;
  is_void?: boolean;
  void_reason?: string;
  foto_url?: string;
};

type Toast = { msg: string; type: "success" | "error" | "info" };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", {
  day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit",
  timeZone: "Asia/Jakarta",
});
const isHariIni = (s: string) => {
  const tgl = new Date(s).toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
  const today = new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
  return tgl === today;
};

const KATEGORI_MASUK = ["Modal", "Lain-lain"];
const KATEGORI_KELUAR = ["Operasional", "Transport", "Gaji", "Prive", "Lain-lain"];
const PAGE_SIZE = 15;
const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;

export default function KasPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [kas, setKas] = useState<Kas[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<"input" | "riwayat">("riwayat");

  // Form input
  const [tipe, setTipe] = useState<"Masuk" | "Keluar">("Masuk");
  const [kategori, setKategori] = useState("Modal");
  const [nominal, setNominal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [tanggalManual, setTanggalManual] = useState(
    new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" })
  );
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  // Modal konfirmasi
  const [showKonfirmasi, setShowKonfirmasi] = useState(false);

  // Modal detail
  const [detailItem, setDetailItem] = useState<Kas | null>(null);

  // Modal edit
  const [editItem, setEditItem] = useState<Kas | null>(null);
  const [editNominal, setEditNominal] = useState("");
  const [editKategori, setEditKategori] = useState("");
  const [editKeterangan, setEditKeterangan] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Modal void
  const [voidItem, setVoidItem] = useState<Kas | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [savingVoid, setSavingVoid] = useState(false);

  // Filter — clickable cards set ini
  const [filterTipe, setFilterTipe] = useState("Semua");
  const [filterKategori, setFilterKategori] = useState("Semua");
  const [filterBulan, setFilterBulan] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [filterSearch, setFilterSearch] = useState("");
  const [showVoid, setShowVoid] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("kas").select("*")
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      setKas(data || []);
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTipeChange = (t: "Masuk" | "Keluar") => {
    setTipe(t);
    setKategori(t === "Masuk" ? "Modal" : "Operasional");
  };

  // ── Handle pilih foto ──
  const handlePilihFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showToast("Ukuran foto maksimal 5MB!", "error");
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  // ── Upload foto ke Cloudinary via API route ──
  const uploadFoto = async (): Promise<string | null> => {
    if (!fotoFile) return null;
    setUploadingFoto(true);
    try {
      const formData = new FormData();
      formData.append("file", fotoFile);
      const res = await fetch("/api/upload-foto", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal upload foto");
      return data.url;
    } catch (err: any) {
      showToast(err.message || "Gagal upload foto", "error");
      return null;
    } finally {
      setUploadingFoto(false);
    }
  };

  // ── Validasi → tampil modal konfirmasi ──
  const handleClickSimpan = () => {
    if (toAngka(nominal) <= 0) return showToast("Isi nominal dengan benar!", "error");
    if (!kategori) return showToast("Pilih kategori!", "error");
    if (!keterangan.trim()) return showToast("Isi keterangan!", "error");
    setShowKonfirmasi(true);
  };

  // ── Simpan setelah konfirmasi ──
  const simpanKas = async () => {
    const nominalAngka = toAngka(nominal);
    setSubmitting(true);
    try {
      // Upload foto dulu kalau ada
      let fotoUrl: string | null = null;
      if (fotoFile) {
        fotoUrl = await uploadFoto();
        if (!fotoUrl) { setSubmitting(false); return; }
      }

      const waktuWIB = new Date(`${tanggalManual}T${new Date().toLocaleTimeString("sv", { timeZone: "Asia/Jakarta" })}+07:00`).toISOString();
      const { error } = await supabase.from("kas").insert([{
        tipe, kategori, nominal: nominalAngka,
        keterangan: keterangan.trim(),
        created_at: waktuWIB,
        is_void: false,
        foto_url: fotoUrl,
      }]);
      if (error) throw new Error(error.message);
      showToast(`${tipe === "Masuk" ? "✓ Pemasukan" : "✓ Pengeluaran"} ${rupiahFmt(nominalAngka)} berhasil dicatat!`);
      setNominal(""); setKeterangan("");
      setFotoFile(null); setFotoPreview(null);
      setTanggalManual(new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" }));
      setShowKonfirmasi(false);
      fetchData();
      setActiveTab("riwayat");
    } catch (err: any) {
      showToast(err.message || "Gagal simpan", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Edit ──
  const bukaEdit = (k: Kas) => {
    setDetailItem(null);
    setEditItem(k);
    setEditNominal(formatIDR(String(k.nominal)));
    setEditKategori(k.kategori);
    setEditKeterangan(k.keterangan);
  };

  const simpanEdit = async () => {
    if (!editItem) return;
    const nominalAngka = toAngka(editNominal);
    if (nominalAngka <= 0) return showToast("Nominal harus lebih dari 0!", "error");
    if (!editKeterangan.trim()) return showToast("Isi keterangan!", "error");
    setSavingEdit(true);
    try {
      const { error } = await supabase.from("kas").update({
        nominal: nominalAngka, kategori: editKategori, keterangan: editKeterangan.trim(),
      }).eq("id", editItem.id);
      if (error) throw new Error(error.message);
      showToast("✓ Transaksi berhasil diupdate!");
      setEditItem(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message || "Gagal update", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Void ──
  const prosesVoid = async () => {
    if (!voidItem) return;
    if (!voidReason.trim()) return showToast("Isi alasan void!", "error");
    setSavingVoid(true);
    try {
      const { error } = await supabase.from("kas").update({
        is_void: true, void_reason: voidReason.trim(),
      }).eq("id", voidItem.id);
      if (error) throw new Error(error.message);
      showToast(`🚫 Transaksi di-void`);
      setVoidItem(null); setVoidReason("");
      fetchData();
    } catch (err: any) {
      showToast(err.message || "Gagal void", "error");
    } finally {
      setSavingVoid(false);
    }
  };

  // ── Filter ──
  const kasFiltered = useMemo(() => {
    let data = [...kas];
    if (!showVoid) data = data.filter(k => !k.is_void);
    if (filterBulan) {
      data = data.filter(k => {
        const tgl = new Date(k.created_at).toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
        return tgl.startsWith(filterBulan);
      });
    }
    if (filterTipe !== "Semua") data = data.filter(k => k.tipe === filterTipe);
    if (filterKategori !== "Semua") data = data.filter(k => k.kategori === filterKategori);
    if (filterSearch.trim()) {
      data = data.filter(k =>
        k.keterangan.toLowerCase().includes(filterSearch.toLowerCase()) ||
        k.kategori.toLowerCase().includes(filterSearch.toLowerCase())
      );
    }
    return data;
  }, [kas, filterTipe, filterKategori, filterBulan, filterSearch, showVoid]);

  const totalPages = Math.ceil(kasFiltered.length / PAGE_SIZE);
  const kasPage = kasFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const totalMasuk = kasFiltered.filter(k => k.tipe === "Masuk" && !k.is_void).reduce((a, k) => a + k.nominal, 0);
  const totalKeluar = kasFiltered.filter(k => k.tipe === "Keluar" && !k.is_void).reduce((a, k) => a + k.nominal, 0);
  const saldoBulanIni = totalMasuk - totalKeluar;
  const saldoTotal = kas.filter(k => !k.is_void).reduce((a, k) => k.tipe === "Masuk" ? a + k.nominal : a - k.nominal, 0);
  const allKategori = Array.from(new Set(kas.map(k => k.kategori))).sort();
  const bulanList = useMemo(() => {
    const set = new Set<string>();
    kas.forEach(k => {
      const tgl = new Date(k.created_at).toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
      set.add(tgl.slice(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [kas]);

  const inputS: React.CSSProperties = {
    width: "100%", padding: "10px 14px",
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`,
    borderRadius: 8, color: C.text, fontFamily: C.fontSans, fontSize: 13,
    boxSizing: "border-box", outline: "none",
  };

  // ── Stat cards config — clickable ──
  const statCards = [
    {
      label: "Saldo Kas Total", value: rupiahFmt(saldoTotal),
      color: saldoTotal >= 0 ? C.green : C.red, icon: "💰",
      sub: "Semua waktu", onClick: () => { setFilterTipe("Semua"); setFilterBulan(""); setActiveTab("riwayat"); }
    },
    {
      label: "Pemasukan", value: rupiahFmt(totalMasuk),
      color: C.green, icon: "📈",
      sub: filterBulan || "Periode dipilih", onClick: () => { setFilterTipe("Masuk"); setActiveTab("riwayat"); setCurrentPage(1); }
    },
    {
      label: "Pengeluaran", value: rupiahFmt(totalKeluar),
      color: C.red, icon: "📉",
      sub: filterBulan || "Periode dipilih", onClick: () => { setFilterTipe("Keluar"); setActiveTab("riwayat"); setCurrentPage(1); }
    },
    {
      label: "Selisih Periode", value: rupiahFmt(Math.abs(saldoBulanIni)),
      color: saldoBulanIni >= 0 ? C.green : C.red,
      icon: saldoBulanIni >= 0 ? "✅" : "⚠️",
      sub: saldoBulanIni >= 0 ? "Surplus" : "Defisit",
      onClick: () => { setFilterTipe("Semua"); setActiveTab("riwayat"); setCurrentPage(1); }
    },
  ];

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Memuat data kas...</div>
      </div>
    </Sidebar>
  );

  return (
    <Sidebar>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        input:focus, select:focus, textarea:focus { border-color: ${C.accent}80 !important; outline: none; }
        input::placeholder, textarea::placeholder { color: ${C.muted} !important; }
        select option { background: ${C.card}; color: ${C.text}; }
        .kas-row:hover { background: ${isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"} !important; cursor: pointer; }
        .stat-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: C.card, border: `1px solid ${toast.type === "success" ? C.green : toast.type === "error" ? C.red : C.blue}44`, color: toast.type === "success" ? C.green : toast.type === "error" ? C.red : C.blue, padding: "14px 20px", borderRadius: 12, boxShadow: C.shadowMd, fontFamily: C.fontMono, fontWeight: 600, fontSize: 13, maxWidth: 380, animation: "fadeUp 0.2s ease" }}>
          {toast.msg}
        </div>
      )}

      {/* ── Modal Konfirmasi ── */}
      {showKonfirmasi && (
        <>
          <div onClick={() => setShowKonfirmasi(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: 380, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, fontFamily: C.fontSans, animation: "fadeUp 0.15s ease" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 4 }}>⚠️ Konfirmasi Transaksi</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Pastikan data sudah benar sebelum disimpan</div>
            <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              {[
                { label: "Tipe", value: tipe === "Masuk" ? "📈 Pemasukan" : "📉 Pengeluaran", color: tipe === "Masuk" ? C.green : C.red },
                { label: "Kategori", value: kategori, color: C.text },
                { label: "Keterangan", value: keterangan, color: C.text },
                { label: "Tanggal", value: tanggalManual, color: C.muted },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: row.color, maxWidth: 200, textAlign: "right" }}>{row.value}</span>
                </div>
              ))}
              {fotoFile && <div style={{ fontSize: 12, color: C.accent, marginBottom: 10 }}>📎 Foto struk terlampir</div>}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Nominal</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: tipe === "Masuk" ? C.green : C.red, fontFamily: C.fontMono }}>{rupiahFmt(toAngka(nominal))}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowKonfirmasi(false)} style={{ flex: 1, padding: "11px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono }}>✕ Koreksi Dulu</button>
              <button onClick={simpanKas} disabled={submitting || uploadingFoto} style={{ flex: 1, padding: "11px", background: tipe === "Masuk" ? `linear-gradient(135deg, #065f46, ${C.green})` : `linear-gradient(135deg, #7f1d1d, ${C.red})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: (submitting || uploadingFoto) ? 0.7 : 1 }}>
                {uploadingFoto ? "Upload foto..." : submitting ? "Menyimpan..." : "✓ Ya, Simpan"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Detail ── */}
      {detailItem && (
        <>
          <div onClick={() => setDetailItem(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: 420, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, fontFamily: C.fontSans, animation: "fadeUp 0.15s ease", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 4 }}>Detail Transaksi</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>#{detailItem.id}</div>
              </div>
              <button onClick={() => setDetailItem(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, padding: "2px 6px" }}>×</button>
            </div>

            {/* Status badge */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: (detailItem.tipe === "Masuk" ? C.green : C.red) + "20", color: detailItem.tipe === "Masuk" ? C.green : C.red, fontWeight: 700, fontFamily: C.fontMono }}>
                {detailItem.tipe === "Masuk" ? "📈 Pemasukan" : "📉 Pengeluaran"}
              </span>
              <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: `${C.accent}20`, color: C.accent, fontWeight: 700, fontFamily: C.fontMono }}>{detailItem.kategori}</span>
              {detailItem.is_void && <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: `${C.red}20`, color: C.red, fontWeight: 700, fontFamily: C.fontMono }}>🚫 VOID</span>}
            </div>

            {/* Nominal besar */}
            <div style={{ textAlign: "center", padding: "20px 0", marginBottom: 20, background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", borderRadius: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: detailItem.is_void ? C.muted : detailItem.tipe === "Masuk" ? C.green : C.red, fontFamily: C.fontMono, textDecoration: detailItem.is_void ? "line-through" : "none" }}>
                {detailItem.tipe === "Masuk" ? "+" : "−"}{rupiahFmt(detailItem.nominal)}
              </div>
            </div>

            {/* Info rows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
              {[
                { label: "Keterangan", value: detailItem.keterangan },
                { label: "Tanggal", value: tanggalFmt(detailItem.created_at) },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderRadius: 8 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>{row.label}</span>
                  <span style={{ fontSize: 13, color: C.text, fontWeight: 600, maxWidth: 240, textAlign: "right" }}>{row.value}</span>
                </div>
              ))}
              {detailItem.is_void && detailItem.void_reason && (
                <div style={{ padding: "10px 14px", background: `${C.red}10`, border: `1px solid ${C.red}25`, borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: C.red, fontFamily: C.fontMono, marginBottom: 4 }}>ALASAN VOID</div>
                  <div style={{ fontSize: 13, color: C.red }}>{detailItem.void_reason}</div>
                </div>
              )}
            </div>

            {/* Foto struk */}
            {detailItem.foto_url ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>Bukti Struk</div>
                <img src={detailItem.foto_url} alt="Bukti struk" style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.border}`, objectFit: "cover", maxHeight: 300 }} />
                <a href={detailItem.foto_url} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center", marginTop: 8, fontSize: 12, color: C.accent, fontFamily: C.fontMono }}>🔗 Buka foto ukuran penuh</a>
              </div>
            ) : (
              <div style={{ marginBottom: 20, padding: "14px", background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>📷</div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>Tidak ada foto struk</div>
              </div>
            )}

            {/* Aksi */}
            {!detailItem.is_void && (
              <div style={{ display: "flex", gap: 8 }}>
                {isHariIni(detailItem.created_at) && (
                  <button onClick={() => bukaEdit(detailItem)} style={{ flex: 1, padding: "10px", background: `${C.accent}15`, border: `1px solid ${C.accent}30`, color: C.accent, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono }}>✏️ Edit</button>
                )}
                <button onClick={() => { setVoidItem(detailItem); setDetailItem(null); setVoidReason(""); }} style={{ flex: 1, padding: "10px", background: `${C.red}10`, border: `1px solid ${C.red}25`, color: C.red, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono }}>🚫 Void</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Modal Edit ── */}
      {editItem && (
        <>
          <div onClick={() => setEditItem(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: 400, background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, fontFamily: C.fontSans, animation: "fadeUp 0.15s ease" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 4 }}>✏️ Edit Transaksi</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>{tanggalFmt(editItem.created_at)}</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Kategori</div>
              <select value={editKategori} onChange={e => setEditKategori(e.target.value)} style={inputS}>
                {(editItem.tipe === "Masuk" ? KATEGORI_MASUK : KATEGORI_KELUAR).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Nominal</div>
              <input value={editNominal} onChange={e => setEditNominal(formatIDR(e.target.value))} style={{ ...inputS, fontFamily: C.fontMono, fontWeight: 700 }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Keterangan</div>
              <input value={editKeterangan} onChange={e => setEditKeterangan(e.target.value)} style={inputS} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setEditItem(null)} style={{ flex: 1, padding: "11px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono }}>Batal</button>
              <button onClick={simpanEdit} disabled={savingEdit} style={{ flex: 1, padding: "11px", background: `linear-gradient(135deg, #7c3aed, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: savingEdit ? 0.7 : 1 }}>
                {savingEdit ? "Menyimpan..." : "✓ Simpan"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Modal Void ── */}
      {voidItem && (
        <>
          <div onClick={() => { setVoidItem(null); setVoidReason(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 1001, width: 400, background: C.card, border: `1px solid ${C.red}40`, borderRadius: 16, padding: 24, fontFamily: C.fontSans, animation: "fadeUp 0.15s ease" }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.red, marginBottom: 4 }}>🚫 Void Transaksi</div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Transaksi tetap muncul di riwayat tapi tidak dihitung di saldo</div>
            <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{voidItem.keterangan}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: voidItem.tipe === "Masuk" ? C.green : C.red, fontFamily: C.fontMono }}>{voidItem.tipe === "Masuk" ? "+" : "−"}{rupiahFmt(voidItem.nominal)}</div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 4 }}>{tanggalFmt(voidItem.created_at)}</div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Alasan Void *</div>
              <input value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder="Contoh: Salah input nominal, duplikat..." style={inputS} autoFocus />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setVoidItem(null); setVoidReason(""); }} style={{ flex: 1, padding: "11px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono }}>Batal</button>
              <button onClick={prosesVoid} disabled={savingVoid || !voidReason.trim()} style={{ flex: 1, padding: "11px", background: C.red, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: C.fontMono, opacity: (savingVoid || !voidReason.trim()) ? 0.6 : 1 }}>
                {savingVoid ? "Memproses..." : "🚫 Void"}
              </button>
            </div>
          </div>
        </>
      )}

      <div style={{ background: C.bg, minHeight: "100vh", padding: "28px", fontFamily: C.fontSans, color: C.text }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.text }}>💰 Kas</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted, fontFamily: C.fontMono }}>Kelola arus kas masuk & keluar Azalea</p>
        </div>

        {/* Stat Cards — clickable */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
          {statCards.map((s, i) => (
            <div key={i} className="stat-card" onClick={s.onClick} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden", boxShadow: C.shadow, cursor: "pointer", transition: "all 0.2s" }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60, background: s.color + "18", borderRadius: "0 14px 0 60px" }} />
              <div style={{ fontSize: 20, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: C.fontMono }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{s.sub}</div>
              <div style={{ position: "absolute", bottom: 10, right: 14, fontSize: 10, color: s.color, fontFamily: C.fontMono, opacity: 0.6 }}>klik untuk filter →</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[
            { id: "input", label: "+ Input Transaksi", color: C.accent },
            { id: "riwayat", label: "📋 Riwayat Kas", color: C.blue },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{ padding: "10px 24px", borderRadius: 10, border: `1px solid ${activeTab === tab.id ? tab.color + "60" : C.border}`, background: activeTab === tab.id ? tab.color + "20" : "transparent", color: activeTab === tab.id ? tab.color : C.muted, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: C.fontSans, transition: "all 0.15s" }}>{tab.label}</button>
          ))}
        </div>

        {/* ── TAB INPUT ── */}
        {activeTab === "input" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, maxWidth: 560, boxShadow: C.shadow, animation: "fadeUp 0.2s ease" }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800, color: C.text }}>Input Transaksi Kas</h3>

            <div style={{ background: isDark ? `${C.accent}10` : `${C.accent}08`, border: `1px solid ${C.accent}25`, borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
              💡 <strong style={{ color: C.accent }}>Input di sini hanya untuk transaksi manual.</strong> Beli bahan, penjualan offline, pencairan Shopee, dan lunasi piutang sudah otomatis tercatat dari modulnya masing-masing.
            </div>

            {/* Tipe */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>TIPE TRANSAKSI</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["Masuk", "Keluar"] as const).map(t => (
                  <button key={t} onClick={() => handleTipeChange(t)} style={{ flex: 1, padding: "11px", borderRadius: 8, border: `1px solid ${tipe === t ? (t === "Masuk" ? C.green : C.red) + "60" : C.border}`, background: tipe === t ? (t === "Masuk" ? C.green : C.red) + "20" : "transparent", color: tipe === t ? (t === "Masuk" ? C.green : C.red) : C.muted, fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: C.fontSans }}>
                    {t === "Masuk" ? "📈 Pemasukan" : "📉 Pengeluaran"}
                  </button>
                ))}
              </div>
            </div>

            {/* Kategori */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>KATEGORI</div>
              <select value={kategori} onChange={e => setKategori(e.target.value)} style={inputS}>
                {(tipe === "Masuk" ? KATEGORI_MASUK : KATEGORI_KELUAR).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            {/* Nominal */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>NOMINAL (Rp)</div>
              <input type="text" value={nominal} onChange={e => setNominal(formatIDR(e.target.value))} placeholder="0" style={{ ...inputS, fontFamily: C.fontMono, fontSize: 15, fontWeight: 700 }} />
              {nominal && <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: C.fontMono }}>{rupiahFmt(toAngka(nominal))}</div>}
            </div>

            {/* Keterangan */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>KETERANGAN</div>
              <input type="text" value={keterangan} onChange={e => setKeterangan(e.target.value)} placeholder="Contoh: Bayar listrik Februari..." style={inputS} />
            </div>

            {/* Tanggal */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>TANGGAL</div>
              <input type="date" value={tanggalManual} onChange={e => setTanggalManual(e.target.value)} style={{ ...inputS, colorScheme: isDark ? "dark" : "light" }} />
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Default hari ini — ubah kalau input mundur</div>
            </div>

            {/* Upload Foto Struk */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
                FOTO STRUK <span style={{ color: C.dim, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opsional)</span>
              </div>
              {fotoPreview ? (
                <div style={{ position: "relative" }}>
                  <img src={fotoPreview} alt="Preview" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 10, border: `1px solid ${C.border}` }} />
                  <button onClick={() => { setFotoFile(null); setFotoPreview(null); }} style={{ position: "absolute", top: 8, right: 8, background: C.red, border: "none", color: "#fff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>× Hapus</button>
                </div>
              ) : (
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px", border: `2px dashed ${C.border}`, borderRadius: 10, cursor: "pointer", gap: 8, background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)" }}>
                  <span style={{ fontSize: 28 }}>📷</span>
                  <span style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>Klik untuk upload foto struk</span>
                  <span style={{ fontSize: 11, color: C.dim }}>JPG, PNG, max 5MB</span>
                  <input type="file" accept="image/*" onChange={handlePilihFoto} style={{ display: "none" }} />
                </label>
              )}
            </div>

            <button onClick={handleClickSimpan} style={{ width: "100%", padding: 13, border: "none", borderRadius: 10, background: tipe === "Masuk" ? `linear-gradient(135deg, #065f46, ${C.green})` : `linear-gradient(135deg, #7f1d1d, ${C.red})`, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: C.fontMono, fontSize: 14, boxShadow: `0 4px 16px ${tipe === "Masuk" ? C.green : C.red}33` }}>
              {`✓ Simpan ${tipe === "Masuk" ? "Pemasukan" : "Pengeluaran"} ${nominal ? rupiahFmt(toAngka(nominal)) : ""}`}
            </button>
          </div>
        )}

        {/* ── TAB RIWAYAT ── */}
        {activeTab === "riwayat" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, boxShadow: C.shadow, animation: "fadeUp 0.2s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.text }}>Riwayat Transaksi</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
                  <input type="checkbox" checked={showVoid} onChange={e => setShowVoid(e.target.checked)} style={{ accentColor: C.red }} />
                  Tampilkan void
                </label>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{kasFiltered.length} transaksi</div>
              </div>
            </div>

            {/* Filter */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10, marginBottom: 14 }}>
              <input type="text" value={filterSearch} onChange={e => { setFilterSearch(e.target.value); setCurrentPage(1); }} placeholder="🔍 Cari keterangan atau kategori..." style={{ ...inputS, padding: "8px 12px" }} />
              <select value={filterBulan} onChange={e => { setFilterBulan(e.target.value); setCurrentPage(1); }} style={{ ...inputS, width: 140 }}>
                <option value="">Semua Bulan</option>
                {bulanList.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select value={filterTipe} onChange={e => { setFilterTipe(e.target.value); setCurrentPage(1); }} style={{ ...inputS, width: 130 }}>
                <option value="Semua">Semua Tipe</option>
                <option value="Masuk">Masuk</option>
                <option value="Keluar">Keluar</option>
              </select>
              <select value={filterKategori} onChange={e => { setFilterKategori(e.target.value); setCurrentPage(1); }} style={{ ...inputS, width: 150 }}>
                <option value="Semua">Semua Kategori</option>
                {allKategori.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            {/* Summary */}
            {kasFiltered.length > 0 && (
              <div style={{ display: "flex", gap: 16, marginBottom: 14, padding: "10px 14px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)", borderRadius: 10, border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 12, color: C.green, fontFamily: C.fontMono, fontWeight: 700 }}>↑ {rupiahFmt(totalMasuk)}</span>
                <span style={{ fontSize: 12, color: C.muted }}>·</span>
                <span style={{ fontSize: 12, color: C.red, fontFamily: C.fontMono, fontWeight: 700 }}>↓ {rupiahFmt(totalKeluar)}</span>
                <span style={{ fontSize: 12, color: C.muted }}>·</span>
                <span style={{ fontSize: 12, color: saldoBulanIni >= 0 ? C.green : C.red, fontFamily: C.fontMono, fontWeight: 700 }}>= {rupiahFmt(Math.abs(saldoBulanIni))} {saldoBulanIni >= 0 ? "surplus" : "defisit"}</span>
              </div>
            )}

            {kasFiltered.length === 0 && (
              <div style={{ textAlign: "center", color: C.muted, padding: "40px 0", fontFamily: C.fontMono, fontSize: 13 }}>Tidak ada transaksi ditemukan</div>
            )}

            {/* List — klik untuk detail */}
            {kasPage.map(k => (
              <div key={k.id} className="kas-row" onClick={() => setDetailItem(k)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 8px", borderBottom: `1px solid ${C.border}`, opacity: k.is_void ? 0.45 : 1, transition: "background 0.15s", borderRadius: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: k.is_void ? C.muted : k.tipe === "Masuk" ? C.green : C.red }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: (k.is_void ? C.muted : k.tipe === "Masuk" ? C.green : C.red) + "20", color: k.is_void ? C.muted : k.tipe === "Masuk" ? C.green : C.red, fontFamily: C.fontMono }}>{k.kategori}</span>
                      <span style={{ fontSize: 13, color: k.is_void ? C.muted : C.textMid, fontWeight: 500, textDecoration: k.is_void ? "line-through" : "none" }}>{k.keterangan}</span>
                      {k.is_void && <span style={{ fontSize: 10, background: C.red + "20", color: C.red, padding: "2px 7px", borderRadius: 4, fontFamily: C.fontMono, fontWeight: 700 }}>VOID</span>}
                      {k.foto_url && <span style={{ fontSize: 10, color: C.accent, fontFamily: C.fontMono }}>📷</span>}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(k.created_at)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, fontFamily: C.fontMono, color: k.is_void ? C.muted : k.tipe === "Masuk" ? C.green : C.red, whiteSpace: "nowrap", textDecoration: k.is_void ? "line-through" : "none" }}>
                    {k.tipe === "Masuk" ? "+" : "−"}{rupiahFmt(k.nominal)}
                  </span>
                  <span style={{ fontSize: 11, color: C.dim }}>›</span>
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>{kasFiltered.length} transaksi · hal {currentPage}/{totalPages}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={e => { e.stopPropagation(); setCurrentPage(p => Math.max(1, p - 1)); }} disabled={currentPage === 1} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: currentPage === 1 ? C.muted : C.text, cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: 12 }}>← Prev</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                    if (page < 1 || page > totalPages) return null;
                    return (
                      <button key={page} onClick={e => { e.stopPropagation(); setCurrentPage(page); }} style={{ padding: "6px 10px", background: page === currentPage ? C.accent + "20" : "transparent", border: `1px solid ${page === currentPage ? C.accent + "60" : C.border}`, borderRadius: 6, color: page === currentPage ? C.accent : C.muted, cursor: "pointer", fontSize: 12, fontWeight: page === currentPage ? 700 : 400 }}>{page}</button>
                    );
                  })}
                  <button onClick={e => { e.stopPropagation(); setCurrentPage(p => Math.min(totalPages, p + 1)); }} disabled={currentPage === totalPages} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: currentPage === totalPages ? C.muted : C.text, cursor: currentPage === totalPages ? "not-allowed" : "pointer", fontSize: 12 }}>Next →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Sidebar>
  );
}
