// lib/shopee/wallet-balance-parse.ts
// Parser murni — aman dipakai di client & server.
// Tersedia = saldo wallet saat ini (bisa dicairkan), BUKAN total released seumur hidup.

export type WalletBalanceRaw = {
  income_overview?: any;
  wallet_transactions?: any;
};

export type ParsedWalletBalance = {
  tersedia: number | null;
  pending: number | null;
  tersedia_source: "wallet_current_balance" | "none";
  pending_source: "income_overview" | "none";
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

/** Saldo wallet saat ini dari transaksi terbaru. */
export function latestWalletBalance(walletRes: any): number | null {
  if (!walletRes || walletRes.error) return null;
  const list = walletRes?.response?.transaction_list ?? walletRes?.transaction_list ?? [];
  if (!Array.isArray(list) || list.length === 0) return null;
  const sorted = [...list].sort(
    (a, b) => Number(b?.create_time ?? 0) - Number(a?.create_time ?? 0),
  );
  return pickNumber(sorted[0], ["current_balance"]);
}

function isPendingStatus(status: string): boolean {
  return /pending|to.?release|unreleased|escrow|belum/i.test(status);
}

function isReleasedStatus(status: string): boolean {
  return /released|completed|selesai/i.test(status);
}

function parsePendingFromOverview(overviewRes: any): number | null {
  const resp = overviewRes?.response ?? overviewRes ?? {};
  if (!resp || overviewRes?.error) return null;

  // Field eksplisit pending — jangan sentuh released_amount.
  const direct = pickNumber(resp, [
    "pending_amount",
    "total_pending_amount",
    "to_release_amount",
    "total_to_release_amount",
    "unreleased_amount",
    "on_hold_amount",
    "frozen_amount",
  ]);
  if (direct !== null) return direct;

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
    const status = String(section?.income_status ?? section?.status ?? section?.type ?? "").toLowerCase();
    // Tanpa status jelas → skip (hindari menjumlahkan released kumulatif).
    if (!status) continue;
    if (isReleasedStatus(status)) continue;
    if (!isPendingStatus(status)) continue;
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

export function parseWalletBalance(raw: WalletBalanceRaw | any): ParsedWalletBalance {
  const wallet = raw?.wallet_transactions ?? (raw?.income_overview ? undefined : raw);
  const overview = raw?.income_overview ?? (raw?.wallet_transactions ? undefined : raw);

  const tersedia = latestWalletBalance(wallet);
  const pending = parsePendingFromOverview(overview);

  return {
    tersedia,
    pending,
    tersedia_source: tersedia !== null ? "wallet_current_balance" : "none",
    pending_source: pending !== null ? "income_overview" : "none",
  };
}

export function walletBalanceOk(raw: WalletBalanceRaw): boolean {
  const parsed = parseWalletBalance(raw);
  return parsed.tersedia !== null || parsed.pending !== null;
}

export function walletBalanceError(raw: WalletBalanceRaw): string | undefined {
  const errs: string[] = [];
  if (raw.income_overview?.error) {
    errs.push(`pending: ${raw.income_overview.message || raw.income_overview.error}`);
  }
  if (raw.wallet_transactions?.error) {
    errs.push(`wallet: ${raw.wallet_transactions.message || raw.wallet_transactions.error}`);
  }
  const parsed = parseWalletBalance(raw);
  if (parsed.tersedia === null) {
    errs.push("saldo wallet: get_wallet_transaction_list belum mengembalikan current_balance");
  }
  return errs.length ? errs.join("; ") : undefined;
}
