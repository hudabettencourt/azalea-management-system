// Lookup pesanan Shopee by barcode (no_resi atau no_pesanan).
// Dipakai API route + bisa di-reimplement di AzaleaPacking Kotlin.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PackingOrderLookup } from "./types";

type DetailRow = {
  id: number;
  no_pesanan: string;
  no_resi: string | null;
  sku: string;
  qty: number;
  status_shopee: string | null;
  nama_pembeli: string | null;
  jasa_kirim: string | null;
  penjualan_online_id: number;
  stok_barang: { nama_produk: string } | { nama_produk: string }[] | null;
};

const DETAIL_SELECT =
  "id, no_pesanan, no_resi, sku, qty, status_shopee, nama_pembeli, jasa_kirim, penjualan_online_id, stok_barang(nama_produk)";

function productName(row: DetailRow): string {
  const sb = row.stok_barang;
  if (Array.isArray(sb)) return sb[0]?.nama_produk || row.sku;
  return sb?.nama_produk || row.sku;
}

async function fetchDetailsByResi(
  supabase: SupabaseClient,
  code: string,
): Promise<DetailRow[]> {
  const { data, error } = await supabase
    .from("detail_penjualan_online")
    .select(DETAIL_SELECT)
    .eq("no_resi", code);
  if (error) throw new Error(error.message);
  return (data || []) as DetailRow[];
}

async function fetchDetailsByOrderSn(
  supabase: SupabaseClient,
  code: string,
): Promise<DetailRow[]> {
  const { data, error } = await supabase
    .from("detail_penjualan_online")
    .select(DETAIL_SELECT)
    .eq("no_pesanan", code);
  if (error) throw new Error(error.message);
  return (data || []) as DetailRow[];
}

export async function lookupOrderByBarcode(
  supabase: SupabaseClient,
  rawCode: string,
): Promise<PackingOrderLookup | null> {
  const code = rawCode.trim();
  if (!code) return null;

  let rows = await fetchDetailsByResi(supabase, code);
  if (rows.length === 0) rows = await fetchDetailsByOrderSn(supabase, code);
  if (rows.length === 0) return null;

  const first = rows[0];
  const penjualanIds = [...new Set(rows.map(r => r.penjualan_online_id))];
  const { data: penjualanRows } = await supabase
    .from("penjualan_online")
    .select("id, toko_id")
    .in("id", penjualanIds);

  const tokoId = penjualanRows?.[0]?.toko_id ?? 0;
  let namaToko = "—";
  if (tokoId) {
    const { data: toko } = await supabase
      .from("toko_online")
      .select("nama")
      .eq("id", tokoId)
      .maybeSingle();
    namaToko = toko?.nama || "—";
  }

  const { data: packLog } = await supabase
    .from("shopee_packing_log")
    .select("packed_at, packed_by")
    .eq("no_pesanan", first.no_pesanan)
    .maybeSingle();

  return {
    no_pesanan: first.no_pesanan,
    no_resi: first.no_resi,
    nama_pembeli: first.nama_pembeli,
    jasa_kirim: first.jasa_kirim,
    status_shopee: first.status_shopee,
    nama_toko: namaToko,
    toko_id: tokoId,
    items: rows.map(r => ({
      detail_id: r.id,
      sku: r.sku,
      nama_produk: productName(r),
      qty: r.qty,
    })),
    already_packed: !!packLog,
    packed_at: packLog?.packed_at ?? null,
    packed_by: packLog?.packed_by ?? null,
  };
}
