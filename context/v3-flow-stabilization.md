# V3 cleanup and Generation Package investigation — 2026-10-31

Project: `3f6d210e-5e85-410b-8c37-3881507eec60`.

Source fixes and focused offline checks are complete. Live provider-free cleanup reconciliation is complete. **Migration 085 is authored and tested, but is not applied to the connected database.** Package building requires that migration and restarted app/worker processes. No OpenAI/Higgsfield call, authenticated estimate, paid authorization, media regeneration or video activation ran during investigation/repair.

## 1. Exact cleanup cause and asset

The warning did not describe a remaining image at inspection time. A background cleanup raced an already-active explicit deletion, failed to acquire its cleanup lease, and retained the failure after the explicit deletion finished.

| Item | Verified value |
| --- | --- |
| Reference | Location, generated version **2** |
| Generated version / artifact row ID | `7dba629f-92a2-4449-86ed-88d31e06ac67` in `ugc_v3_artifacts` |
| Original generation task ID | `7dba629f-92a2-4449-86ed-88d31e06ac67` |
| Failed background cleanup task | `23ca24af-280d-4db4-911c-3dc46b420c84` |
| Durable deletion row | Same artifact ID, `mode=reject`, `state=completed` |
| Bucket | Private Cloudflare R2 bucket `sceenyk` |
| Object key | `users/55316192-34a1-4059-b9ff-9945f95e50c0/projects/3f6d210e-5e85-410b-8c37-3881507eec60/v3/7dba629f-92a2-4449-86ed-88d31e06ac67.png` |
| Current review state | Rejected/deleted; candidate row no longer exists |
| Failed operation | `ugc_v3_discard_reference_prepare(owner, project, artifact ID, 2, false)` |
| Exact retained error | `V3_REFERENCE_CLEANUP_IN_PROGRESS` |
| Failed stage | SQL cleanup reservation, before that worker could issue storage deletion |
| Original HTTP status | Not retained; this was a background task failure, not a recorded browser HTTP error |
| Candidate/source-task DB deletion | Succeeded; rows absent |
| Storage deletion | Succeeded; HEAD of exact canonical object returns absent |
| Derived metadata cleanup | Completed receipt has cleared asset/source-task metadata; image-free request audit retained |
| Saved provider-output copies | Source task plus deterministic plan/sheet/check/repair/recheck directories have no saved PNG or raw response remaining |

The normal storage operation is conditional `DeleteObject` against that canonical key and bucket with the stored ETag, followed by HEAD confirmation, local response/PNG purge and SQL finalization. The deleted asset's old ETag and raw storage response were intentionally cleared by completed cleanup; their historical values cannot be reconstructed. The competing worker failed before attempting this storage operation. No evidence supports a wrong bucket, signed-URL key, path encoding, storage permission/policy failure or DB-before-storage deletion in this incident. Storage is R2 using server credentials; Supabase Storage policies are not involved.

Location v1 (`85fb4725-3b6a-438a-98e6-f2c539a99cbe`) was also verified absent from R2/DB/local output. The current approved Location is version 3 (`f7d87859-9615-4400-808f-9e0e01c92405`).

## 2. Deletion fixes

Lease contention now returns background cleanup to pending instead of reporting permanent deletion failure. The worker reconciles obsolete cleanup tasks against completed deletion receipts. Read DTOs also suppress completed-cleanup warnings. A service-only reconciliation RPC updates only cleanup tasks backed by completed receipts, with project/owner/lease guards.

The existing prepare → canonical-key/ETag validation → R2 deletion → absence confirmation → spool purge → DB finalization order remains. A real storage failure preserves retry metadata and now retains a bounded storage error name and HTTP status, with no raw provider/storage error body. Unknown local files remain protected by the spool allowlist.

Approved Character/Product regeneration preserves the approved version in history while queuing a new candidate after confirmation. A DB trigger prevents approved references from entering permanent deletion, including through old clients. Unapproved rejected/replaced candidates still use permanent deletion before replacement generation. Uploads, entities/names, approved history and unrelated media are preserved.

## 3. Exact package cause

The worker used `privateAssetSchema.parse(source.private_bindings[ref.id])`. Every saved binding correctly includes mandatory `verifiedReadback: true`; `privateAssetSchema` is strict and rejects that extra property. Reproducing the parser against this project's Character, Product and Location bindings returned Zod `unrecognized_keys`, key `verifiedReadback`.

The original worker discarded the Zod error and stored only `V3_TASK_FAILED`. That retained historical code remains unchanged. The original raw exception/HTTP trace was not retained. The first reproduced failure is the reference-delivery binding parse, immediately after successful minimum-segment planning and before storage read/sign, Higgsfield payload construction or estimate transport. Independent readback/signing and inert payload preparation succeeded with the same approved inputs when using the binding envelope correctly.

| Package evidence | Result |
| --- | --- |
| Build task | `7ae39f1d-8d1e-4cc6-a5e3-34553b36dae2` |
| Reserved package ID | `7fa24c35-f9f4-4e18-892d-8e19865f1b2c` — an ID in task input, not a saved package |
| Source revision | 1, current |
| Saved error | `V3_TASK_FAILED`; reproduced underlying cause above |
| HTTP/API status | Original browser status not retained. The action queues work and normally returns HTTP 200; the failure occurs later in the worker. No Higgsfield HTTP status exists for this local parse failure. |
| Minimum segment plan | Local reproduction succeeds, one segment |
| Package created | No |
| Estimate requested | No: the reproduced failing parse precedes the transport call |
| Estimate saved | No |
| Authorization created | No |
| Partial package/envelope | None in database or the task's `package.json` recovery file |

The UI's generic task renderer used `Recovery required` for every status other than queued/running/done. It did not inspect saved work, and the Package tab displayed neither task failure nor stage. The Build button consequently returned without an explanation. Cleanup contention and package parsing are independent failures.

## 4. Corrected flow

Approved/current references → approved/current Storyboard → **Build package and estimate** → locked, idempotent source/task admission → project/reference validation → minimum Generation Segment planning → binding/readback/signing → inert Higgsfield payload → configured prepaid estimate → atomic package/quote/task persistence → review estimate → explicit cost authorization. Video submission remains separately disabled.

The binding schema validates the readback-proof envelope and then extracts the strict PrivateAsset; it does not drop provenance checks. Admission and commit revalidate current approved assets in SQL. Duplicate clicks reuse the same active/current task and package; an explicit rebuild after stale/expired/unavailable pricing creates a new immutable version. Failed local builds without saved work reuse their existing task identity. Valid saved-envelope recovery reuses its request/quote and does not request another estimate. Lost local-save acknowledgements and transient DB commit acknowledgements receive bounded automatic local recovery.

| Evidence | User-facing state |
| --- | --- |
| Active validation/planning/estimate/persistence | Actual saved stage shown, polled automatically |
| Complete package and current quote | Generation Package ready |
| Failed before valid envelope/package saved | Package build failed, precise reason |
| Valid complete saved envelope; persistence failed | Recovery required; Build resumes local saved work |
| Missing/unavailable/expired estimate | Cost estimate unavailable; no authorization/submission |
| Changed/stale inputs | References changed — rebuild required; Storyboard message where relevant |
| Missing required approval | Approve required references first; role-specific explanation |

If estimation fails, a valid local package can persist with unavailable pricing and no quote/authority. This is not a priced/authorized package. The UI keeps its failure visible and exposes local-development stage/code/HTTP status/package/segment/estimate/recoverability details. Technical disclosures contain no signed URLs, prompts, credentials or raw responses. Refresh no longer erases an action error merely because status retrieval succeeded.

## 5. Current-project repair

Completed provider-free cleanup reconciliation through the existing service-only cleanup commands. The two deletion tasks are now `done` with null error codes. Live read-only reinspection confirmed both rejected images, their candidate/source-task rows and image-bearing local response copies absent. Approved Character v2, Product v1, Location v3 and Storyboard v1 documents and approval timestamps were compared before/after and remained identical. No approved media was regenerated.

The old failed package task/event is preserved. Its legacy binding-parser failure is explained in the DTO without rewriting historical evidence. No package/estimate/authorization was created during repair because the owner prohibited provider calls. Migration 085 is still required before rebuilding. The current task/source can be reused after setup; no approved-reference or Storyboard regeneration is needed.

The retained repair/inspection command uses owner/project checks, receipt-backed cleanup and approved-document comparison. It makes no provider calls and never executes generation tasks. Future receipt reconciliation uses migration 085's narrowly scoped RPC; pending unwanted candidates reuse the existing deletion coordinator. Normal users do not need this command.

## 6. Files changed

- Package worker/contracts/status: `lib/final-video-generation-v3/package-task.ts`, `package-status.ts`, `runtime-contract.ts`, `runtime-server.ts`, `runtime-store.ts`, `worker.ts`, `creative-inputs.ts`, `progress.ts`.
- Deletion handling: `lib/final-video-generation-v3/runtime-media.ts`, `reference-deletion.ts`, `reference-retention.ts`, `reference-errors.ts`.
- Existing UI: `components/creation/v3-workflow-preview.tsx`, `reference-regeneration-dialog.tsx`.
- Database: `supabase/migrations/20261031008500_ugc_v3_package_flow.sql`; read-only `scripts/verify-v3-setup.sql`.
- Inspection/verification: `scripts/repair-v3-flow.ts`, `check-v3-location-director.mjs`, `check-v3-location-ui.tsx`, `check-v3-reference-regeneration-ui.mjs`, `check-v3-reference-deletion-storage.mjs`; npm commands in `package.json`.
- Context: this report, `architecture.md`, `ai-workflow-rules.md`, `progress-tracker.md`, `generation-v3-phase3.md`, `ui-context.md`; `.gitignore` permits the new report alongside the existing tracked V3 guides.

No V1/V2 runtime/provider/history, Character/Product generation prompt/adapter, stylesheet, environment file, dependency, payment or credit-ledger change.

## 7. Verification and limits

Connected-database zero-row reads verified all **10 tables / 45 columns** referenced by the migration. Disposable PostgreSQL fixtures apply all 85 migrations and rerun 085; **365 existing function bodies/grants remain unchanged**. New package admission/commit/checkpoints/reconciliation and approved-preservation functions are service-only. No new table or migration-time data sweep is added.

Focused results: 507 route/action/worker/SQL Location/retention/package checks, 27 status/error checks, 89 actual confirmation/Package-tab UI handler checks, 37 real storage/spool helper checks, 180 existing permanent-regeneration checks, 167 saved-reference recovery checks, 160 Phase 3 checks, 270 V3 foundation checks, 187 V2 compatibility checks and 36 canonical Studio rendering checks (**1,660 total**). TypeScript, focused ESLint and whitespace checks pass. Provider/estimate responses are fixtures; **zero real provider calls**. Package fixtures cover same-task duplicates, one-package success, refresh/reopen identity, readback-envelope validation, pre-estimate failure, atomic rollback, saved-envelope recovery, unavailable estimates, authorization refusal, missing Product approval, progress stages, safe technical disclosures, approved-history preservation and lease-contention cleanup waiting/completion.

Live evidence covers this project's DB/R2/local cleanup and unchanged approvals only. Browser interaction with the running app, real estimate/account acceptance and the newly migrated package path remain unverified until 085 is applied and the owner continues. No live Reject/Regenerate/Approve sequence was run against approved media. Next.js feedback pass retained no qualifying new framework issue.

## 8. Continue this project

1. Apply **only new migration 085 after installed 084** in the Supabase SQL Editor: `supabase/migrations/20261031008500_ugc_v3_package_flow.sql`. The available server connection exposes service RPCs/read access, not SQL-DDL execution; it cannot apply this migration. Run `scripts/verify-v3-setup.sql` afterward. No new configuration or data backfill is needed.
2. Restart the local app and existing local UGC worker so both load the new code. Keep `UGC_V3_HIGGSFIELD_ENABLED=0`.
3. Reopen this saved project. Keep the existing approved Character/Product/Location and Storyboard; select **Package → Build package and estimate** once.
4. The existing worker automatically advances the displayed stages. That explicit future build uses the configured estimate endpoint; this investigation did not call it. If pricing is unavailable, its exact sanitized reason stays visible and no authorization/video submission is possible.
5. Review the resulting package and estimate. Leave video transport disabled. Actual Final Video generation remains outside this repair and requires the existing separate activation/authorization gates.

Optional developer-only reinspection: `npm run repair:ugc-v3-flow -- --project 3f6d210e-5e85-410b-8c37-3881507eec60`. Add `--repair` only for a confirmed pending cleanup; this project's cleanup is already complete. Offline flow checks: `npm run test:ugc-v3-flow`.
