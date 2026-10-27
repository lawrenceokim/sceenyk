# Milestone 10 — Character Voice Generation

## Status and authority (2026-10-27)

**Voice strategy — Resolved: ElevenLabs selected as the first planned voice provider. ElevenLabs UGC implementation — Planned / Not Started.** M9 is Complete and approved. M10 remains Planned / Not Started; its earlier description-only voice-strategy block is resolved by this decision, not by an implemented integration. The fal.ai UGC video adapter and final composition remain Planned / Not Started. Runtime/provider/manual acceptance is Pending.

This is the canonical planned voice/profile/dialogue contract. [Final Video Generation](final-video-generation.md) owns orchestration, scene review, deterministic composition and final approval. [M9](video-generation-package.md) owns the existing immutable creative package. These are documentation contracts, not installed interfaces, tables, RPCs, states or UI. Current work is [documentation only](ai-workflow-rules.md#elevenlabs-voice-strategy-documentation-scope-2026-10-27): no application code, migrations, credentials/configuration changes, live records/storage, provider requests, workers, tests/builds or deployment. Public official documentation review is permitted. Render/Inngest remain disabled; the existing local worker is the development execution path.

## Separate responsibilities and source boundary

Planned flow: **Approved Generation Package → full video/voice/composition preflight and cost authorization → video-provider scene generation → ElevenLabs dialogue/narration generation → verified private video/audio → FFmpeg composed scenes → explicit composed-scene acceptance → final stitch/validation/review → approval/Complete.** Persist each successful output immediately; arrows do not postpone saving video until audio succeeds. Resolve the Character voice profile once as a prerequisite for dialogue, with separate authorized Voice Design preparation if needed. Establish audio feasibility before paid video so a known audio gap cannot waste video work.

| Responsibility | Owner / planned boundary |
| --- | --- |
| Approved content | Storyboard/package: exact words, scene/segment timing, Character binding, approved voice description/pace, delivery and continuity. No adapter rewrites creative content. |
| Video | Existing `VideoGenerationProvider` abstraction; fal.ai first planned adapter. Match visual/reference/timing/output requirements independently of native speech. |
| Voice/dialogue | Planned `VoiceGenerationProvider`; ElevenLabs first adapter/configuration. Reusable voice identity plus exact segment synthesis, alignment, safe recovery and usage. |
| Final media | Provider-independent FFmpeg/FFprobe composition on the local worker; neither ElevenLabs nor fal performs final assembly. |
| Core workflow | Owned immutable profiles/operations/approvals, authorization, fingerprints, budgets, private assets, review and financial handoff. |

Existing [`lib/voice-ai/provider.ts`](../lib/voice-ai/provider.ts) directly delegates `generateNarration` to an ElevenLabs adapter. [`contract.ts`](../lib/voice-ai/contract.ts) contains ElevenLabs-specific narration configuration, and [`providers/elevenlabs.ts`](../lib/voice-ai/providers/elevenlabs.ts) makes a single TTS POST returning MP3. This legacy flow does **not** implement UGC Voice Design, `CharacterVoiceProfile`, generic provider replacement, per-utterance timestamp alignment or M10 recovery/composition. Its dated stock-voice/hosted acceptance remains historical evidence. Preserve it; evaluate narrow reuse only during later authorized implementation. Do not silently reuse its voice/model/limits, narration schema or hosted transport as M10 defaults.

## Canonical CharacterVoiceProfile

For V1: **One Character → One Voice Profile → Same voice across every scene**, including required narration attributed to that Character. The same profile version and committed provider binding must serve every required segment in an execution. A new voice candidate cannot silently replace a profile used by accepted audio.

| Planned neutral field / relationship | Meaning |
| --- | --- |
| Profile ID, schema version, immutable profile version/digest | Stable application identity separate from a provider voice ID and mutable workflow/command version. |
| Owner/project and Character binding | Application owner, owned project, logical Character plus exact Character/reference approval identity/version. No cross-owner reuse by guessing an ID. |
| Voice description | Exact approved text from Storyboard/package; no demographic/sensitive-trait inference from images. |
| Language | Explicit approved language, not inferred from appearance; unresolved values need an execution-profile decision before synthesis. |
| Accent | Nullable; set only when explicitly selected/approved. Do not invent one to satisfy a provider prompt. |
| Tone, pace, energy, delivery style | Approved neutral performance instructions with provenance. Preserve existing slow/natural/energetic pace; explicitly version any later mapping or additional approved attributes. |
| Storyboard/package binding | Exact approved Storyboard ID/revision/version/hash and package ID/content version/hash; profile approval/source provenance and currentness proof. |
| Source kind | Designed voice for V1; future reusable creator recording, Instant Voice Cloning or Professional Voice Cloning. A source choice is not permission to clone. |
| Opaque voice-binding reference/version | Server-owned link to private adapter identity/configuration. The neutral profile contains no ElevenLabs field names, API settings or credentials. |
| Lifecycle/approval evidence | Draft/identity preparation/review or selection/bound/stale/rejected concepts, expected command version and immutable selection/approval evidence; not installed enums. |

M9 currently supplies only Character binding, description and pace. Language/accent/energy, provider identity and profile approval are **planned execution-profile extensions**, not fields already present in M9. Preserve approved M9 bytes/hashes. Bind explicitly resolved technical/voice choices through an immutable execution/profile manifest; a changed creative voice instruction requires proper Storyboard/package revision and approval, never an adapter edit. Existing reusable profile content may have explicit new package associations without rewriting prior approvals.

Private adapter records resolve the opaque reference to provider, account scope, persistent voice ID, model/adapter/settings/output/capability versions and design/create request identities. Core may retain safe provider/model/request provenance, but must not interpret vendor payloads or expose raw identities to browser DTOs. Rebinding a provider/voice is an explicit profile/execution revision with fresh capability/cost checks; no fallback. Future real creator voice sources reuse this neutral association and add their own verified ownership/consent/access rules. Uploaded creator voice, IVC and PVC are future options, **not V1 prerequisites**.

## Planned VoiceGenerationProvider abstraction

The following is an interface design, not a TypeScript implementation or a claim about the legacy wrapper:

| Neutral operation | Planned contract |
| --- | --- |
| Identity / capabilities | Provider/adapter/configuration identity and versions; voice design/persistence/reuse, languages, performance controls, formats, limits, timestamps/normalization, continuity, synchronous/asynchronous behavior, result retrieval/retention, usage and failure semantics. Mark supported/unsupported/unverified distinctly. |
| Validate profile / segment / plan | Check the full approved profile and exact text/window/delivery requirements plus storage/composition feasibility. Return precise neutral incompatibilities before spending; do not silently ignore an unsupported language/style. |
| Prepare reusable voice | Consume an approved neutral draft and explicit authorized operation; return opaque preview candidates and safe metadata. Design/create are independently persisted steps; providers without design require an explicitly compatible reusable-voice strategy. |
| Commit voice identity | Resolve the selected preview into a reusable binding, preserving selection provenance and the original paid intent. Never recreate identity per segment. |
| Synthesize segment | Exact approved text, logical scene/segment/profile bindings, delivery/pace, absolute dialogue window, neutral continuity context, immutable execution configuration, operation/attempt identity, authorization and cancellation signal. Return normalized receipts plus bounded audio delivery/alignment metadata. |
| Observe / recover | Retrieve an existing known result when advertised, reconcile known requests and normalize pending/completed/failed/unknown/unavailable states. Never convert an unknown paid outcome into an implicit new synthesis. Synchronous TTS need not pretend to expose an asynchronous job API. |
| Error / usage normalization | Unsupported requirement, configuration/auth, known rejection, rate limit, uncertain outcome, invalid media/timing, storage/recovery required, expired/unavailable output; estimates and provider units/cost with provenance. |

ElevenLabs adapter/configuration exclusively owns concrete voice/model/preview/history/request IDs, HTTP endpoints/payloads/headers, synthesis settings, normalization and continuity parameters, output-format identifiers, account/model limits, error parsing, retention and pricing/usage metadata. Core Storyboard/package/M10 orchestration consumes neutral commands/results; a future voice provider must not require rewriting them. No silent provider/model/voice switch on failure.

## ElevenLabs Voice Design and reusable identity

The official [Voice Design quickstart](https://elevenlabs.io/docs/eleven-api/guides/how-to/voices/voice-design/) describes preview generation followed by selection and saved-voice creation. [Design API](https://elevenlabs.io/docs/api-reference/text-to-voice/design) returns preview audio and `generated_voice_id`; [Create Voice](https://elevenlabs.io/docs/api-reference/text-to-voice/create) saves a selected preview and returns a reusable `voice_id`. A preview identifier is not yet the committed reusable identity.

Planned sequence:

1. Validate/currently approve the neutral profile draft/description, freeze adapter configuration and separately authorize finite design/create cost/attempts. Save an atomic design intent before the request.
2. Generate previews **once per explicit profile design operation**. Persist safe result identifiers, private preview audio/proofs and recoverable receipts before advancing. Do not run design for each scene or use it to rewrite the description.
3. Record an explicit, reviewable candidate-selection policy/event; the exact owner-preview selection UX remains a later implementation decision. Never treat the first returned preview as an implicitly approved voice. Any preview sample text is separately identified as a demonstration, not inserted into approved dialogue or the final track.
4. Persist a distinct create/commit intent, create the reusable voice from the selected preview and immediately retain the returned identity in private adapter state. An uncertain create cannot be automatically repeated just because a local profile binding is absent.
5. Atomically bind that exact identity to the approved profile version. All scene dialogue/narration reuses it. Changing description or explicitly selecting a replacement creates a new version and invalidates dependent audio/composed-scene/final acceptance while preserving reusable video.

Model choice, description/sample-text limits, preview retention/retrieval, account voice slots/permissions, format availability, selection UI and exact create-reconciliation support must be verified for the chosen account before implementation/execution. Do not truncate an approved description or extend approved dialogue to satisfy design input limits. No voice/model is selected from a provider default by this document, and no design/create/synthesis request has been sent.

## Dialogue timing and continuity

Each approved `speech[]` occurrence has a stable segment identity/order bound to the exact package/scene and profile version. Synthesize only its exact nonempty approved dialogue/narration text, preserving its hash, assigned absolute `[startMs,endMs)` window, delivery, pace and emotion instructions. Silence creates no speech request. Context cannot become additional spoken text. Unsupported delivery/normalization behavior is a capability issue, not permission to insert invented speech or punctuation/tags into canonical content.

The official [speech-with-timing API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps) returns encoded audio and optional original/normalized character alignment. It accepts previous/next text or up to three prior/following request IDs. Preserve alignment type and text correspondence; optional timestamps cannot be assumed present. Normalize seconds to integer-ms in a versioned mapping, retain measured audio duration independently, and reject malformed/nonmonotonic/out-of-bounds timestamps. Any necessary separate alignment operation needs its own advertised capability and authorized cost.

The [request-stitching guide](https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/request-stitching) requires fully processed prior responses, recommends request IDs no older than two hours and states that stitching is unavailable for `eleven_v3`. Use the same committed voice and compatible frozen model/settings, with bounded neighboring approved-text or completed-request context where supported. Persist exact context fingerprints for repeatability and replacement decisions. Expired/unavailable context does not authorize regenerating successful neighboring segments. Request stitching improves prosody; it does not perform movie assembly or guarantee identical performances.

Choose privacy/history behavior together with continuity/recovery capabilities. The timestamp API documents that zero-retention mode disables history/request stitching and is enterprise-only. Do not promise history recovery under that mode. No privacy mode, language control, model, sampling rate or format is selected without capability/account verification.

Planned duration validation and adjustment policy:

- Decode/measure the full audio, including technical leading/trailing silence and encoder delay; compare its spoken interval and duration against the assigned dialogue window before audio/composed-scene readiness.
- Retain source timing, measured timing and any derived placement/adjustment receipt separately. Exact placement is deterministic FFmpeg work, never a changed Storyboard timestamp.
- Permit only small, controlled adjustments under a predeclared, versioned finite timing policy: safe removal of verified non-speech padding, placement within the approved window, declared silence and, only if explicitly approved, a tightly bounded intelligibility-preserving tempo adjustment. Record every value and revalidate alignment. Do not cut phonemes, overrun adjacent dialogue or silently accelerate speech to an unnatural rate.
- Numeric bounds/tolerances and the supported alignment fallback must be resolved before paid execution; this plan invents none. Overflow beyond policy becomes a timing/validation issue. Local reprocessing or an explicit authorized segment retry may resolve it; never rewrite dialogue or regenerate video automatically. Reuse verified bytes for another technical validation first.

## Persistence, private audio and independent recovery

These are persistence **concerns**, not table/column/RPC names or a migration design. Verify actual catalog/schema/grants and existing financial/media owners before later persistence implementation.

| Concern | Planned persistent evidence |
| --- | --- |
| Scope | Owner/project/job/execution; exact package/Storyboard approvals, versions/hashes; scene ID/content version; stable dialogue segment/order/text hash/window; profile ID/version/hash and opaque voice-binding version. |
| Provider attempt | Provider/adapter/model/configuration, private voice/reference/request/history/preview IDs where returned, immutable intent/fingerprint, distinct monotonic paid attempt, normalized state/errors, lease/version fences, start/receipt/recovery timestamps. |
| Audio output | Server-only immutable audio asset key, SHA-256/output fingerprint, byte length/MIME/container/codec, measured duration/sample rate/channels, ETag/verification proof, alignment/normalization metadata and original/derived timing receipts. |
| Usage/cost | Trusted estimate/rate/configuration version and units before admission where available; actual reported usage/cost and safe receipts when returned, with unknown amounts null. Design/create/synthesis/retrieval are separate operations. |
| Review/dependencies | Exact selected profile, ready audio and composed-scene versions, immutable media manifests, validation/rejection/replacement/cleanup proofs and final approval dependencies. |

Every successful output, including recoverable design previews, must be bounded/validated and immediately copied into private Sceenyk-controlled storage. Fsync private attempt-bound local recovery bytes and metadata before publication where needed; reconcile a possible completed upload at the same immutable key. Verify the stored object and measured media proof before ready. Provider URLs, response base64, local scratch or a successful provider response alone are not durable success. Browser projections expose authenticated short-lived previews and safe progress, not private keys/provider voice/request IDs. Never permanently store a signed preview URL as an asset identity.

| Boundary | Planned recovery |
| --- | --- |
| Timeout / unknown paid outcome | Keep intent/attempt and known IDs; enter reconciliation required. Disable SDK/transport POST retries. A missing ID or timeout is not proof of failure or permission to repurchase. |
| Known result, storage failed / interrupted response | Recover exact verified local bytes first, then retrieve that same provider result if supported. Retry storage/validation of the same attempt; never redesign voice or regenerate audio/video automatically. |
| History retrieval | [History item metadata](https://elevenlabs.io/docs/api-reference/history/get) can include request/voice/model identity; [history audio retrieval](https://elevenlabs.io/docs/api-reference/history/get-audio) requires a **history item ID**. Keep request IDs distinct from history IDs. Where permitted, use bounded history observation and exact provenance matches; do not assume every request ID is a downloadable locator or every result is retained. Ambiguous matches stop for reconciliation. |
| Worker restart / expired claim | Reload immutable operation, reconcile private object/spool/provider receipt, atomically reclaim/fence leases and preserve successful segments. Worker retry count is distinct from paid attempt count. |
| Duplicate command | Scoped fingerprint/unique admission returns completed verified audio or observes the same known request. Unknown attempts remain blocked; explicit replacement gets a new authorized attempt and keeps prior audit. |
| Failed duration/alignment/audio validation | Preserve provider success/cost evidence and recoverable bytes. Retry local inspection/allowed timing processing first. An explicitly requested new synthesis must pass remaining budget/current profile/consent checks. Video is reused. |
| One segment fails / profile changes | Keep other successful audio and all compatible video. Only affected dependencies become stale/ineligible; changed profile bindings require fresh audio/composed-scene review, never silent replacement. |

Read-only retrieval may have provider/account costs or permission/retention constraints; preauthorize any such cost. No exactly-once provider billing or recover-by-client-correlation guarantee is assumed. Unrecoverable output/unknown outcome needs an explicit operator/owner decision and renewed incremental authorization before any new paid attempt. Rejection/deletion never enqueues replacement. Cleanup fences only the exact rejected unreferenced asset; never delete an active reusable provider voice or assets shared by accepted/history references as an automatic consequence of a scene rejection.

## Cost protection, security and completion

Before **every** design, create, synthesis or chargeable observation operation, independently verify owner/project scope, current approved Storyboard/package and exact profile version, operation-specific capability/configuration, existing successful/submitted/uncertain fingerprints, finite per-operation/segment/profile/execution attempt and spend budgets, explicit current generation authorization and the existing accounting/credit/free-reservation rules. Voice Design starts from an approved persisted profile draft; synthesis additionally requires its committed reusable identity. Package/profile/scene approval is not financial consent. Commit the paid intent under database/version/lease fencing before the call; never purchase an uncertain operation twice automatically.

Request fingerprint binds scope, package/scene/segment/profile versions/hashes, exact approved text/window/delivery, opaque binding/configuration versions, continuity inputs, translation/normalization/output policy and deliberate seed policy. Exclude temporary URLs/tokens, leases, observation counters and timestamps. Distinguish content fingerprint from paid-attempt identity and provider ID. Successful identical work is reused. Neighbor/context changes are explicit versioned requests, not retroactive mutations. Voice failure cannot automatically fail/refund/repurchase the whole video or consume/release the whole reservation. Existing trusted final settlement/restoration remains authoritative.

Track separate design and dialogue estimates/actuals where available. Provider character units, account quota and USD billing are distinct from Sceenyk customer credits; missing cost is null, never zero. Resolve production rates, markup, preparation funding, voice-slot lifecycle and review/abandonment policy before paid rollout. Do not copy legacy tariffs, voice settings or refund behavior into M10 by implication.

`ELEVENLABS_API_KEY` is server/worker-only; no browser/public secret or credential in persisted profiles, logs or assets. Private metadata access and every preview/recovery/review/cleanup independently check exact owner → project → package → Character/profile → scene/segment → output relationships. Persist allowlisted provider voice/request IDs in restricted adapter records; store no credentials. Redact raw exceptions, dialogue/descriptions, base64, signed/result URLs, keys and authorization headers from logs. Downloads use adapter allowlisted hosts/schemes/redirect/size/time checks with no credential forwarding. Short-lived signed previews require owner checks at issuance and redemption. Never publish private voice/audio in Marketplace snapshots.

FFmpeg takes verified private video + the selected dialogue/narration assets + only declared/available approved music/effects, applies exact scene-relative audio offsets and a versioned mix/duck/mute policy, and produces a new composed-scene version. Disable or explicitly replace conflicting native speech; never layer duplicate dialogue. Native video-provider audio is optional and requires a future explicit selected audio strategy, not silent fallback. Music/SFX generation and real creator cloning are future capabilities, not invented current features.

Before final approval verify every required segment, exact profile/binding/package/scene version, readable measured audio, valid alignment/placement, readable composed scene, correct full scene order/duration, required final audio stream and private stored hashes/receipts. Missing dialogue or invalid audio/video alignment blocks Complete. **Muxing TTS onto video does not create mouth lip sync**; if the approved scene requires it, a separately verified capability/path and review are needed before dependent paid work. No lip-sync provider is chosen here. Final assembly/review rules remain in [the composition contract](final-video-generation.md#provider-independent-stitching-and-exact-timing).

## Later implementation handoff

The provider decision and no-recording V1 Voice Design strategy are resolved. The next separately authorized implementation must resolve exact supported design/TTS models/account permissions, language/performance mapping, preview selection/approval and identity lifecycle, retention/history/continuity tradeoffs, output/quantization/adjustment limits, lip sync where required, catalog-compatible persistence and existing financial admission. Resolve these technical details without reopening the selected architecture or requiring future cloning for V1.

Only later, under explicit testing authorization, use fixtures to cover duplicate design/create/synthesis, lost acknowledgements, expired claims/context/history, storage failure, partial success, overlong/invalid audio, exact segment placements, silent scenes, profile changes, mixed native/external audio prevention and missing-final-dialogue refusal. The owner performs runtime/provider/manual acceptance after source implementation; this documentation task runs no such checks or operations.
