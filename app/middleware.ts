import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ─── Role → halaman yang boleh diakses ───────────────────────────────────────
const ROLE_ACCESS: Record<string, string[]> = {
  owner: ["/", "/dashboard", "/pembelian", "/pembelian-bahan", "/produksi", "/penjualan", "/admin"],
  super_admin: ["/", "/dashboard", "/pembelian", "/pembelian-bahan", "/produksi", "/penjualan", "/admin"],
  keuangan: ["/", "/dashboard"],
  purchasing: ["/pembelian", "/pembelian-bahan"],
  produksi: ["/produksi"],
  kasir: ["/penjualan"],
  admin_penjualan: ["/penjualan"],
};

const PUBLIC_PATHS = ["/login"];

function isAllowed(pathname: string, role: string): boolean {
  if (role === "owner" || role === "super_admin") return true;
  const allowed = ROLE_ACCESS[role] || [];
  return allowed.some(p => pathname === p || pathname.startsWith(p + "/"));
}

function safeRedirectPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (PUBLIC_PATHS.includes(pathname)) return supabaseResponse;
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login") {
    const redirect = safeRedirectPath(request.nextUrl.searchParams.get("redirect"));
    return NextResponse.redirect(new URL(redirect || "/", request.url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role || "";

  if (!role) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!isAllowed(pathname, role)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const defaultPage: Record<string, string> = {
      keuangan: "/",
      purchasing: "/pembelian",
      produksi: "/produksi",
      kasir: "/penjualan",
      admin_penjualan: "/penjualan",
    };
    const redirect = defaultPage[role] || "/login";
    return NextResponse.redirect(new URL(redirect, request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
