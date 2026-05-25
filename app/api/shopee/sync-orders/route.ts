// app/api/shopee/sync-orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { shopeeApi, refreshAccessToken } from "@/lib/shopee/helper";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getValidToken(toko: any) {
  // Cek apakah token akan expire dalam 1 jam
  const expireAt = new Date(toko.shopee_token_expire_at).getTime();
  const now = Date.now();
  if (expireAt - now < 3600 * 1000) {
    // Refresh token
    const refreshed = await refreshAccessToken(toko.shopee_refresh_token, toko.shopee_shop_id);
    if (!refreshed.error) {
      const newExpire = new Date(Date.now() + refreshed.expire_in * 1000).toISOString();
      await supabase.from("toko_online").update({
        shopee_access_token: refreshed.access_token,
        shopee_refresh_token: refreshed.refresh_token,
        shopee_token_expire_at: newExpire,
      }).eq("id", toko.id);
      return refreshed.access_token;
    }
  }
  return toko.shopee_access_token;
}

export async function POST(req: NextRequest) {
  try {
    const { toko_id } = await req.json();

    // Ambil data toko
    const query = supabase.from("toko_online")
      .select("*")
      .eq("platform", "Shopee")
      .eq("aktif", true)
      .not("shopee_access_token", "is", null);

    if (toko_id) query.eq("id", toko_id);

    const { data: tokoList, error } = await query;
    if (error || !tokoList?.length) return NextResponse.json({ error: "Toko tidak ditemukan" }, { status: 404 });

    const results = [];

    for (const toko of tokoList) {
      try {
        const accessToken = await getValidToken(toko);

        // Ambil list order (status: READY_TO_SHIP, SHIPPED, COMPLETED)
        const timeFrom = Math.floor(Date.now() / 1000) - 7 * 24 * 3600; // 7 hari terakhir
        const timeTo = Math.floor(Date.now() / 1000);

        const ordersRes = await shopeeApi("/api/v2/order/get_order_list", toko.shopee_shop_id, accessToken, {
          time_range_field: "create_time",
          time_from: timeFrom,
          time_to: timeTo,
          page_size: 100,
          order_status: "READY_TO_SHIP",
          response_optional_fields: "order_status",
        });

        if (ordersRes.error) {
          results.push({ toko: toko.nama, status: "error", message: ordersRes.message });
          continue;
        }

        const orderList = ordersRes.response?.order_list || [];
        if (!orderList.length) {
          results.push({ toko: toko.nama, status: "ok", new: 0 });
          continue;
        }

        // Ambil detail order
        const orderSns = orderList.map((o: any) => o.order_sn);
        const detailRes = await shopeeApi("/api/v2/order/get_order_detail", toko.shopee_shop_id, accessToken, {
          order_sn_list: orderSns.join(","),
          response_optional_fields: "buyer_user_id,buyer_username,estimated_shipping_fee,recipient_address,actual_shipping_fee,item_list,pay_time,dropshipper,dropshipper_phone,split_up,buyer_cancel_reason,cancel_by,cancel_reason,actual_shipping_fee_confirmed,buyer_cpf_id,fulfillment_flag,pickup_done_time,package_list,invoice_data,checkout_shipping_carrier,payment_method",
        });

        const orders = detailRes.response?.order_list || [];
        let newCount = 0;

        for (const order of orders) {
          // Cek apakah sudah ada di DB
          const { data: existing } = await supabase
            .from("penjualan_online")
            .select("id")
            .eq("order_sn", order.order_sn)
            .single();

          if (existing) continue;

          // Insert pesanan baru
          const { data: inserted } = await supabase.from("penjualan_online").insert([{
            toko_id: toko.id,
            order_sn: order.order_sn,
            status: order.order_status,
            tanggal: new Date(order.create_time * 1000).toISOString(),
            nama_pembeli: order.buyer_username,
            total_harga: order.total_amount,
            ongkir: order.actual_shipping_fee || 0,
            catatan: order.note || null,
            sumber: "api",
          }]).select().single();

          if (inserted && order.item_list?.length) {
            // Insert detail items
            const items = order.item_list.map((item: any) => ({
              penjualan_id: inserted.id,
              nama_produk: item.item_name,
              variasi: item.model_name || null,
              qty: item.model_quantity_purchased,
              harga_satuan: item.model_discounted_price,
              subtotal: item.model_discounted_price * item.model_quantity_purchased,
              shopee_item_id: item.item_id,
            }));
            await supabase.from("detail_penjualan_online").insert(items);
          }

          newCount++;
        }

        results.push({ toko: toko.nama, status: "ok", new: newCount, total: orders.length });
      } catch (err: any) {
        results.push({ toko: toko.nama, status: "error", message: err.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
