# Windows laptop Docker workers

Prepared 2026-11-12. Activation, remote migrations and connected/manual acceptance are left to the owner. Nothing in this setup changes the Vercel deployment or starts Inngest. Do not run paid generations merely to validate configuration.

## Existing architecture and reuse

| Service | Docker execution | Preserved authority |
| --- | --- | --- |
| UGC | Existing V3 discovery, `runV3Task`, OpenAI/Higgsfield adapters, reference/package/video/delete recovery. One task per cycle, five-second idle polling. | Owned project reads, immutable provider intent, SQL task leases, finite approvals, current-package checks, real-funded exposure caps and once-only credit ledgers. |
| Media | Existing V3 `join`/FFmpeg merging plus `processProjectVideoPreview` for private three-second derivatives. | Approved ordered input manifests, currentness, hashes, private R2 publication/readback, preview leases and immutable output keys. |
| Payout | Existing `creator_payout_candidates` and `processWithdrawal`, sequentially, hourly. | Seven-day request-based hold, $5 minimum, backing-payment/refund verification, deficit checks, frozen destination/amount, atomic claim and verified provider-item success. |

The existing `worker:media` command still hosts its signed HTTP preparation/narration/render boundary and preview loop. The Docker Media worker polls Supabase directly and does not start that HTTP server, Remotion, or Chromium. Historical UGC lanes remain available through the existing local command; Docker handles the current V3 pipeline. No new provider, queue broker or payment implementation is introduced.

Migration **113**, [laptop worker lanes](../supabase/migrations/20261112011300_laptop_worker_lanes.sql), adds a service-role-only claim RPC. It partitions existing task kinds into `join` for Media and other kinds for UGC while retaining the existing lease and submission gates. Disabled OpenAI prevents claims for new unsent OpenAI tasks. Existing web/local claim functions, tables, RLS, accounting, payout logic and application behavior are unchanged. The migration is transactional and rerunnable. Apply it manually only after the existing prerequisites through **112** are installed; it has not been applied remotely by this task.

The trusted payout processor now lives in `lib/marketplace/withdrawals/processor.ts` so standalone workers do not import request-bound Clerk/Next navigation code. `withdrawals/server.ts` re-exports its existing public functions; processor function bodies, authenticated account actions and payment/recovery behavior are preserved.

## Resource and security configuration

- UGC and Media each have 1408 MiB RAM, no extra container swap, one CPU and at most 96 processes. Payout has 256 MiB and 0.25 CPU. Combined configured RAM ceiling is **3072 MiB** plus Docker/WSL overhead. These are initial limits for the 8 GB laptop, not measured workload guarantees; large media may still hit OOM. Monitor before increasing limits.
- A shared Linux `flock` serializes each entire UGC/Media cycle, including provider work, merging and preview processing. This is deliberately conservative: one heavy job at a time across these containers. Kernel locks release after process/container death; no stale timestamp stealing. Fixed container names prevent accidental Compose scaling. Run one stack only.
- All containers run as UID 1000, drop capabilities, forbid privilege escalation, have a read-only root filesystem and bounded writable `/tmp`. Recovery/scheduling volumes are writable; the checkout control directory is mounted read-only. No source bind mount, file watching, public ports, Docker socket or privileged container.
- Only outgoing TLS to the configured Supabase, private R2, OpenAI/Higgsfield and PayPal Sandbox endpoints is required. Media receives no AI credentials; payout receives no R2/AI credentials. Keep the existing app's PayPal webhook public and verified; no laptop tunnel or incoming worker port is needed.
- Secrets are runtime environment variables loaded from ignored files. No secret build arguments or image layers. The allowlisted `.dockerignore` excludes environment files, Git, recovery data and development artifacts. `env_file: format: raw` prevents `$` expansion; enter plain values without surrounding quotes. Requires Docker Compose **2.30+**.
- Docker administrators can inspect container environment variables. Protect the Windows account/Docker access, keep env files in the ignored checkout and restrict their NTFS access. Do not paste plain `docker compose config`, `docker inspect`, env files or credential-bearing diagnostics into tickets. Validate using `config --quiet`.
- Images contain compiled worker code and locked npm dependencies, not the development checkout. Editing source or running `npm run dev` never changes running images. Build/recreate explicitly after reviewing changes. The prepared image tags are `sceenyk-worker-{ugc,media,payout}:laptop-v1`; record their image IDs for the tested snapshot. An explicit rebuild can replace these local tags. Do not use automatic image updaters.

## One-time preparation — no worker activation

Run PowerShell from the repository root. Install Docker Desktop with Linux containers and the WSL 2 engine. Verify Docker is available:

```powershell
docker version
docker compose version
```

For 8 GB RAM, start with this `%USERPROFILE%\.wslconfig` configuration, preserving any existing settings:

```ini
[wsl2]
memory=4GB
processors=2
swap=1GB
```

This limit applies to all WSL 2 distributions. Quit Docker Desktop, run `wsl --shutdown`, and reopen Docker Desktop after saving it. Under Docker Desktop **Settings → General**, enable **Use the WSL 2 based engine** and **Start Docker Desktop when you sign in to your computer**. Apply the changes. Startup is after Windows sign-in; it does not keep a sleeping, powered-off or signed-out laptop processing work. Keep the laptop awake and connected while running workers. See [Docker settings](https://docs.docker.com/desktop/settings-and-maintenance/settings/) and [Microsoft WSL configuration](https://learn.microsoft.com/en-us/windows/wsl/wsl-config).

Copy only the empty templates, then fill the resulting ignored files privately:

```powershell
Copy-Item workers/laptop/common.env.example .env.workers.common
Copy-Item workers/laptop/storage.env.example .env.workers.storage
Copy-Item workers/laptop/ugc.env.example .env.workers.ugc
Copy-Item workers/laptop/payout.env.example .env.workers.payout
git check-ignore .env.workers.common .env.workers.storage .env.workers.ugc .env.workers.payout
```

Do not overwrite previously configured files when repeating setup. Do not copy the complete `.env.local` into Docker. Configuration files:

| File | Variables and purpose |
| --- | --- |
| `.env.workers.common` | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (existing service-role secret; `SUPABASE_SERVICE_ROLE_KEY` is also supported). `SCEENYK_DOCKER_WORKERS_ENABLED=0` initially. |
| `.env.workers.storage` | Existing `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, for the private bucket only. |
| `.env.workers.ugc` | `OPENAI_API_KEY`, the app's approved `OPENAI_V3_IMAGE_MODEL`/`OPENAI_V3_DIRECTOR_MODEL`; `UGC_V3_OPENAI_ENABLED=0` initially. Existing `UGC_V3_HIGGSFIELD_CREDENTIALS`, `UGC_V3_HIGGSFIELD_ACCOUNT_SCOPE`, exact `UGC_V3_HIGGSFIELD_OUTPUT_HOSTS`; `UGC_V3_HIGGSFIELD_ENABLED=0` initially. Optional existing `UGC_V3_HIGGSFIELD_LIMITS_FILE` must point to a separately mounted read-only container path if used. Never invent account/model/host evidence or funding caps. |
| `.env.workers.payout` | Existing Sandbox merchant `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_RETURN_ORIGIN` (the existing reachable app origin with verified payout webhook events). `SCEENYK_PAYPAL_PAYOUTS_ENABLED=disabled` initially. |

Compose fixes `PAYPAL_ENVIRONMENT=sandbox` for every service, including payout. The existing PayPal client also hardcodes the Sandbox API and rejects other environments. Compose fixes owned V3 access and demo limits; it does not increase database funding caps or grant generation consent. OpenAI/Higgsfield API use can spend **real funds** even though PayPal is Sandbox. Do not enable new submissions until the existing database spending setup is reviewed.

Build and validate without starting any service:

```powershell
docker compose -f compose.workers.yaml --profile workers --profile payouts config --quiet
docker compose -f compose.workers.yaml --profile workers --profile payouts build
docker image inspect sceenyk-worker-ugc:laptop-v1 sceenyk-worker-media:laptop-v1 sceenyk-worker-payout:laptop-v1 --format '{{.RepoTags}} {{.Id}}'
node scripts/check-docker-workers.mjs
node scripts/check-docker-worker-images.mjs
```

Only worker bundles/images are built; no Next.js production build is needed. Apply migration 113 manually after reviewing prerequisites and stopping older writers/workers for installation. SQL verification in the offline check is disposable and never accesses your hosted database.

## Manual activation

1. Stop all existing local/hosted consumers of this database's current queues. Stop old CLI processes launched before this guard existed; they cannot register retrospectively. Do not run another checkout, machine or historical worker against the same work. The checkout-local guard is not a cross-machine scheduler.
2. Preserve recovery files before changing runtimes. If `.ugc-v3-recovery` contains existing work, seed the shared Docker recovery volume before activating UGC, using the offline helper below. Never delete receipts or reset provider-started/processing records to force progress.
3. Run the mode switch below. It refuses selection of Docker while registered local workers are alive. The switch does not start containers or alter the database.

```powershell
node scripts/worker-mode.mjs status
node scripts/worker-mode.mjs docker
```

4. Set `SCEENYK_DOCKER_WORKERS_ENABLED=1` in `.env.workers.common`. Enable OpenAI or Higgsfield separately only when you intend to process already queued authorized generation requests. Leave paid switches off for a recovery-only first run. New disabled OpenAI tasks stay unclaimed; accepted video recovery still uses saved request identity, credentials and the exact trusted output hosts.
5. Start UGC and Media explicitly from the reviewed built images:

```powershell
docker compose -f compose.workers.yaml --profile workers up -d --no-build --pull never ugc media
docker compose -f compose.workers.yaml --profile workers ps
docker compose -f compose.workers.yaml --profile workers logs --tail 100 -f ugc media
```

6. Activate payouts only after separately reviewing the merchant credentials, payout webhook setup, naturally aged eligible withdrawals and existing payment verification. Set `SCEENYK_PAYPAL_PAYOUTS_ENABLED=sandbox-confirmed` in `.env.workers.payout`, then explicitly start the separate payout profile:

```powershell
docker compose -f compose.workers.yaml --profile payouts up -d --no-build --pull never payout
docker compose -f compose.workers.yaml --profile payouts logs --tail 100 -f payout
```

The first payout check runs when manually activated, then no sooner than hourly. The next-check time is fsynced in `payout-state` before processing and survives restarts. Each pass processes at most 100 due withdrawals sequentially; remaining backlog waits for a later hourly pass. SQL, not the timer, enforces seven days from the original request. Stopping the laptop delays checks; it never shortens the hold. A failed pass is logged and the container restarts; persisted scheduling prevents an immediate financial retry.

## Recovery directory transfer

Before the first Docker activation, with existing workers stopped, preserve the local immutable V3 spool in the shared volume. This optional helper has **no network, environment credentials or worker entrypoint**. Run only if the local directory exists. It copies missing files without replacing existing Docker receipts. If records conflict, stop and inspect rather than overwrite them.

```powershell
$recoverySource = (Resolve-Path .ugc-v3-recovery).Path
docker volume create sceenyk-workers_worker-data
docker run --rm --pull never --network none --user 0 --entrypoint /bin/sh --mount "type=bind,source=$recoverySource,target=/import,readonly" --mount type=volume,source=sceenyk-workers_worker-data,target=/data sceenyk-worker-ugc:laptop-v1 -c 'mkdir -p /data/ugc-v3 && cp -an /import/. /data/ugc-v3/ && chown -R 1000:1000 /data/ugc-v3'
```

For switching back after Docker has received outputs, first stop containers, export `/data/ugc-v3` from the stopped UGC container with `docker cp` to a new private directory under `.worker-runtime`, and reconcile those immutable task/run files into the existing `.ugc-v3-recovery`. Preserve both copies and never overwrite conflicting receipts. If `down` already removed the container, create an offline helper with the same named volume to export it; the data survives `down`. A fresh empty spool cannot recover a provider identity that existed only on the other runtime's disk.

## Daily commands

These commands operate on existing containers/images and never rebuild automatically:

```powershell
# Status, health, resource use and bounded logs
docker compose -f compose.workers.yaml --profile workers --profile payouts ps -a
docker stats --no-stream sceenyk-worker-ugc sceenyk-worker-media sceenyk-worker-payout
docker compose -f compose.workers.yaml --profile workers --profile payouts logs --tail 100 -f

# Stop all workers; retain containers, images, recovery and schedule
docker compose -f compose.workers.yaml --profile workers --profile payouts stop

# Restart only existing containers (same images and environment)
docker compose -f compose.workers.yaml --profile workers --profile payouts restart

# Restart one service
docker compose -f compose.workers.yaml --profile workers restart media

# Remove stopped/running containers while preserving recovery volumes
docker compose -f compose.workers.yaml --profile workers --profile payouts down

# Return to local CLI processing only after stopping Docker and preserving recovery
node scripts/worker-mode.mjs local
npm run dev
# In separate terminals, as before:
npm run worker:ugc
npm run worker:media
```

`unless-stopped` restarts containers after crashes, OOM and Docker Desktop restarts, but intentionally stopped containers stay stopped. `restart` does not reload changed env files; use `up -d --no-build --pull never --force-recreate <service>` for a reviewed environment change. After a source change, explicitly build and recreate only the affected services. Keep Docker stopped while restoring local ownership. The guard fails closed if Docker state cannot be checked; restore Docker access rather than editing the mode marker. An abandoned empty `.worker-runtime/switch.lock` from a killed mode command requires manual removal after verifying no mode/start command is executing. Do not delete active registration/control files to bypass ownership.

Health checks read a private 10-second supervisor heartbeat. The supervisor checks activation and enforces a 40-minute outer deadline, covering lock wait plus bounded task work; it exits on stalled cycles so Docker can restart it. Docker does not restart a container merely for an unhealthy label. Logs use Docker's local driver, capped at three 10 MiB files per container. They contain safe stage/error codes, not credentials or raw provider bodies. A health result proves local liveness, not provider readiness or a successful payment.

Do not use `down -v`, `docker volume prune`, or remove recovery volumes during ordinary maintenance. Accepted/ambiguous AI submissions preserve intent and credit holds; recover the same request or require review rather than issue another POST. Preview outputs use immutable keys and bounded retries. Processing payouts without a saved batch reference stay unresolved until the existing verified webhook/support reconciliation supplies evidence; they are **never resent**. A laptop crash cannot guarantee automatic completion when upstream acceptance cannot be proved.

## Manual acceptance and verification boundary

Essential offline checks passed for configuration, mode exclusion, role-based SQL claims/privileges, leases, disabled submissions and migration rerun. TypeScript, changed-file lint, worker-only compilation and all three image builds passed. Network-disabled image smoke checks passed for non-root/read-only operation, absent secrets/source files, disabled activation, imports/missing-credential rejection, health checks, FFmpeg/FFprobe availability and native heavy-lock exclusion/release after process death. The existing 39-check PayPal fixture also passed; the extracted processor bodies exactly match the original functions. No hosted migration, queue claim, real provider request or payout was performed. No Compose worker containers were created. The final Next.js feedback review retained no qualifying framework issue.

Tested local image IDs (2026-11-12; an explicit rebuild replaces the tag/ID):

| Image tag | Image ID |
| --- | --- |
| `sceenyk-worker-ugc:laptop-v1` | `sha256:aecea1955b46448e6bc42107e843335511e0b5f9095e3c5c7e18cd708e7814b5` |
| `sceenyk-worker-media:laptop-v1` | `sha256:b111c68010d48b3f39955cc38661005c00856b016f5870abc8c313f2c617e92b` |
| `sceenyk-worker-payout:laptop-v1` | `sha256:565a7fc42a65dff7fc38e20a8b70749fbe75180c913619006d2e3a780f5cb70d` |

After activation, manually check health/logs/resource use, one explicitly intended generation/merge/preview, safe container restart with the same request/output identity, once-only ledger changes, and one naturally eligible Sandbox withdrawal. Confirm no payout before seven days and no resend after uncertain provider evidence. Watch `docker stats`; if OOM occurs, retain database state/spool, inspect memory needs and reduce workload before changing ceilings. The configured limits and recovery paths require this connected acceptance on the actual laptop.
