"use client";

// /shopee/promosi — Voucher + Diskon (harga coret).
// Tugas 11 (urutan): two tabs, toko + status filters, expiry-alert button
// that sends Telegram for any promo ending within 24h.

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type Promo = {
  key: string;          // toko_id + id
  kind: "voucher" | "diskon";
  toko_id: number;
  toko_nama: string;
  id: string;
  name: string;
  code: string;
  discount: string;     // formatted "Rp 10rb" or "10%"
  min_basket: number | null;
  start_time: number;   // unix sec
  end_time: number;     // unix sec
  usage_current: number | null;
  usage_max: number | null;
  // Diskon-specific
  items: { name: string; original: number | null; promo: number | null }[];
  raw: any;
};

const rupiah = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
};

function unixDate(unix: number): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

function statusOf(p: Promo): "aktif" | "habis" | "akan_datang" {
  const now = Math.floor(Date.now() / 1000);
  if (p.end_time && now > p.end_time) return "habis";
  if (p.usage_max !== null && p.usage_current !== null && p.usage_current >= p.usage_max) return "habis";
  if (p.start_time && now < p.start_time) return "akan_datang";
  return "aktif";
}

function statusBadge(s: "aktif" | "habis" | "akan_datang", C: any): { bg: string; color: string; label: string } {
  if (s === "aktif") return { bg: C.greenDim, color: C.green, label: "Aktif" };
  if (s === "habis") return { bg: C.redDim, color: C.red, label: "Habis" };
  return { bg: C.blueDim, color: C.blue, label: "Akan Datang" };
}

function hoursUntil(unix: number): number {
  if (!unix) return Infinity;
  return (unix * 1000 - Date.now()) / 3600000;
}

// Defensive helpers — Shopee field names differ between API versions.
function pickStr(o: any, ks: string[], fallback = ""): string {
  for (const k of ks) {
    const v = o?.[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number") return String(v);
  }
  return fallback;
}
function pickNum(o: any, ks: string[]): number | null {
  for (const k of ks) {
    const v = o?.[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function parseVoucher(toko_id: number, toko: string, raw: any): Promo {
  const id = pickStr(raw, ["voucher_id", "id"]);
  const code = pickStr(raw, ["voucher_code", "code"]);
  const name = pickStr(raw, ["voucher_name", "name", "title"], code || id || "(no name)");
  const discAmt = pickNum(raw, ["discount_amount", "discount_value", "amount"]);
  const discPct = pickNum(raw, ["percentage_off", "percentage", "discount_percentage"]);
  const discount = discAmt !== null ? rupiah(discAmt) : (discPct !== null ? `${discPct}%` : "—");

  return {
    key: `voucher-${toko_id}-${id}`,
    kind: "voucher",
    toko_id, toko_nama: toko,
    id, name, code,
    discount,
    min_basket: pickNum(raw, ["min_basket_price", "minimum_spend", "min_spend"]),
    start_time: pickNum(raw, ["start_time", "from_time"]) ?? 0,
    end_time: pickNum(raw, ["end_time", "to_time"]) ?? 0,
    usage_current: pickNum(raw, ["current_usage", "usage_count", "used"]),
    usage_max: pickNum(raw, ["max_usage", "usage_quantity", "quota"]),
    items: [],
    raw,
  };
}

function parseDiskon(toko_id: number, toko: string, raw: any): Promo {
  const id = pickStr(raw, ["discount_id", "id"]);
  const name = pickStr(raw, ["discount_name", "name", "title"], id || "(no name)");
  const rawItems = raw?.item_list ?? raw?.items ?? [];
  const items = (Array.isArray(rawItems) ? rawItems : []).map((it: any) => ({
    name: pickStr(it, ["item_name", "name"], pickStr(it, ["item_id", "id"], "")),
    original: pickNum(it, ["original_price", "item_original_price", "price"]),
    promo:    pickNum(it, ["promotion_price", "discount_price", "item_promotion_price"]),
  }));

  return {
    key: `diskon-${toko_id}-${id}`,
    kind: "diskon",
    toko_id, toko_nama: toko,
    id, name, code: "",
    discount: items.length > 0 ? `${items.length} produk` : "—",
    min_basket: null,
    start_time: pickNum(raw, ["start_time", "from_time"]) ?? 0,
    end_time: pickNum(raw, ["end_time", "to_time"]) ?? 0,
    usage_current: null, usage_max: null,
    items,
    raw,
  };
}

export default function ShopeePromosiPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [tab, setTab] = useState<"voucher" | "diskon">("voucher");
  const [vouchers, setVouchers] = useState<Promo[]>([]);
  const [diskons, setDiskons] = useState<Promo[]>([]);
  const [tokoOpts, setTokoOpts] = useState<{ id: number; nama: string }[]>([]);

  const [loadingV, setLoadingV] = useState(true);
  const [loadingD, setLoadingD] = useState(true);
  const [filterToko, setFilterToko] = useState<string>("semua");
  const [filterStatus, setFilterStatus] = useState<"semua" | "aktif" | "habis" | "akan_datang">("semua");
  const [sendingAlerts, setSendingAlerts] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchVouchers = useCallback(async () => {
    setLoadingV(true);
    try {
      const res = await fetch("/api/shopee/get-vouchers");
      const data = await res.json();
      const all: Promo[] = [];
      const opts: { id: number; nama: string }[] = [];
      for (const r of data.results || []) {
        opts.push({ id: r.toko_id, nama: r.toko });
        if (!r.ok) continue;
        const list = r.raw?.response?.voucher_list ?? r.raw?.response?.vouchers ?? [];
        if (!Array.isArray(list)) continue;
        for (const row of list) all.push(parseVoucher(r.toko_id, r.toko, row));
      }
      all.sort((a, b) => b.start_time - a.start_time);
      setVouchers(all);
      setTokoOpts(prev => prev.length ? prev : opts);
    } finally { setLoadingV(false); }
  }, []);

  const fetchDiskons = useCallback(async () => {
    setLoadingD(true);
    try {
      const res = await fetch("/api/shopee/get-discounts");
      const data = await res.json();
      const all: Promo[] = [];
      const opts: { id: number; nama: string }[] = [];
      for (const r of data.results || []) {
        opts.push({ id: r.toko_id, nama: r.toko });
        if (!r.ok) continue;
        const list = r.raw?.response?.discount_list ?? r.raw?.response?.discounts ?? [];
        if (!Array.isArray(list)) continue;
        for (const row of list) all.push(parseDiskon(r.toko_id, r.toko, row));
      }
      all.sort((a, b) => b.start_time - a.start_time);
      setDiskons(all);
      setTokoOpts(prev => prev.length ? prev : opts);
    } finally { setLoadingD(false); }
  }, []);

  useEffect(() => { fetchVouchers(); fetchDiskons(); }, [fetchVouchers, fetchDiskons]);

  const activeList = tab === "voucher" ? vouchers : diskons;
  const loading = tab === "voucher" ? loadingV : loadingD;
  const refresh = tab === "voucher" ? fetchVouchers : fetchDiskons;

  const filtered = useMemo(() => activeList.filter(p => {
    if (filterToko !== "semua" && String(p.toko_id) !== filterToko) return false;
    if (filterStatus !== "semua" && statusOf(p) !== filterStatus) return false;
    return true;
  }), [activeList, filterToko, filterStatus]);

  // Promotions ending within 24h (both kinds, all toko) — used by the
  // Telegram alert button.
  const expiringSoon = useMemo(() => {
    const all = [...vouchers, ...diskons];
    return all.filter(p => {
      if (statusOf(p) !== "aktif") return false;
      const h = hoursUntil(p.end_time);
      return h > 0 && h <= 24;
    });
  }, [vouchers, diskons]);

  const sendAlerts = async () => {
    if (expiringSoon.length === 0) {
      showToast("Tidak ada promo yang akan habis dalam 24 jam", "error");
      return;
    }
    setSendingAlerts(true);
    let ok = 0, fail = 0;
    try {
      for (const p of expiringSoon) {
        const hLeft = Math.max(0, Math.round(hoursUntil(p.end_time)));
        const label = p.kind === "voucher" ? "Voucher" : "Diskon";
        const code = p.code ? ` <code>${p.code}</code>` : "";
        const msg = [
          `⏰ <b>${label} hampir habis</b>`,
          `[${p.toko_nama}] ${p.name}${code}`,
          `Berakhir dalam ~${hLeft} jam (${unixDate(p.end_time)})`,
        ].join("\n");
        try {
          const res = await fetch("/api/telegram/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: msg }),
          });
          const data = await res.json();
          if (data.ok) ok++; else fail++;
        } catch { fail++; }
        await new Promise(r => setTimeout(r, 250));
      }
      showToast(`✓ ${ok} alert terkirim${fail > 0 ? `, ${fail} gagal` : ""}`, fail > 0 ? "error" : "success");
    } finally {
      setSendingAlerts(false);
    }
  };

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    background: active ? `${C.accent}20` : "transparent",
    border: `1.5px solid ${active ? C.accent : C.border}`,
    borderRadius: 20,
    color: active ? C.accent : C.muted,
    cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 500,
    fontFamily: C.fontSans, transition: "all 0.15s",
  });

  return (
    <AppShell>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 18px",
          background: toast.type === "success" ? C.green : C.red, color: "#fff",
          borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: C.shadowMd,
        }}>{toast.msg}</div>
      )}

      <div style={{ padding: "24px 28px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Promosi</h1>
            <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
              {vouchers.length} voucher · {diskons.length} diskon · {expiringSoon.length} akan habis &lt; 24 jam
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={sendAlerts} disabled={sendingAlerts || expiringSoon.length === 0} style={{
              padding: "8px 16px",
              background: expiringSoon.length > 0
                ? `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`
                : "transparent",
              border: expiringSoon.length > 0 ? "none" : `1.5px solid ${C.border}`,
              color: expiringSoon.length > 0 ? "#fff" : C.muted,
              borderRadius: 8,
              cursor: sendingAlerts || expiringSoon.length === 0 ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 700, opacity: sendingAlerts ? 0.7 : 1,
            }}>
              {sendingAlerts ? "Mengirim..." : `🔔 Kirim Alert Telegram (${expiringSoon.length})`}
            </button>
            <button onClick={refresh} disabled={loading} style={{
              padding: "8px 16px",
              background: "transparent", border: `1.5px solid ${C.border}`,
              color: C.muted, borderRadius: 8, cursor: "pointer",
              fontSize: 13, fontWeight: 700, opacity: loading ? 0.5 : 1,
            }}>{loading ? "⏳" : "↻"} Refresh</button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: `1px solid ${C.border}` }}>
          {([{ k: "voucher", l: "Voucher", n: vouchers.length }, { k: "diskon", l: "Diskon", n: diskons.length }] as const).map(t => {
            const active = tab === t.k;
            return (
              <button key={t.k} onClick={() => setTab(t.k)} style={{
                padding: "10px 18px", border: "none", background: "transparent",
                color: active ? C.accent : C.muted, fontWeight: active ? 800 : 600,
                fontSize: 13, fontFamily: C.fontSans, cursor: "pointer",
                borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
                marginBottom: -1,
              }}>
                {t.l} <span style={{ fontFamily: C.fontMono, fontSize: 11, opacity: 0.7 }}>({t.n})</span>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, minWidth: 80 }}>Toko</span>
            <button style={pillStyle(filterToko === "semua")} onClick={() => setFilterToko("semua")}>Semua</button>
            {tokoOpts.map(t => (
              <button key={t.id} style={pillStyle(filterToko === String(t.id))} onClick={() => setFilterToko(String(t.id))}>{t.nama}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, minWidth: 80 }}>Status</span>
            {([
              { k: "semua", l: "Semua" },
              { k: "aktif", l: "Aktif" },
              { k: "akan_datang", l: "Akan Datang" },
              { k: "habis", l: "Habis" },
            ] as const).map(o => (
              <button key={o.k} style={pillStyle(filterStatus === o.k)} onClick={() => setFilterStatus(o.k)}>{o.l}</button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading && activeList.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Memuat...</div>
        ) : filtered.length === 0 ? (
          <div style={{
            padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13,
            background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12,
          }}>
            Tidak ada {tab === "voucher" ? "voucher" : "diskon"} yang cocok dengan filter
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(p => {
              const status = statusOf(p);
              const badge = statusBadge(status, C);
              const hLeft = hoursUntil(p.end_time);
              const expiringSoonRow = status === "aktif" && hLeft > 0 && hLeft <= 24;
              return (
                <div key={p.key} style={{
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: "16px 18px", boxShadow: C.shadow,
                  borderLeft: expiringSoonRow ? `4px solid ${C.yellow}` : `4px solid transparent`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                    <div style={{ minWidth: 0, flex: "1 1 320px" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: 10, padding: "3px 10px", borderRadius: 20,
                          background: badge.bg, color: badge.color,
                          fontWeight: 800, fontFamily: C.fontMono,
                        }}>{badge.label}</span>
                        <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{p.toko_nama}</span>
                        {expiringSoonRow && (
                          <span style={{ fontSize: 10, color: C.yellow, fontFamily: C.fontMono, fontWeight: 700 }}>
                            ⏰ habis ~{Math.max(0, Math.round(hLeft))}j
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>{p.name}</div>
                      {p.code && (
                        <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
                          Kode: <span style={{ color: C.accent, fontWeight: 700 }}>{p.code}</span>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
                        {unixDate(p.start_time)} — {unixDate(p.end_time)}
                      </div>

                      {/* Diskon items (collapsible if many) */}
                      {p.kind === "diskon" && p.items.length > 0 && (
                        <details style={{ marginTop: 8 }}>
                          <summary style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, cursor: "pointer" }}>
                            {p.items.length} produk diskon
                          </summary>
                          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                            {p.items.slice(0, 20).map((it, i) => (
                              <div key={i} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "5px 10px", fontSize: 11, fontFamily: C.fontSans,
                                background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                                borderRadius: 6,
                              }}>
                                <span style={{ color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                                <span style={{ fontFamily: C.fontMono, marginLeft: 8, whiteSpace: "nowrap" }}>
                                  {it.original !== null && <span style={{ color: C.muted, textDecoration: "line-through" }}>{rupiah(it.original)}</span>}
                                  {" "}
                                  <span style={{ color: C.green, fontWeight: 700 }}>{rupiah(it.promo)}</span>
                                </span>
                              </div>
                            ))}
                            {p.items.length > 20 && (
                              <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, textAlign: "center" }}>
                                +{p.items.length - 20} lainnya
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </div>

                    <div style={{ minWidth: 180, textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>
                        {p.kind === "voucher" ? "Diskon" : "Total"}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: C.accent, fontFamily: C.fontMono, marginTop: 2 }}>
                        {p.discount}
                      </div>
                      {p.kind === "voucher" && (
                        <>
                          {p.min_basket !== null && (
                            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 8 }}>
                              Min. belanja: <span style={{ color: C.textMid, fontWeight: 700 }}>{rupiah(p.min_basket)}</span>
                            </div>
                          )}
                          {(p.usage_current !== null || p.usage_max !== null) && (
                            <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 4 }}>
                              Usage: <span style={{ color: C.textMid, fontWeight: 700 }}>{p.usage_current ?? "?"} / {p.usage_max ?? "∞"}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
