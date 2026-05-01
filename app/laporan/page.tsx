"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

type LaporanData = {
  omzet_shopee: number;
  omzet_offline: number;
  retur_pembatalan: number;
  fee_platform: number;
  total_pendapatan: number;
  hpp_bahan: number;
  hpp_gaji_operator: number;
  hpp_gaji_packing: number;
  total_hpp: number;
  laba_kotor: number;
  margin_kotor: number;
  biaya_gaji: number;
  biaya_transport: number;
  biaya_operasional_lain: number;
  biaya_zakat: number;
  total_biaya_operasional: number;
  laba_bersih: number;
  margin_bersih: number;
};

type ProdukProfit = {
  nama_produk: string;
  qty_terjual: number;
  omzet: number;
  hpp: number;
  profit: number;
  margin: number;
};

type ChartDataPoint = {
  tanggal: string;
  omzet: number;
  laba: number;
  beban: number;
};

type Toast = { msg: string; type: "success" | "error" | "info" };

const rupiahFmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
const rupiahShort = (n: number) => {
  const val = Math.round(n || 0);
  if (Math.abs(val) >= 1000000) return `${(val / 1000000).toFixed(1)}jt`;
  if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(0)}rb`;
  return val.toString();
};
const pctFmt = (n: number) => `${(n || 0).toFixed(1)}%`;

const C = {
  bg: "#100c16",
  card: "#1a1425",
  border: "#2a1f3d",
  text: "#e2d9f3",
  textMid: "#c0aed4",
  muted: "#7c6d8a",
  dim: "#3d3050",
  accent: "#a78bfa",
  success: "#34d399",
  danger: "#f87171",
  warning: "#fbbf24",
  blue: "#60a5fa",
  orange: "#fb923c",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

export default function LaporanPage() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [laporan, setLaporan] = useState<LaporanData | null>(null);
  const [produkProfit, setProdukProfit] = useState<ProdukProfit[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [activeTab, setActiveTab] = useState<"summary" | "produk">("summary");
  const [filterMode, setFilterMode] = useState<"bulan" | "custom">("bulan");
  const [bulanTerpilih, setBulanTerpilih] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [tanggalMulai, setTanggalMulai] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [tanggalSelesai, setTanggalSelesai] = useState(() =>
    new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" })
  );
  const [periodeLabel, setPeriodeLabel] = useState("");

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const daftarBulan = useMemo(() => {
    const result = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
      result.push({ key, label });
    }
    return result;
  }, []);

  const { startDate, endDate } = useMemo(() => {
    if (filterMode === "bulan") {
      const [year, month] = bulanTerpilih.split("-").map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    } else {
      return {
        startDate: new Date(tanggalMulai + "T00:00:00+07:00").toISOString(),
        endDate: new Date(tanggalSelesai + "T23:59:59+07:00").toISOString(),
      };
    }
  }, [filterMode, bulanTerpilih, tanggalMulai, tanggalSelesai]);

  useEffect(() => {
    if (filterMode === "bulan") {
      const found = daftarBulan.find(b => b.key === bulanTerpilih);
      setPeriodeLabel(found?.label || bulanTerpilih);
    } else {
      setPeriodeLabel(`${tanggalMulai} s/d ${tanggalSelesai}`);
    }
  }, [filterMode, bulanTerpilih, tanggalMulai, tanggalSelesai, daftarBulan]);

  const fetchChartData = useCallback(async () => {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const groupByWeek = daysDiff > 31;

      const [shopeeRes, offlineRes, returRes, produksiRes, kasKeluarRes] = await Promise.all([
        supabase.from("penjualan_online").select("total_nominal, created_at").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("kas").select("nominal, created_at").eq("tipe", "Masuk").eq("kategori", "Offline").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("retur_online").select("nominal, created_at").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("produksi_batch").select("total_hpp, created_at").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("kas").select("nominal, created_at").eq("tipe", "Keluar").gte("created_at", startDate).lte("created_at", endDate),
      ]);

      const getKey = (dateStr: string) => {
        const d = new Date(dateStr);
        if (groupByWeek) {
          const ws = new Date(d);
          ws.setDate(d.getDate() - d.getDay());
          return ws.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
        }
        return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      };

      const map: Record<string, { omzet: number; beban: number }> = {};
      const add = (dateStr: string, field: "omzet" | "beban", val: number) => {
        const k = getKey(dateStr);
        if (!map[k]) map[k] = { omzet: 0, beban: 0 };
        map[k][field] += val;
      };

      (shopeeRes.data || []).forEach(r => add(r.created_at, "omzet", r.total_nominal || 0));
      (offlineRes.data || []).forEach(r => add(r.created_at, "omzet", r.nominal || 0));
      (returRes.data || []).forEach(r => add(r.created_at, "omzet", -(r.nominal || 0)));
      (produksiRes.data || []).forEach(r => add(r.created_at, "beban", r.total_hpp || 0));
      (kasKeluarRes.data || []).forEach(r => add(r.created_at, "beban", r.nominal || 0));

      const points: ChartDataPoint[] = Object.entries(map).map(([tanggal, d]) => ({
        tanggal,
        omzet: d.omzet,
        beban: d.beban,
        laba: d.omzet - d.beban,
      }));

      setChartData(points);
    } catch (err) {
      console.error("Chart error:", err);
    }
  }, [startDate, endDate]);

  const fetchLaporan = useCallback(async () => {
    setLoading(true);
    try {
      // Fix timezone WIB untuk filter fee_platform
const startDateStr = new Date(new Date(startDate).getTime() + 7 * 60 * 60 * 1000)
  .toISOString().slice(0, 10);
const endDateStr = new Date(new Date(endDate).getTime() + 7 * 60 * 60 * 1000)
  .toISOString().slice(0, 10);

      const [shopeeRes, offlineRes, returRes, produksiRes, feeRes, gajiRes, transportRes, opsRes, zakatRes, gajiHarianRes] = await Promise.all([
        // ✅ penjualan_online
        supabase.from("penjualan_online").select("total_nominal").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("kas").select("nominal").eq("tipe", "Masuk").eq("kategori", "Offline").gte("created_at", startDate).lte("created_at", endDate),
        // ✅ retur_online
        supabase.from("retur_online").select("nominal").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("produksi_batch").select("total_hpp, gaji_operator, nama_produk, qty_produksi").gte("created_at", startDate).lte("created_at", endDate),
        // ✅ Fee dari fee_platform (bukan kas) — sebagai pengurang pendapatan
        supabase.from("fee_platform")
  .select("total_fee")
  .gte("periode_end", startDateStr)
  .lte("periode_start", endDateStr),
        supabase.from("kas").select("nominal").eq("tipe", "Keluar").eq("kategori", "Gaji").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("kas").select("nominal").eq("tipe", "Keluar").eq("kategori", "Transport").gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("kas").select("nominal").eq("tipe", "Keluar").in("kategori", ["Operasional", "Lain-lain"]).gte("created_at", startDate).lte("created_at", endDate),
        supabase.from("data_zakat").select("zakat_keluar").gte("created_at", startDate).lte("created_at", endDate),
        // ✅ Gaji operasional dari gaji_harian (tipe_beban: Operasional)
        supabase.from("gaji_harian").select("nominal").eq("tipe_beban", "Operasional").gte("tanggal", startDateStr).lte("tanggal", endDateStr),
      ]);

      const sum = (data: any[], field = "nominal") => (data || []).reduce((s, r) => s + (r[field] || 0), 0);

      const omzet_shopee = sum(shopeeRes.data || [], "total_nominal");
      const omzet_offline = sum(offlineRes.data || []);
      const retur_pembatalan = sum(returRes.data || []);
      // ✅ Fee platform sebagai pengurang pendapatan
      const fee_platform = sum(feeRes.data || [], "total_fee");

      let hpp_bahan = 0;
      let hpp_gaji_operator = 0;
      const produkMap: Record<string, { qty: number; hpp: number }> = {};

      (produksiRes.data || []).forEach(p => {
        const gaji = p.gaji_operator || 0;
        const hpp = p.total_hpp || 0;
        hpp_gaji_operator += gaji;
        hpp_bahan += hpp - gaji;
        if (!produkMap[p.nama_produk]) produkMap[p.nama_produk] = { qty: 0, hpp: 0 };
        produkMap[p.nama_produk].qty += p.qty_produksi;
        produkMap[p.nama_produk].hpp += hpp;
      });

      const produkProfitList: ProdukProfit[] = Object.entries(produkMap).map(([nama, data]) => {
        const omzet_estimasi = data.hpp * 1.6;
        const profit = omzet_estimasi - data.hpp;
        const margin = omzet_estimasi > 0 ? (profit / omzet_estimasi) * 100 : 0;
        return { nama_produk: nama, qty_terjual: data.qty, omzet: omzet_estimasi, hpp: data.hpp, profit, margin };
      }).sort((a, b) => b.profit - a.profit);

      setProdukProfit(produkProfitList);

      const biaya_gaji_kas = sum(gajiRes.data || []);
      const biaya_gaji_harian = sum(gajiHarianRes.data || []);
      const biaya_gaji = biaya_gaji_kas + biaya_gaji_harian;
      const biaya_transport = sum(transportRes.data || []);
      const biaya_operasional_lain = sum(opsRes.data || []);
      const biaya_zakat = sum(zakatRes.data || [], "zakat_keluar");

      const hpp_gaji_packing = 0;
      // ✅ total_pendapatan = gross - retur - fee_platform
      const total_pendapatan = omzet_shopee + omzet_offline - retur_pembatalan - fee_platform;
      const total_hpp = hpp_bahan + hpp_gaji_operator + hpp_gaji_packing;
      const laba_kotor = total_pendapatan - total_hpp;
      const margin_kotor = total_pendapatan > 0 ? (laba_kotor / total_pendapatan) * 100 : 0;
      // ✅ Fee tidak lagi masuk biaya operasional
      const total_biaya_operasional = biaya_gaji + biaya_transport + biaya_operasional_lain + biaya_zakat;
      const laba_bersih = laba_kotor - total_biaya_operasional;
      const margin_bersih = total_pendapatan > 0 ? (laba_bersih / total_pendapatan) * 100 : 0;

      setLaporan({
        omzet_shopee, omzet_offline, retur_pembatalan, fee_platform, total_pendapatan,
        hpp_bahan, hpp_gaji_operator, hpp_gaji_packing, total_hpp,
        laba_kotor, margin_kotor,
        biaya_gaji, biaya_transport, biaya_operasional_lain, biaya_zakat,
        total_biaya_operasional, laba_bersih, margin_bersih,
      });

      await fetchChartData();
    } catch (err: any) {
      showToast(err.message || "Gagal memuat laporan", "error");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, fetchChartData]);

  useEffect(() => { fetchLaporan(); }, [fetchLaporan]);

  const inputS: React.CSSProperties = {
    padding: "8px 12px",
    background: "#0f0b1a",
    border: `1.5px solid ${C.border}`,
    borderRadius: "8px",
    color: C.text,
    fontFamily: C.fontSans,
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
    width: "100%",
  };

  const tabBtn = (active: boolean, color: string): React.CSSProperties => ({
    flex: 1, padding: "10px 8px", borderRadius: "8px",
    border: `1px solid ${active ? color + "60" : C.border}`,
    background: active ? color + "20" : "transparent",
    color: active ? color : C.muted,
    fontWeight: 600, cursor: "pointer", fontSize: "13px",
    fontFamily: C.fontSans, transition: "all 0.15s",
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, padding: "12px 16px", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)" }}>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontFamily: C.fontMono }}>{payload[0].payload.tanggal}</div>
        {payload.map((entry: any, i: number) => (
          <div key={i} style={{ fontSize: 12, color: entry.color, marginBottom: 4, fontFamily: C.fontMono, fontWeight: 600 }}>
            {entry.name}: {rupiahShort(entry.value)}
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>📊</div>Memuat laporan laba rugi...
        </div>
      </div>
    </Sidebar>
  );

  const barData = laporan ? [
    { kategori: "Pendapatan", nilai: laporan.total_pendapatan, color: C.blue },
    { kategori: "HPP", nilai: -laporan.total_hpp, color: C.danger },
    { kategori: "Biaya Ops", nilai: -laporan.total_biaya_operasional, color: C.warning },
    { kategori: "Laba Bersih", nilai: laporan.laba_bersih, color: C.success },
  ] : [];

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input:focus, select:focus { border-color: #a78bfa80 !important; outline: none; }
        select option { background: #1a1020; color: #e2d9f3; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a1f3d; border-radius: 2px; }

        @media print {
          @page { size: A4 portrait; margin: 15mm 12mm; }
          nav, aside, .sidebar, [data-sidebar], button, .no-print { display: none !important; }
          * { background: white !important; color: black !important; box-shadow: none !important; border-color: #ddd !important; font-family: 'DM Sans', Arial, sans-serif !important; }
          body, html { background: white !important; }
          .print-container { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
          .print-header { display: block !important; margin-bottom: 16px; }
          .summary-cards { display: grid !important; grid-template-columns: repeat(5, 1fr) !important; gap: 8px !important; margin-bottom: 16px !important; page-break-inside: avoid; }
          .summary-card { border: 1px solid #ddd !important; border-radius: 6px !important; padding: 10px 8px !important; border-left-width: 3px !important; }
          .summary-card .card-label { font-size: 8px !important; text-transform: uppercase; color: #666 !important; margin-bottom: 4px; }
          .summary-card .card-value { font-size: 11px !important; font-weight: 700 !important; word-break: break-word; }
          .summary-card .card-pct { font-size: 10px !important; color: #666 !important; }
          .chart-section { display: none !important; }
          .tab-buttons { display: none !important; }
          .breakdown-section { page-break-inside: avoid; margin-bottom: 16px; }
          .breakdown-title { font-size: 11px !important; font-weight: 700 !important; text-transform: uppercase; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 2px solid #333 !important; }
          .breakdown-row { display: flex !important; justify-content: space-between !important; padding: 5px 8px !important; border-bottom: 1px solid #eee !important; font-size: 11px !important; }
          .breakdown-total { display: flex !important; justify-content: space-between !important; padding: 7px 8px !important; font-weight: 700 !important; font-size: 12px !important; border-top: 2px solid #333 !important; margin-top: 2px; }
          .laba-kotor-box, .laba-bersih-box { display: flex !important; justify-content: space-between !important; padding: 10px 12px !important; border: 2px solid #333 !important; border-radius: 6px !important; margin: 12px 0 !important; page-break-inside: avoid; }
          .laba-kotor-box .laba-value, .laba-bersih-box .laba-value { font-size: 16px !important; font-weight: 700 !important; }
          .laba-bersih-box .laba-value { font-size: 18px !important; }
          .print-btn { display: none !important; }
        }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: "#1a1020", border: `1px solid ${toast.type === "success" ? C.success : toast.type === "error" ? C.danger : C.blue}44`, color: toast.type === "success" ? C.success : toast.type === "error" ? C.danger : C.blue, padding: "14px 18px", borderRadius: "10px", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", gap: 10, fontFamily: C.fontMono, fontWeight: 600, fontSize: 13, maxWidth: 380 }} className="no-print">
          <span style={{ flex: 1 }}>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16, opacity: 0.6 }}>×</button>
        </div>
      )}

      <div className="print-container" style={{ padding: "28px 24px", fontFamily: C.fontSans, background: C.bg, minHeight: "100vh", maxWidth: "1200px", margin: "0 auto" }}>

        {/* Header — screen */}
        <div style={{ marginBottom: "28px" }} className="no-print">
          <h1 style={{ margin: 0, fontFamily: C.fontDisplay, fontSize: "26px", color: "#f0eaff", fontWeight: 400 }}>
            📊 Laporan Laba Rugi
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: C.muted, fontFamily: C.fontMono }}>
            Profit & Loss Statement · Filter per periode · Real-time calculation
          </p>
        </div>

        {/* Header — print only */}
        <div className="print-header" style={{ display: "none", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #000", paddingBottom: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "serif" }}>Azalea — Laporan Laba Rugi</div>
              <div style={{ fontSize: 12, color: "#444", marginTop: 2 }}>Profit & Loss Statement</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Periode: {periodeLabel}</div>
              <div style={{ fontSize: 11, color: "#666" }}>Dicetak: {new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}</div>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div style={{ background: C.card, padding: "20px", borderRadius: "14px", border: `1px solid ${C.border}`, marginBottom: "24px" }} className="no-print">
          <div style={{ fontSize: "11px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em", marginBottom: "12px" }}>FILTER PERIODE</div>
          <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
            {["bulan", "custom"].map(mode => (
              <button key={mode} onClick={() => setFilterMode(mode as any)} style={{ flex: 1, padding: "10px", borderRadius: "8px", border: `1px solid ${filterMode === mode ? C.accent + "60" : C.border}`, background: filterMode === mode ? C.accent + "20" : "transparent", color: filterMode === mode ? C.accent : C.muted, fontWeight: 600, cursor: "pointer", fontSize: "13px" }}>
                {mode === "bulan" ? "Per Bulan" : "Custom Range"}
              </button>
            ))}
          </div>
          {filterMode === "bulan" ? (
            <select value={bulanTerpilih} onChange={e => setBulanTerpilih(e.target.value)} style={inputS}>
              {daftarBulan.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "11px", color: C.muted, display: "block", marginBottom: "4px" }}>Dari</label>
                <input type="date" value={tanggalMulai} onChange={e => setTanggalMulai(e.target.value)} style={inputS} />
              </div>
              <div>
                <label style={{ fontSize: "11px", color: C.muted, display: "block", marginBottom: "4px" }}>Sampai</label>
                <input type="date" value={tanggalSelesai} onChange={e => setTanggalSelesai(e.target.value)} style={inputS} />
              </div>
            </div>
          )}
        </div>

        {laporan && (
          <>
            {/* Summary Cards */}
            <div className="summary-cards" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "14px", marginBottom: "24px" }}>
              {[
                { label: "Omzet Netto", value: laporan.total_pendapatan, color: C.blue, pct: null },
                { label: "HPP", value: laporan.total_hpp, color: C.danger, pct: null },
                { label: "Laba Kotor", value: laporan.laba_kotor, color: C.success, pct: laporan.margin_kotor },
                { label: "Biaya Ops", value: laporan.total_biaya_operasional, color: C.warning, pct: null },
                { label: "Laba Bersih", value: laporan.laba_bersih, color: C.accent, pct: laporan.margin_bersih },
              ].map((s, i) => (
                <div key={i} className="summary-card" style={{ background: C.card, padding: "16px", borderRadius: "14px", borderLeft: `4px solid ${s.color}` }}>
                  <div className="card-label" style={{ fontSize: "10px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>{s.label}</div>
                  <div className="card-value" style={{ fontSize: "13px", fontWeight: 700, color: s.color, fontFamily: C.fontMono, wordBreak: "break-word", lineHeight: 1.3 }}>{rupiahFmt(s.value)}</div>
                  {s.pct !== null && <div className="card-pct" style={{ fontSize: "11px", color: C.muted, fontFamily: C.fontMono, marginTop: 4 }}>{pctFmt(s.pct)}</div>}
                </div>
              ))}
            </div>

            {/* Charts */}
            {chartData.length > 0 && (
              <div className="chart-section" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
                <div style={{ background: C.card, padding: "20px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
                  <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: "16px", color: C.text, fontWeight: 400 }}>📈 Omzet & Laba</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="tanggal" stroke={C.muted} style={{ fontSize: 11, fontFamily: C.fontMono }} />
                      <YAxis stroke={C.muted} style={{ fontSize: 11, fontFamily: C.fontMono }} tickFormatter={rupiahShort} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 12, fontFamily: C.fontSans }} />
                      <Line type="monotone" dataKey="omzet" stroke={C.blue} strokeWidth={2} name="Omzet" dot={{ fill: C.blue, r: 3 }} />
                      <Line type="monotone" dataKey="laba" stroke={C.success} strokeWidth={2} name="Laba" dot={{ fill: C.success, r: 3 }} />
                      <Line type="monotone" dataKey="beban" stroke={C.danger} strokeWidth={2} name="Beban" dot={{ fill: C.danger, r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: C.card, padding: "20px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
                  <h3 style={{ margin: "0 0 16px", fontFamily: C.fontDisplay, fontSize: "16px", color: C.text, fontWeight: 400 }}>📊 Laba Rugi</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="kategori" stroke={C.muted} style={{ fontSize: 11, fontFamily: C.fontMono }} />
                      <YAxis stroke={C.muted} style={{ fontSize: 11, fontFamily: C.fontMono }} tickFormatter={rupiahShort} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="nilai" radius={[4, 4, 0, 0]}>
                        {barData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Tab buttons */}
            <div className="tab-buttons" style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
              <button onClick={() => setActiveTab("summary")} style={tabBtn(activeTab === "summary", C.accent)}>📋 Summary</button>
              <button onClick={() => setActiveTab("produk")} style={tabBtn(activeTab === "produk", C.success)}>📦 Per Produk</button>
            </div>

            {(activeTab === "summary") && (
              <div style={{ background: C.card, padding: "24px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
                <h3 className="no-print" style={{ margin: "0 0 20px", fontFamily: C.fontDisplay, fontSize: "18px", color: C.text, fontWeight: 400 }}>
                  Detail Breakdown
                </h3>

                {/* PENDAPATAN */}
                <div className="breakdown-section" style={{ marginBottom: "24px" }}>
                  <div className="breakdown-title" style={{ fontSize: "13px", fontWeight: 700, color: C.blue, marginBottom: "12px", letterSpacing: "0.05em" }}>PENDAPATAN</div>
                  {[
                    { label: "Penjualan Online (Shopee, dll)", value: laporan.omzet_shopee, isNegative: false },
                    { label: "Penjualan Offline", value: laporan.omzet_offline, isNegative: false },
                    { label: "Retur / Pembatalan", value: laporan.retur_pembatalan, isNegative: true },
                    { label: "Fee Platform (Komisi, Ongkir, Ads)", value: laporan.fee_platform, isNegative: true },
                  ].map((item, i) => (
                    <div key={i} className="breakdown-row" style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: "13px", color: item.isNegative ? C.orange : C.textMid }}>{item.label}</span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: item.isNegative ? C.orange : C.text, fontFamily: C.fontMono }}>
                        {item.isNegative && item.value > 0 ? `(${rupiahFmt(item.value)})` : rupiahFmt(item.value)}
                      </span>
                    </div>
                  ))}
                  <div className="breakdown-total" style={{ display: "flex", justifyContent: "space-between", padding: "12px", background: C.blue + "10", marginTop: "4px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.blue }}>TOTAL PENDAPATAN NETTO</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.blue, fontFamily: C.fontMono }}>{rupiahFmt(laporan.total_pendapatan)}</span>
                  </div>
                </div>

                {/* HPP */}
                <div className="breakdown-section" style={{ marginBottom: "24px" }}>
                  <div className="breakdown-title" style={{ fontSize: "13px", fontWeight: 700, color: C.danger, marginBottom: "12px" }}>HARGA POKOK PENJUALAN (HPP)</div>
                  {[
                    { label: "Bahan Baku & Packaging", value: laporan.hpp_bahan },
                    { label: "Gaji Operator Produksi", value: laporan.hpp_gaji_operator },
                    { label: "Gaji Tim Packing", value: laporan.hpp_gaji_packing },
                  ].map((item, i) => (
                    <div key={i} className="breakdown-row" style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: "13px", color: C.textMid }}>{item.label}</span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: C.text, fontFamily: C.fontMono }}>{rupiahFmt(item.value)}</span>
                    </div>
                  ))}
                  <div className="breakdown-total" style={{ display: "flex", justifyContent: "space-between", padding: "12px", background: C.danger + "10", marginTop: "4px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.danger }}>TOTAL HPP</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.danger, fontFamily: C.fontMono }}>{rupiahFmt(laporan.total_hpp)}</span>
                  </div>
                </div>

                {/* LABA KOTOR */}
                <div className="laba-kotor-box" style={{ marginBottom: "24px", padding: "16px", background: C.success + "10", borderRadius: "10px", border: `1px solid ${C.success}30` }}>
                  <div>
                    <div style={{ fontSize: "11px", color: C.muted, marginBottom: "4px" }}>LABA KOTOR (Gross Profit)</div>
                    <div className="laba-value" style={{ fontSize: "20px", fontWeight: 700, color: C.success, fontFamily: C.fontDisplay }}>{rupiahFmt(laporan.laba_kotor)}</div>
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: C.success, fontFamily: C.fontMono }}>{pctFmt(laporan.margin_kotor)}</div>
                </div>

                {/* BIAYA OPERASIONAL */}
                <div className="breakdown-section" style={{ marginBottom: "24px" }}>
                  <div className="breakdown-title" style={{ fontSize: "13px", fontWeight: 700, color: C.warning, marginBottom: "12px" }}>BIAYA OPERASIONAL</div>
                  {[
                    { label: "Gaji (Admin, Host Live, CS, dll)", value: laporan.biaya_gaji },
                    { label: "Transport & Delivery", value: laporan.biaya_transport },
                    { label: "Operasional Lain-lain", value: laporan.biaya_operasional_lain },
                    { label: "Zakat (2.5% otomatis)", value: laporan.biaya_zakat },
                  ].map((item, i) => (
                    <div key={i} className="breakdown-row" style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: "13px", color: C.textMid }}>{item.label}</span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: C.text, fontFamily: C.fontMono }}>{rupiahFmt(item.value)}</span>
                    </div>
                  ))}
                  <div className="breakdown-total" style={{ display: "flex", justifyContent: "space-between", padding: "12px", background: C.warning + "10", marginTop: "4px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.warning }}>TOTAL BIAYA OPERASIONAL</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.warning, fontFamily: C.fontMono }}>{rupiahFmt(laporan.total_biaya_operasional)}</span>
                  </div>
                </div>

                {/* LABA BERSIH */}
                <div className="laba-bersih-box" style={{ padding: "20px", background: C.accent + "15", borderRadius: "12px", border: `2px solid ${C.accent}40` }}>
                  <div>
                    <div style={{ fontSize: "12px", color: C.muted, marginBottom: "6px", letterSpacing: "0.08em" }}>LABA BERSIH (Net Profit)</div>
                    <div className="laba-value" style={{ fontSize: "28px", fontWeight: 700, color: C.accent, fontFamily: C.fontDisplay }}>{rupiahFmt(laporan.laba_bersih)}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "11px", color: C.muted, marginBottom: "4px" }}>Margin</div>
                    <div style={{ fontSize: "24px", fontWeight: 700, color: C.accent, fontFamily: C.fontMono }}>{pctFmt(laporan.margin_bersih)}</div>
                  </div>
                </div>

                <button className="print-btn" onClick={() => window.print()} style={{ width: "100%", marginTop: "24px", padding: "12px", borderRadius: "10px", background: C.success + "20", border: `1px solid ${C.success}40`, color: C.success, fontWeight: 700, cursor: "pointer", fontSize: "14px" }}>
                  🖨️ Print Laporan
                </button>
              </div>
            )}

            {activeTab === "produk" && (
              <div style={{ background: C.card, padding: "24px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
                <h3 style={{ margin: "0 0 20px", fontFamily: C.fontDisplay, fontSize: "18px", color: C.text, fontWeight: 400 }}>Profitabilitas per Produk</h3>
                {produkProfit.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px", color: C.muted, fontSize: "13px" }}>Belum ada data produksi untuk periode ini</div>
                ) : produkProfit.map((p, i) => (
                  <div key={i} style={{ marginBottom: "12px", padding: "16px", background: "#0f0b1a", borderRadius: "10px", border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: C.text, marginBottom: "4px" }}>{p.nama_produk}</div>
                        <div style={{ fontSize: "12px", color: C.muted, fontFamily: C.fontMono }}>{p.qty_terjual} pcs diproduksi</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: C.success, fontFamily: C.fontMono }}>{rupiahFmt(p.profit)}</div>
                        <div style={{ fontSize: "12px", color: C.muted }}>Margin {pctFmt(p.margin)}</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", fontSize: "12px" }}>
                      {[
                        { label: "Omzet Estimasi", value: p.omzet, color: C.text },
                        { label: "HPP", value: p.hpp, color: C.text },
                        { label: "Profit", value: p.profit, color: C.success },
                      ].map((col, j) => (
                        <div key={j}>
                          <div style={{ color: C.muted, marginBottom: "2px" }}>{col.label}</div>
                          <div style={{ color: col.color, fontWeight: 600, fontFamily: C.fontMono }}>{rupiahFmt(col.value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Sidebar>
  );
}
