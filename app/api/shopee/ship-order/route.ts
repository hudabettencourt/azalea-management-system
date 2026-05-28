// app/api/shopee/ship-order/route.ts
// POST /api/shopee/ship-order
// Body: { toko_id, order_sn_list: string[], method: "pickup"|"dropoff", pickup_time_id?, branch_id? }
// Hits /api/v2/logistics/ship_order per order. Updates status_shopee=PROCESSED
// in DB on success and sends a Telegram summary.
import { NextRequest, NextResponse } from "next/server";
import { shopeeApiPost } from "@/lib/shopee/helper";
import { fetchToko, getValidToken, logShopeeResponse, shopeeAdminClient as supabase } from "@/lib/shopee/_token";
import { sendTelegram } from "@/lib/telegram";

type Body = {
  toko_id: number;
  order_sn_list: string[];
  method: "pickup" | "dropoff";
  pickup_time_id?: string;
  branch_id?: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body.toko_id || !body.order_sn_list?.length || !body.method) {
      return NextResponse.json({ error: "toko_id, order_sn_list, method wajib" }, { status: 400 });
    }

    const [toko] = await fetchToko(body.toko_id);
    const accessToken = await getValidToken(toko);

    const dropoff = body.method === "dropoff"
      ? { branch_id: body.branch_id }
      : undefined;
    const pickup = body.method === "pickup"
      ? { pickup_time_id: body.pickup_time_id }
      : undefined;

    const results: any[] = [];
    let okCount = 0;
    for (const order_sn of body.order_sn_list) {
      const payload: Record<string, any> = { order_sn };
      if (dropoff) payload.dropoff = dropoff;
      if (pickup) payload.pickup = pickup;

      const res = await shopeeApiPost("/api/v2/logistics/ship_order", toko.shopee_shop_id, accessToken, payload);
      logShopeeResponse("ship_order", toko.nama, res);
      const ok = !res.error;
      results.push({ order_sn, ok, raw: res });
      if (ok) {
        okCount++;
        await supabase.from("detail_penjualan_online")
          .update({ status_shopee: "PROCESSED" })
          .eq("no_pesanan", order_sn);
      }
    }

    if (okCount > 0) {
      await sendTelegram(`✅ ${okCount} pesanan berhasil diatur pengiriman (${toko.nama})`);
    }

    return NextResponse.json({ success: true, toko: toko.nama, ok: okCount, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
