// app/api/shopee/refresh-token/route.ts
// Dipanggil otomatis via cron/webhook untuk refresh token sebelum expired
import { NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/shopee/helper";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data: tokoList } = await supabase
    .from("toko_online")
    .select("*")
    .eq("platform", "Shopee")
    .eq("aktif", true)
    .not("shopee_refresh_token", "is", null);

  if (!tokoList?.length) return NextResponse.json({ message: "Tidak ada toko" });

  const results = [];
  for (const toko of tokoList) {
    try {
      const expireAt = new Date(toko.shopee_token_expire_at).getTime();
      const hoursLeft = (expireAt - Date.now()) / (1000 * 3600);

      if (hoursLeft > 24) {
        results.push({ toko: toko.nama, status: "skip", hoursLeft: Math.round(hoursLeft) });
        continue;
      }

      const refreshed = await refreshAccessToken(toko.shopee_refresh_token, toko.shopee_shop_id);
      if (refreshed.error) throw new Error(refreshed.message);

      await supabase.from("toko_online").update({
        shopee_access_token: refreshed.access_token,
        shopee_refresh_token: refreshed.refresh_token,
        shopee_token_expire_at: new Date(Date.now() + refreshed.expire_in * 1000).toISOString(),
      }).eq("id", toko.id);

      results.push({ toko: toko.nama, status: "refreshed" });
    } catch (err: any) {
      results.push({ toko: toko.nama, status: "error", message: err.message });
    }
  }

  return NextResponse.json({ success: true, results });
}
