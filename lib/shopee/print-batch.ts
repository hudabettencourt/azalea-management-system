// lib/shopee/print-batch.ts
// Filter batch cetak resi harian (WIB). tanggal_pesanan di DB = tanggal saja (YYYY-MM-DD).

export type BatchMode = "semua" | "pagi" | "siang" | "custom";

export type BatchWindow = {
  mode: BatchMode;
  label: string;
  /** Tanggal inklusif YYYY-MM-DD */
  dates: string[];
  /** Untuk custom: rentang tanggal */
  from?: string;
  to?: string;
};

const WIB = "Asia/Jakarta";

export function todayWib(): string {
  return new Date().toLocaleDateString("sv", { timeZone: WIB });
}

export function yesterdayWib(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString("sv", { timeZone: WIB });
}

export function formatTanggalLabel(isoDate: string): string {
  return new Date(isoDate + "T12:00:00").toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Rentang tanggal inklusif YYYY-MM-DD → YYYY-MM-DD */
export function dateRangeInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  const cur = new Date(start);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function getBatchWindow(
  mode: BatchMode,
  custom?: { from: string; to: string },
): BatchWindow {
  const today = todayWib();
  const yesterday = yesterdayWib();

  if (mode === "semua") {
    return { mode, label: "Semua Belum Cetak", dates: [] };
  }
  if (mode === "pagi") {
    const dates = [...new Set([yesterday, today])];
    return {
      mode,
      label: `Batch Pagi (${formatTanggalLabel(yesterday)} – ${formatTanggalLabel(today)})`,
      dates,
    };
  }
  if (mode === "siang") {
    return {
      mode,
      label: `Batch Siang · ${formatTanggalLabel(today)} (09:00–12:00)`,
      dates: [today],
    };
  }
  const from = custom?.from || today;
  const to = custom?.to || today;
  const dates = dateRangeInclusive(from, to);
  return {
    mode,
    label: `Custom · ${formatTanggalLabel(from)} – ${formatTanggalLabel(to)}`,
    dates,
    from,
    to,
  };
}

export function orderMatchesBatch(tanggalPesanan: string | null, window: BatchWindow): boolean {
  if (window.mode === "semua" || window.dates.length === 0) return true;
  if (!tanggalPesanan) return false;
  const d = tanggalPesanan.slice(0, 10);
  return window.dates.includes(d);
}

/** Status nav sidebar → filter Shopee */
export const NAV_STATUS_MAP: Record<string, string> = {
  to_process: "READY_TO_SHIP",
  to_print: "PROCESSED",
  to_pickup: "LABEL_PRINTED",
  shipped: "SHIPPED",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

export const PRINTABLE_STATUSES = new Set(["PROCESSED", "LABEL_PRINTED"]);

export function isDropoff(jasaKirim: string | null): boolean {
  if (!jasaKirim) return false;
  const j = jasaKirim.toLowerCase();
  return j.includes("drop") || j.includes("antar") || j.includes("self");
}
