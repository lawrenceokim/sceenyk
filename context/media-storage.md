# Private project media

## Milestone 6 — Product / Prop Reference Sheet (2026-10-24)

**Milestone 5 — Complete. Milestone 5.5 — Complete. Milestone 6 — Complete in source; manual migration/provider/runtime/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This section supersedes earlier M6-not-started stop points below. See [Product Sheet contract and manual setup](product-sheet.md).

All original/generated Product images, analysis and sheets stay private. Canonical job/sheet-scoped immutable R2 PNGs retain UUID/type/ETag/SHA256/size/dimensions in PostgreSQL metadata. Each edit uses conditionally verified original bytes; three valid views compose on neutral gray without embedded names. Product references and keys never enter Templates or safe progress DTOs.

Pipeline: Input → OpenAI Reference Analysis → Character Reference Sheet → Product / Prop Reference Sheet → Location Reference → Structured ChatGPT Storyboard → Generation Package → Final Video → Studio Preview. Existing cost-review/accounting gates remain; no user credits are deducted. Manual setup: pending 044 then new 045; OPENAI_PRODUCT_SHEET_MODEL=gpt-image-2.5-sunburst and explicit UGC_PRODUCT_SHEET_ENABLED=1 with existing OPENAI_API_KEY. Keep Render/Inngest disabled. No providers, worker/jobs, private media, remote SQL, browser/screenshot suites, build or deployment executed. Stop after M6.



## Milestone 5 — Character Sheet (2026-10-23)

**Complete in source; manual migration/provider/runtime/visual acceptance pending. Exact next: Milestone 6 — Product / Prop Reference Sheet generation. Not started.** [Character Sheet contract and manual setup](character-sheet.md) supersedes older M5-not-started/OpenAI-Character-image assumptions below; historical evidence remains intact.

Original Character input stays private and owner/project/role/fingerprint checked. Higgsfield receives only an ephemeral five-minute server-signed source URL after a conditional ETag-checked read, never persisted or returned to browsers. Front/back/face/sheet PNGs use private immutable job/sheet-scoped R2 keys. Strict descriptors retain individual asset UUID/type/ETag/SHA256/size/dimensions. PostgreSQL holds metadata only. Canonical gray sheet is server-composed without embedded names/IDs or decoration. No template transfer/public URLs.

Approved full flow: Input → validation → OpenAI analysis → SOUL2 Character Sheet → Product Sheet → one primary Location → structured ChatGPT storyboard/script + stable voice specification → generation package → cost review/confirmation → final video → finalization → Studio Preview. No later stage is implemented. User confirms 039 applied; verify/apply 040 then new 041 manually. Render/Inngest remain disabled; only user-started local worker execution. Codex made no provider calls, ran no jobs/worker, applied no hosted SQL and deployed nothing. Offline in-memory schema validation is separate from manual runtime acceptance.

## Project reference labels - before Milestone 5 (2026-10-23)

Private reference names live only in project_assets.reference_name and immutable generation snapshots, separate from original_filename, storage_key, object names and read authorization. Owned media DTOs expose the label only through existing private project reads. Explicit removal clears the active row label via manual migration 040's trigger, detaches the source and retains bytes/history; replacement uses a new asset with an empty name. Old frozen jobs retain their original labels. Names do not enter public template projections; adopters provide their own source images and names. [reference-name contract and setup](ugc-v1-workflow.md#project-specific-reference-names--prerequisite-before-milestone-5). No storage/provider call or media deletion/rename was performed.

## UGC Milestone 4 - private analysis inputs (2026-10-23)

**Milestone 4 — Complete in source; manual migration/provider/runtime acceptance pending. Exact next: Milestone 5 — Character Reference Sheet generation. Not Started.** [Reference media loader](../lib/reference-analysis/media.ts) re-resolves exact frozen role/owner/project/upload/ETag/size/MIME metadata and uses existing conditional private R2 streaming. Bounded bytes are decoded with existing Sharp, oriented, stripped of metadata, resized inside 2048×2048 and sent as ephemeral PNG data content to OpenAI. No public/signed URL, upload, stored derivative or sheet is created; originals remain private/unchanged. Source 100 MiB, decode 40-million-pixel and output 20-MiB safeguards bound resource use; unsupported/multipage/animated inputs fail safely.

Only validated schema-v1 observations and safe usage/provenance live in the new private table, with no bytes, storage keys, descriptions in logs or raw response bodies. Completed roles are not decoded/submitted again; deterministic validation can still inspect their private metadata/header. Details: [provider/schema/privacy/setup contract](reference-analysis.md). Codex made no R2/provider request; runtime acceptance remains manual.

## UGC readiness checks — Milestone 3 (2026-10-23)

The [central UGC validator](../lib/ugc-jobs/validation.ts) resolves only owned/project-bound active reference records and requires exactly one uploaded, verified supported image per role. It reuses private `verifyStoredMedia` for object existence, bounded signature header, MIME/length and exact ETag; these are deterministic reads, not provider analysis/full decoding/moderation. Keys/URLs/header bytes stay server-side. Readiness returns safe issues only; the private immutable job snapshot stores asset/reference IDs and verification metadata, never raw keys/binaries.

Worker validation rechecks frozen reference IDs/roles and current storage rather than substituting later draft media. Missing/detached/replaced/unverified media blocks/fails validation safely. Adopted UGC Templates use adopter-owned Project assets; creator files/configuration IDs cannot satisfy these queries. Migration 037 race-checks referenced rows before enqueue and validation checkpoint; R2 is not in the SQL transaction, so normal conditional object immutability plus worker/provider-stage rechecks remain required. Existing private R2 runtime configuration is needed; Codex performed no storage requests, uploads/deletion or provider calls. Manual acceptance pending.

## Full UGC V1 private assets and template projection (2026-10-23)

The [UGC V1 contract](ugc-v1-workflow.md#persistence-jobs-and-resume) requires original Character upload, original Product / Prop upload, generated Character Reference Sheet, generated Product Reference Sheet, final video and large intermediates in existing private R2/object storage. PostgreSQL stores structured descriptions/storyboard/package/settings plus ownership, project/generation relationships, durable asset IDs/keys server-side, verification/MIME/type metadata, status, timestamps and safe errors; never large binary/base64 media or expiring signed URLs as canonical references. No schema/storage migration or asset generation occurs here.

Each private access remains server-authorized by owner/project; workers reload persisted relationships and narrowly scoped access. Raw R2 keys, provider internals and private links are excluded from client/public projections. Sheets preserve consistency without claiming factual unseen traits or perfect 3D reconstruction; retain observed/generated provenance.

Templates reuse reviewed configuration/storyboard via logical Character/Product slot IDs, with future explicit required counts 1/1. Never publish/copy creator uploads, sheets, private asset IDs or keys into adoption. Adopters supply their own references and generate their own private derived assets. Keep the existing separately reviewed public preview derivative and immutable snapshot rules. Current contract is documentation Complete; UGC pipeline Not Started, with user manual acceptance only.

## UGC V1 role capacity (2026-10-22)

Each project may acquire at most one active Character image and one active Product / Prop image. Local selections plus pending/uploaded/rejected rows occupy the role until explicitly removed. Existing project-first/private R2 upload/signature/read/ownership paths remain. Role-specific client/service validation and migration 035 prevent second references, including concurrent inserts/reactivation; retries of the same existing upload remain supported. Old extras are retained without backfill/deletion, stay removable, and block UGC save/generation readiness until reduced. Removing a reference re-enables replacement. UGC template adopters provide their own references; no creator private source copying. Freestyle uploads remain unrestricted by this rule. Migration status and verification limits are in the tracker.

## Studio reference roles (2026-10-20)

Migration 032 adds role/group/removal metadata to existing project_assets; the private R2 bucket/keys, authorization, direct upload, signature verification and signed reads remain the same. UGC Characters and Product / Props accept supported images only and upload sequentially after sign-in. One image represents one reference; stable reference_id permits future multiple-image grouping. Freestyle preserves the existing manual Project Media upload path and default role. Both sets remain stored across Creation Type switches. A new owner/project-filtered action detaches only the requested UGC image through removed_from_draft, including pending/rejected uploads, without deleting bytes or breaking historical links. Draft controls and project preview selection exclude detached references. Apply migration 032 before using the revision; hosted application/acceptance remains pending in the tracker. No new environment variables/storage or cleanup policy.

Cloudflare R2 is the implemented object-storage provider for this unit; Supabase PostgreSQL stores metadata only. Live browser/hosted-Supabase/R2 development acceptance now passes; production deployment and full administrative audits remain separate. Read the current acceptance status in [progress-tracker.md](progress-tracker.md).

## Development setup

1. Apply the existing identity and projects migrations if not already applied, then `supabase/migrations/20261009000300_project_assets.sql` in the same development Supabase project. Do not rerun an applied migration or rewrite it. The new migration is transactional and refuses an existing asset relation for inspection.
2. Create a private R2 development bucket. Keep r2.dev access and public custom-domain access disabled. Create an Object Read & Write API credential scoped to this bucket. Put `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` into ignored `.env.local`; restart the application. No `NEXT_PUBLIC_` R2 variables, credentials in chat or committed values.
3. Configure bucket CORS for actual application origins. This example is for the standard local dev server only; replace it with the exact origin/port used for testing or deployment:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "If-None-Match", "Range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 300
  }
]
```

Browser File uploads compute Content-Length automatically. Signing binds the expected byte count; JavaScript does not set that forbidden header. CORS controls browser access and does not substitute for authentication or signatures. Signed URLs use the R2 S3 endpoint, not a public delivery domain. See Cloudflare's [presigned URL guide](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [CORS guide](https://developers.cloudflare.com/r2/buckets/cors/) and [S3 conditional-operation support](https://developers.cloudflare.com/r2/api/s3/api/).

## Diagnosing a blocked browser PUT

Observe Network with Preserve log enabled. Selection alone is local; choose **Upload to project** (or **Retry upload** while the File remains selected). Authorization must return an upload URL, then XHR sends the actual File. A pending Supabase row only records preparation. **Check upload** verifies an existing object and cannot reconstruct missing File bytes after a reload.

For the conditional PUT, preflight must accept both `content-type` and `if-none-match` for the exact application origin. On 2026-10-10 the live bucket accepted `Content-Type` alone but rejected the combined headers with OPTIONS 403; Chrome blocked the transfer and the bucket stayed empty. Keep the conditional header and correct bucket CORS. Do not remove overwrite protection or disable browser CORS. Object-scoped credentials can upload/list objects while lacking bucket-CORS administration access.

Temporary development transfer diagnostics emitted fixed stage/status only and were removed after verification. They never printed URLs, headers, response bodies or File contents. Browser status zero cannot distinguish a network outage from CORS; inspect the preflight. An HTTP response, timeout and interruption have separate retry feedback. Finalization still requires storage HEAD, size/type/signature verification and a verified ETag.

## Formats and temporary safeguard

Canonical upload formats are PNG, JPEG, WebP, GIF, AVIF, BMP, HEIC/HEIF; MP4, WebM, QuickTime, Ogg video; MPEG audio, WAV, MP4 audio, Ogg audio, AAC, FLAC and WebM audio. Common WAV/M4A/M4V/FLAC aliases and MIME parameters normalize centrally. Unknown/empty MIME types and SVG are rejected for permanent upload; existing advisory local previews remain available. Browser codec/preview support varies. File signatures are checked from a bounded 8192-byte storage header; this identifies containers, not complete decoding, track layout or malware/moderation safety. In particular WebM signatures cannot establish that a browser-declared audio file has no video track. No duration or dimensions are asserted.

Product limits are unresolved. `MEDIA_MAX_UPLOAD_BYTES` optionally configures a **temporary technical single-PUT safeguard**, default 104857600 bytes (100 MiB). It must be a positive safe integer no greater than the provider's [single-PUT 5 GiB ceiling](https://developers.cloudflare.com/r2/objects/upload-objects/). These are development mechanics, not a commercial tier/entitlement policy. Multipart/resume and production quotas are later work.

## State and access

Local selection → preparing/saving owned project → pending metadata/authorized PUT → direct XHR transfer/progress → server verification → uploaded metadata/private source preview. UI failure is explicit; transient failures leave pending metadata, invalid content becomes rejected. Retry reuses the local request UUID. Completed PUT with lost response can finalize on retry; conditional If-None-Match `*` prevents replacing an object. An interrupted pending upload can be checked after reopen; absent bytes require reselecting the file. Reselecting is a new intentional upload, not a deduplication guarantee across refreshes.

The user confirmed public r2.dev/custom-domain access is disabled; unsigned S3 access and exact-origin CORS were verified live. Owner identity comes only from the verified Clerk request and `ensureAppUser`. Services query owned projects and owned assets, and the database enforces consistent owner/project FKs. Browser database roles have no grants/policies; privileged server access still requires these filters. Upload URLs expire after five minutes; read URLs after fifteen. Read URLs are bearer capabilities and can be shared by their owner until expiration. New requests from another account cannot authorize, list, finalize or retrieve private assets. Reverify bucket privacy/CORS for each deployment.

Original filenames are metadata; all storage-path segments are server UUIDs. No blobs/base64, filesystem paths or signed links are persisted in PostgreSQL. Private workspace state is keyed by account/project. Active local previews own/revoke object URLs; uploaded previews request fresh server-authorized URLs. Expired previews provide Refresh preview. Full uploaded-asset deletion is deliberately deferred; failed/pending/rejected metadata and objects remain until a later ownership-checked cleanup/retention unit.

## Required live acceptance

Use reserved Clerk development users A and B: upload real image/video/audio into owned projects, observe actual progress/failure/retry, refresh/reopen and preview multiple assets. B must be denied A's authorize/list/finalize/read operations and must upload into B's own project. Verify expired URLs, changed signed headers/key/size and replay overwrite refusal at R2, unsigned private-object denial, configured CORS, desktop/mobile and both themes. Lint/TypeScript/build and isolated SDK/SQL checks supplement these; they do not replace live storage checks. No AI, jobs, credits or payment integration belongs to this unit.
