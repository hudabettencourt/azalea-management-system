// Shared types — web scan-bungkus & future AzaleaPacking Android (same Supabase table/API)

export type PackingOrderItem = {
  detail_id: number;
  sku: string;
  nama_produk: string;
  qty: number;
};

export type PackingOrderLookup = {
  no_pesanan: string;
  no_resi: string | null;
  nama_pembeli: string | null;
  jasa_kirim: string | null;
  status_shopee: string | null;
  nama_toko: string;
  toko_id: number;
  items: PackingOrderItem[];
  already_packed: boolean;
  packed_at: string | null;
  packed_by: string | null;
};

export type PackingConfirmItem = {
  detail_id: number;
  sku: string;
  qty: number;
  checked: boolean;
};
