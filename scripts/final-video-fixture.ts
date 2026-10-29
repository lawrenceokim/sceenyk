// Synthetic offline fixture; contains no real customer or provider data.
import { prepareStoryboard } from "../lib/storyboard/contract";
import { proposeExecutionRepair } from "../lib/storyboard/execution-repair";
import type { PackageInput } from "../lib/video-generation-package/contract";
export const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// Synthetic account contract for offline cost checks, never loaded into env files.
export const fixturePricingRaw = JSON.stringify({ elevenLabsMicrousdPerCredit: 80, voiceDesignPreviewText: "a".repeat(100) });
const at = "2026-10-27T12:00:00+00:00";
const asset = (n: number) => ({ id: id(n), storageKey: `ugc/${id(1)}/${id(2)}/${id(3)}/synthetic/${n}.png`, etag: `etag-${n}`,
  sha256: String(n).repeat(64), sizeBytes: 100, width: 512, height: 512, mimeType: "image/png" as const });
const text = "Preserve approved references.";
export const input: PackageInput = { ownerId: id(1), projectId: id(2), jobId: id(3),
  approvals: { character: { id: id(8), version: 3, approvedAt: at }, product: { id: id(9), version: 2, approvedAt: at },
    location: { id: id(10), version: 5, revision: 1, candidateId: id(11), approvedAt: at } },
  source: { scene: { projectTitle: "Demo", creationType: "ugc", sceneDescription: "Show the mug", ugcType: "advertisement", narration: { mode: "prompt" },
    character: { name: "Maya" }, product: { name: "Mug" }, settings: { duration: "10", aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional" } },
    dependencies: { character: 3, product: 2, locationId: id(10), locationVersion: 5, locationCandidateId: id(11) },
    character: asset(4), product: asset(5), location: asset(6), locationPlan: { name: "Kitchen" }, wardrobe: null },
  storyboard: { id: id(7), version: 4, revision: 1, approvedAt: at,
    document: { schemaVersion: 1, title: "Morning mug", concept: "Maya presents the mug", durationMs: 10_000, aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional",
      voice: { characterAssetId: id(4), description: "Warm conversational voice", pace: "natural" },
      continuity: { identity: text, appearance: text, outfit: text, product: text, location: text },
      scenes: [0, 1].map(index => ({ number: index + 1, startMs: index * 5000, endMs: (index + 1) * 5000,
        purpose: "Show the mug", description: text, characterAssetId: id(4), productAssetId: id(5), locationAssetId: id(6),
        actions: [{ startMs: index * 5000, endMs: index * 5000 + 1000, movement: "Lift mug", gesture: "Hold handle", expression: "Relaxed smile" }],
        productInteraction: "Hold handle", productPosition: "Chest height", camera: { angle: "Eye level", shot: "Medium", framing: "Portrait", movement: "Static", zoom: "None", focus: "Mug" },
        lighting: { direction: "Left", intensity: "Soft", colors: "Neutral", atmosphere: "Calm" },
        speech: index ? [{ startMs: 7000, endMs: 9500, speaker: "character" as const, characterAssetId: id(4), text: "My morning mug.", delivery: "Natural" }] : [],
        audio: { background: "None", effects: "None", music: "None" }, transition: "Cut", generationNotes: "",
        generationPrompt: `Approved asset:${id(4)} asset:${id(5)} asset:${id(6)}` })) } } };

// Separate v2 fixture; the original schema-1 snapshot stays unchanged.
export const canonicalInput: PackageInput = structuredClone(input);
canonicalInput.storyboard.document = prepareStoryboard(proposeExecutionRepair(input.storyboard.document).document, canonicalInput.source);
