// app/api/shopee/auth/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateAuthUrl } from "@/lib/shopee/helper";

export async function GET(req: NextRequest) {
  const tokoId = req.nextUrl.searchParams.get("toko_id");
  if (!tokoId) return NextResponse.json({ error: "toko_id required" }, { status: 400 });

  // State = toko_id, untuk identify toko saat callback
  const authUrl = generateAuthUrl(tokoId);
  return NextResponse.redirect(authUrl);
}
