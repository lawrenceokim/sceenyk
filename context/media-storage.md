# Private project media

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
