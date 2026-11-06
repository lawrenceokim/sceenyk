import "server-only";
import type { RuntimeWorkspace } from "./runtime-store";
import type { FrozenPackage } from "./package";
import type { RuntimeAuthorization } from "./runtime-contract";
import { validateConnectedStory } from "./connected-story";

export function packageClips(doc: FrozenPackage) {
  const story = doc.source.storyboardContent;
  if (story.version !== "director-storyboard-connected-v1") return null;
  validateConnectedStory(story);
  return story.clips.map((clip, i) => {
    const segment = doc.segments[i];
    if (!segment || segment.startMs !== clip.startMs || segment.endMs !== clip.endMs) throw new Error("V3_CLIP_PLAN_CHANGED");
    return { ...clip, segmentId: segment.id };
  });
}

export function clipAuthority(w: RuntimeWorkspace, doc: FrozenPackage, segmentId: string) {
  const previous = w.runs.filter(r => r.package_id === doc.id && r.intent.segmentId === segmentId).at(-1);
  return w.runtimeAuthorizations.filter(a => a.document.packageId === doc.id && a.document.segmentId === segmentId &&
    (!previous || previous.state === "deleted") &&
    a.document.clipAttempt?.previousRunId === (previous?.id ?? null) &&
    !w.runs.some(r => r.intent.authorization.id === a.document.id) && Date.parse(a.document.expiresAt) > Date.now()).at(-1)?.document;
}

// All attempts, including rejected/deleted ones, count toward cumulative spending.
// Outstanding grants reserve their maximum; deleting output never refunds authority.
export function clipSpending(w: RuntimeWorkspace, doc: FrozenPackage) {
  const committed = w.runs.filter(r => r.package_id === doc.id).reduce((n, r) => n + r.intent.estimatedCostMicrousd, 0);
  const reserved = w.runtimeAuthorizations.filter(a => a.document.packageId === doc.id && Date.parse(a.document.expiresAt) > Date.now() &&
    !w.runs.some(r => r.intent.authorization.id === a.document.id)).reduce((n, a) => n + a.document.maxEstimatedCostMicrousd, 0);
  if (!Number.isSafeInteger(committed + reserved)) throw new Error("V3_PACKAGE_AUTHORIZATION_INSUFFICIENT");
  return { committedMicrousd: committed, reservedMicrousd: reserved };
}

export function clipAttemptBinding(doc: FrozenPackage, segmentId: string, previousRunId: string | null): NonNullable<RuntimeAuthorization["clipAttempt"]> {
  const clip = packageClips(doc)?.find(c => c.segmentId === segmentId);
  if (!clip) throw new Error("V3_CLIP_PLAN_INVALID");
  return { storyboardId: doc.source.storyboard.id, clipId: clip.id, number: clip.number, previousRunId };
}
