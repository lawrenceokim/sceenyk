// Offline payload/component/source checks only. No providers, DB or workers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CharacterV5Review } from "../components/creation/character-v5-review";
import { v5ActionSchema, v5FrontFraming, v5Generation, v5HasFrontMask, v5IsFinalFront, v5ProviderPayload, type V5Review } from "../lib/character-v5/contract";
let checks = 0;
const check = (value: boolean, reason: string) => { assert(value, reason); checks++; };
const id = "11111111-1111-4111-8111-111111111111";
for (const soulId of [id, null]) {
  const generation = v5Generation("front_source", soulId);
  assert.deepEqual(v5ProviderPayload(generation, "https://private.example.invalid/accepted-face.png"), {
    prompt: "Regenerate this image but place the character on a plain neutral gray background with no shadow on the background or floor. Show only one character facing directly forward. Show the character from the shoulders down to the shoes, with the full outfit, full torso, full legs, and full footwear completely visible inside the frame. Do not show the head or face. Do not crop the shoulders. Do not crop the legs. Do not crop the shoes. Keep some empty gray space around the body so the shoulders and shoes are fully inside the image.",
    image_url: "https://private.example.invalid/accepted-face.png", batch_size: 1, resolution: "720p", aspect_ratio: "2:3", enhance_prompt: false,
  }); checks++;
  assert.deepEqual(generation.frontFraming, v5FrontFraming); checks++;
  check(generation.promptRevision === 4 && v5IsFinalFront(generation) && !v5HasFrontMask(generation), "final provider-prepared intent has no local mask");
}
const workflow: V5Review = { id, version: 9, slot: "front_source", state: "review", candidateId: id, accepted: ["face"], approvedAt: null,
  errorPhase: null, errorCode: null, cropTop: 2400, soulIdUsed: false, workPhase: "generating", heartbeatAt: null, leaseExpiresAt: null,
  reconciliationRequired: false, canRetrySaving: false, savingIncomplete: false, recoveryState: "stored", persistenceState: "ready", elapsedMs: 0,
  runningSince: null, frontReady: true };
const render = (value: V5Review) => renderToStaticMarkup(createElement(CharacterV5Review, { projectId: id, jobId: id, workflow: value,
  enabled: true, onSaved() {}, checkStatus() {} }));
const markup = render(workflow);
check(markup.includes('aspect-[2/3]'), 'Front review uses portrait container');
for (const slot of ['face', 'back'] as const) {
  check(v5Generation(slot, null).aspectRatio === '4:3', slot + ' keeps original ratio');
}
const diagnosticMarkup = render({ ...workflow, frontDiagnostics: { candidateId: id, providerRequestId: id,
  objectKey: 'private/candidate.png', hash: 'a'.repeat(64), inputSource: { id, etag: 'face-etag', sha256: 'b'.repeat(64), kind: 'accepted_face' },
  generation: v5Generation('front_source', null), candidateDimensions: { width: 720, height: 1080 }, framingContract: v5FrontFraming } });
for (const hint of ['Accepted Face', '720 × 1080', '2:3', 'Disabled', 'Batch size: 1', 'Shoulders and shoes expected in-frame by contract: Yes', 'Visual framing requires manual review', 'Do not crop the shoes.']) {
  check(diagnosticMarkup.includes(hint), 'Front diagnostic: ' + hint);
}
check(markup.includes("Accept Front source") && markup.includes("Reject and delete image"), "final source has manual decisions without Back acceptance");
for (const hint of ["shoulders are cropped", "legs are cropped", "shoes/footwear are cropped", "figure is tightly zoomed", "head/face is visible", "any shadow", "front-facing character", "full torso", "outfit/body consistency is wrong"]) {
  check(markup.includes(hint), "review guidance: " + hint);
}
for (const value of [workflow, { ...workflow, legacyFront: true }, { ...workflow, slot: "front" as const, state: "failed" as const }]) {
  const html = render(value);
  check(!html.includes('type="range"') && !html.includes("Mask from top") && !html.includes("Crop from top") && !html.includes("maskTop="), "no manual crop/mask tool in any Front state");
}
check(render({ ...workflow, state: "failed", slot: "back", frontReady: false }).includes("Generate Front source from Face"), "Face-only Front can be requested after a settled failed Back");
check(!v5ActionSchema.safeParse({ projectId: id, jobId: id, version: 1, action: "crop" }).success, "crop action is removed");
check(!v5ActionSchema.safeParse({ projectId: id, jobId: id, version: 1, action: "accept", cropTop: 2000 }).success, "crop parameters cannot be posted");
const worker = readFileSync("lib/character-v5/worker.ts", "utf8");
const branch = worker.slice(worker.indexOf('if (workflow.slot === "front_source")'), worker.indexOf('} else if (workflow.slot === "back")'));
check(branch.includes("const face = workflow.accepted.face") && branch.includes("await readV5Artifact(workflow, face, signal)") && branch.includes('kind: "accepted_face"') &&
  !branch.includes("originalInput") && !branch.includes("accepted.back") && !branch.includes("catch"), "Front input is verified accepted Face only");
console.info(JSON.stringify({ checks, providerCalls: 0, workerRuns: 0, databaseMutations: 0 }));
