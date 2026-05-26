// app/api/shopee/debug/route.ts
// HAPUS FILE INI SETELAH SELESAI DEBUG!
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET() {
  const PARTNER_ID = parseInt(process.env.SHOPEE_PARTNER_ID || "0");
  const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY || "";
  const timestamp = Math.floor(Date.now() / 1000);
  const path = "/api/v2/shop/auth_partner";
  const baseStr = `${PARTNER_ID}${path}${timestamp}`;
  const sign = crypto.createHmac("sha256", PARTNER_KEY).update(baseStr).digest("hex");

  return NextResponse.json({
    partner_id: PARTNER_ID,
    partner_key_length: PARTNER_KEY.length,
    partner_key_first10: PARTNER_KEY.substring(0, 10),
    timestamp,
    base_string: baseStr,
    sign,
    full_url: `https://partner.test-stable.shopeemobile.com${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}&redirect=https://azalea-management-system.vercel.app/api/shopee/callback&state=1`,
  });
}
