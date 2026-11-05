# Phase 2: Basic & Pro Studio Modes

**Status: In Progress. M1 complete in source/offline verification; M2–M7 Planned / Not Started.**
**Decision date: 2026-11-05. Current implementation scope: M1 mode selection, visibility and metadata persistence only.**

This specification defines the product phase and records its bounded M1 implementation. M1 extends the existing Studio with mode metadata only. It authorizes no provider requests or live migrations and establishes no hosted acceptance. Existing setup, security, pricing and manual acceptance prerequisites remain in force. All character/style-gallery/duration/clip/merge extensions below remain future requirements.

## M1 implementation and setup

**Complete in source and focused offline verification. Manual migration 094 and full hosted/manual visual acceptance remain pending.** The actual repository filename is `phase-2-basic-pro-studio.md`; this is the specification referenced as `phase2-basic-pro-studio.md` in the M1 request.

- The expanded sidebar has compact Basic/Pro native-radio segments immediately above Collapse, occupying 50% of the navigation content width with 24px-high segments and 11px labels. The active-mode caption is screen-reader-only. The collapsed rail retains full-width labelled B/P controls; existing mobile navigation has the same compact switch. A small active-mode badge in the existing Studio toolbar remains visible when mobile navigation is closed. Shared Tailwind tokens preserve purple Pro selection and both themes; no stylesheet is added.
- Both modes expose exactly the current working features. There is no subscription/payment gate, upgrade prompt, new duration/style/gallery/character/clip control or generation-mode branch. M2–M7 are not started.
- `components/workspace/studio-mode-provider.tsx` owns presentation state outside the mounted editor. Its independent store waits for submitted writes across navigation, ignores late/wrong-account responses, and preserves the current mode on failed saves. Metadata actions return values without route revalidation, cookie changes or navigation. The loading/error badge does not claim a mode before it has been restored.
- `lib/studio-mode/server.ts` independently resolves Clerk/application identity and calls new service-only owner-scoped read/save RPCs. No owner ID is accepted from the browser. Per-project mode wins over preference; simply opening a project changes neither. An explicit selection atomically saves the current project mode (when present) and the owner's preference.
- Apply [094](../supabase/migrations/20261105009400_studio_modes.sql) **manually after 093** before using authenticated persistence. It adds checked `studio_mode` text columns, default Basic, to existing `projects` and `creation_preferences`. Old projects become Basic without a creative-data backfill. A new insert-only metadata trigger makes both ordinary and atomic V3 new projects inherit the owner's current committed preference. Existing Settings upserts preserve mode and mode upserts preserve Settings. No new table or historical function replacement; existing RLS/grants/triggers remain.
- Mode is deliberately absent from `ProjectDraft`, creative settings, generation context/hash recipes, Storyboards, packages, provider requests and authorization. Mode writes change only metadata and ordinary project/preference timestamp bookkeeping. Creative-column invalidation triggers do not fire; saved references, packages/currentness, approvals and videos remain identical.
- Guest selection persists in a guest-only browser key with a workspace-memory fallback; authenticated state is server-owned and isolated per account. Saving/selecting metadata never saves or resets unsaved creative edits, selected Files, Preview or drawer state. No Pro data is created/hidden/deleted by M1. A dormant incompatible-feature guard and shared confirmation dialog are ready for future feature owners to supply actual incompatibilities; Cancel preserves mode/data and confirmation changes metadata only.

Verification: **63 disposable PostgreSQL/service/action checks**, **79 client-state/actual-selector checks**, **22 isolated mounted-shell/Studio browser checks**, and **270 existing V3 foundation/pricing/compiler/V1/V2 compatibility checks** passed. TypeScript, targeted ESLint and whitespace/scope checks passed. The database checks apply all 94 migrations, rerun 094, preserve every existing public function body/grant/configuration plus table RLS/ACL and named triggers, and verify independent owners/projects, inheritance, failures, unchanged saved generation records and package currentness. PGlite serializes execution; this is not native multi-connection load acceptance.

The browser fixture uses the actual mode provider, shell/navigation and Studio layout with synthetic auth/persistence, desktop/collapsed/mobile controls, light/dark selection, native radio keyboard handling, and retained mounted unsaved inputs and a selected local File. All browser external requests are blocked. No hosted account/project mutation, provider/media generation, worker, full production build or deployment ran. Two zero-row connected reads verified existing project/preference columns; no user records were fetched. No qualifying Next.js feedback candidates arose. Full hosted integration and visual acceptance remain manual.

Reproduce: `npm run test:studio-modes`, `npm run test:studio-modes:layout`, `npm run test:ugc-final-v3`, `npx --no-install tsc --noEmit`, targeted ESLint and `git diff --check`. The local esbuild/Chrome fixtures require workspace filesystem/process access outside the restricted Windows sandbox; network/provider access is not needed.

## Scope and precedence

**Confirmed requirements** below come from the owner's Phase 2 request. **Recommendations** describe proposed implementation choices. **Needs confirmation** identifies unresolved design or provider details; these must not be represented as implemented facts.

Product **Phase 2: Basic & Pro Studio Modes** is distinct from the older [M10 V3 Phase 2 persistent preflight](generation-v3-phase2.md) and the earlier visual redesign phases. It does not reset their status or replace their historical evidence. This specification owns the planned Basic/Pro behavior; [V3 architecture](generation-architecture-v3.md), [current runtime/workflow](generation-v3-phase3.md), [resolution contract](v3-video-resolution.md) and [UI context](ui-context.md) retain their existing responsibilities. Older claims that V3 is entirely Not Started are dated snapshots; consult the runtime and tracker for source status and remaining acceptance.

There are three future product tiers: **Basic, Pro and Advanced**. This phase delivers only Basic and Pro. Both modes are freely accessible through a switch for the hackathon MVP, without subscription payments or tier entitlements. Free mode access does not waive existing finite generation spending authorization, cost estimates, administrator provider controls or ownership checks. No new credit-wallet/payment integration is implied. Advanced is reserved for future development; no Advanced features, paid restrictions or implementation are defined here.

## Confirmed product requirements

| Area | Basic | Pro |
| --- | --- | --- |
| Studio | Preserve the existing working experience | Extend the same Studio and generation owners |
| Characters | One uploaded character and its existing reference flow | Multiple uploaded characters, individual names and separate Character Sheets |
| Reference review | Preserve existing approval/regeneration | Independent approval/regeneration for each character |
| Visual style | Existing dropdown | Selectable image cards: Original, Cartoon, Cinematic, Anime, Realistic |
| Duration | Preserve current choices up to 30 seconds | 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120 seconds |
| Video generation | One continuous video, then final review/approval | Up to 30s uses the same single-video path; longer projects use sequential clips of up to 30s |
| Multi-clip review | No added clip workflow | Saved preview, status, approval and selective regeneration for every clip |
| Composition | No merge stage for one clip | Explicit **Merge Videos** after every required clip is approved; final merged-video review |

Existing Basic duration choices are currently 5, 10 and 30 seconds, with 15 seconds retained for historical read/save compatibility in [project options](../lib/projects/options.ts). Preserve those behaviors; the new Pro list does not remove historical values or change historical execution eligibility. Existing optional Product behavior, Creation Type, resolution selection and other working controls remain. Multiple products and a Freestyle generation redesign are not Phase 2 requirements.

### Mode selection and persistence

- Plan a compact Basic/Pro segmented switch in the sidebar immediately above Collapse. Show the active mode clearly with text/state as well as purple selection styling.
- Display the active mode in the Studio header, including mobile. Keep mode selection reachable through the responsive sidebar; do not create separate Basic/Pro routes or pages.
- Switching updates available controls within the mounted Studio. Preserve Sources, Preview, Properties, Workflow drawer, unsaved edits and current media selection.
- Persist both the user's preferred mode and each project's saved mode. Opening a project restores that project's mode even when the user's preference differs. An explicit confirmed project-mode change may save a new mode; opening a project alone must not rewrite its mode or the preference.
- Switching a Pro project to Basic preserves every saved character, Character Sheet, clip, approval, generated asset and Pro setting. If incompatible features exist, explain the restrictions and require confirmation before changing mode. Cancel preserves the entire current state. Mode switching must never trigger deletion, generation, merging or additional paid requests.

**M1 decision:** use the preferred mode for a new draft; default to Basic when no preference exists. Interpret older projects with no mode as Basic without rewriting their history or enrolling legacy projects into V3. Selection commits after its metadata write succeeds; a concurrent new-project insert inherits the current committed preference. **Future recommendation for M2–M7:** keep a reversible Basic-compatible working selection alongside retained Pro state. For example, a future multi-character 70s Pro project needs an explicitly chosen Basic character and supported duration before Basic generation can proceed; confirmation alone must not silently pick, shorten or discard content. Switching back must restore retained Pro configuration. M1 has no incompatible feature data and does not truncate/change any input.

### Multiple characters and visual style

Each Pro character has a stable project-owned identity, an uploaded source, a display name, its own Character Sheet versions, approval and regeneration state. Changing one character must not replace another character's image or approval. Reuse the existing OpenAI reference prompts/templates, private storage, approval and explicit regeneration safeguards with per-character bindings. Names are display data, never storage keys or the sole identity key.

OpenAI must carry each approved character's identity into reference generation and Storyboard direction; the compiled Higgsfield instructions and reference bindings must preserve those identities in final videos. Bind dialogue, actions and shot appearances to the correct character rather than relying on identical or ambiguous names. Identity fidelity is an acceptance requirement, not an unconditional provider guarantee. Missing references, unsupported reference counts or ambiguous bindings block affected generation before spending.

The Pro visual-style gallery replaces only the Basic dropdown presentation. Each responsive image card has the existing style name and a clear selected state. Both controls write the same saved visual-style value. Apply that value consistently to every Character Sheet, Product Sheet, Location, Storyboard and final video. Preserve current stale-input detection and required regeneration/reapproval when a changed style makes saved creative work incompatible; keep unrelated valid approvals and historical bytes. Do not regenerate references merely because the user changes mode or sees a gallery.

**Recommendation:** reuse approved static style imagery if suitable assets exist; confirm the five gallery assets before implementation. This task creates no images and adds no provider calls for thumbnails.

### Full-story planning and clip boundaries

The AI Director first plans **one connected story for the full selected duration**, then prepares complete instructions for each sequential clip. A Storyboard scene/shot remains a creative unit; a user-facing **clip** maps to a V3 **Generation Segment**, not one request per scene. Multiple scenes may be inside one clip.

| Selected Pro duration | Planned sequential clips |
| --- | --- |
| 10s, 20s, 30s | One continuous clip of the selected duration |
| 40s | 30s + 10s |
| 50s | 30s + 20s |
| 60s | 30s + 30s |
| 70s | 30s + 30s + 10s |
| 80s | 30s + 30s + 20s |
| 90s | 30s + 30s + 30s |
| 100s | 30s + 30s + 30s + 10s |
| 110s | 30s + 30s + 30s + 20s |
| 120s | 30s + 30s + 30s + 30s |

Reuse [the existing V3 planner](../lib/final-video-generation-v3/planner.ts) where compatible. It minimizes requests over approved scene boundaries and verified supported durations; it does not blindly cut at 30s. The Pro Director must therefore plan compatible boundaries at the required 30s intervals before Storyboard approval. Validate exact full-duration coverage and the table above before package approval. If approved content cannot meet the boundaries/capabilities, explain the issue and require an explicitly reviewed replan. Never silently split dialogue/actions, retime, pad, truncate or regenerate an approved Storyboard during package creation.

Carry character identity/appearance/outfits, Product shape/position/handling, Location geography/lighting, visual style, camera/screen direction, physical actions and audio intentions across boundaries. Each clip needs both absolute project timing and local instructions, its cast/reference bindings, and explicit entry/exit continuity for actions, positions, grips, eyelines, camera and ongoing sound/dialogue. Avoid speech crossing a clip boundary during planning. Preserve native audiovisual output without adding external TTS or lip-sync providers. Seamless identity, voice and physical continuity require actual review; optional end-frame/audio conditioning remains unverified until supported through the existing Higgsfield adapter and separately approved.

### Clip generation, review and regeneration

Save each clip's order, duration, immutable plan/package lineage, attempt, authorization, provider receipt, private output, review and approval independently. Users preview, approve or request regeneration of one clip while accepted clips remain saved and unchanged. Reloading or restarting a worker restores real state; no fake progress or implicit approval.

Regeneration must be an explicit paid replacement action for the selected clip, with its new estimate and the required fresh finite authorization. Preserve accepted clips and their receipts/bytes; do not rerun the full video or reuse a consumed approval. Keep the existing duplicate-request, lease, stale-input, unknown-outcome and recovery protections. Provider-free recovery of saved output or a known accepted request must remain distinct from regeneration. Rejecting a clip or final candidate does not automatically buy a replacement. Deletion, if separately requested, retains existing confirmation and scoped cleanup behavior.

**Recommendation:** introduce versioned logical clip slots with immutable attempts and an explicitly selected approved attempt. Bind an assembly revision to the exact approved attempt hashes in order. A replacement invalidates a final assembly that references the replaced selection, without removing other approvals. If a creative dependency or neighboring continuity genuinely changes, explain the affected approvals and require review; do not silently regenerate adjacent accepted clips. The exact persistence model is unresolved and must support reuse without rebinding old paid authority.

### Explicit merging and final approval

For more than one required clip, show **Merge Videos** only after all required current clips are approved and compatible. The user explicitly requests merging; **approval of the last clip must not automatically enqueue a join in the future Pro path**. A single clip goes directly to the existing final review without a redundant merge or intermediate approval.

Reuse the existing [local V3 FFmpeg join](../lib/final-video-generation-v3/join.ts) outside Next.js request execution. Bind the job to the owned current package/assembly and the exact ordered approved attempt IDs/result hashes. Validate resolution, dimensions, aspect ratio, video/audio codecs and containers, frame rate/timebase and audio channel/sample-rate compatibility before merging. Use supported local normalization only when it preserves the approved story and native audiovisual timing. Preserve the intended total duration and avoid noticeable breaks where possible; no unapproved overlaps, speech trimming, creative sound replacement or invented crossfades. Exact tolerances need confirmation.

Save/read back the private merged video, expose it in the existing Studio Preview and use existing Workflow final approval or rejection. Only explicit approval of the current valid final candidate completes the project. A merge failure retries local joining/validation/publication with the same approved inputs; it cannot cause OpenAI or Higgsfield generation. Repeated merge clicks must deduplicate. A clip replacement makes a stale merged candidate ineligible for approval but preserves its history unless explicitly deleted.

## Existing foundations and required extensions

The following records the **source-confirmed planning baseline** plus the implemented M1 metadata extension, not deployed schema/provider/visual acceptance. M1 verified existing columns with two zero-row connected reads; 094 remains unapplied remotely.

| Existing source | Reuse and gap |
| --- | --- |
| [Projects and saves](../lib/projects/types.ts), [validation](../lib/projects/validation.ts), [preferences](../lib/settings/contract.ts) | Existing creative/save/preference contracts keep their original shapes. M1 uses the independent [mode service](../lib/studio-mode/server.ts) and metadata columns; `SaveProjectInput.mode` still means create/update. |
| [Creation preferences migration](../supabase/migrations/20261016002800_creation_preferences.sql) | M1 extends this existing owner with `studio_mode` through 094, preserving aspect ratio/category and the original Settings RPCs. No duplicate preference table. |
| [Studio asset roles](../supabase/migrations/20261020003200_studio_creation_inputs.sql), [reference resolution](../lib/final-video-generation-v3/creative-inputs.ts) | Private `project_assets` roles/reference IDs/names are reusable. V3 currently rejects multiple characters or products. Pro requires character-specific resolution, approval/currentness and task keys. |
| [Generation context](../lib/final-video-generation-v3/generation-context.ts), [Director contract](../lib/final-video-generation-v3/contract.ts) | Saved style and reference dependencies are reusable. Current latest-reference handling is per kind, and Director speech drops the inherited character binding; neither establishes multiple-character identity. Add versioned cast/speaker bindings without rewriting historical hashes. |
| [V3 planner](../lib/final-video-generation-v3/planner.ts) and [runtime](../lib/final-video-generation-v3/runtime-server.ts) | Minimum-segment planning, per-segment estimates/authority and review exist. The current Generate action admits package segments together; selective replacement needs a new scoped action. |
| [Runtime schema](../supabase/migrations/20261029007700_ugc_v3_runtime.sql) and [controlled-video successor](../supabase/migrations/20261101008700_ugc_v3_controlled_video.sql) | Existing `ugc_v3_artifacts`, `ugc_v3_tasks`, `ugc_v3_quotes`, `ugc_v3_run_authorizations`, `ugc_v3_runs` and events are foundations. Artifact uniqueness is project/kind/version. Migration 087 replaces the original package/segment uniqueness with one non-deleted run per package/segment; consumed authorization stays unique forever. Current admission also blocks fresh authorization while any non-deleted package run exists. This supports confirmed deletion/replacement for the current path, not selective Pro replacement alongside accepted clips. Preserve the active-run and consumed-authority fences. |
| [Runtime approval](../lib/final-video-generation-v3/runtime-server.ts), [join](../lib/final-video-generation-v3/join.ts) | Current approval automatically queues joining once all segments are approved. Pro needs explicit merge admission and versioned attempt selection; the current join resolves approved runs by package/segment. Preserve legacy scheduling and Basic behavior. |
| [Current pricing/resolution](v3-video-resolution.md) and [worker](generation-v3-phase3.md#automatic-v3-processing-and-production-setup-2026-11-04) | Retain saved resolution, local approximate price versions, finite USD authority, supervised tasks and private recovery. Unpriced higher resolutions remain blocked; free Pro access cannot bypass that guard. |

OpenAI remains the only reference-generation/creative-direction provider. Higgsfield remains the video/native audiovisual provider. FFmpeg is local and used for joining only when there are multiple approved clips; existing technical media inspection remains. Add no external AI providers. Preserve existing estimates, resolution choice, package approvals, spending controls, worker execution, leases, known-request recovery, output trust, storage verification and project ownership protections. Existing Basic projects and historical V1/V2/V3 generations remain readable and compatible in their original workflows; mode fallback must not enroll, migrate or reinterpret historical executions.

## Expected database work and safeguards

**M1 uses additive manual 094 as documented above; M2–M7 persistence remains planned.** The existing M1 project/preference columns were verified through connected zero-row reads, and the migration checks types before adding its fields. Before later schema work, inspect the actual catalog, functions, grants, constraints, triggers and RLS. Define transactional, rerunnable additive migrations against verified objects and retain named realtime/RLS behavior. New Pro feature relations/fields/RPCs and later migration numbers remain undecided.

Expected responsibilities are: owner preferred mode and project saved mode; reversible retained Pro configuration and active Basic-compatible inputs; stable character-to-source/sheet/task/approval bindings; versioned full-story/clip plans; immutable selective attempts and fresh authorizations; current approved attempt selection; explicit deduplicated merge intents/manifests and final approval lineage. Reuse existing owners before adding persistence. A new UI list alone cannot implement these contracts. No destructive backfill, weakening of active-run/consumed-authority uniqueness, historical JSON/hash rewrite or automatic media cleanup is acceptable.

Every mutation must reload authenticated owner/project state server-side, validate supported mode/capabilities, and enforce matching project/reference/package/attempt lineage in trusted database operations. Serialize mode/save/approval/generation conflicts; active or uncertain paid work must not be hidden, canceled or resubmitted by a mode switch. A presentation-only mode switch grants no new paid authority. Changed effective creative/output inputs make dependent plans/approvals ineligible until reviewed, while saved history remains intact.

Show per-clip and total estimates before initial authorization. Replacement estimates must distinguish additional spend from already incurred work and enforce a finite explicitly approved cumulative budget/request count. Reuse versioned local approximate pricing and separate actual provider charges; do not fetch new prices or claim zero-cost generation because mode access is free. Preserve immutable original approvals and unknown-outcome reconciliation across every revision, including a rebuild. V3's current USD authorization remains separate from the legacy credit wallet.

## Planned Studio presentation

Keep Sources, Preview, Properties and the Workflow drawer. Sources gains multiple named character inputs and corresponding sheet controls. Properties gains the Pro style gallery and extended duration choices. Add a compact clip timeline within the existing Workflow/Preview interaction patterns, showing order, duration, real generation/review status, Preview, Approve and Regenerate for each clip. Keep final merged-video review in the existing Preview and Workflow; show Merge Videos when eligible. Exact timeline placement is a recommendation to settle before implementation, not a new panel or page requirement.

Follow [the design system](design-system.md) and [Styling Policy](code-standards.md#styling-policy): current purple accents, Inter typography, spacing/radii, shared shadcn/Base UI controls, responsive containment and identical light/dark structure. Use Tailwind utilities and the single existing `app/globals.css`; no component/page CSS or CSS Modules. Provide labelled keyboard-operable single-selection controls, visible focus and selected state beyond color, meaningful style-card labels, status announcements and accessible confirmation/focus return. Preserve native internal scrolling and reduced motion. Keep provider IDs, hashes, codecs and worker settings out of ordinary mode/clip controls; show concise actionable limitations instead.

## Implementation roadmap

**M1: complete in source/offline verification; manual 094 and hosted/visual acceptance pending. M2–M7: Planned / Not Started.** Dependencies are ordered; do not begin later milestones automatically. Acceptance must distinguish source/offline checks from remote migration, provider, worker, hosted and manual visual results.

### M1 — Studio mode selection and persistence

**Complete in source/offline verification within the owner's narrowed M1 scope.** See [implementation/setup/evidence](#m1-implementation-and-setup). Both modes share the current working features; a representative future multi-character/multi-clip downgrade cannot be live-tested before those features exist. Its dormant confirmation guard is checked; no Pro data is deleted or hidden now.

- **Depends on:** current project/preference services, Studio/sidebar/header and compatibility design.
- **Planned work/database:** sidebar segmented selector and header label; server-authoritative preferred/project modes; extend existing project/preference persistence; define reversible retained Pro configuration. No mode-based subscription/entitlement checks.
- **Safeguards:** Basic fallback for missing mode without historical rewrites; project mode takes precedence; confirm incompatible Pro-to-Basic switches; preserve unsaved/saved work, all assets and in-flight tasks; do not repurpose save-operation `mode`.
- **Acceptance:** new-draft preference, save/reopen/project override, mobile identification/selection and keyboard focus work; Cancel changes nothing; confirmed downgrade preserves a representative multi-character multi-clip Pro project and switching back restores it; foreign-owner/forged mode/concurrent saves fail safely; no paid request or deletion on switching.

### M2 — Pro multiple-character support

- **Depends on:** M1 and verified OpenAI/Higgsfield reference limits.
- **Planned work/database:** extend existing asset/reference/task/artifact owners for stable character identities, names, independent sheet versions and approvals; version downstream cast/speaker/currentness bindings. Confirm whether additive fields/keys suffice before proposing a new relation.
- **Safeguards:** preserve Basic's one-character checks and historical hash recipes; reuse reference prompts/providers; scope regeneration/deletion to the selected character; never identify by display name alone.
- **Acceptance:** at least two distinct characters survive upload/name/save/reopen and independent approval/regeneration; another character's valid approval/bytes remain unchanged; missing/foreign/stale/duplicate bindings and unsupported counts block before spending; later manual reference and video review confirms correct identities and speakers.

### M3 — Pro visual-style gallery

- **Depends on:** M1; integrate M2's cast approvals for full acceptance; approved gallery artwork.
- **Planned work/database:** five labelled image choices reuse the existing saved style; no separate style column/table is expected. Only a verified compatibility need may justify further persistence.
- **Safeguards:** preserve the Basic dropdown, shared theme/accessibility, mode-switch data and current style-dependency checks; no thumbnail-generation calls.
- **Acceptance:** all five styles select and reopen correctly through either presentation; multiple sheets, Product, Location, Storyboard and video bind the same style; incompatible changes require explicit regeneration/reapproval; selection/focus/layout work in both themes and responsive manual review.

### M4 — Extended duration and multi-clip Storyboard planning

- **Depends on:** M1–M3, verified continuous-duration/output/reference capabilities and resolution pricing readiness.
- **Planned work/database:** Pro's twelve duration options; mode-aware save/database duration validation; version full-story/cast/continuity and clip-plan snapshots using existing V3 source/package owners where suitable. Preserve Basic/legacy duration contracts.
- **Safeguards:** Director plans one full story and compatible 30s boundaries before approval; immutable exact-duration compilation; no creative changes, hidden AI calls or historical hash mutations in package building.
- **Acceptance:** all twelve durations cover the exact selected total and match the segmentation table; 20s uses one request; long plans preserve ordered scenes, speaker identity, action/audio continuity and output settings; illegal boundaries/unsupported capabilities block before spending; Basic and historical plans remain unchanged.

### M5 — Per-clip generation, review and regeneration

- **Depends on:** M2/M4 and reviewed attempt/authorization design.
- **Planned work/database:** timeline/actions over existing queue/worker/storage; versioned logical clip/immutable attempt selection and new per-attempt quote/authorization admission. Audit existing package/segment uniqueness and recovery before designing extensions; never weaken duplicate protections.
- **Safeguards:** exact scoped replacement consent and additional-spend estimates; finite cumulative ceiling; accepted clips untouched; restart/saved-result recovery, unknown outcomes and concurrent clicks cannot create duplicate paid requests.
- **Acceptance:** generate/reload/review each clip independently; replace one unwanted clip with fresh explicit authority while accepted clip hashes/receipts remain identical; expired/stale/insufficient/foreign authority is rejected; failure/restart recovery produces no extra POST; replacing a selection invalidates its old assembly without automatic neighbor regeneration. Actual identity/audio quality remains separate provider/manual acceptance.

### M6 — FFmpeg merging and final approval

- **Depends on:** M5's approved attempt selection and local FFmpeg/runtime/storage readiness.
- **Planned work/database:** explicit Merge Videos admission, immutable ordered-input manifest and deduplicated local task; extend existing join artifact/event/final-approval owners. Gate automatic joining out of the future Pro branch while preserving legacy behavior.
- **Safeguards:** revalidate all current approved inputs and stream compatibility server-side; local-only retry; no automatic merge after approval or refresh; final rejection never regenerates clips; no Complete before final approval.
- **Acceptance:** the last clip approval queues no Pro join; early/stale/foreign/duplicate merge requests are rejected or deduplicated; correct order/format/audio/resolution/aspect/total duration is verified; local merge/save recovery reuses identical source bytes without provider calls; final Preview approval/rejection, stale-final blocking and completion work; one clip bypasses merging. Review visible/audible seams manually.

### M7 — Full workflow verification, responsive testing and documentation

- **Depends on:** M1–M6 plus approved setup and scoped live testing authorization.
- **Planned work/database:** no new schema expected solely for verification; inspect/apply only separately reviewed required migrations. Update architecture, workflow, UI, standards and tracker to actual accepted behavior.
- **Safeguards:** use isolated new test projects and fresh explicit paid authority; do not convert historical executions or reset balances; do not infer hosted/provider acceptance from fixtures. Preserve commercial/access/worker rollout controls.
- **Acceptance:** complete Basic regression and Pro short/long workflows through final approval; verify two-owner isolation, save/reopen/downgrade restoration, per-character/per-clip failure/recovery, financial concurrency and merge behavior. Record responsive/mobile/keyboard/light-dark/reduced-motion review and real continuity/audio/format observations separately. The future full workflow phase includes backend/financial work; UI-only slices still follow Fast UI Development Mode. No tests, provider calls or responsive suites are run by this documentation task.

## Unresolved technical questions

1. **Resolved for M1:** separate metadata columns/RPCs, project precedence, committed-preference inheritance, serialized mode writes/late-response guards and no generation invalidation. **Deferred to the feature milestones:** representation of reversible Pro-only configuration and compatibility restrictions once such features exist. Manual 094/hosted integration remains pending.
2. **M2:** maximum supported Pro characters and per-request reference allocation within verified provider limits; stable cast/speaker schema, multi-view selection and independent per-character currentness/task keys. No unlimited-character promise.
3. **M3:** approved five-card artwork and exact gallery/timeline placement in the existing responsive Studio.
4. **M4:** versioned Director/SQL validation for fixed clip boundaries and long-story speech/physical continuity; whether existing limits fit 120s and the selected cast. Do not raise shared historical limits blindly.
5. **M5:** selective attempt/package lineage that preserves unchanged accepted clips without rebinding authority; cumulative replacement budgets, authorization expiry and concurrent selection/admission fences under current uniqueness constraints.
6. **M6:** explicit merge action/manifest persistence and race protection; codec/sample-rate/frame-rate policy, permitted local normalization, output-duration tolerances and seam quality. Existing join source is a foundation, not proof of this acceptance.
7. **M4–M7:** real account reference/native audio/voice/identity consistency and long-story provider quality; verified resolution-specific rates and hosted worker/resources/FFmpeg capacity for 120s. Retain existing blockers rather than inventing guarantees, rates or another provider.

Advanced remains future/out of scope. These questions do not reopen confirmed requirements or authorize further implementation. **M1 source/offline work stops here; M2 is not started.** Apply/verify manual 094 and review the current switch before separately authorizing the next product feature.
