"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRole } from "@/hooks/useRole";

type Profile = { id: string; email: string; nama: string; role: string; created_at: string };
type Produk = {
  id: number;
  nama_produk: string;
  sku: string | null;
  jumlah_stok: number;
  harga_jual: number;
  satuan: string;
  berat_kg: number | null;
};
type BahanBaku = { id: number; nama: string; satuan: string; kategori: string };
type PresetKemasan = { id: number; stok_barang_id: number; bahan_baku_id: number; berat_gram: number; nama_bahan?: string; satuan_bahan?: string };
type Toko = { id: number; nama: string; platform: string; aktif: boolean; created_at: string };
type Supplier = { id: number; nama: string; telepon: string | null; alamat: string | null; catatan: string | null; created_at: string };
type Pelanggan = { id: number; nama: string; telepon: string | null; alamat: string | null; catatan: string | null; created_at: string };
type HargaKhusus = { id: number; pelanggan_id: number; produk_id: number; harga: number; nama_produk?: string };
type Toast = { msg: string; type: "success" | "error" | "info" };

const T = {
  bg: "#100c16", bgCard: "rgba(255,255,255,0.02)", sidebar: "#130d1a",
  border: "rgba(232,115,138,0.12)", borderStrong: "rgba(232,115,138,0.28)",
  accent: "#e8738a", accentDim: "rgba(232,115,138,0.12)",
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

const SATUAN_OPTIONS = ["pcs", "kg", "gr", "pack", "box", "lusin", "bal", "set", "botol", "sachet"];
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

type ProdukForm = { nama_produk: string; sku: string; harga_jual: string; jumlah_stok: string; satuan: string; berat_kg: string };
type TokoForm = { nama: string; platform: string; aktif: boolean };
type SupplierForm = { nama: string; telepon: string; alamat: string; catatan: string };
type PelangganForm = { nama: string; telepon: string; alamat: string; catatan: string };

const emptyProdukForm = (): ProdukForm => ({ nama_produk: "", sku: "", harga_jual: "", jumlah_stok: "0", satuan: "pcs", berat_kg: "" });
const emptyTokoForm = (): TokoForm => ({ nama: "", platform: "Shopee", aktif: true });
const emptySupplierForm = (): SupplierForm => ({ nama: "", telepon: "", alamat: "", catatan: "" });
const emptyPelangganForm = (): PelangganForm => ({ nama: "", telepon: "", alamat: "", catatan: "" });

type Section = "users" | "produk" | "toko" | "supplier" | "pelanggan";

import Sidebar from "@/components/Sidebar";

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1.2, fontWeight: 700, marginBottom: 5, textTransform: "uppercase" as const }}>{children}</div>
);
const BtnPrimary = ({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
  <button onClick={onClick} disabled={disabled} style={{ padding: "9px 20px", background: disabled ? T.textDim : `linear-gradient(135deg, #c94f68, ${T.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, fontFamily: T.fontMono, opacity: disabled ? 0.6 : 1 }}>{children}</button>
);
const BtnSecondary = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>{children}</button>
);

export default function AdminPage() {
  const { profile: currentUser, isOwner, loading: roleLoading } = useRole();
  const [activeSection, setActiveSection] = useState<Section>("users");
  const [toast, setToast] = useState<Toast | null>(null);
  const [loading, setLoading] = useState(true);

  // ── USERS ──
  const [users, setUsers] = useState<Profile[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editNama, setEditNama] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // ── PRODUK ──
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

  // ── BAHAN BAKU ──
  const [bahanBakuList, setBahanBakuList] = useState<BahanBaku[]>([]);
  const [bahanBakuLoading, setBahanBakuLoading] = useState(false);

  // ── PRESET KEMASAN ──
  const [kemasanPanel, setKemasanPanel] = useState<number | null>(null); // produk_id
  const [kemasanList, setKemasanList] = useState<PresetKemasan[]>([]);
  const [kemasanLoading, setKemasanLoading] = useState(false);
  const [newKemasanBahanId, setNewKemasanBahanId] = useState("");
  const [newKemasanBeratGram, setNewKemasanBeratGram] = useState("");
  const [savingKemasan, setSavingKemasan] = useState(false);
  const [editingKemasanId, setEditingKemasanId] = useState<number | null>(null);
  const [editKemasanBerat, setEditKemasanBerat] = useState("");

  // ── TOKO ──
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

  // ── SUPPLIER ──
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

  // ── PELANGGAN ──
  const [pelangganList, setPelangganList] = useState<Pelanggan[]>([]);
  const [pelangganLoading, setPelangganLoading] = useState(false);
  const [searchPelanggan, setSearchPelanggan] = useState("");
  const [showTambahPelanggan, setShowTambahPelanggan] = useState(false);
  const [tambahPelanggan, setTambahPelanggan] = useState<PelangganForm>(emptyPelangganForm());
  const [savingPelanggan, setSavingPelanggan] = useState(false);
  const [editingPelangganId, setEditingPelangganId] = useState<number | null>(null);
  const [editPelangganForm, setEditPelangganForm] = useState<PelangganForm>(emptyPelangganForm());
  const [savingEditPelanggan, setSavingEditPelanggan] = useState(false);
  const [confirmDeletePelangganId, setConfirmDeletePelangganId] = useState<number | null>(null);
  const [deletingPelangganId, setDeletingPelangganId] = useState<number | null>(null);

  // ── HARGA KHUSUS ──
  const [hargaPanel, setHargaPanel] = useState<number | null>(null);
  const [hargaList, setHargaList] = useState<HargaKhusus[]>([]);
  const [hargaLoading, setHargaLoading] = useState(false);
  const [hargaProdukId, setHargaProdukId] = useState("");
  const [hargaNilai, setHargaNilai] = useState("");
  const [savingHarga, setSavingHarga] = useState(false);
  const [editingHargaId, setEditingHargaId] = useState<number | null>(null);
  const [editHargaNilai, setEditHargaNilai] = useState("");

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── FETCH ──
  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) showToast("Gagal load users: " + error.message, "error");
    else setUsers(data || []);
    setLoading(false);
  }, []);

  const fetchBahanBaku = useCallback(async () => {
    if (bahanBakuList.length > 0) return;
    setBahanBakuLoading(true);
    const { data, error } = await supabase
      .from("bahan_baku")
      .select("id, nama, satuan, kategori")
      .or("aktif.eq.true,aktif.is.null")
      .order("kategori").order("nama");
    if (error) showToast("Gagal load bahan: " + error.message, "error");
    else setBahanBakuList(data || []);
    setBahanBakuLoading(false);
  }, [bahanBakuList.length]);

  const fetchProduk = useCallback(async () => {
    setProdukLoading(true);
    const { data, error } = await supabase
      .from("stok_barang")
      .select("id, nama_produk, sku, jumlah_stok, harga_jual, satuan, berat_kg")
      .order("nama_produk");
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

  const fetchPelanggan = useCallback(async () => {
    setPelangganLoading(true);
    const { data, error } = await supabase.from("pelanggan_offline").select("*").order("nama");
    if (error) showToast("Gagal load pelanggan: " + error.message, "error");
    else setPelangganList(data || []);
    setPelangganLoading(false);
  }, []);

  const fetchHargaKhusus = useCallback(async (pelangganId: number) => {
    setHargaLoading(true);
    const { data, error } = await supabase
      .from("pelanggan_harga")
      .select("id, pelanggan_id, produk_id, harga, stok_barang(nama_produk)")
      .eq("pelanggan_id", pelangganId).order("produk_id");
    if (error) showToast("Gagal load harga: " + error.message, "error");
    else setHargaList((data || []).map((r: any) => ({ ...r, nama_produk: r.stok_barang?.nama_produk })));
    setHargaLoading(false);
  }, []);

  // ── FETCH PRESET KEMASAN ──
  const fetchPresetKemasan = useCallback(async (produkId: number) => {
    setKemasanLoading(true);
    const { data, error } = await supabase
      .from("produk_kemasan_default")
      .select("id, stok_barang_id, bahan_baku_id, berat_gram, bahan_baku(nama, satuan)")
      .eq("stok_barang_id", produkId)
      .order("id");
    if (error) showToast("Gagal load kemasan: " + error.message, "error");
    else setKemasanList((data || []).map((r: any) => ({
      ...r,
      nama_bahan: r.bahan_baku?.nama,
      satuan_bahan: r.bahan_baku?.satuan,
    })));
    setKemasanLoading(false);
  }, []);

  const bukaKemasanPanel = async (produkId: number) => {
    if (kemasanPanel === produkId) { setKemasanPanel(null); return; }
    setKemasanPanel(produkId);
    setNewKemasanBahanId(""); setNewKemasanBeratGram(""); setEditingKemasanId(null);
    await fetchPresetKemasan(produkId);
    if (bahanBakuList.length === 0) await fetchBahanBaku();
  };

  const simpanPresetKemasan = async (produkId: number) => {
    if (!newKemasanBahanId) return showToast("Pilih bahan kemasan!", "error");
    if (!newKemasanBeratGram || parseFloat(newKemasanBeratGram) <= 0) return showToast("Isi berat gram!", "error");
    setSavingKemasan(true);
    const { error } = await supabase.from("produk_kemasan_default").insert([{
      stok_barang_id: produkId,
      bahan_baku_id: parseInt(newKemasanBahanId),
      berat_gram: parseFloat(newKemasanBeratGram),
    }]);
    if (error) showToast("Gagal simpan: " + error.message, "error");
    else { showToast("✓ Preset kemasan disimpan!"); setNewKemasanBahanId(""); setNewKemasanBeratGram(""); await fetchPresetKemasan(produkId); }
    setSavingKemasan(false);
  };

  const updatePresetKemasan = async (kemasanId: number, produkId: number) => {
    if (!editKemasanBerat || parseFloat(editKemasanBerat) <= 0) return showToast("Isi berat!", "error");
    const { error } = await supabase.from("produk_kemasan_default").update({ berat_gram: parseFloat(editKemasanBerat) }).eq("id", kemasanId);
    if (error) showToast("Gagal update: " + error.message, "error");
    else { showToast("✓ Kemasan diupdate!"); setEditingKemasanId(null); await fetchPresetKemasan(produkId); }
  };

  const hapusPresetKemasan = async (kemasanId: number, produkId: number) => {
    const { error } = await supabase.from("produk_kemasan_default").delete().eq("id", kemasanId);
    if (error) showToast("Gagal hapus: " + error.message, "error");
    else { showToast("🗑 Kemasan dihapus"); await fetchPresetKemasan(produkId); }
  };

  const bukaHargaPanel = async (pelangganId: number) => {
    if (hargaPanel === pelangganId) { setHargaPanel(null); return; }
    setHargaPanel(pelangganId);
    setHargaProdukId(""); setHargaNilai(""); setEditingHargaId(null);
    await fetchHargaKhusus(pelangganId);
    if (produkList.length === 0) await fetchProduk();
  };

  const simpanHarga = async (pelangganId: number) => {
    if (!hargaProdukId) return showToast("Pilih produk!", "error");
    if (!hargaNilai) return showToast("Isi harga!", "error");
    setSavingHarga(true);
    const { error } = await supabase.from("pelanggan_harga")
      .upsert([{ pelanggan_id: pelangganId, produk_id: parseInt(hargaProdukId), harga: toAngka(hargaNilai) }], { onConflict: "pelanggan_id,produk_id" });
    if (error) showToast("Gagal simpan harga: " + error.message, "error");
    else { showToast("✓ Harga khusus disimpan!"); setHargaProdukId(""); setHargaNilai(""); await fetchHargaKhusus(pelangganId); }
    setSavingHarga(false);
  };

  const updateHarga = async (hargaId: number, pelangganId: number) => {
    if (!editHargaNilai) return showToast("Isi harga!", "error");
    const { error } = await supabase.from("pelanggan_harga").update({ harga: toAngka(editHargaNilai) }).eq("id", hargaId);
    if (error) showToast("Gagal update: " + error.message, "error");
    else { showToast("✓ Harga diupdate!"); setEditingHargaId(null); await fetchHargaKhusus(pelangganId); }
  };

  const hapusHarga = async (hargaId: number, pelangganId: number) => {
    const { error } = await supabase.from("pelanggan_harga").delete().eq("id", hargaId);
    if (error) showToast("Gagal hapus: " + error.message, "error");
    else { showToast("🗑 Harga dihapus"); await fetchHargaKhusus(pelangganId); }
  };

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { if (activeSection === "produk") { fetchProduk(); fetchBahanBaku(); } }, [activeSection, fetchProduk, fetchBahanBaku]);
  useEffect(() => { if (activeSection === "toko") fetchToko(); }, [activeSection, fetchToko]);
  useEffect(() => { if (activeSection === "supplier") fetchSupplier(); }, [activeSection, fetchSupplier]);
  useEffect(() => { if (activeSection === "pelanggan") { fetchPelanggan(); fetchProduk(); } }, [activeSection, fetchPelanggan, fetchProduk]);

  // ── USER CRUD ──
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

  // ── PRODUK CRUD ──
  const buildProdukPayload = (f: ProdukForm) => ({
    nama_produk: f.nama_produk.trim(),
    sku: f.sku.trim().toUpperCase() || null,
    harga_jual: toAngka(f.harga_jual),
    jumlah_stok: parseInt(f.jumlah_stok) || 0,
    satuan: f.satuan,
    berat_kg: f.berat_kg ? parseFloat(f.berat_kg.replace(",", ".")) : null,
  });

  const handleTambahProduk = async () => {
    if (!tambahProduk.nama_produk.trim()) return showToast("Nama produk wajib diisi!", "error");
    if (!tambahProduk.harga_jual) return showToast("Harga jual wajib diisi!", "error");
    setSavingProduk(true);
    const { error } = await supabase.from("stok_barang").insert([buildProdukPayload(tambahProduk)]);
    if (error) showToast("Gagal tambah produk: " + error.message, "error");
    else { showToast(`✓ Produk "${tambahProduk.nama_produk}" ditambahkan!`); setTambahProduk(emptyProdukForm()); setShowTambahProduk(false); fetchProduk(); }
    setSavingProduk(false);
  };

  const saveEditProduk = async (id: number) => {
    if (!editProdukForm.nama_produk.trim()) return showToast("Nama produk wajib diisi!", "error");
    setSavingEditProduk(true);
    const { error } = await supabase.from("stok_barang").update(buildProdukPayload(editProdukForm)).eq("id", id);
    if (error) showToast("Gagal update produk: " + error.message, "error");
    else { showToast("✓ Produk berhasil diupdate!"); setEditingProdukId(null); fetchProduk(); }
    setSavingEditProduk(false);
  };

  const hapusProduk = async (id: number, nama: string) => {
    setDeletingProdukId(id);
    const { error } = await supabase.from("stok_barang").delete().eq("id", id);
    if (error) showToast("Gagal hapus: " + error.message, "error");
    else { showToast(`🗑 "${nama}" dihapus`); setConfirmDeleteProdukId(null); fetchProduk(); }
    setDeletingProdukId(null);
  };

  // ── TOKO CRUD ──
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
    else { showToast("✓ Toko berhasil diupdate!"); setEditingTokoId(null); fetchToko(); }
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

  // ── SUPPLIER CRUD ──
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
    else { showToast("✓ Supplier berhasil diupdate!"); setEditingSupplierId(null); fetchSupplier(); }
    setSavingEditSupplier(false);
  };

  const hapusSupplier = async (id: number, nama: string) => {
    setDeletingSupplierId(id);
    const { error } = await supabase.from("supplier").delete().eq("id", id);
    if (error) showToast("Gagal hapus supplier: " + error.message, "error");
    else { showToast(`🗑 Supplier "${nama}" dihapus`); setConfirmDeleteSupplierId(null); fetchSupplier(); }
    setDeletingSupplierId(null);
  };

  // ── PELANGGAN CRUD ──
  const handleTambahPelanggan = async () => {
    if (!tambahPelanggan.nama.trim()) return showToast("Nama pelanggan wajib diisi!", "error");
    setSavingPelanggan(true);
    const { error } = await supabase.from("pelanggan_offline").insert([{ nama: tambahPelanggan.nama.trim(), telepon: tambahPelanggan.telepon.trim() || null, alamat: tambahPelanggan.alamat.trim() || null, catatan: tambahPelanggan.catatan.trim() || null }]);
    if (error) showToast("Gagal tambah pelanggan: " + error.message, "error");
    else { showToast(`✓ Pelanggan "${tambahPelanggan.nama}" ditambahkan!`); setTambahPelanggan(emptyPelangganForm()); setShowTambahPelanggan(false); fetchPelanggan(); }
    setSavingPelanggan(false);
  };

  const saveEditPelanggan = async (id: number) => {
    if (!editPelangganForm.nama.trim()) return showToast("Nama pelanggan wajib diisi!", "error");
    setSavingEditPelanggan(true);
    const { error } = await supabase.from("pelanggan_offline").update({ nama: editPelangganForm.nama.trim(), telepon: editPelangganForm.telepon.trim() || null, alamat: editPelangganForm.alamat.trim() || null, catatan: editPelangganForm.catatan.trim() || null }).eq("id", id);
    if (error) showToast("Gagal update pelanggan: " + error.message, "error");
    else { showToast("✓ Pelanggan berhasil diupdate!"); setEditingPelangganId(null); fetchPelanggan(); }
    setSavingEditPelanggan(false);
  };

  const hapusPelanggan = async (id: number, nama: string) => {
    setDeletingPelangganId(id);
    const { error } = await supabase.from("pelanggan_offline").delete().eq("id", id);
    if (error) showToast("Gagal hapus pelanggan: " + error.message, "error");
    else { showToast(`🗑 Pelanggan "${nama}" dihapus`); setConfirmDeletePelangganId(null); fetchPelanggan(); }
    setDeletingPelangganId(null);
  };

  // ── FILTERED ──
  const produkFiltered = produkList.filter(p => searchProduk === "" || p.nama_produk?.toLowerCase().includes(searchProduk.toLowerCase()) || (p.sku || "").toLowerCase().includes(searchProduk.toLowerCase()));
  const supplierFiltered = supplierList.filter(s => searchSupplier === "" || s.nama?.toLowerCase().includes(searchSupplier.toLowerCase()) || (s.telepon || "").includes(searchSupplier));
  const usersFiltered = users.filter(u => search === "" || u.nama?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()) || u.role?.toLowerCase().includes(search.toLowerCase()));
  const pelangganFiltered = pelangganList.filter(p => searchPelanggan === "" || p.nama?.toLowerCase().includes(searchPelanggan.toLowerCase()) || (p.telepon || "").includes(searchPelanggan));
  const produkBelumDiset = produkList.filter(p => !hargaList.some(h => h.produk_id === p.id));

  // Bahan baku dipakai kemasan (hanya kategori plastik/packaging) — tampilkan semua, user pilih
  const bahanByKategori = bahanBakuList.reduce<Record<string, BahanBaku[]>>((acc, b) => {
    const cat = b.kategori || "Lainnya";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(b);
    return acc;
  }, {});

  // Bahan yang belum ada di preset kemasan produk aktif
  const bahanBelumDiKemasan = bahanBakuList.filter(b => !kemasanList.some(k => k.bahan_baku_id === b.id));

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", background: "rgba(255,255,255,0.04)",
    border: `1.5px solid rgba(232,115,138,0.2)`, borderRadius: 8,
    color: T.text, fontFamily: T.fontSans, fontSize: 13, outline: "none",
    transition: "border-color 0.2s", width: "100%", boxSizing: "border-box",
  };

  const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
    { id: "users", label: "Manajemen User", icon: "⊛" },
    { id: "produk", label: "Master Produk", icon: "📦" },
    { id: "toko", label: "Master Toko", icon: "🏪" },
    { id: "supplier", label: "Master Supplier", icon: "🏭" },
    { id: "pelanggan", label: "Master Pelanggan", icon: "👤" },
  ];

  if (roleLoading || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
      <div style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 13 }}>Memuat...</div>
    </div>
  );

  if (!isOwner) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 48 }}>🔐</div>
        <div style={{ color: T.red, fontFamily: T.fontDisplay, fontSize: 22 }}>Akses Ditolak</div>
        <div style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 13 }}>Halaman ini hanya untuk Owner / Super Admin</div>
        <a href="/dashboard" style={{ color: T.accent, fontFamily: T.fontMono, fontSize: 13 }}>← Kembali ke Dashboard</a>
      </div>
    </Sidebar>
  );

  return (
    <Sidebar>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 2000px; } }
        .data-row:hover { background: rgba(232,115,138,0.03) !important; }
        .btn-edit:hover { background: rgba(167,139,250,0.2) !important; }
        .btn-del:hover { background: rgba(235,87,87,0.2) !important; }
        select option { background: #1a1020; color: #f0e6e9; }
        select optgroup { background: #1a1020; color: #7a6880; font-style: normal; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; }
      `}</style>

      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: "#1a1020", border: `1px solid ${toast.type === "success" ? T.green : toast.type === "error" ? T.red : T.blue}44`, color: toast.type === "success" ? T.green : toast.type === "error" ? T.red : T.blue, borderRadius: 12, padding: "14px 20px", fontFamily: T.fontSans, fontSize: 13, fontWeight: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", maxWidth: 360, animation: "fadeUp 0.2s ease" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: T.fontSans, color: T.text }}>
        {/* SIDE NAV */}
        <nav style={{ width: 220, background: T.sidebar, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", padding: "24px 0", flexShrink: 0 }}>
          <div style={{ padding: "0 20px 20px", borderBottom: `1px solid ${T.border}`, marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 2, textTransform: "uppercase" }}>Azalea ERP</div>
            <div style={{ fontSize: 18, fontFamily: T.fontDisplay, color: T.text, marginTop: 4 }}>Admin Panel</div>
          </div>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setActiveSection(item.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 20px", border: "none", background: activeSection === item.id ? T.accentDim : "transparent", color: activeSection === item.id ? T.accent : T.textDim, cursor: "pointer", fontFamily: T.fontSans, fontSize: 13, fontWeight: activeSection === item.id ? 700 : 400, borderLeft: `3px solid ${activeSection === item.id ? T.accent : "transparent"}`, transition: "all 0.15s", textAlign: "left" }}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <header style={{ padding: "16px 32px", borderBottom: `1px solid ${T.border}`, background: "rgba(12,8,22,0.9)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 100 }}>
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
                          <div className="data-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px 120px 100px", gap: 8, padding: "13px 24px", alignItems: "center", transition: "background 0.15s" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${rInfo.color}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: rInfo.color, fontFamily: T.fontMono, flexShrink: 0 }}>{(user.nama || user.email || "?")[0].toUpperCase()}</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid }}>{user.nama || "—"}</div>
                            </div>
                            <div style={{ fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{user.email}</div>
                            <div><span style={{ padding: "3px 10px", borderRadius: 20, background: `${rInfo.color}20`, color: rInfo.color, fontSize: 11, fontWeight: 700, fontFamily: T.fontMono }}>{rInfo.label}</span></div>
                            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>{tanggalFmt(user.created_at)}</div>
                            <button className="btn-edit" onClick={() => { setEditingId(user.id); setEditRole(user.role); setEditNama(user.nama || ""); }} style={{ background: T.accentDim, border: `1px solid ${T.accent}30`, color: T.accent, padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>Edit</button>
                          </div>
                        ) : (
                          <div style={{ padding: "16px 24px" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                              <div><Label>NAMA</Label><input value={editNama} onChange={e => setEditNama(e.target.value)} style={inputStyle} /></div>
                              <div><Label>ROLE</Label>
                                <select value={editRole} onChange={e => setEditRole(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                </select>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => saveUser(user.id)} disabled={savingId === user.id} style={{ padding: "8px 18px", background: `linear-gradient(135deg, #c94f68, ${T.accent})`, border: "none", color: "#fff", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.fontMono }}>{savingId === user.id ? "..." : "Simpan"}</button>
                              <button onClick={() => setEditingId(null)} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${T.border}`, color: T.textDim, padding: "8px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
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
                      {showTambahProduk ? "✕ Tutup" : "+ Tambah Produk"}
                    </button>
                  </div>
                </div>

                {showTambahProduk && (
                  <div style={{ background: "rgba(232,115,138,0.04)", border: `1px solid ${T.borderStrong}`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, fontFamily: T.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ PRODUK BARU</div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                      <div><Label>NAMA PRODUK *</Label><input value={tambahProduk.nama_produk} onChange={e => setTambahProduk(p => ({ ...p, nama_produk: e.target.value }))} placeholder="Nama produk" style={inputStyle} autoFocus /></div>
                      <div><Label>SKU</Label><input value={tambahProduk.sku} onChange={e => setTambahProduk(p => ({ ...p, sku: e.target.value }))} placeholder="SKU-001" style={{ ...inputStyle, fontFamily: T.fontMono, textTransform: "uppercase" }} /></div>
                      <div><Label>HARGA JUAL *</Label><input value={tambahProduk.harga_jual} onChange={e => setTambahProduk(p => ({ ...p, harga_jual: formatIDR(e.target.value) }))} placeholder="0" style={{ ...inputStyle, fontFamily: T.fontMono }} /></div>
                      <div><Label>STOK AWAL</Label><input type="number" value={tambahProduk.jumlah_stok} onChange={e => setTambahProduk(p => ({ ...p, jumlah_stok: e.target.value }))} placeholder="0" style={{ ...inputStyle, fontFamily: T.fontMono }} /></div>
                      <div><Label>SATUAN</Label>
                        <select value={tambahProduk.satuan} onChange={e => setTambahProduk(p => ({ ...p, satuan: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                          {SATUAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div><Label>BERAT (kg)</Label><input type="number" value={tambahProduk.berat_kg} onChange={e => setTambahProduk(p => ({ ...p, berat_kg: e.target.value }))} placeholder="0.25" step="0.001" min="0" style={{ ...inputStyle, fontFamily: T.fontMono }} /></div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <BtnPrimary onClick={handleTambahProduk} disabled={savingProduk}>{savingProduk ? "Menyimpan..." : "✓ Simpan Produk"}</BtnPrimary>
                      <BtnSecondary onClick={() => setShowTambahProduk(false)}>Batal</BtnSecondary>
                    </div>
                  </div>
                )}

                {/* TABEL PRODUK */}
                <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 1fr 0.7fr 0.8fr 150px", gap: 8, padding: "10px 24px", borderBottom: `1px solid ${T.border}`, background: "rgba(232,115,138,0.04)" }}>
                    {["PRODUK", "SKU", "STOK", "HARGA JUAL", "SATUAN", "BERAT", "AKSI"].map(h => (
                      <div key={h} style={{ fontSize: 10, color: T.textDim, fontFamily: T.fontMono, letterSpacing: 1.5, fontWeight: 700 }}>{h}</div>
                    ))}
                  </div>
                  {produkLoading && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono }}>Memuat...</div>}
                  {!produkLoading && produkFiltered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono }}>Belum ada produk</div>}
                  {!produkLoading && produkFiltered.map(p => (
                    <div key={p.id} style={{ borderBottom: `1px solid ${kemasanPanel === p.id ? T.purple + "40" : T.border}`, transition: "border-color 0.2s" }}>
                      {editingProdukId !== p.id ? (
                        <>
                          <div className="data-row" style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 1fr 0.7fr 0.8fr 150px", gap: 8, padding: "12px 24px", alignItems: "center", transition: "background 0.15s" }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid }}>{p.nama_produk}</div>
                            <div style={{ fontSize: 11, color: p.sku ? T.yellow : T.textDim, fontFamily: T.fontMono }}>{p.sku || "—"}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: p.jumlah_stok > 0 ? T.green : T.red, fontFamily: T.fontMono }}>{p.jumlah_stok}</div>
                            <div style={{ fontSize: 12, color: T.textMid, fontFamily: T.fontMono }}>{rupiahFmt(p.harga_jual)}</div>
                            <div style={{ fontSize: 11, color: T.textDim }}>{p.satuan}</div>
                            <div style={{ fontSize: 12, color: p.berat_kg ? T.blue : T.textDim, fontFamily: T.fontMono }}>{p.berat_kg != null ? `${p.berat_kg} kg` : "—"}</div>
                            <div style={{ display: "flex", gap: 5 }}>
                              {confirmDeleteProdukId === p.id ? (
                                <>
                                  <button onClick={() => hapusProduk(p.id, p.nama_produk)} disabled={deletingProdukId === p.id} style={{ background: T.red, border: "none", color: "#fff", padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>{deletingProdukId === p.id ? "..." : "Hapus"}</button>
                                  <button onClick={() => setConfirmDeleteProdukId(null)} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "5px 7px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                                </>
                              ) : (
                                <>
                                  {/* Tombol preset kemasan */}
                                  <button onClick={() => { bukaKemasanPanel(p.id); setEditingProdukId(null); }} style={{ background: kemasanPanel === p.id ? `${T.purple}30` : `${T.purple}10`, border: `1px solid ${T.purple}40`, color: T.purple, padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 10, fontFamily: T.fontMono, fontWeight: 700, whiteSpace: "nowrap" }}>
                                    🎁 {kemasanPanel === p.id ? "▲" : "▼"}
                                  </button>
                                  <button className="btn-edit" onClick={() => { setEditingProdukId(p.id); setEditProdukForm({ nama_produk: p.nama_produk, sku: p.sku || "", harga_jual: formatIDR(String(p.harga_jual)), jumlah_stok: String(p.jumlah_stok), satuan: p.satuan, berat_kg: p.berat_kg != null ? String(p.berat_kg) : "" }); setShowTambahProduk(false); setKemasanPanel(null); }} style={{ background: `${T.purple}15`, border: `1px solid ${T.purple}30`, color: T.purple, padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>Edit</button>
                                  <button className="btn-del" onClick={() => setConfirmDeleteProdukId(p.id)} style={{ background: `${T.red}15`, border: `1px solid ${T.red}25`, color: T.red, padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>🗑</button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* ── PANEL PRESET KEMASAN ── */}
                          {kemasanPanel === p.id && (
                            <div style={{ borderTop: `1px solid ${T.purple}30`, background: "rgba(167,139,250,0.03)", padding: "16px 24px", animation: "slideDown 0.2s ease" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: T.purple, fontFamily: T.fontMono, letterSpacing: 1, marginBottom: 14 }}>
                                🎁 PRESET KEMASAN — {p.nama_produk}
                                <span style={{ fontSize: 10, color: T.textDim, fontWeight: 400, marginLeft: 8 }}>berat kemasan per unit produk ini (auto pre-fill di form produksi, bisa diedit)</span>
                              </div>

                              {kemasanLoading ? (
                                <div style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 12, marginBottom: 12 }}>Memuat...</div>
                              ) : kemasanList.length === 0 ? (
                                <div style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 12, marginBottom: 12, fontStyle: "italic" }}>Belum ada preset kemasan untuk produk ini</div>
                              ) : (
                                <div style={{ marginBottom: 14 }}>
                                  {kemasanList.map(k => (
                                    <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
                                      <div style={{ flex: 1, fontSize: 12, color: T.textMid, fontWeight: 600 }}>
                                        {k.nama_bahan || `Bahan #${k.bahan_baku_id}`}
                                        <span style={{ fontSize: 10, color: T.textDim, marginLeft: 6 }}>({k.satuan_bahan})</span>
                                      </div>
                                      {editingKemasanId === k.id ? (
                                        <>
                                          <input
                                            type="number"
                                            value={editKemasanBerat}
                                            onChange={e => setEditKemasanBerat(e.target.value)}
                                            placeholder="gram"
                                            step="0.1"
                                            style={{ ...inputStyle, width: 100, fontFamily: T.fontMono, fontSize: 12 }}
                                            autoFocus
                                            onKeyDown={e => e.key === "Enter" && updatePresetKemasan(k.id, p.id)}
                                          />
                                          <span style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono }}>gr</span>
                                          <button onClick={() => updatePresetKemasan(k.id, p.id)} style={{ padding: "5px 12px", background: T.green + "20", border: `1px solid ${T.green}40`, color: T.green, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>✓</button>
                                          <button onClick={() => setEditingKemasanId(null)} style={{ padding: "5px 8px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                                        </>
                                      ) : (
                                        <>
                                          <div style={{ fontSize: 13, fontWeight: 700, color: T.orange, fontFamily: T.fontMono, minWidth: 80, textAlign: "right" }}>{k.berat_gram} gr</div>
                                          <button onClick={() => { setEditingKemasanId(k.id); setEditKemasanBerat(String(k.berat_gram)); }} style={{ padding: "4px 10px", background: `${T.purple}15`, border: `1px solid ${T.purple}30`, color: T.purple, borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: T.fontMono, fontWeight: 700 }}>Edit</button>
                                          <button onClick={() => hapusPresetKemasan(k.id, p.id)} style={{ padding: "4px 8px", background: `${T.red}15`, border: `1px solid ${T.red}25`, color: T.red, borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: T.fontMono, fontWeight: 700 }}>🗑</button>
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Form tambah kemasan baru */}
                              {bahanBelumDiKemasan.length > 0 ? (
                                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                                  <div style={{ flex: 2 }}>
                                    <Label>BAHAN KEMASAN {bahanBakuLoading ? "(memuat...)" : ""}</Label>
                                    <select value={newKemasanBahanId} onChange={e => setNewKemasanBahanId(e.target.value)} style={{ ...inputStyle, fontSize: 12, cursor: "pointer" }}>
                                      <option value="">— Pilih Bahan —</option>
                                      {Object.entries(bahanByKategori).map(([kat, items]) => (
                                        <optgroup key={kat} label={kat}>
                                          {items.filter(b => !kemasanList.some(k => k.bahan_baku_id === b.id)).map(b => (
                                            <option key={b.id} value={b.id}>{b.nama} ({b.satuan})</option>
                                          ))}
                                        </optgroup>
                                      ))}
                                    </select>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <Label>BERAT (gram)</Label>
                                    <input
                                      type="number"
                                      value={newKemasanBeratGram}
                                      onChange={e => setNewKemasanBeratGram(e.target.value)}
                                      placeholder="0"
                                      step="0.1"
                                      min="0"
                                      style={{ ...inputStyle, fontFamily: T.fontMono, fontSize: 12 }}
                                      onKeyDown={e => e.key === "Enter" && simpanPresetKemasan(p.id)}
                                    />
                                  </div>
                                  <button onClick={() => simpanPresetKemasan(p.id)} disabled={savingKemasan} style={{ padding: "8px 16px", background: `linear-gradient(135deg, #7c3aed, ${T.purple})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.fontMono, whiteSpace: "nowrap", marginBottom: 1 }}>
                                    {savingKemasan ? "..." : "+ Simpan"}
                                  </button>
                                </div>
                              ) : kemasanList.length > 0 ? (
                                <div style={{ fontSize: 11, color: T.green, fontFamily: T.fontMono }}>✓ Semua bahan kemasan sudah diset untuk produk ini</div>
                              ) : (
                                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                                  <div style={{ flex: 2 }}>
                                    <Label>BAHAN KEMASAN {bahanBakuLoading ? "(memuat...)" : ""}</Label>
                                    <select value={newKemasanBahanId} onChange={e => setNewKemasanBahanId(e.target.value)} style={{ ...inputStyle, fontSize: 12, cursor: "pointer" }}>
                                      <option value="">— Pilih Bahan —</option>
                                      {Object.entries(bahanByKategori).map(([kat, items]) => (
                                        <optgroup key={kat} label={kat}>
                                          {items.map(b => (
                                            <option key={b.id} value={b.id}>{b.nama} ({b.satuan})</option>
                                          ))}
                                        </optgroup>
                                      ))}
                                    </select>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <Label>BERAT (gram)</Label>
                                    <input type="number" value={newKemasanBeratGram} onChange={e => setNewKemasanBeratGram(e.target.value)} placeholder="0" step="0.1" min="0" style={{ ...inputStyle, fontFamily: T.fontMono, fontSize: 12 }} onKeyDown={e => e.key === "Enter" && simpanPresetKemasan(p.id)} />
                                  </div>
                                  <button onClick={() => simpanPresetKemasan(p.id)} disabled={savingKemasan} style={{ padding: "8px 16px", background: `linear-gradient(135deg, #7c3aed, ${T.purple})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.fontMono, whiteSpace: "nowrap", marginBottom: 1 }}>
                                    {savingKemasan ? "..." : "+ Simpan"}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ padding: "14px 24px", background: "rgba(167,139,250,0.04)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                            <input value={editProdukForm.nama_produk} onChange={e => setEditProdukForm(f => ({ ...f, nama_produk: e.target.value }))} placeholder="Nama produk" style={inputStyle} autoFocus />
                            <input value={editProdukForm.sku} onChange={e => setEditProdukForm(f => ({ ...f, sku: e.target.value }))} placeholder="SKU" style={{ ...inputStyle, fontFamily: T.fontMono, textTransform: "uppercase" }} />
                            <input value={editProdukForm.harga_jual} onChange={e => setEditProdukForm(f => ({ ...f, harga_jual: formatIDR(e.target.value) }))} placeholder="Harga" style={{ ...inputStyle, fontFamily: T.fontMono }} />
                            <input type="number" value={editProdukForm.jumlah_stok} onChange={e => setEditProdukForm(f => ({ ...f, jumlah_stok: e.target.value }))} placeholder="Stok" style={{ ...inputStyle, fontFamily: T.fontMono }} />
                            <select value={editProdukForm.satuan} onChange={e => setEditProdukForm(f => ({ ...f, satuan: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                              {SATUAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <div>
                              <Label>BERAT (kg)</Label>
                              <input type="number" value={editProdukForm.berat_kg} onChange={e => setEditProdukForm(f => ({ ...f, berat_kg: e.target.value }))} placeholder="0.25" step="0.001" min="0" style={{ ...inputStyle, fontFamily: T.fontMono }} />
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => saveEditProduk(p.id)} disabled={savingEditProduk} style={{ padding: "8px 18px", background: `linear-gradient(135deg, #7c3aed, ${T.purple})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.fontMono }}>{savingEditProduk ? "..." : "✓ Simpan"}</button>
                            <button onClick={() => setEditingProdukId(null)} style={{ padding: "9px 16px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16, background: `${T.purple}08`, border: `1px solid ${T.purple}20`, borderRadius: 10, padding: "14px 20px", fontSize: 12, color: T.purple, fontFamily: T.fontMono }}>
                  📦 <strong>SKU</strong> sesuai kolom SKU Induk di Excel Shopee. &nbsp;·&nbsp;
                  ⚖ <strong>Berat</strong> wajib diisi — dipakai untuk hitung HPP/unit di produksi. &nbsp;·&nbsp;
                  🎁 <strong>Preset Kemasan</strong> (tombol 🎁) — set berat plastik per unit, auto pre-fill di form produksi.
                </div>
              </div>
            )}

            {/* ══ MASTER TOKO ══ */}
            {activeSection === "toko" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 22, color: T.text, fontWeight: 400 }}>Master Toko Online</h2>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{tokoList.length} toko · {tokoList.filter(t => t.aktif).length} aktif</p>
                  </div>
                  <button onClick={() => { setShowTambahToko(v => !v); setTambahToko(emptyTokoForm()); setEditingTokoId(null); }} style={{ padding: "9px 18px", background: showTambahToko ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, #c94f68, ${T.accent})`, border: showTambahToko ? `1px solid ${T.border}` : "none", color: showTambahToko ? T.textDim : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: T.fontMono, whiteSpace: "nowrap" }}>
                    {showTambahToko ? "✕ Batal" : "+ Tambah Toko"}
                  </button>
                </div>
                {showTambahToko && (
                  <div style={{ background: "rgba(232,115,138,0.04)", border: `1px solid ${T.borderStrong}`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, fontFamily: T.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ TOKO BARU</div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                      <div><Label>NAMA TOKO *</Label><input value={tambahToko.nama} onChange={e => setTambahToko(f => ({ ...f, nama: e.target.value }))} placeholder="Nama toko" style={inputStyle} autoFocus /></div>
                      <div><Label>PLATFORM</Label>
                        <select value={tambahToko.platform} onChange={e => setTambahToko(f => ({ ...f, platform: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                          {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
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
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {tokoLoading && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono }}>Memuat...</div>}
                  {!tokoLoading && tokoList.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono }}>Belum ada toko</div>}
                  {!tokoLoading && tokoList.map(t => (
                    <div key={t.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                      {editingTokoId !== t.id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px" }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: `${PLATFORM_COLORS[t.platform] || T.textDim}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🏪</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{t.nama}</div>
                            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: `${PLATFORM_COLORS[t.platform] || T.textDim}20`, color: PLATFORM_COLORS[t.platform] || T.textDim, fontWeight: 600 }}>{t.platform}</span>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, background: t.aktif ? `${T.green}15` : `${T.red}15`, color: t.aktif ? T.green : T.red, fontWeight: 600 }}>{t.aktif ? "Aktif" : "Nonaktif"}</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => toggleAktifToko(t.id, t.aktif)} style={{ padding: "6px 12px", background: t.aktif ? `${T.red}15` : `${T.green}15`, border: `1px solid ${t.aktif ? T.red : T.green}30`, color: t.aktif ? T.red : T.green, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 600 }}>{t.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                            <button className="btn-edit" onClick={() => { setEditingTokoId(t.id); setEditTokoForm({ nama: t.nama, platform: t.platform, aktif: t.aktif }); setShowTambahToko(false); }} style={{ background: `${T.purple}15`, border: `1px solid ${T.purple}30`, color: T.purple, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>Edit</button>
                            {confirmDeleteTokoId === t.id ? (
                              <>
                                <button onClick={() => hapusToko(t.id, t.nama)} disabled={deletingTokoId === t.id} style={{ background: T.red, border: "none", color: "#fff", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>{deletingTokoId === t.id ? "..." : "Hapus"}</button>
                                <button onClick={() => setConfirmDeleteTokoId(null)} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                              </>
                            ) : (
                              <button className="btn-del" onClick={() => setConfirmDeleteTokoId(t.id)} style={{ background: `${T.red}15`, border: `1px solid ${T.red}25`, color: T.red, padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>🗑</button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: "16px 20px", background: "rgba(167,139,250,0.04)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                            <div><Label>NAMA TOKO</Label><input value={editTokoForm.nama} onChange={e => setEditTokoForm(f => ({ ...f, nama: e.target.value }))} style={inputStyle} autoFocus /></div>
                            <div><Label>PLATFORM</Label>
                              <select value={editTokoForm.platform} onChange={e => setEditTokoForm(f => ({ ...f, platform: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                                {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </div>
                            <div><Label>STATUS</Label>
                              <div style={{ display: "flex", gap: 8 }}>
                                {[{ val: true, label: "Aktif" }, { val: false, label: "Nonaktif" }].map(opt => (
                                  <button key={String(opt.val)} onClick={() => setEditTokoForm(f => ({ ...f, aktif: opt.val }))} style={{ flex: 1, padding: "8px", border: `1px solid ${editTokoForm.aktif === opt.val ? (opt.val ? T.green : T.red) : T.border}`, borderRadius: 8, background: editTokoForm.aktif === opt.val ? (opt.val ? `${T.green}15` : `${T.red}15`) : "transparent", color: editTokoForm.aktif === opt.val ? (opt.val ? T.green : T.red) : T.textDim, cursor: "pointer", fontSize: 12, fontFamily: T.fontSans, fontWeight: 600 }}>{opt.label}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => saveEditToko(t.id)} disabled={savingEditToko} style={{ flex: 1, padding: "9px", background: `linear-gradient(135deg, #7c3aed, ${T.purple})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.fontMono }}>{savingEditToko ? "..." : "✓ Simpan"}</button>
                            <button onClick={() => setEditingTokoId(null)} style={{ padding: "9px 14px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
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
                            <div style={{ fontSize: 12, color: T.textDim }}>{s.catatan || "—"}</div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn-edit" onClick={() => { setEditingSupplierId(s.id); setEditSupplierForm({ nama: s.nama, telepon: s.telepon || "", alamat: s.alamat || "", catatan: s.catatan || "" }); setShowTambahSupplier(false); setConfirmDeleteSupplierId(null); }} style={{ background: `${T.purple}15`, border: `1px solid ${T.purple}30`, color: T.purple, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>Edit</button>
                              <button className="btn-del" onClick={() => setConfirmDeleteSupplierId(confirmDeleteSupplierId === s.id ? null : s.id)} style={{ background: `${T.red}15`, border: `1px solid ${T.red}25`, color: T.red, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>Hapus</button>
                            </div>
                          </div>
                          {confirmDeleteSupplierId === s.id && (
                            <div style={{ padding: "10px 24px 14px", background: `${T.red}08`, borderTop: `1px solid ${T.red}20`, display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ fontSize: 12, color: T.red, fontFamily: T.fontMono }}>⚠ Hapus supplier "{s.nama}"?</span>
                              <button onClick={() => hapusSupplier(s.id, s.nama)} disabled={deletingSupplierId === s.id} style={{ background: T.red, border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono, fontWeight: 700 }}>{deletingSupplierId === s.id ? "..." : "Ya, Hapus"}</button>
                              <button onClick={() => setConfirmDeleteSupplierId(null)} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ padding: "14px 24px", background: "rgba(96,165,250,0.04)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                            <input value={editSupplierForm.nama} onChange={e => setEditSupplierForm(f => ({ ...f, nama: e.target.value }))} placeholder="Nama supplier *" style={inputStyle} autoFocus />
                            <input value={editSupplierForm.telepon} onChange={e => setEditSupplierForm(f => ({ ...f, telepon: e.target.value }))} placeholder="Telepon" style={{ ...inputStyle, fontFamily: T.fontMono }} />
                          </div>
                          <input value={editSupplierForm.alamat} onChange={e => setEditSupplierForm(f => ({ ...f, alamat: e.target.value }))} placeholder="Alamat" style={{ ...inputStyle, marginBottom: 10 }} />
                          <textarea value={editSupplierForm.catatan} onChange={e => setEditSupplierForm(f => ({ ...f, catatan: e.target.value }))} placeholder="Catatan" rows={2} style={{ ...inputStyle, marginBottom: 12, fontFamily: T.fontSans }} />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => saveEditSupplier(s.id)} disabled={savingEditSupplier} style={{ padding: "9px 20px", background: `linear-gradient(135deg, #c94f68, ${T.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: T.fontMono }}>{savingEditSupplier ? "..." : "✓ Simpan"}</button>
                            <button onClick={() => setEditingSupplierId(null)} style={{ padding: "9px 14px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ══ MASTER PELANGGAN ══ */}
            {activeSection === "pelanggan" && (
              <div style={{ animation: "fadeUp 0.3s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: T.fontDisplay, fontSize: 22, color: T.text, fontWeight: 400 }}>Master Pelanggan Offline</h2>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: T.textDim, fontFamily: T.fontMono }}>{pelangganList.length} pelanggan terdaftar</p>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input value={searchPelanggan} onChange={e => setSearchPelanggan(e.target.value)} placeholder="🔍 Cari nama atau telepon..." style={{ ...inputStyle, width: 220 }} />
                    <button onClick={() => { setShowTambahPelanggan(v => !v); setTambahPelanggan(emptyPelangganForm()); setEditingPelangganId(null); }} style={{ padding: "9px 18px", background: showTambahPelanggan ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, #c94f68, ${T.accent})`, border: showTambahPelanggan ? `1px solid ${T.border}` : "none", color: showTambahPelanggan ? T.textDim : "#fff", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: T.fontMono, whiteSpace: "nowrap" }}>
                      {showTambahPelanggan ? "✕ Tutup" : "+ Tambah Pelanggan"}
                    </button>
                  </div>
                </div>
                {showTambahPelanggan && (
                  <div style={{ background: "rgba(232,115,138,0.04)", border: `1px solid ${T.borderStrong}`, borderRadius: 14, padding: 24, marginBottom: 20, animation: "slideDown 0.2s ease" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, fontFamily: T.fontMono, marginBottom: 16, letterSpacing: 1 }}>+ PELANGGAN BARU</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div><Label>NAMA *</Label><input value={tambahPelanggan.nama} onChange={e => setTambahPelanggan(p => ({ ...p, nama: e.target.value }))} placeholder="Nama pelanggan" style={inputStyle} autoFocus /></div>
                      <div><Label>NO. TELEPON</Label><input value={tambahPelanggan.telepon} onChange={e => setTambahPelanggan(p => ({ ...p, telepon: e.target.value }))} placeholder="08xx-xxxx-xxxx" style={{ ...inputStyle, fontFamily: T.fontMono }} /></div>
                    </div>
                    <div style={{ marginBottom: 12 }}><Label>ALAMAT</Label><input value={tambahPelanggan.alamat} onChange={e => setTambahPelanggan(p => ({ ...p, alamat: e.target.value }))} placeholder="Alamat pengiriman (opsional)" style={inputStyle} /></div>
                    <div style={{ marginBottom: 14 }}><Label>CATATAN</Label><input value={tambahPelanggan.catatan} onChange={e => setTambahPelanggan(p => ({ ...p, catatan: e.target.value }))} placeholder="Catatan khusus (opsional)" style={inputStyle} /></div>
                    <div style={{ display: "flex", gap: 8 }}><BtnPrimary onClick={handleTambahPelanggan} disabled={savingPelanggan}>{savingPelanggan ? "Menyimpan..." : "✓ Simpan Pelanggan"}</BtnPrimary><BtnSecondary onClick={() => setShowTambahPelanggan(false)}>Batal</BtnSecondary></div>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pelangganLoading && <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono }}>Memuat...</div>}
                  {!pelangganLoading && pelangganFiltered.length === 0 && (
                    <div style={{ padding: 40, textAlign: "center", color: T.textDim, fontFamily: T.fontMono }}>{searchPelanggan ? "Tidak ada hasil" : "Belum ada pelanggan"}</div>
                  )}
                  {!pelangganLoading && pelangganFiltered.map(p => (
                    <div key={p.id} style={{ background: T.bgCard, border: `1px solid ${hargaPanel === p.id ? "rgba(167,139,250,0.4)" : T.border}`, borderRadius: 12, overflow: "hidden", transition: "border-color 0.2s" }}>
                      {editingPelangganId !== p.id ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 20px" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: T.textMid }}>{p.nama}</div>
                            <div style={{ fontSize: 11, color: T.textDim, fontFamily: T.fontMono, marginTop: 2 }}>{p.telepon || "—"} {p.alamat ? `· ${p.alamat}` : ""}</div>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => bukaHargaPanel(p.id)} style={{ padding: "5px 12px", background: hargaPanel === p.id ? `${T.purple}25` : `${T.purple}10`, border: `1px solid ${T.purple}40`, color: T.purple, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>
                              💰 Harga {hargaPanel === p.id ? "▲" : "▼"}
                            </button>
                            <button className="btn-edit" onClick={() => { setEditingPelangganId(p.id); setEditPelangganForm({ nama: p.nama, telepon: p.telepon || "", alamat: p.alamat || "", catatan: p.catatan || "" }); setShowTambahPelanggan(false); setConfirmDeletePelangganId(null); setHargaPanel(null); }} style={{ background: `${T.purple}15`, border: `1px solid ${T.purple}30`, color: T.purple, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>Edit</button>
                            <button className="btn-del" onClick={() => setConfirmDeletePelangganId(confirmDeletePelangganId === p.id ? null : p.id)} style={{ background: `${T.red}15`, border: `1px solid ${T.red}25`, color: T.red, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>Hapus</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: "14px 20px", background: "rgba(96,165,250,0.04)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                            <input value={editPelangganForm.nama} onChange={e => setEditPelangganForm(f => ({ ...f, nama: e.target.value }))} placeholder="Nama pelanggan *" style={inputStyle} autoFocus />
                            <input value={editPelangganForm.telepon} onChange={e => setEditPelangganForm(f => ({ ...f, telepon: e.target.value }))} placeholder="Telepon" style={{ ...inputStyle, fontFamily: T.fontMono }} />
                          </div>
                          <input value={editPelangganForm.alamat} onChange={e => setEditPelangganForm(f => ({ ...f, alamat: e.target.value }))} placeholder="Alamat" style={{ ...inputStyle, marginBottom: 10 }} />
                          <input value={editPelangganForm.catatan} onChange={e => setEditPelangganForm(f => ({ ...f, catatan: e.target.value }))} placeholder="Catatan" style={{ ...inputStyle, marginBottom: 12 }} />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => saveEditPelanggan(p.id)} disabled={savingEditPelanggan} style={{ padding: "9px 20px", background: `linear-gradient(135deg, #c94f68, ${T.accent})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: T.fontMono }}>{savingEditPelanggan ? "..." : "✓ Simpan"}</button>
                            <button onClick={() => setEditingPelangganId(null)} style={{ padding: "9px 14px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                          </div>
                        </div>
                      )}
                      {confirmDeletePelangganId === p.id && (
                        <div style={{ padding: "10px 20px 14px", background: `${T.red}08`, borderTop: `1px solid ${T.red}20`, display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 12, color: T.red, fontFamily: T.fontMono }}>⚠ Hapus "{p.nama}"?</span>
                          <button onClick={() => hapusPelanggan(p.id, p.nama)} disabled={deletingPelangganId === p.id} style={{ background: T.red, border: "none", color: "#fff", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono, fontWeight: 700 }}>{deletingPelangganId === p.id ? "..." : "Ya, Hapus"}</button>
                          <button onClick={() => setConfirmDeletePelangganId(null)} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: T.fontMono }}>Batal</button>
                        </div>
                      )}
                      {hargaPanel === p.id && (
                        <div style={{ borderTop: `1px solid ${T.purple}30`, background: "rgba(167,139,250,0.04)", padding: "16px 20px", animation: "slideDown 0.2s ease" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.purple, fontFamily: T.fontMono, letterSpacing: 1, marginBottom: 14 }}>
                            💰 HARGA KHUSUS — {p.nama}
                            <span style={{ fontSize: 10, color: T.textDim, fontWeight: 400, marginLeft: 8 }}>kalau tidak diset, pakai harga master</span>
                          </div>
                          {hargaLoading ? (
                            <div style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 12, marginBottom: 12 }}>Memuat...</div>
                          ) : hargaList.length === 0 ? (
                            <div style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 12, marginBottom: 12, fontStyle: "italic" }}>Belum ada harga khusus — semua produk pakai harga master</div>
                          ) : (
                            <div style={{ marginBottom: 14 }}>
                              {hargaList.map(h => (
                                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
                                  <div style={{ flex: 1, fontSize: 12, color: T.textMid, fontWeight: 600 }}>{h.nama_produk || `Produk #${h.produk_id}`}</div>
                                  {editingHargaId === h.id ? (
                                    <>
                                      <input value={editHargaNilai} onChange={e => setEditHargaNilai(formatIDR(e.target.value))} style={{ ...inputStyle, width: 140, fontFamily: T.fontMono, fontSize: 12 }} autoFocus onKeyDown={e => e.key === "Enter" && updateHarga(h.id, p.id)} />
                                      <button onClick={() => updateHarga(h.id, p.id)} style={{ padding: "5px 12px", background: T.green + "20", border: `1px solid ${T.green}40`, color: T.green, borderRadius: 6, cursor: "pointer", fontSize: 11, fontFamily: T.fontMono, fontWeight: 700 }}>✓</button>
                                      <button onClick={() => setEditingHargaId(null)} style={{ padding: "5px 8px", background: "transparent", border: `1px solid ${T.border}`, color: T.textDim, borderRadius: 6, cursor: "pointer", fontSize: 11 }}>✕</button>
                                    </>
                                  ) : (
                                    <>
                                      <div style={{ fontSize: 13, fontWeight: 700, color: T.yellow, fontFamily: T.fontMono, minWidth: 120, textAlign: "right" }}>{rupiahFmt(h.harga)}</div>
                                      <button onClick={() => { setEditingHargaId(h.id); setEditHargaNilai(formatIDR(String(h.harga))); }} style={{ padding: "4px 10px", background: `${T.purple}15`, border: `1px solid ${T.purple}30`, color: T.purple, borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: T.fontMono, fontWeight: 700 }}>Edit</button>
                                      <button onClick={() => hapusHarga(h.id, p.id)} style={{ padding: "4px 8px", background: `${T.red}15`, border: `1px solid ${T.red}25`, color: T.red, borderRadius: 5, cursor: "pointer", fontSize: 10, fontFamily: T.fontMono, fontWeight: 700 }}>🗑</button>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {produkBelumDiset.length > 0 && (
                            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                              <div style={{ flex: 2 }}>
                                <Label>PRODUK</Label>
                                <select value={hargaProdukId} onChange={e => setHargaProdukId(e.target.value)} style={{ ...inputStyle, fontSize: 12 }}>
                                  <option value="">— Pilih Produk —</option>
                                  {produkBelumDiset.map(pr => <option key={pr.id} value={pr.id}>{pr.nama_produk} (master: {rupiahFmt(pr.harga_jual)})</option>)}
                                </select>
                              </div>
                              <div style={{ flex: 1 }}>
                                <Label>HARGA KHUSUS</Label>
                                <input value={hargaNilai} onChange={e => setHargaNilai(formatIDR(e.target.value))} placeholder="0" style={{ ...inputStyle, fontFamily: T.fontMono, fontSize: 12 }} onKeyDown={e => e.key === "Enter" && simpanHarga(p.id)} />
                              </div>
                              <button onClick={() => simpanHarga(p.id)} disabled={savingHarga} style={{ padding: "8px 16px", background: `linear-gradient(135deg, #7c3aed, ${T.purple})`, border: "none", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: T.fontMono, whiteSpace: "nowrap", marginBottom: 1 }}>
                                {savingHarga ? "..." : "+ Simpan"}
                              </button>
                            </div>
                          )}
                          {produkBelumDiset.length === 0 && hargaList.length > 0 && (
                            <div style={{ fontSize: 11, color: T.green, fontFamily: T.fontMono }}>✓ Semua produk sudah diset harga khusus</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </Sidebar>
  );
}
