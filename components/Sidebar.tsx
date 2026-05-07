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
  { group: "", items: [{ label: "Dashboard", href: "/dashboard", icon: "◈" }] },
  {
    group: "Transaksi",
    items: [
      { label: "Penjualan",          href: "/penjualan",       icon: "🛍️" },
      { label: "Pembelian Bahan",    href: "/pembelian-bahan", icon: "🧪" },
      { label: "Pembelian Reseller", href: "/pembelian",       icon: "📦" },
      { label: "Kas",                href: "/kas",             icon: "💰" },
      { label: "Fee Platform",       href: "/fee-platform",    icon: "💸" },
      { label: "Rekap Saldo Shopee", href: "/rekap-saldo",     icon: "💳" },
    ],
  },
  {
    group: "Operasional",
    items: [
      { label: "Produksi",   href: "/produksi",   icon: "⚙️" },
      { label: "Penggajian", href: "/penggajian", icon: "👥" },
    ],
  },
  { group: "Laporan", items: [{ label: "Laporan", href: "/laporan", icon: "📊" }] },
  {
    group: "Pengaturan",
    items: [{ label: "Admin", href: "/admin", icon: "🔐", roles: ["owner", "super_admin"] }],
  },
];

interface SidebarProps { children: React.ReactNode; }

export default function Sidebar({ children }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme, isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [collapsed, setCollapsed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [roleReady, setRoleReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fetchRole = async (userId: string, email: string) => {
      setUserEmail(email);
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
      setRole(profile?.role ?? "staff");
      setRoleReady(true);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchRole(session.user.id, session.user.email ?? "");
      } else {
        setRoleReady(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        fetchRole(session.user.id, session.user.email ?? "");
      } else if (event === "SIGNED_OUT") {
        setRole(null);
        setUserEmail(null);
        setRoleReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const NavItem = ({ item }: { item: MenuGroup["items"][0] }) => {
    if (item.roles && !roleReady) return (
      <div style={{ padding: "9px 12px", borderRadius: "8px" }}>
        <div style={{ height: "13px", background: C.border, borderRadius: "4px", opacity: 0.5 }} />
      </div>
    );
    if (item.roles && (!role || !item.roles.includes(role))) return null;

    const active =
      item.href === "/dashboard"
        ? pathname === "/dashboard"
        : pathname === item.href || pathname?.startsWith(item.href + "/");

    return (
      <a
        href={item.href}
        title={collapsed ? item.label : undefined}
        style={{
          display: "flex", alignItems: "center",
          gap: collapsed ? "0" : "10px",
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? "11px 0" : "9px 12px",
          borderRadius: "8px", textDecoration: "none",
          background: active ? C.accentGlow : "transparent",
          borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent",
          color: active ? C.accent : C.muted,
          fontWeight: active ? 700 : 500, fontSize: "13px",
          fontFamily: C.fontSans, transition: "all 0.15s",
          whiteSpace: "nowrap", overflow: "hidden",
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = isDark ? "#1e1830" : "#f0fdf8"; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span style={{ fontSize: "15px", flexShrink: 0 }}>{item.icon}</span>
        {!collapsed && <span>{item.label}</span>}
      </a>
    );
  };

  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "16px 8px" }}>
      {/* Logo + collapse + theme toggle */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: "4px 6px 16px",
        borderBottom: `1px solid ${C.border}`,
        marginBottom: "12px",
        gap: 6,
      }}>
        {!collapsed && (
          <span style={{
            fontFamily: C.fontDisplay, fontSize: "18px",
            color: C.accent, letterSpacing: "-0.02em",
          }}>
            Azalea
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={isDark ? "Switch to Light" : "Switch to Dark"}
            style={{
              background: C.accentGlow,
              border: `1px solid ${C.border}`,
              borderRadius: "6px",
              color: C.accent,
              cursor: "pointer",
              fontSize: "13px",
              padding: "4px 6px",
              lineHeight: 1,
              transition: "all 0.15s",
            }}
          >
            {isDark ? "☀️" : "🌙"}
          </button>
          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(c => !c)}
            style={{
              background: "none", border: "none",
              color: C.muted, cursor: "pointer",
              fontSize: "13px", padding: "4px",
              borderRadius: "4px", lineHeight: 1,
            }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "▶" : "◀"}
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px", overflowY: "auto" }}>
        {MENU_GROUPS.map((group, gi) => (
          <div key={gi} style={{ marginBottom: "4px" }}>
            {!collapsed && group.group && (
              <div style={{
                fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em",
                textTransform: "uppercase", color: C.muted,
                padding: "8px 12px 4px", fontFamily: C.fontMono,
              }}>
                {group.group}
              </div>
            )}
            {collapsed && gi > 0 && (
              <div style={{ height: "1px", background: C.border, margin: "6px 8px" }} />
            )}
            {group.items.map(item => <NavItem key={item.href} item={item} />)}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "12px", marginTop: "8px" }}>
        {!collapsed && userEmail && (
          <div style={{
            fontSize: "11px", color: C.muted,
            padding: "0 8px 8px", fontFamily: C.fontMono,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {userEmail}
            {role && (
              <span style={{
                marginLeft: "6px",
                background: C.accentGlow,
                color: C.accent,
                padding: "1px 5px", borderRadius: "3px",
                fontSize: "10px", fontWeight: 700,
                fontFamily: C.fontSans,
              }}>
                {role}
              </span>
            )}
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          style={{
            display: "flex", alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: "8px", width: "100%",
            padding: collapsed ? "10px 0" : "8px 12px",
            background: "transparent", border: "none",
            borderRadius: "8px", color: C.muted,
            fontSize: "13px", fontWeight: 500,
            cursor: "pointer", transition: "all 0.15s",
            fontFamily: C.fontSans,
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isDark ? "#1e1830" : "#f0fdf8"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
        >
          <span style={{ fontSize: "15px" }}>🚪</span>
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        @media (max-width: 768px) {
          .sidebar-desktop { display: none !important; }
          .sidebar-mobile-button { 
            position: fixed; top: 16px; left: 16px; z-index: 999; 
            background: ${C.sidebar}; border: 1px solid ${C.border}; 
            border-radius: 8px; padding: 8px 12px; color: ${C.text}; 
            cursor: pointer; font-size: 18px; 
          }
          .sidebar-mobile-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; }
          .sidebar-mobile-drawer { 
            position: fixed; left: 0; top: 0; bottom: 0; width: 240px; 
            background: ${C.sidebar}; z-index: 1001; 
            box-shadow: 4px 0 12px rgba(0,0,0,0.15); 
          }
        }
        @media (min-width: 769px) { .sidebar-mobile-button { display: none !important; } }
        * { scrollbar-width: thin; scrollbar-color: ${C.border} transparent; }
        *::-webkit-scrollbar { width: 6px; }
        *::-webkit-scrollbar-track { background: transparent; }
        *::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
      `}</style>

      <button className="sidebar-mobile-button" onClick={() => setMobileOpen(true)} aria-label="Open menu">☰</button>

      {mobileOpen && (
        <>
          <div className="sidebar-mobile-overlay" onClick={() => setMobileOpen(false)} />
          <div className="sidebar-mobile-drawer"><SidebarContent /></div>
        </>
      )}

      <div style={{ display: "flex", minHeight: "100vh", background: C.bg }}>
        <div
          className="sidebar-desktop"
          style={{
            width: collapsed ? "60px" : "210px",
            minWidth: collapsed ? "60px" : "210px",
            background: C.sidebar,
            borderRight: `1px solid ${C.border}`,
            position: "sticky", top: 0, height: "100vh",
            overflowY: "auto", overflowX: "hidden",
            transition: "width 0.2s ease, min-width 0.2s ease",
            flexShrink: 0,
            boxShadow: isDark ? "none" : "2px 0 8px rgba(0,0,0,0.06)",
          }}
        >
          <SidebarContent />
        </div>
        <div style={{ flex: 1, minWidth: 0, overflowX: "hidden", background: C.bgPage }}>
          {children}
        </div>
      </div>
    </>
  );
}
