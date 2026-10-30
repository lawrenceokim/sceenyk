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
};
// Provider-neutral execution/recovery. Recovery never manufactures a new provider intent.
export async function executeV3Segment(run: Run, providerStarted: boolean, deps: SegmentExecutionDependencies, signal: AbortSignal) {
  if (run.result) { await deps.checkpoint("done"); return; }
  let observation = run.observation;
  const completed = await deps.readSaved("completed.json"), accepted = await deps.readSaved("acceptance.json");
  if (completed) observation = observationSchema.parse(JSON.parse(completed.toString("utf8")));
  else if (accepted && !observation) observation = observationSchema.parse(JSON.parse(accepted.toString("utf8")));
  if (!observation) {
    if (providerStarted || run.state !== "queued") throw new Error("V3_PROVIDER_OUTCOME_UNKNOWN");
    await deps.beforeSubmit(run.intent);
    await deps.checkpoint("intent");
    observation = await deps.provider.submit(run.intent, signal);
    await deps.save("acceptance.json", Buffer.from(JSON.stringify(observation)));
  }
  if (observation.status !== "completed") observation = await deps.provider.reconcile(observation, signal);
  if (observation.status === "completed") await deps.save("completed.json", Buffer.from(JSON.stringify(observation)));
  await deps.checkpoint("observation", observation);
  if (["failed", "nsfw", "canceled"].includes(observation.status)) { await deps.checkpoint("failed", { code: "V3_PROVIDER_REJECTED_REVIEW_RETRY" }); return; }
  if (observation.status !== "completed") { await deps.checkpoint("pending"); return; }
  let bytes = await deps.readSaved("result.bytes");
  if (!bytes) { bytes = await deps.provider.fetchCompletedResult(observation, signal); await deps.save("result.bytes", bytes); }
  const asset = await deps.validateAndPublish(bytes);
  await deps.checkpoint("result", asset);
}
