"use client";

import { useState, lazy, Suspense } from "react";
import { useRole } from "@/hooks/useRole";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";
import Sidebar from "@/components/Sidebar";
import { Toast } from "./adminTypes";

// ── Lazy load tiap tab ──
const UsersTab = lazy(() => import("./tabs/UsersTab"));
const ProdukTab = lazy(() => import("./tabs/ProdukTab"));
const BahanTab = lazy(() => import("./tabs/BahanTab"));
const TokoTab = lazy(() => import("./tabs/TokoTab"));
const SupplierTab = lazy(() => import("./tabs/SupplierTab"));
const PelangganTab = lazy(() => import("./tabs/PelangganTab"));
const VarianBoronganTab = lazy(() => import("./tabs/VarianBoronganTab"));
const MasterPLUTab = lazy(() => import("./tabs/MasterPLUTab"));
const KaryawanTab = lazy(() => import("./tabs/KaryawanTab"));

type Section = "users" | "produk" | "bahan" | "toko" | "supplier" | "pelanggan" | "varian_borongan" | "master_plu" | "karyawan";

const NAV_ITEMS: { id: Section; label: string; icon: string; group?: string }[] = [
  { id: "users",           label: "Manajemen User",   icon: "⊛" },
  { id: "produk",          label: "Master Produk",    icon: "📦" },
  { id: "bahan",           label: "Master Bahan",     icon: "🧪" },
  { id: "toko",            label: "Master Toko",      icon: "🏪" },
  { id: "supplier",        label: "Master Supplier",  icon: "🏭" },
  { id: "pelanggan",       label: "Master Pelanggan", icon: "👤" },
  { id: "varian_borongan", label: "Varian Borongan",  icon: "⚖️" },
  { id: "master_plu",      label: "Master PLU",       icon: "🔢" },
  { id: "karyawan",        label: "Master Karyawan",  icon: "👷" },
];

function TabLoading({ C }: { C: any }) {
  return (
    <div style={{ padding: 60, textAlign: "center", color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>
      <div style={{ fontSize: 24, marginBottom: 12 }}>◈</div>
      Memuat...
    </div>
  );
}

export default function AdminPage() {
  const { profile: currentUser, isOwner, loading: roleLoading } = useRole();
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;
  const [activeSection, setActiveSection] = useState<Section>("users");
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (msg: string, type: Toast["type"] = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  if (roleLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
      <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Memuat...</div>
    </div>
  );

  if (!isOwner) return (
    <Sidebar>
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 48 }}>🔐</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Akses Ditolak</div>
        <div style={{ color: C.muted, fontFamily: C.fontMono, fontSize: 13 }}>Halaman ini hanya untuk Owner / Super Admin</div>
        <a href="/dashboard" style={{ color: C.accent, fontFamily: C.fontMono, fontSize: 13 }}>← Kembali ke Dashboard</a>
      </div>
    </Sidebar>
  );

  return (
    <Sidebar>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 2000px; } }
        .data-row:hover { background: ${isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)"} !important; }
        .btn-edit:hover { background: ${isDark ? "rgba(167,139,250,0.2)" : "rgba(167,139,250,0.15)"} !important; }
        .btn-del:hover { background: ${isDark ? "rgba(235,87,87,0.2)" : "rgba(235,87,87,0.12)"} !important; }
        select option { background: ${C.card}; color: ${C.text}; }
        select optgroup { background: ${C.card}; color: ${C.muted}; font-style: normal; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; }
        input:focus, select:focus, textarea:focus { border-color: ${C.accent}80 !important; outline: none; }
        input::placeholder, textarea::placeholder { color: ${C.muted} !important; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, background: C.card, border: `1px solid ${toast.type === "success" ? C.green : toast.type === "error" ? C.red : C.blue}44`, color: toast.type === "success" ? C.green : toast.type === "error" ? C.red : C.blue, borderRadius: 12, padding: "14px 20px", fontFamily: C.fontSans, fontSize: 13, fontWeight: 600, boxShadow: C.shadowMd, maxWidth: 360, animation: "fadeUp 0.2s ease" }}>
          {toast.msg}
        </div>
      )}

      <div style={{ background: C.bg, minHeight: "100vh", fontFamily: C.fontSans, color: C.text }}>

        {/* ── TAB BAR ── */}
        <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, padding: "0 28px", position: "sticky", top: 57, zIndex: 90, boxShadow: isDark ? "none" : "0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setActiveSection(item.id)} style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "13px 16px 11px", border: "none", background: "transparent",
                borderBottom: `2px solid ${activeSection === item.id ? C.accent : "transparent"}`,
                color: activeSection === item.id ? C.accent : C.muted,
                cursor: "pointer", fontFamily: C.fontSans, fontSize: 13,
                fontWeight: activeSection === item.id ? 700 : 500,
                whiteSpace: "nowrap", transition: "all 0.15s", flexShrink: 0,
              }}>
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── KONTEN ── */}
        <div style={{ padding: "28px 28px 40px", paddingTop: 74 }}>
          <Suspense fallback={<TabLoading C={C} />}>
            {activeSection === "users" && (
              <UsersTab currentUserId={currentUser?.id} C={C} isDark={isDark} showToast={showToast} />
            )}
            {activeSection === "produk" && (
              <ProdukTab C={C} isDark={isDark} showToast={showToast} />
            )}
            {activeSection === "bahan" && (
              <BahanTab C={C} isDark={isDark} showToast={showToast} />
            )}
            {activeSection === "toko" && (
              <TokoTab C={C} isDark={isDark} showToast={showToast} />
            )}
            {activeSection === "supplier" && (
              <SupplierTab C={C} isDark={isDark} showToast={showToast} />
            )}
            {activeSection === "pelanggan" && (
              <PelangganTab C={C} isDark={isDark} showToast={showToast} />
            )}
            {activeSection === "varian_borongan" && (
              <VarianBoronganTab C={C} isDark={isDark} showToast={showToast} />
            )}
            {activeSection === "master_plu" && (
              <MasterPLUTab C={C} isDark={isDark} showToast={showToast} />
            )}
            {activeSection === "karyawan" && (
              <KaryawanTab C={C} isDark={isDark} showToast={showToast} />
            )}
          </Suspense>
        </div>
      </div>
    </Sidebar>
  );
}
