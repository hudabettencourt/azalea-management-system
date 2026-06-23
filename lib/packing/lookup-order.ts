// Lookup pesanan Shopee by barcode (no_resi atau no_pesanan).
// Dipakai web scan-bungkus + API /api/packing/lookup (+ nanti AzaleaPacking).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PackingOrderLookup } from "./types";
import {
  longDigitSuffix,
  looksLikeResiCode,
  resiLookupVariants,
  resiMatchesVariant,
  sanitizeScanCode,
} from "./normalize-code";
import {
  backfillNoResi,
  resolveOrderSnByTracking,
} from "./resolve-resi-shopee";

export type LookupOptions = {
  /** Coba Shopee API kalau no_resi belum ada di DB (server-side saja) */
  allowShopeeResolve?: boolean;
};

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

const MAX_SUFFIX_ROWS = 5;

function productName(row: DetailRow): string {
  const sb = row.stok_barang;
  if (Array.isArray(sb)) return sb[0]?.nama_produk || row.sku;
  return sb?.nama_produk || row.sku;
}

async function fetchByOrderSn(
  supabase: SupabaseClient,
  orderSn: string,
): Promise<DetailRow[]> {
  const { data, error } = await supabase
    .from("detail_penjualan_online")
    .select(DETAIL_SELECT)
    .eq("no_pesanan", orderSn);
  if (error) throw new Error(error.message);
  return (data || []) as DetailRow[];
}

async function fetchByResiInList(
  supabase: SupabaseClient,
  variants: string[],
  variantSet: Set<string>,
): Promise<DetailRow[]> {
  const { data, error } = await supabase
    .from("detail_penjualan_online")
    .select(DETAIL_SELECT)
    .in("no_resi", variants);
  if (error) throw new Error(error.message);
  if (data?.length) return data as DetailRow[];

  // Case-insensitive exact match (DB bisa beda kapitalisasi)
  for (const v of variants) {
    const { data: ilikeRows, error: ilikeErr } = await supabase
      .from("detail_penjualan_online")
      .select(DETAIL_SELECT)
      .ilike("no_resi", v)
      .limit(10);
    if (ilikeErr) throw new Error(ilikeErr.message);
    const matched = (ilikeRows || []).filter(r =>
      resiMatchesVariant(r.no_resi, variantSet),
    ) as DetailRow[];
    if (matched.length) return matched;
  }

  return [];
}

/** Fallback: suffix digit panjang — filter ketat di app, limit rows */
async function fetchByResiSuffix(
  supabase: SupabaseClient,
  suffix: string,
  variantSet: Set<string>,
): Promise<DetailRow[]> {
  const { data, error } = await supabase
    .from("detail_penjualan_online")
    .select(DETAIL_SELECT)
    .ilike("no_resi", `%${suffix}`)
    .limit(MAX_SUFFIX_ROWS);
  if (error) throw new Error(error.message);
  const rows = (data || []) as DetailRow[];
  return rows.filter(r => resiMatchesVariant(r.no_resi, variantSet));
}

async function fetchByPackingLogResi(
  supabase: SupabaseClient,
  variants: string[],
  variantSet: Set<string>,
): Promise<DetailRow[]> {
  for (const v of variants) {
    try {
      const { data: logRow } = await supabase
        .from("shopee_packing_log")
        .select("no_pesanan")
        .ilike("no_resi", v)
        .limit(1)
        .maybeSingle();
      if (logRow?.no_pesanan) {
        return fetchByOrderSn(supabase, logRow.no_pesanan.trim().toUpperCase());
      }
    } catch {
      /* tabel belum migrate */
    }
  }

  try {
    const suffix = longDigitSuffix(variants[0] || "");
    if (suffix) {
      const { data: logs } = await supabase
        .from("shopee_packing_log")
        .select("no_pesanan, no_resi")
        .ilike("no_resi", `%${suffix}`)
        .limit(5);
      for (const log of logs || []) {
        if (resiMatchesVariant(log.no_resi, variantSet)) {
          return fetchByOrderSn(supabase, log.no_pesanan.trim().toUpperCase());
        }
      }
    }
  } catch {
    /* ignore */
  }

  return [];
}

async function buildLookup(
  supabase: SupabaseClient,
  rows: DetailRow[],
): Promise<PackingOrderLookup | null> {
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

  let packLog: { packed_at: string; packed_by: string | null } | null = null;
  try {
    const { data } = await supabase
      .from("shopee_packing_log")
      .select("packed_at, packed_by")
      .eq("no_pesanan", first.no_pesanan)
      .maybeSingle();
    packLog = data;
  } catch {
    /* tabel belum migrate — abaikan */
  }

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

export async function lookupOrderByBarcode(
  supabase: SupabaseClient,
  rawCode: string,
  options: LookupOptions = {},
): Promise<PackingOrderLookup | null> {
  const normalized = sanitizeScanCode(rawCode);
  if (!normalized) return null;

  // 1) Exact no_pesanan (Shopee order SN)
  let rows = await fetchByOrderSn(supabase, normalized);
  if (rows.length > 0) return buildLookup(supabase, rows);

  const variants = resiLookupVariants(normalized);
  const variantSet = new Set(variants);

  // 2) Resi di detail_penjualan_online
  rows = await fetchByResiInList(supabase, variants, variantSet);
  if (rows.length > 0) return buildLookup(supabase, rows);

  // 3) Suffix digit panjang
  const suffix = longDigitSuffix(normalized);
  if (suffix) {
    rows = await fetchByResiSuffix(supabase, suffix, variantSet);
    if (rows.length > 0) return buildLookup(supabase, rows);
  }

  // 4) Log packing (pernah scan sebelumnya)
  rows = await fetchByPackingLogResi(supabase, variants, variantSet);
  if (rows.length > 0) return buildLookup(supabase, rows);

  // 5) Shopee API — no_resi belum/kosong di DB
  if (options.allowShopeeResolve && looksLikeResiCode(normalized)) {
    const resolved = await resolveOrderSnByTracking(supabase, variantSet);
    if (resolved) {
      await backfillNoResi(supabase, resolved.orderSn, resolved.tracking);
      rows = await fetchByOrderSn(supabase, resolved.orderSn);
      if (!rows.length) {
        rows = await fetchByOrderSn(supabase, resolved.orderSn.trim().toUpperCase());
      }
      if (rows.length > 0) return buildLookup(supabase, rows);
    }
  }

  return null;
}
