"use client";

// /components/AppShell.tsx
// Shell utama Azalea ERP — IDE-style 3-level layout
// Menggantikan Sidebar.tsx
// Layout: Activity Bar (56px) + Contextual Sidebar (210px) + Main + Status Bar (28px)
// Responsive: desktop = IDE-style, mobile = bottom nav + drawer

import { NAVIGATION, getActiveModule, getBreadcrumb, getModuleDefaultHref } from "@/config/navigation";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  IconShoppingBag,
  IconTool,
  IconTruck,
  IconUsers,
  IconWallet,
  IconChartBar,
  IconSettings,
  IconChevronDown,
  IconChevronRight,
  IconBell,
  IconMoon,
  IconSun,
  IconLogout,
  IconMenu2,
  IconX,
  IconRefresh,
  IconAlertCircle,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { supabase } from "@/lib/supabase";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

const MODULE_ICONS: Record<string, React.ReactNode> = {
  shopee:     <IconShoppingBag size={22} />,
  produksi:   <IconTool size={22} />,
  pembelian:  <IconTruck size={22} />,
  penggajian: <IconUsers size={22} />,
  keuangan:   <IconWallet size={22} />,
  laporan:    <IconChartBar size={22} />,
  admin:      <IconSettings size={22} />,
};

type Notif = {
  id: string;
  type: "error" | "warning" | "info";
  icon: React.ReactNode;
  title: string;
  desc: string;
  href: string;
};

interface AppShellProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export default function AppShell({ children, actions }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const C = isDark ? DARK : LIGHT;

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [activeModule, setActiveModule] = useState(() => getActiveModule(pathname || ""));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [roleReady, setRoleReady] = useState(false);
  const [notifList, setNotifList] = useState<Notif[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const mod = getActiveModule(pathname || "");
    setActiveModule(mod);
    const currentMod = NAVIGATION.find(m => m.key === mod);
    if (currentMod) {
      const newOpenGroups: Record<string, boolean> = {};
      currentMod.groups.forEach(g => {
        const key = `${mod}-${g.label}`;
        const hasActive = g.items.some(item => {
          const base = item.href.split("?")[0];
          return pathname === base || pathname?.startsWith(base + "/");
        });
        newOpenGroups[key] = g.defaultOpen || hasActive || false;
      });
      setOpenGroups(newOpenGroups);
    }
  }, [pathname]);

  useEffect(() => {
    const fetchRole = async (userId: string, email: string) => {
      setUserEmail(email);
      setUserName(email.split("@")[0]);
      const { data: profile } = await supabase
        .from("profiles").select("role, nama").eq("id", userId).single();
      setRole(profile?.role ?? "staff");
      if (profile?.nama) setUserName(profile.nama);
      setRoleReady(true);
    };
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) fetchRole(session.user.id, session.user.email ?? "");
      else setRoleReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user)
        fetchRole(session.user.id, session.user.email ?? "");
      else if (event === "SIGNED_OUT") { setRole(null); setUserEmail(null); setRoleReady(true); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchNotifikasi = useCallback(async () => {
    setNotifLoading(true);
    const notifs: Notif[] = [];
    const { data: bahanKritis } = await supabase.from("bahan_baku").select("id, nama, stok, satuan").or("aktif.eq.true,aktif.is.null").lte("stok", 2);
    (bahanKritis || []).forEach((b: any) => {
      notifs.push({ id: `bahan-${b.id}`, type: b.stok <= 0 ? "error" : "warning", icon: b.stok <= 0 ? <IconAlertCircle size={16} /> : <IconAlertTriangle size={16} />, title: b.stok <= 0 ? `${b.nama} habis!` : `${b.nama} hampir habis`, desc: `Stok tersisa: ${b.stok} ${b.satuan}`, href: "/pembelian-bahan" });
    });
    const { data: produkHabis } = await supabase.from("stok_barang").select("id, nama_produk, jumlah_stok").lte("jumlah_stok", 0);
    (produkHabis || []).forEach((p: any) => {
      notifs.push({ id: `produk-${p.id}`, type: "error", icon: <IconAlertCircle size={16} />, title: `${p.nama_produk} habis`, desc: "Stok produk = 0, segera produksi", href: "/produksi" });
    });
    const { data: kasData } = await supabase.from("kas").select("tipe, nominal");
    if (kasData) {
      const saldo = kasData.reduce((s: number, k: any) => k.tipe === "Masuk" ? s + k.nominal : s - k.nominal, 0);
      if (saldo < 500000) notifs.push({ id: "kas-rendah", type: saldo < 0 ? "error" : "warning", icon: <IconAlertTriangle size={16} />, title: saldo < 0 ? "Saldo kas minus!" : "Saldo kas rendah", desc: `Saldo: Rp ${saldo.toLocaleString("id-ID")}`, href: "/kas" });
    }
    setNotifList(notifs);
    setNotifLoading(false);
  }, []);

  useEffect(() => { fetchNotifikasi(); }, [fetchNotifikasi]);

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };
  const toggleGroup = (key: string) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));
  const isItemActive = (href: string) => { const base = href.split("?")[0]; return pathname === base || pathname?.startsWith(base + "/"); };

  const currentMod = NAVIGATION.find(m => m.key === activeModule);
  const breadcrumb = getBreadcrumb(pathname || "");
  const visibleModules = NAVIGATION.filter(mod => { if (!mod.roles) return true; if (!roleReady) return false; return role && mod.roles.includes(role); });
  const notifColor = (type: Notif["type"]) => ({ error: C.red, warning: C.yellow, info: C.blue }[type]);

  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: isDark ? C.sidebar : "#ffffff" }}>
      <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${C.sidebarBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#fff", boxShadow: `0 2px 8px ${C.accentGlow}` }}>A</div>
        {(!sidebarCollapsed || isMobile) && (
          <span style={{ fontSize: 13, fontWeight: 700, color: C.muted, fontFamily: C.fontSans, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>{currentMod?.label || "Azalea"}</span>
        )}
      </div>
      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {currentMod?.groups.map(group => {
          const groupKey = `${activeModule}-${group.label}`;
          const isOpen = openGroups[groupKey] !== false;
          return (
            <div key={group.label}>
              <button onClick={() => toggleGroup(groupKey)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 14px 4px", background: "none", border: "none", cursor: "pointer", color: C.muted, fontFamily: C.fontMono, fontSize: 10, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                <span>{group.label}</span>
                {isOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
              </button>
              {isOpen && group.items.map(item => {
                if (item.roles && (!role || !item.roles.includes(role))) return null;
                const active = isItemActive(item.href);
                return (
                  <a key={item.href} href={item.href} onClick={() => isMobile && setMobileDrawerOpen(false)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 14px 6px 20px", textDecoration: "none", borderLeft: `2px solid ${active ? C.accent : "transparent"}`, background: active ? C.sidebarActive : "transparent", color: active ? C.accent : C.muted, fontWeight: active ? 700 : 500, fontSize: 12.5, fontFamily: C.fontSans, transition: "all 0.12s" }}
                    onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"; (e.currentTarget as HTMLElement).style.color = C.text; } }}
                    onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = C.muted; } }}
                  >
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div style={{ borderTop: `1px solid ${C.sidebarBorder}`, padding: "10px 14px" }}>
        {userEmail && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.fontSans, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{userName}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: C.fontMono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: 120 }}>{userEmail}</div>
              {role && <span style={{ background: C.accentGlow, color: C.accent, padding: "1px 6px", borderRadius: 20, fontSize: 9, fontWeight: 800, fontFamily: C.fontSans, flexShrink: 0 }}>{role}</span>}
            </div>
          </div>
        )}
        <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 8px", background: "transparent", border: "none", borderRadius: 8, color: C.red, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: C.fontSans }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.redDim}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
        >
          <IconLogout size={14} /><span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        * { scrollbar-width: thin; scrollbar-color: ${C.dim} transparent; }
        *::-webkit-scrollbar { width: 4px; }
        *::-webkit-scrollbar-thumb { background: ${C.dim}; border-radius: 4px; }
        a { -webkit-tap-highlight-color: transparent; }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: C.bgPage, fontFamily: C.fontSans }}>
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

          {/* ── ACTIVITY BAR ── */}
          {!isMobile && (
            <div style={{ width: 56, flexShrink: 0, background: isDark ? "#0d1812" : "#f8fffe", borderRight: `1px solid ${C.sidebarBorder}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: 2, zIndex: 10 }}>
              {visibleModules.map(mod => {
                const active = activeModule === mod.key;
                return (
                  <button key={mod.key} onClick={() => setActiveModule(mod.key)} title={mod.label}
                    style={{ width: 44, height: 48, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, border: "none", borderRadius: 10, background: active ? (isDark ? "rgba(45,212,191,0.15)" : "rgba(45,212,191,0.12)") : "transparent", color: active ? C.accent : C.muted, cursor: "pointer", transition: "all 0.12s", position: "relative" as const }}
                    onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"; (e.currentTarget as HTMLElement).style.color = C.text; } }}
                    onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = C.muted; } }}
                  >
                    {active && <div style={{ position: "absolute", left: 0, top: "20%", bottom: "20%", width: 3, borderRadius: "0 3px 3px 0", background: C.accent }} />}
                    <div style={{ display: "flex" }}>{MODULE_ICONS[mod.key]}</div>
                    <span style={{ fontSize: 9, fontFamily: C.fontSans, fontWeight: active ? 700 : 500, textAlign: "center" as const, lineHeight: 1.2 }}>{mod.label}</span>
                  </button>
                );
              })}
              <div style={{ flex: 1 }} />
              <button onClick={toggleTheme} title={isDark ? "Light Mode" : "Dark Mode"}
                style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 10, background: "transparent", color: C.muted, cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
              >
                {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
              </button>
            </div>
          )}

          {/* ── CONTEXTUAL SIDEBAR ── */}
          {!isMobile && (
            <div style={{ width: sidebarCollapsed ? 0 : 210, minWidth: sidebarCollapsed ? 0 : 210, overflow: "hidden", borderRight: sidebarCollapsed ? "none" : `1px solid ${C.sidebarBorder}`, transition: "width 0.2s ease, min-width 0.2s ease", flexShrink: 0 }}>
              {!sidebarCollapsed && <SidebarContent />}
            </div>
          )}

          {/* ── MOBILE DRAWER ── */}
          {isMobile && mobileDrawerOpen && (
            <>
              <div onClick={() => setMobileDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }} />
              <div style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: 260, zIndex: 201, animation: "slideIn 0.2s ease", boxShadow: "4px 0 24px rgba(0,0,0,0.2)" }}>
                <div style={{ position: "absolute", top: 10, right: 10, zIndex: 1 }}>
                  <button onClick={() => setMobileDrawerOpen(false)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 6px", cursor: "pointer", color: C.muted, display: "flex" }}><IconX size={16} /></button>
                </div>
                <div style={{ background: isDark ? "#0d1812" : "#f8fffe", borderBottom: `1px solid ${C.sidebarBorder}`, padding: "10px 8px 8px", display: "flex", gap: 4, flexWrap: "wrap" as const, overflowX: "auto" as const }}>
                  {visibleModules.map(mod => (
                    <button key={mod.key} onClick={() => setActiveModule(mod.key)}
                      style={{ padding: "4px 10px", border: `1px solid ${activeModule === mod.key ? C.accent : C.border}`, borderRadius: 20, background: activeModule === mod.key ? C.accentGlow : "transparent", color: activeModule === mod.key ? C.accent : C.muted, fontSize: 11, fontWeight: activeModule === mod.key ? 700 : 500, cursor: "pointer", fontFamily: C.fontSans, whiteSpace: "nowrap" as const }}
                    >{mod.label}</button>
                  ))}
                </div>
                <div style={{ height: "calc(100% - 54px)", overflow: "hidden" }}><SidebarContent /></div>
              </div>
            </>
          )}

          {/* ── MAIN CONTENT ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

            {/* ── TOP BAR ── */}
            <div style={{ height: isMobile ? 52 : 44, flexShrink: 0, background: isDark ? C.bgNav : "#ffffff", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "0 12px" : "0 16px", boxShadow: isDark ? "none" : "0 1px 3px rgba(0,0,0,0.04)" }}>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {isMobile ? (
                  <button onClick={() => setMobileDrawerOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", padding: 4 }}><IconMenu2 size={22} /></button>
                ) : (
                  <button onClick={() => setSidebarCollapsed(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", padding: 4, borderRadius: 6 }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.text}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.muted}
                  ><IconMenu2 size={18} /></button>
                )}

                {/* ── BREADCRUMB (desktop) — semua level bisa diklik ── */}
                {!isMobile && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.muted, fontFamily: C.fontSans }}>
                    {/* Home */}
                    <a href="/dashboard" style={{ color: C.accent, fontWeight: 600, textDecoration: "none" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.7"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
                    >Azalea</a>

                    {/* Module */}
                    {breadcrumb.module && (
                      <>
                        <IconChevronRight size={12} />
                        <a
                          href={currentMod?.groups.find(g => g.defaultOpen)?.items[0]?.href.split("?")[0] || currentMod?.groups[0]?.items[0]?.href.split("?")[0] || "/dashboard"}
                          style={{ color: C.muted, textDecoration: "none" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.text}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.muted}
                        >{breadcrumb.module}</a>
                      </>
                    )}

                    {/* Group */}
                    {breadcrumb.group && breadcrumb.group !== breadcrumb.module && (
                      <>
                        <IconChevronRight size={12} />
                        <span>{breadcrumb.group}</span>
                      </>
                    )}

                    {/* Page */}
                    {breadcrumb.page && breadcrumb.page !== breadcrumb.module && breadcrumb.page !== breadcrumb.group && (
                      <>
                        <IconChevronRight size={12} />
                        <span style={{ color: C.text, fontWeight: 600 }}>{breadcrumb.page}</span>
                      </>
                    )}
                  </div>
                )}

                {/* Mobile: page title */}
                {isMobile && (
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: C.fontSans }}>{breadcrumb.page}</span>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 8 }}>
                {actions && <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{actions}</div>}

                {/* Notifikasi */}
                <div style={{ position: "relative" }} ref={notifRef}>
                  <button onClick={() => { setNotifOpen(v => !v); if (!notifOpen) fetchNotifikasi(); }}
                    style={{ width: isMobile ? 34 : 30, height: isMobile ? 34 : 30, display: "flex", alignItems: "center", justifyContent: "center", background: notifOpen ? C.accentGlow : "transparent", border: `1px solid ${notifOpen ? C.accent : C.border}`, borderRadius: 8, cursor: "pointer", color: C.muted, position: "relative" as const, transition: "all 0.12s" }}
                  >
                    <IconBell size={isMobile ? 18 : 16} />
                    {notifList.length > 0 && (
                      <div style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: notifList.some(n => n.type === "error") ? C.red : C.yellow, border: `2px solid ${isDark ? C.bgNav : "#ffffff"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff", fontFamily: C.fontMono, padding: "0 3px" }}>
                        {notifList.length}
                      </div>
                    )}
                  </button>
                  {notifOpen && (
                    <>
                      <div onClick={() => setNotifOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 150 }} />
                      <div style={{ position: "absolute", top: 38, right: isMobile ? -60 : 0, zIndex: 200, width: isMobile ? 300 : 320, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: C.shadowMd, animation: "fadeUp 0.15s ease" }}>
                        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: C.fontSans }}>
                            Notifikasi{notifList.length > 0 && <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}> ({notifList.length})</span>}
                          </span>
                          <button onClick={fetchNotifikasi} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", borderRadius: 6, padding: 4 }}><IconRefresh size={14} /></button>
                        </div>
                        <div style={{ maxHeight: 360, overflowY: "auto" }}>
                          {notifLoading ? (
                            <div style={{ padding: 32, textAlign: "center", color: C.muted, fontSize: 13, fontFamily: C.fontSans }}>Memuat...</div>
                          ) : notifList.length === 0 ? (
                            <div style={{ padding: 32, textAlign: "center" }}>
                              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                              <div style={{ fontSize: 13, color: C.muted, fontFamily: C.fontSans }}>Semua aman</div>
                            </div>
                          ) : notifList.map(n => (
                            <a key={n.id} href={n.href} onClick={() => setNotifOpen(false)}
                              style={{ display: "flex", gap: 12, padding: "11px 16px", borderBottom: `1px solid ${C.border}`, textDecoration: "none", transition: "background 0.12s" }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                            >
                              <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: notifColor(n.type) + "20", display: "flex", alignItems: "center", justifyContent: "center", color: notifColor(n.type) }}>{n.icon}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: C.fontSans, marginBottom: 2 }}>{n.title}</div>
                                <div style={{ fontSize: 11, color: C.muted, fontFamily: C.fontMono }}>{n.desc}</div>
                              </div>
                              <div style={{ width: 6, height: 6, borderRadius: "50%", background: notifColor(n.type), flexShrink: 0, marginTop: 6 }} />
                            </a>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Dark mode */}
                {!isMobile && (
                  <button onClick={toggleTheme}
                    style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", color: C.muted, transition: "all 0.12s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = C.accent}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = C.border}
                  >
                    {isDark ? <IconSun size={15} /> : <IconMoon size={15} />}
                  </button>
                )}

                {/* Avatar */}
                <div style={{ width: isMobile ? 34 : 30, height: isMobile ? 34 : 30, borderRadius: isMobile ? 10 : 8, background: `linear-gradient(135deg, ${C.accent}, ${C.accentDark})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 13 : 12, fontWeight: 800, color: "#fff", fontFamily: C.fontSans, cursor: "pointer", boxShadow: `0 2px 8px ${C.accentGlow}`, flexShrink: 0 }}>
                  {(userName || "A")[0].toUpperCase()}
                </div>
              </div>
            </div>

            {/* ── PAGE CONTENT ── */}
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: C.bgPage, paddingBottom: isMobile ? 64 : 0 }}>
              {children}
            </div>
          </div>
        </div>

        {/* ── STATUS BAR ── */}
        {!isMobile && (
          <div style={{ height: 28, flexShrink: 0, background: "#1a7f64", display: "flex", alignItems: "center", padding: "0 14px", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.85)", fontFamily: C.fontSans }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", flexShrink: 0 }} />
              Shopee terhubung
            </div>
            <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.2)" }} />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontFamily: C.fontMono }}>4 toko aktif · AzaleaFood · AsdaFood · ErlinFood · RaizelFood</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontFamily: C.fontMono }}>Azalea ERP v2.0</div>
          </div>
        )}

        {/* ── BOTTOM NAV (mobile) ── */}
        {isMobile && (
          <div style={{ height: 60, flexShrink: 0, background: isDark ? C.sidebar : "#ffffff", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-around", padding: "0 8px", boxShadow: "0 -4px 12px rgba(0,0,0,0.08)", position: "fixed" as const, bottom: 0, left: 0, right: 0, zIndex: 100 }}>
            {visibleModules.slice(0, 5).map(mod => {
              const active = activeModule === mod.key;
              return (
                <button key={mod.key} onClick={() => { setActiveModule(mod.key); const firstItem = NAVIGATION.find(m => m.key === mod.key)?.groups[0]?.items[0]; if (firstItem) router.push(firstItem.href.split("?")[0]); }}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, flex: 1, height: 54, background: "none", border: "none", cursor: "pointer", color: active ? C.accent : C.muted }}
                >
                  <div style={{ display: "flex" }}>{MODULE_ICONS[mod.key]}</div>
                  <span style={{ fontSize: 9, fontFamily: C.fontSans, fontWeight: active ? 700 : 500 }}>{mod.label}</span>
                </button>
              );
            })}
            {visibleModules.length > 5 && (
              <button onClick={() => setMobileDrawerOpen(true)} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, flex: 1, height: 54, background: "none", border: "none", cursor: "pointer", color: C.muted }}>
                <IconMenu2 size={22} />
                <span style={{ fontSize: 9, fontFamily: C.fontSans }}>Lainnya</span>
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
