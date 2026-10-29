# Milestone 10 V2 — Continuous Multi-Scene Final Video Generation

## Historical V2 experimentation — superseded by V3 (2026-10-29)

**V2 ElevenLabs/Kling-era architecture: Experimental / superseded.** [V3 OpenAI + Higgsfield](generation-architecture-v3.md) is now canonical and **Planned / Not Started**. Preserve every V2 foundation, fal.ai research, master-audio proposal, test result and recovery rule below as dated historical/experimental evidence. V2's continuous native-sync proposal had already removed normal Kling, but its separate ElevenLabs/master-audio dependency is no longer the normal future path.

The existing source-only V2 foundation and 187-check evidence remain valid for their original scope and are unchanged. They do not verify Higgsfield capabilities or implement V3. The earlier next phase to build a dedicated speech master is superseded; do not activate/migrate/reuse previous executions or carry V2's supplied-speech gate into V3 by default. Next testing uses a brand-new project, different supplied image and fresh references/Storyboard/authorization. No runtime, configuration, provider request or old asset changes in this documentation task.

## Phase 1 foundation (2026-10-29)

**Phase 1 foundation Complete in source and focused offline verification. Paid V2 execution remains Planned / Not Started and disabled.** This separately authorized phase adds a planning-only profile; it does not activate the pipeline specified below. V1's paid scene/Kling flow, authorization/accounting/recovery and existing executions remain unchanged. Research used public official web documentation/schema only, with no credentials or inference/status/account/provider calls.

### Verified Seedance API contract

Reviewed on **2026-10-29** against the configured V1 model identifier, without changing it: [current official OpenAPI schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=bytedance/seedance-2.5/reference-to-video), [API input documentation](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video/api), [pricing/model documentation](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video) and [official prompting guide](https://fal.ai/learn/devs/how-to-use-seedance-2-5). Schema enums/descriptions take precedence over conflicting prose. These are public-contract findings, not authenticated account or generated-media acceptance.

| Requirement | Confirmed contract / foundation treatment |
| --- | --- |
| Exact model / endpoint | `bytedance/seedance-2.5/reference-to-video`; queue submission would use `https://queue.fal.run/bytedance/seedance-2.5/reference-to-video`. No submission method/payload is implemented in this phase. No switch to a regional or other endpoint. |
| Duration | Explicit whole seconds **4 through 30**, plus `auto`; maximum continuous duration **30,000ms**. Exact planning excludes `auto`. |
| Audio reference | `audio_urls` accepts MP3/WAV guidance, addressed as `@Audio1`, etc. Audio-reference support is confirmed. |
| Native lip animation | `generate_audio` explicitly describes native synchronized sound and lip-synced speech; default true. This confirms generated lip-sync, not exact supplied-speech-master synchronization. |
| Supplied speech driving mouths | **Unverified at the strict API-contract level.** The schema exposes reference audio plus generated lip-sync but does not explicitly guarantee their binding to the exact supplied speech/timing. Public model examples describe reference-track lip-sync, but are not such a contract or fal runtime acceptance. `supportsSpeechAudioDrivenLipSynchronization` stays unverified. |
| Multiple images | Up to **30** image references, **30MB each**; JPG/PNG/WebP/BMP/TIFF/GIF/HEIC/HEIF per the schema. Canonical reference ordering and roles must be explicit. |
| Multi-scene / multi-shot prompt | Supported as natural-language instructions: the schema's prompt example includes a scene cut. There is no structured shot-list API or frame-accurate cut guarantee. Preserve timed creative intent; do not claim deterministic output timing. |
| Aspect ratios | Explicit `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, plus `auto`. Exact planning excludes `auto`. |
| Resolutions | Schema lists **480p, 720p, 1080p**. Older model/guide prose lists only 480p/720p; retain the schema enum, while unknown 1080p output dimensions block its cost estimate. |
| Audio file limits | Up to **10** files, **15MB per file**, **1,800–30,200ms each**, **30,200ms combined**. Sample rate, channels, bit depth and speech-alignment tolerances are not declared. Segment slices must fit the limits; a long project master is not submitted whole. |
| Other references | Up to 10 MP4/MOV videos; each 1,800–30,200ms and at most 200MB; combined duration at most 30,200ms; 300–6000px per side, ratio 0.4–2.5, 24–60fps. All modalities together: at most **50 files**. Video references are outside the Phase 1 planning-input profile, although the estimator accounts for their documented billing rule. |
| Prompt / input limits | Prompt is string-or-null in OpenAPI, with no declared `maxLength`; overall payload maximum is undeclared. Do not interpret this as unlimited. API schema uses `@Image1`/`@Audio1`; some prose uses bracket notation. The foundation creates neither provider prompt payloads nor requests. |
| Workflow restrictions | `editing` forces duration/ratio to auto; `extension` forces ratio to auto. Neither is this exact-duration `reference` profile. Draft overrides resolution to 480p and has a separate seven-day completion lifecycle; no draft workflow here. Seed is not a perfect reproducibility guarantee. |
| Other fields / access | H264/H265/auto codecs, standard/high bitrate, optional seed/end-user identity are described. B2B end-user identity requirements, actual account availability and safety/access behavior need later verification. Do not change V1 configuration. |

### Pricing evidence and remaining uncertainty

The model page specifies token billing: `tokens = width × height × (inputVideoSeconds + outputSeconds) × 24 / 1024`. At 480p/720p the published rate is **$0.0214 per 1,000 tokens**. With video references, include their duration and multiply by **0.6**. Images/audio references add no separate token charge; generated audio on/off has the same video price. The headline per-second approximations differ from the token formula's worked examples; the adapter uses the formula and published dimensions, not a flat per-second rate or authorization ceiling.

The pure estimator uses rational integer arithmetic and rounds upward once to micro-USD. Example: 10s at published 1280×720 (or 720×1280), images/audio only → **$4.622400** video estimate. Voice costs and spend permissions are separate. The page mentions $0.0234/1,000 tokens for 1080p, but does not supply its dimension table; `estimateCost()` therefore returns **unavailable / OUTPUT_DIMENSIONS_UNCONFIRMED** for 1080p instead of guessing. This estimate is not an executable quote or account bill.

Still unconfirmed: exact supplied-speech-driven native synchronization, frame-accurate cuts, waveform preservation, undeclared prompt/body/sample-format limits, undocumented capability combinations and account/runtime acceptance. The generic native-sync flag and audio-reference flag cannot be combined to infer the stronger supplied-speech flag. `supportsExactShotTiming` and `supportsExactAudioPreservation` also stay unverified. Unsupported structured transitions (including current fade/crossfade intent) and required owned non-dialogue audio without a manifest fail explicitly in this foundation profile.

### Implemented capability and segment contracts

- [`capabilities.ts`](../lib/final-video-generation-v2/capabilities.ts): strict neutral snapshot with `maxContinuousDurationMs`, discrete `supportedDurationsMs`, three-state audio/multi-image/multi-shot/native-sync and stronger timing/audio flags, ratios/resolutions, image/audio/aggregate limits, nullable unknown prompt bound and source/configuration identity. `VideoGenerationPlanningProvider` exposes `getCapabilities()`, pure `validateRequirements()` and `estimateCost()` only.
- [`provider.ts`](../lib/video-generation-package/provider.ts): existing `VideoGenerationProvider` gains optional **type-only** `segmentPlanning`; existing V1 providers do not opt in. There is no runtime registry/factory selection change.
- [`contract.ts`](../lib/final-video-generation-v2/contract.ts): separate `ugc-final-v2-foundation` input/result. Each segment retains deterministic ID/version, exact absolute window/duration, included scene numbers, cloned scene actions/camera/lighting/dialogue/transition content, absolute/local dialogue references, shot-change ownership, all approved Character/Product/Location versions/hashes, intended master/slice binding, complete neutral instructions, capability hash, fingerprint and estimate. The plan includes the full capability snapshot, scope/approval/source hashes and fingerprint, and is always **`executable: false`**.
- [`package-input.ts`](../lib/final-video-generation-v2/package-input.ts): pure conversion of a canonical package plus separately supplied approval evidence/output choice/intended master binding. No lookup or claim of ownership/currentness/approval verification; a future authenticated boundary must establish those facts. No approved package/Storyboard mutation.
- [`seedance.ts`](../lib/final-video-generation-v2/adapters/seedance.ts): isolated adapter maps reviewed API limits into the neutral snapshot and estimates token costs. All provider-specific identifiers/rules stay here. No credentials, network, request builder, submit/observe method, V1 registration or paid authority.

### Implemented planner rules and validation

[`planner.ts`](../lib/final-video-generation-v2/planner.ts) uses dynamic programming over approved **scene boundaries**, minimizing segment count and preferring the longer first interval for equal-count solutions. It considers all exact allowed durations and adapter constraints; greedy longest-first is insufficient (for allowed 5s/8s and a 10s timeline, use 5s+5s rather than 8s+an invalid 2s remainder). No automatic split inside a scene/utterance, retiming, padding, truncation, creative rewriting or provider fallback.

Input validation checks ordered contiguous scene coverage, exact total and per-scene duration, contained action/dialogue windows, non-overlapping speech, structured delivery/transitions/audio cues, role/asset identity, ratio/resolution and file/count/format/duration limits. Multiple scenes require confirmed multi-shot support; no silent conversion to individual-scene requests. Speaking Character content automatically requires canonical audio, native lip animation and supplied-speech-driven synchronization, even when a caller omits those flags. Unknown extra requirements fail precisely. Adapter-specific combination errors propagate without core provider-name logic.

Canonical hashing reuses the existing pure sorted-key/integer JSON recipe without changing V1. Fingerprints bind owner/project/job, exact source/approval versions, all creative fields/references, intended audio, normalized capability snapshot, plan version and segment membership/times. Provider switching or dependency changes produce new identities. Unknown audio size and unbuilt/unbound master media remain explicit; this structural plan cannot bypass later measured-media validation or cost/authorization admission. The generic long-timeline test envelope is bounded to 100 scenes/600s; it does not expand today's 5/10/30s product options or change existing schemas. No plan persistence is introduced, so **no migration/configuration change is needed**.

### Current 10-second two-scene example

This is the owner's specified structural example using synthetic approved-package/voice metadata in offline tests; no live package, execution or media was read or changed.

| Item | Intended plan |
| --- | --- |
| Segment | One version-1 segment, 0–10,000ms, containing scenes 1 (0–5,000ms) and 2 (5,000–10,000ms). ID includes a deterministic fingerprint prefix. |
| Shot / dialogue | Internal shot change at 5,000ms; dialogue windows 1,200–2,600ms and 6,200–7,600ms, preserved exactly. |
| References / audio | All three approved reference roles; one intended 10s canonical master/slice with explicit version/timing hash and null unbuilt asset binding. |
| Verified fully capable fixture | Returns **1 × 10s**, preserves both creative scenes and all instructions, remains non-executable. |
| Actual reviewed Seedance profile with visible speech | Returns **CAPABILITY_UNVERIFIED: supportsSpeechAudioDrivenLipSynchronization**. No successful speech-ready plan/request is claimed. A non-speaking visual/audio-reference structure can plan as one segment; it does not resolve this speaking requirement. |

### Checks and next phase

`npm run test:ugc-final-v2` passes **187 network-forbidden synthetic capability/planner/cost/V1-compatibility checks**. Coverage includes 5/10/30s, multi-scene 10s (including creative shots shorter than provider minimum video duration), 60s→2×30s, unsupported/discrete durations, non-greedy planning, audio/native-sync/multi-shot gates, limits, timing, reference roles, ratio/resolution, deterministic fingerprints, provider switching and unchanged V1 preflight/Kling behavior. Full `tsc --noEmit --incremental false`, focused ESLint, added documentation links/anchors, whitespace and diff/scope review pass. V1 runtime/schema/route/UI/migration files are unchanged. No media, FFmpeg, providers, live DB/storage or execution jobs are used.

**Exact next separately authorized phase:** local canonical master-audio timeline/slice construction and validation, using synthetic or explicitly supplied saved speech, with immutable source/profile/timing bindings, exact-duration/silence placement and private artifact proofs. It can be developed offline while the stronger Seedance contract question remains unresolved. Resolve that question before later paid preparation/video integration. Provider submission, V2 persistence/admission, funding/retry wiring and runtime rollout are separate later work; none starts automatically after this foundation.

## Status and authority (2026-10-29)

The following initial architecture/status scope predates the separately authorized Phase 1 foundation above. Its full-pipeline Planned / Not Started status still applies to paid execution; the foundation now has its own source/verification status.

**Milestone 10 V1: implemented and proven end-to-end.** This is the owner's reported milestone baseline for this documentation update, supported by the retained V1 execution/approval history; it is not a fresh provider, deployment or all-cases acceptance audit. [V1 implementation and historical investigations](final-video-generation.md) remain intact, including dated failures, pending repairs and their original verification limits.

**Milestone 10 V2 continuous multi-scene generation: Planned / Not Started.** This document is the authoritative planned V2 architecture. It supersedes per-Storyboard-scene generation and mandatory separate Kling synchronization as future design defaults. It does not describe current runtime behavior. V2 is distinct from the existing Storyboard/package **schema 2** and `ugc-execution-v1` contracts, which already belong to V1; neither establishes V2 implementation.

This request authorizes documentation only. No application code, migration, provider configuration, environment variable, execution, asset or financial record changes; no provider calls, retrieval/probes, media generation, workers, FFmpeg execution or deployment. Older setup/recovery commands and permissions are historical references, not authorization for this task.

## Creative scenes and Generation Segments

Keep Storyboard scenes as the creative/planning units. They continue to define timestamps, exact dialogue, actions, facial reactions, camera angles/movements, shot changes, lighting, product interactions, transitions and pacing. A scene is not a provider-request boundary.

A **Generation Segment** is one continuous video-generation interval containing one or more approved scenes/shots, generated by one logical video operation. Its initial submission normally makes one video request; reviewed replacement attempts remain separate counted requests. The provider-neutral planner minimizes independent video generations subject to all verified provider limits and approved creative/timing requirements. Independent generation can introduce Character/wardrobe drift, changed Products, lighting/Location differences, broken movement, inconsistent lip-sync and visible stitching. Rendering several shots in one continuous request should improve visual and temporal continuity; it does not guarantee fidelity or remove validation.

For the selected Seedance 2.5 reference-to-video target, **5s, 10s and 30s projects should normally each use ONE continuous video**, even when they contain multiple Storyboard scenes. Longer content uses the fewest compatible larger segments and composes them afterward. Do not automatically issue a video request per scene.

Examples for a provider whose verified continuous-duration capability includes 10s and 30s, up to 30s:

| Approved Storyboard | Planned Generation Segments | Initial video requests |
| --- | --- | --- |
| 5s, any valid scene count, where 5s is supported | 1 × 5s | 1 |
| 10s, 2 scenes | 1 × 10s | 1 |
| 30s, 5 scenes | 1 × 30s | 1 |
| 60s | Prefer 2 × 30s | 2 |

The 60s example explains future planning, not a change to today's approved 5/10/30s project options. A maximum alone does not imply every shorter duration is supported.

## Canonical V2 pipeline

Existing explicit upstream reference, Storyboard and Generation Package approvals remain. Package approval alone does not start generation or authorize spending. Generate Final Video admits only reviewed finite work after currentness, capability and cost checks. From that admission, the intended 10-second flow is:

1. Consume the **approved Storyboard and approved immutable Generation Package** with exact Character, Product/Prop and Location references.
2. Plan Generation Segments from the selected provider's capabilities; a compatible 10s Storyboard produces one 10s segment.
3. Generate or reuse the compatible **CharacterVoiceProfile** and its reusable private voice binding.
4. **ElevenLabs generates the exact approved dialogue/narration lines** under the actual authorized voice workflow. Silence makes no speech request.
5. Validate measured speech and alignment; perform only allowed local timing correction, preserving original speech bytes and timing evidence. Content that cannot fit stops for reviewed recovery; never rewrite words or timestamps to make it fit.
6. **FFmpeg constructs one exact-duration master audio timeline** containing dialogue and silence at the approved Storyboard timestamps.
7. The Seedance 2.5 reference-to-video adapter receives the approved Character references, Product/Prop references, Location reference, complete Storyboard instructions for the segment, camera/action/lighting directions, exact duration/aspect ratio and the **master dialogue audio reference**. The 10s case includes the entire Storyboard and master audio in one request.
8. **Seedance generates ONE continuous video containing all planned scenes/shots**, including the explicit shot change at 5s in a two-scene 10s example.
9. Validate duration, visual/temporal continuity, complete shot coverage and audio/lip synchronization against the canonical audio, not merely the existence of an audio stream.
10. Use the **exact approved ElevenLabs master audio** for final output where required by the dedicated-voice contract. If necessary, replace generated dialogue audio locally with that canonical track, with no duplicate speech or timing shift; revalidate the result.
11. Local **FFmpeg formatting/composition** normalizes the final format and, only when there are multiple Generation Segments, composes them in approved order. It does not split a one-segment video back into independently generated scene clips.
12. **Final Video review → explicit approval → Complete.** Readiness is not approval. Reject and Delete never queues a replacement. No normal voice chooser, per-scene acceptance, manual lip-sync or stitching gate is added.

Required owned music/SFX and narration routing must still be supported and preserved. Native audio must not invent dialogue, replace the selected voice or silently drop a required cue. Unsupported required audio remains a fail-before-spend incompatibility.

## Provider-neutral capability contract

The [Phase 1 contract](#implemented-capability-and-segment-contracts) implements these values behind the optional planning-only provider profile. Full paid execution remains future work. Never hard-code provider names in orchestration:

| Capability | Meaning for V2 |
| --- | --- |
| `maxContinuousDurationMs` | Maximum one-request continuous duration in integer milliseconds. |
| `supportedDurationsMs` | Explicit allowed durations in integer milliseconds; planner must satisfy both this set and the maximum. |
| `supportsAudioReference` | Whether external canonical audio can condition this reference-to-video workflow; include audio count, duration, format/size and offset restrictions. Native audio generation alone does not establish this. |
| `supportsMultipleImageReferences` | Ability to bind all required approved references together; retain count, role and format/size limits. Never silently drop a required reference. |
| `supportsMultiShotPrompting` | Whether one request can express the required timed scenes/shots and internal transitions. |
| `supportsNativeLipSynchronization` | Native lip/mouth animation for generated speech. Supplied-speech-master synchronization additionally requires the stronger capability below. |
| `supportsSpeechAudioDrivenLipSynchronization` | Stronger supplied-speech-master binding, distinct from native generated lip-sync; unverified for the reviewed Seedance API and required for the intended speaking workflow. |
| `supportedAspectRatios` | Supported ratios for this workflow/output. |
| `supportedResolutions` | Supported resolutions and any duration/audio-dependent combinations. |
| Pricing estimator | Versioned estimate from actual segment duration/resolution/options, chargeable operations and trusted rate provenance; preserve unknown costs explicitly. |
| Provider-specific limits | Adapter-owned reference/audio/prompt/output limits, supported combinations, job/retrieval/retention semantics and recovery constraints, exposed as neutral compatibility results. |

Retain provider/adapter/configuration versions, support states **supported / unsupported / unverified**, reference-role coverage, output formats/codecs, seed policy, asynchronous observation and recovery support. Unsupported or unverified required features block the entire planned path before voice design/TTS/video spending. Adapters alone own endpoints, model identifiers, concrete request fields, reference tags, signing/delivery requirements, provider receipts and tariff translation. Core consumes neutral requirements, segment plans and normalized results; switching provider means replanning/requoting through these contracts.

**Phase 1 verification:** [the current schema findings](#verified-seedance-api-contract) resolve the public duration/audio/image/ratio/resolution limits above. [Remaining uncertainty](#pricing-evidence-and-remaining-uncertainty) still blocks exact supplied-speech-driven synchronization and runtime/account acceptance. Current V1 source ([provider contracts](../lib/final-video-generation/providers.ts), [fal adapter](../lib/final-video-generation/adapters/fal.ts)) still prepares scenes individually and disables native audio; it has no V2 master-audio submission contract and is unchanged. No capability probe or inference is authorized. Unsupported/unverified requirements stop before spend rather than silently reintroducing per-scene generation or Kling.

## Generation-segment planner

The pure planning boundary converts **Storyboard scenes → Generation Segments** using immutable approved content and a versioned capability snapshot:

1. Preserve exact total duration, scene order, absolute timestamps, dialogue windows, all reference bindings and approved shot/transition intent. Distinguish an internal shot cut from a separate generated video.
2. Find the **fewest feasible continuous intervals**, using the largest compatible intervals where that achieves the minimum. Respect allowed durations/increments, multi-shot/reference/audio/prompt/output limits and every supported capability combination; do not use `ceil(total/max)` as sufficient validation.
3. Prefer approved scene/shot boundaries when multiple intervals are necessary, while preserving exact timing and movement intent. A boundary cannot cut an utterance or transition unless the supported versioned plan explicitly preserves it; otherwise stop for reviewed planning rather than changing approved content. A shorter last segment must itself be supported. No silent padding, truncation, retiming or extra generation.
4. Compile **all scenes/shots in each segment into one neutral prompt/timeline**. Keep absolute project times plus a deterministic mapping `segmentLocalMs = projectMs - segmentStartMs`; include exact image roles, dialogue/audio bindings and boundary continuity instructions. Adapters translate that complete plan into vendor request fields.
5. Persist/freeze the structural plan before spending: planner/compiler version, capability/configuration snapshot identity, ordered segment IDs, start/end/duration, included scene IDs/content versions, complete instructions, references, required audio source/window bindings, output requirements and plan fingerprint. After speech/master construction, bind the exact immutable master/slice version and hash before committing each video intent; that downstream binding must match the frozen plan. Changing provider limits or structural plan is an explicit new execution-plan revision/requote, never an in-place reinterpretation of approved history.

Example: **0–5s: Scene 1 instructions; 5–10s: Scene 2 instructions → one 10s request with an explicit shot change at 5s.** The scenes remain individually editable/reviewable in the Storyboard; they do not create two provider operations.

Internal transitions belong to the segment timeline and must be supported by the video provider. Transitions between separately generated segments belong to deterministic composition and its exact overlap/handle rules. Apply each once. V1's compositor-owned transition filtering must not erase V2's internal shot changes or cause FFmpeg to duplicate them. Unsupported creative intent stops preflight rather than being flattened into a cut.

## Canonical master audio timeline

After speech validation/correction and before video submission, build **one exact-project-duration master audio asset**. For the target 10s Storyboard:

| Absolute interval | Canonical audio |
| --- | --- |
| 0.0–1.2s | Silence |
| 1.2–2.6s | Dialogue 1 |
| 2.6–6.2s | Silence / visual action |
| 6.2–7.6s | Dialogue 2 |
| 7.6–10.0s | Silence |

FFmpeg places verified speech at the approved integer-ms timestamps and fills the remaining intervals with silence. It must not concatenate utterances back-to-back, trim phonemes, move dialogue to a scene edge or regenerate speech to fill empty time. Validate decoded duration, alignment, codec delay and sample placement under an explicit versioned timing policy. Reuse the existing bounded speech-fitting policy where compatible, preserving source/derived lineage; V2 does not authorize broader correction.

The canonical master record must bind:

- An **immutable version and content hash**, stable private asset identity and storage/integrity proof.
- **Exact total duration**, plus measured decoded media properties, sample rate/channels/format and timing-policy version.
- **Dialogue timing metadata**: stable utterance IDs, exact text hashes, Character/profile/binding versions, approved absolute windows, actual placement/alignment and silence intervals, with Character-dialogue versus narration routing.
- **Source speech asset bindings**: exact original and validated fitted derivative IDs/versions/hashes, retained provider response/alignment evidence and any local correction receipt.
- Exact package/Storyboard/plan identities, builder/mix version and deterministic input/output fingerprints.

This master is the canonical dialogue/audio reference for **both video generation and final composition**. For a one-segment project, pass that complete asset. For longer projects, derive immutable exact-duration segment audio slices from the same master with recorded offsets/hashes; do not independently resynthesize or retime audio per segment. Use matching project offsets when composing segments against the full master, avoiding repeated dialogue or boundary gaps. Silence-only projects have a canonical silence timeline but no TTS/profile-design work unless speech is required; adapter handling must be explicitly supported.

The approved master means the exact validated audio derived from approved dialogue and the admitted voice/timing policy; it does not add an intermediate audio-approval screen. Creative acceptance remains final-video review.

Once bound to a video intent, the master cannot be overwritten. Changes create a new version and invalidate affected downstream fingerprints/sync proofs; preserve compatible prior outputs as history rather than pairing new audio with stale mouth animation.

## Speech animation and optional LipSyncProvider

**ElevenLabs owns the actual Character voice/audio. Seedance owns scene animation, Character motion, mouth/lip animation, shot changes and overall visual continuity**, conditioned by the supplied canonical audio and references. Native synchronized animation does not mean using a replacement provider-generated voice.

The default Seedance V2 pipeline has **no separate Kling stage**. It must not pay for Kling merely because a scene contains dialogue. Keep a generic optional `LipSyncProvider` capability for a provider/workflow that genuinely requires post-generation synchronization. Include it only in an explicitly selected, capability-validated execution plan with its own input/output lineage, cost/authorization, recovery and final validation. It is not an automatic fallback for failed Seedance synchronization, and its limits must not constrain a native-sync 30s segment unnecessarily.

Validate visible speaking intervals against the exact master, preserve non-speaking facial/action intervals and keep off-screen narration from creating unintended mouth motion. Replacing/muxing audio alone does **not** repair lip animation. If native visual synchronization fails, preserve the result/evidence and require reviewed segment recovery or an explicitly revised workflow; never hide it with audio replacement or silently purchase a post-process.

## Costs, request authorization and immutable identity

Calculate **video request count and pricing per Generation Segment**, not per Storyboard scene. Scene count remains creative metadata. Native synchronization adds no separate lip-sync request in the normal Seedance plan.

| Comparison for two scenes in 10s | Initial video requests | Separate lip-sync requests |
| --- | --- | --- |
| V1, both scenes require Character lip-sync | 2 Seedance | 2 Kling |
| V2, both scenes in one native-sync 10s segment | 1 Seedance | 0 |

Voice requests still follow the actual ElevenLabs workflow: compatible profile reuse or separately counted design/binding operations, exact utterance synthesis, and any authorized chargeable observation. **One video request is not one total provider request.** Local master construction and FFmpeg formatting add no video/TTS requests. Do not infer a dollar saving solely from request count: rates may depend on generated seconds, resolution, audio/reference options, account credits and provider-specific billing.

Freeze a segment-aware estimate and finite per-stage/segment/execution request and spend authority before admission; commit each immutable request intent before submission under existing ownership/version/lease fences. Recheck current approved inputs, capabilities, all existing intents/results, funding and remaining budget before every chargeable operation. Package approval is never spend consent.

A video request fingerprint binds owner/project/execution, package/Storyboard approvals/hashes, ordered segment plan and compiler versions, exact segment times/instructions/scene membership, approved reference versions/hashes, master audio version/hash (and slice/offset if used), provider capability/configuration/adapter identity and output/seed policy. Keep content identity distinct from paid attempt identity and provider job ID; exclude expiring signed URLs and claim timestamps. Same verified inputs reuse successful outputs, never overwrite them.

Preserve finite authorization, cost estimation, immutable fingerprints/receipts, the reviewed retry/amendment system, successful paid outputs and **fail-before-spend** behavior. A definitive retry-eligible failed segment needs reviewed authorization within the effective finite limits; an increase requires a separate recorded amendment. Unknown paid outcomes must reconcile first, regardless of remaining budget. Unknown prices stay unknown, and provider credits, immediate USD and Sceenyk customer credits remain distinct. V2 defines no new tariff, retail policy, refund or automatic customer-ledger mapping; existing unresolved commercial gates stay closed.

## Private artifacts, persistence and recovery

Use existing private media/service boundaries: server/database ownership and current-input enforcement, stable object identities, immutable conditional publication, SHA-256/ETag/length/MIME plus measured media proofs, durable response/source recovery and short-lived authorized access. Keep full master audio, derived slices, raw provider responses, continuous segment video, optional sync derivatives and final output as separate versioned artifacts with exact dependency manifests. Keep provider payloads/IDs/URLs in private adapter state; no private media in public/Marketplace projections.

These are required persistence concerns, **not new tables, columns, RPCs, buckets or installed key conventions**. A later implementation must inspect actual schema and reuse compatible owners, preserve append-only evidence and introduce explicit V2 execution/plan/artifact versions. Do not reuse the V1 scene row as proof that one video operation per scene is required, or relabel old `final-video-v1` assets as V2.

| Failure boundary | V2 recovery |
| --- | --- |
| Speech validation or master audio build | Preserve source speech/profile/references; retry permitted local fitting/build/storage only. New TTS is separately reviewed and authorized, never implicit. |
| Continuous video generation definitively fails | Preserve the exact master audio/slice and all approved references. Retry **only the failed Generation Segment** after reviewed authorization; preserve other ready segments and prior failed-attempt evidence. A multi-scene segment is the atomic video retry unit. |
| Video result exists, download/storage/validation interrupted | Recover the same retained response, local bytes or known provider result and verify private publication; no fresh video request. |
| Unknown paid outcome / lost acknowledgement | Retain intent/IDs, reconcile exact existing request/result before any new request. Timeout or missing ID never authorizes replay. |
| Native continuity or lip-sync validation fails | Preserve audio and video evidence; stop for reviewed segment recovery or an explicitly revised optional-sync plan with a new quote. No automatic Kling or creative rewrite. |
| Final local composition/formatting/storage fails | Reuse generated segment video and canonical master; rerun only local FFmpeg/validation/publication. Do not regenerate Seedance or ElevenLabs work. |
| Restart, duplicate command or expired lease | Reload immutable segment/stage state, fence claims, reconcile existing operations/objects and reuse successes. Worker claim counts do not reset paid attempts. |
| Approved source/profile/master changes | Create explicit new revisions and invalidate only affected dependencies; replan/requote/reapprove as required. Preserve completed V1/V2 history and never substitute assets into an old approval. |

Recover saved work remains provider-submission-free. A separately reviewed continuation/retry may admit only its declared remaining/replacement requests. Final validation/approval still verifies the exact private candidate, ordered segment/master manifest, required streams/duration/ratio and synchronization before atomic trusted Complete. It must preserve the existing lifecycle-independent creative-currentness and approval/rollback protections. Rejection does not delete shared upstream/master/segment history or authorize regeneration.

## Implementation boundary and future acceptance

V2 capability/segment-planning foundations are implemented separately; **paid execution implementation has not started**. Later authorized units must add master timeline/slice construction, persistent versioned execution manifests, segment-aware execution/preflight/accounting/recovery and final validation without rewriting approved V1 packages or completed records. A switch cannot silently migrate an existing execution or spend under its old scene/Kling authorization. Existing V1 completed executions, assets, approvals, receipts, fingerprints and recovery records remain valid under their original contracts.

Future acceptance must establish the combined Seedance capability, one video intent for compatible 5/10/30s multi-scene projects, exact master silence/dialogue timing and immutable reuse, native mouth synchronization/continuity, minimum feasible multi-segment plans, accurate voice/segment costs and reviewed retries, unknown-outcome reconciliation, composition-only recovery without provider calls, private owner isolation and final-only approval/completion. These are unrun acceptance criteria, not claims of implementation or permission to invoke providers now.
