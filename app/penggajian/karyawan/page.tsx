"use client";
import { useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import KaryawanTab from "@/app/admin/tabs/KaryawanTab";
import { useTheme, LIGHT, DARK } from "@/context/ThemeContext";

type Toast = { id: number; msg: string; type: "success" | "error" | "info" };

export default function PenggajianKaryawanPage() {
  const { isDark } = useTheme();
  const C = isDark ? DARK : LIGHT;
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((msg: string, type: Toast["type"] = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const toastColor = (type: Toast["type"]) =>
    type === "error" ? C.red : type === "info" ? C.blue : C.accent;

  return (
    <AppShell>
      {/* Toast */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: C.card, border: `1px solid ${toastColor(t.type)}40`, borderLeft: `4px solid ${toastColor(t.type)}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: C.text, fontFamily: C.fontSans, boxShadow: C.shadowMd, minWidth: 260, animation: "fadeUp 0.2s ease" }}>
            {t.msg}
          </div>
        ))}
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 900, margin: "0 auto" }}>
        <KaryawanTab C={C} isDark={isDark} showToast={showToast} />
      </div>
    </AppShell>
  );
}
