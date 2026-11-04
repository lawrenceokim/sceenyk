import "server-only";
import { readFrozenPackage } from "./package";
import { paidIntentSchema, type PaidIntent } from "./runtime-contract";
import { runtimePreflight, type ReferenceDelivery } from "./execution-package";
import { v3BodyHash, v3Digest } from "./identity";
import type { RuntimeWorkspace, V3Store } from "./runtime-store";
import { prepareVideoDelivery } from "./video-delivery";
import { readSpool } from "./runtime-media";

export function refreshedVideoIntent(intent: PaidIntent, delivery: ReferenceDelivery, now: string) {
  const { hash, ...original } = intent;
  const { image_urls: oldUrls, ...oldBody } = intent.body, { image_urls: urls, ...body } = delivery.body;
  if (hash !== v3Digest("paid-intent", original) || v3Digest("delivery-content", oldBody) !== v3Digest("delivery-content", body) ||
    !Array.isArray(oldUrls) || !Array.isArray(urls) || urls.length !== oldUrls.length || urls.some((url, i) =>
      typeof url !== "string" || new URL(url).protocol !== "https:" || url.split("?")[0] !== String(oldUrls[i]).split("?")[0]) ||
    !Number.isFinite(Date.parse(delivery.expiresAt)) || Date.parse(delivery.expiresAt) <= Date.parse(now)) throw new Error("V3_DELIVERY_BINDING_INVALID");
  const updated = { ...original, body: delivery.body, bodyHash: v3BodyHash(delivery.body), deliveryExpiresAt: delivery.expiresAt };
  return paidIntentSchema.parse({ ...updated, hash: v3Digest("paid-intent", updated) });
}

// Owner action or trusted worker preparation. Lease/CAS and receipt fences make
// delivery renewal safe while the global switch stays ON. This never submits.
export async function refreshQueuedVideoDelivery(store: V3Store, w: RuntimeWorkspace, runId: string, signal: AbortSignal) {
  const run = w.runs.find(r => r.id === runId), task = w.tasks.find(t => t.kind === "video" && t.input.runId === runId);
  if (!run || !task || run.state !== "queued" || run.observation || run.result || task.provider_started ||
    !["queued", "reconciliation_required"].includes(task.status) || task.lease_until && Date.parse(task.lease_until) > Date.now()) throw new Error("V3_UNSUBMITTED_REQUEST_REQUIRED");
  // SQL protects concurrent claims; local receipts additionally fence known saved acceptance/output.
  for (const file of ["acceptance.json", "completed.json", "result.bytes", "video.mp4"]) {
    if (await readSpool(run.id, file)) throw new Error("V3_SAVED_PROVIDER_EVIDENCE_REQUIRES_RECOVERY");
  }
  const doc = readFrozenPackage(w.packages.find(p => p.id === run.package_id)?.document);
  const quote = w.quotes.find(q => q.document.id === run.intent.authorization.quoteId)?.document;
  const current = run.current && !!w.source?.current && w.packages.at(-1)?.id === run.package_id;
  const report = runtimePreflight(doc, quote, run.intent.authorization, { current, transportEnabled: false, now: new Date().toISOString(), validityIssues: [], deliveryReady: true });
  if (!report.eligibleForPaidSubmission) throw new Error(report.issues[0] ?? "V3_PREFLIGHT_REQUIRED");
  const segment = quote!.segments.find(s => s.segmentUuid === run.intent.segmentUuid);
  if (!segment) throw new Error("V3_SEGMENT_BINDING_INVALID");
  const delivery = await prepareVideoDelivery(w, doc, segment, signal);
  const intent = refreshedVideoIntent(run.intent, delivery, new Date().toISOString());
  await store.rpc("ugc_v3_refresh_video_delivery", { p_owner: w.project.owner_user_id, p_project: w.project.project_id,
    p_run: run.id, p_previous_hash: run.intent.hash, p_intent: intent });
}
