import "server-only";
import { z } from "zod";
import { packageDigest } from "@/lib/video-generation-package/builder";
import { adapterIdentities } from "./adapters/registry";
import type { FinalConfiguration } from "./contract";
import { FinalConfigurationError, type AuthorizationIssue } from "./configuration-diagnostics";
import { compositionProfile } from "./composition";

const amount = z.number().int().positive().max(1_000_000_000);
const authorization = z.strictObject({ authorizationId: z.uuid(), language: z.string().regex(/^[a-z]{2,3}$/),
  maxRequests: z.number().int().min(1).max(64), maxEstimatedCostMicrousd: amount,
  ceilings: z.strictObject({ video: amount, voice: amount, design: amount, binding: amount, lip_sync: amount }) });

const authorizationFields = new Set(["authorizationId", "language", "maxRequests", "maxEstimatedCostMicrousd", "ceilings",
  "ceilings.video", "ceilings.voice", "ceilings.design", "ceilings.binding", "ceilings.lip_sync"]);
export function parseFinalAuthorization(raw: string | undefined) {
  if (!raw?.trim()) throw new FinalConfigurationError("FINAL_FUNDING_REQUIRED", "authorization_missing");
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new FinalConfigurationError("FINAL_FUNDING_REQUIRED", "authorization_invalid_json"); }
  if (value && typeof value === "object" && !Array.isArray(value) && "ceilings" in value) {
    const ceilings = value.ceilings;
    if (ceilings && typeof ceilings === "object" && !Array.isArray(ceilings) && Object.hasOwn(ceilings, "lipsync")) {
      if (Object.hasOwn(ceilings, "lip_sync")) throw new FinalConfigurationError("FINAL_FUNDING_REQUIRED", "authorization_invalid",
        [{ field: "ceilings.lip_sync", rule: "ambiguous_ceiling" }]);
      // Normalize this known spelling before strict validation/hash generation.
      // Never supply a default, coerce amounts, choose between two limits or
      // remove arbitrary fields. SQL/provider operation kinds stay lip_sync.
      const { lipsync, ...rest } = ceilings as Record<string, unknown>;
      value = { ...value, ceilings: { ...rest, lip_sync: lipsync } };
    }
  }
  const parsed = authorization.safeParse(value);
  if (!parsed.success) {
    const issues: AuthorizationIssue[] = parsed.error.issues.map(issue => {
      const field = issue.path.join(".");
      return { field: authorizationFields.has(field) ? field : "authorization", rule: issue.code };
    });
    throw new FinalConfigurationError("FINAL_FUNDING_REQUIRED", "authorization_invalid", issues);
  }
  return parsed.data;
}

// Local operator-funded development is explicitly supported by the M10 contract.
// Customer credit/quote paths stay fail-closed until a commercial UGC tariff and
// review-hold policy exist; no legacy ledger or entitlement is bypassed/modified.
export function finalConfiguration(): { value: FinalConfiguration; hash: string } {
  if (process.env.UGC_FINAL_VIDEO_ENABLED !== "1") throw new FinalConfigurationError("FINAL_SETUP_REQUIRED", "final_video_disabled");
  if (process.env.SCEENYK_LOCAL_JOBS_ONLY === "0") throw new FinalConfigurationError("FINAL_SETUP_REQUIRED", "local_execution_required");
  if (process.env.UGC_FINAL_OPERATOR_FUNDED !== "1") throw new FinalConfigurationError("FINAL_SETUP_REQUIRED", "operator_funding_disabled");
  const parsed = parseFinalAuthorization(process.env.UGC_FINAL_AUTHORIZATION);
  const value: FinalConfiguration = { ...parsed, version: "ugc-final-v1", funding: "operator_funded",
    providers: adapterIdentities, composition: compositionProfile,
    output: { height: 720, fps: 25, format: "mp4", toleranceMs: 50, audioSampleRate: 48000 } };
  return { value, hash: packageDigest("sceenyk-final-config", value) };
}
