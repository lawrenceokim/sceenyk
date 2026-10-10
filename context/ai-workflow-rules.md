# AI Workflow Rules

These rules guide incremental Sceenyk development from the hackathon MVP toward a production application. Apply them within the current task's authorized scope.

## Approach

Use a spec-driven workflow. `/context` is the source of truth for product behavior, design, architecture, coding standards, scope, and implementation progress. Read the relevant documents before implementing a feature; do not invent behavior already defined by the specifications.

Current context and implementation baseline:

- [overview.md](overview.md) defines intended product behavior, the MVP, and success criteria.
- [UI-context.md](ui-context.md) defines UI construction rules; its current on-disk filename is `ui-context.md`.
- [design-system.md](design-system.md) defines visual tokens, component appearance, and reference uncertainty.
- [code-standards.md](code-standards.md) defines coding conventions and required implementation boundaries for existing and future concerns.
- [progress-tracker.md](progress-tracker.md) records verified implementation status, next units, and open questions. [architecture.md](architecture.md) records planned service boundaries and implemented UI contracts.
- Landing/themes, Clerk/application identity, owned projects/private R2 media and generation persistence are development-verified. Local Files remain temporary until verified upload. The separately authorized Inngest dispatch unit adds signed execution, service-only atomic claims, four retries and cron recovery, verified through the real local Dev Server and hosted Supabase. Its preparation handoff fails honestly without a provider/output. Credits/templates remain previews; AI production, rendering and payments are unstarted. Broader prior project acceptance, production deployment and hosted catalog auditing remain separate; reinspect source/tracker before relying on this baseline.

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

**Upload → analysis → production plan → scene generation/transformation → voice generation → video assembly → rendering → final asset storage.**

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

The overview already defines two free short generations of about 10 seconds each; preserve that rule. It does not define exact credit tariffs, refund rules, or model selection. Pricing text in reference PNGs is illustrative, not an approved billing policy. Cloudflare R2 is specified by the authorized media unit; AI, voice and background-job providers remain planned until their units are specified.

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

Run focused, meaningful tests for the changed behavior in addition to static checks. There is currently no test script/framework configured; inspect available tooling before choosing checks, and add testing support only when needed by the unit. Live integrations need relevant runtime/integration evidence, not assumptions based on types.

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
