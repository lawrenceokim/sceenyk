// Historical maintenance arguments retain their original runner. V3 discovery
// subsequently uses only owned, explicitly enrolled registry records.
export function workerLane(args: string[], v3Enabled: boolean) {
  if (args.includes("--legacy")) return "legacy";
  if (args.includes("--project") || args.includes("--once")) return "v3";
  return args.length || !v3Enabled ? "legacy" : "v3";
}
