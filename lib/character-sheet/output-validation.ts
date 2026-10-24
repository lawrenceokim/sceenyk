import { characterOutputError } from "./diagnostics";

// This is validation only. Never infer approval from a response or follow a redirect.
export function validateCharacterOutputUrl(value: string, approvedHosts: readonly string[]) {
  let url: URL;
  try { url = new URL(value); }
  catch { throw characterOutputError("CHARACTER_OUTPUT_URL_INVALID", "output_download"); }
  const host = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(url.hostname) ? { outputHost: url.hostname } : {};
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) {
    throw characterOutputError("CHARACTER_OUTPUT_URL_INVALID", "output_download", host);
  }
  if (!approvedHosts.includes(url.hostname)) throw characterOutputError("CHARACTER_OUTPUT_HOST_REJECTED", "output_download", host);
  return url;
}
