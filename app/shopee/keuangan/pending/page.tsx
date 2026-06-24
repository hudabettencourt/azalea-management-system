"use client";

// /app/shopee/keuangan/pending/page.tsx
// Uang di Jalan — pesanan SHIPPED + TO_CONFIRM_RECEIVE yang belum cair

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import { rupiah, rupiahShort } from "@/lib/format";

type TokoOption = { id: number; nama: string };
type PesananDijalan = {
  no_pesanan: string;
  nama_produk: string;
  sku: string;
  qty: number;
  total_pembayaran: number;
  status_shopee: string;
  tanggal_pesanan: string;
  jasa_kirim: string | null;
  nama_pembeli: string | null;
  toko_id: number;
  nama_toko: string;
};
type RingkasanToko = {
  toko_id: number;
  nama_toko: string;
  jumlah_pesanan: number;
  total_nilai: number;
  shipped: number;
  to_confirm: number;
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  SHIPPED:            { bg: "rgba(45,212,191,0.15)",  color: "#2dd4bf" },
  TO_CONFIRM_RECEIVE: { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
};

const STATUS_LABELS: Record<string, string> = {
  SHIPPED:            "🚚 Dikirim",
  TO_CONFIRM_RECEIVE: "📬 Konfirmasi",
};

export default function UangDiJalanPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [tokoList, setTokoList] = useState<TokoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [pesananList, setPesananList] = useState<PesananDijalan[]>([]);
  const [ringkasan, setRingkasan] = useState<RingkasanToko[]>([]);
  const [selectedToko, setSelectedToko] = useState<"semua" | number>("semua");
  const [selectedStatus, setSelectedStatus] = useState<"semua" | "SHIPPED" | "TO_CONFIRM_RECEIVE">("semua");
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [excludedMasuk, setExcludedMasuk] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState<string>("");

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    background: isDark ? "rgba(255,255,255,0.05)" : "#f8fffe",
    border: `1.5px solid ${C.border}`,
    borderRadius: 10, color: C.text,
    fontFamily: C.fontSans, fontSize: 13,
    outline: "none", boxSizing: "border-box" as const,
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shopee/uang-di-jalan", { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      const data = await res.json();

      const rows: PesananDijalan[] = data.rows || [];
      setPesananList(rows);
      setRingkasan(data.ringkasan || []);
      setExcludedMasuk(data.stats?.excluded_masuk ?? 0);
      setTokoList(data.tokoList || []);
      setLastUpdate(new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" }));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setSyncing(true);
    setSyncInfo("Cek status terbaru ke Shopee…");
    try {
      const syncRes = await fetch("/api/shopee/sync-stale-orders", {
        method: "POST",
        credentials: "include",
      });
      if (syncRes.ok) {
        const syncData = await syncRes.json();
        const updated = syncData.totalUpdated ?? 0;
        const checked = syncData.totalChecked ?? 0;
        setSyncInfo(
          checked === 0
            ? "Tidak ada pesanan lama yang perlu dicek"
            : updated > 0
              ? `${updated} dari ${checked} pesanan diperbarui`
              : `${checked} pesanan dicek, semua status sudah terkini`,
        );
      }
    } catch {
      setSyncInfo("");
    } finally {
      setSyncing(false);
    }
    await fetchData();
  }, [fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pesananFiltered = pesananList.filter(p => {
    if (selectedToko !== "semua" && p.toko_id !== selectedToko) return false;
    if (selectedStatus !== "semua" && p.status_shopee !== selectedStatus) return false;
    return true;
  });

  const totalNilai = pesananFiltered.reduce((a, p) => a + p.total_pembayaran, 0);
  const totalShipped = pesananFiltered.filter(p => p.status_shopee === "SHIPPED").length;
  const totalConfirm = pesananFiltered.filter(p => p.status_shopee === "TO_CONFIRM_RECEIVE").length;
  const grandTotal = pesananList.reduce((a, p) => a + p.total_pembayaran, 0);

  return (
    <AppShell>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <div style={{ padding: "24px 28px", animation: "fadeUp 0.3s ease" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Uang di Jalan</h1>
            <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
              Pesanan dikirim yang belum cair ke saldo · Update: {lastUpdate || "—"}
              {excludedMasuk > 0 && (
                <> · <span style={{ color: C.green }}>{excludedMasuk} baris disembunyikan (sudah masuk rekap)</span></>
              )}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <button onClick={handleRefresh} disabled={loading || syncing} style={{ padding: "8px 18px", background: `${C.accent}15`, border: `1.5px solid ${C.accent}`, color: C.accent, borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: (loading || syncing) ? 0.7 : 1 }}>
              {syncing ? "⏳ Sync…" : loading ? "⏳" : "↻ Refresh"}
            </button>
            {syncInfo && (
              <span style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{syncInfo}</span>
            )}
          </div>
        </div>

        {/* Summary total */}
        <div style={{ background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, borderRadius: 16, padding: "20px 24px", marginBottom: 20, boxShadow: `0 4px 20px ${C.accentGlow}` }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontFamily: C.fontMono, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Total Uang di Jalan</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em", marginBottom: 8 }}>{rupiah(grandTotal)}</div>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>🚚 {pesananList.filter(p => p.status_shopee === "SHIPPED").length} dikirim</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>📬 {pesananList.filter(p => p.status_shopee === "TO_CONFIRM_RECEIVE").length} konfirmasi</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>📦 {pesananList.length} total pesanan</div>
          </div>
        </div>

        {/* Ringkasan per toko */}
        {ringkasan.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(ringkasan.length, 4)}, 1fr)`, gap: 12, marginBottom: 20 }}>
            {ringkasan.map(r => (
              <div key={r.toko_id} onClick={() => setSelectedToko(selectedToko === r.toko_id ? "semua" : r.toko_id)}
                style={{ background: selectedToko === r.toko_id ? `${C.accent}15` : C.card, border: `1.5px solid ${selectedToko === r.toko_id ? C.accent : C.border}`, borderRadius: 12, padding: "14px 16px", cursor: "pointer", transition: "all 0.15s" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>{r.nama_toko}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: C.accent, fontFamily: C.fontMono, marginBottom: 4 }}>{rupiahShort(r.total_nilai)}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{r.jumlah_pesanan} pesanan · 🚚{r.shipped} 📬{r.to_confirm}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px", marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" as const, boxShadow: C.shadow }}>
          <select value={selectedToko} onChange={e => setSelectedToko(e.target.value === "semua" ? "semua" : Number(e.target.value))} style={{ ...inputStyle, width: 180 }}>
            <option value="semua">Semua Toko</option>
            {tokoList.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            {(["semua", "SHIPPED", "TO_CONFIRM_RECEIVE"] as const).map(s => (
              <button key={s} onClick={() => setSelectedStatus(s)} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${selectedStatus === s ? C.accent : C.border}`, background: selectedStatus === s ? `${C.accent}15` : "transparent", color: selectedStatus === s ? C.accent : C.muted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: C.fontSans }}>
                {s === "semua" ? "Semua" : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
            {pesananFiltered.length} pesanan · <span style={{ color: C.accent, fontWeight: 700 }}>{rupiah(totalNilai)}</span>
          </div>
        </div>

        {/* Tabel */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: C.shadow }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 1fr 1fr 1fr", gap: 8, padding: "10px 20px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, textTransform: "uppercase" as const }}>
            <span>Produk / Pesanan</span><span>Pembeli</span><span>Jasa Kirim</span>
            <span>Toko</span><span>Tgl Pesanan</span>
            <span style={{ textAlign: "right" as const }}>Nilai</span><span>Status</span>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>
          ) : pesananFiltered.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Tidak ada uang di jalan!</div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>Semua pesanan sudah selesai atau tidak ada yang cocok filter</div>
            </div>
          ) : pesananFiltered.map((p, i) => {
            const sc = STATUS_COLORS[p.status_shopee] || { bg: C.dim, color: C.muted };
            return (
              <div key={`${p.no_pesanan}-${i}`} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 1fr 1fr 1fr", gap: 8, padding: "12px 20px", borderBottom: `1px solid ${C.border}`, alignItems: "center", transition: "background 0.1s" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.nama_produk} <span style={{ color: C.muted, fontWeight: 400 }}>×{p.qty}</span></div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, marginTop: 2 }}>{p.no_pesanan} · {p.sku}</div>
                </div>
                <div style={{ fontSize: 12, color: C.textMid }}>{p.nama_pembeli || "—"}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{p.jasa_kirim || "—"}</div>
                <div style={{ fontSize: 12, color: C.textMid }}>{p.nama_toko}</div>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{p.tanggal_pesanan || "—"}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.green, fontFamily: C.fontMono, textAlign: "right" as const }}>{rupiah(p.total_pembayaran)}</div>
                <div>
                  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, whiteSpace: "nowrap" as const }}>
                    {STATUS_LABELS[p.status_shopee] || p.status_shopee}
                  </span>
                </div>
              </div>
            );
          })}

          {pesananFiltered.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.8fr 0.8fr 1fr 1fr 1fr", gap: 8, padding: "12px 20px", background: `${C.accent}08`, borderTop: `2px solid ${C.accent}20`, alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.accent }}>TOTAL · {pesananFiltered.length} pesanan</div>
              <div /><div /><div /><div />
              <div style={{ fontSize: 15, fontWeight: 900, color: C.accent, fontFamily: C.fontMono, textAlign: "right" as const }}>{rupiah(totalNilai)}</div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>🚚{totalShipped} · 📬{totalConfirm}</div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 10, padding: "12px 18px", fontSize: 12, color: C.blue, fontFamily: C.fontMono }}>
          ℹ️ <strong>Uang di Jalan</strong> = estimasi bruto (belum dipotong fee Shopee). &nbsp;·&nbsp;
          🚚 <strong>Dikirim</strong> = dalam perjalanan ke pembeli. &nbsp;·&nbsp;
          📬 <strong>Konfirmasi</strong> = sudah diterima pembeli, menunggu pencairan.
        </div>
      </div>
    </AppShell>
  );
}
