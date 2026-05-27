// app/api/shopee/push-stok/route.ts
// Push stok virtual ke Shopee per toko. Resolusi item_id otomatis via SKU
// (get_item_list → get_item_base_info / get_model_list), hasil di-cache di
// shopee_item_mapping. Body: { distribusi_id? , pool_id? } — kosong = semua.
import { NextRequest, NextResponse } from "next/server";
import { shopeeApi, shopeeApiPost, refreshAccessToken } from "@/lib/shopee/helper";
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

async function fetchAllItemIds(shopId: number, accessToken: string): Promise<number[]> {
  const ids: number[] = [];
  let offset = 0;
  for (let p = 0; p < 100; p++) {
    const res = await shopeeApi("/api/v2/product/get_item_list", shopId, accessToken, {
      offset,
      page_size: 100,
      item_status: "NORMAL",
    });
    if (res.error) throw new Error(`get_item_list: ${res.message || res.error}`);
    const list = res.response?.item || [];
    for (const it of list) ids.push(it.item_id);
    if (!res.response?.has_next_page) break;
    offset = res.response?.next_offset || offset + list.length;
    if (list.length === 0) break;
  }
  return ids;
}

type BaseInfo = { item_id: number; item_sku?: string; has_model?: boolean };

async function fetchItemBaseInfo(shopId: number, accessToken: string, itemIds: number[]): Promise<BaseInfo[]> {
  const out: BaseInfo[] = [];
  for (let i = 0; i < itemIds.length; i += 50) {
    const batch = itemIds.slice(i, i + 50);
    const res = await shopeeApi("/api/v2/product/get_item_base_info", shopId, accessToken, {
      item_id_list: batch.join(","),
    });
    if (res.error) throw new Error(`get_item_base_info: ${res.message || res.error}`);
    for (const it of res.response?.item_list || []) out.push(it);
  }
  return out;
}

async function fetchModelSkuMap(shopId: number, accessToken: string, itemId: number): Promise<Map<string, number>> {
  // SKU upper-cased → model_id
  const res = await shopeeApi("/api/v2/product/get_model_list", shopId, accessToken, { item_id: itemId });
  if (res.error) throw new Error(`get_model_list: ${res.message || res.error}`);
  const map = new Map<string, number>();
  for (const m of res.response?.model || []) {
    if (m.model_sku) map.set(String(m.model_sku).trim().toUpperCase(), m.model_id);
  }
  return map;
}

async function resolveSkuForToko(
  toko: any,
  accessToken: string,
  targets: { stok_barang_id: number; sku: string }[],
): Promise<Map<number, { item_id: number; model_id: number | null }>> {
  const result = new Map<number, { item_id: number; model_id: number | null }>();
  const stokIds = targets.map(t => t.stok_barang_id);

  // 1. Cache lookup
  const { data: cached } = await supabase
    .from("shopee_item_mapping")
    .select("stok_barang_id, item_id, model_id")
    .eq("toko_id", toko.id)
    .in("stok_barang_id", stokIds);
  for (const c of cached || []) {
    result.set(c.stok_barang_id, { item_id: c.item_id, model_id: c.model_id });
  }

  const missing = targets.filter(t => !result.has(t.stok_barang_id));
  if (missing.length === 0) return result;

  // 2. Fetch full catalog for toko
  const allIds = await fetchAllItemIds(toko.shopee_shop_id, accessToken);
  if (allIds.length === 0) return result;
  const baseInfos = await fetchItemBaseInfo(toko.shopee_shop_id, accessToken, allIds);

  // 3. Match by item-level SKU
  const itemBySku = new Map<string, BaseInfo>();
  for (const info of baseInfos) {
    if (info.item_sku) itemBySku.set(String(info.item_sku).trim().toUpperCase(), info);
  }

  const toCache: any[] = [];
  for (const t of missing) {
    const sku = t.sku.trim().toUpperCase();
    let item = itemBySku.get(sku);
    let modelId: number | null = null;

    if (!item) {
      // Cari di model SKU — perlu loop tiap item_with_model
      for (const info of baseInfos) {
        if (!info.has_model) continue;
        const modelMap = await fetchModelSkuMap(toko.shopee_shop_id, accessToken, info.item_id);
        const found = modelMap.get(sku);
        if (found !== undefined) {
          item = info;
          modelId = found;
          break;
        }
      }
    } else if (item.has_model) {
      // Item SKU match di parent — tapi punya varian. Ambil model pertama? Lebih aman skip.
      const modelMap = await fetchModelSkuMap(toko.shopee_shop_id, accessToken, item.item_id);
      const found = modelMap.get(sku);
      modelId = found !== undefined ? found : null;
    }

    if (item) {
      result.set(t.stok_barang_id, { item_id: item.item_id, model_id: modelId });
      toCache.push({
        toko_id: toko.id,
        stok_barang_id: t.stok_barang_id,
        item_id: item.item_id,
        model_id: modelId,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (toCache.length > 0) {
    await supabase.from("shopee_item_mapping").upsert(toCache, { onConflict: "toko_id,stok_barang_id" });
  }
  return result;
}

async function pushOne(
  toko: any,
  accessToken: string,
  itemId: number,
  modelId: number | null,
  stock: number,
) {
  const body: any = {
    item_id: itemId,
    stock_list: [
      {
        model_id: modelId ?? 0,
        seller_stock: [{ stock }],
      },
    ],
  };
  return await shopeeApiPost("/api/v2/product/update_stock", toko.shopee_shop_id, accessToken, body);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { distribusi_id, pool_id } = body as { distribusi_id?: number; pool_id?: number };

    // Ambil distribusi target + join stok_barang.sku
    let q = supabase
      .from("shopee_stok_distribusi")
      .select("id, pool_id, toko_id, stok_barang_id, jumlah, stok_barang:stok_barang_id(sku, nama_produk)");
    if (distribusi_id) q = q.eq("id", distribusi_id);
    else if (pool_id) q = q.eq("pool_id", pool_id);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (!rows?.length) return NextResponse.json({ error: "Distribusi tidak ditemukan" }, { status: 404 });

    // Group by toko_id
    const byToko = new Map<number, typeof rows>();
    for (const r of rows) {
      const arr = byToko.get(r.toko_id) || [];
      arr.push(r);
      byToko.set(r.toko_id, arr);
    }

    // Ambil semua toko sekaligus
    const tokoIds = Array.from(byToko.keys());
    const { data: tokoData } = await supabase
      .from("toko_online")
      .select("*")
      .in("id", tokoIds);
    const tokoMap = new Map<number, any>((tokoData || []).map((t: any) => [t.id, t]));

    const results: any[] = [];
    let idx = 0;
    for (const [tokoId, groupRows] of byToko) {
      const toko = tokoMap.get(tokoId);
      if (!toko || !toko.shopee_access_token) {
        for (const r of groupRows) {
          await supabase.from("shopee_stok_distribusi")
            .update({ last_pushed_at: new Date().toISOString(), last_push_status: "error: toko belum connect" })
            .eq("id", r.id);
          results.push({ distribusi_id: r.id, toko: toko?.nama || tokoId, status: "error", message: "toko belum connect" });
        }
        continue;
      }
      try {
        const accessToken = await getValidToken(toko);
        const targets = groupRows
          .filter((r: any) => r.stok_barang?.sku)
          .map((r: any) => ({ stok_barang_id: r.stok_barang_id, sku: r.stok_barang.sku as string }));
        const mapping = await resolveSkuForToko(toko, accessToken, targets);

        for (const r of groupRows) {
          const m = mapping.get(r.stok_barang_id);
          if (!m) {
            await supabase.from("shopee_stok_distribusi")
              .update({ last_pushed_at: new Date().toISOString(), last_push_status: "error: SKU tidak ditemukan di Shopee" })
              .eq("id", r.id);
            results.push({ distribusi_id: r.id, toko: toko.nama, status: "error", message: "SKU tidak ditemukan di Shopee" });
            continue;
          }
          const apiRes = await pushOne(toko, accessToken, m.item_id, m.model_id, r.jumlah);
          if (apiRes.error) {
            await supabase.from("shopee_stok_distribusi")
              .update({ last_pushed_at: new Date().toISOString(), last_push_status: `error: ${apiRes.message || apiRes.error}` })
              .eq("id", r.id);
            results.push({ distribusi_id: r.id, toko: toko.nama, status: "error", message: apiRes.message || apiRes.error });
          } else {
            await supabase.from("shopee_stok_distribusi")
              .update({ last_pushed_at: new Date().toISOString(), last_push_status: "ok" })
              .eq("id", r.id);
            results.push({ distribusi_id: r.id, toko: toko.nama, status: "ok", stock: r.jumlah });
          }
        }
      } catch (err: any) {
        for (const r of groupRows) {
          await supabase.from("shopee_stok_distribusi")
            .update({ last_pushed_at: new Date().toISOString(), last_push_status: `error: ${err.message}` })
            .eq("id", r.id);
          results.push({ distribusi_id: r.id, toko: toko.nama, status: "error", message: err.message });
        }
      }
      idx++;
      if (idx < byToko.size) await new Promise(r => setTimeout(r, 500));
    }

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
