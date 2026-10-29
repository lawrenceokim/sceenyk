# Milestone 9 — Video Generation Package Preparation

## V3 Phase 2 package extension (2026-10-29)

[V3 frozen package v3.2](generation-v3-phase2.md#package-cost-and-authorization) is an isolated versioned extension for newly created V3 projects. It freezes approved creative/reference/Storyboard inputs, minimum Generation Segments, compiled prompts, output/native-audio settings, capability and independent pricing evidence/hashes. Source/brief changes invalidate currentness; rebuilding creates another immutable version. Manual 076 stores these separately and never rebinds historical M9/V1/V2 packages. Paid authority and result/review history remain separate records; transport stays disabled.

## V3 Phase 1 standalone planning contract (2026-10-29)

[V3 source](generation-architecture-v3.md#source-contracts-planner-and-compiler) defines a separate approved creative-package/Storyboard/reference snapshot and canonical V3 content hashes, with currentness and same-project V3 provenance validation. It derives minimum audiovisual Generation Segments and full director instructions without a master-audio/voice binding. It does not modify M9 schemas/builders/approvals, adapt old packages automatically or persist a V3 record. Planned segments have exact hashes, estimates, not-started execution and separate finite authorization snapshots, but remain non-executable. Future server/database integration must establish actual fresh-project ownership and approval/currentness evidence before any paid work; no source JSON/hash is itself authority.

## Planned V3 package and Generation Segment handoff (2026-10-29)

[Canonical V3](generation-architecture-v3.md#generation-segments-and-continuity), **Planned / Not Started**, preserves immutable approved Storyboard/reference content and derives minimum continuous audiovisual Generation Segments for Higgsfield. The package/plan carries full cinematic dialogue/sound/shot intent and exact source versions; it does not turn each creative scene into a video request. Package approval remains separate from finite paid authorization.

V3 must explicitly version a native-audio profile rather than inherit V2's mandatory master-audio/ElevenLabs bindings or stronger supplied-external-speech gate. Existing schemas, hash recipes, the optional V2 type extension and non-executable planning source below remain unchanged experimental/history records, not an installed V3 adapter. No fal capability/rate transfer or migration of old packages/executions. New testing creates fresh package/segment lineage in a new project; no package/approval/runtime mutation occurs here.

## V2 Phase 1 optional planning extension (2026-10-29)

[The V2 foundation](final-video-generation-v2.md#implemented-capability-and-segment-contracts) adds optional type-only `VideoGenerationProvider.segmentPlanning` with neutral capabilities, validation and cost estimation. The isolated planning adapter is not registered on V1. A pure package-to-plan-input conversion preserves approved scenes and exact source hashes; future server code must independently verify supplied package-approval/currentness evidence. There is no new package schema, persistence, worker, provider request or change to M9 approval/spending behavior. Segment planning is non-executable and does not migrate V1 or loosen its validators.

## Planned V2 execution-plan handoff (2026-10-29)

The approved package remains immutable, provider-neutral creative input with every Storyboard scene and exact approved references/timing. [Final Video V2](final-video-generation-v2.md#generation-segment-planner), **Planned / Not Started**, derives a separate versioned execution plan: scene membership → fewest feasible continuous Generation Segments → complete per-segment prompt/timeline plus canonical master-audio binding. A package with two scenes in 10s normally maps to one video request under a compatible provider. Do not rewrite a package/hash/approval or turn scenes into provider-request boundaries.

[V2 provider capabilities](final-video-generation-v2.md#provider-neutral-capability-contract) extend the planned VideoGenerationProvider design with continuous/allowed durations, audio reference, multi-image/multi-shot/native-sync support, output options, estimator and adapter-owned limits. All required combinations must be verified before spending; package approval never provides that spending authority. Existing schema-2 ugc-execution-v1 is V1, not continuous-video V2. The dated per-scene + Kling M10/interface/status notes below are V1 history; no interface/schema/runtime changes occur in this update.

## Schema-2 execution eligibility (2026-10-28)

New packages freeze the approved schema-2 Storyboard exactly, with schema/compiler/prompt version 2 and `executionVersion=ugc-execution-v1`. The compiler version participates in the input fingerprint; all package/Storyboard/reference hashes, exact speech and approval/version bindings remain enforced. Schema-1 compilation/validation remains available only for unchanged historical reads. No old package is rewritten.

Prepare, local package worker and Approve run a pure capability preflight covering video, voice, lip-sync and deterministic composition. Approval rejects legacy/unstructured or unsupported required transitions/delivery/audio, invalid overlap/total duration, or actual generation-capability mismatches. Finite operator configuration resolves the selected profile, but insufficient spending authority is excluded from M9 creative eligibility and still blocks M10. Approval performs no provider request or financial admission. Database migration 070 adds canonical approval/new-package/final-admission fences; existing approved rows remain intact. A local reviewed legacy Storyboard repair requires a new package revision, not reuse of the old approval/hash. [Canonical contract/recovery](final-video-generation.md#canonical-v1-execution-recovery-2026-10-28) supersedes the older contiguous-only compatibility note below.

## Composition-owned transition compatibility (2026-10-28)

M9 continues to freeze the approved Storyboard transition strings and contiguous timeline exactly. [M10 composition capabilities](final-video-generation.md#composition-owned-transitions-and-preflight-2026-10-28) interpret supported explicit cut/fade/crossfade plans separately from video/voice/lip-sync. A compatible existing package remains reusable without rebuilding; no M9 prompt/hash/content is rewritten. The inspected current dissolve/fade strings lack durations, and contiguous two-5s timing cannot accommodate positive crossfade overlap at 10s. Owner changes require Storyboard Save/reapproval and a newly prepared/approved package, while approved history stays intact. Overlap/handle-capable input would require a separately approved schema extension; this fix changes no M9 schema, migration or timeline validation.

## M10 implemented source boundary (2026-10-27)

**M9: Complete. M10: Complete in source for the configured local V1 profile. Runtime/provider/manual acceptance: Pending.** The deterministic M9 package remains immutable and provider-neutral. Approval still pauses without spending. M10 is a separate explicit Generate Final Video action, with full package/current-input/capability/funding checks; no M9 package is rewritten to satisfy provider limits.

[Actual source, verified API limits, required setup, checks and manual acceptance](final-video-generation.md#implemented-local-v1-source-and-profile). This current source entry supersedes implementation-status and task-permission statements in the older dated planning/history below. Unsupported capabilities fail closed; no real providers, worker processes, remote migrations, deployment or credit spending ran during implementation.


## Status and authority (2026-10-27)

| Milestone | Status | Acceptance boundary |
| --- | --- | --- |
| 8 — AI Storyboard | Complete | Preserve dated Storyboard setup/acceptance evidence. |
| 9 — Video Generation Package Preparation | Complete and approved | Existing immutable package construction/review/approval and pause remain unchanged; no fresh live audit. |
| 10 — Final Video Generation | Planned / Not Started | All strategies resolved; automated internal video/voice/lip-sync/storage/composition and final-only user review are planned, not implemented. Runtime/provider/manual acceptance Pending. |

This remains the implemented M9 contract, not a new package schema. [M10](final-video-generation.md#automatic-scene-processing-and-lipsyncprovider) consumes exact approved content through internal VideoGenerationProvider/fal.ai, VoiceGenerationProvider/ElevenLabs and LipSyncProvider/fal.ai-compatible adapters plus independent FFmpeg composition. The user starts Generate Final Video with required cost consent and reviews only the validated final. No manual voice selection, scene acceptance, lip-sync/alignment or stitching gate is added to M9.

M9 description/pace/Character/segment/window data remain immutable. Planned automatic profile identity, stage fingerprints/budgets and private video/audio/sync outputs live in execution manifests, not vendor fields inside the creative package. Current [documentation-only scope](ai-workflow-rules.md#automated-m10-documentation-scope-2026-10-27) changes no app/migration/provider/worker/deployment; Render/Inngest disabled and local worker path retained. Historical provider assessments do not establish current account/model support.

## Source baseline and implemented boundaries

| Owner | Source / responsibility |
| --- | --- |
| Canonical contract | [`lib/video-generation-package/contract.ts`](../lib/video-generation-package/contract.ts): strict runtime schemas, package/input/requirements types, private lifecycle rows, safe review DTOs and status vocabulary. |
| Deterministic builder | [`builder.ts`](../lib/video-generation-package/builder.ts): approved-input validation, integer-ms Storyboard validation, logical scene bindings, neutral prompt compilation, canonical SHA-256 fingerprints and full rebuilt-content comparison. No AI/provider dependency. |
| Private media validation | [`media.ts`](../lib/video-generation-package/media.ts): existing `readReviewAsset` performs bounded conditional private R2 reads with exact ETag, length and SHA-256 checks for all three approved images. No signing, generation, writes or deletion. |
| Server / projection | [`server.ts`](../lib/video-generation-package/server.ts), [`projection.ts`](../lib/video-generation-package/projection.ts): independent owner/project/job authorization, trusted input resolution, commands and safe summary projection. |
| Worker / progress | [`worker.ts`](../lib/video-generation-package/worker.ts), [`progress.ts`](../lib/video-generation-package/progress.ts): existing local consumer's package queue, durable phase checkpoints/leases and persisted package progress overlay. Parent UGC job remains unchanged at its existing pause. |
| Provider contract only | [`provider.ts`](../lib/video-generation-package/provider.ts): generic `VideoGenerationProvider<Payload, Result>` interface and neutral capability/compatibility/execution types. No adapter, registry or matching implementation. |
| API / Studio | [`app/api/ugc/package/route.ts`](../app/api/ugc/package/route.ts), [`generation-package-review.tsx`](../components/creation/generation-package-review.tsx): bounded same-origin private command route and structured Package review tab. |
| Database | [Manual migration 068](../supabase/migrations/20261027006800_ugc_video_generation_packages.sql): new private package/event tables, service-only commands/claim/checkpoint/input resolver, immutable guards, append-only history and additive project-setting staleness trigger. |

M9 compiles the approved saved Storyboard and upstream assets. It never regenerates or creatively repairs them. The original approved Storyboard prompt is retained through the frozen document and document digest; the package prompt is deterministically compiled from its authoritative structured scene fields, voice, continuity and selected settings. Long work stays outside web requests. No parent transition, dispatch, credit reservation/settlement, final rendering or video execution is connected.

## Canonical internal contract

`VideoGenerationPackage` schema/compiler/prompt/fingerprint version **1** contains:

| Field | Persisted meaning |
| --- | --- |
| `packageVersion` | Monotonic build revision within the owned UGC job. Failed attempts can leave gaps between successful content versions. Separate lifecycle `version` fences commands. |
| `project` | Project/owner/job IDs, title, creative direction, Creation Type UGC, video type, visual style, tone and supported prompt-driven narration configuration. |
| `approvedReferences` | Character sheet, Product sheet and accepted Location: exact asset ID, approval/workflow/review ID and version/time, name, MIME, dimensions, byte length and SHA-256. Location also records revision and accepted candidate ID. |
| `storyboard` | Exact approved ID, revision, command/content version, approval timestamp, schema version and immutable document digest. The full approved document is also frozen in the private row input. |
| `timeline` / `output` | Exact selected 5/10/30-second integer-ms duration, millisecond unit and aspect ratio. Resolution, frame rate, format and seed are explicitly null/unspecified; no provider defaults are invented. Output kind is video. |
| `voice` / `continuity` | Approved single Character voice description/pace and Character asset binding; identity, appearance, wardrobe, Product and Location continuity. |
| `scenes[]` | Stable scene number/ID, exact absolute start/end and derived duration, purpose/description, timed movement/gesture/facial expression, Product interaction/position, exact speech/delivery/timing and voice instructions, camera shot/angle/framing/movement/zoom/focus, lighting/colors/atmosphere, sound/music/effects, transition, approved additional directions and provider-neutral generation prompt. |
| Scene bindings | Logical `character`, `product`, `location` roles resolve into the frozen approved reference manifest. Speech binds the same Character voice, including narration. No additional person/Product/Location is inferred. |
| `requirements` | Three approved conditioning images with explicit Character/Product/Location requirements; dialogue/narration/consistent-voice needs; exact scene count/durations and aspect ratio; video output and explicitly unspecified resolution/format. Exact per-scene sound instructions are preserved for future matching. |
| `inputFingerprint` / `packageHash` | Versioned deterministic stale-input/deduplication identity and immutable content integrity proof. Neither grants authorization or permission to charge. |

The current conditioning manifest uses the two approved composed sheets and one accepted Location image: **three images**, not every original/constituent view. Exact sheet approval versions bind their accepted views; the frozen source scene retains original-source provenance. A future change to select additional conditioning views must change/version the neutral manifest and requirements explicitly, never silently omit a required reference to fit provider limits.

Private row `input` freezes scope, exact Storyboard document/approval, upstream approval/version manifest, current saved scene/settings, approved image descriptors, Location plan and wardrobe. Private descriptors include stable R2 keys/ETags; canonical package content contains neither keys nor expiring URLs. Row `validation_receipt` records validator version, input fingerprint, package hash, asset hashes and validation timestamp atomically with successful save. Lifecycle, validation and approval records are separate from canonical creative content.

The explicit owner summary omits scope IDs, storage descriptors, checksums, fingerprints, private input and provider/lease records. It displays names and approved versions, settings, Storyboard revision/version and structured expandable scenes. No raw JSON, credentials or provider payload is sent to the browser. Marketplace publication/adoption still requires its separate public-safe logical-slot projection; do not publish this internal package or copy another owner's media.

## Fingerprinting, immutable versions and staleness

Recipe v1 recursively sorts object keys by UTF-8 byte order, preserves array order and exact strings, serializes safe integer JSON numbers/booleans/null without whitespace, and hashes domain/version-prefixed UTF-8 bytes with SHA-256. Undefined, fractional/non-finite numbers and non-JSON values fail safely. PostgreSQL and TypeScript implement the same deliberate recipe; no incidental database JSON spacing is used.

- `inputFingerprint` covers validated frozen input plus compiler version: owner/project/job scope, source/approval IDs and versions/timestamps, image hashes/descriptors, exact approved Storyboard content/version, saved names/direction/settings/narration, Location context and wardrobe. Provider configuration, worker leases and generated access URLs never participate.
- `packageHash` covers canonical payload except its own hash and generated `packageVersion`. Identical approved content can therefore be verified/rebuilt across explicit versions without different revision numbers defeating content comparison. Creation timestamps, command versions and package approval are outside canonical content; source approval provenance remains bound.
- Current-input comparisons run at build admission, claim, phase/ready checkpoints, read projection, retry and approval. SQL commands lock the existing job/project/reference/Location/Storyboard relationships consistently before committing.
- Changed Character/Product/Location/Storyboard approvals, exact assets, names/direction or important settings make the package stale. An additive project update trigger records sticky `stale_at` for actual title/prompt/type/style/tone/duration/ratio/status changes; reverting settings cannot revive a prior package. Upstream approval/Storyboard revisions remain monotonic and are compared dynamically.
- A stale version stays reviewable and cannot be approved/retried. Rebuild requires a current approved Storyboard and upstream assets, an explicit Prepare action, and new review/approval. A prior immutable payload/approval is never overwritten or rebound to latest assets.
- Missing or hash-mismatched media blocks the worker or approval. Restore the exact approved object before a safe retry; packaging cannot regenerate an asset. Retention/pinning/erasure policy still needs separate confirmation.

## Provider interface and configuration

The implemented VideoGenerationProvider interface still declares identity/version, capabilities, validatePackage, translatePackage, submit and getStatus; M9 never invokes it and no concrete UGC adapter/registry/matcher exists. [M10 internal provider design](final-video-generation.md#provider-independent-architecture) extends it compatibly for independent visual scenes and adds planned VoiceGenerationProvider and LipSyncProvider, without source changes now.

[The voice contract](voice-generation.md) owns automatic reusable identity/profile and exact segment generation; [LipSyncProvider](final-video-generation.md#automatic-scene-processing-and-lipsyncprovider) consumes exact successful visual/Character speech. Core consumes neutral versioned requirements/results, not provider-specific model/voice/request IDs/payloads/settings/limits. Provider selection/configuration is internal; no normal user provider/model management or intermediate scene/voice approval.

Required voice/timing/conditional sync/complete-media feasibility is checked across the composed execution path before spending, not demanded exclusively from native video audio. Profile/source changes follow proper immutable execution/package lineage and currentness checks; do not rewrite approved creative content to fit a model. No actual method, field, schema or adapter is implemented by this documentation.

## Capability checks and paid-request safety

M9 records neutral requirements and validates canonical completeness, not concrete provider compatibility. M10 is Planned / Not Started. Its single [capability preflight](final-video-generation.md#capability-matching-before-any-paid-submission) and [paid-request/financial gate](final-video-generation.md#paid-request-and-accounting-gates) define all future model/account/audio/output/recovery checks, unknown-outcome prevention and no-fallback policy. Package approval alone never authorizes spending or establishes supported dialogue/reference/timing/output behavior. Do not duplicate or hard-code concrete limits here or alter the approved package to fit them.

## Workflow and failure states

**Approved Storyboard → Prepare Generation Package → Check approved assets → Build scene packages → Validate timing and bindings → Save immutable package → Waiting for review → Approve Package → Generation package approved → pause.**

Studio adds Package beside Progress/References/Storyboard after current Storyboard approval, and restores it on project reopen. Prepare creates only one owned persisted request. The local worker verifies the exact three private images, compiles scenes and validates the entire rebuilt package before an atomic ready commit. Progress comes from real persisted phase checkpoints, with clear queued, running/stalled, failed, stale, review and approved states.

Review shows total duration, scene count, style/tone, ratio/video type, Character/Product/Location names and approved versions, Storyboard version, and per-scene timing/dialogue/action/camera/light/bindings/prompt details. No editing or provider selection is introduced. Approve revalidates canonical content, checks current approvals and private media, then appends a version-fenced approval under the final database current-input check. The package step completes; `Generation package approved` is the final message and `Generating final video` stays Not Started. The parent job is not marked Complete or advanced.

**Reject and Delete** tombstones the active package, hides its review content and returns to a separate Prepare action. Immutable versions and approval evidence remain private for audit; no media or upstream reference is removed. It never queues a replacement. Duplicate approval/deletion returns the same outcome safely. Active unexpired leases fence commands; after a worker interruption, allow the 90-second lease to expire before recovery/deletion. Invalid schema/timing/bindings, changed inputs, missing media, persistence failure and exhausted recovery have separate safe messages. There is no fabricated video or percentage.

## Persistence, idempotency and restart recovery

Migration 068 adds `ugc_generation_packages` and `ugc_generation_package_events`, with RLS enabled, no browser privileges and service SELECT only. Writes are confined to SECURITY DEFINER empty-search-path functions `ugc_package_action`, `ugc_package_claim` and `ugc_package_checkpoint`. `ugc_package_input` is service-only; canonical/hash/validation/trigger helpers are not directly executable by browser/service roles. Existing source functions/grants are preserved. No live schema was inspected or migrated here.

- Every route/read resolves authenticated application owner, draft project and existing UGC job independently; client owner/asset/snapshot/provider values are never accepted.
- Job/project locking serializes duplicate admissions. Same request key/input returns the same record; reuse for different scope/content conflicts. A scoped partial unique index prevents duplicate nondeleted, nonstale fingerprints. Only explicit rebuild after changed inputs/staleness or explicit Prepare after deletion creates another revision.
- Frozen input and successful canonical content/hash/validation receipt are immutable. Approval evidence is append-only in effect and cannot be rewritten; event UPDATE/DELETE is explicitly rejected. Sticky staleness can only be added, not cleared.
- Local package claiming uses 90-second fenced leases, 20-second heartbeats, at most three claims and the existing queue transport backoff. Package-only mode filters out every upstream queue before claiming. No second worker or hosting architecture is introduced.
- Restart reloads the same frozen row and fingerprint, rechecks media, and deterministically recompiles cheap metadata under the same revision. A saved review/approved package is never claimed again. Rollback before ready leaves no partial successful document; lost acknowledgement after commit is recovered by reading the already saved package, not creating a new version.
- Failed work requires explicit Retry package preparation and remaining attempts. It reuses the same row/input; it cannot clear staleness, modify upstream data or call a provider. A stale package needs explicit rebuilding from current approvals. Exhausted work requires explicit deletion/new preparation.
- SQL row guards and expected command versions/claim tokens reject stale tabs/workers. Cancellation/deleted projects or lost approvals invalidate current input before a successful commit/approval. Parent jobs, approved references, financial ledgers and hosted guards remain unchanged.

## Manual setup and acceptance

Historical/repeatable M9 setup reference for other environments. The owner now confirms M9 Complete and approved; these commands do not authorize running setup, workers or tests during M10 documentation.

1. Review/apply the entire **`supabase/migrations/20261027006800_ugc_video_generation_packages.sql`** manually after **067 and its prerequisites**. The migration is transactional/rerunnable and verifies referenced source columns/functions before installing triggers. Existing migration files are not proof of the deployed catalog. No data backfill is required.
2. Set **`UGC_PACKAGE_ENABLED=1`** in the local app and worker environment, then restart the app so it loads the flag. `.env.example` defaults to 0; ignored credentials/configuration were not edited. Keep **`SCEENYK_LOCAL_JOBS_ONLY=1`**, Render disabled and Inngest disabled.
3. Retain existing Clerk/application identity, private Supabase server and R2 credentials. Package-only execution needs those existing database/storage services, not OpenAI, image-generation or video-provider credentials/model setup. Keep the current approved Character/Product/Location/Storyboard data.
4. Manually run the existing local consumer in M9-only mode:

   ```text
   npm run worker:ugc -- --packages-only
   ```

   This mode bypasses upstream provider configuration and claims only package rows. The ordinary worker command still serves its existing upstream queues plus explicitly enabled packages; use package-only mode for isolated M9 acceptance. Codex did not start either mode.
5. Open the owned UGC project with current approved Storyboard. Select **Package → Prepare Generation Package**. Observe queued/checking/building/validating/saving/review state. Check the names/approval versions, exact total and scene timing, speech/voice, actions/reactions, Product interaction, camera/light/audio instructions and neutral prompts. Format/resolution/fps remain deliberately unspecified.
6. Double-click/retry after a simulated lost response, refresh and reopen: the same package/version must return. Stop/restart the local consumer mid-build, wait out its lease, and verify recovery of that same revision. Completed review/approved work must not rerun.
7. Try malformed timing/missing approval in an isolated manual fixture, wrong-project/second-owner actions, stale tab commands and upstream replacement/settings edits. Approval/build must fail safely; old content remains private and stale. Reapprove the current Storyboard/upstream assets where required, explicitly prepare a new version, and explicitly reapprove it. A setting changed then reverted must not revive the old package.
8. Select **Approve Package**. Refresh/reopen: approval persists, M9 is complete, progress stops at **Generation package approved**, and final video remains **Not Started**. There must be no provider request, cost admission or parent-stage advancement.
9. Select **Reject and Delete**. Review content disappears, retained version history stays private, and **Prepare Generation Package** returns. No replacement queues until that separate click. Test failed media restoration/retry without replacing an approved pointer, duplicate approval/deletion and cross-owner/project denial.

## Focused source verification

Historical M9 implementation checks, not permission for the current documentation task: TypeScript without emission/incremental output, focused ESLint, `npx tsx scripts/check-video-generation-package.ts`, and local whitespace/source/link/scope review. The package script disables fetch, checks pure compilation/hashing/invalid inputs/safe DTOs/progress/claims, loads all 68 migrations into ephemeral in-memory PostgreSQL, verifies reruns/ACLs and unchanged upstream functions, and uses rolled-back synthetic SQL transition fixtures with a stubbed approved-input resolver. It does not execute a worker, access real jobs/media/providers, or prove live provider/visual/concurrency behavior. Final measured results are recorded in [progress tracker](progress-tracker.md#milestone-9-implementation-2026-10-27).

The owner confirms M9 Complete and approved. Prior source-check/setup evidence remains historical, not a fresh live audit. [M10](final-video-generation.md) is Planned / Not Started. Its voice/source strategy is resolved through ElevenLabs Voice Design and separate dialogue synthesis; exact model/account capabilities, execution/output/timing/mix policies, financial mapping and retention/erasure remain implementation details requiring verification. No automatic implementation/execution is authorized by the current documentation request.
