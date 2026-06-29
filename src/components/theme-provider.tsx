"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Dark por padrao.
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("bf-theme")) as Theme | null;
    const initial = saved ?? "dark";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
    setMounted(true);
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("bf-theme", next);
      document.documentElement.classList.add("theme-transition");
      document.documentElement.classList.toggle("dark", next === "dark");
      window.setTimeout(() => document.documentElement.classList.remove("theme-transition"), 400);
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {/* evita flash: so renderiza apos montar o tema */}
      <div style={{ visibility: mounted ? "visible" : "hidden" }}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme deve ser usado dentro de ThemeProvider");
  return ctx;
}
