import { ugcStageMessages, ugcWorkerStaleMilliseconds, type UgcJobRow, type UgcJobStage,
  type UgcJobProgress, type UgcProgressStep, type UgcProgressEvent } from "./contract";

// Presentation only. Location is an intentional non-runnable boundary.
const workflow = [
  ["validate_inputs", "Validating inputs"], ["analyze_references", "Analyzing references"],
  ["character_reference", "Creating character reference"], ["product_reference", "Creating product reference"],
  ["location_reference", "Building location"], ["build_storyboard", "Writing storyboard"],
  ["build_generation_package", "Preparing generation package"], ["video_generation", "Generating final video"],
  ["finalizing", "Finalizing"], ["complete", "Complete"],
] as const;
const executionOrder: UgcJobStage[] = ["queued", "validate_inputs", "analyze_references", "character_reference",
  "product_reference", "location_reference", "build_storyboard", "build_generation_package", "cost_review", "awaiting_confirmation",
  "video_generation", "finalizing", "complete"];

// The server projects ONLY these safe checkpoint facts from private documents.
export type UgcProgressEvidence = {
  product?: {
    name: string; complete: boolean; composing: boolean; sheetReady: boolean;
    views: Record<"primary" | "angle" | "detail", { started: boolean; ready: boolean; failed: boolean }>;
  };
  character?: {
    name: string; prepared: boolean; identityReady: boolean; complete: boolean; composing: boolean;
    views: Record<"front" | "back" | "face", { started: boolean; ready: boolean; failed: boolean }>;
    sheetReady: boolean;
  };
  analyses?: { character: boolean; product: boolean };
  events?: UgcProgressEvent[];
};

export function buildUgcProgress(row: UgcJobRow, evidence: UgcProgressEvidence = {}, now = Date.now()): UgcJobProgress {
  const paused = !!row.pause_reason || row.status === "awaiting_confirmation";
  const characterCompletePause = row.pause_reason === "PRODUCT_REFERENCE_NOT_IMPLEMENTED";
  const productCompletePause = row.pause_reason === "LOCATION_REFERENCE_NOT_IMPLEMENTED";
  const currentStage = row.status === "failed" || row.status === "cancelled" ? row.resume_stage : row.stage;
  const index = executionOrder.indexOf(currentStage);
  const stalled = row.status === "running" && (!row.heartbeat_at || !row.lease_expires_at ||
    now - Date.parse(row.heartbeat_at) >= ugcWorkerStaleMilliseconds || Date.parse(row.lease_expires_at) <= now);
  const stateForCurrent: UgcProgressStep["state"] = row.status === "failed" ? "failed" :
    row.status === "cancelled" || row.pause_reason || stalled || row.status === "awaiting_confirmation" ? "paused" : "active";
  const steps: UgcProgressStep[] = workflow.map(([id, label]) => {
    if (id === "location_reference") return { id, label, state: "waiting" };
    const completed = id === "complete" ? row.status === "completed" :
      id === "validate_inputs" && !!row.validation_completed_at ||
      id === "analyze_references" && !!evidence.analyses?.character && !!evidence.analyses.product ||
      id === "character_reference" && !!evidence.character?.complete ||
      id === "product_reference" && !!evidence.product?.complete || executionOrder.indexOf(id) < index;
    // A queued development pause points at work that has NOT started.
    const current = id === currentStage && !row.pause_reason;
    return { id, label: characterCompletePause && id === "product_reference" ? "Product reference" : label,
      state: completed ? "completed" : current ? stateForCurrent : "waiting" };
  });
  const characterSteps: UgcProgressStep[] = [];
  const character = evidence.character;
  if (character) {
    const state = (done: boolean, started: boolean, failed = false): UgcProgressStep["state"] => done ? "completed" :
      started ? failed || row.status === "failed" && currentStage === "character_reference" ? "failed" :
        currentStage === "character_reference" ? stateForCurrent : "paused" : "waiting";
    characterSteps.push({ id: "identity", label: "Soul identity prepared", state: state(character.identityReady, character.prepared) });
    for (const view of ["front", "back", "face"] as const) {
      const facts = character.views[view];
      characterSteps.push({ id: view, label: view === "face" ? "Face reference" : `${view === "front" ? "Front" : "Back"} view`,
        state: state(facts.ready, facts.started && !facts.ready, facts.failed) });
    }
    characterSteps.push({ id: "sheet", label: "Character sheet", state: state(character.sheetReady, character.composing) });
  }
  const productSteps: UgcProgressStep[] = [];
  const product = evidence.product;
  if (product) {
    const state = (done: boolean, started: boolean, failed = false): UgcProgressStep["state"] => done ? "completed" :
      started ? failed || row.status === "failed" && currentStage === "product_reference" ? "failed" :
        currentStage === "product_reference" ? stateForCurrent : "paused" : "waiting";
    for (const view of ["primary", "angle", "detail"] as const) {
      const facts = product.views[view];
      productSteps.push({ id: view, label: view === "primary" ? "Primary view" : view === "angle" ? "Angled view" : "Detail reference",
        state: state(facts.ready, facts.started, facts.failed) });
    }
    productSteps.push({ id: "sheet", label: "Product sheet", state: state(product.sheetReady, product.composing) });
  } else if (currentStage === "product_reference") {
    for (const [id, label] of [["primary", "Primary view"], ["angle", "Angled view"], ["detail", "Detail reference"], ["sheet", "Product sheet"]]) {
      productSteps.push({ id, label, state: "waiting" });
    }
  }
  const stageLabel = productCompletePause ? "Product reference complete" : characterCompletePause ? "Character reference complete" : workflow.find(([id]) => id === currentStage)?.[1] ??
    (currentStage === "cost_review" || currentStage === "awaiting_confirmation" ? "Review generation cost" : "Waiting for worker");
  let message = productCompletePause ? "Your character and product references are ready. Location generation has not started yet." :
    characterCompletePause ? "Your character reference is ready. Product Reference generation has not started yet." :
    row.pause_reason === "CHARACTER_REFERENCE_NOT_IMPLEMENTED" ? "References analyzed. Character generation is paused for local enablement." :
    row.pause_reason ? "Inputs validated. Reference analysis is not available yet." : ugcStageMessages[row.stage];
  const action = characterSteps.find(step => step.state === "active");
  if (currentStage === "character_reference" && character && action) {
    message = action.id === "identity" ? `Preparing the identity for ${character.name}` : action.id === "sheet" ?
      `Building the character sheet for ${character.name}` : `Generating the ${action.id} view for ${character.name}`;
  }
  const productAction = productSteps.find(step => step.state === "active");
  if (currentStage === "product_reference" && product && productAction) message = productAction.id === "sheet" ?
    `Building the product sheet for ${product.name}` : `Generating the ${productAction.label.toLowerCase()} for ${product.name}`;
  if (row.cancellation_requested_at && row.status === "running") message = "Cancellation requested. Waiting for a safe stopping point.";
  if (row.safe_error_message) message = row.safe_error_message;
  return {
    id: row.id, status: row.status, stage: row.stage, currentStage, stageLabel, message,
    createdAt: row.created_at, updatedAt: row.updated_at, startedAt: row.started_at,
    completedAt: row.completed_at, failedAt: row.failed_at, cancelledAt: row.cancelled_at,
    cancellationRequested: !!row.cancellation_requested_at, paused,
    failure: row.error_code && row.safe_error_message ? { code: row.error_code, message: row.safe_error_message } : null,
    steps, characterSteps, productSteps, events: evidence.events ?? [],
    worker: { heartbeatAt: row.heartbeat_at, leaseExpiresAt: row.lease_expires_at,
      state: row.status !== "running" ? "inactive" : stalled ? "stalled" : "healthy" },
    serverNow: new Date(now).toISOString(),
    timing: {
      elapsedMs: typeof row.processing_elapsed_ms === "number" && Number.isSafeInteger(row.processing_elapsed_ms) && row.processing_elapsed_ms >= 0
        ? row.processing_elapsed_ms : null,
      runningSince: row.status === "running" && !paused ? row.processing_updated_at ?? null : null,
      pausedAt: paused ? row.updated_at : null,
    },
  };
}

// Sum persisted leased processing segments only; original started_at includes
// arbitrary development downtime and cannot establish historical active time.
export function ugcProcessingMilliseconds(job: UgcJobProgress, now: number): number | null {
  // Also tolerate a pre-refinement snapshot retained by development Fast Refresh.
  if (!job.timing || job.timing.elapsedMs === null) return null;
  if (job.paused || job.status !== "running" || !job.timing.runningSince || !job.worker.leaseExpiresAt) return job.timing.elapsedMs;
  const increment = Math.max(0, Math.min(now, Date.parse(job.worker.leaseExpiresAt)) - Date.parse(job.timing.runningSince));
  return Number.isFinite(increment) ? job.timing.elapsedMs + increment : null;
}

// Static copy, replaceable later by estimates from actual historical durations.
export function ugcStageExpectation(stage: UgcJobStage): string | null {
  return ["analyze_references", "character_reference", "product_reference", "video_generation"].includes(stage)
    ? "Usually takes a few minutes. This may take longer depending on the provider." : null;
}
