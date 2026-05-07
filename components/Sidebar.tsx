"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type MenuGroup = {
  group: string;
  items: { label: string; href: string; icon: string; roles?: string[] }[];
};

const MENU_GROUPS: MenuGroup[] = [
  { group: "", items: [{ label: "Dashboard", href: "/dashboard", icon: "⊞" }] },
  {
    group: "Transaksi",
    items: [
      { label: "Penjualan",          href: "/penjualan",       icon: "🛍️" },
      { label: "Pembelian Bahan",    href: "/pembelian-bahan", icon: "🧪" },
      { label: "Pembelian Reseller", href: "/pembelian",       icon: "📦" },
      { label: "Kas",                href: "/kas",             icon: "💰" },
      { label: "Fee Platform",       href: "/fee-platform",    icon: "💸" },
      { label: "Rekap Saldo",        href: "/rekap-saldo",     icon: "💳" },
    ],
  },
  {
    group: "Operasional",
    items: [
      { label: "Produksi",   href: "/produksi",   icon: "⚙️" },
      { label: "Penggajian", href: "/penggajian", icon: "👥" },
    ],
  },
  { group: "Laporan", items: [{ label: "Laporan L/R", href: "/laporan", icon: "📊" }] },
  {
    group: "Pengaturan",
    items: [{ label: "Admin", href: "/admin", icon: "🔐", roles: ["owner", "super_admin"] }],
  },
];

interface SidebarProps {
  children: React.ReactNode;
  pageTitle?: string;
  pageSubtitle?: string;
  /** Tombol aksi di section header — print, export, filter */
  actions?: React.ReactNode;
}

export default function Sidebar({ children, pageTitle, pageSubtitle, actions }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [collapsed, setCollapsed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [roleReady, setRoleReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fetchRole = async (userId: string, email: string) => {
      setUserEmail(email);
      setUserName(email.split("@")[0]);
      const { data: profile } = await supabase.from("profiles").select("role, nama").eq("id", userId).single();
      setRole(profile?.role ?? "staff");
      if (profile?.nama) setUserName(profile.nama);
      setRoleReady(true);
    };
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) fetchRole(session.user.id, session.user.email ?? "");
      else setRoleReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) fetchRole(session.user.id, session.user.email ?? "");
      else if (event === "SIGNED_OUT") { setRole(null); setUserEmail(null); setRoleReady(true); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Derive page title from pathname if not provided
  const derivedTitle = pageTitle || (() => {
    const map: Record<string, string> = {
      "/": "Dashboard", "/dashboard": "Dashboard",
      "/penjualan": "Penjualan", "/pembelian-bahan": "Pembelian Bahan",
      "/pembelian": "Pembelian Reseller", "/kas": "Kas",
      "/fee-platform": "Fee Platform", "/rekap-saldo": "Rekap Saldo",
      "/produksi": "Produksi", "/penggajian": "Penggajian",
      "/laporan": "Laporan L/R", "/admin": "Admin",
    };
    return map[pathname] || "Dashboard";
  })();

  const breadcrumb = ["Home", derivedTitle].filter(Boolean);

  const NavItem = ({ item }: { item: MenuGroup["items"][0] }) => {
    if (item.roles && !roleReady) return (
      <div style={{ padding: "8px 12px", margin: "1px 0" }}>
        <div style={{ height: 12, background: C.dim, borderRadius: 6, opacity: 0.5, width: "70%" }} />
      </div>
    );
    if (item.roles && (!role || !item.roles.includes(role))) return null;

    const active = item.href === "/dashboard" || item.href === "/"
      ? pathname === "/dashboard" || pathname === "/"
      : pathname === item.href || pathname?.startsWith(item.href + "/");

    return (
      <a href={item.href} style={{
        display: "flex", alignItems: "center",
        gap: collapsed ? 0 : 10,
        justifyContent: collapsed ? "center" : "flex-start",
        padding: collapsed ? "10px 0" : "9px 14px",
        borderRadius: 10, textDecoration: "none",
        background: active ? C.sidebarActive : "transparent",
        color: active ? C.accent : C.muted,
        fontWeight: active ? 800 : 500,
        fontSize: 13.5,
        fontFamily: C.fontSans,
        transition: "all 0.15s",
        whiteSpace: "nowrap", overflow: "hidden",
        position: "relative",
      }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        {active && (
          <div style={{
            position: "absolute", left: 0, top: "20%", bottom: "20%",
            width: 3, borderRadius: "0 3px 3px 0",
            background: C.accent,
          }} />
        )}
        <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
        {!collapsed && <span>{item.label}</span>}
      </a>
    );
  };

  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "12px 10px" }}>
      {/* Logo */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: collapsed ? "8px 0 16px" : "8px 4px 16px",
        borderBottom: `1px solid ${C.sidebarBorder}`,
        marginBottom: 8,
      }}>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 900, color: "#fff",
              fontFamily: C.fontSans, boxShadow: `0 4px 12px ${C.accentGlow}`,
            }}>A</div>
            <span style={{
              fontFamily: C.fontSans, fontSize: 17, fontWeight: 800,
              color: C.text, letterSpacing: "-0.02em",
            }}>Azalea</span>
          </div>
        )}
        {collapsed && (
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 900, color: "#fff",
            fontFamily: C.fontSans,
          }}>A</div>
        )}
        {!collapsed && (
          <button onClick={() => setCollapsed(true)} style={{
            background: "none", border: "none", color: C.muted,
            cursor: "pointer", fontSize: 13, padding: "4px 6px",
            borderRadius: 6, lineHeight: 1,
          }}>◀</button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {MENU_GROUPS.map((group, gi) => (
          <div key={gi} style={{ marginBottom: 4 }}>
            {!collapsed && group.group && (
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                textTransform: "uppercase", color: C.dim,
                padding: "10px 14px 4px",
                fontFamily: C.fontMono,
              }}>{group.group}</div>
            )}
            {collapsed && gi > 0 && (
              <div style={{ height: 1, background: C.sidebarBorder, margin: "6px 8px" }} />
            )}
            {group.items.map(item => <NavItem key={item.href} item={item} />)}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${C.sidebarBorder}`, paddingTop: 10, marginTop: 8 }}>
        {/* Theme toggle */}
        <button onClick={toggleTheme} style={{
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 10, width: "100%",
          padding: collapsed ? "9px 0" : "9px 14px",
          background: "transparent", border: "none",
          borderRadius: 10, color: C.muted,
          fontSize: 13.5, fontWeight: 600,
          cursor: "pointer", fontFamily: C.fontSans,
          marginBottom: 2,
          transition: "all 0.15s",
        }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
        >
          <span style={{ fontSize: 16 }}>{isDark ? "☀️" : "🌙"}</span>
          {!collapsed && <span>{isDark ? "Light Mode" : "Dark Mode"}</span>}
        </button>

        {/* User info */}
        {!collapsed && userEmail && (
          <div style={{
            padding: "8px 14px",
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
            borderRadius: 10, marginBottom: 6,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.fontSans }}>
              {userName}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>
                {userEmail}
              </div>
              {role && (
                <span style={{
                  background: C.accentGlow, color: C.accent,
                  padding: "1px 7px", borderRadius: 20,
                  fontSize: 10, fontWeight: 800, fontFamily: C.fontSans,
                  flexShrink: 0,
                }}>{role}</span>
              )}
            </div>
          </div>
        )}

        <button onClick={handleLogout} style={{
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 10, width: "100%",
          padding: collapsed ? "9px 0" : "9px 14px",
          background: "transparent", border: "none",
          borderRadius: 10, color: C.red,
          fontSize: 13.5, fontWeight: 600,
          cursor: "pointer", fontFamily: C.fontSans,
          transition: "all 0.15s",
        }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.redDim}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
        >
          <span style={{ fontSize: 16 }}>🚪</span>
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; }
        body { font-family: 'Nunito', sans-serif; }

        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .mobile-menu-btn {
            position: fixed; top: 12px; left: 12px; z-index: 999;
            background: ${C.card}; border: 1px solid ${C.border};
            border-radius: 10px; padding: 8px 12px;
            color: ${C.text}; cursor: pointer; font-size: 18px;
            box-shadow: ${C.shadow};
          }
          .sidebar-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; }
          .sidebar-drawer {
            position: fixed; left: 0; top: 0; bottom: 0; width: 240px;
            background: ${C.sidebar}; z-index: 1001;
            box-shadow: 4px 0 24px rgba(0,0,0,0.15);
          }
        }
        @media (min-width: 769px) { .mobile-menu-btn { display: none !important; } }

        /* Collapse button shown only when collapsed */
        .expand-btn {
          position: absolute; right: -14px; top: 50%;
          transform: translateY(-50%);
          width: 28px; height: 28px;
          background: ${C.card}; border: 1px solid ${C.border};
          border-radius: 50%; display: flex; align-items: center; justify-content: center;
          cursor: pointer; font-size: 11px; color: ${C.muted};
          box-shadow: ${C.shadow}; z-index: 10;
          transition: all 0.15s;
        }
        .expand-btn:hover { color: ${C.accent}; border-color: ${C.accent}; }

        * { scrollbar-width: thin; scrollbar-color: ${C.dim} transparent; }
        *::-webkit-scrollbar { width: 4px; }
        *::-webkit-scrollbar-thumb { background: ${C.dim}; border-radius: 4px; }
      `}</style>

      <button className="mobile-menu-btn" onClick={() => setMobileOpen(true)}>☰</button>

      {mobileOpen && (
        <>
          <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
          <div className="sidebar-drawer"><SidebarContent /></div>
        </>
      )}

      <div style={{ display: "flex", minHeight: "100vh", background: C.bgPage }}>
        {/* Sidebar */}
        <div className="sidebar-desktop" style={{
          width: collapsed ? 64 : 220,
          minWidth: collapsed ? 64 : 220,
          background: C.sidebar,
          borderRight: `1px solid ${C.sidebarBorder}`,
          position: "sticky", top: 0, height: "100vh",
          overflowY: "auto", overflowX: "hidden",
          transition: "width 0.2s ease, min-width 0.2s ease",
          flexShrink: 0,
          boxShadow: isDark ? "none" : "2px 0 8px rgba(0,0,0,0.04)",
          position: "relative",
        }}>
          <SidebarContent />
          {collapsed && (
            <button className="expand-btn" onClick={() => setCollapsed(false)}>▶</button>
          )}
        </div>

        {/* Main area */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

          {/* ── Top Navbar ── */}
          <div style={{
            background: C.bgNav,
            borderBottom: `1px solid ${C.border}`,
            padding: "0 24px",
            height: 58,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            position: "sticky", top: 0, zIndex: 100,
            boxShadow: isDark ? "none" : "0 1px 4px rgba(0,0,0,0.05)",
          }}>
            {/* Left: title + breadcrumb */}
            <div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono, marginBottom: 1 }}>
                {breadcrumb.map((b, i) => (
                  <span key={i}>
                    {i > 0 && <span style={{ margin: "0 4px", opacity: 0.5 }}>›</span>}
                    <span style={{ color: i === breadcrumb.length - 1 ? C.muted : C.accent }}>{b}</span>
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: C.fontSans, lineHeight: 1.2 }}>
                {derivedTitle}
                {pageSubtitle && (
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.muted, marginLeft: 8 }}>
                    {pageSubtitle}
                  </span>
                )}
              </div>
            </div>

            {/* Right: action buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Search */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 14px",
                background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                border: `1px solid ${C.border}`,
                borderRadius: 10, cursor: "text",
              }}>
                <span style={{ fontSize: 13, color: C.muted }}>🔍</span>
                <span style={{ fontSize: 13, color: C.muted, fontFamily: C.fontSans }}>Cari...</span>
              </div>

              {/* Icon buttons */}
              {[
                { icon: "🖨️", title: "Print", onClick: () => window.print() },
                { icon: "📥", title: "Export" },
                { icon: "🔄", title: "Refresh", onClick: () => window.location.reload() },
              ].map((btn, i) => (
                <button key={i} title={btn.title} onClick={btn.onClick}
                  style={{
                    width: 36, height: 36,
                    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                    border: `1px solid ${C.border}`,
                    borderRadius: 10, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 15, transition: "all 0.15s",
                    color: C.muted,
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = C.accentGlow;
                    (e.currentTarget as HTMLElement).style.borderColor = C.accent;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
                    (e.currentTarget as HTMLElement).style.borderColor = C.border;
                  }}
                >{btn.icon}</button>
              ))}

              {/* Notification */}
              <button style={{
                width: 36, height: 36,
                background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                border: `1px solid ${C.border}`,
                borderRadius: 10, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, position: "relative",
              }}>
                🔔
                <div style={{
                  position: "absolute", top: 6, right: 6,
                  width: 7, height: 7, borderRadius: "50%",
                  background: C.red, border: `1.5px solid ${C.bgNav}`,
                }} />
              </button>

              {/* Avatar */}
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800, color: "#fff",
                fontFamily: C.fontSans, cursor: "pointer",
                boxShadow: `0 2px 8px ${C.accentGlow}`,
              }}>
                {(userName || "O")[0].toUpperCase()}
              </div>
            </div>
          </div>

          {/* ── Section header (actions row) ── */}
          {actions && (
            <div style={{
              background: C.bgNav,
              borderBottom: `1px solid ${C.border}`,
              padding: "10px 24px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, color: C.yellow }}>☆</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: C.fontSans }}>
                  Item Overview
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {actions}
              </div>
            </div>
          )}

          {/* ── Page content ── */}
          <div style={{ flex: 1, overflowX: "hidden", background: C.bgPage }}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
