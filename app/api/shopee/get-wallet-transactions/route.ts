// app/api/shopee/get-wallet-transactions/route.ts
// GET /api/shopee/get-wallet-transactions?toko_id=1&page_no=0&page_size=40
// Wraps /api/v2/payment/get_wallet_transactions (payouts / withdrawal history).
// Window defaults to last 30 days, override with create_time_from/to.
import { NextRequest, NextResponse } from "next/server";
import { shopeeApi } from "@/lib/shopee/helper";
import { fetchToko, getValidToken, logShopeeResponse } from "@/lib/shopee/_token";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tokoId = searchParams.get("toko_id");
    const tokoList = await fetchToko(tokoId ? Number(tokoId) : null);

    const now = Math.floor(Date.now() / 1000);
    const defaultFrom = now - 30 * 24 * 3600;
    const createTimeFrom = Number(searchParams.get("create_time_from") || defaultFrom);
    const createTimeTo = Number(searchParams.get("create_time_to") || now);
    const pageNo = Number(searchParams.get("page_no") || 0);
    const pageSize = Number(searchParams.get("page_size") || 40);

    const results: any[] = [];
    for (let i = 0; i < tokoList.length; i++) {
      const toko = tokoList[i];
      try {
        const accessToken = await getValidToken(toko);
        const res = await shopeeApi(
          "/api/v2/payment/get_wallet_transactions",
          toko.shopee_shop_id,
          accessToken,
          {
            create_time_from: createTimeFrom,
            create_time_to: createTimeTo,
            page_no: pageNo,
            page_size: pageSize,
          },
        );
        logShopeeResponse("get_wallet_transactions", toko.nama, res);
        results.push({ toko_id: toko.id, toko: toko.nama, ok: !res.error, raw: res });
      } catch (err: any) {
        results.push({ toko_id: toko.id, toko: toko.nama, ok: false, error: err.message });
      }
      if (i < tokoList.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
