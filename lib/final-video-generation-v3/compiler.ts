import "server-only";
import type { PlanningInput, CompiledDirection } from "./contract";
import { STORYBOARD_DIRECTOR_VERSION, STORYBOARD_PROMPT_COMPILER_VERSION } from "./storyboard-director";
import { CAST_PROMPT_COMPILER_VERSION, castCompilerInstructions } from "./character-cast";

const seconds = (ms: number) => String(ms / 1000);
export function compileDirectorInstructions(input: PlanningInput, from: number, to: number): CompiledDirection {
  let recipe: unknown;
  try { recipe = JSON.parse(input.direction)?.promptCompiler; } catch { /* Historical free-text direction. */ }
  if (recipe === CAST_PROMPT_COMPILER_VERSION) {
    const compiled = compileRefinedStoryboard(input, from, to);
    return { ...compiled, prompt: `${castCompilerInstructions(input, from, to)}\n${compiled.prompt}` };
  }
  if (recipe === STORYBOARD_PROMPT_COMPILER_VERSION) return compileRefinedStoryboard(input, from, to);
  return compileApprovedStoryboardV1(input, from, to);
}

// This recipe is also frozen: packages bearing approved-storyboard-v1 must keep
// reconstructing their original prompts, even after creative refinements.
function compileApprovedStoryboardV1(input: PlanningInput, from: number, to: number): CompiledDirection {
  let modern = false;
  try { modern = JSON.parse(input.direction)?.promptCompiler === STORYBOARD_DIRECTOR_VERSION; } catch { /* Historical free-text direction. */ }
  const compiled = compileLegacyDirectorInstructions(input, from, to);
  if (!modern) return compiled;
  const creative = input.storyboardContent, start = compiled.startMs;
  const at = (ms: number) => seconds(ms - start);
  const lines = [
    `Create one continuous ${seconds(compiled.durationMs)}s audiovisual video with the approved shots below, in order. Frame for ${creative.aspectRatio}.`,
    "The approved Storyboard is the creative authority. Follow its staging, exact words, approximate timing and transitions without adding, rewriting or omitting beats. Reference sheets show views of one subject/environment; do not render their grid or labels.",
    `Story: ${creative.concept}`,
    `Visual style: ${creative.visualStyle}. Tone: ${creative.tone}. Voice: ${creative.voiceIntent}`,
    `Character identity: ${creative.continuity.identity}. Appearance: ${creative.continuity.appearance}. Outfit: ${creative.continuity.outfit}.`,
    `Product: ${creative.continuity.product}. Location: ${creative.continuity.location}.`,
    ...input.references.map((ref, i) => `Reference image ${i + 1}: ${ref.role} (${ref.name}). Preserve its visible details.`),
    "Maintain hand grips, object positions/orientation, eyelines, screen direction and ongoing motion through every shot change. Do not invent product features or reset physical state at cuts. All times below are seconds local to this video.",
    input.generateAudio ? "Generate native audio with the visuals. Speak only the exact scripted words within their windows. Synchronize visible Character speech with its own voice; narration is off-screen. Keep one consistent voice and natural non-speaking mouths. Generate the specified ambience, effects and music only as directed."
      : "Generate visuals without audio.",
  ];
  for (const [index, shot] of compiled.scenes.entries()) {
    lines.push(`${at(shot.startMs)}–${at(shot.endMs)}s: Shot ${shot.number}. Purpose: ${shot.purpose}. ${shot.description}`);
    for (const action of shot.actions) lines.push(`Action ${at(action.startMs)}–${at(action.endMs)}s: ${action.movement}. Gesture: ${action.gesture}. Expression: ${action.expression}.`);
    lines.push(`Product handling: ${shot.productInteraction}. Position: ${shot.productPosition}.`,
      `Camera: ${Object.entries(shot.camera).map(([key, value]) => `${key}: ${value}`).join("; ")}.`,
      `Lighting: ${Object.entries(shot.lighting).map(([key, value]) => `${key}: ${value}`).join("; ")}.`);
    for (const speech of shot.speech) if (speech.text.trim()) lines.push(
      `Speech ${at(speech.startMs)}–${at(speech.endMs)}s (${speech.speaker}): ${JSON.stringify(speech.text)}. Delivery: ${Object.entries(speech.delivery).map(([key, value]) => `${key}: ${value}`).join("; ")}.${speech.deliveryNote ? ` ${speech.deliveryNote}` : ""}`);
    for (const [role, cue] of Object.entries(shot.audio)) lines.push(
      `Audio ${role} (${cue.requirement}): ${cue.requirement === "none" ? "none" : cue.description || "none"}${cue.assetId ? `; use the approved ${role} audio reference` : ""}.`);
    if (index === compiled.scenes.length - 1 && to < creative.scenes.length)
      lines.push(`Stop at this approved shot boundary. The next shot is outside this segment. Boundary transition for later joining: ${shot.transition.type}, ${shot.transition.durationMs}ms. ${shot.transitionNote}`);
    else lines.push(`Outgoing transition: ${shot.transition.type}, ${shot.transition.durationMs}ms. ${shot.transitionNote}`);
    if (shot.generationNotes) lines.push(`Continuity / direction: ${shot.generationNotes}`);
  }
  return { ...compiled, prompt: lines.join("\n") };
}

function compileRefinedStoryboard(input: PlanningInput, from: number, to: number): CompiledDirection {
  const compiled = compileLegacyDirectorInstructions(input, from, to);
  const creative = input.storyboardContent, shots = compiled.scenes;
  const at = (ms: number) => seconds(ms - compiled.startMs);
  // Read only the known saved brief fields; never serialize provenance or infer
  // user prohibitions by scanning natural-language keywords.
  const source = JSON.parse(input.direction) as { instructions?: unknown; creationType?: unknown; type?: unknown; category?: unknown };
  const intent = typeof source.instructions === "string" ? source.instructions : "";
  const formats = [source.creationType, source.type, source.category].filter((value): value is string => typeof value === "string" && !!value);
  const lines = [
    `One continuous ${seconds(compiled.durationMs)}s audiovisual video, ${creative.aspectRatio}. Follow the approved shots in order.`,
    "The approved Storyboard defines the creative decisions. Do not add, reinterpret or replace actions, emotions, dialogue, camera moves or sound. Timing windows guide pacing; frame-perfect execution is not guaranteed.",
    ...(intent ? [`User creative intent and preferences (verbatim context; the approved shots below supply the final staging and exact spoken words): ${intent}`] : []),
    ...(formats.length ? [`Creative format: ${formats.join(" / ")}.`] : []),
    `Story: ${creative.concept}`,
    `Visual style throughout: ${creative.visualStyle}. Tone: ${creative.tone}. Voice direction: ${creative.voiceIntent}`,
    `Character: ${creative.continuity.identity}. Appearance: ${creative.continuity.appearance}. Clothing: ${creative.continuity.outfit}.`,
    `Product: ${creative.continuity.product}. Environment: ${creative.continuity.location}.`,
    ...input.references.map((ref, index) => `Reference ${index + 1} (${ref.kind}, ${ref.role}): ${ref.name}.`),
    "Use the approved references for identity and important visible details, never their sheet grids or labels. Carry the selected rendering style through the character, product, environment, lighting, camera language and motion. Carry clothing, grips, product orientation, object placement and ongoing movements across cuts unless the approved shots explicitly change them; do not invent features, branding or environmental details.",
    input.generateAudio ? "Native audio only as scripted below. No unscripted speech or added soundtrack/effects. Distinguish off-screen narration from visible Character dialogue; synchronize only the visible speaker's scripted words and keep each speaker's voice consistent. Carry continuing music/ambience across cuts with only the approved changes."
      : "No audio.",
    "All shot and action windows below are approximate seconds local to this continuous video.",
  ];
  const soundRoles = ["background", "effects", "music"] as const;
  type Cue = typeof shots[number]["audio"][typeof soundRoles[number]];
  const sameCue = (a: Cue, b: Cue) => a.requirement === b.requirement && a.description === b.description && a.assetId === b.assetId;
  const sharedSound = new Set(soundRoles.filter(role =>
    // Action-linked effects keep their shot scope even if the wording repeats.
    (role !== "effects" || shots[0].audio.effects.requirement === "none" && !shots[0].audio.effects.description && shots[0].audio.effects.assetId === null) &&
    shots.every(shot => sameCue(shot.audio[role], shots[0].audio[role]))));
  const cueText = (role: typeof soundRoles[number], cue: Cue) => {
    const refIndex = input.references.findIndex(ref => ref.id === cue.assetId);
    return `${role === "background" ? "Ambience" : role === "effects" ? "Effects" : "Music"} (${cue.requirement}): ${cue.description || "none"}${refIndex >= 0 ? `; reference ${refIndex + 1}: ${input.references[refIndex].name}` : ""}.`;
  };
  // Hoist only byte-identical approved cues. Different descriptions, requirement
  // levels or asset bindings remain shot-specific; no semantic merging.
  for (const role of sharedSound) lines.push(`Throughout this video — ${cueText(role, shots[0].audio[role])}`);
  if (!shots.some(shot => shot.speech.some(line => line.text.trim()))) lines.push("No spoken words.");
  for (const [index, shot] of shots.entries()) {
    lines.push(`${at(shot.startMs)}–${at(shot.endMs)}s | Shot ${shot.number} | Purpose: ${shot.purpose}`);
    if (shot.description !== shot.purpose) lines.push(`Scene: ${shot.description}`);
    for (const action of shot.actions) lines.push(`Action ${at(action.startMs)}–${at(action.endMs)}s: ${action.movement}. Gesture: ${action.gesture}. Expression: ${action.expression}.`);
    lines.push(`Camera: ${Object.entries(shot.camera).map(([key, value]) => `${key}: ${value}`).join("; ")}.`,
      `Product interaction: ${shot.productInteraction}. Position: ${shot.productPosition}.`,
      `Lighting: ${Object.entries(shot.lighting).map(([key, value]) => `${key}: ${value}`).join("; ")}.`);
    for (const speech of shot.speech) if (speech.text.trim()) lines.push(
      `${speech.speaker === "narration" ? "Off-screen narration" : "Character dialogue"} ${at(speech.startMs)}–${at(speech.endMs)}s: ${JSON.stringify(speech.text)}. Delivery: ${Object.entries(speech.delivery).map(([key, value]) => `${key}: ${value}`).join("; ")}.${speech.deliveryNote ? ` ${speech.deliveryNote}` : ""}`);
    for (const role of soundRoles) if (!sharedSound.has(role)) lines.push(cueText(role, shot.audio[role]));
    const transition = `${shot.transition.type.replaceAll("_", " ")}${shot.transition.durationMs ? ` over ${seconds(shot.transition.durationMs)}s` : ""}`;
    lines.push(index === shots.length - 1 && to < creative.scenes.length
      ? `Stop at this approved boundary; the next shot is outside this video. Transition for later joining: ${transition}. ${shot.transitionNote}`
      : `Outgoing transition: ${transition}. ${shot.transitionNote}`);
    if (shot.generationNotes) lines.push(`Continuity / direction: ${shot.generationNotes}`);
  }
  return { ...compiled, prompt: lines.join("\n") };
}

// Frozen historical packages reconstruct this exact recipe during integrity checks.
function compileLegacyDirectorInstructions(input: PlanningInput, from: number, to: number): CompiledDirection {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > input.storyboardContent.scenes.length)
    throw new Error("DIRECTOR_SCENE_RANGE_INVALID");
  const scenes = structuredClone(input.storyboardContent.scenes.slice(from, to));
  const startMs = scenes[0].startMs, endMs = scenes[scenes.length - 1].endMs, creative = input.storyboardContent;
  const lines = ["Create one continuous cinematic audiovisual segment containing the following approved shots in order.",
    `Creative direction: ${input.direction}`, `Concept: ${creative.concept}`, `Visual style: ${creative.visualStyle}. Tone: ${creative.tone}.`,
    `Voice intention: ${creative.voiceIntent}`, `Preserve character identity: ${creative.continuity.identity}`,
    `Preserve appearance: ${creative.continuity.appearance}`, `Preserve clothing: ${creative.continuity.outfit}`,
    `Preserve product identity: ${creative.continuity.product}`, `Preserve location: ${creative.continuity.location}`,
    `This segment covers project ${seconds(startMs)}–${seconds(endMs)}s. All shot ranges below use segment-local seconds.`,
    ...input.references.map(ref => `Reference ${ref.role}: ${ref.name} [asset ${ref.id}, version ${ref.version}, hash ${ref.sha256}].`),
    input.generateAudio ? "Generate audio together with the visuals. The exact approved dialogue and timing below are creative targets, not guaranteed output. Synchronize visible speaking mouths with their own audible words; keep non-speaking mouths natural. Do not animate a visible mouth for off-screen narration. Preserve the approved sound intentions."
      : "Generate visual output without native audio; no required dialogue or sound may be omitted."];
  const dialogue: CompiledDirection["dialogue"] = [];
  for (const [index, scene] of scenes.entries()) {
    if (index) {
      const previous = scenes[index - 1];
      lines.push(`At ${seconds(scene.startMs - startMs)}s: ${previous.transition.type === "cut" ? "Cut" : previous.transition.type} to Scene ${scene.number} (approved transition ${previous.transition.durationMs}ms).`);
    }
    lines.push(`${seconds(scene.startMs - startMs)}–${seconds(scene.endMs - startMs)}s: Scene ${scene.number}. ${scene.purpose}. ${scene.description}`);
    for (const action of scene.actions) lines.push(`Action ${seconds(action.startMs - startMs)}–${seconds(action.endMs - startMs)}s: ${action.movement}. Gesture: ${action.gesture}. Facial reaction: ${action.expression}.`);
    lines.push(`Product interaction: ${scene.productInteraction}. Product position: ${scene.productPosition}.`,
      `Camera: ${Object.entries(scene.camera).map(([key, value]) => `${key}: ${value}`).join("; ")}.`,
      `Lighting: ${Object.entries(scene.lighting).map(([key, value]) => `${key}: ${value}`).join("; ")}.`);
    for (const [i, speech] of scene.speech.entries()) {
      dialogue.push({ sceneNumber: scene.number, index: i, text: speech.text, startMs: speech.startMs, endMs: speech.endMs,
        localStartMs: speech.startMs - startMs, localEndMs: speech.endMs - startMs });
      lines.push(`Dialogue ${seconds(speech.startMs - startMs)}–${seconds(speech.endMs - startMs)}s, ${speech.speaker}, exact words: ${JSON.stringify(speech.text)}. Delivery: ${JSON.stringify(speech.delivery)}. ${speech.deliveryNote}`);
    }
    for (const [role, cue] of Object.entries(scene.audio)) lines.push(`Sound intention (${role}, ${cue.requirement}): ${cue.description}${cue.assetId ? `; bound asset ${cue.assetId}` : ""}.`);
    if (index === scenes.length - 1 && to < input.storyboardContent.scenes.length)
      lines.push(`Boundary at ${seconds(scene.endMs - startMs)}s: end this segment at the approved shot boundary. Scene ${input.storyboardContent.scenes[to].number} belongs to the next segment; do not render it here. The approved boundary transition is retained for joining after segment review.`);
    else lines.push(`Approved outgoing transition: ${scene.transition.type}, ${scene.transition.durationMs}ms. ${scene.transitionNote}`);
    lines.push(`Additional direction: ${scene.generationNotes}`);
  }
  return { version: "director-compiler-v3", startMs, endMs, durationMs: endMs - startMs, sceneNumbers: scenes.map(scene => scene.number),
    creative: { direction: input.direction, concept: creative.concept, visualStyle: creative.visualStyle, tone: creative.tone,
      voiceIntent: creative.voiceIntent, continuity: structuredClone(creative.continuity) },
    shotChanges: scenes.map((scene, i) => ({ fromSceneNumber: scene.number, toSceneNumber: input.storyboardContent.scenes[from + i + 1]?.number ?? null,
      atMs: scene.endMs, localAtMs: scene.endMs - startMs, transition: structuredClone(scene.transition),
      owner: i === scenes.length - 1 && to < input.storyboardContent.scenes.length ? "join" : "generation" })),
    scenes, dialogue, shots: scenes.map(scene => ({ sceneNumber: scene.number, startMs: scene.startMs, endMs: scene.endMs,
      localStartMs: scene.startMs - startMs, localEndMs: scene.endMs - startMs })), prompt: lines.join("\n") };
}
