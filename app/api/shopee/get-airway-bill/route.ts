// app/api/shopee/get-airway-bill/route.ts
// POST /api/shopee/get-airway-bill
// Body: { toko_id, order_sn_list: string[] }
// Wraps /api/v2/logistics/download_shipping_document. Shopee usually returns a
// base64 PDF or a URL — the UI handler decides between blob and window.open().
import { NextRequest, NextResponse } from "next/server";
import { shopeeApiPost } from "@/lib/shopee/helper";
import { fetchToko, getValidToken, logShopeeResponse } from "@/lib/shopee/_token";

type Body = {
  toko_id: number;
  order_sn_list: string[];
  shipping_document_type?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body.toko_id || !body.order_sn_list?.length) {
      return NextResponse.json({ error: "toko_id dan order_sn_list wajib" }, { status: 400 });
    }
    const [toko] = await fetchToko(body.toko_id);
    const accessToken = await getValidToken(toko);
    const res = await shopeeApiPost(
      "/api/v2/logistics/download_shipping_document",
      toko.shopee_shop_id,
      accessToken,
      {
        order_list: body.order_sn_list.map(sn => ({ order_sn: sn })),
        shipping_document_type: body.shipping_document_type ?? "THERMAL_AIR_WAYBILL",
      },
    );
    logShopeeResponse("download_shipping_document", toko.nama, res);
    return NextResponse.json({ success: !res.error, toko: toko.nama, raw: res });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
