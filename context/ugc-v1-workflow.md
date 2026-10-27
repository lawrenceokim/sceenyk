# UGC V1 workflow contract

## Storyboard timing targets and optional owner text repair (2026-10-27)

AI planning distinguishes conservative preferred speech targets from unchanged hard limits, reserves action first with a 900ms target, and verifies final timing. Short scenes may remain silent. Timing-only correction can fix affected speech and action durations within the existing two-call budget. A completed saved response with only speech-budget failures can instead be explicitly edited by its owner and saved directly into review via manual 067, without generation/worker/retry. The original response stays immutable; all other creative fields/asset bindings stay fixed during repair, with normal review/Accept afterward. Existing upstream generation, approved references, accounting, Reject/Delete and hosted state remain unchanged. [Setup and manual steps](storyboard.md#timing-targets-and-manual-dialogue-repair-2026-10-27). Milestone 9 Not Started.

## Storyboard time-first dialogue planning (2026-10-27)

New explicit Generate requests supply calculated 5/10/30s scene, action/camera, speech, reaction and transition budgets before dialogue. Dialogue/narration share pause-aware per-interval/whole-video ceilings; concise 5/10s phrases, natural pace and realistic simple movement are required. Existing strict validators remain authoritative. The one existing correction gets exact line timing/count feedback and preserves otherwise-valid structure; failed saved work is not regenerated or rewritten. Review/edit/save/accept/delete, references, accounting and local/hosted state are unchanged. [Exact calculations and owner-run manual steps](storyboard.md#speech-budget-planning-before-dialogue-2026-10-27). No migration/configuration or Milestone 9 work.

## Storyboard validation review correction (2026-10-27)

Completed provider responses remain private and immutable when scene business validation fails. Studio shows all safe field-level errors and format corrections before explicit rejection; valid equivalent formats normalize locally without creative rewriting. Retry only queues a saved completed response that passes current validation and never contacts OpenAI, including retrieval. Current 10s output has excessive spoken words, so Retry is unavailable and its two paid responses stay preserved for investigation. Reject/Delete and any future Generate remain separate explicit choices. Approved references, parent job and limits are unchanged. No migration/configuration or Milestone 9 work. [Exact findings and safe choices](storyboard.md#saved-output-validation-investigation-2026-10-27) supersedes historical recovery instructions below.

## Storyboard provider recovery correction (2026-10-26)

Milestone 8 now streams and durably captures responses before parsing/persistence; explicit saved-work recovery cannot create a new paid request or correction. Missing output stays fenced with honest unknown-completion diagnostics and separate manual deletion/new generation. Default provider retention remains disabled; optional retention is a deliberate future-request setting. Approved references, accounting, local-only execution and the Milestone 9 stop are unchanged. [Current evidence, configuration and manual choices](storyboard.md#provider-timeout-evidence-and-recovery-only-correction-2026-10-26).

## Milestone 8 — AI Storyboard implemented in source (2026-10-26)

Current approval chain: Character → Product → Location → explicit Generate Storyboard → automatic detailed scene/script planning → editable review → Accept Storyboard → safe pause before generation package. Exactly one Character voice (also used for optional off-camera narration), one Product and one approved Location. Scene coverage is **exactly** 5/10/30 seconds with continuous non-overlapping integer-ms intervals; the historical illustrative partial-coverage allowance below does not apply to M8. Use all saved inputs and exact approved images; never invent unsupported claims. Native Studio timeline, private persistence/versioning/staleness, bounded correction/recovery and deletion are implemented. No final-video provider/package/credit work. [Current schema/setup/acceptance](storyboard.md); manual 066/runtime/provider/visual/ownership acceptance pending.

## Milestone 7 — Location (2026-10-26)

Both reference approvals lead to Generate Location → automatic private plan → one empty-environment image → manual approval → safe pause before storyboard. No pre-image form. Reject and Delete only removes that candidate and returns to idle; a separate Generate Location click reuses the plan or replans changed saved context. Recovery/cleanup cannot submit provider work. Planning/generation remain on the existing local worker; direct owner storage-only claims can recover/delete without starting it. [Current contract](location-reference.md) supersedes earlier behavior. No accounting, hosted, storyboard or video change; manual acceptance remains pending.

## Character V5 manual review (2026-10-25)

**Character V5 — Complete in source. V4 is superseded for new Character work. Manual migration 054 and provider/visual/runtime acceptance pending. Milestone 7 remains Not Started.**

Original image → static Soul 2 Face → manual Accept → static Back → manual Accept → static Front source conditioned on accepted Back → manual Accept → local adjustable Sharp headless Front → manual Accept → local FRONT / BACK / FACE sheet → explicit Approve Character Reference. Each paid stage waits for the previous user acceptance. Technical checks only; no automatic semantic rejection or OpenAI prompt/crop validation in V5. Private candidates are separate from accepted canonical pointers; Reject fences the candidate, deletes its R2 file, then clears its image pointer while retaining minimal audit metadata. Historical V1–V4 records remain readable and unchanged. Product generation, views and approval stay the same; only its Character dependency resolver admits approved V5 workflows.

[Authoritative V5 contract, setup, cleanup and verification limits](character-sheet.md#character-v5-manual-review-2026-10-25). Source-only authorization: TypeScript, focused lint and static/schema checks. No provider calls, worker/job execution, live mutation, cleanup runs, R2 deletion, remote SQL, builds, deployment, Render/Inngest or Milestone 7. Older sections below describe historical versions.

## Character V4 — current UGC Character contract (2026-10-25)

**Official Character direction: Complete in source; manual 053/provider/visual/runtime acceptance pending. Milestone 7 — Not Started.** The [full Character V4 contract](character-sheet.md#character-v4-official-workflow-2026-10-25) supersedes all older Character strategy/order/prompt-version/setup recommendations below. V3 is superseded for new Character references because direct Front-first generation remained unreliable. Older source-complete milestones remain historical implementation evidence, not V4 completion or execution permission. Other UGC inputs, privacy, financial and Product / Prop contracts are unchanged.

Required chain: **Original Character image → OpenAI Character analysis → Soul ID → Face → Back → Front source → local headless Front → local Character Sheet → Reference review → approval**. Each dependency must be validated and persisted before the next starts. Higgsfield Soul 2 Image-to-Image generates Face first (one shoulder/upper-chest portrait), Back second (one rear full body with feet), Front source third (one normal front full body with feet). All outputs use neutral gray, one person/pose, no collage, panels, insets, extra views or text. Face becomes identity authority; validated Back becomes the main body/outfit authority for Front, with Face/Soul identity support.

Never ask the provider for a headless person or final sheet. Preserve provider `front_source`; Sharp/local processing derives and separately validates headless canonical `front_reference` at a safe neck/collar/shoulder boundary, retaining outfit/arms/legs/footwear. Compose only validated canonical Front + Back + Face locally, in that display order, on gray with clean spacing and no original/extra figures/text. Rejected provider outputs remain private historical candidates, never canonical references.

Failure retries target the failed step: Face only; Back only preserving Face; Front source only preserving Face + Back; local crop only preserving provider source; composition only preserving all three canonical references. Reuse successful paid work and known receipts; uncertain outcomes require reconciliation. Progress follows the [17 persisted V4 phases](character-sheet.md#persisted-progress-and-references-ui), with no fake activity. References shows Original, Face, Back, canonical headless Front, Character Sheet; private diagnostics may separately inspect the intermediate source. Explicit current-version owner approval remains required before Product admission.

Current versions: **Character prompt 4; generation contract 4; strategy `face-back-front-v1`**. V1/V2/V3 jobs/assets/actual versions remain unchanged and interpretable; no historical rewrite, relabelling, backfill or replay. OpenAI retains Character analysis and later storyboard/script generation; Soul ID remains identity; Product / Prop generation/provider/approval stays unchanged. Source changes and TypeScript/focused lint/isolated schema checks only. No provider calls, workers/jobs, live mutations, remote migrations, browser suites, builds, deployments, Render or Inngest. Apply [053](../supabase/migrations/20261025005300_ugc_character_v4_dependencies.sql) manually after 052; no new environment/dependency.

Implementation refinement: the original may be reused as Face only after the complete V4 portrait contract, including neutral gray, passes; persist its origin. Explicit Face replacement invalidates Back + Front + Sheet/Character approval; Back replacement invalidates Front + Sheet/Character approval; Front replacement preserves Face/Back. Local crop/sheet repairs reuse paid output. See [current setup and acceptance limits](character-sheet.md#manual-setup-and-source-acceptance).

## Character V3 image-to-image pivot (2026-10-25)

**Historical / superseded by the planned V4 contract above; not new-generation guidance.**

Implemented in source; manual 052 and runtime/visual acceptance pending. [Current pipeline, source/Face rules, setup and verification limits](character-sheet.md#character-v3-image-to-image-pivot-2026-10-25) supersedes earlier Standard/V2 dispatch guidance. Character now uses SOUL2 Image-to-Image with private temporary input URLs, existing Soul ID, V3 provenance, retained Front source/local crop, preferred Front-conditioned Back and original Face reuse before fallback. OpenAI analysis/visual validation remains; it does not generate Character images. Product is unchanged. No providers, workers, live mutation, remote SQL, deployment, Render/Inngest or Milestone 7 execution.


## Stored Character recovery gate (2026-10-25)

New manual 049, after already-applied 048, makes current Character and Product approvals authoritative for queued Location eligibility. Review mutations reconcile the paused parent position; Character recovery stays at the existing Character pause until explicit approval. With both approvals, only the non-runnable Location-not-implemented pause is reached. The deliberate single-job recovery command uses saved Front/Back/Face and validates/promotes the exact unpublished sheet or composes locally, requiring fresh Character approval and preserving Product approval/history. It never enters provider execution, repeats analysis/training or begins Milestone 7. [Evidence, implemented command and acceptance limits](reference-review.md#stored-character-recovery-and-authoritative-approval-gate-2026-10-25). No recovery/live mutation was executed; Milestone 7 remains Not Started.

## Milestone 6.6 — Reference Regeneration + Review UX Correction (2026-10-24)

**Milestone 6.6 — Reference Regeneration + Review UX Correction — Complete in source. Manual migration/provider/runtime/ownership/visual acceptance pending. Milestone 7 — Not Started.** This section supersedes the historical 6.5 request-only execution and exclusive Preview rules below. [Current execution, versioning and manual setup](reference-review.md#milestone-66-execution-and-review-contract).

Exact UGC V1 visual contract for all newly submitted Character views: Front = ONE headless front-body/outfit image from neck/body area down, complete outfit/proportions/footwear, no head or inset. Back = ONE rear full-body reference with the same proportions/wardrobe/materials/colors/footwear. Face = ONE close-up face/head reference with original identity and hairstyle, no full body. Each provider request explicitly forbids contact sheets, multiple poses, additional views, alternate versions and text. Sceenyk alone composes ONLY Front + Back + Face, in that order, on neutral gray with three separated regions, no original/extra imagery/text. New generation document/prompt and composed visual contract are version 2; old v1 documents/files remain readable and untouched. Recomposition preserves unrequested historical view pixels, so inspect those inputs manually for old prompt artifacts. Decode checks do not prove image semantics.

Every long-running reference regeneration exposes real saved progress through Studio Progress. Progress and References are two local views of one persisted UGC workflow. Character regeneration clears only Character approval; Product approval is preserved. Stored validated replacement views become current individually; a completed Sceenyk composition returns the group to ready_for_review and requires fresh approval. Product remains Original/Primary/Angled/Detail/Product Sheet. No analysis/training repeats, uncertain paid replay, automatic approval or Location admission.

## Milestone 6.5 — Reference Asset Review (2026-10-24)

**Milestone 6 — Complete. Milestone 6.5 — Complete in source; manual 046/runtime/ownership/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This supersedes older stop points below. [Review UI, security, persistence and setup](reference-review.md).

Character/Product assets require explicit owner approval for their current sheet version. Historical sheets remain reusable and default ready for review. Individual regeneration is request infrastructure only: preserve unaffected views, invalidate composed sheet/approval, defer paid execution. Product admission requires Character approval; both approvals gate future Location eligibility, which remains unimplemented.

Input → Reference Analysis → Character Reference generation → Character Review/Approval → Product Reference generation → Product Review/Approval → Location Reference → Storyboard → Generation Package → Final Video → Preview. Existing cost-confirmation/accounting gates remain. Apply 046 manually after 045; no new environment/dependency. Render/Inngest remain disabled. No provider, worker/job, storage request, remote SQL, browser/screenshot, build or deployment executed. Stop after 6.5.


## Milestone 6 — Product / Prop Reference Sheet (2026-10-24)

**Milestone 5 — Complete. Milestone 5.5 — Complete. Milestone 6 — Complete in source; manual migration/provider/runtime/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This section supersedes earlier M6-not-started stop points below. See [Product Sheet contract and manual setup](product-sheet.md).

The approved OpenAI Product decision resolves the earlier SOUL2 suitability stop. ProductSheetProvider uses Sunburst Image Edit with the original private Product image on every independent primary/angle/detail edit. Saved observations support image authority; hidden geometry stays inferred. Completed Character and both analyses are reused; final Product completion pauses at queued/location_reference/LOCATION_REFERENCE_NOT_IMPLEMENTED.

Pipeline: Input → OpenAI Reference Analysis → Character Reference Sheet → Product / Prop Reference Sheet → Location Reference → Structured ChatGPT Storyboard → Generation Package → Final Video → Studio Preview. Existing cost-review/accounting gates remain; no user credits are deducted. Manual setup: pending 044 then new 045; OPENAI_PRODUCT_SHEET_MODEL=gpt-image-2.5-sunburst and explicit UGC_PRODUCT_SHEET_ENABLED=1 with existing OPENAI_API_KEY. Keep Render/Inngest disabled. No providers, worker/jobs, private media, remote SQL, browser/screenshot suites, build or deployment executed. Stop after M6.


## Milestone 5.5 — persistent live Preview (2026-10-24)

**Milestone 5.5 — Live Generation Progress UI — Complete in source; 043 applied per user; manual 044/new-job-timing/runtime/UI acceptance pending. Milestone 6 remains Not Started.** This section supersedes historical statements deferring all progress UI to Milestone 10. Every long-running Sceenyk generation workflow must provide persistent live progress feedback from real server-side state. The user must never be left staring at an unexplained empty Preview while a background workflow is running.

Studio restores the latest owned active job on Project reopen, polls its persisted progress every 2.5 seconds while unpaused queued/running/provider-waiting, and retains safe terminal failure details. Long-running active workflows may poll, but paused and terminal workflows must not continuously poll. Paused jobs refresh once on Check status or visible page/tab return; future explicit server-confirmed resume calls refreshAfterResume to read the same job and restart polling only after an actual active response. No resumed job loses completed checkpoints. Main presentation: validation → analyses → Character → Product → Location (pending, no internal stage yet) → storyboard → generation package → final video → finalization → Complete. Cost review/awaiting confirmation remain explicit pauses in the existing internal graph; no stage, paid operation or confirmation gate is bypassed. Future unimplemented work stays waiting, never timed into completion.

Character substeps use persisted Soul identity state, per-view operations and saved front/back/face/sheet assets. Detailed fixed-copy events are added transactionally by applied 043; historical checkpoints work without rewriting the job. A Character-complete Product pause shows Character reference complete / Generation paused / Your character reference is ready. Product Reference generation has not started yet. Product/later steps remain waiting. Elapsed processing uses nullable cumulative leased running time from manual 044; it freezes at pause, excludes queued/development downtime and shows Started earlier for old/unreconstructable history. Original started_at is not active time. Worker warnings use heartbeat silence of 90 seconds or lease expiry, not time since provider progress. Failed substeps retain prior completions and expose only the safe existing job error. No retry/new generation is triggered by reads, navigation or refresh. [Read model, event names and manual setup](generation-jobs.md#milestone-55--live-generation-progress-2026-10-24).

Completion removes progress and returns to the existing player/output branch without a page refresh. The existing final-video API accepts legacy accounted jobs only; actual canonical UGC output persistence/player linkage remains the later finalization/playback milestone. Do not falsely present a Character Sheet as a final video or invent a UGC output table here. Render/Inngest remain disabled; only the user's local worker executes, and no worker/provider/job was run by Codex.

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

**Historical baseline roadmap below.** Its M6/next-step and storyboard numbering predates later reference/review milestones; retain it as history, not current authorization. Current Character V4 is documented/planned with implementation Not Started; Milestone 7 — Location Reference generation remains Not Started, as recorded in the current [progress tracker](progress-tracker.md#character-v4--official-workflow-documentation-2026-10-25).

| Milestone | Bounded outcome | Status |
| --- | --- | --- |
| 1 | UGC architecture/context preparation and reversible development execution safeguards | Complete |
| 2 | Generation-job schema + local job runner/state machine; preserve financial authority and separate preparation from awaiting confirmation | Complete in source; manual migration/runtime acceptance pending |
| 3 | UGC input validation + generation readiness, actual Studio enums/supported narration, immutable v2 snapshot and safe validation pause | Complete in source; manual 037/runtime acceptance pending |
| 4 | OpenAI Responses reference analysis, strict visual schemas, private checkpoints/usage and explicit local-development opt-in | Complete in source; manual 038/039/provider/runtime acceptance pending |
| 5 | SOUL2 Character Reference Sheet generation, private views/composition and durable local checkpoints | Complete in source; manual 041/provider/runtime/visual acceptance pending |
| 5.5 | Persistent live Preview progress, Character substeps, safe job observability and refresh/reopen recovery | Complete in source; manual 043/runtime/visual acceptance pending |
| 6 | Product / Prop Reference Sheet generation | Not Started — exact next milestone |
| Later preparation | One primary generated Location Reference Sheet/asset, persisted and reused across scenes | Not Started; stage/schema belongs to a later scoped milestone |
| 7 | Structured ChatGPT storyboard/script, stable voice description and semantic validation | Not Started |
| 8 | Normalized generation package + existing cost review integration | Not Started |
| 9 | Approved video-provider integration after explicit cost confirmation | Not Started |
| 10 | Final private UGC video persistence/player linkage; persistent live progress moved to M5.5 | Not Started |
| 11 | UGC Template snapshot/adoption verification, public-safe slot projection and explicit required counts | Not Started |
| 12 | Manual local end-to-end acceptance performed by the user | Not Started |
| Later | Explicitly approved local → Render transition; review whether Inngest is needed | Deferred |

**Needs confirmation before dependent milestones:** production preparation consent/funding/budget policy, account access and manual SOUL2 quality/continuity acceptance, Product/Location generation contracts, future video provider/capabilities/duration/narration support and pricing, later schema extensions, narration extensions, final-output timing and retention/moderation/provider-cancellation policy. No unresolved choice authorizes Gemini fallback, hosted execution or invented pricing. **Stop after Milestone 5; exact next is Milestone 6 — Product / Prop Reference Sheet generation.**
