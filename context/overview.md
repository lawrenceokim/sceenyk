# Sceenyk

## Current landing-only implementation (2026-10-17)

The user authorizes landing-page motion, responsiveness and visual refinement, plus the explicitly requested shared dark-default theme adjustment. The latest scrolling-copy/navigation/footer follow-up passes local production/browser/visual acceptance, with deployment pending, in [the tracker](progress-tracker.md). Public discovery artwork and the Studio showcase are illustrative; existing tokens and server contracts remain unchanged, and other application pages retain their composition while inheriting the requested dark default. Inngest Cloud stays paused. Earlier documentation-only approval/status below is historical for this bounded landing unit, not permission to start the full redesign.


## Approved full UI/UX redesign direction (2026-10-17)

**Creative studio first. SaaS dashboard second.** The [approved redesign contract](ui-context.md) defines a premium creative-production workspace while preserving Sceenyk's current branding, light/dark themes, purple/blue colors, tokens, typography where practical, official logos and Tailwind/shadcn foundation. This is documentation approval only; **redesign implementation is Not Started**.

Two visual environments organize the product: **Public / Discovery** (Landing, Marketplace, Pricing, Documentation and creator storefronts) uses top navigation and immersive visual-first presentation; **Sceenyk Workspace** (Studio, Projects, Library, Settings and creator/account management) uses compact persistent navigation on large screens and output-first tools. Studio configuration is guest-accessible; private data, saving/uploads, generation and financial operations remain server-authenticated/owned.

Use **Studio / Sceenyk Studio** for the primary user-facing creation destination and CTAs. Existing `/create`, private project URLs and backend concepts are unchanged in this task. Guests configure supported inputs before signing in; Generate must preserve lightweight draft choices, open Clerk authentication and restore the same Studio flow before ordinary owned save/upload, quote review and explicit generation confirmation. Large media needs a separate safe storage/upload strategy, not casual `localStorage` persistence. This handoff is approved future behavior, not implemented restoration.

Landing order: Navbar → Hero → a few immersive product-story sections → Marketplace/creator economy → Pricing → final CTA → Footer. Detailed education moves to Documentation. Large-screen Studio: **Navigation | Sources | Stage | Properties**; tablet progressively collapses secondary panels; mobile: **Top Navbar → Stage → Properties**, with hamburger app navigation and a separate **full-screen Sources overlay** opened from the Stage toolbar. Marketplace prioritizes preview, title, creator and adoption price; secondary information belongs mainly on detail. Preserve completed Settings sections/navigation; persistent balances and theme selection stay in Settings.

This approval supersedes older dashboard-first, Create-name, landing feature-list and form-first responsive targets, not historical acceptance or financial policy. Clerk, Supabase ownership, private R2, Gemini, fal.ai, ElevenLabs, captions/composition, Sandbox payments, credits, Marketplace, creator earnings/withdrawals, support authorization and storefront behavior remain authoritative and unchanged. Inngest Cloud stays paused; hosted workflow acceptance remains deferred until explicitly authorized. See [the seven-phase migration](ui-context.md#staged-implementation-and-acceptance).

**Exact next implementation unit: Phase 1 — shared public/workspace shells and navigation architecture.** Do not automatically start it or implement the full redesign at once.

## Settings implementation status — Complete within deployed acceptance (2026-10-16)

Implemented at /dashboard/settings/{account,creator-profile,credits,earnings,creation,notifications,appearance,privacy,data}, with /settings entry redirect, an authenticated shared dashboard shell, desktop section navigation and a labeled compact section picker on mobile/tablet. Legacy profile/credits/earnings bookmarks forward to the same source of truth and retain checkout/pagination queries. Existing profile, credit-purchase and creator financial components/services are reused. Navbar/dashboard/admin theme controls and dashboard header/summary paid balances are removed; contextual generation/payment credit information remains.

Appearance supports immediate Light/Dark/System through the existing browser preference/controller, including blocked or unwritable storage. Creation defaults implement only aspect ratio and category for new drafts via migration028; the user applied it and real save/reload plus two-account isolation pass in Production. Saved/adopted projects retain their own settings. Captions/styles stay per generation, narration voice is centrally configured, notification delivery/preferences are unavailable, and export/deletion actions remain deferred. Clerk account/security controls are reused with server-enforced self-deletion disabled before opening the modal. Settings responses use private/no-store without changing public caching. Deployed two-user and fresh Sandbox acceptance is Complete; see progress-tracker.md for evidence and scope. Earlier Settings approval paragraphs below are historical where they describe unimplemented controls or documentation-only scope.


## Approved Settings experience (2026-10-16)

**Product contract approved; Settings implementation and current acceptance are recorded above.** Settings becomes the main private place for account-level preferences and personal controls. Reuse the working Clerk account controls, Marketplace creator-profile editor, AI-credit/top-up services, creator earnings/withdrawals and app-wide theme system. This approval changes documentation only; deployed screens remain unchanged until a separately authorized implementation unit.

| Settings section | Approved purpose and scope |
| --- | --- |
| Account | Account name/avatar, email and account identity where appropriate; use Clerk-managed account/security actions and supported session/sign-out controls. Keep private account identity separate from public creator identity. Do not duplicate authentication logic. |
| Creator Profile | Reuse public display name, stable creator slug, public avatar and short bio editing, with a link to preview the Marketplace storefront. Choose a slug only during initial setup; the assigned slug stays read-only. Existing Marketplace management should point here, with one profile source of truth. |
| Credits & Billing | Main view of paid AI-credit balance, remaining lifetime free generations, Buy Credits / Top Up, credit-purchase/payment history and relevant supported billing information. Reuse existing one-time Sandbox purchases and owned history; do not imply invoices, saved payment methods or production billing features exist. |
| Earnings & Payouts | Creator money information: Available Earnings, Pending Payout, Lifetime Earnings, useful reversed/adjusted totals, private payout destination, withdrawal action and history. Explain the $5 USD minimum and seven-day hold from the withdrawal request. Preserve financial rules and keep earnings separate from AI credits. |
| Creation Preferences | Planned defaults for new projects only: preferred aspect ratio, captions on/off, default caption style, preferred narration voice if supported, and creation category where appropriate. Users can override per project. Do not expand into a voice studio, model controls or an advanced editor. |
| Notifications | Planned preferences for generation completed/failed, low credits, Marketplace sale/adoption, withdrawal requested, payout completed and important account/security events. Required financial/security notices remain mandatory. This contract does not implement notification delivery or preference storage. |
| Appearance | Light, Dark and System selection through the existing shared theme system. Apply selection throughout the app with existing persistence, before-paint initialization and cross-tab/system synchronization. |
| Privacy & Security | Supported Clerk session/account-security actions, sign out other sessions if supported, and clear public-profile/private-data visibility explanations. Exclude internal roles, support/admin permissions, provider diagnostics and private financial internals. |
| Data & Account | Plan project/data management, later account data export and protected account deletion in a Danger Zone. Explain deletion effects before implementation; consider private projects, Marketplace listings, pending creator earnings/payouts and account ownership records. No deletion behavior is authorized here. |

**Implemented Settings app-chrome contract, preserved during redesign:** remove the Light/Dark toggle from the normal top navbar/app headers and move theme selection to **Settings → Appearance**. Remove persistent/general-purpose AI-credit balances from dashboard/header/navbar/landing chrome, including the dashboard summary balance; the main balance view belongs in **Settings → Credits & Billing**. Preserve generation cost review, required credits, insufficient-credit warnings, contextual top-up/payment completion and credit-purchase information wherever needed to complete an action. Users must still see credit requirements before spending.

All Settings pages require authentication and owner-scoped access. Editing public creator fields inside Settings grants no public access to Settings data; only the approved Marketplace projection renders public fields at `/marketplace/creators/[creatorSlug]`. Private account identity, projects, financial information and support data remain excluded. Desktop uses section navigation beside the selected panel; mobile uses accessible stacked navigation, a drawer or tabs consistent with the existing design system.

Use the dashboard route convention: `/dashboard/settings/account`, `/dashboard/settings/creator-profile`, `/dashboard/settings/credits`, `/dashboard/settings/earnings`, `/dashboard/settings/creation`, `/dashboard/settings/notifications`, `/dashboard/settings/appearance`, `/dashboard/settings/privacy` and `/dashboard/settings/data`. These routes are implemented; preserve legacy redirects and the existing private boundary; see [architecture and migration rules](architecture.md#approved-settings-architecture-2026-10-16).

**Historical Settings recommendation — now Complete within deployed acceptance:** Build the private responsive Settings shell and reuse existing Account, Creator Profile, Credits & Billing, Earnings & Payouts and Appearance capabilities. Planned preferences/notifications/privacy/data sections must distinguish available controls from later functionality; do not invent working toggles, exports or deletion. Do not rebuild payment/payout systems, rename slugs, start final rendering or another feature. This task does not start implementation. The Inngest Cloud pause and explicit authorization requirement for hosted acceptance remain in force.

## Approved public Marketplace creator storefront (2026-10-15)

**Implemented, deployed and Complete within scoped real two-user acceptance (2026-10-16).** Public route: **`/marketplace/creators/[creatorSlug]`**, for example `/marketplace/creators/lawrence-okim`. Creator links open the storefront; published cards lead to existing detail/adoption. Applied027 and revision `c2987f1` pass14 profile loads,24 private cache/isolation controls and71 full Production checks. Management, privacy, responsive themes, safe avatars and existing adoption/recovery pass; both hydration/cache blockers are resolved. Public/static caching and protected financial/generation state remain intact. See [progress-tracker.md](progress-tracker.md) for evidence/limits. Original contract exclusions/recommendations below retain approval history and authorize no next feature.

The first version focuses on an explicitly public display name, stable creator slug, optional public avatar and short bio, and a paginated grid of currently published Marketplace listings. Public adoption counts or other useful activity statistics are optional, server-derived and limited to public listing activity; creator-since dates must be explicitly public creator dates. Omit statistics/dates until their safe definition and source are established. Featured listings are a later extension.

Public identity uses a unique, URL-safe **`creator_slug`**, independently persisted from the mutable display name and private account identifiers. For example, `display_name: Lawrence Okim` can have `creator_slug: lawrence-okim`. Assign once through server-controlled normalized slug allocation and database uniqueness; conflicts use a neutral suffix such as `lawrence-okim-2`, never a Clerk ID or Supabase UUID. Display-name edits must not regenerate links. Initial slug choice belongs to minimum private profile setup; later renaming/redirects need a separate link-preservation contract. No separate username or social-handle system is required. See the canonical [identity, privacy and ownership contract](architecture.md#approved-public-marketplace-creator-storefront-contract-2026-10-15).

| Surface | Audience and purpose |
| --- | --- |
| Private account/profile | Signed-in owner manages account information, settings, private projects, creator earnings, payout destination and withdrawals. Clerk account controls and private dashboard services remain separate. |
| Public Marketplace creator storefront | Visitors, including signed-out users, see only explicitly public creator identity/bio/avatar, currently published products and any approved public activity indicators. It provides no account or financial access. |

Storefronts must exclude drafts, unpublished and archived listings, private projects/source project IDs, private media/R2 assets, email, Clerk/Supabase internal user IDs, PayPal information, payout destinations, earnings, withdrawal history, support/admin information and internal diagnostics. Public rendering, metadata and client responses follow the same allowlist. A creator with no published listings may show **"This creator has no published Marketplace items yet."** Never fill an empty storefront with private content.

Creator names and avatars on Marketplace cards/detail must link to the approved storefront route, never to private account/profile pages. Storefront cards reuse existing Marketplace design and link to `/marketplace/[listingId]`; existing free/paid adoption, purchase entitlement, adopter-owned project creation and generation-credit rules continue unchanged. Server-authoritative ownership protects profile edits, publishing and public identity; knowing a slug grants no mutation permission.

The owner-only editor at `/dashboard/settings/creator-profile` manages public display name, avatar, short bio and initial slug choice. Legacy `/dashboard/marketplace/profile` redirects there; Marketplace management uses Settings → Creator Profile with one source of truth. Preserve explicit public-field review, stable slugs and server/database ownership enforcement. Use existing components/tokens across responsive light/dark layouts; see [UI direction](ui-context.md#approved-public-marketplace-creator-storefront-ui-2026-10-15).

**Historical next-unit recommendation, now Complete: creator storefront + minimum public-profile management.** Settings is now Complete within its deployed scope; the current next unit is Phase 1 — shared public/workspace shells and navigation architecture. Following, likes, comments, creator feed, collaborations and ratings/reviews remain deferred. Creator search is optional future discovery. A broader `/creators/[slug]` route requires a later decision; the public route stays `/marketplace/creators/[creatorSlug]`. No application changes, moderation, financial changes or final-render changes belong to this documentation task.

## Approved internal payout support contract (2026-10-15)

Internal payout support/reconciliation tooling is approved and **implemented and deployed with scoped acceptance verified**. Authorized admin/support users may inspect an existing withdrawal, query the same PayPal payout and apply existing provider-backed reconciliation with append-only audit evidence. Automatic Inngest processing remains primary. No resend, new payout instruction, manual Paid/Failed/earnings/release override, reference edit or shortened hold is permitted. The separately authorized [server-enforced authorization prerequisite](internal-authorization.md) now implements protected roles and a central guard with scoped acceptance; its deployed status/privacy/live-revocation gate passes. Migration026 and protected support queue/detail/check/audit are now deployed and verified. Creators receive only their safe status/account experience, without internal codes, provider references, controls or audit history. See the canonical [support architecture](architecture.md#approved-payout-support-and-reconciliation-contract-2026-10-15), [provider outcomes](payments.md#support-provider-outcomes) and [UI contract](ui-context.md#approved-internal-payout-support-surface-2026-10-15). Existing withdrawal acceptance and financial policy remain unchanged; Sandbox only and final rendering separately deferred. No later feature is authorized.

## Current Marketplace withdrawal implementation (2026-10-15)

The creator withdrawal unit is deployed under the approved10%/90%, USD minimum$5, immediate reservation and request-based seven-day hold. Explicit earning-lot refunds reduce pending requests without restarting their hold, fail/release valid amounts below minimum, and create paid-out creator deficits offset by future earnings. Private frozen PayPal email, owned withdrawal history, trusted Inngest eligibility and Sandbox-only reconciliation are implemented. User-applied migration024, deployed two-user reservation/refund acceptance and one real $5 Sandbox payout now pass. The payout uses an isolated synthetic sale/expired-time fixture; no hosted hold was shortened or naturally aged hosted Paid webhook claimed. See architecture/accounting/payments/progress-tracker for exact evidence/limits. No Live, renderer or later feature change occurred. This supersedes older future/unimplemented descriptions without rewriting historical financial evidence.

## Approved production Marketplace earnings and withdrawals (2026-10-14)

**Documentation/product contract only.** Paid adoptions allocate **10% to Sceenyk and 90% to the creator**, using trusted server-side USD-cent calculations. Verified valid creator earnings become available unless blocked by an existing refund/reversal; they never become AI generation credits, and AI credits are not withdrawable money.

Minimum withdrawal is **$5 USD**. A future request must validate sufficient unreserved available funds and a requested amount between $5 and that balance, reserve it immediately once, and move it from Available Earnings to Pending Payout. The **seven-day hold begins at the withdrawal-request timestamp**, not the sale. Reserved money cannot be withdrawn again. After seven days and clear refund/dispute/reversal checks, the future trusted PayPal payout flow may send it; only provider verification can establish Paid. Proportional cumulative-cent refunds, exact full reversal and immutable financial history remain mandatory, including adjustments to reserved money. See the canonical [accounting policy](accounting.md#approved-production-marketplace-earnings-and-withdrawal-policy-2026-10-14).

The deployed Sandbox fee/test sale hold and prior acceptance history remain unchanged. Production fee/availability rollout, withdrawal reservations/UI and actual PayPal Payouts are unimplemented; **creator withdrawals and PayPal Sandbox payouts under this contract** are the next separately authorized Marketplace implementation unit. No application code, schema, payout schedule, provider configuration, Live or renderer change belongs to this task. Final rendering remains deferred separately. This contract supersedes earlier unresolved Marketplace fee/share/threshold/hold placeholders below; historical unit descriptions do not authorize new implementation.

**Historical implementation authorization (2026-10-14):** creator-earnings Sandbox settlement and proportional cumulative refund/reversal accounting, with immutable history and preserved adopted projects. Its production-fee/holding placeholders are superseded by the approved contract above; actual Sandbox behavior and acceptance are recorded in the tracker.

**Historical Marketplace implementation authorization (2026-10-14):** implement USD PayPal Sandbox paid adoption, durable purchase entitlement and a separate immutable pending creator-earnings ledger alongside existing free adoption. This supersedes paid-purchase/earnings exclusions in the earlier first-unit notes below. Production economics, settlement automation, withdrawals, payouts, refunds UI, moderation and ratings remain excluded. Final rendering stays deferred. Actual acceptance status is in the progress tracker.

## Overview

Sceenyk is an AI-powered content creation platform that turns ideas, prompts, uploaded videos, images, products, and other media into finished video content. It brings content planning, generation, transformation, and assembly into one automated production flow, reducing the need to move between separate AI tools and video editors.

A user can give an instruction such as “Turn this video into a funny animated story with commentary.” Sceenyk should understand the input, plan the content, generate or transform scenes, create scripts and commentary, generate voiceovers, add captions and effects, assemble the video, and deliver the finished result as appropriate to the chosen creation type.

The initial hackathon/MVP should demonstrate a complete experience for a focused subset of creation paths. This document defines intended product behavior and delivery scope; it does not mark planned integrations or features as already implemented.

## Goals

- Make turning an idea or existing media into a finished video feel like one guided production process.
- Let users choose a creation type first, then provide a prompt, optional media, and a small set of relevant options.
- Make AI processing understandable through visible generation progress and an accessible final result.
- Allow visitors to explore the public product before requiring authentication for account-dependent actions.
- Prove a usable free-to-paid flow with clear generation limits and credit requirements.
- Provide a consistent, responsive experience using the shared Sceenyk light and dark design system.
- Support repeat credit top-ups and establish a foundation for additional content categories and reusable creator styles without expanding the first MVP beyond a demonstrable core flow.

## Core User Flow

1. A visitor opens Sceenyk and explores public creation options without signing in.
2. The visitor selects a supported content type. The interface guides them with inputs and options relevant to that choice.
3. In the approved Studio flow, visitors may enter a prompt and supported non-sensitive choices before authentication. Generate preserves the guest draft, opens a centered Clerk modal and restores the same flow after sign-in/up; this restoration is Not Started. There is no dedicated `/signin` or `/signup` page.
4. The signed-in user retains those choices and may save the owned project and upload permitted media through existing private services. Large guest files need a separately defined safe restoration/upload strategy.
5. The user configures generation options and reviews a server-issued quote showing free eligibility or required credits before confirming. Insufficient balance or unavailable pricing blocks admission. Credits are internal usage units with no assumed dollar or provider-unit conversion.
6. Sceenyk verifies the quote against current pricing and allowance, reserves entitlement, and creates the owned generation job before dispatch.
7. AI processes the request through the production stages required for that creation type, including planning, scene generation or transformation, commentary/voiceover, captions/effects, and video assembly where applicable.
8. The user sees the job's progress and processing state.
9. When processing completes, the finished video becomes available in the project for preview and download.
10. The generation's usage is recorded against the user's free allowance or credits, and the updated allowance or balance is visible.
11. When free usage is exhausted or available credits cannot cover a request, the user buys a Sceenyk credit pack and returns to cost review. Users top up again when their balance is low or zero; no monthly generation plan is required. The hackathon's paid credit flow uses PayPal Sandbox.

## Features

### Guided Content Creation

Users choose a content type before entering their instructions. The product direction includes AI video creation, video transformation/restyling, product advertisements, cinematic content, storytelling, gaming content, social media content, and creator templates/styles.

The prompt, optional uploads, and basic options should adapt to the selected creation type. The first MVP supports a focused subset of these paths; it does not need to deliver every category to prove the core experience.

### Automated Production

Sceenyk coordinates the steps needed to turn the user's request into a finished video. Depending on the creation path, this includes understanding the source material, planning content, generating or transforming scenes, writing scripts/commentary, creating voiceovers, adding captions/effects, and assembling the result.

The user provides creative direction while Sceenyk handles the production flow. The MVP should demonstrate real processing and a finished output for its supported path rather than stopping at a prompt submission or progress mockup.

### Projects, Generation Progress, and Results

Signed-in users can create and access their projects, see associated generations and job progress, and preview/download completed videos. Project and generation records connect the request, input media metadata, processing state, and final result so the user can return to their work.

### Authentication and Public Access

Clerk handles authentication through centered modal/overlay experiences wherever sign-in or sign-up is needed. Public exploration remains available without an account.

Authentication is required for generation, project management, credit purchases and account-dependent creator features. Dedicated `/signin` and `/signup` pages are excluded from the product flow.

### Free Generations, Credits, and Payments

Every user receives **2 lifetime free video generations, each limited to 10 seconds**. Free generations are separate entitlements, not paid credits. Eligibility requires authentication, duration at most 10 seconds, and remaining allowance. Reservation precedes execution; a verified stored result consumes it and a Sceenyk failure without a usable result restores it once. Additional/longer generations require paid credits under the server's configured pricing. Production credit-pack prices, credits by type/duration, and the provider-cost-to-credit formula remain unresolved. See [accounting.md](accounting.md) and [pricing.md](pricing.md).

Hackathon purchases use PayPal Sandbox only; Live is prohibited during development. The one-time purchase unit is **Complete within Merchant Sandbox acceptance**, including a real verified purchase and exactly-once crediting. Temporary demo packs and acceptance limits are described in [payments.md](payments.md). Production pricing remains unresolved. Paid Marketplace Sandbox purchases and settlement have their own completed scoped acceptance. Creator withdrawals/PayPal Payouts remain unimplemented under the approved future contract above.

### Approved Commercial Model — Pay As You Go (2026-10-13)

**"Buy credits. Create what you need. Top up when you need more."**

Sceenyk's primary business model is pay-as-you-go credit purchases. New users retain the two lifetime free generations. After that allowance is exhausted, users purchase credit packs, spend credits on AI usage and top up again whenever their balance becomes low or reaches zero. Longer or otherwise paid requests continue to require a server-issued credit quote under the existing entitlement rules.

Credits are usage units, not monthly allowances. Buying a pack does not buy access for an entire month, start a recurring plan or replenish a balance on a calendar schedule. **Purchased credits do not expire unless a future explicit product decision changes this policy.** A credit balance does not bypass supported-workload, pricing or generation eligibility checks.

Generation cost must be shown before explicit confirmation. Pricing, free eligibility, available balance and reservation amounts remain server-authoritative. Existing reserve/consume/restore rules remain unchanged; this product decision adds no per-provider charge or new billing trigger. Larger packs may eventually offer better value per credit, but no production discount schedule, pack price or conversion rate is approved here. Existing Sandbox values remain test configuration only.

**Monthly subscriptions are not current scope or the next required commercial feature.** A possible future membership could offer discounted credit pricing, priority generation, premium models, larger uploads or higher-quality exports. Those examples are not approved entitlements or a committed roadmap; membership requires a separate product decision and authorization.

**Auto-recharge is a separate optional future feature, not a monthly subscription:** a user chooses a balance threshold and predefined credit pack, and crossing the threshold could trigger a purchase using a payment method the user has explicitly authorized for that purpose. Payment-method authorization, consent, limits, failure handling and implementation need a future specification. Current top-ups remain user-initiated one-time purchases; this task adds no automatic charge.

This approved contract supersedes earlier documentation and illustrative design references that implied monthly generation plans, monthly credit allocations or recurring PayPal billing were required next. It changes product documentation only.

### Creator Templates and Marketplace

**Marketplace product model approved 2026-10-13.** A creator explicitly publishes a reusable listing derived from an owned, successful project/result. Other users discover it, adopt it into a **new project they own**, supply their own ideas and permitted media, customize the copied creative configuration, and generate their own result. The listing and original project remain separate; publishing is never automatic. A listing may preserve project/scene structure, prompt strategy, visual style, settings, aspect ratio, timing/composition, narration and caption configuration where reusable and safe. Private uploads, R2 assets, signed URLs, provider secrets, private project metadata and content without redistribution rights are excluded.

Publishing should let the creator provide a title, description, category, preview/cover, tags, visibility/status and free or paid adoption price. The creator must confirm rights to publish and monetize reusable content. A simple future listing lifecycle is draft → published → unpublished or archived; moderation may add states only through a later decision. Discovery should provide browse, categories and search/filtering. Cards prioritize preview, title, creator and adoption price/free state; estimated generation credits, descriptions and detailed indicators belong mainly on listing detail. Moderation, reporting, takedowns and intellectual-property complaints need a future contract.

**Adoption price and AI generation cost are separate.** A free listing has no creator adoption charge; subsequent AI work still follows ordinary free-allowance/credit eligibility and server-issued generation quotes. A paid listing may eventually require a verified marketplace purchase and adoption entitlement before the adopter-owned project is created. For example, a $2.00 creator price and an estimated 35 Sceenyk credits are two distinct costs; neither example is approved production pricing. Adoption never transfers the creator's original project or private media.

The authorized first Marketplace unit provides UI, explicit publishing/listing persistence, browse/search/detail, free/template adoption, adopter-owned project creation and server-enforced ownership/privacy. Its implementation publishes reusable briefs from owned saved projects with separately reviewed public instructions; it does not require or claim a completed rendered result. See [architecture.md](architecture.md#marketplace-implementation-contract--authorized-2026-10-13) and [progress-tracker.md](progress-tracker.md) for actual implementation/acceptance limits. Paid marketplace purchase capture, creator earnings settlement, payouts and moderation are separately authorized later work.

### Persistent Product Data

Supabase PostgreSQL stores users, projects, generations, generation jobs, credit balances, credit transactions, payments, Marketplace listings and free-adoption provenance. Dedicated paid Marketplace purchase, entitlement, earning and adjustment records exist in the scoped Sandbox implementation. Withdrawal reservation and payout persistence remain future capabilities. No subscription data model is required for the current credit/top-up contract.

Large video, image, and audio files are stored outside PostgreSQL. Database records retain the references and metadata needed to associate that media with the relevant project or generation. The media storage service is not specified by this overview.

### Interface and Themes

The interface uses Next.js, React, TypeScript, Tailwind CSS, and shadcn/ui. Both light and dark mode follow [the Sceenyk design system](design-system.md), with shadcn components using shared Sceenyk tokens.

Creation forms, project access, generation progress, and result preview/download should remain usable on desktop and mobile. Switching themes preserves the same content, hierarchy, and behavior.

## Scope

### In Scope

- Public exploration of the product's creation options.
- At least one supported creation path with a complete prompt-to-finished-video experience.
- Creation-type selection, a guided prompt form, optional media uploads, and basic generation options.
- Centered Clerk modal sign-in/sign-up at the point authentication is required.
- Account-associated projects, generation records, generation jobs, and visible processing progress.
- Real AI processing and video assembly sufficient to complete the selected MVP path.
- Preview and download of completed videos.
- Supabase persistence for the user, project, generation/job, free-usage, credit, and payment data needed by the MVP.
- Media references and metadata in PostgreSQL, with large media files stored separately.
- Two free short generations per new user, credit eligibility checks, and usage accounting.
- One-time PayPal credit-pack purchases and a clear Buy credits / top-up entry point when generation capacity is insufficient.
- A responsive interface aligned with the existing light and dark design system and customized shadcn tokens.

The first supported category, AI provider, and media storage service remain implementation decisions. Supporting fewer paths is acceptable when the selected flow works completely.

### Out of Scope

- Supporting every AI video provider or building a universal provider ecosystem.
- Delivering every possible content category during the first MVP.
- Advanced collaborative video editing.
- A full professional timeline editor.
- Native mobile applications.
- New creator withdrawal/PayPal payout implementation in this documentation task. Existing Sandbox Marketplace purchasing/earnings/settlement are accepted separately; the approved production policy above is not yet deployed.
- Monthly generation subscriptions, monthly credit allocations and recurring plans.
- Membership benefits and auto-recharge unless separately approved in a future product decision.
- Large-scale enterprise features.

## Success Criteria

These are acceptance conditions for the MVP, not claims about the current implementation.

1. A signed-out visitor can explore public creation options without being redirected to an authentication page.
2. Attempting an account-dependent action opens a centered Clerk sign-in/sign-up modal. After successful authentication, the user can continue the creation flow without visiting `/signin` or `/signup`.
3. A signed-in user can create a project and access it again after leaving and returning to the project view.
4. At least one supported content type offers a guided form that accepts a prompt and basic generation options. A prompt-only request and a request with supported optional media can both be submitted.
5. An accepted generation request creates a project/generation job associated with the signed-in user, with its prompt, options, and relevant media references persisted in Supabase.
6. A generation job visibly progresses from a pending state through processing to completion, with the displayed state corresponding to the actual job.
7. The supported production flow produces a finished video matching the submitted creation type and instructions sufficiently to demonstrate the core use case.
8. A completed video can be played in the project view and downloaded as an accessible video file.
9. Reloading or revisiting a project retrieves its saved generation state and completed result from persisted records. Large media files are referenced rather than stored directly in PostgreSQL.
10. A new account receives two lifetime free generations, each limited to 10 seconds. A third generation cannot use exhausted allowance; retries/concurrent requests cannot overspend it.
11. A request that requires credits can proceed only when sufficient generation capacity is available. Longer or more expensive configured requests consume more credits than the baseline short request, and the requirement is shown before submission.
12. Completed generation usage updates the user's free allowance or credit balance and leaves an appropriate usage/transaction record. Revisiting the project shows the updated allowance or balance.
13. When capacity is insufficient, the user can enter the PayPal credit-purchase flow. A successful purchase increases available credits, and those credits can fund a subsequent generation.
14. Creation, project, progress, and result views follow the documented Sceenyk tokens in both themes, with readable text and visible interactive states. Theme switching preserves the current content and generation state.
15. The core flow can be completed on desktop and mobile: creation controls, Clerk authentication, uploads, progress, preview/download, and credit-purchase actions remain accessible without page-level horizontal overflow.
