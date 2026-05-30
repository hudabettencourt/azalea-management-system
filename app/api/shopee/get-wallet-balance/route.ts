// app/api/shopee/get-wallet-balance/route.ts
// GET /api/shopee/get-wallet-balance?toko_id=1 (omit for all toko)
// Wraps /api/v2/payment/get_wallet_transaction_list.
import { NextRequest, NextResponse } from "next/server";
import { shopeeApi } from "@/lib/shopee/helper";
import { fetchToko, getValidToken, logShopeeResponse } from "@/lib/shopee/_token";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tokoId = searchParams.get("toko_id");
    const tokoList = await fetchToko(tokoId ? Number(tokoId) : null);

    const results: any[] = [];
    for (let i = 0; i < tokoList.length; i++) {
      const toko = tokoList[i];
      try {
        const accessToken = await getValidToken(toko);
        const res = await shopeeApi("/api/v2/payment/get_wallet_transaction_list", toko.shopee_shop_id, accessToken, {
          wallet_type: 1,
          page_no: 1,
          page_size: 1,
        });
        logShopeeResponse("get_wallet_transaction_list", toko.nama, res);
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
