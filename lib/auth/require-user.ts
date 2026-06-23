// Verifikasi session Supabase untuk API route (cookie-based).

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export type AuthUser = { id: string; email: string | null };

export type RequireUserResult =
  | { ok: true; user: AuthUser }
  | { ok: false; response: NextResponse };

export async function requireUser(): Promise<RequireUserResult> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* ignore — Server Component context */
          }
        },
      },
    },
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, user: { id: user.id, email: user.email ?? null } };
}
