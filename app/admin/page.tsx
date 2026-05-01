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

const SATUAN_OPTIONS = ["pcs", "kg", "gr", "pack", "box", "lusin", "set", "botol", "sachet"];

const roleInfo = (role: string) => ROLES.find(r => r.value === role) || { label: role, color: T.textDim, desc: "" };
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;

type ProdukForm = { nama_produk: string; sku: string; harga_jual: string; jumlah_stok: string; satuan: string };
const emptyForm = (): ProdukForm => ({ nama_produk: "", sku: "", harga_jual: "", jumlah_stok: "0", satuan: "pcs" });

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
  const [searchProduk, setSearchProduk] = useState("");

  // Form tambah produk baru
  const [showTambahForm, setShowTambahForm] = useState(false);
  const [tambahForm, setTambahForm] = useState<ProdukForm>(emptyForm());
  const [savingTambah, setSavingTambah] = useState(false);

  // Edit produk inline
  const [editingProdukId, setEditingProdukId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ProdukForm>(emptyForm());
  const [savingEdit, setSavingEdit] = useState(false);

  // Hapus produk
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

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
    const { data, error } = await supabase.from("stok_barang")
      .select("id, nama_produk, sku, jumlah_stok, harga_jual, satuan")
      .order("nama_produk");
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

  // ── Produk: Tambah ──
  const handleTambah = async () => {
    if (!tambahForm.nama_produk.trim()) return showToast("Nama produk wajib diisi!", "error");
    if (!tambahForm.harga_jual) return showToast("Harga jual wajib diisi!", "error");

    setSavingTambah(true);
    const payload = {
      nama_produk: tambahForm.nama_produk.trim(),
      sku: tambahForm.sku.trim().toUpperCase() || null,
      harga_jual: toAngka(tambahForm.harga_jual),
      jumlah_stok: parseInt(tambahForm.jumlah_stok) || 0,
      satuan: tambahForm.satuan,
    };

    const { error } = await supabase.from("stok_barang").insert([payload]);
    if (error) showToast("Gagal tambah produk: " + error.message, "error");
    else {
      showToast(`✓ Produk "${payload.nama_produk}" berhasil ditambahkan!`);
      setTambahForm(emptyForm());
      setShowTambahForm(false);
      fetchProduk();
    }
    setSavingTambah(false);
  };

  // ── Produk: Edit ──
  const startEditProduk = (p: Produk) => {
    setEditingProdukId(p.id);
    setEditForm({
      nama_produk: p.nama_produk,
      sku: p.sku || "",
      harga_jual: p.harga_jual.toLocaleString("id-ID"),
      jumlah_stok: String(p.jumlah_stok),
      satuan: p.satuan,
    });
    setConfirmDeleteId(null);
  };

  const cancelEditProduk = () => { setEditingProdukId(null); setEditForm(emptyForm()); };

  const saveEditProduk = async (id: number) => {
    if (!editForm.nama_produk.trim()) return showToast("Nama produk wajib diisi!", "error");
    setSavingEdit(true);
    const payload = {
      nama_produk: editForm.nama_produk.trim(),
      sku: editForm.sku.trim().toUpperCase() || null,
      harga_jual: toAngka(editForm.harga_jual),
      jumlah_stok: parseInt(editForm.jumlah_stok) || 0,
      satuan: editForm.satuan,
    };
    const { error } = await supabase.from("stok_barang").update(payload).eq("id", id);
    if (error) showToast("Gagal update produk: " + error.message, "error");
    else {
      showToast(`✓ Produk "${payload.nama_produk}" berhasil diupdate!`);
      cancelEditProduk();
      fetchProduk();
    }
    setSavingEdit(false);
  };

  // ── Produk: Hapus ──
  const hapusProduk = async (id: number, nama: string) => {
    setDeletingId(id);
    const { error } = await supabase.from("stok_barang").delete().eq("id", id);
    if (error) showToast("Gagal hapus produk: " + error.message, "error");
    else {
      showToast(`🗑 Produk "${nama}" berhasil dihapus`);
      setConfirmDeleteId(null);
      fetchProduk();
    }
    setDeletingId(null);
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
    outline: "none", transition: "border-color 0.2s", width: "100%",
    boxSizing: "border-box",
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
        @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: rgba(232,115,138,0.2); border-radius: 3px; }
        .nav-item:hover { background: rgba(232,115,138,0.06) !important; color: ${T.textMid} !important; }
        .produk-row:hover { background: rgba(255,255,255,0.015) !important; }
        .btn-edit:hover { background: rgba(167,139,250,0.25) !important; }
        .btn-hapus:hover { background: rgba(235,87,87,0.25) !important; }
      `}</style>

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
              <button key={nav.id} className="nav-item" onClick={() => setActiveSection(nav.id as any)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, marginBottom: 2, width: "100%", background: activeSection === nav.id ? T.accentDim : "transparent", borderLeft: activeSection === nav.id ? `2px solid ${T.accent}` : "2px solid transparent", border: "none", cursor: "pointer", color: activeSection === nav.id ? T.text : T.textDim, fontSize: 13, transition: "all 0.15s", textAlign: "left", fontFamily: T.fontSans }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                  {ROLES.map(r => (
                    <div key={r.value} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 16px", borderLeft: `3px solid ${r.color}` }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: r.color, fontFamily: T.fontMono, marginBottom: 3 }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: T.textDim }}>{r.desc}</div>
                    </div>
                  ))}
                </div>
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
                  {usersFiltered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono, fontSize: 13 }}>Tidak ada user ditemukan</div>}
                  {usersFiltered.map(user => {
                    const isEditing = editingId === user.id;
                    const isSelf = user.id === currentUser?.id;
                    const rInfo = roleInfo(user.role);
                    return (
                      <div key={user.id} style={{ borderBottom: `1px solid ${T.border}`, background: isEditing ? "rgba(232,115,138,0.04)" : "transparent", transition: "background 0.15s" }}>
                        {!isEditing ? (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px 120px 100px", gap: 8, padding: "14px 24px", alignItems: "center" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid, display: "flex", alignItems: "center", gap: 6 }}>
                              {user.nama || "—"}
                              {isSelf && <span style={{ fontSize: 9, background: T.accentDim, color: T.accent, padding: "1px 6px", borderRadius: 3, fontFamily: T.fontMono }}>KAMU</span>}
                            </div>
                            <div style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{user.email}</div>
                            <div><span style={{ fontSize: 11, fontWeight: 700, color: rInfo.color, background: `${rInfo.color}18`, border: `1px solid ${rInfo.color}33`, padding: "3px 10px", borderRadius: 20, fontFamily: T.fontMono }}>{rInfo.label}</span></div>
                            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{tanggalFmt(user.created_at)}</div>
                            <div><button onClick={() => startEdit(user)} style={{ background: T.accentDim, border: `1px solid ${T.borderStrong}`, color: T.accent, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>Edit</button></div>
                          </div>
                        ) : (
                          <div style={{ padding: "16px 24px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px auto", gap: 10, alignItems: "end" }}>
                              <div>
                                <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5 }}>NAMA</label>
                                <input value={editNama} onChange={e => setEditNama(e.target.value)} style={inputStyle} />
                              </div>
                              <div>
                                <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5 }}>EMAIL</label>
                                <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{user.email}</div>
                              </div>
                              <div>
                                <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5 }}>ROLE</label>
                                <select value={editRole} onChange={e => setEditRole(e.target.value)} style={inputStyle}>
                                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => saveUser(user.id)} disabled={savingId === user.id} style={{ background: `linear-gradient(135deg, #c94f68, ${T.accent})`, border: "none", color: "#fff", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono, fontWeight: 700, whiteSpace: "nowrap" }}>
                                  {savingId === user.id ? "..." : "Simpan"}
                                </button>
                                <button onClick={cancelEdit} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textDim, padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 16, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, padding: "14px 20px", fontSize: 12, color: "#60a5fa", fontFamily: T.fontMono }}>
                  ℹ Untuk menambah user baru, invite via <strong>Supabase Dashboard → Authentication → Users → Invite</strong>.
                </div>
              </div>
            )}

            {/* ══ SECTION: MASTER PRODUK ══ */}
            {activeSection === "produk" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>

                {/* Toolbar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 22, color: T.text, fontWeight: 400 }}>Master Produk</h2>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>
                      {produkList.length} produk · {produkList.filter(p => p.sku).length} sudah punya SKU
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input value={searchProduk} onChange={e => setSearchProduk(e.target.value)} placeholder="🔍 Cari produk atau SKU..." style={{ ...inputStyle, width: 220 }} />
                    <button
                      onClick={() => { setShowTambahForm(v => !v); setTambahForm(emptyForm()); setEditingProdukId(null); }}
                      style={{ padding: "9px 18px", background: showTambahForm ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, #c94f68, ${T.accent})`, border: showTambahForm ? `1px solid ${T.border}` : "none", color: showTambahForm ? T.textDim : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: T.fontMono, whiteSpace: "nowrap" }}>
                      {showTambahForm ? "✕ Batal" : "+ Tambah Produk"}
                    </button>
                  </div>
                </div>

                {/* Form Tambah Produk */}
                {showTambahForm && (
                  <div style={{ background: "rgba(232,115,138,0.04)", border: `1px solid ${T.borderStrong}`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.accent, fontFamily: T.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ TAMBAH PRODUK BARU</div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                      <div>
                        <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5, fontWeight: 700 }}>NAMA PRODUK *</label>
                        <input value={tambahForm.nama_produk} onChange={e => setTambahForm(f => ({ ...f, nama_produk: e.target.value }))} placeholder="Contoh: Siomay Ayam 500g" style={inputStyle} autoFocus />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: T.purple, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5, fontWeight: 700 }}>SKU SHOPEE</label>
                        <input value={tambahForm.sku} onChange={e => setTambahForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))} placeholder="Contoh: SM500G" style={{ ...inputStyle, fontFamily: T.fontMono }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5, fontWeight: 700 }}>HARGA JUAL *</label>
                        <input value={tambahForm.harga_jual} onChange={e => setTambahForm(f => ({ ...f, harga_jual: formatIDR(e.target.value) }))} placeholder="0" style={{ ...inputStyle, fontFamily: T.fontMono }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5, fontWeight: 700 }}>STOK AWAL</label>
                        <input type="number" min="0" value={tambahForm.jumlah_stok} onChange={e => setTambahForm(f => ({ ...f, jumlah_stok: e.target.value }))} style={{ ...inputStyle, fontFamily: T.fontMono }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5, fontWeight: 700 }}>SATUAN</label>
                        <select value={tambahForm.satuan} onChange={e => setTambahForm(f => ({ ...f, satuan: e.target.value }))} style={inputStyle}>
                          {SATUAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={handleTambah} disabled={savingTambah} style={{ padding: "10px 24px", background: savingTambah ? T.textDim : `linear-gradient(135deg, #c94f68, ${T.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: savingTambah ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: T.fontMono, boxShadow: `0 4px 16px ${T.accentGlow}` }}>
                        {savingTambah ? "Menyimpan..." : "✓ Simpan Produk"}
                      </button>
                      <button onClick={() => setShowTambahForm(false)} style={{ padding: "10px 18px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: T.fontMono }}>Batal</button>
                    </div>
                  </div>
                )}

                {/* Tabel Produk */}
                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                  {/* Header */}
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 130px 90px 130px 70px 130px", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${T.border}`, background: "rgba(232,115,138,0.04)" }}>
                    {["NAMA PRODUK", "SKU", "STOK", "HARGA JUAL", "SAT.", "AKSI"].map(h => (
                      <div key={h} style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>
                    ))}
                  </div>

                  {produkLoading && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono, fontSize: 12 }}>Memuat produk...</div>}
                  {!produkLoading && produkFiltered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono, fontSize: 13 }}>Tidak ada produk ditemukan</div>}

                  {!produkLoading && produkFiltered.map(p => {
                    const isEditing = editingProdukId === p.id;
                    const isConfirmDelete = confirmDeleteId === p.id;

                    return (
                      <div key={p.id} className="produk-row" style={{ borderBottom: `1px solid ${T.border}`, background: isEditing ? "rgba(167,139,250,0.05)" : "transparent", transition: "background 0.15s" }}>
                        {!isEditing ? (
                          <>
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 130px 90px 130px 70px 130px", gap: 8, padding: "13px 24px", alignItems: "center" }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid }}>{p.nama_produk}</div>
                              <div>
                                {p.sku
                                  ? <span style={{ fontSize: 11, fontWeight: 700, color: T.purple, background: `${T.purple}15`, border: `1px solid ${T.purple}30`, padding: "3px 8px", borderRadius: 6, fontFamily: T.fontMono }}>{p.sku}</span>
                                  : <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, fontStyle: "italic" }}>— kosong —</span>
                                }
                              </div>
                              <div style={{ fontSize: 12, color: p.jumlah_stok <= 0 ? T.red : p.jumlah_stok <= 10 ? T.yellow : T.green, fontFamily: T.fontMono, fontWeight: 700 }}>{p.jumlah_stok}</div>
                              <div style={{ fontSize: 12, color: T.textMid, fontFamily: T.fontMono }}>{rupiahFmt(p.harga_jual)}</div>
                              <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{p.satuan}</div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="btn-edit" onClick={() => { startEditProduk(p); setShowTambahForm(false); }} style={{ background: `${T.purple}15`, border: `1px solid ${T.purple}30`, color: T.purple, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700, transition: "background 0.15s" }}>Edit</button>
                                <button className="btn-hapus" onClick={() => setConfirmDeleteId(isConfirmDelete ? null : p.id)} style={{ background: `${T.red}15`, border: `1px solid ${T.red}25`, color: T.red, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700, transition: "background 0.15s" }}>Hapus</button>
                              </div>
                            </div>
                            {/* Konfirmasi hapus */}
                            {isConfirmDelete && (
                              <div style={{ padding: "10px 24px 14px", background: `${T.red}08`, borderTop: `1px solid ${T.red}20`, display: "flex", alignItems: "center", gap: 12, animation: "slideDown 0.15s ease" }}>
                                <span style={{ fontSize: 12, color: T.red, fontFamily: T.fontMono }}>⚠ Hapus "{p.nama_produk}"? Tindakan ini tidak bisa dibatalkan.</span>
                                <button onClick={() => hapusProduk(p.id, p.nama_produk)} disabled={deletingId === p.id} style={{ background: T.red, border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono, fontWeight: 700 }}>
                                  {deletingId === p.id ? "..." : "Ya, Hapus"}
                                </button>
                                <button onClick={() => setConfirmDeleteId(null)} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                              </div>
                            )}
                          </>
                        ) : (
                          // Form edit inline
                          <div style={{ padding: "16px 24px", animation: "slideDown 0.2s ease" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.purple, fontFamily: T.fontMono, marginBottom: 12, letterSpacing: 1 }}>✎ EDIT PRODUK</div>
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                              <div>
                                <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5, fontWeight: 700 }}>NAMA PRODUK *</label>
                                <input value={editForm.nama_produk} onChange={e => setEditForm(f => ({ ...f, nama_produk: e.target.value }))} style={inputStyle} autoFocus />
                              </div>
                              <div>
                                <label style={{ fontSize: 10, color: T.purple, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5, fontWeight: 700 }}>SKU SHOPEE</label>
                                <input value={editForm.sku} onChange={e => setEditForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))} placeholder="Kosongkan jika tidak ada" style={{ ...inputStyle, fontFamily: T.fontMono }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5, fontWeight: 700 }}>HARGA JUAL</label>
                                <input value={editForm.harga_jual} onChange={e => setEditForm(f => ({ ...f, harga_jual: formatIDR(e.target.value) }))} style={{ ...inputStyle, fontFamily: T.fontMono }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5, fontWeight: 700 }}>STOK</label>
                                <input type="number" min="0" value={editForm.jumlah_stok} onChange={e => setEditForm(f => ({ ...f, jumlah_stok: e.target.value }))} style={{ ...inputStyle, fontFamily: T.fontMono }} />
                              </div>
                              <div>
                                <label style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5, fontWeight: 700 }}>SATUAN</label>
                                <select value={editForm.satuan} onChange={e => setEditForm(f => ({ ...f, satuan: e.target.value }))} style={inputStyle}>
                                  {SATUAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => saveEditProduk(p.id)} disabled={savingEdit} style={{ padding: "9px 20px", background: savingEdit ? T.textDim : `linear-gradient(135deg, #7c3aed, ${T.purple})`, border: "none", color: "#fff", borderRadius: 8, cursor: savingEdit ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.fontMono }}>
                                {savingEdit ? "Menyimpan..." : "✓ Simpan Perubahan"}
                              </button>
                              <button onClick={cancelEditProduk} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Info SKU */}
                <div style={{ marginTop: 16, background: `${T.purple}08`, border: `1px solid ${T.purple}20`, borderRadius: 10, padding: "14px 20px", fontSize: 12, color: T.purple, fontFamily: T.fontMono, lineHeight: 1.7 }}>
                  📦 <strong>SKU</strong> harus sesuai dengan kolom <em>SKU Induk</em> di file Excel Shopee (contoh: <strong>SM500G</strong>). Produk tanpa SKU tidak akan terdeteksi saat upload orderan.
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </>
  );
}
