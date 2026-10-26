// Offline payload and actual component markup checks. No external requests/jobs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BackReviewDiagnostics, CharacterV5Review, PrivateV5Image } from "../components/creation/character-v5-review";
import { v5Generation, v5ProviderPayload, type V5Review } from "../lib/character-v5/contract";

let checks = 0;
const check = (value: boolean, reason: string) => { assert(value, reason); checks++; };
const id = "11111111-1111-4111-8111-111111111111";
const candidateId = "22222222-2222-4222-8222-222222222222";
for (const soulId of [id, null]) {
  const generation = v5Generation("back", soulId);
  const payload = v5ProviderPayload(generation, "https://private.example.invalid/original");
  assert.deepEqual(payload, {
    prompt: "Regenerate this character as one full-body back view on a plain neutral gray background. Show only one character. The camera must be directly behind the character. The character must face completely away from the camera in a perfectly straight rear view. Do not show any part of the face or side profile. Show the back of the head, back of the neck, full outfit, full body, arms, legs, and shoes. Keep the same outfit, hairstyle silhouette, body shape, and proportions. No shadow.",
    image_url: "https://private.example.invalid/original", batch_size: 1, resolution: "720p", aspect_ratio: "4:3", enhance_prompt: false,
  }); checks++;
  check(generation.slot === "back" && generation.promptRevision === 4 && !generation.soulIdUsed && generation.soulId === null && generation.referenceStrength === null, "Back image-only recipe frozen in intent");
}
const workflow: V5Review = { id, version: 7, slot: "back", state: "review", candidateId, accepted: ["face"], approvedAt: null,
  errorPhase: null, errorCode: null, cropTop: 2000, soulIdUsed: false, workPhase: "generating", heartbeatAt: null, leaseExpiresAt: null,
  reconciliationRequired: false, canRetrySaving: false, savingIncomplete: false, recoveryState: "stored", persistenceState: "ready", elapsedMs: 0, runningSince: null };
const render = (value: V5Review) => renderToStaticMarkup(createElement(CharacterV5Review, {
  projectId: id, jobId: id, workflow: value, enabled: true, onSaved() {}, checkStatus() {},
}));
const html = render(workflow);
check(html.includes(`slot=back&amp;candidateId=${candidateId}`), "Back review img binds exact Back candidate");
check(html.includes("Accept Back") && html.includes("Reject and delete image"), "manual Back decisions remain available");
check(html.includes("Reject if the character is turned sideways or if any part of the face is visible."), "Back has the exact reviewer rejection hint");
check(!html.includes("slot=front_source") && !html.includes("original"), "review does not show a Front/Original substitute");
const diagnostics = { candidateId, objectKey: `private/back/${candidateId}.png`, hash: "a".repeat(64), providerRequestId: id,
  inputSource: null, generation: null };
for (const large of [false, true]) {
  const markup = renderToStaticMarkup(createElement(PrivateV5Image, { src: `/api/ugc/character-v5?slot=back&candidateId=${candidateId}`,
    alt: "Back candidate", backCandidate: true, large, diagnostics }));
  check(markup.includes(`slot=back&amp;candidateId=${candidateId}`) && markup.includes(`data-preview-source-key="${diagnostics.objectKey}"`) &&
    markup.includes(`data-preview-sha256="${diagnostics.hash}"`), `${large ? "lightbox" : "card"} uses the same candidate URL/key/hash`);
}
check(render({ ...workflow, backCandidateAvailable: true, backDiagnostics: diagnostics }).includes("Back development diagnostics"), "persisted candidate metadata is inspectable in development");
const faceDiagnostics = { ...diagnostics, generation: v5Generation("back", id), inputSource: { id,
  storageKey: "private/accepted-face.png", sha256: "b".repeat(64), etag: "face-etag", kind: "accepted_face" as const } };
const checksMarkup = renderToStaticMarkup(createElement(BackReviewDiagnostics, { diagnostics: faceDiagnostics, previewAvailable: true }));
check(checksMarkup.includes("Actual source: Accepted Face") && checksMarkup.includes("Prompt revision: 4") && checksMarkup.includes("Enhancement: Disabled") && checksMarkup.includes("Batch size: 1"), "summary shows accepted Face and actual request settings");
for (const warning of ["partial face visible", "sideways pose", "background shadow", "multiple characters"]) {
  check(checksMarkup.includes(`aria-label="Review ${warning}"`), `reviewer can flag ${warning}`);
}
check(checksMarkup.includes("4 checks pending") && checksMarkup.includes("Not checked") && checksMarkup.includes("These flags do not accept, reject or delete"), "unreviewed image never claims automatic checks passed");
const unavailable = render({ ...workflow, backCandidateAvailable: true, persistenceState: "storage_missing" });
check(unavailable.includes(`slot=back&amp;candidateId=${candidateId}`) && !unavailable.includes("No back candidate available"), "an existing candidate gets its own preview attempt/error, not a missing-candidate placeholder");
for (const missing of [ { ...workflow, candidateId: null }, { ...workflow, state: "queued" as const },
  { ...workflow, state: "failed" as const }, { ...workflow, persistenceState: "storage_missing" as const }, { ...workflow, backCandidateAvailable: false } ]) {
  const markup = render(missing);
  check(markup.includes("No back candidate available"), "missing/uncommitted Back has an explicit placeholder");
  check(!markup.includes("slot=back") && !markup.includes("Accept Back"), "missing Back never requests a canonical fallback or offers acceptance");
}
const server = readFileSync("lib/character-v5/server.ts", "utf8");
check(server.includes("readbackV5Candidate(workflow, candidateId)") && server.includes("artifact = candidate.artifact"), "candidate preview uses verified candidate exclusively");
const persistence = readFileSync("lib/character-v5/persistence.ts", "utf8");
check(persistence.includes("candidate.slot !== workflow.slot") && persistence.includes("asset.data.id !== id") &&
  persistence.includes("asset.data.storageKey !== `${v5Prefix(workflow)}${id}.png`") && persistence.includes("proof.data.sha256 !== asset.data.sha256"), "wrong slot/key/ID/hash cannot be served as Back candidate");
const worker = readFileSync("lib/character-v5/worker.ts", "utf8");
const backBranch = worker.slice(worker.indexOf('} else if (workflow.slot === "back")'), worker.indexOf('phase = "input_sign"'));
check(backBranch.includes("const face = workflow.accepted.face") && backBranch.includes("CHARACTER_ACCEPTED_FACE_REQUIRED") && backBranch.includes("await readV5Artifact(workflow, face, signal)"), "Back requires hash-checked accepted Face before submission");
check(backBranch.indexOf('kind: "accepted_face"') < backBranch.indexOf("} else {") && !backBranch.includes("catch"), "accepted Face errors never fall back to Original");
check(worker.includes('workflow.slot === "back" ? { storageKey: input.key, kind: input.kind }') && worker.includes('checkpoint("submitted", { requestId: receipt.id'), "selected source and actual provider request are persisted");
const sql = readFileSync("supabase/migrations/20261025005500_ugc_character_v5_persistence.sql", "utf8");
check(sql.includes("a:=jsonb_set(a,array[w.slot],c.artifact)") && sql.includes("next_slot='front_source' and not(w.accepted ?& array['face','back'])"), "canonical promotion and Front acceptance gate are unchanged");
check(sql.includes("artifact=null,output_proof=null,planned_key=null"), "explicit rejection clears the saved image pointers");
console.info(JSON.stringify({ checks, providerCalls: 0, workerRuns: 0, databaseMutations: 0 }));
