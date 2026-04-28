"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import {
  AreaChart, Area, LineChart, Line,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ── Types ──
type KasRow = { tipe: string; nominal: number; kategori: string; created_at: string };
type StokBarang = { id: number; nama_produk: string; jumlah_stok: number; harga_jual: number; satuan: string };
type ProduksiBatch = { total_hpp: number; created_at: string };
type GajiRow = { nominal: number; tipe_beban: string; tanggal: string };
type ReturRow = { nominal: number; created_at: string };

const C = {
  bg: "#0d0a14",
  card: "#13101e",
  cardBorder: "#1e1830",
  cardBorderStrong: "#2d2248",
  text: "#ede8ff",
  textMid: "#c4b8e8",
  muted: "#7a6d90",
  dim: "#3a2f52",
  accent: "#a78bfa",
  accentGlow: "#a78bfa40",
  green: "#34d399",
  greenGlow: "#34d39930",
  red: "#f87171",
  yellow: "#fbbf24",
  blue: "#60a5fa",
  orange: "#fb923c",
  purple: "#c084fc",
  pink: "#f472b6",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const rupiahShort = (n: number) => {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return rupiahFmt(n);
};

const bulanNama = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1a1430", border: `1px solid ${C.cardBorderStrong}`,
      borderRadius: 10, padding: "10px 14px", fontFamily: C.fontMono, fontSize: 12,
    }}>
      <div style={{ color: C.muted, marginBottom: 6, fontWeight: 700 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{rupiahShort(p.value)}</strong>
        </div>
      ))}
    </div>
  );
};

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [saldo, setSaldo] = useState(0);
  const [omzetHariIni, setOmzetHariIni] = useState(0);
  const [omzetBulanIni, setOmzetBulanIni] = useState(0);
  const [labaBulanIni, setLabaBulanIni] = useState(0);
  const [piutangTotal, setPiutangTotal] = useState(0);
  const [hutangTotal, setHutangTotal] = useState(0);
  const [gajiHariIni, setGajiHariIni] = useState(0);
  const [stokBarang, setStokBarang] = useState<StokBarang[]>([]);
  const [chartBulanan, setChartBulanan] = useState<any[]>([]);
  const [chartLR, setChartLR] = useState<any[]>([]);
  const [userName, setUserName] = useState("Owner");
  const [jamSekarang, setJamSekarang] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const now = new Date();
      const hariIni = now.toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
      const bulanMulai = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Ambil semua data sekaligus
      const [
        resKasAll, resKasHariIni, resKasBulan,
        resStok, resHutang, resPiutang,
        resProduksi, resGaji, resRetur,
        resUser,
      ] = await Promise.all([
        supabase.from("kas").select("tipe, nominal, kategori, created_at"),
        supabase.from("kas").select("tipe, nominal, kategori, created_at").eq("tipe", "Masuk").gte("created_at", hariIni),
        supabase.from("kas").select("tipe, nominal, kategori, created_at").gte("created_at", bulanMulai),
        supabase.from("stok_barang").select("id, nama_produk, jumlah_stok, harga_jual, satuan").order("jumlah_stok"),
        supabase.from("hutang_supplier_bahan").select("nominal").eq("status", "Belum Lunas"),
        supabase.from("piutang").select("nominal").eq("status", "Belum Lunas"),
        supabase.from("produksi_batch").select("total_hpp, created_at"),
        supabase.from("gaji_harian").select("nominal, tipe_beban, tanggal"),
        supabase.from("retur_shopee").select("nominal, created_at"),
        supabase.auth.getUser(),
      ]);

      // ── Saldo ──
      const kasAll: KasRow[] = resKasAll.data || [];
      const saldoTotal = kasAll.reduce((a, k) => k.tipe === "Masuk" ? a + k.nominal : a - k.nominal, 0);
      setSaldo(saldoTotal);

      // ── Omzet hari ini ──
      setOmzetHariIni((resKasHariIni.data || []).reduce((a: number, k: any) => a + k.nominal, 0));

      // ── Omzet & Laba bulan ini ──
      const kasBulan: KasRow[] = resKasBulan.data || [];
      const omzetBln = kasBulan.filter(k => k.tipe === "Masuk").reduce((a, k) => a + k.nominal, 0);
      const bebanBln = kasBulan.filter(k => k.tipe === "Keluar").reduce((a, k) => a + k.nominal, 0);
      setOmzetBulanIni(omzetBln);

      // HPP bulan ini
      const produksiBulan = (resProduksi.data || []).filter((p: ProduksiBatch) =>
        p.created_at >= bulanMulai
      );
      const hppBulan = produksiBulan.reduce((a: number, p: ProduksiBatch) => a + (p.total_hpp || 0), 0);
      const gabiBulanHPP = (resGaji.data || [])
        .filter((g: GajiRow) => g.tanggal >= hariIni.slice(0, 7) && g.tipe_beban === "HPP")
        .reduce((a: number, g: GajiRow) => a + g.nominal, 0);
      const labaKotor = omzetBln - hppBulan - gabiBulanHPP;
      setLabaBulanIni(labaKotor - bebanBln);

      // ── Piutang & Hutang ──
      setPiutangTotal((resPiutang.data || []).reduce((a: number, p: any) => a + p.nominal, 0));
      setHutangTotal((resHutang.data || []).reduce((a: number, h: any) => a + h.nominal, 0));

      // ── Gaji hari ini ──
      setGajiHariIni((resGaji.data || [])
        .filter((g: GajiRow) => g.tanggal === hariIni)
        .reduce((a: number, g: GajiRow) => a + g.nominal, 0));

      // ── Stok ──
      setStokBarang(resStok.data || []);

      // ── User ──
      const user = resUser.data.user;
      if (user?.user_metadata?.name) setUserName(user.user_metadata.name);
      else if (user?.email) setUserName(user.email.split("@")[0]);

      // ── Chart Bulanan (12 bulan terakhir) ──
      const bulanChart: any[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mulai = d.toISOString().slice(0, 7); // YYYY-MM
        const kasB = kasAll.filter(k => k.created_at?.slice(0, 7) === mulai);
        const omzet = kasB.filter(k => k.tipe === "Masuk").reduce((a, k) => a + k.nominal, 0);
        const beban = kasB.filter(k => k.tipe === "Keluar").reduce((a, k) => a + k.nominal, 0);
        const hpp = (resProduksi.data || [])
          .filter((p: ProduksiBatch) => p.created_at?.slice(0, 7) === mulai)
          .reduce((a: number, p: ProduksiBatch) => a + (p.total_hpp || 0), 0);
        const gajiHpp = (resGaji.data || [])
          .filter((g: GajiRow) => g.tanggal?.slice(0, 7) === mulai && g.tipe_beban === "HPP")
          .reduce((a: number, g: GajiRow) => a + g.nominal, 0);
        const laba = omzet - hpp - gajiHpp - beban;
        bulanChart.push({
          bulan: bulanNama[d.getMonth()],
          omzet, beban: hpp + gajiHpp + beban, laba,
        });
      }
      setChartBulanan(bulanChart);

      // ── Chart L/R per bulan (6 bulan terakhir, lebih detail) ──
      const lrChart: any[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mulai = d.toISOString().slice(0, 7);
        const kasB = kasAll.filter(k => k.created_at?.slice(0, 7) === mulai);
        const pendapatan = kasB.filter(k => k.tipe === "Masuk").reduce((a, k) => a + k.nominal, 0);
        const hpp = (resProduksi.data || [])
          .filter((p: ProduksiBatch) => p.created_at?.slice(0, 7) === mulai)
          .reduce((a: number, p: ProduksiBatch) => a + (p.total_hpp || 0), 0);
        const gajiHpp = (resGaji.data || [])
          .filter((g: GajiRow) => g.tanggal?.slice(0, 7) === mulai && g.tipe_beban === "HPP")
          .reduce((a: number, g: GajiRow) => a + g.nominal, 0);
        const gajiOps = (resGaji.data || [])
          .filter((g: GajiRow) => g.tanggal?.slice(0, 7) === mulai && g.tipe_beban === "Operasional")
          .reduce((a: number, g: GajiRow) => a + g.nominal, 0);
        const bebanOps = kasB.filter(k => k.tipe === "Keluar").reduce((a, k) => a + k.nominal, 0);
        const labaKotor = pendapatan - hpp - gajiHpp;
        const labaBersih = labaKotor - gajiOps - bebanOps;
        lrChart.push({
          bulan: bulanNama[d.getMonth()],
          "Laba Kotor": Math.max(labaKotor, 0),
          "Laba Bersih": labaBersih,
          "HPP": hpp + gajiHpp,
          "Beban Ops": gajiOps + bebanOps,
        });
      }
      setChartLR(lrChart);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Update jam setiap menit
    const updateJam = () => {
      setJamSekarang(new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
      }));
    };
    updateJam();
    const interval = setInterval(updateJam, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const greeting = () => {
    const jam = new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jakarta" });
    const h = parseInt(jam);
    if (h < 11) return "Selamat pagi";
    if (h < 15) return "Selamat siang";
    if (h < 18) return "Selamat sore";
    return "Selamat malam";
  };

  const stokKritis = stokBarang.filter(s => s.jumlah_stok <= 10);
  const stokSehat = stokBarang.filter(s => s.jumlah_stok > 10);

  const quickLinks = [
    { label: "Input Penjualan", href: "/penjualan", icon: "🛍️", color: C.accent },
    { label: "Upload Shopee", href: "/penjualan", icon: "📤", color: C.purple },
    { label: "Input Produksi", href: "/produksi", icon: "⚙️", color: C.blue },
    { label: "Input Gaji", href: "/penggajian", icon: "👥", color: C.orange },
    { label: "Catat Kas", href: "/kas", icon: "💰", color: C.green },
    { label: "Lihat Laporan", href: "/laporan", icon: "📊", color: C.yellow },
  ];

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${C.cardBorder}; border-radius: 2px; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .stat-card {
          animation: fadeUp 0.4s ease both;
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .stat-card:hover {
          transform: translateY(-2px);
        }
        .quick-link {
          transition: all 0.15s ease;
        }
        .quick-link:hover {
          transform: translateY(-2px);
        }
        .stok-card {
          transition: all 0.15s ease;
        }
        .stok-card:hover {
          border-color: ${C.accent}60 !important;
        }
      `}</style>

      <div style={{
        background: C.bg,
        minHeight: "100vh",
        padding: "32px 28px",
        fontFamily: C.fontSans,
        color: C.text,
      }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, marginBottom: 6, letterSpacing: "0.08em" }}>
              {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })}
              {jamSekarang && <span style={{ marginLeft: 12, color: C.accent }}>{jamSekarang} WIB</span>}
            </div>
            <h1 style={{ fontFamily: C.fontDisplay, fontSize: 32, color: "#f5f0ff", fontWeight: 400, lineHeight: 1.1 }}>
              {greeting()}, <span style={{ color: C.accent }}>{userName}</span> 👋
            </h1>
            <p style={{ fontSize: 13, color: C.muted, fontFamily: C.fontMono, marginTop: 6 }}>
              Ini ringkasan bisnis Azalea hari ini
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/laporan" style={{
              padding: "9px 18px", borderRadius: 9,
              background: C.accentGlow, border: `1px solid ${C.accent}40`,
              color: C.accent, fontWeight: 700, fontSize: 13,
              textDecoration: "none", fontFamily: C.fontSans,
            }}>📊 Laporan</a>
            <a href="/dashboard" style={{
              padding: "9px 18px", borderRadius: 9,
              background: "rgba(255,255,255,0.04)", border: `1px solid ${C.cardBorderStrong}`,
              color: C.muted, fontWeight: 600, fontSize: 13,
              textDecoration: "none", fontFamily: C.fontSans,
            }}>Dashboard →</a>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: C.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12, animation: "pulse 1.5s infinite" }}>◈</div>
            <div style={{ fontFamily: C.fontMono, fontSize: 13 }}>Memuat data bisnis...</div>
          </div>
        ) : (
          <>
            {/* ── Stats Row 1 ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 }}>
              {[
                { label: "Saldo Kas", value: rupiahFmt(saldo), sub: "Total kas bersih", color: C.accent, icon: "◈", delay: "0ms" },
                { label: "Omzet Hari Ini", value: rupiahFmt(omzetHariIni), sub: "Kas masuk hari ini", color: C.green, icon: "↑", delay: "60ms" },
                { label: "Omzet Bulan Ini", value: rupiahShort(omzetBulanIni), sub: "Bulan berjalan", color: C.blue, icon: "📈", delay: "120ms" },
                { label: "Laba Bersih Bulan", value: rupiahShort(labaBulanIni), sub: labaBulanIni >= 0 ? "Profit 🎉" : "Rugi ⚠", color: labaBulanIni >= 0 ? C.green : C.red, icon: labaBulanIni >= 0 ? "✓" : "!", delay: "180ms" },
                { label: "Piutang Aktif", value: rupiahShort(piutangTotal), sub: "Belum lunas", color: C.yellow, icon: "📝", delay: "240ms" },
                { label: "Hutang Supplier", value: rupiahShort(hutangTotal), sub: "Belum dibayar", color: C.orange, icon: "⚠", delay: "300ms" },
                { label: "Gaji Hari Ini", value: rupiahFmt(gajiHariIni), sub: "Total dibayarkan", color: C.purple, icon: "👥", delay: "360ms" },
              ].map((s, i) => (
                <div key={i} className="stat-card" style={{
                  background: C.card,
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 16,
                  padding: "20px 22px",
                  position: "relative",
                  overflow: "hidden",
                  animationDelay: s.delay,
                }}>
                  {/* Glow corner */}
                  <div style={{
                    position: "absolute", top: 0, right: 0,
                    width: 80, height: 80,
                    background: `radial-gradient(circle at top right, ${s.color}18, transparent 70%)`,
                    borderRadius: "0 16px 0 0",
                  }} />
                  <div style={{ fontSize: 20, marginBottom: 10, color: s.color }}>{s.icon}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#f5f0ff", fontFamily: C.fontDisplay, marginBottom: 4 }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 11, color: C.dim }}>{s.sub}</div>
                  {/* Bottom accent line */}
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${s.color}60, transparent)`, borderRadius: "0 0 16px 16px" }} />
                </div>
              ))}
            </div>

            {/* ── Charts Row ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginBottom: 20 }}>

              {/* Chart Omzet 12 bulan */}
              <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontFamily: C.fontDisplay, fontSize: 16, color: "#f5f0ff", fontWeight: 400 }}>Omzet & Laba</div>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>12 bulan terakhir</div>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 11, fontFamily: C.fontMono }}>
                    <span style={{ color: C.accent }}>● Omzet</span>
                    <span style={{ color: C.green }}>● Laba</span>
                    <span style={{ color: C.red }}>● Beban</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartBulanan} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gradOmzet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.accent} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradLaba" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.green} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.cardBorderStrong} vertical={false} />
                    <XAxis dataKey="bulan" tick={{ fill: C.muted, fontSize: 11, fontFamily: C.fontMono }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => rupiahShort(v)} tick={{ fill: C.muted, fontSize: 10, fontFamily: C.fontMono }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="omzet" name="Omzet" stroke={C.accent} strokeWidth={2} fill="url(#gradOmzet)" dot={false} />
                    <Area type="monotone" dataKey="laba" name="Laba" stroke={C.green} strokeWidth={2} fill="url(#gradLaba)" dot={false} />
                    <Line type="monotone" dataKey="beban" name="Beban" stroke={C.red} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Chart L/R 6 bulan */}
              <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: 24 }}>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontFamily: C.fontDisplay, fontSize: 16, color: "#f5f0ff", fontWeight: 400 }}>Laba Rugi</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>6 bulan terakhir</div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartLR} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.cardBorderStrong} vertical={false} />
                    <XAxis dataKey="bulan" tick={{ fill: C.muted, fontSize: 11, fontFamily: C.fontMono }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => rupiahShort(v)} tick={{ fill: C.muted, fontSize: 10, fontFamily: C.fontMono }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="Laba Kotor" fill={C.blue} radius={[4, 4, 0, 0]} opacity={0.8} />
                    <Bar dataKey="Laba Bersih" fill={C.green} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="HPP" fill={C.red} radius={[4, 4, 0, 0]} opacity={0.6} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Stok Monitor ── */}
            <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: C.fontDisplay, fontSize: 16, color: "#f5f0ff", fontWeight: 400 }}>Monitor Stok Gudang</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
                    {stokBarang.length} produk · {stokKritis.length > 0 ? <span style={{ color: C.red }}>{stokKritis.length} kritis</span> : <span style={{ color: C.green }}>semua aman</span>}
                  </div>
                </div>
                <a href="/produksi" style={{
                  fontSize: 12, color: C.accent, fontFamily: C.fontMono,
                  textDecoration: "none", fontWeight: 700,
                  padding: "6px 12px", background: C.accentGlow, borderRadius: 6,
                  border: `1px solid ${C.accent}30`,
                }}>+ Input Produksi →</a>
              </div>

              {/* Stok kritis dulu */}
              {stokKritis.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.red, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                    ⚠ Stok Kritis
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                    {stokKritis.map(s => (
                      <div key={s.id} className="stok-card" style={{
                        background: `${C.red}10`,
                        border: `1px solid ${C.red}30`,
                        borderRadius: 12, padding: "14px 16px",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.textMid, marginBottom: 6 }}>{s.nama_produk}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: s.jumlah_stok <= 0 ? C.red : C.yellow, fontFamily: C.fontDisplay }}>
                          {s.jumlah_stok}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>{s.satuan} tersisa</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: C.fontMono }}>{rupiahFmt(s.harga_jual)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stok sehat */}
              <div>
                {stokKritis.length > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.green, fontFamily: C.fontMono, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                    ✓ Stok Aman
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                  {stokSehat.map(s => (
                    <div key={s.id} className="stok-card" style={{
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${C.cardBorderStrong}`,
                      borderRadius: 12, padding: "14px 16px",
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMid, marginBottom: 6 }}>{s.nama_produk}</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.green, fontFamily: C.fontDisplay }}>
                        {s.jumlah_stok}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>{s.satuan} tersisa</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: C.fontMono }}>{rupiahFmt(s.harga_jual)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Quick Actions ── */}
            <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: 24 }}>
              <div style={{ fontFamily: C.fontDisplay, fontSize: 16, color: "#f5f0ff", fontWeight: 400, marginBottom: 16 }}>
                Aksi Cepat
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                {quickLinks.map((link, i) => (
                  <a key={i} href={link.href} className="quick-link" style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "14px 16px",
                    background: link.color + "10",
                    border: `1px solid ${link.color}25`,
                    borderRadius: 12,
                    color: link.color,
                    fontWeight: 700, fontSize: 13,
                    textDecoration: "none",
                    fontFamily: C.fontSans,
                  }}>
                    <span style={{ fontSize: 18 }}>{link.icon}</span>
                    <span>{link.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Sidebar>
  );
}
