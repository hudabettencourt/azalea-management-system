// GET /api/shopee/uang-di-jalan — pesanan di jalan (exclude rekap status Masuk)

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/require-user";
import { fetchUangDiJalanData } from "@/lib/shopee/uang-di-jalan";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const result = await fetchUangDiJalanData(supabase);
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal load uang di jalan";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
