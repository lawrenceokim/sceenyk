# UGC reference analysis

## Planned V3 OpenAI understanding and regeneration (2026-10-29)

[Canonical V3](generation-architecture-v3.md#provider-responsibilities), **Planned / Not Started**, keeps OpenAI responsible for understanding the request, analyzing requested image transformations, reference prompts/regeneration and professional creative direction. Character Sheet/reference regeneration now targets OpenAI; Product/Location and other reference regeneration may also use that image boundary where appropriate. User review/approval remains explicit and uncertain visual facts must not become invented observations.

The next test cycle uses a brand-new project/different image and fresh analyses/references/Storyboard, with no previous execution dependency. Earlier model/provider/status recipes below are historical/source evidence. This task calls no AI, reruns no analysis and changes no approved input or runtime code.

## Milestone 6 — Product / Prop Reference Sheet (2026-10-24)

**Milestone 5 — Complete. Milestone 5.5 — Complete. Milestone 6 — Complete in source; manual migration/provider/runtime/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This section supersedes earlier M6-not-started stop points below. See [Product Sheet contract and manual setup](product-sheet.md).

Saved Product analysis v1 is reused, with the frozen creator name and original-image factual authority. Unknown/uncertain geometry never becomes an observation. Sunburst edits use a separate server-only Product model/enablement with the existing key; neither completed analysis is regenerated.

Pipeline: Input → OpenAI Reference Analysis → Character Reference Sheet → Product / Prop Reference Sheet → Location Reference → Structured ChatGPT Storyboard → Generation Package → Final Video → Studio Preview. Existing cost-review/accounting gates remain; no user credits are deducted. Manual setup: pending 044 then new 045; OPENAI_PRODUCT_SHEET_MODEL=gpt-image-2.5-sunburst and explicit UGC_PRODUCT_SHEET_ENABLED=1 with existing OPENAI_API_KEY. Keep Render/Inngest disabled. No providers, worker/jobs, private media, remote SQL, browser/screenshot suites, build or deployment executed. Stop after M6.



## Milestone 5 — Character Sheet (2026-10-23)

**Complete in source; manual migration/provider/runtime/visual acceptance pending. Exact next: Milestone 6 — Product / Prop Reference Sheet generation. Not started.** [Character Sheet contract and manual setup](character-sheet.md) supersedes older M5-not-started/OpenAI-Character-image assumptions below; historical evidence remains intact.

Milestone 4 remains the OpenAI analysis provider; Character image generation is now SOUL2 behind a separate interface. Saved Character analysis v1 is descriptive support for the original private source via Soul ID v2. Completed analyses are reused, never relabeled or repaid by M5. User confirms migration 039 applied; verify 040 before new 041.

Approved full flow: Input → validation → OpenAI analysis → SOUL2 Character Sheet → Product Sheet → one primary Location → structured ChatGPT storyboard/script + stable voice specification → generation package → cost review/confirmation → final video → finalization → Studio Preview. No later stage is implemented. User confirms 039 applied; verify/apply 040 then new 041 manually. Render/Inngest remain disabled; only user-started local worker execution. Codex made no provider calls, ran no jobs/worker, applied no hosted SQL and deployed nothing. Offline in-memory schema validation is separate from manual runtime acceptance.

## Creator-assigned labels - prerequisite refinement (2026-10-23)

**Implemented in source as a focused prerequisite between Milestones 4 and 5; manual migration/UI/persistence acceptance pending. Milestone 5 remains Not Started.** New snapshot-v3 jobs expose character.name and product.name to ReferenceAnalysisProvider.analyze as an optional frozen label argument; old v2 calls remain name-free. The OpenAI adapter encodes labels as JSON user data with fixed system-level creator-label context-v1 instructions: never obey a name as instructions, infer identity/brand/appearance from it, or insert it into visual observations. Character names are fictional/reference labels, not proof of real-person identity. All prior visual-analysis safety rules, structured schema v1 and base reference-analysis-v1 prompts remain. The linked snapshot version distinguishes named input provenance.

Existing completed analysis is still reused before provider submission. No data is relabeled, no provider call/reanalysis is triggered by saving names, and legacy job inputs remain immutable. No image generation is implemented. Future M5+ uses the job's supplied names consistently in prompts/storyboards/dialogue/scene instructions, retaining stable source IDs. Manual migration 040 and UI/persistence review are pending; [reference-name contract and setup](ugc-v1-workflow.md#project-specific-reference-names--prerequisite-before-milestone-5).

## Milestone 4 - source contract (2026-10-23)

**Milestone 4 — Complete in source. Manual migration application and provider/runtime acceptance pending. Exact next: Milestone 5 — Character Reference Sheet generation.** This document and the current [job contract](generation-jobs.md#milestone-4--openai-reference-analysis-2026-10-23) supersede earlier analysis-not-implemented statements. No sheet, storyboard, video, financial charge or hosted execution is connected.

### Provider and configuration

The official `openai` SDK (lockfile 7.43.0, Node 22+) uses **Responses API** image input and `text.format` strict JSON Schema, generated with its `zodTextFormat` helper. Application validation runs again before persistence. The [official Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs) and [vision guide](https://developers.openai.com/api/docs/guides/images-vision) were checked during implementation. The implementation calls `responses.create` with `store: false`, checks completion/refusal, then validates the constrained JSON; it does not extract prose, use Assistants, invoke image-generation tools or fall back to Gemini.

[`ReferenceAnalysisProvider`](../lib/reference-analysis/provider.ts) exposes one `analyze(role,image,signal)` method; the [OpenAI adapter](../lib/reference-analysis/openai.ts) implements it. The [workflow service](../lib/reference-analysis/service.ts) calls this interface through the separate [provider factory](../lib/reference-analysis/factory.ts). [`lib/openai/server.ts`](../lib/openai/server.ts) alone resolves credentials/model and constructs the client lazily, with the fixed official endpoint, SDK logging off, automatic retries zero and a 60-second request timeout. Importing these files never sends a request. No default model is selected; the operator must configure a Responses model supporting image inputs and strict structured outputs. Account/model access remains manually unverified.

In ignored `.env.local`, add locally:

```dotenv
OPENAI_API_KEY=your_private_key
OPENAI_REFERENCE_ANALYSIS_MODEL=your_supported_model_id
UGC_REFERENCE_ANALYSIS_ENABLED=1
SCEENYK_LOCAL_JOBS_ONLY=1
```

The example defaults analysis opt-in to `0`. Never add `NEXT_PUBLIC_` versions. No actual key or opt-in was written by Codex. The existing private Supabase/R2/Clerk setup is still required. Starting the worker requires explicit enablement and complete configuration; it fails before claiming work if those are missing. Model syntax is validated locally; real capabilities/access can only be verified by the user's manual call. No test call or model-list request runs on startup. Model/version are frozen on the job at the first durable submission intent and reused across roles/retries; changing environment does not change an existing run's frozen model.

### Schemas and prompt versions

[`contract.ts`](../lib/reference-analysis/contract.ts) defines strict `CharacterReferenceAnalysis`, `ProductReferenceAnalysis` and `CombinedReferenceAnalysis`, all **schemaVersion 1**. Each observation requires `description: string | null` (bounded to 800 characters) and `certainty: observed | uncertain | unknown`. Unknown requires null; visible but ambiguous impressions require uncertain. Application checks reject absent subjects, extra fields, malformed values and claimed unseen product geometry. SQL mirrors the observation shape and requires both role records before advancement.

| Schema | Required visual fields |
| --- | --- |
| Character | visibleAppearance, visualPresentation (styling/silhouette), hair, facialFeatures, skinAppearance, clothing, accessories, colors, distinguishingVisualTraits, framingAndPose |
| Product | category, shape, colors, materialAndFinish, proportions, designFeatures, visibleTextAndLogos, orientationAndView, visibleParts, consistencyDetails, unseenGeometry (always unknown/null) |
| Both | schemaVersion, analysisType, subjectVisible, imageQuality, occlusions, limitations |

[`prompts.ts`](../lib/reference-analysis/prompts.ts) centralizes **reference-analysis-v1** instructions with separate Character/Product additions. Only visible generation-relevant traits are requested. No person identification, personal-name transcription, ethnicity/race/nationality, religion, health/diagnosis, politics, orientation, criminal history, socioeconomic status, exact age, personal contacts or unrelated sensitive inference is allowed. Visual presentation is not an identity/gender/age determination. Printed image instructions are untrusted data. Product text/logo descriptions are restricted to clearly legible relevant product branding; unsupported geometry, dimensions, material or text must not be invented. Prompt/schema validation reduces unsupported output; it does not prove perception accuracy or replace later moderation/manual acceptance.

Version changes must add an explicit interpretation/migration path. Never relabel old analysis or reinterpret its fields silently. Successful rows retain their schema, prompt version, requested model and returned model. The job stores `analysis_version` and `analysis_model` for later consumption. No future schema implementation is implied here.

### Private media

[`media.ts`](../lib/reference-analysis/media.ts) resolves exact immutable source asset/reference IDs, owner/project, role, uploaded/active/private-R2 state, MIME, size and verified ETag. The existing [`readR2AnalysisMedia`](../lib/storage/r2.ts) conditionally GETs with `IfMatch` and checks size/ETag. A 30-second bounded read checks byte count while streaming. No public or signed URL is created.

Existing Sharp decodes/orients and strips metadata, resizing inside 2048×2048 without enlarging and encoding an ephemeral PNG for OpenAI. The source safeguard is 100 MiB; decoding is capped at 40 million pixels and provider PNG bytes at 20 MiB. These are implementation safeguards, not commercial upload limits. Animated/multipage images, formats unsupported by the installed decoder, corrupt images and oversized inputs fail safely before submission. Resize/decoder limitations are documented provenance; analysis must still express visual uncertainty. Both missing sources are loaded/decoded before either new paid call. Completed roles are not decoded/submitted again. Original files remain unchanged; no derivative, reference sheet or raw image is stored in PostgreSQL/R2 by this milestone. PNG bytes/base64 exist only in worker memory and the outbound provider request.

### Persistence, idempotency and errors

Manual [migration 039](../supabase/migrations/20261023003900_ugc_reference_analysis.sql) adds **ugc_reference_analyses**: UUID, owner/project/job/source asset FKs, role, analysis version, prompt version, provider, requested model, submission claim/attempt, state, validated analysis JSON, fixed safe usage projection, safe failure code and timestamps. One completed row per job/role/version is unique. A separate row for each explicitly retried rejected attempt preserves history. RLS has no browser policy/grants; service has SELECT and explicit SECURITY DEFINER RPC access, no direct writes. Triggers guard identity and terminal records; events are append-only. No raw provider response, error body/stack, secret, media bytes or URL is persisted/exposed through progress DTOs. Source columns and prerequisite functions are checked in the migration; no live catalog audit/application was performed in this task.

`ugc_begin_reference_analysis` locks the job, checks its live token/stage/lease/cancellation and source records, freezes model/version, and persists **submitted** intent before the API request. A repeated/lost begin reply never authorizes another submission. `ugc_finish_reference_analysis` validates/persists a completed analysis or safe rejected/uncertain outcome under that claim and appends a fixed role-completed event. Successful analysis is saved before the next role call and remains reusable after cancellation/failure. A failed persistence reply leaves the durable intent, preventing a blind second call.

| Failure | Behavior |
| --- | --- |
| Missing/disabled configuration | Before submission; fixed error, explicit bounded retry after configuration repair |
| Missing/private/unavailable source | Before submission; fixed error, explicit bounded retry after source repair |
| Invalid/unsupported/corrupt/oversized image or rejected request | No advancement; fixed unsupported error, no automatic retry |
| HTTP 401/403 or 429 | Persist rejected attempt; explicit bounded retry via existing infrastructure; reuse any completed other role |
| Timeout, transport abort/disconnect, service/unknown failure | Persist uncertain outcome where possible; no automatic or ordinary explicit retry; operator reconciliation required |
| Refusal, incomplete or malformed output | Preserve safe response/usage metadata where available; no analysis advancement or ordinary retry |
| Lease loss/crash or lost persistence acknowledgment | Preserve submitted/completed records; stop for reconciliation, never assume a request was free or unsubmitted |

Existing default three-claim attempt budget is retained. Analysis failures are never automatically retried. Retryable failures use existing owner retry service/RPC; a local operator can run `npm run worker:ugc -- --retry JOB_UUID`. An uncertain/submitted row blocks retry even if another error is marked retryable. No reconciliation override is implemented: review the provider/dashboard and persisted intent before authorizing separately scoped recovery. Do not create a new request merely to bypass an uncertain request. A genuinely new job has separate identity and may incur new cost; there is no cross-job image cache.

Usage includes response ID, returned model, input/output/total tokens and local latency in milliseconds, plus version/prompt/requested model provenance. Provider usage is metadata only; **no Sceenyk credits, reservations, ledger, quote or payment operation is performed**. OpenAI itself can bill the operator's account when they manually enable/run analysis. The explicit local enable flag is consent for this manual development workflow, not a production preparation funding/budget policy. Production economics/consent remain a later decision. No private analysis descriptions or provider bodies are logged; existing runner logs contain fixed operational categories only.

### Manual setup and stop boundary

1. Verify prerequisites 035–037 are applied. Manually apply [038 duration compatibility](../supabase/migrations/20261023003800_studio_duration_compatibility.sql), then [039 analysis](../supabase/migrations/20261023003900_ugc_reference_analysis.sql). Neither was applied by Codex; do not reset history or reapply superseded old migrations.
2. Use Node 22+, install dependencies, configure the private variables above and restart old application/worker processes. Keep Render/Inngest disabled and existing private storage setup.
3. Manually save an eligible UGC project and click Prepare generation, then run **npm run worker:ugc** when ready to incur analysis API usage. New validation continues into analysis under the same claim.
4. An existing M3 `REFERENCE_ANALYSIS_NOT_IMPLEMENTED` pause stays paused until **npm run worker:ugc -- --resume-analysis JOB_UUID**. The privileged local operator command validates that exact job and then starts the same queue consumer; it is not a second executor, SQL backfill or hosted path. The worker can consume other runnable jobs as usual. `--retry` similarly schedules only an eligible known-safe failed job before starting the same consumer.
5. Manually inspect Character/Product records/usage, owned safe progress, partial-success reuse, source replacement/missing objects, invalid output/refusal, rate/auth failures, lease/cancellation behavior and duration save/reopen. No automated provider test is included. A paused job remains inspectable with Check status.

After both completed records pass the gate, **status queued / stage character_reference / pause_reason CHARACTER_REFERENCE_NOT_IMPLEMENTED** releases worker/lease, emits a fixed development-paused event and is excluded from claims. It is not Failed, Complete or financial confirmation. There is no character_reference handler/resume operation. **Stop here. Next milestone 5 generates the Character Reference Sheet; it is not started.**

The only execution command remains `npm run worker:ugc`; its entry refuses non-local execution/recognized Render/Vercel environments. `SCEENYK_LOCAL_JOBS_ONLY=1` still blocks Inngest transport/ingress/dispatch and hosted legacy media clients. Hosted URLs/keys/Blueprint/Dockerfiles/history are preserved, with no platform setting/deployment audited or changed. Codex ran only TypeScript, focused lint and offline schema/static checks, and did not start workers, enqueue jobs, read private images, call OpenAI, apply SQL, build, deploy or run browser/integration/screenshot suites.
