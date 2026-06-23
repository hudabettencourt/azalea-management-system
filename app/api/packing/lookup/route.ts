// POST /api/packing/lookup — { code: string }
// Lookup pesanan by no_resi atau no_pesanan (untuk web + AzaleaPacking Android)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { lookupOrderByBarcode } from "@/lib/packing/lookup-order";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    if (!code) {
      return NextResponse.json({ error: "code wajib" }, { status: 400 });
    }

    const order = await lookupOrderByBarcode(supabase, code);
    if (!order) {
      return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({ success: true, order });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Lookup gagal";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
