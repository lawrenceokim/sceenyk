# Milestone 10 V3 — OpenAI + Higgsfield Generation Architecture

## Phase 2 persistent preflight (2026-10-29)

[Phase 2 implementation, current official evidence, persistence, payload, review/recovery and exact Phase 3 prerequisites](generation-v3-phase2.md) supersede the older next-phase checklist below. V3 now has isolated source-only persistence/package/authorization and local inspection with manual migration 076. Paid execution remains disabled; V1/V2 and historical executions stay unchanged. Upstream/provider/runtime/UI acceptance remains pending.

## Phase 1 foundation

**Phase 1 Complete in source and focused offline verification. Paid V3 remains disabled and is not wired to application routes/workers.** The subsequent owner request authorizes this isolated foundation and official public documentation research, superseding the earlier documentation-only task scope for Phase 1 only. V1/V2 source and historical executions remain unchanged. No actual provider generation/estimate/status/account call, media generation/processing, project mutation, migration, configuration change or deployment occurred.

### Verified Higgsfield contract (2026-10-29)

Use the [official reference-to-video API](https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/api-reference), [text-to-video API](https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference) and [image-to-video API](https://open.higgsfield.ai/models/bytedance/seedance-2.5/image-to-video/api-reference). The [official documentation index](https://docs.higgsfield.ai/docs/llms.txt) explicitly gives model-specific documentation priority over the supplementary shared OpenAPI catalog; absence from that catalog does not mean a model is unavailable. No fal.ai schema/rate/limit is used as Higgsfield evidence.

| Field / behavior | Verified finding / implementation |
| --- | --- |
| Model identifiers | `bytedance/seedance-2.5/reference-to-video`, `bytedance/seedance-2.5/text-to-video`, `bytedance/seedance-2.5/image-to-video`; production base `https://api.higgsfield.ai`. The adapter owns these identifiers and all request fields. |
| Duration | Integer seconds 4–30; API default 5. The profile advertises the exact 4,000..30,000ms whole-second set, maximum 30,000ms. No auto duration or illegal tail. |
| Resolution | 480p/720p/1080p; API default 720p. **The isolated V3 planning default overrides to 480p** without changing existing runtime/provider settings. |
| Ratios | Reference/text modes list 16:9, 4:3, 1:1, 3:4, 9:16, 21:9. Image mode has no aspect-ratio request field; frame-derived output geometry needs later verification. |
| Output | MP4/MOV; default MP4. Completed video is returned in `video.url`; private storage, decoding and actual duration/streams still require later validation. |
| Audio | `generate_audio` boolean, default true. V3 prepares audiovisual requests with this flag; no separate TTS/lip-sync request is created. Native audio generation is confirmed, while exact dialogue/lip-sync/ambience/SFX/music behavior and quality guarantees remain unverified at this API-contract level. |
| References | Reference mode exposes `image_urls`, `audio_urls`, `video_urls`. Image mode requires `image_url` and optionally `end_image_url`; text mode has no media fields in its parameter table. |
| Limits | The current public reference parameter table gives no count/file-size/format/duration ceilings, nor prompt/body maximum. These stay **null / unverified**, not inherited from fal.ai or consumer/CLI claims. Required reference-limit verification blocks execution readiness. A sample-only bitrate field is not emitted because it is absent from the parameter table. |
| Multi-shot | The compiler can express the approved timed shot list, but the API table does not guarantee multi-shot adherence or frame-accurate cuts. Required multi-shot/transition support remains unverified; successful prompt compilation is not visual acceptance. |

The [official request lifecycle](https://docs.higgsfield.ai/docs/concepts/requests) confirms asynchronous submission, durable `request_id`, response-provided status/cancel locators and lowercase `queued`, `in_progress`, `completed`, `failed`, `nsfw`, `canceled` states. The adapter maps these to neutral states; mismatched IDs/unknown states require reconciliation, and completed output without a valid video locator is invalid. Status observation descriptors accept only the exact expected HTTPS API status path. They perform no GET. The TypeScript v2 example uses automatic polling; that is not installed or run here.

The [official retry guidance](https://docs.higgsfield.ai/docs/concepts/errors) describes idempotency keys, bounded status retries and same-key handling for ambiguous submissions. Sceenyk still preserves its stricter reconcile-before-new-paid-work policy; this phase contains no retry transport. [Billing/retention](https://docs.higgsfield.ai/docs/concepts/billing-and-retention) says provider failures/moderation are not charged and outputs normally expire after seven days. That does not alter Sceenyk's ledger/refund policy or authorize replay; future integration must preserve success bytes privately before expiry.

### Pricing implemented without network calls

The [official model pricing](https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/playground) publishes `ceil(width × height × (inputVideoSeconds + outputSeconds) × 24 / 1024)` billable tokens. Rates are $0.0214/1,000 tokens at 480p/720p, $0.0234 at 1080p; video inputs multiply the rate by 0.6 and add their durations, while image/audio references do not count as video input. The pure arithmetic helper requires explicit dimensions and uses integer/rational math; it does not infer exact geometry or discounts from a resolution label or headline per-second approximation.

For readiness, the [authenticated estimate response](https://docs.higgsfield.ai/docs/concepts/billing-and-retention) is authoritative. The adapter prepares the inert `POST /estimate/{model}` descriptor with the same mapped inputs as generation, but makes no request. `bindEstimateResponse()` models a future trusted capture of `{usd: "..."}` into exact command/profile/account-scoped, timestamped, expiring evidence. Its capture/expiry metadata is Sceenyk evidence, not additional provider response fields. USD is parsed strictly, rounded upward to micro-USD without floating-point conversion, and invalid/expired/wrong-account/wrong-input/conflicting observations remain unavailable.

**With no authenticated estimate evidence, the actual Higgsfield profile returns unavailable / AUTHENTICATED_ESTIMATE_REQUIRED.** No account amount, output geometry or discount is invented, and public pricing examples do not become an executable quote. Estimate, immutable authorization snapshot/ceilings and later actual provider cost/receipt are separate fields. Actual cost/receipt remain null. Changing output/model/profile/reference/audio settings invalidates quote/authorization bindings; changing a ceiling cannot change the estimated price.

### Source contracts, planner and compiler

- [`contract.ts`](../lib/final-video-generation-v3/contract.ts) defines independent V3 `ImageGenerationProvider`, `CreativeDirectorProvider`, `VideoGenerationProvider`, strict creative/reference/currentness/funding inputs, capabilities, immutable segment/plan and monetary evidence types. Video preparation exposes neutral metadata to core; concrete payloads are adapter-owned. No V1/V2 interface/schema is modified.
- [`openai.ts`](../lib/final-video-generation-v3/adapters/openai.ts) implements inert image-edit/reference and structured director-Storyboard preparations, plus strict result parsing. Models/token bounds are explicit constructor inputs, not new environment defaults or automatic model switches. It follows [official OpenAI image editing](https://developers.openai.com/api/docs/guides/image-generation) and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), checked against installed SDK types. No client, credentials, API call or automatic approval is created.
- [`higgsfield.ts`](../lib/final-video-generation-v3/adapters/higgsfield.ts) owns three model IDs, parameter mapping, natural-language reference-role/array-order mapping, capability limits/unknowns and status/locator normalization. All descriptors are explicitly `executable: false`. No SDK, transport, credentials, model submission, polling or estimate call is present.
- [`planner.ts`](../lib/final-video-generation-v3/planner.ts) uses dynamic programming over approved scene boundaries to find the fewest supported intervals; equal-count solutions prefer the longer first segment. Example: 31s with compatible boundaries → 27s+4s, never 30s+1s. Approved boundaries only at 30s and 31s instead fail precisely. A single scene >30s requires Storyboard replanning. Known prompt limits can force smaller legal groups or return a precise prompt-limit error; nothing is silently truncated/retimed.
- [`compiler.ts`](../lib/final-video-generation-v3/compiler.ts) preserves exact ordered scenes, dialogue wording/timing, actions/reactions, camera, lighting, style, identity/clothing/product/location continuity and sound intentions as structured data plus a director-readable continuous prompt. Internal shot changes belong to generation; an inter-segment boundary is reserved for joining after review. No model is called to compile approved content.
- [`identity.ts`](../lib/final-video-generation-v3/identity.ts) reuses the existing sorted-key/integer canonical hash recipe under new V3 domains; snapshots are normalized, plans deeply frozen, and scope/source/capability/command/estimate/authorization identities remain distinct. `assertPaidV3Execution()` always throws; no environment flag enables it.
- [`validation.ts`](../lib/final-video-generation-v3/validation.ts) checks complete scenes, positive contiguous timing, contained dialogue/actions, non-overlapping speech, current approval/reference/content hashes, same-project V3 provenance, supported outputs/reference limits/native requirements, finite authorization and independent estimates. Readiness rechecks provider snapshot, all current bindings, fresh estimate and immutable authority, and **always returns eligible=false / PAID_V3_EXECUTION_DISABLED**.

Each segment stores ID/version, exact project/package/Storyboard/provenance bindings, start/end/duration, scene numbers, full compiled directions and approved references, ratio/resolution/native-audio settings, capability hash, deterministic fingerprint, estimate, `executionStatus: not_started`, and null actual cost/receipt. The plan stores the full capability snapshot, current-input fingerprint and separate authorization snapshot. Single-segment composition is `direct_final_review`; multi-segment is `review_segments_then_join`. No FFmpeg, media or creative audio assembly is executed or required by this source foundation.

The generic 100-scene/600s planning envelope supports longer synthetic examples; it does not expand current product duration options or rewrite old approvals. Source/currentness/fresh-project/estimate/authorization objects must come from future trusted owner/database/receipt reconstruction. Their JSON shape/hash is not a signature, live grant or proof that a project is new. There is no route accepting them, persistence, paid transport, job registration, UI or migration in Phase 1.

### Ten-second two-scene example

The synthetic new-project fixture has Kai, a blue jacket, a ceramic cup and a bright studio, with fresh V3 reference/approval metadata. Its immutable plan has one segment at 0–10,000ms, scenes [1,2], 480p/9:16, MP4 and native audio enabled. An abbreviated director readout is:

```text
0–5s: Scene 1. Present the cup. Kai smiles and shows the cup.
Dialogue 1.2–2.6s, character, exact words: "Look at this."
At 5s: Cut to Scene 2 (approved transition 0ms).
5–10s: Scene 2. Present the cup. Kai smiles and shows the cup.
Dialogue 6.2–7.6s, character, exact words: "Ready to go."
```

The full compiler also retains every delivery, action/reaction, camera, lighting, continuity, reference and audio-intention field. Under the actual reviewed Higgsfield profile this structural plan remains blocked by unverified reference/native/multi-shot requirements and missing authenticated estimate; no paid-ready or quality-verified output is claimed. Fully capable synthetic adapters verify the successful planning contract without providers.

### Verification and exact Phase 2

`npm run test:ugc-final-v3` passes **270** focused offline checks; unchanged `npm run test:ugc-final-v2` passes **187** (457 total). These cover requested 5/10/30/31/45/60s cases, illegal remainders/boundaries, >30s scenes, default 480p, compiler/immutability/hashes, provider switching, reference/native gates, stale currentness/quotes/authority, mapped variants/statuses and independent pricing. They forbid network and make zero provider requests. Full TypeScript, focused ESLint, local documentation links/anchors, whitespace and final scope checks pass; SHA-256 comparison preserves all 60 protected historical source files exactly. No real project or acceptance media is used.

**Phase 2 before the first paid V3 test must:**

1. Resolve official/account-specific reference limits, native dialogue/sync/sound and multi-shot controls, selected OpenAI models, image-mode framing and safe input/output delivery/retention. Document any remaining unsupported requirement; do not substitute fal data or quality guarantees.
2. Integrate trusted fresh-project ownership/current-input/reference/approval reconstruction and explicit V3 persistence after actual catalog review, including immutable plans/paid intents, authorization/quote provenance and leases/idempotency. Add a migration only if that integration genuinely requires it; apply nothing automatically.
3. Implement scoped OpenAI reference/director services, durable response/output capture and user approvals, then Higgsfield estimate capture and separately reviewed finite authorization for the exact selected 480p audiovisual commands. Client-authored hashes, quotes or fresh-project flags cannot be authority.
4. Implement fenced V3-only transport, response-provided request/status IDs, uncertain-outcome reconciliation, private allowlisted media retrieval/validation and restart recovery. Keep V1/V2 isolated. Only after those guards and explicit authorization may a paid test submit a request.
5. Add actual single-final or multi-segment approval/readiness behavior and local technical/multi-segment joining only where needed, with current immutable final-manifest approval/completion guards. Verify with focused offline/transport fixtures before separately authorized runtime work.
6. Run the first explicitly funded/manual acceptance using a brand-new project, different uploaded image, fresh Character/Product/Location/Storyboard/package/authorization and clean V3 state. Do not reuse or migrate previous execution/media/voice/master-audio/paid authority. Review actual identity, timing, native sound/dialogue/lip-sync quality and privacy; none is proven by Phase 1.

Phase 2 is not started by this foundation. V3 runtime activation and all paid provider work remain disabled.

## Authority and status (2026-10-29)

The initial documentation-only/full-pipeline status below predates the separately authorized Phase 1 source foundation above. It remains the historical architecture decision; complete paid V3 execution is still not implemented/activated by Phase 1.

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

These boundary contracts and dry adapters now exist in the isolated Phase 1 source; their paid services/runtime integration remain future work. Core workflow depends on neutral requirements, capabilities, plans and results. Model IDs, endpoints, reference tags, request fields, provider limits, billing units and response interpretation belong inside adapters. Changing a provider requires an explicitly compatible new plan/profile and quote, not provider-name branches or silent fallback.

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

**Phase 1 findings and remaining confirmation:** [the official API findings above](#verified-higgsfield-contract-2026-10-29) establish model IDs, durations, resolutions/480p, reference array fields, output enums and shared lifecycle/estimate mechanism. Exact reference bounds, native speech/sound/shot guarantees, account access, safe delivery, selected OpenAI models and exact authenticated estimates still need Phase 2 verification. No unknown limit, output geometry, price or account acceptance is invented.

Earlier [fal.ai research and V2 capability snapshots](final-video-generation-v2.md#verified-seedance-api-contract) remain useful historical evidence for that service only. A shared model label does not transfer fal's schema, rates, native-audio guarantees or limits to Higgsfield. Phase 1 researched only official public documentation and made no authenticated provider call/probe. The preferred strategy is resolved; remaining technical prerequisites do not require choosing providers again.

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

The next eligible separately authorized unit is **the Phase 2 trusted integration and acceptance prerequisites above**. Phase 1 has implemented isolated planning/compilation/dry mapping with focused synthetic checks, not a real test project or paid runtime. The earlier V2 recommendation to build an ElevenLabs master-audio stage is superseded and is not the next normal V3 phase. No project/upload/worker/runtime activation or paid acceptance is started automatically.

## Documentation and historical preservation

[Overview](overview.md), [project overview](project-overview.md), [architecture](architecture.md), [UGC workflow](ugc-v1-workflow.md), [Character references](character-sheet.md), [reference analysis](reference-analysis.md), [reference review](reference-review.md), [Product](product-sheet.md), [Location](location-reference.md), [Storyboard](storyboard.md), [Generation Package](video-generation-package.md), [Final Video V1](final-video-generation.md), [V2 experiments](final-video-generation-v2.md), [voice history](voice-generation.md), [storage](media-storage.md), [jobs](generation-jobs.md), [dispatch](generation-dispatch.md), [FFmpeg/worker](media-worker-render.md), [database](database.md), [pricing](pricing.md), [accounting](accounting.md), [UI context](ui-context.md), [design system](design-system.md), [AI workflow rules](ai-workflow-rules.md), [code standards](code-standards.md), [historical failure investigation](m10-first-provider-failure.md) and [progress tracker](progress-tracker.md) link here for V3 rules.

Preserve all earlier V1/V2/Character implementation notes, capability research, request accounting, tests, failures and recovery records. Their original evidence remains valid within its original scope; old “canonical/current/next phase” labels and permissions do not override this V3 decision. Historical source remains unchanged and is not automatically a compatible V3 implementation.
