# UGC Character Reference Sheet — Milestone 5

## Character V5 Face Playground alignment (2026-10-26)

**Complete in source; TypeScript, focused lint and 24 offline checks passed. Manual visual/provider acceptance pending. Milestone 7 remains Not Started.** Read-only inspection confirms current Face candidate is a distinct generated R2 image, not the original accidentally shown in References. The completed request used the older simple V5 prompt plus a reused Soul ID and no seed. The user's successful Playground run used no Soul ID and seed 362102; model, 4:3, 720p, enhance_prompt=true, batch size 1 and the original source match. These are proven request differences, not proof that one parameter alone caused the retained purple background.

New Face requests now use the exact successful Playground prompt supplied in the follow-up: `regenerate this image but place the character in a gray background with only the character face in it`, custom_reference_id=null, custom_reference_strength=1 and seed=362102. This supersedes the earlier proposed shoulder-up wording for this parity test. One static payload builder keeps saved intent and submitted settings aligned; new intent records promptRevision=2, actual Soul ID use, strength and seed. Existing V5 prompt/contract version 5 and workflow revision remain compatible; historical intents are never rewritten. Back/Front prompts and settings are unchanged. No separate Playground style parameter was provided; no style suffix, project-style override or AI prompt expansion is added.

Manual Accept/Reject remains authoritative, with no semantic background rejection. After explicit Reject finishes, the existing Generate-again action creates a new Face candidate using corrected settings; only Face acceptance admits Back. The current candidate remains untouched. Progress now prioritizes V5 manual review over the final sheet's legacy invalidated flag and says Waiting for Face review, with instructions to open References. It does not suggest starting a worker or restart polling during review.

No new migration or environment setup. No Higgsfield/OpenAI call, worker, regeneration/recovery execution, current-candidate mutation, R2 write/delete, deployment, Render/Inngest or Milestone 7 work. Product assets/approval and historical records are preserved.


### Completed Face evidence and Playground comparison

Read-only Supabase and bounded conditional R2 GET inspection on 2026-10-26 found workflow dfd2a2fd-7b89-4855-897f-d8d08f10cba9, version 4, slot face, state review, with no accepted Character slots. The completed output retained the older request; recovery did not rerun a prompt.

| Evidence | Original upload | Generated Face candidate |
| --- | --- | --- |
| Asset/candidate ID | 8fc00177-e766-48c5-a10e-35d8ba9fac9e | 8028ab3f-98c2-4380-921c-25744ec64442 |
| Provider request ID | Not applicable: user upload | 96cf2fdd-3b05-4ec1-99c9-8ebd5ada88c9 |
| Format/dimensions | JPEG, 1024 x 1024 | PNG, 1536 x 1152 |
| Stored bytes | 181336 | 4346748 |
| Actual SHA-256 | b54bd404fb073059cf71e7595b45c381be9b4948b2e7a65b8b652032b37a7157 | 8c07e610df8dd575a395a59db9aedeeffb190a959213da65946f3a4ca74e20fc |

Both byte hashes were calculated from the actual stored objects, not merely copied from metadata. Original hash matches candidate.input_asset.sha256; generated hash matches artifact.sha256 and output_proof.sha256. Decoded pixel hashes also differ; different dimensions alone make pixel-hash inequality insufficient to assess similarity, so both images were visually inspected. The generated output is visibly a distinct rendering but retains the purple starry background. No image was regenerated or edited during inspection.

References source renders the current review through image(workflow.slot,true), which includes candidateId in the owner/version-bound preview request. characterV5Preview resolves that exact candidate's artifact; readV5Artifact verifies its private bytes/hash. This branch has no fallback to the original upload. The source-to-live-record trace confirms candidate provenance; an authenticated browser or preview-route request was not run (the preview route can record failure metadata).

| Setting | Completed Sceenyk Face | Successful Playground, supplied by user | New Face submission |
| --- | --- | --- | --- |
| Model | higgsfield-ai/soul/v2/image-to-image | Same | Same |
| image_url | Temporary private URL for original asset above | Same original image, per user | Temporary private URL for the same owner-verified original |
| Aspect ratio / resolution | 4:3 / 720p | 4:3 / 720p | 4:3 / 720p |
| enhance_prompt / batch_size | true / 1 | true / 1 | true / 1 |
| custom_reference_id | fc86e38d-ac27-4f7c-b5c9-1cb2930d0fa0 | null | null |
| custom_reference_strength | 1, reconstructed from submission source | 1 | 1 |
| seed | Omitted, reconstructed from submission source | 362102 | 362102 |
| Prompt | Regenerate this image on a neutral gray background. Show only this character from the shoulders up, facing forward. | regenerate this image but place the character in a gray background with only the character face in it | Exact Playground text |
| Style | No separate style field or project visual-style text was submitted | No separate style field supplied in the user's configuration | No invented style field, suffix or AI-expanded prompt |

The successful Playground result/request ID and its binary image were not supplied, so those hashes/IDs cannot be independently compared. The original signed image_url is intentionally not persisted and has expired; its source asset/hash/ETag are preserved. The saved generation manifest records the old prompt/model/ratio/resolution/enhancement/batch/Soul ID. Strength and seed were not recorded by that older version; source reconstructs strength=1 and seed omission, not the provider's internally chosen seed or enhanced prompt. No provider status endpoint was queried.

The extra Soul ID, missing fixed seed, and different prompt are concrete parity differences. Their individual effect on background retention cannot be isolated without a new manual generation; do not claim Soul strength or enhancement alone caused it. The source now matches every supplied Playground request field. Enhancement remains true because it was true in the successful run. Character identity remains conditioned on the original image; Face bypasses the workflow's historical Soul ID, while later Back/Front identity behavior stays unchanged.

### Manual acceptance and setup

No migration, credential or environment change is required. Use updated application/worker source for the next manually authorized test. This change never alters the existing Face: inspect it, explicitly Reject if desired, then choose Try Face again and confirm. The existing rejection/deletion flow completes before a fresh candidate UUID can be queued; a rejected candidate cannot be recovered as the new attempt. Only explicit Face acceptance creates the Back stage. Incorrect backgrounds remain a human decision, with no semantic rejection/provider retry loop added.


## Character V5 R2 persistence (2026-10-25)

**Complete in source; manual migration 056 after 055 and manual runtime acceptance pending. Milestone 7 remains Not Started.** The latest Face is committed in R2 and matches its persisted fingerprint (4,346,748 bytes, PNG, 1536 x 1152). This supersedes the earlier zero-V5-object snapshot. Current persisted failure is candidate_insertion; the 055 ready expression reproduces PostgreSQL 22P02 because JSON extraction was not grouped before subtraction. 056 corrects only that expression, preserving ownership/leases/ACLs and all other RPC definitions. No new metadata field or data backfill. The original r2_write exception was discarded; its exact historical S3/network cause remains unknown.

The Buffer-based V5 writer reuses the same private R2 helper as Product, verifies an existing immutable key before PUT, and checks for commitment after uncertain writes. Safe allowlisted SDK diagnostics retain nested causes without logging credentials, URLs or raw responses. Retry saving verifies the existing candidate object first; if absent, it may GET the saved provider request's completed output, validate the same persisted fingerprint, and save the same candidate/key. It never submits a new generation, enters a worker loop or advances manual acceptance. Confirmed unavailable output disables recovery; unknown network/auth failures remain retryable. Missing/mismatched objects block review and server-side acceptance/approval.

Manual probe: `npm run storage:probe-character-r2 -- --dry-run` checks presence only; `--execute` uses the same writer, verifies a tiny local PNG and immediately attempts cleanup in its isolated development-probes namespace. Neither mode was run. All four required R2 variables are present in the inspection process via .env.local, with no inherited overrides or public copies. Existing running app/worker process environments were not inspected. No credentials changed.

Verification: TypeScript, focused lint, 34 pure/static R2 checks, 8 isolated 056 expression/catalog checks (all 56 migrations, 056 rerun, no execution RPCs/data), retained 25 persistence-schema checks and 17 diagnostic checks. Live inspection used only database GET, R2 HEAD and bounded conditional GET/hash checks. OpenAPI exposes 055 output_proof and recovery RPC; live function bodies/ACLs were not available and are not inferred from API signatures. No providers, worker, live recovery, probe, current-job mutation, deletion, remote migration, build, deployment, Render/Inngest or Milestone 7 execution. Product and Character prompts remain unchanged. [Detailed evidence and manual setup](character-sheet.md#character-v5-r2-persistence-2026-10-25).

### Latest attempt and exact limits

The inspected workflow is `dfd2a2fd-7b89-4855-897f-d8d08f10cba9`, Face candidate `8028ab3f-98c2-4380-921c-25744ec64442`, under the existing job. Workflow version 3 and candidate are failed; error phase is candidate_insertion and code CHARACTER_CANDIDATE_PERSISTENCE_FAILED. The request ID and private status locator are saved, provider_terminal=false, output_proof is present, and artifact metadata is absent. No signed/provider URL is exposed in UI/log output.

The persisted proof and worker control flow establish completed provider status -> output URL received -> bounded download materialized as Buffer -> Sharp PNG decode/re-encode -> dimensions/hash -> proof checkpoint -> deterministic candidate key -> PUT attempt. HEAD now returns 200, and a conditional GET verifies size/hash/dimensions/PNG format against that proof. Thus this latest candidate is case A (existing R2 object), with provider retrieval unnecessary. Historical timing of the successful PUT relative to the reported failed PUT is unrecorded; no read-only inspection can reconstruct an exception discarded by the old catch. Authentication, timeout, endpoint mismatch or consumed streams must not be asserted as the historical cause.

The current source's 055 expression `(p_payload->'artifact'-array['storageKey','etag'])` produces `22P02: invalid input syntax for type json` in a SELECT-only in-memory reproduction. `((p_payload->'artifact')-array['storageKey','etag'])` correctly returns the fingerprint. This is a proven source publication defect consistent with the current phase, not a captured live S3 exception or a claim to have read the live RPC body. The earlier 055 schema check did not evaluate this expression; the new regression check extracts and evaluates the actual expression.

### Shared writer and recovery contract

V5 saveV5Artifact -> putR2CharacterImage; Product saveProductAsset -> putR2ReferenceImage, which aliases that same function; historical Character also calls it. All use getStorageConfig and the same S3Client: account-derived private Cloudflare endpoint, same bucket/access key/secret, region auto, WHEN_REQUIRED checksums, maxAttempts=2. PUT uses Buffer/Uint8Array, matching explicit ContentLength, image/png and IfNoneMatch=*. No custom CacheControl metadata differs between these writers; authenticated previews remain private/no-store. Only object namespaces differ. No consumed stream is reused: provider download is bounded and materialized once, Sharp produces stable PNG bytes, and hashing/upload use those bytes.

The same immutable candidate UUID/key survives all persistence retries. HEAD/conditional GET/hash prevents overwriting or adopting a different object; a 412 is followed by exact verification. After an uncertain PUT failure, V5 attempts verified object recovery before reporting failure. If PUT commits but database publication fails, output_proof, planned_key and provider receipt remain durable. Retrying publishes the existing object using the existing owner/version/candidate recovery lease, with heartbeat and failure release. A failed readback after successful publication does not regress review.

When no object exists (case B), Retry saving uses only viewStatus GET and output download through the existing provider adapter's URL/redirect/size restrictions. It validates normalized PNG bytes against the original fingerprint before PUT; no altered output is substituted. This retrieval path is implemented but was never invoked in this task. Provider auth/transport/pending errors do not prove irrecoverability. Confirmed missing/expired/failed result (case C) persists CHARACTER_OUTPUT_UNRECOVERABLE, disables Retry saving and displays: Generated image could not be recovered. Regeneration is required. Only a later explicit user-confirmed regeneration may request a new image.

The existing database lifecycle remains submitted -> failed on persistence failure, with durable output_proof and workflow error_phase. The UI derives persistenceState=storage_failed for a write failure without a known committed object, saving_incomplete when publication is pending, and ready only with available matching metadata. No candidate becomes review/accepted until verified R2 bytes are published. Missing/mismatched published objects are labelled storage_missing, hidden from review/approval, and acceptance/approval performs a fresh server-side read/hash before its version-fenced database decision. Accepted history is not deleted or rewritten by read-only inspection.

### Manual setup and commands

Apply [056](../supabase/migrations/20261025005600_ugc_character_v5_publication.sql) manually after 055. No environment additions or credential changes. After applying it, the user may choose Retry saving for the current Face; this task did not perform that action. It should reuse the verified current R2 object and stop at Face review, requiring explicit Accept before Back.

The explicit CLI also remains available: `npm run recover:character-v5-candidate -- --job <JOB_UUID> --candidate <CANDIDATE_UUID>`. Its contract now permits retrieval-only provider GET if the exact R2 object is absent; it is generation-free, not universally provider-free. Earlier descriptions of an R2-only recovery command are historical.

Probe commands (not executed):

- `npm run storage:probe-character-r2 -- --dry-run`: prints presence/inherited flags only, no client/image/network.
- `npm run storage:probe-character-r2 -- --execute`: development-only, locally creates a deterministic gray 128 x 128 PNG, uploads via the exact shared V5 writer to a random key under development-probes/character-v5, verifies HEAD and conditional GET/hash, then attempts deletion in finally even after an uncertain PUT. Cleanup uses a namespace-restricted helper that cannot target UGC keys; cleanup failure reports only the probe key and a failed exit code. It never touches real Character assets or a job.

Both UGC worker and recovery CLI call @next/env loadEnvConfig(cwd,true); Next dev's route uses Next's matching development environment loader. In this inspection all four R2 values were present from .env.local, with no inherited overrides or NEXT_PUBLIC copies. This does not prove the environment inherited by separately launched, already-running processes; restart them manually if their environment has changed. Read success does not independently prove current PUT permission; the optional probe is the user's write-path test.


## Character V5 persistence correction (2026-10-25)

**Persistence correction complete in source; manual migration 055 required after 054. Milestone 7 remains Not Started.** Read-only live inspection confirmed migration 054 API tables/RPC signatures are present, but V5 start/approval SQL references nonexistent `ugc_generation_jobs.retryable` instead of `retry_eligible` (PostgreSQL `42703`). The start transaction rolls back before provider execution. Current job has zero V5 workflows/candidates and zero objects under its private V5 prefix; no new V5 Face is recoverable. This is separate from the reported worker timeout, which recovered.

055 corrects those RPC definitions without rewriting 054, adds a technical output fingerprint before R2 PUT, and supports explicit provider-free publication recovery of the same candidate/object. Logs use fixed safe database diagnostics and distinct persistence/readback/storage phases. No provider, worker, recovery/cleanup execution, live job mutation, accepted-asset deletion, remote migration, deployment, Render/Inngest or Milestone 7 work is authorized. [Current fix and manual setup](character-sheet.md#character-v5-persistence-correction-2026-10-25).

### Verified failure trace

For job `e3b27b7c-8f4e-4c2a-acf2-d0455514e927`, read-only live inspection found **zero V5 workflows, zero V5 candidates, and zero objects (untruncated list) under its exact private `character-v5/` prefix**. The reported POST failure is the initial `ugc_character_v5_start` transaction, before any V5 provider request, download, decode or R2 write. It allocates workflow/candidate rows, then tries to pause the parent job with `retryable=false`; that nonexistent column raises PostgreSQL **`42703`** and rolls the whole transaction back. No candidate row commits; this is not a post-generation R2/candidate read-back inconsistency.

Live zero-row SELECTs confirmed `retryable` fails with `column ugc_generation_jobs.retryable does not exist`, while `retry_eligible` succeeds. An offline PREPARE of the invalid UPDATE reproduces `42703` without executing the statement or creating fixtures. 054 contains the same bug in final Character approval. 055 corrects both definitions to use `retry_eligible`, and clears matching failed-job error/timestamp fields when transitioning back to queued. **054 is retained unchanged.** Previous empty-schema checks created function definitions but did not plan the deferred PL/pgSQL UPDATE; the new schema check validates target columns and parses a representative corrected UPDATE.

The most recent earlier failed Face request is recorded as **prompt 4 / contract 4 / `face-back-front-v1`**, with a storage-failure diagnostic. Its exact historical candidate path returns a PNG HEAD with **10,449,257 bytes**. This is historical V4 evidence, not a V5 generated image. It was not downloaded, normalized, copied, deleted, relabelled V5 or adopted into a new workflow during this fix. HEAD establishes presence/content-type/size, not full decode/hash recoverability. The new V5 recovery command intentionally requires a V5 workflow/candidate and fingerprint; it cannot silently import this historical image.

### Live schema evidence and limits

The live service OpenAPI catalog exposes all three 054 tables and required V5 start/action/claim/checkpoint/finish-rejection/preview RPC signatures. Table fields/defaults/types and documented foreign keys match the code: owner/project/job belong to the workflow; candidates reference that workflow through `workflow_id`; `id` and `request_id` are UUIDs; `slot`/`state`/`revision` are text; artifact MIME/dimensions/byte size/R2 key/SHA/ETag are nested in JSON; prompt/contract defaults are 5 and revision is `simple-manual-review-v1`. There are no required `asset_type`, `generation_version` or `strategy_revision` candidate columns to invent. Accept/reject use terminal `state` plus `updated_at`, not nonexistent dedicated timestamp columns.

OpenAPI is not a complete SQL catalog: live CHECK bodies, index definitions, role grants and RLS policies cannot be proven from it. `supabase/diagnostics/character_v5_catalog_readonly.sql` supplies SELECT-only SQL-editor verification for those objects and flags any invalid `retryable=` function body. Isolated 055 checks verify the authored constraints, service-only RPCs, retained RLS and duplicate-request index. No live mutation RPC or remote migration was executed to test permissions. This distinction remains explicit.

### Persistence, diagnostics and controlled recovery

V5 preallocates the candidate **before** paid dispatch. After technical decode, it now checkpoints an immutable `output_proof` (candidate ID, SHA256, PNG MIME, byte size, width and height) **before R2 PUT**. Publication updates the same candidate row and must match that exact proof. A unique `(workflow_id, slot, request_id)` index prevents duplicate provider receipts. Retried starts return an existing workflow; object keys never change on a saving retry. A successful publication followed by a failed read-back does not regress the candidate or authorize another generation.

Safe development logs now include fixed database operation/category/reason, validated PostgreSQL/PostgREST code, allowlisted table/column/constraint/function identifiers, slot and workflow version. They never spread error objects, messages/details/hints/causes, credentials, connection strings, signed URLs or image bytes. Safe diagnostics are JSON-stringified into one console argument because local development log files previously reduced structured object arguments to `{}`. UI errors distinguish starting a workflow from saving an already generated image.

| New failure phase | Safe failure code / behavior |
| --- | --- |
| `provider_output_download` | Existing allowlisted provider-download/MIME error code, never a database storage code. |
| `image_decode` | `CHARACTER_IMAGE_DECODE_FAILED`. |
| `r2_write` | `CHARACTER_R2_WRITE_FAILED`. |
| `r2_verify` | `CHARACTER_R2_VERIFY_FAILED`, `CHARACTER_OUTPUT_PROOF_MISSING`, `CHARACTER_OUTPUT_PROOF_MISMATCH` or `CHARACTER_COMMITTED_OBJECT_NOT_FOUND`. |
| `candidate_insertion` | `CHARACTER_CANDIDATE_PERSISTENCE_FAILED` with the exact safe database diagnostic; includes start transaction or candidate metadata publication as separate operation names. |
| `candidate_readback` | `CHARACTER_CANDIDATE_READBACK_FAILED` or `CHARACTER_CANDIDATE_READBACK_INVALID`. |
| `preview_read` | `CHARACTER_PREVIEW_READ_FAILED`; V5 uses authenticated private media and has no preview-signing operation. `preview_signing` is reserved vocabulary, not an invented executed step. |

Historical phase names remain admitted for old receipts. If a decoded output fingerprint exists and saving stalled/failed, References offers **Retry saving**, which calls only the controlled recovery path. That path conditionally reads the exact immutable object, decodes and hashes it against the saved fingerprint, acquires an owner/project/job/version/candidate lease, publishes its existing metadata and reads it back. It creates no new candidate, key, image or provider request, and cannot restore accepted/rejected/foreign/stale candidates. It stops at manual `review` (or sheet `ready`), before user Accept/Reject or final approval. An already published candidate is an idempotent verified no-op. Missing objects or fingerprints stop with a specific error; there is no automatic paid fallback.

Deliberate provider-free command, **implemented but not executed**:

```text
npm run recover:character-v5-candidate -- --job <JOB_UUID> --candidate <CANDIDATE_UUID>
```

**No applicable V5 candidate UUID exists for the current failed start**, so this command cannot recover a new Face for that attempt. Do not substitute a historical V4 request ID. After manually applying 055, the user can retry starting V5 when ready; provider/visual/runtime acceptance remains manual. Existing cleanup behavior and canonical/approved asset protection are unchanged.

The reported worker `regeneration_claim` timeout followed by database recovery is separate from deterministic `42703`. Source classification/backoff handles transient timeouts and is unchanged. Whether that particular timeout originated in network latency, client timeout or Supabase query latency is unrecorded; normal Supabase latency is not asserted as its proven cause.

### Manual setup for this correction

Apply only **`supabase/migrations/20261025005500_ugc_character_v5_persistence.sql` after 054**. It is transactional, additive/rerun-safe, adds nullable technical `output_proof` and a duplicate-request index, updates the fixed phase CHECK, corrects the existing start/approval RPC definitions and adds service-only recovery admission. It contains no data repair/backfill, current-job mutation or provider/storage execution outside function definitions. No environment or Product flow change. Optionally run the supplied SELECT-only catalog verification before/after application.

## Character V5 manual review (2026-10-25)

**Character V5 — Complete in source. V4 is superseded for new Character work. Manual migration 054 and provider/visual/runtime acceptance pending. Milestone 7 remains Not Started.**

Original image → static Soul 2 Face → manual Accept → static Back → manual Accept → static Front source conditioned on accepted Back → manual Accept → local adjustable Sharp headless Front → manual Accept → local FRONT / BACK / FACE sheet → explicit Approve Character Reference. Each paid stage waits for the previous user acceptance. Technical checks only; no automatic semantic rejection or OpenAI prompt/crop validation in V5. Private candidates are separate from accepted canonical pointers; Reject fences the candidate, deletes its R2 file, then clears its image pointer while retaining minimal audit metadata. Historical V1–V4 records remain readable and unchanged. Product generation, views and approval stay the same; only its Character dependency resolver admits approved V5 workflows.

[Authoritative V5 contract, setup, cleanup and verification limits](character-sheet.md#character-v5-manual-review-2026-10-25). Source-only authorization: TypeScript, focused lint and static/schema checks. No provider calls, worker/job execution, live mutation, cleanup runs, R2 deletion, remote SQL, builds, deployment, Render/Inngest or Milestone 7. Older sections below describe historical versions.

### V5 request and review contract

Prompt version **5**, generation contract **5**, revision **`simple-manual-review-v1`** live in `lib/character-v5/contract.ts`. V1–V4 parsers, documents, request IDs and semantic receipts retain their original versions; their historical constants are not relabelled V5. New initial Character stages enter `startCharacterV5`; legacy Character regeneration claims and new legacy approval/regeneration RPC actions are disabled. Existing historical assets remain viewable. Starting V5 for an existing eligible job creates separate workflow/candidate rows; it never rewrites the old Character sheet or requests.

| Stage | Static provider prompt / action | Input / admission |
| --- | --- | --- |
| Face | `Regenerate this image on a neutral gray background. Show only this character from the shoulders up, facing forward.` | Original private Character image; always generate, no original-Face semantic reuse. |
| Back | `Regenerate this character as one full-body back view on a neutral gray background. Show only one character.` | Original private Character image after manual Face acceptance; optional reused identity maintains continuity. |
| Front source | `Regenerate this character as one full-body front view on a neutral gray background. Show only one character.` | Accepted Back is the single main `image_url`; starts only after Back acceptance. |
| Headless Front | Local Sharp extraction below the user-selected top boundary; preserve the complete image width and all pixels below it. | Accepted Front source. Initial boundary 20%; user may choose 5–60%, then inspect/accept/reject the resulting crop. No AI decides whether a head is removed. |
| Sheet | Existing local 2400×1216 gray composition, exactly **FRONT / BACK / FACE**, each contained without stretching. | All three canonical slots manually accepted, including the headless Front. Explicit final Character approval remains required. |

The shared Higgsfield adapter sends `higgsfield-ai/soul/v2/image-to-image`, one `image_url`, `batch_size: 1`, `resolution: "720p"`, `aspect_ratio: "4:3"`, `enhance_prompt: true`. It omits an invented/generated prompt layer, extra image inputs and forced seed. These values follow the [official Soul 2 Image-to-Image contract](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/image-to-image/api-reference) and more closely match Playground defaults; successful provider/visual parity is **not yet runtime verified**. `enhance_prompt` is provider-supported processing, not an OpenAI prompt expansion by Sceenyk.

`UGC_CHARACTER_V5_SOUL_ID_MODE=reuse|off` is the only new optional environment setting. Default `reuse` reads a completed Soul ID from this job's existing Character identity; `off` omits it. Fresh jobs without an identity are image-only. V5 never creates another identity or requires a Soul ID. Each paid candidate records the exact static contract, input asset/hash/ETag, optional identity ID and `soulIdUsed`; rejected rows clear the detailed request/input fields. Existing credentials, local-only execution opt-ins and reviewed output-host allowlist remain required. The earlier M4 source-analysis stage and Product analysis are unchanged; V5 never consumes those descriptions to construct image prompts or perform semantic QC.

### Technical acceptance and storage

Only provider completion, a single returned image, safe allowlisted download, nonempty bounded bytes, supported PNG/JPEG/WebP, Sharp decoding, still-image dimensions (128–4096 per axis, at most 20 million pixels), ≤20 MiB normalized PNG and confirmed private R2 write/read/hash integrity admit a candidate. Background, subjects, faces, pose, framing, outfit, feet and crop safety are human decisions. Historical semantic codes remain historical evidence and cannot reject V5 images. No V5 imports or invokes the semantic/OpenAI checker.

`ugc_character_v5_workflows` owns current version, stage, manually accepted pointers, sheet, optional identity, bounded active processing time and lease. `ugc_character_v5_candidates` owns durable work intents, provider request IDs and private temporary artifacts. Both are private, RLS-enabled, browser-inaccessible tables with SELECT-only service table grants; mutations use owner/project/job/version/lease-fenced definer RPCs. Existing job, project, snapshot, storage and event owners are reused.

Objects use immutable unique `ugc/{owner}/{project}/{job}/character-v5/{workflow}/candidates/{candidate}.png` keys. **Promotion is logical:** Accept changes the candidate state and pins that exact immutable artifact as canonical; it does not duplicate bytes. Canonical pointers are separate from the pending candidate. Replacing Face invalidates downstream Back/Front/sheet on acceptance; replacing Back invalidates Front/sheet; replacing Front source invalidates headless Front/sheet. Previous accepted candidate rows remain protected history. Approval is invalidated as soon as regeneration is requested. Reject never advances to another paid stage. An explicit regeneration request is required after rejection.

Reject first durably marks only the current unaccepted candidate `rejecting`, preventing Accept and new work. The authenticated action verifies ownership/path/ETag, deletes that exact object, confirms its absence, then clears artifact, planned key, provider status URL, generation and input fields. Only slot, request ID, model/version, state and timestamps remain. Failures retain a private deletion intent for explicit Retry deletion; they never silently claim success. R2's [compatibility documentation](https://developers.cloudflare.com/r2/api/s3/api/) documents ordinary DeleteObject but does not specify a conditional-delete guarantee; the implementation uses preflight ETag verification, application-immutable keys, SQL fencing and post-delete HEAD rather than assuming undocumented conditional deletion. Out-of-band bucket overwrites are outside the application's immutable-key contract.

V5 previews use the authenticated owner/project/job/version-bound `/api/ugc/character-v5` media route with private/no-store responses. No R2 key, signed provider URL or provider error body enters the browser DTO. Preview errors persist the fixed `preview_read` phase; this path requires no R2 preview-signing step. Technical details appear in Progress/history; References shows the active image, Accept/Reject, accepted checks and final approval. Queued/running work continues polling; review pauses stop paid advancement. Crash recovery polls a known request or recovers its exact committed R2 object. Unknown paid intents require reconciliation and cannot be replayed automatically.

Local crop/sheet candidates also record the Sharp model, exact input IDs/hashes/ETags and crop boundary, where applicable. Soul ID selection is frozen when the V5 workflow starts; changing the environment mode applies to newly started workflows and never relabels old requests.

### Storage failure investigation

**Latest historical Face `CHARACTER_OUTPUT_STORAGE_FAILED`: exact root cause unknown / Needs confirmation.** Existing Character storage code collapses candidate PUT, metadata probes, conditional reads and checkpoint errors into a shared storage diagnostic. No local log established which one failed; the SELECT-only hosted metadata inspection could not connect. No provider or live job was retried to infer a cause.

V5 separates `output_download`, `output_decode`, `r2_put`, `r2_verify`, `metadata_persistence`, `candidate_insertion`, `input_sign`, `preview_read`, `candidate_delete`, `local_crop`, `sheet_composition` and other fixed safe phases. R2 output verification uses an ordinary HEAD plus conditional exact-byte GET/hash, independent of the legacy range-probe helper. A committed candidate PUT can be recovered before attempting an expiring provider download again. Database checkpoint failures also emit a fixed metadata-persistence diagnostic if the database itself cannot save it. These are source fixes for observability/recovery; they do **not** prove the historical failure's cause or successful live storage acceptance.

### Historical rejected-image cleanup

Operator commands, **not executed during implementation**:

```text
npm run cleanup:rejected-character-assets -- --dry-run
npm run cleanup:rejected-character-assets -- --execute
```

Dry run reads catalog/HEAD metadata and reports candidate count, object count, known bytes, skipped canonical/approved/current/uncertain objects and zero deletions. Only explicit Execute deletes files. Selection is deliberately conservative: provably rejected/superseded V1–V4 Character provider/crop candidate paths from a recorded older operation/request. It skips the current attempt/current request, any running job/review/workflow, originals, all recorded historical/current canonical and accepted references, Front sources, Character sheets, Product assets and any uncertain record. It does not delete previously accepted/superseded canonical assets or sweep the bucket. It may leave old unprovable or still-current failures for later reconciliation.

Execution rechecks source owner/project/job/version/operation and rejection evidence in SQL, checks all recorded references, verifies exact object SHA/ETag/size, creates a private cleanup tombstone, then uses the same scoped R2 deletion helper. A tombstone suppresses historical rejected previews without changing old receipts; successful cleanup clears its image pointer. A later execution can finalize a tombstone if a previous deletion succeeded before metadata confirmation. Scope changes or incomplete catalog pagination stop deletion. This command never runs automatically, from a worker or from a test.

### V5 manual setup and acceptance

Apply **only the new `supabase/migrations/20261025005400_ugc_character_v5_manual_review.sql`**, after verifying 001–053 prerequisites are already applied. It is additive and transactional, rerun-safe, creates separate workflow/candidate/cleanup tables and service RPCs, extends fixed event types, and adapts the existing Character approval prerequisite. It contains no data backfill or job/candidate update outside function definitions. It was not applied remotely. Ensure the existing private R2 token supports DeleteObject for generated candidate objects; no public bucket access or new provider credentials are introduced.

Product Primary / Angled / Detail generation, model, prompts, composition and approval remain unchanged. Its service now resolves its Character prerequisite from either the historical sheet or an approved V5 workflow; SQL prepare/resume/gate predicates recognize that same provenance. Existing Product provider and regeneration branches remain intact. This prerequisite adapter does not authorize Product execution during implementation.

Manual acceptance after setup must verify real 720p/4:3 provider behavior, identity mode on/off, all review pauses, stale/foreign action rejection, private previews, each Reject deletion/retry, crop adjustment, original/accepted/Product protection, crash recovery, final sheet ordering and final approval gating. Source checks cannot establish these runtime facts. Render and Inngest remain disabled; **Milestone 7 remains Not Started**.

## Character V4 official workflow (2026-10-25)

**Historical: superseded by V5 for new Character generation.**

**Source of truth for Character implementation. Character V4 — Complete in source; manual 053/provider/visual/runtime acceptance pending. Milestone 7 remains Not Started.** Character V3 is superseded for new Character reference generation because direct Front-first generation remained unreliable. Historical V1/V2/V3 jobs/assets/receipts remain unchanged; new operations use V4.

This section supersedes all older Character strategy, ordering, prompt-version, original-Face reuse and setup recommendations below. Those sections retain historical implementation/evidence only; their source-complete statements do not establish V4 completion or authorize execution. Preserve applicable privacy, ownership, durable-work and explicit-approval safeguards. Product / Prop generation is unchanged.

### Dependency chain and provider responsibilities

**Original Character image → OpenAI Character analysis → Soul ID → Face generation → Back generation → Front source generation → local headless Front creation → Character Sheet composition → Reference review → approval.**

Within Character reference preparation, the mandatory dependency order is **Face → Back → Front source → Canonical Front → Character Sheet → Review/Approval**. A later step must not start until its required upstream reference is validated and durably saved. Generation order differs from the final sheet's Front / Back / Face display order. Do not parallelize dependent view generation. The subsequent implementation request permits original-Face reuse only after the complete V4 portrait contract, including neutral gray, passes; V3's non-gray exemption does not apply to new V4 checks.

OpenAI remains responsible for Character analysis and later storyboard/script generation. Higgsfield **Soul 2 Image-to-Image** remains the Character image provider; **Soul ID** remains the identity mechanism. Use the original owned private image and saved analysis/identity as the starting authority. Face becomes the clean identity reference. Back may depend on validated Face plus Soul identity and becomes the main outfit/body reference. Front source must use **validated Back as its main body/outfit reference**, with Face/Soul identity as support. This is the required semantic dependency, not a claim that additional provider request parameters already exist. Sceenyk owns local Front processing and sheet composition; the provider must never compose the final Character Sheet.

### Face — generate first

Exactly one image containing one person in a shoulder/upper-chest-to-head portrait on neutral gray. No full body, collage, multiple faces, extra pose, text or panel layout. Validate single subject, portrait framing, neutral gray background and absence of collage/multiple poses before accepting it as the clean identity reference. Audit the original first: reuse it only if the full contract passes; otherwise a known ineligibility permits Soul 2 Image-to-Image generation. Persist `faceOrigin: original | provider`. An uncertain audit never authorizes another paid submission. Historical V3 receipts keep their original interpretation without acquiring V4 approval automatically.

### Back — generate second

Exactly one image containing one full-body rear-facing Character on neutral gray, with the same identity, outfit and body proportions and feet visible. No front pose, additional person, collage, text or split layout. Validate the single rear-facing full-body subject, visible feet, gray background and absence of collage/multiple poses before accepting it as the main body/outfit reference.

### Front source — generate third

`front_source` is the **provider-generated normal full-body Front**, conditioned primarily on validated Back and supported by Face/Soul identity. Exactly one image, one front-facing subject, one normal pose, neutral gray and visible feet. No collage, multiple views, inset portrait or text. **Never ask the provider to generate a headless human directly.**

Validate the single front-facing full-body subject, feet, gray background, absence of collage/multiple poses and a safe collar/shoulder region for local cropping. Preserve the validated source privately with its own provenance and validation result; it is an intermediate, not the canonical Front or a sheet input.

### Canonical Front — create locally

`front_reference` is the **Sceenyk-created canonical headless Front**, derived from validated `front_source` using Sharp/local image processing. Remove everything above a safe neck/collar/shoulder boundary. An ambiguous or unsafe cut must fail validation rather than publishing an incorrect crop. Keep source and canonical asset identities, hashes, validation results and crop provenance distinct.

The canonical Front must have **no head**, a usable front-facing body, outfit, arms, legs and footwear. Independently validate that the crop is correct and retains the outfit and feet before publication. Only `front_reference` is the user-facing Front and the Front input to the Character Sheet. Never overwrite the provider source with its crop.

### Character Sheet V4 — compose locally

Sceenyk composes exactly these three validated canonical references, in this display order:

```text
[ FRONT ] [ BACK ] [ FACE ]
```

Front means canonical headless `front_reference`; Back means validated full-body Back; Face means validated portrait. Use neutral gray and clean spacing. No extra figures, duplicate poses, contact sheet, annotations, text or original uploaded image. Do not include `front_source`. Composition must bind the exact validated input assets/hashes; neither a provider-completed response nor decodable pixels alone establishes canonical validity. Publish for review only after all three references and the local composition are valid; approval remains an explicit owner action.

### Validation, failure and retry contract

Every provider output must pass its view-specific visual contract before becoming a canonical reference or an accepted Front intermediate. Validate local Front separately before canonical publication. Rejected outputs remain immutable private historical candidates, with actual rejection evidence where available; they never enter canonical cards, composition inputs or reusable Templates. Missing historical validation remains unknown.

| Failure | Preserve | Retry or repair only |
| --- | --- | --- |
| Face | Original image, successful analysis and Soul ID | Face |
| Back | Validated Face and successful identity/analysis | Back |
| Front source | Validated Face + Back and successful identity/analysis | Front source generation, not Face or Back |
| Local Front crop/validation | Validated provider `front_source`, Face and Back | Local crop/validation |
| Character Sheet composition | All three canonical references and provider source | Local composition |

Successful expensive provider work must never be repeated unnecessarily. Resume known accepted operations from persisted receipts; an uncertain submission/check outcome requires reconciliation, not blind replay. Persist local and provider checkpoints separately so crop/composition repair does not resubmit paid generation. Retain applicable bounded retry, lease and cancellation safeguards; V4 does not authorize resetting historical budgets. Any later deliberate upstream replacement must recheck affected downstream dependencies before reuse/publication while retaining previous assets as history.

Explicit Face regeneration atomically requests Face + Back + Front and invalidates the sheet/Character approval. Back regeneration preserves Face and requests Back + Front; Front regeneration preserves Face + Back. Pending V4 repairs resume existing checkpoints rather than replacing requests/resetting budgets. At most two provider submissions per failed slot, with stricter existing claim/history limits retained. Repeated content failure stops with `CHARACTER_PROVIDER_SINGLE_VIEW_UNSATISFIED`. A valid Front source survives local crop/canonical failure; local retries reload its private ETag/hash-checked bytes without Higgsfield polling/submission. A changed repaired crop retains the prior rejected crop receipt separately; unknown visual checks cannot be replayed. Rebuild sheet requests use only saved validated canonical views, with no provider path.

### Persisted progress and References UI

After analysis/Soul identity preparation, the Character V4 progress order is:

1. Preparing Face reference
2. Generating Face
3. Validating Face
4. Face ready
5. Preparing Back reference
6. Generating Back
7. Validating Back
8. Back ready
9. Preparing Front reference
10. Generating Front
11. Validating Front source
12. Creating headless Front
13. Validating canonical Front
14. Front ready
15. Building Character Sheet
16. Validating Character Sheet
17. Ready for review

These labels reflect **real persisted workflow events only**. Do not infer completion from label order, time elapsed, provider completion alone or optimistic UI state. Completed upstream work remains visible on failure; a local retry shows only the work actually performed. Original-Face reuse omits the paid generation phase. Version-scoped fixed-copy events reuse the existing event stream/type; no new main workflow stage. Keep existing owner-scoped reads, private DTOs and active-only polling; paused/review/terminal states must not fake activity.

References displays **Original Character image → Face → Back → Front → Character Sheet**. The Front card always means canonical headless `front_reference`. Private diagnostics/development inspection may expose `front_source` separately with a clear intermediate label; it must not replace canonical Front. Preserve explicit version-bound review/approval and existing private preview authorization. Product References remains unchanged.

### V4 versioning and implementation boundary

| Version dimension | Required for future V4 operations |
| --- | --- |
| Character prompt version | **4** |
| Character generation contract version | **4** |
| Character strategy revision | **`face-back-front-v1`** |

These are the current new-operation constants. Each provider intent freezes slot/model, prompt/contract/revision, prompt SHA256, source asset type/identity/ETag/hash, Soul ID, seed, parameters and upstream Face/Back IDs/hashes. Checkpoints retain retry count, provider receipt/allowlisted metadata and source/canonical validation. Temporary signed URLs are never persisted. Prompt/contract/strategy versions remain separate from snapshot, sheet-document, storage and review versions: sheet document/storage stays v2, named snapshot stays v3, and new semantic receipts carry `contractVersion: 4` without rewriting old receipts.

Historical **V1/V2/V3 assets, jobs, requests, receipts and recorded versions remain unchanged and interpretable**. Do not relabel them V4, backfill missing evidence, rewrite records, crop old files or replay old work. Historical source/setup notes below are not V4 launch instructions. Any necessary schema/admission changes require a separately scoped future implementation based on verified existing structures.

### Manual setup and source acceptance

Stop old local workers. Apply only [053 — Character V4 dependencies](../supabase/migrations/20261025005300_ugc_character_v4_dependencies.sql) manually after 052 and its prerequisites; do not reapply older migrations. It changes definitions/triggers only, reuses existing tables/JSON/leases/events, retains private RPC grants/RLS and performs no historical data update, backfill, resume or automatic conversion. Restart the app and, only when deliberately ready for manual acceptance, use a fresh `npm run worker:ugc` on the laptop. Historical incomplete operations are held for explicit V4 requests, not automatically replayed. An explicit existing-job request uses current safe review infrastructure and creates the full required dependency batch.

No new environment variable/dependency: reuse existing `HF_API_KEY_ID`, `HF_API_KEY_SECRET`, optional `HIGGSFIELD_SOUL2_CHARACTER_MODEL`, `HIGGSFIELD_OUTPUT_HOSTS`, Character/analysis opt-ins, OpenAI model/key, private R2 and local-only configuration. Render/Inngest remain disabled. Failed pending review work may use the existing bounded `--resume-regeneration JOB_UUID`; a base local crop repair uses the existing bounded `--resume-character-output JOB_UUID`, retaining its paid Front source. No budget-reset/reconciliation bypass is introduced.

TypeScript, focused lint and isolated static/schema verification are the implementation acceptance scope; real provider quality, local-crop quality, URL timing, interruptions, authenticated ownership/preview and live migration/runtime acceptance remain manual. No provider call, worker/job/asset regeneration, live mutation, remote migration, browser/screenshot suite, build, deployment, Render or Inngest execution. Product / Prop generation/provider/prompts/composition/approval and existing financial gates remain unchanged. **Stop after Character V4; Milestone 7 — Not Started.**

## Character V3 image-to-image pivot (2026-10-25)

**Historical / superseded for new Character generation by V4 above.** The following records the V3 source implementation and its original verification; Front-first, Front-conditioned Back and eligible-original Face are not future V4 instructions.

Verification: TypeScript, focused ESLint, static source/ownership/Face-fallback/crop/retry/progress checks, exact Product provider-branch comparison and whitespace checks passed. All 52 migrations plus a 052 rerun passed in an empty in-memory database, including RPC ACL checks and zero jobs/requests/events. No execution RPC, provider/storage request, worker, generation, live mutation, hosted SQL, browser suite, build or deployment was run. Provider-quality, visual and authenticated runtime acceptance remain manual.

**Implemented in source; manual 052 and real-provider/visual/runtime acceptance pending. Milestone 7 remains Not Started.** This supersedes earlier Character Standard/V2 dispatch instructions. Product generation/provider/approval is unchanged. No provider calls, worker, regeneration, live job mutation, remote SQL, deployment, Render or Inngest execution is authorized or performed.

Original Character image → existing OpenAI Character analysis → reusable completed Soul ID → SOUL2 Image-to-Image Front → validated local head crop → SOUL2 Image-to-Image Back → original Face if eligible, otherwise Image-to-Image Face → local Sharp sheet → owner review/approval. OpenAI analyzes references and validates composition; it does not generate Character images. Product analysis and later storyboard responsibilities remain.

The existing CharacterSheetProvider abstraction dispatches V3 through the centralized model constant and optional HIGGSFIELD_SOUL2_CHARACTER_MODEL=higgsfield-ai/soul/v2/image-to-image (the only enabled new model). Existing HF_API_KEY_ID/HF_API_KEY_SECRET and local opt-ins remain. The legacy HIGGSFIELD_SOUL2_MODEL setting is no longer used for Character dispatch. Historical base records retain their actual Standard model; replacements record their actual model independently.

Each new image operation freezes promptVersion=3, contractVersion=3, revision=soul2-image-to-image-v1, prompt SHA256, model, reference asset ID/kind/private key/ETag, Soul ID, seed and documented parameters. Original-reference SHA256 identifies its normalized audit image; its immutable ETag identifies the actual original URL input. No signed input URL is stored/logged or returned to the browser. The adapter verifies provenance before dispatch. V1/V2 remain historical and are never relabelled V3; old pending operations require an explicit fresh request. Current-strategy retry/decision limits do not silently replay old paid work.

Original inputs are checked against owner/project/frozen source metadata. Server-only signed R2 reads expire in five minutes. Back prefers the latest canonical Front's separately retained validated full-body front_source, rechecks owned namespace, source proof, ETag and exact bytes/hash, then signs it; if none exists it uses the authorized original. Invalid present source provenance fails closed. Soul ID is reused with strength 1.0. Front remains a normal single front body; the source candidate is retained as frontSource metadata. Sharp crops at the checked collar boundary and independent validation admits only the headless canonical Front. No historical cropping. Back is one full rear body. Exactly one returned file is required for every generated slot.

Face first audits the original normalized image for exactly one clear, useful shoulder/upper-chest-up face portrait with sufficient dimensions and no collage/insets/body. A non-gray original background alone does not force generation. An eligible original is copied privately as canonical Face with original provenance and a hash-bound original_face receipt; no Higgsfield image request is made. Known ineligibility permits image-to-image fallback; an uncertain/failed audit stops without spending on a fallback. Valid saved Face assets are reused during Front/Back replacement. An explicit Face request can restore the eligible original.

The official image-to-image contract requires image_url even with Soul ID, and reference-image prompt processing is always enabled. V3 records enhance_prompt:true, batch_size:1, 1080p, 2:3 for bodies and 1:1 for Face. Provider request IDs, allowlisted numeric usage when returned, validation receipts and input provenance stay private. No undocumented controls or alternate provider fallback. [Official contract](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/image-to-image/api-reference).

Strict source/canonical validation, private rejected-output previews and deterministic three-input gray sheet composition remain. Two V3 visual failures for a slot stop with CHARACTER_PROVIDER_SINGLE_VIEW_UNSATISFIED and require a provider decision. Only the requested slot generates an image; other validated slots and identity/analysis are reused. Persisted checkpoints drive source preparation, image-to-image dispatch, provider progress, source validation, crop creation/validation and publication; no simulated completion.

**Manual setup:** stop old workers; apply only 20261025005200_ugc_character_image_to_image.sql after existing 051. Do not reapply older migrations. 052 is necessary because the existing Character table restricts provider_model to Standard and the fresh-intent predicates admit only V2. It extends that constraint, admits new V3 metadata, retains historical crop/receipt support and scopes paid retry limits to V3. No new table, column, dependency, historical rewrite or automatic retry. Set the new optional model variable or use the reviewed default, restart the app, and start a fresh worker only when ready for deliberate manual V3 requests. Existing failed records/assets remain intact; absent historical semantic reasons remain unknown.

Files: Character configuration/generation contract/prompts/provider/Higgsfield adapter/input-reference helper/contracts/validation/diagnostics/service; reference-review contracts/state/regeneration/server; References UI and UGC progress; .env.example; migration 052; UGC/context documentation. Source-only verification does not establish provider quality, URL retrieval timing, visual accuracy, interrupted-worker recovery or authenticated preview/concurrency behavior.


## Character V2 source and crop correction (2026-10-25)

**Historical V2 implementation/evidence.** V4 above supersedes strategy, generation ordering and version/setup recommendations here; retain useful source/canonical separation, validation, privacy and paid-work safeguards without treating this as the current workflow.

This supersedes the earlier provider-headless Front instructions and six-attempt manual-cycle advice below. **No live job was changed or retried. Source/runtime acceptance is recorded in the tracker.**

Read-only evidence for existing job `e3b27b7c-8f4e-4c2a-acf2-d0455514e927`:

| Slot | Latest provider request | Saved result | Prompt/contract evidence | Semantic failure evidence |
| --- | --- | --- | --- | --- |
| Front v5 | `c388c73c-31b3-4da2-83b2-9eaa54fc72f3` | Provider completed, one image file, PNG HTTP 200, decode succeeded; not published | Per-operation versions/hash absent | No validation receipt or per-view diagnostic; exact reason unavailable |
| Back v5 | `4e31e8ec-f2f4-4f89-a002-6a8a330e138f` | Provider completed, one image file, PNG HTTP 200, decode succeeded; not published | Per-operation versions/hash absent | No validation receipt or per-view diagnostic; exact reason unavailable |
| Face v4 | `99935b3d-5ea7-4764-bbb0-1f2869ebef7b` | Provider completed, one image, PNG HTTP 200/decode succeeded, replacement saved | Per-operation versions/hash absent | No semantic receipt: saved success proves transport/decode/publication, not a particular visual rule passing |

The root is failed at review v5/composed v4, execution_attempts=3, execution_error=ATTEMPTS_EXHAUSTED, execution_diagnostic=null. The Front/Back request rows still say regenerating with completed provider checkpoints. Their history reached downloading/validation, but that copy alone does not prove a semantic rejection. Product remains approved v1/idle. The immutable base is document/sheet version 1 with `character-sheet-v1` and v1 layout. That is the base's historical provenance, not proof of which prompts generated these replacements. No body/provider query or speculative visual diagnosis was used. The user has no additional terminal lines.

Code trace: both initial `service.ts` and replacement `regeneration.ts` call `HiggsfieldSoul2CharacterSheetProvider.submitView`, which uses the shared current `characterViewPrompt`. Neither looks up historical prompt text from the immutable sheet/snapshot. The old code did not record a per-request prompt fingerprint, so the exact historical builder revision or a stale running worker cannot be proved/excluded. The frozen snapshot supplies identity/wardrobe/analysis data; it must not override slot layout. Current model selection is the same SOUL2 Standard adapter and is compared to the saved base model. A separate already-running terminal's loaded modules/environment remain unverified.

New `generation-contract.ts` explicitly distinguishes prompt version **2**, generation contract **2**, strategy revision `single-view-local-front-v2`, and the separately versioned sheet/storage documents. A fresh paid intent records builder name, actual private-prompt SHA256, provider model, documented batch size 1, 1080p, aspect ratio and enhance_prompt:false. The adapter recomputes/checks the fingerprint before dispatch; the published asset retains the same provenance. Historical missing metadata remains unknown and is not retroactively stamped V2. Fresh intent admission in manual 051 rejects an old worker that omits V2 provenance before it can submit paid view generation. Restarting the worker is still required to load the new crop/validation implementation; its safe startup/dispatch logs identify the loaded contract.

The [official SOUL2 API contract](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/api-reference) documents batch_size options 1 or 4. This adapter fixes 1 and separately rejects a completed result unless its images array has exactly one item. File count does not constrain figures/poses inside that canvas. These historical records establish one file per slot, not its visual composition.

Front provider prompt: exactly one normal head-to-shoes front-facing person, one neutral stance, full outfit/arms/legs/shoes, continuous gray canvas and a clear collar/neck/shoulder boundary. It never requests an anatomically headless person. Visual source validation counts all figures/poses/faces, requires a single complete front person and no panels/insets/mixed views, and proposes a conservative normalized collar crop boundary. Ambiguous boundaries, occlusion or hair below a safe cut fail closed. Sharp crops from that boundary downward, preserves the full width and every pixel below, and records source/canonical hashes plus exact rectangle. No guessed fixed-height crop is used. A second independent check must verify the canonical headless Front with full outfit/shoes before publication. Both receipts and geometry are required for new Front assets. No historical asset is cropped automatically.

Back stays one validated rear-facing head-to-shoes body in the frozen wardrobe/proportions, without front poses/portraits/insets. Face keeps the existing shoulder/upper-chest-up portrait framing. Passed Face assets are reused; completed Face requests do not re-enter generation. A missing historical receipt may be inspected against the visual rules during a future deliberate Character execution, without regenerating Face or repeating source analysis/Soul ID.

Candidates remain private at owned immutable `candidates/{view}/{operationKey}.png`; a derived Front reference candidate uses `-reference.png`. Source and canonical validation stages remain distinct even when rejected. Fixed reasons, observations, validation/check failure, response IDs and usage stay in the existing checkpoint JSON. Safe logs include prompt/contract version, slot, stage, exact fixed failed rules, rejected flag and retry eligibility; a checkpoint failure still emits the observed safe rules without authorizing retry. No raw prompt, source descriptions, credentials, URLs, keys or provider body is logged.

References adds a compact **View rejected output** action. The existing dialog can navigate rejected provider sources and failed crops, labelled Rejected output with safe reasons. Opaque IDs select only candidates derived from the authenticated owner's saved operations; browser keys/paths/provider URLs are never accepted. Issuance and redemption recheck owner/job/current review version, object ETag and candidate hash with the existing 120-second signed same-origin/private/no-store capability. Candidate bytes are bounded and SHA256-verified before display. Rejected images never enter canonical cards, sheet input selection or Templates. Old attempts with no receipt cannot acquire an invented rejection reason or an assumed stored candidate.

At most two provider submissions per slot for this strategy revision are allowed. Only a known rejected visual result permits the second; uncertain provider/validator outcomes stop without replay. Repeated violation records `CHARACTER_PROVIDER_SINGLE_VIEW_UNSATISFIED` in safe diagnostics and uses the existing reconciliation coarse state, disables further UI retry and requires an explicit provider/contract decision. A new UI request cannot reset this strategy limit. Good slots and Product approval remain untouched. Sheet V2 is composed only from canonical passed Front + Back + Face with matching hashes on neutral gray, no original/additional figure/text input.

**Manual setup:** stop old local workers, apply only [051](../supabase/migrations/20261025005100_ugc_character_v2_sources.sql) after existing 050, restart the app, and start a fresh worker only when deliberately ready. No new environment variable/dependency/provider/model. Existing JSON supports provenance and rejected metadata; 051 is needed for server admission and a narrow explicit supersession path because the observed v5 requests are still regenerating with completed provider receipts and an exhausted parent review. Only a later owner request archives the exact old checkpoint/request version, advances the review version and authorizes a fresh target operation in a fresh namespace. Historical requests/objects remain; no migration-time job/request/approval update occurs. Unknown dispatch intent/accepted operations and current-strategy uncertainty cannot use this path. No automatic current-job retry is authorized.

TypeScript, focused lint, static contract/publication/preview checks, exact unchanged Product provider-branch comparison and whitespace checks passed. All 51 migrations plus a 051 rerun passed in an empty in-memory schema, including private helper/public RPC ACLs and zero jobs/requests/events. No execution RPC was invoked and no hosted SQL was applied. Provider response/visual/crop/runtime/ownership/concurrency acceptance remains manual; no live mutation, worker/recovery, provider call, browser suite, build or deployment occurred. Milestone 7 remains Not Started; Render/Inngest remain disabled.

Files in this correction: Character `generation-contract.ts`, prompts/provider/adapter/contracts/validation/media/service; reference review contract/state/rejected-candidate resolution/preview/server/regeneration; progress/References UI and safe worker startup logging; migration 051; and architecture/Character/database/review/UI/workflow/tracker documentation. Prior uncommitted 050 work is retained.

## Single-view semantic admission (2026-10-25)

**Historical validation implementation record.** Direct provider-headless Front instructions and version/retry/setup claims below describe that revision. V4 requires a normal provider Front source, validated local headless crop and Face → Back → Front source dependency order.

This supersedes the earlier decode-only acceptance and historical recovery eligibility below. **Source implementation complete; provider/runtime/visual acceptance remains manual.** SOUL2 already requested batch_size=1 and rejected multiple returned files. It did not inspect how many figures/poses were inside that file; Sharp validated decoding/dimensions/animation only. Prompt instructions alone could not prevent a collage from becoming canonical, and the correct local three-input compositor copied those internal defects.

Prompts now explicitly forbid mirrored/reflected poses, miniatures, mixed views, panels, insets, annotations, backgrounds/storytelling and wardrobe-data overrides of framing. Front must be a single front-facing headless body cropped at collar/neck/shoulders through both shoes, with no head/face/hair. Back must be one rear-facing head-to-feet body, both shoes, no visible face/front pose. Face must be one front-facing head/face close-up at shoulders or upper chest upward, no lower torso/legs/shoes/body inset. All must fill the frame usefully on neutral gray. The existing v2 storage/document schema stays backward readable; generation prompt text has strict revision 3 and semantic receipts have their own version 1.

`validation-contract.ts` defines strict observations, fixed rejection reasons and deterministic per-slot rules. `content-validation.ts` uses the existing server-only OpenAI Responses client, frozen job analysis model, high-detail bounded PNG input, store:false, strict structured output, SDK retries off and cancellation. It adds no image-generation provider or new model selection. [Official image-input guidance](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses) and [structured-output guidance](https://developers.openai.com/api/docs/guides/structured-outputs) informed the adapter. The visual model reports counts, framing/orientation and composition facts; application rules reject uncertainty and all forbidden facts. This is probabilistic visual inspection, not a mathematical guarantee about generated pixels; real-image false accepts/rejects and visual fidelity must be manually assessed. Output JSON shape alone is never treated as visual correctness.

Every normalized candidate is retained privately under the owning sheet/review namespace at `candidates/{view}/{operationKey}.png`, outside canonical paths. Validation intent is fenced/persisted before dispatch; returned response ID/token counts and final observations/reasons are retained without raw text/base64/URLs. Unknown, refused, malformed or unavailable validation stops safely without a repeated paid check. Passed receipts bind view, checker version, frozen model and SHA256 to the exact candidate. Only then is it written/published as a current asset. Storage-after-validation recovery reuses the persisted receipt and exact hash. A known visual rejection permits one fresh generation attempt for that slot only, with a new operation key/seed and the rejected operation/receipt archived. Other successful slots and Soul ID are reused. Two rejected base attempts stop; review failures may be deliberately requested again within the existing three-claim budget, with at most two generation attempts per explicit cycle and six archived/current attempts overall. No unknown generation outcome or content-check intent is resubmitted automatically.

Existing unvalidated preserved views are visually audited during a deliberate Character regeneration execution before sheet composition. Their hash-bound receipts live on the private review root; their files/documents stay immutable. A rejected preserved view is individually requestable even while the group needs rebuilding. Publication uses only passed Front/Back/Face receipts, exact canonical selection, private immutable bytes and a neutral gray local composition in that order. A candidate sheet is reusable only if its pixels match those inputs; invalid historical sheets are retained and a fresh UUID sheet is saved. The published sheet binds all three input hashes. No original/extra pose/text input is added by the compositor.

The existing implemented `npm run worker:ugc -- --resume-character-output JOB_UUID` command now also recognizes exactly one known content-rejected slot in a failed, preparing base Character sheet, when global job attempts remain. It archives only that slot's rejected operation and reopens generation for that slot; stored successful views and completed Soul ID are reused. It does not authorize replay of unknown visual-check intent or generation outcomes. The ordinary receipt-only recovery path remains for its previous eligible cases. This command starts the normal local worker and was not run here. Review-stage failed slots use the existing individual request control instead; both paths retain their attempt limits.

Historical unvalidated views/sheets are not current validated output: cards show an explicit placeholder and can open the labelled historical fallback privately. Rejected candidates never enter cards. Successful slots remain visible/current; failed slot reasons, retries and preserved-assets status appear in fixed safe history/logs. Approval requires three passed receipts plus matching composed input hashes, enforced by server and database; no auto approval. Product generation/prompts/composition/approval behavior is unchanged. The provider-free recovery command remains provider-free and refuses missing semantic receipts; the old 049-only recovery advice does not establish visual validity.

Manually apply **[050](../supabase/migrations/20261025005000_ugc_character_slot_validation.sql) after 049**; do not reapply older migrations. No new environment variable or dependency. Existing OPENAI_API_KEY, OPENAI_REFERENCE_ANALYSIS_MODEL, UGC_REFERENCE_ANALYSIS_ENABLED and local-only configuration are reused. Future explicitly started Character work includes paid visual checks; no calls were made during implementation. 050 extends existing tables/guards/events/private RPCs, including receipt-preserving bounded operation rotation and targeted failed-slot requests, and makes no historical data update. Only TypeScript/focused lint/static checks were run; SQL was not applied, including locally. Live schema/runtime, interrupted-checkpoint/retry/concurrency, real singleton outputs and UI acceptance remain manual. Milestone 7 remains Not Started; Render/Inngest remain disabled.

Changed files: `lib/character-sheet/{prompts,contract,service,validation-contract,content-validation}.ts`; `lib/reference-review/{contract,state,server,diagnostics,regeneration,recover-character-sheet}.ts`; `lib/ugc-jobs/{server,progress}.ts`; `scripts/ugc-worker.ts`; `components/creation/{reference-review-preview,ugc-progress-preview}.tsx`; migration 050; and the current architecture, Character, reference review, database, UI, workflow rules and tracker documentation.

## Milestone 6.6 — Reference Regeneration + Review UX Correction (2026-10-24)

**Historical V2-era Character strategy/version record.** Its provider-headless wording is superseded by V4; keep the independent Product and private review behavior.

**Milestone 6.6 — Reference Regeneration + Review UX Correction — Complete in source. Manual migration/provider/runtime/ownership/visual acceptance pending. Milestone 7 — Not Started.** This section supersedes the historical 6.5 request-only execution and exclusive Preview rules below. [Current execution, versioning and manual setup](reference-review.md#milestone-66-execution-and-review-contract).

Current visual contract: Front = ONE headless front-body/outfit image (neck/body down, full outfit/proportions/footwear); Back = ONE rear full-body reference in the same wardrobe/proportions; Face = ONE close-up face/head with original identity/hairstyle. Individual provider prompts explicitly forbid sheets/contact sheets/multiple poses/insets/additional views/text. Sceenyk composes exactly those three inputs on #b8b8b8, three contained 768x1152 panels in a 2400x1216 PNG, no original or text. New documents use schemaVersion 2, character-sheet-v2 and gray-front-back-face-only-v2 provenance, with character-v2 storage. V1 remains readable; in-flight v1 documents retain their identity and paths while any new submission uses corrected prompts. Completed historical sheets are immutable. Recomposition publishes visual version 2 on the review root and never rewrites base documents. Unrequested historical inputs retain their original pixels and may contain old visual defects.

Regeneration reuses the canonical completed Soul ID, saved analysis and wardrobe; it generates only the requested view with a deterministic request seed. Missing identity fails safely without training. Known accepted/completed requests resume status/download; unknown intents and terminal provider failures require reconciliation. No provider call or asset regeneration was executed during implementation.

## Milestone 6.5 — Reference Asset Review (2026-10-24)

**Milestone 6 — Complete. Milestone 6.5 — Complete in source; manual 046/runtime/ownership/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This supersedes older stop points below. [Review UI, security, persistence and setup](reference-review.md).

Character Original/front/back/face/sheet can now be inspected in paused Studio Preview and explicitly approved. SOUL2 training/prompts/provider outputs remain unchanged. A view replacement request retains paid work, invalidates Character Sheet/approval and blocks use until a later executor publishes a rebuilt sheet and the owner approves it. No Character regeneration executes in this milestone.

Input → Reference Analysis → Character Reference generation → Character Review/Approval → Product Reference generation → Product Review/Approval → Location Reference → Storyboard → Generation Package → Final Video → Preview. Existing cost-confirmation/accounting gates remain. Apply 046 manually after 045; no new environment/dependency. Render/Inngest remain disabled. No provider, worker/job, storage request, remote SQL, browser/screenshot, build or deployment executed. Stop after 6.5.


## Milestone 6 — Product / Prop Reference Sheet (2026-10-24)

**Milestone 5 — Complete. Milestone 5.5 — Complete. Milestone 6 — Complete in source; manual migration/provider/runtime/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This section supersedes earlier M6-not-started stop points below. See [Product Sheet contract and manual setup](product-sheet.md).

Character retains its existing SOUL2 adapter, model, prompts, identity training, generated views/storage and completion pause. The approved OpenAI Product model resolves the earlier suitability stop. Local --resume-product consumes that same successful Character sheet and saved analyses, without invoking Character generation or historical Character-output recovery.

Pipeline: Input → OpenAI Reference Analysis → Character Reference Sheet → Product / Prop Reference Sheet → Location Reference → Structured ChatGPT Storyboard → Generation Package → Final Video → Studio Preview. Existing cost-review/accounting gates remain; no user credits are deducted. Manual setup: pending 044 then new 045; OPENAI_PRODUCT_SHEET_MODEL=gpt-image-2.5-sunburst and explicit UGC_PRODUCT_SHEET_ENABLED=1 with existing OPENAI_API_KEY. Keep Render/Inngest disabled. No providers, worker/jobs, private media, remote SQL, browser/screenshot suites, build or deployment executed. Stop after M6.


## Paused Character-complete progress refinement (2026-10-24)

Long-running active workflows may poll, but paused and terminal workflows must not continuously poll. At the existing Product development pause, show Character reference complete / Generation paused / Your character reference is ready. Product Reference generation has not started yet. Keep identity/front/back/face/sheet checks visible; Product and later stages wait. Check status and visible page/tab return only read once; future explicit server-confirmed resume refreshes the same job and restores polling without deleting checkpoints or making a new job. Historical timing cannot establish active processing, so this job shows Started earlier. Manual 044 records leased active processing only for future new jobs; no historical backfill or current-job retry/mutation. No providers, worker/job, browser suite, deployment or SQL execution during this refinement. M6 remains Not Started.

## M5.5 regression follow-up — current job already Character ready (2026-10-24)

User confirms 043 applied. Fresh read-only inspection of the supplied job now finds `queued / product_reference / PRODUCT_REFERENCE_NOT_IMPLEMENTED`, attempts 3/3, completed Soul identity/front/back/face operations, a completed Character sheet with all four saved asset descriptors and both completed analyses. The older front-failure evidence below is historical. No provider request, bytes download, recovery RPC, job change or worker execution occurred in this inspection.

The Character-output recovery command correctly refuses this already-successful stage; it is intended only for eligible failed Character output with remaining attempts. No Character resume command is appropriate for this job now, and Product remains M6 Not Started. Worker startup now reports UGC_CHARACTER_ALREADY_READY instead of hiding the refusal behind its generic catch, plus safe phase/reason diagnostics for other startup failures. No attempt reset, SQL repair, new migration or recovery bypass is added. Studio polling now reads private JSON independently of its route rendering; [full regression evidence](generation-jobs.md#m55-regression-and-worker-startup-diagnosis-2026-10-24).

## Milestone 5.5 — live Character progress (2026-10-24)

**Live Generation Progress UI Complete in source; manual 043/runtime/visual acceptance pending. Milestone 6 remains Not Started.** Studio now restores the owned Project job and shows real Soul identity/front/back/face/sheet substeps in Preview. Saved operations establish activity; only persisted normalized assets mark views ready. The existing failed job therefore can show identity prepared and front failed when no front asset was saved, even if the provider operation completed. No old checkpoint/event/job is rewritten or retried.

Manual [043](../supabase/migrations/20261024004300_ugc_live_progress.sql), after 041/042, emits semantic append-only progress from the existing checkpoint transaction and a successful real composition checkpoint. It preserves detailed host validation, download/decode, submission/poll metadata, per-view and composition diagnostics in private checkpoints/operator logs. Those technical details are never serialized to normal users; safe fixed messages and view/stage states are enough. [Read model, polling, heartbeat, elapsed-time and setup contract](generation-jobs.md#milestone-55--live-generation-progress-2026-10-24). No provider, worker/job, retry, migration or private storage operation was run by Codex.

2026-10-23: **Milestone 5 — Complete in source. Manual migration/provider/runtime/visual acceptance pending. Exact next: Milestone 6 — Product / Prop Reference Sheet generation. Not started.** No real provider call, private object read/write, worker/job execution, remote migration application, deployment or browser/integration/screenshot suite was run by Codex. Offline in-memory schema validation through 041 and a second 041 DDL pass succeeded without jobs/external calls. Migration 039 is applied according to the user; 040 must also be applied before new named snapshots and 041. Historical M4/name documentation below other context sections remains historical.

## Front output failure and controlled recovery (2026-10-24)

Read-only inspection of the specifically requested later failed job confirms **both analyses completed; Soul ID completed after 33 polls; front view completed after 5 polls; back/face not submitted; no asset descriptors**. Soul ID and front generation have saved provider UUIDs. No signed image URL, response-shape metadata, output hostname or download/decode metadata is stored in this older document. The front completion checkpoint precedes the failure by about 0.66 seconds.

The executed adapter only returns completed for a view after validating matching request_id, status=completed, exactly one images entry and a valid images[0].url. Therefore a missing output array, missing URL field, wrong response field or earlier identity/submission/polling failure is not this job's failure. Its paid front request returned an image URL; media validity/availability is not established by that alone. The [official response contract](https://docs.higgsfield.ai/docs/concepts/requests) uses images[].url, so the parser is retained without speculative output/data fallbacks.

**Historical diagnostic limit:** after that completion checkpoint, the old no-diagnostic CHARACTER_OUTPUT_INVALID paths include the URL protocol/credentials/port/exact-host guard and Sharp empty/body/dimension/multipage/decode/encode rejection. Persisted records and the supplied log do not distinguish which one fired. No exact output hostname, allowlist result, historical download HTTP/MIME/byte count, Sharp result or expiry can be reconstructed. Do not present a guessed hostname or most-likely branch as the root cause. The operator confirmed they have no saved response metadata; fetching the provider response is forbidden during this task. A missing historical diagnostic cannot be repaired retroactively.

**Saved-metadata follow-up:** repeated read-only inspection confirms job metadata={}, every event contains only attempt/resumeStage metadata, and the identity/front operations contain only submission key, state, provider ID/API status endpoint, timing and poll counters. Neither operation has response/output metadata, media or diagnostic fields. The current local `.next/dev/logs/next-development.log` contains no matching job/request ID or Character diagnostic markers; no separate application log/JSONL/local database was found in the workspace data-file search. The provider ID pasted in the follow-up has an extra character and matches zero saved front operations; the actual UUID on this job matches one. These checks neither queried Higgsfield nor changed historical records.

The old adapter parsed the provider body and returned only state/imageUrl (the image URL remained transient); runOperation checkpointed only completion/timing, and the download/Sharp path returned bytes or a broad error without persisting HTTP/MIME/size/decode details. Thus actual top-level response fields, independently saved output counts and output hostname are absent, alongside every download observation. Exactly one image URL can be inferred from the executed parser's completion requirement, but this is code-backed inference rather than saved response metadata.

The configured host was inspected without changing it; it cannot be compared against an unrecorded output host. Canonical private R2 metadata-only HEAD checks confirm **HTTP 404 for front, back, face and final sheet**; no generated objects exist at those paths. No media bytes were read. Database asset records are empty; no back/face operation or final composition was reached. A historical R2 failure would ordinarily use CHARACTER_STORAGE_FAILED, and composition uses CHARACTER_COMPOSITION_FAILED; neither is evidence for this recorded output error. Existing paid Soul ID/front IDs and both analyses remain reusable subject to provider retention. No image bytes have been saved locally.

### Output-invalid branch inventory

| Original generic path | Current fixed internal reason / evidence |
| --- | --- |
| API status lookup 404 | CHARACTER_PROVIDER_STATUS_NOT_FOUND, exact HTTP and operation |
| Invalid/bounded/empty API JSON or Zod response/receipt shape | CHARACTER_PROVIDER_SCHEMA_INVALID, safe known top-level fields/counts when JSON is available; no raw response |
| Soul ID / view response UUID mismatch | CHARACTER_PROVIDER_RESPONSE_ID_MISMATCH |
| Completed view missing exactly one image | CHARACTER_FRONT_OUTPUT_MISSING / BACK / FACE with view and image count |
| Invalid status/output URL scheme, credentials, port, path or fragment | CHARACTER_OUTPUT_URL_INVALID; URLs never retained |
| Output host absent from exact allowlist | CHARACTER_OUTPUT_HOST_REJECTED plus hostname only |
| Provider-advertised output expiry already elapsed | CHARACTER_OUTPUT_URL_EXPIRED; a 403/404 alone does not prove expiry |
| CDN transport/non-success HTTP | CHARACTER_OUTPUT_DOWNLOAD_FAILED plus available HTTP/MIME/received-byte metadata |
| Unsupported Content-Type | CHARACTER_OUTPUT_MIME_INVALID |
| Empty or oversized body | CHARACTER_OUTPUT_EMPTY / CHARACTER_OUTPUT_TOO_LARGE |
| Sharp decode/normalization, too-small/missing dimensions, multiple frames | CHARACTER_OUTPUT_DECODE_FAILED / CHARACTER_OUTPUT_DIMENSIONS_INVALID / CHARACTER_OUTPUT_ANIMATED |
| Frozen sheet/analysis fingerprint mismatch or missing canonical sheet | CHARACTER_OUTPUT_CHECKPOINT_INVALID |
| Previously completed request regresses from completed | CHARACTER_OUTPUT_STATUS_REGRESSED; no resubmission |
| Saved asset SHA256 disagrees with checkpoint | CHARACTER_OUTPUT_INTEGRITY_FAILED |
| Unknown exception formerly converted to generic output invalid | CHARACTER_UNEXPECTED_OUTPUT_FAILURE; no raw exception logged |
| R2 read/write/save verification | Stable job code CHARACTER_STORAGE_FAILED plus internal CHARACTER_OUTPUT_STORAGE_FAILED |
| Final layout/composition | Stable job code CHARACTER_COMPOSITION_FAILED plus internal CHARACTER_SHEET_COMPOSITION_FAILED |

Worker logs now distinguish `code` (specific internal reason) from `jobCode` (stable safe database/Studio code). Optional private v1 operation checkpoints retain allowlisted response field names plus unknown-field count, image/output array counts, URL-present flag, hostname, documented expiry/provider status, download HTTP/Content-Type/byte count and decode state. Known field names are allowlisted; arbitrary provider data, URLs, query tokens, bytes and credentials never persist. Download and decode checkpoints precede storage; outer failure recording is best-effort and claim fenced. Strict media bounds and exact-host HTTPS/no-redirect checks remain; no generated output is automatically trusted as a new allowlist entry.

The follow-up extends capture to identity/view submission receipts (`submissionMetadata`) and the latest pending/completed/failed poll (`outputMetadata`), preserving safe HTTP status and validated provider UUID. Provider-error/schema diagnostics retain the same safe projection; empty downloads also retain observed HTTP/MIME/zero-byte/decode-not-attempted metadata. Receipt metadata is kept separately from the latest poll instead of being overwritten. Existing optional JSON checkpoint fields require no further migration and remain compatible with old documents. This is bounded latest-state diagnostics, not a raw-response history; claim loss, process termination or database outage can still prevent a checkpoint. No provider request, retry, worker or remote mutation is part of this change.

### Preserve paid work on an eventual manual retry

Ordinary `--retry` cannot resume this older failure: its retry_eligible=false. Do not reset it by direct row editing or create a new job. **Manually apply only new [migration 042](../supabase/migrations/20261024004200_ugc_character_output_recovery.sql) after 041**, then stop old worker processes and, only when ready for manual execution, run:

```bash
npm run worker:ugc -- --resume-character-output JOB_UUID
```

The new service-only operator RPC requires an existing failed Character output job, the same owned v3 snapshot and completed analyses, completed Soul ID, known accepted/completed view request UUIDs with exact API status paths, no uncertain/rejected/terminal view, no cancellation and remaining original attempts. It queues only that job at character_reference without resetting attempts or altering snapshots/provider IDs/assets. Migration application itself queues nothing. No public/browser recovery action is added.

The same consumer checks canonical R2 assets first. It skips completed Soul ID training and retrieves/polls the **existing** front request; it never resubmits that paid request. Back/face are generated only after the front has been recovered/stored. If an output is expired or unavailable, it stops with a specific diagnostic rather than generating a replacement automatically. Recovery can consume other runnable jobs and later missing views may incur cost; the operator runs it manually. No command/RPC/job write, provider/OpenAI call, migration application or regeneration was executed remotely during debugging. Milestone 6 and hosted execution remain disabled.

## Manual failure diagnosis — credential shape (2026-10-24)

Read-only inspection of the manual failed job and append-only events confirms validation and **both OpenAI analyses completed**. It reached character_reference and attempted **POST /v1/custom-references**. The identity operation was rejected, with no provider ID, zero polls and no generated assets; Soul ID polling, SOUL2 view submission/polling and output download were never reached. Its three-attempt budget is at 1, and explicit retry is already eligible. The 041 table and all four Character Sheet RPCs are exposed in the authenticated schema and its checkpoints have executed, so **041 is required and its runtime objects are present**, not a missing-migration diagnosis. Migration-ledger history was not queried and nothing was remotely applied. 040 is user-confirmed applied; no new migration is needed for this correction.

Safe local environment inspection found **HF_API_KEY_SECRET contained the complete KEY_ID:SECRET credential, with the same key ID already in HF_API_KEY_ID**. The adapter's correct split-field construction consequently sent the malformed shape `Authorization: Key KEY_ID:KEY_ID:SECRET`. The original configuration validator accepted that shape; it now rejects it before claiming work and reports fixed issue `HF_SECRET_CONTAINS_COMPLETE_CREDENTIAL`. All required Higgsfield variables are PRESENT under a fresh worker-equivalent load. The existing running worker retains its startup environment, so changing `.env.local` alone is insufficient; stop/restart it and clear any stale shell overrides. No actual credential was printed, normalized, changed or written by Codex.

**Historical HTTP precision:** the old adapter converted both HTTP 401 and 403 to CHARACTER_AUTH_FAILED, then discarded the status and response body. The persisted rejected identity intent narrows the operation, not the exact HTTP code. No exact historical status/detail/correlation ID can be reconstructed from the saved records; do not label it definitively 401, assume insufficient funds, or claim account/model access was verified. The malformed local credential is confirmed; remote credential validity/access/balance must be checked by the operator's later manual attempt.

Official contracts checked for this correction:

| Operation | Intended endpoint/authentication |
| --- | --- |
| Create/poll Soul ID | `https://api.higgsfield.ai/v1/custom-references` and `/v1/custom-references/{id}`; current [shared auth](https://docs.higgsfield.ai/docs/authentication) and [SOUL2-specific examples](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/api-reference) support `Authorization: Key KEY_ID:SECRET`. The dedicated [Soul ID page](https://open.higgsfield.ai/models/soul-id/api-reference) shows legacy `hf-api-key` / `hf-secret`; shared auth explicitly supports those legacy headers too. No fallback/double-header experiment is needed. |
| Submit/poll views | `https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard` and the returned, origin/path-validated `/requests/{request_id}/status`; same recommended Authorization format. |
| Download output | Only exact reviewed HTTPS CDN hosts, with no Higgsfield credentials and no redirects. |

The existing **Soul ID v2 → completed custom_reference_id → SOUL2 standard** architecture is documented. Keep model_version=v2, the same credentials/account across training/views, and the distinction between Soul ID UUID and generation request UUID. [Image-to-image](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/image-to-image/api-reference) is a different valid endpoint requiring an additional image_url; this failure does not justify switching to it. All provider control-plane requests still use the single fixed current origin, never platform.higgsfield.ai.

The private Character source passed the worker's conditional R2 read and image decode before the identity submission intent was written. Its five-minute server-signed URL is minted immediately before that submission and never persisted. This verifies worker access, **not Higgsfield's external reachability**, which was not tested here. Do not claim an inaccessible/expired source caused this credential failure. HIGGSFIELD_OUTPUT_HOSTS applies only to generated-output downloads, not the original private source; no allowlist change or public-storage change is needed for authentication.

New diagnostics use bounded error-body inspection and persist only an optional operation-level safe projection: provider operation, actual HTTP status, fixed category, an explicitly allowlisted normalized provider code, and UUID request/correlation IDs when available. The [official errors guide](https://docs.higgsfield.ai/docs/concepts/errors) distinguishes missing/invalid credentials (401), typical insufficient-balance rejection (403), model/account availability states (404/423/503), rate limits and later terminal failures. Status alone does not establish every cause; unrecognized 403 remains access_denied, while explicit safe response hints can distinguish balance/account/model/input-image issues. Diagnostic text does not grant submission, billing or automatic-retry authority. Existing database safe error codes/Studio messages remain stable; private worker diagnostics provide the additional distinction. Explicit input-image failures use the existing private-media failure code rather than being mislabeled as authentication. No raw response/body/URL/header survives. No new SQL: the additive optional field is supported by 041's existing private JSON checkpoints and old v1 records still parse.

Manual correction/retry:

1. Stop the existing worker with Ctrl+C. In ignored `.env.local`, retain HF_API_KEY_ID as the UUID and set **HF_API_KEY_SECRET to only the secret portion after the first colon**, without duplicating the ID or including a `Key ` prefix. Normal dotenv quoting may enclose values; literal quote characters must not become part of the loaded secret. Clear stale shell exports for these variables if they override the file. Keep model/enablement/reviewed CDN hosts and the local-only guard.
2. Restart using **npm run worker:ugc -- --retry JOB_UUID**, substituting the existing failed job ID. Do not click Prepare new generation to bypass it. This explicit command schedules the eligible existing failed job and starts the same consumer; it can process other runnable jobs too. It may incur provider usage. No such command is run by Codex.
3. Saved Character/Product analyses are reused. The rejected identity creation can be attempted after the credential repair; there is no accepted provider ID to poll. If a later result is ambiguous, preserve the intent and reconcile instead of creating another paid request. Successful remote IDs/assets continue to be reused.
4. If failure remains, inspect the new `UGC_CHARACTER_STAGE_FAILED` safe diagnostic and retained operation diagnostic for exact status/category/correlation ID; handle provider account/model/balance restrictions manually. Do not change billing or infer provider access from Sceenyk credits.

No provider/R2 calls, worker startup, retry, new job, remote SQL or deployment were performed during this debugging pass. No Studio redesign, hosted execution or Milestone 6 work.

## Approved complete pipeline

User input → validation → OpenAI Character/Product reference analysis → **SOUL2 Character Sheet** → Product Sheet → **one primary Location** → ChatGPT structured storyboard/script and stable voice specification → normalized generation package → cost review/explicit confirmation and later accounting gate → final AI video → finalization → Studio Preview.

V1: exactly one Character and one Product / Prop, both creator-named; one primary location; current durations 5/10/30. The frozen creator Character name is only a project label, never real-person identification. No Product/Location/storyboard/video generation, wardrobe UI, credit deduction, template publication or hosted execution is implemented here.

Milestone 6 must use the original Product image/name and saved Product analysis for main/front, angled and detail views, keep generated hidden geometry distinct from observations, save privately and reuse. Later Location uses creative direction/storyboard needs/style/tone and is reused across scenes. Its stage/schema integration is deferred; no location stage is falsely marked implemented in the current graph.

Later storyboard inputs: Character name/Sheet, Product name/Sheet, Location, direction, duration, ratio, style, tone, UGC Type and narration. Scenes need stable IDs/start/end/location, supplied names, dialogue/action/camera, voice description, visual instructions, generation prompts and continuity notes. Use “Maya lifts the Nova Watch toward the camera” for supplied names, retaining internal IDs. Stable voice specification covers speaking style, pace, energy, pitch and emotional character; accent only if explicitly requested/supported, no ethnicity/nationality inference or voice cloning from an image. Later video package contains those assets, storyboard/voice/scene prompts and settings; only verified final output enters Preview. Cost review/accounting remain later work.

## Provider contract and configuration

**Historical provider setup.** For future Character implementation use the V4 Soul 2 Image-to-Image / Soul ID direction above. This section does not authorize starting workers, applying migrations or dispatching the older Standard/Front-first strategy.

Workflow calls [`CharacterSheetProvider`](../lib/character-sheet/provider.ts) through a factory, implemented by the server-only [`HiggsfieldSoul2CharacterSheetProvider`](../lib/character-sheet/higgsfield.ts). All auth/HTTP/media-download logic is centralized. Existing fetch, Sharp and R2 SDK dependencies suffice; no new SDK/dependency or browser provider access.

Official model documentation checked 2026-10-23: [SOUL2 model-specific contract](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/api-reference), [lifecycle](https://docs.higgsfield.ai/docs/concepts/requests), [idempotency](https://docs.higgsfield.ai/docs/concepts/idempotency), [polling](https://docs.higgsfield.ai/docs/concepts/polling). Model-specific documentation takes priority over the older Soul ID page: explicitly create `/v1/custom-references` with **model_version=v2**, then use its completed ID as **custom_reference_id**. Soul ID UUID and generation request UUID are different. No unsupported direct `image_url` field is sent to SOUL2. Account access and visual quality are unverified until manual acceptance.

Configure these only in ignored local server environment:

```dotenv
SCEENYK_LOCAL_JOBS_ONLY=1
UGC_CHARACTER_SHEET_ENABLED=1
HF_API_KEY_ID=<UUID key ID obtained from Higgsfield Console>
HF_API_KEY_SECRET=<matching private API key secret>
HIGGSFIELD_SOUL2_MODEL=higgsfield-ai/soul/v2/standard
HIGGSFIELD_OUTPUT_HOSTS=<comma-separated exact trusted output CDN hostnames>
```

Obtain API credentials/account funding/access and confirm SOUL2 + Soul ID v2 support in Higgsfield Console. Obtain exact output media hostnames from Higgsfield documentation/support or the operator's reviewed provider response; no wildcard, IP, URL, automatic host trust, localhost or arbitrary CDN. The documentation examples use placeholder CDN hosts, so no production hostname is invented. Missing values or flag !=1 stop startup before claims. Configuration validates against the reviewed model contract; changing model requires a new adapter review/version. No real credentials/enablement are written by Codex. Current credentials must stay in the same Higgsfield account for existing Soul IDs/requests; account migration is an operator reconciliation task.

Retain existing server-only Supabase/private R2 and OpenAI configuration (`OPENAI_API_KEY`, `OPENAI_REFERENCE_ANALYSIS_MODEL`, `UGC_REFERENCE_ANALYSIS_ENABLED=1`) for the full local queue consumer. No webhook/callback or public localhost tunnel is needed. Direct HTTP uses `Authorization: Key ID:SECRET`, no SDK automatic retry. API origin is fixed; stored status URLs must exactly match that origin/request path. Output fetches use reviewed exact hosts, HTTPS, no credentials and no redirects.

### Configuring HIGGSFIELD_OUTPUT_HOSTS safely (checked 2026-10-24)

No published SOUL2 output-hostname allowlist was found in the official model-specific API reference, shared lifecycle/status, quickstart, uploads or FAQ pages checked. The [lifecycle examples](https://docs.higgsfield.ai/docs/concepts/requests) use **cdn.example.com**, a documentation placeholder, not an approved production hostname. A hostname appearing in another model's preset-preview example, an upload URL or the website's assets does not establish that it serves SOUL2 generated output. **api.higgsfield.ai is the authenticated control-plane origin, not evidence of an output CDN.** Do not add guessed domains, wildcard/suffix rules, placeholders or arbitrary domains to start the worker.

The current local HIGGSFIELD_OUTPUT_HOSTS value was checked without exposing credentials and is empty. It stays empty until an exact hostname is evidenced by an authenticated completed SOUL2 response for this API account or confirmed by Higgsfield support. Nonempty configuration is required before the UGC worker claims work; therefore use the provider Console/API outside the UGC worker for initial discovery. Do not weaken validation to bootstrap it.

1. Prefer an **existing completed SOUL2 API test** from this account. Open that request's response in Higgsfield Console, or read its existing `status_url` with the same account's credentials. The [official status endpoint](https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status) is `GET https://api.higgsfield.ai/requests/{request_id}/status`; verify the HTTPS origin and UUID/path before sending credentials and do not follow redirects. This reads an existing request rather than submitting another generation. Keep credentials and the full response private.
2. Confirm `status=completed`, the expected request ID and the SOUL2 model provenance from the original request. Extract **only the hostname** from each `images[].url`. Do not extract from `status_url`, `cancel_url`, thumbnails, source uploads, `public_url` or `upload_url`. Hostnames are candidates for the observed result, not a provider-wide permanent domain guarantee. Review them in the authenticated response; if ownership/provenance is unclear, ask Higgsfield support to confirm exact SOUL2 output domains using the request ID. The [official FAQ](https://docs.higgsfield.ai/docs/help/faq) lists support@higgsfield.ai and its Discord support link. Codex does not contact them automatically.
3. If no completed API test exists, the operator may manually run one minimal SOUL2 test in the official Console/API; it may incur a charge. A text-only test can establish output-host evidence without training a new Soul ID. **Codex requires explicit approval before any paid generation/training request and has made none.** Starting worker:ugc is not a discovery method: it may process other runnable jobs and includes paid preparation.
4. Put only manually reviewed lowercase exact hostnames in ignored `.env.local`, separated by commas: no `https://`, port, path, query, whitespace inside a hostname or wildcard. Never copy the signed URL or its query tokens into configuration, logs, public data or chat. Restart the local worker only after configuration and when ready for its normal paid workflow. Keep `SCEENYK_LOCAL_JOBS_ONLY=1` and Render/Inngest disabled.

Optional **offline extraction** from a completed response saved privately outside the repository as `higgsfield-completed.private.json` (no network request, no image download, no environment-file write):

```powershell
$completed = Get-Content -Raw -LiteralPath 'C:\path\to\higgsfield-completed.private.json' | ConvertFrom-Json
if ($completed.status -cne 'completed' -or @($completed.images).Count -eq 0) { throw 'Expected a completed image response.' }
$observedHosts = @(
  foreach ($image in $completed.images) {
    $outputUri = [Uri]$image.url
    if (-not $outputUri.IsAbsoluteUri -or $outputUri.Scheme -cne 'https' -or
        $outputUri.Port -ne 443 -or $outputUri.UserInfo -or $outputUri.Fragment -or
        $outputUri.HostNameType -ne [UriHostNameType]::Dns) { throw 'Invalid output URL.' }
    $outputHost = $outputUri.IdnHost.ToLowerInvariant()
    if ($outputHost -notmatch '^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$' -or
        $outputHost -match '(^|\.)example\.(com|net|org)$') { throw 'Invalid or placeholder output hostname.' }
    $outputHost
  }
) | Sort-Object -Unique
$observedHosts
```

This prints candidates only, never approves them or updates the allowlist. After reviewing provenance, join the approved candidates with commas for HIGGSFIELD_OUTPUT_HOSTS. Allow only observed/support-confirmed output hosts actually needed by this integration; do not broaden to a parent domain or assume one host covers future responses. If a new hostname appears later, the existing downloader rejects it until reviewed. A redirect is also rejected; do not solve that by allowing automatic redirects.

Source review confirms the existing `config.ts` requires 1–10 syntactically valid exact hostnames. `downloadImage` requires HTTPS with no credentials/non-default port and exact hostname membership, rejects redirects, omits API credentials, and retains bounded timeout/MIME/size/media checks. No runtime validator, credential, allowlist value, worker or hosted setting was changed for this documentation/configuration audit. No official production hostname has yet been established for this account.

## Wardrobe, views and composition

**Historical V1 implementation record, not current generation instructions.** The Front-first order, head-retaining Front, decode-only checks and V1 prompt/model parameters below are superseded for new Character work by V4. V4 generates Face → Back → normal Front source, validates each, crops/validates headless Front locally and composes only canonical Front / Back / Face.

[`buildWardrobe`](../lib/character-sheet/prompts.ts) builds and persists a version-1 deterministic specification before training/generation: base casual/smart-casual selected by tone, slate-blue top, charcoal trousers/shoes, reference accessory guidance, observed clothing context, plus full frozen creative direction, visual style, tone and UGC Type. Explicit creative wardrobe requests are conveyed as consistent overrides of base garments. This is a deterministic base plus provider-interpreted direction, not a separately verified clothing parser; manual acceptance must inspect actual outfit consistency. It adds no OpenAI request or Studio control.

Versioned **character-sheet-v1** prompts separate fixed instructions from untrusted JSON names/analysis/direction. The original image via Soul ID is the strongest identity signal; saved analysis v1 is descriptive support. No identification or sensitive inference. Generated wardrobe, rear/body/footwear/unseen details are explicitly labeled generated continuity in persisted provenance, never observed source facts.

Generate front, back and face sequentially with one Soul ID, wardrobe, seed and model: 1080p, batch_size=1, enhance_prompt=false; front/back 2:3, face 1:1. Front/back retain complete head-to-feet framing; no destructive head crop. The same seed/instructions support consistency but cannot guarantee it. SOUL2 supports identity conditioning, not cross-view outfit locks; verify wardrobe/body/face fidelity manually.

Each result must have exactly one output, valid bounded raster MIME/bytes, a decodable single still image, minimum 256-pixel shorter dimension and at most 20 million decoded pixels. Sharp orients, strips metadata, flattens alpha over neutral gray and encodes PNG ≤2048×2048. Download cap:20 MiB. This verifies media structure, not semantic pose/identity correctness; manual inspection is required. Original images remain unchanged. View prompts request gray backgrounds; composition does not remove opaque generated backgrounds, which must be checked visually.

Server-side Sharp composition uses **2400×1216**, background **#b8b8b8**, three 768×1152 contained panels with 32px outer margin and 16px inter-panel gaps. Front/back/face order is fixed. No image text, name, UUID, storage key or decoration is embedded. Individual views and canonical final sheet are retained privately. No browser composition.

## Persistence, recovery and privacy

Manual [`041`](../supabase/migrations/20261023004100_ugc_character_sheets.sql) adds private **ugc_character_sheets**, one per immutable job: sheet UUID/owner/project/job/source Character/name/asset type, version, provider/model, status, document and timestamps. RLS/no browser grants, service SELECT and explicit claim-fenced SECURITY DEFINER RPCs only; identity/instructions/completed rows cannot mutate, history cannot delete. Preflight checks prerequisites before DDL. Reruns are transactional/idempotent; old migrations are unchanged. Live catalog/runtime/concurrency acceptance remains manual.

The strictly validated **schemaVersion=1** document stores snapshot SHA256, source analysis ID/version, prompt version, wardrobe, seed, generated-vs-observed provenance, Soul ID training operation and per-view operations. Each operation records durable UUID intent, state, provider ID where known, validated API status URL (never media/source URL), polling count/next time/start and elapsed milliseconds. Each front/back/face/sheet descriptor has its own asset UUID/type, private key/ETag/SHA256/size/MIME/dimensions. Binaries are only in private R2, never PostgreSQL.

The documented status response exposes no reliable per-request USD/usage fields. Record request IDs, model, timings, dimensions and the fixed three 1080p requests for later accounting/dashboard reconciliation; do not invent cost, imply training is free or deduct Sceenyk credits. Soul ID training and image generation may both bill the operator's Higgsfield account during manual testing.

Original source is independently owner/project/role/fingerprint checked and decoded before a new training call. Higgsfield receives an ephemeral **five-minute server-signed R2 source URL after a conditional ETag-checked read**, never persisted, logged, returned to browsers or templates. A long provider queue may outlive that URL; inspect the original request outcome rather than blindly retraining. The provider retains its Soul ID/media according to its policies; no automatic remote deletion is introduced. All generated R2 keys are owned/job/sheet scoped and conditional immutable PUTs prevent replacement. Deterministic keys recover a successful upload whose SQL checkpoint reply was lost; reads revalidate bytes/ETag/hash. No public URLs, raw response/error bodies, descriptions or credentials are logged. Safe progress DTOs never include private keys/provider IDs/documents.

Durable intent commits **before** any paid submission. On restart, accepted IDs resume the same training/generation polling; completed stored views are read/reused. Lost submission response or lost receipt persistence leaves intent and stops for reconciliation. Although generation sends a stable Idempotency-Key, the implementation conservatively does not auto-replay unknown receipts; custom-reference training has no documented equivalent guarantee. Never start a new job to bypass an uncertain operation.

Polling starts after 2–3 seconds and backs off to 10 seconds; transient status network/5xx reads back off to 60 seconds. Persist poll schedule/count, cap at 240 reads/30 minutes per operation, keep worker heartbeat/cancellation active. A timeout stops for review; it does not assert provider failure. Lease expiry/graceful shutdown can requeue known requests within the existing three-claim budget; unknown intents/terminal failures cannot resume automatically. Failure preserves previous assets. Explicit `--retry JOB_UUID` permits known pre-submit config/storage failures, definite auth/rate rejections or storage/composition repair; polling an existing request adds no generation. Exhaustion and ambiguous outcomes need operator reconciliation; no override/reset tool is added.

Real append-only events include Preparing character, Creating wardrobe, Generating character views, Building character sheet, Saving character reference and Character ready. Repeated polling does not flood events. The existing Studio safe status reports Character ready at the Product pause, with no percentages or layout redesign. Full asset-preview/progress UI remains later work.

## Manual setup and acceptance

1. Verify 035–040; user confirms 039 applied. Apply **041 manually**, in full, after 040. Do not reapply older migrations or mutate snapshots/history. Named v3 snapshots are required; nameless historical v2 requests are not silently renamed or reanalyzed and cannot continue through M5.
2. Configure private variables above and existing analysis/storage variables; restart stale processes. Keep Render/Inngest guards enabled. Nothing starts automatically.
3. For a new named job, manually Prepare generation then **npm run worker:ugc**. Validation → both saved OpenAI analyses → character_reference continues under the same claim.
4. An existing named v3 M4 pause resumes only with **npm run worker:ugc -- --resume-character JOB_UUID**. This schedules that exact paused job then starts the same queue consumer, which can consume other runnable work too. Existing `--resume-analysis` and controlled `--retry` remain.
5. Manually verify private storage and owner isolation, view identity/wardrobe/background, final sheet, partial-success reuse, restart/lease/cancellation, unknown intents, rate/auth/provider failures, missing/corrupt/oversized outputs, R2/composition failures and no credit changes. No automatic calls/tests of these paths were made.

Success atomically commits completed sheet + Character ready event + **queued / product_reference / PRODUCT_REFERENCE_NOT_IMPLEMENTED**, releases the claim and excludes the row from runnable claims. It is neither completed video nor cost confirmation. No Product handler/resume/bypass exists. Render/Inngest guards/configuration stay intact; laptop `worker:ugc` is the only executor. **Stop after Milestone 5. Next: Milestone 6 — Product / Prop Reference Sheet generation.**
