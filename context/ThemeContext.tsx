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
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
    }
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

// ── Color palettes ──
export const LIGHT = {
  bg: "#f0faf6",
  bgPage: "#e8f5f0",
  card: "#ffffff",
  cardAlt: "#f7fdfa",
  sidebar: "#ffffff",
  border: "rgba(0,0,0,0.08)",
  borderStrong: "rgba(0,0,0,0.14)",
  text: "#1a2e26",
  textMid: "#3d5a4e",
  muted: "#7a9e92",
  dim: "#d0e8e0",
  accent: "#10b981",       // emerald green
  accentGlow: "rgba(16,185,129,0.12)",
  accentText: "#ffffff",
  green: "#10b981",
  greenDim: "rgba(16,185,129,0.12)",
  red: "#ef4444",
  redDim: "rgba(239,68,68,0.1)",
  yellow: "#f59e0b",
  yellowDim: "rgba(245,158,11,0.12)",
  blue: "#3b82f6",
  blueDim: "rgba(59,130,246,0.1)",
  orange: "#f97316",
  orangeDim: "rgba(249,115,22,0.1)",
  purple: "#8b5cf6",
  purpleDim: "rgba(139,92,246,0.1)",
  pink: "#ec4899",
  pinkDim: "rgba(236,72,153,0.1)",
  teal: "#14b8a6",
  tealDim: "rgba(20,184,166,0.1)",
  shadow: "0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)",
  shadowHover: "0 4px 16px rgba(0,0,0,0.12), 0 8px 32px rgba(0,0,0,0.08)",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

export const DARK = {
  bg: "#100c16",
  bgPage: "#100c16",
  card: "#16111f",
  cardAlt: "#1a1428",
  sidebar: "#120e1a",
  border: "rgba(167,139,250,0.1)",
  borderStrong: "rgba(167,139,250,0.2)",
  text: "#f0eaff",
  textMid: "#c4b5fd",
  muted: "#7c6f9a",
  dim: "#2e2640",
  accent: "#a78bfa",
  accentGlow: "rgba(167,139,250,0.15)",
  accentText: "#ffffff",
  green: "#34d399",
  greenDim: "rgba(52,211,153,0.12)",
  red: "#f87171",
  redDim: "rgba(248,113,113,0.12)",
  yellow: "#fbbf24",
  yellowDim: "rgba(251,191,36,0.12)",
  blue: "#60a5fa",
  blueDim: "rgba(96,165,250,0.12)",
  orange: "#fb923c",
  orangeDim: "rgba(251,146,60,0.12)",
  purple: "#c084fc",
  purpleDim: "rgba(192,132,252,0.12)",
  pink: "#f472b6",
  pinkDim: "rgba(244,114,182,0.12)",
  teal: "#2dd4bf",
  tealDim: "rgba(45,212,191,0.12)",
  shadow: "0 1px 4px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2)",
  shadowHover: "0 4px 16px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.3)",
  fontDisplay: "'DM Serif Display', serif",
  fontMono: "'DM Mono', monospace",
  fontSans: "'DM Sans', sans-serif",
};

export type ColorPalette = typeof LIGHT;
