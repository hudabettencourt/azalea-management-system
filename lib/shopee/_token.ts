// lib/shopee/_token.ts
// Shared helpers for the new Shopee API routes (logistics, ratings, wallet,
// returns, vouchers, discounts). Refreshes token-if-near-expiry and persists
// the new token back to toko_online. Mirrors the pattern in sync-orders.
import { createClient } from "@supabase/supabase-js";
import { refreshAccessToken } from "./helper";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type TokoRow = {
  id: number;
  nama: string;
  shopee_shop_id: number;
  shopee_access_token: string;
  shopee_refresh_token: string;
  shopee_token_expire_at: string;
};

export async function getValidToken(toko: TokoRow): Promise<string> {
  const expireAt = new Date(toko.shopee_token_expire_at).getTime();
  if (expireAt - Date.now() < 3600 * 1000) {
    const refreshed = await refreshAccessToken(toko.shopee_refresh_token, toko.shopee_shop_id);
    if (!refreshed.error && refreshed.access_token) {
      const newExpire = new Date(Date.now() + refreshed.expire_in * 1000).toISOString();
      await supabase.from("toko_online").update({
        shopee_access_token: refreshed.access_token,
        shopee_refresh_token: refreshed.refresh_token,
        shopee_token_expire_at: newExpire,
      }).eq("id", toko.id);
      return refreshed.access_token as string;
    }
  }
  return toko.shopee_access_token;
}

// Fetch one or many active Shopee toko rows. If tokoId provided, returns just
// that toko (or throws). Otherwise returns all aktif+connected.
export async function fetchToko(tokoId?: number | null): Promise<TokoRow[]> {
  let q = supabase
    .from("toko_online")
    .select("id, nama, shopee_shop_id, shopee_access_token, shopee_refresh_token, shopee_token_expire_at")
    .eq("platform", "Shopee")
    .eq("aktif", true)
    .not("shopee_access_token", "is", null);
  if (tokoId) q = q.eq("id", tokoId);
  const { data, error } = await q;
  if (error) throw new Error(`fetchToko: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(tokoId ? `Toko ${tokoId} tidak ditemukan / belum connect` : "Tidak ada toko Shopee aktif terhubung");
  }
  return data as TokoRow[];
}

// Logs raw Shopee response and returns it untouched. Use during the
// integration-verification phase so we can read responses in server logs.
export function logShopeeResponse(endpoint: string, toko: string, response: unknown): void {
  try {
    console.log(`[shopee] ${endpoint} · ${toko}:`, JSON.stringify(response));
  } catch {
    console.log(`[shopee] ${endpoint} · ${toko}:`, response);
  }
}

export { supabase as shopeeAdminClient };
