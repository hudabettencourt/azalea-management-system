// app/api/shopee/get-shipping-parameter/route.ts
// GET /api/shopee/get-shipping-parameter?toko_id=1&order_sn=XXX
// Returns Shopee shipping options (pickup time slots + dropoff branches).
// STUB: passes the raw Shopee response through; UI layer will read shape
// from server logs and add structured mapping later.
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
      "/api/v2/logistics/get_shipping_parameter",
      toko.shopee_shop_id,
      accessToken,
      { order_sn: orderSn },
    );
    logShopeeResponse("get_shipping_parameter", toko.nama, res);
    return NextResponse.json({ success: !res.error, toko: toko.nama, raw: res });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
