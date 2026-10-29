# Code Standards

## Planned V3 provider and execution standards (2026-10-29)

[Canonical V3](generation-architecture-v3.md), **Planned / Not Started**, uses neutral ImageGenerationProvider/OpenAI, CreativeDirectorProvider/OpenAI and VideoGenerationProvider/Higgsfield boundaries. Keep native audiovisual mode/capabilities, minimum continuous segment planning, provider limits and trustworthy segment pricing versioned and generic; endpoints/model fields/tags/payloads belong in adapters. Do not inherit fal.ai capabilities/rates or V2's mandatory external-master speech gate as Higgsfield behavior.

Preserve exact approved direction/references, immutable fingerprints/intents, ownership/currentness, finite authorization, reviewed segment retries and unknown-outcome reconciliation. Multiple segments require review/approval before local joining; single clips go directly to final review. FFmpeg is local technical/join work, not normal creative audio/lip-sync assembly. Voice/lip-sync interfaces may remain future optional capabilities. Historical V1/V2 code and previous test/source authorizations below remain unchanged and superseded for the new normal path; this request permits documentation checks only, no implementation/testing.

## M10 V2 Phase 1 isolation standards (2026-10-29)

The [implemented foundation](final-video-generation-v2.md#implemented-capability-and-segment-contracts) is planning-only under `ugc-final-v2-foundation`, with no network/request-builder/credential/worker/paid-authority surface. Keep the provider extension optional and type-only; never opt V1 into new capabilities or modify its schemas/hash recipes/executions. Strict neutral snapshots distinguish native generated lip-sync from the unverified stronger supplied-speech capability. Plans remain non-executable, fail with precise capability/timing/reference errors, clone approved scenes and retain canonical fingerprints. Adapter rules/pricing stay isolated; no provider names in the core planner. Focused offline tests/TypeScript/lint are authorized for Phase 1; later audio/execution work remains separate.

## Planned V2 execution standards (2026-10-29)

[Final Video V2](final-video-generation-v2.md) is the authoritative future design, **Planned / Not Started**. Extend neutral VideoGenerationProvider capabilities for continuous/allowed durations, external audio reference, multiple references, multi-shot prompting, native lip synchronization, output options, estimator and provider limits. Core must minimize feasible Generation Segments from those capabilities, never provider-name branches or one request per Storyboard scene; vendor fields stay inside adapters.

Preserve creative scenes and exact package approvals. Build immutable exact-duration master audio from verified speech/silence first; bind its version/hash/timing/source assets into segment requests and final manifests. Native-sync Seedance replaces normal separate Kling; generic LipSyncProvider is optional only in explicitly planned compatible workflows. Keep immutable stage/segment fingerprints/intents, finite request/spend authorization, reviewed retries/amendments, private output proofs and reconcile-before-resubmit. Local master/composition recovery cannot regenerate paid work. V1 executions/assets/schemas/history remain untouched; future V2 changes require explicit versions, not rebinding old approvals. Dated per-scene M10 standards below are V1 history. This request changes documentation only; no code/schema/configuration/provider operations are authorized.

## M10 implemented source boundary (2026-10-27)

**M9: Complete. M10: Complete in source for the configured local V1 profile. Runtime/provider/manual acceptance: Pending.** M10 adapters alone translate vendor fields and opaque receipts. Core owns exact immutable scope, finite budgets/intents, leases, recovery and private final validation. No automatic uncertain POST replay or provider fallback. Existing Tailwind/shared controls remain the styling default; FFmpeg stays outside Next.js.

[Source, supported limits, setup and manual acceptance](final-video-generation.md#implemented-local-v1-source-and-profile). This entry supersedes implementation-status and task-permission statements in older dated planning below. No real providers, worker process, remote migration, spending or deployment ran.


## Planned M10 execution standards (2026-10-27)

[M10](final-video-generation.md#automatic-scene-processing-and-lipsyncprovider) owns the planned automated orchestration/scene/sync/manifest/final-only review rules; [voice-generation.md](voice-generation.md) owns voice/profile identity and exact speech/timing. Use internal VideoGenerationProvider, VoiceGenerationProvider and LipSyncProvider interfaces; fal.ai visual, ElevenLabs speech and fal.ai-compatible lip-sync are planned adapters. Vendor payloads/model/voice/request IDs/formats/limits/settings/pricing remain adapter/configuration-private; core consumes neutral versioned commands/results/capabilities. Legacy wrappers are not already these UGC integrations.

One Generate Final Video action admits finite authorized work; do not add manual voice/profile/scene/lip-sync/alignment/stitch gates or provider selectors. Commit distinct video/voice/sync fingerprints, budgets and paid intents before calls. Reuse exact source artifacts, verify private bytes and recover downstream stages independently; no uncertain POST replay or automatic repurchase. Ready scenes are internally validated, not owner-accepted, and automatically feed FFmpeg final composition.

Keep approved package content/words/windows/ratio/order intact; one CharacterVoiceProfile serves all speech. Conditional lip-sync preserves ElevenLabs audio; silent skips are explicit. Trusted final video/audio/sync validation and final approval precede completion. Strategies resolved; exact models/capabilities/output/tolerances/financial persistence remain implementation-time verification. No code/test runs in [current documentation scope](ai-workflow-rules.md#automated-m10-documentation-scope-2026-10-27); Render/Inngest remain disabled.

## Generation-package standards (2026-10-27)

M9 is Complete and approved per the owner; [the canonical contract](video-generation-package.md) owns actual fields, deliberate cross-language hash recipe, immutable versions, state/recovery and private DTO rules. Reuse its strict schemas and deterministic builder rather than creating parallel package types. Preserve exact approved source versions and integer-ms scene content. Rebuild/reapprove stale content; never mutate a saved payload, validation receipt or approval evidence.

Core UGC/Storyboard/package logic must not import provider SDK/request types, model IDs or vendor payload fields. `VideoGenerationProvider` is an interface only; capability matching and adapters are M10. Unsupported/unverified required features must later block before paid execution, without fallback. Database ownership/current-input/unique/version/lease fences remain authoritative. [Current testing/execution restrictions](ai-workflow-rules.md#milestone-9-preparation-scope-2026-10-27) override historical recipes below; M9 completion/approval is owner-confirmed; no acceptance is rerun in this documentation task.

## Storyboard target margins and manual text repair (2026-10-27)

Separate preferred speech targets (75% of unchanged absolute count ceilings, clipped by per-line pauses) from hard limits. Prefer >=900ms physical actions; retain >=700ms validator minimum. Timing-only correction must report both speech and action/scene failures with exact intervals/counts/targets/minima and retain the two-request fence. Final canonical output must pass the explicit deterministic `finalizeStoryboard` gate immediately before saving. Never invent or shorten dialogue locally. An explicit owner manual repair may edit only `speech[].text` for completed schema-valid speech-budget-only responses; enforce the structural diff on the server, run all validators, preserve raw requests and save directly to review through scoped service-only 067. No worker/provider/credit/parent reset. [Current contract](storyboard.md#timing-targets-and-manual-dialogue-repair-2026-10-27) supersedes earlier target-as-hard-ceiling and delete-only guidance.

## Storyboard generation plans time before text (2026-10-27)

Supply calculated scene/utterance and aggregate speech ceilings in new-request context before composing dialogue. Reserve actual action/camera/reaction/transition and breath time; floor both word and nonspace Unicode-character limits at the chosen original pace. Recommendations supplied for generation are hard prompt ceilings below the unchanged validator maximum. Do not solve overlong dialogue by faster speech, relaxed validation or automatic local rewriting. Only pure prompt/correction helpers may be tested without provider/worker execution. Group speech-only word/character errors with exact scene/line/timestamps/duration/max/current counts for the existing single correction; retain all original intent/count/recovery fences. No extra planning request or output-schema field. [Current contract](storyboard.md#speech-budget-planning-before-dialogue-2026-10-27).

## Storyboard validation diagnostics and local-only Retry (2026-10-27)

Keep the strict schema and business constraints separate from safe equivalent-format normalization. Never rewrite creative content, speed the voice, relax budgets, replace assets or change selected inputs to accept invalid output. Preserve original bytes; normalize a clone, then validate every field and business rule. Emit bounded safe rule/path/expected/received/type/scene reports, including structured JSON parse failures without raw exception text; never log dialogue or provider bodies. Explicit Retry only admits a saved completed candidate that now passes locally, checks newest-first, and cannot import/call the generation **or retrieval** adapter. It must not waste claims on known invalid content. Future first-claim bounded correction receives precise validation feedback; limits stay unchanged. [Current evidence/contract](storyboard.md#saved-output-validation-investigation-2026-10-27) supersedes the GET-enabled Retry standard below.

## Storyboard provider durability and recovery-only retries (2026-10-26)

Preserve safe request/client/response IDs from streamed headers/creation events. Fsync raw terminal output before extraction, heartbeat, DB persistence or storyboard parsing; publish complete immutable files atomically and preserve complete returned bytes on publication failure. Never log raw API errors/content. Explicit saved-work retries and reclaimed executions may validate saved output or GET the exact retained response, but may neither create nor pay for a correction. Only the original explicit Generate claim can spend its bounded initial/corrective budget. Missing output must stop, with no intent clearing/attempt reset. Keep store:false unless the operator explicitly enables future provider retention; freeze that choice per request. [Evidence and contract](storyboard.md#provider-timeout-evidence-and-recovery-only-correction-2026-10-26).

## Worker claim transport and queue isolation (2026-10-26)

Never use RPC data truthiness as a composite claim/checkpoint/command success test. Normalize null/[]/all-null envelopes and require real scoped IDs, runnable states, token and lease before executor I/O; approved Location work must be rejected. Preserve actual database codes/phase without raw messages. Keep independent local queue scheduling and bounded transport failure budgets; successfully persisted job failures must not quarantine unrelated records. Logs may include technical project/job IDs, phase/category and retry state, never claim tokens, private media paths/content, credentials or provider bodies. Studio must distinguish unclaimed queued work from active/stalled/paused/failed work using persisted facts. [Correction evidence and restart policy](storyboard.md#location-empty-claim-starvation-correction-2026-10-26).

## Milestone 8 — Storyboard boundary (2026-10-26)

Storyboard reasoning belongs in the existing local UGC worker, never a request or hosted adapter. Require strict server parsing plus exact integer-ms coverage, one asset per role, ordered realistic action/speech budgets and current approved versions for both generated and edited documents. Centralize explicit OpenAI model configuration; no model fallback, SDK retry or replay of unknown paid outcomes. Persist each bounded request intent/receipt and recover local output before any new call. Commands remain owner-authorized, no-store, same-origin and size-bounded, with database version/lease fencing. Preserve upstream providers, approved assets and financial rules. See [storyboard.md](storyboard.md). Tailwind plus the existing globals stylesheet remains the only frontend styling policy.

### Location correction — deletion and recovery

Reject/cleanup and Retry saving are separate provider-free storage services (`cleanup.ts`, `recovery.ts`). Neither may import an image provider, submit a paid request or enqueue a replacement. Check owner/project/job/root ID/version/lease and accepted pointers before touching a candidate. Fsync candidate-bound private local bytes before R2 persistence, retain immutable output proof and safe phase/DB/HTTP/cause codes, and reconcile uncertain PUT against the same key. Never replace a useful saving error with generic provider reconciliation. Local recovery files stay outside public directories and SQL; explicit rejection removes only its own file. No upstream reference/accounting changes.

## Milestone 7 — Location standards (2026-10-26)

Location provider requests belong only in `lib/location-reference/provider.ts` via a narrow provider interface; long work belongs in the existing local UGC worker. Routes only authenticate, validate bounded same-origin input, enqueue transitions or serve hash-checked private images. Never accept a client-authored plan, owner ID, storage key, provider settings, approvals or scene snapshot. Plan content/scene/provider intent remain server-only; Studio receives status and image-review metadata. Service-only SQL derives saved inputs and enforces scope, current upstream approval versions, root ID plus review version, immutable revision context, lease tokens and fenced rejection. Persist intent before a paid call; do not automatically retry unknown outcomes. Technical image checks only; semantic quality remains manual. Existing Character/Product contracts and accounting remain unchanged. [Location specification](location-reference.md).

## Character V5 manual review (2026-10-25)

**Character V5 — Complete in source. V4 is superseded for new Character work. Manual migration 054 and provider/visual/runtime acceptance pending. Milestone 7 remains Not Started.**

Original image → static Soul 2 Face → manual Accept → static Back → manual Accept → static Front source conditioned on accepted Back → manual Accept → local adjustable Sharp headless Front → manual Accept → local FRONT / BACK / FACE sheet → explicit Approve Character Reference. Each paid stage waits for the previous user acceptance. Technical checks only; no automatic semantic rejection or OpenAI prompt/crop validation in V5. Private candidates are separate from accepted canonical pointers; Reject fences the candidate, deletes its R2 file, then clears its image pointer while retaining minimal audit metadata. Historical V1–V4 records remain readable and unchanged. Product generation, views and approval stay the same; only its Character dependency resolver admits approved V5 workflows.

[Authoritative V5 contract, setup, cleanup and verification limits](character-sheet.md#character-v5-manual-review-2026-10-25). Source-only authorization: TypeScript, focused lint and static/schema checks. No provider calls, worker/job execution, live mutation, cleanup runs, R2 deletion, remote SQL, builds, deployment, Render/Inngest or Milestone 7. Older sections below describe historical versions.

V5 semantic checks must never enter the technical candidate-admission path. Keep static versioned prompts centralized, promote only explicit user acceptance, fence every decision by ownership/version, checkpoint before paid requests, and never interpret an unknown intent as permission to resubmit. Rejected artifact deletion is an explicit durable transition; no background bucket sweep or canonical deletion is permitted.

## Character V4 — future implementation standards (2026-10-25)

**Complete in source; manual 053/provider/visual/runtime acceptance pending.** Follow the [official V4 contract](character-sheet.md#character-v4-official-workflow-2026-10-25), which supersedes older Character strategy/order/version/setup instructions below. Historical source-complete statements are not V4 acceptance. V3's Front-first strategy is superseded for new Character references; preserve V1/V2/V3 records, assets, receipts and actual versions unchanged and interpretable.

- Enforce **analysis → Soul ID → Face → Back → Front source → local headless Front → Character Sheet → review/approval** in the server/worker dependency contract; UI order alone is insufficient. Do not start a dependent step until upstream validation and persistence succeed.
- Keep Higgsfield Soul 2 Image-to-Image and Soul ID behind the existing provider boundary. OpenAI retains Character analysis and later storyboard/script generation. Front source uses validated Back as its main outfit/body reference and Face/Soul identity support. Never request a headless human or final sheet from the provider.
- Distinguish provider `front_source` from local canonical `front_reference`, including asset identity, hashes, validation and safe crop provenance. Validate each provider view and local crop independently; compose only validated headless Front + Back + Face locally on gray. Rejected candidates remain private history, never canonical.
- Preserve successful analysis/identity/views and accepted receipts on failure. Face/Back/Front generation retries target only the failed step; crop and composition retries perform local work only. Unknown paid outcomes require reconciliation, not replay or budget resets.
- Freeze Character prompt **4**, generation contract **4**, strategy **`face-back-front-v1`** for future V4 operations. Do not confuse these with existing snapshot/document/storage/review versions or invent deployed fields/admission support.
- Project only safe real persisted events into the exact [V4 progress order](character-sheet.md#persisted-progress-and-references-ui); no fake progress. References uses Original, Face, Back, canonical headless Front, Character Sheet; diagnostics may inspect clearly labelled `front_source` privately. Keep explicit version-bound approval and ownership enforcement.

Product / Prop behavior and standards remain unchanged. Milestone 7 — Not Started. Current authorization permits source changes and TypeScript/focused lint/isolated static/schema checks only; no providers, workers/jobs, live mutations, remote migrations, builds, deployments, Render or Inngest.

Implementation refinement: the original may be reused as Face only after the complete V4 portrait contract, including neutral gray, passes; persist its origin. Explicit Face replacement invalidates Back + Front + Sheet/Character approval; Back replacement invalidates Front + Sheet/Character approval; Front replacement preserves Face/Back. Local crop/sheet repairs reuse paid output. See [current setup and acceptance limits](character-sheet.md#manual-setup-and-source-acceptance).

## Milestone 6.6 — Reference Regeneration + Review UX Correction (2026-10-24)

**Milestone 6.6 — Reference Regeneration + Review UX Correction — Complete in source. Manual migration/provider/runtime/ownership/visual acceptance pending. Milestone 7 — Not Started.** This section supersedes the historical 6.5 request-only execution and exclusive Preview rules below. [Current execution, versioning and manual setup](reference-review.md#milestone-66-execution-and-review-contract).

Every long-running reference regeneration must expose real persisted progress. Persist intent before dispatch, immutable provider receipts before polling/download, validated private views before publication, and compose only from effective successful assets. Never repeat analysis/training or replay an uncertain paid request. Reuse 046 review requests, job-first locks, fenced leases, canonical private paths and append-only job events. Keep provider details/checkpoints/storage keys server-only. Preserve Tailwind-only styling and session-bound 120-second preview capabilities.

## Milestone 6.5 — Reference Asset Review (2026-10-24)

**Milestone 6 — Complete. Milestone 6.5 — Complete in source; manual 046/runtime/ownership/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This supersedes older stop points below. [Review UI, security, persistence and setup](reference-review.md).

Authenticate and owner-check preview issuance, image redemption and mutations server-side. Return expiring signed same-origin capabilities so no R2 key reaches the browser; never persist URLs. Lock the job before version-pinned approval/request updates, keep immutable source asset documents and derive state without fake progress. Reuse Base UI/Tailwind and the current polling owner.

Input → Reference Analysis → Character Reference generation → Character Review/Approval → Product Reference generation → Product Review/Approval → Location Reference → Storyboard → Generation Package → Final Video → Preview. Existing cost-confirmation/accounting gates remain. Apply 046 manually after 045; no new environment/dependency. Render/Inngest remain disabled. No provider, worker/job, storage request, remote SQL, browser/screenshot, build or deployment executed. Stop after 6.5.


## Milestone 6 — Product / Prop Reference Sheet (2026-10-24)

**Milestone 5 — Complete. Milestone 5.5 — Complete. Milestone 6 — Complete in source; manual migration/provider/runtime/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This current authorization supersedes older M6-not-started stop points below. See [Product Sheet contract and manual setup](product-sheet.md).

Use centralized ProductSheetProvider/factory/config, Product asset/error/version constants and strict documents. Server-only OpenAI edits use original source bytes, never text-only generation or Higgsfield host validation. Durable intent before dispatch, receipt/usage before storage, successful asset reuse and immutable R2 PUT protect paid work. RPCs enforce owner/frozen-input/claim/lease/cancellation/stage boundaries; safe DTOs project no keys/provider diagnostics.

Pipeline: Input → OpenAI Reference Analysis → Character Reference Sheet → Product / Prop Reference Sheet → Location Reference → Structured ChatGPT Storyboard → Generation Package → Final Video → Studio Preview. Existing cost-review/accounting gates remain. Apply pending 044 and new 045 manually; use OPENAI_PRODUCT_SHEET_MODEL=gpt-image-2.5-sunburst and explicit UGC_PRODUCT_SHEET_ENABLED=1 with the existing private OPENAI_API_KEY. Render/Inngest remain disabled. No providers, workers/jobs, private media operations, remote SQL, browser/screenshot suites, build or deployment were executed. Stop after M6.


## Persistent live workflow feedback — Milestone 5.5 (2026-10-24)

Every long-running Sceenyk generation workflow must provide persistent live progress feedback from real server-side state. The user must never be left staring at an unexplained empty Preview while a background workflow is running. Reuse owned jobs, append-only events and existing provider checkpoints; never create simulated progress, elapsed-driven completions, precise invented percentages/countdowns or a second progress store.

Progress reads independently authenticate Project/job ownership and explicitly project safe fields. Never serialize private documents, signed URLs, keys, provider identities/diagnostics, credentials or raw errors. New progress events use fixed safe messages plus allowlisted view/attempt/stage metadata and commit alongside the checkpoint. Keep successful output diagnostics and assets intact. Front/back/face ready requires saved assets, not remote completion alone. Old records fall back to their persisted checkpoints without mutation/backfill.

Long-running active workflows may poll, but paused and terminal workflows must not continuously poll. Use an authenticated private/no-store JSON endpoint at 2.5 seconds after an unpaused queued/running/provider-waiting read settles, including transient failures; stop with no known active job, intentional pause/awaiting confirmation, or terminal status. Keep the non-terminal duplicate-enqueue guard separate from shouldPollUgcProgress. Paused Check status and visible page/tab return perform one read; future server-confirmed resume handlers call refreshAfterResume and only persisted active state restarts the loop. Do not poll through Studio Server Actions/Flight, refresh/revalidate/navigate the page, synchronize user profiles, or reset shell/loading state on background reads. Use a single scope-dependent loop; coalesce manual checks behind in-flight reads, abort requests/remove focus/visibility listeners on cleanup, and retain previous successful progress on delay/failure. Discover once on reopen without enqueue, then read the known job. Keep job visibility independent of dirty input revision and control mounting. Use heartbeat/lease for warnings; slow providers with healthy heartbeats are not stalled. Timers update display/read scheduling only. No automatic retry or new generation on read/recovery. Static expectation copy is isolated for later historically derived estimates. [Implementation/setup](generation-jobs.md#milestone-55--live-generation-progress-2026-10-24). **M5.5 Complete in source; M6 Not Started.**

Processing time must use persisted active segments, never original started_at plus wall time. Manual 044 records cumulative leased running milliseconds on existing claim/heartbeat/transition writes, caps late recovery at lease expiry and freezes queued/paused/terminal segments. Old or unmigrated jobs have unknown timing and show Started earlier; never fake zero or reconstruct unreliable history. Preserve original start timestamps and all checkpoints. A paused Product stage with completed Character output uses completed-Character copy and a waiting Product label; never imply Product started before real persisted execution.


## Milestone 5 — Character Sheet (2026-10-23)

**Complete in source; manual migration/provider/runtime/visual acceptance pending. Exact next: Milestone 6 — Product / Prop Reference Sheet generation. Not started.** [Character Sheet contract and manual setup](character-sheet.md) supersedes older M5-not-started/OpenAI-Character-image assumptions below; historical evidence remains intact.

Use CharacterSheetProvider/factory and centralized server-only SOUL2 configuration. Centralize asset types, schemaVersion=1 and character-sheet-v1. Persist wardrobe/instructions before calls; use claim-fenced intents/receipts, resume known IDs, reconcile unknown outcomes and retain successful views. Bounded server-side Sharp composition/private immutable R2 only. No PostgreSQL binaries, public keys/URLs, provider error bodies, credit changes or template asset transfer.

Approved full flow: Input → validation → OpenAI analysis → SOUL2 Character Sheet → Product Sheet → one primary Location → structured ChatGPT storyboard/script + stable voice specification → generation package → cost review/confirmation → final video → finalization → Studio Preview. No later stage is implemented. User confirms 039 applied; verify/apply 040 then new 041 manually. Render/Inngest remain disabled; only user-started local worker execution. Codex made no provider calls, ran no jobs/worker, applied no hosted SQL and deployed nothing. Offline in-memory schema validation is separate from manual runtime acceptance.

## Reference-name standards - M4/M5 prerequisite (2026-10-23)

Use lib/projects/reference-names.ts as the shared 80-character trimmed draft/required-name schema. Empty draft values persist as null; generation requires nonempty labels and stable UGC_CHARACTER_NAME_REQUIRED / UGC_PRODUCT_NAME_REQUIRED issues (bounded invalid-value issues are separate). Reuse existing owner-authenticated Project Save/status; never issue per-keystroke name RPCs or depend on display labels for authorization/storage paths. The name batch RPC checks every asset under the owned Project lock before changing any labels.

Use immutable snapshot v3 for new requests and retain v2 compatibility for already-created jobs. Current name equality is admission-only: later draft renaming must not mutate or invalidate a valid frozen name. Preserve media fingerprint checks and per-job completed-analysis reuse. Creator labels are untrusted prompt data, not identity/brand/appearance evidence. [reference-name contract and setup](ugc-v1-workflow.md#project-specific-reference-names--prerequisite-before-milestone-5). Milestone 5 remains Not Started; manual acceptance and minimal checks only.

## Milestone 4 - analysis standards (2026-10-23)

**Milestone 4 — Complete in source; manual migration/provider/runtime acceptance pending. Exact next: Milestone 5 — Character Reference Sheet generation. Not Started.** Follow the [provider/schema/privacy/setup contract](reference-analysis.md). All API access belongs in the server-only OpenAI adapter behind ReferenceAnalysisProvider; the workflow uses the abstraction. Use Responses text.format with strict SDK-generated schemas, then application validation before claim-fenced persistence. Central environment configuration has no default model, no browser key, no provider fallback, SDK logging off and maxRetries zero. Freeze requested model/schema version at durable submission intent; retain returned-model/usage separately.

Central prompts reference-analysis-v1 permit only observable generation-relevant traits and explicit uncertainty; no real-person identification, sensitive inference, invented unseen geometry or image-instruction execution. Private conditional R2 bytes become bounded ephemeral PNG inputs; never public URLs, persisted base64/raw responses or description-bearing logs. Persist each role before the next API call; completed analyses are immutable. Unknown submission outcomes never become ordinary retryable work. Only definite auth/rate rejection or pre-submission configuration/storage failure can use explicit bounded retries. No credit/accounting effects.

New validation continues directly into analysis; both completed records gate the character_reference pause. Do not add the Milestone 5 handler or a generic bypass. Current selection durations derive from shared 5/10/30 constants; the stored schema retains a separately named legacy 15 value for old projects/snapshots. Fresh UGC readiness/advisory/schema and enqueue SQL reject 15; do not rewrite historical records. Minimal TypeScript, focused lint and offline schema/static review only. Render/Inngest remain disabled. Earlier milestone restrictions below are historical and superseded for this unit.

## UGC readiness / immutable input standards — Milestone 3 (2026-10-23)

Use [`lib/ugc-jobs/validation.ts`](../lib/ugc-jobs/validation.ts) as the one authoritative server validator and `input-contract.ts` for snapshot/error/narration contracts. Reuse existing Studio/project schemas and MIME rules, with outer-whitespace normalization only. Public readiness is `{ready,issues:[{code,field,message}]}`; never return normalized private snapshot/media/provider details. Interactive services authenticate independently; worker ownership comes from its persisted claimed job.

Before any new enqueue, validate, then compare the complete normalized snapshot against locked Project/reference records through the new validated RPC. Retain database uniqueness and immutable snapshots for retries; revoke the previous unvalidated RPC rather than leaving a bypass. Worker validation uses exact frozen IDs/settings, owned/private storage verification and the claim-fenced checkpoint RPC. Its success records validation and a queued analyze_references pause; do not mark intentional missing analysis Failed or let generic advance bypass validation. No financial/provider work.

UI readiness must invalidate on unsaved edits/unsettled uploads, ignore stale responses and only enqueue on an explicit click. Use shared compact Tailwind controls, safe issues and existing account fencing; do not route UGC into legacy cost/generation hooks. Actual Studio enums remain authoritative (10/15/30 currently; 5 unimplemented). Apply only manually authored 037 after prerequisites; minimal compile/type/static review only. **Milestone 3 source Complete; next 4 Not Started.**

## UGC job implementation standards — Milestone 2 (2026-10-23)

Actual source/setup: [UGC job infrastructure](generation-jobs.md#ugc-generation-jobs--milestone-2-complete-in-source-2026-10-23). Use `lib/ugc-jobs/contract.ts` for statuses, stages, messages, adjacent transitions and retry/timing constants. The SQL graph/constraints mirror it; future stage code must use `worker-service.ts` and guarded RPCs, never direct status/stage updates. Keep the portable `UgcJobRunner` separate from `LocalJobRunner` polling/process setup and retain the empty default handler registry until each stage is explicitly implemented.

Interactive enqueue/read/cancel/retry services are server-only and authenticate independently. Derive the owner from Clerk/application identity; return safe DTOs, never full job snapshots/provider/lease fields. Database uniqueness, owned FKs, RLS/no browser grants, restricted SECURITY DEFINER RPCs, immutable identity/snapshots and append-only event triggers enforce the boundary. Job creation is infrastructure only, not accounting admission. Later provider attempts/assets/charges require their own unique persisted identities and existing financial gates.

Every worker write requires a live fresh claim token plus expected stage. Preserve serialized heartbeat/state updates, 90-second leases, 20-second heartbeats, 5-second polling, default 3 claims and explicit bounded retry eligibility. Only pre-provider validation can auto-recover; later uncertain stages stop for reconciliation. Do not implement a generic confirmation/completion bypass; future quote/output/accounting gates must be added separately. Keep `SCEENYK_LOCAL_JOBS_ONLY=1` and bypass all hosted Render/Inngest execution.

Milestone 2 is Complete in source, with manual migration/runtime acceptance pending. Only minimal TypeScript/lint/static SQL/link/whitespace review is allowed here: no integration/browser/screenshot/full regression suites, production build, test jobs, worker startup, remote migration or provider calls. **Next milestone 3 is Not Started.**

## UGC V1 implementation contract and execution safeguards (2026-10-23)

Read [ugc-v1-workflow.md](ugc-v1-workflow.md) before UGC work. Milestone 1 is Complete; the pipeline and Milestone 2 are Not Started. Reuse current owner/project/media/accounting boundaries; inspect the actual database catalog before additive schema design and never treat conceptual UGC fields/stages as existing columns/enums.

- UGC requires one verified uploaded owned Character and Product, valid full brief/settings and supported narration. Future UGC durations are 5/10/30; current 10/15/30 shared validation needs a versioned compatibility change in Milestone 3, preserving Freestyle and historical projects.
- Use official OpenAI API/SDK adapters for UGC reasoning, source analysis and generated reference sheets; no Gemini fallback. Resolve provider/text/image models centrally from server-only configuration, freeze resolved versions per run and validate capabilities. No OpenAI SDK integration/model choice is implemented here.
- Persist structured, schema-versioned storyboard/package data with stable actor/product/speaker IDs, integer-ms timing at persistence boundaries, server semantic validation and private asset IDs. Binary originals/sheets/videos belong in private R2. Publish only an explicit public-safe template projection with logical slot IDs and future required counts 1/1, never private asset/provider/storage identifiers.
- Keep stage/business services independent of the runner and video provider. Claims/leases/CAS, durable submission intent/checkpoints, provider uncertainty reconciliation and idempotent callbacks/output/accounting protect retries. Never replay an uncertain paid request blindly or infer completion from submission.
- Preserve server quote review/explicit confirmation and existing ledger/reservation/settlement rules. Resolve preparation funding/consent before paid analysis/sheet/storyboard stages; do not invent charges or relax existing reservation gates.
- Keep `SCEENYK_LOCAL_JOBS_ONLY=1`; missing/invalid values also enforce local-only. Its guards block Inngest transport/ingress and non-loopback media-worker requests. Setting exactly `0` is a later explicitly approved legacy-hosting action, not part of UGC development. Do not delete preserved Render/Inngest configuration, auto-start services or confuse the legacy FFmpeg worker with the future UGC runner.
- During this UGC phase, do not automatically run browser/screenshot/full regression/deployed/provider-generation/OpenAI/video/hosted-job tests or paid calls unless explicitly instructed. Only the smallest compile/type/static checks are allowed. Historical broader verification instructions below are superseded for this phase; user manual acceptance remains pending until reported.

## UGC V1 validation (2026-10-22)

UGC V1 supports exactly one Character and one Product / Prop per project. Incomplete drafts may have zero, but state and persistence must reject a second reference with a clear message. Count pending/rejected and local images as occupying a slot; do not silently truncate arrays. Reuse the shared V1 schemas/messages, owned upload/read/removal services and project_assets/R2 model. Migration 035 serializes active role insertion/reactivation/finalization per owned project without deleting older extras or changing Freestyle. Legacy extras stay readable/removable and block UGC saves/generation readiness until reduced. Future generation requires exactly one uploaded owned reference of each role plus valid UGC brief inputs; no pipeline in this unit. Adopting users must supply their own Character/Product references for UGC templates before generation.

## Remote async loading composition (2026-10-21)

- Keep stable shells, headings, navigation and safe static controls synchronous. Resolve actual request-bound/uncached data and promised runtime params inside dedicated async Server Components below local Suspense boundaries, following `/projects`; do not start/await that work in a parent before wrapping its resolved JSX. Shared-layout boundaries alone do not cover every client navigation.
- Reuse `components/ui/skeleton.tsx` primitives and feature-specific compositions matching the final UI dimensions. Share real gallery grid classes and existing scroll/panel owners. Use Tailwind/theme tokens and motion-safe animation; no standalone CSS or generic spinner for primary content.
- Client effect/action reads use real existing pending/settled/error state rather than decorative Suspense. Retain loaded content during refresh; append matched cards for pagination while preserving its cancellation, identity, duplicate and cursor guards. Skeletons must disappear on failure and leave existing error/empty/retry behavior available.
- Do not add timers/minimum display durations, placeholders for immediately available local/static content, shared authenticated caches, weakened authorization/ownership, or changed financial/generation logic. Expose meaningful loading status and keep decorative skeletons inaccessible. Validate proportionately; [the loading audit](progress-tracker.md#remote-loading-audit-2026-10-21) records the route/component audit and manual limits.

## Studio creation inputs (2026-10-20)

The current feature supersedes prior UGC-only UI restrictions. Persist creationType/ugcType independently of legacy category and retain both source roles on switches. New Studio drafts explicitly choose UGC; omitted older payloads/projects use Freestyle and Advertisement. Reuse existing owned draft/private-media services, validate UGC references as images, retain stable reference grouping IDs, and authorize every reference removal/read by current owner and project. Removal detaches one UGC image without deleting storage/history or Freestyle media. Only Freestyle reaches the existing generation controls in this unit. Use shared Select, Tailwind and the unchanged Studio layout; do not implement sheets/scripts/videos. Migration 032 must precede application use; record local versus hosted evidence separately.

## Studio containment and Credits tab rules (2026-10-20)

Creation Type in Sources uses shared Select with exactly one UGC label, retaining the current internal category enum/value. Studio explanatory copy stays concise: feature heading/control and at most a short description, with necessary dynamic errors/status and financial confirmations retained. For mobile Studio, constrain shell/frame/grid/panels/media with dynamic viewport height and min-height:0; keep the Stage stationary and make only the Properties body scroll, outside its fixed header. Use Tailwind utilities and existing presentation portals without duplicating media or changing state/handlers.

Earnings & Payouts belongs at /credits/earnings alongside Credits & Billing at /credits. Reuse account layout and financial components/services, preserving owner checks, generated-response cache policy, paging queries and legacy redirects. Update direct links and page invalidation when relocating sections. Do not change payment/withdrawal calculations, schema or provider workflows for these UI changes.

## Account route and Select safeguards (2026-10-20)

Credits & Billing belongs at /credits, not in Settings navigation. Reuse SettingsWorkspace and the active account-layout marker for the two-column fixed-header/native-scroller geometry; keep separate route/view identity. Moving private account UI requires equivalent proxy guards, Next HTML/RSC/prefetch/segment and Vercel final-response private/no-store policies, legacy query-preserving redirects and cache invalidation. Reuse financial components/services; do not change provider callback or accounting contracts for a page move. In Base UI Select, undefined uses the default portal while explicit null defers mounting; do not pass null for ordinary selects. Sidebar hints default to compact 11px type and 4px trigger spacing.

## Shared Select and interaction affordances (2026-10-20)

Future app-owned user-facing dropdowns must reuse components/ui/select.tsx, using the installed Base UI Select rather than a second Radix/custom state system. Do not expose native browser select menus unless technically unavoidable and explicitly documented. Follow the [compact Select standard](design-system.md#shared-select-pointer-cursors-and-fixed-studio-type-2026-10-20): small trigger/options/check, theme tokens, keyboard/typeahead/focus/dismissal, grouped choices and 180–250ms soft ease-out/reduced-motion behavior. Keep named form values, validation, disabled fieldsets, readiness guards and existing callbacks. The only visible popup implementation belongs in the shared component; no standalone CSS. Do not replace non-dropdown control patterns.

Use pointer cursors for genuine clickable buttons/links/cards/triggers/options/tabs/navigation/role controls, with actual disabled states and appropriate disabled cursors. A minimal shared semantic base rule in app/globals.css is authorized; ordinary styling stays Tailwind-first. Studio Creation Type is fixed visually to UGC in Sources after Your Project and before Project Media, not in Properties. Carry WorkspaceEditor's existing category without inventing a UGC enum or rewriting saved/adopted/restored/default categories; generation/save contracts stay intact. Shared Select portals must remain reachable inside native dialogs and preserve independent scroll ownership.

## Motion & Interaction Standard (2026-10-20)

Future UI must respond immediately, finish softly and use the [approved motion tokens](design-system.md#motion--interaction-standard-2026-10-20) in app/globals.css. Ranges/defaults: micro 150–200/180ms; popup 180–250/220ms; modal 220–300/260ms; sidebar/panel 250–350/300ms; optional reveal 300–500/420ms. Easing: cubic-bezier(0.22, 1, 0.36, 1). Use Tailwind transition properties, token durations/easing, restrained transforms and opacity. Reuse components/ui/motion.ts for Base UI popup/backdrop presence; preserve unmount/close lifecycles, focus/keyboard behavior and accessible labels. Keep icons/row geometry stable during sidebar collapse and synchronize the main inset. Prefer subtle card lift/preview zoom/color feedback. Do not add animation state, timers, blur transitions, bounce or another framework for simple effects.

Use components/ui/smooth-scroll.tsx for ordinary surfaces; never introduce a global nested-panel controller or change infinite-observer roots. Lenis owns its own frame loop and follows active-route cleanup, scroll locks and responsive scroll-root changes. Documentation, Settings center/navigation, Studio panels, modal content and touch scrolling remain native. Destroy inertia when prefers-reduced-motion changes, suppress nonessential transforms and shorten/remove transitions. Native anchors/keyboard/history retain control. Shared discrete native-dialog transitions and Lenis compatibility rules are the minimal CSS exceptions in the sole global stylesheet; ordinary styling stays Tailwind-first. Allow instant behavior only where platform/technical constraints require it. Preserve backend/business/security contracts. Use Fast UI Development Mode for motion-only tasks.

## Styling Policy

**Approved 2026-10-19; applies to all future frontend work unless the user explicitly instructs otherwise.** Sceenyk uses **Tailwind CSS + global.css**, not **Tailwind + scattered component CSS files**. Tailwind CSS is the primary and default styling system. This policy takes precedence over older styling guidance, reference snippets and implementation history in the context documents.

**Global stylesheet name:** the policy's `global.css` refers to the single existing global stylesheet, [`app/globals.css`](../app/globals.css), already used by the root layout and shadcn configuration. Keep that existing filename; do not create a second `global.css`, rename files or change imports as part of this documentation update.

### Required rules

1. Use Tailwind utility classes directly in React/Next.js components for layout, spacing, sizing, typography, colors, borders, radius, responsive behavior, hover/focus/active states, transitions, positioning, overflow, flex/grid and light/dark themes.
2. Do not create new page-specific or component-specific `.css` files.
3. Do not create CSS Modules, including `*.module.css` or `*.module.scss`.
4. Do not use inline `<style>` blocks or styled-components unless an existing dependency absolutely requires that mechanism. Document the dependency requirement; it does not authorize introducing another styling framework.
5. `global.css` (the existing `app/globals.css`) is the only approved custom CSS file for normal application styling.
6. Use it only for genuinely shared/reusable styling that Tailwind cannot express cleanly or would express awkwardly: global CSS variables/design tokens, base/reset styles, font declarations, reusable scrollbar-hiding utilities, shared animation keyframes, reusable browser-specific fixes, shared utility classes and third-party library overrides.
7. Do not move ordinary component styling into the global stylesheet just to avoid Tailwind. Repeated utility combinations should first become reusable React components or component variants.
8. Prefer existing Tailwind design tokens and reusable React components before adding any new global CSS.
9. Reuse the current Sceenyk Tailwind theme, spacing system, breakpoints, colors and light/dark behavior. Preserve accessibility and existing shared component behavior.
10. When modifying a component that currently imports a separate CSS file, prefer migrating the relevant styling to Tailwind within that future UI task. Do not automatically perform a large unrelated CSS migration. Remove an old stylesheet only after all its styles and consumers have been safely replaced and its import is no longer needed.
11. Do not introduce another styling framework.
12. Future Codex UI implementations must use Tailwind as the default styling approach unless the user explicitly instructs otherwise. Existing separate stylesheets are legacy implementation, not permission to create more.

### Exceptions

Custom CSS is allowed only when Tailwind is genuinely unsuitable, such as complex keyframe animation, browser-specific pseudo-elements, unsupported selectors, third-party component overrides or specialized visual effects that cannot reasonably be expressed with Tailwind. First consider existing utilities, variants and arbitrary values/selectors. When an exception is necessary, place it in the single global stylesheet, keep it reusable and minimal, and explain why Tailwind alone was insufficient in the implementation notes and completion report. Ordinary responsive layout, overflow, hover states or a long class list are not exceptions. The dependency-required mechanism in rule 4 must be explicitly explained as such.

This policy does not authorize deleting existing CSS files or starting a repository-wide migration. Historical descriptions of separate stylesheets remain implementation evidence, not the styling approach for new work.

**Migration status (2026-10-19):** a subsequent explicit user request authorized the repository-wide styling migration. It is now implemented in source: app/globals.css is the only project-owned stylesheet, and ordinary styling lives in static Tailwind component classes. Shared exact-breakpoint variants and existing lower-priority component defaults remain Tailwind configuration/cascade choices, not new stylesheet infrastructure. Runtime CSS values may remain in style props; the isolated next/og image renderer requires its own inline styling. Preserve these exceptions and do not reintroduce separate stylesheets. Visual acceptance remains manual; see the progress tracker.

## Focused Studio refinement and canonical URL (2026-10-18)

The latest request supersedes the earlier edge-to-edge Sources overlay and side-by-side tablet layout. Studio is canonical at /studio; /create permanently redirects with query parameters, while owned /projects/[id] routes and existing handlers remain unchanged. At desktop viewport widths with at least 930px available Studio width, Sources/Stage/Properties use 254px/flexible/252px columns. Otherwise Stage precedes Properties; Sources opens as a 254px right-side nonmodal panel from 768px viewport width, or as a focus-managed modal inset 8px on every edge below 768px. One mounted Sources tree retains inputs and local media. Only the mobile modal locks background scrolling. Cached route deactivation releases the native Sources dialog and its body lock; reactivation resynchronizes its CSS mode without remounting controls. Root scrollbar hiding uses active WorkspaceShell effects, because hidden cached DOM must not affect the public landing page. Toolbar controls are 32px with a centered compact aspect segment/popover for the existing 9:16,16:9,1:1 choices; no invented Share or generation options. Existing completed-video download appears as Export in the toolbar through a presentation-only portal; URLs, fetching and handlers stay with the existing result component. At 320px the selected ratio/menu and icon-only Save/Export preserve space and accessible names. Workspace-only scrollbar hiding preserves scrolling and leaves public landing scrollbars unchanged. Preserve logos, themes, business logic and ownership; no hosted Inngest. Stop after Studio review.


## Pryzm reference implementation — Phase 1: Studio (2026-10-18)

Current authorization: use Pryzm_Design_System_Reference_for_Sceenyk.md as the primary workspace geometry reference, with the supplied screenshots for refinement. Implement Studio and necessary shared navigation/frame geometry only, then stop for user review. Templates/Marketplace, Documentation, Projects/Settings and public pages are later phases; preserve their current presentation and existing work. Keep Sceenyk's official logos, configured font, existing colors/themes/features and all backend/auth/financial/provider contracts. No hosted Inngest, generation, checkout or deployment acceptance.

Geometry decisions: a reusable workspace-only token layer; 252px navigation plus an 8px gutter (preserving the current Studio x260 frame position), 64px collapsed rail with no extra gutter, 254px Sources and 252px Properties. Keep the screenshot-tuned 54px toolbar/header and 52px inspector rows within the reference's estimated ranges. Four-area desktop requires at least 930px available Studio width and a desktop viewport; tablet Sources stays a full-screen overlay. A 752px content breakpoint stacks Stage/Properties on viewports up to 767px. CSS owns Sources' rail/modal mode; the native dialog reads that mode and retains one mounted control tree. Controls and type hierarchy are refined without changing handlers or business state. Actual verification is recorded in progress-tracker.md.

## Strict workspace visual-fidelity pass (2026-10-18)

The current user request supersedes earlier phase stop points and geometry guidance for a UI-only pass across Studio, navigation, Templates, Marketplace, Documentation, Projects and Settings. The supplied Pryzm screenshots are the primary layout reference; retain Sceenyk names, official logos, Inter, purple/blue accents and the existing theme controller. No backend, auth, payments, credits, Marketplace behavior, provider, database or guest-draft changes are authorized. Do not trigger hosted Inngest or perform deployment acceptance.

Reference-derived target geometry (Approximate): 260px desktop navigation, 64px collapsed rail, 8px viewport gutters and panel gaps, 14px outer radius, 1px neutral borders, 54px Studio headers/toolbar and 254px Sources/Properties rails at 1366-1440px. Compact desktop navigation uses 32px rows; touch navigation retains larger targets. Panels scroll independently on desktop; mobile retains hamburger/logo, Stage then Properties, and the same mounted full-screen Sources dialog. Gallery cards use a dense responsive grid with compact metadata; actual configuration covers remain labeled rather than inventing artwork. Documentation uses topics/article/contents at reference desktop widths. Settings retains its existing sections and controls. Workspace-scoped neutral surfaces supersede earlier purple-tinted neutrals; brand/action/focus colors remain unchanged. Local screenshots, responsive themes, overflow, lint, types and build are the acceptance scope. See progress-tracker.md for actual results.

## Current Studio Phase 3 scope (2026-10-18)

The current user request authorizes Studio desktop/tablet/mobile presentation and the approved missing guest handoff. Reuse existing state owners/hooks, server contracts and semantic theme tokens. Sources uses one mounted native dialog tree for the nonmodal rail and full-screen modal; caption preference controls render through a React portal without moving playback state. Keep routes, private guards/cache and financial/provider work unchanged. See architecture and progress tracker for implementation and actual acceptance; do not start another feature.


## Authorized Phase 2 presentation (2026-10-18)

Current authorization supersedes the older Phase 1 stop boundary for Templates, public product Documentation, remaining internal presentation and small cross-page consistency fixes. Reuse components/workspace, the existing owned-listing service/account fence, configuration covers and server guards. Public docs content belongs in lib/documentation/content.ts; never render internal context/acceptance files as a manual. New Templates invalidation is routing integration only; business services, schema, payment/provider work and the Studio editor remain unchanged. Stop before Phase 3 and record fixture, local-browser and deployed evidence separately.


## Authorized workspace foundation (2026-10-18)

The current request authorizes Phase 1 implementation and supersedes historical documentation-only/landing-only restrictions for this unit. Shared navigation/shell/page-frame modules live in components/workspace; existing project cards/status presentation lives in components/projects. Use the public app/(workspace) route group for guest Studio, owned project editing and Marketplace, with independent server guards unchanged. Keep protected app/dashboard layout and Settings URLs to preserve cache/security/payment compatibility. Do not move domain services or introduce new features while migrating presentation. Phase 2/3/4 of the current brief supersede earlier scheduling; stop after Phase 1 and record actual local/deployed acceptance separately.


## Approved redesign implementation boundaries (2026-10-17)

Follow [the approved UI/UX redesign contract](ui-context.md) in separately scoped phases; **implementation is Not Started** and the current task changes documentation only. The first recommended unit is **Phase 1 — shared public/workspace shells and navigation architecture**. Prefer clear public shell, workspace shell, Studio, Marketplace, Settings, shared brand/navigation and creative-control boundaries, reusing existing services/hooks and accessible primitives. No broad backend restructuring or route/domain renaming is needed for Studio's user-facing label.

Preserve current colors/tokens/light/dark, Inter/Geist Mono where practical, official logos, Tailwind/shadcn/Base UI behavior and completed Settings navigation. Use output-first composition with fewer unnecessary cards; desktop Studio is Navigation / Sources / Stage / Properties, tablet progressively collapses panels, mobile is Top Navbar → Stage → Properties with separate hamburger navigation and full-screen Sources overlay. Existing source geometry and board observations do not override this approved responsive contract.

Guest configuration is public but browser drafts are untrusted. The later Studio handoff must preserve lightweight choices through Clerk, restore the same flow and retain owned save/upload, quote review and explicit cost confirmation. Large media needs a separately defined safe storage/upload strategy, not casual `localStorage`. Never replace identity/ownership, private responses, payment/credit/Marketplace/earnings/payout or provider contracts to simplify presentation. Inngest Cloud stays paused; use local dev/fixtures and defer hosted acceptance until explicitly authorized. Read installed Next.js guidance before future application code, and record actual per-phase evidence without claiming planned layouts work.

These rules apply to developers and AI coding agents building Sceenyk. Read [overview.md](overview.md), [ui-context.md](ui-context.md), [design-system.md](design-system.md), [ai-workflow-rules.md](ai-workflow-rules.md), and [progress-tracker.md](progress-tracker.md) before relevant implementation work.

**Verified baseline (updated 2026-10-10):** Next.js/React/strict TypeScript/Tailwind/shadcn/Lucide/themes and Clerk development authentication remain. Hosted Supabase identity/projects/assets and real browser R2 upload/finalization/private retrieval/persistence/two-account media acceptance pass. Broader prior project acceptance and hosted catalog auditing remain separate. Zod is the one request validator; server file-type signature detection and AWS S3/signing SDKs belong to storage. No browser database client/Supabase Auth, worker or persistent test runner exists.

Read [architecture.md](architecture.md) for planned provider boundaries and implemented UI contracts. `AGENTS.md` now references the actual product document, `context/overview.md`.

## General

- Work in small, verifiable feature units. Keep modules focused on one responsibility and separate business logic from presentation, routes, and provider adapters.
- Prefer simple, readable code and descriptive names. Reuse existing code before creating duplicates; introduce shared abstractions for real repeated patterns rather than speculative future needs.
- Fix root causes, preserve working behavior outside the requested change, and preserve unrelated worktree changes.
- Split files when responsibilities become unclear; avoid arbitrary line limits or a large component/service doing unrelated jobs.
- Comments explain decisions, constraints, and why code exists. Remove dead code, unused imports, commented-out implementations, and temporary debugging.
- Never silence errors or weaken TypeScript, lint, validation, or security checks to make a build pass.
- Synchronize affected context documents and the progress tracker after meaningful changes. Record unresolved product decisions before implementing dependent behavior.

## TypeScript

- Keep `strict: true` and `noEmit: true` in `tsconfig.json`. Use the existing `@/*` alias, which resolves to the repository root.
- Avoid `any`; use `unknown` for untrusted values until runtime validation establishes their shape. Types alone do not validate JSON, webhook data, or database input.
- Validate form input, external API responses, webhook payloads, environment configuration, and database-facing values at their boundaries. Narrow errors safely before reading their properties.
- Use explicit types/interfaces where they clarify public contracts; let obvious local values be inferred. Use `import type` for type-only imports.
- Prefer discriminated unions for known domain states. The generation contract is `queued | processing | completed | failed`, with a separate current stage, centralized in `lib/generation/contract.ts` and enforced by migration 004. Never simulate stages or percentages.
- Keep genuinely shared domain types in one owned module, such as future `types/generation.ts`. Do not duplicate slightly different status or asset types across client/server code.
- Avoid unsafe assertions and non-null assertions that conceal missing configuration. Document a necessary exception and the invariant that makes it safe.

## Next.js

- Read the relevant guide in `node_modules/next/dist/docs/` before application code changes, as required by [AGENTS.md](../AGENTS.md). Follow the installed version's APIs and deprecation notices rather than older examples.
- Pages and layouts default to Server Components. Add `"use client"` only for browser state/effects, event handlers, browser APIs, or libraries that require it. Keep client boundaries small; do not turn the app into client components for convenience.
- Fetch server-owned data on the server where appropriate. Pass only necessary, serializable data to clients; never pass credentials or full privileged records. Protect secret-bearing modules with an appropriate server-only boundary.
- Use App Router layouts for shared shells, route groups when they improve organization, `loading.tsx`/Suspense for pending content, and `error.tsx` for recoverable rendering failures. Do not replace useful server rendering with unnecessary client fetches.
- This project enables `cacheComponents` and `partialPrefetching`. Read the installed caching and authentication-with-cache-components guides when adding data/auth reads: keep request-time/session UI behind appropriate Suspense boundaries and avoid shared caching of authentication decisions. Do not copy incompatible legacy route caching flags or disable these settings to hide errors.
- Follow the installed async request API conventions, including awaiting promised route parameters/request data where required. Keep each Route Handler focused; use `app/**/route.ts`, not a parallel Pages Router API system.
- Preserve the CSS loader, global CSS import, font classes, and generated Next.js instruction block. Do not edit `node_modules`, `.next`, or generated framework types manually.

## React Components

- Give each component one purpose. Put reusable primitives in `components/ui/`, shared application composition in `components/`, and feature-specific UI near its feature when needed.
- Prefer composition over giant configurable components. Keep purely presentational components free of payment, database, or provider logic.
- Follow hook rules. Custom hooks should capture reusable behavior; avoid hooks that only disguise arbitrary code extraction. Use local state first and shared state/context only when needed to avoid excessive prop drilling.
- Use stable identity keys and derive values rather than maintaining redundant state. Handle async cleanup and stale responses so a changed project/input cannot display another request's result.
- Account for loading, disabled, empty, success, and failure states where relevant. Loading controls expose status and prevent duplicate submissions; disable actual behavior rather than applying opacity alone.
- Use semantic HTML, accessible labels, and distinct links/buttons. Preserve keyboard interaction, visible focus, dialog focus management, and status announcements.

## Styling

- Follow [ui-context.md](ui-context.md) and [design-system.md](design-system.md). The PNGs are visual references; preserve their Exact/Approximate/Inferred/Needs confirmation distinctions. `app/globals.css` owns implementation tokens.
- Follow the [Styling Policy](#styling-policy): use Tailwind utilities in components and the single global stylesheet only for approved shared exceptions. Tailwind 4's CSS-first `@theme inline` configures tokens; it does not authorize page/component stylesheets or ordinary component rules in global CSS. No separate Tailwind config exists; do not introduce one or a competing palette/theme system without explicit user direction.
- Use semantic pairs such as `bg-card text-card-foreground`, `text-muted-foreground`, `border-border`, and `ring-ring`. Never hardcode theme hex colors in components when a token applies.
- Reuse the existing spacing, type, radius, shadow, gradient, and motion scales. Inter is the UI/display font; Geist Mono is for code/mono content. Purple leads, with supporting blue/cyan and selective gradients/glow.
- Support light `:root` and `.dark` on `<html>` equally, preserving root font classes. Use the implemented Light/Dark/System preference controller through Settings → Appearance; preserve before-paint initialization and `sceenyk-theme` persistence.
- Use shadcn as the common-control base, normally adding needed primitives through `npx shadcn add <component>`. Review generated changes; do not reinitialize or overwrite Sceenyk's theme. Button, Dialog, and Sheet currently exist.
- Prefer reusable React components, Tailwind-based variants, composition and `cn` over repeated large class strings or primitive rewrites. Do not extract utility combinations into new CSS classes merely to shorten JSX. Reuse `@/lib/utils` for `cn`; the existing Button imports it directly from the installed `cn` package.
- Build responsive layouts from the start using approved per-experience adaptations, not a desktop layout merely shrunk. Maintain contrast, focus, keyboard behavior, touch targets, and disabled states. Keep animation purposeful and respect reduced motion; effects must not substitute for accessible state cues.

## API Routes and Server Logic

- Treat Route Handlers and Server Actions as externally callable boundaries. Verify authentication for protected operations, validate the request, and enforce authorization before data access/mutations or provider work.
- Never trust browser-supplied user IDs, ownership, permissions, prices, model tariffs, credits, or entitlement decisions. Derive identity from the verified session and amounts/rules from authoritative server configuration.
- Keep routes thin: request parsing, verification, service invocation, and response mapping. Put reusable business logic in server services rather than importing routes into application code.
- Use the installed Zod 4 for runtime input validation. Project choices/limits are shared in `lib/projects/options.ts`; strict schemas reject ownership/status/media/unknown fields. Reuse this validator rather than adding a competing library.
- Define consistent typed response contracts for new endpoints, with a stable error code and safe message. Use appropriate HTTP status codes, including validation errors, 401 for missing authentication, 403 for denied access, and 409 for conflicting state where appropriate. Do not expose internal/provider errors in responses.
- Make mutations safe against duplicate requests where needed using persisted idempotency keys/constraints or equivalent transactional enforcement. Client-side disabling alone is insufficient.
- Job submission should return a job reference/status promptly; do not perform the entire AI/video pipeline in a normal API request. Authenticate and validate provider webhooks under their own contract rather than assuming an interactive Clerk session.

## Authentication and Authorization

**Clerk is the authentication source of truth.** The development SDK/provider, centered modal/account controls and server-protected dashboard are live verified. See [authentication.md](authentication.md). Authentication establishes who the user is; authorization determines what that user may access or change.

- Use centered Clerk modal/overlay sign-in and sign-up at the point of need. Do not add dedicated `/signin` or `/signup` pages or a second custom password/session system.
- Preserve public exploration defined in the overview. Generation, private projects, purchases, and other account-dependent operations require verified server-side Clerk authentication.
- Derive the acting user from the server session, not a posted ID. Resolve the application's Clerk-to-database identity mapping through one documented boundary.
- Authentication alone never grants access to another user's project, asset, job, or balance. Enforce ownership/permissions for reads and writes at the data-access boundary; UI guards and layouts are not sufficient security enforcement.
- Document and verify the Clerk/Supabase authorization strategy when implemented. If privileged database access bypasses policies, the server must still enforce ownership; test cross-account rejection.

## Data and Storage

**Supabase PostgreSQL has hosted identity/projects/assets.** The media unit verifies project-first save/reopen and owned asset persistence against live R2; broader prior project acceptance and full hosted grant/catalog auditing remain tracked separately. The separately authorized job foundation adds immutable owned snapshots and trusted server-only transitions in migration 004 (hosted application/acceptance pending). Other domain schemas remain unspecified. Credits/payments/templates/marketplace and actual processing stay excluded.

- Store large videos, audio, images, temporary artifacts, and rendered output in object/blob storage. PostgreSQL stores stable object references and relevant metadata; generate short-lived access URLs when needed instead of treating expiring signed URLs as permanent asset identity.
- Introduce only the schema required by the requested unit. Verify actual tables/columns and constraints before writing queries or migrations; do not infer deployed schema from documentation examples.
- Protect invariants with constraints and transactional operations where possible. Index frequent ownership/lookups/filter fields based on actual query needs; select only needed columns and avoid unnecessary queries.
- Enforce cross-user isolation in the chosen server/database access strategy, including associated jobs and assets. Document access policies and test them with separate users.
- Use migrations for schema changes. Never rewrite migrations that may have been applied; add a new one and record whether it was applied/verified. Avoid destructive migrations without explicit approval.
- Cloudflare R2 is the implemented private project-media provider; see [media-storage.md](media-storage.md). Final product limits and retention/deletion remain open; the configurable single-PUT development safeguard is not a product limit. Do not introduce Supabase Auth as a competing authentication source.

## AI and External Providers

Visual execution uses server-only `lib/video-ai/` services and active `providers/fal.ts`, with central capabilities/rates/cost guards and shared scene lifecycle in `contract.ts`; Runway remains inactive. Keep official SDK calls in that adapter and prevent SDK submission replay because unknown outcomes can be charged. Persist a submission slot before paid work and the task ID before polling. Retry only definite 429 rejections within the persistent attempt bound, or idempotent reads/storage through bounded Inngest retries. New video transform/reuse must use completed owned segments through `lib/media-preparation/` before paid submission. Keep integer milliseconds throughout preparation and convert immutable schema-v1 seconds at its compatibility boundary. Missing/invalid source timing or permanent preparation failure blocks spending; unsupported provider requirements remain pending. Private inputs use verified short-lived signed reads; outputs use immutable owned R2 keys and separate intermediate metadata. Never turn provider usage/cost estimates into customer debits or final-result settlement. Current real acceptance limits are in the tracker.

The Gemini understanding/planning unit introduces `lib/ai/` with a server-only service, central configuration and isolated REST provider adapter. Keep the strict Zod plan and contextual source/timeline checks before persistence. Usage/model/attempt metadata stay server-only; the browser receives readiness through owned job DTOs. Never replay a started uncertain paid attempt or overwrite a saved plan. Native REST uses the existing validation approach and adds no Google/Vercel AI SDK. Current verification/rollout limits are in the tracker; fal visuals and ElevenLabs voice have scoped real deployed evidence, while final rendering remains planned.

- Application code should call shared Sceenyk services, with provider-specific SDK calls isolated behind small interfaces/adapters. Keep providers replaceable without building an unused universal framework.
- Implemented boundaries are `lib/ai/`, `lib/media-preparation/`, `lib/video-ai/` and `lib/voice-ai/`, with isolated Gemini/FFmpeg/active fal/ElevenLabs REST adapters plus an inactive retained Runway adapter. Voice has scoped deployed acceptance; preserve its persisted submission slot and recover private audio before considering paid work. Voice-metadata lookup failure cannot alone establish TTS unavailability. FFprobe imports stay in the external worker, never Next.js orchestration. Never convert provider character-cost into customer credits or unverified dollar charges.
- Keep API keys server-side and validate requests and provider responses. Handle bounded timeouts, rate limits, unavailable services, malformed output, and partial failures with useful persisted outcomes.
- Persist provider job IDs, stage input/output references, and safe retry information for asynchronous work. Check whether a job was accepted/completed before retrying a request that may incur another charge.
- Do not silently fall back to a more expensive model or alter moderation/model-selection rules. Use approved provider, cost, and content policies; unresolved choices belong in the tracker.

## Background Jobs and Video Processing

- `lib/composition/` defines the schema-v1 integer-ms contract, owner-only read service and signed worker inspection client. Migration 015's service-only SQL planner derives every reference/time/readiness field from immutable persisted records; never add browser timeline submission as a trusted input. Reuse verified prepared/narration durations, cache immutable ETag-bound checks, and probe unknown video duration only in the external worker. Persist timing conflicts without changing produced assets, settling/releasing the hold, or invoking another provider. Default narration offset and technical tolerance are centralized/frozen; version 1 uses 0ms for both. Historical plans/checks are immutable. A renderer must require a validated ready contract; this unit starts no rendering.

- Run long AI/video work outside request-response flows. Inngest owns durable orchestration; its signed endpoint and service-only database claims are the worker boundary. An in-process promise or request timer is not a durable worker. The authorized final renderer uses isolated `lib/final-render/` and `workers/final-render/` modules on the external worker, with an optional standalone Docker entry. Persistent leases, heartbeat, bounded rendering, canonical R2 recovery and independently probed receipts precede Inngest finalization. Never trust a browser completion claim or worker HTTP acknowledgement. Only verified final output consumes the original reservation. Preserve holds on ambiguous upload/verification failures and restore exactly once on definitive failure with no usable result.
- Persist job ownership, states, stage progress, provider references, results, and failures. Users must be able to leave/reload and recover status; the browser must not remain blocked waiting for completion.
- Define clear inputs/outputs for each stage and make state transitions safe under concurrent workers/retries. Retry recoverable stages without restarting successful work; use bounded retry rules and prevent duplicate paid execution.
- Use implemented queued/processing/completed/failed states and separate forward-only stage/dispatch state. Centralize TypeScript rules and SQL constraints. Never complete a generation without verified durable output.
- Run FFmpeg/Remotion or equivalent processing in a worker environment that supports actual compute, disk and duration needs. FFmpeg/FFprobe source preparation is installed/tested in a separate authenticated Node worker; Next/Inngest sends IDs only. Use shell-free fixed argv, verified owned local source bytes, bounded resources and fresh temporary-directory cleanup. Remotion/final rendering remains unimplemented; do not place heavy processing in browser/Next handlers.
- Clean up temporary files after success/failure according to the agreed retention policy. Upload final output to object storage and persist the stable result reference before reporting completion.
- Recover stale/stalled jobs through the chosen workflow mechanism; a failed job must not remain indefinitely in processing.

## Payments and Credits

**PayPal Sandbox one-time purchases are Complete within Merchant Sandbox acceptance;** see [payments.md](payments.md). The approved primary model is pay-as-you-go credits and manual top-ups, not monthly plans; purchased credits do not expire unless a future explicit product decision changes this. The accounting contract retains two lifetime free generations of at most ten seconds with atomic reservation and exactly-once failure restoration. The commercial quote boundary is implemented in `lib/pricing/`; see [pricing.md](pricing.md). Never scatter tariffs or accept browser cost/tier/free/version claims. Show a server-issued quote before explicit confirmation and reserve its validated server cost before dispatch. Production retail prices remain unresolved; optional rates are visibly development/test-only.

Development and testing must use **PayPal Sandbox only**. Do not use Live credentials or real-money transactions. Keep eventual environment/credential selection behind the payment service; production switching is a later explicitly scoped task.

- Never grant credits from a browser success callback alone. Verify payment results server-side and verify webhook authenticity before processing. Confirm the expected payment identity, owner, amount/currency, and final provider status.
- Keep PayPal logic behind a payment service where practical. Credit/free-allowance changes happen on the server through transactional accounting with ledger/history recording the reason and related payment/job.
- Payment finalization must be idempotent: repeating a payment/webhook request must not credit the user twice. Enforce this persistently, including concurrent callbacks/events; an in-memory flag is insufficient.
- Prevent double-spending/free-allowance reuse when concurrent generations start. Use an atomic reservation/debit strategy consistent with the approved settlement policy, with safe reconciliation after failures.
- Failed generations follow the documented refund/credit-restoration rule. Never invent pricing, credit costs, subscription limits, creator shares, marketplace fees, or refund behavior; PNG pricing is illustrative.
- Keep one-time credit purchases separate from marketplace purchases and creator payouts. Monthly subscriptions are outside current scope; membership and auto-recharge are unapproved future options requiring separate product decisions and authorization, not the next required commercial feature.

## Error Handling and Logging

- Do not swallow errors. Distinguish expected validation/auth/conflict/provider failures from unexpected system failures; give users concise messages and a useful next action.
- Preserve useful database/provider context in restricted logs, with request/job/stage identifiers for correlation. Return safe error codes/messages to clients rather than raw stack traces or upstream payloads.
- Never log access tokens, API keys, payment secrets, or unnecessary personal data/uploaded content. Log metadata needed for diagnosis, not complete media/prompt payloads by default.
- Record a job's failed stage and safe failure reason; preserve enough internal context to diagnose it. Ensure failure paths update persistent state and trigger the agreed accounting outcome.

## Security

- Keep secrets and privileged credentials server-side; never commit secret `.env` files or place secrets in `NEXT_PUBLIC_*`. Validate required configuration at the owning integration boundary and document variable names/purpose without values.
- Validate all external inputs, enforce resource ownership server-side, verify Clerk sessions, and verify PayPal/provider webhooks. Maintain database/storage policies; never disable checks for development convenience.
- Use scoped, short-lived signed upload/download URLs where appropriate. Restrict upload size/type, verify relevant file characteristics, generate safe storage keys, and never trust user filenames as paths.
- Render user-generated text safely; avoid raw HTML injection. Validate any user-supplied remote media URL before server fetching so it cannot reach internal/private services.
- Protect cookie-authenticated mutations against cross-site misuse using the applicable framework/provider protections. Apply documented rate limits to expensive endpoints and generation abuse controls when introduced.
- Authorization must cover thumbnails, downloads, job status, and provider-result association as well as primary project mutations.

## Performance

- Prefer authorized direct object-storage uploads over proxying large video bodies through Next.js when available. Keep uploads linked to verified project ownership.
- Use thumbnails and appropriately sized previews instead of full-resolution media in lists. Lazy-load expensive media/client features and avoid downloading every video on page load.
- Paginate growing project/template/marketplace lists and avoid repeated database/provider calls for unchanged data. Keep client JavaScript small and interactive boundaries focused.
- Cache stable data only with explicit lifetime/invalidation and ownership scope. Never share private project/session data across users or rely on cached balances/permissions for authoritative mutation checks. Follow the installed Cache Components guide.
- Long work belongs in persistent background jobs. Use progress/status updates or bounded polling/subscriptions rather than one long HTTP request; avoid duplicate polling/provider requests.

## Testing and Verification

- Define testable end-to-end acceptance criteria for each meaningful feature. Verify success, relevant failure paths, unauthorized/cross-account access, and duplicate/concurrent payment or credit actions.
- Check mobile/desktop, keyboard/focus behavior, and both themes for UI changes. Use payment sandbox/test environments; mock expensive AI calls for automated tests and label mocks honestly. Real integration claims require appropriate runtime evidence.
- Existing package scripts are `npm run dev`, `npm run start`, `npm run lint`, and `npm run build`. Before marking application work complete, run lint/build and `npx tsc --noEmit` (a direct TypeScript command, not a package script).
- There is no generic `test` or `typecheck` script. Reproducible Node/PGlite suites are `test:pricing`, `test:accounting`, `test:generation`, and `test:dispatch`; `test:client-secrets` scans the production build. Tests use clearly labeled external-service fixtures where relevant; live acceptance is recorded separately. Add proportionate checks for behavior rather than tests mirroring trivial styling.
- Builds currently fetch Inter and Geist Mono through `next/font/google`; restricted-network font failure is a verification limitation, not justification to suppress errors. Record actual results and prerequisites.
- For documentation-only work, verify structure, links, source consistency, whitespace, and file scope; application lint/build/runtime checks need not be repeated merely because a document changed. Never claim unperformed checks passed.
- Update the tracker with evidence, limitations, migrations/configuration needs, and the next unit. Installed dependencies, mocked progress, and successful compilation do not establish a working product integration.

## File Organization

The repository uses root-level folders, **not `src/`**. Preserve that organization and the root `@/*` alias.

| Existing location | Responsibility |
| --- | --- |
| `app/` | Root document/theme, CSS and metadata; `(public)/` layout for `/` and `/create`; `dashboard/` layout/page for the app-shell preview. URL paths are unchanged by route groups. |
| `components/ui/` | shadcn/Base UI Button, Dialog, and Sheet. |
| `components/` | Shared brand/navigation/footer/theme/sign-in notice/artwork/EmptyState; `landing/`, `creation/`, and `dashboard/` hold scoped UI. |
| `lib/` | `utils.ts` reexports `cn`; `theme.ts` owns initialization and the preference key. |
| `public/` | Preview brand mark and unused stock SVGs. |
| `context/` | Product, UI/design, workflow, progress, and coding specifications. |
| `designs/` | Light/dark PNG visual references. |
| Root configuration | `package.json`/lockfile, TypeScript, ESLint, Next.js, and `components.json`; no Tailwind config file. |

Introduce folders only when the requested feature needs them. Future `components/` compositions, `features/<feature>/`, `hooks/`, and `types/` can hold shared UI, feature-specific modules, reusable behavior, and genuinely shared types. These are recommendations, not existing implementations.

Future server/service boundaries under `lib/` may include `auth/`, `db/`, `ai/`, `video-ai/`, `voice/`, `payments/`, `storage/`, and `validation/`. Keep each contract narrow; isolate provider adapters inside its boundary. Choose migration/worker locations with the actual tooling and document them in architecture rather than creating placeholder folders now.

Naming and formatting:

- React component symbols and TypeScript types/interfaces: `PascalCase`; hooks: `useSomething`; functions/variables: `camelCase`.
- Use descriptive lowercase/kebab-case module filenames consistent with `button.tsx` and the context docs. Hook modules may use `use-something.ts`; preserve Next.js reserved route filenames and route-group/dynamic-segment conventions.
- Constants currently use descriptive `camelCase` bindings (`nextConfig`, `buttonVariants`); there is no established domain-constant convention. Follow nearby code; reserve `UPPER_SNAKE_CASE` for named fixed configuration/domain constants where that distinction helps. Environment variable names use `UPPER_SNAKE_CASE`.
- Use TS/TSX for new application modules, type-only imports where appropriate, and existing ESLint rules. No Prettier configuration exists; starter files use semicolons while generated Button uses semicolonless formatting. Follow the file's style and avoid unrelated formatting churn.
- Prefer `@/` for cross-folder application imports. Preserve generated shadcn exports/props conventions and use relative context links with actual filename casing.

## Dependency Rules

- Prefer existing dependencies. Add a library only for a clear need in the current unit; prefer maintained, established packages and avoid multiple libraries solving the same problem.
- Use npm and maintain `package-lock.json` with dependency changes. Review generated CLI changes before accepting them; do not install all planned provider SDKs in advance.
- Do not run `npm audit fix --force` automatically or make major upgrades during unrelated work. Review breaking changes and keep Next.js, React, ESLint, Tailwind, and related packages compatible.
- Remove unused dependencies only after confirming they are unused and removal is safe; do not clean unrelated dependency state as part of a feature/documentation task.

## Final Rule

These standards are the default rules for Sceenyk development. If an implementation needs to depart from a rule, document the reason and update the relevant context/architecture specification within the authorized unit. An exception must not silently change product requirements or weaken security; unresolved decisions remain explicit in the progress tracker.
