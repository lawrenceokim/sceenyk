// Shared presentation of saved worker pauses; no provider or database dependency.
export function videoRequestBlocker(code: string | null | undefined) {
  if (code === "PAID_V3_EXECUTION_DISABLED") return "Video request paused: paid submissions are disabled in the worker. Check its environment and restart it after enabling the server switch.";
  if (code === "V3_REFERENCE_DELIVERY_EXPIRED") return "Video request paused: its private reference links expired before submission. Stop the worker, turn paid submissions OFF, and refresh this saved request's links.";
  if (code === "V3_ACTIVATION_SCOPE_MISMATCH") return "Video request paused by an older activation check. Restart the worker with the current source and server configuration.";
  if (code === "V3_POLL_DEADLINE_REACHED") return "The worker stopped waiting. Inspect and recover this existing request; do not create another generation.";
  return null;
}
