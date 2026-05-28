// app/api/shopee/get-escrow-detail/route.ts
// GET /api/shopee/get-escrow-detail?toko_id=1&order_sn=XXX
// Wraps /api/v2/payment/get_escrow_detail for a single order.
import { NextRequest, NextResponse } from "next/server";
import { shopeeApi } from "@/lib/shopee/helper";
import { fetchToko, getValidToken, logShopeeResponse } from "@/lib/shopee/_token";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tokoId = Number(searchParams.get("toko_id"));
    const orderSn = searchParams.get("order_sn");
    if (!tokoId || !orderSn) {
      return NextResponse.json({ error: "toko_id dan order_sn wajib" }, { status: 400 });
    }
    const [toko] = await fetchToko(tokoId);
    const accessToken = await getValidToken(toko);
    const res = await shopeeApi(
      "/api/v2/payment/get_escrow_detail",
      toko.shopee_shop_id,
      accessToken,
      { order_sn: orderSn },
    );
    logShopeeResponse("get_escrow_detail", toko.nama, res);
    return NextResponse.json({ success: !res.error, toko: toko.nama, raw: res });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
