# Render media-preparation worker

This packages the accepted `scripts/media-preparation-worker.ts` and existing `lib/media-preparation/processor.ts`. It does not run Next.js, Gemini, fal, voice or final rendering. No automatic deployment, account access, database migration or secret-file change is performed.

## Manual setup

1. Make this revision available in the repository/branch you connect to Render. Create **New → Web Service**, connect that repository, select **Docker** runtime and the intended branch. Use repository root `.` as the build context; leave Root Directory unset.
2. Set **Dockerfile Path** to `workers/media-preparation/Dockerfile`. Leave **Docker Command** empty so the image CMD starts the existing worker. Do not enter a Next.js build/start command or pre-deploy migration command.
3. For predictable always-on production, consider a paid instance. The optional Blueprint selects **Standard**, one instance, as an initial resource choice, not a measured capacity guarantee. The current manual deployment uses **Free** (reported 0.1 CPU/512 MiB, possible spin-down, no Shell/SSH) by user choice. Allow cold-start health warmup before acceptance; do not classify normal startup latency as processing failure or automatically require an upgrade. The actual five-second 640×360/24fps preparation succeeds there in about 13 seconds. This does not establish capacity for maximum inputs, concurrency or unattended cold starts. Keep one instance initially and monitor available memory/timeouts and the oldest pending preparation. Select the region nearest the existing Supabase/R2 services.
4. Set **Health Check Path** to `/health`. Disable automatic deploys. Supply the server environment variables below, then manually deploy.
5. Allow **300 seconds graceful shutdown**. Optional `render.yaml` sets `maxShutdownDelaySeconds: 300`; import it manually as a Blueprint if preferred. For a dashboard-created service, set this field through Render's Update Service API (or dashboard if exposed). Render documents Blueprint/API configuration for this setting. Do this before processing real jobs.
6. Confirm `GET https://<your-render-host>/health` returns `200 {"ok":true}` and unsigned `POST /prepare` returns `401`. The health response contains process liveness only; it does not query private database/storage or expose their configuration.
7. Add `MEDIA_WORKER_URL=https://<your-render-host>` and the identical `WORKER_SHARED_SECRET` to the appropriate **Vercel server environment**, then redeploy Vercel and resync/verify the existing `/api/inngest` functions in Inngest Cloud. Leave `INNGEST_DEV` absent in production. Never use a browser/public variable for either worker setting.

Render supplies `PORT`; do not hardcode or manually override it. The worker binds `0.0.0.0:$PORT` in the image. The image starts `node --conditions=react-server --import=tsx scripts/media-preparation-worker.ts` through `tini`, as the non-root `node` user. It installs lockfile production dependencies and system FFmpeg/FFprobe on Node 22 LTS/Debian Trixie. No web build, dev static binaries or `.env` files enter the image. The root Docker allowlist excludes local credentials, Git and build artifacts. Rebuild for runtime/OS security updates; update Node before its supported lifecycle ends.

## Exact environment variables

All worker credentials below are **server-only**. Use the same trusted development/production resources as the orchestrator; do not mix databases or buckets.

| Render variable | Required value/source |
| --- | --- |
| `WORKER_SHARED_SECRET` | New cryptographically random shared value, at least 32 characters, without leading/trailing whitespace. Generate locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; paste privately into Render and Vercel. |
| `SUPABASE_URL` | Existing HTTPS Supabase project origin. |
| `SUPABASE_SECRET_KEY` | Existing privileged server key (`sb_secret_…`). Alternatively set **only** existing `SUPABASE_SERVICE_ROLE_KEY` with a service-role JWT. The Blueprint prompts for the preferred secret-key name. |
| `R2_ACCOUNT_ID` | Existing private-storage account ID. |
| `R2_ACCESS_KEY_ID` | Existing scoped object-storage access key ID. |
| `R2_SECRET_ACCESS_KEY` | Existing object-storage secret access key. |
| `R2_BUCKET_NAME` | Existing private bucket. Keep public R2 access disabled. |
| `PORT` | Injected automatically by Render. |
| `NODE_ENV` | Image default: `production`. |
| `FFMPEG_PATH` | Image default: `/usr/bin/ffmpeg`. |
| `FFPROBE_PATH` | Image default: `/usr/bin/ffprobe`. |
| `MEDIA_PREPARATION_WORKER_HOST` | Image default: `0.0.0.0`. |

No Clerk, Inngest, Gemini or fal credentials are required on Render. No `MEDIA_WORKER_URL` is required there. Writable ephemeral `/tmp` is sufficient; do not attach a persistent disk for media. Originals/derivatives stay in private R2. Scratch directories are removed in the existing processor's `finally`; container replacement discards files after hard crashes. `MEDIA_PREPARATION_WORKER_PORT` remains an optional **local-only** fallback (3012); Render's `PORT` takes precedence. No new product quotas or retention policy are added.

| Vercel variable | Requirement |
| --- | --- |
| `MEDIA_WORKER_URL` | New worker HTTPS **origin**, no `/prepare`, query, credentials or fragment. |
| `WORKER_SHARED_SECRET` | Identical private value to Render. |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | Retain existing server database configuration. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Retain existing private storage configuration. |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Retain existing Cloud dispatch/execution configuration; `INNGEST_SIGNING_KEY_FALLBACK` is optional during rotation. |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Existing analysis configuration; model override is optional. |
| `FAL_KEY` | Existing active visual-provider credential. Retain any intentionally configured existing fal safeguards/models. |
| `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Existing application identity configuration; only the publishable key belongs in the browser. |

Only the first two Vercel variables are new for this unit. `MEDIA_PREPARATION_WORKER_URL` and `MEDIA_PREPARATION_WORKER_TOKEN` are replaced: remove them after switching both services. There is **no legacy bearer-token fallback**. Existing optional pricing/upload/provider settings are unchanged. Never share the shared secret or privileged database/R2 credentials in public variables, source, chat, screenshots or logs.

## Request and retry contract

The existing durable `prepare-source-<scene order>` step calls the server-only client. It sends exactly `{"generationJobId":"<uuid>","sceneExecutionId":"<uuid>"}` to `POST /prepare`. Every retry creates a fresh timestamp, random UUIDv4 nonce and signature over those same identifiers. No owner, run claim, source key, R2 credentials, URL, cut timing or arbitrary instructions cross this boundary.

Headers: `Content-Type: application/json`, `x-worker-timestamp: <Unix milliseconds>`, `x-worker-nonce: <lowercase UUIDv4>`, `x-worker-signature: <lowercase 64-character hex HMAC-SHA256>`. The signed bytes are UTF-8 `METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + NONCE + "\n"` followed by the **exact body bytes**, with no extra newline. Method/path are `POST` and `/prepare`. The worker checks a ±5-minute timestamp window and uses equal-length, timing-safe signature comparison before parsing/processing. Use synchronized platform clocks. Production clients require HTTPS and refuse redirects. Browser Origin/Fetch-Site requests and CORS preflight are denied; Clerk cookies are never worker authority.

After authentication the worker loads `visual_run_id` from Supabase, then calls the existing preparation loader/processor, which independently checks the active generating job, owned project, live reserved entitlement, matching owned scene/immutable plan and admitted verified source. Cross-owner identifiers and terminal/unclaimed/wrong-stage state cannot start processing. Invalid auth returns 401; invalid signed contract returns 400 (oversized: 413); denied persisted context returns 403; capacity/transient failures return 503. Error bodies contain safe codes only.

Before processing, the worker atomically registers the authenticated nonce through Supabase `register_media_worker_request`. A reused nonce returns 409 `REPLAY_DETECTED`; registry outage returns a safe 503 and performs no processing. The nonce remains consumed even if processing fails or the response is lost. The database primary key protects concurrent requests across instances and restarts. Browser roles cannot call the RPC; no role has direct nonce-table grants. Eleven-minute retention exceeds the maximum ten-minute remaining request lifetime, and database-clock expiry is checked again before registration. Valid traffic removes up to 1,000 expired rows per call; idle leftovers cannot grow without traffic. There is no process-memory fallback or extra service.

Existing canonical milliseconds, FFprobe source bounds, normalization, private conditional R2 writes, five-minute lease, three-attempt bound, immutable completed cache and filesystem cleanup are unchanged. Inngest saves successful durable steps; on a lost HTTP/completion response its newly signed retry enters the same persistent preparation state. A completed cache returns ready without another download/encode/upload. An active lease returns busy; retries retain the existing hold. A persisted paid provider task is never purchased again. Authentication replay rejection and preparation/provider idempotency are independently enforced.

Two concurrent requests per instance, a 4 KiB body bound, 10-second body/header deadlines and existing processing limits remain. The client deadline is 240 seconds; Inngest's handler allows 300. SIGTERM/SIGINT stops new traffic, waits for active requests and permits existing cleanup. Force termination at 290 seconds bounds shutdown; Render should allow 300. Abrupt termination can leave the existing lease pending until expiration; exhausted/ambiguous attempts still require operational reconciliation and never automatic repurchase.

## Local verification and manual deployment acceptance

### Nonce-protection rollout — manual, pending

1. Apply [migration 013](../supabase/migrations/20261012001300_media_worker_replay_protection.sql) in the existing Supabase project's SQL Editor. Keep applied migrations 001–012 unchanged. This workspace has no DDL connection or Supabase Management API access; the server Data API cannot execute arbitrary migration SQL.
2. Make this revision available on the connected branch and manually deploy the existing Render service with `workers/media-preparation/Dockerfile`, root build context, empty Docker Command and `/health`. Keep the Free plan and existing server-only variables. The image includes the new registry module automatically; no new secret, shell, SSH, scheduler or Redis is needed.
3. Redeploy Vercel Production from the same revision. Keep `MEDIA_WORKER_URL=https://sceenyk-media-worker.onrender.com` and the matching `WORKER_SHARED_SECRET`; `INNGEST_DEV` stays absent. Both services must use the new nonce signature protocol. During a mixed-version rollout signatures are refused; complete both deployments before starting acceptance/admitting new test work. Existing durable retries use fresh nonces after the rollout.
4. Warm `/health`, allowing Free cold-start delay. Run the existing acceptance harness with a **new** artifact `--run=nonce-protected` and `--worker-url=https://sceenyk-media-worker.onrender.com`. Start with `preflight`; it verifies unsigned/invalid/expired/body/nonce tampering, one fresh acceptance, immediate and later 409 `REPLAY_DETECTED`, simultaneous exact duplicates yielding one acceptance, and a fresh-nonce persisted-preparation retry. It only reuses existing acceptance media and submits no fal task. It stops at the first failed assertion.
5. Only after preflight succeeds, use one guarded short cloud run: `launch --real --fresh-owner`, then `monitor`, `proof`, `duplicate`, `verify`, and `secrets`, passing that same run/worker URL to every mode. Admission is persisted in the artifact and repeated launch cannot create another job. This verifies the unchanged actual Vercel → Inngest Cloud → Render Free → private R2 → Supabase → fal → private output path, persistent preparation/provider reuse, held reservation, browser reopen/closure and ownership/secrecy. Existing per-scene/job fal spending guards remain active. Preserve both earlier run artifacts; do not reset paid work or old attempts.
6. For deployment/restart persistence, capture one valid nonce request and retry the identical bytes after a normal worker restart or later cold start while its timestamp remains valid; expect 409. Once its timestamp expires, expect 401. A manual restart is optional for the first acceptance; local disk-backed database reopen plus separate worker-instance tests establish persistence independently of process memory. Hosted parallel-request rejection is required before completion. No Render shell evidence is required.

Example preflight command (no paid submission):

```powershell
node scripts/check-deployed-preparation.mjs preflight --run=nonce-protected --worker-url=https://sceenyk-media-worker.onrender.com
```

**Status: In Progress.** The updated protocol/migration are locally verified, but have not been applied/deployed by this agent. Do not mark the deployment/security unit Complete until deployed replay checks and the short real cloud continuation succeed. Historical acceptance below used the previous protocol.

For the authorized fresh continuation, pass `--run=fal-key-restored` to **every** harness mode. It selects a separate nonsecret OS-temp artifact and preserves the first failed run. Only the initial `launch --real --fresh-owner` creates a reserved development identity and performs quote/admission; repeated launch reuses its persisted job. Do not choose another run name or new identity simply to retry paid work. `monitor` records safe task/status/attempt observations; `proof` checks task reuse across durable polls, one owned private output, no final receipt and held free allowance. The successful continuation used `preflight`, one launch, `monitor`, `proof`, `duplicate`, `verify` and `secrets` sequentially against the dedicated worker URL. See the tracker for IDs, 66 live assertions, secrecy limits and the remaining replay finding.

The first 2026-10-12 Cloud attempt completed Render preparation but failed fal submission; its discarded historical HTTP response cannot be recovered. The user subsequently found missing Vercel Production `FAL_KEY`, added the funded key and redeployed. One fresh actual Cloud test now succeeds through Render Free preparation, persisted fal task, nine durable polls, private generated R2 output and Supabase `visuals_ready`, with the browser closed. Duplicate delivery, refresh/reopen, cross-user denial and held reservation pass. No Render change or paid upgrade was necessary for the short workload. The original failed job/reservation/evidence remains intact. Overall deployment still retains the recorded strict fresh-replay gap; do not mark it Complete until resolved. The server-only `fal_http_rejected` logger is available for future failures (safe status/category/validation fields, never raw errors, keys, prompts or private URLs). Share only its sanitized event if needed. `node scripts/inspect-fal-submission.mjs` independently checks the original fixture's SDK request against the official OpenAPI, private media read and previous task GET; it sends no paid request and cannot substitute for the successful actual Cloud acceptance.

Run `npm run test:worker-auth`, `npm run test:preparation`, `npm run test:visuals`, existing generation/dispatch/accounting/pricing/analysis regressions, lint, TypeScript, build and `npm run test:client-secrets`. Authentication tests use the real HTTP boundary; ownership/client tests use explicit database/transport fixtures; existing visual tests exercise actual migrations in isolated PostgreSQL. Neither replaces real deployed account/Cloud acceptance.

When Docker's Linux engine is available:

```sh
docker build -f workers/media-preparation/Dockerfile -t sceenyk-media-worker .
docker run --rm --name sceenyk-media-worker -p 3012:10000 -e PORT=10000 --env-file /absolute/path/to/private-worker.env sceenyk-media-worker
curl --fail http://127.0.0.1:3012/health
curl -i -X POST http://127.0.0.1:3012/prepare
docker exec sceenyk-media-worker ffmpeg -version
docker exec sceenyk-media-worker ffprobe -version
```

Keep the private environment file outside version control/build context and include only the seven required credential names above. These commands do not require a paid provider. For local native development only, run `npm run worker:media` with `WORKER_SHARED_SECRET` and existing Supabase/R2 credentials; set the orchestrator's `MEDIA_WORKER_URL=http://127.0.0.1:3012` in a non-production environment. Production never accepts HTTP, even on loopback.

After manual deployment, verify one authorized owned generation through actual Vercel → Inngest Cloud → Render → private R2 → Supabase → fal. Inspect the same preparation row/range/output and request ID after a retry/duplicate, verify source/plan/reservation unchanged, temporary cleanup, owner read and User B denial, and recheck unsigned/invalid/expired/modified-body rejection against the HTTPS endpoint. A healthy worker alone is not proof of that workflow. Do not claim hosted acceptance until observed. No later stage begins here.

The resumable `scripts/check-deployed-preparation.mjs` acceptance harness reads the existing reserved development-identity/synthetic-source fixtures from the local OS temporary directory. It must be run by an authorized operator with existing server-only local credentials; it is not a public service or an unattended CI test. `browser-preflight` verifies deployed Clerk access without admitting a job. Run `preflight --worker-url=https://<actual-worker-origin>` before `launch --real --worker-url=https://<actual-worker-origin>`; only launch authorizes an actual quote confirmation and provider work. Subsequent modes are `monitor`, `proof`, `duplicate`, `verify`, `secrets` and read-only `inspect`, with the same worker override. `proof --allow-pending` and `verify --allow-pending` verify available preparation/security evidence after a recorded provider rejection; they explicitly retain the incomplete fal outcome and cannot count as full acceptance. Run modes sequentially because they share one artifact. The nonsecret `sceenyk-render-cloud-acceptance.json` artifact retains stable request/job/run IDs for resume; keep it instead of re-admitting a job. Unexecuted modes are not acceptance evidence. Fresh in-window signed repeats are tested separately from expiration and recorded as a finding if accepted. Shell/SSH is not required on Free: successful awaited HTTP/durable preparation plus the processor's awaited `finally` and automated real-filesystem success/failure checks establish the available cleanup evidence. This does not claim direct Render filesystem inspection or hard-crash cleanup. Where Shell is available, optional before/after counts use `find /tmp -maxdepth 1 -type d -name 'sceenyk-segment-*' | wc -l`.

Render setup follows its official [Docker](https://render.com/docs/docker), [web service](https://render.com/docs/web-services), [health check](https://render.com/docs/health-checks), [Blueprint](https://render.com/docs/blueprint-spec) and [graceful shutdown](https://render.com/docs/deploys#graceful-shutdown) documentation. Node 22 is a supported LTS line per the [Node release schedule](https://github.com/nodejs/Release).
