"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/Sidebar";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

type LaporanData = {
  // Pendapatan
  omzet_shopee: number;
  omzet_offline: number;
  retur_pembatalan: number;
  total_pendapatan: number;
  
  // HPP
  hpp_bahan: number;
  hpp_gaji_operator: number;
  hpp_gaji_packing: number;
  total_hpp: number;
  
  // Laba Kotor
  laba_kotor: number;
  margin_kotor: number;
  
  // Biaya Operasional
  biaya_fee_shopee: number;
  biaya_gaji: number;
  biaya_transport: number;
  biaya_operasional_lain: number;
  biaya_zakat: number;
  total_biaya_operasional: number;
  
  // Laba Bersih
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

type Toast = { msg: string; type: "success" | "error" | "info" };

const rupiahFmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
const rupiahShort = (n: number) => {
  const val = Math.round(n || 0);
  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
  return val.toString();
};
const pctFmt = (n: number) => `${n.toFixed(1)}%`;

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
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

export default function LaporanPage() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [laporan, setLaporan] = useState<LaporanData | null>(null);
  const [produkProfit, setProdukProfit] = useState<ProdukProfit[]>([]);
  const [activeTab, setActiveTab] = useState<"summary" | "produk" | "trend">("summary");
  
  // Filter periode
  const [filterMode, setFilterMode] = useState<"bulan" | "custom">("bulan");
  const [bulanTerpilih, setBulanTerpilih] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [tanggalMulai, setTanggalMulai] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [tanggalSelesai, setTanggalSelesai] = useState(() => {
    const now = new Date();
    return now.toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
  });

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Generate daftar bulan (12 bulan terakhir)
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

  // Hitung range tanggal berdasarkan filter
  const { startDate, endDate } = useMemo(() => {
    if (filterMode === "bulan") {
      const [year, month] = bulanTerpilih.split("-").map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0, 23, 59, 59);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };
    } else {
      const start = new Date(tanggalMulai + "T00:00:00+07:00");
      const end = new Date(tanggalSelesai + "T23:59:59+07:00");
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };
    }
  }, [filterMode, bulanTerpilih, tanggalMulai, tanggalSelesai]);

  const fetchLaporan = useCallback(async () => {
    setLoading(true);
    try {
      // 1. PENDAPATAN - Omzet Shopee
      const { data: shopeeData } = await supabase
        .from("penjualan_shopee")
        .select("total_nominal")
        .gte("created_at", startDate)
        .lte("created_at", endDate);
      
      const omzet_shopee = (shopeeData || []).reduce((sum, r) => sum + (r.total_nominal || 0), 0);

      // 2. PENDAPATAN - Omzet Offline
      const { data: offlineData } = await supabase
        .from("kas")
        .select("nominal")
        .eq("tipe", "Masuk")
        .eq("kategori", "Offline")
        .gte("created_at", startDate)
        .lte("created_at", endDate);
      
      const omzet_offline = (offlineData || []).reduce((sum, r) => sum + (r.nominal || 0), 0);

      // 3. PENDAPATAN - Retur/Pembatalan (mengurangi omzet)
      const { data: returData } = await supabase
        .from("retur_shopee")
        .select("nominal")
        .gte("created_at", startDate)
        .lte("created_at", endDate);
      
      const retur_pembatalan = (returData || []).reduce((sum, r) => sum + (r.nominal || 0), 0);

      // 4. HPP - Data dari produksi_batch
      const { data: produksiData } = await supabase
        .from("produksi_batch")
        .select("total_hpp, gaji_operator, nama_produk, qty_produksi")
        .gte("created_at", startDate)
        .lte("created_at", endDate);
      
      let hpp_bahan = 0;
      let hpp_gaji_operator = 0;
      const produkMap: Record<string, { qty: number; hpp: number }> = {};
      
      (produksiData || []).forEach(p => {
        const gaji = p.gaji_operator || 0;
        const hpp = p.total_hpp || 0;
        hpp_gaji_operator += gaji;
        hpp_bahan += (hpp - gaji);
        
        // Agregat per produk
        if (!produkMap[p.nama_produk]) {
          produkMap[p.nama_produk] = { qty: 0, hpp: 0 };
        }
        produkMap[p.nama_produk].qty += p.qty_produksi;
        produkMap[p.nama_produk].hpp += hpp;
      });

      // 5. Breakdown per produk (omzet dari penjualan)
      // Untuk simplifikasi, kita asumsikan semua produk yang diproduksi terjual
      // Di production, harus join dengan data penjualan real
      const produkProfitList: ProdukProfit[] = Object.entries(produkMap).map(([nama, data]) => {
        // Asumsi harga jual (bisa ambil dari stok_barang)
        const omzet_estimasi = data.hpp * 1.6; // Markup 60% sebagai estimasi
        const profit = omzet_estimasi - data.hpp;
        const margin = omzet_estimasi > 0 ? (profit / omzet_estimasi) * 100 : 0;
        
        return {
          nama_produk: nama,
          qty_terjual: data.qty,
          omzet: omzet_estimasi,
          hpp: data.hpp,
          profit,
          margin,
        };
      }).sort((a, b) => b.profit - a.profit);

      setProdukProfit(produkProfitList);

      const hpp_gaji_packing = 0; // TODO: Sesuaikan

      // 6. BIAYA OPERASIONAL - Fee Shopee
      const { data: feeShopeeData } = await supabase
        .from("kas")
        .select("nominal")
        .eq("tipe", "Keluar")
        .eq("kategori", "Fee Shopee")
        .gte("created_at", startDate)
        .lte("created_at", endDate);
      
      const biaya_fee_shopee = (feeShopeeData || []).reduce((sum, r) => sum + (r.nominal || 0), 0);

      // 7. BIAYA OPERASIONAL - Gaji
      const { data: gajiData } = await supabase
        .from("kas")
        .select("nominal")
        .eq("tipe", "Keluar")
        .eq("kategori", "Gaji")
        .gte("created_at", startDate)
        .lte("created_at", endDate);
      
      const biaya_gaji = (gajiData || []).reduce((sum, r) => sum + (r.nominal || 0), 0);

      // 8. BIAYA OPERASIONAL - Transport
      const { data: transportData } = await supabase
        .from("kas")
        .select("nominal")
        .eq("tipe", "Keluar")
        .eq("kategori", "Transport")
        .gte("created_at", startDate)
        .lte("created_at", endDate);
      
      const biaya_transport = (transportData || []).reduce((sum, r) => sum + (r.nominal || 0), 0);

      // 9. BIAYA OPERASIONAL - Lain-lain
      const { data: operasionalData } = await supabase
        .from("kas")
        .select("nominal")
        .eq("tipe", "Keluar")
        .in("kategori", ["Operasional", "Lain-lain"])
        .gte("created_at", startDate)
        .lte("created_at", endDate);
      
      const biaya_operasional_lain = (operasionalData || []).reduce((sum, r) => sum + (r.nominal || 0), 0);

      // 10. BIAYA OPERASIONAL - Zakat
      const { data: zakatData } = await supabase
        .from("data_zakat")
        .select("zakat_keluar")
        .gte("created_at", startDate)
        .lte("created_at", endDate);
      
      const biaya_zakat = (zakatData || []).reduce((sum, r) => sum + (r.zakat_keluar || 0), 0);

      // KALKULASI FINAL
      const total_pendapatan = omzet_shopee + omzet_offline - retur_pembatalan;
      const total_hpp = hpp_bahan + hpp_gaji_operator + hpp_gaji_packing;
      const laba_kotor = total_pendapatan - total_hpp;
      const margin_kotor = total_pendapatan > 0 ? (laba_kotor / total_pendapatan) * 100 : 0;
      
      const total_biaya_operasional = biaya_fee_shopee + biaya_gaji + biaya_transport + biaya_operasional_lain + biaya_zakat;
      const laba_bersih = laba_kotor - total_biaya_operasional;
      const margin_bersih = total_pendapatan > 0 ? (laba_bersih / total_pendapatan) * 100 : 0;

      setLaporan({
        omzet_shopee,
        omzet_offline,
        retur_pembatalan,
        total_pendapatan,
        hpp_bahan,
        hpp_gaji_operator,
        hpp_gaji_packing,
        total_hpp,
        laba_kotor,
        margin_kotor,
        biaya_fee_shopee,
        biaya_gaji,
        biaya_transport,
        biaya_operasional_lain,
        biaya_zakat,
        total_biaya_operasional,
        laba_bersih,
        margin_bersih,
      });

    } catch (err: any) {
      showToast(err.message || "Gagal memuat laporan", "error");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchLaporan();
  }, [fetchLaporan]);

  const inputS: React.CSSProperties = {
    padding: "8px 12px",
    background: "#0f0b1a",
    border: `1.5px solid ${C.border}`,
    borderRadius: "8px",
    color: C.text,
    fontFamily: C.fontSans,
    fontSize: "13px",
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

  // Data untuk chart breakdown (pie-like)
  const chartData = laporan ? [
    { name: "HPP", value: laporan.total_hpp, fill: C.danger },
    { name: "Biaya Ops", value: laporan.total_biaya_operasional, fill: C.warning },
    { name: "Laba Bersih", value: laporan.laba_bersih, fill: C.success },
  ] : [];

  if (loading) {
    return (
      <Sidebar>
        <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>📊</div>
            Memuat laporan laba rugi...
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
        input:focus, select:focus { border-color: #a78bfa80 !important; outline: none; }
        select option { background: #1a1020; color: #e2d9f3; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #2a1f3d; border-radius: 2px; }
        @media print {
          @page { margin: 1cm; }
          body { background: white !important; }
        }
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
          <span style={{ flex: 1 }}>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{
            background: "none", border: "none", color: "inherit",
            cursor: "pointer", fontSize: 16, opacity: 0.6,
          }}>×</button>
        </div>
      )}

      <div style={{ padding: "28px 24px", fontFamily: C.fontSans, background: C.bg, minHeight: "100vh", maxWidth: "1200px", margin: "0 auto" }}>
        
        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={{ margin: 0, fontFamily: C.fontDisplay, fontSize: "26px", color: "#f0eaff", fontWeight: 400 }}>
            📊 Laporan Laba Rugi
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: C.muted, fontFamily: C.fontMono }}>
            Profit & Loss Statement · Filter per periode · Real-time calculation
          </p>
        </div>

        {/* Filter Periode */}
        <div style={{ background: C.card, padding: "20px", borderRadius: "14px", border: `1px solid ${C.border}`, marginBottom: "24px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em", marginBottom: "12px" }}>
            FILTER PERIODE
          </div>
          
          <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
            <button
              onClick={() => setFilterMode("bulan")}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: `1px solid ${filterMode === "bulan" ? C.accent + "60" : C.border}`,
                background: filterMode === "bulan" ? C.accent + "20" : "transparent",
                color: filterMode === "bulan" ? C.accent : C.muted,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Per Bulan
            </button>
            <button
              onClick={() => setFilterMode("custom")}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: `1px solid ${filterMode === "custom" ? C.accent + "60" : C.border}`,
                background: filterMode === "custom" ? C.accent + "20" : "transparent",
                color: filterMode === "custom" ? C.accent : C.muted,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              Custom Range
            </button>
          </div>

          {filterMode === "bulan" ? (
            <select value={bulanTerpilih} onChange={e => setBulanTerpilih(e.target.value)} style={inputS}>
              {daftarBulan.map(b => (
                <option key={b.key} value={b.key}>{b.label}</option>
              ))}
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

        {/* Summary Cards */}
        {laporan && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "14px", marginBottom: "24px" }}>
              {[
                { label: "Omzet", value: laporan.total_pendapatan, color: C.blue, pct: null },
                { label: "HPP", value: laporan.total_hpp, color: C.danger, pct: null },
                { label: "Laba Kotor", value: laporan.laba_kotor, color: C.success, pct: laporan.margin_kotor },
                { label: "Biaya Ops", value: laporan.total_biaya_operasional, color: C.warning, pct: null },
                { label: "Laba Bersih", value: laporan.laba_bersih, color: C.accent, pct: laporan.margin_bersih },
              ].map((s, i) => (
                <div key={i} style={{ background: C.card, padding: "16px", borderRadius: "14px", borderLeft: `4px solid ${s.color}` }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: s.color, fontFamily: C.fontMono, marginBottom: "4px" }}>
                    {rupiahShort(s.value)}
                  </div>
                  {s.pct !== null && (
                    <div style={{ fontSize: "11px", color: C.muted, fontFamily: C.fontMono }}>
                      {pctFmt(s.pct)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
              <button onClick={() => setActiveTab("summary")} style={tabBtn(activeTab === "summary", C.accent)}>
                📋 Summary
              </button>
              <button onClick={() => setActiveTab("produk")} style={tabBtn(activeTab === "produk", C.success)}>
                📦 Per Produk
              </button>
              <button onClick={() => setActiveTab("trend")} style={tabBtn(activeTab === "trend", C.blue)}>
                📈 Visualisasi
              </button>
            </div>

            {/* TAB: SUMMARY */}
            {activeTab === "summary" && (
              <div style={{ background: C.card, padding: "24px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
                <h3 style={{ margin: "0 0 20px", fontFamily: C.fontDisplay, fontSize: "18px", color: C.text, fontWeight: 400 }}>
                  Detail Breakdown
                </h3>

                {/* PENDAPATAN */}
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: C.blue, marginBottom: "12px", letterSpacing: "0.05em" }}>
                    PENDAPATAN
                  </div>
                  {[
                    { label: "Penjualan Shopee", value: laporan.omzet_shopee },
                    { label: "Penjualan Offline", value: laporan.omzet_offline },
                    { label: "Retur/Pembatalan", value: -laporan.retur_pembatalan, isNegative: true },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: "13px", color: C.textMid }}>{item.label}</span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: item.isNegative ? C.danger : C.text, fontFamily: C.fontMono }}>
                        {item.isNegative && item.value !== 0 && "("}
                        {rupiahFmt(Math.abs(item.value))}
                        {item.isNegative && item.value !== 0 && ")"}
                      </span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 12px", background: C.blue + "10", marginTop: "4px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.blue }}>TOTAL PENDAPATAN</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.blue, fontFamily: C.fontMono }}>
                      {rupiahFmt(laporan.total_pendapatan)}
                    </span>
                  </div>
                </div>

                {/* HPP */}
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: C.danger, marginBottom: "12px", letterSpacing: "0.05em" }}>
                    HARGA POKOK PENJUALAN (HPP)
                  </div>
                  {[
                    { label: "Bahan Baku & Packaging", value: laporan.hpp_bahan },
                    { label: "Gaji Operator Produksi", value: laporan.hpp_gaji_operator },
                    { label: "Gaji Tim Packing", value: laporan.hpp_gaji_packing },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: "13px", color: C.textMid }}>{item.label}</span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: C.text, fontFamily: C.fontMono }}>
                        {rupiahFmt(item.value)}
                      </span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 12px", background: C.danger + "10", marginTop: "4px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.danger }}>TOTAL HPP</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.danger, fontFamily: C.fontMono }}>
                      {rupiahFmt(laporan.total_hpp)}
                    </span>
                  </div>
                </div>

                {/* LABA KOTOR */}
                <div style={{ marginBottom: "24px", padding: "16px", background: C.success + "10", borderRadius: "10px", border: `1px solid ${C.success}30` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "11px", color: C.muted, marginBottom: "4px" }}>LABA KOTOR (Gross Profit)</div>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: C.success, fontFamily: C.fontDisplay }}>
                        {rupiahFmt(laporan.laba_kotor)}
                      </div>
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: C.success, fontFamily: C.fontMono }}>
                      {pctFmt(laporan.margin_kotor)}
                    </div>
                  </div>
                </div>

                {/* BIAYA OPERASIONAL */}
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: C.warning, marginBottom: "12px", letterSpacing: "0.05em" }}>
                    BIAYA OPERASIONAL
                  </div>
                  {[
                    { label: "Fee Shopee (Komisi, Ongkir, Ads)", value: laporan.biaya_fee_shopee },
                    { label: "Gaji (Admin, Host Live, CS, dll)", value: laporan.biaya_gaji },
                    { label: "Transport & Delivery", value: laporan.biaya_transport },
                    { label: "Operasional Lain-lain", value: laporan.biaya_operasional_lain },
                    { label: "Zakat (2.5% otomatis)", value: laporan.biaya_zakat },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: "13px", color: C.textMid }}>{item.label}</span>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: C.text, fontFamily: C.fontMono }}>
                        {rupiahFmt(item.value)}
                      </span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 12px", background: C.warning + "10", marginTop: "4px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.warning }}>TOTAL BIAYA OPERASIONAL</span>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: C.warning, fontFamily: C.fontMono }}>
                      {rupiahFmt(laporan.total_biaya_operasional)}
                    </span>
                  </div>
                </div>

                {/* LABA BERSIH */}
                <div style={{ padding: "20px", background: C.accent + "15", borderRadius: "12px", border: `2px solid ${C.accent}40` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "12px", color: C.muted, marginBottom: "6px", letterSpacing: "0.08em" }}>LABA BERSIH (Net Profit)</div>
                      <div style={{ fontSize: "28px", fontWeight: 700, color: C.accent, fontFamily: C.fontDisplay }}>
                        {rupiahFmt(laporan.laba_bersih)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "11px", color: C.muted, marginBottom: "4px" }}>Margin</div>
                      <div style={{ fontSize: "24px", fontWeight: 700, color: C.accent, fontFamily: C.fontMono }}>
                        {pctFmt(laporan.margin_bersih)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Export Buttons */}
                <div style={{ marginTop: "24px", display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => window.print()}
                    style={{
                      flex: 1,
                      padding: "12px",
                      borderRadius: "10px",
                      background: C.success + "20",
                      border: `1px solid ${C.success}40`,
                      color: C.success,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    🖨️ Print
                  </button>
                </div>
              </div>
            )}

            {/* TAB: PER PRODUK */}
            {activeTab === "produk" && (
              <div style={{ background: C.card, padding: "24px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
                <h3 style={{ margin: "0 0 20px", fontFamily: C.fontDisplay, fontSize: "18px", color: C.text, fontWeight: 400 }}>
                  Profitabilitas per Produk
                </h3>

                {produkProfit.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px", color: C.muted, fontSize: "13px" }}>
                    Belum ada data produksi untuk periode ini
                  </div>
                ) : (
                  <div>
                    {produkProfit.map((p, i) => (
                      <div key={i} style={{ 
                        marginBottom: "12px", 
                        padding: "16px", 
                        background: "#0f0b1a", 
                        borderRadius: "10px",
                        border: `1px solid ${C.border}`,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                          <div>
                            <div style={{ fontSize: "14px", fontWeight: 600, color: C.text, marginBottom: "4px" }}>
                              {p.nama_produk}
                            </div>
                            <div style={{ fontSize: "12px", color: C.muted, fontFamily: C.fontMono }}>
                              {p.qty_terjual} pcs diproduksi
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "16px", fontWeight: 700, color: C.success, fontFamily: C.fontMono }}>
                              {rupiahFmt(p.profit)}
                            </div>
                            <div style={{ fontSize: "12px", color: C.muted }}>
                              Margin {pctFmt(p.margin)}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", fontSize: "12px" }}>
                          <div>
                            <div style={{ color: C.muted, marginBottom: "2px" }}>Omzet Estimasi</div>
                            <div style={{ color: C.text, fontWeight: 600, fontFamily: C.fontMono }}>
                              {rupiahFmt(p.omzet)}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: C.muted, marginBottom: "2px" }}>HPP</div>
                            <div style={{ color: C.text, fontWeight: 600, fontFamily: C.fontMono }}>
                              {rupiahFmt(p.hpp)}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: C.muted, marginBottom: "2px" }}>Profit</div>
                            <div style={{ color: C.success, fontWeight: 700, fontFamily: C.fontMono }}>
                              {rupiahFmt(p.profit)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: VISUALISASI */}
            {activeTab === "trend" && (
              <div style={{ background: C.card, padding: "24px", borderRadius: "14px", border: `1px solid ${C.border}` }}>
                <h3 style={{ margin: "0 0 20px", fontFamily: C.fontDisplay, fontSize: "18px", color: C.text, fontWeight: 400 }}>
                  Visualisasi Data
                </h3>

                <div style={{ marginBottom: "32px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: C.muted, marginBottom: "16px" }}>
                    Breakdown Pendapatan
                  </div>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis dataKey="name" stroke={C.muted} style={{ fontSize: "12px" }} />
                      <YAxis stroke={C.muted} style={{ fontSize: "12px" }} />
                      <Tooltip 
                        contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "8px" }}
                        labelStyle={{ color: C.text }}
                        formatter={(value: any) => rupiahFmt(value)}
                      />
                      <Bar dataKey="value" fill={C.accent} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ fontSize: "11px", color: C.muted, textAlign: "center", fontStyle: "italic" }}>
                  📈 Fitur trend chart 6 bulan terakhir coming soon
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </Sidebar>
  );
}
