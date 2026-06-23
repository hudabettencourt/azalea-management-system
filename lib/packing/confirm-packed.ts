// Konfirmasi scan & bungkus — validasi server-side sebelum upsert log.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PackingConfirmItem } from "./types";

export type ConfirmPackedParams = {
  no_pesanan: string;
  no_resi: string | null;
  items: PackingConfirmItem[];
  source: "web" | "android";
  packed_by: string | null;
};

export type ConfirmPackedResult = {
  id: number;
  packed_at: string;
  packed_by: string | null;
  source: string;
};

export async function confirmPackedOrder(
  supabase: SupabaseClient,
  params: ConfirmPackedParams,
): Promise<ConfirmPackedResult> {
  const no_pesanan = params.no_pesanan.trim();
  if (!no_pesanan || no_pesanan.length > 64) {
    throw new Error("no_pesanan tidak valid");
  }
  if (!params.items.length || !params.items.every(i => i.checked)) {
    throw new Error("Semua item harus dicentang");
  }

  const { data: details, error: detErr } = await supabase
    .from("detail_penjualan_online")
    .select("id, sku, qty")
    .eq("no_pesanan", no_pesanan);
  if (detErr) throw new Error(detErr.message);
  if (!details?.length) throw new Error("Pesanan tidak ditemukan");

  const byId = new Map(details.map(d => [d.id, d]));
  if (params.items.length !== details.length) {
    throw new Error("Semua item pesanan harus dicentang");
  }
  for (const item of params.items) {
    const row = byId.get(item.detail_id);
    if (!row) throw new Error("Item tidak valid untuk pesanan ini");
    if (row.sku !== item.sku || row.qty !== item.qty) {
      throw new Error("Data item tidak sesuai");
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("shopee_packing_log")
    .upsert(
      {
        no_pesanan,
        no_resi: params.no_resi,
        packed_at: now,
        packed_by: params.packed_by,
        source: params.source,
        items: params.items,
        updated_at: now,
      },
      { onConflict: "no_pesanan" },
    )
    .select("id, packed_at, packed_by, source")
    .single();

  if (error) throw new Error(error.message);
  return data as ConfirmPackedResult;
}
