# UGC V1 workflow contract

Approved 2026-10-23. **Milestones 1–5 — Complete in source; manual provider/runtime/visual acceptance pending. Exact next: Milestone 6 — Product / Prop Reference Sheet generation. Not started.** [Character Sheet contract/setup](character-sheet.md) supersedes older M5-not-started/provider assumptions below. Migration 039 is user-confirmed applied; verify/apply 040 then new 041 manually. Historical evidence remains intact; Freestyle stays separate.

Approved complete flow: Input → validation → OpenAI reference analysis → SOUL2 Character Sheet → Product Sheet → one primary Location → structured ChatGPT storyboard/script + stable voice specification → generation package → cost review/explicit confirmation → final video → finalization → Studio Preview. Only Character generation is newly implemented. Product/Location/storyboard/video, user charging and template publication remain deferred. Render/Inngest disabled; only the manually started local worker executes. No real provider calls or jobs were run by Codex.

Milestone 1 documented architecture/transport guards; Milestone 2 added 036/jobs/events/local runner; Milestone 3 added deterministic readiness and immutable v2 snapshots in 037. Milestone 4 adds [OpenAI provider/schemas/prompts/privacy/manual setup](reference-analysis.md), duration compatibility 038 and private analysis/checkpoints 039. No jobs were created, worker started, provider called or migration applied by Codex. Reference sheets, storyboards, videos, charging changes, deployment and hosted execution remain outside this unit.

## Project-specific reference names — prerequisite before Milestone 5

**Focused refinement implemented in source between M4 and M5; manual migration/UI/persistence acceptance pending. Milestone 5 remains Not Started.** Each uploaded Character and Product / Prop source has a compact editable name field directly beneath its thumbnail. Character name uses e.g. Maya; Product / Prop name uses e.g. Nova Watch. Labels are creator-assigned Project inputs, never filenames or real-person identity evidence. They are trimmed, limited to 80 characters, and required for new generation readiness. Empty names are allowed in unfinished drafts; existing unnamed UGC Projects keep their media and simply become not ready until named.

Names use the existing Preview-header **Save → Saving... → Saved** state and saveProjectAction, with no per-keystroke network write or new Sources status. Blur trims locally. Saving captures exact edits; further typing stays dirty after the in-flight save completes. The existing brief save runs first, then a restricted RPC atomically validates/locks/saves the submitted name batch; a name failure returns a safe save error and preserves dirty edits for retry even if the brief was already saved. Name edits also invalidate readiness/revision identity. Hidden names remain when switching Creation Type.

Manual [migration 040](../supabase/migrations/20261023004000_ugc_reference_names.sql), applied **after corrected 039**, adds nullable private project_assets.reference_name and a service-only owner/project/active-uploaded-image batch RPC. No new table, media rename, new environment variable, browser policy or direct name-update grant. Detachment clears the active row name and hides its field, while retaining media/history and immutable job names. A replacement asset starts unnamed; no removed label is copied forward.

New jobs use **snapshot schemaVersion 3**, preserving existing reference fingerprints plus character.name and product.name. Missing/blank names yield UGC_CHARACTER_NAME_REQUIRED / UGC_PRODUCT_NAME_REQUIRED with “Give your character a name to continue.” / “Give your product or prop a name to continue.” Overlength names use separate safe invalid-name codes. Prepare generation stays disabled until both saved names and all other requirements pass. SQL race-checks names against owned source rows for new enqueue; frozen validation thereafter uses the original snapshot names, not later Project edits. Existing v2 jobs keep their exact nameless shape, including idempotent recovery; none are backfilled, mutated or automatically reanalyzed.

M4's provider input accepts the frozen label as optional untrusted creator context for v3 only, with a creator-label context-v1 safety instruction; visual-analysis schema/base prompt version 1, privacy rules, per-role checkpoint reuse and uncertainty handling stay intact. Never treat labels as identity/brand/appearance evidence or executable instructions, or add them to observed visual facts. Completed analysis is reused before submission. Saving a label never invokes OpenAI or a worker.

**Required future M5+ contract:** Character Reference Sheet prompts reference the supplied Character name; Product Reference Sheet prompts reference the supplied Product / Prop name. Storyboards, dialogue/scripts, scene instructions and final video prompts use those frozen names consistently while retaining stable asset/reference IDs. Prefer “Maya picks up the Nova Watch.” over “Character 1 picks up Product 1.” Implement none of those later stages in this refinement.

**UGC Template adoption:** images and names are project-specific private inputs. An adopter supplies **1 Character image + 1 Character name + 1 Product / Prop image + 1 Product / Prop name**. Do not reuse the original creator's private labels as the adopter's required identities. The current explicit template snapshot already excludes reference assets/names; a future reusable storyboard may substitute/adapt its logical references using adopter-supplied names. No full adoption-generation flow is implemented here.

Manual setup/review: apply 040 after prerequisites through corrected 039, restart the app, then manually inspect field visibility/typing/Save/reopen/removal/replacement and missing-name readiness. No migration was applied by Codex. Keep Render/Inngest disabled and the local-only guard; no worker/job/OpenAI/browser/screenshot/full regression/build/deploy was run. Only minimal TypeScript, focused lint and offline schema/static checks are allowed.

## Official creation inputs

Incomplete drafts may be saved. Studio's UGC Prepare generation control becomes available only for saved/settled inputs passing owner-only server readiness; enqueue validates again before any new job. Client readiness is advisory and is not authorization or a charge. This prepares validation and, when explicitly enabled on the manually run local worker, reference analysis; video/cost review remain future stages.

| Input | Approved UGC V1 requirement |
| --- | --- |
| Project title | Nonempty, within the existing title limit |
| Creation Type | UGC; independent of legacy category |
| Character reference | Exactly 1 uploaded, verified, active, owned image with a stable reference ID |
| Character name | User-defined nonempty trimmed name, up to 80 characters, frozen with its source |
| Product / Prop reference | Exactly 1 uploaded, verified, active, owned image with a stable reference ID |
| Product / Prop name | User-defined nonempty trimmed name, up to 80 characters, frozen with its source |
| Aspect ratio | Existing 9:16, 16:9 or 1:1 choice |
| Scene description / creative direction | Nonempty, within the existing prompt limit |
| Duration | 5/10/30 for current selection and new UGC requests; historical 15-second projects/snapshots remain readable without rewriting |
| Visual Style | Original, Realistic, Cinematic, Anime, Cartoon / Illustrated |
| Tone | Professional, Funny, Dramatic, Energetic, Storytelling |
| UGC Type | Advertisement, Explanation, Unboxing |
| Narration | Valid settings wherever supported; retain existing prompt-driven mode until an explicit narration extension is approved |

No multi-character or multi-product generation in V1. Switching Creation Type retains hidden inputs; explicit removal detaches references without deleting historical storage. Older excess references remain visible/removable and block readiness. UGC template adopters must supply their own one Character and one Product / Prop.

**Current compatibility scope:** shared duration choices now use 5/10/30. A named legacy 15 value is retained only in stored schemas and while editing an existing 15-second project, preserving normal save/reopen and immutable snapshots. New UGC advisory/readiness/enqueue checks reject 15; the user selects a supported duration for a new preparation. Migration 038 adds 5 to project and legacy snapshot SQL validation without changing financial rules or old data. Stored Cartoon and prompt-driven `{ mode: "prompt" }` narration remain unchanged. Video/cost review remain future stages.

## Approved provider boundary

**OpenAI is the approved UGC V1 reasoning/source-analysis/storyboard provider; Higgsfield SOUL2 is the Character Sheet image provider behind CharacterSheetProvider. Product generation belongs to Milestone 6. No Gemini fallback for UGC.** Legacy `lib/ai/` remains separate. M5 supersedes earlier OpenAI Character-image assumptions.

Server/worker adapters use the official OpenAI API / SDK for analysis and future structured reasoning/storyboards/dialogue/scene planning. Character generation uses SOUL2 with the original private source via Soul ID v2, saved analysis and persisted deterministic wardrobe. Text reasoning and image generation have separate narrow adapters. Future video provider remains unselected; legacy fal/ElevenLabs behavior is unchanged.

Resolve provider/model configuration centrally from server-only environment/configuration and freeze the resolved configuration/version on each run. Milestone 4 implements official OpenAI SDK Responses multimodal analysis behind ReferenceAnalysisProvider, strict Character/Product schema v1 and reference-analysis-v1 prompts. Central configuration consumes OPENAI_API_KEY, OPENAI_REFERENCE_ANALYSIS_MODEL and explicit UGC_REFERENCE_ANALYSIS_ENABLED=1; no default model is selected. Use a Responses image-input/strict-output capable model and manually verify account access. SDK automatic retries/logging are disabled. New private records preserve validated output/usage and durable submission intent. See [provider/schema/privacy/error/setup details](reference-analysis.md). Future UGC_OPENAI_IMAGE_MODEL / UGC_VIDEO_PROVIDER / UGC_VIDEO_MODEL remain unconsumed placeholders; no image/video API is called.

Official OpenAI documentation checked for this contract: [image inputs and vision](https://developers.openai.com/api/docs/guides/images-vision) supports image analysis; [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) supports schema-constrained results; [image generation](https://developers.openai.com/api/docs/guides/image-generation) covers image generation and editing. Schema conformance still needs application validation for timing, ownership and references; handle refusal/incomplete output safely. Analysis uses Responses text.format strict JSON Schema and inline private image content; application validation also checks explicit unknowns/visible subjects. Exact model selection/access remains manual, with no provider traffic in this task.

## Approved staged pipeline

**Validate → OpenAI source analysis → SOUL2 Character Sheet → Product / Prop Sheet → one primary Location → structured ChatGPT storyboard/script + voice description → normalized Video Generation Package → determine cost → Review Generation Cost → explicit confirmation → future video generation → finalization → Studio Preview.** Explicitly enabled, user-run local preparation may bill OpenAI/Higgsfield; no automatic Codex provider calls or Sceenyk charging. Production preparation consent/funding/budget remains unresolved.

| Stage | Required work and persisted checkpoint |
| --- | --- |
| 1. Validate inputs | Independently resolve authenticated application owner, existing owned project, title, `creationType=ugc`, exactly one verified uploaded active Character image and one Product image, scene description, ratio, duration, style, tone, UGC Type and supported required narration options. Reject incomplete/foreign/detached/unverified inputs before AI work. Freeze an owned input revision. |
| 2. Analyze source references | Use OpenAI to describe supported visible traits of each uploaded image. Persist structured descriptions linked to stable reference/asset IDs and the input revision. Keep originals private. Treat image text and creative direction as untrusted data; they cannot alter ownership, execution policy or accounting. |
| 3. Prepare Character | Generate a Character Reference Sheet from the Character upload: supported appearance, face, hairstyle, clothing and important visual traits. Store the generated sheet privately in R2 and persist verified metadata/provenance. |
| 4. Prepare Product | Generate a Product / Prop Reference Sheet from the Product upload: supported shape, color, material, features and recognizable traits. Store privately in R2 with verified metadata/provenance. |
| 5. Build storyboard | Produce and server-validate structured scenes, actions, dialogue, references, shots, camera, environment, lighting, style, tone, transitions and timing. Persist versioned structured data, not only a prose paragraph. |
| 6. Prepare generation | Build and persist a normalized provider-independent package containing both private reference-sheet asset IDs, storyboard, settings, narration and scene instructions, plus final provider-ready instructions through an adapter. Determine server-authoritative cost and pause for review/confirmation. |
| 7. Generate video — future | Only after matched current cost confirmation and existing server-enforced accounting admission, submit the package to the approved video provider. Persist request identity before submission and reconcile the same remote operation. No video provider is implemented/selected here. |
| 8. Finalize — future | Verify successful output, store private video bytes in R2 and commit canonical output metadata, terminal success and existing exactly-once settlement through trusted server/database operations. Preview reads that persisted owned result. Provider acceptance alone never means Complete. |

Reference Sheets support visual consistency; **a single image does not establish perfect 3D reconstruction**. Describe visible facts separately from inferred unseen details. Mark inferred views/traits as generated reference information, including unseen material or clothing; do not present them as facts about the source. Preserve provenance so completed sheets can be reused safely after failure.

## Structured storyboard contract

The following is an illustrative shape, not a created storyboard, SQL schema or current API payload. Stable IDs resolve within the private run; published templates later use reusable logical slots. Exact field names can be refined/versioned at implementation.

```json
{
  "schemaVersion": 1,
  "duration": 10,
  "visualStyle": "Realistic",
  "tone": "Professional",
  "scenes": [
    {
      "id": "scene-id",
      "startTime": 0,
      "endTime": 10,
      "characterId": "character-reference-id",
      "productId": "product-reference-id",
      "action": [
        { "actorId": "character-reference-id", "productId": "product-reference-id", "instruction": "..." }
      ],
      "dialogue": [
        { "speakerId": "character-reference-id", "text": "..." }
      ],
      "camera": "...",
      "environment": "...",
      "lighting": "...",
      "transition": "cut"
    }
  ]
}
```

- The root `duration` equals selected duration; all timestamps are finite, nonnegative and use a documented unit. `0 <= startTime < endTime <= duration`; IDs are unique, ordered intervals do not overlap, and the final scene end fits inside the selected duration. Document any intentional gap/hold before claiming full coverage. Overlapping shots/transitions require an explicitly supported contract; they are not implicitly enabled by this example.
- Convert conceptual seconds to integer milliseconds at persistence/composition boundaries, following existing timing conventions; never use rounding tolerance to admit invalid intervals. Validate the complete timeline and dialogue fit before video submission. Any future final-output duration contract must explicitly handle shorter storyboard coverage without silently changing the requested duration.
- Character/Product IDs must resolve to the run's one owned stable reference of each role. Actions identify their actor/target Product; dialogue identifies its speaker, including an explicit narrator identifier if narration is supported. Do not leave identity associations inside ambiguous prose.
- Scene/shot instructions must carry action, camera, environment, lighting, style, tone, timing and transitions directly or through validated root defaults. Do not infer extra characters/products from a label or free text. Provider-specific unsupported instructions fail capability validation or require reviewed adaptation.
- Store a schema version and validated JSON/structured records with immutable input/configuration provenance. Raw provider text is not the authoritative storyboard.

## Normalized Video Generation Package

Persist a versioned package with generation/project/input revision IDs, stable reference IDs, Character Reference Sheet asset ID, Product Reference Sheet asset ID, structured storyboard, aspect ratio, selected duration, visual style, tone, UGC Type, supported narration instructions, scene instructions and normalized final prompt/instructions. An internal adapter derives the exact provider request and records its version and safe provider metadata separately. Bind package and quote to the same immutable revision; later input edits invalidate confirmation and do not mutate an in-flight package.

Keep schema and business logic independent of any single video API. Store durable private asset IDs, not expiring signed links; the trusted worker resolves narrowly scoped media access when required. Raw R2 keys, private URLs, provider payloads and internal identifiers never enter public/client DTOs. No new video API-specific database design is approved by this conceptual package.

## Cost review and accounting boundary

Preserve [existing accounting](accounting.md) and [server-authoritative quoting](pricing.md), including the separate free allowance, paid credit packs/manual top-ups, immutable ledger, atomic reservations, exactly-once settlement/restoration and separate Marketplace purchases. No charge for typing a prompt. Client state, stage labels, local worker execution and provider callbacks cannot grant credits or independently deduct them.

The intended experience is **Validate → build/prepare plan → determine cost → Review Generation Cost → explicit user confirmation → expensive video generation**. A quote must match the owned immutable package/input revision, trusted pricing version, eligibility and expiry. Retries of the same confirmation must recover the same admitted operation/reservation. Revalidate changed settings, stale quotes and insufficient credits on the server. Video submission must not occur before this boundary.

**Production preparation funding remains Needs confirmation:** M4 has explicit local-development enablement for the user's manual provider test; external OpenAI usage can be billed to the operator, with no Sceenyk credit deduction. This does not establish a production consent, funding/budget cap, quote staging or reservation policy for preparation or later sheets/storyboard. Preserve existing financial authority and unresolved production tariffs/refund rules. No accounting SQL, payment or balance change is introduced.

## Persistence, jobs and resume

Use asynchronous persisted jobs; no HTTP request/browser session must remain open through generation. Milestone 2 implements a server-only enqueue service returning safe owned progress and an independent local worker. It exposes no new HTTP route or Studio Generate wiring. Complete validation and generation stages remain future work.

**Existing reusable foundation:** source includes `projects`, `project_assets`, `generation_jobs`, `generation_plans`, provider-attempt/output tables and existing Marketplace snapshots. Current `generation_jobs` already has owner/project/request identity, immutable inputs, status/current stage, lifecycle timestamps, safe failures and legacy dispatch/claim metadata. `generation_plans.plan` is structured JSON but its schema/constraints and legacy stages are not the UGC V1 contract. Inspect the connected catalog, functions, grants and pending migrations before designing extensions; source migration files are not proof of the deployed schema. Do not invent or claim UGC tables/columns exist.

Conceptually persist:

| Record concern | Durable data |
| --- | --- |
| Job | Job/generation ID, user/owner ID, project ID, input/configuration revision, current stage, status, safe progress metadata; `created_at`, `started_at`, `completed_at`, `failed_at` and update timestamps |
| Inputs/assets | Stable Character/Product reference IDs, owned asset IDs, private object keys server-side only, MIME/type, length/checksum/verification metadata, source/derived relationships and timestamps |
| Planning | Structured source descriptions, inferred-trait provenance, versioned storyboard JSON and normalized generation package/settings |
| Execution | Stage attempt identity/status, lease/claim and expiry, retry count, idempotency key, provider/request/job identifiers, safe error code, reconciliation state and verified completed checkpoint |
| Cost handoff | Existing quote/reservation linkage and immutable package/pricing revision references, using existing financial authority |

PostgreSQL stores structured data/metadata, never large binaries/base64 media. Existing private R2 stores raw Character/Product uploads, both generated sheets, generated video and other large intermediates. Persist asset IDs/keys, not expiring read links. Every private read, upload, removal and status/result access independently resolves owner/project; background workers reload trusted relationships rather than accepting arbitrary caller URLs/keys. Scratch files on the laptop are bounded temporary processing space, never the canonical result.

Reopening/restarting reads saved checkpoints; it must not repeat completed expensive stages. Record enough claim/attempt state to distinguish work never submitted, pending, accepted, uncertain, verified complete and definitely failed. Reuse output only when input/configuration revision and verified private metadata match. A new deliberate revision is distinct from retrying the same run.

## Job Runner and development execution

```text
Next.js app → persisted owned job → Job Runner
                                    ├─ Local laptop runner — approved ACTIVE execution target
                                    └─ Hosted Render adapter — DISABLED; later option
Local runner → OpenAI / future video provider → database + private R2
```

**ACTIVE describes the approved local execution adapter; Codex has not started it.** Manually apply prerequisites through 039 and configure the private model/key plus explicit analysis opt-in before running npm run worker:ugc. Default handlers implement validate_inputs and analyze_references only. New validation continues under the same live claim; analysis securely loads frozen private references, checkpoints each validated role and pauses at queued / character_reference. Existing M3 analysis pauses require explicit --resume-analysis JOB_UUID. No Character Reference Sheet handler exists, and paused jobs cannot be reclaimed. Existing Sceenyk financial behavior remains separate. All UGC orchestration stays on the laptop, depending on neither hosted nor local Inngest. See [manual setup](reference-analysis.md#manual-setup-and-stop-boundary).

The local execution adapter owns polling/claiming/delivery and invokes the shared workflow runner; future stage/business services own validation, OpenAI, reference sheets, storyboard/package and accounting integration. Database-fenced 90-second leases, 20-second heartbeats, 5-second polling, bounded claims/retries and append-only events provide the infrastructure; see [jobs](generation-jobs.md). Only pre-provider validation is automatically recoverable; later uncertain stages require reconciliation. Long work runs outside Next.js requests. `npm run worker:media` remains the separate legacy signed Node/FFmpeg HTTP service and is deliberately bypassed by the UGC worker.

### Source inspection and reversible development controls

Before this unit, `.env.local` had Inngest Cloud credentials, no `INNGEST_DEV`, and a non-loopback `MEDIA_WORKER_URL`. This establishes a configured hosted route, not that any hosted service was running. `dispatchGeneration` could send through `lib/workflows/client.ts`; `/api/inngest` registered generation, recovery, visual/narration/composition/render/caption and financial reconciliation functions. Recovery can fan out downstream events. Shared `workerConnection()` supplies `/prepare`, `/narrate`, `/inspect`, `/render` clients, so the legacy workflow could reach Render. UGC UI preparation itself does not dispatch; the legacy generation contract is not a UGC job admission contract.

The single server-only switch **`SCEENYK_LOCAL_JOBS_ONLY=1`** is set in ignored `.env.local` and `.env.example`. Missing/invalid values also enforce local-only, including a local production build. Only the exact value `0` restores legacy transport and must be reserved for a later explicitly approved execution review:

- `lib/workflows/execution-policy.ts` is a shared transport guard, not Milestone 2's runner abstraction.
- `lib/generation/dispatch.ts` returns before reserving a dispatch attempt while paused, leaving the persisted outbox untouched. No fake dispatch acknowledgement, job completion or accounting transition is written.
- `lib/workflows/client.ts` rejects SDK transport before network access, even with existing credentials or `INNGEST_DEV=1`. **All Inngest execution/transport, hosted and local, is disabled in this mode.**
- `app/api/inngest/route.ts` returns safe, no-store HTTP 503 for GET/POST/PUT before SDK registration/execution handling; workflow definitions and signing behavior remain preserved behind the guard. This also pauses local financial cron/reconciliation invocation through that route, without changing their financial rules or direct payment/webhook services.
- `lib/media-preparation/config.ts` rejects non-loopback worker origins in local-only mode before any shared media-client request. Loopback HTTP is allowed in this mode for local `next start` as well as `next dev`; identifier-only HMAC/nonce/ownership validation remains required. The existing hosted URL and credentials remain saved privately, unusable by these clients while guarded. A later explicitly requested legacy media run can override the local process URL to `http://127.0.0.1:3012`; no worker is started here.

Restart an already running local Next.js process to load the explicit environment edit; an existing old process is not evidence the new source is active. Next.js shell/process variables override `.env.local`; keep the effective flag at `1`. The guard defaults to local-only even if `.env.local` is absent. No account-side Render suspension, Inngest Cloud toggle, deployment or hosted cancellation was performed or verified. Previously deployed revisions/in-flight hosted jobs are outside this local guard; historical Cloud pause is user-reported context, not a fresh platform audit.

`render.yaml` (manual Docker web-service Blueprint, auto-deploy off), Dockerfiles, worker entries, Inngest definitions/credentials and historical evidence remain intact. An auto-deploy-off Blueprint does not by itself stop job requests. Do not delete, deploy, sync or silently restore these integrations. Do not use legacy Generate to admit work against paused transport; existing reservations/jobs are not reset/released by this task.

### Future local → hosted transition

After explicit later authorization, move the same worker logic to Render background execution or another approved hosted runner. Only the job-execution adapter/environment/process lifecycle should change; validation, storyboard logic, OpenAI integration, persistence, state machine and credit/accounting integration remain shared. Review capacity, leases/recovery, secrets, signed callbacks/replay protection and accounting before rollout. Existing Render HTTP media service is a reusable component, not proof that a persisted UGC queue consumer has been built. Review whether Inngest is needed at all; a Render move does not authorize re-enabling it. Do not implement the transition now.

## Real progress and failure handling

Future Preview renders actual persisted backend stage/status with safe messages:

**Preparing inputs → Analyzing references → Preparing character → Preparing product → Building storyboard → Preparing generation → Generating video → Finalizing → Complete**, or **Failed** at the actual failed stage. Preparing generation must distinguish awaiting cost review/confirmation from runnable video work. These are approved UI labels, not newly installed database enum values. No fake percentages, timers or optimistic completion. Use meaningful measured counts only when backend data actually exists. Final video appears in Studio Preview through owner-authorized playback after verified finalization.

Each stage can fail independently. Store safe failure code, stage, timestamp and attempt identity; never expose raw provider responses/secrets or mark a failed/uncertain stage complete. A controlled retry must reclaim safely, preserve verified compatible expensive outputs, and avoid rerunning downstream stages until prerequisites are verified. Terminal failure and allowed restoration follow existing accounting; a duplicate retry/callback cannot charge or restore twice.

- Duplicate Generate clicks: durable request identity plus owner/project/input revision recovers the same request; changed input under the same identity conflicts.
- Duplicate execution: atomic database claim/lease, stage compare-and-set and unique attempt/output identity prevent parallel winners or stale-worker commits.
- Duplicate provider requests: persist submission intent and stable idempotency identity before sending; use provider idempotency only where supported. Reconcile an accepted/uncertain request by stored provider ID. If remote acceptance cannot be determined, stop for controlled reconciliation rather than blindly paying again.
- Replayed callbacks: verify provider authentication/signatures and freshness where supported, persist unique event identity, verify job/provider/owner mapping, and make transitions idempotent. Caller-reported completion is never trusted output/accounting truth.
- Crash between provider success and local commit: recover the same request/output and attach the verified canonical asset once. Preserve safe checkpoints and bounded retry/backoff; do not fabricate success or leak diagnostics.

## UGC Template / Marketplace contract

Keep **Project → Publish as Template → Manage Template → Publish to Marketplace**, existing creator/source uniqueness, ownership checks, rights-confirmed publication and immutable purchase/adoption snapshots. A published UGC Template is a reusable creative snapshot, separate from the private Project/run and later Project edits.

It may contain structured storyboard, Creation Type, UGC Type, duration, ratio, visual style, tone, supported narration configuration, intentionally reviewed creative instructions and generation settings. **Explicit future snapshot values: `required_character_count = 1`, `required_product_count = 1`.** These are required conceptual fields, not claims of current database columns. Current `lib/marketplace/contract.ts` snapshots do not yet carry structured UGC storyboards or these counts; Milestone 11 verifies/extends the existing snapshot path.

Publishing must build an explicit public-safe projection: replace private Character/Product identities in storyboard actions/dialogue with logical template slot IDs, remove private asset/job/provider/owner/storage identifiers, and reject private URLs/keys in instructions. Stable logical slots preserve relationships without linking the original private media. Do not blindly copy the internal generation package or raw storyboard JSON into Marketplace.

A Template must never expose or adopt the creator's original Character upload, Product upload, Character Reference Sheet, Product Reference Sheet, private R2 keys or private generation assets/provider internals. A deliberately published preview uses the existing separately reviewed safe derivative/public-preview boundary, not direct private source access.

When another user adopts: copy only the immutable reusable configuration/storyboard into their own Project; require exactly one adopter-owned Character and Product / Prop; generate their own private descriptions/sheets; remap logical slots to their own stable private reference IDs; then validate/build/run their own generation package and result under ordinary separate generation cost review. A template purchase/adoption never grants access to creator media or includes a generation charge implicitly.

## Manual testing policy and stop boundary

During current UGC development and manual testing, the user performs workflow acceptance. **Codex must not automatically run browser suites, screenshot suites, full regression suites, deployed acceptance, provider-generation tests, expensive OpenAI calls, video-generation calls or hosted background-job tests unless the user explicitly instructs Codex to test.** Do not generate paid provider traffic automatically. Only the smallest compile/type/static checks needed to avoid obviously broken code are allowed without that instruction. Historical test/deployment commands in other docs are evidence/reference, not current permission.

Milestone 3 uses source/document review, minimal TypeScript/focused ESLint and SQL/link/whitespace/scope review only. No browser/screenshot/integration/regression suites, production build, test jobs, worker startup, storage/provider requests, migration application or deployment. Existing Studio geometry is retained. Stop after Milestone 3; the user applies 036/037 and performs manual acceptance.

## Implementation milestones

| Milestone | Bounded outcome | Status |
| --- | --- | --- |
| 1 | UGC architecture/context preparation and reversible development execution safeguards | Complete |
| 2 | Generation-job schema + local job runner/state machine; preserve financial authority and separate preparation from awaiting confirmation | Complete in source; manual migration/runtime acceptance pending |
| 3 | UGC input validation + generation readiness, actual Studio enums/supported narration, immutable v2 snapshot and safe validation pause | Complete in source; manual 037/runtime acceptance pending |
| 4 | OpenAI Responses reference analysis, strict visual schemas, private checkpoints/usage and explicit local-development opt-in | Complete in source; manual 038/039/provider/runtime acceptance pending |
| 5 | SOUL2 Character Reference Sheet generation, private views/composition and durable local checkpoints | Complete in source; manual 041/provider/runtime/visual acceptance pending |
| 6 | Product / Prop Reference Sheet generation | Not Started — exact next milestone |
| Later preparation | One primary generated Location Reference Sheet/asset, persisted and reused across scenes | Not Started; stage/schema belongs to a later scoped milestone |
| 7 | Structured ChatGPT storyboard/script, stable voice description and semantic validation | Not Started |
| 8 | Normalized generation package + existing cost review integration | Not Started |
| 9 | Approved video-provider integration after explicit cost confirmation | Not Started |
| 10 | Real Preview progress + final private video playback | Not Started |
| 11 | UGC Template snapshot/adoption verification, public-safe slot projection and explicit required counts | Not Started |
| 12 | Manual local end-to-end acceptance performed by the user | Not Started |
| Later | Explicitly approved local → Render transition; review whether Inngest is needed | Deferred |

**Needs confirmation before dependent milestones:** production preparation consent/funding/budget policy, account access and manual SOUL2 quality/continuity acceptance, Product/Location generation contracts, future video provider/capabilities/duration/narration support and pricing, later schema extensions, narration extensions, final-output timing and retention/moderation/provider-cancellation policy. No unresolved choice authorizes Gemini fallback, hosted execution or invented pricing. **Stop after Milestone 5; exact next is Milestone 6 — Product / Prop Reference Sheet generation.**
