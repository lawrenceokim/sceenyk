import { referenceFailureLabel, type ReferenceDiagnostics } from "./reference-status";
import { packageBuildLabel, type PackageBuildDetails } from "./package-status";
import { videoExecutionLabel, type SavedVideoProgress } from "./video-progress";
type ProgressTask = { kind: string; characterId?: string; status: string; current: boolean; providerStarted: boolean; createdAt: string; leaseUntil: string | null; errorCode: string | null;
  canStartNew?: boolean; recoveryAvailable?: boolean; referenceCleanup?:boolean; packageBuild?: PackageBuildDetails | null; diagnostics?: ReferenceDiagnostics | null; location?: { label: string; failureLabel: string; requestCount: number } | null };
type ProgressArtifact = { kind: string; characterId?: string; activeSlot?: boolean; version: number; current: boolean; approved: boolean; rejected: boolean };
type ProgressState = { complete: boolean; tasks: ProgressTask[]; artifacts: ProgressArtifact[]; runs: SavedVideoProgress[]; preflight?: { packageId: string } | null };
const subjects: Record<string, string> = { character: "Character Sheet", product: "Product Sheet", location: "Location", storyboard: "Storyboard",
  package: "Generation Package", video: "Final Video", join: "Final Video", delete: "saved video" };
export function referenceBusy(tasks: ProgressTask[], kind: string, now = Date.now(), characterId?: string) {
  const t = tasks.filter(t => t.kind === kind && (!characterId || t.characterId === characterId)).at(-1);
  if (!t || t.canStartNew) return false;
  if (t.recoveryAvailable) return true;
  return (["queued", "running", "reconciliation_required"].includes(t.status) || t.status === "failed" && t.providerStarted) &&
    (t.current || t.providerStarted || t.status === "running" && Date.parse(t.leaseUntil ?? "") > now);
}
export function v3ProgressLabel(state: ProgressState, productRequired: boolean, now = Date.now()) {
  if (state.complete) return "Complete";
  if (state.tasks.some(t => t.kind === "join" && ["queued", "running"].includes(t.status))) return "Saving";
  const video = state.runs.filter(r => r.state !== "deleted" && r.current !== false && (!state.preflight || r.packageId === state.preflight.packageId)).at(-1);
  if (video) return videoExecutionLabel(video);
  const cleanup = state.tasks.find(t => t.status === "cleanup_pending");
  if (cleanup) return `${subjects[cleanup.kind]} cleanup needs attention`;
  const failure = state.tasks.find((t, i) => ["character", "product", "location"].includes(t.kind) && ["failed", "reconciliation_required"].includes(t.status)
    && t.errorCode !== "V3_REFERENCE_REQUEST_SUPERSEDED" && !state.tasks.slice(i + 1).some(n => n.kind === t.kind && (t.kind !== "character" || n.characterId === t.characterId)));
  if (failure) return failure.location?.failureLabel ?? referenceFailureLabel(failure.kind, failure.diagnostics);
  const packageTask = state.tasks.filter(t => t.kind === "package").at(-1);
  if (packageTask?.packageBuild && !state.runs.length) return packageTask.status === "queued" && now - Date.parse(packageTask.createdAt) >= 90_000
    ? "Waiting for generation worker" : packageBuildLabel(packageTask.packageBuild, packageTask.status);
  const task = state.tasks.find(t => !t.referenceCleanup && ["queued", "running", "reconciliation_required"].includes(t.status) &&
    (t.current || t.providerStarted || ["package", "video", "join", "delete"].includes(t.kind)));
  if (task) {
    if (task.kind === "video" && !task.providerStarted && task.errorCode === "PAID_V3_EXECUTION_DISABLED") return "Final Video paused: paid submissions are disabled in the worker";
    if (task.kind === "video" && !task.providerStarted && task.errorCode === "V3_REFERENCE_DELIVERY_EXPIRED") return "Final Video paused: refresh the saved request's private reference links";
    if (task.status === "reconciliation_required") return `${subjects[task.kind]} recovery required`;
    if (task.location && task.location.requestCount > 0) return task.location.label;
    if (task.status === "queued") return now - Date.parse(task.createdAt) >= 90_000 ? "Waiting for generation worker" : `${subjects[task.kind]} queued`;
    if (task.location) return task.location.label;
    return task.kind === "package" ? "Preparing Generation Package" : task.kind === "join" ? "Finishing Final Video" : task.kind === "delete" ? "Deleting saved video" : `Generating ${subjects[task.kind]}`;
  }
  const latest = state.artifacts.filter(a => a.activeSlot !== false && !state.artifacts.some(n => n.kind === a.kind && (a.kind !== "character" || n.characterId === a.characterId) && n.version > a.version));
  const approved = (kind: string) => latest.some(a => a.kind === kind && a.current && a.approved && !a.rejected);
  const review = latest.find(a => a.current && !a.approved && !a.rejected && a.kind !== "joined");
  if (review) return `${subjects[review.kind]} ready for review`;
  if (state.runs.some(r => r.state === "awaiting_review")) return "Final Video ready for review";
  if (approved("storyboard")) return "Storyboard approved";
  if (approved("location")) return "Location approved";
  if (approved("character") && latest.filter(a => a.kind === "character").every(a => a.current && a.approved && !a.rejected) && (!productRequired || approved("product"))) return "References approved";
  return "References ready to generate";
}
