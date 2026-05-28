// app/api/shopee/confirm-return/route.ts
// POST /api/shopee/confirm-return
// Body: { toko_id, return_sn, items?: [{ sku, qty }] }
// Calls Shopee /api/v2/returns/confirm_return. On success, if items are
// provided, restores stock in stok_barang and logs mutasi_stok rows so
// inventory stays consistent with what came back.
import { NextRequest, NextResponse } from "next/server";
import { shopeeApiPost } from "@/lib/shopee/helper";
import { fetchToko, getValidToken, logShopeeResponse, shopeeAdminClient as supabase } from "@/lib/shopee/_token";

type ReturItem = { sku: string; qty: number };
type Body = { toko_id: number; return_sn: string; items?: ReturItem[] };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body.toko_id || !body.return_sn) {
      return NextResponse.json({ error: "toko_id dan return_sn wajib" }, { status: 400 });
    }
    const [toko] = await fetchToko(body.toko_id);
    const accessToken = await getValidToken(toko);

    const res = await shopeeApiPost(
      "/api/v2/returns/confirm_return",
      toko.shopee_shop_id,
      accessToken,
      { return_sn: body.return_sn },
    );
    logShopeeResponse("confirm_return", toko.nama, res);

    if (res.error) {
      return NextResponse.json({
        success: false, toko: toko.nama, raw: res,
        error: res.message || res.error,
      });
    }

    // Restore stock for each returned SKU. SKU lookup is case-insensitive
    // because Shopee SKUs aren't normalized at upload time.
    const restored: { sku: string; qty: number; stok_id: number; nama_produk: string }[] = [];
    const missingSkus: string[] = [];
    for (const item of body.items || []) {
      const sku = (item.sku || "").trim();
      const qty = Number(item.qty || 0);
      if (!sku || qty <= 0) continue;

      const { data: stok } = await supabase
        .from("stok_barang")
        .select("id, jumlah_stok, nama_produk")
        .ilike("sku", sku)
        .limit(1)
        .maybeSingle();
      if (!stok) {
        missingSkus.push(sku);
        continue;
      }
      await supabase.from("stok_barang")
        .update({ jumlah_stok: (stok.jumlah_stok || 0) + qty })
        .eq("id", stok.id);
      await supabase.from("mutasi_stok").insert([{
        stok_barang_id: stok.id,
        tipe: "Masuk",
        qty,
        keterangan: `Retur Shopee ${body.return_sn} (${toko.nama})`,
      }]);
      restored.push({ sku, qty, stok_id: stok.id, nama_produk: stok.nama_produk });
    }

    return NextResponse.json({
      success: true, toko: toko.nama, raw: res,
      restored, missing_skus: missingSkus,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
