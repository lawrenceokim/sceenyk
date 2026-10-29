import "server-only";
import type { PlanningInput, CompiledDirection } from "./contract";

const seconds = (ms: number) => String(ms / 1000);
export function compileDirectorInstructions(input: PlanningInput, from: number, to: number): CompiledDirection {
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
    input.generateAudio ? "Generate audio together with the visuals. Preserve the exact approved dialogue and sound intentions; synchronize visible performance where supported."
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
