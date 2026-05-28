// app/api/shopee/get-ratings/route.ts
// GET /api/shopee/get-ratings?toko_id=1 (omit toko_id to fetch all toko)
// Wraps /api/v2/product/get_rating. Returns raw response per toko so the UI
// layer can map after the live shape is verified.
import { NextRequest, NextResponse } from "next/server";
import { shopeeApi } from "@/lib/shopee/helper";
import { fetchToko, getValidToken, logShopeeResponse } from "@/lib/shopee/_token";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tokoId = searchParams.get("toko_id");
    const tokoList = await fetchToko(tokoId ? Number(tokoId) : null);

    // Only forward populated filters — Shopee rejects empty item_id_list /
    // rating_status with an "invalid value" error on some API versions.
    const params: Record<string, string | number> = {
      page_no: Number(searchParams.get("page_no") || 1),
      page_size: Number(searchParams.get("page_size") || 50),
    };
    const itemIds = searchParams.get("item_id_list");
    if (itemIds) params.item_id_list = itemIds;
    const ratingStatus = searchParams.get("rating_status");
    if (ratingStatus && ratingStatus !== "all") params.rating_status = ratingStatus;

    const results: any[] = [];
    for (let i = 0; i < tokoList.length; i++) {
      const toko = tokoList[i];
      try {
        const accessToken = await getValidToken(toko);
        const res = await shopeeApi("/api/v2/product/get_rating", toko.shopee_shop_id, accessToken, params);
        logShopeeResponse("get_rating", toko.nama, res);
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
