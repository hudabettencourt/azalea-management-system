"use client";

// /shopee/retur — Retur masuk.
// Sumber data: tabel retur_online (DB). Tombol "Sync Retur" → POST
// /api/shopee/sync-returns untuk tarik dari Shopee & simpan ke DB.
// Halaman baca dari DB, jadi konsisten dengan profit report.

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import { supabase } from "@/lib/supabase";

type Retur = {
  key: string;
  id: number;
  toko_id: number;
  toko_nama: string;
  return_sn: string;
  order_sn: string;
  buyer: string;
  status: string;
  reason: string;
  text_reason: string;
  product_name: string;
  refund_amount: number;
  created_at: string;       // ISO
  raw: any;
};

const rupiah = (n: number) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
const isoToWIB = (iso: string) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
};

export default function ShopeeReturPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [returns, setReturns] = useState<Retur[]>([]);
  const [tokoOpts, setTokoOpts] = useState<{ id: number; nama: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filterToko, setFilterToko] = useState<string>("semua");
  const [filterStatus, setFilterStatus] = useState<string>("semua");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success", ms = 3000) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), ms);
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Ambil daftar toko untuk nama + filter
      const { data: tokoData } = await supabase
        .from("toko_online")
        .select("id, nama");
      const tokoMap = new Map<number, string>();
      const opts: { id: number; nama: string }[] = [];
      for (const t of tokoData || []) {
        tokoMap.set(t.id, t.nama);
        opts.push({ id: t.id, nama: t.nama });
      }
      setTokoOpts(opts);

      // Ambil retur dari DB
      const { data, error } = await supabase
        .from("retur_online")
        .select("id, toko_id, order_sn, return_sn, return_status, refund_amount, reason, text_reason, product_name, username_pembeli, created_at")
        .not("return_sn", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const all: Retur[] = (data || []).map((r: any) => ({
        key: `${r.toko_id}-${r.return_sn}`,
        id: r.id,
        toko_id: r.toko_id,
        toko_nama: tokoMap.get(r.toko_id) || `Toko ${r.toko_id}`,
        return_sn: String(r.return_sn || ""),
        order_sn: String(r.order_sn || ""),
        buyer: String(r.username_pembeli || ""),
        status: String(r.return_status || ""),
        reason: String(r.reason || ""),
        text_reason: String(r.text_reason || ""),
        product_name: String(r.product_name || ""),
        refund_amount: Number(r.refund_amount) || 0,
        created_at: r.created_at,
        raw: r,
      }));
      setReturns(all);
    } catch (err: any) {
      showToast("Gagal load: " + err.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/shopee/sync-returns", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        showToast("Sync gagal: " + (data.error || res.status), "error", 4000);
        return;
      }
      const total = data.totalReturns ?? 0;
      const inserted = data.inserted ?? 0;
      const errors = data.errors ?? 0;
      if (errors > 0) {
        showToast(`⚠ ${total} retur ditarik, tapi ${errors} gagal disimpan ke DB (cek RLS/kolom).`, "error", 5000);
      } else if (total === 0) {
        showToast("Sync selesai — belum ada retur dari Shopee.", "success", 4000);
      } else {
        showToast(`✓ Sync selesai. ${inserted} retur tersimpan ke DB.`, "success", 4000);
      }
      fetchAll();
    } catch (err: any) {
      showToast("Sync gagal: " + err.message, "error", 4000);
    } finally {
      setSyncing(false);
    }
  }, [fetchAll]);

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

  const totalRefund = useMemo(
    () => filtered.reduce((s, r) => s + r.refund_amount, 0),
    [filtered]
  );

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    background: active ? `${C.accent}20` : "transparent",
    border: `1.5px solid ${active ? C.accent : C.border}`,
    borderRadius: 20,
    color: active ? C.accent : C.muted,
    cursor: "pointer", fontSize: 12, fontWeight: active ? 700 : 500,
    fontFamily: C.fontSans, transition: "all 0.15s",
  });

  const busy = loading || syncing;

  return (
    <AppShell>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 18px",
          background: toast.type === "success" ? C.green : C.red, color: "#fff",
          borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: C.shadowMd, maxWidth: 360,
        }}>{toast.msg}</div>
      )}

      <div style={{ padding: "24px 28px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Retur</h1>
            <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
              {filtered.length} retur · {tokoOpts.length} toko · refund {rupiah(totalRefund)}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={fetchAll} disabled={busy} style={{
              padding: "8px 16px",
              background: "transparent", border: `1.5px solid ${C.border}`,
              color: C.muted, borderRadius: 8, cursor: busy ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 700, opacity: busy ? 0.5 : 1,
            }}>{loading ? "⏳" : "↻"} Refresh</button>
            <button onClick={handleSync} disabled={busy} style={{
              padding: "8px 16px",
              background: syncing ? "transparent" : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`,
              border: syncing ? `1.5px solid ${C.border}` : "none",
              color: syncing ? C.muted : "#fff", borderRadius: 8,
              cursor: busy ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 800, opacity: busy && !syncing ? 0.5 : 1,
            }}>{syncing ? "⏳ Menyinkronkan..." : "⇅ Sync Retur"}</button>
          </div>
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
            {returns.length === 0
              ? "Belum ada retur di DB. Klik “Sync Retur” untuk tarik dari Shopee."
              : "🎉 Tidak ada retur untuk filter ini"}
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filtered.map(r => (
              <ReturCard key={r.key} r={r} C={C} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ReturCard({ r, C }: { r: Retur; C: any }) {
  const closedSet = new Set(["COMPLETED", "ACCEPTED", "REFUNDED", "CLOSED", "CANCELLED"]);
  const isClosed = closedSet.has(r.status.toUpperCase());
  const isCancelled = r.status.toUpperCase() === "CANCELLED";

  const badgeBg = isCancelled ? C.redDim : isClosed ? C.greenDim : C.yellowDim;
  const badgeFg = isCancelled ? C.red : isClosed ? C.green : C.yellow;

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
              background: badgeBg, color: badgeFg,
              fontWeight: 700, fontFamily: C.fontMono,
            }}>{r.status || "—"}</span>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{r.toko_nama}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>
            {r.buyer || "—"}
          </div>
          {r.product_name && (
            <div style={{ fontSize: 12, color: C.textMid, fontFamily: C.fontSans, marginTop: 2 }}>
              {r.product_name}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>
            Return: {r.return_sn || "—"} · Pesanan: {r.order_sn || "—"}
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginTop: 1 }}>
            {isoToWIB(r.created_at)}
          </div>

          {(r.reason || r.text_reason) && (
            <div style={{
              marginTop: 10, padding: "8px 12px",
              background: isDarkColor(C) ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
              borderRadius: 8, fontSize: 12, color: C.textMid, fontFamily: C.fontSans,
            }}>
              <span style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 10 }}>ALASAN</span>
              <div style={{ marginTop: 2 }}>
                {r.reason}{r.text_reason ? ` — ${r.text_reason}` : ""}
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: "right", minWidth: 120 }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono }}>REFUND</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.red, fontFamily: C.fontMono, marginTop: 2 }}>
            {rupiah(r.refund_amount)}
          </div>
        </div>
      </div>
    </div>
  );
}

function isDarkColor(C: any): boolean {
  return C.bg === "#0f1a16" || C.bg?.startsWith?.("#0") || C.text === "#e8f5f0";
}
