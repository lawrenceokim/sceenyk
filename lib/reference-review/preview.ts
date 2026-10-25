import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { getDatabaseConfig } from "@/lib/db/config";
import { readR2AnalysisMedia, inspectR2Object } from "@/lib/storage/r2";
import { referencePreviewRequestSchema, type ReferenceType, type ReferenceView } from "./contract";
import { ownedReferenceReview, ReferenceReviewAccessError, reviewSnapshot } from "./server";
import { effectiveReferenceAssets, parseReviewSheet } from "./state";
import { rejectedCharacterCandidates } from "./rejected";
import { characterSheetDocumentSchema, operationSchema } from "@/lib/character-sheet/contract";

const tokenSchema = referencePreviewRequestSchema.extend({ ownerId: z.uuid(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), expires: z.number().int().positive() });
const lifetime = 120;
type PreviewPhase = "token" | "authorization" | "asset_resolution" | "signing" | "storage" | "decode";
export class ReferencePreviewFailure extends ReferenceReviewAccessError {
  constructor(readonly phase: PreviewPhase, status: number) { super(status); }
}
function signature(body: string) {
  // Domain-separated purpose key; no new credential or shared client secret.
  return createHmac("sha256", getDatabaseConfig().secretKey).update(`sceenyk-reference-preview-v1\n${body}`).digest();
}
type Context = Awaited<ReturnType<typeof ownedReferenceReview>>;
async function resolveAsset(context: Context, type: ReferenceType, view: ReferenceView, rejectedId?: string, frontSource?: boolean) {
  const sheet = parseReviewSheet(context.job, type, context.sheets[type]);
  if (!sheet) throw new ReferenceReviewAccessError();
  const snapshot = reviewSnapshot(context.job);
  const source = snapshot[type];
  if (frontSource && (type !== "character" || view !== "front" || rejectedId)) throw new ReferenceReviewAccessError();
  if (rejectedId && (type !== "character" || !["front", "back", "face"].includes(view))) throw new ReferenceReviewAccessError();
  if (rejectedId) {
    const purge = await context.db.from("ugc_character_asset_purges").select("object_hash").eq("object_hash", rejectedId).maybeSingle();
    if (purge.data) throw new ReferenceReviewAccessError();
    if (purge.error && !["PGRST205", "42P01"].includes(purge.error.code)) throw new ReferenceReviewAccessError(503);
  }
  if (view === "original") {
    // Use the frozen source, including an owned historical image detached from
    // the current draft. Never substitute a later upload with the same label.
    const result = await context.db.from("project_assets").select("*").eq("id", source.assetId)
      .eq("owner_user_id", context.ownerId).eq("project_id", context.job.project_id).eq("studio_role", type)
      .eq("upload_status", "uploaded").maybeSingle();
    const asset = result.data;
    if (result.error || !asset || asset.storage_provider !== "r2" || asset.media_type !== "image" || asset.reference_id !== source.referenceId ||
      asset.verified_etag !== source.etag || asset.mime_type !== source.mimeType || asset.size_bytes !== source.sizeBytes || source.sizeBytes > 100 * 1024 * 1024) {
      throw new ReferenceReviewAccessError();
    }
    return { storageKey: asset.storage_key, etag: source.etag, sizeBytes: source.sizeBytes, identity: `${source.assetId}:${source.etag}:${source.sizeBytes}` };
  }
  const root = await context.db.from("ugc_reference_reviews").select("*").eq("job_id", context.job.id)
    .eq("owner_user_id", context.ownerId).eq("reference_type", type).maybeSingle();
  if (root.error && !["PGRST205", "42P01"].includes(root.error.code)) throw new ReferenceReviewAccessError(503);
  let assets = sheet.assets;
  let savedRequests: import("./contract").ReferenceRegenerationRow[] = [];
  if (root.data) {
    const requests = await context.db.from("ugc_reference_regeneration_requests").select("*").eq("review_id", root.data.id);
    if (requests.error) throw new ReferenceReviewAccessError(503);
    savedRequests = requests.data ?? [];
    assets = effectiveReferenceAssets(assets, root.data, requests.data ?? []);
  }
  if (rejectedId) {
    const candidate = rejectedCharacterCandidates(context.job, context.sheets.character, root.data ?? undefined, savedRequests)
      .find(item => item.id === rejectedId && item.view === view);
    if (!candidate) throw new ReferenceReviewAccessError();
    const object = await inspectR2Object(candidate.storageKey);
    if (!object?.etag || object.mimeType !== "image/png" || !object.sizeBytes || object.sizeBytes > 20 * 1024 * 1024) throw new ReferenceReviewAccessError();
    return { storageKey: candidate.storageKey, etag: object.etag, sizeBytes: object.sizeBytes, rejectedSha256: candidate.sha256,
      identity: `${candidate.id}:${candidate.sha256}:${object.etag}` };
  }
  const asset = assets[view];
  if (frontSource) {
    const pending = savedRequests.filter(item => item.view === "front" && item.state !== "completed").sort((a, b) => b.requested_version - a.requested_version)[0];
    const op = operationSchema.safeParse(pending?.checkpoint).data;
    const baseOp = characterSheetDocumentSchema.safeParse(context.sheets.character?.document).data?.operations.front;
    const reference = op?.frontSource ?? asset?.frontSource ?? baseOp?.frontSource;
    const proof = op?.frontSource ? op.sourceValidation : asset?.frontSource ? asset.sourceValidation : baseOp?.sourceValidation;
    if (!reference || reference.kind !== "front_source" || proof?.state !== "passed" ||
      proof.sha256 !== reference.sha256 || !reference.storageKey.startsWith(`ugc/${context.ownerId}/${context.job.project_id}/${context.job.id}/`)) throw new ReferenceReviewAccessError();
    const object = await inspectR2Object(reference.storageKey);
    if (!object?.sizeBytes || object.sizeBytes > 20 * 1024 * 1024 || object.mimeType !== "image/png" || object.etag !== reference.etag) throw new ReferenceReviewAccessError();
    return { storageKey: reference.storageKey, etag: reference.etag, sizeBytes: object.sizeBytes, rejectedSha256: reference.sha256,
      identity: `${reference.assetId}:${reference.sha256}:${reference.etag}` };
  }
  if (!asset) throw new ReferenceReviewAccessError();
  return { ...asset, identity: `${asset.id}:${asset.sha256}:${asset.etag}` };
}
export async function issueReferencePreview(input: unknown) {
  const at: { phase: PreviewPhase } = { phase: "authorization" };
  try { return await issuePreview(input, at); }
  catch (error) { unstable_rethrow(error); throw new ReferencePreviewFailure(at.phase, error instanceof ReferenceReviewAccessError ? error.status : 503); }
}
async function issuePreview(input: unknown, at: { phase: PreviewPhase }) {
  const parsed = referencePreviewRequestSchema.safeParse(input);
  if (!parsed.success) throw new ReferenceReviewAccessError();
  const { projectId, jobId, type, view, version, rejectedId, frontSource } = parsed.data;
  const context = await ownedReferenceReview({ projectId, jobId });
  const group = type === "character" && context.review.historicalCharacter ? context.review.historicalCharacter : context.review.groups.find(item => item.type === type);
  if (!group || group.version !== version || !(frontSource ? group.frontSourceAvailable : rejectedId ? group.rejectedOutputs?.some(item => item.id === rejectedId && item.view === view) : group.assets.some(item => item.view === view && item.available))) throw new ReferenceReviewAccessError(409);
  if (frontSource && !group.frontSourceAvailable) throw new ReferenceReviewAccessError(409);
  at.phase = "asset_resolution";
  const asset = await resolveAsset(context, type, view, rejectedId, frontSource);
  at.phase = "signing";
  const expires = Math.floor(Date.now() / 1000) + lifetime;
  const body = Buffer.from(JSON.stringify({ ...parsed.data, ownerId: context.ownerId,
    fingerprint: createHash("sha256").update(asset.identity).digest("hex"), expires })).toString("base64url");
  // Signed application URL, NOT an R2 presign whose path reveals a private key.
  return { url: `/api/ugc/reference-review/image?token=${body}.${signature(body).toString("base64url")}`,
    expiresAt: new Date(expires * 1000).toISOString() };
}
export async function readReferencePreview(token: string | null, signal: AbortSignal) {
  const at: { phase: PreviewPhase } = { phase: "token" };
  try { return await readPreview(token, signal, at); }
  catch (error) { unstable_rethrow(error); throw new ReferencePreviewFailure(at.phase, error instanceof ReferenceReviewAccessError ? error.status : 503); }
}
async function readPreview(token: string | null, signal: AbortSignal, at: { phase: PreviewPhase }) {
  if (!token || token.length > 1800 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) throw new ReferenceReviewAccessError();
  const [body, mac] = token.split(".");
  const supplied = Buffer.from(mac, "base64url");
  const expected = signature(body);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new ReferenceReviewAccessError();
  let raw: unknown;
  try { raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw new ReferenceReviewAccessError(); }
  const parsed = tokenSchema.safeParse(raw);
  const now = Math.floor(Date.now() / 1000);
  if (!parsed.success || parsed.data.expires <= now || parsed.data.expires > now + lifetime) throw new ReferenceReviewAccessError();
  const { projectId, jobId, type, view, version, ownerId, fingerprint, rejectedId, frontSource } = parsed.data;
  // A copied token is insufficient: authenticate and re-authorize every image
  // redemption, and recheck current review version + exact asset fingerprint.
  at.phase = "authorization";
  const context = await ownedReferenceReview({ projectId, jobId });
  const group = type === "character" && context.review.historicalCharacter ? context.review.historicalCharacter : context.review.groups.find(group => group.type === type);
  if (context.ownerId !== ownerId || group?.version !== version) throw new ReferenceReviewAccessError();
  at.phase = "asset_resolution";
  const asset = await resolveAsset(context, type, view, rejectedId, frontSource);
  if (createHash("sha256").update(asset.identity).digest("hex") !== fingerprint) throw new ReferenceReviewAccessError();
  const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
  at.phase = "storage";
  const stream = await readR2AnalysisMedia(asset.storageKey, asset.etag, asset.sizeBytes, boundedSignal);
  if (view !== "original" && !("rejectedSha256" in asset)) return { body: stream, sizeBytes: asset.sizeBytes };
  const reader = stream.getReader(); const chunks: Buffer[] = []; let size = 0;
  try {
    while (true) { boundedSignal.throwIfAborted(); const item = await reader.read(); if (item.done) break;
      size += item.value.length; if (size > asset.sizeBytes) throw new ReferenceReviewAccessError(); chunks.push(Buffer.from(item.value)); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (size !== asset.sizeBytes) throw new ReferenceReviewAccessError();
  if ("rejectedSha256" in asset) {
    const bytes = Buffer.concat(chunks, size);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.rejectedSha256) throw new ReferenceReviewAccessError();
    return { body: new Uint8Array(bytes), sizeBytes: bytes.length };
  }
  // Browser-safe original-image presentation, oriented/metadata-stripped only;
  // never stored, generated by a provider, cropped, or substituted with a view.
  at.phase = "decode";
  const bytes = await sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000, failOn: "warning" })
    .rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new ReferenceReviewAccessError();
  return { body: new Uint8Array(bytes), sizeBytes: bytes.length };
}
