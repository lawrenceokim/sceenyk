import type { Storyboard } from "./schema";
import { speechTimingLimits } from "@/lib/speech-timing/plan";

export type StoryboardPace = Storyboard["voice"]["pace"];
export const speechRates = { slow: 1.8, natural: 2.3, energetic: 2.7 } as const;
const paces = ["slow", "natural", "energetic"] as const;
export const minimumActionMs = 700;
export const preferredActionMs = 900;
export function preferredSpeechTarget(hardMaximum: number) {
  return hardMaximum <= 1 ? hardMaximum : Math.floor(hardMaximum * 0.75);
}

// Mirrors the existing validator; this does not replace or relax validation.
// A planning pause reduces recommended content below the validator ceiling.
export function speechIntervalBudget(startMs: number, endMs: number, pace: StoryboardPace, pauseMs = 200) {
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 || endMs < startMs ||
      !Number.isSafeInteger(pauseMs) || pauseMs < 0 || !Object.hasOwn(speechRates, pace)) throw new Error("STORYBOARD_TIMING_PLAN_INVALID");
  const durationMs = endMs - startMs;
  const pauseReserveMs = Math.min(pauseMs, durationMs);
  const availableSpeechMs = durationMs - pauseReserveMs;
  const maximumWords = Math.floor(durationMs / 1000 * speechRates[pace]);
  const maximumNonspaceCharacters = Math.floor(durationMs / 1000 * 16);
  return { startMs, endMs, durationMs, pauseReserveMs, availableSpeechMs, pace, synthesisSpeedLimits: speechTimingLimits,
    maximumWords, maximumNonspaceCharacters,
    preferredTargetWords: Math.min(preferredSpeechTarget(maximumWords), Math.floor(availableSpeechMs / 1000 * speechRates[pace])),
    preferredTargetNonspaceCharacters: Math.min(preferredSpeechTarget(maximumNonspaceCharacters), Math.floor(availableSpeechMs / 1000 * 16)) };
}

type SceneTiming = { number: number; startMs: number; endMs: number };
function interval(startMs: number, endMs: number) { return { startMs, endMs, durationMs: endMs - startMs }; }
function sceneBudget(scene: SceneTiming) {
  const durationMs = scene.endMs - scene.startMs;
  // 24% action/camera setup, 12% reaction, 4% transition; at most 60% speech.
  const actionMs = Math.min(durationMs, Math.max(preferredActionMs, Math.ceil(durationMs * 24 / 100)));
  const reactionMs = Math.min(Math.ceil(durationMs * 12 / 100), durationMs - actionMs);
  const transitionMs = Math.min(Math.ceil(durationMs * 4 / 100), durationMs - actionMs - reactionMs);
  const speechStart = scene.startMs + actionMs;
  const speechEnd = scene.endMs - reactionMs - transitionMs;
  return { ...scene, durationMs, minimumActionMs, preferredActionMs,
    maximumRecommendedActions: Math.floor(actionMs / preferredActionMs) || (actionMs >= minimumActionMs ? 1 : 0),
    actionAndCamera: interval(scene.startMs, speechStart),
    speakingWindow: interval(speechStart, speechEnd),
    reaction: interval(speechEnd, scene.endMs - transitionMs), transition: interval(scene.endMs - transitionMs, scene.endMs),
    limitsByPace: Object.fromEntries(paces.map(pace => [pace, speechIntervalBudget(speechStart, speechEnd, pace)])) as Record<StoryboardPace, ReturnType<typeof speechIntervalBudget>> };
}

// Supply actual scene/interval limits before a single model request. Scene
// boundaries are planning beats, not mandatory cuts or invented story content.
export function storyboardSpeechPlan(durationMs: number, existingScenes?: readonly SceneTiming[]) {
  if (![5000, 10000, 30000].includes(durationMs)) throw new Error("STORYBOARD_TIMING_PLAN_INVALID");
  const count = durationMs === 5000 ? 1 : durationMs === 10000 ? 2 : 5;
  const timings = existingScenes ?? Array.from({ length: count }, (_, i) => ({ number: i + 1,
    startMs: Math.floor(durationMs * i / count), endMs: Math.floor(durationMs * (i + 1) / count) }));
  let end = 0;
  if (!timings.length || timings.length > 10) throw new Error("STORYBOARD_TIMING_PLAN_INVALID");
  for (const [i, scene] of timings.entries()) {
    if (scene.number !== i + 1 || scene.startMs !== end || !Number.isSafeInteger(scene.endMs) || scene.endMs - scene.startMs < minimumActionMs || scene.endMs > durationMs) throw new Error("STORYBOARD_TIMING_PLAN_INVALID");
    end = scene.endMs;
  }
  if (end !== durationMs) throw new Error("STORYBOARD_TIMING_PLAN_INVALID");
  const scenes = timings.map(sceneBudget);
  const maximumSpeechWindowMs = scenes.reduce((sum, scene) => sum + scene.speakingWindow.durationMs, 0);
  const availableSpeechMs = scenes.reduce((sum, scene) => sum + scene.limitsByPace.natural.availableSpeechMs, 0);
  return { planningVersion: 2, hardLimits: true, targetFraction: 0.75, minimumActionMs, preferredActionMs, durationMs, sceneCount: scenes.length,
    maximumSpeechWindowMs, availableSpeechMs, reservedNonSpeakingMs: durationMs - maximumSpeechWindowMs,
    pauseReserveMs: maximumSpeechWindowMs - availableSpeechMs,
    limitsByPace: Object.fromEntries(paces.map(pace => [pace, {
      preferredTargetWords: scenes.reduce((sum, scene) => sum + scene.limitsByPace[pace].preferredTargetWords, 0),
      preferredTargetNonspaceCharacters: scenes.reduce((sum, scene) => sum + scene.limitsByPace[pace].preferredTargetNonspaceCharacters, 0),
      maximumSpokenWords: scenes.reduce((sum, scene) => sum + scene.limitsByPace[pace].maximumWords, 0),
      maximumNonspaceCharacters: scenes.reduce((sum, scene) => sum + scene.limitsByPace[pace].maximumNonspaceCharacters, 0),
    }])) as Record<StoryboardPace, { preferredTargetWords: number; preferredTargetNonspaceCharacters: number; maximumSpokenWords: number; maximumNonspaceCharacters: number }>, scenes };
}

export const speechPlanningInstructions = `Timing constraints are strict production limits, not suggestions. Stay comfortably below speech limits. Never exceed an absolute word or character maximum. Do not shorten required physical actions to create more dialogue time. A scene may contain no dialogue.
For each exact dialogue/window, synthesis planning estimates duration using both words and nonspace characters, preserves configured pace, reserves 10% headroom (up to 200ms), and admits only the configured synthesisSpeedLimits. Speed selection cannot relax any hard content budget or guarantee the measured duration; generated audio/alignment must still be verified afterwards.
Plan and verify in this order BEFORE returning: A. Total video duration; B. Number of scenes; C. Exact scene start/end timestamps; D. Required physical action, product interaction, facial reaction, camera movement and transition time; E. Remaining speech time; F. Speech target AND hard maximum; G. Final concise dialogue; H. Final timing verification of every word/character count, action duration, interval, overlap/gap and exact total duration. Return only the existing storyboard schema, never internal planning or additional fields.
Use speechTimingPlan's supplied scene boundaries and reserved windows. Scenes are planning beats, not mandatory cuts; preserve a continuous shot and the intended concept when appropriate. Select a stable natural pace by default; slow/energetic only if the concept warrants it, never to squeeze in excess words. Rates remain slow=1.8, natural=2.3, energetic=2.7 words/second and 16 nonspace Unicode characters/second.
Reserve actions BEFORE dialogue. Each scene supplies minimumActionMs=700, preferredActionMs=900 and maximumRecommendedActions. Aim for >=900ms for EACH physical action, >=700ms absolutely; never invent a 600ms action or scene shorter than 700ms. Plan fewer simple actions when space is tight. Every action must fit its scene, remain sequential without overlap, and leave time for product handling, expression and camera movement. Keep complex contact/repositioning/reframing in actionAndCamera. Preserve pose/product continuity; do not invent repetitive lifts. Leave the supplied reaction and transition windows free of speech. At most 60% of the video is a speaking window; the rest is action/camera/reaction/transition time. The 200ms breath/pause reserve per utterance is additional.
Each speakingWindow supplies startMs/endMs/durationMs and limitsByPace: availableSpeechMs after the pause, preferredTargetWords, maximumWords, preferredTargetNonspaceCharacters and maximumNonspaceCharacters. The target is what you should normally use. The absolute maximum must never be exceeded. Preferred targets use about 75% of the absolute ceiling, further reduced by pauses. For example a hard maximum of 2 words normally targets 1 word, 3 words targets 2, 4 targets 3. A zero target means silence is preferable; never invent a zero-length speech interval. Absolute ceilings are floor(intervalMs/1000*paceRate) words and floor(intervalMs/1000*16) characters. Count whitespace-separated words and nonspace Unicode characters, not tokens or UTF-16 code units.
Budget dialogue AND narration together using BOTH per-line and whole-scene/video targets and maxima. Never allocate each line the entire scene allowance or move speech into reserved action/reaction/transition time. If subdividing a speakingWindow, FIRST assign nonoverlapping absolute integer-ms intervals, reserve 200ms from EACH, then recalculate its hard ceiling and 75% preferred target from its ACTUAL interval. Shortening a line's interval also reduces its budget: NEVER keep the larger window's word allowance. Sum targets/maxima without pooling rounding leftovers.
For 5s and 10s videos dialogue is optional in EVERY scene. A 10s advertisement does not need dialogue in every scene. Prefer a meaningful visual product demonstration, reaction or motivated camera move to filler words. One concise phrase or no speech is better than a forced sentence. A wholly silent scene may use unused speaking-window time for a longer realistic action, retaining reaction/transition time and minimum action durations. For 30s derive longer content only from actual extra time, never a faster voice.
Before returning structured output, perform H: independently recount each line, check it against preferred target and absolute word/character maxima, check each action is >=700ms (prefer >=900ms), check all intervals remain inside their scene, speech/actions do not overlap their own sequence, scenes cover 0 to exact selected duration with no overlaps/gaps, and approved asset bindings remain unchanged. If anything fails, revise your proposed output BEFORE returning. Never return knowingly invalid timing.`;
