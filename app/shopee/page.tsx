"use client";

// /shopee — Dashboard.
// Tugas 1 (urutan #3). Live summary cards (pesanan, omzet, perlu-dikirim,
// saldo tersedia, retur pending), per-toko cards (pesanan hari ini, rating
// dari get_shop_performance, saldo pending), dan bar chart Recharts pesanan
// 7 hari terakhir per toko.

import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

type Toko = { id: number; nama: string; connected: boolean };

type TokoStats = {
  id: number;
  nama: string;
  connected: boolean;
  pesananHariIni: number;
  rating: number | null;
  saldoPending: number | null;
  saldoTersedia: number | null;
};

const rupiah = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
};

function todayWIB(): string {
  return new Date().toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
}

function last7DaysWIB(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const t = new Date();
    t.setDate(t.getDate() - i);
    days.push(t.toLocaleDateString("sv", { timeZone: "Asia/Jakarta" }));
  }
  return days;
}

function shortDayLabel(yyyymmdd: string): string {
  const d = new Date(yyyymmdd);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

// Defensive pickers — Shopee field names drift between API versions.
function pickNumber(obj: any, keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function parseBalance(raw: any): { tersedia: number | null; pending: number | null } {
  const resp = raw?.response ?? raw;
  return {
    tersedia: pickNumber(resp, ["seller_balance", "withdrawable_amount", "wallet_balance", "available_balance"]),
    pending: pickNumber(resp, ["escrow_amount", "pending_amount", "frozen_amount", "settlement_amount"]),
  };
}

function parseRating(raw: any): number | null {
  const resp = raw?.response ?? raw ?? {};
  // Common shapes we've seen across Shopee API versions.
  const candidates = [
    resp?.overall_performance?.rating,
    resp?.overall_performance?.shop_rating,
    resp?.shop_rating,
    resp?.rating,
    resp?.performance?.rating,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && !Number.isNaN(c)) return c;
    if (typeof c === "string" && !Number.isNaN(Number(c))) return Number(c);
  }
  return null;
}

function countReturns(raw: any): number {
  const resp = raw?.response ?? raw ?? {};
  const list = resp?.return_list ?? resp?.returns ?? [];
  return Array.isArray(list) ? list.length : 0;
}

// Color palette for per-toko series in the bar chart. Cycled if more toko
// than colors.
function tokoColors(C: any): string[] {
  return [C.accent, C.blue, C.purple, C.orange, C.pink, C.green, C.yellow, C.red];
}

export default function ShopeeDashboardPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [tokoStats, setTokoStats] = useState<TokoStats[]>([]);

  const [loadingDb, setLoadingDb] = useState(true);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [loadingReturns, setLoadingReturns] = useState(true);
  const [loadingPerf, setLoadingPerf] = useState(true);

  const [pesananHariIni, setPesananHariIni] = useState(0);
  const [omzetHariIni, setOmzetHariIni] = useState(0);
  const [perluKirim, setPerluKirim] = useState(0);
  const [totalSaldoTersedia, setTotalSaldoTersedia] = useState<number | null>(null);
  const [totalReturPending, setTotalReturPending] = useState<number | null>(null);

  type ChartRow = Record<string, string | number>;
  const [chartData, setChartData] = useState<ChartRow[]>([]);

  // ── DB-backed: toko list, today's orders, last-7d chart data ───────────
  const fetchDb = useCallback(async () => {
    setLoadingDb(true);
    try {
      const today = todayWIB();
      const days = last7DaysWIB();
      const since = days[0];

      const [tokoRes, todayOrdersRes, weekOrdersRes, readyRes, penjualanRes] = await Promise.all([
        supabase.from("toko_online")
          .select("id, nama, shopee_access_token")
          .eq("platform", "Shopee")
          .eq("aktif", true)
          .order("nama"),
        supabase.from("detail_penjualan_online")
          .select("qty, total_pembayaran, penjualan_online_id")
          .eq("tanggal_pesanan", today),
        supabase.from("detail_penjualan_online")
          .select("tanggal_pesanan, penjualan_online_id")
          .gte("tanggal_pesanan", since)
          .lte("tanggal_pesanan", today),
        supabase.from("detail_penjualan_online")
          .select("id", { count: "exact", head: true })
          .eq("status_shopee", "READY_TO_SHIP"),
        supabase.from("penjualan_online").select("id, toko_id"),
      ]);

      const toko: Toko[] = (tokoRes.data || []).map((t: any) => ({
        id: t.id, nama: t.nama, connected: !!t.shopee_access_token,
      }));
      setTokoList(toko);

      const penjualanToToko = new Map<number, number>(
        (penjualanRes.data || []).map((p: any) => [p.id, p.toko_id]),
      );

      // Today's totals
      const todayOrders = todayOrdersRes.data || [];
      setPesananHariIni(todayOrders.length);
      setOmzetHariIni(todayOrders.reduce((s, o: any) => s + (o.total_pembayaran || 0), 0));
      setPerluKirim(readyRes.count || 0);

      // Per-toko today's pesanan count
      const todayCountByToko = new Map<number, number>();
      for (const o of todayOrders) {
        const tokoId = penjualanToToko.get((o as any).penjualan_online_id);
        if (!tokoId) continue;
        todayCountByToko.set(tokoId, (todayCountByToko.get(tokoId) || 0) + 1);
      }

      setTokoStats(toko.map(t => ({
        id: t.id, nama: t.nama, connected: t.connected,
        pesananHariIni: todayCountByToko.get(t.id) || 0,
        rating: null, saldoPending: null, saldoTersedia: null,
      })));

      // Build chart data: per-day per-toko counts
      const counts = new Map<string, Map<number, number>>();
      for (const day of days) counts.set(day, new Map());
      for (const r of weekOrdersRes.data || []) {
        const day = (r as any).tanggal_pesanan;
        if (!counts.has(day)) continue;
        const tokoId = penjualanToToko.get((r as any).penjualan_online_id);
        if (!tokoId) continue;
        const m = counts.get(day)!;
        m.set(tokoId, (m.get(tokoId) || 0) + 1);
      }
      const rows: ChartRow[] = days.map(day => {
        const row: ChartRow = { date: shortDayLabel(day) };
        for (const t of toko) row[t.nama] = counts.get(day)?.get(t.id) || 0;
        return row;
      });
      setChartData(rows);
    } finally {
      setLoadingDb(false);
    }
  }, []);

  // ── /api/shopee/get-wallet-balance: total tersedia + per-toko pending ──
  const fetchWallet = useCallback(async () => {
    setLoadingWallet(true);
    try {
      const res = await fetch("/api/shopee/get-wallet-balance");
      const data = await res.json();
      let total = 0;
      const byToko = new Map<number, { tersedia: number | null; pending: number | null }>();
      for (const r of data.results || []) {
        const parsed = r.ok ? parseBalance(r.raw) : { tersedia: null, pending: null };
        byToko.set(r.toko_id, parsed);
        if (parsed.tersedia !== null) total += parsed.tersedia;
      }
      setTotalSaldoTersedia(total);
      setTokoStats(prev => prev.map(t => {
        const p = byToko.get(t.id);
        return p ? { ...t, saldoTersedia: p.tersedia, saldoPending: p.pending } : t;
      }));
    } finally { setLoadingWallet(false); }
  }, []);

  // ── /api/shopee/get-returns: count pending returns ─────────────────────
  const fetchReturns = useCallback(async () => {
    setLoadingReturns(true);
    try {
      const res = await fetch("/api/shopee/get-returns");
      const data = await res.json();
      let total = 0;
      for (const r of data.results || []) {
        if (r.ok) total += countReturns(r.raw);
      }
      setTotalReturPending(total);
    } finally { setLoadingReturns(false); }
  }, []);

  // ── /api/shopee/get-performance: per-toko rating ──────────────────────
  const fetchPerformance = useCallback(async () => {
    setLoadingPerf(true);
    try {
      const res = await fetch("/api/shopee/get-performance");
      const data = await res.json();
      const byToko = new Map<number, number | null>();
      for (const r of data.results || []) {
        byToko.set(r.toko_id, r.ok ? parseRating(r.raw) : null);
      }
      setTokoStats(prev => prev.map(t => ({ ...t, rating: byToko.get(t.id) ?? null })));
    } finally { setLoadingPerf(false); }
  }, []);

  // Kick all fetches in parallel on mount.
  useEffect(() => {
    fetchDb();
    fetchWallet();
    fetchReturns();
    fetchPerformance();
  }, [fetchDb, fetchWallet, fetchReturns, fetchPerformance]);

  const colors = useMemo(() => tokoColors(C), [C]);

  const summary = [
    { label: "Pesanan Hari Ini", value: loadingDb ? "…" : pesananHariIni.toLocaleString("id-ID"), hint: "Semua toko", color: C.accent },
    { label: "Omzet Hari Ini",   value: loadingDb ? "…" : rupiah(omzetHariIni),                   hint: todayWIB(),    color: C.green },
    { label: "Perlu Dikirim",    value: loadingDb ? "…" : perluKirim.toLocaleString("id-ID"),     hint: "READY_TO_SHIP", color: C.orange },
    { label: "Saldo Tersedia",   value: loadingWallet ? "…" : rupiah(totalSaldoTersedia),         hint: `${tokoList.length} toko`, color: C.blue },
    { label: "Retur Pending",    value: loadingReturns ? "…" : (totalReturPending ?? 0).toLocaleString("id-ID"), hint: "get_return_list", color: C.purple },
  ];

  return (
    <Sidebar pageTitle="Shopee Dashboard" pageSubtitle="Ringkasan semua toko">
      <div style={{ padding: "24px 28px" }}>
        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
          {summary.map((s, i) => (
            <div key={i} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
              padding: "16px 18px", boxShadow: C.shadow,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 0.5, textTransform: "uppercase" }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 6, fontFamily: C.fontSans }}>{s.value}</div>
              {s.hint && <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontFamily: C.fontMono }}>{s.hint}</div>}
            </div>
          ))}
        </div>

        {/* Per-toko cards */}
        <div style={{ marginBottom: 14, fontSize: 14, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>
          Per Toko
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 24 }}>
          {loadingDb && tokoStats.length === 0 && (
            <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Memuat...</div>
          )}
          {!loadingDb && tokoStats.length === 0 && (
            <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Belum ada toko aktif</div>
          )}
          {tokoStats.map(t => (
            <div key={t.id} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
              padding: "14px 16px", boxShadow: C.shadow,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>{t.nama}</div>
                <span style={{
                  padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                  background: t.connected ? C.greenDim : C.redDim,
                  color: t.connected ? C.green : C.red, fontFamily: C.fontMono,
                }}>{t.connected ? "Connected" : "Disconnected"}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>Pesanan hari ini</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>{t.pesananHariIni}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>Rating</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: t.rating !== null ? C.text : C.muted, fontFamily: C.fontSans }}>
                    {loadingPerf ? "…" : t.rating !== null ? t.rating.toFixed(2) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>Saldo pending</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: t.saldoPending !== null ? C.yellow : C.muted, fontFamily: C.fontMono }}>
                    {loadingWallet ? "…" : t.saldoPending !== null ? rupiah(t.saldoPending) : "—"}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 7-day per-toko bar chart */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>
            Pesanan 7 Hari Terakhir per Toko
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 4, marginBottom: 12 }}>
            Berdasarkan <code>detail_penjualan_online.tanggal_pesanan</code> WIB.
          </div>
          <div style={{ width: "100%", height: 280 }}>
            {loadingDb ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
                Memuat chart...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" stroke={C.muted} tick={{ fontSize: 11, fontFamily: C.fontMono }} />
                  <YAxis stroke={C.muted} tick={{ fontSize: 11, fontFamily: C.fontMono }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: C.card, border: `1px solid ${C.border}`,
                      borderRadius: 8, fontSize: 12, color: C.text, fontFamily: C.fontSans,
                    }}
                    labelStyle={{ color: C.text, fontWeight: 700 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: C.fontMono }} />
                  {tokoList.map((t, i) => (
                    <Bar key={t.id} dataKey={t.nama} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </Sidebar>
  );
}
