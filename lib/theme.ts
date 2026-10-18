import { brandFaviconId, darkBrandIcon, lightBrandIcon } from "./brand-assets";

export const themeStorageKey = "sceenyk-theme";
export type ThemePreference = "light" | "dark" | "system";
export const themeChangeEvent = "sceenyk-theme-change";
export const defaultThemePreference: ThemePreference = "dark";
let memoryPreference: ThemePreference = defaultThemePreference;
let volatilePreference: ThemePreference | null = null;

export function readThemePreference(): ThemePreference {
  if (volatilePreference !== null) return volatilePreference;
  try {
    const saved = localStorage.getItem(themeStorageKey);
    memoryPreference = saved === "light" || saved === "dark" || saved === "system" ? saved : defaultThemePreference;
  } catch { /* Preserve the in-page choice when storage is blocked. */ }
  return memoryPreference;
}

export function applyThemePreference() {
  const preference = readThemePreference();
  const dark = preference === "dark" || (preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  syncBrandFavicon(dark);
}

export function setThemePreference(preference: ThemePreference) {
  memoryPreference = preference;
  try {
    localStorage.setItem(themeStorageKey, preference);
    volatilePreference = null;
  } catch { volatilePreference = preference; }
  applyThemePreference();
  window.dispatchEvent(new Event(themeChangeEvent));
}

export function syncBrandFavicon(dark: boolean) {
  const icon = document.getElementById(brandFaviconId) as HTMLLinkElement | null;
  if (icon) icon.href = dark ? darkBrandIcon : lightBrandIcon;
}

// Only authored code is injected; no user input is interpolated into this script.
export const themeInitScript = `(function(){var t;try{t=localStorage.getItem("${themeStorageKey}")}catch(e){}var d=t==="system"?matchMedia("(prefers-color-scheme: dark)").matches:t!=="light";document.documentElement.classList.toggle("dark",d);var i=document.getElementById(${JSON.stringify(brandFaviconId)});if(i)i.href=d?${JSON.stringify(darkBrandIcon)}:${JSON.stringify(lightBrandIcon)}})()`;
