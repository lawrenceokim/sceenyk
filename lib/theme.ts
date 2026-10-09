export const themeStorageKey = "sceenyk-theme";

// Only authored code is injected; no user input is interpolated into this script.
export const themeInitScript = `(function(){var t;try{t=localStorage.getItem("${themeStorageKey}")}catch(e){}document.documentElement.classList.toggle("dark",t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))})()`;
