// Shared presentation of saved worker pauses; no provider or database dependency.
export function videoRequestBlocker(code: string | null | undefined) {
  if (code === "PAID_V3_EXECUTION_DISABLED") return "Video request paused by the administrator's paid-generation switch. Accepted requests can still finish.";
  if (code === "V3_REFERENCE_DELIVERY_EXPIRED") return "The saved request's private reference links expired. The worker will refresh eligible unsubmitted requests; no new execution or spending approval is created.";
  if (code === "V3_ACTIVATION_SCOPE_MISMATCH") return "The processing service is using an older activation check. Ask the administrator to update it; your saved request is preserved.";
  if (code === "V3_POLL_DEADLINE_REACHED") return "The worker stopped waiting. Inspect and recover this existing request; do not create another generation.";
  return null;
}
