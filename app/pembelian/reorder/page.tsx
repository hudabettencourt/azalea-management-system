"use client";

// /app/pembelian/reorder/page.tsx
// Saran Pembelian — bahan baku yang stoknya <= stok_minimum

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type BahanBaku = {
  id: number; nama: string; satuan: string; kategori: string;
  stok: number; stok_minimum: number; harga_beli_avg: number;
};
type Toast = { msg: string; type: "success" | "error" };

const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const stokFmt = (n: number) => Math.round(n * 100) / 100;

const KATEGORI_COLORS: Record<string, { bg: string; color: string }> = {
  "Bahan Baku":     { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  "Bahan Penolong": { bg: "rgba(251,191,36,0.15)",  color: "#f59e0b" },
  "Packaging":      { bg: "rgba(167,139,250,0.15)", color: "#a78bfa" },
};

export default function ReorderPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [allBahan, setAllBahan] = useState<BahanBaku[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMinId, setEditingMinId] = useState<number | null>(null);
  const [editMinVal, setEditMinVal] = useState("");
  const [savingMin, setSavingMin] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [filterMode, setFilterMode] = useState<"kritis" | "semua">("kritis");

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const inputStyle: React.CSSProperties = {
    padding: "7px 10px",
    background: isDark ? "rgba(255,255,255,0.05)" : "#f8fffe",
    border: `1.5px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontFamily: C.fontMono, fontSize: 13,
    outline: "none", width: "80px",
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bahan_baku")
      .select("id, nama, satuan, kategori, stok, stok_minimum, harga_beli_avg")
      .or("aktif.eq.true,aktif.is.null")
      .order("kategori")
      .order("nama");
    if (error) showToast("Gagal load: " + error.message, "error");
    else setAllBahan(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveMinimum = async (id: number) => {
    const val = parseFloat(editMinVal);
    if (isNaN(val) || val < 0) return showToast("Nilai tidak valid!", "error");
    setSavingMin(true);
    const { error } = await supabase.from("bahan_baku").update({ stok_minimum: val }).eq("id", id);
    if (error) showToast("Gagal simpan: " + error.message, "error");
    else { showToast("✓ Stok minimum disimpan!"); setEditingMinId(null); fetchData(); }
    setSavingMin(false);
  };

  const kritis = allBahan.filter(b => b.stok_minimum > 0 && b.stok <= b.stok_minimum);
  const belumDiset = allBahan.filter(b => !b.stok_minimum || b.stok_minimum === 0);
  const aman = allBahan.filter(b => b.stok_minimum > 0 && b.stok > b.stok_minimum);

  const displayed = filterMode === "kritis"
    ? [...kritis, ...belumDiset]
    : allBahan;

  const totalNilaiKritis = kritis.reduce((a, b) => a + (b.stok_minimum - b.stok) * b.harga_beli_avg, 0);

  return (
    <AppShell>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "12px 20px", borderRadius: 10, background: toast.type === "success" ? C.accent : C.red, color: "#fff", fontSize: 13, fontWeight: 700, boxShadow: C.shadowMd }}>
          {toast.msg}
        </div>
      )}

      <div style={{ padding: "24px 28px", animation: "fadeUp 0.3s ease" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Saran Pembelian</h1>
          <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
            Bahan baku yang stoknya di bawah atau mendekati minimum
          </p>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Perlu Beli", value: kritis.length, color: C.red, icon: "🔴", sub: "stok ≤ minimum" },
            { label: "Belum Diset", value: belumDiset.length, color: C.yellow, icon: "⚠️", sub: "minimum = 0" },
            { label: "Stok Aman", value: aman.length, color: C.green, icon: "✅", sub: "stok > minimum" },
            { label: "Est. Nilai Beli", value: rupiahFmt(totalNilaiKritis), color: C.accent, icon: "💰", sub: "untuk restok kritis" },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", boxShadow: C.shadow }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: s.color, fontFamily: C.fontMono }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[
            { key: "kritis", label: `🔴 Perlu Perhatian (${kritis.length + belumDiset.length})` },
            { key: "semua", label: `📋 Semua Bahan (${allBahan.length})` },
          ].map(f => (
            <button key={f.key} onClick={() => setFilterMode(f.key as any)} style={{ padding: "8px 18px", borderRadius: 10, border: `1.5px solid ${filterMode === f.key ? C.accent : C.border}`, background: filterMode === f.key ? `${C.accent}15` : "transparent", color: filterMode === f.key ? C.accent : C.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: C.fontSans }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Tabel */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: C.shadow }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.8fr 0.8fr 0.8fr 1fr 1.2fr", gap: 8, padding: "10px 20px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, textTransform: "uppercase" as const }}>
            <span>Nama Bahan</span>
            <span>Kategori</span>
            <span>Stok</span>
            <span>Minimum</span>
            <span>Kurang</span>
            <span>Est. Harga Beli</span>
            <span>Aksi</span>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>
          ) : displayed.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Semua stok aman!</div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>Tidak ada bahan yang perlu dibeli</div>
            </div>
          ) : displayed.map(b => {
            const isKritis = b.stok_minimum > 0 && b.stok <= b.stok_minimum;
            const belumDisetMin = !b.stok_minimum || b.stok_minimum === 0;
            const kurang = Math.max(0, b.stok_minimum - b.stok);
            const estHarga = kurang * b.harga_beli_avg;
            const katColor = KATEGORI_COLORS[b.kategori] || { bg: C.dim, color: C.muted };
            const pct = b.stok_minimum > 0 ? Math.min(100, (b.stok / b.stok_minimum) * 100) : null;

            return (
              <div key={b.id} style={{
                display: "grid", gridTemplateColumns: "2fr 1fr 0.8fr 0.8fr 0.8fr 1fr 1.2fr",
                gap: 8, padding: "12px 20px", borderBottom: `1px solid ${C.border}`,
                alignItems: "center",
                background: isKritis ? (isDark ? "rgba(239,68,68,0.05)" : "rgba(239,68,68,0.03)") : "transparent",
              }}>
                {/* Nama */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
                    {isKritis && <span>🔴</span>}
                    {belumDisetMin && <span>⚠️</span>}
                    {b.nama}
                  </div>
                  {/* Progress bar */}
                  {pct !== null && (
                    <div style={{ height: 3, background: C.dim, borderRadius: 2, marginTop: 4, overflow: "hidden", width: "80%" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: pct <= 100 ? C.red : C.green, borderRadius: 2 }} />
                    </div>
                  )}
                </div>

                {/* Kategori */}
                <div>
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 700, background: katColor.bg, color: katColor.color }}>
                    {b.kategori}
                  </span>
                </div>

                {/* Stok */}
                <div style={{ fontSize: 13, fontWeight: 700, color: isKritis ? C.red : C.green, fontFamily: C.fontMono }}>
                  {stokFmt(b.stok)} <span style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}>{b.satuan}</span>
                </div>

                {/* Minimum — editable */}
                <div>
                  {editingMinId === b.id ? (
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input
                        type="number" value={editMinVal} min="0" step="0.1"
                        onChange={e => setEditMinVal(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && saveMinimum(b.id)}
                        style={inputStyle} autoFocus
                      />
                      <button onClick={() => saveMinimum(b.id)} disabled={savingMin} style={{ padding: "5px 8px", background: C.accent, border: "none", color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>✓</button>
                      <button onClick={() => setEditingMinId(null)} style={{ padding: "5px 6px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 13, fontFamily: C.fontMono, color: belumDisetMin ? C.muted : C.text }}>
                        {belumDisetMin ? "—" : `${stokFmt(b.stok_minimum)} ${b.satuan}`}
                      </span>
                      <button onClick={() => { setEditingMinId(b.id); setEditMinVal(String(b.stok_minimum || "")); }} style={{ padding: "2px 6px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 4, cursor: "pointer", fontSize: 10 }}>✏️</button>
                    </div>
                  )}
                </div>

                {/* Kurang */}
                <div style={{ fontSize: 13, fontWeight: 700, color: kurang > 0 ? C.red : C.muted, fontFamily: C.fontMono }}>
                  {kurang > 0 ? `-${stokFmt(kurang)} ${b.satuan}` : "—"}
                </div>

                {/* Est. harga beli */}
                <div style={{ fontSize: 12, color: kurang > 0 ? C.text : C.muted, fontFamily: C.fontMono, fontWeight: kurang > 0 ? 700 : 400 }}>
                  {kurang > 0 ? rupiahFmt(estHarga) : "—"}
                </div>

                {/* Aksi */}
                <div>
                  {isKritis && (
                    <a href="/pembelian-bahan" style={{ padding: "5px 12px", background: `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700, textDecoration: "none", display: "inline-block" }}>
                      🛒 Beli
                    </a>
                  )}
                  {belumDisetMin && (
                    <button onClick={() => { setEditingMinId(b.id); setEditMinVal(""); }} style={{ padding: "5px 12px", background: `${C.yellow}15`, border: `1px solid ${C.yellow}30`, color: C.yellow, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                      Set Min
                    </button>
                  )}
                  {!isKritis && !belumDisetMin && (
                    <span style={{ fontSize: 11, color: C.green, fontFamily: C.fontMono }}>✅ Aman</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Info */}
        <div style={{ marginTop: 16, background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 10, padding: "12px 18px", fontSize: 12, color: C.blue, fontFamily: C.fontMono }}>
          💡 Klik <strong>✏️</strong> untuk set stok minimum per bahan. Notif Telegram otomatis terkirim setiap hari jam 07:00 kalau ada stok di bawah minimum.
        </div>
      </div>
    </AppShell>
  );
}
