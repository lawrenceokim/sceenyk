import "server-only";
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

export async function inspectRuntime(w: RuntimeWorkspace) {
  const docValue = w.packages.at(-1)?.document;
  if (!docValue) return null;
  const doc = readFrozenPackage(docValue), quote = w.quotes.find(q => q.document.packageId === doc.id)?.document;
  const authority = w.runtimeAuthorizations.filter(a => a.document.packageId === doc.id).at(-1)?.document;
  const issues = quote ? quote.segments.flatMap(s => higgsfieldRequestIssues(s.body, doc.source.references, quote.validityEvidence, new Date().toISOString())) : ["COST_ESTIMATE_UNAVAILABLE"];
  let deliveryReady = false;
  try { videoDeliveryBindings(w, doc); deliveryReady = true; } catch { issues.push("V3_DELIVERY_BINDING_INVALID"); }
  try { await new V3Store().rpc("ugc_v3_video_setup", {}); } catch { issues.push("V3_VIDEO_SETUP_REQUIRED"); }
  const brief = await projectBrief(w.project.owner_user_id, w.project.project_id), originals = await referenceOriginals(w.project.owner_user_id, w.project.project_id);
  const config = v3TransportConfig(), currentIds = approvedArtifacts(w, brief, originals).map(a => a.id);
  if (!/^[^\s:]+:[^\s:]+$/.test(config.credentials) || !config.accountScope) issues.push("HIGGSFIELD_CREDENTIALS_REQUIRED");
  if (doc.pricing.source !== "manual_provider_estimate" && config.accountScope !== doc.accountScope) issues.push("HIGGSFIELD_ESTIMATE_ACCOUNT_CHANGED");
  if (config.outputHosts.length && !exactOutputHosts(config.outputHosts)) issues.push("HIGGSFIELD_OUTPUT_ALLOWLIST_INVALID");
  if (w.runs.some(r => r.package_id !== doc.id && !["approved", "failed", "deleted"].includes(r.state))) issues.push("V3_PRIOR_OUTCOME_REQUIRES_RECONCILIATION");
  if (doc.capabilityHash !== v3Digest("capabilities", normalizeCapabilities(new HiggsfieldVideoGenerationProvider().capabilities()))) issues.push("PROVIDER_CAPABILITIES_CHANGED");
  if (quote && quote.segments.some(s => !w.runtimeAuthorizations.some(a => a.document.packageId === doc.id && a.document.segmentUuid === s.segmentUuid &&
    !w.runs.some(r => r.intent.authorization.id === a.document.id) && Date.parse(a.document.expiresAt) > Date.now()))) issues.push("V3_SEGMENT_AUTHORIZATION_REQUIRED");
  const approvedLocation = w.artifacts.find(a => a.kind === "location" && currentIds.includes(a.id));
  const locationCurrent = !locationDocument(approvedLocation) || await new V3Store().rpc("ugc_v3_location_input_current", { p_project: w.project.project_id, d: approvedLocation!.document.input }) === true;
  if (!locationCurrent) issues.push("REFERENCE_STALE_REGENERATE");
  const current = locationCurrent && !!w.source?.current && w.source.revision === doc.sourceRevision && doc.source.references.every(r => currentIds.includes(r.id)) &&
    !w.tasks.some(t => ["character", "product", "location", "storyboard"].includes(t.kind) && Date.parse(t.created_at) > Date.parse(w.source!.created_at)) &&
    latestArtifact(w, "storyboard")?.id === doc.source.storyboard.id && !!latestArtifact(w, "storyboard")?.approved_at;
  const report = runtimePreflight(doc, quote, authority, { current, transportEnabled: config.enabled,
    now: new Date().toISOString(), validityIssues: issues, deliveryReady, existingIntent: w.runs.some(r => r.package_id === doc.id && r.state !== "deleted") });
  return { ...report, authorizedMaximumMicrousd: authority?.packageMaxEstimatedCostMicrousd ?? null };
}
