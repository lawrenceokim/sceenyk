import "server-only";
import { projectVideoResolution } from "@/lib/projects/video-resolution";
import type { RuntimeWorkspace } from "./runtime-store";
import { V3Store } from "./runtime-store";
import { readFrozenPackage } from "./package";
import { higgsfieldRequestIssues } from "./adapters/higgsfield-validity";
import { v3Digest, normalizeCapabilities } from "./identity";
import { HiggsfieldVideoGenerationProvider } from "./adapters/higgsfield";
import { projectBrief, referenceOriginals, approvedArtifacts } from "./creative-inputs";
import { v3TransportConfig, exactOutputHosts } from "./runtime-config";
import { videoDeliveryBindings } from "./video-delivery";
import { runtimePreflight } from "./execution-package";
import { locationDocument } from "./location-runtime";
import { latestArtifact } from "./generation-context";
import { packageClips, clipAuthority } from "./clip-runtime";
import { ServiceOperationError } from "@/lib/diagnostics/service-failure";
import { lockDocument, lockedOriginals } from "./creative-lock";
import { lockedBriefSchema } from "./creative-lock-contract";

// Request-local only. Common prerequisites must not fan out once per planned clip.
export function runtimeInspectionReads(brief: Awaited<ReturnType<typeof projectBrief>>, originals: Awaited<ReturnType<typeof referenceOriginals>>) {
  const pending = new Map<string, Promise<unknown>>(), store = new V3Store();
  return { brief, originals, rpc(name: "ugc_v3_clip_setup" | "ugc_v3_video_setup" | "ugc_v3_background_setup" | "ugc_v3_location_input_current", args: Record<string, unknown>) {
    const key = JSON.stringify([name, args]);
    if (!pending.has(key)) pending.set(key, store.rpc(name, args));
    return pending.get(key)!;
  } };
}
export async function inspectRuntime(w: RuntimeWorkspace, segmentId?: string, shared?: ReturnType<typeof runtimeInspectionReads>) {
  const docValue = w.packages.at(-1)?.document;
  if (!docValue) return null;
  const doc = readFrozenPackage(docValue), quote = w.quotes.find(q => q.document.packageId === doc.id)?.document;
  const clips = packageClips(doc);
  const reads = shared ?? runtimeInspectionReads(...await Promise.all([projectBrief(w.project.owner_user_id, w.project.project_id), referenceOriginals(w.project.owner_user_id, w.project.project_id)]));
  const authority = clips && segmentId ? clipAuthority(w, doc, segmentId) : w.runtimeAuthorizations.filter(a => a.document.packageId === doc.id).at(-1)?.document;
  const issues = quote ? quote.segments.flatMap(s => higgsfieldRequestIssues(s.body, doc.source.references, quote.validityEvidence, new Date().toISOString(), s.model)) : ["COST_ESTIMATE_UNAVAILABLE"];
  if (clips) {
    try { if (await reads.rpc("ugc_v3_clip_setup", {}) !== true) issues.push("V3_CLIP_SETUP_REQUIRED"); }
    catch (error) { if (error instanceof ServiceOperationError && error.code !== "V3_CLIP_SETUP_REQUIRED") throw error; issues.push("V3_CLIP_SETUP_REQUIRED"); }
  }
  let deliveryReady = false;
  try { videoDeliveryBindings(w, doc); deliveryReady = true; } catch { issues.push("V3_DELIVERY_BINDING_INVALID"); }
  try { if (await reads.rpc("ugc_v3_video_setup", {}) !== true) issues.push("V3_VIDEO_SETUP_REQUIRED"); }
  catch (error) { if (error instanceof ServiceOperationError && error.code !== "V3_VIDEO_SETUP_REQUIRED") throw error; issues.push("V3_VIDEO_SETUP_REQUIRED"); }
  try { if (await reads.rpc("ugc_v3_background_setup", {}) !== true) issues.push("V3_BACKGROUND_SETUP_REQUIRED"); }
  catch (error) { if (error instanceof ServiceOperationError && error.code !== "V3_BACKGROUND_SETUP_REQUIRED") throw error; issues.push("V3_BACKGROUND_SETUP_REQUIRED"); }
  const snapshot = lockDocument(w), locked = !!w.creativeLock?.valid && !!snapshot;
  const savedBrief = lockedBriefSchema.safeParse(snapshot?.brief);
  const brief = savedBrief.success ? savedBrief.data as typeof reads.brief : reads.brief, originals = lockedOriginals(w, reads.originals);
  const config = v3TransportConfig(), currentIds = approvedArtifacts(w, brief, originals).map(a => a.id);
  if (!/^[^\s:]+:[^\s:]+$/.test(config.credentials) || !config.accountScope) issues.push("HIGGSFIELD_CREDENTIALS_REQUIRED");
  if (doc.pricing.source !== "manual_provider_estimate" && config.accountScope !== doc.accountScope) issues.push("HIGGSFIELD_ESTIMATE_ACCOUNT_CHANGED");
  if (config.outputHosts.length && !exactOutputHosts(config.outputHosts)) issues.push("HIGGSFIELD_OUTPUT_ALLOWLIST_INVALID");
  if (w.runs.some(r => r.package_id !== doc.id && !["approved", "failed", "deleted"].includes(r.state))) issues.push("V3_PRIOR_OUTCOME_REQUIRES_RECONCILIATION");
  if (!locked && doc.capabilityHash !== v3Digest("capabilities", normalizeCapabilities(new HiggsfieldVideoGenerationProvider().capabilities()))) issues.push("PROVIDER_CAPABILITIES_CHANGED");
  if (!clips && quote && quote.segments.some(s => !w.runtimeAuthorizations.some(a => a.document.packageId === doc.id && a.document.segmentUuid === s.segmentUuid &&
    !w.runs.some(r => r.intent.authorization.id === a.document.id) && Date.parse(a.document.expiresAt) > Date.now()))) issues.push("V3_SEGMENT_AUTHORIZATION_REQUIRED");
  const approvedLocation = w.artifacts.find(a => a.kind === "location" && currentIds.includes(a.id));
  const locationCurrent = locked || !locationDocument(approvedLocation) || await reads.rpc("ugc_v3_location_input_current", { p_project: w.project.project_id, d: approvedLocation!.document.input }) === true;
  if (!locationCurrent) issues.push("REFERENCE_STALE_REGENERATE");
  const current = locked || !w.creativeLock && locationCurrent && doc.source.resolution === projectVideoResolution(brief.video_resolution) && !!w.source?.current && w.source.revision === doc.sourceRevision && doc.source.references.every(r => currentIds.includes(r.id)) &&
    !w.tasks.some(t => ["character", "product", "location", "storyboard"].includes(t.kind) && Date.parse(t.created_at) > Date.parse(w.source!.created_at)) &&
    latestArtifact(w, "storyboard")?.id === doc.source.storyboard.id && !!latestArtifact(w, "storyboard")?.approved_at;
  const report = runtimePreflight(doc, quote, authority, { current, transportEnabled: config.enabled,
    now: new Date().toISOString(), validityIssues: issues, deliveryReady, existingIntent: w.runs.some(r => r.package_id === doc.id && r.state !== "deleted" && (!clips || r.intent.segmentId === segmentId)) });
  return { ...report, authorizedMaximumMicrousd: authority?.packageMaxEstimatedCostMicrousd ?? null };
}
