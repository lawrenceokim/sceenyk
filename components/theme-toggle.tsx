"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { themeStorageKey } from "@/lib/theme";

export function ThemeController() {
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    function applyPreference() {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(themeStorageKey);
      } catch {
        // Storage may be blocked; the system preference still works.
      }
      document.documentElement.classList.toggle(
        "dark",
        saved === "dark" || (saved !== "light" && system.matches),
      );
    }
    function syncStorage(event: StorageEvent) {
      if (event.key === themeStorageKey || event.key === null)
        applyPreference();
    }
    applyPreference();
    system.addEventListener("change", applyPreference);
    window.addEventListener("storage", syncStorage);
    return () => {
      system.removeEventListener("change", applyPreference);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);
  return null;
}

export function ThemeToggle() {
  function toggleTheme() {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(themeStorageKey, dark ? "dark" : "light");
    } catch {
      // Keep the in-page choice usable even when persistence is unavailable.
    }
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle light and dark theme"
      title="Toggle light and dark theme"
    >
      <Moon className="size-5 dark:hidden" aria-hidden="true" />
      <Sun className="hidden size-5 dark:block" aria-hidden="true" />
    </Button>
  );
}
