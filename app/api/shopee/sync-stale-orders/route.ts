// POST /api/shopee/sync-stale-orders
// Re-check status semua order yang masih SHIPPED / TO_CONFIRM_RECEIVE di DB
// terhadap Shopee API. Update ke COMPLETED / CANCELLED jika sudah berubah.
// Tidak ada window tanggal — ambil dari DB, bukan dari Shopee list.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { shopeeApi, refreshAccessToken } from "@/lib/shopee/helper";
import { requireUser } from "@/lib/auth/require-user";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BATCH = 50;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getValidToken(toko: any): Promise<string> {
  const expireAt = new Date(toko.shopee_token_expire_at).getTime();
  if (expireAt - Date.now() < 3600 * 1000) {
    const refreshed = await refreshAccessToken(
      toko.shopee_refresh_token,
      toko.shopee_shop_id,
    );
    if (!refreshed.error && refreshed.access_token) {
      const newExpire = new Date(
        Date.now() + refreshed.expire_in * 1000,
      ).toISOString();
      await supabase
        .from("toko_online")
        .update({
          shopee_access_token: refreshed.access_token,
          shopee_refresh_token: refreshed.refresh_token,
          shopee_token_expire_at: newExpire,
        })
        .eq("id", toko.id);
      return refreshed.access_token as string;
    }
  }
  return toko.shopee_access_token;
}

async function syncStaleToko(toko: any) {
  // 1. Ambil semua no_pesanan yang masih pending dari penjualan_online toko ini
  const { data: headerRows } = await supabase
    .from("penjualan_online")
    .select("id")
    .eq("toko_id", toko.id);
  const headerIds = (headerRows || []).map((r: any) => r.id);
  if (!headerIds.length) return { toko: toko.nama, updated: 0, checked: 0 };

  const staleRows: { id: number; no_pesanan: string }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data } = await supabase
      .from("detail_penjualan_online")
      .select("id, no_pesanan")
      .in("penjualan_online_id", headerIds)
      .in("status_shopee", ["SHIPPED", "TO_CONFIRM_RECEIVE"])
      .range(off, off + 999);
    staleRows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  if (!staleRows.length) return { toko: toko.nama, updated: 0, checked: 0 };

  const accessToken = await getValidToken(toko);
  const sns = staleRows.map((r) => r.no_pesanan);

  // 2. Cek status terbaru dari Shopee
  const latestStatus = new Map<string, string>();
  for (const batch of chunk(sns, BATCH)) {
    const res = await shopeeApi(
      "/api/v2/order/get_order_detail",
      toko.shopee_shop_id,
      accessToken,
      {
        order_sn_list: batch.join(","),
        response_optional_fields: "order_status",
      },
    );
    if (res.error) continue; // skip batch jika error, jangan gagal semua
    for (const o of res.response?.order_list || []) {
      if (o.order_sn && o.order_status) {
        latestStatus.set(o.order_sn, o.order_status);
      }
    }
  }

  // 3. Update baris yang statusnya berubah
  let updated = 0;
  for (const row of staleRows) {
    const newStatus = latestStatus.get(row.no_pesanan);
    if (!newStatus) continue;
    if (newStatus === "SHIPPED" || newStatus === "TO_CONFIRM_RECEIVE") continue;
    // Status berubah (COMPLETED, CANCELLED, dll) — update DB
    await supabase
      .from("detail_penjualan_online")
      .update({ status_shopee: newStatus })
      .eq("id", row.id);
    updated++;
  }

  return { toko: toko.nama, updated, checked: staleRows.length };
}

export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const { data: tokoList } = await supabase
      .from("toko_online")
      .select("id, nama, shopee_shop_id, shopee_access_token, shopee_refresh_token, shopee_token_expire_at")
      .eq("platform", "Shopee")
      .eq("aktif", true)
      .not("shopee_access_token", "is", null);

    const results = await Promise.all(
      (tokoList || []).map((t: any) => syncStaleToko(t)),
    );

    const totalUpdated = results.reduce((a, r) => a + r.updated, 0);
    const totalChecked = results.reduce((a, r) => a + r.checked, 0);

    return NextResponse.json({ success: true, results, totalUpdated, totalChecked });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal sync stale orders";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
