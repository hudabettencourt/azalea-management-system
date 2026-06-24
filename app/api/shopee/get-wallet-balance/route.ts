// app/api/shopee/get-wallet-balance/route.ts
// GET /api/shopee/get-wallet-balance?toko_id=1 (omit for all toko)
// Saldo penjual saat ini: current_balance (wallet) + pending dari DB (cepat).
import { NextRequest, NextResponse } from "next/server";
import { fetchToko, getValidToken, logShopeeResponse, shopeeAdminClient } from "@/lib/shopee/_token";
import { getShopeeCache, mapPool, setShopeeCache } from "@/lib/shopee/api-cache";
import {
  fetchWalletBalanceRaw,
  parseWalletBalance,
  walletBalanceOk,
  walletBalanceError,
  type WalletBalanceRaw,
} from "@/lib/shopee/wallet-balance";

const CACHE_TTL_MS = 180_000;

/** Fallback pending: total pembayaran pesanan SHIPPED + TO_CONFIRM_RECEIVE per toko. */
async function fetchPendingUangDijalanByToko(): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const [{ data: details }, { data: penjualan }] = await Promise.all([
    shopeeAdminClient
      .from("detail_penjualan_online")
      .select("total_pembayaran, penjualan_online_id")
      .in("status_shopee", ["SHIPPED", "TO_CONFIRM_RECEIVE"]),
    shopeeAdminClient.from("penjualan_online").select("id, toko_id"),
  ]);
  const penjualanMap = new Map((penjualan || []).map((p: any) => [p.id, p.toko_id]));
  for (const d of details || []) {
    const tokoId = penjualanMap.get(d.penjualan_online_id);
    if (!tokoId) continue;
    out.set(tokoId, (out.get(tokoId) || 0) + Number(d.total_pembayaran || 0));
  }
  return out;
}

async function fetchOneTokoBalance(
  toko: Awaited<ReturnType<typeof fetchToko>>[number],
  pendingDb: Map<number, number>,
  skipCache: boolean,
) {
  const cacheKey = `wallet-balance:${toko.id}`;
  if (!skipCache) {
    const cached = getShopeeCache<any>(cacheKey);
    if (cached) return cached;
  }

  const accessToken = await getValidToken(toko);
  const raw: WalletBalanceRaw = await fetchWalletBalanceRaw(toko.shopee_shop_id, accessToken, {
    walletOnly: true,
  });
  raw.pending_db = pendingDb.get(toko.id) ?? null;
  const parsed = parseWalletBalance(raw);
  logShopeeResponse("get_wallet_transaction_list", toko.nama, raw.wallet_transactions);

  const result = {
    toko_id: toko.id,
    toko: toko.nama,
    ok: walletBalanceOk(raw),
    tersedia: parsed.tersedia,
    pending: parsed.pending,
    tersedia_source: parsed.tersedia_source,
    pending_source: parsed.pending_source,
    raw,
    error: walletBalanceError(raw),
  };
  setShopeeCache(cacheKey, result, CACHE_TTL_MS);
  return result;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tokoId = searchParams.get("toko_id");
    const skipCache = searchParams.get("refresh") === "1";
    const tokoList = await fetchToko(tokoId ? Number(tokoId) : null);
    const pendingDb = await fetchPendingUangDijalanByToko();

    const results = await mapPool(tokoList, 2, async (toko) => {
      try {
        return await fetchOneTokoBalance(toko, pendingDb, skipCache);
      } catch (err: any) {
        return { toko_id: toko.id, toko: toko.nama, ok: false, error: err.message };
      }
    });

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
