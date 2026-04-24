import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ─── Role → halaman yang boleh diakses ───────────────────────────────────────
const ROLE_ACCESS: Record<string, string[]> = {
  owner: ["/", "/dashboard", "/pembelian", "/pembelian-bahan", "/produksi", "/penjualan", "/admin"],
  super_admin: ["/", "/dashboard", "/pembelian", "/pembelian-bahan", "/produksi", "/penjualan", "/admin"],
  keuangan: ["/", "/dashboard"],
  purchasing: ["/pembelian", "/pembelian-bahan"],
  produksi: ["/produksi"],
  kasir: ["/penjualan"],
  admin_penjualan: ["/penjualan"],
}

// Halaman yang tidak perlu login
const PUBLIC_PATHS = ["/login"]

// Cek apakah path diizinkan untuk role tertentu
function isAllowed(pathname: string, role: string): boolean {
  // owner & super_admin bisa akses semua
  if (role === "owner" || role === "super_admin") return true

  const allowed = ROLE_ACCESS[role] || []
  return allowed.some(p => pathname === p || pathname.startsWith(p + "/"))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  // Belum login → redirect ke /login
  if (!session) {
    if (PUBLIC_PATHS.includes(pathname)) return response
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Sudah login tapi buka /login → redirect ke /
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Ambil role dari tabel profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single()

  const role = profile?.role || ""

  // Kalau role tidak dikenali → redirect ke /login
  if (!role) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Cek akses halaman
  if (!isAllowed(pathname, role)) {
    // Redirect ke halaman default per role
    const defaultPage: Record<string, string> = {
      keuangan: "/",
      purchasing: "/pembelian",
      produksi: "/produksi",
      kasir: "/penjualan",
      admin_penjualan: "/penjualan",
    }
    const redirect = defaultPage[role] || "/login"
    return NextResponse.redirect(new URL(redirect, request.url))
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
