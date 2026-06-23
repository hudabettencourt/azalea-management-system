// POST /api/packing/confirm — konfirmasi scan & bungkus (auth + validasi server)
// Body: { no_pesanan, no_resi?, items, source? }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/require-user";
import { confirmPackedOrder } from "@/lib/packing/confirm-packed";
import type { PackingConfirmItem } from "@/lib/packing/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const no_pesanan = String(body.no_pesanan || "").trim();
    const no_resi = body.no_resi ? String(body.no_resi).trim() : null;
    const source = body.source === "android" ? "android" : "web";
    const items = (body.items || []) as PackingConfirmItem[];

    const log = await confirmPackedOrder(supabase, {
      no_pesanan,
      no_resi,
      items,
      source,
      packed_by: auth.user.email,
    });

    return NextResponse.json({ success: true, log });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Konfirmasi gagal";
    const status =
      msg.includes("tidak ditemukan") || msg.includes("tidak valid") || msg.includes("tidak sesuai")
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
