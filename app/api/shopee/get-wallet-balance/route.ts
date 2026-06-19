// app/api/shopee/get-wallet-balance/route.ts
// GET /api/shopee/get-wallet-balance?toko_id=1 (omit for all toko)
// Saldo penjual saat ini: current_balance (wallet) + pending dari income overview.
import { NextRequest, NextResponse } from "next/server";
import { fetchToko, getValidToken, logShopeeResponse, shopeeAdminClient } from "@/lib/shopee/_token";
import {
  fetchWalletBalanceRaw,
  parseWalletBalance,
  walletBalanceOk,
  walletBalanceError,
  type WalletBalanceRaw,
} from "@/lib/shopee/wallet-balance";

/** Fallback pending: total pembayaran pesanan SHIPPED + TO_CONFIRM_RECEIVE per toko. */
async function fetchPendingUangDijalanByToko(): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const [{ data: details }, { data: penjualan }] = await Promise.all([
    shopeeAdminClient
      .from("detail_penjualan_online")
      .select("total_pembayaran, penjualan_online_id")
      .in("status_shopee", ["SHIPPED", "TO_CONFIRM_RECEIVE"]),
    shopeeAdminClient.from("penjualan_online").select("id, toko_id"),
  ]);
  const penjualanMap = new Map((penjualan || []).map((p: any) => [p.id, p.toko_id]));
  for (const d of details || []) {
    const tokoId = penjualanMap.get(d.penjualan_online_id);
    if (!tokoId) continue;
    out.set(tokoId, (out.get(tokoId) || 0) + Number(d.total_pembayaran || 0));
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tokoId = searchParams.get("toko_id");
    const tokoList = await fetchToko(tokoId ? Number(tokoId) : null);
    const pendingDb = await fetchPendingUangDijalanByToko();

    const results: any[] = [];
    for (let i = 0; i < tokoList.length; i++) {
      const toko = tokoList[i];
      try {
        const accessToken = await getValidToken(toko);
        const raw: WalletBalanceRaw = await fetchWalletBalanceRaw(toko.shopee_shop_id, accessToken);
        raw.pending_db = pendingDb.get(toko.id) ?? null;
        const parsed = parseWalletBalance(raw);
        logShopeeResponse("get_income_overview", toko.nama, raw.income_overview);
        logShopeeResponse("get_wallet_transaction_list", toko.nama, raw.wallet_transactions);
        results.push({
          toko_id: toko.id,
          toko: toko.nama,
          ok: walletBalanceOk(raw),
          tersedia: parsed.tersedia,
          pending: parsed.pending,
          tersedia_source: parsed.tersedia_source,
          pending_source: parsed.pending_source,
          raw,
          error: walletBalanceError(raw),
        });
      } catch (err: any) {
        results.push({ toko_id: toko.id, toko: toko.nama, ok: false, error: err.message });
      }
      if (i < tokoList.length - 1) await new Promise((r) => setTimeout(r, 500));
    }
    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
