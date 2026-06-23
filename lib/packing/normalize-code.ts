// Normalisasi barcode/resi untuk lookup aman (exact + variant prefix SPX).

const MAX_CODE_LEN = 64;
const MIN_CODE_LEN = 6;

/** Sanitize input scan — tolak karakter aneh, batasi panjang. */
export function sanitizeScanCode(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, "");
  if (trimmed.length < MIN_CODE_LEN || trimmed.length > MAX_CODE_LEN) return null;
  // Hanya alphanumeric + dash/underscore (format resi Shopee umum)
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

/** Kode terlihat seperti resi/tracking (bukan order SN biasa) */
export function looksLikeResiCode(normalized: string): boolean {
  if (normalized.startsWith("SPX")) return true;
  if (/^\d{12,}$/.test(normalized)) return true;
  return false;
}

/** Variasi lookup resi — SPXID037... vs 037... di DB */
export function resiLookupVariants(normalized: string): string[] {
  const out = new Set<string>([normalized]);

  if (normalized.startsWith("SPXID") && normalized.length > 5) {
    out.add(normalized.slice(5));
  } else if (normalized.startsWith("SPX") && normalized.length > 3) {
    out.add(normalized.slice(3));
  }
  if (/^\d{10,}$/.test(normalized)) {
    out.add(`SPXID${normalized}`);
    out.add(`SPX${normalized}`);
  }

  return [...out];
}

/** Digit suffix untuk fallback (min 12 digit — hindari over-match) */
export function longDigitSuffix(normalized: string): string | null {
  const digits = normalized.replace(/\D/g, "");
  if (digits.length >= 12) return digits.slice(-15);
  return null;
}

export function resiMatchesVariant(stored: string | null, variants: Set<string>): boolean {
  if (!stored) return false;
  const n = stored.trim().replace(/\s+/g, "").toUpperCase();
  if (variants.has(n)) return true;
  for (const v of variants) {
    if (n.endsWith(v) || v.endsWith(n)) return true;
  }
  return false;
}
