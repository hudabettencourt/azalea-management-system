"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import {
  AreaChart, Area, LineChart, Line,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

type KasRow = { tipe: string; nominal: number; kategori: string; keterangan: string; created_at: string };
type StokBarang = { id: number; nama_produk: string; jumlah_stok: number; harga_jual: number; satuan: string };
type BahanAlert = { id: number; nama: string; stok: number; satuan: string; kategori: string };
type ProduksiBatch = { total_hpp: number; created_at: string };
type GajiRow = { nominal: number; tipe_beban: string; tanggal: string };

const bulanNama = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const rupiahShort = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${sign}Rp ${(abs / 1_000).toFixed(0)}rb`;
  return `${sign}${rupiahFmt(abs)}`;
};
const tanggalFmt = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" });

export default function DashboardPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const DONUT_COLORS = [C.accent, C.green, C.blue, C.yellow, C.orange, C.purple];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: C.card, border: `1px solid ${C.borderStrong}`,
        borderRadius: 10, padding: "10px 14px",
        fontFamily: C.fontMono, fontSize: 12,
        boxShadow: C.shadowMd,
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

  const [loading, setLoading] = useState(true);
  const [saldo, setSaldo] = useState(0);
  const [omzetHariIni, setOmzetHariIni] = useState(0);
  const [omzetBulanIni, setOmzetBulanIni] = useState(0);
  const [labaBulanIni, setLabaBulanIni] = useState(0);
  const [piutangOnline, setPiutangOnline] = useState(0);
  const [piutangOffline, setPiutangOffline] = useState(0);
  const [hutangTotal, setHutangTotal] = useState(0);
  const [gajiHariIni, setGajiHariIni] = useState(0);
  const [stokBarang, setStokBarang] = useState<StokBarang[]>([]);
  const [bahanAlert, setBahanAlert] = useState<BahanAlert[]>([]);
  const [recentTrx, setRecentTrx] = useState<KasRow[]>([]);
  const [chartBulanan, setChartBulanan] = useState<any[]>([]);
  const [chartLR, setChartLR] = useState<any[]>([]);
  const [donutData, setDonutData] = useState<any[]>([]);
  const [userName, setUserName] = useState("Owner");
  const [jamSekarang, setJamSekarang] = useState("");
  const [filterChart, setFilterChart] = useState<"3" | "6" | "12">("6");

  const fetchData = useCallback(async () => {
    try {
      const now = new Date();
      const hariIni = now.toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
      const bulanMulai = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [
        resKasAll, resKasHariIni, resKasBulan, resRecentTrx,
        resStok, resBahanAlert, resHutang,
        resPiutangOnline, resRetur, resPencairan, resFee,
        resPiutangOffline, resProduksi, resGaji, resUser,
      ] = await Promise.all([
        supabase.from("kas").select("tipe, nominal, kategori, keterangan, created_at"),
        supabase.from("kas").select("nominal").eq("tipe", "Masuk").gte("created_at", hariIni),
        supabase.from("kas").select("tipe, nominal").gte("created_at", bulanMulai),
        supabase.from("kas").select("tipe, nominal, kategori, keterangan, created_at").order("created_at", { ascending: false }).limit(8),
        supabase.from("stok_barang").select("id, nama_produk, jumlah_stok, harga_jual, satuan").order("jumlah_stok"),
        supabase.from("bahan_baku").select("id, nama, stok, satuan, kategori").or("aktif.eq.true,aktif.is.null").lte("stok", 5).order("stok"),
        supabase.from("hutang_supplier_bahan").select("nominal").eq("status", "Belum Lunas"),
        supabase.from("penjualan_online").select("total_nominal, total_ditarik"),
        supabase.from("retur_online").select("nominal"),
        supabase.from("pencairan_online").select("nominal_cair"),
        supabase.from("fee_platform").select("total_fee"),
        supabase.from("piutang").select("nominal").eq("status", "Belum Lunas"),
        supabase.from("produksi_batch").select("total_hpp, created_at"),
        supabase.from("gaji_harian").select("nominal, tipe_beban, tanggal"),
        supabase.auth.getUser(),
      ]);

      const kasAll: KasRow[] = resKasAll.data || [];

      // Saldo
      setSaldo(kasAll.reduce((a, k) => k.tipe === "Masuk" ? a + k.nominal : a - k.nominal, 0));
      setOmzetHariIni((resKasHariIni.data || []).reduce((a: number, k: any) => a + k.nominal, 0));

      const kasBulan = resKasBulan.data || [];
      const omzetBln = kasBulan.filter((k: any) => k.tipe === "Masuk").reduce((a: number, k: any) => a + k.nominal, 0);
      const bebanBln = kasBulan.filter((k: any) => k.tipe === "Keluar").reduce((a: number, k: any) => a + k.nominal, 0);
      setOmzetBulanIni(omzetBln);

      const produksiBulan = (resProduksi.data || []).filter((p: ProduksiBatch) => p.created_at >= bulanMulai);
      const hppBulan = produksiBulan.reduce((a: number, p: ProduksiBatch) => a + (p.total_hpp || 0), 0);
      const gajiBulanHPP = (resGaji.data || [])
        .filter((g: GajiRow) => g.tanggal >= hariIni.slice(0, 7) && g.tipe_beban === "HPP")
        .reduce((a: number, g: GajiRow) => a + g.nominal, 0);
      setLabaBulanIni(omzetBln - hppBulan - gajiBulanHPP - bebanBln);

      // Piutang online
      const totalNominal = (resPiutangOnline.data || []).reduce((a: number, p: any) => a + (p.total_nominal || 0), 0);
      const totalDitarik = (resPiutangOnline.data || []).reduce((a: number, p: any) => a + (p.total_ditarik || 0), 0);
      const totalRetur = (resRetur.data || []).reduce((a: number, r: any) => a + (r.nominal || 0), 0);
      const totalFee = (resFee.data || []).reduce((a: number, f: any) => a + (f.total_fee || 0), 0);
      setPiutangOnline(Math.max(totalNominal - totalDitarik - totalRetur - totalFee, 0));

      setPiutangOffline((resPiutangOffline.data || []).reduce((a: number, p: any) => a + p.nominal, 0));
      setHutangTotal((resHutang.data || []).reduce((a: number, h: any) => a + h.nominal, 0));
      setGajiHariIni((resGaji.data || []).filter((g: GajiRow) => g.tanggal === hariIni).reduce((a: number, g: GajiRow) => a + g.nominal, 0));
      setStokBarang(resStok.data || []);
      setBahanAlert(resBahanAlert.data || []);
      setRecentTrx(resRecentTrx.data || []);

      const user = resUser.data.user;
      if (user?.user_metadata?.name) setUserName(user.user_metadata.name);
      else if (user?.email) setUserName(user.email.split("@")[0]);

      // Chart 12 bulan
      const bulanChart: any[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mulai = d.toISOString().slice(0, 7);
        const kasB = kasAll.filter(k => k.created_at?.slice(0, 7) === mulai);
        const omzet = kasB.filter(k => k.tipe === "Masuk").reduce((a, k) => a + k.nominal, 0);
        const beban = kasB.filter(k => k.tipe === "Keluar").reduce((a, k) => a + k.nominal, 0);
        const hpp = (resProduksi.data || []).filter((p: ProduksiBatch) => p.created_at?.slice(0, 7) === mulai).reduce((a: number, p: ProduksiBatch) => a + (p.total_hpp || 0), 0);
        const gajiHpp = (resGaji.data || []).filter((g: GajiRow) => g.tanggal?.slice(0, 7) === mulai && g.tipe_beban === "HPP").reduce((a: number, g: GajiRow) => a + g.nominal, 0);
        bulanChart.push({ bulan: bulanNama[d.getMonth()], omzet, beban: hpp + gajiHpp + beban, laba: omzet - hpp - gajiHpp - beban });
      }
      setChartBulanan(bulanChart);

      // Chart L/R 6 bulan
      const lrChart: any[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mulai = d.toISOString().slice(0, 7);
        const kasB = kasAll.filter(k => k.created_at?.slice(0, 7) === mulai);
        const pendapatan = kasB.filter(k => k.tipe === "Masuk").reduce((a, k) => a + k.nominal, 0);
        const hpp = (resProduksi.data || []).filter((p: ProduksiBatch) => p.created_at?.slice(0, 7) === mulai).reduce((a: number, p: ProduksiBatch) => a + (p.total_hpp || 0), 0);
        const gajiHpp = (resGaji.data || []).filter((g: GajiRow) => g.tanggal?.slice(0, 7) === mulai && g.tipe_beban === "HPP").reduce((a: number, g: GajiRow) => a + g.nominal, 0);
        const gajiOps = (resGaji.data || []).filter((g: GajiRow) => g.tanggal?.slice(0, 7) === mulai && g.tipe_beban === "Operasional").reduce((a: number, g: GajiRow) => a + g.nominal, 0);
        const bebanOps = kasB.filter(k => k.tipe === "Keluar").reduce((a, k) => a + k.nominal, 0);
        const labaKotor = pendapatan - hpp - gajiHpp;
        lrChart.push({
          bulan: bulanNama[d.getMonth()],
          "Laba Kotor": Math.max(labaKotor, 0),
          "Laba Bersih": labaKotor - gajiOps - bebanOps,
          "HPP": hpp + gajiHpp,
          "Beban Ops": gajiOps + bebanOps,
        });
      }
      setChartLR(lrChart);

      setDonutData([
        { name: "HPP Produksi", value: hppBulan },
        { name: "Gaji HPP", value: gajiBulanHPP },
        { name: "Beban Ops", value: bebanBln },
      ].filter(d => d.value > 0));

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const updateJam = () => setJamSekarang(
      new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
    );
    updateJam();
    const interval = setInterval(updateJam, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const greeting = () => {
    const h = parseInt(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Jakarta" }));
    if (h < 11) return "Selamat pagi";
    if (h < 15) return "Selamat siang";
    if (h < 18) return "Selamat sore";
    return "Selamat malam";
  };

  const filteredChart = filterChart === "3" ? chartBulanan.slice(-3) : filterChart === "6" ? chartBulanan.slice(-6) : chartBulanan;
  const stokKritis = stokBarang.filter(s => s.jumlah_stok <= 10);
  const piutangTotal = piutangOnline + piutangOffline;

  const statCards = [
    { label: "Saldo Kas", value: rupiahShort(saldo), sub: "Total kas bersih", color: C.accent, dim: C.accentGlow, icon: "◈", href: "/kas", hint: "Lihat kas →", bg: C.cardTeal },
    { label: "Omzet Hari Ini", value: rupiahShort(omzetHariIni), sub: "Kas masuk hari ini", color: C.teal, dim: C.tealDim, icon: "↑", href: "/penjualan", hint: "Lihat penjualan →", bg: C.cardTeal },
    { label: "Omzet Bulan Ini", value: rupiahShort(omzetBulanIni), sub: "Bulan berjalan", color: C.blue, dim: C.blueDim, icon: "📈", href: "/penjualan", hint: "Lihat penjualan →", bg: C.cardBlue },
    { label: "Laba Bersih", value: rupiahShort(labaBulanIni), sub: labaBulanIni >= 0 ? "Profit bulan ini 🎉" : "Rugi bulan ini ⚠", color: labaBulanIni >= 0 ? C.green : C.red, dim: labaBulanIni >= 0 ? C.greenDim : C.redDim, icon: labaBulanIni >= 0 ? "✓" : "!", href: "/laporan", hint: "Lihat laporan →", bg: labaBulanIni >= 0 ? C.cardGreen : C.cardRed },
    { label: "Piutang", value: rupiahShort(piutangTotal), sub: "Online + Offline", color: C.yellow, dim: C.yellowDim, icon: "📝", href: "/penjualan", hint: "Lihat piutang →", bg: C.cardYellow },
    { label: "Hutang Supplier", value: rupiahShort(hutangTotal), sub: "Belum dibayar", color: C.orange, dim: C.orangeDim, icon: "⚠", href: "/pembelian-bahan", hint: "Lihat hutang →", bg: C.cardOrange },
    { label: "Gaji Hari Ini", value: rupiahFmt(gajiHariIni), sub: "Total dibayarkan", color: C.purple, dim: C.purpleDim, icon: "👥", href: "/penggajian", hint: "Lihat gaji →", bg: C.cardPurple },
    { label: "Stok Kritis", value: `${stokKritis.length} produk`, sub: stokKritis.length > 0 ? stokKritis.map(s => s.nama_produk).slice(0, 2).join(", ") : "Semua aman ✓", color: stokKritis.length > 0 ? C.red : C.green, dim: stokKritis.length > 0 ? C.redDim : C.greenDim, icon: "📦", href: "/produksi", hint: "Lihat stok →", bg: stokKritis.length > 0 ? C.cardRed : C.cardGreen },
  ];

  const quickLinks = [
    { label: "Input Penjualan", href: "/penjualan", icon: "🛍️", color: C.accent },
    { label: "Input Produksi", href: "/produksi", icon: "⚙️", color: C.blue },
    { label: "Input Gaji", href: "/penggajian", icon: "👥", color: C.purple },
    { label: "Catat Kas", href: "/kas", icon: "💰", color: C.green },
    { label: "Lihat Laporan", href: "/laporan", icon: "📊", color: C.yellow },
    { label: "Upload Shopee", href: "/penjualan", icon: "📤", color: C.orange },
  ];

  return (
    <Sidebar>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

        .stat-card {
          animation: fadeUp 0.3s ease both;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
          text-decoration: none !important;
          display: block;
        }
        .stat-card:hover { transform: translateY(-3px); box-shadow: ${C.shadowHover} !important; }
        .quick-btn { transition: all 0.15s ease; text-decoration: none !important; }
        .quick-btn:hover { transform: translateY(-2px); filter: brightness(1.08); }
        .chart-card { transition: box-shadow 0.18s ease; }
        .chart-card:hover { box-shadow: ${C.shadowMd} !important; }
        .trx-row { transition: background 0.12s; border-radius: 8px; }
        .trx-row:hover { background: ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"} !important; }
        .filter-btn { cursor: pointer; transition: all 0.12s; border: none; }
      `}</style>

      <div style={{ background: C.bgPage, minHeight: "100vh", padding: "20px 24px", fontFamily: C.fontSans, color: C.text }}>

        {/* ── Greeting ── */}
        <div style={{
          background: C.card, borderRadius: 16, padding: "16px 20px",
          marginBottom: 20, border: `1px solid ${C.border}`,
          boxShadow: C.shadow,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 3 }}>
              {new Date().toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })}
              {jamSekarang && <span style={{ marginLeft: 8, color: C.accent, fontWeight: 700 }}>{jamSekarang} WIB</span>}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>
              {greeting()}, <span style={{ color: C.accent }}>{userName}</span> 🌸
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Ringkasan bisnis Azalea hari ini</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/laporan" className="quick-btn" style={{
              padding: "8px 16px", borderRadius: 10,
              background: C.accentGlow, border: `1px solid ${C.accent}40`,
              color: C.accent, fontWeight: 700, fontSize: 12, fontFamily: C.fontSans,
            }}>📊 Laporan L/R</a>
            <a href="/rekap-saldo" className="quick-btn" style={{
              padding: "8px 16px", borderRadius: 10,
              background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
              border: `1px solid ${C.border}`,
              color: C.muted, fontWeight: 600, fontSize: 12, fontFamily: C.fontSans,
            }}>Rekap Saldo</a>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: C.muted }}>
            <div style={{ fontSize: 36, marginBottom: 12, animation: "pulse 1.5s infinite", color: C.accent }}>◈</div>
            <div style={{ fontFamily: C.fontMono, fontSize: 13 }}>Memuat data bisnis...</div>
          </div>
        ) : (
          <>
            {/* ── Stat Cards ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              {statCards.map((s, i) => (
                <a key={i} href={s.href} className="stat-card" style={{
                  background: isDark ? C.card : s.bg,
                  border: `1px solid ${isDark ? C.border : s.color + "25"}`,
                  borderRadius: 14, padding: "16px 18px",
                  position: "relative", overflow: "hidden",
                  animationDelay: `${i * 40}ms`,
                  boxShadow: C.shadow, color: "inherit",
                }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${s.color}, ${s.color}40)`, borderRadius: "14px 14px 0 0" }} />
                  <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 80, background: `radial-gradient(circle at top right, ${s.color}20, transparent 70%)` }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, marginTop: 4 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: C.fontMono }}>{s.label}</div>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: s.dim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: s.color }}>{s.icon}</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 3, lineHeight: 1.15 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, fontFamily: C.fontMono }}>{s.sub}</div>
                  <div style={{ fontSize: 10, color: s.color, fontWeight: 700, fontFamily: C.fontMono }}>{s.hint}</div>
                </a>
              ))}
            </div>

            {/* ── Charts Row ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.65fr", gap: 12, marginBottom: 16 }}>

              {/* Area Chart */}
              <div className="chart-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: C.shadow }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Omzet & Laba</div>
                    <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>Tren bulanan</div>
                  </div>
                  <div style={{ display: "flex", gap: 3, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", borderRadius: 8, padding: 3 }}>
                    {(["3", "6", "12"] as const).map(f => (
                      <button key={f} className="filter-btn" onClick={() => setFilterChart(f)} style={{
                        padding: "4px 10px", borderRadius: 6, fontSize: 11,
                        fontFamily: C.fontMono, fontWeight: 700,
                        background: filterChart === f ? C.accent : "transparent",
                        color: filterChart === f ? "#fff" : C.muted,
                      }}>{f}B</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 14, marginBottom: 10, fontSize: 11, fontFamily: C.fontMono }}>
                  <span style={{ color: C.accent }}>● Omzet</span>
                  <span style={{ color: C.green }}>● Laba</span>
                  <span style={{ color: C.red }}>● Beban</span>
                </div>
                <ResponsiveContainer width="100%" height={170}>
                  <AreaChart data={filteredChart} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gO" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.accent} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.green} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.dim} vertical={false} />
                    <XAxis dataKey="bulan" tick={{ fill: C.muted, fontSize: 10, fontFamily: C.fontMono }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={rupiahShort} tick={{ fill: C.muted, fontSize: 10, fontFamily: C.fontMono }} axisLine={false} tickLine={false} width={55} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="omzet" name="Omzet" stroke={C.accent} strokeWidth={2} fill="url(#gO)" dot={false} />
                    <Area type="monotone" dataKey="laba" name="Laba" stroke={C.green} strokeWidth={2} fill="url(#gL)" dot={false} />
                    <Line type="monotone" dataKey="beban" name="Beban" stroke={C.red} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Bar Chart */}
              <a href="/laporan" style={{ textDecoration: "none" }}>
                <div className="chart-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, height: "100%", cursor: "pointer", boxShadow: C.shadow }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>Laba Rugi</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 12 }}>6 bulan · klik untuk detail</div>
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={chartLR} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.dim} vertical={false} />
                      <XAxis dataKey="bulan" tick={{ fill: C.muted, fontSize: 10, fontFamily: C.fontMono }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={rupiahShort} tick={{ fill: C.muted, fontSize: 10, fontFamily: C.fontMono }} axisLine={false} tickLine={false} width={50} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="Laba Kotor" fill={C.blue} radius={[3, 3, 0, 0]} opacity={0.85} />
                      <Bar dataKey="Laba Bersih" fill={C.green} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="HPP" fill={C.red} radius={[3, 3, 0, 0]} opacity={0.65} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </a>

              {/* Donut */}
              <div className="chart-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: C.shadow }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>Distribusi Beban</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 8 }}>Bulan ini</div>
                {donutData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={110}>
                      <PieChart>
                        <Pie data={donutData} cx="50%" cy="50%" innerRadius={30} outerRadius={48} paddingAngle={3} dataKey="value">
                          {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => rupiahShort(v)} contentStyle={{ background: C.card, border: `1px solid ${C.borderStrong}`, borderRadius: 8, fontFamily: C.fontMono, fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                      {donutData.map((d, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: C.fontMono }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{ width: 7, height: 7, borderRadius: 2, background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                            <span style={{ color: C.muted }}>{d.name}</span>
                          </div>
                          <span style={{ color: C.text, fontWeight: 700 }}>{rupiahShort(d.value)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "30px 0", color: C.muted, fontSize: 12, fontFamily: C.fontMono }}>Belum ada data</div>
                )}
              </div>
            </div>

            {/* ── Bottom Row ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>

              {/* Stok Produk */}
              <a href="/produksi" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="chart-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, cursor: "pointer", boxShadow: C.shadow }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Monitor Stok</div>
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
                        {stokKritis.length > 0 ? <span style={{ color: C.red }}>{stokKritis.length} produk kritis ⚠</span> : <span style={{ color: C.green }}>semua aman ✓</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: C.accent, fontWeight: 700, fontFamily: C.fontMono }}>→</span>
                  </div>
                  {stokBarang.slice(0, 5).map(s => {
                    const isKritis = s.jumlah_stok <= 10;
                    return (
                      <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1fr 40px 30px", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.textMid }}>{s.nama_produk}</div>
                          <div style={{ height: 3, borderRadius: 2, background: C.dim, marginTop: 4, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, s.jumlah_stok)}%`, background: isKritis ? C.red : C.green, borderRadius: 2 }} />
                          </div>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: isKritis ? C.red : C.green, textAlign: "right" }}>{s.jumlah_stok}</div>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>{s.satuan}</div>
                      </div>
                    );
                  })}
                </div>
              </a>

              {/* Transaksi Terakhir */}
              <a href="/kas" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="chart-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, cursor: "pointer", boxShadow: C.shadow }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Transaksi Terakhir</div>
                    <span style={{ fontSize: 11, color: C.accent, fontWeight: 700, fontFamily: C.fontMono }}>→</span>
                  </div>
                  {recentTrx.length === 0 ? (
                    <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "20px 0" }}>Belum ada transaksi</div>
                  ) : recentTrx.slice(0, 5).map((t, i) => (
                    <div key={i} className="trx-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 6px", borderBottom: `1px solid ${C.border}` }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.kategori}</div>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(t.created_at)}</div>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.tipe === "Masuk" ? C.green : C.red, fontFamily: C.fontMono }}>
                        {t.tipe === "Masuk" ? "+" : "−"}{rupiahShort(t.nominal)}
                      </div>
                    </div>
                  ))}
                </div>
              </a>

              {/* Quick Actions */}
              <div className="chart-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: C.shadow }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>Aksi Cepat</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 14 }}>Shortcut input data</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {quickLinks.map((link, i) => (
                    <a key={i} href={link.href} className="quick-btn" style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "10px 12px",
                      background: isDark ? `${link.color}12` : `${link.color}12`,
                      border: `1px solid ${link.color}25`,
                      borderRadius: 10, color: link.color,
                      fontWeight: 700, fontSize: 12, fontFamily: C.fontSans,
                    }}>
                      <span style={{ fontSize: 15 }}>{link.icon}</span>
                      <span>{link.label}</span>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Sidebar>
  );
}
