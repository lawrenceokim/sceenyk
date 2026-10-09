# Progress Tracker

Update this file after every meaningful implementation change.

Last implementation and verification: **2026-10-09 (Africa/Lagos)**. Read [overview.md](overview.md), [architecture.md](architecture.md), [ui-context.md](ui-context.md), [design-system.md](design-system.md), [code-standards.md](code-standards.md), and [ai-workflow-rules.md](ai-workflow-rules.md).

**Complete** means verified within the stated scope. **In Progress** means required work remains. **Blocked** means a specific obstacle prevents completion. **Planned** and **Not Started** do not imply implemented integrations. UI previews do not complete backend features.

## Current Phase

**New authorized unit — owned draft save/list/reopen/update: In Progress.** Repository and hosted metadata inspection found only the verified `app_users` table. Implementation reuses the server-only SDK and existing workspace/dashboard, adds a minimal projects migration, and awaits hosted two-account acceptance. The prior identity work below remains preserved. No AI, permanent media, credits or payment work is authorized in this unit.

Project implementation exists: explicit Save draft/title/status controls; one Zod validator and shared choices; retry-safe insert/owned update service; server-ordered/paginated dashboard cards/count; private `/projects/[id]` reusing the workspace. Local media is excluded. The new migration passes eight isolated PostgreSQL/grant checks; 40 actual-source/SDK/isolated-SQL assertions pass. Lint, TypeScript, production build and client secret scan pass. Twenty-eight real-development-browser responsive/failure checks, five local-media checks, five two-instance SSR association checks and ten Server Action/auth-route checks pass. Hosted projects table is still absent in the latest metadata inspection; migration application and real saved-record acceptance remain pending the user’s SQL Editor step.

**Previously completed prerequisite: Clerk development authentication and minimal hosted application identity.** Its real development evidence remains recorded below. The current project slice is In Progress until its new migration is applied and live saved-record/two-account acceptance passes.

| Phase | Status | Repository evidence |
| --- | --- | --- |
| Project Foundation | In Progress | Web/UI, Clerk development authentication and minimal Supabase identity work. Storage, workflows and other service setup remain future units. |
| Global UI & Public Landing Page | Complete | All requested landing sections, reusable compositions, responsive navigation, and both themes are implemented and browser-checked. |
| Creation Workspace UI | Complete as local preview | Six categories, prompt, local media, four settings, empty output/brief/source panels, and honest Generate notice. No production execution. |
| Dashboard Shell UI | Complete as preview | Existing shell/empty states retained with verified Clerk account controls and application identity initialization. Counts/credits remain honest previews. |
| Authentication | Complete as development integration | Real sign-up/email verification/password sign-in, centered modals/account controls, dashboard protection, refresh, sign-out, mobile and both themes verified. |
| Database & User Sync | Complete as minimal development identity | Connected server-only Supabase SDK, user-applied `app_users` migration, unique Clerk mapping, nullable profiles, DB timestamps and RLS/grant strategy. Real two-account, profile, refresh/re-login and unique-constraint checks passed; broader hosted catalog/browser-role audit remains outside verified evidence. |
| Projects | In Progress | Save/list/reopen/update/ownership source and minimal migration implemented. Isolated ownership/validation/retry checks and browser failure/auth/responsive checks pass. Hosted migration and real saved-record acceptance pending. |
| Media Uploads | Not Started as backend | Local multiple-file browse/drop, metadata, image/video/audio previews, and removal exist; nothing is remotely uploaded or persisted. |
| Credits & Usage | Not Started | Free allowance appears in pricing copy; no balance, ledger, or eligibility enforcement. |
| Payments | Not Started | No checkout, PayPal SDK, credentials, server verification, or real-money transactions. Future development/testing is Sandbox only. |
| AI Production Pipeline | Not Started | No APIs, providers, analysis, generation, or job execution. |
| Video Rendering | Not Started | Native playback is for selected local source files only; no video rendering or generated output. |
| Marketplace | Planned | No marketplace UI/backend or creator economy implementation. |
| Testing & Hackathon Polish | Not Started as full MVP | Public, creation, and dashboard UI checks passed; complete integration testing remains future work. |

## Current Goal

**Current unit: minimal owned creative-brief persistence.** Preserve the verified Clerk/application identity boundary and sole Supabase SDK. Explicit Save draft inserts one owned record with a stable retry UUID; later saves update that ID. Dashboard lists only that account’s summaries/count with pagination; the private stable URL reloads the same workspace after an owner-scoped query. Strict validation rejects ownership/status/media/unknown fields. No AI, remote uploads, jobs, credits, payments, sharing, delete or autosave. Hosted migration acceptance is still required.

## Completed

| Work | Status | Verified scope |
| --- | --- | --- |
| Web/tooling foundation | Complete | Next.js 16.4, React 19.3, strict TypeScript, Tailwind 4, npm/lockfile, ESLint, and root-level alias retained. |
| Shared design system | Complete | Existing semantic palette, typography, spacing, radii, and effects preserved; only an alias for the existing darkest-neutral token added. |
| Public shared shell | Complete | Sticky desktop navigation, mobile disclosure below 1024px, brand link, working section links, skip link, shared container/main/footer. |
| Theme experience | Complete | Before-paint system/saved preference, explicit toggle, localStorage persistence, system change handling, and actual cross-tab synchronization. Storage-restricted in-page switching works. |
| Public landing content | Complete | Hero, six creation categories, three how-it-works steps, connected-production value section, three concept-media cards, free/paid pricing preview, final CTA, and footer. |
| Reusable UI | Complete | Existing Button retained; shadcn/Base UI Dialog installed and adapted to tokens, touch targets, viewport-safe scrolling, and reduced motion. Reusable brand, theme, account entry, art, category, step, media, and pricing components extracted without provider scaffolding. |
| Account-entry integration | Complete in development | Real Clerk centered sign-in/sign-up, Dashboard/Create/UserButton and neutral loading verified. Creative CTAs stay public `/create`; missing Clerk keys retain the honest unavailable notice. |
| Creation route/header/layout | Complete | `/create` metadata, back link, studio header, preview badge, responsive desktop input/output columns and stacked mobile flow, using existing tokens and shell. |
| Owned project implementation | In Progress | Explicit title/save controls, strict validation, stable retry UUID, owned read/update/list services, real count/pagination/card source and private reopen route. Isolated and failure/auth/responsive checks pass; hosted migration/success acceptance pending. |
| Category/prompt/settings | Complete as local UI | Six single-select native radio tiles with keyboard/focus treatment; multiline labeled prompt, count, category-specific example; ratio/duration/style/tone selects update the creative-brief summary. Changing category or theme preserves other inputs. |
| Local media input/preview | Complete as local UI | Multiple browse/drop; metadata, deduplication, unsupported/empty-file feedback, long filenames, preview switching/removal, valid image/video/audio previews, browser decode fallback. Only active media owns an object URL; switching, removal, route exit clean it up and cached-route return renews it. |
| Result/Generate boundary | Complete as preview | Generated output stays intentionally empty; local source is separately labeled. Generate is disabled for empty/whitespace prompt; enabled action opens an informational dialog without API requests, processing, saved data, or credit changes. |
| Dashboard app structure | Complete UI and development identity | Shared root provider/theme, unchanged public URLs, protected request-time dashboard behind Suspense. Layout ensures application identity; page independently checks Clerk. |
| Dashboard navigation/header | Complete in development | Desktop/sidebar and mobile/header Clerk UserButton/profile overlays verified; existing Sheet/navigation/theme behavior retained. |
| Dashboard content/EmptyState | Complete as original UI; project data acceptance pending | Welcome, concept-art Quick Create and shared EmptyState retained. Projects now use an owned query/count/cards in source; generation/templates/credits remain previews. Create actions reach `/create`, where explicit save exists; no generation occurs. |
| Preview branding/metadata | Complete as preview | Sceenyk title/description and star/circle SVG icon replace starter branding; starter favicon removed. Final production logo approval remains open. |
| Context synchronization | Complete | AGENTS overview path corrected; architecture existence, public UI/theme contracts, Sandbox-only payment rule, design composition, and workflow/standards status synchronized. |

## Verification

### Current owned-project unit (2026-10-09) - In Progress

- Before editing, read AGENTS/required context in order, identity/database/workspace/dashboard source and installed Next.js guides; inspected both design PNGs. Preserved pre-existing identity changes.
- Hosted Data API metadata exposes only app_users with its eight expected columns and UUID ID. New projects migration is prepared, not yet applied/hosted-verified. SQL Editor application was requested; no SQL connection/Management API capability exists.
- Eight isolated PostgreSQL migration checks pass: apply after identity, draft insert, editable update, owner update/delete denial, browser role denial, RLS and refusal to rerun over an existing relation.
- **40 actual-source/Supabase-SDK/isolated-PostgreSQL assertions pass:** save/update/reopen/list, retry/concurrent deduplication, stable ID/creation time, server ownership, foreign read/update/create-collision denial, strict field/enum/length/owner/status/media validation, empty drafts, exact-count pagination/ordering, signed-out denial, safe errors and framework signal propagation. Verified identity and REST transport are mocked in this isolated suite; it is not hosted project evidence.
- **Five two-instance SSR checks pass:** unique control IDs, labels and ARIA associations, plus separate native radio groups. These prevent association collisions when creation/private routes are retained.
- **Five real local-media checks pass:** actual blob preview and temporary-media warning, failed-save/file/theme retention, save request contains neither filename nor object URL.
- **28 real-development-browser checks pass:** input/setting editing and retention, both themes at 1440/1024/768/390/320px without overflow, disabled saving control, honest pending-table failure without success, retained failed-save brief, retry control, Generate notice/Escape, no browser exceptions. Desktop light/mobile dark screenshots reviewed.
- **10 real browser/server checks pass:** signed-in Server Action rejects injected owner; malformed ID gives safe not found; public signed-out create uses official Clerk modal and restores focus; direct signed-out action and private project/dashboard navigation are denied without private fields. Existing reserved test account used a short-lived documented Clerk sign-in ticket to establish a real development session, not mocked authentication. Earlier real password/modal auth acceptance remains recorded below.
- Final production regression: missing/foreign/invalid project results render explicit unavailable UI inside the stream (200/noindex), preserving the Clerk provider. A streamed rendering interruption observed during verification was resolved; the fresh-browser auth regression passes with working sign-out and zero browser exceptions. Control IDs/radio groups are unique across workspace instances. Current auth artifacts are in temporary `sceenyk-clerk-live-9dBPLr`; other UI/media screenshots/checks remain in `sceenyk-clerk-live-UYhKua`.
- Lint, standalone TypeScript and production build pass. Landing/create remain static; dashboard/private project content streams at request time. No framework setting disabled. Client scan: 20 JS assets, no actual privileged-key matches or server database markers.
- **Pending:** hosted migration application; User A real create/list/refresh/reopen/edit/same-ID update; User B empty/list/isolation/direct foreign URL/update/own save; success/populated/empty project UI and local media after successful save/reopen. Compilation or isolated checks do not complete these.
- Artifacts: temporary sceenyk-clerk-live-UYhKua screenshots/browser checks, sceenyk-project-isolated-checks.json and focused temporary scripts. No persistent test framework/dependency added.

### Prior authentication/identity unit (2026-10-09)

- Actual Clerk API confirmed a development instance. Real modal username/reserved test-email signup, development email-code verification, password sign-in, fixed destination, signed-in navbar/UserButton/account overlay, authenticated refresh, sign-out and direct signed-out denial passed. A fresh-browser login additionally completed Clerk's new-device email-code verification. No dedicated auth routes; `/signin` and `/signup` are 404.
- Auth modal centering/sizing/Escape/focus and both themes checked at 1440/1024/768/390/320px. Synchronized dashboard themes/layout checked at 1440/768/390/320px. Screenshots reviewed after animations settled. Temporary documented Clerk testing tokens bypass CAPTCHA only; actual sessions authenticate.
- Before migration, privileged Supabase Data API metadata exposed no application tables. The user applied `supabase/migrations/20261009000100_app_users.sql` through SQL Editor. Afterward its eight columns matched hosted metadata, and the first reserved account changed from zero to exactly one application row.
- Real hosted checks passed: three first-account refreshes, real sign-out/password re-login, stable UUID/creation time, safe Clerk profile updates/null restoration, duplicate rejection with `23505`, second account signup with its own UUID, ignored browser identity hints, second-account re-login/refresh and public/protected routes. Seventeen final two-account/browser assertions passed after the first-account and new-signup checks. Two reserved development test accounts/application rows were created; no other account was modified.
- **24 isolated PostgreSQL/source/SDK assertions passed:** actual migration applies to an empty schema and refuses an existing one; nullable/profile updates, repeat/parallel upserts, separate identities, uniqueness, auth-before-database work, safe errors/logs/configuration, RLS, denied browser-role access and limited service grants. Actual Next.js framework-signal rethrow is covered. Clerk identity and Data API transport were mocked for this isolated test; hosted evidence is recorded separately above.
- Eighteen real-Clerk production-browser checks passed for the pre-migration synchronization/setup failure, refresh action, working account controls/sign-out, dashboard protection, public pages and responsive themes. No successful DB write was claimed during that failure test.
- Identity writes explicitly await a real request with `connection()`; internal Next.js signals propagate with `unstable_rethrow` rather than becoming application failures. Both Cache Components and Partial Prefetching remain enabled; the final production regression passed three authenticated refreshes with the same single hosted mapping and no synchronization-failure logs.
- Client build scan: 20 JavaScript assets, zero actual privileged-secret matches or server database markers. Rendered hosted dashboard payload also contained no Clerk/Supabase privileged key. No secret environment file was changed by the agent or committed.
- Lint, standalone TypeScript, production build and whitespace/format verification passed. Public routes remain static and dashboard is partial-prerendered with protected request-time content; no API/auth route or Next.js configuration change.
- RLS/browser-role denial and grants were tested against the actual migration in isolated PostgreSQL. Hosted migration application is user-confirmed; hosted columns, writes and uniqueness are directly verified. A separate hosted catalog/grant/public-key browser-role audit was not performed without a SQL connection/public key. OAuth/real email delivery, production services and physical-device/screen-reader audits are not claimed.
- Temporary evidence: `C:\Users\USER\AppData\Local\Temp\sceenyk-clerk-live-R5LF2D` (Clerk, hosted identity, screenshots and isolated SQL checks); final prerendering regression uses `sceenyk-clerk-live-lPYpcl`. No persistent test framework/dependency was added.

### Historical initial Clerk source/fallback checks (before development keys)

- **Clerk unit (2026-10-09):** lint, standalone TypeScript, production build, and diff whitespace checks passed. Missing-key build keeps public pages static; no dedicated auth route. Three configuration security assertions passed: missing keys closed and production public/secret prefixes rejected without logging values.
- **37 unconfigured-mode browser checks passed:** public landing, no direct/subtree dashboard content, constant local redirect despite a supplied return URL, browser identity hints cannot bypass missing-configuration guard, absent `/signin` and `/signup`, fallback notices/focus/Escape on desktop/mobile, and both themes at 1440/1024/768/390/320px. Reviewed desktop light and mobile dark screenshots. No browser errors or external auth requests.
- **47 creation regression checks passed** after auth integration, including local prompt/settings/media lifecycle, keyboard/focus/preview dialogs, public access/navigation, theme state, and responsiveness. Temporary harness expectations reflect Get Started's auth intent and wait for exit animations.
- Those historical unconfigured checks have now been supplemented by the real development acceptance recorded above.
- npm audit reports nine high findings in existing shadcn/ESLint tooling chains; every affected package version matches the pre-task lockfile. No Clerk package is listed. No unrelated downgrade/force fix was applied.
- Temporary artifacts: `C:\Users\USER\AppData\Local\Temp\sceenyk-auth-FvXd49` (37 checks/screenshots) and `sceenyk-create-fjS8rL` (47 regression checks). No test framework or generated tooling was committed.

### Historical dashboard/creation UI verification (before Clerk)

- `npm run lint` — passed against final application code; no lint suppression.
- `npx tsc --noEmit` — passed against the final production build types.
- `npm run build` — passed; `/`, `/create`, `/dashboard`, and framework `_not-found` are statically prerendered. No API or auth routes added.
- Initial standalone TypeScript check encountered stale generated route types while the route move/build was underway. Framework regeneration resolved them; the final standalone check passed. No generated internals, TypeScript settings, or Next.js settings were manually patched.
- **70 headless Chrome dashboard checks passed** against the final production build. Light/dark at **1440, 1280, 1024, 768, 390, and 320px** fit without horizontal overflow; sidebar/drawer match the 1024px breakpoint. Desktop/mobile light/dark and drawer screenshots reviewed visually.
- Verified Home current-page semantics, keyboard navigation/visible focus, all empty states and safe summary defaults, free-generation copy without purchases, desktop/mobile section links, and all header/Quick Create/project/template Create actions reaching the existing workspace.
- Verified mobile Sheet association/initial focus, focus trap, Escape and close/focus return, 44px close target, 320×480 viewport scrolling, nested account-notice focus restoration, dismissal on navigation/brand/desktop resize, cached back navigation, theme persistence, and reduced-motion drawer/backdrop transitions. Verified the dashboard skip link reaches its visible unique main after visiting the public layout.
- Sampled active-sidebar and muted-summary text/surface pairs exceeded 4.5:1 in both themes; this is scoped contrast evidence, not a complete accessibility audit.
- **47 creation regression checks also passed** after the layout reorganization: landing/Create navigation, responsive themes at 1440/1024/768/390/320px, radio/prompt/settings, Generate notice/focus, real local PNG/WebM/WAV previews, browse/drop/removal/deduplication, long filenames, decode fallback, object-URL cleanup and cached-route renewal.
- `/`, `/create`, and `/dashboard` load successfully. `/signin`, `/signup`, and all unimplemented `/dashboard/{projects,templates,marketplace,credits,settings}` routes remain 404; no placeholder route proliferation.
- Both browser runs observed only local app/blob/data GET requests, no backend mutations or external services, and no browser exceptions/console errors.
- Prior public-unit evidence remains 30 checks for navigation, persisted/system/cross-tab themes, restricted storage, and reduced motion. This unit rechecked relevant shell transitions/themes/dialogs without changing the theme controller.
- No live authentication, generation, database, upload, credit, payment, or rendering checks apply; these integrations do not exist. Screen-reader/device-matrix audits and a persistent automated test suite remain future work.

The browser harness/screenshots and media fixtures are temporary local verification artifacts, not app features or a committed test framework. No test dependency was added. Native codec support remains browser-dependent; actual mobile devices, screen readers, a broader browser matrix, and fully offline clean builds remain unverified. The existing parent-directory lockfile warning appears during build/start; compilation and serving succeed. The dashboard and public layouts use unique skip-target IDs to avoid cached-route collisions. No unresolved issue from this unit remains in the required checks.

## Files Changed - Current Project Unit

| Area | Files |
| --- | --- |
| Validation/dependency | package.json, package-lock.json; new lib/projects/options.ts, types.ts, validation.ts |
| Persistence/action | new lib/projects/server.ts, app/actions/projects.ts; updated lib/db/types.ts |
| New migration | supabase/migrations/20261009000200_projects.sql (pending hosted application; existing identity migration unchanged) |
| Reopen/protection | new app/(public)/projects/[id]/page.tsx; updated proxy.ts |
| Workspace | new creation-header.tsx, project-save-controls.tsx, project-load-failure.tsx, project-unavailable.tsx; updated creation-workspace.tsx, creation-options.ts, category-selector.tsx, creation-preview.tsx, prompt-composer.tsx, generation-settings.tsx, media-dropzone.tsx and app/(public)/create/page.tsx |
| Dashboard | new components/dashboard/project-card.tsx; updated dashboard-sections.tsx and app/dashboard/page.tsx |
| Context | architecture.md, database.md, authentication.md, UI/design-system, standards/workflow and this tracker |

No actual environment credentials, existing migration, palette, provider/pipeline, upload, payment or later unit changed.

## Historical Files Changed — Authentication/Identity Unit

| Area | Files |
| --- | --- |
| Package/environment names | `package.json`, `package-lock.json`, blank `.env.example` |
| Server identity/database | New `lib/auth/ensure-app-user.ts`, `lib/db/config.ts`, `server.ts`, `types.ts` |
| Applied migration | New `supabase/migrations/20261009000100_app_users.sql`; applied by the user to the new development project |
| Boundary/failure UI/appearance | `app/dashboard/layout.tsx`, new `components/dashboard/workspace-unavailable.tsx`, `components/auth/auth-provider.tsx` |
| Context | New `context/database.md`; updated `architecture.md`, `authentication.md`, `ui-context.md`, `design-system.md`, `code-standards.md`, `ai-workflow-rules.md`, this tracker |

No privileged browser client, Supabase Auth, webhook, projects schema, payment code, secret value or later feature unit was added.

## Historical Files Changed — Initial Clerk Unit

| Area | Files |
| --- | --- |
| Packages/environment | `package.json`, `package-lock.json`, `.gitignore`, empty `.env.example` |
| Auth foundation | New `lib/auth/config.ts`, `require-user.ts`, `proxy.ts`; new `components/auth/auth-availability.tsx`, `auth-provider.tsx`, `auth-modal-return.tsx`, `account-controls.tsx` |
| Auth entry/navigation | `components/account-action.tsx`, `navbar.tsx`, `landing/landing-sections.tsx` (free Get Started intent) |
| Layout/dashboard/theme | `app/layout.tsx`, `app/globals.css`, `app/dashboard/layout.tsx`, `page.tsx`, `components/dashboard/dashboard-header.tsx`, `dashboard-sidebar.tsx` |
| Context | New `context/authentication.md`; updated `architecture.md`, `ui-context.md`, `design-system.md`, `code-standards.md`, `ai-workflow-rules.md`, this tracker |

No secret `.env.local`, application API, database/schema, auth page, payment code, or Next.js configuration change added. The committed environment example contains no credential values.

## Historical Files Changed — Dashboard Unit

| Area | Files |
| --- | --- |
| Routes/layout | New `app/dashboard/layout.tsx`, `app/dashboard/page.tsx`, `app/(public)/layout.tsx`; moved existing `app/page.tsx` → `app/(public)/page.tsx` and `app/create/page.tsx` → `app/(public)/create/page.tsx` unchanged; modified `app/layout.tsx` |
| Dashboard composition | New `components/dashboard/dashboard-shell.tsx`, `dashboard-sidebar.tsx`, `dashboard-header.tsx`, `dashboard-stat-card.tsx`, `dashboard-sections.tsx` |
| Reusable UI | New `components/empty-state.tsx`, `components/ui/sheet.tsx` (shadcn/Base UI, adapted to tokens/touch/motion) |
| Shared navigation | Modified `components/brand.tsx` (optional navigation callback), `components/navbar.tsx` (Dashboard entry) |
| Specifications/status | Modified `context/architecture.md`, `context/ui-context.md`, `context/design-system.md`, `context/code-standards.md`, `context/ai-workflow-rules.md`, this tracker |

This table describes the dashboard unit. Existing landing and creation page contents are preserved; route groups keep their URLs unchanged. The shadcn CLI added only Sheet and retained the customized Button. No palette/global CSS, dependency versions, lockfile, Next.js settings, schema, migrations, secrets, or external accounts changed.

## Still Incomplete

- Production authentication/deployment and a broader hosted database role/catalog audit are not verified. Development Clerk flows and minimal identity are complete within the scoped evidence above.
- Owned projects are implemented in source but cannot complete hosted save/list/reopen/update acceptance until the new migration is applied. Permanent media, AI/jobs/rendering, credits, marketplace and checkout remain future units. Public /create and Clerk modal authentication remain; private resources enforce identity and ownership at their services.
- Project count/cards now query owned rows in source; all other counts/credits remain explicitly unavailable or previews. No generated thumbnails/history/statuses, templates, purchases or balances were added. Latest hosted schema lacks projects, so dashboard currently renders its controlled failure rather than a false empty count.
- Local Files/previews remain memory-only; title/category/prompt/settings have explicit save/reopen source. No media is persisted. The new workspace remains on /create after save to retain local previews; refresh-safe reopening uses Open saved draft or the dashboard. There is no autosave, delete/sharing or multi-tab conflict resolution. Last completed explicit save wins.
- Listed durations/styles/tones are exploratory options, not approved provider capabilities, credit tariffs, or free-generation eligibility. Production file size/type/security policies remain open.
- Paid prices, credit bundles/tariffs, and subscriptions are not defined. Pricing cards show no invented rates or purchasable actions.
- Landing artwork remains illustrative; creation playback controls are only for selected local sources. No fabricated generated output or processing is shown.
- Final logo artwork remains unapproved; the wordmark/mark are preview interpretations of the references.

## Next Up

**Required current-unit follow-up:** apply `supabase/migrations/20261009000200_projects.sql` through the development SQL Editor, then run the prepared real two-account save/list/refresh/reopen/update/foreign-access checks and empty/populated UI checks. Do not mark projects Complete before those pass. **Recommended next implementation unit afterward:** authorized permanent media upload for one owned project, after defining storage limits/formats/CORS/access rules. No next unit was started.

| Order | Planned unit | Minimum outcome / prerequisites |
| --- | --- | --- |
| 1 | Clerk development acceptance — Complete | Actual modal/session/account/protection/refresh/theme/mobile and new-device checks passed. No dedicated auth pages. |
| 2 | Minimal application identity — Complete in development | Applied app-user migration, real unique two-account mapping, repeat login/refresh and safe profile updates passed. |
| 3 | Project persistence - In Progress | Source/migration/isolated checks implemented; hosted schema application and real saved-record/two-account acceptance pending. |
| 4 | Media upload | Authorized direct object-store upload with project metadata, validation, progress, failure handling, and access enforcement. |
| 5 | Persistent generation/job boundary | Owned persistent state, durable dispatch, recovery, and a defined first production path. A test job is not real AI creation. |
| 6 | Free allowance and credits | Server-enforced two free short generations, approved tariffs, race-safe reservations/settlement/restoration, and ledger history. |
| 7 | PayPal Sandbox credit purchases | Sandbox only; verified successful capture grants credits once, duplicates/failures do not. Keep environment/credential selection behind a payment service for a later intentional production switch. |
| 8 | Production stages, separately scoped | Analysis → planning → first video provider → voice where needed → assembly → rendering/storage/delivery. Each unit verifies real stage outputs, ownership, and failures. |
| 9 | Complete MVP polish | Prove the complete public-to-result and Sandbox free-to-paid flow, responsive themes, accessibility, and recovery. |
| Later | Creator marketplace/subscriptions/payouts | Defined economics and core MVP first; not part of this UI phase. |

## Open Questions

Resolve before dependent implementation; prefer the planned directions in architecture.md without treating them as installed services.

| Question | Affected unit |
| --- | --- |
| Which creation category and concrete use case proves the first MVP? | Actual creation form contract and production pipeline. |
| Which exact analysis/video/voice models and stage contracts are adopted? | Gemini/Runway/ElevenLabs are preferred planned directions, not final configured integrations. |
| What storage limits, formats, CORS, retention, and media-access policies apply? | R2 is preferred; real uploads and delivery. |
| What workflow-to-worker dispatch, authentication, deployment resources, and recovery contracts apply? | Inngest and Render/Docker are preferred; actual job implementation. |
| When is the new projects migration applied so hosted acceptance can finish? | Minimal draft schema/ownership are implemented and isolated-tested; SQL Editor application remains pending because existing API credentials cannot execute DDL. |
| What paid bundles, prices/currency, credit tariffs, and subscription limits are approved? | Pricing configuration, credits, and payments. PNG rates are illustrative. |
| How are concurrent capacity reservations, settlements, failures, and refunds handled? | Accounting and paid provider execution. |
| Which exact duration/options qualify for the two free short generations? | Server eligibility. The count of two and approximate 10-second duration are already specified. |
| What moderation and model-fallback rules apply? | Actual AI execution. |
| Which final production logo assets and ambiguous PNG labels are authoritative? | Final branding. Current tokens remain authoritative for UI. |
| What marketplace fees and creator earnings/payout rules apply? | Deferred creator economy. |

## Architecture Decisions

- Keep one root-level Next.js/Tailwind/shadcn/Base UI design system; landing and creation page headers stay server-composed/static and browser interactions stay in scoped client boundaries.
- Use the existing token palette in both themes. Default to system preference with a light CSS fallback; explicit choice persists under `sceenyk-theme`, is applied before paint, and synchronizes across tabs.
- Application identity uses one server-only Supabase SDK layer and a unique Clerk ID upsert. Supabase Auth and browser database access are unused; future private resources require independent verified identity and ownership checks.
- Clerk is the only identity source. Use official centered modals/UserButton, development keys only, neutral loading, and server guard checks at proxy/layout/page boundaries. Missing configuration denies dashboard access. No browser-supplied identity/return URL, shared auth cache, or custom auth system.
- Public pricing and media concepts are explicit UI previews; they do not establish billing configuration, generated content, or backend capacity.
- Workspace browser Files and options stay in component state. Object URLs are subscription-owned browser resources created only for active previews and revoked when inactive. Browser preview format checks are advisory; server upload validation must be defined separately.
- All payment development/testing uses **PayPal Sandbox only**. No Live credentials, Live checkout, or real-money transactions. Eventual production environment selection belongs behind the payment service and is not implemented here.
- Preserve planned service boundaries: Supabase for structured data, object storage for media, background execution for long AI/rendering work, and server-authoritative ownership/credits with ledger-backed idempotency.

## Session Notes

- **Last work:** owned draft persistence source, migration and focused verification, 2026-10-09. Hosted application/acceptance pending; no later unit started.
- **Worktree:** existing uncommitted identity work was present at task start and preserved. No changes reset or committed.
- **Source inspection:** read current AGENTS/context in the required order, design-system conventions, existing Clerk implementation and database/environment/package state. Read installed Next.js authentication/Proxy/data-security/connection/rethrow guidance and official Clerk/Supabase references before dependent code.
- **Migrations/environment:** existing app_users migration is applied and unchanged. New projects migration is ready/tested but pending user SQL Editor application. Existing ignored development credentials are used; no new environment variable/secret change. Zod 4 added as the sole runtime validator.
- **Verification tooling:** temporary local production server/headless Chrome, isolated PostgreSQL WASM engine and source/SDK harness. This unit adds Zod as the one runtime validator, with no test framework. Test server/browser are stopped after checks. A syntax-checked temporary `sceenyk-project-hosted-acceptance.cjs` is ready for the pending real two-account acceptance.
- **Resume:** finish the current real project acceptance once the pending migration is applied, using reserved development accounts A/B and the prepared browser/service harness. No automatic generation, billing, storage or marketplace work.

## Update Rules

After each meaningful implementation unit: record actual behavior, changed files, validation evidence and limitations, incomplete work, migrations/configuration needs, resolved decisions, and the next bounded unit. Move work to Complete only after its scoped acceptance checks pass. UI-only work cannot complete a feature requiring backend enforcement. Keep context and source synchronized and distinguish preferred/installed/configured/verified integrations.
