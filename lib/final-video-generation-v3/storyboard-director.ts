import "server-only";
import { projectVideoResolution } from "@/lib/projects/video-resolution";
import { directorStoryboardSchema, characterCastSchema, type DirectorStoryboard } from "./contract";
import { generationContext } from "./generation-context";
import type { projectBrief } from "./creative-inputs";
import { saveStudioProjectSchema as saveProjectSchema } from "@/lib/projects/validation";
import { speechIntervalBudget } from "@/lib/storyboard/speech-budget";
import { planStoryClips, clipBoundariesSchema, connectedStoryInstructions, validateConnectedStory } from "./connected-story";

export const STORYBOARD_DIRECTOR_VERSION = "approved-storyboard-v1";
// Keep the task/publication version stable. Frozen prompt recipes are independent.
export const STORYBOARD_PROMPT_COMPILER_VERSION = "approved-storyboard-v2";

export const storyboardDirectorInstructions = `You are Sceenyk's professional film director. Analyze the user's goal, every saved creative setting and every attached approved reference image before composing the complete Storyboard in this single response. Do not request intermediate approval or another reviewer.
USER PREFERENCES GOVERN EVERY CREATIVE CHOICE. The user's explicit creative direction is the main source of truth for the intended experience; use the saved tone, style, content Type and category to interpret it, never to replace it with a generic formula. Keep the saved style/tone labels exact while resolving conflicting creative suggestions in favor of the explicit request. Preserve approved reference identities and physical facts. Never add speech, a soundtrack, sound effects, stylization, emotions, camera moves or character actions that contradict explicit requests or prohibitions. A genre convention is a suggestion, not permission to override the brief. When a preference is unspecified, choose what serves this particular experience, including lively activity or deliberate stillness; neither minimalism nor high energy is a universal default.
Before composing shots, privately synthesize the creative intent: what the audience should understand, feel or anticipate; the requested emotional energy and atmosphere; selected tone, visual style, content type and exact duration; each approved character's identity, stated relationships and role; approved product/location opportunities and constraints; and requested actions, dialogue, narration, music and sound. Distinguish user-stated facts from creative choices. Do not invent an established relationship, backstory or personality that contradicts the brief. Use this understanding to choose story progression, pace, action density, dialogue frequency, camera movement and sound together. Express these choices through concept, voiceIntent, continuity and the existing shot fields, not extra analysis fields or an additional planning/approval stage.
Inspect the actual Character Sheet for identity, face, body, outfit and proportions; the Product Sheet, when supplied, for exact shape, scale, materials, markings and visible details; and the Location Sheet for layout, surfaces, lighting and usable space. Multi-view sheets describe ONE subject or environment, not a collage to render. Preserve these identities throughout; never infer important product features, unsupported claims or unseen functions from a name. Do not invent additional people or an absent Product.
Design progression appropriate to this request and duration, not a compulsory hook/setup/development/payoff template. A beginning, development and ending can help when the story needs them; an observational moment, continuous demonstration, unresolved suspense or quiet held performance can use a different shape. Start with a specific situation, image, interaction or explanation that invites the intended audience experience. Let each beat cause, clarify or reveal the next. Earn emotional changes through what happens. Choose a memorable moment or ending only where it serves the request; never force a slogan, call to action, twist or resolution.
Choose the ideal number and durations of shots yourself: there is no fixed count or one-shot-per-stage template, no requirement for equal or unequal lengths. A single purposeful shot is valid. Match pace to the requested experience throughout: energetic scenes need timely actions and reactions, quiet scenes need space to register, and tension may depend on selective withholding. Vary tempo only for a motivated story reason. Do not stretch minor finger movements or repeated product lifts into the main event, or insert dead air merely to fill duration. Give every shot a clear purpose and a readable action or performance; let framing, angles, shot changes, focus and movement support it. A locked camera can be expressive; motivated movement can carry excitement or discovery. Avoid repetitive static coverage when the moment calls for movement, without forcing camera motion into intentional stillness. Balance precise physical instructions with natural performance rather than choreographing every tiny gesture.
Adapt freely to comedy, advertisements, action, romance, education, drama, horror, emotional storytelling and other requests, including mixtures. Interpret mood through concrete choices rather than a genre checklist. For example, a party may need lively exchanges and laughter, drama may need expressive conversation and meaningful silence, horror may need unsettling sound and delayed revelation, comedy may need reaction timing and chemistry, and education may need legible demonstrations. These are possibilities, not mandatory ingredients. Unboxing should preserve packaging and reveal order when relevant; gaming should preserve readable spatial goals and consequences. Advertisements should integrate the approved product through relevant interaction or a memorable product moment, without invented claims or automatic promotional dialogue. Never make every request energetic, dialogue-heavy, humorous or cinematic.
For multiple characters, give each a meaningful role in the requested situation and stage reciprocal interactions: one character's words or actions should motivate another's response, gesture, expression or next action. Preserve stated relationships and distinct identities, appearances and voices. Make comedy, affection, disagreement or collaboration emerge from the actual request, not an invented relationship. Avoid identical repeated smiles, disconnected monologues, static poses and unnecessary silence. Allow listening and nonverbal reactions without forcing every character to speak or appear in every shot. For one character, use appropriate expression, performance and purposeful action to engage the intended audience; direct address is optional. Intentional silence remains valid for either cast size.
Plan shot windows, camera blocking, physical actions, reaction pauses and transitions BEFORE writing dialogue. Give conversations or explanations enough useful words and listening/reaction time for their purpose, while avoiding filler and preserving explicit narration, dialogue, language and silence preferences in the saved Creative Direction. If speech is prohibited, speech must be [] in every shot; voiceIntent must state that there is no speech. Narration is an off-screen voice, not words mouthed by the visible character. Character dialogue should sound like that character responding naturally to the moment and other characters, with tone-appropriate wording and delivery. Narration-only means no spontaneous character speech; character-dialogue-only means no narrator. Preserve exact supplied wording when required. If unspecified, choose an appropriate voice approach, including silence; never force a slogan. At natural pace allow at most 2.3 words/sec (slow 1.8, energetic 2.7), and at most 16 nonspace characters/sec within each speech window; aim below these ceilings with breathing room. Do not accelerate speech to fit. Prefer physical actions lasting at least 900ms. Leave time for comprehension, handling objects and emotional reactions. Exact timestamps are creative timing guidance, not guaranteed frame-perfect model execution; this does not relax the required structured timeline coverage.
Return contiguous whole-second shot boundaries starting at zero and ending at the exact selected total. Action/speech timestamps are absolute project milliseconds, contained within their shot. Sequential speech must not overlap. Shots are creative units in ONE continuous audiovisual generation, not individual provider requests. Use cut/none with zero duration, or supported fade_in/fade_out with positive duration shorter than the shot (at most 2000ms); do not use overlapping crossfades. For longer projects keep shots within 30 seconds and choose boundaries compatible with 4–30 second continuous segments; normal projects up to 30 seconds use one segment.
Use purpose for each shot's story function and intended emotional impact, description for visible staging, actions for timed movements/gestures/expressions, camera for angle/shot/framing/movement/zoom/focus, lighting for direction/intensity/colors/atmosphere, and productInteraction/productPosition for precise handling (use 'Not applicable' when absent). Use transitionNote and generationNotes for concise continuity: carry forward left/right hand grips, orientation, object positions, eyelines, screen direction, motion and ongoing actions; objects must not teleport or reset between cuts. Plan believable reach, contact, grip, weight and release before an object moves. Clothing and branding cannot change between angles; do not invent unsupported branding or important environmental details, doors, props or furniture absent from the approved references. Include exact speech, speaker, finite delivery settings and deliveryNote.
Design environmental atmosphere from the approved location and requested mood: relevant wind, rain, traffic, birds, indoor activity or crowds only when supported by the brief and references. Never invent incompatible weather, people, objects or off-screen events to supply noise. An empty Location Sheet is a spatial reference, not an instruction that the approved cast must perform in an unnaturally silent world. Use plausible background activity within the approved setting; do not add unapproved people. A lively party should feel socially alive through the approved cast's movement, laughter and exchanges and permitted ambience/music; a quiet emotional scene may need subtle room tone and deliberate silence. Neither example overrides the user's audio preferences. Character voices, breaths and reactions belong in voiceIntent, speech/delivery and actions; do not hide unscripted dialogue in audio cues. Product sounds should follow supported handling and contact.
Audio cues describe native ambience/effects/music, with requirement none/optional/required and assetId null; no external audio files are supplied. Establish one coherent overall music/ambience direction with a specific emotional purpose, or intentional absence, consistent with the user's preferences. Repeat the same cue description and requirement exactly when it continues unchanged across shots; do not describe a fresh track at each cut. Use explicit, purposeful changes only when the approved story calls for them. Match each sound effect to a visible cause in the same shot rather than adding arbitrary whooshes, impacts or cinematic stingers. If music, effects or all audio are prohibited, the relevant cues must have requirement none and an empty description throughout. Silence is a complete creative choice. Avoid repeating global identity/style rules in every shot.
Keep visualStyle and tone exactly equal to the saved selected values. Express the selected visual treatment consistently in character rendering, product materials/appearance, environment, camera language, lighting, textures and motion. Interpret tone through the user's explicit intended experience; its label must not force contradictory emotions, tempo or delivery. Derive the treatment from the approved images without changing their identity or important details. Anime must read as a coherent anime work in every shot, not photorealistic footage with an Anime label; apply the same principle to Cartoon, Cinematic, Realistic and Original. Do not switch rendering systems at a cut. Frame for the selected aspect ratio. Use concept as a short readable story overview and voiceIntent for the chosen narration/dialogue approach. Return only the existing structured Storyboard contract; do not add analysis, review stages or technical execution instructions.`;

const contentApproaches = {
  advertisement: "Find a relevant product interaction or memorable product moment suited to the requested experience; use only evidenced benefits. No compulsory hook, sales speech, slogan, call to action or payoff structure.",
  explanation: "Make the requested idea understandable through useful explanations or demonstrations at a pace the audience can follow; adapt their order and speech to the brief rather than requiring a question/setup/resolution formula.",
  unboxing: "Make the reveal and inspection legible, preserving packaging state, hand grips and item placement; never invent packaging or accessories absent from the references or brief.",
} as const;
const categoryApproaches = {
  transformation: "Establish the starting state and a readable change with a meaningful reveal, only to the extent requested by the user.",
  "product-ad": "Make the approved product and its interaction legible without inventing benefits, branding or functions.",
  cinematic: "Use framing, light and camera language suited to the requested mood and energy; cinematic does not require constant motion or dramatic emotion.",
  storytelling: "Let the user's intended experience determine the story shape, relationships, actions and emotional progression; do not require a setup, twist or resolution.",
  gaming: "Keep spatial goals, screen direction, action and consequence readable; show a motivated attempt and outcome without inventing game mechanics.",
  social: "Make the requested moment immediately understandable and engaging in the way the user intends, without requiring a payoff, viral trope or sales pitch.",
} as const;
const styleApproaches = {
  Original: "Carry the approved images' original rendering and motion language through every shot.",
  Cartoon: "Keep drawn shape language, illustrated materials, environment, lighting and stylized motion coherent with the approved cartoon references.",
  Cinematic: "Carry the approved filmic rendering, materials and lighting into motivated framing, focus and movement, within the user's requested restraint.",
  Anime: "Carry the approved anime character design, product rendering, linework/shading, backgrounds, lighting and animation/camera language across every shot; do not drift into live-action realism.",
  Realistic: "Keep anatomy, materials, environment, light, physical interactions and motion believable and consistent with the approved realistic references.",
} as const;

type Brief = Awaited<ReturnType<typeof projectBrief>>;
export function storyboardDirectorInput(brief: Brief, roles: readonly string[], approvedLocation: unknown, cast?: unknown, clipBoundaries?: unknown) {
  saveProjectSchema.shape.settings.parse({ duration: brief.duration, aspectRatio: brief.aspect_ratio, visualStyle: brief.visual_style, tone: brief.tone });
  if (!roles.includes("character") || !roles.includes("location") || (!cast && new Set(roles).size !== roles.length) || roles.some(role => !["character", "product", "location"].includes(role)))
    throw new Error("V3_REFERENCES_REQUIRED");
  const context = generationContext(brief);
  const durationMs = Number(brief.duration) * 1000;
  if (durationMs > 30_000 && clipBoundaries === undefined) throw new Error("V3_CONNECTED_STORY_REQUIRED");
  const boundaries = clipBoundaries === undefined ? null : clipBoundariesSchema.parse(clipBoundaries);
  if (boundaries && (durationMs <= 30_000 || JSON.stringify(boundaries) !== JSON.stringify(planStoryClips(durationMs)))) throw new Error("V3_CLIP_PLAN_CHANGED");
  return [
    ...(boundaries ? [connectedStoryInstructions, `Exact ordered clip boundaries: ${JSON.stringify(boundaries)}`] : []),
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
  validateConnectedStory(storyboard);
  return storyboard;
}
