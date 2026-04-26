"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";

type Kas = {
  id: number;
  created_at: string;
  tipe: "Masuk" | "Keluar";
  kategori: string;
  nominal: number;
  keterangan: string;
};

type Toast = { msg: string; type: "success" | "error" | "info" };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", {
  day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

const KATEGORI_MASUK = ["Modal", "Lain-lain"];
const KATEGORI_KELUAR = ["Operasional", "Transport", "Gaji", "Prive", "Lain-lain"];

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
  green: "#34d399",
  red: "#f87171",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;

export default function KasPage() {
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

  // Filter riwayat
  const [filterTipe, setFilterTipe] = useState("Semua");
  const [filterKategori, setFilterKategori] = useState("Semua");
  const [filterBulan, setFilterBulan] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [filterSearch, setFilterSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("kas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      setKas(data || []);
    } catch (err: any) {
      showToast(err.message || "Gagal memuat data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Update kategori default saat tipe berubah
  const handleTipeChange = (t: "Masuk" | "Keluar") => {
    setTipe(t);
    setKategori(t === "Masuk" ? "Modal" : "Operasional");
  };

  // ── Simpan transaksi kas ──
  const simpanKas = async () => {
    const nominalAngka = toAngka(nominal);
    if (nominalAngka <= 0) return showToast("Isi nominal dengan benar!", "error");
    if (!kategori) return showToast("Pilih kategori!", "error");
    if (!keterangan.trim()) return showToast("Isi keterangan!", "error");

    setSubmitting(true);
    try {
      // Gabungkan tanggal manual dengan waktu sekarang WIB
      const waktuWIB = new Date(`${tanggalManual}T${new Date().toLocaleTimeString("sv", { timeZone: "Asia/Jakarta" })}+07:00`).toISOString();

      const { error } = await supabase.from("kas").insert([{
        tipe,
        kategori,
        nominal: nominalAngka,
        keterangan: keterangan.trim(),
        created_at: waktuWIB,
      }]);
      if (error) throw new Error(error.message);

      showToast(`${tipe === "Masuk" ? "✓ Pemasukan" : "✓ Pengeluaran"} ${rupiahFmt(nominalAngka)} berhasil dicatat!`);
      setNominal("");
      setKeterangan("");
      setTanggalManual(new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" }));
      fetchData();
      setActiveTab("riwayat");
    } catch (err: any) {
      showToast(err.message || "Gagal simpan", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Filter & paginate ──
  const kasFiltered = useMemo(() => {
    let data = [...kas];

    // Filter bulan
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
  }, [kas, filterTipe, filterKategori, filterBulan, filterSearch]);

  const totalPages = Math.ceil(kasFiltered.length / PAGE_SIZE);
  const kasPage = kasFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ── Stats ──
  const totalMasuk = kasFiltered.filter(k => k.tipe === "Masuk").reduce((a, k) => a + k.nominal, 0);
  const totalKeluar = kasFiltered.filter(k => k.tipe === "Keluar").reduce((a, k) => a + k.nominal, 0);
  const saldoBulanIni = totalMasuk - totalKeluar;

  // Saldo keseluruhan
  const saldoTotal = kas.reduce((a, k) => k.tipe === "Masuk" ? a + k.nominal : a - k.nominal, 0);

  // Semua kategori unik untuk filter
  const allKategori = Array.from(new Set(kas.map(k => k.kategori))).sort();

  // Bulan-bulan yang tersedia
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
    background: "rgba(255,255,255,0.04)", border: `1.5px solid ${C.border}`,
    borderRadius: 8, color: C.text, fontFamily: C.fontSans, fontSize: 13,
    boxSizing: "border-box", outline: "none",
  };

  const tabBtn = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, padding: "10px 8px", borderRadius: "8px",
    border: `1px solid ${active ? color + "60" : C.border}`,
    background: active ? color + "20" : "transparent",
    color: active ? color : C.muted,
    fontWeight: 600, cursor: "pointer", fontSize: "13px",
    fontFamily: C.fontSans, transition: "all 0.15s",
  });

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>◈</div>
          Memuat data kas...
        </div>
      </div>
    </Sidebar>
  );

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
          border: `1px solid ${toast.type === "success" ? C.green : toast.type === "error" ? C.red : C.blue}44`,
          color: toast.type === "success" ? C.green : toast.type === "error" ? C.red : C.blue,
          padding: "14px 20px", borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          fontFamily: C.fontMono, fontWeight: 600, fontSize: 13, maxWidth: 380,
        }}>{toast.msg}</div>
      )}

      <div style={{ background: C.bg, minHeight: "100vh", padding: "32px 28px", fontFamily: C.fontSans, color: C.text }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontFamily: C.fontDisplay, fontSize: 28, color: "#f0eaff", fontWeight: 400 }}>
            Kas
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted, fontFamily: C.fontMono }}>
            Kelola arus kas masuk & keluar Azalea Food
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
          {[
            {
              label: "Saldo Kas Total",
              value: rupiahFmt(saldoTotal),
              color: saldoTotal >= 0 ? C.green : C.red,
              icon: "💰",
              sub: "Semua waktu",
            },
            {
              label: "Pemasukan",
              value: rupiahFmt(totalMasuk),
              color: C.green,
              icon: "📈",
              sub: filterBulan ? `Bulan ${filterBulan}` : "Periode dipilih",
            },
            {
              label: "Pengeluaran",
              value: rupiahFmt(totalKeluar),
              color: C.red,
              icon: "📉",
              sub: filterBulan ? `Bulan ${filterBulan}` : "Periode dipilih",
            },
            {
              label: "Selisih Periode",
              value: rupiahFmt(Math.abs(saldoBulanIni)),
              color: saldoBulanIni >= 0 ? C.green : C.red,
              icon: saldoBulanIni >= 0 ? "✅" : "⚠️",
              sub: saldoBulanIni >= 0 ? "Surplus" : "Defisit",
            },
          ].map((s, i) => (
            <div key={i} style={{
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: "18px 20px",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: 60, height: 60, background: s.color + "12", borderRadius: "0 14px 0 60px" }} />
              <div style={{ fontSize: 18, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: C.fontDisplay }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <button onClick={() => setActiveTab("input")} style={tabBtn(activeTab === "input", C.accent)}>+ Input Transaksi</button>
          <button onClick={() => setActiveTab("riwayat")} style={tabBtn(activeTab === "riwayat", C.blue)}>📋 Riwayat Kas</button>
        </div>

        {/* ── TAB INPUT ── */}
        {activeTab === "input" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, maxWidth: 560 }}>
            <h3 style={{ margin: "0 0 20px", fontFamily: C.fontDisplay, fontSize: 18, color: "#f0eaff", fontWeight: 400 }}>
              Input Transaksi Kas
            </h3>

            {/* Info banner */}
            <div style={{ background: C.accent + "10", border: `1px solid ${C.accent}25`, borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
              💡 <strong style={{ color: C.accent }}>Input di sini hanya untuk transaksi manual.</strong> Transaksi berikut sudah otomatis tercatat dari modulnya masing-masing:
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["Beli Bahan → /pembelian-bahan", "Beli Reseller → /pembelian", "Penjualan Offline → /penjualan", "Pencairan Shopee → /penjualan", "Lunasi Piutang → /penjualan"].map(t => (
                  <span key={t} style={{ background: C.dim, padding: "2px 8px", borderRadius: 4, fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{t}</span>
                ))}
              </div>
            </div>

            {/* Tipe: Masuk / Keluar */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>TIPE TRANSAKSI</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["Masuk", "Keluar"] as const).map(t => (
                  <button key={t} onClick={() => handleTipeChange(t)} style={{
                    flex: 1, padding: "11px",
                    borderRadius: 8, border: `1px solid ${tipe === t ? (t === "Masuk" ? C.green : C.red) + "60" : C.border}`,
                    background: tipe === t ? (t === "Masuk" ? C.green : C.red) + "20" : "transparent",
                    color: tipe === t ? (t === "Masuk" ? C.green : C.red) : C.muted,
                    fontWeight: 700, cursor: "pointer", fontSize: 14,
                    fontFamily: C.fontSans,
                  }}>
                    {t === "Masuk" ? "📈 Pemasukan" : "📉 Pengeluaran"}
                  </button>
                ))}
              </div>
            </div>

            {/* Kategori */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>KATEGORI</label>
              <select value={kategori} onChange={e => setKategori(e.target.value)} style={inputS}>
                {(tipe === "Masuk" ? KATEGORI_MASUK : KATEGORI_KELUAR).map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>

            {/* Nominal */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>NOMINAL (Rp)</label>
              <input
                type="text"
                value={nominal}
                onChange={e => setNominal(formatIDR(e.target.value))}
                placeholder="0"
                style={{ ...inputS, fontFamily: C.fontMono, fontSize: 15, fontWeight: 700 }}
              />
              {nominal && (
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: C.fontMono }}>
                  {rupiahFmt(toAngka(nominal))}
                </div>
              )}
            </div>

            {/* Keterangan */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>KETERANGAN</label>
              <input
                type="text"
                value={keterangan}
                onChange={e => setKeterangan(e.target.value)}
                placeholder="Contoh: Bayar listrik Februari, Tarik dana Shopee AzaleaFood..."
                style={inputS}
              />
            </div>

            {/* Tanggal */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>TANGGAL</label>
              <input
                type="date"
                value={tanggalManual}
                onChange={e => setTanggalManual(e.target.value)}
                style={{ ...inputS, colorScheme: "dark" }}
              />
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>Default hari ini — ubah kalau input mundur</div>
            </div>

            <button
              onClick={simpanKas}
              disabled={submitting}
              style={{
                width: "100%", padding: 13, border: "none", borderRadius: 10,
                background: submitting ? C.dim : tipe === "Masuk"
                  ? `linear-gradient(135deg, #065f46, ${C.green})`
                  : `linear-gradient(135deg, #7f1d1d, ${C.red})`,
                color: submitting ? C.muted : "#fff",
                fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: C.fontMono, fontSize: 14,
                boxShadow: submitting ? "none" : `0 4px 16px ${tipe === "Masuk" ? C.green : C.red}33`,
              }}
            >
              {submitting ? "Menyimpan..." : `✓ Simpan ${tipe === "Masuk" ? "Pemasukan" : "Pengeluaran"} ${nominal ? rupiahFmt(toAngka(nominal)) : ""}`}
            </button>
          </div>
        )}

        {/* ── TAB RIWAYAT ── */}
        {activeTab === "riwayat" && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontFamily: C.fontDisplay, fontSize: 18, color: "#f0eaff", fontWeight: 400 }}>
                Riwayat Transaksi Kas
              </h3>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
                {kasFiltered.length} transaksi
              </div>
            </div>

            {/* Filter bar */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10, marginBottom: 16 }}>
              <input
                type="text"
                value={filterSearch}
                onChange={e => { setFilterSearch(e.target.value); setCurrentPage(1); }}
                placeholder="🔍 Cari keterangan atau kategori..."
                style={{ ...inputS, padding: "8px 12px" }}
              />
              <select value={filterBulan} onChange={e => { setFilterBulan(e.target.value); setCurrentPage(1); }} style={{ ...inputS, width: 140 }}>
                <option value="">Semua Bulan</option>
                {bulanList.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
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

            {/* Summary filter */}
            {kasFiltered.length > 0 && (
              <div style={{ display: "flex", gap: 12, marginBottom: 16, padding: "10px 14px", background: "#0f0b1a", borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, color: C.green, fontFamily: C.fontMono, fontWeight: 700 }}>
                  ↑ {rupiahFmt(totalMasuk)}
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>·</div>
                <div style={{ fontSize: 12, color: C.red, fontFamily: C.fontMono, fontWeight: 700 }}>
                  ↓ {rupiahFmt(totalKeluar)}
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>·</div>
                <div style={{ fontSize: 12, color: saldoBulanIni >= 0 ? C.green : C.red, fontFamily: C.fontMono, fontWeight: 700 }}>
                  = {rupiahFmt(Math.abs(saldoBulanIni))} {saldoBulanIni >= 0 ? "surplus" : "defisit"}
                </div>
              </div>
            )}

            {kasFiltered.length === 0 && (
              <div style={{ textAlign: "center", color: C.dim, padding: "40px 0", fontFamily: C.fontMono, fontSize: 13 }}>
                Tidak ada transaksi ditemukan
              </div>
            )}

            {/* List transaksi */}
            {kasPage.map((k, idx) => (
              <div key={k.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 0",
                borderBottom: `1px solid ${C.border}`,
                background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                  {/* Indikator tipe */}
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: k.tipe === "Masuk" ? C.green : C.red,
                    boxShadow: `0 0 6px ${k.tipe === "Masuk" ? C.green : C.red}60`,
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                        background: (k.tipe === "Masuk" ? C.green : C.red) + "20",
                        color: k.tipe === "Masuk" ? C.green : C.red,
                        fontFamily: C.fontMono,
                      }}>{k.kategori}</span>
                      <span style={{ fontSize: 13, color: C.textMid, fontWeight: 500 }}>{k.keterangan}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.dim, fontFamily: C.fontMono }}>
                      {tanggalFmt(k.created_at)}
                    </div>
                  </div>
                </div>
                <div style={{
                  fontWeight: 700, fontSize: 14, fontFamily: C.fontMono,
                  color: k.tipe === "Masuk" ? C.green : C.red,
                  whiteSpace: "nowrap", marginLeft: 16,
                }}>
                  {k.tipe === "Masuk" ? "+" : "−"}{rupiahFmt(k.nominal)}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
                  {kasFiltered.length} transaksi · hal {currentPage}/{totalPages}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                    style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: currentPage === 1 ? C.dim : C.muted, cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: 12 }}>
                    ← Prev
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                    if (page < 1 || page > totalPages) return null;
                    return (
                      <button key={page} onClick={() => setCurrentPage(page)} style={{
                        padding: "6px 10px",
                        background: page === currentPage ? C.accent + "20" : "transparent",
                        border: `1px solid ${page === currentPage ? C.accent + "60" : C.border}`,
                        borderRadius: 6, color: page === currentPage ? C.accent : C.muted,
                        cursor: "pointer", fontSize: 12, fontWeight: page === currentPage ? 700 : 400,
                      }}>{page}</button>
                    );
                  })}
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                    style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 6, color: currentPage === totalPages ? C.dim : C.muted, cursor: currentPage === totalPages ? "not-allowed" : "pointer", fontSize: 12 }}>
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
