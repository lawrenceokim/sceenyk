# Temporary Inngest shutdown — 2026-11-02

Source shutdown is implemented; deployment and hosted usage verification have not been performed. The actual route is **`/api/inngest`**, with two n's. No `/api/ingest` implementation or caller existed; both spellings are now covered by the deployment guard.

## Repeated-call sources

| Existing source | Trigger / repeat behavior | Shutdown boundary |
| --- | --- | --- |
| `lib/workflows/generation.ts` | `generation-reconciliation`: `* * * * *`, four retries; expires claims, dispatches pending generations and sends visual/narration/composition/render events. Render recovery deliberately emits fresh events. | Preserved but no longer imported/served by the route. |
| `lib/workflows/captions.ts` | `caption-reconciliation`: `* * * * *`, four retries; emits fresh caption events. Caption processing also allows four retries. | Same disconnected registration boundary. |
| `lib/workflows/marketplace-earnings.ts` | `marketplace-earnings-reconciliation`: `* * * * *`, four retries; deferred financial work is revisited on later cron passes. | Same disconnected registration boundary; automatic financial reconciliation pauses. |
| `lib/workflows/creator-payouts.ts` | `creator-payout-reconciliation`: `* * * * *`, four retries; due/deferred withdrawals are revisited every minute. | Same disconnected registration boundary; automatic payout processing pauses. |
| `lib/generation/dispatch.ts` | `inngest.send` after quote confirmation; cron retries numbered outbox dispatches. | Unconditional code pause returns before database reservations, SDK sends, acknowledgements or retry errors. |
| `lib/generation/server.ts` / `app/actions/generation.ts` / `components/creation/use-project-generation.ts` | Explicit legacy Generate/Retry calls reach quote confirmation and dispatch. Page/visibility status reloads and quote-expiry timers do not dispatch. | Admission reports paused before creating a job or holding credits; authentication and existing status reads are preserved. |
| `lib/workflows/generation.ts` | Event-driven analysis has four SDK retries and a bounded second analysis attempt after a 10s durable sleep. | Disconnected registration. |
| `lib/workflows/visuals.ts` | Event-driven processing with four retries, bounded 10s durable polling and an SDK failure handler. | Disconnected registration. |
| `lib/workflows/narration.ts`, `lib/workflows/composition.ts` | Event-driven processing with four retries and SDK failure handlers. | Disconnected registration. |
| `lib/workflows/final-render.ts` | Event-driven processing with four retries, up to sixty 30s durable poll sleeps and worker redispatch after lease expiry. | Disconnected registration. |
| `lib/workflows/client.ts` | SDK event/registration HTTP transport; SDK may retry failed requests. | Every transport callback rejects locally, even with old enabling environment values. |
| Eight Cloud scripts listed below | Manual endpoint inspection, PUT registration/sync, Cloud API polling/retries, and duplicate event sends. Not automatically run by production/build/start. | Each now imports a fail-fast pause module before environment loading or work. |

Four minute schedules can account for at least four recurring workflow starts per minute before step callbacks, retries and downstream events. This is a source finding, not a diagnosis from production request logs; current Cloud schedule state and actual usage were not inspected.

Repository search included hidden configuration (excluding generated/dependency/Git trees), frontend `useEffect`, `setInterval`, `setTimeout`, fetch calls, server actions, SDK sends, `step.sendEvent`, cron/retry definitions, worker startup, instrumentation, PayPal webhook handling, SQL migrations, package scripts and deployment configuration. No frontend ingest URL polling, Vercel cron, SQL HTTP/pg_cron job, GitHub scheduled workflow, worker callback or PayPal webhook sending Inngest events was found. Current UGC/V3 progress polling and local workers do not call Inngest and are preserved. Offline `InngestTestEngine`/mock SDK checks are fixtures, not Cloud callers; `check-dispatch.mjs` uses a mock fetch and local signature-handler requests. Secret scanners and navigation tests only reference names/paths.

## Changed files

| File | Change |
| --- | --- |
| `.gitignore` | Includes this restoration/audit document in version control alongside the pause. |
| `vercel.json` | First terminal routing rule returns HTTP 204 for either ingest spelling and descendants, for all methods, without a function destination; response header documents the temporary pause. Existing private response routing is retained. |
| `app/api/inngest/route.ts` | Replaced active SDK serving with seven immediate empty 204 handlers. No imports, body parsing, registration, database/provider calls or 300s function duration. |
| `lib/workflows/legacy-route.ts` (new) | Preserves the former signed serve implementation, ten workflow registrations and original signatures behind the pause. The deployed route never imports it. |
| `lib/workflows/execution-policy.ts` | Adds unconditional `inngestExecutionPaused()`; environment flags cannot resume Inngest. Existing local-worker policy is retained. |
| `lib/workflows/client.ts` | Blocks all SDK transport while paused. |
| `lib/generation/dispatch.ts` | No-op before any outbox/database/send work while paused. |
| `lib/generation/server.ts` | Rejects new legacy admission before credit reservation; preserves existing reads/local UGC paths. |
| `scripts/lib/inngest-paused.mjs` (new) | Fail-fast guard for manual Cloud tools. |
| `scripts/acceptance-creator-withdrawals-hosted.mjs` | Guards signed endpoint inspection and Cloud app metadata reads. |
| `scripts/acceptance-marketplace-settlement.mjs` | Guards endpoint GET/PUT registration and Cloud reads. |
| `scripts/check-caption-cloud.mjs` | Guards endpoint inspection, optional `--sync` PUT and Cloud reads. |
| `scripts/check-deployed-analysis.mjs` | Guards endpoint inspection, retrying Cloud reads and duplicate/terminal generation event sends. |
| `scripts/check-deployed-composition.mjs` | Guards endpoint GET/PUT registration, Cloud reads and duplicate composition sends. |
| `scripts/check-deployed-final-render.mjs` | Guards endpoint GET/PUT registration, Cloud/run polling and initial/duplicate render sends. |
| `scripts/check-deployed-narration.mjs` | Guards endpoint GET/PUT registration, Cloud reads and duplicate narration sends. |
| `scripts/check-deployed-preparation.mjs` | Guards endpoint inspection, retrying Cloud reads and duplicate visuals sends. |
| `scripts/check-inngest-pause.mjs` (new) | Offline route, SDK transport, dispatch/admission, deployment-rule and eight script guard checks. |
| `.env.example` | Documents that existing environment flags cannot override the temporary code/routing pause. |
| `context/architecture.md` | Records the current shutdown boundary, side effects and hosted-state limitations. |
| `context/progress-tracker.md` | Records implementation, evidence and pending production acceptance. |
| `context/inngest-pause.md` (new) | This complete inventory and restoration/deployment procedure. |

## Deployment and external schedules

The first `vercel.json` rule intentionally uses a terminal 204 response without `dest` or `continue`. Vercel documents status-only routing responses in its [routing configuration](https://vercel.com/docs/build-output-api/configuration#source-route). This keeps matching requests in deployment routing rather than invoking the Next.js handler/proxy. Confirm this behavior against the deployed revision and Vercel invocation metrics; local checks cannot establish hosted billing behavior.

Already registered Inngest Cloud schedules, queued retries, dashboard integrations and old deployment URLs are external state. A repository change does **not** delete or pause them. Pause the Sceenyk app/functions and cancel pending runs in the Inngest dashboard; ensure production/custom domains use the new deployment and retire old active callback URLs. Until then, Cloud can continue sending HTTP requests, including failed discovery/sync probes, but the new deployment's terminal routing rule prevents those requests from reaching application functions. HTTP 204 does not promise that every Inngest protocol operation considers the response valid.

Do not unregister functions by running old PUT sync scripts; those are deliberately blocked. No deployment, Cloud request/mutation, cancellation, remote SQL, provider call or worker execution was performed for this change. Direct payments/webhooks and local UGC work remain separate; automatic Inngest earnings/payout reconciliation is intentionally suspended, so due work waits for restoration/manual authorized support.

## Verification

`node scripts/check-inngest-pause.mjs` passed **55** offline checks with zero network calls, database calls or event sends. Coverage includes seven route methods without request/body reads, explicit bypass of the old environment guard, production/development/test pause enforcement, SDK transport rejection, repeated dispatch, authenticated pre-reservation admission, deployment-route matching/exclusions, preservation of private routing and actual fail-fast imports of all eight Cloud scripts.

`npx tsc --noEmit --incremental false`, full repository `npm run lint`, `npm run build` and whitespace checks passed. The build retains 11 tracing warnings in unchanged media/recovery-filesystem/FFmpeg files, plus the external parent-lockfile warning. No browser/provider/worker/hosted acceptance was run. Historical dispatch/admission suites assert the enabled legacy behavior and were not rerun as shutdown acceptance; all preserved implementations remain available for deliberate restoration.

## Restoration

1. Review pending jobs, held reservations, deferred financial work and Cloud backlog before allowing recovery.
2. Remove the first terminal `vercel.json` rule. Restore `GET`, `POST`, `PUT` exports from `lib/workflows/legacy-route.ts` in the application route and restore its previous `maxDuration = 300`; remove the seven paused exports.
3. Change `inngestExecutionPaused()` to false in a deliberate code change. The prior `SCEENYK_LOCAL_JOBS_ONLY` and production signature protections still apply.
4. Remove the eight Cloud-script pause imports only when Cloud acceptance/sync is authorized. Keep offline shutdown checks aligned with the restored state.
5. Deploy, explicitly sync/re-enable the intended functions/schedules, then validate signatures, recovery, duplicates, financial work and usage. Do not infer this from environment changes alone.
