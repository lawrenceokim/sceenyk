# UI Context

## Settings implementation status (2026-10-16)

Implemented at /dashboard/settings/{account,creator-profile,credits,earnings,creation,notifications,appearance,privacy,data}, with /settings entry redirect, an authenticated shared dashboard shell, desktop section navigation and a labeled compact section picker on mobile/tablet. Legacy profile/credits/earnings bookmarks forward to the same source of truth and retain checkout/pagination queries. Existing profile, credit-purchase and creator financial components/services are reused. Navbar/dashboard/admin theme controls and dashboard header/summary paid balances are removed; contextual generation/payment credit information remains.

Appearance supports immediate Light/Dark/System through the existing browser preference/controller, including blocked or unwritable storage. Creation defaults implement only aspect ratio and category for new drafts via migration028; the user applied it and real save/reload plus two-account isolation pass through the built local app. Saved/adopted projects retain their own settings. Captions/styles stay per generation, narration voice is centrally configured, notification delivery/preferences are unavailable, and export/deletion actions remain deferred. Clerk account/security controls are reused with server-enforced self-deletion disabled before opening the modal. Settings responses use private/no-store without changing public caching. See progress-tracker.md for current verification and deployment limits. Earlier Settings approval paragraphs below are historical where they describe unimplemented controls or documentation-only scope.


## Approved Settings UI (2026-10-16)

**Approved presentation contract; implemented within the status above.** Settings is the private destination for Account, Creator Profile, Credits & Billing, Earnings & Payouts, Creation Preferences, Notifications, Appearance, Privacy & Security, and Data & Account. Use [the canonical section scope](overview.md#approved-settings-experience-2026-10-16) and [planned dashboard routes](architecture.md#approved-settings-architecture-2026-10-16).

Desktop uses a clear left section navigation and selected panel within the existing dashboard shell. Mobile uses stacked section links, a drawer or accessible tabs that fit the current design system. Show the selected section, meaningful headings, loading/empty/unavailable states, validation and save success/failure. Reuse shared cards, fields, buttons, semantic tokens, spacing and light/dark geometry. Preserve keyboard access, visible focus, 44px touch targets, drawer focus return and responsive content fit; avoid a second dashboard sidebar on narrow screens.

**Theme relocation:** remove Light/Dark controls from the normal public navbar, dashboard header and other app header chrome; the inspected admin header also has a toggle to migrate. Settings → Appearance presents Light, Dark and System using the existing controller, preference key and root initialization. System follows OS changes; explicit Light/Dark overrides it until System is selected again. Keep app-wide styling, favicon updates, cross-tab persistence and usable behavior when browser storage is restricted. No second theme implementation or theme-dependent initial-render mismatch.

**AI-credit relocation:** remove the general dashboard/header paid-credit link and dashboard summary balance card. Do not add persistent personal balances to landing/navbar/sidebar chrome. Settings → Credits & Billing becomes the main balance/remaining-free-allowance, Buy Credits / Top Up and purchase/payment-history surface. Retain contextual generation cost, available/required credits, insufficient warnings, top-up dialogs and purchase-completion balances. The existing generation card is an action context, not general app chrome. Never hide costs before confirmation or conflate AI credits with creator earnings.

Creator Profile reuses the deployed editor with explicit public-field explanation, initial-only slug choice/read-only assigned slug, public avatar/bio and storefront preview link. Marketplace management links point into Settings; do not leave a second independent editor. Account name/avatar/email remain private Clerk identity unless explicitly reviewed as public creator fields. Preserve safe avatar processing/delivery, private profile caching and public storefront behavior.

Earnings & Payouts reuses Available Earnings, Pending Payout, Lifetime Earnings and useful reversals/adjustments, private payout destination, withdrawal action and history. Explain minimum $5 USD, immediate reservation and seven days from request; show safe persisted statuses and keep existing disabled/eligibility rules. No internal role, diagnostic, provider-reference or support controls belong here.

Creation Preferences is planned for a small set of new-project defaults with per-project overrides, not a replacement project editor. Notifications is planned for the approved event categories, with required financial/security notices visibly mandatory. Privacy & Security explains visibility and delegates supported sessions/security to Clerk. Data & Account plans data management/later export and a protected Danger Zone; no working deletion control or invented export exists in this unit. Do not display interactive preference toggles that imply unsupported persistence/delivery. Existing account capabilities may be wired in the next unit; new preference/notification/deletion systems require later scope.

Earlier UI descriptions below record existing/historical screens. Their navbar theme and persistent dashboard-balance placement is superseded by this approved migration, which remains unimplemented in this documentation task.

## Approved public Marketplace creator storefront UI (2026-10-15)

**Deployed and Complete within scoped acceptance (2026-10-16).** The public Marketplace shell, return link, protected account/project/financial/support controls and owner-only `/dashboard/marketplace/profile` retain their behavior. Slugs stay read-only after setup. The account widget waits for its hydration-safe auth snapshot, with a matching inert44px span beforehand; no suppression or theme/avatar/form/navigation redesign is introduced. Fresh Production verification passes14 profile loads, eight1440/390 theme cases, both account menus and71 full checks without browser errors. Public storefront also fits320/390/768/1440 in both themes; four real screenshots are reviewed. Private HTML/RSC remain no-store and public/static caching stays intact. Physical-device/screen-reader acceptance remains separate. See the [public data/ownership contract](architecture.md#approved-public-marketplace-creator-storefront-contract-2026-10-15) and tracker for limits.

Version one has a creator header with approved public avatar or initials, display name, readable slug where useful and optional short public bio, followed by a published templates grid. Optional public adoption/activity indicators or creator-since date appear only with a verified safe public source; omit unavailable values rather than inventing counts/dates. Featured content, creator search and extra statistics are later extensions. A slug label is not a new username/social-handle feature.

Reuse `ListingCard`, `TemplateCover`, price/generation-credit labels, pagination and normal detail/adoption behavior where practical. Creator name/avatar links on Marketplace cards and detail go to `/marketplace/creators/[creatorSlug]`, never to Clerk account management or a private dashboard/profile. Keep creator links independent of listing links; do not nest interactive links. Storefront template cards open `/marketplace/[listingId]` and adoption continues there through the existing free/paid system.

Use existing shared Sceenyk tokens, Inter typography, semantic card/button/link styles and shadcn/Base UI conventions. Support desktop, tablet and mobile in light and dark mode, with the same content and hierarchy. Reuse the Marketplace grid: one column on phones, two at `sm`, three at `xl`; stack/wrap avatar, name, bio and any stats on narrow screens. Preserve readable long names/slugs, no horizontal overflow, keyboard navigation, visible focus, accessible link names, appropriate avatar alt text and touch targets. Do not introduce a separate palette or visual language.

Show a genuine loading state, safe unavailable/not-found state for an unknown slug, and a service-error state distinct from zero results. For a public creator with no published listings, show **"This creator has no published Marketplace items yet."** Never show drafts, unpublished/archived listings, private project previews or financial information to fill the grid. Public HTML, metadata and client payloads must exclude the architecture contract's private fields even when the viewer owns the storefront.

The deployed private owner-only editor currently lives at `/dashboard/marketplace/profile`; the approved migration reuses it in Settings → Creator Profile and routes Marketplace management entry points there. It lets the creator review/save public display name, avatar and short bio, choose a valid available slug during setup, and view/copy the stable assigned slug afterward. Explain public fields separately from private account settings. Preserve saving, validation/conflict/failure and persisted success states and server/database ownership. Later slug renaming needs separate link-preservation rules. This documentation task does not relocate the working editor or avatar system.

**Exact next implementation unit: creator storefront + minimum public-profile management.** Following, likes, comments, feed, collaborations, ratings/reviews, creator-specific search and a broader `/creators/[slug]` page are deferred. No social controls, moderation, payout UI, financial or final-render changes belong to this storefront contract.

## Creator withdrawal privacy acceptance patch (2026-10-15)

The user-deployed creator DTO replaces raw `failureCode` with a whitelisted `failureMessage`, preserving the same refund-below-minimum and generic failure copy. The panel renders that safe message directly. Server initial reads and action responses share the server-only projection; real deployed creator action responses and20 loaded client chunks verify that payout diagnostics are excluded. No layout/theme/payout control changes occur. The earlier documented privacy gap is historical; the deployed live role-revocation/restoration gate now passes.

## Approved internal payout support surface (2026-10-15)

**Implemented, deployed and verified within scoped acceptance.** `/admin/payouts` and `/admin/payouts/[id]` establish the internal route convention outside the public/dashboard route groups, using the existing logo, theme tokens, Button and pagination. The server-enforced admin/support prerequisite has passed deployed acceptance. Normal creators cannot access its pages, underlying reads/actions or audit records; hiding navigation is not access control.

Authorized support can filter by lifecycle/review status and search withdrawal/provider reference or creator name. Age is displayed; it is not an input filter. Include pending, eligible, processing, paid and failed, with needs-review/ambiguous as derived filters rather than editable financial states. Keep results bounded/paginated and private. Detail shows creator identity, requested/reserved/submitted amounts and Available/Pending relationship, original request/hold timestamps, local/provider state, safely masked destination, provider submission timestamp, last reconciliation timestamp, safe failure/reconciliation reason and related refund/reversal history. Provider references and support audit are restricted to authorized internal detail where necessary. Show unavailable timestamps as Unknown. Submission claimed at is the existing processing timestamp; Provider submission acknowledged at is new persisted observation evidence and remains Unknown for historical rows. No check time is inferred from next_check_at. Search/view links disable prefetch to avoid background view-audit entries. Creator available/pending/paid/deficit totals accompany original/remaining lot allocations. All three histories use separate25-row pagination; queue uses12. Chrome checks cover320/390/768/1440, light/dark, in-flight duplicate protection, labels, focus, masked destination, safe outcomes and containment.

Provide a single **Check PayPal Status** or **Reconcile** action for the same persisted payout reference. Show checking, verified/no-change, still-processing, missing-reference and safe error/review outcomes with last checked time and audit result. A missing reference explains that verified webhook recovery or merchant investigation is required; no input can attach/edit a provider ID. Preserve existing financial state on unknown/mismatched/error results. Read-only support audit lists actor, action, prior/observed/resulting status, safe result and trusted timestamp. No raw credentials, tokens or unnecessary payloads are displayed or stored.

Do not offer Resend, manual Paid/Failed, credit/release, amount/destination/reference editing, hold-shortening, refund or cancellation controls. Support checks must never invoke payout submission, including for an eligible row. Retain the shared light/dark tokens, responsive layouts, keyboard focus, accessible status announcements and clear private/error states without introducing a second payout flow.

Creator UI remains separate with simple Pending/Eligible/Processing/Paid/Failed statuses and safe explanatory copy. It exposes no support controls, audit history, PayPal references or internal failure codes, including in action responses/client DTOs. The deployed privacy correction uses whitelisted failureMessage on initial/action DTOs; raw failureCode remains internal. Preserve existing refund-below-minimum and returned-after-Paid explanations without exposing raw codes. See [support provider outcomes](payments.md#support-provider-outcomes).

## Creator withdrawals (2026-10-15; deployed two-user acceptance verified)

The owned earnings page now renders Available Earnings, Pending Payout, Paid, lifetime/reversed sale totals, private PayPal email configuration and USD withdrawal amount. Disable Withdraw below $5, without saved destination or while creator debt remains; the server repeats all checks. Explain exactly: "Withdrawals are held for 7 days before payout." State immediate reservation, refund reductions/cancellation and Sandbox-only payouts. Existing requests freeze their email and original hold. History uses Pending/Eligible/Processing/Paid/Failed with amount, original request/date, hold date and paid date where verified. Failure copy explains only valid funds return; deficit copy explains future-earning offsets. Internal provider IDs are excluded. Preserve identity guards, both themes, keyboard/labels/targets, responsiveness and server refresh. This supersedes the historical no-withdrawal-UI statements below; real deployment acceptance remains in the tracker.

## Approved future creator withdrawal UI contract (2026-10-14)

**Documentation only; no withdrawal UI is implemented by this task.** Future creator account screens distinguish Available Earnings, Pending Payout, Lifetime Earnings and Reversed/Adjusted Earnings where useful, separately from nonwithdrawable AI generation credits. Verified valid sales contribute the approved 90% creator share to available money unless blocked by refund/reversal; the server calculates the 10% fee.

A future Withdraw action is unavailable below $5 USD of unreserved available earnings. Requests must be at least $5 and no more than that balance, with server enforcement independent of button state. Explain that acceptance reserves the amount immediately and removes it from available money, starts a seven-day hold from the withdrawal request, and permits no PayPal send during that hold. Available $20 / request $15 must display Available $5 and Pending Payout $15. Reserved funds stay excluded through refresh/reopen and cannot fund another request. After the hold, clear refund/dispute/reversal checks precede eligibility; only trusted provider verification can show Paid. Reflect immutable refund adjustments without presenting pending payout as spendable funds.

Historical UI specification: the earlier Sandbox pending-earning card reflected test sale eligibility, **not Pending Payout**. The deployed withdrawal section above supersedes its no-Withdraw status. Preserve shared light/dark tokens, responsive layouts and account guards; the current [payout lifecycle](accounting.md#payout-lifecycle) and [support accounting restrictions](accounting.md#approved-support-accounting-boundary-2026-10-15) govern the approved support contract.

## Creator settlement and adjustment history (2026-10-14)

Creator earnings uses the existing responsive cards and light/dark tokens for pending, available, lifetime gross, net after reversals, creator net reversed and platform fees reversed. Each listing sale retains original amounts, remaining net, eligibility where pending and an expandable chronological sale/availability/refund/reversal history. Buyer purchases show refunded status/cents and explain that the adopted project remains available. Available is explicitly future-payout eligibility, not a completed payout; no Withdraw control exists. Reads retain Clerk account guards and refresh/reopen behavior. No new theme or refund mutation UI is introduced.


**Paid Marketplace extension (2026-10-14):** the listing editor adds Free/Paid and a centralized demo USD price range. Cards/detail and the payment summary separate adoption money from estimated AI credits. My Marketplace Listings shows small adoption/sale/net totals and links to buyer purchases and creator earnings. New account-guarded responsive purchase recovery and pending/available/lifetime sale history use the existing tokens, Button and Dialog. Paid public instructions are locked until adoption; no payout controls are added. The earlier free-only UI scope below describes the foundation.

## Approved commercial messaging (2026-10-13)

Use **"Buy credits. Create what you need. Top up when you need more."** Current product intent is pay-as-you-go: two lifetime free generations remain, then users buy one-time credit packs and manually top up as needed. Credits are usage units, not monthly allowances or a month of access; purchased credits do not expire unless explicitly changed by a future product decision. Keep pre-confirmation generation cost and server-authoritative pricing. Larger-pack value differences remain an unapproved production pricing decision; existing Sandbox packs stay clearly labeled as test values.

Monthly plans, recurring billing and monthly credit allocations are outside current scope. Illustrative subscription cards/navigation in design references are not current product requirements. Membership benefits and threshold-based auto-recharge are optional, unapproved future ideas. This documentation contract does not change application screens, copy, navigation or payment behavior.

## Sandbox credits extension (2026-10-13)

Public pricing keeps the existing two-card layout and now explains pay-as-you-go, the exact lifetime free limit and non-expiring purchased credits, with a Buy credits link to the protected account screen. It labels Sandbox/demo pricing and removes superseded paid-plan/unavailable-purchase copy. No pack values or production rates are embedded in landing components.

The implemented pay-as-you-go UX currently has a dashboard-header paid-credit link; its approved replacement is Settings → Credits & Billing, with the dashboard summary balance also removed during that future migration. Contextual paid balance/manual top-up in creation remains. Quotes display server-derived estimated cost, available paid credits and expected balance after reservation; free quotes leave paid credits unchanged. Expired quotes disable confirmation and offer Update quote. The existing shadcn top-up Dialog uses server-owned packs and separate-tab PayPal approval, retaining editor settings and local Files. Activation/cross-tab invalidation refresh owned balances/quotes with explicit confirmation still required. Keep safe popup recovery, low-credit copy, verified purchase success and the safe last20 paid-ledger history; no auto-recharge or internal/provider identifiers. Existing acceptance remains in the tracker; Settings relocation is unimplemented.

Protected `/dashboard/credits` currently uses the dashboard shell and shared card/button/status tokens, with responsive demo packs, test-only amounts, PayPal approval, payment states, actual paid available/reserved balances and recent owned purchases. Its approved destination is Settings → Credits & Billing; existing Buy credits entries should lead into that same flow. Preserve contextual insufficient-generation links, active-Clerk-account state reset and owned pending-payment recovery on load/activation/Check purchases. No subscription UI, production price or theme token is introduced. Existing payment acceptance is retained; Settings relocation remains pending.

Quick reference for building Sceenyk UI. Use [design-system.md](design-system.md) for detailed component/evidence guidance and [overview.md](overview.md) for product scope. The light and dark PNGs in [`/designs`](../designs/) are the visual references; [`app/globals.css`](../app/globals.css) owns the implemented tokens. Values below describe current CSS, not new palette proposals.

## Marketplace UI direction (approved product contract, 2026-10-13)

The first unit implements Marketplace browse cards, search/category controls, database pagination, listing detail with creator name/initials and configuration preview, an Adopt action, explicit Publish to Marketplace page, My Marketplace Listings and an adopted-template indication in the new owned project. Publishing collects reviewed public title/description/instructions, category, tags and rights confirmation. Adoption is free only. Status is draft/published/unpublished/archived; archived listings are retained but cannot be republished. Configuration covers use the existing surface gradient, category icon and safe format/style/duration labels, never private media or invented result artwork. This cover composition is the shared Marketplace preview pattern.

Display **creator adoption price** and **estimated Sceenyk generation credits** as separate labeled amounts. A free adoption still may require generation credits under the ordinary quote. Paid adoption controls must not imply checkout exists before the separately authorized purchase unit. After adoption, show a new editable project owned by the adopter, with their own prompt/media inputs and normal generation cost review; never show the creator's private assets.

Reuse existing Sceenyk light/dark tokens, Tailwind/shadcn/Base UI patterns, responsive cards, semantic controls, keyboard access and focus states. Browse uses one column on phones, two at `sm` and three at `xl`; detail/editor use stacked mobile panels and two columns at `lg`. Native labeled forms and existing buttons preserve keyboard behavior; account-dependent client panels verify the active Clerk account before showing owned content. Loading, empty/no-results, unavailable, saving/publishing and adoption recovery states reflect actual operations. Moderation, ratings/reviews and payouts are later work.

## Official logo assets (2026-10-13)

Use the unchanged official full and small PNGs from `/designs` through `SceenykLogo`; do not recreate the wordmark with UI text, apply color filters, or choose a logo with JavaScript viewport checks. Light artwork appears on light surfaces and dark artwork on dark surfaces using the existing `.dark` class, which initializes before paint. Public navigation switches from the small mark to the full wordmark at `lg`; the dashboard mobile header uses the small mark, while its desktop sidebar, mobile Sheet and the footer use the full wordmark. Preserve intrinsic proportions and clear focus/accessible naming on brand links. The favicon follows the same saved/system theme resolution and uses the supplied small mark. Apple touch metadata uses the light small mark; the 1200×630 social card places the supplied dark full logo within a dedicated preview frame. No separate manifest currently exists.

## Caption controls (2026-10-13)

The existing generation card adds Captions On/Off, Preparing captions / Captions ready / Caption timing issue, an expandable text/timing preview and SRT/VTT download links after composition readiness. The choice persists per generation. A ready track with cues also shows an owned private scene preview with synchronized browser captions, scene selection, play/pause, mute, seek/replay and fresh media access. The appearance controls now have centrally defined Default/Clean/Bold presets plus bottom/top position, normal/large size, center/left alignment and default/high-contrast/shadow backing. These controlled choices persist with the owned generation after migration 019 is applied; they resolve through one shared preview/renderer style contract. Caption timing is explicitly estimated; silent scenes show no spoken narration. Controls use existing semantic colors, native accessible checkbox/details/select/range, 44px targets, keyboard focus and responsive wrapping. The media area uses dark neutral backing in both themes, frame-relative 16:9/9:16 safe areas, white caption text and a contrast backing/shadow. Refresh/reopen and activation read server state; missing schema/service errors never claim readiness. No advanced caption editor or final rendering is introduced. Final rendering stays deferred for worker capacity. Real browser verification and deployment limits are in the tracker.

## Theme

Sceenyk supports light and dark styling with a modern, bold, minimal, creative, premium AI/video-production feel. Purple leads; blue/cyan supports it. Use purple/blue gradients selectively, strong typography, subtle borders, soft shadows, and controlled glow around meaningful actions.

Light mode uses clean white/light surfaces. Dark mode uses layered near-black surfaces with brighter text and localized purple glow. Both themes share geometry, spacing, hierarchy, and behavior: they must feel like the same product.

Light is the `:root` fallback. The implemented system follows OS preference until an explicit light/dark choice is saved in `localStorage` under `sceenyk-theme`. The approved Settings → Appearance control exposes Light/Dark/System and replaces navbar/header toggles; selecting System returns to OS following through this same controller. Apply `.dark` on `<html>` before first paint, preserving font classes. Preserve system-change and cross-tab synchronization; storage restrictions must not prevent an in-page choice. Reuse `shadow-card`, `shadow-popover`, and `shadow-glow` instead of independent effects. Control relocation and explicit System selection UI remain pending implementation.

## Colors

Use semantic utilities such as `bg-background`, `bg-card text-card-foreground`, `text-muted-foreground`, `border-border`, and `ring-ring`. Tables show resolved values; keep aliases intact in CSS. Card/popover text uses `--card-foreground`/`--popover-foreground`, both aliases of `--foreground`. Sidebar colors already have matching `--sidebar-*` aliases.

### Light mode

| Role | Existing CSS variable(s) | Value(s) |
| --- | --- | --- |
| Page background | `--background` | `#FCFCFF` |
| Surface/card | `--card` | `#FFFFFF` |
| Elevated surface | `--popover` | `#FFFFFF` |
| Primary text | `--foreground` | `#111118` |
| Secondary text | `--muted-foreground` | `#646477` |
| Primary action / label | `--primary` / `--primary-foreground` | `#7C3AED` / `#FFFFFF` |
| Brand purple | `--brand-purple` | `#8B5CF6` |
| Supporting blue / cyan | `--brand-blue` / `--brand-cyan` | `#3B82F6` / `#06B6D4` |
| Secondary action / label | `--secondary` / `--secondary-foreground` | `#EAF2FF` / `#1D4ED8` |
| Hover/selected surface / text | `--accent` / `--accent-foreground` | `#F1EAFF` / `#6D28D9` |
| Border | `--border` | `#E5E7EB` |
| Input border / field fill | `--input` / `--field` | `#D9D9E6` / `#F8F9FD` |
| Focus ring | `--ring` | `#7C3AED` |
| Muted background | `--muted` | `#F4F4FA` |
| Text link | `--link` | `#7C3AED` |
| Error: ink / solid-fill label / surface | `--destructive` / `--destructive-foreground` / `--destructive-surface` | `#B91C1C` / `#FFFFFF` / `#FFF1F2` |
| Success: icon / text / surface | `--success` / `--success-foreground` / `--success-surface` | `#047857` / `#065F46` / `#ECFDF5` |
| Warning: icon / text / surface | `--warning` / `--warning-foreground` / `--warning-surface` | `#B45309` / `#92400E` / `#FFFBEB` |
| Info: icon / text / surface | `--info` / `--info-foreground` / `--info-surface` | `#1D4ED8` / `#1E40AF` / `#EFF6FF` |
| Overlay backdrop | `--overlay` | `rgb(8 11 15 / 48%)` |

### Dark mode

| Role | Existing CSS variable(s) | Value(s) |
| --- | --- | --- |
| Page background | `--background` | `#080B0F` |
| Surface/card | `--card` | `#111118` |
| Elevated surface | `--popover` | `#1E1E28` |
| Primary text | `--foreground` | `#F5F5FA` |
| Secondary text | `--muted-foreground` | `#B8B8C8` |
| Primary action / label | `--primary` / `--primary-foreground` | `#7C3AED` / `#FFFFFF` |
| Brand purple | `--brand-purple` | `#8B5CF6` |
| Supporting blue / cyan | `--brand-blue` / `--brand-cyan` | `#3B82F6` / `#06B6D4` |
| Secondary action / label | `--secondary` / `--secondary-foreground` | `#13233D` / `#93C5FD` |
| Hover/selected surface / text | `--accent` / `--accent-foreground` | `#26183D` / `#D8B4FE` |
| Border | `--border` | `#2A2A37` |
| Input border / field fill | `--input` / `--field` | `#45455B` / `#14141E` |
| Focus ring | `--ring` | `#A78BFA` |
| Muted background | `--muted` | `#1E1E28` |
| Text link | `--link` | `#A78BFA` |
| Error: ink / solid-fill label / surface | `--destructive` / `--destructive-foreground` / `--destructive-surface` | `#F87171` / `#080B0F` / `#2B121A` |
| Success: icon / text / surface | `--success` / `--success-foreground` / `--success-surface` | `#34D399` / `#6EE7B7` / `#07271F` |
| Warning: icon / text / surface | `--warning` / `--warning-foreground` / `--warning-surface` | `#FBBF24` / `#FDE68A` / `#2C200B` |
| Info: icon / text / surface | `--info` / `--info-foreground` / `--info-surface` | `#60A5FA` / `#93C5FD` / `#0C203A` |
| Overlay backdrop | `--overlay` | `rgb(0 0 0 / 72%)` |

`--input` is a border color, not a background. `--accent` is the themed interaction tint; saturated violet is `--brand-violet: #A855F7` in both modes. Raw brand purple is for artwork; the darker primary/action ramp protects white-label contrast. Use `text-link` for readable purple links, especially in dark mode.

### Gradients

All stops below reference existing variables; theme-dependent surfaces resolve automatically.

| Token | Angle and stops | Shared use |
| --- | --- | --- |
| `--gradient-purple` | 135°; `--brand-purple` → `--brand-violet` | `bg-gradient-purple`; decorative purple highlights |
| `--gradient-blue` | 135°; `--brand-blue` → `--brand-cyan` | `bg-gradient-blue`; supporting media accents |
| `--gradient-brand` | 110°; `--brand-purple` → `--brand-blue` at 65% → `--brand-cyan` | `bg-gradient-brand`; selective creative artwork |
| `--gradient-action` | 110°; `--primary` → `--primary-end` (`#9333EA`) | `.sceenyk-action`; white-label primary buttons |
| `--gradient-action-hover` | 110°; `--primary-hover` (`#6D28D9`) → `--primary` | Shared action hover |
| `--gradient-surface` | 135°; `--card` → `--accent` | `.sceenyk-feature-card`; subtle themed tint |
| `--gradient-dark` | 145°; `--neutral-950` → `--neutral-800` | `bg-gradient-dark`; deliberately dark media/art surfaces |

Do not place small white text on the cyan end of a decorative gradient. Use the action ramp or a contrasting backing.

## Typography

[`app/layout.tsx`](../app/layout.tsx) loads **Inter** (`--font-inter`) and **Geist Mono** (`--font-geist-mono`) through `next/font/google`. `font-sans` and `font-heading` use Inter with Arial/Helvetica/sans-serif fallbacks; `font-mono` uses Geist Mono with a monospace fallback. Inter is the implemented alternative permitted by the boards' General Sans/Inter/Satoshi guidance.

| Style / utility | Size / line height (px at 16px root) | Weight class |
| --- | --- | --- |
| Display XL / `text-display-xl` | 72 / 80 | `font-bold` (700) |
| Display L / `text-display-lg` | 56 / 64 | `font-bold` (700) |
| Heading 1 / `text-heading-1` | 40 / 48 | `font-bold` (700) |
| Heading 2 / `text-heading-2` | 32 / 40 | `font-bold` (700) |
| Heading 3 / `text-heading-3` | 24 / 32 | `font-semibold` (600) |
| Body large / `text-body-lg` | 18 / 28 | `font-medium` (500) |
| Body / `text-body` | 16 / 24 | `font-normal` (400) |
| Body small / `text-body-sm` | 14 / 20 | `font-normal` (400) |
| Caption / `text-caption` | 12 / 16 | `font-medium` (500) |

The size utilities carry line heights, not weights; apply weight classes explicitly. Body defaults to 16/24. Use medium labels/buttons, tight heading tracking, and comfortable body leading. Scale large headlines down on mobile, e.g. `text-heading-1 md:text-display-lg font-bold`; preserve the hierarchy in both themes.

## Border Radius

`--radius` is `0.75rem` (12px at the default root size). Reuse the mapped scale; component assignments below are preferred composition rules.

| Use | Existing class/token | Preferred radius |
| --- | --- | --- |
| Small controls | `rounded-sm` / `--radius-sm` | 6px |
| Inputs and compact buttons | `rounded-md` / `--radius-md` | 8px |
| Standard buttons and upload areas | `rounded-lg` / `--radius-lg` | 12px |
| Cards/panels | `rounded-xl` / `--radius-xl` | 16px |
| Dropdowns/popovers | `rounded-lg` or `rounded-xl` | 12–16px |
| Modal panels | `rounded-xl` or `rounded-2xl` | 16–24px |
| Pills/badges and circular controls | `rounded-full` | Full rounding |

## Component Library

- Build with React/Next.js, TypeScript, Tailwind CSS, and shadcn/ui. Tailwind 4 is CSS-first: `@theme inline` and the dark variant live in `app/globals.css`; there is no separate Tailwind config. CSS is processed by `@tailwindcss/turbopack` in `next.config.ts`.
- shadcn is the base library: `components.json` uses `base-nova`, Base UI primitives, CSS variables, Lucide, and `@/components/ui`. Its `baseColor: neutral` is generator metadata; Sceenyk tokens own the runtime appearance.
- Reuse existing components first. Normally add common primitives through `npx shadcn add <component>`, then review their token use and density. Do not reinitialize the theme or replace the customized stylesheet.
- `components/ui/` contains `Button`, `Dialog`, and `Sheet`. Button supports default, secondary, outline, ghost, destructive, and link variants; primary uses `.sceenyk-action`. Heights are xs 28, sm 36, default 44, lg 48px, with matching icon-button sizes. Dialog/Sheet reuse semantic overlay/popover, viewport-safe sizing, 44px close controls, and reduced-motion support.
- Reuse `.sceenyk-card`, `.sceenyk-feature-card`, `.sceenyk-field`, `.sceenyk-upload`, `.sceenyk-container`, and `.sceenyk-interactive`. Classes supply styling; use real links/buttons/inputs and preserve primitive behavior.
- Customize through shared tokens, variants, and classes. Preserve accessible labels, keyboard navigation, focus/disabled states, responsive behavior, and dialog focus management. Inspect the relevant installed Next.js guide before writing application code, as required by `AGENTS.md`.

## Layout Patterns

Narration slice: the existing generation panel shows Preparing narration, Generating voice-over, Narration needs attention, Narration ready or Narration failed from persisted stage/readiness/failure fields. Ready audio remains an intermediate and holds the original reservation for final composition. No voice studio, provider settings, request IDs, internal costs or object keys enter the workspace. The owner-only narration read route provides fresh private audio capabilities for later composition; no final video is shown. Actual owner reopen/status refresh/full reload and private audio metadata playback, with real User B denial, pass the short deployed voice acceptance; consult the tracker for its limits.

Composition slice (015 applied; hosted ready UI verified): the same panel prioritizes Preparing timeline, Checking scene timing, Timeline ready and Timing adjustment required from persisted composition markers. Real owner status refresh, full reload and project reopen retain Timeline ready and the identical safe plan; actual User B cannot read it. Safe issue codes become short scene-specific messages, limited to four distinct messages; the original reservation remains held. Existing typography, tokens, light/dark cards and live-region semantics are retained. There is no timeline editor, raw JSON, provider configuration, object key or signed URL in this UI. The owner-only composition read route returns the strict safe timing contract; it has no write method. Conflict presentation has isolated coverage; no hosted end-to-end conflict UI acceptance is claimed.

Visual execution slice: reuse the existing generation panel and tokens for `Generating visuals`, `Visual scenes need attention` and `Visuals ready`. These come from the actual generating stage or persisted pending/readiness timestamps. Ready visuals are intermediate assets; the generation remains processing and the original reservation stays held for later voice/edit/render work. Unsupported or uncertain scenes never show completed video or fake percentages. Task IDs, provider URLs, raw plans and infrastructure costs remain server-only. Presentation-fixture checks are distinct from real provider/hosted readiness acceptance in the tracker.

Gemini planning slice: show persisted `Analyzing your media`, `Planning your content`, and `Production plan ready` in the existing generation panel. Readiness is `processing/planning` with a saved plan timestamp; no raw JSON, storyboard editor, completed video or simulated progress. A ready plan keeps its original reservation held for later production. Terminal AI failures restore it through existing accounting. Actual deployed Cloud/Gemini readiness, owner refresh/reopen, second-account denial and 1440/390/320px light/dark layouts pass. Earlier preparation-only descriptions below are historical; exact evidence is in the tracker.

Commercial quotes: creation requires Review generation cost, then explicit Confirm free generation/Confirm X credits. A changed form hides its prior quote. Show actual insufficient required/available credits, unavailable pricing and safe stale-quote feedback; the existing Buy credits link opens `/dashboard/credits` for a one-time Sandbox pack purchase. Optional test rates must visibly say development/test, not final pricing. See [pricing.md](pricing.md).

Accounting foundation: dashboard and creation show actual owned free allowance through an authenticated uncached action, with loading/error/retry states, held reservations and activation/status-refresh recovery. Use singular/plural/none wording and the exact two-lifetime/10-second explanation. The dashboard and credit screen show actual paid balances, with accepted Sandbox purchases; production tariffs remain unavailable until approved/configured. Preserve reservation/consumption/restoration rules and existing design tokens/components/layouts. Historical unavailable-purchase preview copy is superseded by the Sandbox credits extension above.

The landing page, public `/create`, private `/projects/[id]` and `/dashboard` share the same visual system. Clerk modal/account flows remain verified. Owned project source now adds draft title/save states and metadata cards; hosted project/media persistence is verified, with broader prior project acceptance tracked separately. Database failures display safe refresh UI separately from empty projects. Public navigation/account/loading/missing-configuration behavior remains unchanged, and artwork/output never fabricate generation.

- **Public pages:** top navigation with responsive mobile navigation; keep public exploration available without authentication.
- **App workspace:** persistent sidebar on desktop and an accessible mobile drawer on smaller screens. Use sidebar tokens and clearly mark the active destination.
- **Implemented dashboard shell:** existing 240px sidebar at 1024px, mobile Sheet and Clerk account controls remain. The Projects count/list comes from an owner-scoped server query; eight metadata cards per page, ordered newest first. EmptyState stays for zero drafts. Cards show actual title/category/draft/date/format/duration/style with category icons, never invented thumbnails/results. Project cards show latest owned job status, or Status unavailable when status cannot be read. Paid balances and Sandbox credit purchases are real; templates remain previews. Database failure is distinct from empty.
- **Main content:** centered, responsive regions with intentional maximum widths. `.sceenyk-container` uses `--content-width: 80rem` (1280px) and `--page-gutter: clamp(1rem, 3vw, 2rem)`; use narrower regions for focused forms.
- **Creation:** choose a content type, then group prompt, optional uploaded media, relevant settings, and generation progress in a focused workspace. Stack controls on mobile.
- **Creation workspace:** `/create` is public; `/projects/[id]` reuses its existing grid after server-owned load. Title/save controls retain their existing states. Local files preview before explicit Upload to project; the action saves an unsaved project first and updates its address without discarding Files. Real XHR progress, preparing/verifying/error/retry states and saved private-media metadata reuse existing tokens. Reopen restores project assets; active private previews request fresh signed access, and failed/expired previews offer Refresh preview. Pending assets provide Check upload with explicit guidance that it verifies an existing transfer; missing bytes after reload require reselecting the File and choosing Upload to project. Local selection removal remains; permanent deletion is deferred. Category/prompt/settings/output/Generate and theme behavior remain unchanged. Live development media acceptance passes; production deployment remains separate.
- **Cards:** reusable responsive grids for creation options, projects, templates, and marketplace content; preserve readable media thumbnails and supporting text.
- **Modals/authentication:** centered panels over `--overlay`, optionally with restrained backdrop blur. Use accessible primitives with viewport-safe sizing. Clerk sign-in/sign-up must open in centered modals/overlays; do not add dedicated `/signin` or `/signup` pages.
- **Pricing:** responsive cards with aligned prices/actions and a clear featured/popular tier using a purple outline and badge.
- **Progress:** reflect real persisted job state: queued, actual processing stage or safe failed state. Durable Cloud dispatch prepares current requests, then fails honestly because video production is not connected; the held allowance is restored. Successful completion requires verified stored-result settlement, with no invented output. Check generation status and activation/pageshow/visibility reads recover state; no simulated percent or timers. Generate requires a saved owned project and all local Files uploaded/removed; its snapshot includes current prompt/settings and all uploaded project media. Stack/wrap on mobile.
- **Spacing/mobile:** use the existing 4/8/12/16/24/32/48/64px scale, normally 16–24px card padding and grid gaps. Adapt columns and navigation, use `min-w-0` for shrinking content, and prevent page-level horizontal overflow. Start with Tailwind's existing sm/md/lg/xl breakpoints; test content fit. Aim for 44px mobile hit areas rather than simply shrinking desktop controls.

## Icons

Use **Lucide React** (`lucide-react`): simple modern stroke-based icons, consistent approximately 2px strokes and rounded geometry. Avoid mixing unrelated icon styles.

- Approximately 16px (`size-4`) for inline/small controls; 20px (`size-5`) for normal buttons/navigation; 24px (`size-6`) or larger for feature/icon cards.
- The current Button defaults embedded SVGs to 16px; supply an explicit `size-5` when a normal control needs 20px. Compact variants have smaller defaults.
- Inherit `currentColor` through semantic foreground/accent/link classes. Use blue/cyan selectively for media features.
- Decorative icons use `aria-hidden`; standalone icon buttons need an accessible name. Keep the icon artwork small while preserving a usable hit area.

## General UI Rules

- Never hardcode theme colors when an existing token applies. Pair backgrounds with their semantic foregrounds and verify contrast in both themes, including text over media.
- Purple dominates; blue/cyan supports. Avoid excessive gradients, shadows, and glow.
- Use whitespace generously, consistent spacing, and shared component sizing. Reuse existing components before creating new ones.
- Every interactive component needs appropriate hover, focus, active/selected, loading, and disabled treatments. Loading must expose status and prevent duplicate actions; disabled styling alone does not disable behavior.
- Keep animation subtle and purposeful; use existing 150/200ms timing tokens and respect reduced motion. Focus must remain visible without relying only on glow.
- Build all new UI responsively and verify mobile, desktop, keyboard interaction, and both themes. Preserve product state when changing themes.
