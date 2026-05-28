// app/api/shopee/get-stok-per-toko/route.ts
// Ambil stok terkini dari Shopee per toko untuk produk tertentu (by stok_barang_id)
import { NextRequest, NextResponse } from "next/server";
import { shopeeApi, refreshAccessToken } from "@/lib/shopee/helper";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getValidToken(toko: any) {
  const expireAt = new Date(toko.shopee_token_expire_at).getTime();
  if (expireAt - Date.now() < 3600 * 1000) {
    const refreshed = await refreshAccessToken(toko.shopee_refresh_token, toko.shopee_shop_id);
    if (!refreshed.error && refreshed.access_token) {
      await supabase.from("toko_online").update({
        shopee_access_token: refreshed.access_token,
        shopee_refresh_token: refreshed.refresh_token,
        shopee_token_expire_at: new Date(Date.now() + refreshed.expire_in * 1000).toISOString(),
      }).eq("id", toko.id);
      return refreshed.access_token as string;
    }
  }
  return toko.shopee_access_token;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stokBarangId = parseInt(searchParams.get("stok_barang_id") || "0");
    if (!stokBarangId) return NextResponse.json({ error: "stok_barang_id required" }, { status: 400 });

    // Ambil SKU produk
    const { data: stokBarang } = await supabase
      .from("stok_barang")
      .select("sku")
      .eq("id", stokBarangId)
      .single();
    if (!stokBarang?.sku) return NextResponse.json({ error: "SKU tidak ditemukan" }, { status: 404 });

    const sku = stokBarang.sku.trim().toUpperCase();

    // Ambil semua toko connected
    const { data: tokoList } = await supabase
      .from("toko_online")
      .select("*")
      .eq("platform", "Shopee")
      .eq("aktif", true)
      .not("shopee_access_token", "is", null);

    if (!tokoList?.length) return NextResponse.json({ stok: {} });

    const stokPerToko: Record<number, number> = {};

    for (const toko of tokoList) {
      try {
        const accessToken = await getValidToken(toko);

        // Cek cache mapping dulu
        const { data: cached } = await supabase
          .from("shopee_item_mapping")
          .select("item_id, model_id")
          .eq("toko_id", toko.id)
          .eq("stok_barang_id", stokBarangId)
          .maybeSingle();

        let itemId: number | null = cached?.item_id || null;
        let modelId: number | null = cached?.model_id || null;

        // Kalau tidak ada di cache, cari via get_item_list
        if (!itemId) {
          let offset = 0;
          let found = false;
          outer: for (let p = 0; p < 10; p++) {
            const listRes = await shopeeApi("/api/v2/product/get_item_list", toko.shopee_shop_id, accessToken, {
              offset, page_size: 50, item_status: "NORMAL",
            });
            if (listRes.error) break;
            const items = listRes.response?.item || [];
            if (!items.length) break;

            const ids = items.map((it: any) => it.item_id);
            const baseRes = await shopeeApi("/api/v2/product/get_item_base_info", toko.shopee_shop_id, accessToken, {
              item_id_list: ids.join(","),
            });

            for (const item of baseRes.response?.item_list || []) {
              // Cek item SKU
              if (item.item_sku && item.item_sku.trim().toUpperCase() === sku) {
                itemId = item.item_id;
                modelId = null;
                found = true;
                break outer;
              }
              // Cek model SKU
              if (item.has_model) {
                const modelRes = await shopeeApi("/api/v2/product/get_model_list", toko.shopee_shop_id, accessToken, { item_id: item.item_id });
                for (const m of modelRes.response?.model || []) {
                  if (m.model_sku && m.model_sku.trim().toUpperCase() === sku) {
                    itemId = item.item_id;
                    modelId = m.model_id;
                    found = true;
                    break outer;
                  }
                }
              }
            }

            if (!listRes.response?.has_next_page) break;
            offset = listRes.response?.next_offset || offset + items.length;
          }

          // Simpan ke cache kalau ketemu
          if (itemId) {
            await supabase.from("shopee_item_mapping").upsert({
              toko_id: toko.id, stok_barang_id: stokBarangId,
              item_id: itemId, model_id: modelId,
              updated_at: new Date().toISOString(),
            }, { onConflict: "toko_id,stok_barang_id" });
          }
        }

        if (!itemId) {
          stokPerToko[toko.id] = 0;
          continue;
        }

        // Ambil stok terkini
        const infoRes = await shopeeApi("/api/v2/product/get_item_base_info", toko.shopee_shop_id, accessToken, {
          item_id_list: String(itemId),
          need_tax_info: false,
        });
        const item = infoRes.response?.item_list?.[0];
        if (!item) { stokPerToko[toko.id] = 0; continue; }

        if (modelId) {
          const modelRes = await shopeeApi("/api/v2/product/get_model_list", toko.shopee_shop_id, accessToken, { item_id: itemId });
          const model = (modelRes.response?.model || []).find((m: any) => m.model_id === modelId);
          stokPerToko[toko.id] = model?.stock_info_v2?.seller_stock?.[0]?.stock
            ?? model?.stock_info?.[0]?.current_stock ?? 0;
        } else {
          stokPerToko[toko.id] = item.stock_info_v2?.seller_stock?.[0]?.stock
            ?? item.stock_info?.[0]?.current_stock ?? 0;
        }

        // Delay antar toko supaya tidak kena rate limit
        await new Promise(r => setTimeout(r, 300));
      } catch {
        stokPerToko[toko.id] = 0;
      }
    }

    return NextResponse.json({ stok: stokPerToko });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
