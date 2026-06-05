// /app/api/stok/check-minimum/route.ts
// GET /api/stok/check-minimum
// Cek semua produk yang stoknya <= stok_minimum, kirim notif Telegram
// Dipanggil oleh GitHub Actions setiap hari jam 07:00 WIB

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegram } from "@/lib/telegram";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("stok_barang")
      .select("id, nama_produk, sku, jumlah_stok, stok_minimum")
      .not("stok_minimum", "is", null)
      .gt("stok_minimum", 0);

    if (error) throw new Error(error.message);

    const kritis = (data || []).filter(
      (p: any) => p.jumlah_stok <= p.stok_minimum
    );

    if (kritis.length === 0) {
      return NextResponse.json({ ok: true, kritis: 0, message: "Semua stok aman" });
    }

    const lines = kritis.map((p: any) => {
      const icon = p.jumlah_stok <= 0 ? "🔴" : "🟡";
      const status = p.jumlah_stok <= 0 ? "HABIS" : "HAMPIR HABIS";
      return `${icon} ${p.nama_produk}${p.sku ? ` (${p.sku})` : ""}\n   Stok: ${p.jumlah_stok} | Min: ${p.stok_minimum} → ${status}`;
    });

    const message = [
      `⚠️ *ALERT STOK MINIMUM*`,
      `${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })}`,
      ``,
      ...lines,
      ``,
      `📦 ${kritis.length} produk perlu perhatian`,
    ].join("\n");

    await sendTelegram(message);

    return NextResponse.json({ ok: true, kritis: kritis.length, produk: kritis });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
