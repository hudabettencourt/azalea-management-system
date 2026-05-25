// lib/shopee/helper.ts
import crypto from "crypto";

const PARTNER_ID = parseInt(process.env.SHOPEE_PARTNER_ID || "0");
const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY || "";
const BASE_URL = "https://partner.test-stable.shopeemobile.com"; // sandbox
// const BASE_URL = "https://partner.shopeemobile.com"; // production (uncomment nanti)

export const SHOPEE_REDIRECT_URL = process.env.SHOPEE_REDIRECT_URL || "";

// Generate HMAC-SHA256 signature
export function generateSignature(path: string, timestamp: number, accessToken?: string, shopId?: number): string {
  let baseStr = `${PARTNER_ID}${path}${timestamp}`;
  if (accessToken) baseStr += accessToken;
  if (shopId) baseStr += shopId;
  return crypto.createHmac("sha256", PARTNER_KEY).update(baseStr).digest("hex");
}

// Generate auth URL untuk connect toko
export function generateAuthUrl(state: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const path = "/api/v2/shop/auth_partner";
  const sign = generateSignature(path, timestamp);
  const params = new URLSearchParams({
    partner_id: PARTNER_ID.toString(),
    timestamp: timestamp.toString(),
    sign,
    redirect: SHOPEE_REDIRECT_URL,
    state,
  });
  return `${BASE_URL}${path}?${params.toString()}`;
}

// Tukar auth code → access token + refresh token
export async function getAccessToken(code: string, shopId: number) {
  const timestamp = Math.floor(Date.now() / 1000);
  const path = "/api/v2/auth/token/get";
  const sign = generateSignature(path, timestamp);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      shop_id: shopId,
      partner_id: PARTNER_ID,
      timestamp,
      sign,
    }),
  });
  return res.json();
}

// Refresh access token
export async function refreshAccessToken(refreshToken: string, shopId: number) {
  const timestamp = Math.floor(Date.now() / 1000);
  const path = "/api/v2/auth/access_token/get";
  const sign = generateSignature(path, timestamp);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refresh_token: refreshToken,
      shop_id: shopId,
      partner_id: PARTNER_ID,
      timestamp,
      sign,
    }),
  });
  return res.json();
}

// Generic API call ke Shopee
export async function shopeeApi(path: string, shopId: number, accessToken: string, params: Record<string, any> = {}) {
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
  const res = await fetch(`${BASE_URL}${path}?${query.toString()}`);
  return res.json();
}

export { PARTNER_ID, BASE_URL };
