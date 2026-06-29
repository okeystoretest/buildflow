"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
      className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <Sun className={`h-4 w-4 transition-all duration-300 ${theme === "dark" ? "rotate-90 scale-0" : "rotate-0 scale-100"}`} />
      <Moon className={`absolute h-4 w-4 transition-all duration-300 ${theme === "dark" ? "rotate-0 scale-100" : "-rotate-90 scale-0"}`} />
    </button>
  );
}
