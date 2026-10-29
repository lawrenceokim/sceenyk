import "server-only";
import { z } from "zod";
import { digestSchema } from "./contract";
import type { VideoGenerationProvider } from "./contract";
import { freezeDocument, v3Digest } from "./identity";
import { packageCost, type FrozenPackage } from "./package";

export const authorizationSchema = z.strictObject({ workflow: z.literal("final-video-v3"), id: z.uuid(),
  projectId: z.uuid(), packageId: z.uuid(), packageVersion: z.number().int().positive(), packageHash: digestSchema,
  providerId: z.string().min(1), profileId: z.string().min(1), model: z.string().min(1),
  maxRequests: z.number().int().positive().safe(), maxEstimatedCostMicrousd: z.number().int().nonnegative().safe(),
  resolution: z.literal("480p"), durationMs: z.number().int().positive(), segmentCount: z.number().int().positive(),
  operatorApproval: z.strictObject({ operatorId: z.uuid(), approvedAt: z.iso.datetime({ offset: true }),
    decision: z.literal("approve_exact_package"), expiresAt: z.iso.datetime({ offset: true }) }), hash: digestSchema });
export type V3Authorization = z.infer<typeof authorizationSchema>;
export function bindAuthorization(doc: FrozenPackage, provider: VideoGenerationProvider, input: {
  id: string; model: string; maxRequests: number; maxEstimatedCostMicrousd: number; operatorId: string; approvedAt: string; expiresAt: string;
}): V3Authorization {
  const cost = packageCost(doc, provider, input.approvedAt);
  if (cost.code) throw new Error(cost.code);
  if (input.maxRequests !== doc.segments.length || input.maxEstimatedCostMicrousd < cost.totalMicrousd ||
    Date.parse(input.expiresAt) <= Date.parse(input.approvedAt)) throw new Error("AUTHORIZATION_LIMIT_INVALID");
  const body = { workflow: "final-video-v3" as const, id: input.id, projectId: doc.source.scope.projectId,
    packageId: doc.id, packageVersion: doc.version, packageHash: doc.hash, providerId: doc.capabilitySnapshot.providerId,
    profileId: doc.source.profileId, model: input.model, maxRequests: input.maxRequests, maxEstimatedCostMicrousd: input.maxEstimatedCostMicrousd,
    resolution: doc.source.resolution, durationMs: doc.source.storyboardContent.durationMs, segmentCount: doc.segments.length,
    operatorApproval: { operatorId: input.operatorId, approvedAt: input.approvedAt, decision: "approve_exact_package" as const, expiresAt: input.expiresAt } };
  return freezeDocument(authorizationSchema.parse({ ...body, hash: v3Digest("authorization", body) }));
}
export function authorizationIssues(doc: FrozenPackage, value: unknown, now: string, expectedModel: string): string[] {
  const parsed = authorizationSchema.safeParse(value);
  if (!parsed.success) return ["V3_AUTHORIZATION_REQUIRED"];
  const { hash, ...a } = parsed.data;
  if (hash !== v3Digest("authorization", a)) return ["AUTHORIZATION_HASH_INVALID"];
  if (a.projectId !== doc.source.scope.projectId || a.packageId !== doc.id || a.packageHash !== doc.hash || a.packageVersion !== doc.version ||
    a.providerId !== doc.capabilitySnapshot.providerId || a.profileId !== doc.source.profileId || a.model !== expectedModel ||
    a.resolution !== doc.source.resolution || a.durationMs !== doc.source.storyboardContent.durationMs || a.segmentCount !== doc.segments.length ||
    a.maxRequests !== doc.segments.length) return ["AUTHORIZATION_PACKAGE_MISMATCH"];
  if (!Number.isFinite(Date.parse(now)) || Date.parse(a.operatorApproval.approvedAt) > Date.parse(now) || Date.parse(a.operatorApproval.expiresAt) <= Date.parse(now))
    return ["AUTHORIZATION_EXPIRED"];
  if (doc.pricing.totalMicrousd === null || doc.pricing.totalMicrousd > a.maxEstimatedCostMicrousd) return ["AUTHORIZATION_COST_EXCEEDED"];
  return [];
}
