# Higgsfield Seedance 2.5 reference limits

## Verified endpoint evidence (2026-11-07)

The [official model API reference](https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/api-reference) identifies `POST https://api.higgsfield.ai/bytedance/seedance-2.5/reference-to-video` and its `image_urls` input. Its rendered parameter table omits array maxima. The [same model's official page](https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/playground) embeds the complete model `input_schema` and a “Copy for agent” JSON schema. Read-only retrieval confirmed that this schema belongs to the exact route above and declares:

| Field | Verified bounds |
| --- | --- |
| `image_urls` | `minItems: 1`, `maxItems: 30`, URI strings |
| `duration` | 4–30 seconds |

The schema's conditional accepts `image_urls` without video/audio inputs, matching Sceenyk's image-only reference workflow despite the page's “with video reference” variant label. This is endpoint-specific evidence, not the generic multi-file uploader or another vendor's implementation. Higgsfield's [shared uploads documentation](https://docs.higgsfield.ai/docs/concepts/file-uploads) supports the existing PNG/JPEG/WebP application subset. The reviewed schema does **not** publish per-image, prompt, or request-body byte ceilings: those fields stay `null` in the public snapshot. This does not claim unlimited provider capacity. Reviewed account evidence can enforce additional restrictions. No authenticated API request was made to establish these limits.

The public evidence is versioned in [higgsfield-reference-limits.ts](../lib/final-video-generation-v3/adapters/higgsfield-reference-limits.ts). This reviewed schema snapshot does not need the expiring operator-file mechanism; update its version after a new documentation review. Existing provider capability snapshots remain unchanged, preserving historical package and command fingerprints.

## Root cause and exact path

1. Studio Build Package calls `ownedV3Action(build_package)` in `runtime-server.ts`, preserving the approved source/Storyboard and queuing the existing Package task.
2. `packageTask` compiles/restores each segment and calls the existing Higgsfield adapter to produce the actual payload.
3. Previously only multi-character Packages called `higgsfieldRequestIssues` here. Its evidence came solely from `validityEvidence()` and the optional `UGC_V3_HIGGSFIELD_LIMITS_FILE`.
4. That file was unset in the inspected local configuration. The reader returned `null`; the validator required a matching model, valid verification/expiry times, trusted source URLs, a count limit **and** image/prompt/body byte ceilings. It emitted `V3_PRO_REFERENCE_LIMITS_UNVERIFIED` whenever this full evidence was absent for more than one character. The generic Package label obscured the configuration dependency.
5. No Higgsfield request had been made. This was a local admission failure, not evidence that three characters exceed the provider limit.

The corrected reader defaults to the reviewed public snapshot. Package payload validation now runs consistently and counts `image_urls.length`, checking that it matches the complete reference manifest. Three Character Sheets + one Product + one Location are **five images per clip**. A 40-second Storyboard sends those same five approved references in each independent 30s/10s clip payload; it does not count ten references against one request or omit a character.

An optional valid account file may tighten the count, image size/MIME, prompt bytes or body bytes. The effective count is `min(30, configured count)`, so an override cannot raise the documented ceiling. Explicit unreadable, malformed, future-dated, expired or wrong-model evidence blocks new work with a specific explanation. Public evidence applies only to this exact endpoint. Historical single-character quotes with no evidence remain readable/valid under their original compatibility branch, while the documented maximum still protects new submissions.

The Package worker reads one evidence snapshot for all its clip validations and freezes that same snapshot into the quote. Runtime inspection, execution inspection and worker pre-submit checks pass the actual model ID to the same validator. Existing ownership, cast/speaker IDs, image order, source readback, rates, immutable package hashes, one-use spending authorization, saved-request recovery, accepted-job polling and duplicate fences are unchanged. No reference, Storyboard or package history is rewritten. Existing checkpoint JSON stores the specific error codes; no migration or additional persistence is needed.

## Local setup and retry

- No new environment variable or database migration is required. Leave `UGC_V3_HIGGSFIELD_LIMITS_FILE` unset to use the built-in reviewed limits. It was already unset locally; the actual environment file was not changed.
- If an account override is intentionally configured, keep its existing reviewed evidence format and expiry. Correct or restore a bad file. Remove an override only after reviewing whether its account restrictions are still needed; do not silently ignore it.
- Restart the app and V3 worker with the updated source. In the existing project, choose **Build package and estimate** again. This reuses the approved Character/Product/Location Sheets and Storyboard and retries the existing failed Package task. It does not start video generation.
- If 30 is exceeded, count every sheet and other image reference together. With Product and Location present, 28 Character Sheets fill the 30-image allowance; 29 Character Sheets require 31 images and must be blocked.
- Unpriced higher resolutions, provider access/credentials, approval and finite spending authorization remain separate gates. This task changes no price or paid switch and does not authorize generating video.

## Offline verification

**2026-11-07 results:** 3,851 focused route/worker/disposable-SQL assertions, 3,305 existing multi-character checks, 3,906 existing full V3-flow/Basic checks, 3,778 independent-clip checks, 51 clip UI checks, 270 foundation checks, 191 Phase 3 checks, and 216 resolution integration + 90 resolution UI checks passed. TypeScript, repository lint, final focused lint, production build, 44 documentation links and protected-owner/scope/whitespace review passed. Counts include shared migration/catalog bootstrap assertions. All fixture network/provider calls were mocked; no generation or estimate API call ran. The build retains 11 existing filesystem-tracing warnings and a parent-lockfile warning. The unchanged clip UI fixture needed normal filesystem access for esbuild dependency resolution.

`npm run test:ugc-v3-reference-limits` uses the actual owner route, Package worker, adapter and disposable PostgreSQL with mocked private media/OpenAI services. It covers Basic one-character Packages and Pro 40-second two-clip Packages with one, three, six and 28 approved characters, plus 29-character rejection. It verifies every image index/character ID, complete saved Storyboard/reference preservation, local cost totals and no paid intent/authorization creation. It also retries a saved expired-evidence failure after reviewing the override, without another creative request.

Pure validation checks cover 30/31 total images, lower account ceilings, attempted limit increases, unknown endpoints/evidence, expiry, unreadable/malformed files, URL/format/size checks and actionable error labels. Existing multi-character, Basic video flow, Phase 3 and pricing/resolution regressions remain separate checks. All test network/provider operations are fixtures; real provider quality/account acceptance remains unverified.

Changed production files: `adapters/higgsfield-reference-limits.ts`, `adapters/higgsfield-validity.ts`, `creative-inputs.ts`, `package-task.ts`, `package-status.ts`, `reference-errors.ts`, `runtime-inspection.ts`, `execution-inspector.ts`, and the pre-submit validator call in `worker.ts`, all under `lib/final-video-generation-v3/`. The same model-scoped validation call is synchronized in `scripts/preflight-v3-controlled-video.ts`. Setup comments change only in `.env.example`.

Offline files: `scripts/check-v3-reference-limits.mjs`, `scripts/lib/v3-reference-limit-scenarios.mjs`, `scripts/check-v3-location-director.mjs`, `scripts/lib/v3-multiple-character-scenarios.mjs`, and the test command in `package.json`. Documentation: this file, `context/phase-2-basic-pro-studio.md`, `context/architecture.md`, and `context/progress-tracker.md`; `.gitignore` adds this document to the existing context allowlist. No database, media, financial, provider transport, creative compiler or Studio layout change.
