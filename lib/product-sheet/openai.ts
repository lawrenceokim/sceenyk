import "server-only";
import OpenAI, { toFile } from "openai";
import { getProductSheetConfig } from "./config";
import { ProductSheetError, type ProductSheetProvider } from "./provider";
import type { ProductView } from "./contract";

const generationFailures = { primary: "PRODUCT_PRIMARY_GENERATION_FAILED", angle: "PRODUCT_ANGLE_GENERATION_FAILED",
  detail: "PRODUCT_DETAIL_GENERATION_FAILED" } as const;
const missingOutputs = { primary: "PRODUCT_PRIMARY_OUTPUT_MISSING", angle: "PRODUCT_ANGLE_OUTPUT_MISSING",
  detail: "PRODUCT_DETAIL_OUTPUT_MISSING" } as const;
export class OpenAIProductSheetProvider implements ProductSheetProvider {
  private readonly config = getProductSheetConfig();
  readonly model = this.config.model;
  private readonly client = new OpenAI({ apiKey: this.config.apiKey, baseURL: "https://api.openai.com/v1",
    maxRetries: 0, timeout: 10 * 60_000, logLevel: "off" });

  async editView(input: { view: ProductView; original: Buffer; prompt: string; key: string }, signal: AbortSignal) {
    // Multipart bytes from the owned original, on EVERY edit. No public upload,
    // URL download, Files API retention, text-only generation or provider fallback.
    const image = await toFile(input.original, "product-reference.png", { type: "image/png" });
    signal.throwIfAborted();
    const started = Date.now();
    try {
      const response = await this.client.images.edit({ model: this.model, image, prompt: input.prompt,
        n: 1, size: "1024x1024", quality: "high", output_format: "png", background: "opaque" },
      { signal, headers: { "X-Client-Request-Id": input.key } });
      const requestId = safeRequestId(response._request_id);
      const diagnostic = { code: missingOutputs[input.view], ...(requestId ? { requestId } : {}), decode: "not_attempted" as const };
      if (response.data?.length !== 1 || !response.data[0].b64_json) throw new ProductSheetError(missingOutputs[input.view], false, false, diagnostic);
      const encoded = response.data[0].b64_json;
      if (encoded.length > Math.ceil(20 * 1024 * 1024 / 3) * 4) throw new ProductSheetError("PRODUCT_OUTPUT_TOO_LARGE", false, false,
        { ...diagnostic, code: "PRODUCT_OUTPUT_TOO_LARGE" });
      if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new ProductSheetError("PRODUCT_OUTPUT_DECODE_FAILED", false, false,
        { ...diagnostic, code: "PRODUCT_OUTPUT_DECODE_FAILED", decode: "failed" });
      const bytes = Buffer.from(encoded, "base64");
      if (!bytes.length) throw new ProductSheetError("PRODUCT_OUTPUT_EMPTY", false, false, { ...diagnostic, code: "PRODUCT_OUTPUT_EMPTY", sizeBytes: 0 });
      return { bytes, ...(requestId ? { requestId } : {}), usage: {
        inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null, latencyMs: Date.now() - started,
      } };
    } catch (error) {
      if (error instanceof ProductSheetError) throw error;
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      const requestId = error instanceof OpenAI.APIError ? safeRequestId(error.requestID) : undefined;
      // Only documented HTTP rejection is eligible for an explicit bounded retry.
      // Timeout/5xx/connection loss may have performed paid work: never replay.
      const rejected = status !== undefined && [400, 401, 403, 413, 415, 422, 429].includes(status);
      throw new ProductSheetError(generationFailures[input.view], rejected, rejected, {
        code: generationFailures[input.view], ...(status ? { httpStatus: status } : {}), ...(requestId ? { requestId } : {}),
      });
    }
  }
}
function safeRequestId(value: string | null | undefined) {
  return value && value.length <= 200 && /^[a-zA-Z0-9_-]+$/.test(value) ? value : undefined;
}
