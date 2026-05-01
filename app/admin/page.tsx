"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRole } from "@/hooks/useRole";

type Profile = { id: string; email: string; nama: string; role: string; created_at: string };
type Produk = { id: number; nama_produk: string; sku: string | null; jumlah_stok: number; harga_jual: number; satuan: string };
type Toko = { id: number; nama: string; platform: string; aktif: boolean; created_at: string };
type Supplier = { id: number; nama: string; telepon: string | null; alamat: string | null; catatan: string | null; created_at: string };
type Toast = { msg: string; type: "success" | "error" | "info" };

const T = {
  bg: "#100c16", bgCard: "rgba(255,255,255,0.02)", sidebar: "#130d1a",
  border: "rgba(232,115,138,0.12)", borderStrong: "rgba(232,115,138,0.28)",
  accent: "#e8738a", accentDim: "rgba(232,115,138,0.12)", accentGlow: "rgba(232,115,138,0.25)",
  text: "#f0e6e9", textMid: "#c0a8b4", textDim: "#7a6880",
  green: "#6fcf97", yellow: "#f2c94c", red: "#eb5757",
  purple: "#a78bfa", blue: "#60a5fa", orange: "#fb923c",
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
const PLATFORM_OPTIONS = ["Shopee", "TikTok", "Lazada", "Tokopedia", "Website", "Offline", "Lainnya"];
const PLATFORM_COLORS: Record<string, string> = {
  Shopee: "#f97316", TikTok: "#a78bfa", Lazada: "#60a5fa",
  Tokopedia: "#34d399", Website: "#e8738a", Offline: "#f2c94c", Lainnya: "#7a6880",
};

const roleInfo = (role: string) => ROLES.find(r => r.value === role) || { label: role, color: T.textDim, desc: "" };
const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;

type ProdukForm = { nama_produk: string; sku: string; harga_jual: string; jumlah_stok: string; satuan: string };
type TokoForm = { nama: string; platform: string; aktif: boolean };
type SupplierForm = { nama: string; telepon: string; alamat: string; catatan: string };
const emptyProdukForm = (): ProdukForm => ({ nama_produk: "", sku: "", harga_jual: "", jumlah_stok: "0", satuan: "pcs" });
const emptyTokoForm = (): TokoForm => ({ nama: "", platform: "Shopee", aktif: true });
const emptySupplierForm = (): SupplierForm => ({ nama: "", telepon: "", alamat: "", catatan: "" });
type Section = "users" | "produk" | "toko" | "supplier";

export default function AdminPage() {
  const { profile: currentUser, isOwner, loading: roleLoading } = useRole();
  const [activeSection, setActiveSection] = useState<Section>("users");
  const [toast, setToast] = useState<Toast | null>(null);
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<Profile[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editNama, setEditNama] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [produkList, setProdukList] = useState<Produk[]>([]);
  const [produkLoading, setProdukLoading] = useState(false);
  const [searchProduk, setSearchProduk] = useState("");
  const [showTambahProduk, setShowTambahProduk] = useState(false);
  const [tambahProduk, setTambahProduk] = useState<ProdukForm>(emptyProdukForm());
  const [savingProduk, setSavingProduk] = useState(false);
  const [editingProdukId, setEditingProdukId] = useState<number | null>(null);
  const [editProdukForm, setEditProdukForm] = useState<ProdukForm>(emptyProdukForm());
  const [savingEditProduk, setSavingEditProduk] = useState(false);
  const [confirmDeleteProdukId, setConfirmDeleteProdukId] = useState<number | null>(null);
  const [deletingProdukId, setDeletingProdukId] = useState<number | null>(null);

  const [tokoList, setTokoList] = useState<Toko[]>([]);
  const [tokoLoading, setTokoLoading] = useState(false);
  const [showTambahToko, setShowTambahToko] = useState(false);
  const [tambahToko, setTambahToko] = useState<TokoForm>(emptyTokoForm());
  const [savingToko, setSavingToko] = useState(false);
  const [editingTokoId, setEditingTokoId] = useState<number | null>(null);
  const [editTokoForm, setEditTokoForm] = useState<TokoForm>(emptyTokoForm());
  const [savingEditToko, setSavingEditToko] = useState(false);
  const [confirmDeleteTokoId, setConfirmDeleteTokoId] = useState<number | null>(null);
  const [deletingTokoId, setDeletingTokoId] = useState<number | null>(null);

  const [supplierList, setSupplierList] = useState<Supplier[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [searchSupplier, setSearchSupplier] = useState("");
  const [showTambahSupplier, setShowTambahSupplier] = useState(false);
  const [tambahSupplier, setTambahSupplier] = useState<SupplierForm>(emptySupplierForm());
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null);
  const [editSupplierForm, setEditSupplierForm] = useState<SupplierForm>(emptySupplierForm());
  const [savingEditSupplier, setSavingEditSupplier] = useState(false);
  const [confirmDeleteSupplierId, setConfirmDeleteSupplierId] = useState<number | null>(null);
  const [deletingSupplierId, setDeletingSupplierId] = useState<number | null>(null);

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

  const fetchToko = useCallback(async () => {
    setTokoLoading(true);
    const { data, error } = await supabase.from("toko_online").select("*").order("id");
    if (error) showToast("Gagal load toko: " + error.message, "error");
    else setTokoList(data || []);
    setTokoLoading(false);
  }, []);

  const fetchSupplier = useCallback(async () => {
    setSupplierLoading(true);
    const { data, error } = await supabase.from("supplier").select("*").order("nama");
    if (error) showToast("Gagal load supplier: " + error.message, "error");
    else setSupplierList(data || []);
    setSupplierLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { if (activeSection === "produk") fetchProduk(); }, [activeSection, fetchProduk]);
  useEffect(() => { if (activeSection === "toko") fetchToko(); }, [activeSection, fetchToko]);
  useEffect(() => { if (activeSection === "supplier") fetchSupplier(); }, [activeSection, fetchSupplier]);

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
    else { showToast("User berhasil diupdate!"); fetchUsers(); setEditingId(null); }
    setSavingId(null);
  };

  const handleTambahProduk = async () => {
    if (!tambahProduk.nama_produk.trim()) return showToast("Nama produk wajib diisi!", "error");
    if (!tambahProduk.harga_jual) return showToast("Harga jual wajib diisi!", "error");
    setSavingProduk(true);
    const { error } = await supabase.from("stok_barang").insert([{ nama_produk: tambahProduk.nama_produk.trim(), sku: tambahProduk.sku.trim().toUpperCase() || null, harga_jual: toAngka(tambahProduk.harga_jual), jumlah_stok: parseInt(tambahProduk.jumlah_stok) || 0, satuan: tambahProduk.satuan }]);
    if (error) showToast("Gagal tambah produk: " + error.message, "error");
    else { showToast(`✓ Produk "${tambahProduk.nama_produk}" ditambahkan!`); setTambahProduk(emptyProdukForm()); setShowTambahProduk(false); fetchProduk(); }
    setSavingProduk(false);
  };

  const saveEditProduk = async (id: number) => {
    if (!editProdukForm.nama_produk.trim()) return showToast("Nama produk wajib diisi!", "error");
    setSavingEditProduk(true);
    const { error } = await supabase.from("stok_barang").update({ nama_produk: editProdukForm.nama_produk.trim(), sku: editProdukForm.sku.trim().toUpperCase() || null, harga_jual: toAngka(editProdukForm.harga_jual), jumlah_stok: parseInt(editProdukForm.jumlah_stok) || 0, satuan: editProdukForm.satuan }).eq("id", id);
    if (error) showToast("Gagal update produk: " + error.message, "error");
    else { showToast(`✓ Produk berhasil diupdate!`); setEditingProdukId(null); fetchProduk(); }
    setSavingEditProduk(false);
  };

  const hapusProduk = async (id: number, nama: string) => {
    setDeletingProdukId(id);
    const { error } = await supabase.from("stok_barang").delete().eq("id", id);
    if (error) showToast("Gagal hapus: " + error.message, "error");
    else { showToast(`🗑 "${nama}" dihapus`); setConfirmDeleteProdukId(null); fetchProduk(); }
    setDeletingProdukId(null);
  };

  const handleTambahToko = async () => {
    if (!tambahToko.nama.trim()) return showToast("Nama toko wajib diisi!", "error");
    setSavingToko(true);
    const { error } = await supabase.from("toko_online").insert([{ nama: tambahToko.nama.trim(), platform: tambahToko.platform, aktif: tambahToko.aktif }]);
    if (error) showToast("Gagal tambah toko: " + error.message, "error");
    else { showToast(`✓ Toko "${tambahToko.nama}" ditambahkan!`); setTambahToko(emptyTokoForm()); setShowTambahToko(false); fetchToko(); }
    setSavingToko(false);
  };

  const saveEditToko = async (id: number) => {
    if (!editTokoForm.nama.trim()) return showToast("Nama toko wajib diisi!", "error");
    setSavingEditToko(true);
    const { error } = await supabase.from("toko_online").update({ nama: editTokoForm.nama.trim(), platform: editTokoForm.platform, aktif: editTokoForm.aktif }).eq("id", id);
    if (error) showToast("Gagal update toko: " + error.message, "error");
    else { showToast(`✓ Toko berhasil diupdate!`); setEditingTokoId(null); fetchToko(); }
    setSavingEditToko(false);
  };

  const hapusToko = async (id: number, nama: string) => {
    setDeletingTokoId(id);
    const { error } = await supabase.from("toko_online").delete().eq("id", id);
    if (error) showToast("Gagal hapus toko: " + error.message, "error");
    else { showToast(`🗑 Toko "${nama}" dihapus`); setConfirmDeleteTokoId(null); fetchToko(); }
    setDeletingTokoId(null);
  };

  const toggleAktifToko = async (id: number, aktif: boolean) => {
    const { error } = await supabase.from("toko_online").update({ aktif: !aktif }).eq("id", id);
    if (error) showToast("Gagal update status: " + error.message, "error");
    else { showToast(`Toko ${!aktif ? "diaktifkan" : "dinonaktifkan"}`); fetchToko(); }
  };

  const handleTambahSupplier = async () => {
    if (!tambahSupplier.nama.trim()) return showToast("Nama supplier wajib diisi!", "error");
    setSavingSupplier(true);
    const { error } = await supabase.from("supplier").insert([{ nama: tambahSupplier.nama.trim(), telepon: tambahSupplier.telepon.trim() || null, alamat: tambahSupplier.alamat.trim() || null, catatan: tambahSupplier.catatan.trim() || null }]);
    if (error) showToast("Gagal tambah supplier: " + error.message, "error");
    else { showToast(`✓ Supplier "${tambahSupplier.nama}" ditambahkan!`); setTambahSupplier(emptySupplierForm()); setShowTambahSupplier(false); fetchSupplier(); }
    setSavingSupplier(false);
  };

  const saveEditSupplier = async (id: number) => {
    if (!editSupplierForm.nama.trim()) return showToast("Nama supplier wajib diisi!", "error");
    setSavingEditSupplier(true);
    const { error } = await supabase.from("supplier").update({ nama: editSupplierForm.nama.trim(), telepon: editSupplierForm.telepon.trim() || null, alamat: editSupplierForm.alamat.trim() || null, catatan: editSupplierForm.catatan.trim() || null }).eq("id", id);
    if (error) showToast("Gagal update supplier: " + error.message, "error");
    else { showToast(`✓ Supplier berhasil diupdate!`); setEditingSupplierId(null); fetchSupplier(); }
    setSavingEditSupplier(false);
  };

  const hapusSupplier = async (id: number, nama: string) => {
    setDeletingSupplierId(id);
    const { error } = await supabase.from("supplier").delete().eq("id", id);
    if (error) showToast("Gagal hapus supplier: " + error.message, "error");
    else { showToast(`🗑 Supplier "${nama}" dihapus`); setConfirmDeleteSupplierId(null); fetchSupplier(); }
    setDeletingSupplierId(null);
  };

  const produkFiltered = produkList.filter(p => searchProduk === "" || p.nama_produk?.toLowerCase().includes(searchProduk.toLowerCase()) || (p.sku || "").toLowerCase().includes(searchProduk.toLowerCase()));
  const supplierFiltered = supplierList.filter(s => searchSupplier === "" || s.nama?.toLowerCase().includes(searchSupplier.toLowerCase()) || (s.telepon || "").includes(searchSupplier));
  const usersFiltered = users.filter(u => search === "" || u.nama?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()) || u.role?.toLowerCase().includes(search.toLowerCase()));

  const inputStyle: React.CSSProperties = { padding: "8px 12px", background: "rgba(255,255,255,0.04)", border: `1.5px solid rgba(232,115,138,0.2)`, borderRadius: 8, color: T.text, fontFamily: T.fontSans, fontSize: 13, outline: "none", transition: "border-color 0.2s", width: "100%", boxSizing: "border-box" };

  const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
    { id: "users", label: "Manajemen User", icon: "⊛" },
    { id: "produk", label: "Master Produk", icon: "📦" },
    { id: "toko", label: "Master Toko", icon: "🏪" },
    { id: "supplier", label: "Master Supplier", icon: "🏭" },
  ];

  if (roleLoading || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⊛</div>
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

  const BtnPrimary = ({ onClick, disabled, children, color = T.accent }: any) => (
    <button onClick={onClick} disabled={disabled} style={{ padding: "10px 24px", background: disabled ? T.textDim : `linear-gradient(135deg, #c94f68, ${color})`, border: "none", color: "#fff", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, fontFamily: T.fontMono }}>{children}</button>
  );
  const BtnSecondary = ({ onClick, children }: any) => (
    <button onClick={onClick} style={{ padding: "10px 18px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 8, cursor: "pointer", fontSize: 13, fontFamily: T.fontMono }}>{children}</button>
  );
  const Label = ({ children, color = T.textDim }: any) => (
    <label style={{ fontSize: 10, color, fontFamily: T.fontMono, letterSpacing: 1, display: "block", marginBottom: 5, fontWeight: 700 }}>{children}</label>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { background: ${T.bg}; }
        input:focus, select:focus, textarea:focus { border-color: rgba(232,115,138,0.5) !important; box-shadow: 0 0 0 3px rgba(232,115,138,0.08) !important; outline: none; }
        input, select, textarea { color: #e0d0d8 !important; }
        input::placeholder, textarea::placeholder { color: #5a4860 !important; }
        select option { background: #1a1020; color: #e0d0d8; }
        textarea { resize: vertical; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-thumb { background: rgba(232,115,138,0.2); border-radius: 3px; }
        .nav-item:hover { background: rgba(232,115,138,0.06) !important; }
        .data-row:hover { background: rgba(255,255,255,0.015) !important; }
        .btn-edit:hover { background: rgba(167,139,250,0.25) !important; }
        .btn-del:hover { background: rgba(235,87,87,0.25) !important; }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: "#1a1020", border: `1px solid ${toast.type === "success" ? T.green : toast.type === "error" ? T.red : T.accent}44`, color: toast.type === "success" ? T.green : toast.type === "error" ? T.red : T.accent, padding: "14px 20px", borderRadius: 12, fontFamily: T.fontMono, fontWeight: 600, fontSize: 13, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", animation: "fadeUp 0.3s ease" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", minHeight: "100vh", fontFamily: T.fontSans, background: T.bg, color: T.text }}>
        <aside style={{ width: 220, flexShrink: 0, background: T.sidebar, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "24px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg, #e8738a, #c94f68)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>✿</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>Azalea</div>
                <div style={{ fontSize: 9, color: T.accent, letterSpacing: 2, textTransform: "uppercase", fontFamily: T.fontMono }}>ERP System</div>
              </div>
            </a>
          </div>
          <nav style={{ flex: 1, padding: "16px 12px", overflowY: "auto" }}>
            <div style={{ fontSize: 9, color: T.textDim, letterSpacing: 2, textTransform: "uppercase", fontFamily: T.fontMono, padding: "0 8px", marginBottom: 8 }}>Admin Panel</div>
            {NAV_ITEMS.map(nav => (
              <button key={nav.id} className="nav-item" onClick={() => setActiveSection(nav.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, marginBottom: 2, width: "100%", background: activeSection === nav.id ? T.accentDim : "transparent", borderLeft: activeSection === nav.id ? `2px solid ${T.accent}` : "2px solid transparent", border: "none", cursor: "pointer", color: activeSection === nav.id ? T.text : T.textDim, fontSize: 13, transition: "all 0.15s", textAlign: "left", fontFamily: T.fontSans }}>
                <span>{nav.icon}</span>
                <span style={{ fontWeight: activeSection === nav.id ? 600 : 400 }}>{nav.label}</span>
              </button>
            ))}
            <div style={{ height: 1, background: T.border, margin: "12px 8px" }} />
            {[{ href: "/", label: "Beranda", icon: "◈" }, { href: "/dashboard", label: "Dashboard", icon: "▤" }].map(nav => (
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

        <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <header style={{ height: 58, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`, background: "rgba(16,12,22,0.9)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 100 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1 }}>AZALEA /</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginLeft: 4 }}>
                {NAV_ITEMS.find(n => n.id === activeSection)?.icon} {NAV_ITEMS.find(n => n.id === activeSection)?.label}
              </span>
            </div>
          </header>

          <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>

            {/* ══ USERS ══ */}
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
                    <h3 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 18, color: T.text }}>Daftar User ({users.length})</h3>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari..." style={{ ...inputStyle, width: 240 }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px 120px 100px", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${T.border}`, background: "rgba(232,115,138,0.04)" }}>
                    {["NAMA", "EMAIL", "ROLE", "BERGABUNG", "AKSI"].map(h => <div key={h} style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>)}
                  </div>
                  {usersFiltered.map(user => {
                    const isEditing = editingId === user.id;
                    const rInfo = roleInfo(user.role);
                    return (
                      <div key={user.id} style={{ borderBottom: `1px solid ${T.border}`, background: isEditing ? "rgba(232,115,138,0.04)" : "transparent" }}>
                        {!isEditing ? (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px 120px 100px", gap: 8, padding: "14px 24px", alignItems: "center" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid, display: "flex", alignItems: "center", gap: 6 }}>
                              {user.nama || "—"}
                              {user.id === currentUser?.id && <span style={{ fontSize: 9, background: T.accentDim, color: T.accent, padding: "1px 6px", borderRadius: 3, fontFamily: T.fontMono }}>KAMU</span>}
                            </div>
                            <div style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{user.email}</div>
                            <div><span style={{ fontSize: 11, fontWeight: 700, color: rInfo.color, background: `${rInfo.color}18`, border: `1px solid ${rInfo.color}33`, padding: "3px 10px", borderRadius: 20, fontFamily: T.fontMono }}>{rInfo.label}</span></div>
                            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{tanggalFmt(user.created_at)}</div>
                            <div><button onClick={() => { setEditingId(user.id); setEditRole(user.role); setEditNama(user.nama); }} style={{ background: T.accentDim, border: `1px solid ${T.borderStrong}`, color: T.accent, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>Edit</button></div>
                          </div>
                        ) : (
                          <div style={{ padding: "16px 24px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px auto", gap: 10, alignItems: "end" }}>
                              <div><Label>NAMA</Label><input value={editNama} onChange={e => setEditNama(e.target.value)} style={inputStyle} /></div>
                              <div><Label>EMAIL</Label><div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{user.email}</div></div>
                              <div><Label>ROLE</Label>
                                <select value={editRole} onChange={e => setEditRole(e.target.value)} style={inputStyle}>
                                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => saveUser(user.id)} disabled={savingId === user.id} style={{ background: `linear-gradient(135deg, #c94f68, ${T.accent})`, border: "none", color: "#fff", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono, fontWeight: 700 }}>{savingId === user.id ? "..." : "Simpan"}</button>
                                <button onClick={() => setEditingId(null)} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textDim, padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 16, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 10, padding: "14px 20px", fontSize: 12, color: "#60a5fa", fontFamily: T.fontMono }}>
                  ℹ Tambah user baru via <strong>Supabase Dashboard → Authentication → Users → Invite</strong>.
                </div>
              </div>
            )}

            {/* ══ MASTER PRODUK ══ */}
            {activeSection === "produk" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 22, color: T.text, fontWeight: 400 }}>Master Produk</h2>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{produkList.length} produk · {produkList.filter(p => p.sku).length} punya SKU</p>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input value={searchProduk} onChange={e => setSearchProduk(e.target.value)} placeholder="🔍 Cari..." style={{ ...inputStyle, width: 200 }} />
                    <button onClick={() => { setShowTambahProduk(v => !v); setTambahProduk(emptyProdukForm()); setEditingProdukId(null); }} style={{ padding: "9px 18px", background: showTambahProduk ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, #c94f68, ${T.accent})`, border: showTambahProduk ? `1px solid ${T.border}` : "none", color: showTambahProduk ? T.textDim : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: T.fontMono, whiteSpace: "nowrap" }}>
                      {showTambahProduk ? "✕ Batal" : "+ Tambah Produk"}
                    </button>
                  </div>
                </div>

                {showTambahProduk && (
                  <div style={{ background: "rgba(232,115,138,0.04)", border: `1px solid ${T.borderStrong}`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, fontFamily: T.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ TAMBAH PRODUK BARU</div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                      <div><Label>NAMA PRODUK *</Label><input value={tambahProduk.nama_produk} onChange={e => setTambahProduk(f => ({ ...f, nama_produk: e.target.value }))} placeholder="Siomay Ayam 500g" style={inputStyle} autoFocus /></div>
                      <div><Label color={T.purple}>SKU SHOPEE</Label><input value={tambahProduk.sku} onChange={e => setTambahProduk(f => ({ ...f, sku: e.target.value.toUpperCase() }))} placeholder="SM500G" style={{ ...inputStyle, fontFamily: T.fontMono }} /></div>
                      <div><Label>HARGA JUAL *</Label><input value={tambahProduk.harga_jual} onChange={e => setTambahProduk(f => ({ ...f, harga_jual: formatIDR(e.target.value) }))} placeholder="0" style={{ ...inputStyle, fontFamily: T.fontMono }} /></div>
                      <div><Label>STOK AWAL</Label><input type="number" min="0" value={tambahProduk.jumlah_stok} onChange={e => setTambahProduk(f => ({ ...f, jumlah_stok: e.target.value }))} style={{ ...inputStyle, fontFamily: T.fontMono }} /></div>
                      <div><Label>SATUAN</Label><select value={tambahProduk.satuan} onChange={e => setTambahProduk(f => ({ ...f, satuan: e.target.value }))} style={inputStyle}>{SATUAN_OPTIONS.map(s => <option key={s}>{s}</option>)}</select></div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}><BtnPrimary onClick={handleTambahProduk} disabled={savingProduk}>{savingProduk ? "Menyimpan..." : "✓ Simpan Produk"}</BtnPrimary><BtnSecondary onClick={() => setShowTambahProduk(false)}>Batal</BtnSecondary></div>
                  </div>
                )}

                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 130px 90px 130px 70px 130px", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${T.border}`, background: "rgba(232,115,138,0.04)" }}>
                    {["NAMA PRODUK", "SKU", "STOK", "HARGA JUAL", "SAT.", "AKSI"].map(h => <div key={h} style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>)}
                  </div>
                  {produkLoading && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono }}>Memuat...</div>}
                  {!produkLoading && produkFiltered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono }}>Tidak ada produk</div>}
                  {!produkLoading && produkFiltered.map(p => (
                    <div key={p.id} className="data-row" style={{ borderBottom: `1px solid ${T.border}`, background: editingProdukId === p.id ? "rgba(167,139,250,0.05)" : "transparent", transition: "background 0.15s" }}>
                      {editingProdukId !== p.id ? (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 130px 90px 130px 70px 130px", gap: 8, padding: "13px 24px", alignItems: "center" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid }}>{p.nama_produk}</div>
                            <div>{p.sku ? <span style={{ fontSize: 11, fontWeight: 700, color: T.purple, background: `${T.purple}15`, border: `1px solid ${T.purple}30`, padding: "3px 8px", borderRadius: 6, fontFamily: T.fontMono }}>{p.sku}</span> : <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, fontStyle: "italic" }}>— kosong —</span>}</div>
                            <div style={{ fontSize: 12, color: p.jumlah_stok <= 0 ? T.red : p.jumlah_stok <= 10 ? T.yellow : T.green, fontFamily: T.fontMono, fontWeight: 700 }}>{p.jumlah_stok}</div>
                            <div style={{ fontSize: 12, color: T.textMid, fontFamily: T.fontMono }}>{rupiahFmt(p.harga_jual)}</div>
                            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{p.satuan}</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn-edit" onClick={() => { setEditingProdukId(p.id); setEditProdukForm({ nama_produk: p.nama_produk, sku: p.sku || "", harga_jual: p.harga_jual.toLocaleString("id-ID"), jumlah_stok: String(p.jumlah_stok), satuan: p.satuan }); setShowTambahProduk(false); setConfirmDeleteProdukId(null); }} style={{ background: `${T.purple}15`, border: `1px solid ${T.purple}30`, color: T.purple, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700, transition: "background 0.15s" }}>Edit</button>
                              <button className="btn-del" onClick={() => setConfirmDeleteProdukId(confirmDeleteProdukId === p.id ? null : p.id)} style={{ background: `${T.red}15`, border: `1px solid ${T.red}25`, color: T.red, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700, transition: "background 0.15s" }}>Hapus</button>
                            </div>
                          </div>
                          {confirmDeleteProdukId === p.id && (
                            <div style={{ padding: "10px 24px 14px", background: `${T.red}08`, borderTop: `1px solid ${T.red}20`, display: "flex", alignItems: "center", gap: 12, animation: "slideDown 0.15s ease" }}>
                              <span style={{ fontSize: 12, color: T.red, fontFamily: T.fontMono }}>⚠ Hapus "{p.nama_produk}"? Tidak bisa dibatalkan.</span>
                              <button onClick={() => hapusProduk(p.id, p.nama_produk)} disabled={deletingProdukId === p.id} style={{ background: T.red, border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono, fontWeight: 700 }}>{deletingProdukId === p.id ? "..." : "Ya, Hapus"}</button>
                              <button onClick={() => setConfirmDeleteProdukId(null)} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ padding: "16px 24px", animation: "slideDown 0.2s ease" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.purple, fontFamily: T.fontMono, marginBottom: 12, letterSpacing: 1 }}>✎ EDIT PRODUK</div>
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                            <div><Label>NAMA PRODUK *</Label><input value={editProdukForm.nama_produk} onChange={e => setEditProdukForm(f => ({ ...f, nama_produk: e.target.value }))} style={inputStyle} autoFocus /></div>
                            <div><Label color={T.purple}>SKU SHOPEE</Label><input value={editProdukForm.sku} onChange={e => setEditProdukForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))} style={{ ...inputStyle, fontFamily: T.fontMono }} /></div>
                            <div><Label>HARGA JUAL</Label><input value={editProdukForm.harga_jual} onChange={e => setEditProdukForm(f => ({ ...f, harga_jual: formatIDR(e.target.value) }))} style={{ ...inputStyle, fontFamily: T.fontMono }} /></div>
                            <div><Label>STOK</Label><input type="number" min="0" value={editProdukForm.jumlah_stok} onChange={e => setEditProdukForm(f => ({ ...f, jumlah_stok: e.target.value }))} style={{ ...inputStyle, fontFamily: T.fontMono }} /></div>
                            <div><Label>SATUAN</Label><select value={editProdukForm.satuan} onChange={e => setEditProdukForm(f => ({ ...f, satuan: e.target.value }))} style={inputStyle}>{SATUAN_OPTIONS.map(s => <option key={s}>{s}</option>)}</select></div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => saveEditProduk(p.id)} disabled={savingEditProduk} style={{ padding: "9px 20px", background: `linear-gradient(135deg, #7c3aed, ${T.purple})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.fontMono }}>{savingEditProduk ? "..." : "✓ Simpan"}</button>
                            <button onClick={() => setEditingProdukId(null)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, background: `${T.purple}08`, border: `1px solid ${T.purple}20`, borderRadius: 10, padding: "14px 20px", fontSize: 12, color: T.purple, fontFamily: T.fontMono }}>
                  📦 <strong>SKU</strong> harus sesuai kolom <em>SKU Induk</em> di Excel Shopee. Produk tanpa SKU tidak terdeteksi saat upload.
                </div>
              </div>
            )}

            {/* ══ MASTER TOKO ══ */}
            {activeSection === "toko" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 22, color: T.text, fontWeight: 400 }}>Master Toko Online</h2>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{tokoList.length} toko · {tokoList.filter(t => t.aktif).length} aktif · {tokoList.filter(t => !t.aktif).length} nonaktif</p>
                  </div>
                  <button onClick={() => { setShowTambahToko(v => !v); setTambahToko(emptyTokoForm()); setEditingTokoId(null); }} style={{ padding: "9px 18px", background: showTambahToko ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, #c94f68, ${T.accent})`, border: showTambahToko ? `1px solid ${T.border}` : "none", color: showTambahToko ? T.textDim : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: T.fontMono, whiteSpace: "nowrap" }}>
                    {showTambahToko ? "✕ Batal" : "+ Tambah Toko"}
                  </button>
                </div>

                {showTambahToko && (
                  <div style={{ background: "rgba(232,115,138,0.04)", border: `1px solid ${T.borderStrong}`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, fontFamily: T.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ TAMBAH TOKO BARU</div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                      <div><Label>NAMA TOKO *</Label><input value={tambahToko.nama} onChange={e => setTambahToko(f => ({ ...f, nama: e.target.value }))} placeholder="Azalea Official" style={inputStyle} autoFocus /></div>
                      <div><Label>PLATFORM</Label>
                        <select value={tambahToko.platform} onChange={e => setTambahToko(f => ({ ...f, platform: e.target.value }))} style={inputStyle}>
                          {PLATFORM_OPTIONS.map(p => <option key={p}>{p}</option>)}
                        </select>
                      </div>
                      <div><Label>STATUS</Label>
                        <div style={{ display: "flex", gap: 8 }}>
                          {[{ val: true, label: "Aktif" }, { val: false, label: "Nonaktif" }].map(opt => (
                            <button key={String(opt.val)} onClick={() => setTambahToko(f => ({ ...f, aktif: opt.val }))} style={{ flex: 1, padding: "8px", border: `1px solid ${tambahToko.aktif === opt.val ? (opt.val ? T.green : T.red) : T.border}`, borderRadius: 8, background: tambahToko.aktif === opt.val ? (opt.val ? `${T.green}15` : `${T.red}15`) : "transparent", color: tambahToko.aktif === opt.val ? (opt.val ? T.green : T.red) : T.textDim, cursor: "pointer", fontSize: 12, fontFamily: T.fontSans, fontWeight: 600 }}>{opt.label}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}><BtnPrimary onClick={handleTambahToko} disabled={savingToko}>{savingToko ? "Menyimpan..." : "✓ Simpan Toko"}</BtnPrimary><BtnSecondary onClick={() => setShowTambahToko(false)}>Batal</BtnSecondary></div>
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
                  {tokoLoading && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono, gridColumn: "1/-1" }}>Memuat...</div>}
                  {!tokoLoading && tokoList.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono, gridColumn: "1/-1" }}>Belum ada toko</div>}
                  {!tokoLoading && tokoList.map(t => {
                    const pColor = PLATFORM_COLORS[t.platform] || T.textDim;
                    const isEditing = editingTokoId === t.id;
                    return (
                      <div key={t.id} style={{ background: T.bgCard, border: `1px solid ${t.aktif ? T.border : `${T.red}25`}`, borderRadius: 14, overflow: "hidden" }}>
                        {!isEditing ? (
                          <div style={{ padding: 20 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                              <div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginBottom: 6 }}>{t.nama}</div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: pColor, background: `${pColor}15`, border: `1px solid ${pColor}30`, padding: "2px 8px", borderRadius: 4, fontFamily: T.fontMono }}>{t.platform}</span>
                              </div>
                              <button onClick={() => toggleAktifToko(t.id, t.aktif)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${t.aktif ? T.green : T.red}40`, background: t.aktif ? `${T.green}15` : `${T.red}15`, color: t.aktif ? T.green : T.red, fontSize: 11, fontFamily: T.fontMono, fontWeight: 700, cursor: "pointer" }}>
                                {t.aktif ? "● Aktif" : "○ Nonaktif"}
                              </button>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button className="btn-edit" onClick={() => { setEditingTokoId(t.id); setEditTokoForm({ nama: t.nama, platform: t.platform, aktif: t.aktif }); setShowTambahToko(false); setConfirmDeleteTokoId(null); }} style={{ flex: 1, background: `${T.purple}15`, border: `1px solid ${T.purple}30`, color: T.purple, padding: "7px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono, fontWeight: 700, transition: "background 0.15s" }}>✎ Edit</button>
                              <button className="btn-del" onClick={() => setConfirmDeleteTokoId(confirmDeleteTokoId === t.id ? null : t.id)} style={{ flex: 1, background: `${T.red}10`, border: `1px solid ${T.red}20`, color: T.red, padding: "7px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono, fontWeight: 700, transition: "background 0.15s" }}>🗑 Hapus</button>
                            </div>
                            {confirmDeleteTokoId === t.id && (
                              <div style={{ marginTop: 10, padding: "10px 12px", background: `${T.red}08`, border: `1px solid ${T.red}20`, borderRadius: 8, animation: "slideDown 0.15s ease" }}>
                                <div style={{ fontSize: 11, color: T.red, fontFamily: T.fontMono, marginBottom: 8 }}>⚠ Hapus toko ini? Data penjualan toko akan terpengaruh!</div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button onClick={() => hapusToko(t.id, t.nama)} disabled={deletingTokoId === t.id} style={{ background: T.red, border: "none", color: "#fff", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>{deletingTokoId === t.id ? "..." : "Ya, Hapus"}</button>
                                  <button onClick={() => setConfirmDeleteTokoId(null)} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono }}>Batal</button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ padding: 20, animation: "slideDown 0.2s ease" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.purple, fontFamily: T.fontMono, marginBottom: 12, letterSpacing: 1 }}>✎ EDIT TOKO</div>
                            <div style={{ marginBottom: 10 }}><Label>NAMA TOKO *</Label><input value={editTokoForm.nama} onChange={e => setEditTokoForm(f => ({ ...f, nama: e.target.value }))} style={inputStyle} autoFocus /></div>
                            <div style={{ marginBottom: 10 }}><Label>PLATFORM</Label>
                              <select value={editTokoForm.platform} onChange={e => setEditTokoForm(f => ({ ...f, platform: e.target.value }))} style={inputStyle}>
                                {PLATFORM_OPTIONS.map(p => <option key={p}>{p}</option>)}
                              </select>
                            </div>
                            <div style={{ marginBottom: 14 }}><Label>STATUS</Label>
                              <div style={{ display: "flex", gap: 8 }}>
                                {[{ val: true, label: "Aktif" }, { val: false, label: "Nonaktif" }].map(opt => (
                                  <button key={String(opt.val)} onClick={() => setEditTokoForm(f => ({ ...f, aktif: opt.val }))} style={{ flex: 1, padding: "8px", border: `1px solid ${editTokoForm.aktif === opt.val ? (opt.val ? T.green : T.red) : T.border}`, borderRadius: 8, background: editTokoForm.aktif === opt.val ? (opt.val ? `${T.green}15` : `${T.red}15`) : "transparent", color: editTokoForm.aktif === opt.val ? (opt.val ? T.green : T.red) : T.textDim, cursor: "pointer", fontSize: 12, fontFamily: T.fontSans, fontWeight: 600 }}>{opt.label}</button>
                                ))}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => saveEditToko(t.id)} disabled={savingEditToko} style={{ flex: 1, padding: "9px", background: `linear-gradient(135deg, #7c3aed, ${T.purple})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.fontMono }}>{savingEditToko ? "..." : "✓ Simpan"}</button>
                              <button onClick={() => setEditingTokoId(null)} style={{ padding: "9px 14px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══ MASTER SUPPLIER ══ */}
            {activeSection === "supplier" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 22, color: T.text, fontWeight: 400 }}>Master Supplier</h2>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{supplierList.length} supplier terdaftar</p>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input value={searchSupplier} onChange={e => setSearchSupplier(e.target.value)} placeholder="🔍 Cari nama atau telepon..." style={{ ...inputStyle, width: 220 }} />
                    <button onClick={() => { setShowTambahSupplier(v => !v); setTambahSupplier(emptySupplierForm()); setEditingSupplierId(null); }} style={{ padding: "9px 18px", background: showTambahSupplier ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, #c94f68, ${T.accent})`, border: showTambahSupplier ? `1px solid ${T.border}` : "none", color: showTambahSupplier ? T.textDim : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: T.fontMono, whiteSpace: "nowrap" }}>
                      {showTambahSupplier ? "✕ Batal" : "+ Tambah Supplier"}
                    </button>
                  </div>
                </div>

                {showTambahSupplier && (
                  <div style={{ background: "rgba(232,115,138,0.04)", border: `1px solid ${T.borderStrong}`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, fontFamily: T.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ TAMBAH SUPPLIER BARU</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div><Label>NAMA SUPPLIER *</Label><input value={tambahSupplier.nama} onChange={e => setTambahSupplier(f => ({ ...f, nama: e.target.value }))} placeholder="CV Bahan Segar" style={inputStyle} autoFocus /></div>
                      <div><Label>NO. TELEPON</Label><input value={tambahSupplier.telepon} onChange={e => setTambahSupplier(f => ({ ...f, telepon: e.target.value }))} placeholder="08xx-xxxx-xxxx" style={{ ...inputStyle, fontFamily: T.fontMono }} /></div>
                    </div>
                    <div style={{ marginBottom: 12 }}><Label>ALAMAT</Label><input value={tambahSupplier.alamat} onChange={e => setTambahSupplier(f => ({ ...f, alamat: e.target.value }))} placeholder="Alamat lengkap" style={inputStyle} /></div>
                    <div style={{ marginBottom: 14 }}><Label>CATATAN</Label><textarea value={tambahSupplier.catatan} onChange={e => setTambahSupplier(f => ({ ...f, catatan: e.target.value }))} placeholder="Opsional" rows={2} style={{ ...inputStyle, fontFamily: T.fontSans }} /></div>
                    <div style={{ display: "flex", gap: 8 }}><BtnPrimary onClick={handleTambahSupplier} disabled={savingSupplier}>{savingSupplier ? "Menyimpan..." : "✓ Simpan Supplier"}</BtnPrimary><BtnSecondary onClick={() => setShowTambahSupplier(false)}>Batal</BtnSecondary></div>
                  </div>
                )}

                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.5fr 1fr 120px", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${T.border}`, background: "rgba(232,115,138,0.04)" }}>
                    {["NAMA", "TELEPON", "ALAMAT", "CATATAN", "AKSI"].map(h => <div key={h} style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>)}
                  </div>
                  {supplierLoading && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono }}>Memuat...</div>}
                  {!supplierLoading && supplierFiltered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono }}>Belum ada supplier</div>}
                  {!supplierLoading && supplierFiltered.map(s => (
                    <div key={s.id} className="data-row" style={{ borderBottom: `1px solid ${T.border}`, background: editingSupplierId === s.id ? "rgba(96,165,250,0.04)" : "transparent", transition: "background 0.15s" }}>
                      {editingSupplierId !== s.id ? (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1.5fr 1fr 120px", gap: 8, padding: "13px 24px", alignItems: "center" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid }}>{s.nama}</div>
                            <div style={{ fontSize: 12, color: s.telepon ? T.blue : T.textDim, fontFamily: T.fontMono }}>{s.telepon || "—"}</div>
                            <div style={{ fontSize: 12, color: T.textDim }}>{s.alamat || "—"}</div>
                            <div style={{ fontSize: 12, color: T.textDim, fontStyle: s.catatan ? "normal" : "italic" }}>{s.catatan || "—"}</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn-edit" onClick={() => { setEditingSupplierId(s.id); setEditSupplierForm({ nama: s.nama, telepon: s.telepon || "", alamat: s.alamat || "", catatan: s.catatan || "" }); setShowTambahSupplier(false); setConfirmDeleteSupplierId(null); }} style={{ background: `${T.purple}15`, border: `1px solid ${T.purple}30`, color: T.purple, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700, transition: "background 0.15s" }}>Edit</button>
                              <button className="btn-del" onClick={() => setConfirmDeleteSupplierId(confirmDeleteSupplierId === s.id ? null : s.id)} style={{ background: `${T.red}15`, border: `1px solid ${T.red}25`, color: T.red, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700, transition: "background 0.15s" }}>Hapus</button>
                            </div>
                          </div>
                          {confirmDeleteSupplierId === s.id && (
                            <div style={{ padding: "10px 24px 14px", background: `${T.red}08`, borderTop: `1px solid ${T.red}20`, display: "flex", alignItems: "center", gap: 12, animation: "slideDown 0.15s ease" }}>
                              <span style={{ fontSize: 12, color: T.red, fontFamily: T.fontMono }}>⚠ Hapus supplier "{s.nama}"?</span>
                              <button onClick={() => hapusSupplier(s.id, s.nama)} disabled={deletingSupplierId === s.id} style={{ background: T.red, border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono, fontWeight: 700 }}>{deletingSupplierId === s.id ? "..." : "Ya, Hapus"}</button>
                              <button onClick={() => setConfirmDeleteSupplierId(null)} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ padding: "16px 24px", animation: "slideDown 0.2s ease" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.blue, fontFamily: T.fontMono, marginBottom: 12, letterSpacing: 1 }}>✎ EDIT SUPPLIER</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                            <div><Label>NAMA *</Label><input value={editSupplierForm.nama} onChange={e => setEditSupplierForm(f => ({ ...f, nama: e.target.value }))} style={inputStyle} autoFocus /></div>
                            <div><Label>TELEPON</Label><input value={editSupplierForm.telepon} onChange={e => setEditSupplierForm(f => ({ ...f, telepon: e.target.value }))} style={{ ...inputStyle, fontFamily: T.fontMono }} /></div>
                          </div>
                          <div style={{ marginBottom: 12 }}><Label>ALAMAT</Label><input value={editSupplierForm.alamat} onChange={e => setEditSupplierForm(f => ({ ...f, alamat: e.target.value }))} style={inputStyle} /></div>
                          <div style={{ marginBottom: 14 }}><Label>CATATAN</Label><textarea value={editSupplierForm.catatan} onChange={e => setEditSupplierForm(f => ({ ...f, catatan: e.target.value }))} rows={2} style={{ ...inputStyle, fontFamily: T.fontSans }} /></div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => saveEditSupplier(s.id)} disabled={savingEditSupplier} style={{ padding: "9px 20px", background: `linear-gradient(135deg, #1d4ed8, ${T.blue})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.fontMono }}>{savingEditSupplier ? "..." : "✓ Simpan"}</button>
                            <button onClick={() => setEditingSupplierId(null)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </>
  );
}
