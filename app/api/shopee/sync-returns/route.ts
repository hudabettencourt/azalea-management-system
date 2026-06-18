// app/api/shopee/sync-returns/route.ts
// Sync data retur dari Shopee API ke tabel retur_online

import { NextRequest, NextResponse } from "next/server";
import { shopeeApi } from "@/lib/shopee/helper";
import { fetchToko, getValidToken, logShopeeResponse, shopeeAdminClient as supabase } from "@/lib/shopee/_token";

const SYNC_DAYS = 90;
const WINDOW_DAYS = 15;

function extractReturns(res: any): any[] {
  const resp = res?.response ?? res ?? {};
  const list = resp.return ?? resp.return_list ?? resp.returns ?? [];
  return Array.isArray(list) ? list : [];
}

function mapReturnItem(ret: any, tokoId: number) {
  const item = Array.isArray(ret.item) ? ret.item[0] : ret.item;
  const refund = Number(ret.refund_amount) || 0;
  return {
    toko_id: tokoId,
    order_sn: ret.order_sn,
    return_sn: ret.return_sn,
    return_status: ret.status,
    refund_amount: refund,
    nominal: refund,
    reason: ret.reason,
    text_reason: ret.text_reason,
    username_pembeli: ret.user?.username,
    product_name: item?.name,
    created_at: ret.create_time
      ? new Date(ret.create_time * 1000).toISOString()
      : new Date().toISOString(),
  };
}

export async function GET() {
  return NextResponse.json(
    {
      message: "Gunakan metode POST untuk menjalankan sync retur.",
      hint: "Endpoint ini hanya menerima POST. Klik tombol 'Sync Retur' di halaman /shopee/retur.",
    },
    { status: 405 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const tokoList = await fetchToko(null);
    const allReturns: any[] = [];
    const insertedCount = { success: 0, error: 0 };

    const now = Math.floor(Date.now() / 1000);
    const syncFrom = now - SYNC_DAYS * 24 * 3600;

    for (const toko of tokoList) {
      try {
        const accessToken = await getValidToken(toko);
        let windowEnd = now;

        while (windowEnd > syncFrom) {
          const windowStart = Math.max(syncFrom, windowEnd - WINDOW_DAYS * 24 * 3600);
          let pageNo = 1;
          let hasMore = true;

          while (hasMore) {
            const res = await shopeeApi(
              "/api/v2/returns/get_return_list",
              toko.shopee_shop_id,
              accessToken,
              {
                page_no: pageNo,
                page_size: 100,
                create_time_from: windowStart,
                create_time_to: windowEnd,
              }
            );

            logShopeeResponse("sync_returns", toko.nama, res);

            if (res.error) {
              console.error(`Sync returns error for ${toko.nama}:`, res.error, res.message);
              break;
            }

            const returns = extractReturns(res);
            for (const ret of returns) {
              if (!ret?.return_sn) continue;
              allReturns.push(mapReturnItem(ret, toko.id));
            }

            hasMore = Boolean(res.response?.more);
            pageNo++;
            await new Promise((r) => setTimeout(r, 300));
          }

          windowEnd = windowStart;
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch (err) {
        console.error(`Error sync returns for toko ${toko.id}:`, err);
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // Dedupe by return_sn (overlap antar window Shopee kadang terjadi)
    const bySn = new Map<string, any>();
    for (const r of allReturns) {
      if (r.return_sn) bySn.set(String(r.return_sn), r);
    }
    const uniqueReturns = Array.from(bySn.values());

    if (uniqueReturns.length > 0) {
      const { error: upsertError } = await supabase.from("retur_online").upsert(
        uniqueReturns.map((r) => ({
          toko_id: r.toko_id,
          order_sn: r.order_sn,
          return_sn: r.return_sn,
          return_status: r.return_status,
          refund_amount: r.refund_amount,
          nominal: r.nominal,
          reason: r.reason,
          text_reason: r.text_reason,
          username_pembeli: r.username_pembeli,
          product_name: r.product_name,
          created_at: r.created_at,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "return_sn" }
      );

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        insertedCount.error = uniqueReturns.length;
      } else {
        insertedCount.success = uniqueReturns.length;
      }
    }

    return NextResponse.json({
      success: true,
      totalReturns: uniqueReturns.length,
      inserted: insertedCount.success,
      errors: insertedCount.error,
      sample: uniqueReturns.slice(0, 2),
    });
  } catch (err: any) {
    console.error("Sync returns error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
