// app/api/shopee/reply-rating/route.ts
// POST /api/shopee/reply-rating
// Body: { toko_id, comment_id, reply }
// Wraps /api/v2/product/reply_rating.
import { NextRequest, NextResponse } from "next/server";
import { shopeeApiPost } from "@/lib/shopee/helper";
import { fetchToko, getValidToken, logShopeeResponse } from "@/lib/shopee/_token";

type Body = { toko_id: number; comment_id: number; reply: string };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body.toko_id || !body.comment_id || !body.reply) {
      return NextResponse.json({ error: "toko_id, comment_id, reply wajib" }, { status: 400 });
    }
    const [toko] = await fetchToko(body.toko_id);
    const accessToken = await getValidToken(toko);
    const res = await shopeeApiPost(
      "/api/v2/product/reply_rating",
      toko.shopee_shop_id,
      accessToken,
      { reply_list: [{ comment_id: body.comment_id, comment: body.reply }] },
    );
    logShopeeResponse("reply_rating", toko.nama, res);
    return NextResponse.json({ success: !res.error, toko: toko.nama, raw: res });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
