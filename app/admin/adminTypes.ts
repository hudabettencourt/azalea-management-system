// ── Shared Types ──
export type Profile = { id: string; email: string; nama: string; role: string; created_at: string };
export type Produk = { id: number; nama_produk: string; sku: string | null; jumlah_stok: number; harga_jual: number; satuan: string; berat_kg: number | null; stok_minimum: number | null };
export type BahanBakuFull = { id: number; nama: string; satuan: string; kategori: string; stok: number; harga_beli_avg: number; aktif: boolean | null; updated_at: string | null };
export type BahanBakuRef = { id: number; nama: string; satuan: string; kategori: string };
export type PresetKemasan = { id: number; stok_barang_id: number; bahan_baku_id: number; berat_gram: number; nama_bahan?: string; satuan_bahan?: string };
export type Toko = { 
  id: number; nama: string; platform: string; aktif: boolean; created_at: string;
  username_shopee?: string | null;
  shopee_shop_id?: number | null;
  shopee_access_token?: string | null;
  shopee_refresh_token?: string | null;
  shopee_token_expire_at?: string | null;
  shopee_authorized_at?: string | null;
};
export type Supplier = { id: number; nama: string; telepon: string | null; alamat: string | null; catatan: string | null; created_at: string };
export type Pelanggan = { id: number; nama: string; telepon: string | null; alamat: string | null; catatan: string | null; created_at: string };
export type HargaKhusus = { id: number; pelanggan_id: number; produk_id: number; harga: number; nama_produk?: string };
export type VarianBorongan = { id: number; nama: string; tarif_per_kg: number; aktif: boolean; created_at: string };
export type PluBorongan = { id: number; nomor_plu: number; karyawan_id: number; varian_id: number; aktif: boolean; created_at: string; nama_karyawan?: string; nama_varian?: string; tarif_per_kg?: number };
export type Karyawan = { id: number; nama: string; tipe: string; status: string };
export type Toast = { msg: string; type: "success" | "error" | "info" };

// ── Shared Constants ──
export const SATUAN_OPTIONS = ["pcs", "kg", "gr", "pack", "box", "lusin", "bal", "set", "botol", "sachet"];
export const SATUAN_BAHAN_OPTIONS = ["kg", "liter", "pack", "pcs", "roll", "karung", "lusin", "box", "gram", "ml"];
export const KATEGORI_BAHAN_OPTIONS = ["Bahan Baku", "Bahan Penolong", "Packaging"];
export const PLATFORM_OPTIONS = ["Shopee", "TikTok", "Lazada", "Tokopedia", "Website", "Offline", "Lainnya"];
export const PLATFORM_COLORS: Record<string, string> = {
  Shopee: "#f97316", TikTok: "#a78bfa", Lazada: "#60a5fa",
  Tokopedia: "#34d399", Website: "#e8738a", Offline: "#f2c94c", Lainnya: "#7a6880",
};
export const ROLES = [
  { value: "owner", label: "Owner", color: "#e8738a", desc: "Akses penuh semua modul" },
  { value: "super_admin", label: "Super Admin", color: "#c94f68", desc: "Akses penuh + approve void" },
  { value: "keuangan", label: "Keuangan", color: "#60a5fa", desc: "Dashboard, kas, laporan keuangan" },
  { value: "purchasing", label: "Purchasing", color: "#f2c94c", desc: "Pembelian bahan & reseller" },
  { value: "produksi", label: "Produksi", color: "#6fcf97", desc: "Input produksi & stok bahan" },
  { value: "kasir", label: "Kasir", color: "#8b5cf6", desc: "Input penjualan & potong stok" },
  { value: "admin_penjualan", label: "Admin Penjualan", color: "#f59e0b", desc: "Kelola penjualan & laporan sales" },
];

// ── Shared Helpers ──
export const rupiahFmt = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;
export const formatIDR = (val: string) => val.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const toAngka = (str: string) => parseInt(str.replace(/\./g, "")) || 0;
export const tanggalFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
export const tanggalJamFmt = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
export const roleInfo = (role: string) => ROLES.find(r => r.value === role) || { label: role, color: "#7a6880", desc: "" };
