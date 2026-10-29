# M10 V3 Phase 2 — persistent planning and preflight

2026-10-29. Source/offline boundary only. Paid generation remains disabled. Migration 076 is manual and unapplied remotely. V1/V2 code, historical projects/executions/assets/authorizations and environment/provider settings remain unchanged. No real project, media, live database/storage operation or provider call was created by this task.

## Verified and unverified Higgsfield requirements

Only official public documentation was read. No authenticated estimate/status/cancel/account/generation or OpenAI request ran. The model-specific parameter table takes precedence over generic examples. The supplementary [OpenAPI](https://docs.higgsfield.ai/docs/openapi.json) has no Seedance model entry or model-specific maximum lengths.

| Requirement | Evidence and remaining limits |
| --- | --- |
| Model/input | [Seedance reference API](https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/api-reference): model `bytedance/seedance-2.5/reference-to-video`; direct JSON fields `prompt`, `duration`, `image_urls`, `audio_urls`, `video_urls`, `resolution`, `aspect_ratio`, `output_format`, `generate_audio`. Arrays are optional. |
| Duration/output | Same table: integer 4–30 seconds; 480p/720p/1080p; ratios 16:9, 4:3, 1:1, 3:4, 9:16, 21:9; MP4/MOV; native audio flag defaults true. Exact output geometry/frame rate remains unverified. |
| Reference limits | Exact image/video/audio counts, per-file bytes, combined limits and audio/video duration bounds remain **unverified**. No fal, consumer-product or other-model limits are substituted. |
| Formats | [Upload service](https://docs.higgsfield.ai/docs/concepts/file-uploads) documents JPEG/JPG/PNG/WebP/GIF, WAV/x-WAV and MP4. These are upload formats, **not verified Seedance-specific compatibility**. Upload URL validity is one hour. V3's own 20 MiB private-image import bound is not a provider claim. |
| Prompt/body | Model table documents prompt minimum length 1. Prompt maximum characters/bytes and total body maximum remain **unverified**. A sample includes `bitrate_mode` absent from the parameter table; the adapter emits no such field. |
| Authentication/status | [Status API](https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status): authenticated GET, `Authorization: Key KEY_ID:KEY_SECRET`, UUID request ID and optional result/error/expiry fields. Store response-provided locators; validate host/path before future use. Account/model access remains untested. |
| Cancellation | [Lifecycle](https://docs.higgsfield.ai/docs/concepts/requests): authenticated POST to returned cancel URL, only while all jobs remain queued; 202 empty success, 400 once processing starts. Mapping is inert here. |
| Results | Lifecycle/status: `queued`, `in_progress`, `completed`, `failed`, `nsfw`, `canceled`; video result is `video.url`. URL availability does not prove private persistence, playback or creative acceptance. |
| Failures/IDs | [Errors](https://docs.higgsfield.ai/docs/concepts/errors): synchronous `detail` string/list; terminal `error` may be present. Documented classes include 400/401/403/404/409/422/423/429/500/503. Retain request UUID and response correlation ID; do not use human messages as permanent business codes. |
| Idempotency | [Idempotency](https://docs.higgsfield.ai/docs/concepts/idempotency): account-scoped `Idempotency-Key`, 1–255 visible ASCII characters, UUID recommended. Endpoint, complete body, URL values/array order, webhook and retention header must stay unchanged. Mismatch gives 422; same-key replay returns original identity, never a replacement. No undocumented key-retention guarantee is assumed. |
| Expiry | [Retention](https://docs.higgsfield.ai/docs/enterprise/data-retention): default seven days after terminal completion, account/header policy can shorten; `expires_at` controls files. Status identity may remain after files expire. Copy privately promptly. Provider URLs are not permanent assets. |
| Cost contract | [Billing](https://docs.higgsfield.ai/docs/concepts/billing-and-retention): authenticated `POST /estimate/{model}` with the same parameters returns `{ "usd": "decimal" }`. No quote TTL is documented; Sceenyk requires explicit local observed/expiry timestamps. Failed/NSFW and successfully canceled queued work are documented as uncharged/refunded; actual receipts remain separately observed. |
| Public rates | [Model pricing](https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/playground) describes token/dimension/duration arithmetic. Headline per-second figures are approximate and discounts can apply. V3 requires authenticated account evidence; it never treats ceilings or public approximations as exact account prices. |
| Dialogue/lip-sync | `generate_audio` is verified. Exact wording, language/voice controls, dialogue timing, lip-sync guarantees and their limits remain **unverified**. Generic audio integration proves none of those stronger requirements. |
| Multi-shot | Timed shot directions can be compiled. Maximum shots, cut precision and continuity/multi-shot adherence guarantees remain **unverified**. Required capabilities still block submission. |

## Persistence model and migration

[Migration 076](../supabase/migrations/20261029007600_ugc_final_v3_preflight.sql) adds isolated, RLS-enabled, append-only tables. Browser roles have no table/RPC privileges; service_role has table SELECT only and writes through owner-scoped security-definer RPCs with empty search paths. Existing canonical hashing helpers are called without replacement.

| Table | Stored evidence |
| --- | --- |
| `ugc_v3_projects` | New owned project, independent logical V3 job UUID, workflow and creation time. Project and registry are created atomically. Existing projects cannot be enrolled. |
| `ugc_v3_sources` | Immutable creative input revisions, original-image provenance, approved references/Storyboard bindings, input hash, private reference keys/ETags/readback, reviewing operator and project-brief fingerprint. |
| `ugc_v3_packages` | Immutable package UUID/version, source revision, complete frozen document/hash. Identical identity replay is idempotent; mutation/concurrent version collision fails. |
| `ugc_v3_authorizations` | Fresh UUID, exact project/package/version/hash/provider/model/output/segment scope, finite request/cost ceilings, operator decision/time/expiry and authorization hash. |
| `ugc_v3_events` | Append-only event UUID/revision/state/hash. The state schema has per-segment attempts, idempotency key, request fingerprint/body hash, future provider request UUID, private result metadata, actual cost/receipt hash and review assessments. |

Existing project/asset columns are traced to repository migrations and exercised in disposable SQL. This is not a deployed-catalog certification. Before manual application, inspect the target catalog and apply prerequisites in order; never infer its schema from stale client code. No historical row is backfilled or rebound.

`ownedV3Workspace()` derives identity from Clerk/app-user authentication. Mutations also require the existing local operator identity; that identity is separate from old spending authority. Trusted source import requires explicit operator review, a newly uploaded original owned by the new project and conditional private byte/SHA-256 readback for every image. It only accepts new-project V3 reference paths. Readback proves bytes, not AI authorship or visual fidelity. This server-only import has no public route and is not a replacement OpenAI upstream workflow; fresh OpenAI generation/approvals remain Phase 3.

Project prompt/category/output/style/tone/type changes invalidate the stored brief fingerprint. New source/reference/Storyboard approval creates a new source revision. Either blocks package freezing/authorization/progression until explicit rebuild/reapproval. Future paid admission must also recheck private bytes and approval currentness. No storage reads ran here.

## Package, cost and authorization

`generation-package-v3.2` freezes approved Character/Product/Location references and Storyboard, visual style/duration/aspect ratio/resolution/native audio, minimum Generation Segments/scene membership, persisted neutral compiled prompts, capability snapshot/hash, command fingerprints, account-bound estimate evidence, aggregate cost/expiry and package hash. Reconstruction validates hashes, continuity/order, prompt and commands. Documents are deeply frozen. Actual cost/receipts and review decisions live outside creative content in append-only state.

Compatible 10s/two-scene content freezes one segment; compatible 45s freezes 30+15s. This does not expand UI duration choices. Package cost sums segment estimates. Missing, mismatched, ambiguous or expired pricing returns `COST_ESTIMATE_UNAVAILABLE`, never a guessed zero or ceiling-derived amount. Refreshing estimates requires a new immutable package/version and fresh authority. Quote expiry is an explicit Sceenyk freshness policy, not a provider guarantee.

First-test authorization binds one fresh UUID to one exact package/version/hash/provider/model, 480p, duration, segment count, operator approval/time/expiry and immutable hash. Maximum requests equals segment count; the independent cost ceiling can exceed but never determine the estimate. The Phase 1 planner's older-shaped snapshot is deny-all in persistence and excluded from the frozen package. Only the new V3 authorization table represents approval. No authorization bypasses capability/transport blocks. Authenticated estimate acquisition and finite paid reservation/consumption remain Phase 3, not simulated account evidence.

## Exact inert payload

Direct HTTP body for the intended reference test, without an SDK `input` wrapper:

```json
{
  "prompt": "<reference role mapping plus full frozen director prompt>",
  "duration": 10,
  "resolution": "480p",
  "output_format": "mp4",
  "generate_audio": true,
  "aspect_ratio": "9:16",
  "image_urls": ["<approved Character URL>", "<approved Product URL>", "<approved Location URL>"]
}
```

Target: `POST https://api.higgsfield.ai/bytedance/seedance-2.5/reference-to-video`. Estimate target inserts `/estimate/` before the model. Optional `audio_urls`/`video_urls` appear only for approved bindings of those kinds; the current private import profile accepts images only. Array order is preserved and roles explained in the prompt. Image/text variants retain separate mappings. There is no client, credentials, submit/poll/cancel transport or fallback.

`inspectHiggsfieldPayload` constructs the actual body from a delivery map, computes SHA-256 of exact JSON bytes and exposes only whitelisted fields with prompt and every URL redacted. It never logs headers, media host/path/query or raw creative text. The CLI supports optional local delivery URLs, otherwise clearly marked placeholders. A placeholder-body hash is not a real outbound-body receipt. Phase 3 must privately freeze exact bytes/URLs/retention/idempotency before POST; signed URL refresh must never silently alter an unknown intent.

## Dialogue, execution, recovery and review

The compiler preserves who speaks, exact intended words, local time window, delivery/emotion, visible speaking-mouth behavior, off-screen narration distinction, ambience/SFX/music and continuity. They are creative targets, not speech or synchronization guarantees. V3 calls neither ElevenLabs nor Kling.

Post-generation assessments: `not_checked | pass | fail | not_applicable` for dialogue produced, approximate timing, lip/audio sync, Character continuity, Product continuity and shot continuity. Required assessments need `pass` before approval; required speech/lip checks cannot be bypassed as not applicable. Private results bind hash/key/bytes/MIME/duration/dimensions/audio/readback/provider UUID and nullable actual cost/receipt hash. The reducer does not itself perform storage or perceptual verification; future trusted validators/reviewers supply these observations.

For the first real test, preserve the actual transcript against each intended speaker/utterance, observed start/end times versus requested windows, visible mouth onset/end versus audible speech and any measurable offset. Record timestamped Character/clothing, Product and shot-boundary continuity observations. Assess native ambience/SFX against their approved intentions too. Do not set invented automatic tolerances or mark an unchecked result pass; establish the measurement method and operator acceptance criteria before that test. Phase 2 stores assessment state and technical metadata; detailed media analysis/measurement capture is a Phase 3 prerequisite.

States: `planned`, `package_ready`, `awaiting_authorization`, `authorized`, `queued`, `submitting`, `provider_processing`, `result_saved`, `awaiting_review`, `approved`, `failed`, `reconciliation_required`. This phase persists preparation/authorization states only. Code and SQL independently forbid paid transitions. The pure reducer tests future execution/review states without a request.

Attempts retain stable idempotency UUIDs/fingerprints and immutable successful results. Unknown submitting/processing outcomes must reconcile original identity before any new intent. Definitive failure permits only explicit separately authorized retry of that segment. Restart reads persisted revision/history; no reset/replay of uncertain paid work. Event UUID replay is accepted only for identical content; locks and compare-and-swap reject competing revisions. Future transactional cumulative request/cost reservations and leases are required before transport activation.

One segment: private validated result → Final Video review directly → explicit final approval. Several segments: individual approve/reject → only all approved segments can join locally → private joined candidate → final review. Rejection preserves evidence and never regenerates. These are implemented state/DTO contracts and documented UI behavior. Existing V1 UI/routes/workers remain isolated; V3 UI wiring and parent completion enforcement remain Phase 3.

## Local inspector

```text
npm run inspect:ugc-final-v3 -- <local-inspection-envelope.json>
npm run test:ugc-final-v3-phase2
```

Envelope: `{ "package": <frozen document>, "currentInput": <latest trusted source>, "sourceRevision": <latest revision>, "sourceCurrent": <latest brief check>, "authorization": <optional V3 authority>, "execution": <optional state>, "deliveryMedia": <optional reference UUID to URL map> }`.

The inspector is file-only/read-only, loads no `.env`, uses current time for expiry and always returns `eligibleForPaidSubmission: false` / `PAID_V3_EXECUTION_DISABLED`. It reports identities, timing/scenes/references/prompt summary, sanitized payload/output/audio, capabilities, costs, authority and currentness. Local JSON is inspection evidence, never a live authorization grant. Raw envelopes are not printed.

## Exact Phase 3 steps before the first paid generation

1. Inspect the target schema/ACLs and manually apply 076 after prerequisites. Verify fresh-project creation, two-user isolation, concurrent replay and restart/reopen against the actual database.
2. Add scoped V3 OpenAI reference/director services with explicit models, bounded durable requests/response capture, private publication and owner approvals. Use a new project, different uploaded image and fresh Character/Product/Location/Storyboard sources. Never import old execution/assets/authority.
3. Resolve model reference/size/format/duration and prompt/body limits plus required native dialogue/lip-sync/multi-shot compatibility using official/account evidence. Preserve unresolved blockers. Review achievable acceptance criteria explicitly; never invent speech guarantees or silently add TTS/Kling.
4. Capture a real authenticated exact-input/account estimate under an explicit local freshness policy. Freeze/review a new package and issue finite V3 authorization for that exact version. Verify private input delivery, retention, output allowlists and funding independently.
5. Implement/test transactional intent reservation, cumulative cost/request limits, leases, exact-byte/idempotency/URL retention, accepted/correlation IDs, bounded observation and unknown-outcome reconciliation. Recovery must not create paid replacement intents. Keep both fences until explicit activation authorization.
6. Add trusted bounded result retrieval/measurement, immutable private publication/readback, actual receipts, authenticated review UI/services and current final-manifest/parent completion guards. Establish duration/audio/format tolerances and actual dialogue/timing/lip/continuity acceptance. Join locally only for multiple approved segments.
7. Pass focused transport/database/recovery/review tests for those additions. Obtain explicit permission for the exact funded paid test and scoped transport enablement, then submit only its permitted request(s). This Phase 2 request does not authorize that action. Review real output and record acceptance; never auto-regenerate a rejected result.

## Changed files and verification

New modules in `lib/final-video-generation-v3/`: `package.ts`, `authorization.ts`, `persistence.ts`, `recovery.ts`, `preflight.ts`. Updated V3 `compiler.ts` and `adapters/higgsfield.ts`. Added `scripts/inspect-final-video-v3.ts`, `scripts/check-final-video-v3-phase2.ts`, and manual `supabase/migrations/20261029007600_ugc_final_v3_preflight.sql`. `package.json` adds two local commands; `.gitignore` explicitly allows this new delivery document.

Updated context: `architecture.md`, `overview.md`, `code-standards.md`, `ai-workflow-rules.md`, `database.md`, `pricing.md`, `generation-jobs.md`, `video-generation-package.md`, `generation-architecture-v3.md`, `progress-tracker.md`, and this new document. No V1/V2 source/fixture or dependency version changed.

Verification: 110 Phase 2 +270 unchanged Phase 1 +187 unchanged V2/V1 =567 focused offline checks, zero network/provider requests. Disposable SQL applies all 76 migrations, reruns 076 and preserves all 330 previous public function bodies/grants. Tests exercise atomic authorization rollback, source/brief currentness, owner isolation, immutable packages/events, cost/expiry, unknown-outcome recovery, signed-secret redaction, native dialogue review, direct-final/multi-segment review and the actual file inspector CLI. Full TypeScript, focused ESLint, 372 local documentation links/targeted anchors, whitespace and 62 protected historical file comparisons pass. Live DB/storage/provider/UI/build/deployment acceptance is not performed. No qualifying Next.js feedback candidate was found in this work.
