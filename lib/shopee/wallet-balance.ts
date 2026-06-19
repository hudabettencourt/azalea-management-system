// lib/shopee/wallet-balance.ts — fetch Shopee wallet + income overview (server only).
import { shopeeApi } from "./helper";
export type { WalletBalanceRaw, ParsedWalletBalance } from "./wallet-balance-parse";
export {
  parseWalletBalance,
  latestWalletBalance,
  walletBalanceOk,
  walletBalanceError,
} from "./wallet-balance-parse";

const WINDOW_DAYS = 14;
const MAX_WINDOWS = 12; // ~168 hari ke belakang

async function fetchWalletTransactions(
  shopId: number,
  accessToken: string,
  timeFrom?: number,
  timeTo?: number,
  pageSize = 20,
) {
  const params: Record<string, number> = { page_no: 0, page_size: pageSize };
  if (timeFrom !== undefined && timeTo !== undefined) {
    params.create_time_from = timeFrom;
    params.create_time_to = timeTo;
  }
  return shopeeApi("/api/v2/payment/get_wallet_transaction_list", shopId, accessToken, params);
}

/** Cari snapshot transaksi wallet terbaru; gabungkan beberapa window. */
async function fetchLatestWalletSnapshot(shopId: number, accessToken: string) {
  const now = Math.floor(Date.now() / 1000);
  const attempts: Array<{ timeFrom?: number; timeTo?: number }> = [{}];

  for (let w = 0; w < MAX_WINDOWS; w++) {
    const timeTo = now - w * WINDOW_DAYS * 24 * 3600;
    attempts.push({
      timeFrom: timeTo - WINDOW_DAYS * 24 * 3600,
      timeTo,
    });
  }

  let bestRes: any = null;
  let bestTime = 0;

  for (const window of attempts) {
    const res = await fetchWalletTransactions(
      shopId,
      accessToken,
      window.timeFrom,
      window.timeTo,
    );
    if (res.error) continue;
    const list: any[] = res.response?.transaction_list ?? [];
    if (!list.length) continue;
    const latest = Math.max(...list.map((t) => Number(t?.create_time ?? 0)));
    if (latest > bestTime) {
      bestTime = latest;
      bestRes = res;
    }
  }

  if (bestRes) return bestRes;
  // Kembalikan error terakhir atau respons kosong agar parser bisa bedakan.
  const last = await fetchWalletTransactions(shopId, accessToken);
  return last;
}

const INCOME_STATUS_FILTERS: Array<Record<string, string | number> | undefined> = [
  undefined,
  { income_status: "PENDING" },
  { income_status: "TO_RELEASE" },
  { income_status: 1 },
  { income_status: 2 },
];

export async function fetchWalletBalanceRaw(
  shopId: number,
  accessToken: string,
) {
  const [walletTransactions, ...incomeOverviews] = await Promise.all([
    fetchLatestWalletSnapshot(shopId, accessToken),
    ...INCOME_STATUS_FILTERS.map((params) =>
      shopeeApi("/api/v2/payment/get_income_overview", shopId, accessToken, params ?? {}),
    ),
  ]);

  return {
    income_overview: incomeOverviews[0],
    income_overviews: incomeOverviews,
    wallet_transactions: walletTransactions,
  };
}
