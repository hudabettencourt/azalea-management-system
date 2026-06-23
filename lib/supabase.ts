// Browser Supabase client — session disimpan di cookie (SSR-compatible).
// Jangan pakai createClient biasa (localStorage) — API route butuh cookie.

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
