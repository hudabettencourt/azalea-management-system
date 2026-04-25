"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRole } from "@/hooks/useRole";

type Profile = { id: string; email: string; nama: string; role: string; created_at: string };
type Produk = { id: number; nama_produk: string; sku: string | null; jumlah_stok: number; harga_jual: number; satuan: string };
type Toast = { msg: string; type: "success" | "error" | "info" };

const T = {
  bg: "#100c16", bgCard: "rgba(255,255,255,0.02)", sidebar: "#130d1a",
  border: "rgba(232,115,138,0.12)", borderStrong: "rgba(232,115,138,0.28)",
  accent: "#e8738a", accentDim: "rgba(232,115,138,0.12)", accentGlow: "rgba(232,115,138,0.25)",
  text: "#f0e6e9", textMid: "#c0a8b4", textDim: "#7a6880",
  green: "#6fcf97", yellow: "#f2c94c", red: "#eb5757",
  purple: "#a78bfa",
  fontDisplay: "'DM Serif Display', Georgia, serif",
  fontMono: "'DM Mono', 'Fira Mono', monospace",
  fontSans: "'DM Sans', 'Segoe UI', sans-serif",
};

const ROLES = [
  { value: "owner", label: "Owner", color: "#e8738a", desc: "Akses penuh semua modul" },
  { value: "super_admin", label: "Super Admin", color: "#c94f68", desc: "Akses penuh + approve void" },
  { value: "keuangan", label: "Keuangan", color: "#60a5fa", desc: "Dashboard, kas, laporan keuangan" },
  { value: "purchasing", label: "Purchasing", color: "#f2c94c", desc: "Pembelian bahan & reseller" },
  { value: "produksi", label: "Produksi", color: "#6fcf97", desc: "Input produksi & stok bahan" },
  { value: "kasir", label: "Kasir", color: "#8b5cf6", desc: "Input penjualan & potong stok" },
  { value: "admin_penjualan", label: "Admin Penjualan", color: "#f59e0b", desc: "Kelola penjualan & laporan sales" },
];

const roleInfo = (role: string) => ROLES.find(r => r.value === role) || { label: role, color: T.textDim, desc: "" };
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;

export default function AdminPage() {
  const { profile: currentUser, isOwner, loading: roleLoading } = useRole();
  const [activeSection, setActiveSection] = useState<"users" | "produk">("users");

  // ── Users state ──
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editNama, setEditNama] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // ── Produk state ──
  const [produkList, setProdukList] = useState<Produk[]>([]);
  const [produkLoading, setProdukLoading] = useState(false);
  const [editingSkuId, setEditingSkuId] = useState<number | null>(null);
  const [editSkuVal, setEditSkuVal] = useState("");
  const [savingSku, setSavingSku] = useState(false);
  const [searchProduk, setSearchProduk] = useState("");

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) showToast("Gagal load users: " + error.message, "error");
    else setUsers(data || []);
    setLoading(false);
  }, []);

  const fetchProduk = useCallback(async () => {
    setProdukLoading(true);
    const { data, error } = await supabase.from("stok_barang").select("id, nama_produk, sku, jumlah_stok, harga_jual, satuan").order("nama_produk");
    if (error) showToast("Gagal load produk: " + error.message, "error");
    else setProdukList(data || []);
    setProdukLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { if (activeSection === "produk") fetchProduk(); }, [activeSection, fetchProduk]);

  // ── Users actions ──
  const startEdit = (user: Profile) => { setEditingId(user.id); setEditRole(user.role); setEditNama(user.nama); };
  const cancelEdit = () => { setEditingId(null); setEditRole(""); setEditNama(""); };

  const saveUser = async (id: string) => {
    if (!editRole) return showToast("Pilih role!", "error");
    if (!editNama.trim()) return showToast("Isi nama!", "error");
    if (id === currentUser?.id) {
      const ownerCount = users.filter(u => u.role === "owner" || u.role === "super_admin").length;
      if (ownerCount <= 1 && editRole !== "owner" && editRole !== "super_admin")
        return showToast("Tidak bisa mengubah role — kamu satu-satunya owner!", "error");
    }
    setSavingId(id);
    const { error } = await supabase.from("profiles").update({ role: editRole, nama: editNama.trim() }).eq("id", id);
    if (error) showToast("Gagal update: " + error.message, "error");
    else { showToast("User berhasil diupdate!"); fetchUsers(); cancelEdit(); }
    setSavingId(null);
  };

  // ── Produk SKU actions ──
  const startEditSku = (p: Produk) => { setEditingSkuId(p.id); setEditSkuVal(p.sku || ""); };
  const cancelEditSku = () => { setEditingSkuId(null); setEditSkuVal(""); };

  const saveSku = async (id: number) => {
    setSavingSku(true);
    const skuBaru = editSkuVal.trim().toUpperCase();
    const { error } = await supabase.from("stok_barang").update({ sku: skuBaru || null }).eq("id", id);
    if (error) showToast("Gagal simpan SKU: " + error.message, "error");
    else {
      showToast(`SKU berhasil disimpan${skuBaru ? `: ${skuBaru}` : " (dikosongkan)"}`);
      fetchProduk();
      cancelEditSku();
    }
    setSavingSku(false);
  };

  const produkFiltered = produkList.filter(p =>
    searchProduk === "" ||
    p.nama_produk?.toLowerCase().includes(searchProduk.toLowerCase()) ||
    (p.sku || "").toLowerCase().includes(searchProduk.toLowerCase())
  );

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", background: "rgba(255,255,255,0.04)",
    border: `1.5px solid rgba(232,115,138,0.2)`, borderRadius: 8,
    color: T.text, fontFamily: T.fontSans, fontSize: 13,
    outline: "none", transition: "border-color 0.2s",
  };

  const usersFiltered = users.filter(u =>
    search === "" ||
    u.nama?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.role?.toLowerCase().includes(search.toLowerCase())
  );

  if (roleLoading || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12, filter: "drop-shadow(0 0 20px #e8738a88)" }}>⊛</div>
        <div style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 12, letterSpacing: 2 }}>MEMUAT DATA...</div>
      </div>
    </div>
  );

  if (!isOwner) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <div style={{ color: T.textMid, fontFamily: T.fontDisplay, fontSize: 24, marginBottom: 8 }}>Akses Ditolak</div>
        <div style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 12 }}>Halaman ini hanya untuk Owner / Super Admin</div>
        <a href="/" style={{ display: "inline-block", marginTop: 20, color: T.accent, fontFamily: T.fontMono, fontSize: 12, textDecoration: "none" }}>← Kembali ke Beranda</a>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { background: ${T.bg}; }
        input:focus, select:focus { border-color: rgba(232,115,138,0.5) !important; box-shadow: 0 0 0 3px rgba(232,115,138,0.08) !important; outline: none; }
        input, select { color: #e0d0d8 !important; }
        input::placeholder { color: #5a4860 !important; }
        select option { background: #1a1020; color: #e0d0d8; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: rgba(232,115,138,0.2); border-radius: 3px; }
        .nav-item:hover { background: rgba(232,115,138,0.06) !important; color: ${T.textMid} !important; }
        .sku-row:hover { background: rgba(255,255,255,0.02) !important; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: "#1a1020", border: `1px solid ${toast.type === "success" ? T.green : toast.type === "error" ? T.red : T.accent}44`, color: toast.type === "success" ? T.green : toast.type === "error" ? T.red : T.accent, padding: "14px 20px", borderRadius: 12, fontFamily: T.fontMono, fontWeight: 600, fontSize: 13, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "fadeUp 0.3s ease" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", minHeight: "100vh", fontFamily: T.fontSans, background: T.bg, color: T.text }}>

        {/* Sidebar */}
        <aside style={{ width: 220, flexShrink: 0, background: T.sidebar, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "24px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #e8738a, #c94f68)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, boxShadow: `0 0 20px ${T.accentGlow}` }}>✿</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>Azalea</div>
                <div style={{ fontSize: 9, color: T.accent, letterSpacing: 2, textTransform: "uppercase", fontFamily: T.fontMono }}>ERP System</div>
              </div>
            </a>
          </div>
          <nav style={{ flex: 1, padding: "16px 12px" }}>
            <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, textTransform: "uppercase", fontFamily: T.fontMono, padding: "0 8px", marginBottom: 8 }}>Admin Panel</div>

            {[
              { id: "users", label: "Manajemen User", icon: "⊛" },
              { id: "produk", label: "Master Produk", icon: "📦" },
            ].map(nav => (
              <button
                key={nav.id}
                className="nav-item"
                onClick={() => setActiveSection(nav.id as any)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 8, marginBottom: 2, width: "100%",
                  background: activeSection === nav.id ? T.accentDim : "transparent",
                  borderLeft: activeSection === nav.id ? `2px solid ${T.accent}` : "2px solid transparent",
                  border: "none", cursor: "pointer",
                  color: activeSection === nav.id ? T.text : T.textDim,
                  fontSize: 13, transition: "all 0.15s", textAlign: "left",
                  fontFamily: T.fontSans,
                }}
              >
                <span>{nav.icon}</span>
                <span style={{ fontWeight: activeSection === nav.id ? 600 : 400 }}>{nav.label}</span>
              </button>
            ))}

            <div style={{ height: 1, background: T.border, margin: "12px 8px" }} />

            {[
              { href: "/", label: "Beranda", icon: "◈" },
              { href: "/dashboard", label: "Dashboard", icon: "▤" },
            ].map(nav => (
              <a key={nav.href} href={nav.href} className="nav-item" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, marginBottom: 2, background: "transparent", borderLeft: "2px solid transparent", textDecoration: "none", color: T.textDim, fontSize: 13, transition: "all 0.15s" }}>
                <span>{nav.icon}</span><span>{nav.label}</span>
              </a>
            ))}
          </nav>
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, marginBottom: 4 }}>{currentUser?.nama}</div>
            <div style={{ fontSize: 11, color: T.accent, fontFamily: T.fontMono }}>{roleInfo(currentUser?.role || "").label}</div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <header style={{ height: 58, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`, background: "rgba(16,12,22,0.9)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 100 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1 }}>AZALEA /</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginLeft: 4 }}>
                {activeSection === "users" ? "⊛ Manajemen User" : "📦 Master Produk"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>
              {activeSection === "users" ? `${users.length} user terdaftar` : `${produkList.length} produk`}
            </div>
          </header>

          <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>

            {/* ══ SECTION: USERS ══ */}
            {activeSection === "users" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                {/* Role legend */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                  {ROLES.map(r => (
                    <div key={r.value} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 16px", borderLeft: `3px solid ${r.color}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: r.color, fontFamily: T.fontMono, marginBottom: 3 }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: T.textDim }}>{r.desc}</div>
                    </div>
                  ))}
                </div>

                {/* User list */}
                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 18, color: T.text }}>Daftar User</h3>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari nama, email, role..." style={{ ...inputStyle, width: 240 }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px 120px 100px", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${T.border}`, background: "rgba(232,115,138,0.04)" }}>
                    {["NAMA", "EMAIL", "ROLE", "BERGABUNG", "AKSI"].map(h => (
                      <div key={h} style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>
                    ))}
                  </div>
                  {usersFiltered.length === 0 && (
                    <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono, fontSize: 13 }}>Tidak ada user ditemukan</div>
                  )}
                  {usersFiltered.map(user => {
                    const isEditing = editingId === user.id;
                    const isSelf = user.id === currentUser?.id;
                    const rInfo = roleInfo(user.role);
                    return (
                      <div key={user.id} style={{ borderBottom: `1px solid ${T.border}`, background: isEditing ? "rgba(232,115,138,0.04)" : "transparent", transition: "background 0.15s" }}>
                        {!isEditing ? (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px 120px 100px", gap: 8, padding: "14px 24px", alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid, display: "flex", alignItems: "center", gap: 6 }}>
                                {user.nama || "—"}
                                {isSelf && <span style={{ fontSize: 9, background: T.accentDim, color: T.accent, padding: "1px 6px", borderRadius: 3, fontFamily: T.fontMono }}>KAMU</span>}
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{user.email}</div>
                            <div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: rInfo.color, background: `${rInfo.color}18`, border: `1px solid ${rInfo.color}33`, padding: "3px 10px", borderRadius: 20, fontFamily: T.fontMono }}>
                                {rInfo.label}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{tanggalFmt(user.created_at)}</div>
                            <div>
                              <button onClick={() => startEdit(user)} style={{ background: T.accentDim, border: `1px solid ${T.borderStrong}`, color: T.accent, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>Edit</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: "16px 24px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px auto", gap: 10, alignItems: "end" }}>
                              <div>
                                <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5 }}>NAMA</label>
                                <input value={editNama} onChange={e => setEditNama(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5 }}>EMAIL</label>
                                <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{user.email}</div>
                              </div>
                              <div>
                                <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5 }}>ROLE</label>
                                <select value={editRole} onChange={e => setEditRole(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
                                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => saveUser(user.id)} disabled={savingId === user.id} style={{ background: `linear-gradient(135deg, #c94f68, ${T.accent})`, border: "none", color: "#fff", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono, fontWeight: 700, whiteSpace: "nowrap", boxShadow: `0 4px 12px ${T.accentGlow}` }}>
                                  {savingId === user.id ? "..." : "Simpan"}
                                </button>
                                <button onClick={cancelEdit} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textDim, padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                              </div>
                            </div>
                            {editRole && (
                              <div style={{ marginTop: 10, fontSize: 11, color: roleInfo(editRole).color, fontFamily: T.fontMono, background: `${roleInfo(editRole).color}0f`, padding: "6px 12px", borderRadius: 6, display: "inline-block" }}>
                                {roleInfo(editRole).label}: {roleInfo(editRole).desc}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ marginTop: 16, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, padding: "14px 20px", fontSize: 12, color: "#60a5fa", fontFamily: T.fontMono }}>
                  ℹ Untuk menambah user baru, invite via <strong>Supabase Dashboard → Authentication → Users → Invite</strong>. Setelah user daftar, assign role di halaman ini.
                </div>
              </div>
            )}

            {/* ══ SECTION: MASTER PRODUK ══ */}
            {activeSection === "produk" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>

                {/* Info SKU */}
                <div style={{ background: `${T.purple}10`, border: `1px solid ${T.purple}30`, borderRadius: 10, padding: "14px 20px", marginBottom: 20, fontSize: 12, color: T.purple, fontFamily: T.fontMono, lineHeight: 1.7 }}>
                  📦 <strong>SKU</strong> dipakai untuk mapping produk saat upload file Shopee. Isi SKU sesuai dengan kolom <em>SKU Induk</em> di file xlsx Shopee kamu (contoh: <strong>SM1KG</strong>).
                  <br />Produk tanpa SKU tidak akan terdeteksi saat upload orderan.
                </div>

                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 18, color: T.text }}>
                      Daftar Produk
                      <span style={{ marginLeft: 10, fontSize: 12, color: T.textDim, fontFamily: T.fontMono, fontWeight: 400 }}>
                        {produkList.filter(p => p.sku).length}/{produkList.length} sudah punya SKU
                      </span>
                    </h3>
                    <input
                      value={searchProduk}
                      onChange={e => setSearchProduk(e.target.value)}
                      placeholder="🔍 Cari produk atau SKU..."
                      style={{ ...inputStyle, width: 240 }}
                    />
                  </div>

                  {/* Header tabel */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 140px 100px 120px 120px", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${T.border}`, background: "rgba(232,115,138,0.04)" }}>
                    {["NAMA PRODUK", "SKU SHOPEE", "STOK", "HARGA JUAL", "AKSI"].map(h => (
                      <div key={h} style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>
                    ))}
                  </div>

                  {produkLoading && (
                    <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono, fontSize: 12 }}>Memuat produk...</div>
                  )}

                  {!produkLoading && produkFiltered.length === 0 && (
                    <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono, fontSize: 13 }}>Tidak ada produk ditemukan</div>
                  )}

                  {!produkLoading && produkFiltered.map(p => {
                    const isEditing = editingSkuId === p.id;
                    return (
                      <div key={p.id} className="sku-row" style={{ borderBottom: `1px solid ${T.border}`, background: isEditing ? "rgba(167,139,250,0.05)" : "transparent", transition: "background 0.15s" }}>
                        {!isEditing ? (
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 140px 100px 120px 120px", gap: 8, padding: "13px 24px", alignItems: "center" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid }}>{p.nama_produk}</div>
                            <div>
                              {p.sku
                                ? <span style={{ fontSize: 12, fontWeight: 700, color: T.purple, background: `${T.purple}15`, border: `1px solid ${T.purple}30`, padding: "3px 10px", borderRadius: 6, fontFamily: T.fontMono }}>{p.sku}</span>
                                : <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, fontStyle: "italic" }}>— belum diisi —</span>
                              }
                            </div>
                            <div style={{ fontSize: 12, color: p.jumlah_stok < 10 ? T.red : T.green, fontFamily: T.fontMono, fontWeight: 700 }}>{p.jumlah_stok} {p.satuan}</div>
                            <div style={{ fontSize: 12, color: T.textMid, fontFamily: T.fontMono }}>{rupiahFmt(p.harga_jual)}</div>
                            <div>
                              <button
                                onClick={() => startEditSku(p)}
                                style={{ background: `${T.purple}15`, border: `1px solid ${T.purple}30`, color: T.purple, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}
                              >
                                {p.sku ? "Edit SKU" : "+ Isi SKU"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          // Edit SKU inline
                          <div style={{ padding: "14px 24px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 200px auto", gap: 12, alignItems: "end" }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid, marginBottom: 4 }}>{p.nama_produk}</div>
                                <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>Stok: {p.jumlah_stok} · {rupiahFmt(p.harga_jual)}</div>
                              </div>
                              <div>
                                <label style={{ fontSize: 10, color: T.purple, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5, fontWeight: 700 }}>SKU SHOPEE</label>
                                <input
                                  value={editSkuVal}
                                  onChange={e => setEditSkuVal(e.target.value.toUpperCase())}
                                  onKeyDown={e => { if (e.key === "Enter") saveSku(p.id); if (e.key === "Escape") cancelEditSku(); }}
                                  placeholder="Contoh: SM1KG"
                                  autoFocus
                                  style={{ ...inputStyle, width: "100%", fontFamily: T.fontMono, fontSize: 14, letterSpacing: 1, border: `1.5px solid ${T.purple}40` }}
                                />
                                <div style={{ fontSize: 10, color: T.textDim, marginTop: 4, fontFamily: T.fontMono }}>Enter untuk simpan · Esc untuk batal · Kosongkan untuk hapus SKU</div>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={() => saveSku(p.id)}
                                  disabled={savingSku}
                                  style={{ background: `linear-gradient(135deg, #7c3aed, ${T.purple})`, border: "none", color: "#fff", padding: "8px 16px", borderRadius: 6, cursor: savingSku ? "not-allowed" : "pointer", fontSize: 12, fontFamily: T.fontMono, fontWeight: 700, whiteSpace: "nowrap", boxShadow: `0 4px 12px ${T.purple}33` }}
                                >
                                  {savingSku ? "..." : "Simpan"}
                                </button>
                                <button onClick={cancelEditSku} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textDim, padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* SQL fallback */}
                <div style={{ marginTop: 16, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, padding: "14px 20px", fontSize: 12, color: "#60a5fa", fontFamily: T.fontMono, lineHeight: 1.8 }}>
                  ℹ Kalau kolom SKU belum ada di tabel, jalankan dulu di <strong>Supabase → SQL Editor</strong>:
                  <pre style={{ margin: "8px 0 0", background: "rgba(0,0,0,0.3)", padding: "10px 14px", borderRadius: 8, fontSize: 11, color: "#93c5fd", overflowX: "auto" }}>
{`ALTER TABLE stok_barang ADD COLUMN IF NOT EXISTS sku TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS stok_barang_sku_idx
  ON stok_barang(sku) WHERE sku IS NOT NULL;`}
                  </pre>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </>
  );
}
