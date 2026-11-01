import "server-only";
import type { FrozenPackage } from "./package";
import type { RuntimeWorkspace } from "./runtime-store";
import { privateAssetSchema, privateBindingSchema, type RuntimeQuote } from "./runtime-contract";
import { v3Digest } from "./identity";
import { readPrivate, signPrivate } from "./runtime-media";

export function videoDeliveryBindings(w: RuntimeWorkspace, doc: FrozenPackage) {
  return doc.source.references.map(ref => {
    const binding = privateBindingSchema.parse(w.source?.private_bindings[ref.id]);
    const artifact = w.artifacts.find(a => a.id === ref.id && a.version === ref.version && a.approved_at && !a.rejected_at);
    if (!artifact || binding.sha256 !== ref.sha256 || binding.sizeBytes !== ref.sizeBytes || binding.mimeType !== ref.mimeType ||
      v3Digest("asset", binding) !== v3Digest("asset", privateAssetSchema.parse(artifact.document.asset))) throw new Error("V3_DELIVERY_BINDING_INVALID");
    return binding;
  });
}
// Fresh credentials for the same ordered bytes; package, quote, prompt and approval stay immutable.
export async function prepareVideoDelivery(w: RuntimeWorkspace, doc: FrozenPackage, segment: RuntimeQuote["segments"][number], signal: AbortSignal) {
  const urls: string[] = []; let expiry = Infinity;
  for (const binding of videoDeliveryBindings(w, doc)) {
    await readPrivate(binding.storageKey, binding.etag, binding.sizeBytes, signal, binding.sha256);
    const signed = await signPrivate(binding); urls.push(signed.url); expiry = Math.min(expiry, Date.parse(signed.expiresAt) - 30_000);
  }
  return { body: { ...segment.body, image_urls: urls }, expiresAt: new Date(expiry).toISOString() };
}
