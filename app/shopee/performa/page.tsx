"use client";

// /shopee/performa — Shop performance per toko.
// Tugas 10 (urutan): per-toko card with overall score + key metrics
// (rating, response rate/time, late shipment, return rate), color-coded
// against Shopee's typical health thresholds. Time-series chart is
// intentionally omitted — get_shop_performance returns a point-in-time
// snapshot, not historical data.

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type TokoPerf = {
  toko_id: number;
  toko: string;
  ok: boolean;
  error: string | null;
  rating: number | null;
  penalty: number | null;
  response_rate: number | null;    // percent 0-100
  response_time: number | null;    // hours
  late_shipment_rate: number | null;   // percent 0-100
  return_refund_rate: number | null;   // percent 0-100
  raw: any;
};

// Defensive number picker — handles "0.05", 0.05, "5%" (we strip the %).
function pickNumber(obj: any, keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    let v = obj?.[k];
    if (v && typeof v === "object" && "my_shop_performance" in v) v = v.my_shop_performance;
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string") {
      const cleaned = v.replace("%", "").trim();
      if (cleaned && !Number.isNaN(Number(cleaned))) return Number(cleaned);
    }
  }
  return null;
}

function parsePerf(toko_id: number, toko: string, ok: boolean, raw: any, error?: string): TokoPerf {
  const resp = raw?.response ?? raw ?? {};
  const overall = resp?.overall_performance ?? {};
  const fulfillment = resp?.fulfillment ?? resp?.fulfilment ?? {};
  const service = resp?.customer_service ?? {};
  const returns = resp?.return_refund ?? resp?.listing_violations ?? {};

  const rate = pickNumber;

  // Some Shopee shops return rates as fractions (0.05 = 5%); others as
  // percentages already (5 = 5%). Normalize to 0-100 if we see < 1.
  const normalizePct = (n: number | null): number | null => {
    if (n === null) return null;
    return n <= 1 && n > 0 ? n * 100 : n;
  };

  // response_time often comes in seconds — normalize to hours.
  const normalizeRespTime = (n: number | null): number | null => {
    if (n === null) return null;
    if (n > 1000) return Math.round((n / 3600) * 10) / 10; // seconds → hours
    return Math.round(n * 10) / 10;
  };

  return {
    toko_id, toko, ok,
    error: error || null,
    rating: rate(overall, ["rating", "shop_rating"]) ?? rate(resp, ["shop_rating", "rating"]),
    penalty: rate(overall, ["penalty_points", "penalty"]) ?? rate(resp, ["penalty_points"]),
    response_rate: normalizePct(
      rate(service, ["response_rate"]) ?? rate(resp, ["response_rate"]),
    ),
    response_time: normalizeRespTime(
      rate(service, ["response_time"]) ?? rate(resp, ["response_time"]),
    ),
    late_shipment_rate: normalizePct(
      rate(fulfillment, ["late_shipment_rate"]) ?? rate(resp, ["late_shipment_rate"]),
    ),
    return_refund_rate: normalizePct(
      rate(returns, ["return_refund_rate", "non_fulfillment_rate"]) ?? rate(resp, ["return_refund_rate", "non_fulfillment_rate"]),
    ),
    raw: resp,
  };
}

// Health thresholds. goodIfLow=true means low values are healthier (rates,
// time). For rating/response_rate higher is better.
type Health = "good" | "warn" | "bad";
function healthFor(metric: string, v: number | null): Health | null {
  if (v === null) return null;
  switch (metric) {
    case "rating":
      if (v >= 4.5) return "good";
      if (v >= 4.0) return "warn";
      return "bad";
    case "response_rate":
      if (v >= 95) return "good";
      if (v >= 80) return "warn";
      return "bad";
    case "response_time":
      if (v <= 1) return "good";
      if (v <= 4) return "warn";
      return "bad";
    case "late_shipment_rate":
      if (v <= 1) return "good";
      if (v <= 4) return "warn";
      return "bad";
    case "return_refund_rate":
      if (v <= 1) return "good";
      if (v <= 3) return "warn";
      return "bad";
    case "penalty":
      if (v <= 0) return "good";
      if (v <= 3) return "warn";
      return "bad";
  }
  return null;
}

function healthColor(h: Health | null, C: any): string {
  if (h === "good") return C.green;
  if (h === "warn") return C.yellow;
  if (h === "bad") return C.red;
  return C.muted;
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(1)}%`;
}
function fmtHours(v: number | null): string {
  if (v === null) return "—";
  return `${v.toFixed(1)} jam`;
}
function fmtRating(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(2);
}

function MetricRow({ label, value, health, C }: { label: string; value: string; health: Health | null; C: any }) {
  const color = healthColor(health, C);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px dashed ${C.border}` }}>
      <span style={{ fontSize: 12, color: C.textMid, fontFamily: C.fontSans }}>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: C.fontMono }}>{value}</span>
        {health && (
          <span style={{
            width: 8, height: 8, borderRadius: "50%", background: color,
            boxShadow: `0 0 6px ${color}`, flexShrink: 0,
          }} />
        )}
      </span>
    </div>
  );
}

export default function ShopeePerformaPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [rows, setRows] = useState<TokoPerf[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shopee/get-performance");
      const data = await res.json();
      const mapped: TokoPerf[] = (data.results || []).map((r: any) =>
        parsePerf(r.toko_id, r.toko, r.ok, r.raw, r.error),
      );
      setRows(mapped);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <Sidebar pageTitle="Shopee · Performa" pageSubtitle="Skor & metrik toko">
      <div style={{ padding: "24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Performa Toko</h1>
            <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
              {rows.length} toko · snapshot dari <code>get_shop_performance</code>
            </p>
          </div>
          <button onClick={fetchAll} disabled={loading} style={{
            padding: "8px 16px",
            background: "transparent", border: `1.5px solid ${C.border}`,
            color: C.muted, borderRadius: 8, cursor: "pointer",
            fontSize: 13, fontWeight: 700, opacity: loading ? 0.5 : 1,
          }}>{loading ? "⏳" : "↻"} Refresh</button>
        </div>

        {/* Legend */}
        <div style={{
          display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18,
          padding: "10px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
          fontSize: 11, color: C.muted, fontFamily: C.fontMono, alignItems: "center",
        }}>
          <span>Indikator:</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} /> Bagus
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.yellow }} /> Perlu Perhatian
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red }} /> Kritis
          </span>
          <span style={{ marginLeft: "auto" }}>Threshold mengikuti standar umum Shopee.</span>
        </div>

        {loading && rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
            Memuat performa...
          </div>
        ) : rows.length === 0 ? (
          <div style={{
            padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13,
            background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12,
          }}>
            Tidak ada toko terhubung
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
            {rows.map(r => {
              const ratingHealth = healthFor("rating", r.rating);
              const headerColor = !r.ok ? C.red : healthColor(ratingHealth, C);
              return (
                <div key={r.toko_id} style={{
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow,
                  borderTop: `3px solid ${headerColor}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>
                        {r.toko}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
                        {r.ok ? "Snapshot live" : "Error"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>Rating</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: headerColor, fontFamily: C.fontMono, lineHeight: 1 }}>
                        {fmtRating(r.rating)}
                      </div>
                    </div>
                  </div>

                  {!r.ok && (
                    <div style={{ marginTop: 10, padding: 10, background: C.redDim, color: C.red, borderRadius: 8, fontSize: 12 }}>
                      ⚠ {r.error || "Gagal ambil performa"}
                    </div>
                  )}

                  {r.ok && (
                    <>
                      <div style={{ marginTop: 14 }}>
                        <MetricRow label="Response Rate"     value={fmtPct(r.response_rate)}        health={healthFor("response_rate", r.response_rate)}           C={C} />
                        <MetricRow label="Response Time"     value={fmtHours(r.response_time)}      health={healthFor("response_time", r.response_time)}           C={C} />
                        <MetricRow label="Late Shipment"     value={fmtPct(r.late_shipment_rate)}   health={healthFor("late_shipment_rate", r.late_shipment_rate)} C={C} />
                        <MetricRow label="Return / Refund"   value={fmtPct(r.return_refund_rate)}   health={healthFor("return_refund_rate", r.return_refund_rate)} C={C} />
                        {r.penalty !== null && (
                          <MetricRow label="Penalty Points"  value={String(r.penalty)}              health={healthFor("penalty", r.penalty)}                       C={C} />
                        )}
                      </div>

                      <details style={{ marginTop: 12 }}>
                        <summary style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, cursor: "pointer" }}>
                          Lihat raw response
                        </summary>
                        <pre style={{
                          background: C.bgPage, padding: 10, borderRadius: 8, fontSize: 10,
                          color: C.textMid, fontFamily: C.fontMono, overflow: "auto",
                          maxHeight: 240, marginTop: 8,
                        }}>{JSON.stringify(r.raw, null, 2)}</pre>
                      </details>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Sidebar>
  );
}
