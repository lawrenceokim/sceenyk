# UGC V1 workflow contract

Approved 2026-10-23. **Milestone 1 — Complete. Milestone 2 — job infrastructure Complete in source; manual migration/runtime acceptance pending. Milestone 3 and all provider-dependent stages — Not Started.** This is the current contract for UGC implementation; it supersedes older Gemini/Inngest/Render roadmap statements only for this workflow. Historical implementation and acceptance evidence remain intact. Freestyle remains a separate creation flow with its existing contracts.

Milestone 1 documented the architecture and installed reversible development transport guards. Milestone 2 now adds migration 036, UGC jobs/events, shared state machine, server-only services and `npm run worker:ugc`; see the [actual job/runner contract and manual setup](generation-jobs.md#ugc-generation-jobs--milestone-2-complete-in-source-2026-10-23). No jobs were created, worker started or migration applied by Codex. No OpenAI integration, reference sheets, storyboards, videos, charging changes, deployment or hosted execution is implemented/authorized here.

## Official creation inputs

Incomplete drafts may be saved. Future Generate becomes available only when every required input is valid; the server independently validates again before admission or expensive work. Client readiness is advisory and is not authorization or a charge.

| Input | Approved UGC V1 requirement |
| --- | --- |
| Project title | Nonempty, within the existing title limit |
| Creation Type | UGC; independent of legacy category |
| Character reference | Exactly 1 uploaded, verified, active, owned image with a stable reference ID |
| Product / Prop reference | Exactly 1 uploaded, verified, active, owned image with a stable reference ID |
| Aspect ratio | Existing 9:16, 16:9 or 1:1 choice |
| Scene description / creative direction | Nonempty, within the existing prompt limit |
| Duration | 5, 10 or 30 seconds |
| Visual Style | Original, Realistic, Cinematic, Anime, Cartoon / Illustrated |
| Tone | Professional, Funny, Dramatic, Energetic, Storytelling |
| UGC Type | Advertisement, Explanation, Unboxing |
| Narration | Valid settings wherever supported; retain existing prompt-driven mode until an explicit narration extension is approved |

No multi-character or multi-product generation in V1. Switching Creation Type retains hidden inputs; explicit removal detaches references without deleting historical storage. Older excess references remain visible/removable and block readiness. UGC template adopters must supply their own one Character and one Product / Prop.

**Verified implementation gaps:** `lib/projects/options.ts` currently shares 10/15/30-second settings across flows, and stores the style label `Cartoon`. `lib/projects/ugc-v1.ts` derives readiness from that existing schema. Therefore approved 5/10/30 UGC duration validation and the Cartoon / Illustrated display mapping are future Milestone 3 work, not implemented by this document. Preserve legacy 15-second projects, saved snapshots and Freestyle settings through an explicit versioned compatibility decision; do not silently rewrite them. Current narration preparation is `{ mode: "prompt" }`, with centrally configured legacy voice; do not invent a working voice picker. UGC Generate remains unavailable today, even if the input-only readiness helper succeeds.

## Approved provider boundary

**OpenAI is the approved UGC V1 provider for reasoning, source-image analysis and generated reference images. Gemini must not be used or selected as a fallback for any UGC V1 planning/reference-generation stage.** Legacy `lib/ai/` Gemini implementation and its acceptance evidence remain separate; this task neither migrates nor removes it.

Future server/worker adapters use the official OpenAI API / SDK for interpreting creative direction, analyzing requirements, describing Character and Product references, producing structured storyboards and dialogue, scene/shot planning, camera instructions, timing and final video-generation instructions. OpenAI image-generation capabilities create any required Character and Product / Prop Reference Sheets from the uploaded references. Text reasoning and image generation are separate capabilities behind narrow adapters. The future video provider is a separate, unselected capability; this OpenAI decision does not select a video API or change legacy fal/ElevenLabs behavior.

Resolve provider/model configuration centrally from server-only environment/configuration, validate required capabilities and freeze the resolved configuration/version on each run. Do not scatter model names in prompts, routes, database enums or workers, silently change models during a retry, or silently switch providers. Proposed names (documented/commented in `.env.example`, **not consumed yet**): `OPENAI_API_KEY`, `UGC_AI_PROVIDER=openai`, `UGC_OPENAI_TEXT_MODEL`, `UGC_OPENAI_IMAGE_MODEL`, `UGC_VIDEO_PROVIDER`, `UGC_VIDEO_MODEL`. Missing/unsupported configuration must fail safely before spending. No model IDs, account access, prices or working SDK integration are asserted; `package.json` currently has no OpenAI SDK dependency.

Official OpenAI documentation checked for this contract: [image inputs and vision](https://developers.openai.com/api/docs/guides/images-vision) supports image analysis; [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) supports schema-constrained results; [image generation](https://developers.openai.com/api/docs/guides/image-generation) covers image generation and editing. Schema conformance still needs application validation for timing, ownership and references; handle refusal/incomplete output safely. Exact model and API options are selected in their implementation milestones after capability review, without provider traffic in this task.

## Approved staged pipeline

**Validate → analyze source references → Character Reference Sheet → Product / Prop Reference Sheet → structured storyboard → normalized Video Generation Package → determine cost → Review Generation Cost → explicit confirmation → future video generation → finalization → Studio Preview.** Preparation itself can incur provider cost; its funding/consent rules must be resolved before paid preparation is implemented. Nothing in this order authorizes spending or changes current accounting.

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

**Needs confirmation before paid preparation:** OpenAI reference analysis/sheet/storyboard work can cost money before video cost review, whereas existing legacy admission reserves accounting before dispatch. Define the consent, funding/budget cap, quote staging and reservation integration before enabling those paid preparation stages; do not assume they are free, invent a separate charge or bypass current reservation requirements. Production tariffs and cancellation/refund rules remain governed by their existing unresolved decisions. This task changes no accounting SQL, charging rules, payments or balances.

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

**ACTIVE describes the approved local execution adapter; Codex has not started the service.** Milestone 2 implements `LocalJobRunner` and `UgcJobRunner`, invoked manually by `npm run worker:ugc` after migration 036. The default registry has no stage handlers: claimed work stops safely at `validate_inputs` with `STAGE_NOT_IMPLEMENTED`, without pretending validation passed. The laptop worker uses existing hosted Supabase; future private R2/provider stages require separate implementation/authorization. All UGC orchestration/business-stage execution stays on the laptop, depending on neither hosted nor local Inngest.

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

Milestone 2 uses source/document review, focused TypeScript/ESLint and SQL/link/whitespace/scope review only. No browser/screenshot/integration/regression suites, production build, test jobs, worker startup, provider requests, migration application, deployment or Studio redesign. Stop after Milestone 2; the user applies the migration and performs manual acceptance.

## Implementation milestones

| Milestone | Bounded outcome | Status |
| --- | --- | --- |
| 1 | UGC architecture/context preparation and reversible development execution safeguards | Complete |
| 2 | Generation-job schema + local job runner/state machine; preserve financial authority and separate preparation from awaiting confirmation | Complete in source; manual migration/runtime acceptance pending |
| 3 | UGC input validation + generation readiness, including 5/10/30 compatibility and supported narration | Not Started — exact next milestone |
| 4 | OpenAI reference analysis; resolve preparation consent/funding before paid calls | Not Started |
| 5 | Character Reference Sheet generation | Not Started |
| 6 | Product / Prop Reference Sheet generation | Not Started |
| 7 | Structured storyboard generation and semantic validation | Not Started |
| 8 | Normalized generation package + existing cost review integration | Not Started |
| 9 | Approved video-provider integration after explicit cost confirmation | Not Started |
| 10 | Real Preview progress + final private video playback | Not Started |
| 11 | UGC Template snapshot/adoption verification, public-safe slot projection and explicit required counts | Not Started |
| 12 | Manual local end-to-end acceptance performed by the user | Not Started |
| Later | Explicitly approved local → Render transition; review whether Inngest is needed | Deferred |

**Needs confirmation before dependent milestones:** preparation consent/funding/budget policy, actual OpenAI text/image model capabilities and account access, future video provider/capabilities/duration/narration support and pricing, later stage schema/catalog extensions, narration extensions, final-output duration/transition rules and existing retention/moderation/provider-cancellation decisions. No unresolved choice authorizes fallback to Gemini, hosted execution or invented financial policy. Do not start Milestone 3 in this task.
