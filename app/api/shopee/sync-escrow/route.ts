// app/api/shopee/sync-escrow/route.ts
// GET /api/shopee/sync-escrow
// Fetch escrow detail untuk semua pesanan COMPLETED yang belum ada data escrow
// Auto-pause jika pending > PAUSE_THRESHOLD
// Dipanggil GitHub Actions setiap jam

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { shopeeApi } from "@/lib/shopee/helper";
import { fetchToko, getValidToken } from "@/lib/shopee/_token";
import { sendTelegram } from "@/lib/telegram";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAUSE_THRESHOLD = 500; // auto-pause jika pending > ini
const DELAY_MS = 200; // delay antar API call
const MAX_PER_RUN = 100; // max fetch per run per toko

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function GET() {
  try {
    // Cek apakah sync enabled
    const { data: settingEnabled } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "escrow_sync_enabled")
      .single();

    if (settingEnabled?.value === "false") {
      return NextResponse.json({ ok: false, paused: true, reason: "Manual pause" });
    }

    // Ambil semua toko aktif
    const { data: tokoList } = await supabase
      .from("toko_online")
      .select("*")
      .eq("platform", "Shopee")
      .eq("aktif", true)
      .not("shopee_access_token", "is", null);

    if (!tokoList?.length) {
      return NextResponse.json({ ok: true, message: "Tidak ada toko aktif" });
    }

    // Cek total pesanan COMPLETED yang belum ada escrow
    const { data: existingEscrow } = await supabase
      .from("escrow_detail")
      .select("order_sn");
    const existingSet = new Set((existingEscrow || []).map((e: any) => e.order_sn));

    const { data: completedOrders } = await supabase
      .from("detail_penjualan_online")
      .select("no_pesanan, penjualan_online_id")
      .eq("status_shopee", "COMPLETED");

    const pending = (completedOrders || []).filter(
      (o: any) => !existingSet.has(o.no_pesanan)
    );

    // Auto-pause jika terlalu banyak
    if (pending.length > PAUSE_THRESHOLD) {
      // Update setting
      await supabase.from("app_settings")
        .update({ value: "false", updated_at: new Date().toISOString() })
        .eq("key", "escrow_sync_enabled");

      const reason = `Auto-pause: ${pending.length} pesanan pending melebihi batas ${PAUSE_THRESHOLD}`;
      await supabase.from("app_settings")
        .update({ value: reason, updated_at: new Date().toISOString() })
        .eq("key", "escrow_sync_pause_reason");

      // Kirim Telegram
      await sendTelegram(
        `🚨 *ESCROW SYNC DIHENTIKAN OTOMATIS*\n\n` +
        `📦 ${pending.length} pesanan pending melebihi batas ${PAUSE_THRESHOLD}\n\n` +
        `⚠️ Gunakan *Upload Excel My Balance* untuk rekap saldo.\n\n` +
        `Untuk mengaktifkan kembali, buka Admin → Pengaturan → Escrow Sync.`
      );

      return NextResponse.json({
        ok: false,
        paused: true,
        auto_paused: true,
        pending_count: pending.length,
        reason,
      });
    }

    // Proses per toko
    const results: any[] = [];

    for (const toko of tokoList) {
      let fetched = 0;
      let errors = 0;

      // Ambil pesanan COMPLETED toko ini yang belum ada escrow
      const { data: penjualanToko } = await supabase
        .from("penjualan_online")
        .select("id")
        .eq("toko_id", toko.id);

      const penjualanIds = (penjualanToko || []).map((p: any) => p.id);
      if (!penjualanIds.length) continue;

      const { data: ordersToko } = await supabase
        .from("detail_penjualan_online")
        .select("no_pesanan")
        .eq("status_shopee", "COMPLETED")
        .in("penjualan_online_id", penjualanIds);

      const pendingToko = (ordersToko || [])
        .filter((o: any) => !existingSet.has(o.no_pesanan))
        .slice(0, MAX_PER_RUN);

      if (!pendingToko.length) {
        results.push({ toko: toko.nama, fetched: 0, errors: 0, message: "Semua sudah sync" });
        continue;
      }

      try {
        const accessToken = await getValidToken(toko);

        for (const order of pendingToko) {
          try {
            const res = await shopeeApi(
              "/api/v2/payment/get_escrow_detail",
              toko.shopee_shop_id,
              accessToken,
              { order_sn: order.no_pesanan }
            );

            if (res.error || !res.response?.order_income) {
              errors++;
              await sleep(DELAY_MS);
              continue;
            }

            const income = res.response.order_income;

            await supabase.from("escrow_detail").upsert({
              toko_id: toko.id,
              order_sn: order.no_pesanan,
              escrow_amount: Math.round(income.escrow_amount || 0),
              commission_fee: Math.round(income.commission_fee || 0),
              service_fee: Math.round(income.service_fee || 0),
              seller_discount: Math.round(income.seller_discount || 0),
              voucher_from_seller: Math.round(income.voucher_from_seller || 0),
              buyer_total_amount: Math.round(res.response.buyer_payment_info?.buyer_total_amount || 0),
              fetched_at: new Date().toISOString(),
            }, { onConflict: "order_sn" });

            existingSet.add(order.no_pesanan);
            fetched++;
          } catch {
            errors++;
          }
          await sleep(DELAY_MS);
        }
      } catch (err: any) {
        results.push({ toko: toko.nama, fetched: 0, errors: 1, message: err.message });
        continue;
      }

      results.push({ toko: toko.nama, fetched, errors, pending: pendingToko.length });
    }

    const totalFetched = results.reduce((a, r) => a + (r.fetched || 0), 0);

    return NextResponse.json({
      ok: true,
      paused: false,
      pending_before: pending.length,
      results,
      total_fetched: totalFetched,
    });

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

// POST — toggle pause/resume manual
export async function POST(req: Request) {
  try {
    const { enabled, reason } = await req.json();
    await supabase.from("app_settings")
      .update({ value: enabled ? "true" : "false", updated_at: new Date().toISOString() })
      .eq("key", "escrow_sync_enabled");

    if (!enabled && reason) {
      await supabase.from("app_settings")
        .update({ value: reason, updated_at: new Date().toISOString() })
        .eq("key", "escrow_sync_pause_reason");
    }

    if (enabled) {
      await supabase.from("app_settings")
        .update({ value: "", updated_at: new Date().toISOString() })
        .eq("key", "escrow_sync_pause_reason");
    }

    return NextResponse.json({ ok: true, enabled });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
