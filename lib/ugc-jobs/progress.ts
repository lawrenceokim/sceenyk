import { ugcStageMessages, ugcWorkerStaleMilliseconds, type UgcJobRow, type UgcJobStage,
  type UgcJobProgress, type UgcProgressStep, type UgcProgressEvent } from "./contract";
import { v5ManualReviewProgress } from "@/lib/character-v5/progress";

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
  referenceReview?: UgcJobProgress["referenceReview"];
  product?: {
    name: string; complete: boolean; composing: boolean; sheetReady: boolean;
    views: Record<"primary" | "angle" | "detail", { started: boolean; ready: boolean; failed: boolean }>;
  };
  character?: {
    v4?: boolean; faceReused?: boolean;
    name: string; prepared: boolean; identityReady: boolean; complete: boolean; composing: boolean;
    views: Record<"front" | "back" | "face", { phase?: string; started: boolean; ready: boolean; failed: boolean }>;
    sheetReady: boolean;
  };
  analyses?: { character: boolean; product: boolean };
  events?: UgcProgressEvent[];
};

export function buildUgcProgress(row: UgcJobRow, evidence: UgcProgressEvidence = {}, now = Date.now()): UgcJobProgress {
  const regenerationGroups = evidence.referenceReview?.groups.filter(group => group.sheetInvalidated) ?? [];
  const regeneration = !["completed", "cancelled"].includes(row.status) ?
    regenerationGroups.find(group => group.execution?.state === "running") ?? regenerationGroups[0] : undefined;
  const executing = regeneration?.execution?.state === "running";
  const paused = !executing && (!!regeneration || !!row.pause_reason || row.status === "awaiting_confirmation" ||
    row.status === "queued" && !!evidence.referenceReview?.blocked);
  const characterCompletePause = !regeneration && row.pause_reason === "PRODUCT_REFERENCE_NOT_IMPLEMENTED";
  const productCompletePause = !regeneration && row.pause_reason === "LOCATION_REFERENCE_NOT_IMPLEMENTED";
  const currentStage = regeneration ? `${regeneration.type}_reference` as UgcJobStage : row.status === "failed" || row.status === "cancelled" ? row.resume_stage : row.stage;
  const index = executionOrder.indexOf(currentStage);
  const stalled = row.status === "running" && (!row.heartbeat_at || !row.lease_expires_at ||
    now - Date.parse(row.heartbeat_at) >= ugcWorkerStaleMilliseconds || Date.parse(row.lease_expires_at) <= now);
  const stateForCurrent: UgcProgressStep["state"] = regeneration ? regeneration.state === "failed" ? "failed" : executing ? "active" : "paused" : row.status === "failed" ? "failed" :
    row.status === "cancelled" || paused || stalled ? "paused" : "active";
  const steps: UgcProgressStep[] = workflow.map(([id, label]) => {
    if (id === "location_reference") return { id, label, state: "waiting" };
    if (regeneration && id === currentStage) return { id, label, state: stateForCurrent };
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
  if (regeneration) {
    const substeps = regeneration.type === "character" ? characterSteps : productSteps;
    for (const step of substeps) {
      const asset = regeneration.assets.find(item => item.view === step.id);
      if (!asset) continue;
      if (asset.view === "sheet" && regeneration.sheetInvalidated) step.state = "waiting";
      else if (asset.state === "regenerating") step.state = stateForCurrent;
      else if (asset.state === "regeneration_requested") step.state = "waiting";
      else if (asset.state === "failed") step.state = "failed";
      if (asset.view === "sheet" && regeneration.execution?.phase === "sheet_rebuild_started") step.state = stateForCurrent;
    }
    const recoverySteps: Record<string, [string, string]> = {
      recovery_front_validating: ["front", "Validating replacement Front"], recovery_back_loading: ["back", "Loading existing Back"],
      recovery_face_loading: ["face", "Loading existing Face"], recovery_sheet_validating: ["sheet", "Validating rebuilt sheet"],
      recovery_sheet_rebuilding: ["sheet", "Rebuilding Character Sheet"], recovery_sheet_saving: ["sheet", "Saving Character Sheet"],
    };
    const recovering = recoverySteps[regeneration.execution?.phase ?? ""];
    if (recovering) {
      const step = substeps.find(item => item.id === recovering[0]);
      if (step) { step.label = recovering[1]; step.state = stateForCurrent; }
    }
  }
  const characterGroup = evidence.referenceReview?.groups.find(group => group.type === "character");
  const manual = evidence.referenceReview?.characterV5;
  const v4 = character?.v4 || characterGroup?.characterV4;
  if (v4 && character) {
    const cycle = characterGroup && characterGroup.version > 1 ? characterGroup.version : undefined;
    const records = (evidence.events ?? []).filter(event => event.stage === "character_reference" && event.referenceVersion === cycle);
    const phaseSteps: UgcProgressStep[] = characterSteps.filter(step => step.id === "identity");
    for (const view of ["face", "back", "front"] as const) {
      const title = view === "face" ? "Face" : view === "back" ? "Back" : "Front";
      const card = characterGroup?.assets.find(asset => asset.view === view);
      const ready = cycle ? !!card?.available && !card.stale && !card.validationRequired : character.views[view].ready;
      const labels = [`Preparing ${title} reference`, `Generating ${title}`, view === "front" ? "Validating Front source" : `Validating ${title}`,
        ...(view === "front" ? ["Creating headless Front", "Validating canonical Front"] : []), `${title} ready`];
      if (view === "face" && (cycle ? characterGroup?.faceReused : character.faceReused) && ready) labels.splice(1, 1);
      const seen = records.filter(event => event.view === view && labels.includes(event.message));
      const latest = seen.at(-1)?.message;
      const position = latest ? labels.indexOf(latest) : -1;
      for (const [index, label] of labels.entries()) {
        const recorded = seen.some(event => event.message === label);
        // A preserved reference needs no invented preparation/generation events.
        if (ready && !recorded && index !== labels.length - 1) continue;
        const done = ready || recorded && index < position;
        const current = !ready && recorded && index === position;
        phaseSteps.push({ id: `${view}_${index}`, label, state: done ? "completed" : current ?
          card?.state === "failed" || character.views[view].failed || row.status === "failed" && !regeneration ? "failed" : stateForCurrent : "waiting" });
      }
    }
    const sheetReady = cycle ? characterGroup?.state === "ready_for_review" || characterGroup?.state === "approved" : character.complete;
    const sheetLabels = ["Building Character Sheet", "Validating Character Sheet", "Ready for review"];
    const normalizeSheet = (label: string) => label === "Building character sheet" || label === "Building the character sheet." ? "Building Character Sheet" : label;
    const sheetEvents = records.filter(event => sheetLabels.includes(normalizeSheet(event.message)));
    const sheetPosition = sheetLabels.indexOf(normalizeSheet(sheetEvents.at(-1)?.message ?? ""));
    for (const [index, label] of sheetLabels.entries()) {
      const recorded = sheetEvents.some(event => normalizeSheet(event.message) === label);
      phaseSteps.push({ id: `sheet_${index}`, label, state: sheetReady || recorded && index < sheetPosition ? "completed" :
        recorded && index === sheetPosition ? stateForCurrent : "waiting" });
    }
    characterSteps.splice(0, characterSteps.length, ...phaseSteps);
  }
  if (manual) {
    const labels = { face: "Face", back: "Back", front_source: "Front source", front: "Front", sheet: "Character Sheet" } as const;
    const order = manual.slot === "front" ? ["face", "back", "front_source", "front", "sheet"] as const : ["face", "front_source", "back", "sheet"] as const;
    characterSteps.splice(0, characterSteps.length, ...order.map(slot => {
      const current = manual.slot === slot;
      const accepted = manual.accepted.includes(slot) && !(current && !["ready", "approved"].includes(manual.state)) || slot === "sheet" && ["ready", "approved"].includes(manual.state);
      const label = accepted ? `${labels[slot]} ${slot === "sheet" ? "ready" : "accepted"}` : current ?
        manual.state === "review" ? v5ManualReviewProgress(manual)!.title : manual.state === "running" ?
          slot === "front" ? "Preparing Front" : slot === "sheet" ? "Building Character Sheet" : `${manual.workPhase === "generating" ? "Generating" : "Preparing"} ${labels[slot]}` :
          manual.state === "failed" ? `${labels[slot]} ${manual.errorCode === "CHARACTER_CANDIDATE_REJECTED" ? "rejected" : "needs attention"}` : `Preparing ${labels[slot]}` :
            slot === "back" ? "Back waiting for Face acceptance" : slot === "front_source" ? "Front waiting for Face acceptance" :
              slot === "front" ? "Front waiting for source acceptance" : "Sheet waiting for accepted references";
      const state: UgcProgressStep["state"] = accepted ? "completed" : !current ? "waiting" : manual.state === "running" ? "active" : manual.state === "failed" ? "failed" : "paused";
      return { id: slot, label, state };
    }));
  }
  const manualReview = currentStage === "character_reference" && !["failed", "cancelled", "completed"].includes(row.status) ? v5ManualReviewProgress(manual) : null;
  const stageLabel = manualReview?.title ?? (manual && currentStage === "character_reference" ? "Character manual review" : regeneration ? regeneration.state === "failed" ? "Reference regeneration stopped" : executing ?
    `Regenerating ${regeneration.type} reference` : "Waiting for generation worker" : paused && evidence.referenceReview?.available ? evidence.referenceReview.locationEligible ? "References approved" :
    evidence.referenceReview.groups.some(group => group.sheetInvalidated) ? "Regeneration requested" : "Reference review" :
    productCompletePause ? "Product reference complete" : characterCompletePause ? "Character reference complete" : workflow.find(([id]) => id === currentStage)?.[1] ??
    (currentStage === "cost_review" || currentStage === "awaiting_confirmation" ? "Review generation cost" : "Waiting for worker"));
  let message = productCompletePause ? "Your character and product references are ready. Location generation has not started yet." :
    characterCompletePause ? "Your character reference is ready. Product Reference generation has not started yet." :
    row.pause_reason === "CHARACTER_REFERENCE_NOT_IMPLEMENTED" ? "References analyzed. Character generation is paused for local enablement." :
    row.pause_reason ? "Inputs validated. Reference analysis is not available yet." : ugcStageMessages[row.stage];
  const action = characterSteps.find(step => step.state === "active");
  if (currentStage === "character_reference" && character && action) {
    message = action.id === "identity" ? `Preparing the identity for ${character.name}` : action.id === "sheet" ?
      `Building the character sheet for ${character.name}` : `Generating the ${action.id} view for ${character.name}`;
  }
  if (currentStage === "character_reference" && character && action && ["front", "back", "face"].includes(action.id)) {
    const phase = character.views[action.id as "front" | "back" | "face"].phase;
    const phaseCopy: Record<string, string> = { preparing_source: "Preparing source reference", sending_i2i: "Sending image-to-image request", validating_source: "Validating single view", cropping_front: "Creating headless Front locally", validating_crop: "Validating Front crop", checking_original_face: "Checking original image for Face reuse" };
    if (phase && phaseCopy[phase]) message = phaseCopy[phase];
  }
  const productAction = productSteps.find(step => step.state === "active");
  if (currentStage === "product_reference" && product && productAction) message = productAction.id === "sheet" ?
    `Building the product sheet for ${product.name}` : `Generating the ${productAction.label.toLowerCase()} for ${product.name}`;
  if (row.cancellation_requested_at && row.status === "running") message = "Cancellation requested. Waiting for a safe stopping point.";
  if (row.safe_error_message) message = row.safe_error_message;
  if (paused && evidence.referenceReview?.available) message = evidence.referenceReview.locationEligible ?
    "References approved. Location generation has not started yet." :
    evidence.referenceReview.groups.some(group => group.sheetInvalidated) ? "Regeneration requested. Reference generation remains paused." :
    "Review your reference assets before continuing.";
  if (regeneration) {
    if (regeneration.providerDecisionRequired) message = "Character provider single-view contract remains unsatisfied. Automatic spending stopped; inspect rejected outputs before a provider decision.";
    else if (regeneration.execution?.state === "failed" || regeneration.state === "failed") message = regeneration.execution?.error === "RECONCILIATION_REQUIRED" ?
      "Regeneration stopped safely. The existing provider request needs reconciliation before another paid submission. Previous references remain available." :
      regeneration.execution?.error === "CHARACTER_SHEET_COMPOSITION_FAILED" ? "Character Sheet composition failed. Your saved Front, Back and Face remain available." :
      regeneration.execution?.error === "CHARACTER_SHEET_RECOVERY_FAILED" ? "Character Sheet recovery stopped safely. Saved views and the previous sheet remain available." :
      regeneration.execution?.error === "IDENTITY_UNAVAILABLE" ? "The saved character identity is unavailable. Previous references remain available; no identity training was repeated." :
      "Reference regeneration failed. Previous references remain available. A controlled local retry may resume saved work.";
    else if (!executing) message = regeneration.execution?.state === "stalled" ?
      "The regeneration worker is no longer reporting a healthy lease. Start the local UGC worker to resume saved work." :
      "Regeneration requested. Start the local UGC worker to continue.";
    else {
      const phase = regeneration.execution?.phase;
      const recoveryMessages: Record<string, string> = {
        recovery_front_validating: "Validating replacement Front.", recovery_back_loading: "Loading existing Back.", recovery_face_loading: "Loading existing Face.",
        recovery_sheet_validating: "Validating rebuilt sheet.", recovery_sheet_rebuilding: "Rebuilding Character Sheet.", recovery_sheet_saving: "Saving Character Sheet.",
      };
      const view = regeneration.assets.find(asset => phase?.startsWith(`${asset.view}_`));
      const v3Messages: Record<string, string> = { front_preparing_source: "Preparing original Character reference.", back_preparing_source: "Preparing Back reference from saved Front source, when available.", face_preparing_source: "Preparing original portrait reference.", front_sending_i2i: "Sending Front image-to-image request.", back_sending_i2i: "Sending Back image-to-image request.", face_sending_i2i: "Sending Face image-to-image request.", front_validating_source: "Validating the single-person Front source.", front_cropping_front: "Creating headless Front locally.", front_validating_crop: "Validating the cropped Front.", back_validating_source: "Validating the rear view.", face_checking_original_face: "Checking original image for Face reuse." };
      const v4Messages: Record<string, string> = {
        face_preparing_source: "Preparing Face reference", face_sending_i2i: "Generating Face", face_checking_original_face: "Validating Face",
        face_validating_source: "Validating Face", back_preparing_source: "Preparing Back reference", back_sending_i2i: "Generating Back",
        back_validating_source: "Validating Back", front_preparing_source: "Preparing Front reference", front_sending_i2i: "Generating Front",
        front_validating_source: "Validating Front source", front_cropping_front: "Creating headless Front", front_validating_crop: "Validating canonical Front",
        sheet_validating: "Validating Character Sheet",
      };
      message = (regeneration.characterV4 ? v4Messages : v3Messages)[phase ?? ""] ?? recoveryMessages[phase ?? ""] ?? (phase === "output_validation" ? "Checking preserved Character views against the single-image contract." :
        phase?.endsWith("_validating") ? `Checking the ${view?.label.toLowerCase() ?? "Character"} image against its slot contract.` : phase === "sheet_rebuild_started" ? "Rebuilding the reference sheet from the three saved views." :
        phase?.endsWith("_provider_ready") ? `${view?.label ?? "Reference"} provider output is ready.` :
        phase?.endsWith("_downloading") ? `${regeneration.type === "character" ? "Downloading and validating" : "Validating and storing"} the ${view?.label.toLowerCase() ?? "reference"} view.` :
        phase?.endsWith("_ready") ? `${view?.label ?? "Reference"} replacement saved.` :
        phase?.endsWith("_generating") ? regeneration.type === "product" ? `Requesting the ${view?.label.toLowerCase() ?? "reference"} view from the provider.` :
          `Provider is generating the ${view?.label.toLowerCase() ?? "reference"} view.` : "Reference regeneration started.");
    }
  }
  const execution = regeneration?.execution;
  if (v4 && currentStage === "character_reference" && !row.safe_error_message && (!regeneration || executing)) {
    const current = characterSteps.find(step => step.state === "active");
    if (current) message = current.label;
  }
  const regenElapsed = evidence.referenceReview?.groups.reduce((total, group) => total + (group.execution?.elapsedMs ?? 0), 0) ?? 0;
  if (manual && currentStage === "character_reference") message = manualReview?.message ?? characterSteps.find(step => step.id === manual.slot)?.label ?? "Character manual review";
  return {
    id: row.id, status: row.status, stage: row.stage, currentStage, stageLabel, message,
    createdAt: row.created_at, updatedAt: row.updated_at, startedAt: row.started_at,
    completedAt: row.completed_at, failedAt: row.failed_at, cancelledAt: row.cancelled_at,
    cancellationRequested: !!row.cancellation_requested_at, paused,
    failure: row.error_code && row.safe_error_message ? { code: row.error_code, message: row.safe_error_message } : null,
    steps, characterSteps, productSteps, events: evidence.events ?? [],
    ...(evidence.referenceReview ? { referenceReview: evidence.referenceReview } : {}),
    worker: execution ? { heartbeatAt: execution.heartbeatAt, leaseExpiresAt: execution.leaseExpiresAt,
      state: execution.state === "running" ? "healthy" : execution.state === "stalled" ? "stalled" : "inactive" } :
      { heartbeatAt: row.heartbeat_at, leaseExpiresAt: row.lease_expires_at,
        state: row.status !== "running" ? "inactive" : stalled ? "stalled" : "healthy" },
    serverNow: new Date(now).toISOString(),
    timing: {
      elapsedMs: typeof row.processing_elapsed_ms === "number" && Number.isSafeInteger(row.processing_elapsed_ms) && row.processing_elapsed_ms >= 0
        ? row.processing_elapsed_ms + regenElapsed : regenElapsed || execution ? regenElapsed : null,
      runningSince: executing ? execution?.runningSince ?? null : row.status === "running" && !paused ? row.processing_updated_at ?? null : null,
      pausedAt: paused ? row.updated_at : null,
      scope: row.processing_elapsed_ms == null ? "regeneration" : "workflow",
    },
  };
}

// Sum persisted leased processing segments only; original started_at includes
// arbitrary development downtime and cannot establish historical active time.
export function ugcProcessingMilliseconds(job: UgcJobProgress, now: number): number | null {
  // Also tolerate a pre-refinement snapshot retained by development Fast Refresh.
  if (!job.timing || job.timing.elapsedMs === null) return null;
  if (job.paused || job.status !== "running" && !job.referenceReview?.regenerating || !job.timing.runningSince || !job.worker.leaseExpiresAt) return job.timing.elapsedMs;
  const increment = Math.max(0, Math.min(now, Date.parse(job.worker.leaseExpiresAt)) - Date.parse(job.timing.runningSince));
  return Number.isFinite(increment) ? job.timing.elapsedMs + increment : null;
}

// Static copy, replaceable later by estimates from actual historical durations.
export function ugcStageExpectation(stage: UgcJobStage): string | null {
  return ["analyze_references", "character_reference", "product_reference", "video_generation"].includes(stage)
    ? "Usually takes a few minutes. This may take longer depending on the provider." : null;
}
