// lib/shopee/helper.ts
import crypto from "crypto";

const PARTNER_ID = parseInt(process.env.SHOPEE_PARTNER_ID || "0");
const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY || "";

// ── URLs per environment ──
const IS_SANDBOX = process.env.SHOPEE_ENV !== "production";

// Auth URL (untuk generate authorization link)
const AUTH_BASE_URL = IS_SANDBOX
  ? "https://open.test-stable.shopee.com/auth"
  : "https://open.shopee.com/auth";

// API Base URL (untuk token, orders, dll)
// FIX: Pakai partner.shopeemobile.com (bukan openplatform.sandbox)
const API_BASE_URL = IS_SANDBOX
  ? "https://partner.test-stable.shopeemobile.com"
  : "https://partner.shopeemobile.com";

export const SHOPEE_REDIRECT_URL = process.env.SHOPEE_REDIRECT_URL || "";

// Generate HMAC-SHA256 signature
export function generateSignature(
  path: string,
  timestamp: number,
  accessToken?: string,
  shopId?: number
): string {
  let baseStr = `${PARTNER_ID}${path}${timestamp}`;
  if (accessToken) baseStr += accessToken;
  if (shopId) baseStr += shopId;
  return crypto.createHmac("sha256", PARTNER_KEY).update(baseStr).digest("hex");
}

// Generate authorization link untuk connect toko
export function generateAuthUrl(state: string): string {
  const params = new URLSearchParams({
    partner_id: PARTNER_ID.toString(),
    auth_type: "seller",
    redirect_uri: SHOPEE_REDIRECT_URL,
    response_type: "code",
    state,
  });
  return `${AUTH_BASE_URL}?${params.toString()}`;
}

// Tukar auth code → access token + refresh token
// FIX: partner_id, timestamp, sign di QUERY STRING (bukan body)
export async function getAccessToken(code: string, shopId: number) {
  const timestamp = Math.floor(Date.now() / 1000);
  const path = "/api/v2/auth/token/get";
  const sign = generateSignature(path, timestamp);

  const query = new URLSearchParams({
    partner_id: PARTNER_ID.toString(),
    timestamp: timestamp.toString(),
    sign,
  });

  const res = await fetch(`${API_BASE_URL}${path}?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      shop_id: shopId,
      partner_id: PARTNER_ID,
    }),
  });
  return res.json();
}

// Refresh access token
// FIX: partner_id, timestamp, sign di QUERY STRING
export async function refreshAccessToken(refreshToken: string, shopId: number) {
  const timestamp = Math.floor(Date.now() / 1000);
  const path = "/api/v2/auth/access_token/get";
  const sign = generateSignature(path, timestamp);

  const query = new URLSearchParams({
    partner_id: PARTNER_ID.toString(),
    timestamp: timestamp.toString(),
    sign,
  });

  const res = await fetch(`${API_BASE_URL}${path}?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: refreshToken,
      shop_id: shopId,
      partner_id: PARTNER_ID,
    }),
  });
  return res.json();
}

// Generic API call ke Shopee (untuk endpoint shop-level seperti get orders)
export async function shopeeApi(
  path: string,
  shopId: number,
  accessToken: string,
  params: Record<string, any> = {}
) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSignature(path, timestamp, accessToken, shopId);
  const query = new URLSearchParams({
    partner_id: PARTNER_ID.toString(),
    timestamp: timestamp.toString(),
    sign,
    shop_id: shopId.toString(),
    access_token: accessToken,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const res = await fetch(`${API_BASE_URL}${path}?${query.toString()}`);
  return res.json();
}

export { PARTNER_ID, API_BASE_URL };
