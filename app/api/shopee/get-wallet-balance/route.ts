// app/api/shopee/get-wallet-balance/route.ts
// GET /api/shopee/get-wallet-balance?toko_id=1 (omit for all toko)
// Saldo tersedia + pending via get_income_overview; fallback saldo wallet dari
// get_wallet_transaction_list (current_balance transaksi terbaru).
import { NextRequest, NextResponse } from "next/server";
import { fetchToko, getValidToken, logShopeeResponse } from "@/lib/shopee/_token";
import {
  fetchWalletBalanceRaw,
  walletBalanceOk,
  walletBalanceError,
} from "@/lib/shopee/wallet-balance";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tokoId = searchParams.get("toko_id");
    const tokoList = await fetchToko(tokoId ? Number(tokoId) : null);

    const results: any[] = [];
    for (let i = 0; i < tokoList.length; i++) {
      const toko = tokoList[i];
      try {
        const accessToken = await getValidToken(toko);
        const raw = await fetchWalletBalanceRaw(toko.shopee_shop_id, accessToken);
        logShopeeResponse("get_income_overview", toko.nama, raw.income_overview);
        logShopeeResponse("get_wallet_transaction_list", toko.nama, raw.wallet_transactions);
        results.push({
          toko_id: toko.id,
          toko: toko.nama,
          ok: walletBalanceOk(raw),
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
