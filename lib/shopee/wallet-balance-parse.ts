// lib/shopee/wallet-balance-parse.ts
// Parser murni — aman dipakai di client & server.
// Tersedia = saldo wallet saat ini (bisa dicairkan), BUKAN total released seumur hidup.

export type WalletBalanceRaw = {
  income_overview?: any;
  income_overviews?: any[];
  wallet_transactions?: any;
  pending_db?: number | null;
};

export type ParsedWalletBalance = {
  tersedia: number | null;
  pending: number | null;
  tersedia_source: "wallet_current_balance" | "none";
  pending_source: "income_overview" | "db_uang_dijalan" | "none";
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

function sumPendingSections(overviewRes: any): number | null {
  const resp = overviewRes?.response ?? overviewRes ?? {};
  if (!resp || overviewRes?.error) return null;

  let total = 0;
  let found = false;

  const add = (n: number | null) => {
    if (n !== null) { total += n; found = true; }
  };

  // Field eksplisit pending — jangan sentuh released_amount.
  add(pickNumber(resp, ["pending_amount", "total_pending_amount", "pending"]));
  add(pickNumber(resp, ["to_release_amount", "total_to_release_amount", "to_release", "unreleased_amount"]));
  add(pickNumber(resp, ["on_hold_amount", "frozen_amount"]));

  for (const nested of [resp?.local_shop_income, resp?.income_overview, resp?.shop_income, resp?.income_summary]) {
    if (!nested) continue;
    add(pickNumber(nested, ["pending", "pending_amount", "to_release", "to_release_amount", "unreleased_amount"]));
  }

  const sections = [
    resp?.pending_info,
    resp?.to_release_info,
    resp?.pending,
    resp?.to_release,
    ...(Array.isArray(resp?.income_list) ? resp.income_list : []),
    ...(Array.isArray(resp?.overview_list) ? resp.overview_list : []),
    ...(Array.isArray(resp?.income_detail_list) ? resp.income_detail_list : []),
  ].filter(Boolean);

  for (const section of sections) {
    const status = String(
      section?.income_status ?? section?.status ?? section?.type ?? section?.income_type ?? "",
    ).toLowerCase();
    if (status && isReleasedStatus(status)) continue;
    if (status && !isPendingStatus(status)) continue;
    add(pickNumber(section, [
      "amount", "total_amount", "income_amount", "pending_amount", "to_release_amount", "value",
    ]));
  }

  return found ? total : null;
}

function parsePendingFromOverview(raw: WalletBalanceRaw | any): number | null {
  const list: any[] = [];
  if (raw?.income_overviews?.length) list.push(...raw.income_overviews);
  if (raw?.income_overview) list.push(raw.income_overview);
  if (!list.length && raw?.response) list.push(raw);

  let best: number | null = null;
  for (const ov of list) {
    const n = sumPendingSections(ov);
    if (n !== null) best = Math.max(best ?? 0, n);
  }
  return best;
}

export function parseWalletBalance(raw: WalletBalanceRaw | any): ParsedWalletBalance {
  const wallet = raw?.wallet_transactions ?? (raw?.income_overview ? undefined : raw);

  const tersedia = latestWalletBalance(wallet);
  let pending = parsePendingFromOverview(raw);
  let pending_source: ParsedWalletBalance["pending_source"] = pending !== null ? "income_overview" : "none";

  if (pending === null && raw?.pending_db != null) {
    pending = raw.pending_db;
    pending_source = "db_uang_dijalan";
  }

  return {
    tersedia,
    pending,
    tersedia_source: tersedia !== null ? "wallet_current_balance" : "none",
    pending_source,
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
