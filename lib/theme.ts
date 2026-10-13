import { brandFaviconId, darkBrandIcon, lightBrandIcon } from "./brand-assets";

export const themeStorageKey = "sceenyk-theme";

export function syncBrandFavicon(dark: boolean) {
  const icon = document.getElementById(brandFaviconId) as HTMLLinkElement | null;
  if (icon) icon.href = dark ? darkBrandIcon : lightBrandIcon;
}

// Only authored code is injected; no user input is interpolated into this script.
export const themeInitScript = `(function(){var t;try{t=localStorage.getItem("${themeStorageKey}")}catch(e){}var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);var i=document.getElementById(${JSON.stringify(brandFaviconId)});if(i)i.href=d?${JSON.stringify(darkBrandIcon)}:${JSON.stringify(lightBrandIcon)}})()`;
