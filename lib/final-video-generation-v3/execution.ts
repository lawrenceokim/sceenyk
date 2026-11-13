import "server-only";
import { observationSchema, type PaidIntent, type ProviderObservation, type PrivateAsset, type Run } from "./runtime-contract";

export interface V3VideoExecutionProvider {
  submit(intent: PaidIntent, signal: AbortSignal): Promise<ProviderObservation>;
  reconcile(known: ProviderObservation, signal: AbortSignal): Promise<ProviderObservation>;
  fetchCompletedResult(known: ProviderObservation, signal: AbortSignal): Promise<Buffer>;
}
export type SegmentExecutionDependencies = {
  provider: V3VideoExecutionProvider;
  beforeSubmit: (intent: PaidIntent) => void | Promise<void>;
  checkpoint: (action: string, payload?: unknown) => Promise<void>;
  readSaved: (name: string) => Promise<Buffer | null>;
  save: (name: string, bytes: Buffer) => Promise<unknown>;
  validateAndPublish: (bytes: Buffer) => Promise<PrivateAsset>;
  stage?: (stage: string, requestId?: string) => void | Promise<void>;
};
// Provider-neutral execution/recovery. Recovery never manufactures a new provider intent.
export async function executeV3Segment(run: Run, providerStarted: boolean, deps: SegmentExecutionDependencies, signal: AbortSignal) {
  if (run.result) { await deps.checkpoint("done"); return; }
  let observation = run.observation;
  const completed = await deps.readSaved("completed.json"), accepted = await deps.readSaved("acceptance.json");
  if (completed) observation = observationSchema.parse(JSON.parse(completed.toString("utf8")));
  else if (accepted && !observation) observation = observationSchema.parse(JSON.parse(accepted.toString("utf8")));
  if (run.observation && observation && run.observation.requestId !== observation.requestId) throw new Error("PROVIDER_RECEIPT_MISMATCH");
  if (completed && observation?.status !== "completed") throw new Error("V3_COMPLETED_RECEIPT_INVALID");
  if (!observation) {
    if (providerStarted || run.state !== "queued") throw new Error("V3_PROVIDER_OUTCOME_UNKNOWN");
    await deps.beforeSubmit(run.intent);
    await deps.checkpoint("intent");
    await deps.stage?.("HIGGSFIELD_SUBMITTING");
    observation = await deps.provider.submit(run.intent, signal);
    // Attempt both durable stores before any polling. Either copy allows recovery without POST.
    const accepted = await Promise.allSettled([
      deps.checkpoint("observation", observation),
      deps.save("acceptance.json", Buffer.from(JSON.stringify(observation))),
    ]);
    if (accepted[0].status === "rejected") throw accepted[0].reason;
    if (accepted[1].status === "rejected") throw accepted[1].reason;
    await deps.stage?.("HIGGSFIELD_REQUEST_ACCEPTED", observation.requestId);
  }
  // A local receipt restored after a DB outage must be persisted before observing the provider.
  if (!run.observation && providerStarted) await deps.checkpoint("observation", observation);
  await deps.stage?.("HIGGSFIELD_PROCESSING", observation.requestId);
  if (observation.status !== "completed") observation = await deps.provider.reconcile(observation, signal);
  // The saved receipt is immutable. Schema parsing can reorder object keys;
  // reserializing an existing receipt would falsely report V3_SPOOL_CONFLICT.
  if (observation.status === "completed" && !completed) await deps.save("completed.json", Buffer.from(JSON.stringify(observation)));
  await deps.checkpoint("observation", observation);
  if (["failed", "nsfw", "canceled"].includes(observation.status)) { await deps.checkpoint("failed", { code: "V3_PROVIDER_REJECTED_REVIEW_RETRY" }); return; }
  if (observation.status !== "completed") { await deps.checkpoint("pending"); return; }
  await deps.stage?.("HIGGSFIELD_RESULT_RECEIVED", observation.requestId);
  let bytes = await deps.readSaved("result.bytes");
  if (!bytes) { bytes = await deps.provider.fetchCompletedResult(observation, signal); await deps.save("result.bytes", bytes); }
  await deps.stage?.("V3_FINAL_VIDEO_SAVING", observation.requestId);
  const asset = await deps.validateAndPublish(bytes);
  await deps.stage?.("V3_FINAL_VIDEO_SAVED", observation.requestId);
  await deps.checkpoint("result", asset);
  await deps.stage?.("V3_FINAL_VIDEO_READY_FOR_REVIEW", observation.requestId);
}
