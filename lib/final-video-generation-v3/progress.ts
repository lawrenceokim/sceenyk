type ProgressTask = { kind: string; status: string; current: boolean; providerStarted: boolean; createdAt: string; leaseUntil: string | null; errorCode: string | null };
type ProgressArtifact = { kind: string; version: number; current: boolean; approved: boolean; rejected: boolean };
type ProgressState = { complete: boolean; tasks: ProgressTask[]; artifacts: ProgressArtifact[]; runs: { state: string }[] };
const subjects: Record<string, string> = { character: "Character Sheet", product: "Product Sheet", location: "Location", storyboard: "Storyboard",
  package: "Generation Package", video: "Final Video", join: "Final Video", delete: "saved video" };
export function referenceBusy(tasks: ProgressTask[], kind: string, now = Date.now()) {
  return tasks.some(t => t.kind === kind && (["queued", "running", "reconciliation_required"].includes(t.status) || t.status === "failed" && t.providerStarted) &&
    (t.current || t.providerStarted || t.status === "running" && Date.parse(t.leaseUntil ?? "") > now));
}
export function v3ProgressLabel(state: ProgressState, productRequired: boolean, now = Date.now()) {
  if (state.complete) return "Complete";
  const task = state.tasks.find(t => ["queued", "running", "reconciliation_required"].includes(t.status) &&
    (t.current || t.providerStarted || ["package", "video", "join", "delete"].includes(t.kind)));
  if (task) {
    if (task.status === "reconciliation_required") return `${subjects[task.kind]} needs attention`;
    if (task.status === "queued") return now - Date.parse(task.createdAt) >= 90_000 ? "Waiting for generation worker" : `${subjects[task.kind]} queued`;
    return task.kind === "package" ? "Preparing Generation Package" : task.kind === "join" ? "Finishing Final Video" : task.kind === "delete" ? "Deleting saved video" : `Generating ${subjects[task.kind]}`;
  }
  const latest = state.artifacts.filter(a => !state.artifacts.some(n => n.kind === a.kind && n.version > a.version));
  const approved = (kind: string) => latest.some(a => a.kind === kind && a.current && a.approved && !a.rejected);
  const review = latest.find(a => a.current && !a.approved && !a.rejected && a.kind !== "joined");
  if (review) return `${subjects[review.kind]} ready for review`;
  if (state.runs.some(r => r.state === "awaiting_review")) return "Final Video ready for review";
  if (approved("storyboard")) return "Storyboard approved";
  if (approved("location")) return "Location approved";
  if (approved("character") && (!productRequired || approved("product"))) return "References approved";
  return "References ready to generate";
}
