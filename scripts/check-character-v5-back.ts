// Offline payload and actual component markup checks. No external requests/jobs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CharacterV5Review } from "../components/creation/character-v5-review";
import { v5Generation, v5ProviderPayload, type V5Review } from "../lib/character-v5/contract";

let checks = 0;
const check = (value: boolean, reason: string) => { assert(value, reason); checks++; };
const id = "11111111-1111-4111-8111-111111111111";
const candidateId = "22222222-2222-4222-8222-222222222222";
for (const soulId of [id, null]) {
  const generation = v5Generation("back", soulId);
  const payload = v5ProviderPayload(generation, "https://private.example.invalid/original");
  assert.deepEqual(payload, {
    prompt: "Regenerate this character as one full-body back view on a neutral gray background. Show only one character. The camera must face the character’s back. Do not show the face. Keep the same outfit, hairstyle silhouette, body shape, and proportions.",
    image_url: "https://private.example.invalid/original", batch_size: 1, resolution: "720p", aspect_ratio: "4:3", enhance_prompt: false,
    ...(soulId ? { custom_reference_id: soulId, custom_reference_strength: 1 } : {}),
  }); checks++;
  check(generation.slot === "back" && generation.promptRevision === 2, "Back slot/revision frozen in intent");
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
check(!html.includes("slot=front_source") && !html.includes("original"), "review does not show a Front/Original substitute");
for (const missing of [ { ...workflow, candidateId: null }, { ...workflow, state: "queued" as const },
  { ...workflow, state: "failed" as const }, { ...workflow, persistenceState: "storage_missing" as const } ]) {
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
check(worker.includes('workflow.slot === "back" && !workflow.accepted.face') && worker.includes("input = await originalInput(jobResult.data, signal)"), "Back requires accepted Face and original full-body source");
check(worker.includes('workflow.slot === "back" ? { storageKey: input.key }') && worker.includes('checkpoint("submitted", { requestId: receipt.id'), "source key and actual provider request are persisted");
const sql = readFileSync("supabase/migrations/20261025005500_ugc_character_v5_persistence.sql", "utf8");
check(sql.includes("a:=jsonb_set(a,array[w.slot],c.artifact)") && sql.includes("next_slot='front_source' and not(w.accepted ?& array['face','back'])"), "canonical promotion and Front acceptance gate are unchanged");
check(sql.includes("artifact=null,output_proof=null,planned_key=null"), "explicit rejection clears the saved image pointers");
console.info(JSON.stringify({ checks, providerCalls: 0, workerRuns: 0, databaseMutations: 0 }));
