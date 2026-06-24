// app/api/shopee/get-wallet-transactions/route.ts
// GET /api/shopee/get-wallet-transactions?toko_id=1&page_no=0&page_size=40
// Transaksi wallet Shopee (referensi pencairan) — pakai get_wallet_transaction_list.
import { NextRequest, NextResponse } from "next/server";
import { shopeeApi } from "@/lib/shopee/helper";
import { fetchToko, getValidToken, logShopeeResponse } from "@/lib/shopee/_token";
import { getShopeeCache, mapPool, setShopeeCache } from "@/lib/shopee/api-cache";

const CACHE_TTL_MS = 180_000;
const WINDOW_DAYS = 30;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tokoId = searchParams.get("toko_id");
    const skipCache = searchParams.get("refresh") === "1";
    const tokoList = await fetchToko(tokoId ? Number(tokoId) : null);

    const now = Math.floor(Date.now() / 1000);
    const defaultFrom = now - WINDOW_DAYS * 24 * 3600;
    const createTimeFrom = Number(searchParams.get("create_time_from") || defaultFrom);
    const createTimeTo = Number(searchParams.get("create_time_to") || now);
    const pageNo = Number(searchParams.get("page_no") || 0);
    const pageSize = Number(searchParams.get("page_size") || 40);

    const results = await mapPool(tokoList, 2, async (toko) => {
      const cacheKey = `wallet-txns:${toko.id}:${createTimeFrom}:${createTimeTo}:${pageNo}:${pageSize}`;
      if (!skipCache) {
        const cached = getShopeeCache<any>(cacheKey);
        if (cached) return cached;
      }

      try {
        const accessToken = await getValidToken(toko);
        const res = await shopeeApi(
          "/api/v2/payment/get_wallet_transaction_list",
          toko.shopee_shop_id,
          accessToken,
          {
            create_time_from: createTimeFrom,
            create_time_to: createTimeTo,
            page_no: pageNo,
            page_size: pageSize,
          },
        );
        logShopeeResponse("get_wallet_transaction_list", toko.nama, res);
        const result = { toko_id: toko.id, toko: toko.nama, ok: !res.error, raw: res };
        setShopeeCache(cacheKey, result, CACHE_TTL_MS);
        return result;
      } catch (err: any) {
        return { toko_id: toko.id, toko: toko.nama, ok: false, error: err.message };
      }
    });

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
