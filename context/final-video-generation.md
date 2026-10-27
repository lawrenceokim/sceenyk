# Milestone 10 — Final Video Generation

## Status and authority (2026-10-27)

**Milestone 9 — Complete and approved. Milestone 10 — Planned / Not Started.** Video provider strategy — Resolved: fal.ai. Voice strategy — Resolved: ElevenLabs. Lip-sync strategy — Resolved: an automatic internal stage behind `LipSyncProvider`, with a fal.ai-compatible adapter/model planned. Final composition strategy — Resolved: FFmpeg. Exact models/account capabilities remain to verify; no adapter, lip-sync, composition or M10 UI implementation is claimed. Runtime/provider/manual acceptance — Pending.

This is documentation/context only under the [current scope](ai-workflow-rules.md#automated-m10-documentation-scope-2026-10-27). No application code, migrations, provider requests, workers, tests/builds, deployment or live database/storage operation. Render/Inngest remain disabled; the existing local worker remains the development execution path.

## Selected video and voice architecture (2026-10-27)

**Normal V1 user flow: Approved Generation Package → Generate Final Video → automatic Sceenyk processing → Final Video review.** The initial generation action includes existing required cost/credit authorization; package approval alone is not payment consent. The user does not select providers or manually trigger/review voice generation, lip-sync, scene alignment, scene acceptance or stitching. Only final review exposes **Approve Final Video** and **Reject and Delete Final Video**. Rejection never automatically regenerates.

Internal flow: full capability/current-input/cost admission → visual scene → approved speech through the same reusable CharacterVoiceProfile → automatic conditional lip-sync → privately verified completed scene → repeat/recover each scene independently → deterministic FFmpeg final composition → validation/private final persistence → final review → approval/trusted Complete. Silent scenes skip voice and lip-sync; exact speaker-based routing is defined below. Save successful intermediate video/audio immediately so later failure cannot discard paid work.

`VideoGenerationProvider`, `VoiceGenerationProvider` and `LipSyncProvider` are internal replaceable boundaries. fal.ai is the planned video service, ElevenLabs supplies Character speech and a fal.ai-compatible lip-sync adapter is planned; FFmpeg owns composition. [The voice contract](voice-generation.md) owns profile/identity/segment rules. Voice Design creates one reusable identity automatically from the approved description; no real recording, manual preview selection or extra profile approval screen is required for V1. Native video audio cannot replace dedicated Character speech unless a future workflow explicitly selects that path.

This automated flow supersedes earlier M10 scene-by-scene acceptance and owner voice-preview selection proposals throughout the current plan. Upstream reference/Storyboard/package approvals remain unchanged. Provider configuration, request IDs, stage-level debugging and advanced scene review stay internal; they do not become normal user tasks.

## Provider suitability assessment (2026-10-27)

**Historical assessment before the dedicated ElevenLabs decision; not the current audio selection or a fresh live read.** Native-voice requirements in this comparison applied to the prior combined video/audio approach. The new separate voice path supersedes that block without approving any exact fal model. Earlier official public documentation was checked without authenticated provider requests. One GET-only database read found an approved package, content revision 1 / command version 6, with two 5,000ms scenes, 16:9 output, required dialogue and `consistentVoice: true`, no narration, and `stale_at: null`. Only safe timing/requirement metadata was printed; no prompts, dialogue, private media, credentials or identifiers were printed or persisted here. This read does not replace execution-time owner/current-upstream/hash/media validation. It made no workflow RPC or database/storage write. No live read occurs in this documentation task.

The existing [strict package voice schema](../lib/storyboard/schema.ts) binds a Character asset, textual description and pace. The [package builder](../lib/video-generation-package/builder.ts) requires consistent voice whenever speech exists. Neither supplies a recording/provider identity. The newly selected [Voice Design/profile plan](voice-generation.md#elevenlabs-voice-design-and-reusable-identity) resolves that input strategy through a separately persisted reusable identity, without mutating M9 or requiring native video-provider voice binding.

| Reviewed fal endpoint | Officially documented relevant support | Compatibility limit / unresolved requirement |
| --- | --- | --- |
| [`fal-ai/kling-video/o3/pro/reference-to-video`](https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video/api) | Image/element conditioning for characters, objects and environment; native audio; whole-second 3–15s clips; 16:9, 9:16 and 1:1; asynchronous queue/result APIs. Elements expose `voice_id` binding. | Candidate for the current 5s scenes, **not selected for execution**. Its documented voice binding needs a voice ID plus a compatible element reference manifest. Current M9 conditioning is composed sheets, not a silently substituted element image set. Exact reference mapping, measured output profile and audio timing still need preflight/acceptance. |
| [`bytedance/seedance-2.5/reference-to-video`](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video/api) | Up to 30 images, audio references, synchronized audio/lip-synced speech, whole-second 4–30s clips, all three package ratios and 480p/720p/1080p. | Current durations/count/ratio fit. No verified route from M9's textual voice description alone to an identical voice across independent requests. Reference audio would be an additional approved execution input. |
| [`bytedance/seedance-2.0/reference-to-video`](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/api) | Up to nine images and three audio references; synchronized native audio; whole-second 4–15s clips; all three package ratios. | Same unresolved voice-source boundary; a reference-audio capability does not supply an approved recording. |
| [`fal-ai/vidu/q4/reference-to-video`](https://fal.ai/models/fal-ai/vidu/q4/reference-to-video/api) | Up to 12 image references; up to three MP3 voice references, each 3–12s; native dialogue/effects; whole-second 3–16s clips; all three package ratios. | Consistent-voice conditioning is documented with audio references, which M9 does not supply. |
| [`fal-ai/veo3.1/reference-to-video`](https://fal.ai/models/fal-ai/veo3.1/reference-to-video/api) | Reference images, generated audio, 16:9/9:16; default duration 8s. The endpoint announces deprecation on November 17, 2026. | No verified 5s reference-mode/stable-voice path from the current package; 1:1 is absent. Not selected. |

The concrete Kling [Create Voice contract](https://fal.ai/models/fal-ai/kling-video/create-voice/api) requires a clean single-speaker audio/video recording lasting 5–30 seconds and returns a voice ID. It does not synthesize an approved voice from M9's description. No creation request was sent. This is an input/audio-strategy gap, not a claim that these models cannot generate speech. Likewise, the current package's 5s scenes fit several models; fractional/short scenes allowed by the general M9 contract would need their own compatibility rejection rather than silent rounding or trimming.

**Historical outcome:** the implementation attempt stopped before paid submission because the existing description alone did not establish a reusable native voice. The owner has now selected dedicated ElevenLabs Voice Design/TTS behind a generic voice adapter, resolving that architecture decision. Do not reapply the historical stop as a requirement to upload a recording or choose native fal audio. No adapter, scene records, scene/final UI, stitching, accounting integration or completion path was implemented by that assessment or this documentation update. All technical capability/current-input/cost gates remain required before later paid work.

### Verified transport/recovery obligations for later implementation

The official [Queue API](https://fal.ai/docs/documentation/model-apis/inference/queue) documents submit → request ID → status/result retrieval and `X-Fal-No-Retry: 1`. [Reliability](https://fal.ai/docs/documentation/model-apis/inference/reliability) also documents automatic model fallback and per-request `x-app-fal-disable-fallback`. A later adapter must explicitly disable both remote retries and fallback, as well as client POST replay; timeout alone does not cancel inference. A missing submission acknowledgement remains an unknown paid outcome, not permission to submit again. These headers are researched requirements, not implemented protection.

The [retention documentation](https://fal.ai/docs/documentation/model-apis/media-expiration) distinguishes request-history payloads from generated CDN media and supports an explicit media lifecycle preference. Expired media is irrecoverable. A future frozen adapter profile must select an adequate retrieval window/access policy and persist known request IDs/completion receipts plus private recovery bytes before retrying storage. No retention setting, account configuration or exact billing/idempotency guarantee was inferred or changed.

### Required resolution and manual verification before continuing

1. Follow the resolved [ElevenLabs voice strategy](voice-generation.md): later implement the neutral profile/provider boundary, one reusable designed identity and exact segment synthesis, with private approval/provenance/package bindings. Do not require a real recording for V1 or mutate M9 to hide missing audio. This documentation request does not authorize implementation or runtime tests.
2. Resolve exact conditioning from the existing three approved images, output resolution/frame rate/container, quantization tolerance and declared transitions. Validate full translated prompts, duration limits and voice/reference cross-constraints for every scene. Do not round scene timing or silently add views.
3. After a separate implementation request, finish the source implementation, catalog-compatible migration and authorized fixture checks with the selected voice path. Source migration 068 remains the existing baseline; no M10 migration/configuration is created now.
4. Before owner-run paid acceptance, obtain a current exact package validation, compatible capability/profile receipt, finite attempt/spend budget and explicit generation authorization under existing accounting rules. Package approval is not payment consent.
5. Only after implementation and separate acceptance authorization: verify one-action automatic dialogue/silent/narration paths, conditional lip-sync, no intermediate scene/voice gates, duplicate/unknown-outcome recovery, restart/leases, storage/partial-scene reuse, deterministic assembly and final-only approve/reject without regeneration. There is currently no M10 command/UI to test; do not run a worker or paid request from this documentation task.

Assessment verification: public documentation/source review, the single successful GET-only package read and documentation diff/link/whitespace checks. No paid or authenticated provider call, worker/job execution, media generation, storage operation, migration creation/application, test/build, deployment or hosted-setting change. Render/Inngest guards remain unchanged. The planned sections below retain their architectural authority; statements about the earlier documentation task describe that historical preparation, not a new restriction overriding the implementation request.

This is the authoritative planned M10 execution contract. [Video Generation Package](video-generation-package.md) remains authoritative for the implemented M9 immutable input/scene contract. Other context files link here for M10 rules rather than defining competing schemas. Earlier legacy provider/worker acceptance and renderer settings remain dated evidence, not an implemented UGC M10 workflow or permission to execute it.

The approved plan is:

**Approved Generation Package → Generate Final Video with matched cost authorization → automatic video → required ElevenLabs speech/conditional lip-sync → private completed scenes → automatic FFmpeg final composition/validation → Final Video review → Approve or Reject and Delete.**

Scene readiness is automatic internal validation, not owner acceptance. The final manifest binds exact completed visual/audio/sync/profile versions before assembly and final review. Upstream package approval, provider completion, technical readiness and final approval remain separate facts. No final video, paid request or worker runs here. [Current documentation restrictions](ai-workflow-rules.md#automated-m10-documentation-scope-2026-10-27) retain local execution and disabled Render/Inngest.

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

Core owns exact package/scene/profile scope, stale-input and ownership checks, automatic stage scheduling, paid-intent/attempt admission, private media/proofs, recovery, deterministic manifests and final review/accounting. It consumes neutral commands, capabilities, normalized results/status/errors and opaque configuration bindings; it never interprets vendor payload fields. Changing adapters does not rewrite Storyboard/package/core execution.

| Internal boundary | Planned neutral responsibility |
| --- | --- |
| `VideoGenerationProvider` | Existing generic interface, later extended compatibly for one approved visual scene: capabilities, validation, exact reference/prompt translation, submission, status/result recovery and normalized technical output/usage. fal.ai first; no mandatory native voice requirement. |
| `VoiceGenerationProvider` | Planned [voice/profile contract](voice-generation.md#planned-voicegenerationprovider-abstraction): automatic once-per-profile designed identity, exact dialogue/narration synthesis, supported timing/context, result recovery and usage. ElevenLabs first; same committed identity across scenes. |
| `LipSyncProvider` | Planned visual-video plus exact Character speech synchronization, capability/input validation, submission, observation/recovery and normalized synchronized-video result. fal.ai-compatible adapter/model planned, not selected or verified by this document. |
| FFmpeg/FFprobe composition | Local deterministic preparation/alignment, compatible media normalization, final audio mixing and ordered assembly/validation; independent of all provider adapters. |

Adapters/configuration exclusively own provider/model/endpoint IDs, credentials, API fields/payloads, concrete voice/reference formats, synthesis/sync settings, limits, request/job/result IDs, polling/webhooks/retention, error parsing and pricing/usage translation. Normalize safe failure categories; freeze adapter/configuration/capability/translation versions per operation. No silent provider/model/voice fallback, SDK POST replay or unbudgeted paid retry. Safe provenance may be retained privately, not shown as provider-management UI.

## Automatic scene processing and LipSyncProvider

Run the following internal stages automatically after the single admitted Generate Final Video action; no successful stage waits for owner review:

1. Load/revalidate the exact approved package, scene order/content/version, approved Character/Product/Location bindings, output profile and current authorized execution. Check complete video/voice/lip-sync/composition feasibility before spending.

2. Generate the visual scene through `VideoGenerationProvider`, then retain its request/receipt and verify/save the source visual privately immediately. Preserve original successful visual bytes separately from derived synchronization output.

3. For each required nonempty approved Character dialogue segment, synthesize only its exact text through `VoiceGenerationProvider` using the same CharacterVoiceProfile/binding across the execution. Align exact speech windows automatically under the [controlled timing policy](voice-generation.md#dialogue-timing-and-continuity); preserve verified audio privately. Resolve designed identity automatically once, never per scene.

4. Automatically prepare a scene-relative Character dialogue guide/manifest and pass the exact visual and dialogue audio to `LipSyncProvider`. Guide silence/offsets must map to unchanged approved windows. The provider cannot introduce another voice or rewrite speech. For multiple utterances, use only a verified full-scene or explicitly versioned segment mapping that preserves the complete scene; no silent retiming/cropping.

5. For a genuinely silent scene (no required nonempty `speech[]`), skip voice and lip-sync, recording an explicit no-speech reason and zero paid attempts. The existing schema distinguishes Character speech from narration: preserve required narration through the same ElevenLabs profile, place it automatically in composition, and do not invent visible mouth movement for narration-only/off-screen speech. A narration-only scene is not silently treated as silent; mixed narration stays out of the mouth-sync guide.

6. Retrieve/validate synchronized output when required, preserve the source visual/audio and commit a private completed-scene artifact/proof with exact timing/audio/profile lineage. Check readable media, duration/ratio/stream integrity and that required synchronization is present; FFmpeg muxing alone is not lip-sync. Keep ElevenLabs audio authoritative rather than replacing it with a provider-generated voice.

7. Repeat in Storyboard order with independently persisted checkpoints. A failed voice/lip-sync/storage stage reuses upstream success; completed other scenes remain intact. Scene readiness is an internal technical fact, not a user acceptance gate.

8. Once every required scene is internally ready for the same current manifest, FFmpeg automatically assembles ordered synchronized scenes, exact dialogue/narration and declared available music/SFX, validates/stores/verifies the final artifact and opens final-level review only.

Planned `LipSyncProvider` contract:

| Operation / capability | Neutral obligation |
| --- | --- |
| Identity/capabilities | Versioned adapter/configuration identity; accepted video/audio formats, duration/dimension/frame-rate/byte limits, scene/window/target-face support, required language/shot/visibility constraints, duration/ratio/voice-preservation behavior, async or synchronous completion, safe result retrieval/retention, usage and error semantics. Unsupported/unverified required behavior blocks preflight. |
| Validate / translate | Validate owned source visual/audio hashes, exact package/scene/profile/window mapping and technical output profile. Adapter translates these neutral inputs to vendor fields; core never formats a model-specific request. |
| Submit | Frozen source visual asset/version/hash plus Character dialogue asset/version/hash and guide/window manifest; stable operation/fingerprint, distinct paid attempt, current authorization, claim/version fence and cancellation signal. Persist intent before the single submission; return opaque request/job identity and normalized receipt. |
| Observe / recover | Read an already known request/result when supported, preserve pending/completed/known-failed/unknown/unavailable distinctions and retrieve bounded output bytes. A timeout does not prove remote failure. Never resubmit an unknown paid outcome. |
| Result / errors | Synchronized visual artifact metadata, immutable source bindings, normalized timing/technical proof, safe request/usage/cost receipt and exact recoverability. Preserve original ElevenLabs speech identity; no guessed support, provider-specific URLs/fields or credentials in core/client DTOs. |

Exact fal.ai-compatible lip-sync model/endpoint, account access, input constraints, retention, fidelity and cost must be verified from official documentation during later authorized implementation. Strategy is resolved; model suitability/runtime acceptance is not. No provider is called or selected through user controls in this task.

## Capability matching before any paid submission

Compare the complete approved package and every scene against the internally selected video, voice and conditional lip-sync adapters' versioned model/mode/account capabilities plus the final assembly profile. Supported, unsupported and unverified are distinct. Missing or unverified required support blocks submission with exact scene/field/reason and no billing. Do not discover incompatibility only after generating otherwise unusable scenes.

| Capability | Required preflight decision |
| --- | --- |
| Reference images / count | Supported formats/dimensions/bytes, conditioning mode and count for the actual request; current package requires three images, not one interchangeable reference. Never drop a role or add a new unapproved sheet/view silently. |
| Character consistency | Video handles approved visual Character conditioning/continuity; the separate voice profile handles dialogue identity. A preservation prompt alone is not a visual fidelity guarantee; automatic technical checks and final user review remain mandatory; there is no per-scene approval gate. |
| Product / Location | Explicit support for the approved Product and environment reference roles in combination with Character conditioning. |
| Image-to-video / text-to-video | Advertise each mode independently. Select only a mode that preserves all required references/instructions; text-only support does not satisfy a reference-conditioned package. |
| Audio / dialogue | Match exact dialogue/language/delivery/voice/timing to `VoiceGenerationProvider`, automatic Character-dialogue synchronization to `LipSyncProvider` and final placement/mix to FFmpeg. Silent scenes skip voice/sync. Native video audio is optional; muxing alone is not lip-sync. Never omit required speech. |
| Duration / scene length | Min/max/discrete lengths, per-scene and total coverage, frame rounding and output timing guarantees. Reject incompatible scene lengths; no silent padding, trimming, time stretch or changed speech. |
| Aspect ratio / resolution / frame rate | Concrete neutral output profile and cross-constraints with duration/mode. M9 null values require explicit profile resolution before execution, not an undocumented vendor default. |
| Seed | Availability/type/range and the package's optional/required seed policy. Persist the resolved seed if known; a seed does not promise identical AI output. |
| Async jobs / recovery | Durable request ID/client correlation, provider idempotency semantics, status/result retrieval, retention/expiry window and a viable crash-recovery strategy. No assumption of exactly-once remote billing. |
| Polling / webhooks | At least one supported durable observation path, bounded polling/backoff/timeout and authenticated replay-safe callbacks when supported. Local development may use polling; do not require a public localhost tunnel or enable hosting. |

Provider-specific capability values, endpoint/model selection, costs and account access are **Needs confirmation** before implementation/execution. No current fal profile is approved by this document and no API was queried. Full-video generation is not V1's default: a future whole-video mode needs an explicit adapter capability declaration, separately approved suitability and reviewable scene/timing provenance rather than an opaque replacement workflow.

## Scene generation, identity and versioning

Each scene is an automatic internally recoverable unit with separate visual, speech, lip-sync, storage and scene-ready checkpoints. The approved package remains the creative source of truth: exact interval/order, Character/Product/Location versions, prompt, camera/actions/reactions/interaction/light/style/tone, ratio/output and dialogue/delivery are preserved. The video adapter cannot invent dedicated speech; the voice adapter uses exact approved words; lip-sync consumes the exact verified video and Character speech under a recorded timing map.

Bind every stage to owner/project, exact package ID/version/hash/approval, stable scene ID/content version/hash, approved asset versions/hashes, CharacterVoiceProfile/binding where applicable, adapter/model/settings/capability/translation versions and neutral output/timing policy. Fingerprints exclude transient signed URLs, leases, observation counters and timestamps. Video, voice and lip-sync have different operation fingerprints and independent monotonic paid-attempt identities; provider request IDs are separate opaque receipts.

Reuse completed verified work for the same fingerprint; observe a known pending request; reconcile an unknown submitted intent without repurchase. Do not let voice/lip-sync failure reset a successful visual or another completed scene. Any authorized new downstream result creates immutable derived scene/final versions and invalidates dependent final readiness/approval, not upstream artifacts.

Generation proceeds automatically within the frozen execution/authorization policy. Per-scene user acceptance, regeneration and debugging are internal/future advanced behavior rather than V1 review gates. A changed creative package follows normal M9 rebuild/approval and fresh admission; old results remain historical/private and cannot be relabelled current.

## Private scene output and persistence concerns

Provider completion is not durable success. Immediately retrieve bounded bytes, verify exact operation lineage/technical integrity, and save each successful source video, voice output and lip-sync result privately under immutable stage/attempt identities. Verify stored length, MIME/container, checksum/ETag and measured stream metadata before that artifact is ready. A scene becomes internally ready only when every required stage and its durable proof passes; a raw visual alone is insufficient for required dialogue.

These are conceptual persistence concerns, **not new tables/columns/RPCs/migrations**:

| Concern | Durable evidence |
| --- | --- |
| Execution | Owner/project/package ID/version/hash/approval; selected neutral video/voice/sync/output policies and adapter/configuration versions; explicit authorization/budgets; current checkpoints/status. |
| Independent stage/attempt | Exact scene/content/profile/source-asset bindings; video, voice and lip-sync fingerprints, paid intents/attempt counts, provider/model/request/job IDs, normalized status/failure/reconciliation, timestamps and lease/claim/version fences. |
| Private artifacts | Source visual, speech, synchronized scene and final asset identities/keys; SHA-256/length/MIME/ETag and measured duration/dimensions/frame rate/audio metadata; immutable input/output lineage and verification receipts. |
| Voice/guide | [Canonical voice persistence](voice-generation.md#persistence-private-audio-and-independent-recovery): reusable profile/binding, exact segment/text/window, design/create/synthesis receipts, alignment/controlled adjustments and scene-relative Character dialogue guide separate from narration. |
| Usage/cost | Stage/attempt/provider/model/configuration, trusted estimate/rate/units where available, actual reported usage/cost and receipt provenance; absent actual cost remains null. |
| Readiness/composition/final review | Internal completed-scene validation proofs, exact ordered video/audio/sync/profile/mix/transition manifest, immutable final version/hash/proof and final owner approval/deletion evidence. No per-scene owner acceptance requirement. |

Preserve known request/result locators and sanitized completion receipts; temporary provider URLs cannot be canonical storage. Fsync private attempt-bound recovery bytes/metadata as needed; a scratch file alone is not durable readiness. Reconcile an uncertain upload at the same key before another write and retry storage before any new generation. Retrieval must respect declared retention/account permissions and exact original scope.

Before later persistence implementation verify actual catalog, existing job/asset/claim/financial functions and grants, then choose the smallest compatible extension. Source migrations are not proof of deployment. No schema/migration is designed or applied now.

## Failure and restart recovery

Automatic normal processing does not authorize duplicate paid work. The same rules apply independently to video, ElevenLabs design/create/synthesis and lip-sync; retain all successful upstream and unrelated-scene artifacts.

| Boundary | Planned behavior |
| --- | --- |
| Preflight/configuration failure | Stop before paid submission with an exact internal requirement/reason and a simple safe run-level status. Preserve package/media; do not fall back to another provider/model. |
| Video, ElevenLabs or lip-sync timeout / unknown outcome | Keep atomic intent, attempt, fingerprint and known request/job/result IDs; enter reconciliation required. Observe/retrieve the same request where supported; no automatic POST replay, cleared intent, reset attempt count or new paid submission. Missing acknowledgement is not proof of failure. |
| Definitively known provider failure | Fail/recover only that stage. New paid work must be explicitly covered by the initial frozen generation authorization and remaining finite stage/execution budgets, or separately authorized after a safe stop. Retry eligibility requires a definitive outcome and configured policy; unknown outcomes never qualify. This creates no routine intermediate user task. |
| Voice or lip-sync failure | Recover the exact audio/sync operation independently. Keep source visual, reusable voice identity and other successful scenes. Never regenerate visual/video or redesign the voice just to repair a downstream failure. |
| Success then interrupted download/storage failure | Retain provider receipt/output proof and available fsynced recovery bytes; retrieve the same result if supported, reconcile/retry the same private object/key, then validate. Never regenerate to repair storage. |
| Worker restart / expired claim / lost acknowledgement | Reload stage checkpoints, completed private proofs and paid intents; atomically reclaim expired leases and fence old workers. Reconcile existing results/objects before advancing. Worker/read/local recovery counts are separate from paid attempts. |
| Partial scenes | Resume only missing/failed stages. Keep every compatible completed scene and intermediate; no all-scenes restart. |
| Result unavailable/expired | Preserve completion/cost/retention evidence and stop honestly; do not infer a failed/nonbillable request or auto-refund/resubmit. Unknown or unrecoverable paid work needs explicit reconciliation/authorization before replacement. |
| FFmpeg/validation/final persistence failure | Reuse current ready scenes, exact manifest and verified intermediate/final bytes. Retry bounded deterministic processing/storage, not AI generation. |
| Inputs/approval change | Block new paid admission/final approval for stale work. Existing submitted historical work may still be safely observed/saved under its original scope, never rebound to current inputs or allowed to trigger further paid work. |

Local uniqueness/leases do not guarantee exactly-once provider billing. SDK/transport must not replay uncertain POSTs. Callbacks are authenticated/deduplicated observations matched to provider/request/owner/project/stage/attempt and fenced before state changes; they cannot assert final completion or financial settlement.

During unresolved recovery the user sees simple recovering/stopped status and necessary safe diagnostics, not provider management or a requirement to inspect every scene. No code, worker or live recovery is executed by this documentation.

## Paid-request and accounting gates

Generate Final Video is one explicit user action with existing required quote/cost/credit authorization. Freeze finite per-stage and whole-execution budgets for video, voice (including once-per-profile design/create) and lip-sync; this is not unlimited consent and package approval alone is insufficient.

Immediately before **every paid request**, including a new authorized attempt, recheck:

1. Authenticated/worker-authorized owner/project, exact current approved package/hash and upstream approvals; no stale content.

2. Exact scene/content version, stage, source video/audio/profile versions and current adapter/output/timing configuration.

3. Full video/voice/lip-sync/composition capability and private-input-access match; no same-fingerprint completed, submitted, pending or uncertain operation to repurchase.

4. Independent stage/scene/profile and total execution attempt/spend budget, current trusted estimate or finite operator funding authority and resolved prior intent. Known-failure retry must be covered by the authorization; unknown paid outcomes cannot be resubmitted automatically.

5. Matched current quote/confirmation and valid held reservation/credit/free-allowance state where accounting is enabled, using existing server/database financial authority.

6. Atomic immutable submission intent, distinct paid-attempt identity and current lease/version fence committed before the call.

Maintain separate request fingerprints/attempt budgets for **video generation, voice generation and lip-sync**. Lip-sync fingerprint binds the exact successful visual hash, Character audio/guide hash/windows/profile, scene/package versions and sync adapter/configuration/output policy. A changed guide creates a new downstream identity; it cannot reset video/voice attempts or repay their work.

All observation/retrieval calls also validate original persisted scope/configuration and any authorized cost. Reuse known submitted IDs/results instead of unnecessary polling and distinguish read/local recovery from paid-attempt budgets. No provider/account idempotency, zero-cost retrieval or exactly-once remote billing is assumed.

Track estimates and actual returned usage/cost per stage/attempt with safe receipts; unknown actual cost remains null. Provider units/estimates are not customer credits or verified dollars. Disabled accounting still requires finite explicit development funding, not implicit permission to spend.

Preserve existing quote/reservation/immutable ledger/completion/settlement/restoration owners and unresolved review-hold/cancellation/commercial rules. Partial/unknown scene failures must not automatically consume/restore the whole reservation or repurchase successful work. Complete only after trusted validated private final output and current final approval. No financial source/schema/policy change occurs now.

## Scene review and safe deletion

**Normal V1 has no intermediate scene review/acceptance.** `scene_ready` is established automatically from exact private visual/voice/lip-sync/storage/timing proofs. Ready scenes for the current immutable package/manifest automatically enter composition; no Accept Scene, voice picker, lip-sync trigger or Stitch action is required. Internal technical validation and provider-aware diagnostics are not user approval.

Only the validated private final video is presented for normal review. Advanced per-scene inspection/replacement can be internal or a future explicitly scoped mode; do not expose it as a default V1 requirement or build it from this documentation task. Existing upstream Character/Product/Location/Storyboard/package approvals are unaffected.

Final Reject and Delete fences/removes only that exact final candidate through bounded provider-free cleanup, retaining minimum audit/financial/deletion proof and protecting source/ready-scene/profile/audio artifacts needed for permitted recovery. Rejection never queues a replacement or another paid request. Any later explicit generation must pass current admission and can reuse compatible verified intermediates. If cleanup fails, retain its checkpoint and retry deletion without invoking providers; reference/retention policy must protect shared and historical artifacts.

## Provider-independent stitching and exact timing

FFmpeg is the deterministic final composition layer, separate from video/voice/lip-sync adapters. Automatically consume the current immutable manifest of **internally completed synchronized scenes → Storyboard-order final project video**, with exact ElevenLabs dialogue/narration placement and declared/available background music/SFX. Technical guide preparation/alignment may also use FFmpeg internally; neither such preparation nor muxing substitutes for `LipSyncProvider` on spoken Character dialogue. No user alignment/stitching step or scene acceptance is required.

Preserve ratio/framing/creative content, exact approved scene coverage and dialogue windows. Normalize only compatible codec/container/frame-rate/resolution/audio sample/channel settings under the frozen profile. Apply only declared supported transitions and mix/mute/duck rules; never invent speech/music/effects, change the storyboard or duplicate native plus dedicated dialogue. Music/SFX are used where available/authorized; a missing explicitly required asset remains a preflight/validation issue, not silently omitted audio.

Keep final duration aligned as closely as possible to the approved package under a predeclared measurable frame/sample-quantization tolerance. Do not invent a tolerance after failure, conceal gaps, cut words, silently stretch video, or relax legacy strict timing rules. Controlled minor speech fitting remains governed by [voice timing](voice-generation.md#dialogue-timing-and-continuity), applied before lip-sync against unchanged windows. The exact output/tolerance values remain implementation-time choices requiring verification.

Composition fingerprint binds owner/project/package/version/hash, ordered completed-scene versions/hashes, original visual and synchronized output lineage, exact audio/profile/binding versions/hashes, guide/segment/window/alignment/adjustment/mix/transition manifest and output/tool/configuration versions. A new upstream artifact invalidates only affected derived scene/final versions; it never transfers final approval.

Work stays on the existing local worker outside Next.js requests, using fixed shell-free arguments, bounded CPU/memory/disk/time, private scratch and attempt-scoped recovery. Stitch/validation/final upload failure reuses the same ready scenes/manifest/bytes, never calls an AI provider to rebuild the movie. Verify the private stored final object before final review.

## Provider-neutral audio and V1 boundary

[voice-generation.md](voice-generation.md) owns the planned reusable CharacterVoiceProfile/VoiceGenerationProvider/Voice Design and exact segment/continuity/timing/private-audio/cost rules. ElevenLabs remains the dialogue voice source. Normal V1 automatically resolves/commits one designed identity from approved instructions and reuses it; it has no manual voice-preview/profile approval gate and does not require a real creator recording. Uploaded/IVC/PVC voices remain future options.

Character dialogue automatically passes through the internal [LipSyncProvider stage](#automatic-scene-processing-and-lipsyncprovider) using the exact ElevenLabs audio. Silent scenes skip both voice and lip-sync. Required narration remains voiced and correctly placed without inventing on-camera mouth motion. Native video audio is optional and cannot replace dedicated Character speech unless a future workflow explicitly chooses it; prevent duplicate speech.

All strategies are resolved as architecture decisions; exact voice/sync models/account capabilities, language/performance mapping, automatic candidate-selection policy, output/timing/mix/retention/pricing and persistence remain implementation-time verification details. Required speech/synchronization/audio cannot become optional because a first model lacks support. Missing audio/sync blocks readiness/final completion before paid waste; no adapter or runtime support is claimed by this document.

## Final validation, review and completion

Before exposing the final video for review, trusted automatic validation must establish:

- Every required scene is internally complete/private/durable and bound to the exact owner/project/package/scene/version/hash and current composition manifest; no missing, duplicate, stale or technically incomplete scene. No per-scene owner acceptance is required.

- Correct Storyboard order/coverage, target aspect ratio/resolution/profile and expected duration within the predeclared technical tolerance; readable/decodable video with valid stream/time-base metadata.

- Every required dialogue/narration segment uses the exact CharacterVoiceProfile/binding, approved text/window and scene; readable private audio, valid alignment/placement and authoritative ElevenLabs speech. Character dialogue has verified lip-sync-stage output/provenance rather than a mux-only claim. Silent skips and narration routing are explicit; required final audio streams exist.

- Private final object length/MIME/ETag/SHA-256, output/assembly fingerprint, technical validation receipt and immutable source video/audio/sync lineage. Successful FFmpeg exit or a provider URL alone is insufficient.

- Current package/upstream approvals, current execution/cost authority and trusted financial completion eligibility; a late old worker/result cannot overwrite a newer candidate.

Normal V1 shows simple persisted progress: **Preparing final video · Generating scenes · Adding voice · Synchronizing dialogue · Combining scenes · Finalizing video · Final video ready**. Skipped silent stages are not fabricated progress. Detailed per-scene/provider requests, percentages, voice-selection, stage controls and debugging stay internal unless a safe error diagnostic is necessary. Errors/reconciliation show a clear stopped/recovering status without requiring routine manual scene work.

The Final Video view shows only the completed final candidate for normal review: owner-authenticated private player, measured duration, aspect ratio/resolution and generation status. Reuse existing Studio navigation/controls/accessibility/Tailwind/native scrolling; no UI is implemented here. Normal review actions are **Approve Final Video** and **Reject and Delete Final Video**. Advanced scene review/regeneration is internal/future, not an exposed V1 gate.

Final approval atomically binds the exact current package/composition/completed-scene/audio/profile/sync/final asset versions/hashes and expected command version. Recheck trusted stored validation/ownership under database fencing before final_approved and receipt-backed Complete through the existing accounting owner. Duplicate approval/settlement is harmless. Provider/scene/stitch readiness never completes the workflow alone.

Final rejection fences/deletes only the composed final candidate, preserves reusable verified intermediates and audit/financial evidence under the safe retention rules, and does not automatically regenerate, rerun lip-sync or restitch. Any later explicit Generate Final Video action must be admitted anew and can reuse compatible completed work. No refund/hold/abandonment policy is invented.

## Planned persisted states and checkpoints

These are conceptual labels, **not installed enums/tables/RPCs or UI**. Keep independent stage checkpoints and stable successful artifact references; a single global running flag cannot recover a partially completed scene.

| Scope | Planned states / gates |
| --- | --- |
| Admission | Approved current package → explicit Generate Final Video with matched cost authorization → full preflight → automatic internal work. No provider selector or extra scene/voice approval. |
| Video | queued → submitting/generating → reconciling where uncertain → saving → video_ready, or known failure. Preserve request ID/intent, source visual and independent attempt count. |
| Voice | Internal reusable profile design/identity commitment once, then per-segment queued/generating/reconciling/saving → audio_ready or validation issue; explicit skipped_no_speech with zero paid work where applicable. |
| Lip-sync | Waiting for exact visual/Character-audio guide → queued/submitting/generating/reconciling/saving → sync_ready or failure. Silent/non-Character narration skips are recorded. Its own fingerprint/attempt/request/output lineage is separate from video and voice. |
| Storage / scene | Per-artifact pending/saving/verification/recovery failure → durable; scene_ready only after required video/voice/sync/timing/storage proofs pass. Source/derived readiness is not owner acceptance. |
| Final composition | All required current scenes ready → automatic combining → finalizing (inspect/store/verify) → final_review. Bounded deterministic recovery reuses exact manifests/bytes. |
| Final review | Approve Final Video → final_approved → trusted Complete; Reject and Delete → fenced final cleanup with no generation. |

Persist append-only phase/reason/version/attempt/claim/heartbeat/request/checkpoint events. Refresh/reopen and worker restart read this truth and fence expired claims; observation/local retries cannot reset paid attempt counts or resubmit unknown requests. Changing required upstream versions invalidates dependent readiness/final approval while preserving historical success. M9 approval still pauses in current source; this documentation does not enable an execution consumer.

## Security, development restrictions and implementation handoff

Every server command/read/preview/worker/recovery/cleanup/final approval independently verifies application owner → project → exact package → scene/stage/attempt/profile → asset/composition/final relationships. Enforce scoped uniqueness, immutable evidence, compare-and-set/lease fencing and private grants/RLS. Never trust client owner IDs, provider URLs/keys, completion or billing assertions. Automatic scheduling does not weaken authorization.

Credentials/configuration remain server/worker-only. Restrict provider request/voice IDs and asset keys to private records; browser projections contain safe progress/final metadata and short-lived owner-authorized previews. Redact raw provider bodies/exceptions/prompts/dialogue, signed/result URLs, base64, credentials and storage keys. Adapter downloads enforce reviewed hosts/schemes/redirect/size/time rules and never forward credentials to output hosts. No permanent signed links or private media in Marketplace snapshots.

[Current documentation-only scope](ai-workflow-rules.md#automated-m10-documentation-scope-2026-10-27) authorizes no application code, migration, environment/dependency/credential change, provider/live database/storage call, worker/job/media process, tests/build, deployment or hosted setting change. Render and local/hosted Inngest remain disabled; the existing local worker is the development execution path and is not started.

Later separately authorized implementation must verify exact video/Voice Design/TTS/lip-sync model/account capabilities and retention; automatic identity selection/commit policy; approved conditioning; output/quantization/controlled audio fitting; guide/mix/transition contracts; finite per-stage/execution attempts/cost authorization; current financial review/terminal mapping; catalog-compatible persistence and local tool/resource bounds. These are technical details under resolved strategies, not new provider choices for the user or permission to invent support.

Later authorized acceptance must cover dialogue/silent/narration routes, one profile across scenes, no normal intermediate review gates, known-result/unknown-intent reconciliation, duplicate starts/restart/lease fencing, storage-first recovery, independent lip-sync failure, partial scenes, deterministic order/audio placement and final-only approve/reject without regeneration. No such tests or operations run in this documentation task.
