"use client";

// /shopee/pesanan/print-resi — Bulk print AWB resi Shopee (EPOS 100×150mm)

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import { tanggalFmt } from "@/lib/format";
import {
  BatchMode,
  getBatchWindow,
  isDropoff,
  orderMatchesBatch,
  PRINTABLE_STATUSES,
  todayWib,
} from "@/lib/shopee/print-batch";
import { runBulkPrintJobs, type PrintJob } from "@/lib/shopee/print-resi-client";

type Toko = { id: number; nama: string };

type PrintableOrder = {
  id: number;
  no_pesanan: string;
  tanggal_pesanan: string;
  no_resi: string | null;
  nama_pembeli: string | null;
  jasa_kirim: string | null;
  status_shopee: string | null;
  nama_toko: string;
  toko_id: number;
  item_count: number;
};

type Toast = { msg: string; type: "success" | "error" };

const BATCH_OPTIONS: { key: BatchMode; label: string; hint: string }[] = [
  { key: "semua", label: "Semua Belum Cetak", hint: "Semua pesanan PROCESSED" },
  { key: "pagi", label: "Batch Pagi", hint: "Kemarin + hari ini" },
  { key: "siang", label: "Batch Siang", hint: "Hari ini saja" },
  { key: "custom", label: "Custom", hint: "Rentang tanggal" },
];

function PrintResiContent() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [allOrders, setAllOrders] = useState<PrintableOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const [batchMode, setBatchMode] = useState<BatchMode>("semua");
  const [filterToko, setFilterToko] = useState<"semua" | number>("semua");
  const [customFrom, setCustomFrom] = useState(todayWib());
  const [customTo, setCustomTo] = useState(todayWib());
  const [includeReprint, setIncludeReprint] = useState(false);
  const [belumAturCount, setBelumAturCount] = useState(0);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border: `1.5px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    fontFamily: C.fontSans,
    fontSize: 13,
    outline: "none",
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [tokoRes, ordersRes, penjualanRes, rtsRes] = await Promise.all([
        supabase
          .from("toko_online")
          .select("id, nama")
          .eq("platform", "Shopee")
          .eq("aktif", true)
          .not("shopee_access_token", "is", null)
          .order("id"),
        supabase
          .from("detail_penjualan_online")
          .select("id, no_pesanan, tanggal_pesanan, no_resi, nama_pembeli, jasa_kirim, status_shopee, penjualan_online_id")
          .in("status_shopee", includeReprint ? ["PROCESSED", "LABEL_PRINTED"] : ["PROCESSED"])
          .order("tanggal_pesanan", { ascending: false })
          .limit(3000),
        supabase.from("penjualan_online").select("id, toko_id"),
        supabase
          .from("detail_penjualan_online")
          .select("no_pesanan")
          .eq("status_shopee", "READY_TO_SHIP")
          .limit(500),
      ]);

      const rtsUnique = new Set((rtsRes.data || []).map((r: { no_pesanan: string }) => r.no_pesanan));
      setBelumAturCount(rtsUnique.size);

      const tokoData: Toko[] = tokoRes.data || [];
      setTokoList(tokoData);
      const tokoMap = new Map(tokoData.map(t => [t.id, t.nama]));
      const penjualanMap = new Map<number, number>(
        (penjualanRes.data || []).map((p: { id: number; toko_id: number }) => [p.id, p.toko_id]),
      );

      const byOrder = new Map<string, PrintableOrder>();
      for (const r of ordersRes.data || []) {
        const tokoId = penjualanMap.get(r.penjualan_online_id) || 0;
        const key = `${tokoId}|${r.no_pesanan}`;
        const existing = byOrder.get(key);
        if (existing) {
          existing.item_count += 1;
          continue;
        }
        byOrder.set(key, {
          id: r.id,
          no_pesanan: r.no_pesanan,
          tanggal_pesanan: r.tanggal_pesanan,
          no_resi: r.no_resi,
          nama_pembeli: r.nama_pembeli,
          jasa_kirim: r.jasa_kirim,
          status_shopee: r.status_shopee,
          nama_toko: tokoMap.get(tokoId) || "-",
          toko_id: tokoId,
          item_count: 1,
        });
      }
      setAllOrders([...byOrder.values()]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memuat";
      showToast("Gagal load: " + msg, "error");
    } finally {
      setLoading(false);
    }
  }, [includeReprint]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const batchWindow = useMemo(
    () => getBatchWindow(batchMode, batchMode === "custom" ? { from: customFrom, to: customTo } : undefined),
    [batchMode, customFrom, customTo],
  );

  const filtered = useMemo(() => {
    return allOrders.filter(o => {
      if (filterToko !== "semua" && o.toko_id !== filterToko) return false;
      if (!PRINTABLE_STATUSES.has(o.status_shopee || "")) return false;
      if (!includeReprint && o.status_shopee === "LABEL_PRINTED") return false;
      return orderMatchesBatch(o.tanggal_pesanan, batchWindow);
    });
  }, [allOrders, filterToko, batchWindow, includeReprint]);

  const byToko = useMemo(() => {
    const map = new Map<number, PrintableOrder[]>();
    for (const o of filtered) {
      const arr = map.get(o.toko_id) || [];
      arr.push(o);
      map.set(o.toko_id, arr);
    }
    return map;
  }, [filtered]);

  const buildJobs = (orders: PrintableOrder[]): PrintJob[] => {
    const map = new Map<number, PrintJob>();
    for (const o of orders) {
      const existing = map.get(o.toko_id);
      if (existing) existing.orderSns.push(o.no_pesanan);
      else map.set(o.toko_id, { tokoId: o.toko_id, tokoNama: o.nama_toko, orderSns: [o.no_pesanan] });
    }
    return [...map.values()];
  };

  const handlePrintAll = async () => {
    if (filtered.length === 0) { showToast("Tidak ada pesanan untuk dicetak", "error"); return; }
    setPrinting(true);
    setProgress("Menyiapkan…");
    try {
      const { printed, errors } = await runBulkPrintJobs(buildJobs(filtered), setProgress);
      if (errors.length) showToast(`${printed} resi OK · ${errors.length} gagal`, "error");
      else showToast(`✓ ${printed} resi siap cetak`);
    } catch (err: unknown) {
      showToast("Gagal print: " + (err instanceof Error ? err.message : "error"), "error");
    } finally {
      setPrinting(false);
      setProgress(null);
    }
  };

  const handlePrintToko = async (tokoId: number) => {
    const orders = byToko.get(tokoId) || [];
    if (!orders.length) return;
    setPrinting(true);
    setProgress("Menyiapkan…");
    try {
      const { printed, errors } = await runBulkPrintJobs(buildJobs(orders), setProgress);
      if (errors.length) showToast(`${printed} resi OK · ${errors.length} gagal`, "error");
      else showToast(`✓ ${printed} resi ${orders[0].nama_toko}`);
    } catch (err: unknown) {
      showToast("Gagal print: " + (err instanceof Error ? err.message : "error"), "error");
    } finally {
      setPrinting(false);
      setProgress(null);
    }
  };

  return (
    <AppShell>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .order-row:hover { background: ${isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"} !important; }
      `}</style>

      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "12px 20px", borderRadius: 10,
          background: toast.type === "success" ? C.green : C.red,
          color: "#fff", fontSize: 13, fontWeight: 700, boxShadow: C.shadowMd,
          animation: "fadeUp 0.2s ease",
        }}>{toast.msg}</div>
      )}

      <div style={{ padding: "24px 28px", animation: "fadeUp 0.3s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Print Resi Massal</h1>
            <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
              EPOS 100×150mm · {filtered.length} pesanan siap cetak
              {progress && <> · <span style={{ color: C.accent }}>{progress}</span></>}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/shopee/pesanan" style={{ ...inputStyle, textDecoration: "none", fontWeight: 600 }}>← Pesanan</Link>
            <Link href="/shopee/packing" style={{ ...inputStyle, textDecoration: "none", fontWeight: 600 }}>📋 Rekap Packing</Link>
            <button
              onClick={handlePrintAll}
              disabled={printing || filtered.length === 0}
              style={{
                padding: "10px 22px",
                background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`,
                border: "none", color: "#fff", borderRadius: 10,
                cursor: printing || filtered.length === 0 ? "not-allowed" : "pointer",
                fontSize: 14, fontWeight: 800, fontFamily: C.fontSans,
                opacity: printing || filtered.length === 0 ? 0.6 : 1,
              }}
            >
              {printing ? "⏳ Mencetak…" : `🖨 Print Semua (${filtered.length})`}
            </button>
          </div>
        </div>

        {belumAturCount > 0 && (
          <div style={{
            padding: "12px 16px", marginBottom: 16, borderRadius: 10,
            background: C.redDim, border: `1px solid ${C.red}40`,
            fontSize: 12, color: C.red, fontFamily: C.fontSans,
          }}>
            ⚠ <b>{belumAturCount}</b> pesanan belum diatur pengiriman (READY_TO_SHIP).
            Atur dulu di <Link href="/shopee/pesanan?status=to_process" style={{ color: C.red, fontWeight: 700 }}>Menunggu Diproses</Link> sebelum bisa cetak resi.
          </div>
        )}

        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "16px 18px", marginBottom: 18, boxShadow: C.shadow,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
            Batch Cetak
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {BATCH_OPTIONS.map(opt => {
              const active = batchMode === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setBatchMode(opt.key)}
                  style={{
                    padding: "8px 14px", borderRadius: 10,
                    background: active ? `${C.accent}20` : "transparent",
                    border: `1.5px solid ${active ? C.accent : C.border}`,
                    color: active ? C.accent : C.text,
                    cursor: "pointer", fontWeight: active ? 800 : 500, fontSize: 13,
                  }}
                >
                  {opt.label}
                  <span style={{ display: "block", fontSize: 10, color: C.muted, fontWeight: 500, marginTop: 2 }}>{opt.hint}</span>
                </button>
              );
            })}
          </div>

          {batchMode === "custom" && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={inputStyle} />
              <span style={{ color: C.muted }}>s/d</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={inputStyle} />
            </div>
          )}

          <div style={{ fontSize: 12, color: C.textMid, marginBottom: 12, fontFamily: C.fontMono }}>
            {batchWindow.label}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={filterToko}
              onChange={e => setFilterToko(e.target.value === "semua" ? "semua" : Number(e.target.value))}
              style={{ ...inputStyle, cursor: "pointer", minWidth: 180 }}
            >
              <option value="semua">Semua Toko</option>
              {tokoList.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, cursor: "pointer" }}>
              <input type="checkbox" checked={includeReprint} onChange={e => setIncludeReprint(e.target.checked)} />
              Sertakan cetak ulang (LABEL_PRINTED)
            </label>
            <button onClick={fetchOrders} disabled={loading} style={{ ...inputStyle, cursor: "pointer", fontWeight: 600 }}>
              {loading ? "Memuat…" : "↻ Refresh"}
            </button>
          </div>
        </div>

        {[...byToko.entries()].map(([tokoId, orders]) => (
          <div key={tokoId} style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, marginBottom: 14, overflow: "hidden", boxShadow: C.shadow,
          }}>
            <div style={{
              padding: "14px 18px", borderBottom: `1px solid ${C.border}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{orders[0].nama_toko}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
                  {orders.length} pesanan · {orders.filter(o => isDropoff(o.jasa_kirim)).length} dropoff · {orders.filter(o => !isDropoff(o.jasa_kirim)).length} pickup
                </div>
              </div>
              <button
                onClick={() => handlePrintToko(tokoId)}
                disabled={printing}
                style={{
                  padding: "8px 16px",
                  background: `${C.accent}15`,
                  border: `1.5px solid ${C.accent}`,
                  color: C.accent, borderRadius: 10,
                  cursor: printing ? "not-allowed" : "pointer",
                  fontSize: 13, fontWeight: 700, opacity: printing ? 0.6 : 1,
                }}
              >
                🖨 Print {orders.length}
              </button>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 100px 90px 80px",
              padding: "8px 18px",
              background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
              fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: C.fontMono,
              letterSpacing: 1, textTransform: "uppercase",
            }}>
              <span>Pesanan</span>
              <span>Resi</span>
              <span>Tanggal</span>
              <span>Kirim</span>
              <span>Item</span>
            </div>

            {orders.map((o, i) => {
              const drop = isDropoff(o.jasa_kirim);
              return (
                <div
                  key={o.no_pesanan}
                  className="order-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 100px 90px 80px",
                    padding: "10px 18px",
                    borderBottom: i < orders.length - 1 ? `1px solid ${C.border}` : "none",
                    alignItems: "center",
                    fontSize: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: C.text, fontFamily: C.fontMono }}>{o.no_pesanan}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{o.nama_pembeli || "—"}</div>
                  </div>
                  <div style={{ fontFamily: C.fontMono, fontSize: 11, color: o.no_resi ? C.accent : C.muted }}>
                    {o.no_resi || "—"}
                  </div>
                  <div style={{ fontFamily: C.fontMono, fontSize: 11, color: C.muted }}>{tanggalFmt(o.tanggal_pesanan)}</div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 12, alignSelf: "flex-start",
                    background: drop ? "rgba(96,165,250,0.15)" : "rgba(74,222,128,0.15)",
                    color: drop ? "#60a5fa" : "#4ade80",
                  }}>
                    {drop ? "DROPOFF" : "PICKUP"}
                  </span>
                  <div style={{ fontFamily: C.fontMono, fontWeight: 700 }}>{o.item_count}</div>
                </div>
              );
            })}
          </div>
        ))}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontFamily: C.fontMono }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            Tidak ada pesanan PROCESSED untuk batch ini
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: C.muted, fontFamily: C.fontMono }}>Memuat pesanan…</div>
        )}
      </div>
    </AppShell>
  );
}

export default function PrintResiPage() {
  return (
    <Suspense fallback={null}>
      <PrintResiContent />
    </Suspense>
  );
}
