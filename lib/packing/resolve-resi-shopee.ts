// Fallback: cari no_pesanan dari Shopee API kalau no_resi belum ada di DB.

import type { SupabaseClient } from "@supabase/supabase-js";
import { shopeeApi } from "@/lib/shopee/helper";
import { fetchToko, getValidToken } from "@/lib/shopee/_token";
import { resiMatchesVariant } from "./normalize-code";

const RESI_STATUSES = ["READY_TO_SHIP", "PROCESSED", "SHIPPED", "LABEL_PRINTED"];
const LOOKBACK_DAYS = 30;
const BATCH = 50;

function cutoffDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - LOOKBACK_DAYS);
  return d.toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type CandidateRow = {
  no_pesanan: string;
  penjualan_online: { toko_id: number } | { toko_id: number }[] | null;
};

async function fetchCandidateOrders(
  supabase: SupabaseClient,
  onlyMissingResi: boolean,
): Promise<Map<number, Set<string>>> {
  let q = supabase
    .from("detail_penjualan_online")
    .select("no_pesanan, penjualan_online!inner(toko_id)")
    .gte("tanggal_pesanan", cutoffDate());

  if (onlyMissingResi) {
    q = q.or("no_resi.is.null,no_resi.eq.");
  } else {
    q = q.in("status_shopee", RESI_STATUSES);
  }

  const { data, error } = await q.limit(800);
  if (error) throw new Error(error.message);

  const byToko = new Map<number, Set<string>>();
  for (const row of (data || []) as CandidateRow[]) {
    const po = row.penjualan_online;
    const tokoId = Array.isArray(po) ? po[0]?.toko_id : po?.toko_id;
    if (!tokoId || !row.no_pesanan) continue;
    if (!byToko.has(tokoId)) byToko.set(tokoId, new Set());
    byToko.get(tokoId)!.add(row.no_pesanan);
  }
  return byToko;
}

async function trackingForOrder(
  shopId: number,
  accessToken: string,
  orderSn: string,
): Promise<string | null> {
  const detailRes = await shopeeApi("/api/v2/order/get_order_detail", shopId, accessToken, {
    order_sn_list: orderSn,
    response_optional_fields: "package_list",
  });
  if (detailRes.error) return null;

  const order = detailRes.response?.order_list?.[0];
  const pkg = order?.package_list?.[0];
  let tracking = pkg?.tracking_number || null;

  if (!tracking) {
    const params: Record<string, string> = { order_sn: orderSn };
    if (pkg?.package_number) params.package_number = pkg.package_number;
    const tnRes = await shopeeApi("/api/v2/logistics/get_tracking_number", shopId, accessToken, params);
    if (!tnRes.error && tnRes.response?.tracking_number) {
      tracking = tnRes.response.tracking_number;
    }
  }

  return tracking || null;
}

async function scanTokoOrders(
  shopId: number,
  accessToken: string,
  orderSns: string[],
  variantSet: Set<string>,
): Promise<{ orderSn: string; tracking: string } | null> {
  for (const batch of chunk(orderSns, BATCH)) {
    const detailRes = await shopeeApi("/api/v2/order/get_order_detail", shopId, accessToken, {
      order_sn_list: batch.join(","),
      response_optional_fields: "package_list",
    });
    if (detailRes.error) continue;

    for (const order of detailRes.response?.order_list || []) {
      const pkg = order.package_list?.[0];
      let tracking = pkg?.tracking_number || null;

      if (!tracking) {
        const params: Record<string, string> = { order_sn: order.order_sn };
        if (pkg?.package_number) params.package_number = pkg.package_number;
        const tnRes = await shopeeApi("/api/v2/logistics/get_tracking_number", shopId, accessToken, params);
        if (!tnRes.error && tnRes.response?.tracking_number) {
          tracking = tnRes.response.tracking_number;
        }
      }

      if (tracking && resiMatchesVariant(tracking, variantSet)) {
        return { orderSn: order.order_sn, tracking };
      }
    }
  }
  return null;
}

/** Cari order_sn dari tracking via Shopee API (DB belum punya no_resi). */
export async function resolveOrderSnByTracking(
  supabase: SupabaseClient,
  variantSet: Set<string>,
): Promise<{ orderSn: string; tracking: string } | null> {
  const tokoList = await fetchToko();

  // Pass 1: hanya pesanan yang no_resi-nya kosong (lebih cepat)
  let byToko = await fetchCandidateOrders(supabase, true);
  for (const toko of tokoList) {
    const orderSns = [...(byToko.get(toko.id) || [])];
    if (!orderSns.length) continue;
    const accessToken = await getValidToken(toko);
    const hit = await scanTokoOrders(toko.shopee_shop_id, accessToken, orderSns, variantSet);
    if (hit) return hit;
  }

  // Pass 2: semua pesanan shippable recent (no_resi DB salah/kosong)
  byToko = await fetchCandidateOrders(supabase, false);
  for (const toko of tokoList) {
    const orderSns = [...(byToko.get(toko.id) || [])];
    if (!orderSns.length) continue;
    const accessToken = await getValidToken(toko);
    const hit = await scanTokoOrders(toko.shopee_shop_id, accessToken, orderSns, variantSet);
    if (hit) return hit;
  }

  return null;
}

export async function backfillNoResi(
  supabase: SupabaseClient,
  orderSn: string,
  tracking: string,
): Promise<void> {
  await supabase
    .from("detail_penjualan_online")
    .update({ no_resi: tracking })
    .eq("no_pesanan", orderSn);
}

/** Untuk debug / refresh satu pesanan */
export async function fetchTrackingForOrderSn(
  supabase: SupabaseClient,
  orderSn: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("detail_penjualan_online")
    .select("penjualan_online!inner(toko_id)")
    .eq("no_pesanan", orderSn)
    .limit(1)
    .maybeSingle();

  const po = data?.penjualan_online as { toko_id: number } | { toko_id: number }[] | null;
  const tokoId = Array.isArray(po) ? po[0]?.toko_id : po?.toko_id;
  if (!tokoId) return null;

  const [toko] = await fetchToko(tokoId);
  const accessToken = await getValidToken(toko);
  return trackingForOrder(toko.shopee_shop_id, accessToken, orderSn);
}
