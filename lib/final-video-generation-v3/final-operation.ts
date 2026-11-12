export type FinalOperationAction = "merge" | "approve" | "reject_delete" | "recover";
export class V3StatusReadError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) { super(code); }
}
export type FinalOperationIntent = {
  projectId: string; packageId: string; packageHash: string; manifestHash: string;
  action: FinalOperationAction; id: string | null; startedAt: number; accepted: boolean;
  baselineTaskId?: string | null; baselineStatus?: string | null;
};
export type FinalOperationStatus = {
  taskId: string | null; status: string | null; stage: string | null; errorCode: string | null;
  resultId: string | null; approved: boolean; rejected: boolean; deletionStatus: string | null;
};
export type FinalOperationPresentation = {
  active: boolean; blocked: boolean; message: string | null; detail: string | null; error: string;
  checkStatus: () => void;
};
export function finalOperationFinished(intent: FinalOperationIntent, status: FinalOperationStatus) {
  if (intent.action === "merge") return !!status.taskId && ["done", "failed", "reconciliation_required"].includes(status.status ?? "") &&
    (intent.accepted || status.taskId !== intent.baselineTaskId || status.status !== intent.baselineStatus);
  if (status.resultId !== intent.id) return !!intent.baselineTaskId && !!status.taskId && status.taskId !== intent.baselineTaskId;
  return intent.action === "approve" ? status.approved || status.rejected : status.rejected && ["done", "failed", "reconciliation_required"].includes(status.deletionStatus ?? "");
}
// Local intent is advisory only. Never restore another project/package's controls.
export function restoredFinalIntent(raw: string | null, projectId: string, now: number): FinalOperationIntent | null {
  try {
    const value = JSON.parse(raw ?? "null");
    return value && value.projectId === projectId && ["merge", "approve", "reject_delete", "recover"].includes(value.action) &&
      typeof value.packageId === "string" && /^[a-f0-9]{64}$/.test(value.packageHash) && /^[a-f0-9]{64}$/.test(value.manifestHash) &&
      (value.id === null || typeof value.id === "string") && typeof value.accepted === "boolean" &&
      Number.isFinite(value.startedAt) && value.startedAt <= now && now - value.startedAt < 24 * 60 * 60 * 1000 ? value : null;
  } catch { return null; }
}
