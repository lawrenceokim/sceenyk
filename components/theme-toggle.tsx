"use client";
import { useEffect } from "react";
import { applyThemePreference, themeChangeEvent, themeStorageKey } from "@/lib/theme";
export function ThemeController() {
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    function syncStorage(event: StorageEvent) { if (event.key === themeStorageKey || event.key === null) applyThemePreference(); }
    applyThemePreference();
    system.addEventListener("change", applyThemePreference);
    window.addEventListener("storage", syncStorage);
    window.addEventListener(themeChangeEvent, applyThemePreference);
    return () => {
      system.removeEventListener("change", applyThemePreference);
      window.removeEventListener("storage", syncStorage);
      window.removeEventListener(themeChangeEvent, applyThemePreference);
    };
  }, []);
  return null;
}
