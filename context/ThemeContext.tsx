"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = localStorage.getItem("azalea-theme") as Theme | null;
    if (saved === "dark" || saved === "light") setTheme(saved);
  }, []);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem("azalea-theme", next);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

// ── LIGHT — RAPID ERP pastel ──
export const LIGHT = {
  bg: "#f0fdf9",
  bgPage: "#e8f8f2",
  bgNav: "#ffffff",
  card: "#ffffff",
  cardAlt: "#f8fffe",
  cardHover: "#f0fdf9",
  border: "rgba(0,0,0,0.07)",
  borderStrong: "rgba(0,0,0,0.13)",
  text: "#1a2e26",
  textMid: "#2d4a3e",
  muted: "#7a9e92",
  dim: "#d4ede6",
  accent: "#2dd4bf",
  accentDark: "#0f9e8a",
  accentGlow: "rgba(45,212,191,0.15)",
  accentText: "#ffffff",
  green: "#22c55e",
  greenDim: "rgba(34,197,94,0.12)",
  greenPastel: "#dcfce7",
  red: "#ef4444",
  redDim: "rgba(239,68,68,0.1)",
  redPastel: "#fee2e2",
  yellow: "#f59e0b",
  yellowDim: "rgba(245,158,11,0.12)",
  yellowPastel: "#fef3c7",
  blue: "#3b82f6",
  blueDim: "rgba(59,130,246,0.1)",
  bluePastel: "#dbeafe",
  orange: "#f97316",
  orangeDim: "rgba(249,115,22,0.1)",
  orangePastel: "#ffedd5",
  purple: "#a855f7",
  purpleDim: "rgba(168,85,247,0.1)",
  purplePastel: "#f3e8ff",
  pink: "#ec4899",
  pinkDim: "rgba(236,72,153,0.1)",
  pinkPastel: "#fce7f3",
  teal: "#14b8a6",
  tealDim: "rgba(20,184,166,0.1)",
  tealPastel: "#ccfbf1",
  cardYellow: "#fef9c3",
  cardGreen: "#dcfce7",
  cardBlue: "#dbeafe",
  cardPurple: "#ede9fe",
  cardOrange: "#ffedd5",
  cardPink: "#fce7f3",
  cardTeal: "#ccfbf1",
  cardRed: "#fee2e2",
  shadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
  shadowMd: "0 4px 16px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.05)",
  shadowHover: "0 8px 24px rgba(0,0,0,0.1), 0 16px 40px rgba(0,0,0,0.06)",
  fontDisplay: "'Nunito', sans-serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'Nunito', sans-serif",
  sidebar: "#ffffff",
  sidebarActive: "rgba(45,212,191,0.1)",
  sidebarBorder: "rgba(0,0,0,0.06)",
};

// ── DARK — green-tinted dark ──
export const DARK = {
  bg: "#0f1a16",
  bgPage: "#0b1410",
  bgNav: "#131f1a",
  card: "#172218",
  cardAlt: "#1c2a1e",
  cardHover: "#1e2e20",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.14)",
  text: "#e8f5f0",
  textMid: "#b8d4c8",
  muted: "#5a8a76",
  dim: "#1e3028",
  accent: "#2dd4bf",
  accentDark: "#0f9e8a",
  accentGlow: "rgba(45,212,191,0.2)",
  accentText: "#ffffff",
  green: "#4ade80",
  greenDim: "rgba(74,222,128,0.15)",
  greenPastel: "rgba(74,222,128,0.12)",
  red: "#f87171",
  redDim: "rgba(248,113,113,0.15)",
  redPastel: "rgba(248,113,113,0.12)",
  yellow: "#fbbf24",
  yellowDim: "rgba(251,191,36,0.15)",
  yellowPastel: "rgba(251,191,36,0.12)",
  blue: "#60a5fa",
  blueDim: "rgba(96,165,250,0.15)",
  bluePastel: "rgba(96,165,250,0.12)",
  orange: "#fb923c",
  orangeDim: "rgba(251,146,60,0.15)",
  orangePastel: "rgba(251,146,60,0.12)",
  purple: "#c084fc",
  purpleDim: "rgba(192,132,252,0.15)",
  purplePastel: "rgba(192,132,252,0.12)",
  pink: "#f472b6",
  pinkDim: "rgba(244,114,182,0.15)",
  pinkPastel: "rgba(244,114,182,0.12)",
  teal: "#2dd4bf",
  tealDim: "rgba(45,212,191,0.15)",
  tealPastel: "rgba(45,212,191,0.12)",
  cardYellow: "rgba(251,191,36,0.08)",
  cardGreen: "rgba(74,222,128,0.08)",
  cardBlue: "rgba(96,165,250,0.08)",
  cardPurple: "rgba(192,132,252,0.08)",
  cardOrange: "rgba(251,146,60,0.08)",
  cardPink: "rgba(244,114,182,0.08)",
  cardTeal: "rgba(45,212,191,0.08)",
  cardRed: "rgba(248,113,113,0.08)",
  shadow: "0 1px 3px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)",
  shadowMd: "0 4px 16px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.25)",
  shadowHover: "0 8px 24px rgba(0,0,0,0.4), 0 16px 40px rgba(0,0,0,0.3)",
  fontDisplay: "'Nunito', sans-serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'Nunito', sans-serif",
  sidebar: "#131f1a",
  sidebarActive: "rgba(45,212,191,0.15)",
  sidebarBorder: "rgba(255,255,255,0.06)",
};

export type ColorPalette = typeof LIGHT;
