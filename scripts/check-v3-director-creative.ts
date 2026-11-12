// Synthetic creative responses exercise instruction coverage and downstream
// fidelity, not the model's creative quality. Never instantiate a provider client.
import assert from "node:assert/strict";
import { storyboardDirectorInput, storyboardDirectorInstructions, STORYBOARD_PROMPT_COMPILER_VERSION, validateDirectedStoryboard } from "../lib/final-video-generation-v3/storyboard-director";
import { connectedStoryInstructions, planStoryClips } from "../lib/final-video-generation-v3/connected-story";
import { CAST_PROMPT_COMPILER_VERSION, validateCharacterCast } from "../lib/final-video-generation-v3/character-cast";
import { CLIP_PROMPT_COMPILER_VERSION, compileDirectorInstructions } from "../lib/final-video-generation-v3/compiler";
import { directorStoryboardSchema, planningInputSchema } from "../lib/final-video-generation-v3/contract";
import { OpenAICreativeDirectorProvider } from "../lib/final-video-generation-v3/adapters/openai";
import { generationContext } from "../lib/final-video-generation-v3/generation-context";
import { buildFrozenPackage, readFrozenPackage, restoreSegment } from "../lib/final-video-generation-v3/package";
import { v3Input, v3Provider, v3Context, v3Id, sealV3 } from "./final-video-v3-fixture";

let checks = 0, networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw Error("NETWORK_FORBIDDEN"); };
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (value: unknown) => { assert.ok(value); checks++; };
const fails = (fn: () => unknown, code: string) => { assert.throws(fn, new RegExp(code)); checks++; };
type Brief = Parameters<typeof storyboardDirectorInput>[0];
type Scenario = {
  name: string; prompt: string; tone: Brief["tone"]; style: Brief["visual_style"];
  type: Brief["ugc_type"]; category: Brief["category"]; duration: Brief["duration"];
  characters: number; product: boolean; location: string; concept: string; action: string;
  reaction: string; camera: string; ambience: string; music: string; effect: string;
  words: string[]; narration?: boolean; shotDurations: number[]; progression?: string[];
};
const scenarios: Scenario[] = [
  { name: "Energetic party", prompt: "Ari and Bea are friends dancing at a lively indoor party. Laughter, quick playful exchanges and upbeat music; no extra guests. Keep the energy alive across all clips.",
    tone: "Energetic", style: "Cartoon", type: "advertisement", category: "social", duration: "70", characters: 2, product: false,
    location: "Indoor dance floor with colored lights, no guests or furniture.", concept: "Friends trade dance moves, respond and invent a shared rhythm.",
    action: "Ari offers a dance move; Bea responds with a playful variation.", reaction: "Ari laughs at Bea's variation and matches its rhythm.", camera: "Follow their dance together in a lively lateral move.",
    ambience: "Laughter and footfalls from the approved friends on the indoor dance floor.", music: "One continuous upbeat dance rhythm, sustaining the party energy.", effect: "Shoes tap the floor with the visible dance steps.", words: ["Your turn!", "Try this!"], shotDurations: [10000, 20000, 30000, 10000],
    progression: ["Ari and Bea match their steps and build a shared rhythm.", "The friends carry their rhythm into an exuberant synchronized dance.", "They finish the dance together, laughing at their shared success."] },
  { name: "Quiet emotional scene", prompt: "Two siblings sit together in a quiet room after a difficult day. A subtle shared look, no speech, music or effects. Leave the feeling unresolved. Despite the Energetic selection, keep this very still.",
    tone: "Energetic", style: "Realistic", type: "advertisement", category: "storytelling", duration: "10", characters: 2, product: false,
    location: "Small room with one bench, soft window light and no other occupants.", concept: "The siblings share an unresolved moment of support.",
    action: "The siblings sit together and exchange a small acknowledging look.", reaction: "A restrained expression softens without a smile.", camera: "Locked two-shot, giving the shared look time to register.",
    ambience: "Subtle indoor room tone.", music: "", effect: "", words: [], shotDurations: [10000] },
  { name: "Product advertisement", prompt: "Ari demonstrates the approved ceramic cup naturally. One memorable tactile moment, no slogan, no narrator, no invented features. Only say: A good fit.",
    tone: "Professional", style: "Cinematic", type: "advertisement", category: "product-ad", duration: "30", characters: 1, product: true,
    location: "Approved studio with a broad wooden table and soft side lighting.", concept: "A comfortable grip and a clear view make the cup memorable.",
    action: "Ari grips the cup handle, lifts it and places it on the table.", reaction: "A small satisfied nod follows the comfortable grip.", camera: "Move from a readable hand-and-cup view to the cup resting on the table.",
    ambience: "Consistent soft studio room tone.", music: "", effect: "Ceramic contacts the wooden tabletop as the cup is placed down.", words: ["A good fit."], shotDurations: [6000, 10000, 14000],
    progression: ["Ari rotates the resting cup to show its approved surface and handle.", "The cup remains on the table as Ari's hand releases it, leaving a clear held product view."] },
  { name: "Comedy", prompt: "Two colleagues in an empty rehearsal room playfully copy each other's awkward bow. Natural banter and reaction timing; no canned punchline or soundtrack.",
    tone: "Funny", style: "Anime", type: "explanation", category: "storytelling", duration: "40", characters: 2, product: false,
    location: "Empty rehearsal room, level floor, neutral overhead light.", concept: "A copied bow becomes a shared joke through reciprocal reactions.",
    action: "Ari bows awkwardly; Bea copies the bow, then Ari notices.", reaction: "Bea holds a deadpan look before both break into laughter.", camera: "Keep both reactions legible, cutting only when a response changes the joke.",
    ambience: "Light laughter and breathing from the two colleagues in the rehearsal room.", music: "", effect: "", words: ["Like this?", "Exactly."], shotDurations: [10000, 20000, 10000],
    progression: ["Ari notices the imitation, pauses and tries an even more awkward bow.", "Bea almost copies the second bow, catches Ari's look and both laugh."] },
  { name: "Educational demonstration", prompt: "Explain how a cup handle is gripped safely using the approved cup. Calm, useful visible steps and off-screen narration only. No advertising, music or character speech.",
    tone: "Professional", style: "Original", type: "explanation", category: "product-ad", duration: "10", characters: 1, product: true,
    location: "Quiet teaching studio with a clear demonstration table.", concept: "A clear grip demonstration teaches one practical action.",
    action: "Ari shows fingers resting around the handle while supporting the cup.", reaction: "Attentive neutral focus on the demonstrated grip.", camera: "Stable close framing that keeps fingers and the handle visible.",
    ambience: "Soft teaching-studio room tone.", music: "", effect: "", words: ["Hold the handle gently."], narration: true, shotDurations: [4000, 6000],
    progression: ["Ari holds the demonstrated grip still long enough for viewers to inspect finger placement."] },
  { name: "Suspense", prompt: "Ari waits alone in the approved dim hallway. Build suspense with restrained breathing and delayed glances; no monster, extra person, door, music or spoken words. End unresolved.",
    tone: "Dramatic", style: "Realistic", type: "advertisement", category: "cinematic", duration: "120", characters: 1, product: false,
    location: "Bare dim hallway with no doors, windows, props or other occupants.", concept: "Waiting and selective glances sustain an unresolved uncertainty.",
    action: "Ari pauses, listens, then turns toward the empty length of the hallway.", reaction: "Tension in the eyes, followed by a controlled breath.", camera: "A measured approach holds back the far end of the empty hall.",
    ambience: "Low steady hallway room tone and Ari's restrained breathing.", music: "", effect: "", words: [], shotDurations: [15000, 15000, 30000, 30000, 30000],
    progression: ["Ari listens again, keeping the empty hallway in view.", "Ari takes a cautious step forward without finding a source for the uncertainty.", "Ari scans the same bare hallway, holding back a reaction.", "Ari stays alert in the unchanged empty hall; the uncertainty remains unresolved."] },
  { name: "Silent romance", prompt: "Two partners share a quiet affectionate glance in the approved garden. A single held moment. Entirely silent: no dialogue, narration, music, ambience or effects. No dramatic reveal.",
    tone: "Storytelling", style: "Anime", type: "unboxing", category: "transformation", duration: "5", characters: 2, product: false,
    location: "Still garden path with low plants and warm daylight; no animals or other people.", concept: "A held shared glance conveys affection without a reveal.",
    action: "The partners turn their attention toward one another and hold the glance.", reaction: "Subtle mutual warmth without exaggerated gestures.", camera: "One locked two-shot.", ambience: "", music: "", effect: "", words: [], shotDurations: [5000] },
];

// Explicit instruction coverage includes the opposing choices that prevent a
// universal formula. These assertions do not pretend to score generated stories.
for (const phrase of ["privately synthesize the creative intent", "main source of truth", "neither minimalism nor high energy is a universal default",
  "pace, action density, dialogue frequency, camera movement and sound together", "not a compulsory hook/setup/development/payoff template",
  "stage reciprocal interactions", "meaningful role", "Intentional silence remains valid", "For one character",
  "its label must not force contradictory emotions, tempo or delivery"]) ok(storyboardDirectorInstructions.includes(phrase));
for (const phrase of ["Do not stretch minor finger movements", "Avoid repetitive static coverage", "Never invent incompatible weather",
  "do not add unapproved people", "assetId null", "requirement none and an empty description", "Do not request intermediate approval"])
  ok(storyboardDirectorInstructions.includes(phrase));
ok(!storyboardDirectorInstructions.includes("choose sparingly"));
ok(!storyboardDirectorInstructions.includes("Use the fewest natural words"));
ok(connectedStoryInstructions.includes("Maintain emotional energy, pacing, character relationships"));
ok(connectedStoryInstructions.includes("ONE complete-story approval"));
ok(connectedStoryInstructions.includes("no shot, action or speech may straddle a clip boundary"));

const provider = new OpenAICreativeDirectorProvider({ model: "offline-fixture", maxOutputTokens: 28000 });
for (const scenario of scenarios) {
  const brief: Brief = { id: v3Id(2), title: scenario.name, prompt: scenario.prompt, duration: scenario.duration, aspect_ratio: scenario.characters > 1 ? "16:9" : "9:16",
    video_resolution: "480p", visual_style: scenario.style, tone: scenario.tone, ugc_type: scenario.type, category: scenario.category, creation_type: "ugc" };
  const durationMs = Number(scenario.duration) * 1000, long = durationMs > 30000;
  const boundaries = long ? planStoryClips(durationMs) : undefined;
  const input = v3Input(scenario.shotDurations);
  input.references[0].name = "Ari";
  const cast = Array.from({ length: scenario.characters }, (_, i) => ({ characterId: v3Id(100 + i), referenceId: i ? v3Id(110 + i) : input.references[0].id, name: i ? "Bea" : "Ari" }));
  if (scenario.characters > 1) {
    input.references[0].characterId = cast[0].characterId;
    input.references.splice(1, 0, { ...input.references[0], id: cast[1].referenceId, characterId: cast[1].characterId, name: cast[1].name, sha256: "e".repeat(64) });
  }
  if (!scenario.product) input.references = input.references.filter(r => r.role !== "product");
  const location = { instruction: { name: `${scenario.name} location`, prompt: scenario.location }, sheetHash: "f".repeat(64) };
  const roles = input.references.map(r => r.role);
  const instruction = storyboardDirectorInput(brief, roles, location, scenario.characters > 1 ? cast : undefined, boundaries);
  const urls = input.references.map(r => `https://example.invalid/${r.id}.png`);
  const request = provider.prepareStoryboard({ instruction, durationMs, referenceUrls: urls });
  equal(request.body.instructions, storyboardDirectorInstructions);
  equal(request.providerId, "openai"); equal(request.executable, false); equal(request.body.store, false);
  ok(instruction.includes(JSON.stringify(generationContext(brief)).slice(1, -1)));
  ok(instruction.includes(scenario.location)); ok(instruction.includes(scenario.prompt));
  for (const [i, role] of roles.entries()) ok(instruction.includes(`${i + 1}: ${role} Sheet`));
  if (!scenario.product) ok(instruction.includes("No Product reference is supplied"));
  if (scenario.characters > 1) ok(instruction.includes(JSON.stringify(cast)));
  if (scenario.type === "advertisement") ok(instruction.includes("No compulsory hook"));
  if (boundaries) { ok(instruction.includes(JSON.stringify(boundaries))); ok(instruction.includes(connectedStoryInstructions)); }
  equal((request.body.input as { content: unknown[] }[])[0].content.length, 1 + urls.length);

  const story = input.storyboardContent;
  Object.assign(story, { title: scenario.name, concept: scenario.concept, visualStyle: scenario.style, tone: scenario.tone, aspectRatio: brief.aspect_ratio,
    voiceIntent: scenario.words.length ? scenario.narration ? "Off-screen narration only; visible character listens without mouthing words." : "Natural reciprocal character speech, distinct voices, no narrator." : "No speech; intentional nonverbal performance.",
    continuity: { identity: cast.map(c => c.name).join(" and "), appearance: "Keep each approved face and proportions distinct.", outfit: "Each character keeps their approved outfit.", product: scenario.product ? "Approved ceramic cup, unchanged shape and markings." : "Not applicable", location: scenario.location } });
  const cue = (description: string) => ({ requirement: description ? "required" as const : "none" as const, description, assetId: null });
  for (const shot of story.scenes) {
    const movement = shot.number === 1 ? scenario.action : scenario.progression![shot.number - 2];
    const clip = boundaries?.find(b => shot.startMs >= b.startMs && shot.endMs <= b.endMs);
    Object.assign(shot, { purpose: movement, description: movement,
      productInteraction: scenario.product ? scenario.action : "Not applicable", productPosition: scenario.product ? "Same approved table and handle orientation." : "Not applicable",
      actions: [{ startMs: shot.startMs, endMs: shot.endMs, movement, gesture: "Respond naturally within the approved blocking.", expression: scenario.reaction }],
      camera: { ...shot.camera, movement: scenario.camera }, lighting: { ...shot.lighting, atmosphere: scenario.location },
      audio: { background: cue(scenario.ambience), music: cue(scenario.music), effects: cue(shot.number === 1 || !scenario.product ? scenario.effect : "") },
      speech: (shot.number === 1 ? scenario.words : []).map((text, i) => ({ text, startMs: shot.startMs + i * 2500, endMs: shot.startMs + i * 2500 + 2300,
        speaker: scenario.narration ? "narration" : "character", delivery: { pace: "natural", energy: "balanced", tone: "warm", emphasis: "light", style: "conversational" },
        deliveryNote: scenario.reaction, ...(scenario.characters > 1 ? { characterId: scenario.narration ? null : cast[i % cast.length].characterId } : {}) })),
      transitionNote: "Continue the same positions, eyelines, motion and emotional state.", generationNotes: scenario.reaction,
      ...(scenario.characters > 1 ? { characterIds: cast.map(c => c.characterId) } : {}),
      ...(clip ? { clipId: clip.id, localStartMs: shot.startMs - clip.startMs, localEndMs: shot.endMs - clip.startMs } : {}) });
  }
  const handoff = `${scenario.action} ${scenario.reaction} Same positions, grips, outfits, lighting and camera direction; no reset.`;
  const audioContinuity = `${scenario.ambience || "No ambience."} ${scenario.music || "No music."} Preserve distinct voices and the same emotional energy; no restart or pause.`;
  input.storyboardContent = directorStoryboardSchema.parse({ ...story, ...(scenario.characters > 1 ? { cast } : {}),
    ...(boundaries ? { version: "director-storyboard-connected-v1", clips: boundaries.map(b => ({ ...b, purpose: scenario.concept, continuityIn: handoff, continuityOut: handoff, audioContinuity })) } : {}) });
  const recipe = long ? CLIP_PROMPT_COMPILER_VERSION : scenario.characters > 1 ? CAST_PROMPT_COMPILER_VERSION : STORYBOARD_PROMPT_COMPILER_VERSION;
  input.direction = JSON.stringify({ ...generationContext(brief), promptCompiler: recipe });
  sealV3(input);
  equal(validateDirectedStoryboard(input.storyboardContent, input.storyboardContent), input.storyboardContent);
  equal(planningInputSchema.parse(input), input);
  validateCharacterCast(input.storyboardContent, input.references); checks++;
  const before = structuredClone(input);
  const frozen = buildFrozenPackage(input, v3Provider(), v3Context(input), { id: input.package.id, version: 1, sourceRevision: 1 });
  equal(readFrozenPackage(frozen), frozen);
  equal(frozen.source.references, input.references);
  equal(frozen.source.storyboardContent, input.storyboardContent);
  equal(frozen.segments.length, boundaries?.length ?? 1);
  equal(frozen.segments.reduce((total, s) => total + s.durationMs, 0), durationMs);
  for (const [i, segment] of frozen.segments.entries()) {
    const from = input.storyboardContent.scenes.findIndex(s => s.startMs === segment.startMs);
    const to = input.storyboardContent.scenes.findIndex(s => s.endMs === segment.endMs) + 1;
    const compiled = compileDirectorInstructions(input, from, to);
    equal(restoreSegment(frozen, segment.id).command.direction.prompt, compiled.prompt);
    equal(compiled.scenes, input.storyboardContent.scenes.slice(from, to));
    equal(compiled.dialogue.map(d => d.text), i === 0 ? scenario.words : []);
    for (const text of [scenario.prompt, scenario.concept, scenario.reaction, scenario.camera, scenario.location, scenario.style, scenario.tone]) ok(compiled.prompt.includes(text));
    for (const text of [scenario.ambience, scenario.music, i === 0 ? scenario.effect : ""].filter(Boolean)) ok(compiled.prompt.includes(text));
    for (const shot of compiled.scenes) {
      ok(compiled.prompt.includes(shot.description));
      ok(compiled.prompt.includes(`${(shot.startMs - segment.startMs) / 1000}–${(shot.endMs - segment.startMs) / 1000}s | Shot ${shot.number}`));
    }
    if (!scenario.words.length || i > 0) ok(compiled.prompt.includes("No spoken words."));
    if (scenario.narration) { ok(compiled.prompt.includes("Off-screen narration 0–2.3s")); ok(!compiled.prompt.includes("Character dialogue 0–")); }
    if (scenario.characters > 1) for (const c of cast) ok(compiled.prompt.includes(`ONLY ${JSON.stringify(c.name)} [${c.characterId}] speaks`) === (scenario.words.length > 0 && i === 0));
    if (boundaries) { ok(compiled.prompt.includes(`Clip ${i + 1} of ${boundaries.length}`)); ok(compiled.prompt.includes(audioContinuity)); ok(compiled.prompt.includes(handoff)); }
    if (scenario.name === "Silent romance") for (const role of ["Ambience", "Effects", "Music"]) ok(compiled.prompt.includes(`${role} (none): none`));
  }
  equal(input, before);
  if ("cast" in input.storyboardContent && scenario.words.length) {
    const invalid = structuredClone(input.storyboardContent); invalid.scenes[0].speech[0].characterId = v3Id(999);
    fails(() => validateCharacterCast(invalid, input.references), "V3_CHARACTER_SPEAKER_INVALID");
  }
  if ("clips" in input.storyboardContent) {
    const invalid = structuredClone(input.storyboardContent); invalid.clips[1].continuityIn = "A different state.";
    fails(() => validateDirectedStoryboard(invalid, invalid), "V3_CLIP_CONTINUITY_INVALID");
    const crossing = structuredClone(input.storyboardContent);
    crossing.scenes.find(s => s.endMs === crossing.clips[0].endMs)!.actions[0].endMs++;
    fails(() => validateDirectedStoryboard(crossing, crossing), "V3_DIRECTOR_ACTION_TIMING_INVALID");
  }
}
equal(networkCalls, 0);
console.log(`${checks} creative Director instruction/contract/compiler checks passed across ${scenarios.length} contrasting scenarios; zero network requests. Model creative quality remains unverified.`);
