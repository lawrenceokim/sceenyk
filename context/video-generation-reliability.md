# Package approval and repeatable video funding

## Production connection incident — 2026-11-13

**Source fixes and essential checks complete; rollout and authenticated Production acceptance remain pending.** No paid generation, provider request, credit mutation, migration, Vercel deployment or worker recreation was performed. Existing active workers were inspected only.

Verified against the running UGC container:

- Local `.env.local`, the Compose UGC env files and the container's inherited Supabase endpoint/key have matching fingerprints. The endpoint is hosted HTTPS, the selected credential is a working `sb_secret_` key and there is no competing service-role fallback. This worker uses PostgREST over HTTPS, not a PostgreSQL password/pooler connection.
- DNS resolved IPv4 successfully. Eight consecutive authenticated reads returned HTTP 200 (approximately 0.23–1.57 seconds); enabled-submission discovery returned HTTP 200 in about one second, with zero candidates. Further diagnostic reads also passed. These short samples do **not** prove continuous reliability or identify the earlier intermittent outage's cause. Old logs lost the failing operation and socket/status details. No speculative DNS/TLS/credential repair is claimed.
- Hosted `generation_project_access` returns **policyVersion 114**. Both actual UGC and Media `/app/runtime/cycle.cjs` bundles contain **`policyVersion: ...literal(109)`**: a confirmed outdated-image mismatch despite reported container health. Both containers' loaded endpoint/key fingerprints also match. The live policy marker is verified; direct PostgreSQL trigger/FK/grant audit still requires the read-only SQL setup queries. Do not blindly reapply historical accounting migrations.
- A transient database error exited the Docker cycle; its supervisor treated every nonzero exit as fatal and restarted under Compose. The health check measured only a heartbeat. A failing/restarting database connection could therefore coexist with a healthy status. The local/background runners' connection handling did not protect this Docker entrypoint.
- Current project `62676621-ad32-46c3-b6c5-9cfb8ded8104` has an immutable $1.03 authorization but **no video runs, video tasks or paid video reservations**. Wallet: **142 available / 0 reserved**. Current policy permits a 103-credit request within the unchanged finite budgets. There is no accepted video job to claim/resume and no video hold/debit to refund. This V3 path cannot submit a provider request without its required run/task. No recovery or replacement was enqueued. Authorization may need ordinary owner renewal if it expires before rollout.
- The owner identified Production at `https://sceenyk.vercel.app`. No authenticated Vercel session/project link is available here: its active deployment environment, exact failing Server Action/request and Skew Protection settings were **not retrieved**. Vercel/Supabase parity remains **Needs confirmation**. A missing Action can indicate a stale browser/build mismatch or an unrelated invalid request; it has not been causally linked to this attempt. Current video requests already use `POST /api/ugc/v3`.

Source changes preserve financial, ownership and provider authority:

- Docker now prints secret-safe operation/category/retryability/HTTP/SQL/socket diagnostics. Only transient **database** failures in UGC/Media return temporary exit 75. The supervisor backs off 3–60 seconds with jitter, marks health degraded, then starts a fresh queue iteration. It never retries an individual charge, claim, checkpoint or provider POST. Existing leases/intents/receipts and unknown-outcome fences govern recovery. Permanent/setup/provider-unknown failures retain stop behavior; payout gets no new financial retry loop.
- Read-only discovery gets a 30-second timeout, matching workspace reads. Mutation deadlines remain 10 seconds and explicit cancellation stays authoritative. No generic fetch/RPC mutation retry.
- Studio saving uses `POST /api/projects/save`, independent of build-specific Action IDs. Exact-origin/JSON/body bounds precede the **existing** `saveProjectAction`/owned service, retaining verified Clerk identity, ownership, validation, creative locks, same-ID create recovery, revalidation and confirmed cache updates. No POST is automatically replayed. Other Actions retain their owners. Existing tabs require one full reload after preserving unsaved edits.
- Worker builds include `/app/runtime/build-info.json` (policy/bundle hash) and `/app/runtime/diagnose.cjs`. Diagnostics use **only inherited env**, expose fingerprints instead of secrets, and perform only DNS/authenticated reads/read-only discovery/policy and optional saved-job inspection. They cannot claim, enqueue, migrate, charge or call Higgsfield/OpenAI.

Essential verification: **67** injected actual supervisor/cycle/save-route/client checks and **154** connection-recovery checks pass, with zero real network/provider calls in fixtures. Standalone TypeScript, targeted ESLint, whitespace and offline worker/diagnostic compilation pass; the new manifest reports policy 114. The diagnostic was also piped read-only into the existing container and confirmed working auth, zero candidates, live 114 and empty current video state. This did **not** replace its old worker bundle. The older connection harness needed its current text assertion and injected local registration updated; it never changed workstation worker mode. No full Next build, image rebuild, browser automation or paid acceptance ran.

### Operator rollout

Use the existing stack and retain control/env files and named recovery volumes. Pause new Generate requests. The diagnostic `run` below invokes no supervisor or queue worker. Never use `down -v`, reset jobs, clear review flags or refund/recharge manually.

```powershell
docker compose -f compose.workers.yaml --profile workers stop ugc media
docker compose -f compose.workers.yaml --profile workers build ugc media
docker compose -f compose.workers.yaml --profile workers run --rm --no-deps --entrypoint node ugc --conditions=react-server /app/runtime/diagnose.cjs --live --project 62676621-ad32-46c3-b6c5-9cfb8ded8104
```

Require `migration_114_policy.ok=true` and expected configuration before activation. Run the existing 114 section of `scripts/verify-v3-setup.sql` in trusted Supabase SQL Editor for installed bodies/FK/quote bounds; the working API marker does not prove these catalog details. No new migration or env variable is required by this correction.

Confirm Production's exact hosted `SUPABASE_URL` and selected server-only credential match Docker, together with existing V3 owned/enable/provider/storage configuration. Do not paste secrets into chat/command arguments. Current [Vercel CLI env](https://vercel.com/docs/cli/env) supports a read-only diagnostic without writing environment values to a file:

```powershell
vercel env run -e production -- node --conditions=react-server --import=tsx scripts/diagnose-generation-worker.ts --live --project 62676621-ad32-46c3-b6c5-9cfb8ded8104
```

Run from the correctly linked Production project. Compare `projectFingerprint` and `credentialFingerprint` with Docker. If secret values are unavailable to the CLI, fail closed; do not silently substitute local credentials and claim parity. This script intentionally does not load `.env.local`. Current settings parity does not prove an older immutable deployment used them.

Deploy **this updated checkout**, including the new route, through the normal Production pipeline or `vercel --prod` after verifying the linked project. Redeploying an older artifact does not include the fix. Review existing [Skew Protection](https://vercel.com/docs/skew-protection) where available; a full-page reload selects the latest Production deployment. Do not add obsolete experimental config options or rotate encryption keys speculatively.

When ready to resume workers:

```powershell
docker compose -f compose.workers.yaml --profile workers up -d --no-deps --force-recreate ugc media
docker exec sceenyk-worker-ugc node -p 'require("/app/runtime/build-info.json").policyVersion'
docker exec sceenyk-worker-ugc node --conditions=react-server /app/runtime/diagnose.cjs --live --project 62676621-ad32-46c3-b6c5-9cfb8ded8104
```

Require image policy **114**. Payout needs no recreation for this incident. Preserve unsaved edits, then reload Studio. Read saved state first; if a run appeared meanwhile, follow that run's status/recovery. If still absent, normal owner-consented Generate after rollout is a **new paid request**, not recovery; it was not run here. Continuous network stability, active Production env/deployment parity and authorized end-to-end generation remain live acceptance work. Recurring failures now retain their actual operation/transport diagnostic for a specific repair.

Source correction: 2026-11-12. Migration 114, matching Vercel deployment and rebuilt generation workers are required for release. No remote writes, provider generation, deployment or worker recreation was performed during this investigation.

## Confirmed causes

- `V3WorkflowPreview` disabled Approve Generation Package whenever video eligibility was false. A checked checkbox could not overcome a historical project hold, a consumed free video or a provider spending cap. `ownedV3Action` independently rejected authorization under the same funding gate. Package consent is local authorization, not a credit reservation or provider submission.
- Package approval depended on an editable USD input and another checkbox before the explicit approval button. The proposed maximum came from a historical 20% estimate buffer, independent of the approved 103-credit/$1.03 hackathon contract. The browser could supply a different maximum. Saved package/quote/authorization documents must remain immutable.
- An unused lower-ceiling authorization could make both server and SQL idempotency return the old approval, preventing explicit renewal at the displayed automatic ceiling. New approval now appends a correctly bounded immutable authorization; the old document remains unchanged and cannot mask the need for current authority.
- Video funding was selected by project enrollment. Reviewed projects could buy OpenAI preparation under 109 but could not independently fund video; used free projects could not move their next attempt to credits without changing project-level funding. Converting those projects would also risk changing included OpenAI funding and historical recovery routing.
- Both the pricing verifier and SQL quote function/table required the provider price to round to exactly 103 credits (the SQL lower bound was $1.020001). A real price reduction was incorrectly rejected even though the approved retail price and exposure ceiling remained 103 credits/$1.03.

Read-only hosted inspection confirmed the reported project's current local package estimate is 1,028,335 micro-USD, its historical free-project hold is still unresolved, and no package approval had been saved. The locally configured database has finite real-provider paid caps of 3,090,000 micro-USD per user and 30,900,000 globally. These are cumulative exposure budgets, not a new lifetime generation quota. They were not changed. The running UGC/Media containers were healthy; UGC's owned access, OpenAI and video flags were enabled and provider credentials/account scope were present. Presence/health does not establish provider balance, validity, storage/network or end-to-end hosted acceptance. Vercel's effective environment was not retrieved.

## Current behavior

Build package → Approve Generation Package → Generate Final Video → existing Docker UGC lane → review/approve the video → saved final. Approval is one explicit button confirming the exact package/hash/quote and displayed cost limit. The server calculates the supported 5-second/480p single-video ceiling as **$1.03**. Browser amounts cannot lower or enlarge that ceiling. The checkbox and editable amount are removed. Approval does not require credits or available provider budget; Generate remains the financial admission boundary and explains current insufficiency/configuration.

The frozen local estimate remains reproducible and distinct from the ceiling and actual provider price. New free and paid submissions verify the exact signed immutable request with the existing authenticated non-generating estimate endpoint before admission and again before dispatch. Prices must be positive, at most $1.03 and within the saved authorization. A lower provider price is accepted; paid retail charging remains **103 credits**, without redefining payment fees, free policy or old snapshots. A genuine price above the approved ceiling remains blocked instead of silently raising financial authority. Existing admitted runs determine funding from their reservation, not changing project eligibility.

Migration [114](../supabase/migrations/20261112011400_video_attempt_funding.sql) selects funding per new video attempt. A genuinely eligible unused included video uses the original free-project path. Otherwise a new attempt uses purchased credits, including on a historically reviewed project or one with an already-used free video. The hold/record remains intact and never grants another free video. An existing unresolved provider request still requires recovery/reconciliation before a replacement through the existing project/package/intent guards.

Paid reservations reference the existing V3 project directly, just as 109's paid OpenAI reservations do. No new table or project-wide paid enrollment is introduced. The same SQL wallet lock, finite user/global provider-cap checks, exact-body fresh quote, 103-credit hold, immutable ledger, once-only dispatch and settlement/refund owners remain. Quotes accept positive real prices up to the existing ceiling. Unknown outcomes retain their holds. Existing free/paid tasks retain their original routing; OpenAI funding, original counters/flags/history, creative locks, approved media and payment records are preserved. Installed private delegates are captured once for reruns; no data backfill or financial-record repair occurs.

Two lifetime free project allowances remain. First billable AI dispatch consumes an allowance permanently, each assigned free project has one included video, and included OpenAI preparation follows its existing separate policy. Further eligible paid projects/attempts are not constrained by an application lifetime attempt count. Existing results must first be reviewed or explicitly rejected/deleted; generating again does not overwrite an approved final, silently delete media or replay its paid intent. An approved final can be preserved while generating a new owned project.

The 5-second/480p restriction permits one new clip, which is already the final video; it does not require a merge. Existing retained connected-clip approval, manifest validation, Media-lane FFmpeg merging, joined review/final approval and unknown-outcome recovery remain under their existing owners and are not re-funded or unlocked. New longer/higher-resolution submissions remain blocked. Approval of clips/finals still explicitly judges creative output; removing duplicate package consent does not approve media automatically.

## Release and external configuration

1. Back up the database. Stop old generation writers and drain/pause the UGC/Media workers safely, retaining known-request recovery and durable volumes. Never delete queue/history records to deploy this change.
2. Verify migrations through 113. Apply **114 once, transactionally** using the normal trusted SQL Editor; it is rerunnable and verifies prerequisite functions/FK/quote constraints. Do not replay 108's historical backfill over newer credit-funded tasks. The new app/worker access parser requires policy 114 and fails closed against an older database. No per-account repair is required.
3. Deploy matching web source to localhost/Vercel and rebuild/recreate **UGC and Media** images. Both contain the shared compiled generation runtime; payout needs no rebuild. From the root, use the existing `docker compose -f compose.workers.yaml --profile workers build ugc media` and normal reviewed `up -d --no-deps ugc media` process. Preserve control settings, env files and named recovery volumes; never use `down -v` or run a second stack. Do not automatically enable new paid submissions during this release.
4. Retain environment-specific server-only V3 enabled/owned mode, OpenAI/Higgsfield flags and credentials/account scope, matching Supabase/database/schema and private R2 configuration. Existing localhost/Vercel origin and Clerk rules remain. No new environment variable is introduced. A healthy container is not proof that its image contains the changed code.
5. Inspect real-funded `generation_paid_policy`/user overrides and provider balance. The observed $3.09 user/$30.90 global budgets can pause later paid requests even with credits. Only an operator who verifies real provider funds can adjust them through the existing trusted configuration. No unlimited cap or guessed funding amount is substituted; Sandbox purchases cannot increase them. These caps include prior consumed/unknown exposure; confirmed releases are excluded.
6. Run the read-only setup queries and manually exercise the normal workflow after release. A real Generate spends provider funds and requires normal owner consent. Preview/Production configuration parity and live generation/retained-media merge acceptance remain external checks, not claims established by offline fixtures.

## Focused evidence

- `node scripts/check-video-attempt-funding.mjs`: disposable actual SQL migration/rerun, two free allowances, credit-funded historical continuation and repeats, lower quote prices, once-only holds/consumption/refunds, unknown holds, ledger reconciliation, owner/role denial, preserved flags/counters and finite-cap denial. Synthetic creative lineage; zero real services.
- `node scripts/check-v3-package-usage.mjs`: actual server action/client policy boundaries, package consent separated from funding, owner/settings/creative lock and credit denial.
- `node --conditions=react-server --import=tsx scripts/check-v3-location-director.mjs --hackathon-workflow-only`: **66** focused real route/SQL/worker assertions. Package/automatic consent, preserving and renewing a legacy lower-ceiling authorization, Docker UGC claim, free generation, duplicate Generate, explicit reject/delete, credit-funded renewal under historical review, second generation and final approval; exactly two fixture provider submissions and 103 credits consumed once. Storage/provider bytes are fixtures; all 114 migrations installed in a disposable database, no older broad scenario loops.
- `node scripts/check-v3-workflow-progress.mjs --package-approval-only`: **11** offline real-component assertions; approval enabled despite historical/credit/cap video blockers, automatic $1.03 display, no extra checkbox/editable maximum, stale package still disabled. The older unfiltered Progress harness has unrelated stale markup assertions and was not accepted as a full regression result.
- Standalone TypeScript, changed-file ESLint, whitespace and offline Docker worker compilation are the essential static checks. No Next production build, browser automation, extensive regression suite or real paid generation ran. Retained multi-clip merging was source-traced, not executed in a new paid scenario under the five-second restriction.
