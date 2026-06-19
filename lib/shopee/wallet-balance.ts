// lib/shopee/wallet-balance.ts
// Saldo Shopee: get_income_overview (tersedia + pending) + fallback current_balance
// dari get_wallet_transaction_list (sama pola sync-finance).
import { shopeeApi } from "./helper";

const WINDOW_DAYS = 14;

export type WalletBalanceRaw = {
  income_overview?: any;
  wallet_transactions?: any;
};

function pickNumber(obj: any, keys: string[]): number | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    if (typeof v === "string" && v.length > 0 && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function deepPickAmount(obj: any, keyPatterns: RegExp[], depth = 0): number | null {
  if (!obj || typeof obj !== "object" || depth > 6) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (keyPatterns.some((p) => p.test(k))) {
      const n = pickNumber({ x: v }, ["x"]);
      if (n !== null) return n;
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = deepPickAmount(v, keyPatterns, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

function latestWalletBalance(walletRes: any): number | null {
  const list = walletRes?.response?.transaction_list ?? walletRes?.transaction_list ?? [];
  if (!Array.isArray(list) || list.length === 0) return null;
  const sorted = [...list].sort(
    (a, b) => Number(b?.create_time ?? 0) - Number(a?.create_time ?? 0),
  );
  return pickNumber(sorted[0], ["current_balance"]);
}

/** Parse gabungan respons income overview + wallet transaction list. */
export function parseWalletBalance(raw: WalletBalanceRaw | any): {
  tersedia: number | null;
  pending: number | null;
} {
  // Back-compat: respons lama hanya wallet list / total_income.
  if (raw && !raw.income_overview && !raw.wallet_transactions) {
    const resp = raw?.response ?? raw;
    const income = resp?.total_income ?? resp;
    const fromLegacy = {
      tersedia: pickNumber(income, [
        "released_amount", "seller_balance", "withdrawable_amount",
        "wallet_balance", "available_balance", "released",
      ]),
      pending: pickNumber(income, [
        "escrow_amount", "pending_amount", "frozen_amount",
        "settlement_amount", "pending", "to_release_amount",
      ]),
    };
    const walletBal = latestWalletBalance(resp);
    return {
      tersedia: fromLegacy.tersedia ?? walletBal,
      pending: fromLegacy.pending,
    };
  }

  const overview = raw?.income_overview;
  const wallet = raw?.wallet_transactions;

  const overviewResp = overview?.response ?? overview ?? {};
  const tersedia =
    pickNumber(overviewResp, [
      "released_amount", "released", "released_income", "total_released_amount",
      "available_balance", "seller_balance", "wallet_balance", "withdrawable_amount",
      "completed_payout_amount", "total_released", "released_balance",
    ]) ??
    deepPickAmount(overviewResp, [/released/i, /available/i, /withdrawable/i, /seller_balance/i]) ??
    latestWalletBalance(wallet);

  const pending =
    pickNumber(overviewResp, [
      "pending_amount", "pending", "pending_income", "total_pending_amount",
      "escrow_amount", "frozen_amount", "to_release_amount", "to_release",
      "unreleased_amount", "total_pending", "on_hold_amount",
    ]) ??
    deepPickAmount(overviewResp, [/pending/i, /escrow/i, /to_release/i, /unreleased/i, /frozen/i]);

  return { tersedia, pending };
}

export async function fetchWalletBalanceRaw(
  shopId: number,
  accessToken: string,
): Promise<WalletBalanceRaw> {
  const timeTo = Math.floor(Date.now() / 1000);
  const timeFrom = timeTo - WINDOW_DAYS * 24 * 3600;

  const [incomeOverview, walletTransactions] = await Promise.all([
    shopeeApi("/api/v2/payment/get_income_overview", shopId, accessToken, {}),
    shopeeApi("/api/v2/payment/get_wallet_transaction_list", shopId, accessToken, {
      page_no: 0,
      page_size: 10,
      create_time_from: timeFrom,
      create_time_to: timeTo,
    }),
  ]);

  return { income_overview: incomeOverview, wallet_transactions: walletTransactions };
}

export function walletBalanceOk(raw: WalletBalanceRaw): boolean {
  const overview = raw.income_overview;
  const wallet = raw.wallet_transactions;
  const overviewOk = overview && !overview.error;
  const walletOk = wallet && !wallet.error;
  return Boolean(overviewOk || walletOk);
}

export function walletBalanceError(raw: WalletBalanceRaw): string | undefined {
  const errs: string[] = [];
  if (raw.income_overview?.error) {
    errs.push(`income: ${raw.income_overview.message || raw.income_overview.error}`);
  }
  if (raw.wallet_transactions?.error) {
    errs.push(`wallet: ${raw.wallet_transactions.message || raw.wallet_transactions.error}`);
  }
  return errs.length ? errs.join("; ") : undefined;
}
