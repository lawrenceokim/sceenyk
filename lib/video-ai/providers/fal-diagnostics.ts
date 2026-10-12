import "server-only";

// Provider error input/msg/ctx can echo credentials, prompts and signed URLs.
// Emit only fixed categories and allowlisted schema fields, never raw errors.
const fields = new Set(["body", "prompt", "video_url", "image_url", "num_frames", "frames_per_second", "resolution", "generate_audio", "video_strength", "enable_prompt_expansion", "enable_safety_checker", "negative_prompt", "duration", "fps", "aspect_ratio"]);
const types = new Set(["missing", "value_error", "type_error", "string_type", "int_type", "float_type", "bool_type", "literal_error", "enum", "greater_than", "greater_than_equal", "less_than", "less_than_equal", "url_parsing", "url_type", "string_too_long", "string_too_short", "extra_forbidden"]);
type Issue = { field: string; type: string };
function issues(data: unknown): Issue[] {
  if (!data || typeof data !== "object" || !("detail" in data) || !Array.isArray(data.detail)) return [];
  return data.detail.slice(0, 12).map((item: unknown) => {
    if (!item || typeof item !== "object") return { field: "unknown", type: "unknown" };
    const loc = "loc" in item && Array.isArray(item.loc) ? item.loc : [];
    return {
      field: loc.slice(0, 4).map((part: unknown) => typeof part === "string" && fields.has(part) ? part : "unknown").join(".") || "unknown",
      type: "type" in item && typeof item.type === "string" && types.has(item.type) ? item.type : "unknown",
    };
  });
}
function reason(status: number, data: unknown) {
  if (status === 401) return "authentication";
  if (status === 402) return "payment_or_balance";
  if (status === 429) return "rate_limit";
  // Match known reasons without ever returning provider-controlled text.
  const detail = data && typeof data === "object" && "detail" in data && typeof data.detail === "string" ? data.detail.toLowerCase() : "";
  if (/balance|credits|payment|billing/.test(detail)) return "payment_or_balance";
  if (/unauthorized|invalid api key|authentication/.test(detail)) return "authentication";
  if (status === 403) return "access_denied";
  if (status === 404) return "endpoint_or_request_missing";
  if (status === 422) return "validation";
  return status >= 500 ? "provider_unavailable" : "request_rejected";
}
export async function logFalRejection(response: Response, context: { model: string; operation: "submit" | "status" | "result"; jobId: string; sceneId: string }) {
  let data: unknown, bodyFormat: "json" | "non_json" | "unavailable" | "too_large" = "unavailable";
  const reader = response.body?.getReader();
  if (reader) {
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 1_000);
    try {
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 16_384) { bodyFormat = "too_large"; break; }
        chunks.push(chunk.value);
      }
      if (!timedOut && bodyFormat !== "too_large") {
        try { data = JSON.parse(Buffer.concat(chunks).toString("utf8")); bodyFormat = "json"; }
        catch { bodyFormat = "non_json"; }
      }
    } catch { /* Diagnostics never replace the original HTTP failure. */ }
    finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
  }
  console.warn("fal_http_rejected", { ...context, httpStatus: response.status, reason: reason(response.status, data), bodyFormat, validation: issues(data) });
}
