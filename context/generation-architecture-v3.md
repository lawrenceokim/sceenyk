# Milestone 10 V3 — OpenAI + Higgsfield Generation Architecture

## Authority and status (2026-10-29)

**Milestone 10 V3 OpenAI + Higgsfield: Planned / canonical architecture / Not Started.** This is the authoritative intended generation architecture. It supersedes the normal provider, voice/audio, review and assembly strategies in the retained V1/V2 documents. It is a product/architecture decision, not a statement that the current runtime implements V3 or that Higgsfield capabilities have been verified.

| Version | Status | Treatment |
| --- | --- | --- |
| Milestone 10 V1 | Completed / proven end-to-end / historical | Owner-confirmed baseline. Preserve [per-scene video, ElevenLabs, Kling, composition and recovery evidence](final-video-generation.md), including original dated failures, pending repairs and acceptance limits. |
| Milestone 10 V2 ElevenLabs/Kling-era experiments | Experimental / superseded | Preserve [continuous generation, master-audio experiments and Phase 1 foundation](final-video-generation-v2.md). The V2 native-sync proposal already removed routine Kling, but retained ElevenLabs/master audio; its source-only planning checks are not V3 acceptance. |
| Milestone 10 V3 OpenAI + Higgsfield | Planned / canonical architecture / Not Started | Two external AI providers, native audiovisual Generation Segments, new-project testing and the review/composition rules below. |

**Current task is documentation only.** No runtime code, migrations, environment variables, provider configuration, existing execution/project/asset or financial authorization changes. No provider calls, media generation/processing, workers/jobs, live database/storage access or deployment. Earlier implementation/test/recovery commands and authorizations are historical references; they do not authorize work now. Existing uncommitted V2 foundation source is preserved unchanged.

## Provider responsibilities

Only **OpenAI** and **Higgsfield** are external AI providers in the planned normal generation path. FFmpeg is a local tool. Existing authentication, database, private storage, payment and job infrastructure are separate concerns and retain their security/financial contracts; this decision does not remove those services.

| Neutral boundary | Planned adapter | Responsibility |
| --- | --- | --- |
| `ImageGenerationProvider` | OpenAI | Character/reference creation and regeneration from supplied images and approved transformation instructions; other reference-image regeneration where appropriate. |
| `CreativeDirectorProvider` | OpenAI | Request understanding, reference analysis, cinematic Storyboard, dialogue/sound intentions and provider-neutral creative direction/instruction compilation. |
| `VideoGenerationProvider` | Higgsfield | Native audiovisual generation, with **Seedance 2.5 as the initial preferred video model**, subject to its verified Higgsfield API capabilities. |

These are the planned V3 boundaries and adapter assignments, not a claim that named interfaces/adapters are already installed. Core workflow must depend on neutral requirements, capabilities, plans and results. Model IDs, endpoints, reference tags, request fields, provider limits, billing units and response interpretation belong inside adapters. Changing a provider requires an explicitly compatible new plan/profile and quote, not provider-name branches or silent fallback.

### OpenAI references and Character Sheet

**User uploads a reference image → OpenAI analyzes the requested transformation → existing/generated prompts describe the desired appearance → OpenAI regenerates the reference while preserving important identity/visual characteristics → user reviews and approves.** This includes the existing Character Sheet/reference workflow. OpenAI may also create or regenerate Product/Prop, Location or other reference images where appropriate within this two-provider strategy.

Preserve useful Character Sheet/view requirements, names, identity/wardrobe/product/environment intent, private original/generated provenance, technical validation and explicit reference approval. Exact V3 image model, prompt recipe and view-generation sequence need implementation-time confirmation; do not invent an API/model or carry forward Soul ID/SOUL2 as a mandatory V3 image stage. Visual fidelity remains subject to review, not an automatic guarantee. Prior Higgsfield Character/Soul workflows remain valid historical source/assets and are not rewritten or disabled here.

### OpenAI as creative director

The structured, editable, reviewable Storyboard must express complete professional film direction: scenes/shots; exact intended timing; Character actions and facial reactions; Product interaction; dialogue; camera angles, movement and zooms; cuts/transitions; lighting; environment behavior; pacing; visual style; sound intentions; and other relevant cinematic instructions.

OpenAI owns creative interpretation and provider-neutral direction/instruction compilation. The approved Storyboard remains the creative authority; internal package/segment construction preserves its exact structured content and deterministically binds the approved versions. Existing Storyboard and Generation Package review/currentness safeguards remain. Do not silently add a paid compilation call, change approved dialogue or reinterpret a scene while serializing a package. Any separately needed AI compilation operation requires its own declared bounded scope and authorization in a later implementation.

### Higgsfield as audiovisual generator

Higgsfield should handle text-to-video, image-to-video and reference-to-video where supported, including Character/Product animation, camera movement, shot changes, native dialogue/audio, native lip synchronization, ambience, sound effects and supported visual/audio effects. It receives the approved references and complete cinematic instructions for each continuous Generation Segment.

Use native dialogue/audio/synchronization **where the selected Higgsfield model supports them**. These responsibilities are the intended strategy, not confirmed features of an installed adapter. Unsupported or unverified required instructions must fail before their paid execution; do not omit sound/dialogue or substitute ElevenLabs/Kling automatically.

## Canonical pipeline

**User input → OpenAI understands the request → OpenAI regenerates/creates references where needed → user approves references → OpenAI creates a professional Storyboard → review/edit/approve Storyboard and immutable Generation Package → convert approved direction into minimum Generation Segments → authorized Higgsfield audiovisual generation → user reviews generated video/segments → one segment: final review directly; multiple segments: FFmpeg joins approved segments → final review → approval → Complete.**

Package approval and segment readiness do not grant spending authority or complete the project. Keep explicit current cost authorization before paid execution. A single generated segment is already the final candidate: its video review/final approval does not need a duplicate intermediate segment-approval gate. For multiple segments, review/approve each generated segment first, then join and review the final candidate. Segment approval alone never marks the parent Complete.

The new normal flow has no separate ElevenLabs identity/TTS stage, Kling lip-sync stage or mandatory external master-audio build. Character voice/tone/dialogue can remain approved creative instructions for native generation; a separately designed provider voice/profile is not a normal prerequisite. Generic voice and lip-sync boundaries may remain available for a future explicitly selected workflow, with independent capability/authorization/versioning, but are not default stages or automatic recovery fallbacks.

## Generation Segments and continuity

Scenes remain creative planning units; **one Storyboard scene does not imply one generated video**. Keep scenes editable and reviewable, with timestamps, dialogue, actions, reactions, camera/lighting directions, product interactions, transitions, pacing and sound intentions.

The provider-neutral planner should minimize independent continuous generations while preserving approved creative intent and respecting the selected provider's actual capabilities. Each segment may contain several scenes/shots. Compile all of them into one complete segment instruction/timeline; express internal changes as timed shot/camera instructions inside that same generation.

### Videos up to 30 seconds

For the preferred Seedance 2.5 V3 target, videos **up to 30 seconds should normally use ONE continuous Higgsfield generation**, when the verified model supports that exact duration and required capabilities. There is normally no stitching.

| Storyboard | Intended Higgsfield plan |
| --- | --- |
| 10s: Scene 1 at 0–5s, Scene 2 at 5–10s | **1 × 10s** request, both scenes and a timed shot change at 5s. |
| Supported 30s Storyboard with several scenes | **1 × 30s** request containing the full approved shot sequence. |

This replaces the old default of two 5s requests for two scenes in a 10s Storyboard. Fewer independent generations should improve Character, clothing, Product, Location, lighting, movement and temporal continuity; quality still requires validation and user review. Intended timestamps are not a promise of frame-accurate provider output.

### Videos beyond the continuous limit

For content beyond the selected provider's maximum continuous duration, create the **fewest feasible larger Generation Segments**, not one video per scene. Target examples for a profile supporting 30s, 15s and the necessary shot/reference/audio combinations:

| Storyboard duration | Intended segments | Composition |
| --- | --- | --- |
| 45s | 30s + 15s | Review both; join approved segments once. |
| 60s | 30s + 30s | Review both; join approved segments once. |
| 90s | 30s + 30s + 30s | Review all three; join approved segments once. |

These are planning examples, not changes to current project-duration options or proof that these durations are available through Higgsfield. Use capability-driven minimum-segment planning, including allowed durations/increments, approved scene/shot boundaries and audio/transition constraints. A maximum alone does not prove every shorter duration is supported. If exact coverage is impossible, stop precisely; do not retime, pad, truncate, cut approved speech or silently change the provider/workflow.

Each future segment plan should bind its version/ID, project/approval lineage, absolute and local timing, included scenes/shot changes, exact dialogue and sound intentions, Character/Product/Location versions/hashes, complete neutral directions, requested output, selected capability snapshot/hash and deterministic fingerprint. V3's native-audio plan must not inherit V2's mandatory master-audio/ElevenLabs bindings or supplied-external-speech capability gate. Any reuse of V2's pure planning utilities needs an explicit compatible V3 contract; existing V2 plans remain historical/non-executable.

## Planned capabilities and verification boundary

The video provider contract should expose versioned neutral values/support states for:

| Capability | Required meaning |
| --- | --- |
| `maxContinuousDurationMs` / `supportedDurationsMs` | Exact continuous ceiling and allowed durations/increments, normalized to integer milliseconds. |
| `supportedResolutions` / `supportedAspectRatios` | Supported output choices and capability combinations. |
| `textToVideo`, `imageToVideo`, `referenceToVideo` | Advertised input workflows; verify each required mode separately. |
| `nativeAudio`, `nativeDialogue`, `nativeLipSync` | Whether required audiovisual speech/synchronization can be generated together, with documented controls/restrictions. Generic audio output alone proves neither dialogue nor lip-sync. |
| `multiShotPrompting` | Ability to express all required scene/shot changes within one generation; distinguish intended pacing from guaranteed cut precision. |
| `multipleReferenceSupport` | Required Character/Product/Location conditioning together, including image count/format/size and role limits. |
| Pricing estimation | Trusted model/account rate, billable units, selected duration/resolution/options, estimator version and unavailable/unknown results. |
| Provider limits | Adapter-owned prompt/media/output limits, feature combinations, queue/retention/retrieval, safety/access and recovery restrictions, surfaced as neutral compatibility results. |

Use supported/unsupported/unverified distinctly and fail before paid execution when required features are unsupported or unverified. Keep generic optional speech/lip-sync capabilities for future workflows without making them mandatory in V3.

**Needs confirmation before V3 implementation/paid acceptance:** the exact **Higgsfield** Seedance 2.5 endpoint/model ID, availability, continuous/supported durations, 480p support, ratios/resolutions, reference limits, native dialogue/lip-sync/ambience/SFX controls, multi-shot timing behavior, output/recovery contract and trusted Higgsfield pricing. Also verify the chosen OpenAI image/reference and creative-direction contracts. No specific endpoint/model fields, price, sample-format guarantee or account access is invented here.

Earlier [fal.ai research and V2 capability snapshots](final-video-generation-v2.md#verified-seedance-api-contract) remain useful historical evidence for that service only. A shared model label does not transfer fal's schema, rates, native-audio guarantees or limits to Higgsfield. No provider research/call/probe is performed in this documentation task. The preferred strategy is resolved; these are technical verification prerequisites, not a request to choose providers again.

## Development quality and pricing intent

**The intended default for the new V3 development/testing cycle is 480p**, for cost control, subject to verified Higgsfield support. This is a documentation default only: no environment variable, existing 720p V1 configuration or provider request setting is changed. If 480p is unavailable, report that incompatibility rather than silently selecting a more expensive output.

Possible future plan-based quality examples are **testing/free → 480p, standard → 720p, premium → 1080p**. They are illustrative future policy, not implemented plans, tariffs, eligibility rules, quotas or purchase promises. Do not implement plan pricing or change existing credit/free-allowance entitlements in this task.

Estimate video request counts and prices **per Higgsfield Generation Segment**, not per Storyboard scene. Reference analysis/image generation/creative operations retain their actual separately authorized OpenAI costs. One audiovisual segment is not one total project AI request. Do not copy fal.ai token prices, ElevenLabs credits, Kling tariffs or old execution ceilings into Higgsfield estimates; unknown rates remain unavailable and block paid admission. Keep provider units, USD and Sceenyk credits distinct.

The goals are fewer external AI providers, fewer paid requests/failure points, better native audiovisual synchronization, fewer independently generated scenes, stronger continuity, simpler recovery/accounting and easier testing. These are expected benefits, not measured V3 performance or guaranteed dollar savings.

## FFmpeg and review boundaries

FFmpeg is **local**, not an external provider/API. It joins videos only when multiple generated segments are required. For one supported ≤30s segment, go directly to final review after technical validation; no stitching or creative audio assembly is mandatory.

For multiple segments, use the Storyboard order and exact approved segment versions, then join their audiovisual streams. Preserve native audio/video timing. FFmpeg may inspect metadata, validate duration, normalize formats or perform supported compatibility conversion for either case. It must not be assigned normal speech generation, voice replacement, lip-sync creation, external master-audio reconstruction or creative sound assembly.

Internal shot/camera changes are generation instructions, not separate FFmpeg cuts between independently generated scenes. Any inter-segment transition/composition behavior must preserve the approved plan and be explicitly supported; do not invent overlap, trim speech or apply a transition twice. Technical stream/integrity/timing checks plus user review establish readiness; a response URL or successful join alone is not final approval.

User review is over actual persisted generated video: one final candidate, or each generated segment followed by the joined final candidate. No per-scene video review is implied when multiple scenes are inside one segment. Rejection never automatically buys a replacement. Final Complete requires current approved source/candidate/manifest, valid private media and explicit final approval under trusted accounting/completion rules.

## Private persistence, cost authority and recovery

Persist every successful Higgsfield audiovisual segment promptly in private Sceenyk-controlled storage, with immutable source/plan/request/attempt bindings, hashes, byte/media metadata and verified publication/readback. Preserve integrated audio/video provenance. Reference originals/regenerations and their approvals remain private, versioned and owner-scoped. Provider URLs are temporary delivery/recovery locators, not permanent asset identity. Do not introduce public media, guessed tables/buckets/RPCs or automatic cleanup; actual persistence design is a later catalog-verified unit.

Keep finite request/spend authorization, immutable fingerprints/intents, per-stage/segment budgets, reviewed retry/amendment controls, leases/currentness/duplicate fences and append-only receipts. Segment/source approval does not authorize another paid request. No full-run repurchase, uncertain POST replay or spontaneous provider/model switch.

| Recovery boundary | Intended V3 action |
| --- | --- |
| A segment succeeds | Persist/validate it and preserve its exact bytes/receipt; never regenerate it unnecessarily. |
| Another segment definitively fails | Preserve every successful/approved segment and reference; retry only the failed segment after reviewed finite authorization. |
| Unknown paid outcome | Reconcile the original intent/request/result before any new paid request, even if budget remains. Missing acknowledgement is not failure proof. |
| Known result but local download/storage/validation fails | Recover the same result/bytes and publication first; do not create another generation. |
| FFmpeg joining/formatting/final storage fails | Reuse all approved generated segments; retry only local composition/validation/publication. No Higgsfield/OpenAI regeneration. |
| Dialogue, continuity or synchronization is unacceptable | Preserve evidence; use explicit review and authorized replacement of the affected segment/workflow. Do not silently add separate TTS/Kling or edit approved creative content. |
| Approved inputs change | Create explicit new versions and invalidate affected downstream dependencies; never rebind an old approval/execution to new inputs. |

Existing entitlement, ledger, reservation, consumption/restoration and final approval/currentness protections remain authoritative. V3 creates no new refund, review-hold, automatic free generation, quota-reset or customer-credit mapping policy. Local recovery never becomes permission for paid regeneration.

## New-project implementation and testing cycle

The next implementation/testing cycle must begin with **a brand-new Sceenyk project and a different user-provided image reference**. It must create fresh Character/Product/Location/Storyboard data, fresh package/segment lineage, clean generation state and fresh explicit authorization/accounting for that new run. It must have **no dependency on the previous test project or execution**.

Do not migrate, resume, copy, rebind or reuse the previous test execution, assets, approved references, voice bindings, master audio, packages, provider receipts or spending authorization as new-run state. Historical projects/assets remain untouched as evidence; a new project is not permission to delete/reset them or reset account-level balances/free allowance. General source utilities may be assessed for reuse later, but historical execution data is not the fixture for this cycle.

Future acceptance must separately verify the two-provider contracts, 480p output, identity-preserving OpenAI reference review, complete editable director Storyboard, minimum continuous segments, native dialogue/audio/lip-sync where required, segment review, private persistence, finite segment-based costs/retries, unknown-outcome reconciliation and multi-segment local-only joining recovery before final approval/Complete. These are planned checks, not operations run now.

The next eligible separately authorized unit is **V3 contract/capability verification and source planning for this fresh-project path**, followed by scoped implementation and later explicitly funded acceptance. The earlier V2 recommendation to build an ElevenLabs master-audio stage is superseded and is not the next normal V3 phase. This task does not create a project, ask for uploads, start a worker, change runtime routing or begin testing.

## Documentation and historical preservation

[Overview](overview.md), [project overview](project-overview.md), [architecture](architecture.md), [UGC workflow](ugc-v1-workflow.md), [Character references](character-sheet.md), [reference analysis](reference-analysis.md), [reference review](reference-review.md), [Product](product-sheet.md), [Location](location-reference.md), [Storyboard](storyboard.md), [Generation Package](video-generation-package.md), [Final Video V1](final-video-generation.md), [V2 experiments](final-video-generation-v2.md), [voice history](voice-generation.md), [storage](media-storage.md), [jobs](generation-jobs.md), [dispatch](generation-dispatch.md), [FFmpeg/worker](media-worker-render.md), [database](database.md), [pricing](pricing.md), [accounting](accounting.md), [UI context](ui-context.md), [design system](design-system.md), [AI workflow rules](ai-workflow-rules.md), [code standards](code-standards.md), [historical failure investigation](m10-first-provider-failure.md) and [progress tracker](progress-tracker.md) link here for V3 rules.

Preserve all earlier V1/V2/Character implementation notes, capability research, request accounting, tests, failures and recovery records. Their original evidence remains valid within its original scope; old “canonical/current/next phase” labels and permissions do not override this V3 decision. Historical source remains unchanged and is not automatically a compatible V3 implementation.
