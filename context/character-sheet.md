# UGC Character Reference Sheet — Milestone 5

## Milestone 6 — Product / Prop Reference Sheet (2026-10-24)

**Milestone 5 — Complete. Milestone 5.5 — Complete. Milestone 6 — Complete in source; manual migration/provider/runtime/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This section supersedes earlier M6-not-started stop points below. See [Product Sheet contract and manual setup](product-sheet.md).

Character retains its existing SOUL2 adapter, model, prompts, identity training, generated views/storage and completion pause. The approved OpenAI Product model resolves the earlier suitability stop. Local --resume-product consumes that same successful Character sheet and saved analyses, without invoking Character generation or historical Character-output recovery.

Pipeline: Input → OpenAI Reference Analysis → Character Reference Sheet → Product / Prop Reference Sheet → Location Reference → Structured ChatGPT Storyboard → Generation Package → Final Video → Studio Preview. Existing cost-review/accounting gates remain; no user credits are deducted. Manual setup: pending 044 then new 045; OPENAI_PRODUCT_SHEET_MODEL=gpt-image-2.5-sunburst and explicit UGC_PRODUCT_SHEET_ENABLED=1 with existing OPENAI_API_KEY. Keep Render/Inngest disabled. No providers, worker/jobs, private media, remote SQL, browser/screenshot suites, build or deployment executed. Stop after M6.


## Paused Character-complete progress refinement (2026-10-24)

Long-running active workflows may poll, but paused and terminal workflows must not continuously poll. At the existing Product development pause, show Character reference complete / Generation paused / Your character reference is ready. Product Reference generation has not started yet. Keep identity/front/back/face/sheet checks visible; Product and later stages wait. Check status and visible page/tab return only read once; future explicit server-confirmed resume refreshes the same job and restores polling without deleting checkpoints or making a new job. Historical timing cannot establish active processing, so this job shows Started earlier. Manual 044 records leased active processing only for future new jobs; no historical backfill or current-job retry/mutation. No providers, worker/job, browser suite, deployment or SQL execution during this refinement. M6 remains Not Started.

## M5.5 regression follow-up — current job already Character ready (2026-10-24)

User confirms 043 applied. Fresh read-only inspection of the supplied job now finds `queued / product_reference / PRODUCT_REFERENCE_NOT_IMPLEMENTED`, attempts 3/3, completed Soul identity/front/back/face operations, a completed Character sheet with all four saved asset descriptors and both completed analyses. The older front-failure evidence below is historical. No provider request, bytes download, recovery RPC, job change or worker execution occurred in this inspection.

The Character-output recovery command correctly refuses this already-successful stage; it is intended only for eligible failed Character output with remaining attempts. No Character resume command is appropriate for this job now, and Product remains M6 Not Started. Worker startup now reports UGC_CHARACTER_ALREADY_READY instead of hiding the refusal behind its generic catch, plus safe phase/reason diagnostics for other startup failures. No attempt reset, SQL repair, new migration or recovery bypass is added. Studio polling now reads private JSON independently of its route rendering; [full regression evidence](generation-jobs.md#m55-regression-and-worker-startup-diagnosis-2026-10-24).

## Milestone 5.5 — live Character progress (2026-10-24)

**Live Generation Progress UI Complete in source; manual 043/runtime/visual acceptance pending. Milestone 6 remains Not Started.** Studio now restores the owned Project job and shows real Soul identity/front/back/face/sheet substeps in Preview. Saved operations establish activity; only persisted normalized assets mark views ready. The existing failed job therefore can show identity prepared and front failed when no front asset was saved, even if the provider operation completed. No old checkpoint/event/job is rewritten or retried.

Manual [043](../supabase/migrations/20261024004300_ugc_live_progress.sql), after 041/042, emits semantic append-only progress from the existing checkpoint transaction and a successful real composition checkpoint. It preserves detailed host validation, download/decode, submission/poll metadata, per-view and composition diagnostics in private checkpoints/operator logs. Those technical details are never serialized to normal users; safe fixed messages and view/stage states are enough. [Read model, polling, heartbeat, elapsed-time and setup contract](generation-jobs.md#milestone-55--live-generation-progress-2026-10-24). No provider, worker/job, retry, migration or private storage operation was run by Codex.

2026-10-23: **Milestone 5 — Complete in source. Manual migration/provider/runtime/visual acceptance pending. Exact next: Milestone 6 — Product / Prop Reference Sheet generation. Not started.** No real provider call, private object read/write, worker/job execution, remote migration application, deployment or browser/integration/screenshot suite was run by Codex. Offline in-memory schema validation through 041 and a second 041 DDL pass succeeded without jobs/external calls. Migration 039 is applied according to the user; 040 must also be applied before new named snapshots and 041. Historical M4/name documentation below other context sections remains historical.

## Front output failure and controlled recovery (2026-10-24)

Read-only inspection of the specifically requested later failed job confirms **both analyses completed; Soul ID completed after 33 polls; front view completed after 5 polls; back/face not submitted; no asset descriptors**. Soul ID and front generation have saved provider UUIDs. No signed image URL, response-shape metadata, output hostname or download/decode metadata is stored in this older document. The front completion checkpoint precedes the failure by about 0.66 seconds.

The executed adapter only returns completed for a view after validating matching request_id, status=completed, exactly one images entry and a valid images[0].url. Therefore a missing output array, missing URL field, wrong response field or earlier identity/submission/polling failure is not this job's failure. Its paid front request returned an image URL; media validity/availability is not established by that alone. The [official response contract](https://docs.higgsfield.ai/docs/concepts/requests) uses images[].url, so the parser is retained without speculative output/data fallbacks.

**Historical diagnostic limit:** after that completion checkpoint, the old no-diagnostic CHARACTER_OUTPUT_INVALID paths include the URL protocol/credentials/port/exact-host guard and Sharp empty/body/dimension/multipage/decode/encode rejection. Persisted records and the supplied log do not distinguish which one fired. No exact output hostname, allowlist result, historical download HTTP/MIME/byte count, Sharp result or expiry can be reconstructed. Do not present a guessed hostname or most-likely branch as the root cause. The operator confirmed they have no saved response metadata; fetching the provider response is forbidden during this task. A missing historical diagnostic cannot be repaired retroactively.

**Saved-metadata follow-up:** repeated read-only inspection confirms job metadata={}, every event contains only attempt/resumeStage metadata, and the identity/front operations contain only submission key, state, provider ID/API status endpoint, timing and poll counters. Neither operation has response/output metadata, media or diagnostic fields. The current local `.next/dev/logs/next-development.log` contains no matching job/request ID or Character diagnostic markers; no separate application log/JSONL/local database was found in the workspace data-file search. The provider ID pasted in the follow-up has an extra character and matches zero saved front operations; the actual UUID on this job matches one. These checks neither queried Higgsfield nor changed historical records.

The old adapter parsed the provider body and returned only state/imageUrl (the image URL remained transient); runOperation checkpointed only completion/timing, and the download/Sharp path returned bytes or a broad error without persisting HTTP/MIME/size/decode details. Thus actual top-level response fields, independently saved output counts and output hostname are absent, alongside every download observation. Exactly one image URL can be inferred from the executed parser's completion requirement, but this is code-backed inference rather than saved response metadata.

The configured host was inspected without changing it; it cannot be compared against an unrecorded output host. Canonical private R2 metadata-only HEAD checks confirm **HTTP 404 for front, back, face and final sheet**; no generated objects exist at those paths. No media bytes were read. Database asset records are empty; no back/face operation or final composition was reached. A historical R2 failure would ordinarily use CHARACTER_STORAGE_FAILED, and composition uses CHARACTER_COMPOSITION_FAILED; neither is evidence for this recorded output error. Existing paid Soul ID/front IDs and both analyses remain reusable subject to provider retention. No image bytes have been saved locally.

### Output-invalid branch inventory

| Original generic path | Current fixed internal reason / evidence |
| --- | --- |
| API status lookup 404 | CHARACTER_PROVIDER_STATUS_NOT_FOUND, exact HTTP and operation |
| Invalid/bounded/empty API JSON or Zod response/receipt shape | CHARACTER_PROVIDER_SCHEMA_INVALID, safe known top-level fields/counts when JSON is available; no raw response |
| Soul ID / view response UUID mismatch | CHARACTER_PROVIDER_RESPONSE_ID_MISMATCH |
| Completed view missing exactly one image | CHARACTER_FRONT_OUTPUT_MISSING / BACK / FACE with view and image count |
| Invalid status/output URL scheme, credentials, port, path or fragment | CHARACTER_OUTPUT_URL_INVALID; URLs never retained |
| Output host absent from exact allowlist | CHARACTER_OUTPUT_HOST_REJECTED plus hostname only |
| Provider-advertised output expiry already elapsed | CHARACTER_OUTPUT_URL_EXPIRED; a 403/404 alone does not prove expiry |
| CDN transport/non-success HTTP | CHARACTER_OUTPUT_DOWNLOAD_FAILED plus available HTTP/MIME/received-byte metadata |
| Unsupported Content-Type | CHARACTER_OUTPUT_MIME_INVALID |
| Empty or oversized body | CHARACTER_OUTPUT_EMPTY / CHARACTER_OUTPUT_TOO_LARGE |
| Sharp decode/normalization, too-small/missing dimensions, multiple frames | CHARACTER_OUTPUT_DECODE_FAILED / CHARACTER_OUTPUT_DIMENSIONS_INVALID / CHARACTER_OUTPUT_ANIMATED |
| Frozen sheet/analysis fingerprint mismatch or missing canonical sheet | CHARACTER_OUTPUT_CHECKPOINT_INVALID |
| Previously completed request regresses from completed | CHARACTER_OUTPUT_STATUS_REGRESSED; no resubmission |
| Saved asset SHA256 disagrees with checkpoint | CHARACTER_OUTPUT_INTEGRITY_FAILED |
| Unknown exception formerly converted to generic output invalid | CHARACTER_UNEXPECTED_OUTPUT_FAILURE; no raw exception logged |
| R2 read/write/save verification | Stable job code CHARACTER_STORAGE_FAILED plus internal CHARACTER_OUTPUT_STORAGE_FAILED |
| Final layout/composition | Stable job code CHARACTER_COMPOSITION_FAILED plus internal CHARACTER_SHEET_COMPOSITION_FAILED |

Worker logs now distinguish `code` (specific internal reason) from `jobCode` (stable safe database/Studio code). Optional private v1 operation checkpoints retain allowlisted response field names plus unknown-field count, image/output array counts, URL-present flag, hostname, documented expiry/provider status, download HTTP/Content-Type/byte count and decode state. Known field names are allowlisted; arbitrary provider data, URLs, query tokens, bytes and credentials never persist. Download and decode checkpoints precede storage; outer failure recording is best-effort and claim fenced. Strict media bounds and exact-host HTTPS/no-redirect checks remain; no generated output is automatically trusted as a new allowlist entry.

The follow-up extends capture to identity/view submission receipts (`submissionMetadata`) and the latest pending/completed/failed poll (`outputMetadata`), preserving safe HTTP status and validated provider UUID. Provider-error/schema diagnostics retain the same safe projection; empty downloads also retain observed HTTP/MIME/zero-byte/decode-not-attempted metadata. Receipt metadata is kept separately from the latest poll instead of being overwritten. Existing optional JSON checkpoint fields require no further migration and remain compatible with old documents. This is bounded latest-state diagnostics, not a raw-response history; claim loss, process termination or database outage can still prevent a checkpoint. No provider request, retry, worker or remote mutation is part of this change.

### Preserve paid work on an eventual manual retry

Ordinary `--retry` cannot resume this older failure: its retry_eligible=false. Do not reset it by direct row editing or create a new job. **Manually apply only new [migration 042](../supabase/migrations/20261024004200_ugc_character_output_recovery.sql) after 041**, then stop old worker processes and, only when ready for manual execution, run:

```bash
npm run worker:ugc -- --resume-character-output JOB_UUID
```

The new service-only operator RPC requires an existing failed Character output job, the same owned v3 snapshot and completed analyses, completed Soul ID, known accepted/completed view request UUIDs with exact API status paths, no uncertain/rejected/terminal view, no cancellation and remaining original attempts. It queues only that job at character_reference without resetting attempts or altering snapshots/provider IDs/assets. Migration application itself queues nothing. No public/browser recovery action is added.

The same consumer checks canonical R2 assets first. It skips completed Soul ID training and retrieves/polls the **existing** front request; it never resubmits that paid request. Back/face are generated only after the front has been recovered/stored. If an output is expired or unavailable, it stops with a specific diagnostic rather than generating a replacement automatically. Recovery can consume other runnable jobs and later missing views may incur cost; the operator runs it manually. No command/RPC/job write, provider/OpenAI call, migration application or regeneration was executed remotely during debugging. Milestone 6 and hosted execution remain disabled.

## Manual failure diagnosis — credential shape (2026-10-24)

Read-only inspection of the manual failed job and append-only events confirms validation and **both OpenAI analyses completed**. It reached character_reference and attempted **POST /v1/custom-references**. The identity operation was rejected, with no provider ID, zero polls and no generated assets; Soul ID polling, SOUL2 view submission/polling and output download were never reached. Its three-attempt budget is at 1, and explicit retry is already eligible. The 041 table and all four Character Sheet RPCs are exposed in the authenticated schema and its checkpoints have executed, so **041 is required and its runtime objects are present**, not a missing-migration diagnosis. Migration-ledger history was not queried and nothing was remotely applied. 040 is user-confirmed applied; no new migration is needed for this correction.

Safe local environment inspection found **HF_API_KEY_SECRET contained the complete KEY_ID:SECRET credential, with the same key ID already in HF_API_KEY_ID**. The adapter's correct split-field construction consequently sent the malformed shape `Authorization: Key KEY_ID:KEY_ID:SECRET`. The original configuration validator accepted that shape; it now rejects it before claiming work and reports fixed issue `HF_SECRET_CONTAINS_COMPLETE_CREDENTIAL`. All required Higgsfield variables are PRESENT under a fresh worker-equivalent load. The existing running worker retains its startup environment, so changing `.env.local` alone is insufficient; stop/restart it and clear any stale shell overrides. No actual credential was printed, normalized, changed or written by Codex.

**Historical HTTP precision:** the old adapter converted both HTTP 401 and 403 to CHARACTER_AUTH_FAILED, then discarded the status and response body. The persisted rejected identity intent narrows the operation, not the exact HTTP code. No exact historical status/detail/correlation ID can be reconstructed from the saved records; do not label it definitively 401, assume insufficient funds, or claim account/model access was verified. The malformed local credential is confirmed; remote credential validity/access/balance must be checked by the operator's later manual attempt.

Official contracts checked for this correction:

| Operation | Intended endpoint/authentication |
| --- | --- |
| Create/poll Soul ID | `https://api.higgsfield.ai/v1/custom-references` and `/v1/custom-references/{id}`; current [shared auth](https://docs.higgsfield.ai/docs/authentication) and [SOUL2-specific examples](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/api-reference) support `Authorization: Key KEY_ID:SECRET`. The dedicated [Soul ID page](https://open.higgsfield.ai/models/soul-id/api-reference) shows legacy `hf-api-key` / `hf-secret`; shared auth explicitly supports those legacy headers too. No fallback/double-header experiment is needed. |
| Submit/poll views | `https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard` and the returned, origin/path-validated `/requests/{request_id}/status`; same recommended Authorization format. |
| Download output | Only exact reviewed HTTPS CDN hosts, with no Higgsfield credentials and no redirects. |

The existing **Soul ID v2 → completed custom_reference_id → SOUL2 standard** architecture is documented. Keep model_version=v2, the same credentials/account across training/views, and the distinction between Soul ID UUID and generation request UUID. [Image-to-image](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/image-to-image/api-reference) is a different valid endpoint requiring an additional image_url; this failure does not justify switching to it. All provider control-plane requests still use the single fixed current origin, never platform.higgsfield.ai.

The private Character source passed the worker's conditional R2 read and image decode before the identity submission intent was written. Its five-minute server-signed URL is minted immediately before that submission and never persisted. This verifies worker access, **not Higgsfield's external reachability**, which was not tested here. Do not claim an inaccessible/expired source caused this credential failure. HIGGSFIELD_OUTPUT_HOSTS applies only to generated-output downloads, not the original private source; no allowlist change or public-storage change is needed for authentication.

New diagnostics use bounded error-body inspection and persist only an optional operation-level safe projection: provider operation, actual HTTP status, fixed category, an explicitly allowlisted normalized provider code, and UUID request/correlation IDs when available. The [official errors guide](https://docs.higgsfield.ai/docs/concepts/errors) distinguishes missing/invalid credentials (401), typical insufficient-balance rejection (403), model/account availability states (404/423/503), rate limits and later terminal failures. Status alone does not establish every cause; unrecognized 403 remains access_denied, while explicit safe response hints can distinguish balance/account/model/input-image issues. Diagnostic text does not grant submission, billing or automatic-retry authority. Existing database safe error codes/Studio messages remain stable; private worker diagnostics provide the additional distinction. Explicit input-image failures use the existing private-media failure code rather than being mislabeled as authentication. No raw response/body/URL/header survives. No new SQL: the additive optional field is supported by 041's existing private JSON checkpoints and old v1 records still parse.

Manual correction/retry:

1. Stop the existing worker with Ctrl+C. In ignored `.env.local`, retain HF_API_KEY_ID as the UUID and set **HF_API_KEY_SECRET to only the secret portion after the first colon**, without duplicating the ID or including a `Key ` prefix. Normal dotenv quoting may enclose values; literal quote characters must not become part of the loaded secret. Clear stale shell exports for these variables if they override the file. Keep model/enablement/reviewed CDN hosts and the local-only guard.
2. Restart using **npm run worker:ugc -- --retry JOB_UUID**, substituting the existing failed job ID. Do not click Prepare new generation to bypass it. This explicit command schedules the eligible existing failed job and starts the same consumer; it can process other runnable jobs too. It may incur provider usage. No such command is run by Codex.
3. Saved Character/Product analyses are reused. The rejected identity creation can be attempted after the credential repair; there is no accepted provider ID to poll. If a later result is ambiguous, preserve the intent and reconcile instead of creating another paid request. Successful remote IDs/assets continue to be reused.
4. If failure remains, inspect the new `UGC_CHARACTER_STAGE_FAILED` safe diagnostic and retained operation diagnostic for exact status/category/correlation ID; handle provider account/model/balance restrictions manually. Do not change billing or infer provider access from Sceenyk credits.

No provider/R2 calls, worker startup, retry, new job, remote SQL or deployment were performed during this debugging pass. No Studio redesign, hosted execution or Milestone 6 work.

## Approved complete pipeline

User input → validation → OpenAI Character/Product reference analysis → **SOUL2 Character Sheet** → Product Sheet → **one primary Location** → ChatGPT structured storyboard/script and stable voice specification → normalized generation package → cost review/explicit confirmation and later accounting gate → final AI video → finalization → Studio Preview.

V1: exactly one Character and one Product / Prop, both creator-named; one primary location; current durations 5/10/30. The frozen creator Character name is only a project label, never real-person identification. No Product/Location/storyboard/video generation, wardrobe UI, credit deduction, template publication or hosted execution is implemented here.

Milestone 6 must use the original Product image/name and saved Product analysis for main/front, angled and detail views, keep generated hidden geometry distinct from observations, save privately and reuse. Later Location uses creative direction/storyboard needs/style/tone and is reused across scenes. Its stage/schema integration is deferred; no location stage is falsely marked implemented in the current graph.

Later storyboard inputs: Character name/Sheet, Product name/Sheet, Location, direction, duration, ratio, style, tone, UGC Type and narration. Scenes need stable IDs/start/end/location, supplied names, dialogue/action/camera, voice description, visual instructions, generation prompts and continuity notes. Use “Maya lifts the Nova Watch toward the camera” for supplied names, retaining internal IDs. Stable voice specification covers speaking style, pace, energy, pitch and emotional character; accent only if explicitly requested/supported, no ethnicity/nationality inference or voice cloning from an image. Later video package contains those assets, storyboard/voice/scene prompts and settings; only verified final output enters Preview. Cost review/accounting remain later work.

## Provider contract and configuration

Workflow calls [`CharacterSheetProvider`](../lib/character-sheet/provider.ts) through a factory, implemented by the server-only [`HiggsfieldSoul2CharacterSheetProvider`](../lib/character-sheet/higgsfield.ts). All auth/HTTP/media-download logic is centralized. Existing fetch, Sharp and R2 SDK dependencies suffice; no new SDK/dependency or browser provider access.

Official model documentation checked 2026-10-23: [SOUL2 model-specific contract](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/api-reference), [lifecycle](https://docs.higgsfield.ai/docs/concepts/requests), [idempotency](https://docs.higgsfield.ai/docs/concepts/idempotency), [polling](https://docs.higgsfield.ai/docs/concepts/polling). Model-specific documentation takes priority over the older Soul ID page: explicitly create `/v1/custom-references` with **model_version=v2**, then use its completed ID as **custom_reference_id**. Soul ID UUID and generation request UUID are different. No unsupported direct `image_url` field is sent to SOUL2. Account access and visual quality are unverified until manual acceptance.

Configure these only in ignored local server environment:

```dotenv
SCEENYK_LOCAL_JOBS_ONLY=1
UGC_CHARACTER_SHEET_ENABLED=1
HF_API_KEY_ID=<UUID key ID obtained from Higgsfield Console>
HF_API_KEY_SECRET=<matching private API key secret>
HIGGSFIELD_SOUL2_MODEL=higgsfield-ai/soul/v2/standard
HIGGSFIELD_OUTPUT_HOSTS=<comma-separated exact trusted output CDN hostnames>
```

Obtain API credentials/account funding/access and confirm SOUL2 + Soul ID v2 support in Higgsfield Console. Obtain exact output media hostnames from Higgsfield documentation/support or the operator's reviewed provider response; no wildcard, IP, URL, automatic host trust, localhost or arbitrary CDN. The documentation examples use placeholder CDN hosts, so no production hostname is invented. Missing values or flag !=1 stop startup before claims. Configuration validates against the reviewed model contract; changing model requires a new adapter review/version. No real credentials/enablement are written by Codex. Current credentials must stay in the same Higgsfield account for existing Soul IDs/requests; account migration is an operator reconciliation task.

Retain existing server-only Supabase/private R2 and OpenAI configuration (`OPENAI_API_KEY`, `OPENAI_REFERENCE_ANALYSIS_MODEL`, `UGC_REFERENCE_ANALYSIS_ENABLED=1`) for the full local queue consumer. No webhook/callback or public localhost tunnel is needed. Direct HTTP uses `Authorization: Key ID:SECRET`, no SDK automatic retry. API origin is fixed; stored status URLs must exactly match that origin/request path. Output fetches use reviewed exact hosts, HTTPS, no credentials and no redirects.

### Configuring HIGGSFIELD_OUTPUT_HOSTS safely (checked 2026-10-24)

No published SOUL2 output-hostname allowlist was found in the official model-specific API reference, shared lifecycle/status, quickstart, uploads or FAQ pages checked. The [lifecycle examples](https://docs.higgsfield.ai/docs/concepts/requests) use **cdn.example.com**, a documentation placeholder, not an approved production hostname. A hostname appearing in another model's preset-preview example, an upload URL or the website's assets does not establish that it serves SOUL2 generated output. **api.higgsfield.ai is the authenticated control-plane origin, not evidence of an output CDN.** Do not add guessed domains, wildcard/suffix rules, placeholders or arbitrary domains to start the worker.

The current local HIGGSFIELD_OUTPUT_HOSTS value was checked without exposing credentials and is empty. It stays empty until an exact hostname is evidenced by an authenticated completed SOUL2 response for this API account or confirmed by Higgsfield support. Nonempty configuration is required before the UGC worker claims work; therefore use the provider Console/API outside the UGC worker for initial discovery. Do not weaken validation to bootstrap it.

1. Prefer an **existing completed SOUL2 API test** from this account. Open that request's response in Higgsfield Console, or read its existing `status_url` with the same account's credentials. The [official status endpoint](https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status) is `GET https://api.higgsfield.ai/requests/{request_id}/status`; verify the HTTPS origin and UUID/path before sending credentials and do not follow redirects. This reads an existing request rather than submitting another generation. Keep credentials and the full response private.
2. Confirm `status=completed`, the expected request ID and the SOUL2 model provenance from the original request. Extract **only the hostname** from each `images[].url`. Do not extract from `status_url`, `cancel_url`, thumbnails, source uploads, `public_url` or `upload_url`. Hostnames are candidates for the observed result, not a provider-wide permanent domain guarantee. Review them in the authenticated response; if ownership/provenance is unclear, ask Higgsfield support to confirm exact SOUL2 output domains using the request ID. The [official FAQ](https://docs.higgsfield.ai/docs/help/faq) lists support@higgsfield.ai and its Discord support link. Codex does not contact them automatically.
3. If no completed API test exists, the operator may manually run one minimal SOUL2 test in the official Console/API; it may incur a charge. A text-only test can establish output-host evidence without training a new Soul ID. **Codex requires explicit approval before any paid generation/training request and has made none.** Starting worker:ugc is not a discovery method: it may process other runnable jobs and includes paid preparation.
4. Put only manually reviewed lowercase exact hostnames in ignored `.env.local`, separated by commas: no `https://`, port, path, query, whitespace inside a hostname or wildcard. Never copy the signed URL or its query tokens into configuration, logs, public data or chat. Restart the local worker only after configuration and when ready for its normal paid workflow. Keep `SCEENYK_LOCAL_JOBS_ONLY=1` and Render/Inngest disabled.

Optional **offline extraction** from a completed response saved privately outside the repository as `higgsfield-completed.private.json` (no network request, no image download, no environment-file write):

```powershell
$completed = Get-Content -Raw -LiteralPath 'C:\path\to\higgsfield-completed.private.json' | ConvertFrom-Json
if ($completed.status -cne 'completed' -or @($completed.images).Count -eq 0) { throw 'Expected a completed image response.' }
$observedHosts = @(
  foreach ($image in $completed.images) {
    $outputUri = [Uri]$image.url
    if (-not $outputUri.IsAbsoluteUri -or $outputUri.Scheme -cne 'https' -or
        $outputUri.Port -ne 443 -or $outputUri.UserInfo -or $outputUri.Fragment -or
        $outputUri.HostNameType -ne [UriHostNameType]::Dns) { throw 'Invalid output URL.' }
    $outputHost = $outputUri.IdnHost.ToLowerInvariant()
    if ($outputHost -notmatch '^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$' -or
        $outputHost -match '(^|\.)example\.(com|net|org)$') { throw 'Invalid or placeholder output hostname.' }
    $outputHost
  }
) | Sort-Object -Unique
$observedHosts
```

This prints candidates only, never approves them or updates the allowlist. After reviewing provenance, join the approved candidates with commas for HIGGSFIELD_OUTPUT_HOSTS. Allow only observed/support-confirmed output hosts actually needed by this integration; do not broaden to a parent domain or assume one host covers future responses. If a new hostname appears later, the existing downloader rejects it until reviewed. A redirect is also rejected; do not solve that by allowing automatic redirects.

Source review confirms the existing `config.ts` requires 1–10 syntactically valid exact hostnames. `downloadImage` requires HTTPS with no credentials/non-default port and exact hostname membership, rejects redirects, omits API credentials, and retains bounded timeout/MIME/size/media checks. No runtime validator, credential, allowlist value, worker or hosted setting was changed for this documentation/configuration audit. No official production hostname has yet been established for this account.

## Wardrobe, views and composition

[`buildWardrobe`](../lib/character-sheet/prompts.ts) builds and persists a version-1 deterministic specification before training/generation: base casual/smart-casual selected by tone, slate-blue top, charcoal trousers/shoes, reference accessory guidance, observed clothing context, plus full frozen creative direction, visual style, tone and UGC Type. Explicit creative wardrobe requests are conveyed as consistent overrides of base garments. This is a deterministic base plus provider-interpreted direction, not a separately verified clothing parser; manual acceptance must inspect actual outfit consistency. It adds no OpenAI request or Studio control.

Versioned **character-sheet-v1** prompts separate fixed instructions from untrusted JSON names/analysis/direction. The original image via Soul ID is the strongest identity signal; saved analysis v1 is descriptive support. No identification or sensitive inference. Generated wardrobe, rear/body/footwear/unseen details are explicitly labeled generated continuity in persisted provenance, never observed source facts.

Generate front, back and face sequentially with one Soul ID, wardrobe, seed and model: 1080p, batch_size=1, enhance_prompt=false; front/back 2:3, face 1:1. Front/back retain complete head-to-feet framing; no destructive head crop. The same seed/instructions support consistency but cannot guarantee it. SOUL2 supports identity conditioning, not cross-view outfit locks; verify wardrobe/body/face fidelity manually.

Each result must have exactly one output, valid bounded raster MIME/bytes, a decodable single still image, minimum 256-pixel shorter dimension and at most 20 million decoded pixels. Sharp orients, strips metadata, flattens alpha over neutral gray and encodes PNG ≤2048×2048. Download cap:20 MiB. This verifies media structure, not semantic pose/identity correctness; manual inspection is required. Original images remain unchanged. View prompts request gray backgrounds; composition does not remove opaque generated backgrounds, which must be checked visually.

Server-side Sharp composition uses **2400×1216**, background **#b8b8b8**, three 768×1152 contained panels with 32px outer margin and 16px inter-panel gaps. Front/back/face order is fixed. No image text, name, UUID, storage key or decoration is embedded. Individual views and canonical final sheet are retained privately. No browser composition.

## Persistence, recovery and privacy

Manual [`041`](../supabase/migrations/20261023004100_ugc_character_sheets.sql) adds private **ugc_character_sheets**, one per immutable job: sheet UUID/owner/project/job/source Character/name/asset type, version, provider/model, status, document and timestamps. RLS/no browser grants, service SELECT and explicit claim-fenced SECURITY DEFINER RPCs only; identity/instructions/completed rows cannot mutate, history cannot delete. Preflight checks prerequisites before DDL. Reruns are transactional/idempotent; old migrations are unchanged. Live catalog/runtime/concurrency acceptance remains manual.

The strictly validated **schemaVersion=1** document stores snapshot SHA256, source analysis ID/version, prompt version, wardrobe, seed, generated-vs-observed provenance, Soul ID training operation and per-view operations. Each operation records durable UUID intent, state, provider ID where known, validated API status URL (never media/source URL), polling count/next time/start and elapsed milliseconds. Each front/back/face/sheet descriptor has its own asset UUID/type, private key/ETag/SHA256/size/MIME/dimensions. Binaries are only in private R2, never PostgreSQL.

The documented status response exposes no reliable per-request USD/usage fields. Record request IDs, model, timings, dimensions and the fixed three 1080p requests for later accounting/dashboard reconciliation; do not invent cost, imply training is free or deduct Sceenyk credits. Soul ID training and image generation may both bill the operator's Higgsfield account during manual testing.

Original source is independently owner/project/role/fingerprint checked and decoded before a new training call. Higgsfield receives an ephemeral **five-minute server-signed R2 source URL after a conditional ETag-checked read**, never persisted, logged, returned to browsers or templates. A long provider queue may outlive that URL; inspect the original request outcome rather than blindly retraining. The provider retains its Soul ID/media according to its policies; no automatic remote deletion is introduced. All generated R2 keys are owned/job/sheet scoped and conditional immutable PUTs prevent replacement. Deterministic keys recover a successful upload whose SQL checkpoint reply was lost; reads revalidate bytes/ETag/hash. No public URLs, raw response/error bodies, descriptions or credentials are logged. Safe progress DTOs never include private keys/provider IDs/documents.

Durable intent commits **before** any paid submission. On restart, accepted IDs resume the same training/generation polling; completed stored views are read/reused. Lost submission response or lost receipt persistence leaves intent and stops for reconciliation. Although generation sends a stable Idempotency-Key, the implementation conservatively does not auto-replay unknown receipts; custom-reference training has no documented equivalent guarantee. Never start a new job to bypass an uncertain operation.

Polling starts after 2–3 seconds and backs off to 10 seconds; transient status network/5xx reads back off to 60 seconds. Persist poll schedule/count, cap at 240 reads/30 minutes per operation, keep worker heartbeat/cancellation active. A timeout stops for review; it does not assert provider failure. Lease expiry/graceful shutdown can requeue known requests within the existing three-claim budget; unknown intents/terminal failures cannot resume automatically. Failure preserves previous assets. Explicit `--retry JOB_UUID` permits known pre-submit config/storage failures, definite auth/rate rejections or storage/composition repair; polling an existing request adds no generation. Exhaustion and ambiguous outcomes need operator reconciliation; no override/reset tool is added.

Real append-only events include Preparing character, Creating wardrobe, Generating character views, Building character sheet, Saving character reference and Character ready. Repeated polling does not flood events. The existing Studio safe status reports Character ready at the Product pause, with no percentages or layout redesign. Full asset-preview/progress UI remains later work.

## Manual setup and acceptance

1. Verify 035–040; user confirms 039 applied. Apply **041 manually**, in full, after 040. Do not reapply older migrations or mutate snapshots/history. Named v3 snapshots are required; nameless historical v2 requests are not silently renamed or reanalyzed and cannot continue through M5.
2. Configure private variables above and existing analysis/storage variables; restart stale processes. Keep Render/Inngest guards enabled. Nothing starts automatically.
3. For a new named job, manually Prepare generation then **npm run worker:ugc**. Validation → both saved OpenAI analyses → character_reference continues under the same claim.
4. An existing named v3 M4 pause resumes only with **npm run worker:ugc -- --resume-character JOB_UUID**. This schedules that exact paused job then starts the same queue consumer, which can consume other runnable work too. Existing `--resume-analysis` and controlled `--retry` remain.
5. Manually verify private storage and owner isolation, view identity/wardrobe/background, final sheet, partial-success reuse, restart/lease/cancellation, unknown intents, rate/auth/provider failures, missing/corrupt/oversized outputs, R2/composition failures and no credit changes. No automatic calls/tests of these paths were made.

Success atomically commits completed sheet + Character ready event + **queued / product_reference / PRODUCT_REFERENCE_NOT_IMPLEMENTED**, releases the claim and excludes the row from runnable claims. It is neither completed video nor cost confirmation. No Product handler/resume/bypass exists. Render/Inngest guards/configuration stay intact; laptop `worker:ugc` is the only executor. **Stop after Milestone 5. Next: Milestone 6 — Product / Prop Reference Sheet generation.**
