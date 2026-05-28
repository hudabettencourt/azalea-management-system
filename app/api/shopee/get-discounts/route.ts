// app/api/shopee/get-discounts/route.ts
// GET /api/shopee/get-discounts?toko_id=1&status=all|ongoing|upcoming|expired
// Wraps /api/v2/discount/get_discount_list.
import { NextRequest, NextResponse } from "next/server";
import { shopeeApi } from "@/lib/shopee/helper";
import { fetchToko, getValidToken, logShopeeResponse } from "@/lib/shopee/_token";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tokoId = searchParams.get("toko_id");
    const tokoList = await fetchToko(tokoId ? Number(tokoId) : null);

    const status = searchParams.get("status") || "all";
    const pageNo = Number(searchParams.get("page_no") || 1);
    const pageSize = Number(searchParams.get("page_size") || 50);

    const results: any[] = [];
    for (let i = 0; i < tokoList.length; i++) {
      const toko = tokoList[i];
      try {
        const accessToken = await getValidToken(toko);
        const res = await shopeeApi("/api/v2/discount/get_discount_list", toko.shopee_shop_id, accessToken, {
          discount_status: status,
          page_no: pageNo,
          page_size: pageSize,
        });
        logShopeeResponse("get_discount_list", toko.nama, res);
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
