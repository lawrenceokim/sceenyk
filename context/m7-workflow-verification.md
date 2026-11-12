# Milestone 7 — Full Workflow Verification (2026-11-09)

**Source review and scoped implementation complete. Manual end-to-end, hosted database/worker/storage, provider and visual acceptance remain pending.** This is the current M7 record for product Phase 2 Basic/Pro Studio, not the older UGC Location milestone. The owner's scope prioritizes implementation and focused checks; it excludes paid generation, production data changes, browser automation, large suites and builds. Earlier milestone test counts are historical evidence, not tests rerun here.

## Confirmed corrections

The existing Studio owner now reconciles status when a committed Basic/Pro mode changes, including with the Workflow drawer closed. Mode metadata is persisted independently of the brief; the old bootstrap watched only project/brief revision and could leave retained-duration flags and merge eligibility from the previous mode until another refresh. The fix reads owned status once per changed mode, preserving the mounted editor, inputs, references, clips and Preview. It never replays a mutation. Retained multi-character Basic views also disable Package build/approval and single-video generation, matching the existing server rejection.

The Package tab now distinguishes approval evidence from authority for a future paid request. A current non-deleted saved execution proves approval of its exact package even when its one-use authority expires or is consumed. Previously the tab could show Ready for review while Progress correctly retained that approval. Deleted executions do not supply this display evidence; stale packages remain stale. The approval label does not enable generation, renew authority or bypass `canSubmit`. After the first Pro source approval, maximum/consent controls are disabled along with package rebuilding and approval. They display the server's saved authorization maximum and execution approval instead of local unsaved consent values, keeping the frozen package view read-only.

Changed implementation: `components/creation/v3-workflow-preview.tsx`. Focused regression coverage extends `scripts/check-v3-workflow-progress.mjs`. No backend, provider, worker, storage, schema, pricing or authorization implementation changed.

## Workflow source review

These are traced source contracts, not a claim that a real provider or deployed workflow passed this review.

| Handoff | Existing owners and consistency checks |
| --- | --- |
| Create, save, reopen, switch mode | `lib/projects/server.ts`, `lib/studio-mode/{server,client-state}.ts`, `creation-workspace.tsx`: authenticated ownership, stable first-save UUID, saved brief/media/reference names, separate saved mode and retained Pro settings. Legacy projects are not automatically enrolled into V3. |
| Character/Product/Location | `runtime-server.ts`, `worker.ts`, `generation-context.ts`, `reference-retention.ts`: saved original identity/name, independently approved sheets, current reference binding and selected-only confirmed replacement. Accepted/saved responses recover without a fresh OpenAI request; unknown outcomes remain explicit. Product stays optional according to the existing creation type. |
| Storyboard | `storyboard-director.ts`, `connected-story.ts`, `worker.ts`: approved references/cast, saved duration and exact connected clip boundaries; one whole-story approval. Saved prompts and historical creative recipes are preserved. |
| Package and estimate approval | `runtime-server.ts`, `package.ts`, `execution-package.ts`: immutable source/Storyboard/reference/output/quote hashes, explicit cost approval and finite expiring one-use authority. Editing before the first source approval invalidates stale downstream currentness; package approval alone does not freeze the draft. |
| Single-video Basic/short Pro | `runtime-inspection.ts`, `execution.ts`, `worker.ts`: existing owned package admission and worker-only submission; saved result review, confirmed rejection/deletion and direct final approval. Single-video output bypasses M6 merging. |
| Connected Pro clips | `clip-runtime.ts`, migration 098, `v3-clip-manager.tsx`: ordered logical clips and immutable attempts, independent explicit attempt-cost approval, cumulative committed/reserved maxima and one-use authority. Approved clips cannot be replaced or refunded into fresh authority. |
| First Pro source approval | `creative-lock*.ts`, migration 100: atomic capture plus database mutation fences, pinned original brief/references/Storyboard/package/estimate, preserved approved runs and conservative historical recovery. Remaining unapproved attempts retain their finite authority. Joined approval never creates a source lock. |
| Merge, reject, final approval | `merge-runtime.ts`, `merge-worker.ts`, migration 099, `use-v3-final-operation.ts`: explicit ordered approved-input manifest, existing local FFmpeg task/lease/receipt recovery, private output, lineage checks and final-only multi-clip completion. Rejection deletes only the merged candidate; a new merge reuses approved clips without paid generation. |
| Refresh/restart and private access | `runtime-store.ts`, `worker-recovery.ts`, `execution.ts`, `final-operation-server.ts`, V3 route: owner-bound reads, private no-store responses, refreshed signed media, retained acceptance/output receipts and no paid POST replay after known/unknown submission. Browser pending markers provide no authorization. |

Lock review includes short Pro and connected Pro viewed in Basic. Existing valid approved projects read their captured package rather than today's compiler/pricing policy. Missing authentic evidence stays `needs_review`; damaged bindings fail currentness; missing migration is `setup_required`. Originals, approvals, quotes, grants, clips and merged outputs are not rewritten to manufacture recovery. Actual private bytes and media integrity still require existing readback checks. See [lock lifecycle and recovery](pro-clip-approval-lock.md).

**Historical M7 source-access behavior; superseded policy, new enforcement pending.** The Basic/Pro switch remains freely accessible. Existing authenticated ownership, administrator rollout/provider switches, resolution/reference capability gates, immutable quote bindings, finite cumulative authorization, consumed-authorization uniqueness and worker leases remain authoritative. M7 introduces no payment integration or new spending permission. Payment/provider concurrency and live owner isolation are reviewed in source here; their runtime acceptance remains manual. Follow the [current hackathon policy](overview.md#paypal-ai-hackathon-commercial-policy-2026-11-09) for planned verified Pro entitlement and universal demo restrictions; M7 acceptance does not verify these new controls.

## Focused verification and limits

- `node scripts/check-v3-workflow-progress.mjs`: **290** offline saved-state/render/handler/effect checks, including mode-switch reads, frozen outputs, expired/consumed approval display, deleted-run behavior and locked Package controls.
- `node scripts/check-v3-clip-lock-ui.mjs`: **48** offline read-only input/render/callback checks.
- `npx --no-install tsc --noEmit --incremental false`, focused ESLint and `git diff --check`: pass.

Both fixtures report **zero real network calls**. Windows esbuild required normal filesystem access to dependencies after the restricted invocation failed. No Next.js issue qualified for feedback. No SQL/worker/media suite, browser automation, full build, provider request, remote migration, production mutation or deployment ran. Existing SQL/payment/restart invariants were traced in source; they were not re-proven by these UI checks. Full M7 acceptance awaits the owner's manual run below.

## Required setup

M7 adds **no migration, environment variable or dependency**. Before manual acceptance, verify the existing [V3 deployment prerequisites](generation-v3-phase3.md#automatic-v3-processing-and-production-setup-2026-11-04) and Basic/Pro migrations 094–100 with their prerequisites. Migration **100 follows 099**; apply only missing reviewed migrations through the normal coordinated app/worker rollout. Run the read-only [setup audit](../scripts/verify-v3-setup.sql), investigate `needs_review` records using genuine evidence and restart app/worker on matching source. Do not treat a transport failure as evidence that a migration is absent.

Use the existing supervised V3 worker, persistent private `UGC_V3_RECOVERY_DIR`, private R2 and local FFmpeg/ffprobe installation. Paid submission may stay OFF while checking existing outputs, locking, recovery and local merging. New reference/video generation during the owner's later manual run still requires the existing configured provider access and explicit spending approval. No setup was changed during this work.

## Manual Basic checklist

Use a separate new Basic test project. Generation steps are for the owner's later authorized manual run; this review did not execute them.

1. Create UGC, save a prompt/settings, upload and name one Character and optional Product as appropriate. Refresh/reopen: same project, mode, inputs, sources and names. Check an existing historical project still opens through its own workflow.
2. Generate/review/approve each required sheet and Location. Cancel replacement once; if replacing an unapproved sheet, confirm only that selection changes and the other approved references persist. Refresh during processing and review saved recovery guidance without submitting again.
3. Generate/review/approve the Storyboard; build the exact package/estimate and explicitly approve its maximum. Before video generation, edit/save a creative input: old approval must not authorize different content. Restore through the normal currentness/reapproval flow.
4. Generate one video, refresh/reopen during processing, review Preview, then approve. Confirm no merge step and Complete only after final approval. Package remains visibly approved after its submission authority is consumed/expired.
5. On a separate unapproved candidate, cancel rejection, then confirm Reject and Delete. Confirm no automatic replacement; any new generation requires the existing fresh approval flow. Reopen and verify the deletion/recovery state persists.

## Manual Pro checklist

1. Create a short Pro project (20s) with at least two named Characters; save/reopen and independently generate/approve their sheets, optional Product, Location and Storyboard. Check names/speakers and regenerate only a selected unapproved sheet. Build/approve the package. Complete the single-video review path; source approval locks inputs and bypasses merging.
2. Create a separate 40s or longer project. Verify the whole Storyboard, exact ordered <=30s clip boundaries, total duration, aspect ratio/resolution, references and estimate before approving. Package approval must still permit creative editing before the first source approval; stale authority must not generate changed content.
3. Generate/review the first clip and approve it. Verify the lock notice; prompts, names, source removal/replacement, settings, Storyboard/package rebuild and package consent controls become read-only while disclosures and Preview remain usable. Refresh/reopen: exact frozen values and approved clip persist.
4. Generate remaining clips with existing finite authority. Where a grant expired, approve only that clip's cost. On a separate unapproved attempt, cancel then confirm rejection; wait for deletion and explicitly approve replacement cost. Confirm neighboring approved bytes/approvals remain and prior spending stays counted. All clips approved must say ready to merge, without completing the project or merging automatically.
5. Refresh/reopen or restart the existing worker during accepted processing and during local merging. Confirm the same attempts/request IDs/results recover, no duplicate generation, and unknown outcomes offer reconciliation rather than new paid work. Exercise duplicate clicks only in isolated test projects.
6. Choose Merge Videos, review the saved final Preview and approve it; only then should the long project be Complete. On a separate unapproved merged candidate, reject/delete and merge again. Approved clips remain intact; no extra provider generation or authorization is needed for local merging.
7. Test Pro → Basic Cancel, then confirm and return to Pro with the drawer both open and closed. Retained cast/durations/clips/approvals/final media remain saved; incompatible new generation stays blocked in Basic; returning to Pro restores status without a page reload or workflow action.
8. Open an existing approved Pro project for read-only inspection before/after refresh/restart. Confirm exact original frozen inputs, estimate, approvals and merged output; no rebuild, regeneration or new payment is requested. `needs_review`/`damaged`/`setup_required` must remain explicit and never fabricate a valid approval.

For both modes, use a second account to confirm foreign project/media/actions are denied. With paid generation disabled, new submission must stay blocked while existing reviews/recovery/local merges remain available. Check desktop/narrow/mobile layouts, both themes, keyboard/focus/dialog Escape, reduced motion, Preview playback and signed-link refresh manually. Review actual identities, voices/lip sync, clip order, seams/audio continuity, geometry and total duration; offline checks cannot establish audiovisual quality.
