# AI Workflow Rules

## Current unit - Milestone 4 source Complete (2026-10-23)

**Milestone 4 — Complete in source; manual migration/provider/runtime acceptance pending. Exact next: Milestone 5 — Character Reference Sheet generation. Not Started.** Only analyze_references is newly implemented: official OpenAI SDK Responses image analysis, strict Character/Product schema v1 and reference-analysis-v1 prompts, private R2 inputs and durable per-role records. Read the [provider/schema/privacy/setup contract](reference-analysis.md) before dependent changes. Existing validation now continues under the same claim into analysis. Both completed records lead to queued / character_reference with a non-runnable development pause. No Character/Product sheets, storyboard or video work is authorized.

The user explicitly authorized implementing paid-provider integration for later **manual** testing. OPENAI_API_KEY and OPENAI_REFERENCE_ANALYSIS_MODEL are private; UGC_REFERENCE_ANALYSIS_ENABLED defaults disabled and must be set to 1 before manually starting worker:ugc. This is development opt-in, not a production preparation credit/budget policy. No charging logic is introduced. Missing configuration fails before claiming; old M3 pauses require an explicit local resume command. Retry only known-safe failures through existing bounded infrastructure; never repeat successful roles or replay unknown submissions.

Studio choices corrected to 5/10/30 with legacy 15 read/save/snapshot compatibility. Migrations 038/039 are authored, not applied. TypeScript/focused lint/offline schema checks pass. Do not run workers, enqueue jobs, call OpenAI/private storage, apply SQL, build/deploy or run browser/screenshot/integration/provider suites automatically. Preserve SCEENYK_LOCAL_JOBS_ONLY=1 and all Render/Inngest guards/configuration. Earlier preparation/source-not-implemented statements below are superseded for M4 only; production economics and future stage consent remain unresolved.

## Current unit — Milestone 3 source Complete (2026-10-23)

The current request implements deterministic UGC input validation/readiness only. [Actual contract/setup](generation-jobs.md#milestone-3--ugc-input-readiness-2026-10-23). **Milestone 3 Complete in source; manual migration/runtime acceptance pending. Exact next: Milestone 4 — OpenAI reference analysis. Not Started; do not begin it automatically.** Older Milestone 2 empty-registry/unvalidated-enqueue statements below are historical.

Reuse the centralized server validator and existing Studio option schemas; no duplicated option lists, user-supplied owner/snapshot or private media DTO. Current Studio duration is 10/15/30 and 5 is not implemented; preserve legacy/Freestyle. New jobs require verified owned media and a race-checked immutable v2 snapshot; failed readiness creates no job/charge/provider request. The worker validates the frozen request and records a non-failure development pause before analysis. Migration 037 is authored only; user applies 036/037 and tests manually.

Do not automatically execute local workers/jobs, storage/provider tests, OpenAI, browser/screenshot/full integration suites, production builds or deployed acceptance. Only minimal TypeScript, focused lint and migration/static review. Keep Render/Inngest/local-only guards and hosted configuration unchanged. No financial changes, paid preparation, reference sheets, storyboard or video integration is authorized. Runtime R2 verification is deterministic read-only validation for later user-driven testing; Codex did not invoke it.

## Current unit — Milestone 2 source infrastructure complete (2026-10-23)

The current request authorized only generation-job schema, local worker and centralized state infrastructure. **Milestone 2 — Complete in source; manual migration/runtime acceptance pending. Exact next milestone: 3 — UGC input validation + generation readiness. Not Started; do not start it automatically.** This supersedes the earlier Milestone 1 stop point below. See the [actual UGC job contract/setup](generation-jobs.md#ugc-generation-jobs--milestone-2-complete-in-source-2026-10-23) and [UGC V1 contract](ugc-v1-workflow.md).

Migration 036 adds UGC jobs/events without changing the accounted legacy generation tables. Existing server identity/database/project ownership are reused. The local adapter polls/claims and calls the portable runner; state/heartbeat/lease changes go through claim-fenced RPCs. No default stage handlers exist, so claimed work stops at unimplemented validation with a safe failure. Studio Generate, complete readiness, OpenAI, reference sheets, storyboard, video, provider/asset writes and financial operations are not connected.

The user must manually apply migration 036 after pending prerequisites and may then run `npm run worker:ugc`. Codex did not apply it, create jobs or start the worker. `SCEENYK_LOCAL_JOBS_ONLY=1` remains active; UGC bypasses all Render/Inngest routes and legacy FFmpeg/provider/financial modules. No hosted state was changed/audited.

**Milestone 2 manual-testing restriction:** do not run browser/screenshot/integration/full regression suites, production builds, deployed acceptance, hosted job tests, test jobs or provider calls without explicit instruction. Only minimal compile/type/static checks; do not spend significant time testing. Documentation/manual setup does not authorize executing those operations. Keep source-complete distinct from unapplied schema and unperformed runtime acceptance.

## Current UGC V1 phase — documentation complete, implementation not started (2026-10-23)

The [full UGC V1 contract](ugc-v1-workflow.md) takes precedence over older unit authorizations and next-step/test/hosted recommendations below for UGC. **Milestone 1 architecture/context preparation is Complete. UGC pipeline implementation is Not Started. Exact next implementation milestone: 2 — generation-job schema + local job runner/state machine. Do not start Milestone 2 in this task.**

UGC uses OpenAI for source analysis/reasoning/planning/storyboard/dialogue and Character/Product Reference Sheet images, with central server-only model configuration, not Gemini. Preserve private R2, owned structured persistence, one Character/one Product, separate Freestyle, existing Marketplace snapshots and server accounting. Approved UGC durations 5/10/30 differ from current shared 10/15/30; record compatibility work rather than silently rewriting legacy data. Plan/package preparation precedes final video cost review/confirmation, but preparation funding/consent must be resolved before paid calls; no financial changes are authorized here.

**Manual-testing-only policy for the current UGC implementation phase:** the user manually tests the workflow. Unless explicitly instructed to test, Codex must NOT automatically run browser suites, screenshot suites, full regression suites, deployed acceptance, provider generation tests, expensive OpenAI calls, video-generation calls or hosted background-job tests. Do not generate paid provider traffic automatically. Only the smallest compile/type/static checks needed to avoid obviously broken code are allowed. This overrides older build/browser/regression/live-acceptance recipes for this phase. Documentation checks may review links, source consistency, whitespace and changed-file scope.

All UGC orchestration/stages execute on the laptop. UGC must not depend on local or hosted Inngest. Keep `SCEENYK_LOCAL_JOBS_ONLY=1` (default local-only unless exactly `0`): dispatch skips outbox attempt mutation, SDK transport is rejected, `/api/inngest` returns 503 before registration/execution, and shared media-worker requests reject hosted origins. Existing Inngest financial cron execution is paused locally too, with accounting/payment rules preserved. Keep hosted keys/URLs, Blueprint/Dockerfiles, functions and history; do not sync/deploy/re-enable integrations or run hosted acceptance. No hosted account setting has been changed or audited. Restart existing local processes when configuration/source changes require it.

The approved ACTIVE target is a future local runner, not an implemented/running service. The existing `worker:media` is a legacy signed FFmpeg service, not the UGC queue consumer. Later hosted execution changes the adapter/environment only and requires a separately authorized review; Inngest need not be reintroduced. Stop after this documentation/configuration unit.

## Current UGC V1 reference unit (2026-10-22)

Enforce exactly one Character and one Product / Prop for UGC generation, with zero allowed in incomplete drafts and maximum one during new selection/persistence. Preserve existing Studio layout/private uploads, legacy files/history and all Freestyle behavior. Remove extra upload tiles, disable occupied Add controls and re-enable replacement after explicit removal. Keep legacy extras visible/removable with validation warnings. UGC template adopters supply their own required references before generation. Reuse shared schemas and owner-filtered services; migration 035 adds concurrency enforcement without data cleanup. Use focused TypeScript/lint and targeted offline validation only, no browser/screenshot suites, full regressions/build/deployment or hosted Inngest. Stop after this unit and distinguish local checks from pending hosted migration/manual review.

## Default loading-state workflow (2026-10-21)

When a task introduces or changes external async reads, inspect its page, layouts, data-access owner and client consumers first. Use Projects' Suspense architecture: render the stable shell immediately, put the actual request-bound read inside the async child, and provide a skeleton matching the final layout. Read installed Next.js streaming/cache/auth guides before changing boundaries. Keep authentication, owner checks and private caching policies unchanged; never share-cache another user's data to suppress a warning.

Reuse shared skeleton primitives and existing feature/card/scroll geometry. Distinguish server Suspense from client effects, first load from refresh, pagination from full replacement, and loading from operational progress/error/empty states. Add no fake delays or skeletons to static/local content. Append compact placeholders while loading more, preserve cancellation/cursor/deduplication and render the existing failure UI when a request settles unsuccessfully. Use Tailwind neutral tokens with reduced-motion support; no generic primary spinner or extra stylesheets. Document affected surfaces and deliberate exclusions in the tracker/audit. Loading-only UI work uses focused TypeScript/lint and only targeted route checks needed for implementation correctness; no automatic browser/screenshot suites, full regressions, deployment or hosted Inngest. Manual visual review remains with the user.

## Current unit: dynamic Studio Sources/Properties (2026-10-20)

This explicitly authorized feature supersedes older UGC-only/presentation-only constraints for its bounded draft/media changes. Creation Type offers UGC and Freestyle, with retained per-flow inputs and persisted UGC Type. Inspect/reuse owned projects, private R2 media and shared dropdowns. Additive migration 032 keeps old/adopted projects Freestyle and groups image references for future expansion. Do not implement generation, character/product sheets, scripts, videos, or trigger hosted Inngest. Preserve financial/auth/Marketplace behavior and Studio geometry. The user requests minimal TypeScript/lint and focused checks only: no full build, browser/screenshot/deployment acceptance or broad regressions. Stop for manual UI inspection and record migration application as pending until verified.

## Focused Studio and Credits refinements (2026-10-20)

Latest instructions supersede fixed-button UGC and Settings earnings placement: Sources' shared Select offers UGC only, with no backend enum change; Earnings & Payouts is /credits/earnings in the Credits workspace. Keep Studio headings/short descriptions concise while preserving essential errors, status and financial confirmation. Inspect the entire mobile height/overflow chain before constraining Stage/Properties; only Properties content scrolls and its header stays fixed. Keep media/state mounted and reuse presentation portals for ancillary controls.

Retain account guards, private/no-store policy, page queries, old redirects and financial service boundaries during the earnings move. Use targeted route/source checks appropriate to the change; no browser/screenshot suites, full builds, deployment, hosted Inngest, real generation or financial operations. Document actual checks and stop for manual UI inspection.

## Credits route and dropdown follow-up (2026-10-20)

Future account work treats /credits as the separate Credits & Billing destination, using the existing Settings layout and financial components. Keep legacy checkout queries, authenticated/private-cache boundaries and active-route layout markers intact when moving account pages. Do not change payment/provider or generation logic for presentation changes. For dropdown regressions, distinguish trigger state from portal mounting: Base UI container=null suppresses a popup; use undefined for the normal portal. A focused local reproduction may resolve a reported implementation error; it does not authorize broad browser/screenshot suites or deployment. Collapsed hints remain close (4px) and compact (11px).

## Shared dropdown and Studio type rules (2026-10-20)

Before modifying dropdowns, inventory app-owned native selects and reuse components/ui/select.tsx on the installed Base UI foundation. All future user-facing normal dropdowns use this compact Pryzm-inspired, Sceenyk-themed pattern with check/hover/selected states, keyboard/focus/Escape/outside dismissal, shared soft ease-out motion and reduced-motion support. Visible browser-native dropdowns are disallowed unless a documented technical constraint makes replacement unavoidable. Do not replace controls that are not dropdowns or change their form values/state owners.

Clickable controls must show pointer cursors; disabled controls retain actual disabled behavior and an appropriate cursor/style. Tailwind remains the default; only the shared semantic cursor rule belongs in app/globals.css. Studio currently exposes only UGC as a fixed person-icon control in Sources, between Your Project and Project Media. No Creation Type alternatives/control in Properties. Inspect the backend contract first: it has existing creative-brief category enums but no UGC enum; preserve saved/adopted/restored/default category state rather than inventing an enum, recategorizing projects or changing generation behavior. Update relevant context/tracker and stop after this focused implementation for manual review under Fast UI Development Mode. No hosted Inngest, backend/financial changes, browser/screenshot suites, broad regressions, lengthy builds or deployment checks.

## Motion & Interaction Standard (2026-10-20)

For every future UI task, follow the [motion standard](design-system.md#motion--interaction-standard-2026-10-20): immediate input response, soft ease-out finish, modest inertia, consistent tokens, smooth sidebar/panel/menu/modal/drawer lifecycles and restrained hover motion. Approved ranges/defaults: micro 150–200/180ms, popup 180–250/220ms, modal 220–300/260ms, panel 250–350/300ms, optional reveal 300–500/420ms; cubic-bezier(0.22, 1, 0.36, 1).

Inspect actual scroll ownership first. Reuse the Lenis surface integration for ordinary pages, while retaining native independent Documentation, Settings and Studio panels, native touch, keyboard/focus/history/anchors, scroll locks and correct infinite-observer roots. Keep Base UI/native focus and close lifecycles, stable sidebar icon positions and live reduced-motion support. Tailwind-first utilities and shared motion tokens are mandatory; only minimal reusable native-dialog/Lenis compatibility CSS belongs in app/globals.css. Do not add standalone CSS, redundant animation state/frame loops, excessive effects or abrupt snapping unless technically required. Record manual-review limits honestly. Motion-only work uses Fast UI Development Mode: minimal source checks, no automatic browser/screenshot/regression suites, full builds, deployment or hosted Inngest execution.

## Styling Policy — mandatory frontend workflow

All future frontend work follows the approved [Styling Policy](code-standards.md#styling-policy): **Tailwind CSS + global.css**, not **Tailwind + scattered component CSS files**. In this repository `global.css` means the existing `app/globals.css`; do not create a second global stylesheet. This rule takes precedence over older CSS implementation notes and reference examples unless the user explicitly instructs otherwise.

Before editing frontend code, read that policy and [design-system.md](design-system.md). Then:

1. Implement ordinary styling directly with Tailwind utilities in React/Next.js components. Reuse existing tokens, spacing, breakpoints, theme behavior and React components/variants.
2. Do not add page/component `.css` files, CSS Modules (`*.module.css`, `*.module.scss`), another styling framework, inline `<style>` blocks or styled-components. Only an existing dependency's absolute requirement may justify the latter two mechanisms, and the reason must be documented.
3. For a genuine Tailwind limitation, use only minimal reusable custom CSS in `app/globals.css` and explain the limitation. Do not relocate normal component styling there to avoid utilities; share repeated Tailwind patterns through React components.
4. When touching legacy CSS-backed components, prefer migrating their relevant styles to Tailwind within the authorized task. Preserve unrelated CSS, and remove an old stylesheet only once all of its styles/consumers are safely replaced. Do not start a large unrelated migration.
5. Before completion, review the changed-file list for prohibited new stylesheets and confirm any global CSS addition satisfies the exception criteria. Report any exception and why Tailwind alone was insufficient. Apply the validation level appropriate to the task; this policy does not add browser suites or builds to Fast UI Development Mode.

The original policy approval was documentation only. A subsequent explicit user request authorized the full styling migration, now implemented in source with app/globals.css as the sole project-owned stylesheet. This does not authorize future unrelated migrations or redesigns. Keep static classes discoverable by Tailwind; use runtime style props only for data-dependent values or an explained renderer/dependency requirement. Actual checks and manual visual-review limits belong in the progress tracker.

## Fast UI Development Mode

Apply this mode to all future tasks involving only UI design, styling, component sizing, layout, spacing, responsiveness, or animations. It takes precedence over older UI validation requirements in this file, including browser acceptance, screenshot comparisons, multi-size/theme testing, and production-build checklists.

1. Implement the requested changes directly.
2. Do not run automated browser tests, screenshot comparisons, visual acceptance suites, or large regression tests.
3. Do not run full production builds or lengthy validation commands unless necessary to resolve an implementation error.
4. Do not perform deployment or production acceptance.
5. Do not automatically test multiple screen sizes or themes. The user will inspect the results manually.
6. Preserve existing functionality, business logic, and security.
7. Stop immediately after implementation and provide a brief summary of files changed and anything the user should inspect.

Only perform a quick check when necessary to catch an obvious implementation error. Manual UI review remains with the user; do not claim unperformed validation as passed.

For backend, authentication, payment, database, security, or financial changes, continue using the existing strict testing and verification rules. Tasks that include any of those changes do not qualify as UI-only, even when they also change presentation.

## Focused Studio refinement and canonical URL (2026-10-18)

The latest request supersedes the earlier edge-to-edge Sources overlay and side-by-side tablet layout. Studio is canonical at /studio; /create permanently redirects with query parameters, while owned /projects/[id] routes and existing handlers remain unchanged. At desktop viewport widths with at least 930px available Studio width, Sources/Stage/Properties use 254px/flexible/252px columns. Otherwise Stage precedes Properties; Sources opens as a 254px right-side nonmodal panel from 768px viewport width, or as a focus-managed modal inset 8px on every edge below 768px. One mounted Sources tree retains inputs and local media. Only the mobile modal locks background scrolling. Toolbar controls are 32px with a centered compact aspect segment/popover for the existing 9:16,16:9,1:1 choices; no invented Share or generation options. Workspace-only scrollbar hiding preserves scrolling and leaves public landing scrollbars unchanged. Preserve logos, themes, business logic and ownership; no hosted Inngest. Stop after Studio review.


## Pryzm reference implementation — Phase 1: Studio (2026-10-18)

Current authorization: use Pryzm_Design_System_Reference_for_Sceenyk.md as the primary workspace geometry reference, with the supplied screenshots for refinement. Implement Studio and necessary shared navigation/frame geometry only, then stop for user review. Templates/Marketplace, Documentation, Projects/Settings and public pages are later phases; preserve their current presentation and existing work. Keep Sceenyk's official logos, configured font, existing colors/themes/features and all backend/auth/financial/provider contracts. No hosted Inngest, generation, checkout or deployment acceptance.

Geometry decisions: a reusable workspace-only token layer; 252px navigation plus an 8px gutter (preserving the current Studio x260 frame position), 64px collapsed rail with no extra gutter, 254px Sources and 252px Properties. Keep the screenshot-tuned 54px toolbar/header and 52px inspector rows within the reference's estimated ranges. Four-area desktop requires at least 930px available Studio width and a desktop viewport; tablet Sources stays a full-screen overlay. A 752px content breakpoint stacks Stage/Properties on viewports up to 767px. CSS owns Sources' rail/modal mode; the native dialog reads that mode and retains one mounted control tree. Controls and type hierarchy are refined without changing handlers or business state. Actual verification is recorded in progress-tracker.md.

## Strict workspace visual-fidelity pass (2026-10-18)

The current user request supersedes earlier phase stop points and geometry guidance for a UI-only pass across Studio, navigation, Templates, Marketplace, Documentation, Projects and Settings. The supplied Pryzm screenshots are the primary layout reference; retain Sceenyk names, official logos, Inter, purple/blue accents and the existing theme controller. No backend, auth, payments, credits, Marketplace behavior, provider, database or guest-draft changes are authorized. Do not trigger hosted Inngest or perform deployment acceptance.

Reference-derived target geometry (Approximate): 260px desktop navigation, 64px collapsed rail, 8px viewport gutters and panel gaps, 14px outer radius, 1px neutral borders, 54px Studio headers/toolbar and 254px Sources/Properties rails at 1366-1440px. Compact desktop navigation uses 32px rows; touch navigation retains larger targets. Panels scroll independently on desktop; mobile retains hamburger/logo, Stage then Properties, and the same mounted full-screen Sources dialog. Gallery cards use a dense responsive grid with compact metadata; actual configuration covers remain labeled rather than inventing artwork. Documentation uses topics/article/contents at reference desktop widths. Settings retains its existing sections and controls. Workspace-scoped neutral surfaces supersede earlier purple-tinted neutrals; brand/action/focus colors remain unchanged. Local screenshots, responsive themes, overflow, lint, types and build are the acceptance scope. See progress-tracker.md for actual results.

## Current authorization — Studio Phase 3 (2026-10-18)

Complete the four-area Studio and progressive tablet/mobile/full-screen Sources behavior in this same request. This supersedes the historical stop-before-Phase-3/mobile-later text. Preserve existing services/hooks and all ownership, auth, credit, provider and Marketplace contracts; implement only the approved missing bounded guest brief handoff. Verify real layout, saved project/media and isolated workflow/financial cases without hosted Inngest. Stop after Phase 3; deployment/read-only acceptance is the next bounded recommendation.


## Current authorization — Phase 2 (2026-10-18)

Complete Templates and Documentation presentation, remaining internal shell migration and small workspace consistency fixes. Reuse the completed Phase 1 shell/collapse/mobile/profile/Credits/redirect system. Templates uses existing owner-scoped Marketplace configurations and actions; no new template features. Public Documentation is curated from verified product behavior and stays free of internal/private data. Preserve all existing routes/access/ownership/Settings/private caching/financial/provider contracts. Do not trigger hosted Inngest or change the Studio editor. The exact next unit is Phase 3 — full Studio workspace redesign: Navigation | Sources | Preview Stage | Properties. Do not start it automatically.


## Current authorized unit — workspace foundation (2026-10-18)

Implement only Phase 1 of the current four-phase workspace request: reusable shell, grouped/collapsible desktop navigation, bottom account menu, mobile Sheet, existing themes, Dashboard compatibility, shared content frame and bounded Studio/Projects/Marketplace/Settings migration. This supersedes earlier landing-only/documentation-only restrictions for this unit. Preserve guest Studio access, all URLs where possible, root auth/theme, Settings architecture/private caching and existing server/domain/financial/provider behavior. Templates and Documentation remain planned until Phase 2; full desktop Studio is Phase 3 and mobile Studio Phase 4. Never start those automatically. Validate lint/types/build, real browser navigation/responsiveness/themes and proportionate auth/ownership/Settings/Marketplace/financial regressions; state fixture versus live evidence. No hosted Inngest events.


## Current authorized unit — landing-only refinement (2026-10-17)

The user explicitly authorizes landing animation, responsive composition and visual refinement against supplied light/dark screenshots, with build/lint/TypeScript, actual production-browser screenshots and relevant regressions. This supersedes the earlier documentation-only scope for this bounded landing unit. Preserve all other application-page compositions, services, financial/security contracts and existing tokens. The latest user request additionally authorizes a shared Dark default while retaining saved Light/Dark, explicit System, before-paint initialization, favicon synchronization and blocked-storage behavior. Do not trigger hosted Inngest. Record real local production acceptance and deployment status separately; do not claim deployed acceptance from a local build. No broader workspace or feature unit starts automatically.


## Historical authorization — redesign documentation only (2026-10-17)

Define [the approved full UI/UX redesign](ui-context.md) before implementation. **Documentation contract: Complete; redesign implementation: Not Started.** This task changes context documentation only: no application/components/routes/backend/schema/theme/provider changes, animation, guest persistence or hosted Inngest events. Preserve existing functionality, financial/security invariants and unrelated worktree changes. Earlier implementation authorizations below are historical; they do not authorize resuming those units or the redesign now.

After a separate implementation request, follow the seven bounded phases: (1) public/workspace shells and navigation, (2) landing/navbar/hero/story/pricing/footer, (3) desktop Studio, (4) tablet/mobile Studio, (5) Marketplace/storefront visual alignment, (6) Projects/Library/home cleanup, (7) cross-app responsive/accessibility/polish. **Exact next implementation unit: Phase 1 — shared public/workspace shells and navigation architecture.** Do not implement the full redesign in one unit. Scope guest draft/auth restoration explicitly as bounded Studio work; do not silently bundle it into the shell phase.

Each phase reuses current branding/colors/tokens/light/dark/fonts/logos/shadcn and existing server/domain services. Preserve completed Settings information architecture and its private cache policy. Validate responsive behavior, accessible navigation/overlays, both themes and relevant auth/ownership/financial regressions proportionately; record actual evidence and unfinished acceptance. A desktop phase must keep small screens usable before later mobile refinement. Local fixtures may demonstrate paused pipeline states but cannot establish hosted workflow acceptance. Inngest Cloud remains intentionally paused and hosted acceptance requires explicit authorization, as below.

## Current Inngest operating constraint (2026-10-16)

Inngest Cloud is temporarily paused at the user's request to preserve the monthly execution allowance. Use the local Inngest Dev Server where possible for development and workflow tests; follow [generation-dispatch.md](generation-dispatch.md#environment-and-exact-local-commands). Keep local development mode local; this instruction does not authorize changes to production configuration or application behavior.

Do not trigger hosted Inngest acceptance runs without explicit user authorization. This constraint takes precedence over earlier hosted acceptance recommendations below. Features with outstanding checks that require real hosted Inngest remain **Pending hosted acceptance** until Cloud functions are re-enabled near submission and the user authorizes those runs. Local results establish local verification only. Preserve previously verified hosted evidence as historical evidence; the temporary pause does not invalidate completed acceptance.

**Historical authorization (2026-10-15; completion/limits in the tracker):** creator withdrawal reservations, seven-day eligibility and trusted PayPal Sandbox payouts, including the explicitly approved lot/FIFO refund reductions, below-minimum exactly-once valid release, processing reconciliation and paid-out deficits. Record these rules in accounting/payments before implementation. Preserve historical sale snapshots, Marketplace adoption, credit top-ups and AI accounting; no Live or renderer changes. Stop before provider execution/hosted acceptance when required Sandbox capability or webhook setup is missing. Local implementation/fixtures do not establish real payout acceptance; the tracker remains In Progress until required real checks pass. No later feature is authorized.

**Historical authorization (2026-10-14): documentation/product-contract update only.** Record approved production Marketplace fee/share10%/90%, USD minimum withdrawal$5, immediate reservation into Pending Payout and a seven-day hold from the withdrawal request. The2026-10-15 authorization above supersedes this earlier documentation-only boundary. Actual deployed/controlled-time Sandbox acceptance and its limits are recorded in the tracker. No later feature or Live/renderer change is authorized.

**Historical implementation authorization (2026-10-14):** creator-earnings Sandbox settlement and proportional cumulative refund/reversal accounting, with immutable history and preserved adopted projects. Its test sale hold and demo fees remain historical implementation evidence; use the approved production request-based hold above for future withdrawal work.

**Historical implementation authorization (2026-10-14):** paid Marketplace adoption with PayPal Sandbox, durable entitlements and separate immutable pending creator earnings. Preserve free adoption, credit-pack purchases and AI accounting. Its original settlement/payout exclusions describe that earlier unit; completed Sandbox settlement and the newly approved production policy are recorded in the tracker. New implementation still requires separate authorization.

**Historical authorization (2026-10-13): complete pay-as-you-go credit and top-up UX.** Extend existing Sandbox purchase/accounting/quote boundaries with persistent paid balance, separate free allowance, before/after cost review, manual top-up recovery, low-credit notice and small owned ledger history. Preserve [payments.md](payments.md), server authority and exactly-once settlement. Final rendering remains In Progress/deferred because Render Free 512 MB RAM is insufficient; no rendering or hosting upgrade belongs to this unit. Historical authorizations below describe prior units.

These rules guide incremental Sceenyk development from the hackathon MVP toward a production application. Apply them within the current task's authorized scope.

**Historical authorization (2026-10-15, support unit):** after deployed authorization/privacy and live trusted revocation/restoration pass, implement only internal payout queue/detail and existing-reference status reconciliation with append-only audit. This gate passed before implementation. Support must never create/resend a payout, claim a send, edit financial/reference fields or override provider/accounting truth. Migration026 precedes matching app deployment; keep the unit In Progress until its required acceptance is verified. Do not start another feature.

## Approach

Use a spec-driven workflow. `/context` is the source of truth for product behavior, design, architecture, coding standards, scope, and implementation progress. Read the relevant documents before implementing a feature; do not invent behavior already defined by the specifications.

Current context and implementation baseline:

- Final-render acceptance on Render Free confirmed an actual512MB OOM, followed by safe terminal failure/restoration with no MP4. The user's current authorization is renderer memory optimization and local checks, preserving architecture/security/private storage/idempotency/timing/accounting and reusing existing media without provider requests. The optimized revision is local and the unit remains In Progress. Do not reset the failed/released job, upgrade plans or split services automatically. Report observed resources and estimated1GB/2GB suitability; consult the tracker before any further hosted attempt.

- The current final-renderer brief authorizes ready composition → external Remotion/FFmpeg → private canonical MP4 → verified receipt → generation completion and exactly-once accounting. This supersedes historical final-rendering exclusions below. Keep provider outputs and the immutable composition unchanged. Migration016 and both deployments are required before hosted acceptance. Use the existing10-second job without new provider generation; remain In Progress until a real hosted MP4, private browser playback, isolation, duplicate and settlement checks pass. Do not automatically expand into captions, music, payments or infrastructure upgrades.

- Composition planning is Complete within its scoped hosted acceptance, ending at an immutable schema-v1 timeline or explicit timing conflict. Applied migration015 and deployed `lib/composition/` add private asset checks, authoritative SQL timing and owner-only reads. Real hosted persistence, Cloud duplicates, browser refresh/reopen, User B denial and held accounting pass, including final deployed rechecks after the user's four passing hosted SQL Editor timing/conflict/trim fixtures. Preserve integer milliseconds, strict0ms technical tolerance, configured narration offset and existing media/provider identities. `none`/`cut` are the only supported transitions. No final rendering, paid generation, content normalization or conflict editor is authorized. Read the tracker for agent-run live evidence, user-reported hosted SQL fixtures and isolated replay. This authorization supersedes the historical audio-readiness boundary below; it does not authorize the recommended next renderer unit.

- Narration extends visuals readiness through `lib/voice-ai/`, applied migration 014 and the existing signed Render worker. One short real George request now passes Vercel/Inngest Cloud/Render/private R2/FFprobe acceptance, including silent skipping, duplicate protection, owner reopen/refresh, real A/B denial and held accounting. Metadata lookup permission is independent of TTS. Verify Cloud's registered function count matches the redeployed endpoint; the current rollout needed an existing-app SDK resync from four to six functions. Preserve exact Gemini narration, scene-level audio, canonical milliseconds, duplicate-spend guards and held accounting. This authorization ends at audio readiness; composition/rendering and payments remain later work.

- fal is the active visual provider behind `lib/video-ai/` and a separate trusted Inngest function; Runway remains isolated and inactive. `lib/media-preparation/` adds canonical millisecond source timing, private reusable derivatives and an authenticated external FFmpeg worker before new video transform/reuse. Real paid text/image/transformation and prepared-segment acceptance pass within hosted-service/official-engine scope. Preserve immutable Gemini plans and existing accounting. Intermediate readiness never completes/consumes a generation. Check the tracker for migrations 009–012, hosting status, observed provider estimates and unsupported scene/recovery limits before relying on this integration.

- [overview.md](overview.md) defines intended product behavior, the MVP, and success criteria.
- [UI-context.md](ui-context.md) defines UI construction rules; its current on-disk filename is `ui-context.md`.
- [design-system.md](design-system.md) defines visual tokens, component appearance, and reference uncertainty.
- [code-standards.md](code-standards.md) defines coding conventions and required implementation boundaries for existing and future concerns.
- [progress-tracker.md](progress-tracker.md) records verified implementation status, next units, and open questions. [architecture.md](architecture.md) records planned service boundaries and implemented UI contracts.
- Landing/themes, Clerk/application identity, owned projects/private R2 media, deployed generation dispatch, accounting and quote confirmation have scoped acceptance in the tracker. Local Files remain temporary until verified upload. Gemini understanding and immutable validated plans have actual text/image/video, hosted persistence and real deployed Inngest Cloud acceptance, including refresh/reopen, duplicates and terminal restoration. A ready plan holds its reservation and is never final-video completion. fal/source preparation and narration have scoped deployed acceptance; rendering, purchases and marketplace remain unstarted. Hosted catalog auditing remains separate. Reinspect the tracker before relying on historical baseline notes.

Complete one working **vertical slice** at a time: a small feature that includes its UI, backend, and database behavior where required. For example: a user creates a project → it is saved to Supabase → it appears in My Projects → the user can reopen it. Do not combine project UI, marketplace schema, subscription billing, generation workers, and dashboard redesign in one unit.

For each unit:

1. Read repository instructions and relevant context. As required by [`AGENTS.md`](../AGENTS.md), read the relevant installed Next.js guide in `node_modules/next/dist/docs/` before writing application code; heed breaking changes and deprecations.
2. Define the unit's user-visible outcome, boundaries, acceptance checks, and required dependencies.
3. Inspect the implementation and worktree before editing; distinguish pre-existing changes from task changes.
4. Implement the smallest complete slice, verify it, synchronize affected documents, and report the actual result.

Keep major providers replaceable through Sceenyk service interfaces. AI video, language models, voice, storage, payments, and background processing should have shared boundaries rather than provider calls scattered across pages and components. Names such as `video-ai/`, `voice/`, `storage/`, `payments/`, and `ai/` are boundary examples, not existing folders or a requirement to scaffold unused architecture. Add only the boundary needed by the current unit and document its contract.

## Scoping Rules

- Work on one clearly defined feature unit. Prefer small changes with quick, meaningful acceptance checks.
- Combine frontend, database, payments, AI, or rendering changes only when they are necessary for that unit's end-to-end outcome.
- Preserve working behavior unless the task changes it. Avoid broad refactors, unrelated redesigns, and unrequested features.
- Inspect and reuse existing components, utilities, hooks, schemas, and services before adding equivalents. Do not create duplicate authentication, payment, storage, or generation systems.
- Add dependencies only when required for the current task. Do not replace a working dependency or infrastructure choice without an explicit requirement or a documented technical reason consistent with the specification.
- Keep client and server responsibilities separate. Enforce authentication, authorization, project ownership, subscription access, free-generation eligibility, and credit checks on the server. Browser state, posted user IDs, balances, and hidden buttons are not authority.
- Keep secret API keys and privileged credentials server-side; never expose them through client bundles or public environment variables.
- Store large media outside PostgreSQL. Keep references and metadata in application records.
- Run long AI/video work through background jobs/workflows. A browser request may submit a job or retrieve state; it must not keep a normal request open for the entire production pipeline.
- Persist clear generation job states, such as queued, processing, completed, and failed. Preserve enough state to recover progress and identify failures after reloads or interruptions.
- Handle provider failures safely. Failed work must not leave users permanently charged contrary to the approved accounting policy; define failure compensation from the specification before implementing billing behavior.
- Protect payment and credit operations against repeated clicks, concurrent requests, retries, and duplicate provider events. A client-side disabled button alone is insufficient.
- Build UI for mobile and desktop and both themes. Follow `UI-context.md` (currently `ui-context.md`) and `design-system.md`, reuse the tokens in `app/globals.css`, and prefer appropriate shadcn components over manually recreating primitives.
- Keep the hackathon scope focused on the complete core creation flow. Do not expand into every content category, a professional editor, enterprise features, or the full creator economy without a request.

## When to Split Work

Split a step when it combines concerns that can be built and verified independently. Define explicit prerequisites so a necessary backend dependency can support a complete slice without expanding unrelated work.

These concerns should usually be separate units:

- Clerk authentication and Supabase data modeling.
- UI redesign and backend workflow changes; schema changes and unrelated UI redesign.
- PayPal checkout and creator payouts; subscription billing and credit-ledger logic.
- Media upload and AI generation; AI video generation and final rendering.
- Marketplace browsing and marketplace purchasing.
- Multiple unrelated API routes or more than one major external provider integration.
- Large desktop changes and an unrelated mobile redesign.
- A new feature and a broad refactor of existing code.

Build the production pipeline in independently verifiable stages where practical:

**Upload → analysis → production plan → owned source preparation → scene generation/transformation → voice generation → video assembly → rendering → final asset storage.**

For each stage, define its input, output, persistent status/failure state, and ownership boundary: which job/user it belongs to and which service performs the work. Test the stage's success and failure contract before connecting later stages. Provider SDKs should remain inside their service boundary.

If a proposed change cannot be tested end to end within a reasonable amount of time, narrow its outcome or split its prerequisites. Complete only the requested unit; identify later units without implementing them.

## Handling Missing Requirements

When a requirement is ambiguous:

1. Check existing context and the current task for an explicit decision.
2. Inspect current implementation for established behavior; distinguish working behavior from placeholders or mocks.
3. If unresolved, record the issue under Open Questions in `context/progress-tracker.md`, including the affected unit and decision needed.
4. Stop dependent implementation before making a product assumption affecting architecture, pricing, payments, credits, permissions, or user data. Ask for the missing decision and continue independent work where possible.

Use the existing `context/progress-tracker.md` for unresolved questions and delivery status. If another required context document is absent, establish the relevant specification within the authorized unit before depending on it. If creating that document is outside the task, report the gap and unresolved question rather than silently deciding the requirement.

Use reasonable engineering judgment for small details that do not change product behavior. Never guess pricing, credit costs, subscription limits, free-generation eligibility/limits, payment behavior, refunds, creator revenue shares, marketplace fees, access permissions, ownership, deletion behavior, AI model-selection rules, or content moderation rules. Use the specification or obtain clarification.

The overview defines two free short generations of about 10 seconds each; preserve that rule and the approved accounting contract. Pricing text in reference PNGs is illustrative, not an approved billing policy. Cloudflare R2, Inngest, Gemini, active fal visuals and approved ElevenLabs narration are specified by their authorized units; inspect the tracker for actual acceptance limits. Additional providers and final rendering require separate specifications.

## Protected Files

| File or boundary | Rule |
| --- | --- |
| `node_modules/**` and third-party library source | Never edit. Fix application integration or use supported library configuration. |
| Generated framework files, including `.next/**` and `next-env.d.ts` | Do not manually patch generated internals. Let the owning framework/tool regenerate them. Preserve the Next.js instruction block in `AGENTS.md`. |
| `components/ui/**` | Avoid unnecessary rewrites. Prefer Sceenyk tokens, shared variants, wrappers, and composition; preserve Base UI behavior and accessibility. Add common primitives through the shadcn CLI when needed. |
| Existing database migrations | Do not rewrite migrations that may have been applied. Add a new migration for schema changes and record its purpose/application status. |
| Authentication configuration | Preserve Clerk as the specified auth system and modal experience; do not introduce competing authentication or dedicated sign-in/sign-up pages. |
| `app/globals.css` and Sceenyk design tokens | Maintain one shared light/dark system. Do not reinitialize shadcn defaults or introduce another palette. Document authorized token changes. |
| Environment files containing secrets | Never print, expose, commit, or hardcode secret values. Document variable names and purpose only. |
| Existing user data and working code | Do not delete data or migrations to simplify development. Preserve unrelated worktree changes. |

## Sceenyk System Boundaries

These are required product boundaries; they do not imply that the integrations already exist. Changes must follow the project specification and be recorded in architecture documentation.

| Area | Sceenyk boundary |
| --- | --- |
| Authentication | Clerk owns user authentication and sessions. Sign-in/sign-up opens in centered modal/overlay experiences; public exploration remains available without authentication. |
| Database | Supabase PostgreSQL stores application data and metadata, including projects, generations/jobs, balances, transactions, and payment records. |
| UI | Next.js + React + TypeScript + Tailwind CSS + shadcn/ui, using shared Sceenyk tokens and Lucide icons. |
| Payments | PayPal is the hackathon payment provider. Development/testing uses Sandbox only, never Live or real-money transactions. Keep environment/credential selection behind the future service. Use authoritative server verification before granting purchased capacity; browser success callbacks alone cannot change balances. |
| Media | Cloudflare R2 is implemented in source for private project inputs through `lib/storage/`; Supabase holds metadata. Configuration/live acceptance is tracked separately. Generated media and retention/deletion are later work. |
| AI | Access video, language-model, and voice providers through shared Sceenyk service/provider layers where practical. Do not invent provider/model-selection policies. |
| Background processing | Inngest owns durable jobs/retries and reconciliation; service-only atomic claims protect worker execution. Long production work never depends on an open browser. Heavy rendering remains future work. |
| Credits | Validate credits and free generations on the server. Record balance changes through transaction/ledger history and protect against duplicate mutations. |
| Generation | Persist job state, ownership, progress, errors, and final asset references so work and failure status can be recovered. |

## Keeping Docs in Sync

Update the relevant context document whenever implementation changes an important project decision. Establish missing architecture specifications when required by the authorized implementation unit, rather than silently introducing decisions only in code. Coding standards and the tracker now exist; keep them synchronized with implementation.

| Context document | Update when |
| --- | --- |
| `overview.md` | Product scope, flows, features, or success criteria change. |
| `UI-context.md` (current filename: `ui-context.md`) | UI behavior, layout patterns, component rules, or theme usage changes. |
| `design-system.md` | Visual tokens, typography, colors, component styling, or design rules change. Preserve source-confidence labels. |
| `architecture.md` | System boundaries, providers, data flow, storage, auth, payments, workers, or infrastructure change. |
| `code-standards.md` | Coding conventions, folder patterns, naming, or shared implementation rules change. |
| `progress-tracker.md` | A meaningful implementation unit changes delivery status, verification evidence, or open questions. |

If code and context disagree, identify and resolve the conflict against the current specification before continuing dependent work. Do not rewrite the specification merely to make incomplete behavior look correct. Keep documentation and relevant implementation updates in the same unit.

## Progress Tracking

After each meaningful implementation unit, update `context/progress-tracker.md` with:

- What was implemented and changed.
- What was tested, the observed results, and any checks not performed.
- What remains incomplete, known issues, and unresolved questions.
- New migrations and whether they were applied/verified.
- New environment variable names and purpose, without values.
- The recommended next implementation unit and its prerequisites.

Use these statuses consistently:

| Status | Meaning |
| --- | --- |
| Complete | The defined slice exists and its required end-to-end behavior/checks were verified. |
| In Progress | Some implementation exists, but required behavior or verification remains unfinished. |
| Blocked | A specific missing requirement, external dependency, or unresolved failure prevents the unit from completing. Record the blocker. |
| Planned | The unit is an intended future step, not an implemented feature. |
| Not Started | No implementation of the specified unit exists. |

UI-only work does not complete a feature that requires backend/database behavior. Installed SDKs are not configured integrations; passing lint/build is not evidence of live authentication, database authorization, payment verification, or a functioning generation pipeline. Label mocks, fixtures, and manual/unperformed checks explicitly.

## Before Moving to the Next Unit

For UI-only tasks, follow Fast UI Development Mode above instead of the automated validation and production-build requirements below. The existing strict verification requirements continue to apply to backend, authentication, payment, database, security, and financial changes.

Verify all applicable checks for the current unit:

1. Its defined feature works end to end, including required backend/database behavior.
2. Existing behavior has not been unintentionally broken.
3. Required authentication, authorization, ownership, and entitlement checks are enforced server-side; verify unauthorized access is rejected.
4. Database changes are valid and migrations, application status, and relevant access policies are accounted for.
5. Payment/credit operations resist retries, repeated clicks, concurrency, and duplicate events; test the relevant duplicate path.
6. External failures have usable error states, persistent job status, and accounting outcomes consistent with the approved policy.
7. Loading, empty, success, and failure states exist where appropriate.
8. Light and dark modes follow the same Sceenyk visual system.
9. Desktop and mobile remain usable; verify keyboard interaction and relevant responsive layouts.
10. No secret values are exposed in client code, logs, or documentation.
11. TypeScript passes: `npx tsc --noEmit`.
12. Lint passes: `npm run lint`.
13. The application production build passes: `npm run build`.
14. Relevant context documentation reflects the final decisions and behavior.
15. `progress-tracker.md` records the actual status, evidence, remaining work, and next unit.

Run focused, meaningful tests for the changed behavior in addition to static checks. Existing npm test scripts use actual SQL with development-only PGlite, the official Inngest test engine and explicit external-service fixtures. Inspect available tooling before adding tests. Explicit acceptance scripts exercise live services separately; they are not part of ordinary offline regression tests. Live integrations need relevant runtime/integration evidence, not assumptions based on types.

For documentation-only units, verify requested structure, references, factual claims, whitespace, and authorized file scope; application runtime checks are not applicable merely because a document was added. Never report skipped checks as passed. Fix required failures before moving to the next dependent unit; if verification is blocked, record the limitation and retain an incomplete status.

## AI Agent Behaviour

Codex and other AI coding agents must:

- Inspect before editing and understand existing code before replacing it.
- Make the smallest change that correctly completes the requested unit; preserve working code and unrelated user changes.
- Avoid speculative refactoring and unrequested features. Break large work into sensible units and complete only the requested unit.
- Fix root causes instead of hiding symptoms or suppressing errors.
- Never hide errors by disabling TypeScript, ESLint, security checks, or validation. Never use `any` solely to silence a type error; any justified exception must be documented.
- Never run destructive database operations without explicit instruction, and never delete user data or migrations to make development easier.
- Explain important architectural changes, changed files, verification results, limitations, and incomplete work in the completion summary.
- Never claim a feature works without verification where verification is possible. Distinguish source inspection, static checks, browser checks, and live service tests.

The goal is a stable, understandable Sceenyk codebase that can grow beyond the hackathon MVP without unnecessary rewrites.
