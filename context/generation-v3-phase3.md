# M10 V3 Phase 3 — local runtime and first-test preparation

## Canonical Studio V3 correction (2026-10-30)

New eligible UGC drafts saved through the normal Studio use atomic fresh-project V3 enrollment internally (local V3 enabled and matching configured operator). Existing project IDs never enroll or migrate. All owned projects render the existing CreationWorkspace/StudioLayout, Sources uploads/names, Creation Type and Properties. V3 only supplies Preview generation/review state; the separate form/workspace is removed and old /studio/v3 bookmarks redirect to /studio or the owned project route.

Saved Visual Style, Creation Type, Type, scene instructions, tone and category form a versioned generationContext for OpenAI Character/Product/Location requests and Storyboard direction. Identity preservation and one shared creative treatment are explicit. Source originals remain existing private Sources assets. Style/direction or source changes derive stale badges without changing/deleting old approvals/media; current references and Storyboard require regeneration/reapproval before package admission. Package direction also freezes saved settings and narration's existing prompt-derived intent. The normal 10,000-character scene input is preserved.

Manual migration 078 follows unchanged 076/077, verifies its referenced columns, adds context/approval/source/intent guards and extends only V3 runtime currentness. No new tables, backfill or historical V1/V2 changes. Paid Higgsfield transport remains disabled; provider validity, estimate, authorization, recovery and minimum-segment planning remain intact. No real provider call, worker, live database/storage mutation, remote SQL, paid generation, build/browser suite or deployment is performed by this correction. Offline checks and manual visual acceptance are recorded below/in the tracker.


Implementation: 2026-10-29–30; official documentation reviewed 2026-10-29 with model/billing recheck on 2026-10-30. The first-test source path is implemented; provider/account/database/browser acceptance remains manual. Actual paid transport is OFF. No real OpenAI/Higgsfield generation, estimate, poll, storage call, live project mutation, migration application, worker or deployment ran during implementation. No historical project/execution/authorization was reused.

## Manual database setup

Use the existing authored migrations in ascending filename order. Inspect which prerequisites are already present; do not blindly replay non-idempotent historical migrations. For a database already at 075, the exact next order is:

1. `supabase/migrations/20261029007600_ugc_final_v3_preflight.sql` — unchanged Phase 2 foundation.
2. `supabase/migrations/20261029007700_ugc_v3_runtime.sql` — new runtime extension; 076 intentionally prohibits paid transitions and cannot supply runtime intent/lease/result writes.
3. `supabase/migrations/20261030007800_ugc_v3_studio_context.sql` — canonical Studio reference context/currentness guards; manual, no data rewrite.
4. Run [verify-v3-setup.sql](../scripts/verify-v3-setup.sql), read-only, in Supabase SQL Editor. All 11 tables must exist with RLS, browser reads/execute and direct service inserts false; listed RPCs must be service-executable security definers with empty search paths. Verify package/segment and authorization uniqueness plus both legacy-insert guards. All legacy-attachment counts must be zero. Stop on any mismatch; inspect the actual catalog rather than guessing or rewriting an applied migration.

For an earlier database, apply only missing prerequisite files 001–075 in their repository filename order before 076/077. This command prints that exact ordered list without executing SQL: `Get-ChildItem supabase/migrations/*.sql | Sort-Object Name | Select-Object -ExpandProperty Name`. No deployment/catalog status is inferred from source. Migration 077 is rerunnable and changes no previous function body/grant. Its new insert guards prevent only newly enrolled V3 projects from entering legacy generation queues; existing V1/V2 rows are untouched.

## Fresh enrollment and OpenAI pipeline

Open `/studio` locally. Choose UGC before the first save/upload; the normal Save action atomically inserts a brand-new owned `projects` row and `ugc_v3_projects` registry for the enabled local operator. Existing project UUIDs cannot be enrolled. Reopening any `/projects/[id]` uses the same Studio, with generation selected by persisted enrollment; a historical project keeps its historical workflow. Unknown enrollment status fails visibly rather than exposing legacy actions for a V3 project.

The operator supplies a completely different image for this new test. The application verifies new-project ownership/provenance; whether the image visually differs from the historical test is an operator acceptance requirement, not a fabricated cross-history comparison. Uploads reuse the existing private upload/finalization service. New V3 tasks use their own logical job/leases and never resume old jobs.

Explicit upload/regeneration → OpenAI Character candidate → review/approval; optional Product image → fresh Product candidate → review/approval; Generate Location → OpenAI image edit conditioned on approved fresh references → review/approval. The runtime follows the existing Product image-edit recipe: owned bytes, `images.edit`, one PNG, explicit configured image model, technical image validation, private immutable publication and manual acceptance. It does not invoke the historical SOUL2 Character pipeline. No old provider flag or authorization enables V3.

Generate Storyboard queues the V3 director adapter using approved private images as data inputs, an explicitly selected vision-capable structured-output Responses model, complete shot/action/reaction/dialogue/camera/zoom/cut/lighting/pacing/Product/sound/continuity direction and an exact duration/ratio. This uses the [official image edit](https://developers.openai.com/api/reference/resources/images/methods/edit) and [structured output](https://developers.openai.com/api/docs/guides/structured-outputs) contracts. Models and inputs are frozen in task intent. SDK retries are zero. Raw responses are fsynced before parsing/publication; interrupted unknown requests never automatically resubmit. Saved responses can recover private publication without another OpenAI request. No extra correction call is purchased automatically.

Approved reference/Storyboard versions are immutable creative inputs. Building a package verifies current approvals/private bytes and reference bindings, then creates a source revision. Changed references or brief make the Storyboard/package stale. A compatible 10s Storyboard normally becomes exactly one continuous 10s segment. Current UI choices remain 5/10/30s; longer synthetic/approved contracts and local joining do not expand product duration choices.

## Verified provider contract and remaining mandatory blockers

Current [Seedance 2.5 reference API](https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/api-reference) confirms `bytedance/seedance-2.5/reference-to-video`, image/audio/video URL arrays, integer 4–30 seconds, 480p/720p/1080p, six ratio values, MP4/MOV and `generate_audio`. The runtime first profile emits image references only, 480p, MP4, native audio and the complete director prompt. No sample-only field is added. Direct JSON has no SDK `input` wrapper.

The public table still does **not** establish exact image/audio/video counts, per-file bytes, model-specific format rules, prompt maxima or body maxima. [Shared uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads) list supported upload formats, which do not prove Seedance-specific restrictions. Audio/video reference validity remains unverified and those inputs are excluded from the first profile. Other models' published limits are never substituted. Account/model access and actual output CDN hosts also require manual confirmation.

Request validity therefore stays blocked with `HIGGSFIELD_REQUEST_LIMITS_UNVERIFIED` until official/account evidence is reviewed. `UGC_V3_HIGGSFIELD_LIMITS_FILE` points to a private JSON object with `model`, `verifiedAt`, `expiresAt`, official `sources`, `maxImageCount`, `maxImageBytes`, `imageMimeTypes`, `maxPromptBytes`, `maxBodyBytes`. Supply verified numbers only; there is deliberately no usable invented numeric template/default. The snapshot is frozen with the quote; changing/expiring it requires a new package/quote/authorization. The 20 MiB local image and 256 MiB local result safeguards are application bounds, not provider claims.

Exact dialogue, lip-sync, shot precision and continuity are quality observations, not guarantees or request-validity blockers. Native audio is explicitly requested; ElevenLabs/Kling are never called. The UI records expected dialogue/shot timing, actual duration/audio presence, Character/Product/Location continuity, rough speech timing, visible lip/audio synchronization, visual quality and notes. Required applicable checks must pass before approval; none is silently marked passed.

## Exact transport and cost lifecycle

The [official lifecycle](https://docs.higgsfield.ai/docs/concepts/requests), [polling](https://docs.higgsfield.ai/docs/concepts/polling), [errors](https://docs.higgsfield.ai/docs/concepts/errors), [idempotency](https://docs.higgsfield.ai/docs/concepts/idempotency) and [billing/retention](https://docs.higgsfield.ai/docs/concepts/billing-and-retention) pages were checked without authenticated calls.

The adapter implements authenticated estimate POST, submit POST, response-locator status GET, known-request reconciliation and bounded completed-media download. It normalizes HTTP rejections separately from ambiguous timeout/network/5xx outcomes. Provider error bodies are not logged. Accepted UUID, correlation ID, status/cancel locators, result URL/expiry metadata and receipt hash are retained privately. Unknown request IDs or unexpected shapes stop for reconciliation. Polling backs off from 2 to 10 seconds and stops automatically after an application-level hour; recovery can observe the known request again without submission.

`POST /estimate/{model}` receives the exact same canonically serialized body as later submit and captures the authenticated `usd` string. A local quote UUID, account scope, body/configuration, per-segment and total micro-USD, currency USD, response hash, observation time and a five-minute local freshness deadline are persisted. That deadline is Sceenyk policy, not a provider-issued TTL. Signed delivery URLs are frozen; quotes expire before those URLs. Operator ceilings never supply prices. Actual provider cost stays null until separately observed receipt evidence exists; estimates are never relabeled actuals.

The package freezes reference/Storyboard versions, segment timing and fingerprint, compiled prompt, output/native audio, capability snapshot, pricing evidence and deterministic hashes. The quote additionally freezes actual model/payload/body hash and reviewed validity evidence. One ≤30s segment is one video estimate. Multi-segment cost is the sum, and package authorization is allocated across segment authorities without increasing the reviewed aggregate ceiling.

## Authorization and immutable paid intent

V3 uses its own `ugc_v3_run_authorizations` and configuration namespace. Explicit operator consent binds exact project/package/version/hash, quote, segment UUID/version/hash, model, 480p, duration, audio flag, one request, segment cost ceiling, package ceiling, operator/time/expiry and immutable hash. Client confirmation is tied to the displayed package hash/quote; changed snapshots must be reviewed again. `UGC_FINAL_AUTHORIZATION` and V1 funding are never read by this runtime.

Generate records an immutable execution intent before worker I/O: execution/intent UUIDs, package and segment bindings, model, exact request fingerprint/body/hash, independent estimate, authorization, timestamp, attempt=1 and stable idempotency UUID. SQL uniqueness on package+segment and authorization prevents double clicks/concurrent requests from creating another submission. Rejected/deleted attempts retain their identity and consumed authority. A replacement requires explicit new package/estimate/authorization; no click silently resets an attempt. Any earlier pending/unknown/unreviewed V3 run blocks another package's paid admission.

Only the local worker submits. Immediately before POST it rechecks activation scope, currentness/lease, validity evidence, quote/account/authorization/delivery expiry and the exact immutable body. Canonical JSON serialization preserves byte hash across PostgreSQL JSONB round trips. `Idempotency-Key` is sent with submission; it is not replaced after uncertainty. No automatic POST replay is implemented. Accepted response is fsynced before DB acknowledgement. If the response is lost and no saved ID exists, state stays `reconciliation_required`; obtain/reconcile the original identity rather than creating a new request.

## Private results, review and recovery

Completed provider URLs are temporary private recovery metadata, never UI previews. Download uses a reviewed exact-host allowlist, HTTPS, bounded bytes/time, no redirects and no forwarded API credentials. Original response/media bytes are saved locally first. FFprobe/full local decode validate MP4, expected ratio, 480p short edge, native audio and a declared 250ms duration tolerance before private conditional R2 publication and ETag/SHA-256 readback. Actual measured duration is retained; no timing/wording guarantee or creative retiming is inferred. Only verified private assets receive owner-authorized short-lived previews.

One segment → Final Video ready → one audiovisual player → explicit Approve or Reject and Delete. Complete requires current approved candidate and persisted completion time. Reject immediately fences preview and queues conditional private deletion/local byte cleanup; it never queues generation. Generate Final Video remains visible, with a fresh package/estimate/authorization needed for a replacement. Failed deletion has Retry deletion. Check status refreshes an expired private preview without generating.

Multiple segments are reviewed individually. Only all approved current segments can enqueue local FFmpeg joining; the join stores an immutable segment/hash manifest and gets its own final review. Recovery reuses approved sources and any saved joined candidate, without provider requests. Current shared technical media inspection bounds join duration to 120s; extending UI durations or this technical envelope is separate from the first 10s test.

Restart behavior: saved result → reuse; accepted request ID → status reconciliation; no known outcome → stop; provider rejection → explicit reviewed replacement; download/private-save failure → recover the same completed result/local bytes; local join failure → reuse approved segments. Provider URLs expire after the documented retention window (default seven days after terminal state, account policy may shorten); expired missing bytes produce an explicit stop and never a new generation. Recover never clears `provider_started`, request identity or successful bytes. Terminal/review states do not keep polling.

## Local environment and commands

Use existing Supabase/Clerk/private R2 configuration and `OPENAI_API_KEY`. New names/defaults are in `.env.example`; no real environment values were changed:

| Variable | Purpose |
| --- | --- |
| `UGC_V3_ENABLED=0` | Enable local V3 enrollment/generation internally when explicitly set to 1 in development. |
| `UGC_V3_OPERATOR_USER_ID` | Exact authenticated application-user UUID permitted to operate this test. |
| `UGC_V3_OPENAI_ENABLED=0` | Separate explicit permission to queue/call fresh reference/director generation. |
| `OPENAI_V3_IMAGE_MODEL` | Explicit image model; example preserves `gpt-image-2.5-sunburst`. |
| `OPENAI_V3_DIRECTOR_MODEL` | Explicit reviewed vision/structured-output model, no fallback. |
| `UGC_V3_HIGGSFIELD_CREDENTIALS` | Server-only `KEY_ID:KEY_SECRET`. |
| `UGC_V3_HIGGSFIELD_ACCOUNT_SCOPE` | Reviewed stable account identifier for estimate binding. |
| `UGC_V3_HIGGSFIELD_LIMITS_FILE` | Private reviewed official/account evidence file described above. |
| `UGC_V3_HIGGSFIELD_OUTPUT_HOSTS` | Verified exact CDN hosts, comma-separated; no wildcard. |
| `UGC_V3_RECOVERY_DIR` | Persistent private local recovery location; default ignored `.ugc-v3-recovery`. |
| `UGC_V3_HIGGSFIELD_ENABLED=0` | Submit switch; remains OFF after implementation. |
| `UGC_V3_ACTIVATION_PROJECT_ID`, `UGC_V3_ACTIVATION_PACKAGE_ID` | Exact first-test activation scope, initially empty. |

The web application uses `npm run dev`. In the **separate local worker/inspector PowerShell**, set `$env:NODE_ENV='development'` first; these tools refuse production/unspecified environments. This does not change deployment configuration.

```text
npm run worker:ugc-v3 -- --project <NEW_PROJECT_UUID>
npm run inspect:ugc-final-v3 -- --project <NEW_PROJECT_UUID>
npm run test:ugc-final-v3-phase3
```

The project inspector is read-only DB observation, never a provider request. Its report omits signed URLs, keys, private paths and raw prompts, while retaining prompt hash/length, references, segment/model/output, capability hash, fresh cost, authority, currentness and duplicate protection. Phase 3 `eligibleForPaidSubmission` means all prerequisites **except** the intentional transport switch pass; `canSubmit` also requires enabled, exactly bound transport. Both fields are explicit. The older file-envelope Phase 2 inspection remains supported and fail-closed.

## Exact first controlled test sequence — operator-run only

1. Manually verify prerequisites/apply 076 then 077 then 078 and run the verification SQL. Confirm no historical enrollment or V1/V2 attachments. Complete local owner/second-account/reopen checks before enabling providers.
2. Obtain the missing official/account Seedance limits and verified result hosts. Populate the evidence file with supported values and dates; never copy synthetic test limits. Confirm account/model access and private input delivery. If any mandatory validity evidence remains unknown, stop: the first paid test is still blocked.
3. Configure the separate V3 operator/models/credentials/account/storage/recovery settings. Set `UGC_V3_ENABLED=1`, keep `UGC_V3_HIGGSFIELD_ENABLED=0` and activation UUIDs empty. Start/restart the local app. Do not enable Render/Inngest or old workers.
4. Open the normal **Studio** (`/studio`), select **UGC** before first saving, enter a new Project title, and use **Add Character** in Sources for a different image (plus **Add Product / Prop** if used). Set **Describe your scene**, **Duration = 10s**, **Visual style**, **Tone**, **Type** and aspect ratio in the existing Properties/toolbar; save changes. Use Preview → References to generate/review/approve fresh Character, optional Product and Location. Use Preview → Storyboard for fresh director generation and approval, then Package for the fresh package and finite approval. Set `UGC_V3_OPENAI_ENABLED=1` only when ready to incur fresh OpenAI reference/Storyboard charges. Start the scoped local worker. Upload/regenerate and approve Character, optional Product, Location and then the full director Storyboard. No historical asset/voice/package is reused.
5. Build package and estimate. Confirm **one 10s segment**, desired ratio, 480p, MP4, native audio, correct references/dialogue/shot timing. Authenticated estimate capture is now an explicit operator-run operation; it was not performed during implementation. Inspect the package and approve a finite USD maximum. Before the quote expires, run the read-only inspector and require current inputs, valid evidence/estimate/authority and `eligibleForPaidSubmission=true`, `transportEnabled=false`, `canSubmit=false`.
6. **Future paid test only, requiring a new explicit authorization from the owner:** only after that authorization and review, set the V3 activation project/package UUIDs to those exact inspected values and set `UGC_V3_HIGGSFIELD_ENABLED=1`; restart the local app/worker to load them. Do not set historical flags or reuse old authorization. Check status/inspect again; require `canSubmit=true`. Click Generate Final Video once. SQL deduplicates repeats and the worker submits at most the authorized one segment.
7. As soon as acceptance is recorded, turn `UGC_V3_HIGGSFIELD_ENABLED=0` again and restart the worker; known-request polling/private recovery remains available without new submission. Keep the same persistent recovery directory. Review actual media/diagnostics and approve, or explicitly reject/delete without regeneration. Unknown outcomes must reconcile the original request; never build a replacement to bypass them. If the five-minute quote expired before submission, rebuild/review a fresh package and authorization first.

Runtime/visual acceptance and the real paid test are deliberately unperformed. Nothing in this delivery activates a provider or grants a historical authorization to V3.

## Changed files and verification

New V3 source: `runtime-config.ts`, `runtime-contract.ts`, `runtime-store.ts`, `runtime-server.ts`, `runtime-media.ts`, `execution-package.ts`, `execution.ts`, `execution-inspector.ts`, `join.ts`, `worker.ts`, and `adapters/higgsfield-transport.ts` / `higgsfield-validity.ts` under `lib/final-video-generation-v3/`. V3 `identity.ts` adds canonical body hashing; `validation.ts` makes Product optional. Existing Phase 1/2 APIs keep their original constant fences.

Historical Phase 3 UI: the separate V3 page/form and development link were superseded by the 2026-10-30 canonical Studio correction above. `app/api/ugc/v3/route.ts` remains the internal backend boundary. New tooling: `scripts/ugc-v3-worker.ts`, `scripts/check-final-video-v3-phase3.ts`, `scripts/verify-v3-setup.sql`; the existing inspector adds safe runtime/project inspection. Added manual `supabase/migrations/20261029007700_ugc_v3_runtime.sql`. Updated `.env.example`, `.gitignore`, `package.json` and the relevant architecture/workflow/UI/package/pricing/database/progress context. No dependency version, real environment or stylesheet changed.

Verification: **79 Phase 3 +110 Phase 2 +270 Phase 1 +187 V2/V1 =646 offline checks**. Four HTTP calls use an injected fixture transport; zero real requests occur. Disposable PGlite applies all 77 migrations, reruns 077, validates the manual setup SQL and preserves all 335 previous function bodies/grants. Full TypeScript, focused ESLint, 487 local documentation links/targeted anchors, whitespace and scope checks pass. All 62 protected historical source/fixture files and migration 076 remain unchanged. Direct flag-only inspection reports V3 feature flag false, paid flag false and effective transport false. Browser/visual/mobile/keyboard/live provider/database/account/FFmpeg acceptance and production build/deployment were not run. No qualifying Next.js feedback candidate was found.

## Canonical Studio correction — changed files and offline evidence (2026-10-30)

- UI/routing: `app/(workspace)/studio/page.tsx`, `app/(workspace)/studio/v3/page.tsx`, `app/(workspace)/projects/[id]/page.tsx`, `components/creation/creation-workspace.tsx`, new `components/creation/v3-workflow-preview.tsx`; removed `components/creation/v3-studio.tsx`.
- Save/enrollment/context/runtime: `lib/projects/server.ts`, `lib/projects/types.ts`, `lib/final-video-generation-v3/enrollment.ts`, `generation-context.ts`, `contract.ts`, `runtime-server.ts`, `worker.ts` (the latter five under the V3 directory).
- Database/checks: `supabase/migrations/20261030007800_ugc_v3_studio_context.sql`, `scripts/verify-v3-setup.sql`, `scripts/check-final-video-v3-phase3.ts`, new `scripts/check-v3-studio-ui.tsx`.
- Context: `overview.md`, `architecture.md`, `ui-context.md`, `code-standards.md`, `ai-workflow-rules.md`, `progress-tracker.md`, and this document under `context/`.

Passed 149 Phase 3 checks (including structured style, scoped enrollment, all 78 migrations, 078 rerun, database staleness/source/approval/intent guards, full style-change regeneration/reapproval/new-package recovery, preserved history and historical project isolation), 110 Phase 2 checks, 270 foundation checks and 22 Studio render/wiring checks. TypeScript and focused ESLint passed. Test HTTP is injected; real network/provider calls remain zero. The actual Studio layout, controls and styling owners are retained; full visual/keyboard/provider/runtime acceptance remains manual.
