// lib/format.ts — helper format bersama Azalea Management System

/** Format rupiah penuh: 159250 → "Rp 159.250" */
export const rupiah = (n: number) => `Rp ${(n || 0).toLocaleString("id-ID")}`;

/** Alias lama, dipertahankan agar import lama tidak pecah */
export const rupiahFmt = rupiah;

/** Format rupiah singkat untuk dashboard/chart sempit: 159250 → "Rp 159rb" */
export const rupiahShort = (n: number) => {
  const abs = Math.abs(n || 0);
  const sign = (n || 0) < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1)}jt`;
  if (abs >= 1_000) return `${sign}Rp ${(abs / 1_000).toFixed(0)}rb`;
  return `${sign}${rupiah(abs)}`;
};

/** Persen: 19.5 → "19,5%" */
export const pctFmt = (n: number) => `${(n || 0).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

/** Tanggal singkat WIB: "08 Jun" */
export const tanggalFmt = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" });

/** Tanggal + jam WIB: "08 Jun 2026, 14.30" */
export const tanggalJamFmt = (s: string) =>
  new Date(s).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  });
