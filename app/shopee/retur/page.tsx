"use client";

// /shopee/retur — Retur masuk.
// Tugas 7: list retur per toko, filter toko + status, "Terima Retur" button
// triggers /api/shopee/confirm-return which also restores stock on success.

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type ReturItem = { sku: string; qty: number; nama: string };

type Retur = {
  key: string;            // unique key (toko_id + return_sn)
  toko_id: number;
  toko_nama: string;
  return_sn: string;
  order_sn: string;
  buyer: string;
  status: string;
  reason: string;
  create_time: number;    // unix sec
  items: ReturItem[];
  raw: any;
};

const rupiah = (n: number) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
const unixToWIB = (unix: number) => {
  if (!unix) return "-";
  return new Date(unix * 1000).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
};

function parseItems(rawItems: any[]): ReturItem[] {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map(it => ({
    sku: String(it?.model_sku || it?.item_sku || it?.sku || "").trim(),
    qty: Number(it?.amount || it?.qty || it?.quantity || it?.return_quantity || 0),
    nama: String(it?.model_name || it?.item_name || it?.name || ""),
  })).filter(i => i.sku || i.nama);
}

function parseReturn(toko_id: number, toko_nama: string, raw: any): Retur {
  const items = parseItems(raw?.item || raw?.items || raw?.return_item_list || []);
  return {
    key: `${toko_id}-${raw?.return_sn || raw?.returnsn || ""}`,
    toko_id, toko_nama,
    return_sn: String(raw?.return_sn || raw?.returnsn || ""),
    order_sn: String(raw?.order_sn || raw?.ordersn || ""),
    buyer: String(raw?.user?.username || raw?.buyer_username || raw?.buyer || ""),
    status: String(raw?.status || raw?.return_status || ""),
    reason: String(raw?.reason || raw?.return_reason || raw?.refund_reason || ""),
    create_time: Number(raw?.create_time || raw?.createtime || 0),
    items, raw,
  };
}

export default function ShopeeReturPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [returns, setReturns] = useState<Retur[]>([]);
  const [tokoOpts, setTokoOpts] = useState<{ id: number; nama: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterToko, setFilterToko] = useState<string>("semua");
  const [filterStatus, setFilterStatus] = useState<string>("semua");
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shopee/get-returns");
      const data = await res.json();
      const all: Retur[] = [];
      const opts: { id: number; nama: string }[] = [];
      for (const r of data.results || []) {
        opts.push({ id: r.toko_id, nama: r.toko });
        if (!r.ok) continue;
        const list = r.raw?.response?.return_list ?? r.raw?.response?.returns ?? [];
        if (!Array.isArray(list)) continue;
        for (const rawReturn of list) {
          all.push(parseReturn(r.toko_id, r.toko, rawReturn));
        }
      }
      all.sort((a, b) => b.create_time - a.create_time);
      setReturns(all);
      setTokoOpts(opts);
    } catch (err: any) {
      showToast("Gagal load: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const statusOpts = useMemo(() => {
    const set = new Set<string>();
    for (const r of returns) if (r.status) set.add(r.status);
    return Array.from(set).sort();
  }, [returns]);

  const filtered = useMemo(() => returns.filter(r => {
    if (filterToko !== "semua" && String(r.toko_id) !== filterToko) return false;
    if (filterStatus !== "semua" && r.status !== filterStatus) return false;
    return true;
  }), [returns, filterToko, filterStatus]);

  const handleConfirm = async (r: Retur) => {
    if (!confirm(`Terima retur ${r.return_sn}?\n\nStok ${r.items.length} item akan dikembalikan ke stok_barang.`)) return;
    setConfirmingKey(r.key);
    try {
      const res = await fetch("/api/shopee/confirm-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toko_id: r.toko_id,
          return_sn: r.return_sn,
          items: r.items.map(i => ({ sku: i.sku, qty: i.qty })),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.error || data.raw?.message || "Gagal", "error");
        return;
      }
      const restored = (data.restored || []).length;
      const missing = (data.missing_skus || []).length;
      let msg = `✓ Retur diterima. Stok ${restored} produk dikembalikan.`;
      if (missing > 0) msg += ` ⚠ ${missing} SKU tidak ditemukan di DB.`;
      showToast(msg);
      fetchAll();
    } catch (err: any) {
      showToast("Gagal: " + err.message, "error");
    } finally {
      setConfirmingKey(null);
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
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Retur</h1>
            <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
              {filtered.length} retur · {tokoOpts.length} toko
            </p>
          </div>
          <button onClick={fetchAll} disabled={loading} style={{
            padding: "8px 16px",
            background: "transparent", border: `1.5px solid ${C.border}`,
            color: C.muted, borderRadius: 8, cursor: "pointer",
            fontSize: 13, fontWeight: 700, opacity: loading ? 0.5 : 1,
          }}>{loading ? "⏳" : "↻"} Refresh</button>
        </div>

        {/* Filters */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, minWidth: 80 }}>Toko</span>
            <button style={pillStyle(filterToko === "semua")} onClick={() => setFilterToko("semua")}>Semua</button>
            {tokoOpts.map(t => (
              <button key={t.id} style={pillStyle(filterToko === String(t.id))} onClick={() => setFilterToko(String(t.id))}>{t.nama}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, minWidth: 80 }}>Status</span>
            <button style={pillStyle(filterStatus === "semua")} onClick={() => setFilterStatus("semua")}>Semua</button>
            {statusOpts.map(s => (
              <button key={s} style={pillStyle(filterStatus === s)} onClick={() => setFilterStatus(s)}>{s}</button>
            ))}
            {statusOpts.length === 0 && !loading && (
              <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>(belum ada data status)</span>
            )}
          </div>
        </div>

        {/* List */}
        {loading && returns.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
            Memuat retur...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
          }}>
            🎉 Tidak ada retur
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filtered.map(r => (
              <ReturCard key={r.key} r={r} C={C}
                onConfirm={() => handleConfirm(r)}
                confirming={confirmingKey === r.key} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ReturCard({ r, C, onConfirm, confirming }: { r: Retur; C: any; onConfirm: () => void; confirming: boolean }) {
  // Disable Terima if the status looks already-terminal. We don't know all
  // Shopee statuses, so block only on the common closed ones.
  const closedSet = new Set(["COMPLETED", "ACCEPTED", "REFUNDED", "CLOSED", "CANCELLED", "JUDGING"]);
  const alreadyClosed = closedSet.has(r.status.toUpperCase());

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: "16px 18px", boxShadow: C.shadow,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, padding: "3px 10px", borderRadius: 20,
              background: alreadyClosed ? C.greenDim : C.yellowDim,
              color: alreadyClosed ? C.green : C.yellow,
              fontWeight: 700, fontFamily: C.fontMono,
            }}>{r.status || "—"}</span>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{r.toko_nama}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>
            {r.buyer || "—"}
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
            Return: {r.return_sn || "—"} · Pesanan: {r.order_sn || "—"}
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 1 }}>
            {unixToWIB(r.create_time)}
          </div>

          {r.reason && (
            <div style={{
              marginTop: 10, padding: "8px 12px",
              background: isDarkColor(C) ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
              borderRadius: 8, fontSize: 12, color: C.textMid, fontFamily: C.fontSans,
            }}>
              <span style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 10 }}>ALASAN</span>
              <div style={{ marginTop: 2 }}>{r.reason}</div>
            </div>
          )}

          {r.items.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginBottom: 4 }}>ITEM DIRETUR</div>
              {r.items.map((it, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 10px", background: isDarkColor(C) ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                  borderRadius: 6, marginBottom: 4, fontSize: 12,
                }}>
                  <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ fontWeight: 700, color: C.text }}>{it.nama || it.sku}</span>
                    {it.nama && it.sku && <span style={{ color: C.muted, marginLeft: 6, fontFamily: C.fontMono, fontSize: 11 }}>{it.sku}</span>}
                  </div>
                  <span style={{ fontFamily: C.fontMono, fontWeight: 700, color: C.text, marginLeft: 8 }}>×{it.qty}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" }}>
          <button onClick={onConfirm} disabled={confirming || alreadyClosed} style={{
            padding: "10px 16px",
            background: alreadyClosed
              ? "transparent"
              : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`,
            border: alreadyClosed ? `1.5px solid ${C.border}` : "none",
            color: alreadyClosed ? C.muted : "#fff",
            borderRadius: 10,
            cursor: confirming || alreadyClosed ? "not-allowed" : "pointer",
            fontWeight: 800, fontSize: 13, fontFamily: C.fontSans,
            opacity: confirming ? 0.7 : 1, whiteSpace: "nowrap",
          }}>
            {confirming ? "Mengirim..." : alreadyClosed ? "Sudah Selesai" : "✓ Terima Retur"}
          </button>
          <details>
            <summary style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, cursor: "pointer", textAlign: "center" }}>Raw</summary>
            <pre style={{
              marginTop: 4, padding: 8, background: C.bgPage, borderRadius: 6,
              fontSize: 10, color: C.textMid, fontFamily: C.fontMono,
              overflow: "auto", maxHeight: 200, maxWidth: 280,
            }}>{JSON.stringify(r.raw, null, 2)}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}

// Probe whether the theme palette looks like dark mode. Used so the inline
// row background contrast looks right without threading isDark through every
// subcomponent.
function isDarkColor(C: any): boolean {
  return C.bg === "#0f1a16" || C.bg?.startsWith?.("#0") || C.text === "#e8f5f0";
}
