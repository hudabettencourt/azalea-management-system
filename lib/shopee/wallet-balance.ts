// lib/shopee/wallet-balance.ts — fetch Shopee wallet + income overview (server only).
import { shopeeApi } from "./helper";
import { latestWalletBalance } from "./wallet-balance-parse";
export type { WalletBalanceRaw, ParsedWalletBalance } from "./wallet-balance-parse";
export {
  parseWalletBalance,
  latestWalletBalance,
  walletBalanceOk,
  walletBalanceError,
} from "./wallet-balance-parse";

const WINDOW_DAYS = 14;
const MAX_WINDOWS = 6;

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

function pickBestWalletSnapshot(candidates: any[]): any | null {
  let bestRes: any = null;
  let bestTime = 0;
  let bestHasBalance = false;

  for (const res of candidates) {
    if (res?.error) continue;
    const list: any[] = res.response?.transaction_list ?? [];
    if (!list.length) continue;
    const hasBalance = latestWalletBalance(res) !== null;
    const latest = Math.max(...list.map((t) => Number(t?.create_time ?? 0)));
    if (hasBalance && !bestHasBalance) {
      bestRes = res;
      bestTime = latest;
      bestHasBalance = true;
      continue;
    }
    if (hasBalance === bestHasBalance && latest > bestTime) {
      bestTime = latest;
      bestRes = res;
      bestHasBalance = hasBalance;
    }
  }

  return bestRes;
}

/** Cari snapshot transaksi wallet terbaru; scan window paralel jika perlu. */
async function fetchLatestWalletSnapshot(shopId: number, accessToken: string) {
  const quick = await fetchWalletTransactions(shopId, accessToken);
  if (!quick.error && latestWalletBalance(quick) !== null) {
    return quick;
  }

  const now = Math.floor(Date.now() / 1000);
  const windows = Array.from({ length: MAX_WINDOWS }, (_, w) => {
    const timeTo = now - w * WINDOW_DAYS * 24 * 3600;
    return {
      timeFrom: timeTo - WINDOW_DAYS * 24 * 3600,
      timeTo,
    };
  });

  const windowResults = await Promise.all(
    windows.map((w) => fetchWalletTransactions(shopId, accessToken, w.timeFrom, w.timeTo)),
  );

  const best = pickBestWalletSnapshot([quick, ...windowResults]);
  if (best) return best;
  return quick.error ? quick : await fetchWalletTransactions(shopId, accessToken);
}

const INCOME_STATUS_FILTERS: Array<Record<string, string | number> | undefined> = [
  undefined,
  { income_status: "PENDING" },
  { income_status: "TO_RELEASE" },
];

export type FetchWalletBalanceOptions = {
  /** Skip income_overview — pending diisi dari DB di route caller. */
  walletOnly?: boolean;
};

export async function fetchWalletBalanceRaw(
  shopId: number,
  accessToken: string,
  options?: FetchWalletBalanceOptions,
) {
  const walletTransactions = await fetchLatestWalletSnapshot(shopId, accessToken);

  if (options?.walletOnly) {
    return {
      income_overview: undefined,
      income_overviews: [],
      wallet_transactions: walletTransactions,
    };
  }

  const incomeOverviews = await Promise.all(
    INCOME_STATUS_FILTERS.map((params) =>
      shopeeApi("/api/v2/payment/get_income_overview", shopId, accessToken, params ?? {}),
    ),
  );

  return {
    income_overview: incomeOverviews[0],
    income_overviews: incomeOverviews,
    wallet_transactions: walletTransactions,
  };
}
