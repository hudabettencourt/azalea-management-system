// app/api/shopee/sync-returns/route.ts
// Sync data retur dari Shopee API ke tabel retur_online

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { shopeeApi } from "@/lib/shopee/helper";
import { fetchToko, getValidToken, logShopeeResponse } from "@/lib/shopee/_token";

export async function POST(req: NextRequest) {
  try {
    const tokoList = await fetchToko(null);
    const allReturns: any[] = [];
    const insertedCount = { success: 0, error: 0 };

    for (const toko of tokoList) {
      try {
        const accessToken = await getValidToken(toko);
        let pageNo = 0;
        let hasMore = true;

        while (hasMore) {
          const res = await shopeeApi("/api/v2/returns/get_return_list", toko.shopee_shop_id, accessToken, {
            page_no: pageNo,
            page_size: 100,
          });

          logShopeeResponse("sync_returns", toko.nama, res);
          
          if (res.error) {
            console.error(`Sync returns error for ${toko.nama}:`, res.error);
            break;
          }

          const returns = res.response?.return || [];
          for (const ret of returns) {
            allReturns.push({
              toko_id: toko.id,
              order_sn: ret.order_sn,
              return_sn: ret.return_sn,
              return_status: ret.status,
              refund_amount: ret.refund_amount,
              reason: ret.reason,
              text_reason: ret.text_reason,
              username_pembeli: ret.user?.username,
              product_name: ret.item?.[0]?.name,
              created_at: new Date(ret.create_time * 1000).toISOString(),
            });
          }

          hasMore = res.response?.more || false;
          pageNo++;
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (err) {
        console.error(`Error sync returns for toko ${toko.id}:`, err);
      }
      await new Promise(r => setTimeout(r, 500));
    }

    // Insert/update ke database (upsert by return_sn)
    if (allReturns.length > 0) {
      const { error: upsertError } = await supabase
        .from("retur_online")
        .upsert(
          allReturns.map(r => ({
            toko_id: r.toko_id,
            order_sn: r.order_sn,
            return_sn: r.return_sn,
            return_status: r.return_status,
            refund_amount: r.refund_amount,
            reason: r.reason,
            username_pembeli: r.username_pembeli,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "return_sn" }
        );

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        insertedCount.error = allReturns.length;
      } else {
        insertedCount.success = allReturns.length;
      }
    }

    return NextResponse.json({
      success: true,
      totalReturns: allReturns.length,
      inserted: insertedCount.success,
      errors: insertedCount.error,
      sample: allReturns.slice(0, 2),
    });
  } catch (err: any) {
    console.error("Sync returns error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
