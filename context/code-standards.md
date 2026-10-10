# Code Standards

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
- Prefer discriminated unions for known domain states. An illustrative generation status is `queued | analyzing | generating | rendering | completed | failed`; only define states that the actual pipeline supports.
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
- Tailwind 4 is CSS-first: use the existing `@theme inline`, utilities, and shared classes. No separate Tailwind config exists; do not introduce one or a competing palette/theme system without a documented need.
- Use semantic pairs such as `bg-card text-card-foreground`, `text-muted-foreground`, `border-border`, and `ring-ring`. Never hardcode theme hex colors in components when a token applies.
- Reuse the existing spacing, type, radius, shadow, gradient, and motion scales. Inter is the UI/display font; Geist Mono is for code/mono content. Purple leads, with supporting blue/cyan and selective gradients/glow.
- Support light `:root` and `.dark` on `<html>` equally, preserving root font classes. Use the implemented system/saved preference controller and toggle; preserve before-paint initialization and `sceenyk-theme` persistence.
- Use shadcn as the common-control base, normally adding needed primitives through `npx shadcn add <component>`. Review generated changes; do not reinitialize or overwrite Sceenyk's theme. Button, Dialog, and Sheet currently exist.
- Prefer shared variants, composition, and `cn` over repeated large class strings or primitive rewrites. Reuse `@/lib/utils` for `cn`; the existing Button imports it directly from the installed `cn` package.
- Build responsive layouts from the start. Maintain contrast, focus, keyboard behavior, touch targets, and disabled states. Keep animation purposeful and respect reduced motion; effects must not substitute for accessible state cues.

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

**Supabase PostgreSQL has hosted identity/projects/assets.** The media unit verifies project-first save/reopen and owned asset persistence against live R2; broader prior project acceptance and full hosted grant/catalog auditing remain tracked separately. Other domain schemas remain unspecified. Keep jobs/credits/payments/templates/marketplace outside the authorized media unit.

- Store large videos, audio, images, temporary artifacts, and rendered output in object/blob storage. PostgreSQL stores stable object references and relevant metadata; generate short-lived access URLs when needed instead of treating expiring signed URLs as permanent asset identity.
- Introduce only the schema required by the requested unit. Verify actual tables/columns and constraints before writing queries or migrations; do not infer deployed schema from documentation examples.
- Protect invariants with constraints and transactional operations where possible. Index frequent ownership/lookups/filter fields based on actual query needs; select only needed columns and avoid unnecessary queries.
- Enforce cross-user isolation in the chosen server/database access strategy, including associated jobs and assets. Document access policies and test them with separate users.
- Use migrations for schema changes. Never rewrite migrations that may have been applied; add a new one and record whether it was applied/verified. Avoid destructive migrations without explicit approval.
- Cloudflare R2 is the implemented private project-media provider; see [media-storage.md](media-storage.md). Final product limits and retention/deletion remain open; the configurable single-PUT development safeguard is not a product limit. Do not introduce Supabase Auth as a competing authentication source.

## AI and External Providers

- Application code should call shared Sceenyk services, with provider-specific SDK calls isolated behind small interfaces/adapters. Keep providers replaceable without building an unused universal framework.
- Future boundaries may include `lib/ai/`, `lib/video-ai/`, and `lib/voice/`, with a `providers/` folder when needed. Example filenames `runway.ts`, `gemini.ts`, and `elevenlabs.ts` illustrate organization only; these providers are neither selected nor installed.
- Keep API keys server-side and validate requests and provider responses. Handle bounded timeouts, rate limits, unavailable services, malformed output, and partial failures with useful persisted outcomes.
- Persist provider job IDs, stage input/output references, and safe retry information for asynchronous work. Check whether a job was accepted/completed before retrying a request that may incur another charge.
- Do not silently fall back to a more expensive model or alter moderation/model-selection rules. Use approved provider, cost, and content policies; unresolved choices belong in the tracker.

## Background Jobs and Video Processing

- Run long AI/video work outside normal request-response flows. The background-job provider/runtime is not selected; a timer or in-process promise in a request is not a durable worker.
- Persist job ownership, states, stage progress, provider references, results, and failures. Users must be able to leave/reload and recover status; the browser must not remain blocked waiting for completion.
- Define clear inputs/outputs for each stage and make state transitions safe under concurrent workers/retries. Retry recoverable stages without restarting successful work; use bounded retry rules and prevent duplicate paid execution.
- Suggested states include queued, uploading, analyzing, planning, generating, voice, rendering, completed, and failed. They are examples, not an imposed enum. Use only states matching the implemented architecture and centralize their type/transition rules.
- Run FFmpeg/Remotion or equivalent rendering in a worker environment that supports the actual compute, disk, and duration needs. These tools are not currently selected or installed; do not place heavy rendering in lightweight frontend hosting.
- Clean up temporary files after success/failure according to the agreed retention policy. Upload final output to object storage and persist the stable result reference before reporting completion.
- Recover stale/stalled jobs through the chosen workflow mechanism; a failed job must not remain indefinitely in processing.

## Payments and Credits

**PayPal is specified for hackathon payments; integration and accounting are Not Started.** Two free short generations of about 10 seconds each are specified; exact eligibility, tariffs, reservation/settlement, and failure-restoration rules need definition before implementation.

Development and testing must use **PayPal Sandbox only**. Do not use Live credentials or real-money transactions. Keep eventual environment/credential selection behind the payment service; production switching is a later explicitly scoped task.

- Never grant credits from a browser success callback alone. Verify payment results server-side and verify webhook authenticity before processing. Confirm the expected payment identity, owner, amount/currency, and final provider status.
- Keep PayPal logic behind a payment service where practical. Credit/free-allowance changes happen on the server through transactional accounting with ledger/history recording the reason and related payment/job.
- Payment finalization must be idempotent: repeating a payment/webhook request must not credit the user twice. Enforce this persistently, including concurrent callbacks/events; an in-memory flag is insufficient.
- Prevent double-spending/free-allowance reuse when concurrent generations start. Use an atomic reservation/debit strategy consistent with the approved settlement policy, with safe reconciliation after failures.
- Failed generations follow the documented refund/credit-restoration rule. Never invent pricing, credit costs, subscription limits, creator shares, marketplace fees, or refund behavior; PNG pricing is illustrative.
- Keep the working MVP credit-purchase path separate from later subscription management, marketplace purchases, and creator payouts unless the task explicitly includes them.

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
- There is no `test` or `typecheck` script or test framework configured. Add proportionate tests/tooling when needed; do not document nonexistent commands or create tests that merely mirror trivial styling.
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
