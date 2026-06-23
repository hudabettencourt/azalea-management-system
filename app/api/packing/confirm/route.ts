// POST /api/packing/confirm — konfirmasi scan & bungkus
// Body: { no_pesanan, no_resi?, items, source?, packed_by? }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { PackingConfirmItem } from "@/lib/packing/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const no_pesanan = String(body.no_pesanan || "").trim();
    const no_resi = body.no_resi ? String(body.no_resi).trim() : null;
    const source = body.source === "android" ? "android" : "web";
    const packed_by = body.packed_by ? String(body.packed_by) : null;
    const items = (body.items || []) as PackingConfirmItem[];

    if (!no_pesanan) {
      return NextResponse.json({ error: "no_pesanan wajib" }, { status: 400 });
    }
    if (!items.length || !items.every(i => i.checked)) {
      return NextResponse.json({ error: "Semua item harus dicentang" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("shopee_packing_log")
      .upsert(
        {
          no_pesanan,
          no_resi,
          packed_at: now,
          packed_by,
          source,
          items,
          updated_at: now,
        },
        { onConflict: "no_pesanan" },
      )
      .select("id, packed_at, packed_by, source")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, log: data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Konfirmasi gagal";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
