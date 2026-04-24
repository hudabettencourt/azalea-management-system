"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type MenuItem = {
  label: string;
  href: string;
  icon: string;
  roles?: string[];
};

const MENU: MenuItem[] = [
  { label: "Dashboard",           href: "/dashboard",       icon: "◈" },
  { label: "Pembelian Reseller",  href: "/pembelian",       icon: "🛍" },
  { label: "Pembelian Bahan",     href: "/pembelian-bahan", icon: "🧪" },
  { label: "Produksi",            href: "/produksi",        icon: "⚙️" },
  { label: "Admin",               href: "/admin",           icon: "🔐", roles: ["admin"] },
];

interface SidebarProps {
  children: React.ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setUserEmail(data.user.email ?? null);
      const r = data.user.user_metadata?.role ?? data.user.app_metadata?.role ?? "staff";
      setRole(r);
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const visibleMenu = MENU.filter(m => !m.roles || (role && m.roles.includes(role)));

  const C = {
    bg: "#100c16",
    sidebar: "#120e1a",
    border: "#2a1f3d",
    text: "#e2d9f3",
    muted: "#7c6d8a",
    dim: "#3d3050",
    accent: "#a78bfa",
    hover: "#1e1830",
    activeB: "#a78bfa30",
  };

  const sidebarW = collapsed ? "60px" : "220px";

  const NavLink = ({ item }: { item: MenuItem }) => {
    const active = pathname === item.href || pathname?.startsWith(item.href + "/");
    return (
      <a
        href={item.href}
        title={collapsed ? item.label : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: collapsed ? "0" : "10px",
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? "12px 0" : "10px 14px",
          borderRadius: "8px",
          textDecoration: "none",
          background: active ? C.activeB : "transparent",
          borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent",
          color: active ? C.accent : C.muted,
          fontWeight: active ? 700 : 500,
          fontSize: "13px",
          fontFamily: "'DM Sans', sans-serif",
          transition: "all 0.15s",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = C.hover; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span style={{ fontSize: "16px", flexShrink: 0 }}>{item.icon}</span>
        {!collapsed && <span>{item.label}</span>}
      </a>
    );
  };

  const SidebarContent = () => (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      padding: "16px 8px",
    }}>
      {/* Logo + collapse */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        padding: "4px 8px 16px",
        borderBottom: `1px solid ${C.border}`,
        marginBottom: "12px",
      }}>
        {!collapsed && (
          <span style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: "18px",
            color: "#f0eaff",
            letterSpacing: "-0.02em",
          }}>
            Azalea
          </span>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            background: "none", border: "none", color: C.muted,
            cursor: "pointer", fontSize: "14px", padding: "4px",
            borderRadius: "4px", lineHeight: 1,
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "▶" : "◀"}
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
        {visibleMenu.map(item => <NavLink key={item.href} item={item} />)}
      </nav>

      {/* User info + logout */}
      <div style={{
        borderTop: `1px solid ${C.border}`,
        paddingTop: "12px",
        marginTop: "8px",
      }}>
        {!collapsed && userEmail && (
          <div style={{
            fontSize: "11px",
            color: C.muted,
            padding: "0 8px 8px",
            fontFamily: "'DM Mono', monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {userEmail}
            {role && (
              <span style={{
                marginLeft: "6px",
                background: C.accent + "25",
                color: C.accent,
                padding: "1px 5px",
                borderRadius: "3px",
                fontSize: "10px",
                fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
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
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: "8px",
            width: "100%",
            padding: collapsed ? "10px 0" : "9px 14px",
            background: "none",
            border: "none",
            borderRadius: "8px",
            color: "#f8717160",
            cursor: "pointer",
            fontSize: "13px",
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f8717115"; (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; (e.currentTarget as HTMLElement).style.color = "#f8717160"; }}
        >
          <span style={{ fontSize: "16px" }}>🚪</span>
          {!collapsed && "Logout"}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #100c16; }

        /* Mobile hamburger button */
        .sidebar-mobile-toggle {
          display: none;
          position: fixed;
          top: 16px;
          left: 16px;
          z-index: 1100;
          background: #1a1425;
          border: 1px solid #2a1f3d;
          color: #a78bfa;
          width: 40px;
          height: 40px;
          border-radius: 8px;
          font-size: 18px;
          cursor: pointer;
          align-items: center;
          justify-content: center;
        }

        @media (max-width: 768px) {
          .sidebar-mobile-toggle { display: flex; }
          .sidebar-desktop { display: none !important; }
          .sidebar-mobile-overlay {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(10, 8, 20, 0.8);
            z-index: 1000;
          }
          .sidebar-mobile-drawer {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 220px;
            background: #120e1a;
            border-right: 1px solid #2a1f3d;
            z-index: 1050;
          }
          .sidebar-main-content {
            margin-left: 0 !important;
            padding-top: 64px;
          }
        }
      `}</style>

      {/* Mobile toggle */}
      <button
        className="sidebar-mobile-toggle"
        onClick={() => setMobileOpen(o => !o)}
      >
        {mobileOpen ? "✕" : "☰"}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div className="sidebar-mobile-overlay" onClick={() => setMobileOpen(false)} />
          <div className="sidebar-mobile-drawer">
            <SidebarContent />
          </div>
        </>
      )}

      <div style={{ display: "flex", minHeight: "100vh", background: C.bg }}>
        {/* Desktop sidebar */}
        <div
          className="sidebar-desktop"
          style={{
            width: sidebarW,
            minWidth: sidebarW,
            background: C.sidebar,
            borderRight: `1px solid ${C.border}`,
            position: "sticky",
            top: 0,
            height: "100vh",
            overflowY: "auto",
            overflowX: "hidden",
            transition: "width 0.2s ease, min-width 0.2s ease",
            flexShrink: 0,
          }}
        >
          <SidebarContent />
        </div>

        {/* Main content */}
        <div
          className="sidebar-main-content"
          style={{
            flex: 1,
            minWidth: 0,
            overflowX: "hidden",
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
