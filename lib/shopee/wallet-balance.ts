// lib/shopee/wallet-balance.ts
// Saldo penjual SAAT INI:
// - Tersedia  → current_balance dari get_wallet_transaction_list (saldo wallet / bisa dicairkan)
// - Pending   → pending/to_release dari get_income_overview (bukan total released seumur hidup)
import { shopeeApi } from "./helper";

const WINDOW_DAYS = 14;
const MAX_WINDOWS = 6; // geser mundur max ~84 hari untuk cari transaksi terbaru

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

function latestWalletBalance(walletRes: any): number | null {
  const list = walletRes?.response?.transaction_list ?? walletRes?.transaction_list ?? [];
  if (!Array.isArray(list) || list.length === 0) return null;
  const sorted = [...list].sort(
    (a, b) => Number(b?.create_time ?? 0) - Number(a?.create_time ?? 0),
  );
  return pickNumber(sorted[0], ["current_balance"]);
}

function parsePendingFromOverview(overviewRes: any): number | null {
  const resp = overviewRes?.response ?? overviewRes ?? {};
  if (!resp || overviewRes?.error) return null;

  // Hanya field pending / belum cair — JANGAN pakai released_amount (total kumulatif).
  const direct = pickNumber(resp, [
    "pending_amount",
    "total_pending_amount",
    "to_release_amount",
    "total_to_release_amount",
    "escrow_amount",
    "unreleased_amount",
    "on_hold_amount",
    "frozen_amount",
  ]);
  if (direct !== null) return direct;

  // Struktur dinamis Shopee ID: cari objek bertipe pending/to_release.
  const sections = [
    resp?.pending_info,
    resp?.to_release_info,
    resp?.pending,
    resp?.to_release,
    ...(Array.isArray(resp?.income_list) ? resp.income_list : []),
    ...(Array.isArray(resp?.overview_list) ? resp.overview_list : []),
  ].filter(Boolean);

  let total = 0;
  let found = false;
  for (const section of sections) {
    const status = String(section?.income_status ?? section?.status ?? "").toLowerCase();
    if (status && !/pending|to.?release|unreleased|escrow/i.test(status)) continue;
    const amt = pickNumber(section, [
      "amount", "total_amount", "income_amount", "pending_amount", "to_release_amount",
    ]);
    if (amt !== null) {
      total += amt;
      found = true;
    }
  }
  return found ? total : null;
}

/** Parse saldo penjual saat ini (bukan total kumulatif). */
export function parseWalletBalance(raw: WalletBalanceRaw | any): {
  tersedia: number | null;
  pending: number | null;
} {
  if (raw && !raw.income_overview && !raw.wallet_transactions) {
    return {
      tersedia: latestWalletBalance(raw),
      pending: parsePendingFromOverview(raw),
    };
  }

  const wallet = raw?.wallet_transactions;
  const overview = raw?.income_overview;

  return {
    tersedia: latestWalletBalance(wallet),
    pending: parsePendingFromOverview(overview),
  };
}

async function fetchWalletTransactions(
  shopId: number,
  accessToken: string,
  timeFrom?: number,
  timeTo?: number,
) {
  const params: Record<string, number> = { page_no: 0, page_size: 5 };
  if (timeFrom !== undefined && timeTo !== undefined) {
    params.create_time_from = timeFrom;
    params.create_time_to = timeTo;
  }
  return shopeeApi("/api/v2/payment/get_wallet_transaction_list", shopId, accessToken, params);
}

/** Ambil transaksi wallet terbaru; geser window mundur bila 14 hari terakhir kosong. */
async function fetchLatestWalletSnapshot(shopId: number, accessToken: string) {
  const now = Math.floor(Date.now() / 1000);
  for (let w = 0; w < MAX_WINDOWS; w++) {
    const timeTo = now - w * WINDOW_DAYS * 24 * 3600;
    const timeFrom = timeTo - WINDOW_DAYS * 24 * 3600;
    const res = await fetchWalletTransactions(shopId, accessToken, timeFrom, timeTo);
    if (res.error) return res;
    if (res.response?.transaction_list?.length) return res;
  }
  return fetchWalletTransactions(shopId, accessToken);
}

export async function fetchWalletBalanceRaw(
  shopId: number,
  accessToken: string,
): Promise<WalletBalanceRaw> {
  const [incomeOverview, walletTransactions] = await Promise.all([
    shopeeApi("/api/v2/payment/get_income_overview", shopId, accessToken, {}),
    fetchLatestWalletSnapshot(shopId, accessToken),
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
    errs.push(`pending: ${raw.income_overview.message || raw.income_overview.error}`);
  }
  if (raw.wallet_transactions?.error) {
    errs.push(`wallet: ${raw.wallet_transactions.message || raw.wallet_transactions.error}`);
  }
  return errs.length ? errs.join("; ") : undefined;
}
