# Sceenyk project overview

## Milestone 6.5 — Reference Asset Review (2026-10-24)

**Milestone 6 — Complete. Milestone 6.5 — Complete in source; manual 046/runtime/ownership/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This supersedes older stop points below. [Review UI, security, persistence and setup](reference-review.md).

Studio now supports private inspection and explicit Character/Product approval before downstream reference use. Completed historical assets start ready for review. Individual replacement requests preserve successful work and invalidate only their group's effective final sheet/approval. No generation is executed by review actions.

Input → Reference Analysis → Character Reference generation → Character Review/Approval → Product Reference generation → Product Review/Approval → Location Reference → Storyboard → Generation Package → Final Video → Preview. Existing cost-confirmation/accounting gates remain. Apply 046 manually after 045; no new environment/dependency. Render/Inngest remain disabled. No provider, worker/job, storage request, remote SQL, browser/screenshot, build or deployment executed. Stop after 6.5.


## Milestone 6 — Product / Prop Reference Sheet (2026-10-24)

**Milestone 5 — Complete. Milestone 5.5 — Complete. Milestone 6 — Complete in source; manual migration/provider/runtime/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This current authorization supersedes older M6-not-started stop points below. See [Product Sheet contract and manual setup](product-sheet.md).

One creator-named Character and Product / Prop remain private. The same immutable job can resume Product work after completed Character/analysis, retain three useful Product views and receive its canonical gray sheet. Template adopters supply their own image/name. Actual runtime/fidelity acceptance remains manual.

Pipeline: Input → OpenAI Reference Analysis → Character Reference Sheet → Product / Prop Reference Sheet → Location Reference → Structured ChatGPT Storyboard → Generation Package → Final Video → Studio Preview. Existing cost-review/accounting gates remain. Apply pending 044 and new 045 manually; use OPENAI_PRODUCT_SHEET_MODEL=gpt-image-2.5-sunburst and explicit UGC_PRODUCT_SHEET_ENABLED=1 with the existing private OPENAI_API_KEY. Render/Inngest remain disabled. No providers, workers/jobs, private media operations, remote SQL, browser/screenshot suites, build or deployment were executed. Stop after M6.



## Milestone 5 — Character Sheet (2026-10-23)

**Complete in source; manual migration/provider/runtime/visual acceptance pending. Exact next: Milestone 6 — Product / Prop Reference Sheet generation. Not started.** [Character Sheet contract and manual setup](character-sheet.md) supersedes older M5-not-started/OpenAI-Character-image assumptions below; historical evidence remains intact.

One creator-named Character and Product / Prop remain required; current durations 5/10/30 and one future primary Location. Character sheets are private project outputs and never reusable Template data. Adopters supply their own images/names and receive their own generated references.

Approved full flow: Input → validation → OpenAI analysis → SOUL2 Character Sheet → Product Sheet → one primary Location → structured ChatGPT storyboard/script + stable voice specification → generation package → cost review/confirmation → final video → finalization → Studio Preview. No later stage is implemented. User confirms 039 applied; verify/apply 040 then new 041 manually. Render/Inngest remain disabled; only user-started local worker execution. Codex made no provider calls, ran no jobs/worker, applied no hosted SQL and deployed nothing. Offline in-memory schema validation is separate from manual runtime acceptance.

## Character and Product names - prerequisite refinement (2026-10-23)

**Implemented in source as a focused prerequisite between Milestones 4 and 5; manual migration/UI/persistence acceptance pending. Milestone 5 remains Not Started.** Each uploaded UGC source now has an editable Character name or Product / Prop name directly beneath its thumbnail. Shared 80-character trimmed labels are saved via the existing Preview-header Save action/status into private project_assets.reference_name, never filenames/R2 keys. Drafts without names remain saveable; new generation readiness requires both names with role-specific issues. New immutable v3 snapshots freeze names/source IDs; existing v2 jobs and completed analyses are not rewritten/replayed. See [reference-name contract and setup](ugc-v1-workflow.md#project-specific-reference-names--prerequisite-before-milestone-5).

Migration 040 is authored for manual application after 039. No new environment variables or hosted executor. The adopter supplies their own Character image/name and Product image/name; private creator labels are excluded from the reusable template projection. Future sheets/storyboards/dialogue/instructions must use the frozen supplied names consistently. Render/Inngest guards remain; no provider/worker/job/deployment execution.

## Milestone 4 - OpenAI reference analysis (2026-10-23)

**Milestone 4 — Complete in source; manual migration/provider/runtime acceptance pending. Exact next: Milestone 5 — Character Reference Sheet generation. Not Started.** The [provider/schema/privacy/setup contract](reference-analysis.md) describes official Responses multimodal analysis, centralized server-only key/model configuration, ReferenceAnalysisProvider, strict Character/Product schema v1, reference-analysis-v1 prompts, private per-role persistence/usage and fixed safe failures. The local worker continues validate_inputs → analyze_references, checkpoints each role and pauses at character_reference. Completed work is reused on eligible retries; submitted/uncertain requests require review before replay. No sheets, storyboard, video, financial charge or hosted executor is connected.

Current duration options/UGC readiness are 5/10/30; legacy 15 reads/saves and immutable snapshots remain compatible. New migrations 038/039 are authored only. Explicit local enablement plus private OpenAI model/key and existing R2/database setup are required for user-run manual acceptance. TypeScript, focused lint and offline schema checks pass; no OpenAI calls, worker startup, jobs, migration application, browser/integration suites, build or deployment. Render/Inngest guards remain. This supersedes earlier source-not-implemented statements below.

## Milestone 3 — UGC input readiness (2026-10-23)

**Complete in source; manual migration/runtime acceptance pending. Exact next milestone: 4 — OpenAI reference analysis. Not Started.** The [current readiness/job contract](generation-jobs.md#milestone-3--ugc-input-readiness-2026-10-23) supersedes the earlier unvalidated enqueue/empty-registry boundary below. One shared server validator checks owned UGC fields/settings, exactly one private verified Character/Product image and actual storage, returning safe structured issues.

Studio's compact UGC Prepare generation control is disabled until saved/settled inputs pass server readiness. An explicit click revalidates and atomically enqueues a version-2 immutable snapshot, without credits/provider calls. Worker validation checks that exact frozen request and current owned media, records success, then pauses at queued / analyze_references rather than failing because Milestone 4 is absent. Adopters must provide their own private references; Templates cannot satisfy validation with creator media.

Actual shared Studio durations remain 10/15/30; 5 seconds is not yet implemented, and no legacy/Freestyle options are rewritten. Manually apply 037 after 035/036 and retain private R2/Clerk/Supabase configuration. Render/Inngest remain guarded; Codex ran no worker/jobs, storage/providers, SQL, browser/integration suites, production build or deployment. The user performs manual acceptance.

## Milestone 2 — local UGC job infrastructure (2026-10-23)

**Complete in source; manual migration/runtime acceptance pending.** Migration 036 adds `ugc_generation_jobs` and append-only events, reusing existing app users, owned Projects and server Supabase client. Shared statuses/stages, immutable snapshots, idempotent enqueue, claim-token leases/heartbeats, bounded recovery/retries, safe owner progress and queued/running cancellation are implemented behind server-only services. See [schema/runner/setup](generation-jobs.md#ugc-generation-jobs--milestone-2-complete-in-source-2026-10-23).

After manually applying 036 and any pending prerequisites, the laptop command is `npm run worker:ugc`. It is not started by Codex. Its default stage registry is empty: a claim reaches `validate_inputs`, then fails safely as unimplemented. No Studio wiring, full readiness, OpenAI/reference sheets/storyboard/video, assets or financial behavior is added. Render/Inngest remain guarded/bypassed and configuration is preserved. Minimal static checks only; the user performs manual acceptance.

**Exact next milestone: Milestone 3 — UGC input validation + generation readiness. Not Started.** Earlier Milestone 1/Not Started infrastructure statements below are historical and superseded by this entry.

## Full UGC V1 architecture approved (2026-10-23)

**Milestone 1 Complete; UGC pipeline Not Started.** The canonical [product overview](overview.md#approved-full-ugc-v1-workflow-2026-10-23) and [full UGC contract](ugc-v1-workflow.md) define required inputs, OpenAI reasoning/reference-image adapters, private Character/Product sheets, structured storyboard and normalized generation package, cost review/confirmation before video, real persisted progress and private Preview output.

Exactly one Character and one Product / Prop; approved UGC durations are 5/10/30, while current shared 10/15/30 code needs compatible Milestone 3 work. OpenAI is approved for UGC; Gemini remains legacy-only. UGC Templates reuse public-safe creative snapshots with explicit future required counts of 1 each, never creator private assets.

Local laptop execution is the approved target; the UGC local runner is not implemented. Current local-only transport guards disable Inngest and hosted Render requests while preserving configuration/history. No paid calls, deployment, financial changes or Studio redesign. Manual acceptance belongs to the user; automatic behavioral/provider/hosted testing requires explicit instruction. **Exact next milestone: 2 — generation-job schema + local job runner/state machine**, separately authorized.

## UGC V1 input contract (2026-10-22)

UGC V1 supports exactly one Character and one Product / Prop per project. Empty drafts are allowed; adding an image disables its Add control and removes any additional + path. Removing the reference re-enables replacement without refreshing. Client/server/database validation rejects excess references, preserving existing ownership and private uploads. Older extras remain intact and individually removable with warnings, while future UGC generation readiness requires exactly one uploaded image of each role plus the other valid inputs. UGC template adoption therefore requires one Character and one Product / Prop supplied by the adopting user before generation; source creator private files are not copied. Freestyle is unaffected. No generation pipeline is implemented. Migration 035 and manual review are tracked separately; earlier multiple-reference descriptions below are superseded for V1.

## Project-derived Templates (2026-10-21)

Official lifecycle: **Project → Publish as Template → Manage Template → Publish to Marketplace**. `/projects` Publish and `/templates` → New Template → `/settings/templates/new` → choose an owned Project share one authenticated initialization service. It opens an existing listing or creates a private prefilled draft at `/settings/templates/[listingId]`; PostgreSQL enforces source uniqueness. No blank Template domain/system. `/templates/[listingId]` retains private detail, Update Template and View in Marketplace while published. The gallery removes its old footer links and adds responsive New Template.

Eligible Project title/brief/category/settings and creation/UGC type prefill the Template without making the original public. Draft instructions are reviewable until first publish; published/purchased/adopted snapshots remain independent. Private previews reuse the selected source media; public preview is a separate reviewed still derivative, including video posters. Source keys/URLs stay private. Existing abstract fallback/color remains for unavailable media. Apply migration 033 after 032. Manual visual and hosted storage/schema acceptance remain pending; no hosted Inngest or deployment.

## Dynamic Sources and Properties (2026-10-20)

Creation Types are UGC (User-Generated Content) and Freestyle. New Studio projects start as UGC; older saved/adopted projects without this setting retain Freestyle. Creation Type is persisted separately from the legacy category. Studio inputs conditionally change with the selected type while keeping both flows' values/files/references in the same project.

UGC Sources: Characters and Product / Props, with multiple image references, compact wrapping thumbnails and individual removal. Each image represents one character/product; stable reference IDs permit future multiple-image grouping. UGC Properties adds Type under Style & pacing: Advertisement (default), Explanation, Unboxing. Freestyle Sources keeps existing Project Media and Properties has no UGC Type. Shared scene/settings/prompt-driven narration remain unchanged. Empty Preview shows UGC · Type · duration or Freestyle · duration.

The existing owned drafts, media metadata and private R2 upload/read services persist these inputs with additive migration 032; no replacement storage system. Switching types does not remove data. UGC generation remains unavailable in this input-preparation unit; generation/sheets/scripts/videos and hosted workflows are excluded. The tracker distinguishes local checks from pending migration application and manual UI inspection.

## Studio Phase 3 — implemented (2026-10-18)

Current authorization includes desktop, tablet and mobile Studio. Reuse the shared navigation; Sources owns presentation of project title/origin and existing image/video/audio import/upload/recovery; the Stage owns source/result playback, durable status and scene caption preview; Properties owns category, prompt, duration/style/tone, existing generation quote/confirmation and caption preferences. Aspect ratio and Save move to a fixed 64px toolbar. WorkspaceEditor remains the brief/save/media-selection owner; useProjectMedia and useProjectGeneration retain their existing server calls, guards and state. Caption controls use React portals into Properties while their existing preview component owns state. No new scene editor, voice selector, share engine or export capability is introduced.

The same mounted Sources dialog uses native modal focus/scroll behavior below 1050px available content width; above that it is a nonmodal rail. At 720px available width Stage/Properties sit beside each other; below that Stage precedes Properties. A bounded, schema-validated 30-minute sessionStorage handoff restores only guest brief values through existing Clerk authentication; files remain memory-only and full reload requires reselection. Saved/account-switched private projects never use the guest draft. No auth route, ownership, cache, schema, provider, payment or generation-hook contract changes. Inngest Cloud stays paused. Local and scoped live acceptance is recorded in [the tracker](progress-tracker.md). Deployment is not performed; the next bounded unit is deployment and read-only acceptance of this revision, with Inngest Cloud still paused. Stop after Phase 3.


## Workspace Phase 2 (2026-10-18)

Templates (/dashboard/templates) uses the existing protected layout, owned Marketplace listing service, live-account fence and configuration previews; it adds presentation rather than a new domain system. Documentation (/documentation plus six topic paths) uses static public content with grouped topic navigation, readable articles, stable section anchors and optional contents links. These routes activate the existing workspace navigation without replacing Phase 1 shell/profile/credits/theme behavior.

The remaining /admin payout-support layout now uses the shared shell/frame while retaining server role enforcement, local support navigation and private response controls. Existing creator listing/publishing/purchase pages receive shared header composition; Settings sticky navigation aligns with the header-free workspace. Existing URLs and public access remain intact, old template bookmarks reach the working destination and internal content stays protected. See architecture and tracker for exact scope, checks and limits. Phase 3 — full Studio workspace redesign: Navigation | Sources | Preview Stage | Properties — is next and is not started.


## Workspace foundation update (2026-10-18)

Phase 1 implements a Studio-first authenticated workspace and public guest Studio/Marketplace presentation using components/workspace and app/(workspace). Dashboard cards are removed; /dashboard redirects to /create, while /dashboard/projects owns existing project browsing. Public URLs, root Clerk/theme, Settings sections and owner-scoped services are retained. Navigation groups are Create, Workspace, Discover, Resources and Account; the bottom account menu links to existing Settings, and Credits opens Settings billing. Desktop has a persistent collapsible rail; mobile has a focus-managed hamburger Sheet. Templates and Documentation are visibly planned until Phase 2. Full Studio redesign is deferred. See architecture.md and progress-tracker.md for compatibility, evidence and acceptance limits. No backend/financial/provider migration or hosted Inngest execution.


## Current direction — approved full UI/UX redesign (2026-10-17)

**Creative studio first. SaaS dashboard second.** The canonical [product direction](overview.md#approved-full-uiux-redesign-direction-2026-10-17) and [full redesign contract](ui-context.md) supersede older next-unit/navigation/layout guidance. **Redesign implementation: Not Started.** Documentation only; no application, route, backend, provider, financial or theme changes occur here.

Public / Discovery covers Landing, Marketplace, Pricing, Documentation and creator storefronts with top navigation and immersive visual presentation. Workspace covers Studio, Projects, Library, Settings and creator/account management with output-first contextual tools. Use Studio as the main user-facing creation name while retaining current routes. Guests configure before authentication; the future Clerk Generate handoff must preserve/restore lightweight drafts inside Studio without unauthenticated generation or automatic paid submission.

Desktop Studio is Navigation | Sources | Stage | Properties. Tablet collapses secondary panels progressively. Mobile is Top Navbar → Stage → Properties, with hamburger navigation and a separate full-screen Sources overlay opened from the Stage toolbar, obvious Close and same-state return. Marketplace becomes visual-first. Existing colors, light/dark tokens, typography, logos, accessible primitives and completed Settings information architecture remain.

The [seven-phase plan](ui-context.md#staged-implementation-and-acceptance) begins with **Phase 1 — shared public/workspace shells and navigation architecture**. Later units cover landing, desktop Studio, tablet/mobile Studio, Marketplace/storefronts, Projects/Library/home and final polish. Preserve all accepted functionality/security/accounting and the Inngest Cloud pause; hosted acceptance needs explicit authorization. Do not start implementation automatically.

## Settings implementation status (2026-10-16)

Implemented at /dashboard/settings/{account,creator-profile,credits,earnings,creation,notifications,appearance,privacy,data}, with /settings entry redirect, an authenticated shared dashboard shell, desktop section navigation and a labeled compact section picker on mobile/tablet. Legacy profile/credits/earnings bookmarks forward to the same source of truth and retain checkout/pagination queries. Existing profile, credit-purchase and creator financial components/services are reused. Navbar/dashboard/admin theme controls and dashboard header/summary paid balances are removed; contextual generation/payment credit information remains.

Appearance supports immediate Light/Dark/System through the existing browser preference/controller, including blocked or unwritable storage. Creation defaults implement only aspect ratio and category for new drafts via migration028; the user applied it and real save/reload plus two-account isolation pass through the built local app. Saved/adopted projects retain their own settings. Captions/styles stay per generation, narration voice is centrally configured, notification delivery/preferences are unavailable, and export/deletion actions remain deferred. Clerk account/security controls are reused with server-enforced self-deletion disabled before opening the modal. Settings responses use private/no-store without changing public caching. See progress-tracker.md for current verification and deployment limits. Earlier Settings approval paragraphs below are historical where they describe unimplemented controls or documentation-only scope.


The canonical product definition is [overview.md](overview.md), which is also the overview read by `AGENTS.md`. This entry point exists for references using `context/project-overview.md`; keep product details in the canonical document rather than maintaining a second specification.

## Preserved Settings contract (2026-10-16)

Settings information architecture is approved and its implementation is recorded above. The canonical [Settings contract](overview.md#approved-settings-experience-2026-10-16) defines Account, Creator Profile, Credits & Billing, Earnings & Payouts, Creation Preferences, Notifications, Appearance, Privacy & Security, and Data & Account. All sections are private/authenticated.

Move normal navbar/header theme controls into Settings → Appearance with Light/Dark/System, reusing the existing theme system. Move persistent dashboard/chrome AI-credit balances into Settings → Credits & Billing; retain cost review, insufficient-credit warnings and contextual top-up/payment information. Reuse creator-profile management in Settings with one source of truth, and existing credits/billing, earnings/payouts and Clerk capabilities. Aspect ratio/category defaults for new drafts are implemented; other account defaults, notification infrastructure, export/deletion and unsupported privacy/session actions remain separately scoped.

**Historical Settings implementation recommendation — now Complete within deployed acceptance:** Follow [route and service boundaries](architecture.md#approved-settings-architecture-2026-10-16) and [presentation rules](ui-context.md#approved-settings-ui-2026-10-16). This task changes documentation only and does not start implementation. Preserve the Inngest Cloud pause and pending hosted acceptance requirements.

## Completed unit — public Marketplace creator storefront (2026-10-15)

The canonical [storefront product contract](overview.md#approved-public-marketplace-creator-storefront-2026-10-15) approves **`/marketplace/creators/[creatorSlug]`** as the public Marketplace creator page. Creator name/avatar links lead there; its published listing cards lead to existing Marketplace detail and adoption. Private account settings, projects, earnings, payout information and support data remain separate and excluded from all public responses.

Public display name, stable unique URL-safe `creator_slug`, optional public avatar/bio and currently published listings form the focused first version. Slugs are allocated once with database uniqueness and neutral conflict suffixes; mutable names and internal IDs never determine the ongoing URL. See [architecture](architecture.md#approved-public-marketplace-creator-storefront-contract-2026-10-15) and [UI](ui-context.md#approved-public-marketplace-creator-storefront-ui-2026-10-15) for the canonical data/ownership rules, empty state and deferred extensions.

**Creator storefront + minimum public-profile management: Complete within deployed two-user acceptance,2026-10-16.** Storefront, links, owner-only management and safe avatars use applied027. Revision `c2987f1` resolves account-widget hydration while retaining private no-store and public/static caching. All14 profile loads,24 cache/isolation controls and71 full Production checks pass with zero browser/cache failures. Public/client scans are clean and protected financial/generation state is unchanged. Exact evidence/limits are in the tracker and [architecture](architecture.md#creator-storefront-implementation-2026-10-15). Slugs remain fixed; social, search, moderation, financial and rendering changes stay deferred. No other feature starts automatically.

The approved commercial contract is [pay-as-you-go credits](overview.md#approved-commercial-model--pay-as-you-go-2026-10-13): **"Buy credits. Create what you need. Top up when you need more."** Monthly subscriptions are outside current scope; membership and auto-recharge are unapproved future options.

The approved [Marketplace product model](overview.md#creator-templates-and-marketplace) lets creators explicitly publish reusable listings and lets adopters create their own projects from them. Publishing, free adoption, paid Sandbox purchases, durable entitlements, creator settlement/proportional reversals and withdrawal reservations have scoped deployed acceptance in [progress-tracker.md](progress-tracker.md). One real $5 Sandbox payout succeeded using isolated sale/expired-time fixtures; naturally aged hosted Paid-webhook completion remains unobserved. Preserve that evidence distinction.

**Approved production creator-earnings/withdrawal contract (2026-10-14):** Sceenyk keeps **10%** and creators earn **90%** on paid adoptions, calculated server-side in USD cents. Verified valid earnings become available unless blocked by existing refund/reversal state. They remain separate from nonwithdrawable AI credits. Minimum withdrawal is **$5 USD**; the server validates sufficient unreserved funds and the request amount, reserves it immediately once, and moves it from Available Earnings to Pending Payout. The **seven-day hold starts at the withdrawal request, not the sale**. After that hold and clear refund/dispute/reversal checks, the future trusted PayPal flow may send the payout and record verified Paid. Proportional cumulative-cent reversals and immutable/auditable history also apply to reserved payout money.

See the canonical [accounting policy and payout lifecycle](accounting.md#approved-production-marketplace-earnings-and-withdrawal-policy-2026-10-14). Deployed migration024 implements the versioned10%/90%, minimum$5 and168-hour withdrawal rules while preserving historical sale policies. Withdrawal implementation/acceptance is distinct from the support tool approved below; the current support unit preserves that deployed policy.

## Completed unit — internal payout support and reconciliation (2026-10-15)

The canonical [support contract](overview.md#approved-internal-payout-support-contract-2026-10-15) defines authorized admin/support inspection of an existing withdrawal and a **Check PayPal Status / Reconcile** action against the same persisted payout. Automatic Inngest reconciliation stays primary. Every support action is auditable; only matched provider truth may drive existing exactly-once transitions. No new/resend instruction, manual Paid/Failed/earnings/release override, amount/reference edit, shortened hold, refund or cancellation control is approved. Creators cannot access provider references, internal codes, support controls or audit history.

**Authorization prerequisite passed deployed acceptance:** protected migration025 roles and requireAdminOrSupport deny normal/missing roles, protect role grants, and honor trusted revocation/restoration403→200. Creator initial/action DTO privacy is fixed with safe failureMessage; internal failureCode is excluded from client bundles and normal creator responses.

**Support implemented and deployed; scoped acceptance passes:** private /admin/payouts queue/detail, strict check-only POST, shared support/Inngest/webhook observation logic and append-only audit in new migration026. The verified rollout applied026 before matching code. Tests verify no payout POST, exact-once accounting/audit rollback and private UI; a real existing $5 Sandbox SUCCESS payout is reread with no new instruction, using explicitly disposable sale/time/role fixtures for financial transitions. See [architecture](architecture.md#internal-payout-support-implementation-unit-2026-10-15) and the tracker for exact evidence/limits. No later feature, Live or renderer work is authorized.

See [payments.md](payments.md) for the completed Merchant Sandbox one-time purchase boundary and [progress-tracker.md](progress-tracker.md) for implemented behavior, acceptance limits and the deferred final renderer.
