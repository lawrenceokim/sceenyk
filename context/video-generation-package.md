# Milestone 9 — Video Generation Package Preparation

## Status and authority (2026-10-27)

| Milestone | Status | Acceptance boundary |
| --- | --- | --- |
| 8 — AI Storyboard | Complete | Preserve dated Storyboard setup and acceptance evidence. |
| 9 — Video Generation Package Preparation | Complete in source | Manual migration 068 and owner runtime/visual/concurrency/ownership acceptance pending. No live package was built by Codex. |
| 10 — Actual video generation | Not Started | No provider adapter implementation, capability matching, submission or paid generation. |

This is the current M9 source contract and supersedes the earlier documentation-only plan, older milestone numbering and old unselected-provider statements. fal.ai remains the planned first M10 adapter. Existing legacy `lib/video-ai/` execution is separate and unchanged. Future Higgsfield, Kling, Runway, Luma or other adapters must consume the same canonical package without changing Storyboard or preparation logic. Naming a provider establishes no actual capabilities.

Current execution/testing restrictions live in [AI workflow rules](ai-workflow-rules.md#milestone-9-preparation-scope-2026-10-27). Render and all Inngest execution remain disabled. The existing local UGC worker remains the development path. No provider, worker process, live database/storage operation, remote migration, browser/build or deployment was run for this implementation. Focused offline source/schema/package checks are separate from the owner's manual runtime acceptance.

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

`VideoGenerationProvider<Payload, Result>` defines `id`, `adapterVersion`, `getCapabilities`, `validatePackage`, `translatePackage`, future `submit` and `getStatus`. Translation uses the canonical package plus an execution-time media map. Raw payload/result generics, concrete endpoint/model IDs, limits, reference formatting, SDKs, job submission and settings belong to provider adapters/configuration. Core M9 never imports those adapters or invokes this interface.

**Capability matching is not implemented in M9**, including offline fal matching. M9 records neutral requirements and validates canonical completeness only. fal.ai is the planned first M10 implementation; future adapters translate the same package without rewriting Storyboard/package logic. Exact model/account capabilities and any proposed adaptation remain Needs confirmation. No silent provider/model fallback.

## Capability checks and paid-request safety

The capability types distinguish supported, unsupported and unverified reference modes/counts, Character/Product/Location support, audio/dialogue/narration/voice consistency, scene generation, duration limits/increments, ratios, resolution/format, seeds and asynchronous jobs/recovery. Concrete values remain outside the canonical package and unverified until M10.

Future M10 must check required features against the selected model/mode/account, including maximum reference count, per-scene and total timing, audio/lip-sync/external-audio strategy, output cross-constraints and durable async job recovery. Unsupported/unverified required features must stop before a paid request. Never silently drop a reference, crop, retime, pad, speed speech, synthesize extra audio or substitute a provider. Required creative adaptation needs an explicit new package version and approval.

Future execution must independently revalidate current ownership, exact approvals, fingerprint/hash, package approval, provider/configuration/capability version and translated payload, then existing matched quote/explicit confirmation and server/database financial admission. Persist durable submission intent before any request and reconcile the same remote operation after uncertainty. Package approval is not cost consent or proof of provider compatibility. None of this execution is connected by M9.

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

Authorized checks: TypeScript without emission/incremental output, focused ESLint, `npx tsx scripts/check-video-generation-package.ts`, and local whitespace/source/link/scope review. The package script disables fetch, checks pure compilation/hashing/invalid inputs/safe DTOs/progress/claims, loads all 68 migrations into ephemeral in-memory PostgreSQL, verifies reruns/ACLs and unchanged upstream functions, and uses rolled-back synthetic SQL transition fixtures with a stubbed approved-input resolver. It does not execute a worker, access real jobs/media/providers, or prove live provider/visual/concurrency behavior. Final measured results are recorded in [progress tracker](progress-tracker.md#milestone-9-implementation-2026-10-27).

Manual migration/runtime/ownership/concurrency/visual acceptance remains pending. Provider model/account profiles, capability matching, output/audio/assembly strategies, production pricing/consent and retention/erasure remain M10/later decisions. Do not start them automatically.
