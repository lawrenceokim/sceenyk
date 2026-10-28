import type { Storyboard } from "./schema";
import { defaultDelivery, type Transition } from "@/lib/execution-v1/contract";

export type RepairChange = { scene: number; field: string; before: string; after: string; reason: string };
// A proposal only: no I/O and no approval. Unknown transition intent remains
// unresolved until the owner chooses a structured value. Original notes survive.
export function proposeExecutionRepair(source: Storyboard) {
  const document = structuredClone(source), changes: RepairChange[] = [];
  document.schemaVersion = 2;
  for (const scene of document.scenes) {
    if (typeof scene.transition === "string") {
      const original = scene.transition, name = original.trim().replace(/\.$/, "").toLowerCase();
      let transition: Transition | null = null;
      if (/^(?:cut|none|hard cut|straight cut)(?: (?:to|into) (?:the )?next shot)?$/.test(name)) transition = { type: "cut", durationMs: 0 };
      else if (/^(?:dissolve|cross[ -]?fade)(?: (?:to|into) (?:the )?next shot)?$/.test(name)) transition = { type: "cut", durationMs: 0 };
      else if (/^fade(?:[ -]?out)?(?: cleanly| to black)?$/.test(name)) transition = { type: "fade_out", durationMs: 400 };
      else if (/^fade[ -]?in(?: cleanly| from black)?$/.test(name)) transition = { type: "fade_in", durationMs: 400 };
      scene.transitionNote = original;
      if (transition) { scene.transition = transition;
        changes.push({ scene: scene.number, field: "transition", before: original, after: JSON.stringify(transition),
          reason: transition.type === "cut" && /dissolve|cross/.test(name) ? "Proposed cut preserves the existing contiguous timeline; no overlap/retiming is invented. Review this creative change." : "Explicit finite transition proposal; review duration before saving." }); }
      else changes.push({ scene: scene.number, field: "transition", before: original, after: "Owner selection required", reason: "Unknown creative intent is not automatically reinterpreted." });
    }
    for (const role of ["background", "effects", "music"] as const) if (typeof scene.audio[role] === "string") {
      const original = scene.audio[role] as string;
      const none = /^(?:none|silent|silence|quiet|n\/a)\.?$/i.test(original.trim());
      scene.audio[role] = { requirement: none ? "none" : "optional", description: original, assetId: null };
      changes.push({ scene: scene.number, field: `audio.${role}`, before: original, after: none ? "none" : "optional descriptive cue; not generated/mixed", reason: "No owned audio binding exists. Owner review explicitly changes the execution requirement; original wording is retained." });
    }
    for (const [i, line] of scene.speech.entries()) if (typeof line.delivery === "string") {
      const original = line.delivery, delivery = defaultDelivery(document.voice.pace);
      if (/calm/i.test(original)) delivery.energy = "calm";
      if (/excited|lively|energetic/i.test(original)) delivery.energy = "lively";
      if (/warm|friendly/i.test(original)) delivery.tone = "warm";
      if (/confident/i.test(original)) delivery.tone = "confident";
      if (/conversational/i.test(original)) delivery.style = "conversational";
      if (/expressive|dramatic/i.test(original)) delivery.style = "expressive";
      line.delivery = delivery; line.deliveryNote = original;
      changes.push({ scene: scene.number, field: `speech[${i}].delivery`, before: original, after: JSON.stringify(delivery), reason: "Finite supported delivery proposal; original performance note is descriptive only. Spoken words/timing stay exact." });
    }
    scene.transitionNote ??= "";
    for (const line of scene.speech) line.deliveryNote ??= "";
  }
  return { document, changes };
}
