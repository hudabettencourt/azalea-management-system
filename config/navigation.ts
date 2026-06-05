// /config/navigation.ts
// Konfigurasi navigasi terpusat untuk AppShell Azalea
// Semua perubahan navigasi cukup di sini, tidak perlu edit AppShell

export type NavItem = {
  label: string;
  href: string;
  badge?: "count" | "dot"; // count = angka dari API, dot = titik merah
  badgeKey?: string;       // key untuk fetch badge count
  roles?: string[];        // kalau kosong = semua role bisa akses
};

export type NavGroup = {
  label: string;
  items: NavItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
};

export type NavModule = {
  key: string;
  label: string;
  icon: string; // nama icon Tabler tanpa "Icon" prefix, e.g. "ShoppingBag"
  groups: NavGroup[];
  roles?: string[];
};

export const NAVIGATION: NavModule[] = [
  // ─── SHOPEE ───────────────────────────────────────────────────────────────
  {
    key: "shopee",
    label: "Shopee",
    icon: "ShoppingBag",
    groups: [
      {
        label: "Pesanan",
        defaultOpen: true,
        items: [
          { label: "Menunggu Diproses", href: "/shopee/pesanan?status=to_process", badge: "count", badgeKey: "shopee_to_process" },
          { label: "Menunggu Dicetak",  href: "/shopee/pesanan?status=to_print",   badge: "count", badgeKey: "shopee_to_print" },
          { label: "Menunggu Pickup",   href: "/shopee/pesanan?status=to_pickup" },
          { label: "Pesanan Dikirim",   href: "/shopee/pesanan?status=shipped",    badge: "count", badgeKey: "shopee_shipped" },
          { label: "Pesanan Selesai",   href: "/shopee/pesanan?status=completed" },
          { label: "Pesanan Dibatalkan",href: "/shopee/pesanan?status=cancelled" },
          { label: "Semua Pesanan",     href: "/shopee/pesanan" },
        ],
      },
      {
        label: "Purna Jual",
        items: [
          { label: "Proses Retur",      href: "/shopee/retur" },
          { label: "Hasil Retur",       href: "/shopee/retur/hasil" },
          { label: "Pengembalian Dana", href: "/shopee/retur/dana" },
        ],
      },
      {
        label: "Produk",
        items: [
          { label: "Live",             href: "/shopee/produk/live" },
          { label: "Draft",            href: "/shopee/produk/draft" },
          { label: "Naikkan Produk",   href: "/shopee/produk/boost" },
        ],
      },
      {
        label: "Promosi",
        items: [
          { label: "Voucher & Diskon", href: "/shopee/promosi" },
          { label: "Flash Sale",       href: "/shopee/promosi/flash-sale" },
        ],
      },
      {
        label: "Packing & WMS",
        items: [
          { label: "Rekap Packing",    href: "/shopee/packing" },
          { label: "Scan & Bungkus",   href: "/shopee/packing/scan-bungkus" },
          { label: "Scan & Kirim",     href: "/shopee/packing/scan-kirim" },
        ],
      },
      {
        label: "Keuangan",
        items: [
          { label: "Rekap Saldo",      href: "/shopee/keuangan" },
          { label: "Uang di Jalan",    href: "/shopee/keuangan/pending" },
          { label: "Pencairan",        href: "/shopee/keuangan/pencairan" },
        ],
      },
      {
        label: "Laporan Shopee",
        items: [
          { label: "Laporan Pesanan",  href: "/shopee/laporan/pesanan" },
          { label: "Laporan per SKU",  href: "/shopee/laporan/sku" },
          { label: "Laporan per Toko", href: "/shopee/laporan/toko" },
        ],
      },
      {
        label: "Pelanggan",
        items: [
          { label: "Pelanggan Shopee", href: "/shopee/pelanggan" },
          { label: "Blacklist",        href: "/shopee/pelanggan/blacklist" },
        ],
      },
    ],
  },

  // ─── PRODUKSI ─────────────────────────────────────────────────────────────
  {
    key: "produksi",
    label: "Produksi",
    icon: "Tool",
    groups: [
      {
        label: "Produksi",
        defaultOpen: true,
        items: [
          { label: "Batch Produksi",   href: "/produksi" },
          { label: "HPP per Batch",    href: "/produksi/hpp" },
          { label: "Bahan Baku",       href: "/produksi/bahan" },
        ],
      },
      {
        label: "Timbangan",
        items: [
          { label: "Input Borongan",   href: "/produksi/borongan" },
          { label: "Rekap Borongan",   href: "/produksi/borongan/rekap" },
        ],
      },
    ],
  },

  // ─── PEMBELIAN ────────────────────────────────────────────────────────────
  {
    key: "pembelian",
    label: "Pembelian",
    icon: "Truck",
    groups: [
      {
        label: "Bahan Baku",
        defaultOpen: true,
        items: [
          { label: "Daftar Pembelian", href: "/pembelian-bahan" },
          { label: "Purchase Order",   href: "/pembelian-bahan/po" },
          { label: "Supplier Bahan",   href: "/pembelian-bahan/supplier" },
        ],
      },
      {
        label: "Produk Jadi",
        items: [
          { label: "Daftar Pembelian", href: "/pembelian" },
          { label: "Purchase Order",   href: "/pembelian/po" },
          { label: "Supplier Produk",  href: "/pembelian/supplier" },
        ],
      },
      {
        label: "Reorder Alert",
        items: [
          { label: "Saran Pembelian",  href: "/pembelian/reorder" },
        ],
      },
    ],
  },

  // ─── PENGGAJIAN ───────────────────────────────────────────────────────────
  {
    key: "penggajian",
    label: "Penggajian",
    icon: "Users",
    groups: [
      {
        label: "Gaji",
        defaultOpen: true,
        items: [
          { label: "Gaji Harian",      href: "/penggajian" },
          { label: "Gaji Borongan",    href: "/penggajian/borongan" },
          { label: "Rekap Penggajian", href: "/penggajian/rekap" },
        ],
      },
      {
        label: "Karyawan",
        items: [
          { label: "Data Karyawan",    href: "/admin?tab=karyawan" },
        ],
      },
    ],
  },

  // ─── KEUANGAN ─────────────────────────────────────────────────────────────
  {
    key: "keuangan",
    label: "Keuangan",
    icon: "Wallet",
    groups: [
      {
        label: "Kas",
        defaultOpen: true,
        items: [
          { label: "Kas Masuk/Keluar", href: "/kas" },
          { label: "Fee Platform",     href: "/fee-platform" },
          { label: "Rekap Saldo",      href: "/rekap-saldo" },
        ],
      },
      {
        label: "Piutang",
        items: [
          { label: "Piutang Offline",  href: "/piutang" },
          { label: "Piutang Online",   href: "/piutang/online" },
        ],
      },
      {
        label: "Penjualan",
        items: [
          { label: "Penjualan Offline", href: "/penjualan" },
        ],
      },
    ],
  },

  // ─── LAPORAN ──────────────────────────────────────────────────────────────
  {
    key: "laporan",
    label: "Laporan",
    icon: "ChartBar",
    groups: [
      {
        label: "Keuangan",
        defaultOpen: true,
        items: [
          { label: "Laba Rugi",           href: "/laporan" },
          { label: "Laporan Toko Online", href: "/laporan/online" },
          { label: "Laporan Offline",     href: "/laporan/offline" },
          { label: "Profit per Pesanan",  href: "/laporan/profit" },
        ],
      },
      {
        label: "Operasional",
        items: [
          { label: "Laporan Produksi",    href: "/laporan/produksi" },
          { label: "Laporan Stok",        href: "/laporan/stok" },
          { label: "Rekap Pelanggan",     href: "/laporan/pelanggan" },
        ],
      },
    ],
  },

  // ─── ADMIN ────────────────────────────────────────────────────────────────
  {
    key: "admin",
    label: "Admin",
    icon: "Settings",
    roles: ["owner", "super_admin"],
    groups: [
      {
        label: "Master Data",
        defaultOpen: true,
        items: [
          { label: "Produk",            href: "/admin?tab=produk" },
          { label: "Bahan Baku",        href: "/admin?tab=bahan" },
          { label: "Supplier",          href: "/admin?tab=supplier" },
          { label: "Pelanggan Offline", href: "/admin?tab=pelanggan" },
          { label: "Karyawan",          href: "/admin?tab=karyawan" },
          { label: "Varian Borongan",   href: "/admin?tab=varian" },
          { label: "Master PLU",        href: "/admin?tab=plu" },
        ],
      },
      {
        label: "Integrasi Platform",
        items: [
          { label: "Toko Shopee",       href: "/admin?tab=toko" },
          { label: "TikTok Shop",       href: "/admin?tab=tiktok" },
          { label: "Lazada",            href: "/admin?tab=lazada" },
        ],
      },
      {
        label: "Sistem",
        items: [
          { label: "Users",             href: "/admin?tab=users", roles: ["super_admin"] },
        ],
      },
    ],
  },
];

// Helper: cari modul berdasarkan pathname
export function getActiveModule(pathname: string): string {
  for (const mod of NAVIGATION) {
    for (const group of mod.groups) {
      for (const item of group.items) {
        const base = item.href.split("?")[0];
        if (pathname === base || pathname.startsWith(base + "/")) {
          return mod.key;
        }
      }
    }
  }
  // fallback berdasarkan prefix path
  if (pathname.startsWith("/shopee")) return "shopee";
  if (pathname.startsWith("/produksi")) return "produksi";
  if (pathname.startsWith("/pembelian")) return "pembelian";
  if (pathname.startsWith("/penggajian")) return "penggajian";
  if (pathname.startsWith("/kas") || pathname.startsWith("/rekap-saldo") || pathname.startsWith("/fee-platform") || pathname.startsWith("/penjualan") || pathname.startsWith("/piutang")) return "keuangan";
  if (pathname.startsWith("/laporan")) return "laporan";
  if (pathname.startsWith("/admin")) return "admin";
  return "shopee";
}

// Helper: cari breadcrumb dari pathname
export function getBreadcrumb(pathname: string): { module: string; group: string; page: string } {
  for (const mod of NAVIGATION) {
    for (const group of mod.groups) {
      for (const item of group.items) {
        const base = item.href.split("?")[0];
        if (pathname === base || pathname.startsWith(base + "/")) {
          return { module: mod.label, group: group.label, page: item.label };
        }
      }
    }
  }
  return { module: "Azalea", group: "", page: "Dashboard" };
}
// Helper: ambil href default suatu modul (item pertama yang defaultOpen, atau item pertama)
export function getModuleDefaultHref(moduleKey: string): string {
  const mod = NAVIGATION.find(m => m.key === moduleKey);
  if (!mod) return "/dashboard";
  const defaultGroup = mod.groups.find(g => g.defaultOpen) || mod.groups[0];
  return defaultGroup?.items[0]?.href.split("?")[0] || "/dashboard";
}