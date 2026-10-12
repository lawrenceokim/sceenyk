# Render media-preparation worker

This packages the accepted `scripts/media-preparation-worker.ts` and existing `lib/media-preparation/processor.ts`. It does not run Next.js, Gemini, fal, voice or final rendering. No automatic deployment, account access, database migration or secret-file change is performed.

## Manual setup

1. Make this revision available in the repository/branch you connect to Render. Create **New → Web Service**, connect that repository, select **Docker** runtime and the intended branch. Use repository root `.` as the build context; leave Root Directory unset.
2. Set **Dockerfile Path** to `workers/media-preparation/Dockerfile`. Leave **Docker Command** empty so the image CMD starts the existing worker. Do not enter a Next.js build/start command or pre-deploy migration command.
3. Select a paid, always-on instance. The optional Blueprint selects **Standard**, one instance, as an initial resource choice, not a measured capacity guarantee. Keep one instance initially and monitor memory, scratch space, timeouts and the oldest pending preparation. Select the region nearest the existing Supabase/R2 services. Free sleeping instances are unsuitable for the bounded workflow request.
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

The existing durable `prepare-source-<scene order>` step calls the server-only client. It sends exactly `{"generationJobId":"<uuid>","sceneExecutionId":"<uuid>"}` to `POST /prepare`. Every retry creates a fresh timestamp/signature over those same identifiers. No owner, run claim, source key, R2 credentials, URL, cut timing or arbitrary instructions cross this boundary.

Headers: `Content-Type: application/json`, `x-worker-timestamp: <Unix milliseconds>`, `x-worker-signature: <lowercase 64-character hex HMAC-SHA256>`. The signed bytes are UTF-8 `METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n"` followed by the **exact body bytes**, with no extra newline. Method/path are `POST` and `/prepare`. The worker checks a ±5-minute timestamp window and uses equal-length, timing-safe signature comparison before parsing/processing. Use synchronized platform clocks. Production clients require HTTPS and refuse redirects. Browser Origin/Fetch-Site requests and CORS preflight are denied; Clerk cookies are never worker authority.

After authentication the worker loads `visual_run_id` from Supabase, then calls the existing preparation loader/processor, which independently checks the active generating job, owned project, live reserved entitlement, matching owned scene/immutable plan and admitted verified source. Cross-owner identifiers and terminal/unclaimed/wrong-stage state cannot start processing. Invalid auth returns 401; invalid signed contract returns 400 (oversized: 413); denied persisted context returns 403; capacity/transient failures return 503. Error bodies contain safe codes only.

Existing canonical milliseconds, FFprobe source bounds, normalization, private conditional R2 writes, five-minute lease, three-attempt bound, immutable completed cache and filesystem cleanup are unchanged. Inngest saves successful durable steps; on a lost HTTP/completion response its retry enters the same persistent state. A completed cache returns ready without another download/encode/upload. An active lease returns busy; retries retain the existing hold. A persisted paid provider task is never purchased again. HMAC is origin authentication, not an independent once-only execution mechanism: authenticated replays within the window are handled by these database guarantees.

Two concurrent requests per instance, a 4 KiB body bound, 10-second body/header deadlines and existing processing limits remain. The client deadline is 240 seconds; Inngest's handler allows 300. SIGTERM/SIGINT stops new traffic, waits for active requests and permits existing cleanup. Force termination at 290 seconds bounds shutdown; Render should allow 300. Abrupt termination can leave the existing lease pending until expiration; exhausted/ambiguous attempts still require operational reconciliation and never automatic repurchase.

## Local verification and manual deployment acceptance

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

Render setup follows its official [Docker](https://render.com/docs/docker), [web service](https://render.com/docs/web-services), [health check](https://render.com/docs/health-checks), [Blueprint](https://render.com/docs/blueprint-spec) and [graceful shutdown](https://render.com/docs/deploys#graceful-shutdown) documentation. Node 22 is a supported LTS line per the [Node release schedule](https://github.com/nodejs/Release).
