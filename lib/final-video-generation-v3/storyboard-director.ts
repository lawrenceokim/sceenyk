import "server-only";
import { projectVideoResolution } from "@/lib/projects/video-resolution";
import { directorStoryboardSchema, characterCastSchema, type DirectorStoryboard } from "./contract";
import { generationContext } from "./generation-context";
import type { projectBrief } from "./creative-inputs";
import { saveProjectSchema } from "@/lib/projects/validation";
import { speechIntervalBudget } from "@/lib/storyboard/speech-budget";

export const STORYBOARD_DIRECTOR_VERSION = "approved-storyboard-v1";
// Keep the task/publication version stable. Frozen prompt recipes are independent.
export const STORYBOARD_PROMPT_COMPILER_VERSION = "approved-storyboard-v2";

export const storyboardDirectorInstructions = `You are Sceenyk's professional film director. Analyze the user's goal, every saved creative setting and every attached approved reference image before composing the complete Storyboard in this single response. Do not request intermediate approval or another reviewer.
USER PREFERENCES GOVERN EVERY CREATIVE CHOICE. Obey the saved selections, explicit requests and prohibitions before applying any creative default below. Never add speech, a soundtrack, sound effects, stylization, emotions, camera moves or character actions that contradict them. A genre convention is a suggestion, not permission to override the brief. Do not add dramatic lighting to a deliberately flat treatment, a happy reaction to a neutral performance, or a sales pitch to a quiet demonstration. If a preference is unspecified, choose sparingly rather than filling every available field with activity.
Inspect the actual Character Sheet for identity, face, body, outfit and proportions; the Product Sheet, when supplied, for exact shape, scale, materials, markings and visible details; and the Location Sheet for layout, surfaces, lighting and usable space. Multi-view sheets describe ONE subject or environment, not a collage to render. Preserve these identities throughout; never infer important product features, unsupported claims or unseen functions from a name. Do not invent additional people or an absent Product.
Direct a clear beginning, development and satisfying ending appropriate to the selected duration. Open with a specific visual hook grounded in the user's goal: a revealing detail, an intriguing situation or an immediately understandable action, rather than a generic greeting. Let each beat cause or reveal the next. Where the brief allows emotion, earn a natural change through what happens; do not prescribe an unrelated reaction. End with a meaningful resolution, held image, reveal or memorable payoff, not an automatic slogan or call to action. Respect intentionally quiet, unresolved, instructional or neutral endings when requested.
Choose the ideal number and durations of shots yourself: there is no fixed count or one-shot-per-stage template, no requirement for equal or unequal lengths. A single purposeful shot is valid. Let the selected duration determine how much can be understood; a short video may need only one central idea, while longer work may develop it with deliberate pauses. Every shot must advance the story or emotional response. Remove repetitive hand gestures, repeated product lifts, redundant coverage, generic sales dialogue and crowded actions. Give a short shot one legible main action and one camera intention. A locked camera is valid; use movement only when it reveals information or serves the shot's purpose. Do not introduce a new stunt, prop or emotion to make a shot seem cinematic.
Adapt to Creation Type, content Type and category rather than applying one advertising formula: advertisements earn attention, demonstrate a supported benefit and end with an appropriate payoff; explanations make one idea clear through ordered visible evidence; unboxing respects packaging, hands and reveal order; cinematic/storytelling work builds visual tension and emotional payoff; gaming uses legible spatial goals, action and consequence; social/transformation work uses a clear setup and meaningful reveal. Follow the user's specific goal over generic genre conventions.
Plan shot windows, camera blocking, physical actions, reaction pauses and transitions BEFORE writing dialogue. Use the fewest natural words needed and honor explicit narration, dialogue, language and silence preferences in the saved Creative Direction. If speech is prohibited, speech must be [] in every shot; voiceIntent must state that there is no speech. Narration is an off-screen voice, not words mouthed by the visible character. Spontaneous character dialogue should sound like that character responding to the moment, not like narration read to camera. Narration-only means no spontaneous character speech; character-dialogue-only means no narrator. Preserve exact supplied wording when required. If unspecified, choose an appropriate voice approach, including silence; never force a slogan. At natural pace allow at most 2.3 words/sec (slow 1.8, energetic 2.7), and at most 16 nonspace characters/sec within each speech window; aim below these ceilings with breathing room. Do not accelerate speech to fit. Prefer physical actions lasting at least 900ms. Leave time for comprehension, handling objects and emotional reactions. Exact timestamps are creative timing guidance, not guaranteed frame-perfect model execution; this does not relax the required structured timeline coverage.
Return contiguous whole-second shot boundaries starting at zero and ending at the exact selected total. Action/speech timestamps are absolute project milliseconds, contained within their shot. Sequential speech must not overlap. Shots are creative units in ONE continuous audiovisual generation, not individual provider requests. Use cut/none with zero duration, or supported fade_in/fade_out with positive duration shorter than the shot (at most 2000ms); do not use overlapping crossfades. For longer projects keep shots within 30 seconds and choose boundaries compatible with 4–30 second continuous segments; normal projects up to 30 seconds use one segment.
Use purpose for each shot's story function and intended emotional impact, description for visible staging, actions for timed movements/gestures/expressions, camera for angle/shot/framing/movement/zoom/focus, lighting for direction/intensity/colors/atmosphere, and productInteraction/productPosition for precise handling (use 'Not applicable' when absent). Use transitionNote and generationNotes for concise continuity: carry forward left/right hand grips, orientation, object positions, eyelines, screen direction, motion and ongoing actions; objects must not teleport or reset between cuts. Plan believable reach, contact, grip, weight and release before an object moves. Clothing and branding cannot change between angles; do not invent unsupported branding or important environmental details, doors, props or furniture absent from the approved references. Include exact speech, speaker, finite delivery settings and deliveryNote.
Audio cues describe native ambience/effects/music, with requirement none/optional/required and assetId null; no external audio files are supplied. Establish one coherent overall music/ambience direction consistent with the user's preferences. Repeat the same cue description and requirement exactly when it continues unchanged across shots; do not describe a fresh track at each cut. Use explicit, purposeful changes only when the approved story calls for them. Match each sound effect to a visible cause in the same shot rather than adding arbitrary whooshes, impacts or cinematic stingers. If music, effects or all audio are prohibited, the relevant cues must have requirement none and an empty description throughout. Silence is a complete creative choice. Avoid repeating global identity/style rules in every shot.
Keep visualStyle and tone exactly equal to the saved selected values, but EXPRESS that style and tone in every shot's character rendering, product materials/appearance, environment, camera language, lighting, textures, motion and delivery. Derive the treatment from the approved images without changing their identity or important details. Anime must read as a coherent anime work in every shot, not photorealistic footage with an Anime label; apply the same principle to Cartoon, Cinematic, Realistic and Original. Do not switch rendering systems at a cut. Frame for the selected aspect ratio. Use concept as a short readable story overview and voiceIntent for the chosen narration/dialogue approach. Return only the existing structured Storyboard contract; do not add analysis, review stages or technical execution instructions.`;

const contentApproaches = {
  advertisement: "Earn attention with a relevant hook, demonstrate only an evidenced benefit and resolve with an appropriate payoff; a slogan or call to action is optional and must fit the brief.",
  explanation: "Build understanding through a clear question or setup, ordered visible evidence and a concise resolution; do not turn the explanation into an advertisement.",
  unboxing: "Make the reveal and inspection legible, preserving packaging state, hand grips and item placement; never invent packaging or accessories absent from the references or brief.",
} as const;
const categoryApproaches = {
  transformation: "Establish the starting state and a readable change with a meaningful reveal, only to the extent requested by the user.",
  "product-ad": "Make the approved product and its interaction legible without inventing benefits, branding or functions.",
  cinematic: "Use motivated framing, light and restrained camera language to develop the requested scene; cinematic does not require constant motion or dramatic emotion.",
  storytelling: "Connect setup, consequence and resolution through motivated actions and earned emotional changes, if requested.",
  gaming: "Keep spatial goals, screen direction, action and consequence readable; show a motivated attempt and outcome without inventing game mechanics.",
  social: "Make the requested moment immediately understandable and give it a concise payoff without forcing viral tropes or a sales pitch.",
} as const;
const styleApproaches = {
  Original: "Carry the approved images' original rendering and motion language through every shot.",
  Cartoon: "Keep drawn shape language, illustrated materials, environment, lighting and stylized motion coherent with the approved cartoon references.",
  Cinematic: "Carry the approved filmic rendering, materials and lighting into motivated framing, focus and movement, within the user's requested restraint.",
  Anime: "Carry the approved anime character design, product rendering, linework/shading, backgrounds, lighting and animation/camera language across every shot; do not drift into live-action realism.",
  Realistic: "Keep anatomy, materials, environment, light, physical interactions and motion believable and consistent with the approved realistic references.",
} as const;

type Brief = Awaited<ReturnType<typeof projectBrief>>;
export function storyboardDirectorInput(brief: Brief, roles: readonly string[], approvedLocation: unknown, cast?: unknown) {
  saveProjectSchema.shape.settings.parse({ duration: brief.duration, aspectRatio: brief.aspect_ratio, visualStyle: brief.visual_style, tone: brief.tone });
  if (!roles.includes("character") || !roles.includes("location") || (!cast && new Set(roles).size !== roles.length) || roles.some(role => !["character", "product", "location"].includes(role)))
    throw new Error("V3_REFERENCES_REQUIRED");
  const context = generationContext(brief);
  return [
    ...(cast ? [`Exact approved cast, in image order: ${JSON.stringify(characterCastSchema.parse(cast))}. Return this exact cast. Every shot must include characterIds naming only characters visible in it; each dialogue line needs its characterId and narration needs null. Preserve separate faces, clothing, recognizable features and voices. Use the saved names in descriptions and stable IDs for bindings, even when names repeat. Never interchange speakers or references.`] : []),
    `Saved creative inputs: ${JSON.stringify({ title: brief.title, ...context, durationMs: Number(brief.duration) * 1000, aspectRatio: brief.aspect_ratio, resolution: projectVideoResolution(brief.video_resolution) })}`,
    "The following directing suggestions are subordinate to every explicit saved user preference; apply only the parts compatible with the brief.",
    `Creation Type (${context.creationType}): ${context.creationType === "ugc" ? "Use a credible subject-led or demonstration-led approach where requested; do not force on-camera speech or a sales persona." : "Let the requested visual scene and creative concept determine the performance and structure rather than defaulting to a presenter advertisement."}`,
    `Content Type (${context.type}): ${contentApproaches[context.type]}`,
    `Category (${context.category}): ${categoryApproaches[context.category]}`,
    `Visual Style across all shots (${context.visualStyle}): ${styleApproaches[context.visualStyle]}`,
    `Approved images follow in this exact order: ${roles.map((role, i) => `${i + 1}: ${role} Sheet`).join("; ")}. Inspect all of them before directing.`,
    roles.includes("product") ? "Use only the supplied Product's observable details and user-supported claims." : "No Product reference is supplied. Do not invent a Product or product interaction.",
    "Narration, dialogue, pacing and other creative preferences are in the saved instructions; preserve any explicit preferences. No separate narration setting is saved in this V3 Studio.",
    ...(approvedLocation ? [`Approved Location prompt and sheet binding: ${JSON.stringify(approvedLocation)}. Use this together with the actual Location image.`] : []),
  ].join("\n");
}

// One local publication gate, not an AI review or a corrective provider stage.
export function validateDirectedStoryboard(value: unknown, expected: Pick<DirectorStoryboard, "durationMs" | "aspectRatio" | "visualStyle" | "tone">) {
  const storyboard = directorStoryboardSchema.parse(value);
  if (storyboard.durationMs !== expected.durationMs || storyboard.aspectRatio !== expected.aspectRatio) throw new Error("V3_DIRECTOR_TIMING_INVALID");
  if (storyboard.visualStyle !== expected.visualStyle || storyboard.tone !== expected.tone) throw new Error("V3_DIRECTOR_STYLE_INVALID");
  let end = 0, speechEnd = 0;
  const ids = new Set<string>();
  for (const [index, shot] of storyboard.scenes.entries()) {
    if (shot.number !== index + 1 || ids.has(shot.id)) throw new Error("V3_DIRECTOR_SHOT_ORDER_INVALID");
    ids.add(shot.id);
    if (shot.startMs !== end || shot.endMs <= shot.startMs || shot.endMs > expected.durationMs || shot.endMs - shot.startMs > 30000 || shot.startMs % 1000 || shot.endMs % 1000)
      throw new Error("V3_DIRECTOR_TIMING_INVALID");
    end = shot.endMs;
    const t = shot.transition;
    if (t.type === "crossfade" || (["cut", "none"].includes(t.type) ? t.durationMs !== 0 : t.durationMs <= 0 || t.durationMs >= shot.endMs - shot.startMs))
      throw new Error("V3_DIRECTOR_TRANSITION_INVALID");
    const fits = (window: { startMs: number; endMs: number }) => window.startMs >= shot.startMs && window.endMs <= shot.endMs && window.endMs > window.startMs;
    if (shot.actions.some(action => !fits(action))) throw new Error("V3_DIRECTOR_ACTION_TIMING_INVALID");
    for (const line of [...shot.speech].sort((a, b) => a.startMs - b.startMs)) {
      if (!fits(line) || line.text.trim() && line.startMs < speechEnd) throw new Error("V3_DIRECTOR_SPEECH_TIMING_INVALID");
      if (!line.text.trim()) continue;
      speechEnd = line.endMs;
      const budget = speechIntervalBudget(line.startMs, line.endMs, line.delivery.pace);
      if (line.text.trim().split(/\s+/u).length > budget.maximumWords || [...line.text.replace(/\s/gu, "")].length > budget.maximumNonspaceCharacters)
        throw new Error("V3_DIRECTOR_SPEECH_TIMING_INVALID");
    }
    if (Object.values(shot.audio).some(cue => cue.assetId !== null)) throw new Error("V3_DIRECTOR_AUDIO_BINDING_INVALID");
  }
  if (end !== expected.durationMs) throw new Error("V3_DIRECTOR_TIMING_INVALID");
  return storyboard;
}
