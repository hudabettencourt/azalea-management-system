// app/api/shopee/sync-orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { shopeeApi, refreshAccessToken } from "@/lib/shopee/helper";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ORDER_STATUSES = [
  "READY_TO_SHIP","PROCESSED","SHIPPED","COMPLETED","CANCELLED","IN_CANCEL","UNPAID",
] as const;

const NON_STOCK_STATUSES = new Set(["CANCELLED", "IN_CANCEL", "UNPAID"]);
const SYNC_WINDOW_DAYS = 7;
const DETAIL_BATCH_SIZE = 50;

type ShopeeOrderItem = {
  item_id: number;
  item_name: string;
  item_sku?: string;
  model_id?: number;
  model_name?: string;
  model_sku?: string;
  model_quantity_purchased: number;
  model_discounted_price: number;
};

type ShopeeOrder = {
  order_sn: string;
  order_status: string;
  create_time: number;
  buyer_username?: string;
  shipping_carrier?: string;
  recipient_address?: { full_address?: string };
  package_list?: { tracking_number?: string }[];
  item_list?: ShopeeOrderItem[];
};

function wibDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString("sv", { timeZone: "Asia/Jakarta" });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getValidToken(toko: any) {
  const expireAt = new Date(toko.shopee_token_expire_at).getTime();
  if (expireAt - Date.now() < 3600 * 1000) {
    const refreshed = await refreshAccessToken(toko.shopee_refresh_token, toko.shopee_shop_id);
    if (!refreshed.error && refreshed.access_token) {
      const newExpire = new Date(Date.now() + refreshed.expire_in * 1000).toISOString();
      await supabase.from("toko_online").update({
        shopee_access_token: refreshed.access_token,
        shopee_refresh_token: refreshed.refresh_token,
        shopee_token_expire_at: newExpire,
      }).eq("id", toko.id);
      return refreshed.access_token as string;
    }
  }
  return toko.shopee_access_token;
}

async function fetchOrderSns(shopId: number, accessToken: string, status: string, timeFrom: number, timeTo: number): Promise<string[]> {
  const sns: string[] = [];
  let cursor = "";
  for (let page = 0; page < 50; page++) {
    const params: Record<string, string | number> = {
      time_range_field: "create_time",
      time_from: timeFrom,
      time_to: timeTo,
      page_size: 100,
      order_status: status,
    };
    if (cursor) params.cursor = cursor;
    const res = await shopeeApi("/api/v2/order/get_order_list", shopId, accessToken, params);
    if (res.error) throw new Error(`get_order_list [${status}]: ${res.message || res.error}`);
    const list = res.response?.order_list || [];
    for (const o of list) sns.push(o.order_sn);
    if (!res.response?.more) break;
    cursor = res.response?.next_cursor || "";
    if (!cursor) break;
  }
  return sns;
}

async function fetchOrderDetails(shopId: number, accessToken: string, orderSns: string[]): Promise<ShopeeOrder[]> {
  const orders: ShopeeOrder[] = [];
  for (const batch of chunk(orderSns, DETAIL_BATCH_SIZE)) {
    const res = await shopeeApi("/api/v2/order/get_order_detail", shopId, accessToken, {
      order_sn_list: batch.join(","),
      response_optional_fields: "order_status,create_time,item_list,package_list,buyer_username,shipping_carrier,recipient_address",
    });
    if (res.error) throw new Error(`get_order_detail: ${res.message || res.error}`);
    for (const o of res.response?.order_list || []) orders.push(o as ShopeeOrder);
  }
  return orders;
}

async function syncToko(toko: any) {
  const accessToken = await getValidToken(toko);
  const timeTo = Math.floor(Date.now() / 1000);
  const timeFrom = timeTo - SYNC_WINDOW_DAYS * 24 * 3600;

  const seen = new Set<string>();
  for (const status of ORDER_STATUSES) {
    const sns = await fetchOrderSns(toko.shopee_shop_id, accessToken, status, timeFrom, timeTo);
    for (const sn of sns) seen.add(sn);
  }
  if (seen.size === 0) return { toko: toko.nama, status: "ok", new: 0, updated: 0, skipped_sku: 0 };

  const orders = await fetchOrderDetails(toko.shopee_shop_id, accessToken, Array.from(seen));

  const { data: stokList } = await supabase.from("stok_barang").select("id, sku, nama_produk, jumlah_stok");
  const skuMap = new Map<string, { id: number; jumlah_stok: number; nama_produk: string }>();
  (stokList || []).forEach((s: any) => {
    if (s.sku) skuMap.set(String(s.sku).trim().toUpperCase(), s);
  });

  const noPesananList = Array.from(seen);
  const { data: existingRows } = await supabase
    .from("detail_penjualan_online")
    .select("id, no_pesanan, sku, status_shopee, penjualan_online_id, no_resi, nama_pembeli, jasa_kirim")
    .in("no_pesanan", noPesananList);
  const existingMap = new Map<string, { id: number; status_shopee: string | null; penjualan_online_id: number; no_resi: string | null; nama_pembeli: string | null; jasa_kirim: string | null }>();
  (existingRows || []).forEach((r: any) => {
    existingMap.set(`${r.no_pesanan}|${(r.sku || "").toUpperCase()}`, r);
  });

  const headerCache = new Map<string, number>();
  async function getOrCreateHeader(tanggal: string): Promise<number> {
    if (headerCache.has(tanggal)) return headerCache.get(tanggal)!;
    const { data: ex } = await supabase
      .from("penjualan_online")
      .select("id")
      .eq("toko_id", toko.id)
      .eq("tanggal_upload", tanggal)
      .maybeSingle();
    if (ex?.id) { headerCache.set(tanggal, ex.id); return ex.id; }
    const { data: ins, error } = await supabase
      .from("penjualan_online")
      .insert([{ toko_id: toko.id, total_item: 0, total_nominal: 0, total_ditarik: 0, status: "Belum Ditarik", tanggal_upload: tanggal }])
      .select("id").single();
    if (error || !ins) throw new Error(`Gagal buat header ${tanggal}: ${error?.message}`);
    headerCache.set(tanggal, ins.id);
    return ins.id;
  }

  let newCount = 0, updatedCount = 0, skippedSku = 0;
  const touchedHeaders = new Set<number>();
  const stokDelta = new Map<number, number>();

  for (const order of orders) {
    const tanggal = wibDate(order.create_time);
    const status = order.order_status;
    const noResi = order.package_list?.[0]?.tracking_number || null;
    const namaPembeli = order.buyer_username || null;
    const jasaKirim = order.shipping_carrier || null;
    const alamat = order.recipient_address?.full_address || null;
    const items = order.item_list || [];

    for (const item of items) {
      const sku = (item.model_sku || item.item_sku || "").trim().toUpperCase();
      const matched = sku ? skuMap.get(sku) : undefined;
      const dedupKey = `${order.order_sn}|${sku}`;
      const existing = existingMap.get(dedupKey);

      if (existing) {
        // Update status + field yang mungkin kosong (no_resi, nama_pembeli, jasa_kirim)
        const needsUpdate =
          existing.status_shopee !== status ||
          (!existing.no_resi && noResi) ||
          (!existing.nama_pembeli && namaPembeli) ||
          (!existing.jasa_kirim && jasaKirim);
        if (needsUpdate) {
          await supabase.from("detail_penjualan_online").update({
            status_shopee: status,
            ...(noResi && !existing.no_resi ? { no_resi: noResi } : {}),
            ...(namaPembeli && !existing.nama_pembeli ? { nama_pembeli: namaPembeli } : {}),
            ...(jasaKirim && !existing.jasa_kirim ? { jasa_kirim: jasaKirim } : {}),
          }).eq("id", existing.id);
          updatedCount++;
        }
        continue;
      }

      if (!matched) { skippedSku++; continue; }

      const headerId = await getOrCreateHeader(tanggal);
      const qty = item.model_quantity_purchased;
      const harga = Math.round(item.model_discounted_price);
      const total = harga * qty;

      const { error: errIns } = await supabase.from("detail_penjualan_online").insert([{
        penjualan_online_id: headerId,
        stok_barang_id: matched.id,
        no_pesanan: order.order_sn,
        no_resi: noResi,
        sku,
        qty,
        harga_satuan: harga,
        total_pembayaran: total,
        tanggal_pesanan: tanggal,
        status_shopee: status,
        nama_pembeli: namaPembeli,
        jasa_kirim: jasaKirim,
        alamat,
      }]);
      if (errIns) { skippedSku++; continue; }
      newCount++;
      touchedHeaders.add(headerId);
      if (!NON_STOCK_STATUSES.has(status)) {
        stokDelta.set(matched.id, (stokDelta.get(matched.id) || 0) + qty);
      }
    }
  }

  for (const headerId of touchedHeaders) {
    const { data: agg } = await supabase
      .from("detail_penjualan_online")
      .select("qty, total_pembayaran")
      .eq("penjualan_online_id", headerId);
    const totalItem = (agg || []).reduce((a: number, r: any) => a + (r.qty || 0), 0);
    const totalNominal = (agg || []).reduce((a: number, r: any) => a + (r.total_pembayaran || 0), 0);
    await supabase.from("penjualan_online").update({ total_item: totalItem, total_nominal: totalNominal }).eq("id", headerId);
  }

  for (const [stokId, totalKeluar] of stokDelta) {
    const produk = Array.from(skuMap.values()).find(s => s.id === stokId);
    if (!produk) continue;
    await supabase.from("stok_barang").update({ jumlah_stok: produk.jumlah_stok - totalKeluar }).eq("id", stokId);
    await supabase.from("mutasi_stok").insert([{
      stok_barang_id: stokId,
      tipe: "Keluar",
      qty: totalKeluar,
      keterangan: `Sync Shopee ${toko.nama} (API)`,
    }]);
  }

  return { toko: toko.nama, status: "ok", new: newCount, updated: updatedCount, skipped_sku: skippedSku, total_fetched: orders.length };
}

export async function POST(req: NextRequest) {
  try {
    const { toko_id } = await req.json().catch(() => ({}));
    const query = supabase.from("toko_online")
      .select("*")
      .eq("platform", "Shopee")
      .eq("aktif", true)
      .not("shopee_access_token", "is", null);
    if (toko_id) query.eq("id", toko_id);
    const { data: tokoList, error } = await query;
    if (error || !tokoList?.length) return NextResponse.json({ error: "Toko tidak ditemukan" }, { status: 404 });
    const results: any[] = [];
    for (let i = 0; i < tokoList.length; i++) {
      const toko = tokoList[i];
      try { results.push(await syncToko(toko)); }
      catch (err: any) { results.push({ toko: toko.nama, status: "error", message: err.message }); }
      if (i < tokoList.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
