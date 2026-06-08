"use client";

// /app/laporan/profit/page.tsx
// Profit Report per Pesanan — Shopee escrow - HPP produksi
// + Skip pesanan yang ada di retur_online (status retur aktif, bukan CANCELLED)
//   karena Shopee tandai COMPLETED dengan escrow tereduksi → profit minus palsu.

import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type ProfitItem = {
  no_pesanan: string;
  tanggal_pesanan: string;
  sku: string;
  nama_produk: string;
  qty: number;
  harga_jual: number;
  escrow_amount: number;
  commission_fee: number;
  service_fee: number;
  hpp_per_unit: number;
  hpp_total: number;
  profit: number;
  margin_pct: number;
  nama_toko: string;
  toko_id: number;
  retur_dibatalkan: boolean; // pernah ada retur tapi dibatalkan Shopee → tetap dihitung
};

type RingkasanSKU = {
  sku: string;
  nama_produk: string;
  jumlah_pesanan: number;
  total_qty: number;
  total_omzet: number;
  total_escrow: number;
  total_fee: number;
  total_hpp: number;
  total_profit: number;
  margin_pct: number;
  avg_hpp: number;
};

const rupiahFmt = (n: number) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const pctFmt = (n: number) => `${(n || 0).toFixed(1)}%`;

// Status retur yang dianggap "batal" → pesanan tetap valid, jangan di-skip.
const RETUR_BATAL = new Set(["CANCELLED", "CANCELED", "CLOSED", "REJECTED"]);

export default function ProfitReportPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [items, setItems] = useState<ProfitItem[]>([]);
  const [skippedRetur, setSkippedRetur] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"per_pesanan" | "per_sku" | "per_toko">("per_sku");
  const [filterToko, setFilterToko] = useState("semua");
  const [filterSKU, setFilterSKU] = useState("semua");
  const [tokoList, setTokoList] = useState<{ id: number; nama: string }[]>([]);
  const [bulan, setBulan] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    background: isDark ? "rgba(255,255,255,0.05)" : "#f8fffe",
    border: `1.5px solid ${C.border}`, borderRadius: 10,
    color: C.text, fontFamily: C.fontSans, fontSize: 13,
    outline: "none", boxSizing: "border-box" as const,
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Toko
      const { data: tokoData } = await supabase.from("toko_online").select("id, nama").eq("platform", "Shopee").eq("aktif", true);
      setTokoList(tokoData || []);
      const tokoMap = new Map((tokoData || []).map((t: any) => [t.id, t.nama]));

      // Penjualan online mapping
      const { data: penjualanData } = await supabase.from("penjualan_online").select("id, toko_id");
      const penjualanTokoMap = new Map((penjualanData || []).map((p: any) => [p.id, p.toko_id]));

      // Daftar pesanan yang DIRETUR (status retur aktif, bukan dibatalkan).
      // Pesanan di set ini di-skip dari profit karena escrow tereduksi → minus palsu.
      const { data: returData } = await supabase
        .from("retur_online")
        .select("order_sn, return_status")
        .not("order_sn", "is", null);
      const returActiveSet = new Set<string>();
      const returBatalSet = new Set<string>();
      for (const r of returData || []) {
        const st = String((r as any).return_status || "").toUpperCase();
        const sn = (r as any).order_sn ? String((r as any).order_sn) : "";
        if (!sn) continue;
        if (RETUR_BATAL.has(st)) {
          returBatalSet.add(sn); // retur batal → pesanan tetap valid, tandai untuk audit
        } else {
          returActiveSet.add(sn); // retur aktif → skip dari profit
        }
      }

      // HPP per unit dari produksi (rata-rata)
      const { data: hppData } = await supabase
        .from("detail_produksi_output")
        .select("stok_barang_id, hpp_per_unit, stok_barang(nama_produk, sku)");

      const hppMap = new Map<number, { hpp: number; count: number; nama: string; sku: string }>();
      for (const h of hppData || []) {
        const id = h.stok_barang_id;
        if (!hppMap.has(id)) hppMap.set(id, { hpp: 0, count: 0, nama: (h.stok_barang as any)?.nama_produk || "", sku: (h.stok_barang as any)?.sku || "" });
        const entry = hppMap.get(id)!;
        entry.hpp += h.hpp_per_unit || 0;
        entry.count++;
      }
      const hppAvgMap = new Map<number, { hpp_per_unit: number; nama: string; sku: string }>();
      for (const [id, v] of hppMap) {
        hppAvgMap.set(id, { hpp_per_unit: v.count > 0 ? v.hpp / v.count : 0, nama: v.nama, sku: v.sku });
      }

      // Filter bulan
      const [year, month] = bulan.split("-").map(Number);
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

      // Detail penjualan COMPLETED dengan escrow
      const { data: detailData } = await supabase
        .from("detail_penjualan_online")
        .select("no_pesanan, tanggal_pesanan, sku, qty, harga_satuan, total_pembayaran, penjualan_online_id, stok_barang_id, stok_barang(nama_produk)")
        .eq("status_shopee", "COMPLETED")
        .gte("tanggal_pesanan", startDate)
        .lte("tanggal_pesanan", endDate);

      // Escrow detail
      const orderSns = [...new Set((detailData || []).map((d: any) => d.no_pesanan))];
      const escrowMap = new Map<string, { escrow_amount: number; commission_fee: number; service_fee: number }>();

      if (orderSns.length > 0) {
        // Fetch in batches of 100
        for (let i = 0; i < orderSns.length; i += 100) {
          const batch = orderSns.slice(i, i + 100);
          const { data: escrowData } = await supabase
            .from("escrow_detail")
            .select("order_sn, escrow_amount, commission_fee, service_fee")
            .in("order_sn", batch);
          for (const e of escrowData || []) {
            escrowMap.set(e.order_sn, { escrow_amount: e.escrow_amount, commission_fee: e.commission_fee, service_fee: e.service_fee });
          }
        }
      }

      // Build profit items
      const result: ProfitItem[] = [];
      const skippedSet = new Set<string>();
      for (const d of detailData || [] as any[]) {
        // Skip pesanan yang diretur (escrow Shopee sudah tereduksi → minus palsu)
        if (returActiveSet.has(d.no_pesanan)) {
          skippedSet.add(d.no_pesanan);
          continue;
        }

        const tokoId = penjualanTokoMap.get(d.penjualan_online_id) || 0;
        const escrow = escrowMap.get(d.no_pesanan);
        const hppData2 = d.stok_barang_id ? hppAvgMap.get(d.stok_barang_id) : null;
        const hpp_per_unit = hppData2?.hpp_per_unit || 0;
        const hpp_total = hpp_per_unit * (d.qty || 1);
        const escrow_amount = escrow?.escrow_amount || 0;
        const commission_fee = escrow?.commission_fee || 0;
        const service_fee = escrow?.service_fee || 0;
        // Skip pesanan yang belum ada data escrow (belum cair, bukan berarti escrow = 0)
        if (!escrow) continue;

        const profit = escrow_amount - hpp_total;
        const margin_pct = escrow_amount > 0 ? (profit / escrow_amount) * 100 : 0;

        result.push({
          no_pesanan: d.no_pesanan,
          tanggal_pesanan: d.tanggal_pesanan,
          sku: d.sku,
          nama_produk: (d.stok_barang as any)?.nama_produk || d.sku,
          qty: d.qty,
          harga_jual: d.harga_satuan,
          escrow_amount,
          commission_fee,
          service_fee,
          hpp_per_unit,
          hpp_total,
          profit,
          margin_pct,
          nama_toko: tokoMap.get(tokoId) as string || "-",
          toko_id: tokoId,
          retur_dibatalkan: returBatalSet.has(d.no_pesanan),
        });
      }

      setItems(result);
      setSkippedRetur(skippedSet.size);
    } finally { setLoading(false); }
  }, [bulan]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter
  const filtered = items.filter(p => {
    if (filterToko !== "semua" && String(p.toko_id) !== filterToko) return false;
    if (filterSKU !== "semua" && p.sku !== filterSKU) return false;
    return true;
  });

  // Ringkasan per SKU
  const ringkasanSKU = useMemo((): RingkasanSKU[] => {
    const map = new Map<string, RingkasanSKU>();
    for (const p of filtered) {
      if (!map.has(p.sku)) {
        map.set(p.sku, { sku: p.sku, nama_produk: p.nama_produk, jumlah_pesanan: 0, total_qty: 0, total_omzet: 0, total_escrow: 0, total_fee: 0, total_hpp: 0, total_profit: 0, margin_pct: 0, avg_hpp: p.hpp_per_unit });
      }
      const r = map.get(p.sku)!;
      r.jumlah_pesanan++;
      r.total_qty += p.qty;
      r.total_omzet += p.harga_jual * p.qty;
      r.total_escrow += p.escrow_amount;
      r.total_fee += p.commission_fee + p.service_fee;
      r.total_hpp += p.hpp_total;
      r.total_profit += p.profit;
    }
    for (const r of map.values()) {
      r.margin_pct = r.total_escrow > 0 ? (r.total_profit / r.total_escrow) * 100 : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.total_profit - a.total_profit);
  }, [filtered]);

  // Ringkasan per toko
  const ringkasanToko = useMemo(() => {
    const map = new Map<string, { nama: string; total_profit: number; total_escrow: number; total_hpp: number; jumlah: number }>();
    for (const p of filtered) {
      if (!map.has(p.nama_toko)) map.set(p.nama_toko, { nama: p.nama_toko, total_profit: 0, total_escrow: 0, total_hpp: 0, jumlah: 0 });
      const r = map.get(p.nama_toko)!;
      r.total_profit += p.profit;
      r.total_escrow += p.escrow_amount;
      r.total_hpp += p.hpp_total;
      r.jumlah++;
    }
    return Array.from(map.values()).sort((a, b) => b.total_profit - a.total_profit);
  }, [filtered]);

  // Total summary
  const totalEscrow = filtered.reduce((a, p) => a + p.escrow_amount, 0);
  const totalHPP = filtered.reduce((a, p) => a + p.hpp_total, 0);
  const totalFee = filtered.reduce((a, p) => a + p.commission_fee + p.service_fee, 0);
  const totalProfit = filtered.reduce((a, p) => a + p.profit, 0);
  const marginGlobal = totalEscrow > 0 ? (totalProfit / totalEscrow) * 100 : 0;
  const skuList = [...new Set(items.map(p => p.sku))];

  // Daftar bulan (12 bulan terakhir)
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

  const profitColor = (n: number) => n >= 0 ? C.green : C.red;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "9px 8px", borderRadius: 10,
    border: `1.5px solid ${active ? C.accent + "60" : C.border}`,
    background: active ? `${C.accent}15` : "transparent",
    color: active ? C.accent : C.muted,
    fontWeight: 700, cursor: "pointer", fontSize: 13,
    fontFamily: C.fontSans, transition: "all 0.15s",
  });

  return (
    <AppShell>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <div style={{ padding: "24px 28px", animation: "fadeUp 0.3s ease" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Profit Report</h1>
          <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
            Profit per pesanan = Escrow Shopee − HPP Produksi · Hanya pesanan COMPLETED
            {skippedRetur > 0 && (
              <span style={{ color: C.yellow }}> · {skippedRetur} pesanan retur dikecualikan</span>
            )}
          </p>
        </div>

        {/* Filter */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px", marginBottom: 20, boxShadow: C.shadow }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" as const }}>Bulan</div>
              <select value={bulan} onChange={e => setBulan(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
                {daftarBulan.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" as const }}>Toko</div>
              <select value={filterToko} onChange={e => setFilterToko(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
                <option value="semua">Semua Toko</option>
                {tokoList.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" as const }}>SKU</div>
              <select value={filterSKU} onChange={e => setFilterSKU(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
                <option value="semua">Semua SKU</option>
                {skuList.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total Escrow", value: rupiahFmt(totalEscrow), color: C.blue, icon: "💰" },
            { label: "Total HPP", value: rupiahFmt(totalHPP), color: C.red, icon: "🏭" },
            { label: "Total Fee Shopee", value: rupiahFmt(totalFee), color: C.yellow, icon: "🏪" },
            { label: "Total Profit", value: rupiahFmt(totalProfit), color: profitColor(totalProfit), icon: totalProfit >= 0 ? "📈" : "📉" },
            { label: "Margin", value: pctFmt(marginGlobal), color: profitColor(marginGlobal), icon: "%" },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", boxShadow: C.shadow }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: s.color, fontFamily: C.fontMono }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button onClick={() => setActiveTab("per_sku")} style={tabStyle(activeTab === "per_sku")}>📦 Per SKU</button>
          <button onClick={() => setActiveTab("per_toko")} style={tabStyle(activeTab === "per_toko")}>🏪 Per Toko</button>
          <button onClick={() => setActiveTab("per_pesanan")} style={tabStyle(activeTab === "per_pesanan")}>🧾 Per Pesanan ({filtered.length})</button>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat data profit...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Tidak ada data</div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>Belum ada pesanan COMPLETED dengan data escrow di bulan ini</div>
          </div>
        ) : (
          <>
            {/* ── TAB PER SKU ── */}
            {activeTab === "per_sku" && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: C.shadow }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.7fr 0.7fr 1fr 1fr 1fr 1fr 0.8fr", gap: 8, padding: "10px 20px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, textTransform: "uppercase" as const }}>
                  <span>Produk / SKU</span>
                  <span>Pesanan</span>
                  <span>Qty</span>
                  <span>Total Escrow</span>
                  <span>Total HPP</span>
                  <span>Total Fee</span>
                  <span>Profit</span>
                  <span>Margin</span>
                </div>
                {ringkasanSKU.map(r => {
                  const isProfit = r.total_profit >= 0;
                  const marginPct = Math.min(Math.max(r.margin_pct, 0), 100);
                  return (
                    <div key={r.sku} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.7fr 0.7fr 1fr 1fr 1fr 1fr 0.8fr", gap: 8, padding: "14px 20px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.nama_produk}</div>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{r.sku}</div>
                        {r.avg_hpp === 0 && <div style={{ fontSize: 10, color: C.yellow, marginTop: 2 }}>⚠ HPP belum ada</div>}
                        {/* Profit bar */}
                        <div style={{ height: 3, background: C.dim, borderRadius: 2, marginTop: 4, overflow: "hidden", width: "60%" }}>
                          <div style={{ height: "100%", width: `${marginPct}%`, background: isProfit ? C.green : C.red, borderRadius: 2 }} />
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: C.fontMono }}>{r.jumlah_pesanan}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: C.fontMono }}>{r.total_qty}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(r.total_escrow)}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.red, fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(r.total_hpp)}</div>
                      <div style={{ fontSize: 12, color: C.yellow, fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(r.total_fee)}</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: profitColor(r.total_profit), fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(r.total_profit)}</div>
                      <div>
                        <span style={{ padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 800, background: isProfit ? `${C.green}20` : `${C.red}20`, color: isProfit ? C.green : C.red }}>
                          {pctFmt(r.margin_pct)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {/* Footer total */}
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.7fr 0.7fr 1fr 1fr 1fr 1fr 0.8fr", gap: 8, padding: "14px 20px", background: `${C.accent}08`, borderTop: `2px solid ${C.accent}20`, alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.accent }}>TOTAL</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.accent, fontFamily: C.fontMono }}>{filtered.length}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.accent, fontFamily: C.fontMono }}>{filtered.reduce((a, p) => a + p.qty, 0)}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.blue, fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(totalEscrow)}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.red, fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(totalHPP)}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.yellow, fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(totalFee)}</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: profitColor(totalProfit), fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(totalProfit)}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: profitColor(marginGlobal) }}>{pctFmt(marginGlobal)}</div>
                </div>
              </div>
            )}

            {/* ── TAB PER TOKO ── */}
            {activeTab === "per_toko" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                {ringkasanToko.map(r => (
                  <div key={r.nama} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: C.shadow }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 14 }}>🏪 {r.nama}</div>
                    {[
                      { label: "Pesanan", value: r.jumlah, color: C.text },
                      { label: "Total Escrow", value: rupiahFmt(r.total_escrow), color: C.blue },
                      { label: "Total HPP", value: rupiahFmt(r.total_hpp), color: C.red },
                      { label: "Profit", value: rupiahFmt(r.total_profit), color: profitColor(r.total_profit) },
                    ].map((s, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 12, color: C.muted }}>{s.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: s.color, fontFamily: C.fontMono }}>{s.value}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Margin</span>
                      <span style={{ fontSize: 14, fontWeight: 900, color: profitColor(r.total_escrow > 0 ? (r.total_profit / r.total_escrow) * 100 : 0), fontFamily: C.fontMono }}>
                        {pctFmt(r.total_escrow > 0 ? (r.total_profit / r.total_escrow) * 100 : 0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── TAB PER PESANAN ── */}
            {activeTab === "per_pesanan" && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: C.shadow }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.8fr 0.8fr 1fr 1fr 1fr 1fr 0.8fr", gap: 8, padding: "10px 20px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, textTransform: "uppercase" as const }}>
                  <span>Pesanan / Produk</span>
                  <span>Toko</span>
                  <span>Escrow</span>
                  <span>HPP</span>
                  <span>Fee</span>
                  <span>Profit</span>
                  <span>Margin</span>
                </div>
                <div style={{ maxHeight: 600, overflowY: "auto" }}>
                  {filtered.slice(0, 200).map((p, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1.8fr 0.8fr 1fr 1fr 1fr 1fr 0.8fr", gap: 8, padding: "11px 20px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{p.nama_produk} <span style={{ color: C.muted, fontWeight: 400 }}>×{p.qty}</span></div>
                        <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>{p.no_pesanan} · {tanggalFmt(p.tanggal_pesanan)}</div>
                        {p.retur_dibatalkan && (
                          <span style={{ display: "inline-block", marginTop: 3, fontSize: 9, padding: "1px 6px", borderRadius: 8, background: `${C.yellow}20`, color: C.yellow, fontFamily: C.fontMono, fontWeight: 700 }}>
                            ↩ retur dibatalkan
                          </span>
                        )}
                        {p.hpp_per_unit === 0 && <div style={{ fontSize: 10, color: C.yellow }}>⚠ HPP belum ada</div>}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted }}>{p.nama_toko}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(p.escrow_amount)}</div>
                      <div style={{ fontSize: 12, color: C.red, fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(p.hpp_total)}</div>
                      <div style={{ fontSize: 11, color: C.yellow, fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(p.commission_fee + p.service_fee)}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: profitColor(p.profit), fontFamily: C.fontMono, whiteSpace: "nowrap" }}>{rupiahFmt(p.profit)}</div>
                      <div>
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 10, background: p.profit >= 0 ? `${C.green}20` : `${C.red}20`, color: p.profit >= 0 ? C.green : C.red, fontFamily: C.fontMono, fontWeight: 700 }}>
                          {pctFmt(p.margin_pct)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Catatan HPP */}
            {items.some(p => p.hpp_per_unit === 0) && (
              <div style={{ marginTop: 14, background: `${C.yellow}10`, border: `1px solid ${C.yellow}30`, borderRadius: 10, padding: "10px 16px", fontSize: 12, color: C.yellow, fontFamily: C.fontMono }}>
                ⚠️ Beberapa produk belum ada data HPP produksi — profit untuk produk tersebut = escrow saja (belum dikurangi HPP). Input batch produksi untuk hasil yang akurat.
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
