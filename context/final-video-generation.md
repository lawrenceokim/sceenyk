# Milestone 10 — Final Video Generation

## Status and authority (2026-10-27)

**Milestone 9 — Complete and approved. Milestone 10 — Blocked at the required audio capability gate; implementation not started. Runtime/provider/manual acceptance — Pending.** The subsequent implementation request supersedes the earlier documentation-only authorization, but explicitly requires stopping before paid-submission implementation when required capabilities cannot be verified. The assessment below records that stop; it does not claim source completion.

## Provider suitability assessment (2026-10-27)

Official public documentation was checked without authenticated provider requests. One GET-only database read found an approved package, content revision 1 / command version 6, with two 5,000ms scenes, 16:9 output, required dialogue and `consistentVoice: true`, no narration, and `stale_at: null`. Only safe timing/requirement metadata was printed; no prompts, dialogue, private media, credentials or identifiers were printed or persisted here. This read does not replace execution-time owner/current-upstream/hash/media validation. It made no workflow RPC or database/storage write.

The existing [strict package voice schema](../lib/storyboard/schema.ts) binds a Character asset, textual description and pace. The [package builder](../lib/video-generation-package/builder.ts) requires consistent voice whenever speech exists. Neither the canonical package nor its approved input provides an approved voice recording or a reusable provider voice identity. The documented V1 audio source/identity decision is still unresolved.

| Reviewed fal endpoint | Officially documented relevant support | Compatibility limit / unresolved requirement |
| --- | --- | --- |
| [`fal-ai/kling-video/o3/pro/reference-to-video`](https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video/api) | Image/element conditioning for characters, objects and environment; native audio; whole-second 3–15s clips; 16:9, 9:16 and 1:1; asynchronous queue/result APIs. Elements expose `voice_id` binding. | Candidate for the current 5s scenes, **not selected for execution**. Its documented voice binding needs a voice ID plus a compatible element reference manifest. Current M9 conditioning is composed sheets, not a silently substituted element image set. Exact reference mapping, measured output profile and audio timing still need preflight/acceptance. |
| [`bytedance/seedance-2.5/reference-to-video`](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video/api) | Up to 30 images, audio references, synchronized audio/lip-synced speech, whole-second 4–30s clips, all three package ratios and 480p/720p/1080p. | Current durations/count/ratio fit. No verified route from M9's textual voice description alone to an identical voice across independent requests. Reference audio would be an additional approved execution input. |
| [`bytedance/seedance-2.0/reference-to-video`](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/api) | Up to nine images and three audio references; synchronized native audio; whole-second 4–15s clips; all three package ratios. | Same unresolved voice-source boundary; a reference-audio capability does not supply an approved recording. |
| [`fal-ai/vidu/q4/reference-to-video`](https://fal.ai/models/fal-ai/vidu/q4/reference-to-video/api) | Up to 12 image references; up to three MP3 voice references, each 3–12s; native dialogue/effects; whole-second 3–16s clips; all three package ratios. | Consistent-voice conditioning is documented with audio references, which M9 does not supply. |
| [`fal-ai/veo3.1/reference-to-video`](https://fal.ai/models/fal-ai/veo3.1/reference-to-video/api) | Reference images, generated audio, 16:9/9:16; default duration 8s. The endpoint announces deprecation on November 17, 2026. | No verified 5s reference-mode/stable-voice path from the current package; 1:1 is absent. Not selected. |

The concrete Kling [Create Voice contract](https://fal.ai/models/fal-ai/kling-video/create-voice/api) requires a clean single-speaker audio/video recording lasting 5–30 seconds and returns a voice ID. It does not synthesize an approved voice from M9's description. No creation request was sent. This is an input/audio-strategy gap, not a claim that these models cannot generate speech. Likewise, the current package's 5s scenes fit several models; fractional/short scenes allowed by the general M9 contract would need their own compatibility rejection rather than silent rounding or trimming.

**Decision:** no reviewed adapter/profile is verified as an end-to-end fit for the current required consistent-voice workflow using its existing approved inputs. Follow the owner's stop condition before implementing paid submission. Preserve required dialogue and the M9 approval pause. Do not infer a reusable voice from a text prompt, silently clone an unapproved voice, introduce TTS, add conditioning views or generate the entire movie to evade scene independence. No adapter, scene records, scene/final UI, stitching, accounting integration or completion path was implemented in this assessment.

### Verified transport/recovery obligations for later implementation

The official [Queue API](https://fal.ai/docs/documentation/model-apis/inference/queue) documents submit → request ID → status/result retrieval and `X-Fal-No-Retry: 1`. [Reliability](https://fal.ai/docs/documentation/model-apis/inference/reliability) also documents automatic model fallback and per-request `x-app-fal-disable-fallback`. A later adapter must explicitly disable both remote retries and fallback, as well as client POST replay; timeout alone does not cancel inference. A missing submission acknowledgement remains an unknown paid outcome, not permission to submit again. These headers are researched requirements, not implemented protection.

The [retention documentation](https://fal.ai/docs/documentation/model-apis/media-expiration) distinguishes request-history payloads from generated CDN media and supports an explicit media lifecycle preference. Expired media is irrecoverable. A future frozen adapter profile must select an adequate retrieval window/access policy and persist known request IDs/completion receipts plus private recovery bytes before retrying storage. No retention setting, account configuration or exact billing/idempotency guarantee was inferred or changed.

### Required resolution and manual verification before continuing

1. Select an explicit neutral audio strategy for required dialogue and cross-scene voice identity: an approved reusable recording/identity with a compatible native model, or a separately specified audio adapter and approved voice. Persist its immutable approval/provenance and exact scene/package binding in the execution profile; keep concrete provider IDs inside adapters. Do not modify the approved creative package to hide missing audio.
2. Resolve exact conditioning from the existing three approved images, output resolution/frame rate/container, quantization tolerance and declared transitions. Validate full translated prompts, duration limits and voice/reference cross-constraints for every scene. Do not round scene timing or silently add views.
3. Finish the requested source implementation, migration and offline fixture checks only after those dependent contracts are resolved. Source migration 068 remains the existing baseline; no M10 migration/configuration is created by this assessment.
4. Before owner-run paid acceptance, obtain a current exact package validation, compatible capability/profile receipt, finite attempt/spend budget and explicit generation authorization under existing accounting rules. Package approval is not payment consent.
5. Only after implementation: manually verify duplicate starts, unknown submission outcomes, restart/lease recovery, storage-only recovery, partial-scene failure, explicit scene acceptance/rejection/regeneration, exact-order local stitching, required audio, private final validation and final approval. There is currently no M10 command/UI to test; do not run a worker or paid generation to work around this block.

Assessment verification: public documentation/source review, the single successful GET-only package read and documentation diff/link/whitespace checks. No paid or authenticated provider call, worker/job execution, media generation, storage operation, migration creation/application, test/build, deployment or hosted-setting change. Render/Inngest guards remain unchanged. The planned sections below retain their architectural authority; statements about the earlier documentation task describe that historical preparation, not a new restriction overriding the implementation request.

This is the authoritative planned M10 execution contract. [Video Generation Package](video-generation-package.md) remains authoritative for the implemented M9 immutable input/scene contract. Other context files link here for M10 rules rather than defining competing schemas. Earlier legacy provider/worker acceptance and renderer settings remain dated evidence, not an implemented UGC M10 workflow or permission to execute it.

The approved plan is:

**Approved Generation Package → Provider capability check → Provider adapter translation → Generate scenes → Save scene outputs → Review/recover failures → Stitch scenes → Validate final video → Final video review → Approve → Complete.**

Scene review is an explicit gate inside this flow: successful private storage makes a scene technically ready; owner acceptance of that exact version makes it eligible for stitching. Package approval, provider completion, scene readiness and final approval are separate facts. No final video, paid request or worker is run by this documentation task. [Current development restrictions](ai-workflow-rules.md#milestone-10-documentation-scope-2026-10-27) keep Render/Inngest disabled and execution local/manual.

## Verified source boundary and planned extensions

| Existing source inspected | Current fact / M10 consequence |
| --- | --- |
| [`lib/video-generation-package/contract.ts`](../lib/video-generation-package/contract.ts), [`builder.ts`](../lib/video-generation-package/builder.ts) | M9 freezes exact approved references/Storyboard/settings and structured neutral scene prompts, timing, voice and audio instructions. Current conditioning uses two composed sheets plus one Location image. Output resolution/frame rate/format/seed remain unspecified. Do not mutate the approved package to fit an API. |
| [`lib/video-generation-package/provider.ts`](../lib/video-generation-package/provider.ts) | `VideoGenerationProvider<Payload, Result>` already declares identity/version, capabilities, validation, translation, submit and status operations. It has no concrete UGC adapter, registry, matching or network implementation. |
| [`lib/ugc-jobs/local-runner.ts`](../lib/ugc-jobs/local-runner.ts), [`scripts/ugc-worker.ts`](../scripts/ugc-worker.ts) | Existing local claims/leases/heartbeats/queues and package-only mode are implemented. Package approval still pauses; there is no M10 consumer path from it. Package-only mode must remain package-only. |
| [`lib/video-ai/provider.ts`](../lib/video-ai/provider.ts), [`providers/fal.ts`](../lib/video-ai/providers/fal.ts), [`config.ts`](../lib/video-ai/config.ts) | Legacy execution directly selects fal with its own endpoint/model/scene configuration. Evaluate narrow reuse later; do not wire this hardwired API into canonical UGC logic or assume its historical limits/pricing prove M10 compatibility. |
| [`lib/composition/contract.ts`](../lib/composition/contract.ts) | Legacy composition uses integer-ms timing, zero technical timeline tolerance and only none/cut transitions. Preserve those existing contracts; broader M10 audio/transitions require an explicitly versioned integration decision. |
| [`lib/final-render/contract.ts`](../lib/final-render/contract.ts), [`workers/final-render/composition.tsx`](../workers/final-render/composition.tsx) | Legacy rendering has fixed 24fps/H.264/AAC settings and an 85ms output verification allowance. These source settings are not an approved M10 execution profile. Existing Remotion/Render packaging does not authorize hosted execution. |
| [`lib/voice-ai/contract.ts`](../lib/voice-ai/contract.ts) | Legacy voice records are ElevenLabs-specific. M9 stores an approved voice description/pace, not generated audio or a selected synthesis identity. Do not claim those legacy types implement neutral UGC audio. |

Future implementation may extend the generic provider/capability/execution contracts compatibly and with versions. Current types do not yet explicitly declare image-to-video/text-to-video modes, frame-rate support, result retention/retrieval windows, polling/webhook authentication or cancellation semantics. Record these as planned adapter obligations, not already supported methods/fields. No TypeScript, adapter/configuration, worker, SQL, dependency or UI implementation changes occur here.

## Provider-independent architecture

Core flow: owned current approved `VideoGenerationPackage` → neutral execution profile and complete preflight → frozen scene operations → `VideoGenerationProvider` adapter → private verified scene artifacts → exact accepted-scene manifest → neutral composition/audio plan → local assembly → verified private final artifact → owner final approval → trusted completion.

Core services own authorization, stale-input checks, scene state, paid-attempt admission, idempotency, private assets, review/versioning, recovery, composition and financial handoff. They consume provider-neutral commands, capabilities, normalized statuses/results/errors and opaque configuration identities. They may persist/display safe provider/model identities for provenance; they must not branch on vendor payload fields or interpret vendor status bodies.

Adapters/configuration exclusively own concrete model/endpoint IDs, request fields, reference formatting/access delivery, supported modes, duration/ratio/resolution/frame-rate rules, seeds, request submission, polling/webhooks, raw result parsing/URLs, provider request IDs, retention/retrieval, pricing metadata and error translation. Normalize provider failures into safe core categories such as unsupported requirement, configuration/authentication, rate limit, known failure, uncertain outcome, expired result or unavailable output.

**fal.ai is the first planned adapter, not the architecture.** A future Higgsfield, Kling, Runway, Luma or other adapter must implement the same boundary without rewriting Storyboard, package construction or core execution/stitching. Freeze adapter/model/settings/capability versions per execution. Changing provider/configuration is an explicit new execution revision with fresh checks/cost consent, never fallback or silent reuse of incompatible scene outputs. Package creative changes require M9 rebuilding and approval; resolving explicitly unspecified technical choices can live in a separately reviewed execution profile bound to the unchanged package hash.

## Capability matching before any paid submission

Compare the complete approved package and every scene against the selected adapter's versioned model/mode/account profile and the selected assembly/audio profile. Supported, unsupported and unverified are distinct. Missing or unverified required support blocks submission with exact scene/field/reason and no billing. Do not discover incompatibility only after generating otherwise unusable scenes.

| Capability | Required preflight decision |
| --- | --- |
| Reference images / count | Supported formats/dimensions/bytes, conditioning mode and count for the actual request; current package requires three images, not one interchangeable reference. Never drop a role or add a new unapproved sheet/view silently. |
| Character consistency | Required Character conditioning and continuity/voice behavior. A preservation prompt alone is not a declared model capability or a guarantee of visual fidelity; manual scene review remains mandatory. |
| Product / Location | Explicit support for the approved Product and environment reference roles in combination with Character conditioning. |
| Image-to-video / text-to-video | Advertise each mode independently. Select only a mode that preserves all required references/instructions; text-only support does not satisfy a reference-conditioned package. |
| Audio / dialogue | Native audio, exact dialogue/narration, lip sync where required, consistent voice, external-audio acceptance and separate track support. Resolve the complete audio strategy before spending. |
| Duration / scene length | Min/max/discrete lengths, per-scene and total coverage, frame rounding and output timing guarantees. Reject incompatible scene lengths; no silent padding, trimming, time stretch or changed speech. |
| Aspect ratio / resolution / frame rate | Concrete neutral output profile and cross-constraints with duration/mode. M9 null values require explicit profile resolution before execution, not an undocumented vendor default. |
| Seed | Availability/type/range and the package's optional/required seed policy. Persist the resolved seed if known; a seed does not promise identical AI output. |
| Async jobs / recovery | Durable request ID/client correlation, provider idempotency semantics, status/result retrieval, retention/expiry window and a viable crash-recovery strategy. No assumption of exactly-once remote billing. |
| Polling / webhooks | At least one supported durable observation path, bounded polling/backoff/timeout and authenticated replay-safe callbacks when supported. Local development may use polling; do not require a public localhost tunnel or enable hosting. |

Provider-specific capability values, endpoint/model selection, costs and account access are **Needs confirmation** before implementation/execution. No current fal profile is approved by this document and no API was queried. Full-video generation is not V1's default: a future whole-video mode needs an explicit adapter capability declaration, separately approved suitability and reviewable scene/timing provenance rather than an opaque replacement workflow.

## Scene generation, identity and versioning

Generate one scene at a time as independently persisted work. Bounded parallel scheduling may later be selected through an explicit resource/cost profile; it must preserve per-scene isolation and all version/lease fences. Each scene consumes its approved absolute start/end/duration, Character/Product/Location references, neutral prompt, exact dialogue/voice, actions/reactions/Product interaction, camera/framing/movement/zoom/focus, lighting/style/tone, ratio and technical/audio requirements. The adapter translates these instructions without creative rewriting. Convert absolute timestamps to provider-relative timing only through a deterministic, recorded mapping.

Every operation binds owner/project, exact package ID/version/hash and approval, stable scene ID/number plus scene content version/hash, exact approved asset versions/hashes, provider identity, adapter/model/settings/capability versions, neutral execution/audio profile, seed intent and prompt/translation version. Define a deterministic request fingerprint over these values, excluding transient signed URLs, leases, polling counters and creation timestamps. Keep the stable operation identity distinct from a paid-attempt idempotency key and provider request ID.

An identical fingerprint reuses known completed verified work; a pending known request resumes observation. An unknown submitted attempt must reconcile rather than creating another attempt. An explicit paid retry/regeneration gets a new monotonic attempt/version and new cost authorization while retaining the earlier receipt and fingerprint lineage. New package content makes prior scenes historical/stale; never overwrite their payloads, outputs or financial records or silently claim they satisfy the new package.

Owner regeneration targets only the chosen scene. Preserve other accepted compatible scene artifacts. Regenerating an accepted scene creates a separate candidate; accepted output changes only after explicit acceptance of the replacement. A changed accepted-scene manifest invalidates current composition/final approval and requires a new assembly version. Prior final/scene artifacts remain private history until separately authorized cleanup.

## Private scene output and persistence concerns

Provider completion is not durable scene success. Retrieve bounded bytes through the adapter, verify the expected operation, inspect/decode technical streams, then copy into Sceenyk-controlled private storage with immutable attempt/version-specific identity. Verify stored byte length, MIME/container, checksum/ETag and measured media metadata before committing scene_ready. An uncertain upload must reconcile the same object/key before another write; recovery must not generate another scene.

The persistence concerns below are conceptual requirements, **not new tables, columns, RPCs or migrations**:

| Concern | Durable data |
| --- | --- |
| Execution | Owner/project/package ID/version/hash/approval, neutral profile, selected provider/adapter/model/settings/capability versions, authorized budget and state/checkpoints. |
| Scene / attempt | Scene ID/number/content version/hash, exact bindings, request fingerprint, operation/attempt number, paid intent/idempotency identity, normalized request status, safe provider request/client correlation IDs, lease/claim/heartbeat and timestamps. |
| Result / private asset | Scene/package/attempt association, generated asset ID and server-only private key, SHA-256/fingerprint, MIME/container/codec, measured duration/dimensions/frame rate/time base, audio stream metadata, size/ETag and verification receipt. |
| Usage / cost | Provider/model/scene/request/attempt, estimate/rate/pricing version before generation when available, reported usage/cost and receipt provenance. Unknown actual cost remains null; distinguish estimates and provider-reported usage from verified billing. |
| Review / composition | Exact ready/accepted/rejected scene versions/hashes and approval events; immutable accepted-scene/audio/transition manifest, assembly configuration/digest, final candidate asset/proof and final approval/completion references. |

Persist opaque provider request/result locators and sanitized receipts; temporary result URLs stay inside the adapter and cannot become canonical storage or permanent signed links. Re-fetch through a known request ID only if declared retrieval/retention permits it. Private local fsynced recovery bytes can protect a completed download before R2 persistence; no scratch file alone establishes durable success. If no safe recoverable delivery strategy exists, capability preflight blocks the paid request.

Before later persistence design, verify the actual catalog, existing job/asset/claim/financial functions and grants, then choose the smallest compatible extension. Existing source migrations are not proof of deployed objects. No schema design or migration number is invented here.

## Failure and restart recovery

| Failure boundary | Planned behavior |
| --- | --- |
| Before submission | Fail preflight with the exact missing/unsupported requirement; record no paid submission. Preserve approved inputs and completed scenes. |
| Unknown submission outcome | Persist scene_reconciling/reconciliation-required plus immutable intent/correlation. Poll/retrieve the same known request, or use documented client-correlation/idempotency lookup. Never clear the intent, reset attempt counts, silently switch models or automatically resubmit. Without a safe lookup, stop for explicit reconciliation; a new paid attempt needs explicit consent acknowledging possible prior cost. |
| Known provider failure | Fail only that scene. Keep accepted/ready scenes and receipts; bounded read/local recovery may continue. A new generation that can charge needs explicit scene-specific user action, remaining budget and fresh admission. |
| App / worker restart | Reload persisted execution/scene/attempt/checkpoints; atomically reclaim expired leases and fence the old worker. Observe known remote work or recover saved bytes; do not regenerate a completed durable scene. A lost write acknowledgement must read/reconcile the same operation first. |
| Generation complete, storage failed | Preserve provider request ID, sanitized completion/result metadata and any verified local recovery bytes. Verify/retry private storage first using the same scene attempt. Only confirmed impossible recovery plus explicit owner regeneration/cost consent may create a new paid request. |
| Provider result expired/unavailable | Report the declared retention/retrieval failure honestly. Do not imply paid generation failed or refund automatically; preserve proof and require an explicit choice for any replacement. |
| Stitch/validation/final upload failure | Reuse exact accepted scene/audio artifacts and assembly manifest. Retry deterministic assembly or storage under bounded local attempts; never call the video provider to repair an assembly failure. |
| Inputs change / approval lost | Block new paid admission and current approval/completion. Already submitted historical operations may be reconciled/read/saved under their exact original scope to avoid losing paid output, but cannot be relabelled current or trigger further paid work. |

Worker claim/retry counts, read-only observation retries and paid-generation attempts are separate budgets. Transport middleware/SDK retries must not replay an uncertain paid POST. Local leases/unique fingerprints prevent concurrent local winners but cannot by themselves guarantee exactly-once provider billing. Webhooks are observations: verify authentication/freshness where supported, deduplicate event identity and match provider/request/owner/project/attempt before a fenced transition. Neither a callback nor a browser can complete or settle a run by assertion.

## Paid-request and accounting gates

Immediately before **each new paid submission**, verify:

1. Authenticated/worker-authorized owner/project scope, exact package approval/hash, current upstream approvals and nonstale content.
2. Exact scene/version and current configuration/profile; no matching durable success, pending submission or unknown intent that would be repurchased.
3. Full capability, translated-payload, private-reference-access and audio/assembly feasibility checks.
4. Remaining per-scene and whole-execution attempt/spend budget, trusted estimate or explicitly bounded operator authorization, and no unresolved prior attempt admission.
5. Matched current quote/explicit confirmation and valid reservation/credit/free-allowance state whenever accounting is enabled, using existing server/database financial authority.
6. Atomic submission intent, stable paid-attempt identity and claim/version fence committed before the call.

All provider calls, including bounded retrieval/polling, reload and validate the persisted operation/scope/configuration. The duplicate-submission gate above applies to new paid work; observation intentionally reuses the already submitted fingerprint/request ID. Do not make reconciliation impossible by treating a prior submission as a reason to submit again or deny its safe read-only recovery.

Read-only does not establish zero cost. If a provider bills observation/retrieval, include those calls in the explicit authorized budget/admission profile; an observation path cannot authorize unbudgeted spending. Read Studio progress from persisted state and reuse verified stored results instead of unnecessarily polling or retrieving completed scenes.

Track estimates and reported usage per attempt without inventing production tariffs, converting provider estimates into customer credits, or treating absent billing data as zero cost. An accounting-disabled development run still needs explicit operator funding and a finite reviewed budget; it is not unlimited permission to spend. Scene regeneration needs separate incremental authorization; do not charge/recreate the entire run because one scene fails.

Package approval and scene acceptance are not cost consent. Map future UGC execution/final approval into the existing quote/reservation/ledger/completion owners before any paid rollout. Preserve immutable receipts, exactly-once admission/settlement/restoration and unresolved commercial rules. Partial/unknown provider or storage failures must not automatically consume/restore the entire run's reservation. Complete only through trusted verified stored-result completion after current final approval; never on scene/provider/stitch readiness alone. No accounting code or policy implementation changes occur in this task.

## Scene review and safe deletion

Planned scene loop: **Generate Scene → save/verify privately → scene_ready → preview/review → explicitly accept exact scene version → repeat/collect accepted scenes → stitch exact accepted manifest**. Ready means technically verified; it does not imply creative acceptance. Final Video can contain these scene previews and recovery controls without adding another unrelated Studio navigation system.

Rejected/unwanted scenes are immediately ineligible for stitching. Fence the rejected candidate before any cleanup; check owner/project/package/scene/attempt, exact key/hash/ETag and references from accepted scenes/compositions. Delete only that rejected unreferenced candidate through provider-free bounded cleanup, retain minimal version/request/cost audit and deletion proof, and expose Retry deletion on failure. Protect accepted/shared/upstream images and other scenes. Retention/erasure/reference-pinning details need confirmation before implementation.

Reject/Delete never queues generation or automatically installs another scene. A separate explicit Regenerate scene action must pass current input/capability/cost/attempt gates. Existing accepted content is retained until a replacement is explicitly accepted or separately rejected. Never regenerate successful scenes because another scene is rejected.

## Provider-independent stitching and exact timing

Final assembly is a separate core-owned stage over the frozen accepted-scene/audio manifest. Prefer deterministic local/server FFmpeg plus FFprobe validation, not an AI provider assembly request. Reuse compatible existing media verification/worker boundaries after review; no new service or hosted transport is installed by this plan. Heavy work runs on the local worker outside Next.js requests, with fixed shell-free arguments, bounded CPU/memory/disk/time and attempt-scoped scratch cleanup/recovery.

Order scenes by approved Storyboard number and absolute timestamps, never provider completion order. Each accepted asset must cover its exact intended interval. Normalize only explicitly supported technical dimensions/frame rate/pixel format/codecs/container without changing ratio, framing, creative content or speech. Do not stretch, crop, duplicate/drop semantic content or silently trim a provider's wrong-length result into compliance. Unsupported output needs an explicit reviewed plan or scene-specific regeneration decision.

Apply only declared and supported transitions. Legacy none/cut support does not implement arbitrary Storyboard prose, fades or overlaps; ambiguous/unsupported transitions block preflight. Crossfades cannot silently reduce the approved total duration. Combine scene audio/dialogue and any approved narration/music/SFX at their declared timeline positions, preserving intentional silence and voice identity, without rewriting or double-playing native plus external speech.

The nominal composition timeline must match the approved integer-ms coverage exactly. Before paid work, freeze a neutral output profile with resolution, frame rate/time bases, codec/container and an explicit measurable frame/sample-quantization validation rule. Aim for the exact requested final duration; any unavoidable encoded-duration allowance must be declared/profile-derived and reviewed beforehand, not invented after a failure or used to hide gaps/retiming. Do not relax existing legacy zero-tolerance composition rules or inherit its renderer's 85ms allowance as M10 policy. The exact M10 output profile/tolerance remains Needs confirmation; unresolved compatibility blocks execution.

Composition fingerprint binds the package hash/version, exact ordered accepted scene asset/version/hashes and trims only if separately approved, audio manifest, declared transitions, output profile and assembly-tool/configuration versions. Keep intermediate/final attempts immutable; restart or upload retry reuses that same manifest and output proof.

## Provider-neutral audio and V1 boundary

Support an eventual neutral audio manifest with logical voice/track/scene bindings, source kind (native provider audio, separate TTS, owned uploaded creator voice, narration, music or SFX), immutable verified asset/version/hash, exact absolute start/end/offset/duration, language/delivery/voice specification where applicable, mix/mute/gain intent and codec/sample/channel metadata. Persist concrete voice/model IDs only inside the chosen audio adapter/execution configuration; do not lock core UGC to ElevenLabs or another synthesis provider.

**Current boundary:** M9 has dialogue/voice descriptions, prompt-driven narration and scene sound instructions; it produces no final audio. UGC M10 has no native-dialogue, TTS, creator-voice upload, music/SFX generation/mixing or lip-sync implementation from this task. V1's concrete voice identity, audio source/adapter, licensing/asset availability, sync/mixing policy and native-versus-external strategy remain Needs confirmation before dependent implementation or paid calls.

Required speech/music/effects cannot become optional merely because the first video model is silent. Preflight must select and prove an explicit audio path, or stop. An intentionally silent approved scene may remain silent; do not invent audio or remove required dialogue. Separate TTS would need its own adapter/capability/paid-intent/usage/recovery contract and current consent. Scene review checks delivered dialogue/voice/sync; final validation requires actual readable audio streams when the plan requires them, not a text-only instruction or placeholder soundtrack.

## Final validation, review and completion

Before final_review/approval, trusted validation must establish:

- Every required scene exists, is privately durable and explicitly accepted, with exact owner/project/package/scene/version/hash bindings and a current immutable composition manifest.
- Correct Storyboard order and continuous coverage, no missing/duplicate scene, target ratio/dimensions/frame rate and approved codec/container/profile.
- Expected total duration under the predeclared technical rule; independently measured stream/time-base metadata, readable/decodable file and valid video plus required audio streams/sync.
- Verified final private object size/MIME/ETag/SHA-256, assembly fingerprint, output version, validation receipt and safe provenance. A provider URL or successful FFmpeg exit is insufficient.
- Current package/upstream approval, no stale accepted-scene manifest and correct financial completion eligibility; a late old worker/final candidate cannot overwrite a newer one.

Planned Studio navigation: **Progress · References · Storyboard · Package · Final Video**. Final Video presents authenticated short-lived previews, final player, measured duration/resolution/ratio, scene count, safe provider/model summary and persisted status, with scene previews/recovery controls. Keep raw JSON/provider payloads, request capabilities and storage keys out of client DTOs. Reuse existing Studio regions, accessible shared controls/statuses, native scrolling and the single approved styling system; no UI is built here.

Planned actions are **Approve Final Video**, **Regenerate individual scene** where supported/explicitly admitted, and **Reject and Delete Final Video**. Final approval binds the exact current package/composition/accepted scenes/final asset hash and expected command version. Recheck trusted validation/ownership under database fencing before final_approved and receipt-backed Complete; duplicate approval/settlement must be harmless. A new accepted scene or package requires new composition/final review, never automatic approval transfer.

Final rejection fences and removes only the selected final candidate according to safe reference/cleanup rules, preserves reusable accepted scenes and audit/financial evidence, and offers a separate explicit restitch/review path. It never regenerates every scene or automatically submits a provider request. Do not invent a user refund/cancellation policy; follow the existing financial owner and separately resolve review-hold/expiry/abandonment rules.

## Planned persisted states and checkpoints

These are conceptual workflow labels, **not installed database enums, stages, RPCs or UI behavior**:

| Scope | Planned states / gates |
| --- | --- |
| Admission | generation_package_approved → provider_check → explicit matched cost authorization → scene_queued. Missing capability/configuration is a blocked reason, not a paid retry. |
| Per scene | scene_queued → scene_generating → scene_saving → scene_ready; scene_reconciling for uncertain outcomes; scene_failed with exact recoverability. Separate owner review status pending/accepted/rejected binds an exact artifact version. |
| Assembly | scenes_ready only when all required current versions are technically ready and accepted → stitching → finalizing (inspect/store/verify) → final_review. |
| Final | final_review → final_approved → complete only after trusted stored-result/financial completion; rejection/cleanup/staleness remains an explicit separate branch. |

Persist append-only events/checkpoints for state/phase/reason, version, scene/attempt, lease/heartbeat, request identity and output proofs. Refresh/reopen reads this state; timers/callbacks never fabricate progress, approval or completion. Restart recovers independent scenes/assembly rather than resetting a global generation stage. Do not directly reuse the parent M9 paused record to bypass future admission/accounting gates.

## Security, development restrictions and implementation handoff

Every command/read/preview/regenerate/reconcile/cleanup/approve/worker transition independently verifies application owner → project → package → scene/attempt → asset/composition/final relationships. Enforce scoped uniqueness, compare-and-set/lease fencing, private database grants/RLS and immutable audit at server/database boundaries. Never trust client owner IDs, provider URLs, media keys, completion or billing claims.

Provider secrets/configuration stay server-only; provider request IDs and allowlisted technical diagnostics may be stored, credentials may not. Log bounded phase/category/IDs/attempt counts with redaction, not raw SDK exceptions, prompts/dialogue, authorization headers, signed/result URLs or private keys. Download result bytes through reviewed adapter host/scheme/redirect/size/time checks; never accept arbitrary browser destinations or forward provider credentials to result hosts. Issue short-lived owner-authenticated preview access and recheck exact asset/version on redemption. Store stable private asset references, never permanent signed URLs.

For current development, the existing local worker remains the execution path. Render remains disabled; all local/hosted Inngest execution remains disabled. This documentation task changes no app code, migration, environment/dependency/provider configuration or hosted settings; runs no provider/video/storage/job/worker/test/build/deployment operation. Only source/context/link/whitespace/diff review is allowed. The `.gitignore` change only permits tracking this new document.

Before later implementation, separately authorize a bounded unit and resolve: actual provider/model/account/capability and retention profiles; neutral output/timing/transition profile; the exact V1 audio path; per-scene review/cleanup/retention and attempt limits; quote/admission/budget mapping and review-hold/terminal accounting; actual catalog-compatible persistence; and local assembly resource/tooling contracts. Record unknowns as Needs confirmation; no missing decision authorizes fallback, guessed pricing, silent output or weakened validation. Do not implement or execute M10 from this preparation task.
