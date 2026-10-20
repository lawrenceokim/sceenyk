# Code Standards

## Motion & Interaction Standard (2026-10-20)

Future UI must respond immediately, finish softly and use the [approved motion tokens](design-system.md#motion--interaction-standard-2026-10-20) in app/globals.css. Ranges/defaults: micro 150–200/180ms; popup 180–250/220ms; modal 220–300/260ms; sidebar/panel 250–350/300ms; optional reveal 300–500/420ms. Easing: cubic-bezier(0.22, 1, 0.36, 1). Use Tailwind transition properties, token durations/easing, restrained transforms and opacity. Reuse components/ui/motion.ts for Base UI popup/backdrop presence; preserve unmount/close lifecycles, focus/keyboard behavior and accessible labels. Keep icons/row geometry stable during sidebar collapse and synchronize the main inset. Prefer subtle card lift/preview zoom/color feedback. Do not add animation state, timers, blur transitions, bounce or another framework for simple effects.

Use components/ui/smooth-scroll.tsx for ordinary surfaces; never introduce a global nested-panel controller or change infinite-observer roots. Lenis owns its own frame loop and follows active-route cleanup, scroll locks and responsive scroll-root changes. Documentation, Settings center/navigation, Studio panels, modal content and touch scrolling remain native. Destroy inertia when prefers-reduced-motion changes, suppress nonessential transforms and shorten/remove transitions. Native anchors/keyboard/history retain control. Shared discrete native-dialog transitions and Lenis compatibility rules are the minimal CSS exceptions in the sole global stylesheet; ordinary styling stays Tailwind-first. Allow instant behavior only where platform/technical constraints require it. Preserve backend/business/security contracts. Use Fast UI Development Mode for motion-only tasks.

## Styling Policy

**Approved 2026-10-19; applies to all future frontend work unless the user explicitly instructs otherwise.** Sceenyk uses **Tailwind CSS + global.css**, not **Tailwind + scattered component CSS files**. Tailwind CSS is the primary and default styling system. This policy takes precedence over older styling guidance, reference snippets and implementation history in the context documents.

**Global stylesheet name:** the policy's `global.css` refers to the single existing global stylesheet, [`app/globals.css`](../app/globals.css), already used by the root layout and shadcn configuration. Keep that existing filename; do not create a second `global.css`, rename files or change imports as part of this documentation update.

### Required rules

1. Use Tailwind utility classes directly in React/Next.js components for layout, spacing, sizing, typography, colors, borders, radius, responsive behavior, hover/focus/active states, transitions, positioning, overflow, flex/grid and light/dark themes.
2. Do not create new page-specific or component-specific `.css` files.
3. Do not create CSS Modules, including `*.module.css` or `*.module.scss`.
4. Do not use inline `<style>` blocks or styled-components unless an existing dependency absolutely requires that mechanism. Document the dependency requirement; it does not authorize introducing another styling framework.
5. `global.css` (the existing `app/globals.css`) is the only approved custom CSS file for normal application styling.
6. Use it only for genuinely shared/reusable styling that Tailwind cannot express cleanly or would express awkwardly: global CSS variables/design tokens, base/reset styles, font declarations, reusable scrollbar-hiding utilities, shared animation keyframes, reusable browser-specific fixes, shared utility classes and third-party library overrides.
7. Do not move ordinary component styling into the global stylesheet just to avoid Tailwind. Repeated utility combinations should first become reusable React components or component variants.
8. Prefer existing Tailwind design tokens and reusable React components before adding any new global CSS.
9. Reuse the current Sceenyk Tailwind theme, spacing system, breakpoints, colors and light/dark behavior. Preserve accessibility and existing shared component behavior.
10. When modifying a component that currently imports a separate CSS file, prefer migrating the relevant styling to Tailwind within that future UI task. Do not automatically perform a large unrelated CSS migration. Remove an old stylesheet only after all its styles and consumers have been safely replaced and its import is no longer needed.
11. Do not introduce another styling framework.
12. Future Codex UI implementations must use Tailwind as the default styling approach unless the user explicitly instructs otherwise. Existing separate stylesheets are legacy implementation, not permission to create more.

### Exceptions

Custom CSS is allowed only when Tailwind is genuinely unsuitable, such as complex keyframe animation, browser-specific pseudo-elements, unsupported selectors, third-party component overrides or specialized visual effects that cannot reasonably be expressed with Tailwind. First consider existing utilities, variants and arbitrary values/selectors. When an exception is necessary, place it in the single global stylesheet, keep it reusable and minimal, and explain why Tailwind alone was insufficient in the implementation notes and completion report. Ordinary responsive layout, overflow, hover states or a long class list are not exceptions. The dependency-required mechanism in rule 4 must be explicitly explained as such.

This policy does not authorize deleting existing CSS files or starting a repository-wide migration. Historical descriptions of separate stylesheets remain implementation evidence, not the styling approach for new work.

**Migration status (2026-10-19):** a subsequent explicit user request authorized the repository-wide styling migration. It is now implemented in source: app/globals.css is the only project-owned stylesheet, and ordinary styling lives in static Tailwind component classes. Shared exact-breakpoint variants and existing lower-priority component defaults remain Tailwind configuration/cascade choices, not new stylesheet infrastructure. Runtime CSS values may remain in style props; the isolated next/og image renderer requires its own inline styling. Preserve these exceptions and do not reintroduce separate stylesheets. Visual acceptance remains manual; see the progress tracker.

## Focused Studio refinement and canonical URL (2026-10-18)

The latest request supersedes the earlier edge-to-edge Sources overlay and side-by-side tablet layout. Studio is canonical at /studio; /create permanently redirects with query parameters, while owned /projects/[id] routes and existing handlers remain unchanged. At desktop viewport widths with at least 930px available Studio width, Sources/Stage/Properties use 254px/flexible/252px columns. Otherwise Stage precedes Properties; Sources opens as a 254px right-side nonmodal panel from 768px viewport width, or as a focus-managed modal inset 8px on every edge below 768px. One mounted Sources tree retains inputs and local media. Only the mobile modal locks background scrolling. Cached route deactivation releases the native Sources dialog and its body lock; reactivation resynchronizes its CSS mode without remounting controls. Root scrollbar hiding uses active WorkspaceShell effects, because hidden cached DOM must not affect the public landing page. Toolbar controls are 32px with a centered compact aspect segment/popover for the existing 9:16,16:9,1:1 choices; no invented Share or generation options. Existing completed-video download appears as Export in the toolbar through a presentation-only portal; URLs, fetching and handlers stay with the existing result component. At 320px the selected ratio/menu and icon-only Save/Export preserve space and accessible names. Workspace-only scrollbar hiding preserves scrolling and leaves public landing scrollbars unchanged. Preserve logos, themes, business logic and ownership; no hosted Inngest. Stop after Studio review.


## Pryzm reference implementation — Phase 1: Studio (2026-10-18)

Current authorization: use Pryzm_Design_System_Reference_for_Sceenyk.md as the primary workspace geometry reference, with the supplied screenshots for refinement. Implement Studio and necessary shared navigation/frame geometry only, then stop for user review. Templates/Marketplace, Documentation, Projects/Settings and public pages are later phases; preserve their current presentation and existing work. Keep Sceenyk's official logos, configured font, existing colors/themes/features and all backend/auth/financial/provider contracts. No hosted Inngest, generation, checkout or deployment acceptance.

Geometry decisions: a reusable workspace-only token layer; 252px navigation plus an 8px gutter (preserving the current Studio x260 frame position), 64px collapsed rail with no extra gutter, 254px Sources and 252px Properties. Keep the screenshot-tuned 54px toolbar/header and 52px inspector rows within the reference's estimated ranges. Four-area desktop requires at least 930px available Studio width and a desktop viewport; tablet Sources stays a full-screen overlay. A 752px content breakpoint stacks Stage/Properties on viewports up to 767px. CSS owns Sources' rail/modal mode; the native dialog reads that mode and retains one mounted control tree. Controls and type hierarchy are refined without changing handlers or business state. Actual verification is recorded in progress-tracker.md.

## Strict workspace visual-fidelity pass (2026-10-18)

The current user request supersedes earlier phase stop points and geometry guidance for a UI-only pass across Studio, navigation, Templates, Marketplace, Documentation, Projects and Settings. The supplied Pryzm screenshots are the primary layout reference; retain Sceenyk names, official logos, Inter, purple/blue accents and the existing theme controller. No backend, auth, payments, credits, Marketplace behavior, provider, database or guest-draft changes are authorized. Do not trigger hosted Inngest or perform deployment acceptance.

Reference-derived target geometry (Approximate): 260px desktop navigation, 64px collapsed rail, 8px viewport gutters and panel gaps, 14px outer radius, 1px neutral borders, 54px Studio headers/toolbar and 254px Sources/Properties rails at 1366-1440px. Compact desktop navigation uses 32px rows; touch navigation retains larger targets. Panels scroll independently on desktop; mobile retains hamburger/logo, Stage then Properties, and the same mounted full-screen Sources dialog. Gallery cards use a dense responsive grid with compact metadata; actual configuration covers remain labeled rather than inventing artwork. Documentation uses topics/article/contents at reference desktop widths. Settings retains its existing sections and controls. Workspace-scoped neutral surfaces supersede earlier purple-tinted neutrals; brand/action/focus colors remain unchanged. Local screenshots, responsive themes, overflow, lint, types and build are the acceptance scope. See progress-tracker.md for actual results.

## Current Studio Phase 3 scope (2026-10-18)

The current user request authorizes Studio desktop/tablet/mobile presentation and the approved missing guest handoff. Reuse existing state owners/hooks, server contracts and semantic theme tokens. Sources uses one mounted native dialog tree for the nonmodal rail and full-screen modal; caption preference controls render through a React portal without moving playback state. Keep routes, private guards/cache and financial/provider work unchanged. See architecture and progress tracker for implementation and actual acceptance; do not start another feature.


## Authorized Phase 2 presentation (2026-10-18)

Current authorization supersedes the older Phase 1 stop boundary for Templates, public product Documentation, remaining internal presentation and small cross-page consistency fixes. Reuse components/workspace, the existing owned-listing service/account fence, configuration covers and server guards. Public docs content belongs in lib/documentation/content.ts; never render internal context/acceptance files as a manual. New Templates invalidation is routing integration only; business services, schema, payment/provider work and the Studio editor remain unchanged. Stop before Phase 3 and record fixture, local-browser and deployed evidence separately.


## Authorized workspace foundation (2026-10-18)

The current request authorizes Phase 1 implementation and supersedes historical documentation-only/landing-only restrictions for this unit. Shared navigation/shell/page-frame modules live in components/workspace; existing project cards/status presentation lives in components/projects. Use the public app/(workspace) route group for guest Studio, owned project editing and Marketplace, with independent server guards unchanged. Keep protected app/dashboard layout and Settings URLs to preserve cache/security/payment compatibility. Do not move domain services or introduce new features while migrating presentation. Phase 2/3/4 of the current brief supersede earlier scheduling; stop after Phase 1 and record actual local/deployed acceptance separately.


## Approved redesign implementation boundaries (2026-10-17)

Follow [the approved UI/UX redesign contract](ui-context.md) in separately scoped phases; **implementation is Not Started** and the current task changes documentation only. The first recommended unit is **Phase 1 — shared public/workspace shells and navigation architecture**. Prefer clear public shell, workspace shell, Studio, Marketplace, Settings, shared brand/navigation and creative-control boundaries, reusing existing services/hooks and accessible primitives. No broad backend restructuring or route/domain renaming is needed for Studio's user-facing label.

Preserve current colors/tokens/light/dark, Inter/Geist Mono where practical, official logos, Tailwind/shadcn/Base UI behavior and completed Settings navigation. Use output-first composition with fewer unnecessary cards; desktop Studio is Navigation / Sources / Stage / Properties, tablet progressively collapses panels, mobile is Top Navbar → Stage → Properties with separate hamburger navigation and full-screen Sources overlay. Existing source geometry and board observations do not override this approved responsive contract.

Guest configuration is public but browser drafts are untrusted. The later Studio handoff must preserve lightweight choices through Clerk, restore the same flow and retain owned save/upload, quote review and explicit cost confirmation. Large media needs a separately defined safe storage/upload strategy, not casual `localStorage`. Never replace identity/ownership, private responses, payment/credit/Marketplace/earnings/payout or provider contracts to simplify presentation. Inngest Cloud stays paused; use local dev/fixtures and defer hosted acceptance until explicitly authorized. Read installed Next.js guidance before future application code, and record actual per-phase evidence without claiming planned layouts work.

These rules apply to developers and AI coding agents building Sceenyk. Read [overview.md](overview.md), [ui-context.md](ui-context.md), [design-system.md](design-system.md), [ai-workflow-rules.md](ai-workflow-rules.md), and [progress-tracker.md](progress-tracker.md) before relevant implementation work.

**Verified baseline (updated 2026-10-10):** Next.js/React/strict TypeScript/Tailwind/shadcn/Lucide/themes and Clerk development authentication remain. Hosted Supabase identity/projects/assets and real browser R2 upload/finalization/private retrieval/persistence/two-account media acceptance pass. Broader prior project acceptance and hosted catalog auditing remain separate. Zod is the one request validator; server file-type signature detection and AWS S3/signing SDKs belong to storage. No browser database client/Supabase Auth, worker or persistent test runner exists.

Read [architecture.md](architecture.md) for planned provider boundaries and implemented UI contracts. `AGENTS.md` now references the actual product document, `context/overview.md`.

## General

- Work in small, verifiable feature units. Keep modules focused on one responsibility and separate business logic from presentation, routes, and provider adapters.
- Prefer simple, readable code and descriptive names. Reuse existing code before creating duplicates; introduce shared abstractions for real repeated patterns rather than speculative future needs.
- Fix root causes, preserve working behavior outside the requested change, and preserve unrelated worktree changes.
- Split files when responsibilities become unclear; avoid arbitrary line limits or a large component/service doing unrelated jobs.
- Comments explain decisions, constraints, and why code exists. Remove dead code, unused imports, commented-out implementations, and temporary debugging.
- Never silence errors or weaken TypeScript, lint, validation, or security checks to make a build pass.
- Synchronize affected context documents and the progress tracker after meaningful changes. Record unresolved product decisions before implementing dependent behavior.

## TypeScript

- Keep `strict: true` and `noEmit: true` in `tsconfig.json`. Use the existing `@/*` alias, which resolves to the repository root.
- Avoid `any`; use `unknown` for untrusted values until runtime validation establishes their shape. Types alone do not validate JSON, webhook data, or database input.
- Validate form input, external API responses, webhook payloads, environment configuration, and database-facing values at their boundaries. Narrow errors safely before reading their properties.
- Use explicit types/interfaces where they clarify public contracts; let obvious local values be inferred. Use `import type` for type-only imports.
- Prefer discriminated unions for known domain states. The generation contract is `queued | processing | completed | failed`, with a separate current stage, centralized in `lib/generation/contract.ts` and enforced by migration 004. Never simulate stages or percentages.
- Keep genuinely shared domain types in one owned module, such as future `types/generation.ts`. Do not duplicate slightly different status or asset types across client/server code.
- Avoid unsafe assertions and non-null assertions that conceal missing configuration. Document a necessary exception and the invariant that makes it safe.

## Next.js

- Read the relevant guide in `node_modules/next/dist/docs/` before application code changes, as required by [AGENTS.md](../AGENTS.md). Follow the installed version's APIs and deprecation notices rather than older examples.
- Pages and layouts default to Server Components. Add `"use client"` only for browser state/effects, event handlers, browser APIs, or libraries that require it. Keep client boundaries small; do not turn the app into client components for convenience.
- Fetch server-owned data on the server where appropriate. Pass only necessary, serializable data to clients; never pass credentials or full privileged records. Protect secret-bearing modules with an appropriate server-only boundary.
- Use App Router layouts for shared shells, route groups when they improve organization, `loading.tsx`/Suspense for pending content, and `error.tsx` for recoverable rendering failures. Do not replace useful server rendering with unnecessary client fetches.
- This project enables `cacheComponents` and `partialPrefetching`. Read the installed caching and authentication-with-cache-components guides when adding data/auth reads: keep request-time/session UI behind appropriate Suspense boundaries and avoid shared caching of authentication decisions. Do not copy incompatible legacy route caching flags or disable these settings to hide errors.
- Follow the installed async request API conventions, including awaiting promised route parameters/request data where required. Keep each Route Handler focused; use `app/**/route.ts`, not a parallel Pages Router API system.
- Preserve the CSS loader, global CSS import, font classes, and generated Next.js instruction block. Do not edit `node_modules`, `.next`, or generated framework types manually.

## React Components

- Give each component one purpose. Put reusable primitives in `components/ui/`, shared application composition in `components/`, and feature-specific UI near its feature when needed.
- Prefer composition over giant configurable components. Keep purely presentational components free of payment, database, or provider logic.
- Follow hook rules. Custom hooks should capture reusable behavior; avoid hooks that only disguise arbitrary code extraction. Use local state first and shared state/context only when needed to avoid excessive prop drilling.
- Use stable identity keys and derive values rather than maintaining redundant state. Handle async cleanup and stale responses so a changed project/input cannot display another request's result.
- Account for loading, disabled, empty, success, and failure states where relevant. Loading controls expose status and prevent duplicate submissions; disable actual behavior rather than applying opacity alone.
- Use semantic HTML, accessible labels, and distinct links/buttons. Preserve keyboard interaction, visible focus, dialog focus management, and status announcements.

## Styling

- Follow [ui-context.md](ui-context.md) and [design-system.md](design-system.md). The PNGs are visual references; preserve their Exact/Approximate/Inferred/Needs confirmation distinctions. `app/globals.css` owns implementation tokens.
- Follow the [Styling Policy](#styling-policy): use Tailwind utilities in components and the single global stylesheet only for approved shared exceptions. Tailwind 4's CSS-first `@theme inline` configures tokens; it does not authorize page/component stylesheets or ordinary component rules in global CSS. No separate Tailwind config exists; do not introduce one or a competing palette/theme system without explicit user direction.
- Use semantic pairs such as `bg-card text-card-foreground`, `text-muted-foreground`, `border-border`, and `ring-ring`. Never hardcode theme hex colors in components when a token applies.
- Reuse the existing spacing, type, radius, shadow, gradient, and motion scales. Inter is the UI/display font; Geist Mono is for code/mono content. Purple leads, with supporting blue/cyan and selective gradients/glow.
- Support light `:root` and `.dark` on `<html>` equally, preserving root font classes. Use the implemented Light/Dark/System preference controller through Settings → Appearance; preserve before-paint initialization and `sceenyk-theme` persistence.
- Use shadcn as the common-control base, normally adding needed primitives through `npx shadcn add <component>`. Review generated changes; do not reinitialize or overwrite Sceenyk's theme. Button, Dialog, and Sheet currently exist.
- Prefer reusable React components, Tailwind-based variants, composition and `cn` over repeated large class strings or primitive rewrites. Do not extract utility combinations into new CSS classes merely to shorten JSX. Reuse `@/lib/utils` for `cn`; the existing Button imports it directly from the installed `cn` package.
- Build responsive layouts from the start using approved per-experience adaptations, not a desktop layout merely shrunk. Maintain contrast, focus, keyboard behavior, touch targets, and disabled states. Keep animation purposeful and respect reduced motion; effects must not substitute for accessible state cues.

## API Routes and Server Logic

- Treat Route Handlers and Server Actions as externally callable boundaries. Verify authentication for protected operations, validate the request, and enforce authorization before data access/mutations or provider work.
- Never trust browser-supplied user IDs, ownership, permissions, prices, model tariffs, credits, or entitlement decisions. Derive identity from the verified session and amounts/rules from authoritative server configuration.
- Keep routes thin: request parsing, verification, service invocation, and response mapping. Put reusable business logic in server services rather than importing routes into application code.
- Use the installed Zod 4 for runtime input validation. Project choices/limits are shared in `lib/projects/options.ts`; strict schemas reject ownership/status/media/unknown fields. Reuse this validator rather than adding a competing library.
- Define consistent typed response contracts for new endpoints, with a stable error code and safe message. Use appropriate HTTP status codes, including validation errors, 401 for missing authentication, 403 for denied access, and 409 for conflicting state where appropriate. Do not expose internal/provider errors in responses.
- Make mutations safe against duplicate requests where needed using persisted idempotency keys/constraints or equivalent transactional enforcement. Client-side disabling alone is insufficient.
- Job submission should return a job reference/status promptly; do not perform the entire AI/video pipeline in a normal API request. Authenticate and validate provider webhooks under their own contract rather than assuming an interactive Clerk session.

## Authentication and Authorization

**Clerk is the authentication source of truth.** The development SDK/provider, centered modal/account controls and server-protected dashboard are live verified. See [authentication.md](authentication.md). Authentication establishes who the user is; authorization determines what that user may access or change.

- Use centered Clerk modal/overlay sign-in and sign-up at the point of need. Do not add dedicated `/signin` or `/signup` pages or a second custom password/session system.
- Preserve public exploration defined in the overview. Generation, private projects, purchases, and other account-dependent operations require verified server-side Clerk authentication.
- Derive the acting user from the server session, not a posted ID. Resolve the application's Clerk-to-database identity mapping through one documented boundary.
- Authentication alone never grants access to another user's project, asset, job, or balance. Enforce ownership/permissions for reads and writes at the data-access boundary; UI guards and layouts are not sufficient security enforcement.
- Document and verify the Clerk/Supabase authorization strategy when implemented. If privileged database access bypasses policies, the server must still enforce ownership; test cross-account rejection.

## Data and Storage

**Supabase PostgreSQL has hosted identity/projects/assets.** The media unit verifies project-first save/reopen and owned asset persistence against live R2; broader prior project acceptance and full hosted grant/catalog auditing remain tracked separately. The separately authorized job foundation adds immutable owned snapshots and trusted server-only transitions in migration 004 (hosted application/acceptance pending). Other domain schemas remain unspecified. Credits/payments/templates/marketplace and actual processing stay excluded.

- Store large videos, audio, images, temporary artifacts, and rendered output in object/blob storage. PostgreSQL stores stable object references and relevant metadata; generate short-lived access URLs when needed instead of treating expiring signed URLs as permanent asset identity.
- Introduce only the schema required by the requested unit. Verify actual tables/columns and constraints before writing queries or migrations; do not infer deployed schema from documentation examples.
- Protect invariants with constraints and transactional operations where possible. Index frequent ownership/lookups/filter fields based on actual query needs; select only needed columns and avoid unnecessary queries.
- Enforce cross-user isolation in the chosen server/database access strategy, including associated jobs and assets. Document access policies and test them with separate users.
- Use migrations for schema changes. Never rewrite migrations that may have been applied; add a new one and record whether it was applied/verified. Avoid destructive migrations without explicit approval.
- Cloudflare R2 is the implemented private project-media provider; see [media-storage.md](media-storage.md). Final product limits and retention/deletion remain open; the configurable single-PUT development safeguard is not a product limit. Do not introduce Supabase Auth as a competing authentication source.

## AI and External Providers

Visual execution uses server-only `lib/video-ai/` services and active `providers/fal.ts`, with central capabilities/rates/cost guards and shared scene lifecycle in `contract.ts`; Runway remains inactive. Keep official SDK calls in that adapter and prevent SDK submission replay because unknown outcomes can be charged. Persist a submission slot before paid work and the task ID before polling. Retry only definite 429 rejections within the persistent attempt bound, or idempotent reads/storage through bounded Inngest retries. New video transform/reuse must use completed owned segments through `lib/media-preparation/` before paid submission. Keep integer milliseconds throughout preparation and convert immutable schema-v1 seconds at its compatibility boundary. Missing/invalid source timing or permanent preparation failure blocks spending; unsupported provider requirements remain pending. Private inputs use verified short-lived signed reads; outputs use immutable owned R2 keys and separate intermediate metadata. Never turn provider usage/cost estimates into customer debits or final-result settlement. Current real acceptance limits are in the tracker.

The Gemini understanding/planning unit introduces `lib/ai/` with a server-only service, central configuration and isolated REST provider adapter. Keep the strict Zod plan and contextual source/timeline checks before persistence. Usage/model/attempt metadata stay server-only; the browser receives readiness through owned job DTOs. Never replay a started uncertain paid attempt or overwrite a saved plan. Native REST uses the existing validation approach and adds no Google/Vercel AI SDK. Current verification/rollout limits are in the tracker; fal visuals and ElevenLabs voice have scoped real deployed evidence, while final rendering remains planned.

- Application code should call shared Sceenyk services, with provider-specific SDK calls isolated behind small interfaces/adapters. Keep providers replaceable without building an unused universal framework.
- Implemented boundaries are `lib/ai/`, `lib/media-preparation/`, `lib/video-ai/` and `lib/voice-ai/`, with isolated Gemini/FFmpeg/active fal/ElevenLabs REST adapters plus an inactive retained Runway adapter. Voice has scoped deployed acceptance; preserve its persisted submission slot and recover private audio before considering paid work. Voice-metadata lookup failure cannot alone establish TTS unavailability. FFprobe imports stay in the external worker, never Next.js orchestration. Never convert provider character-cost into customer credits or unverified dollar charges.
- Keep API keys server-side and validate requests and provider responses. Handle bounded timeouts, rate limits, unavailable services, malformed output, and partial failures with useful persisted outcomes.
- Persist provider job IDs, stage input/output references, and safe retry information for asynchronous work. Check whether a job was accepted/completed before retrying a request that may incur another charge.
- Do not silently fall back to a more expensive model or alter moderation/model-selection rules. Use approved provider, cost, and content policies; unresolved choices belong in the tracker.

## Background Jobs and Video Processing

- `lib/composition/` defines the schema-v1 integer-ms contract, owner-only read service and signed worker inspection client. Migration 015's service-only SQL planner derives every reference/time/readiness field from immutable persisted records; never add browser timeline submission as a trusted input. Reuse verified prepared/narration durations, cache immutable ETag-bound checks, and probe unknown video duration only in the external worker. Persist timing conflicts without changing produced assets, settling/releasing the hold, or invoking another provider. Default narration offset and technical tolerance are centralized/frozen; version 1 uses 0ms for both. Historical plans/checks are immutable. A renderer must require a validated ready contract; this unit starts no rendering.

- Run long AI/video work outside request-response flows. Inngest owns durable orchestration; its signed endpoint and service-only database claims are the worker boundary. An in-process promise or request timer is not a durable worker. The authorized final renderer uses isolated `lib/final-render/` and `workers/final-render/` modules on the external worker, with an optional standalone Docker entry. Persistent leases, heartbeat, bounded rendering, canonical R2 recovery and independently probed receipts precede Inngest finalization. Never trust a browser completion claim or worker HTTP acknowledgement. Only verified final output consumes the original reservation. Preserve holds on ambiguous upload/verification failures and restore exactly once on definitive failure with no usable result.
- Persist job ownership, states, stage progress, provider references, results, and failures. Users must be able to leave/reload and recover status; the browser must not remain blocked waiting for completion.
- Define clear inputs/outputs for each stage and make state transitions safe under concurrent workers/retries. Retry recoverable stages without restarting successful work; use bounded retry rules and prevent duplicate paid execution.
- Use implemented queued/processing/completed/failed states and separate forward-only stage/dispatch state. Centralize TypeScript rules and SQL constraints. Never complete a generation without verified durable output.
- Run FFmpeg/Remotion or equivalent processing in a worker environment that supports actual compute, disk and duration needs. FFmpeg/FFprobe source preparation is installed/tested in a separate authenticated Node worker; Next/Inngest sends IDs only. Use shell-free fixed argv, verified owned local source bytes, bounded resources and fresh temporary-directory cleanup. Remotion/final rendering remains unimplemented; do not place heavy processing in browser/Next handlers.
- Clean up temporary files after success/failure according to the agreed retention policy. Upload final output to object storage and persist the stable result reference before reporting completion.
- Recover stale/stalled jobs through the chosen workflow mechanism; a failed job must not remain indefinitely in processing.

## Payments and Credits

**PayPal Sandbox one-time purchases are Complete within Merchant Sandbox acceptance;** see [payments.md](payments.md). The approved primary model is pay-as-you-go credits and manual top-ups, not monthly plans; purchased credits do not expire unless a future explicit product decision changes this. The accounting contract retains two lifetime free generations of at most ten seconds with atomic reservation and exactly-once failure restoration. The commercial quote boundary is implemented in `lib/pricing/`; see [pricing.md](pricing.md). Never scatter tariffs or accept browser cost/tier/free/version claims. Show a server-issued quote before explicit confirmation and reserve its validated server cost before dispatch. Production retail prices remain unresolved; optional rates are visibly development/test-only.

Development and testing must use **PayPal Sandbox only**. Do not use Live credentials or real-money transactions. Keep eventual environment/credential selection behind the payment service; production switching is a later explicitly scoped task.

- Never grant credits from a browser success callback alone. Verify payment results server-side and verify webhook authenticity before processing. Confirm the expected payment identity, owner, amount/currency, and final provider status.
- Keep PayPal logic behind a payment service where practical. Credit/free-allowance changes happen on the server through transactional accounting with ledger/history recording the reason and related payment/job.
- Payment finalization must be idempotent: repeating a payment/webhook request must not credit the user twice. Enforce this persistently, including concurrent callbacks/events; an in-memory flag is insufficient.
- Prevent double-spending/free-allowance reuse when concurrent generations start. Use an atomic reservation/debit strategy consistent with the approved settlement policy, with safe reconciliation after failures.
- Failed generations follow the documented refund/credit-restoration rule. Never invent pricing, credit costs, subscription limits, creator shares, marketplace fees, or refund behavior; PNG pricing is illustrative.
- Keep one-time credit purchases separate from marketplace purchases and creator payouts. Monthly subscriptions are outside current scope; membership and auto-recharge are unapproved future options requiring separate product decisions and authorization, not the next required commercial feature.

## Error Handling and Logging

- Do not swallow errors. Distinguish expected validation/auth/conflict/provider failures from unexpected system failures; give users concise messages and a useful next action.
- Preserve useful database/provider context in restricted logs, with request/job/stage identifiers for correlation. Return safe error codes/messages to clients rather than raw stack traces or upstream payloads.
- Never log access tokens, API keys, payment secrets, or unnecessary personal data/uploaded content. Log metadata needed for diagnosis, not complete media/prompt payloads by default.
- Record a job's failed stage and safe failure reason; preserve enough internal context to diagnose it. Ensure failure paths update persistent state and trigger the agreed accounting outcome.

## Security

- Keep secrets and privileged credentials server-side; never commit secret `.env` files or place secrets in `NEXT_PUBLIC_*`. Validate required configuration at the owning integration boundary and document variable names/purpose without values.
- Validate all external inputs, enforce resource ownership server-side, verify Clerk sessions, and verify PayPal/provider webhooks. Maintain database/storage policies; never disable checks for development convenience.
- Use scoped, short-lived signed upload/download URLs where appropriate. Restrict upload size/type, verify relevant file characteristics, generate safe storage keys, and never trust user filenames as paths.
- Render user-generated text safely; avoid raw HTML injection. Validate any user-supplied remote media URL before server fetching so it cannot reach internal/private services.
- Protect cookie-authenticated mutations against cross-site misuse using the applicable framework/provider protections. Apply documented rate limits to expensive endpoints and generation abuse controls when introduced.
- Authorization must cover thumbnails, downloads, job status, and provider-result association as well as primary project mutations.

## Performance

- Prefer authorized direct object-storage uploads over proxying large video bodies through Next.js when available. Keep uploads linked to verified project ownership.
- Use thumbnails and appropriately sized previews instead of full-resolution media in lists. Lazy-load expensive media/client features and avoid downloading every video on page load.
- Paginate growing project/template/marketplace lists and avoid repeated database/provider calls for unchanged data. Keep client JavaScript small and interactive boundaries focused.
- Cache stable data only with explicit lifetime/invalidation and ownership scope. Never share private project/session data across users or rely on cached balances/permissions for authoritative mutation checks. Follow the installed Cache Components guide.
- Long work belongs in persistent background jobs. Use progress/status updates or bounded polling/subscriptions rather than one long HTTP request; avoid duplicate polling/provider requests.

## Testing and Verification

- Define testable end-to-end acceptance criteria for each meaningful feature. Verify success, relevant failure paths, unauthorized/cross-account access, and duplicate/concurrent payment or credit actions.
- Check mobile/desktop, keyboard/focus behavior, and both themes for UI changes. Use payment sandbox/test environments; mock expensive AI calls for automated tests and label mocks honestly. Real integration claims require appropriate runtime evidence.
- Existing package scripts are `npm run dev`, `npm run start`, `npm run lint`, and `npm run build`. Before marking application work complete, run lint/build and `npx tsc --noEmit` (a direct TypeScript command, not a package script).
- There is no generic `test` or `typecheck` script. Reproducible Node/PGlite suites are `test:pricing`, `test:accounting`, `test:generation`, and `test:dispatch`; `test:client-secrets` scans the production build. Tests use clearly labeled external-service fixtures where relevant; live acceptance is recorded separately. Add proportionate checks for behavior rather than tests mirroring trivial styling.
- Builds currently fetch Inter and Geist Mono through `next/font/google`; restricted-network font failure is a verification limitation, not justification to suppress errors. Record actual results and prerequisites.
- For documentation-only work, verify structure, links, source consistency, whitespace, and file scope; application lint/build/runtime checks need not be repeated merely because a document changed. Never claim unperformed checks passed.
- Update the tracker with evidence, limitations, migrations/configuration needs, and the next unit. Installed dependencies, mocked progress, and successful compilation do not establish a working product integration.

## File Organization

The repository uses root-level folders, **not `src/`**. Preserve that organization and the root `@/*` alias.

| Existing location | Responsibility |
| --- | --- |
| `app/` | Root document/theme, CSS and metadata; `(public)/` layout for `/` and `/create`; `dashboard/` layout/page for the app-shell preview. URL paths are unchanged by route groups. |
| `components/ui/` | shadcn/Base UI Button, Dialog, and Sheet. |
| `components/` | Shared brand/navigation/footer/theme/sign-in notice/artwork/EmptyState; `landing/`, `creation/`, and `dashboard/` hold scoped UI. |
| `lib/` | `utils.ts` reexports `cn`; `theme.ts` owns initialization and the preference key. |
| `public/` | Preview brand mark and unused stock SVGs. |
| `context/` | Product, UI/design, workflow, progress, and coding specifications. |
| `designs/` | Light/dark PNG visual references. |
| Root configuration | `package.json`/lockfile, TypeScript, ESLint, Next.js, and `components.json`; no Tailwind config file. |

Introduce folders only when the requested feature needs them. Future `components/` compositions, `features/<feature>/`, `hooks/`, and `types/` can hold shared UI, feature-specific modules, reusable behavior, and genuinely shared types. These are recommendations, not existing implementations.

Future server/service boundaries under `lib/` may include `auth/`, `db/`, `ai/`, `video-ai/`, `voice/`, `payments/`, `storage/`, and `validation/`. Keep each contract narrow; isolate provider adapters inside its boundary. Choose migration/worker locations with the actual tooling and document them in architecture rather than creating placeholder folders now.

Naming and formatting:

- React component symbols and TypeScript types/interfaces: `PascalCase`; hooks: `useSomething`; functions/variables: `camelCase`.
- Use descriptive lowercase/kebab-case module filenames consistent with `button.tsx` and the context docs. Hook modules may use `use-something.ts`; preserve Next.js reserved route filenames and route-group/dynamic-segment conventions.
- Constants currently use descriptive `camelCase` bindings (`nextConfig`, `buttonVariants`); there is no established domain-constant convention. Follow nearby code; reserve `UPPER_SNAKE_CASE` for named fixed configuration/domain constants where that distinction helps. Environment variable names use `UPPER_SNAKE_CASE`.
- Use TS/TSX for new application modules, type-only imports where appropriate, and existing ESLint rules. No Prettier configuration exists; starter files use semicolons while generated Button uses semicolonless formatting. Follow the file's style and avoid unrelated formatting churn.
- Prefer `@/` for cross-folder application imports. Preserve generated shadcn exports/props conventions and use relative context links with actual filename casing.

## Dependency Rules

- Prefer existing dependencies. Add a library only for a clear need in the current unit; prefer maintained, established packages and avoid multiple libraries solving the same problem.
- Use npm and maintain `package-lock.json` with dependency changes. Review generated CLI changes before accepting them; do not install all planned provider SDKs in advance.
- Do not run `npm audit fix --force` automatically or make major upgrades during unrelated work. Review breaking changes and keep Next.js, React, ESLint, Tailwind, and related packages compatible.
- Remove unused dependencies only after confirming they are unused and removal is safe; do not clean unrelated dependency state as part of a feature/documentation task.

## Final Rule

These standards are the default rules for Sceenyk development. If an implementation needs to depart from a rule, document the reason and update the relevant context/architecture specification within the authorized unit. An exception must not silently change product requirements or weaken security; unresolved decisions remain explicit in the progress tracker.
