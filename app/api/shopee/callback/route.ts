// app/api/shopee/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/shopee/helper";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const shopId = req.nextUrl.searchParams.get("shop_id");
  const state = req.nextUrl.searchParams.get("state"); // ini toko_id di DB kita

  if (!code || !shopId) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin?shopee=error`);
  }

  try {
    // Tukar code → token
    const tokenData = await getAccessToken(code, parseInt(shopId));
    if (tokenData.error) throw new Error(tokenData.message);

    const expireAt = new Date(Date.now() + tokenData.expire_in * 1000).toISOString();

    // Simpan token ke toko_online
    const { error } = await supabase
      .from("toko_online")
      .update({
        shopee_shop_id: parseInt(shopId),
        shopee_access_token: tokenData.access_token,
        shopee_refresh_token: tokenData.refresh_token,
        shopee_token_expire_at: expireAt,
        shopee_authorized_at: new Date().toISOString(),
      })
      .eq("id", parseInt(state || "0"));

    if (error) throw new Error(error.message);

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin?shopee=success&toko=${state}`);
  } catch (err: any) {
    console.error("Shopee callback error:", err);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin?shopee=error`);
  }
}
