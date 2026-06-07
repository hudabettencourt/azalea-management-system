"use client";

// /app/shopee/pelanggan/blacklist/page.tsx
// Blacklist Pembeli Shopee

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type BlacklistItem = {
  id: number; username: string; alasan: string | null;
  toko_id: number | null; created_at: string; nama_toko?: string;
};
type Toko = { id: number; nama: string };
type Toast = { msg: string; type: "success" | "error" };

const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });

export default function BlacklistPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [list, setList] = useState<BlacklistItem[]>([]);
  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [search, setSearch] = useState("");

  // Form tambah
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [alasan, setAlasan] = useState("");
  const [tokoId, setTokoId] = useState("");
  const [saving, setSaving] = useState(false);

  // Confirm delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: isDark ? "rgba(255,255,255,0.05)" : "#f8fffe",
    border: `1.5px solid ${C.border}`, borderRadius: 10,
    color: C.text, fontFamily: C.fontSans, fontSize: 13,
    outline: "none", boxSizing: "border-box" as const,
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: blacklistData }, { data: tokoData }] = await Promise.all([
      supabase.from("blacklist_pembeli").select("*, toko_online(nama)").order("created_at", { ascending: false }),
      supabase.from("toko_online").select("id, nama").eq("platform", "Shopee").eq("aktif", true),
    ]);
    setList((blacklistData || []).map((b: any) => ({ ...b, nama_toko: b.toko_online?.nama })));
    setTokoList(tokoData || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTambah = async () => {
    if (!username.trim()) return showToast("Username wajib diisi!", "error");
    setSaving(true);
    const { error } = await supabase.from("blacklist_pembeli").insert([{
      username: username.trim().toLowerCase(),
      alasan: alasan.trim() || null,
      toko_id: tokoId ? parseInt(tokoId) : null,
    }]);
    if (error) {
      if (error.code === "23505") showToast("Username sudah ada di blacklist!", "error");
      else showToast("Gagal: " + error.message, "error");
    } else {
      showToast(`✓ ${username} ditambahkan ke blacklist`);
      setUsername(""); setAlasan(""); setTokoId("");
      setShowForm(false); fetchData();
    }
    setSaving(false);
  };

  const handleHapus = async (id: number) => {
    const { error } = await supabase.from("blacklist_pembeli").delete().eq("id", id);
    if (error) showToast("Gagal hapus: " + error.message, "error");
    else { showToast("Dihapus dari blacklist"); setConfirmDeleteId(null); fetchData(); }
  };

  const filtered = list.filter(b =>
    search === "" || b.username.toLowerCase().includes(search.toLowerCase()) ||
    (b.alasan || "").toLowerCase().includes(search.toLowerCase())
  );

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Blacklist Pembeli</h1>
            <p style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono, margin: "4px 0 0" }}>
              {list.length} username diblacklist
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari username..." style={{ ...inputStyle, width: 220 }} />
            <button onClick={() => setShowForm(v => !v)} style={{ padding: "9px 18px", background: showForm ? "transparent" : `linear-gradient(135deg, ${C.accentDark}, ${C.accent})`, border: showForm ? `1px solid ${C.border}` : "none", color: showForm ? C.muted : "#fff", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" as const }}>
              {showForm ? "✕ Tutup" : "+ Tambah Blacklist"}
            </button>
          </div>
        </div>

        {/* Form tambah */}
        {showForm && (
          <div style={{ background: `${C.red}06`, border: `1px solid ${C.red}30`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.red, fontFamily: C.fontMono, marginBottom: 14, letterSpacing: 1 }}>+ TAMBAH KE BLACKLIST</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" as const }}>Username Shopee *</div>
                <input value={username} onChange={e => setUsername(e.target.value)} placeholder="username_pembeli" style={inputStyle} autoFocus onKeyDown={e => e.key === "Enter" && handleTambah()} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" as const }}>Alasan</div>
                <input value={alasan} onChange={e => setAlasan(e.target.value)} placeholder="Komplain berlebihan, fraud, dll" style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" as const }}>Toko (opsional)</div>
                <select value={tokoId} onChange={e => setTokoId(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">Semua Toko</option>
                  {tokoList.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleTambah} disabled={saving} style={{ padding: "9px 20px", background: C.red, border: "none", color: "#fff", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, opacity: saving ? 0.7 : 1 }}>
                {saving ? "Menyimpan..." : "🚫 Blacklist"}
              </button>
              <button onClick={() => setShowForm(false)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 10, cursor: "pointer", fontSize: 13 }}>Batal</button>
            </div>
          </div>
        )}

        {/* Info */}
        <div style={{ background: `${C.yellow}10`, border: `1px solid ${C.yellow}30`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: C.yellow, fontFamily: C.fontMono }}>
          ⚠️ Blacklist ini hanya untuk referensi internal — Shopee tidak blokir otomatis. Cek manual saat ada pesanan masuk dari username ini.
        </div>

        {/* List */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: C.shadow }}>
          {/* Header tabel */}
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 2fr 1fr 1fr 100px", gap: 8, padding: "10px 20px", background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: C.muted, fontFamily: C.fontMono, letterSpacing: 1, textTransform: "uppercase" as const }}>
            <span>Username</span>
            <span>Alasan</span>
            <span>Toko</span>
            <span>Tanggal</span>
            <span>Aksi</span>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: C.fontMono }}>Memuat...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                {search ? "Tidak ditemukan" : "Blacklist masih kosong"}
              </div>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: C.fontMono }}>
                {search ? "Coba kata kunci lain" : "Tambahkan pembeli bermasalah di atas"}
              </div>
            </div>
          ) : filtered.map(b => (
            <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 2fr 1fr 1fr 100px", gap: 8, padding: "12px 20px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>🚫</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.red, fontFamily: C.fontMono }}>{b.username}</span>
              </div>
              <div style={{ fontSize: 12, color: C.textMid }}>{b.alasan || <span style={{ color: C.muted, fontStyle: "italic" }}>Tidak ada alasan</span>}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{b.nama_toko || "Semua Toko"}</div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{tanggalFmt(b.created_at)}</div>
              <div>
                {confirmDeleteId === b.id ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => handleHapus(b.id)} style={{ padding: "4px 10px", background: C.red, border: "none", color: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Hapus</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{ padding: "4px 6px", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteId(b.id)} style={{ padding: "5px 12px", background: `${C.red}15`, border: `1px solid ${C.red}30`, color: C.red, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700 }}>
                    🗑 Hapus
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
