# UI Context

## Styling Policy — default for all frontend work

Sceenyk uses **Tailwind CSS + global.css**, not **Tailwind + scattered component CSS files**. Follow the approved [Styling Policy](code-standards.md#styling-policy); it overrides older CSS implementation suggestions unless the user explicitly instructs otherwise. `global.css` names the role of the existing `app/globals.css`, not a new file to create.

Use Tailwind utilities directly in components for layout, spacing, sizing, typography, colors, borders/radius, responsive rules, hover/focus/active states, transitions, positioning, overflow, flex/grid and light/dark themes. Reuse current design tokens, spacing, breakpoints and React components/variants. Do not create page/component stylesheets, CSS Modules or another styling framework; inline `<style>` blocks and styled-components require an existing dependency's absolute need and an explanation.

Only genuinely shared styling that Tailwind cannot reasonably express belongs in the single global stylesheet: tokens, reset/base/font rules, reusable scrollbar hiding, shared keyframes, browser-specific fixes, third-party overrides and minimal reusable specialized effects. Explain why Tailwind alone was insufficient. Never move normal component styles there merely to avoid utilities.

Existing separate CSS files are legacy, not a pattern for new UI. Prefer migrating a touched component's relevant styles in its future UI task, preserving unrelated CSS and removing an old file only after all its styles/consumers have been safely replaced. No CSS migration or deletion is authorized by this documentation update.

## Fixed mobile Marketplace and Templates frames (2026-10-19)

Below the 1024px desktop sidebar breakpoint, Marketplace, Templates and their shared listing-detail view keep the outer workspace frame stationary under the mobile header. The inner page owns native vertical scrolling, overscroll containment and the existing hidden scrollbars. Marketplace discovery, related listings and Templates cards use one column through 767px; larger gallery layouts remain unchanged. This supersedes the earlier two-column mobile Marketplace and viewport-scrolling guidance.

## Enabled project Delete confirmation (2026-10-19)

The latest request replaces the disabled Delete indicator with an enabled trash trigger and compact shared Base UI dialog. Name the selected project in the confirmation, explain removal from saved projects, and present matching Cancel/Delete actions with Delete styled destructive. Keep focus/Escape/dismissal behavior, block repeat submissions and dismissal during saving, show errors inline and close on success. Deletion remains owner-authoritative and requires the new migration; active generations display a safe wait message. No other card styling changes.

## Settings sidebar active state (2026-10-19)

The main workspace sidebar highlights Settings for `/settings` and every `/settings/*` section, including Credits & Billing. Credits remains a working shortcut to `/settings/credits` and does not claim a separate active state. The section navigation inside Settings still marks Credits & Billing as selected. This supersedes the earlier separate Credits highlight rule; shared desktop/collapsed/mobile navigation uses the same behavior.

## Projects preview and modal refinement (2026-10-19)

Project cards keep real private source previews first. Missing/unavailable media uses the shared abstract preview geometry and existing 32-color muted palette, selected deterministically from project ID without storing or changing a database color. Color and pattern use different hash bits to diversify neighboring cards while preserving the same project's appearance across refresh/order changes. The entire card receives a subdued matching tint in both themes. Keep My Projects sizing, reduce desktop subtitle to 15px/23px, remove the bottom Templates/Marketplace message and size both rename dialog actions through one explicit class/variant rather than data-slot selectors.

The user selected a disabled trash icon beside Rename, with a tooltip explaining that project deletion is unavailable. It is not a working delete action; the existing restricted deletion boundary stays intact.

Follow-up: action wrappers occupy two fixed adjacent columns (30px desktop/44px touch), and the matching card tint remains visible through the information area before fading to the normal surface. The former fade reached neutral too soon underneath the preview.

## Manage Templates compact cards (2026-10-19)

Management cards reuse Marketplace's shared preview, saved fallbackColor appearance and hover behavior. Use compact 4:3 previews with a small top-left status badge, left-aligned title/two-line muted description, three short Adoptions/Sales/Earnings rows and compact purple Manage listing plus a public-link arrow. The public arrow is enabled only for published listings and has a hover/focus tooltip. Card tint softly fades from the same saved hue into the normal surface without changing stored colors. Navigation links gain hover/focus underlines. A responsive gallery and small infinite-loading status replace management pagination, observing the existing Settings center scroller; fixed heading/navigation and other Settings sections stay intact. Manual review remains pending.

## Settings layout correction — Documentation pattern (2026-10-19)

Supersedes the Phase 4 Settings composition: exactly two columns, using existing Documentation layout/navigation classes. Reuse its 198px navigation, 40px gap, 32px desktop top/22px side padding, 28px navigation rows and fixed header/article grid. Restore Settings and “Make Sceenyk feel like a creative home.” above the independent section scroller. Remove the contents rail and centered narrow layout; readable section content is left-aligned with a 720px maximum. Desktop always shows the navigation; the Documentation content-width breakpoint adapts tablets/mobile to the existing native picker. Keep compact Pryzm-style controls and existing tokens/functionality. Manual review remains pending.

## Visual redesign Phase 4 — Projects and Settings (2026-10-19)

Use the six supplied Pryzm screenshots for approximate geometry, retaining Sceenyk branding/themes. Projects uses My Projects and the requested saved-project description, a 32px desktop title, compact New Project action, approximately 206px cards with 4:3 source previews, quiet title/edited date and Open/rename controls. Mobile is a single full-width card column with New Project below the description. Reuse the category placeholder where no uploaded image/video exists, never fabricate output. Rename uses the existing Base UI dialog at roughly 336px width, 20px padding and compact actions.

Settings removes the global heading/banner and retains only the selected section's title. Compact 198px grouped navigation sits beside a centered content column around 550px wide, restrained bordered cards and 32–36px desktop controls. Optional contents links appear only for useful headings in a long section at wide available widths. The outer frame stays stationary; center content and overlong navigation scroll independently with hidden scrollbars/containment. Narrow screens use a separate native Settings picker, no permanent contents rail and larger touch targets. Preserve all existing settings functionality and unavailable-feature explanations. Stop after Phase 4 for manual review.

## Visual redesign Phase 3 — Documentation (2026-10-19)

The four supplied Pryzm Documentation screenshots supersede older docs geometry below. Retain the shared workspace sidebar/frame and all seven existing topics, content, routes, anchors, fonts and theme tokens. Documentation uses compact grouped topics, a stationary Documentation heading/current topic description, an independently scrolling article and optional stationary On This Page rail. Only the topic list and article scroll; the frame stays viewport-bound on desktop and mobile, with hidden scrollbars and overscroll containment. Approximate screenshot targets: 198px side rails, 40px topic/article gap, 32px page title, 14px/23px muted body text and 28px desktop navigation rows. Contents hides at narrower available widths; mobile uses the existing native topic picker separately from the workspace hamburger. Anchors scroll/focus only the article, respect reduced motion and highlight the current section. Manual review remains pending; no product content or backend changes.

## Saved-color artwork and Templates spacing (2026-10-19)

This refinement replaces the earlier muted field/configuration-box appearance. Shared covers use persisted fallbackColor directly, with four subtle abstract gradient/pattern variants and deterministic geometry derived only from listing ID. The same template has identical base color and geometry in Marketplace, More looks, Templates and either detail view. Small Template preview labels distinguish placeholder artwork from generated media; real public media fields remain unavailable. The upper detail fade uses the selected saved color at 48% light/65% dark near the top and returns fully to the normal theme surface without blur or a hard edge.

Templates frame padding is active-route-owned: 60px top and 24px sides on desktop, 32px top and 16px sides on mobile. Heading/subtitle gap is 12px; gallery separation is 40px desktop/24px mobile; saved cards remain 250px at desktop, 4:3, 16px apart and single-column on mobile. Avoid `:has()` on cached detail markup when selecting frame padding; use WorkspacePageFrame's data-workspace-view.

Migration 029 is already applied. Hosted read-only inspection confirmed both published listings share a valid saved gray; query delivery works. Migration 030 expands the existing palette/allocation and safely repairs legacy duplicates without replacing unique assignments, changing timestamps or introducing another color store. It remains a manual setup step. No private media, business rules, browser suites, build, deployment or hosted workflows are part of this refinement.

## Marketplace and Templates refinements — clean routes (2026-10-19)

Current implementation supersedes the Phase 2 style-derived cover color and visible discovery pagination below. Navigation and account pages use `/projects`, `/templates`, `/templates/[listingId]` and `/settings/*`; no `app/dashboard` route folder remains. Manage Templates, existing publish controls and owner-only editing live at `/settings/templates`, `/settings/templates/new` and `/settings/templates/[listingId]`. Template cards open their own private detail, with Back to Templates, Update Template and a Marketplace link only while published. The same detail component renders public Marketplace and private template information, retaining account fences and the existing adoption controls.

Marketplace cards lift 3px with a 220ms transform; covers scale inside rounded clipping and a top-right arrow appears on hover/focus (always visible on touch). Borders do not highlight; keyboard rings remain and reduced motion disables lift/scale. Infinite discovery loads 12 listings per request through the existing validated browse service, deduplicates IDs, retains q/category filters, resets on filter changes and observes the actual desktop workspace scroller or mobile viewport. No visible page controls or scrollbar are added.

Migration 029 persists a random muted palette color once per listing, backfills only nulls and prevents reassignment. All gallery, More looks, Templates and detail surfaces use that saved color; the upper detail fade returns fully to the normal theme background. The public listing contract still has no preview-media field; configuration covers remain labeled and no private media or unrelated artwork is substituted. Before applying migration 029, the compatible reader uses a neutral placeholder. Manual visual inspection and hosted migration application remain pending; no deployment or hosted workflows.

## Visual redesign Phase 2 — Marketplace and Templates (2026-10-18)

The latest request supersedes earlier gallery presentation requirements. The nine supplied Pryzm desktop/mobile screenshots and Pryzm_Design_System_Reference_for_Sceenyk.md guide this UI-only phase. Retain the existing workspace sidebar/frame, branding, themes and server contracts. Marketplace uses the exact requested heading/subtitle, compact All/supported-category links (resetting pagination while retaining URL search), and approximately five columns at 1366px. Shared gallery cards show preview, title, two-line description and category/tags only; creator, price and generation estimates appear on detail, not gallery cards. The visible search form is removed; q URLs and existing server search remain supported.

Detail uses a square preview beside compact information/adoption controls when at least 860px of content width is available; otherwise preview precedes details. A style-derived Sceenyk purple/blue color shared with the configuration preview softly fades to the normal theme surface, without blur or a hard boundary. The current public listing contract has no artwork/video URL; keep labeled configuration previews, never substitute private media or unrelated marketing images. More looks reuses public browse, prefers category/tag matches, excludes the current listing and shows up to four real listings. Existing template configuration remains accessible in a disclosure. My Templates retains owner-only listing/account checks and pagination; preview-led 4:3 cards have existing manage/public links and published/created dates. Mobile Templates is single-column; Marketplace uses two columns from 380px, one below, with hidden-scrollbar scrolling inherited from the shell. No backend/schema/financial/provider changes; manual visual review is pending. Stop after Phase 2.

## Focused Studio refinement and canonical URL (2026-10-18)

The latest request supersedes the earlier edge-to-edge Sources overlay and side-by-side tablet layout. Studio is canonical at /studio; /create permanently redirects with query parameters, while owned /projects/[id] routes and existing handlers remain unchanged. At desktop viewport widths with at least 930px available Studio width, Sources/Stage/Properties use 254px/flexible/252px columns. Otherwise Stage precedes Properties; Sources opens as a 254px right-side nonmodal panel from 768px viewport width, or as a focus-managed modal inset 8px on every edge below 768px. One mounted Sources tree retains inputs and local media. Only the mobile modal locks background scrolling. Cached route deactivation releases the native Sources dialog and its body lock; reactivation resynchronizes its CSS mode without remounting controls. Root scrollbar hiding uses active WorkspaceShell effects, because hidden cached DOM must not affect the public landing page. Toolbar controls are 32px with a centered compact aspect segment/popover for the existing 9:16,16:9,1:1 choices; no invented Share or generation options. Existing completed-video download appears as Export in the toolbar through a presentation-only portal; URLs, fetching and handlers stay with the existing result component. At 320px the selected ratio/menu and icon-only Save/Export preserve space and accessible names. Workspace-only scrollbar hiding preserves scrolling and leaves public landing scrollbars unchanged. Preserve logos, themes, business logic and ownership; no hosted Inngest. Stop after Studio review.


## Pryzm reference implementation — Phase 1: Studio (2026-10-18)

Current authorization: use Pryzm_Design_System_Reference_for_Sceenyk.md as the primary workspace geometry reference, with the supplied screenshots for refinement. Implement Studio and necessary shared navigation/frame geometry only, then stop for user review. Templates/Marketplace, Documentation, Projects/Settings and public pages are later phases; preserve their current presentation and existing work. Keep Sceenyk's official logos, configured font, existing colors/themes/features and all backend/auth/financial/provider contracts. No hosted Inngest, generation, checkout or deployment acceptance.

Geometry decisions: a reusable workspace-only token layer; 252px navigation plus an 8px gutter (preserving the current Studio x260 frame position), 64px collapsed rail with no extra gutter, 254px Sources and 252px Properties. Keep the screenshot-tuned 54px toolbar/header and 52px inspector rows within the reference's estimated ranges. Four-area desktop requires at least 930px available Studio width and a desktop viewport; tablet Sources stays a full-screen overlay. A 752px content breakpoint stacks Stage/Properties on viewports up to 767px. CSS owns Sources' rail/modal mode; the native dialog reads that mode and retains one mounted control tree. Controls and type hierarchy are refined without changing handlers or business state. Actual verification is recorded in progress-tracker.md.

## Strict workspace visual-fidelity pass (2026-10-18)

The current user request supersedes earlier phase stop points and geometry guidance for a UI-only pass across Studio, navigation, Templates, Marketplace, Documentation, Projects and Settings. The supplied Pryzm screenshots are the primary layout reference; retain Sceenyk names, official logos, Inter, purple/blue accents and the existing theme controller. No backend, auth, payments, credits, Marketplace behavior, provider, database or guest-draft changes are authorized. Do not trigger hosted Inngest or perform deployment acceptance.

Reference-derived target geometry (Approximate): 260px desktop navigation, 64px collapsed rail, 8px viewport gutters and panel gaps, 14px outer radius, 1px neutral borders, 54px Studio headers/toolbar and 254px Sources/Properties rails at 1366-1440px. Compact desktop navigation uses 32px rows; touch navigation retains larger targets. Panels scroll independently on desktop; mobile retains hamburger/logo, Stage then Properties, and the same mounted full-screen Sources dialog. Gallery cards use a dense responsive grid with compact metadata; actual configuration covers remain labeled rather than inventing artwork. Documentation uses topics/article/contents at reference desktop widths. Settings retains its existing sections and controls. Workspace-scoped neutral surfaces supersede earlier purple-tinted neutrals; brand/action/focus colors remain unchanged. Local screenshots, responsive themes, overflow, lint, types and build are the acceptance scope. See progress-tracker.md for actual results.

Current geometry: Sources appears as a 254px rail at 1000px available content width, with a flexible Stage and 254px Properties. At 720-999px, Sources stays in the full-screen dialog and Stage/Properties share a row. Below 720px they stack with an 18px gap. The 54px toolbar uses 32px controls and a centered aspect selector; panel padding is 8px around the preview and 16px in tool rails. Inspector sections use native details/summary rows and preserve mounted children. Generation disclosures remain available in a compact details element; quote, cost and confirmation controls stay visible in their original flow. Positioned panel bodies contain screen-reader notices inside their own scrolling areas.

Gallery grids use 180px minimum columns, 16px gaps and 18px card corners on desktop, yielding five columns around 1366px. Mobile uses two columns below 600px and one below 360px. Existing status/adoption-price badges sit on configuration covers; titles, descriptions, creator links and existing management routes remain. Documentation uses 238px topic navigation, a flexible article and 220px contents rail from 1280px, with 32px gaps, 36px headings and 16px/26px article copy. Desktop content scrolls inside the viewport frame; mobile retains document scrolling.

## Studio Phase 3 — implemented (2026-10-18)

Current authorization includes desktop, tablet and mobile Studio. Reuse the shared navigation; Sources owns presentation of project title/origin and existing image/video/audio import/upload/recovery; the Stage owns source/result playback, durable status and scene caption preview; Properties owns category, prompt, duration/style/tone, existing generation quote/confirmation and caption preferences. Aspect ratio and Save move to a fixed 64px toolbar. WorkspaceEditor remains the brief/save/media-selection owner; useProjectMedia and useProjectGeneration retain their existing server calls, guards and state. Caption controls use React portals into Properties while their existing preview component owns state. No new scene editor, voice selector, share engine or export capability is introduced.

The same mounted Sources dialog uses native modal focus/scroll behavior below 1050px available content width; above that it is a nonmodal rail. At 720px available width Stage/Properties sit beside each other; below that Stage precedes Properties. A bounded, schema-validated 30-minute sessionStorage handoff restores only guest brief values through existing Clerk authentication; files remain memory-only and full reload requires reselection. Saved/account-switched private projects never use the guest draft. No auth route, ownership, cache, schema, provider, payment or generation-hook contract changes. Inngest Cloud stays paused. Local and scoped live acceptance is recorded in [the tracker](progress-tracker.md). Deployment is not performed; the next bounded unit is deployment and read-only acceptance of this revision, with Inngest Cloud still paused. Stop after Phase 3.


## Workspace Phase 2 presentation (2026-10-18)

The supplied gallery and Documentation references guide composition/spacing, not branding or copied features. Templates is an owner-only creative gallery of existing Marketplace template configurations: large existing aspect-video covers, 2 columns from sm and 3 from 2xl, quiet status/description and existing manage/public links. Empty/out-of-range views point to existing project publishing or Marketplace. No invented library filters, media artwork, saved-template storage or new adoption controls. Adopted work remains in Projects.

Documentation uses the shared outer rounded frame. At xl (1280px), a sticky 12rem grouped topic column sits beside a readable article (max 46rem); at 2xl (1536px), a subtle sticky 10rem On this page column appears. Below xl, topics become a labeled hydration-safe native select; contents links hide below 2xl. Twenty-one stable focusable section anchors, previous/next topic links, semantic headings and native scrolling preserve keyboard/deep-link behavior. Public guide content is curated from verified UI capabilities; no internal context files are rendered.

Templates and Documentation are active sidebar links without Soon markers; subtopics activate Documentation. Desktop collapse, tooltips, mobile Sheet/profile and Credits routing retain Phase 1 behavior. Legacy /dashboard#templates opens /dashboard/templates; /dashboard/projects#templates retains a useful link. Landing footer adds the public Documentation destination.

Creator listing/publish/manage/purchase headers share WorkspacePageHeader. Private payout-support pages use WorkspaceShell/PageFrame behind the existing role guard, with support-only local navigation. Settings section navigation now sticks 2rem from the top because the old global dashboard header is gone. Light/dark share the same geometry and existing semantic tokens; Studio editor, Marketplace discovery and financial controls remain unchanged. Acceptance is in the tracker; Phase 3 is not started.


## Workspace foundation — current Phase 1 (2026-10-18)

The supplied Pryzm screenshots inform sidebar placement, grouping, spacing, collapse and rounded content composition only. Sceenyk retains its own PNG logos, Lucide icon choices and purple/blue semantic tokens. Shared shell: desktop 240px sidebar or 80px icon rail; main content gains the released width. The large rounded bordered card surface uses generous responsive padding, without a global dashboard header/footer. Sidebar groups: CREATE (Studio), WORKSPACE (Projects, Templates), DISCOVER (Marketplace), RESOURCES (Documentation), ACCOUNT (Credits, Settings). Templates and Documentation show Soon with accessible planned labels; they have no working standalone routes yet. The old Templates placeholder is retained on Projects for legacy bookmarks.

The bottom identity trigger shows avatar, name and email, opening a Base UI account menu with Account, Creator Profile, Credits & Billing, Earnings & Payouts, Settings and Clerk sign-out. Details remain in existing Settings. Credit balance and theme controls are not reintroduced into chrome. Credits has its own active state; Settings is active for other Settings sections. Owned project editors activate Studio, Marketplace management/storefront/detail activate Marketplace. Menu keyboard/dismissal behavior comes from Base UI.

Collapse is stored locally under sceenyk-workspace-collapsed, with in-memory fallback if storage is blocked; it is unrelated to identity/security. Collapsed links keep accessible names and real focus/hover tooltips. At widths below 1024px, a hamburger/logo header replaces the rail; an independently scrollable, focus-managed Sheet includes the same entries and bottom user menu. Closing/navigating or widening to desktop dismisses the drawer. Existing theme controller governs identical light/dark spacing and structure.

Studio keeps the existing editor composition in this phase. Projects reuses the owned grid/pagination/statuses without Home summary cards; Marketplace keeps discovery/adoption behavior and Settings retains all nine sections. Public guest Studio/Marketplace remain public. Dashboard becomes compatibility navigation. Current four-phase request supersedes older seven-phase scheduling for this unit: Phase 2 remaining workspace migration, Phase 3 desktop Studio, Phase 4 mobile Studio. No guest restoration, full Studio/Marketplace visual redesign or hosted Inngest execution is included. Acceptance is in progress-tracker.md.


## Navbar dissolve and opaque hero content (2026-10-18)

The current user-approved visual correction supersedes the older local translucent copy backing. The home navbar uses a theme-tinted, masked backdrop-blur layer fading below the controls. A full-viewport-width gradient attached to the hero copy begins above the badge/headline, reaches fully opaque background before any copy and stays opaque below the CTAs and under the rounded Studio entry. Geometry, artwork/motion, copy, navigation/auth, themes and all other sections remain unchanged. Only landing CSS changes at runtime; acceptance/deployment status is in the latest tracker entry.


Current authorized follow-up: only the decorative home gallery is pinned; hero copy is in normal foreground flow, bottom-aligned within the first viewport and scrolling with the story. Mobile/tablet navigation moves to a left Sheet; its real account avatar links to the existing account settings page to avoid overlapping Clerk/Sheet focus traps. Signed-out authentication opens only after the drawer closes. The footer reuses supplied artwork under a contrast treatment. The shared theme now defaults to Dark when no valid preference exists, while preserving saved Light/Dark and explicit System (stored as system); this theme-only cross-app change is expressly requested. Local production/browser/visual acceptance is Complete; deployment remains pending in the latest tracker entry.

## Current landing implementation unit (2026-10-17)

The separately authorized landing-only refinement/motion unit is Complete within local production/browser/visual acceptance; deployment is pending; see [current tracker evidence](progress-tracker.md#scrolling-hero-copy-navigation-and-dark-default-2026-10-17). The supplied `Sceenyk Light Mode Creative Studio Landing Page.png` and `Sceenyk Neon AI Creation Studio.png` guide composition/spacing in both themes, while existing semantic tokens and official logos remain authoritative. Home uses individual supplied images, a preview-led illustrative Studio, visual inspiration cards, three commercial presentation panels and simple final/footer sections. Reference-only creator identities, unapproved pack prices and subscription forms do not establish live capabilities. Other application pages and full workspace redesign remain out of scope. The original approval below is historical for landing implementation status, while its preserved functionality/identity rules remain binding.

## Approved creative-studio-first UI/UX direction (2026-10-17)

Approved 2026-10-17. **Documentation contract: Complete. Redesign implementation: Not Started.** This approval defines the direction before implementation; it does not authorize application changes in this task. The first recommended implementation unit is **Phase 1 — shared public/workspace shells and navigation architecture**.

## Principle and precedence

**Creative studio first. SaaS dashboard second.** Sceenyk moves toward a premium creative-production workspace: restrained spatial hierarchy, visual-first composition and output surrounded by contextual tools. Modern creative tools such as Pryzm inspire the workspace feeling only. Retain Sceenyk's own identity, product structure and names; do not copy another product's exact layout, typography, animations, icons, components or branding, including its Studio/Lab/Flow naming structure.

This contract supersedes older target descriptions of dashboard-first navigation, Create as the primary user-facing destination, form-first/mobile form stacking, marketing feature-list navigation and a long educational landing page. Older source snapshots and acceptance results remain historical evidence, not redesign requirements or proof of redesign completion. Existing routes retain their current URLs until a separately scoped migration; **Studio is a user-facing name, not a requirement to rename `/create`, `components/creation/` or backend concepts**.

Preserve the current light/dark system, purple/blue accents, semantic design tokens, typography where practical, official logo assets and Tailwind/shadcn/Base UI foundation. Change hierarchy, information architecture, page structure, navigation, placement, spacing, responsive behavior and interaction flows. No replacement palette or branding is approved.

## Source-inspected baseline

Read-only source inspection on 2026-10-17 found the following. This is not new browser/deployment acceptance.

| Area | Current implementation | Approved change, Not Started |
| --- | --- | --- |
| Public shell and landing | `app/(public)/layout.tsx` supplies Navbar/Footer to home, `/create`, private project pages in the same route group and Marketplace. Home composes Hero, CreationCategories, HowItWorks, FeatureSection, Showcase, PricingPreview and FinalCta. The hero uses `SceneArtwork` concept illustration. | Separate public discovery and creative workspace presentation; shorten landing storytelling and use approved generated imagery. |
| Navbar | `components/navbar.tsx` lists Features, How it works, Marketplace and Pricing; signed-in account controls add Dashboard, Create, Settings and UserButton. | Compact public navbar and Studio entry for either auth state, as specified below. |
| Dashboard | `DashboardShell` uses a fixed 240px sidebar at `lg`/1024px and a mobile Sheet; home includes overview cards, projects and placeholder sections. Navigation includes Home/Create/Projects/Templates/Marketplace/Credits/Settings. | Workspace navigation, recent-work hierarchy and fewer administrative cards. Existing widths/breakpoints are baseline measurements, not required target dimensions. |
| Studio/create | Public `/create` and owned `/projects/[id]` reuse `CreationWorkspace`: form column then preview, two columns at `lg`, form first when stacked. Generation/caption/final-result panels contain separate output views. | Navigation / Sources / Stage / Properties with output as the main stage; intentional tablet/mobile behavior. Reuse existing preview/result logic. |
| Guest/auth | Signed-out visitors can configure category, prompt, local media and settings. The editor holds transient React state. Clerk forces post-auth `/dashboard`; identity-keyed editor/default loading can remount it. `ProjectGeneration` offers Sign in to generate; no cross-auth guest restoration exists. | Preserve lightweight guest draft across Clerk authentication and return to the same Studio flow. |
| Marketplace | Public browse/search/category/pagination, detail/adoption and creator storefronts exist. ListingCard includes configuration cover, title, description, tags, creator, adoption price and estimated generation credits. | Visual-first discovery with quieter cards and detail-first secondary information. |
| Settings | Nine private sections, desktop section links and a labeled picker below `xl`, owned data and legacy redirects exist. Light/Dark/System and primary balance/history live here. | Preserve completed information architecture, services, responsive navigation and private response policy. |
| Visual foundation | `app/globals.css`, root Inter/Geist Mono fonts, `lib/theme.ts`, root ThemeController and `SceenykLogo` implement shared identity. | Retain these foundations; no new color system, font replacement or recreated logos. |

Projects currently live in `/dashboard#projects`; Templates is a placeholder, and no standalone Library or Documentation route exists. Pricing is currently `/#pricing`. Named experiences below are intended information architecture, not claims that new routes/features exist. Choose destinations and legacy compatibility during the relevant implementation unit; do not create dead links or imply placeholder capabilities work.

## Two visual environments

| Environment | Surfaces | Presentation and access |
| --- | --- | --- |
| Public / Discovery | Landing, Marketplace, Pricing, Documentation, creator storefronts | Top navigation, immersive/full-width visual layouts, minimal chrome, cinematic presentation and spacious storytelling. Public discovery remains signed-out accessible. Documentation is a future education surface. |
| Sceenyk Workspace | Studio, Projects, Library, Settings, creator/account management | Persistent compact navigation on larger screens, preview/output-first hierarchy, contextual panels and reduced dashboard-card emphasis. Studio configuration is guest-accessible; private projects, account data and operations remain authenticated/owned. |

These are presentation boundaries, not two auth providers, theme systems or service stacks. Marketplace may be reached from the workspace while retaining public discovery presentation; public storefronts remain distinct from private creator management. Internal support retains its independent server authorization and private boundary.

## Landing and public navbar

The landing page is a minimal premium creative-product story, not a long SaaS feature list or complete manual. Approved order:

1. Navbar.
2. Hero.
3. A small number of immersive product-story sections.
4. Marketplace / creator-economy story.
5. Pricing.
6. Final CTA.
7. Footer.

| Viewer | Left | Right |
| --- | --- | --- |
| Signed out | Sceenyk logo, Marketplace, Pricing | Studio, Sign In, Get Started |
| Signed in | Sceenyk logo, Marketplace, Pricing | Studio, Clerk user/profile button |

Studio opens guest configuration without requiring sign-in. Sign In/Get Started retain centered Clerk modal authentication. Remove Features/How-it-works as competing top-level marketing navigation. Documentation remains reachable through the footer and workspace utility navigation. Preserve hydration-safe account readiness; never flash another viewer's controls or identity. Mobile public navigation adapts these destinations with accessible compact navigation. No persistent personal credit balance or theme toggle returns to global navigation.

### Hero and scroll story

One dominant central AI-generated image/visual anchors several smaller generated images around it. Use layered depth and subtle desktop pointer parallax with different small movement speeds. Motion remains restrained; avoid excessive floating animation. Use a strong static/mobile-adapted composition on touch/mobile, and disable nonessential movement for `prefers-reduced-motion`. The message must remain understandable without motion.

Use a strong short headline, very short support copy and at most two primary CTAs; approved possible labels are **Studio** and **Explore Marketplace**. Final wording and imagery selection belong to Phase 2. Marketing image preparation must be separately scoped and must not call the hosted production pipeline merely to populate the landing page. Supplied/static licensed assets or approved generated assets may support local design work without claiming user results exist.

A limited number of major storytelling moments may layer/stack, reveal the preceding section or appear to move over it in depth. Suggested conceptual sequence: **Idea → Scene**, **Scene → Story / Production**, **Create → Publish → Earn**. Do not animate every section. Return to normal document scrolling for Pricing, final CTA and Footer. Preserve normal navigation and scrolling without scroll trapping; keep a readable reduced-motion/static alternative.

Pricing retains the approved pay-as-you-go message, two separate lifetime free generations and one-time manual top-ups. Do not invent production prices, subscriptions or Live payment availability. Marketing aspirations must not imply that the deferred final renderer or other unavailable features are complete.

### Documentation education

Detailed education belongs primarily in Documentation: what Sceenyk is, Studio, starting a project, prompts, importing samples, visuals, narration, captions, Marketplace, creator earnings, credits, exports and other supported workflows. Distinguish available workflows from planned ones. This task creates no Documentation route or product manual; its location/content migration is scoped later. The landing explains value.

## Studio naming and guest handoff

Use **Studio / Sceenyk Studio** consistently for the primary creation destination and primary navigation/CTAs. Ordinary verbs such as create a project may remain; domain identifiers and routes need no gratuitous renaming.

Guests may enter prompts and supported style/visual settings, tone, duration, aspect ratio and other non-sensitive parameters. They cannot start provider-backed generation, reserve credits or access private project/media/account operations before verified authentication.

The approved Generate handoff is:

1. Preserve the current guest Studio draft before opening authentication.
2. Request Clerk authentication, reusing its modal model where practical.
3. On successful authentication, restore the guest draft inside the same Studio flow.
4. Keep entered choices instead of overwriting them with newly loaded account creation defaults; defaults fill genuinely unset new-draft choices only. Existing saved/adopted projects retain their own values.
5. Enable the existing owned save/upload and server-issued cost-review/explicit confirmation flow without requiring re-entry. Authentication completion alone must not auto-submit paid work.

Lightweight configuration may be persisted locally with a bounded, validated, versioned draft contract during implementation. Define lifetime/cleanup, cancellation/retry, reload and account-switch behavior before coding. Preserve a draft when the modal is canceled or auth fails; provide honest recovery when storage is unavailable. Browser draft data is untrusted configuration, never identity, ownership, pricing, entitlement or durable job truth. Do not mix one user's private project with another account's draft.

Large uploaded files require a separately defined safe browser-storage/authenticated-upload strategy; **do not place File objects, binary/base64 media or temporary signed capabilities casually in `localStorage`**. Existing in-memory Files/object URLs are temporary and do not establish reload/auth restoration. If a strategy cannot restore files, explain re-selection honestly while preserving lightweight settings. Server-owned project-first upload, private R2 verification and cleanup remain authoritative.

Current Clerk forced `/dashboard` redirects are baseline behavior, not the future Studio handoff. A later bounded auth change must use an application-controlled same-flow destination; no arbitrary browser return URL is trusted. General protected-route denial and other authentication flows remain secure. See [authentication.md](authentication.md#approved-guest-studio-auth-handoff-2026-10-17).

## Desktop Studio

Large-screen architecture: **App Navigation | Project / Sources | Preview Stage | Properties**. The Stage receives the largest portion of available workspace and feels like a creative/video-editor monitor rather than a dashboard card. Panel widths are implementation decisions based on real content fit.

| Area | Responsibility |
| --- | --- |
| App Navigation | Compact creative workspace navigation. CREATE: Studio. WORKSPACE: Projects, Library. DISCOVER: Marketplace. UTILITY: Documentation, Settings. Account/user controls may sit at the bottom. Use Sceenyk's own names; do not recreate another product's navigation. |
| Project / Sources | What the user is working with: title, sample/source import, uploaded media, existing scene list/references and project inputs. Do not call this Effects. Choose Project, Sources or Canvas during implementation according to actual content; this is separate from property editing. A scene list does not authorize a new timeline/editor. |
| Preview Stage | Imported media, generated scenes, current output, caption preview, playback and completed results where actually available. Unavailable/unready results retain truthful states. Reuse existing owned preview/caption/result mechanisms. |
| Properties | Frequently adjusted scene/project prompt, visual style, tone, duration, narration/voice, captions and other already-supported controls. Adapt to the current selection when supported; do not invent editable voices, scenes or properties. |

### Stage toolbar and progress

Use a compact **fixed-height toolbar, roughly 56–64px**, selected against the design system; never use literal 10% height. The preview uses the remaining Stage space. Candidate actions: aspect ratio, save/status, Sources access, progress, Share, Export and overflow. Include actions only when backed by an existing supported capability; no new sharing/export service is approved here. Preserve caption exports, owned playback and available final-result controls without claiming final rendering is ready.

Where supported by persisted workflow state, explain **Planning, Visuals, Narration, Captions, Finalizing** in user language. Map labels to actual stage/readiness/failure data, not a new job state machine. Never fabricate percentages, advance by elapsed time, expose provider internals or call an intermediate a completed result. Preserve reservation and success-settlement semantics.

## Tablet Studio

Progressively collapse secondary panels instead of squeezing four columns. Prioritize Stage, essential Properties, accessible Navigation and accessible Sources. Drawers/overlays may replace secondary areas as width requires; preserve selection, draft, playback context and focus when opening/closing or changing orientation. Exact breakpoints and panel widths are **Needs confirmation during implementation**, based on usable content rather than a copied desktop size.

## Mobile Studio

The normal visible mobile flow is explicitly **Top Navbar → Preview Stage → Properties**. The preview appears near the top; mobile does not stack every desktop panel ahead of it.

- **Top navbar:** hamburger, Sceenyk logo and only essential compact actions. Navigation consumes no permanent viewport width.
- **App navigation:** hamburger opens an accessible app navigation overlay/drawer containing Studio, Projects, Library, Marketplace, Documentation, Settings and account controls as supported. It is distinct from Sources.
- **Sources:** a Sources/Media control in the Stage toolbar opens the full Sources interface as a **full-screen/full-viewport slide-in overlay** with imports, media, existing scenes and project sources. It is neither a permanent column nor a small bottom sheet. Include an obvious Close control; closing restores the same Studio state and returns focus to the trigger.
- **Toolbar:** Sources, aspect ratio, progress, Save, Share and Export may appear when supported. Put secondary actions in accessible overflow instead of shrinking all desktop controls into unreadable buttons.
- **Properties:** display below the Stage in the normal page flow. Use readable labels and touch targets; the Sources overlay must not replace or erase this state.

Approved interaction: **Preview Stage → Sources button → full-screen Sources panel → Close → Preview**. Both navigation and Sources overlays need semantic titles, focus management/trapping, Escape/close behavior, background interaction control, safe viewport/scroll handling and focus return through existing accessible primitives.

## Projects, Library and home

Reduce Dashboard's visual importance. If a home surface remains, prioritize recent projects, resume work, start Studio and meaningful recent activity instead of excessive statistics/account cards. Settings owns account controls, credit balance and appearance.

Projects emphasizes real permitted thumbnails/previews and truthful project status; use a clearly labeled fallback when no preview exists. Do not fabricate generated thumbnails or expose private media publicly. Avoid a dense administrative table unless the task needs it. Library is the intended reusable creative-asset area with visual-first presentation where appropriate; exact feature expansion and persistence are outside this task. Do not present the current Templates placeholder as a functioning Library.

## Marketplace and creator storefronts

Preserve all Marketplace business behavior. Public discovery uses a responsive visual grid. Cards prioritize **(1) video/image preview, (2) title, (3) creator, (4) adoption price/free state**. Description, estimated generation credits, detailed statistics and other secondary details belong mainly on listing detail. Keep adoption price distinct from AI generation cost and retain cost disclosure before spending.

Current covers are explicitly configuration previews. Real discovery video/image previews require an approved public-media/rights projection; never reuse private R2 URLs, original uploads or project assets merely for visual richness. Until supported, retain an honest safe cover. Do not broaden DTOs or expose paid reusable instructions.

Creator names/avatars continue to link to **`/marketplace/creators/[creatorSlug]`**, and listings to existing detail/adoption. Storefronts align visually with discovery while preserving public allowlists, stable slugs, publishing, adoption, earnings and payout behavior. Creator management stays private in Settings → Creator Profile; public storefronts reveal no private projects, email, finances or internal support data.

## Settings and protected functionality

Preserve the completed Settings information architecture and responsive section navigation:

**Account; Creator Profile; Credits & Billing; Earnings & Payouts; Creation Preferences; Notifications; Appearance; Privacy & Security; Data & Account.**

Keep persistent credits in Credits & Billing and Light/Dark/System in Appearance. Do not return balance or theme toggles to global navigation. Contextual generation cost, available/required credits, insufficient-credit warnings and payment information remain wherever the action needs them. Unsupported notifications, defaults, export/deletion and session controls remain truthful and separately scoped.

All existing product functionality and backend contracts must survive relocation. Preserve Clerk identity/modals; Supabase ownership/security and private/no-store responses; private R2 media; Gemini planning; active fal.ai visuals; ElevenLabs narration; captions; composition; PayPal Sandbox; AI credits; Marketplace purchases/adoption; creator earnings/withdrawals; payout reconciliation; admin/support authorization; Settings; and creator storefronts. Reuse existing server/domain logic. This redesign changes no provider, financial policy, accounting trigger, entitlement, database access or accepted security invariant. Existing final-render capacity/acceptance limits remain deferred.

## Visual, responsive, accessibility and performance rules

1. Content/output is the hero.
2. Use generous spacing.
3. Reduce unnecessary card containers.
4. Use subtle surface differences for hierarchy.
5. Prefer restrained borders and shadows.
6. Let generated artwork/video provide much of the page color.
7. Keep control UI quieter than creative output.
8. Avoid excessive gradients/glows.
9. Animate only where it adds meaning.
10. Keep professional Studio density and more spacious public pages.
11. Avoid generic admin-dashboard aesthetics.
12. Preserve clarity over visual novelty.

Keep existing theme colors, semantic tokens, spacing/type/radius scales, official light/dark full/compact logos and Inter/Geist Mono where practical. Refine a token only for a documented implementation need; no palette replacement. Preserve reference confidence labels (**Exact / Approximate / Inferred / Needs confirmation**) in [design-system.md](design-system.md). The boards guide identity/component styling; this approved contract defines new page composition/navigation.

Each experience adapts deliberately: public visual compositions simplify motion on mobile; Studio uses four desktop areas, progressive tablet collapse and mobile Stage + Properties/full-screen Sources/hamburger; Marketplace uses responsive grids; Settings retains its responsive navigation. Do not build desktop then merely shrink it.

Preserve/improve keyboard navigation, visible focus, semantic controls, contrast in both themes and over artwork, reduced motion, accessible dialogs/drawers, screen-reader labels and at least 44px mobile touch targets. Retain skip targets, meaningful loading/empty/error/success states and truthful status announcements. Verify zoom, long labels, short viewports, overflow and focus restoration during each affected phase.

Optimize image dimensions/formats and reserve media geometry to avoid layout shift; prioritize the dominant hero visual and lazy-load noncritical media. Prefer performant CSS/transform motion, small scoped client boundaries and fewer mobile effects. Avoid excessive JavaScript-driven animation. Pointer/scroll effects must not block interaction; measure performance with representative content before marking the relevant phase Complete.

## Component and operational boundaries

Implementation may reorganize UI into clear feature boundaries: public site shell, workspace shell, Studio, Marketplace, Settings, shared brand/navigation and shared creative controls. Reuse root auth/theme, shared primitives and existing services/hooks. These are responsibilities, not mandated folders or permission for a broad backend restructuring. Preserve owned project/media/job/quote state through layout transitions; new UI grouping must not change route protection, callback URLs or private/public caching accidentally.

**Inngest Cloud remains intentionally paused to preserve monthly execution allowance.** Redesign work must not trigger hosted workflows unnecessarily. Use local development, local Inngest where needed and explicitly labeled fixtures. Hosted workflow acceptance stays **Pending hosted acceptance / deferred until explicitly authorized**; local results cannot substitute for it. Do not unpause, resync or submit generation/payout events as part of UI review. Previously completed hosted evidence remains valid within its recorded scope.

## Staged implementation and acceptance

The original approval marked all phases **Not Started**; the separately authorized landing-only unit is now Complete within local acceptance, with deployment pending, as recorded at the top and in the tracker. Other phases retain their existing status. Complete one bounded unit at a time, update context/tracker with actual evidence and stop after reporting the unit and recommending the next. No phase starts automatically from this documentation approval.

| Phase | Scope | Acceptance focus |
| --- | --- | --- |
| 1 | Shared public/workspace shells, navigation architecture, foundational responsive layout | Distinct shells, real destinations/legacy compatibility, Studio labels, auth-safe navigation and shared branding/themes. Preserve Settings, private response protections and existing workflows; no detailed landing/Studio rebuild. |
| 2 | Landing, public navbar, generated-image hero/parallax, selective scroll story, pricing/footer integration | Approved section order, signed-in/out navbar, static mobile/reduced-motion alternatives, accessible links/CTAs and measured media/motion performance. |
| 3 | Studio desktop Navigation / Sources / Stage / Properties | Stage dominance, fixed-height toolbar, existing creative controls/output and truthful progress. Scope guest draft/auth restoration explicitly within a bounded Studio unit; verify cancellation, restoration, account defaults and cost confirmation without hosted dispatch. |
| 4 | Studio tablet/mobile, hamburger navigation, full-screen Sources, Stage + Properties | Intentional collapse, full-viewport Sources/Close/same-state return, distinct navigation drawer, usable toolbar/overflow and keyboard/touch/focus behavior. Keep intermediate desktop work usable on small screens before this detailed phase. |
| 5 | Marketplace visual redesign and creator storefront alignment | Preview/title/creator/price hierarchy, truthful safe covers, detail cost disclosure, preserved storefront routes/privacy, adoption/recovery and financial behavior. |
| 6 | Projects / Library / dashboard cleanup | Recent-work/output hierarchy, truthful owned previews/status and no invented Library expansion or administrative statistics. |
| 7 | Cross-app responsive/accessibility/polish | Full route/state/theme matrix, keyboard/contrast/zoom/reduced-motion, media performance, functional regressions and recorded acceptance limits. |

For implementation, read relevant installed Next.js guidance before code, retain existing security/financial regression evidence and run proportionate required checks from [ai-workflow-rules.md](ai-workflow-rules.md). Use controlled local fixtures for progress/financial presentation without mutating real money or hosted jobs. Any real hosted workflow acceptance requires separate explicit authorization while Cloud is paused.

**Exact next implementation unit: Phase 1 — shared public/workspace shells and navigation architecture.** Define destinations for currently absent surfaces without inventing features, preserve existing URLs/bookmarks/callbacks and Settings behavior, and validate navigation/auth/themes/responsiveness. Landing animation, complete Studio restructuring, guest persistence, Marketplace redesign, backend/provider/accounting changes and the full redesign are outside that first unit.

## Settings implementation status (2026-10-16)

Implemented at /dashboard/settings/{account,creator-profile,credits,earnings,creation,notifications,appearance,privacy,data}, with /settings entry redirect, an authenticated shared dashboard shell, desktop section navigation and a labeled compact section picker on mobile/tablet. Legacy profile/credits/earnings bookmarks forward to the same source of truth and retain checkout/pagination queries. Existing profile, credit-purchase and creator financial components/services are reused. Navbar/dashboard/admin theme controls and dashboard header/summary paid balances are removed; contextual generation/payment credit information remains.

Appearance supports immediate Light/Dark/System through the existing browser preference/controller, including blocked or unwritable storage. Creation defaults implement only aspect ratio and category for new drafts via migration028; the user applied it and real save/reload plus two-account isolation pass through the built local app. Saved/adopted projects retain their own settings. Captions/styles stay per generation, narration voice is centrally configured, notification delivery/preferences are unavailable, and export/deletion actions remain deferred. Clerk account/security controls are reused with server-enforced self-deletion disabled before opening the modal. Settings responses use private/no-store without changing public caching. See progress-tracker.md for current verification and deployment limits. Earlier Settings approval paragraphs below are historical where they describe unimplemented controls or documentation-only scope.


## Approved Settings UI (2026-10-16)

**Approved presentation contract; implemented within the status above.** Settings is the private destination for Account, Creator Profile, Credits & Billing, Earnings & Payouts, Creation Preferences, Notifications, Appearance, Privacy & Security, and Data & Account. Use [the canonical section scope](overview.md#approved-settings-experience-2026-10-16) and [implemented Settings routes](architecture.md#approved-settings-architecture-2026-10-16).

Desktop uses existing Settings section links and the selected panel within the authenticated shell; mobile/tablet currently uses a labeled compact section picker below `xl`. Preserve this completed responsive navigation rather than replacing it during Studio redesign. Show the selected section, meaningful headings, loading/empty/unavailable states, validation and save success/failure. Reuse shared cards, fields, buttons, semantic tokens, spacing and light/dark geometry. Preserve keyboard access, visible focus, 44px touch targets, drawer focus return and responsive content fit; avoid a second dashboard sidebar on narrow screens.

**Theme relocation:** remove Light/Dark controls from the normal public navbar, dashboard header and other app header chrome; the inspected admin header also has a toggle to migrate. Settings → Appearance presents Light, Dark and System using the existing controller, preference key and root initialization. System follows OS changes; explicit Light/Dark overrides it until System is selected again. Keep app-wide styling, favicon updates, cross-tab persistence and usable behavior when browser storage is restricted. No second theme implementation or theme-dependent initial-render mismatch.

**AI-credit relocation:** remove the general dashboard/header paid-credit link and dashboard summary balance card. Do not add persistent personal balances to landing/navbar/sidebar chrome. Settings → Credits & Billing becomes the main balance/remaining-free-allowance, Buy Credits / Top Up and purchase/payment-history surface. Retain contextual generation cost, available/required credits, insufficient warnings, top-up dialogs and purchase-completion balances. The existing generation card is an action context, not general app chrome. Never hide costs before confirmation or conflate AI credits with creator earnings.

Creator Profile reuses the deployed editor with explicit public-field explanation, initial-only slug choice/read-only assigned slug, public avatar/bio and storefront preview link. Marketplace management links point into Settings; do not leave a second independent editor. Account name/avatar/email remain private Clerk identity unless explicitly reviewed as public creator fields. Preserve safe avatar processing/delivery, private profile caching and public storefront behavior.

Earnings & Payouts reuses Available Earnings, Pending Payout, Lifetime Earnings and useful reversals/adjustments, private payout destination, withdrawal action and history. Explain minimum $5 USD, immediate reservation and seven days from request; show safe persisted statuses and keep existing disabled/eligibility rules. No internal role, diagnostic, provider-reference or support controls belong here.

Creation Preferences implements aspect ratio/category defaults for new drafts, with per-project overrides; other defaults remain planned and this is not a replacement project editor. Notifications is planned for the approved event categories, with required financial/security notices visibly mandatory. Privacy & Security explains visibility and delegates supported sessions/security to Clerk. Data & Account plans data management/later export and a protected Danger Zone; no working deletion control or invented export exists in this unit. Do not display interactive preference toggles that imply unsupported persistence/delivery. Existing Account, Creator Profile, Credits & Billing, Earnings & Payouts and Appearance capabilities are wired; additional defaults, notification infrastructure and export/deletion require separate scope.

Earlier UI descriptions below retain historical screens/evidence. Completed Settings implementation supersedes old navbar theme and persistent dashboard-balance placement; the new redesign target above supersedes old page composition without changing accepted functionality.

## Approved public Marketplace creator storefront UI (2026-10-15)

**Deployed and Complete within scoped acceptance (2026-10-16).** The public Marketplace shell, return link, protected account/project/financial/support controls and owner-only `/dashboard/marketplace/profile` retain their behavior. Slugs stay read-only after setup. The account widget waits for its hydration-safe auth snapshot, with a matching inert44px span beforehand; no suppression or theme/avatar/form/navigation redesign is introduced. Fresh Production verification passes14 profile loads, eight1440/390 theme cases, both account menus and71 full checks without browser errors. Public storefront also fits320/390/768/1440 in both themes; four real screenshots are reviewed. Private HTML/RSC remain no-store and public/static caching stays intact. Physical-device/screen-reader acceptance remains separate. See the [public data/ownership contract](architecture.md#approved-public-marketplace-creator-storefront-contract-2026-10-15) and tracker for limits.

Version one has a creator header with approved public avatar or initials, display name, readable slug where useful and optional short public bio, followed by a published templates grid. Optional public adoption/activity indicators or creator-since date appear only with a verified safe public source; omit unavailable values rather than inventing counts/dates. Featured content, creator search and extra statistics are later extensions. A slug label is not a new username/social-handle feature.

Reuse `ListingCard`, `TemplateCover`, price/generation-credit labels, pagination and normal detail/adoption behavior where practical. Creator name/avatar links on Marketplace cards and detail go to `/marketplace/creators/[creatorSlug]`, never to Clerk account management or a private dashboard/profile. Keep creator links independent of listing links; do not nest interactive links. Storefront template cards open `/marketplace/[listingId]` and adoption continues there through the existing free/paid system.

Use existing shared Sceenyk tokens, Inter typography, semantic card/button/link styles and shadcn/Base UI conventions. Support desktop, tablet and mobile in light and dark mode, with the same content and hierarchy. Reuse the Marketplace grid: one column on phones, two at `sm`, three at `xl`; stack/wrap avatar, name, bio and any stats on narrow screens. Preserve readable long names/slugs, no horizontal overflow, keyboard navigation, visible focus, accessible link names, appropriate avatar alt text and touch targets. Do not introduce a separate palette or visual language.

Show a genuine loading state, safe unavailable/not-found state for an unknown slug, and a service-error state distinct from zero results. For a public creator with no published listings, show **"This creator has no published Marketplace items yet."** Never show drafts, unpublished/archived listings, private project previews or financial information to fill the grid. Public HTML, metadata and client payloads must exclude the architecture contract's private fields even when the viewer owns the storefront.

The private owner-only editor lives at `/dashboard/settings/creator-profile`; legacy `/dashboard/marketplace/profile` redirects there and Marketplace management entry points use the same Settings source. It lets the creator review/save public display name, avatar and short bio, choose a valid available slug during setup, and view/copy the stable assigned slug afterward. Explain public fields separately from private account settings. Preserve saving, validation/conflict/failure and persisted success states and server/database ownership. Later slug renaming needs separate link-preservation rules. This documentation task does not relocate the working editor or avatar system.

**Historical storefront recommendation — now Complete within deployed acceptance:** Following, likes, comments, feed, collaborations, ratings/reviews, creator-specific search and a broader `/creators/[slug]` page are deferred. No social controls, moderation, payout UI, financial or final-render changes belong to this storefront contract.

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

The completed Settings migration places primary paid balance/history in Settings → Credits & Billing and removes the dashboard-header link/summary balance. Contextual paid balance/manual top-up in creation remains. Quotes display server-derived estimated cost, available paid credits and expected balance after reservation; free quotes leave paid credits unchanged. Expired quotes disable confirmation and offer Update quote. The existing shadcn top-up Dialog uses server-owned packs and separate-tab PayPal approval, retaining editor settings and local Files. Activation/cross-tab invalidation refresh owned balances/quotes with explicit confirmation still required. Keep safe popup recovery, low-credit copy, verified purchase success and the safe last20 paid-ledger history; no auto-recharge or internal/provider identifiers. Existing acceptance remains in the tracker; preserve completed Settings placement.

Protected `/dashboard/settings/credits` uses the shared shell/card/button/status tokens, responsive demo packs, test-only amounts, PayPal approval, payment states, actual paid available/reserved balances and recent owned purchases. Legacy `/dashboard/credits` forwards queries there; Buy credits entries use this same flow. Preserve contextual insufficient-generation links, active-Clerk-account state reset and owned pending-payment recovery on load/activation/Check purchases. No subscription UI, production price or theme token is introduced. Existing payment acceptance and completed Settings relocation remain intact.

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

Light remains the CSS `:root` token fallback, while the app HTML and before-paint initialization now default to Dark. Saved light/dark choices under `sceenyk-theme` are respected; an explicit system value follows the OS. Settings → Appearance exposes Light/Dark/System through the same controller; selecting System persists that distinct choice rather than clearing storage. Apply `.dark` on `<html>` before first paint, preserving font classes. Preserve system-change and cross-tab synchronization; storage restrictions must not prevent an in-page choice. Reuse `shadow-card`, `shadow-popover`, and `shadow-glow` instead of independent effects. Control relocation and explicit System selection are implemented; preserve both.

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
- Existing global `.sceenyk-card`, `.sceenyk-feature-card`, `.sceenyk-field`, `.sceenyk-upload`, `.sceenyk-container` and `.sceenyk-interactive` classes are legacy shared treatments, not templates for adding ordinary component CSS. Prefer existing React components/variants and Tailwind utilities for new work; migrate relevant legacy styles only within an authorized UI task. Use real links/buttons/inputs and preserve primitive behavior.
- Customize through shared tokens, Tailwind utilities and reusable React variants. Add global CSS only under the Styling Policy's exception criteria. Preserve accessible labels, keyboard navigation, focus/disabled states, responsive behavior and dialog focus management. Inspect the relevant installed Next.js guide before writing application code, as required by `AGENTS.md`.

## Layout Patterns

Narration slice: the existing generation panel shows Preparing narration, Generating voice-over, Narration needs attention, Narration ready or Narration failed from persisted stage/readiness/failure fields. Ready audio remains an intermediate and holds the original reservation for final composition. No voice studio, provider settings, request IDs, internal costs or object keys enter the workspace. The owner-only narration read route provides fresh private audio capabilities for later composition; no final video is shown. Actual owner reopen/status refresh/full reload and private audio metadata playback, with real User B denial, pass the short deployed voice acceptance; consult the tracker for its limits.

Composition slice (015 applied; hosted ready UI verified): the same panel prioritizes Preparing timeline, Checking scene timing, Timeline ready and Timing adjustment required from persisted composition markers. Real owner status refresh, full reload and project reopen retain Timeline ready and the identical safe plan; actual User B cannot read it. Safe issue codes become short scene-specific messages, limited to four distinct messages; the original reservation remains held. Existing typography, tokens, light/dark cards and live-region semantics are retained. There is no timeline editor, raw JSON, provider configuration, object key or signed URL in this UI. The owner-only composition read route returns the strict safe timing contract; it has no write method. Conflict presentation has isolated coverage; no hosted end-to-end conflict UI acceptance is claimed.

Visual execution slice: reuse the existing generation panel and tokens for `Generating visuals`, `Visual scenes need attention` and `Visuals ready`. These come from the actual generating stage or persisted pending/readiness timestamps. Ready visuals are intermediate assets; the generation remains processing and the original reservation stays held for later voice/edit/render work. Unsupported or uncertain scenes never show completed video or fake percentages. Task IDs, provider URLs, raw plans and infrastructure costs remain server-only. Presentation-fixture checks are distinct from real provider/hosted readiness acceptance in the tracker.

Gemini planning slice: show persisted `Analyzing your media`, `Planning your content`, and `Production plan ready` in the existing generation panel. Readiness is `processing/planning` with a saved plan timestamp; no raw JSON, storyboard editor, completed video or simulated progress. A ready plan keeps its original reservation held for later production. Terminal AI failures restore it through existing accounting. Actual deployed Cloud/Gemini readiness, owner refresh/reopen, second-account denial and 1440/390/320px light/dark layouts pass. Earlier preparation-only descriptions below are historical; exact evidence is in the tracker.

Commercial quotes: creation requires Review generation cost, then explicit Confirm free generation/Confirm X credits. A changed form hides its prior quote. Show actual insufficient required/available credits, unavailable pricing and safe stale-quote feedback; the main Buy credits destination is `/dashboard/settings/credits`, with legacy `/dashboard/credits` forwarding queries for a one-time Sandbox pack purchase. Optional test rates must visibly say development/test, not final pricing. See [pricing.md](pricing.md).

Accounting foundation: dashboard and creation show actual owned free allowance through an authenticated uncached action, with loading/error/retry states, held reservations and activation/status-refresh recovery. Use singular/plural/none wording and the exact two-lifetime/10-second explanation. Settings → Credits & Billing shows persistent paid balances, with contextual balances/costs in generation and accepted Sandbox purchases; production tariffs remain unavailable until approved/configured. Preserve reservation/consumption/restoration rules and existing design tokens/components/layouts. Historical unavailable-purchase preview copy is superseded by the Sandbox credits extension above.

The landing page, public `/create`, private `/projects/[id]` and `/dashboard` share the same visual system. Clerk modal/account flows remain verified. Owned project source now adds draft title/save states and metadata cards; hosted project/media persistence is verified, with broader prior project acceptance tracked separately. Database failures display safe refresh UI separately from empty projects. Public navigation/account/loading/missing-configuration behavior remains unchanged, and artwork/output never fabricate generation.

- **Public pages:** top navigation with responsive mobile navigation; keep public exploration available without authentication.
- **App workspace:** persistent sidebar on desktop and an accessible mobile drawer on smaller screens. Use sidebar tokens and clearly mark the active destination.
- **Implemented dashboard shell:** existing 240px sidebar at 1024px, mobile Sheet and Clerk account controls remain. The Projects count/list comes from an owner-scoped server query; eight metadata cards per page, ordered newest first. EmptyState stays for zero drafts. Cards show actual title/category/draft/date/format/duration/style with category icons, never invented thumbnails/results. Project cards show latest owned job status, or Status unavailable when status cannot be read. Paid balances and Sandbox credit purchases are real; templates remain previews. Database failure is distinct from empty.
- **Main content:** public reading/form regions use intentional maximum widths; the approved workspace Stage may use the available width rather than inheriting every centered marketing constraint. `.sceenyk-container` uses `--content-width: 80rem` (1280px) and `--page-gutter: clamp(1rem, 3vw, 2rem)`; use narrower regions for focused forms.
- **Studio target:** group supported inputs into Sources and Properties around the dominant Stage on desktop. Tablet progressively collapses panels. Mobile normal flow is Top Navbar → Stage → Properties; Sources opens separately as a full-screen overlay. The old form-first stack is source baseline only.
- **Current creation source baseline (approved Studio composition is Not Started):** `/create` is public; `/projects/[id]` reuses its existing grid after server-owned load. Title/save controls retain their existing states. Local files preview before explicit Upload to project; the action saves an unsaved project first and updates its address without discarding Files. Real XHR progress, preparing/verifying/error/retry states and saved private-media metadata reuse existing tokens. Reopen restores project assets; active private previews request fresh signed access, and failed/expired previews offer Refresh preview. Pending assets provide Check upload with explicit guidance that it verifies an existing transfer; missing bytes after reload require reselecting the File and choosing Upload to project. Local selection removal remains; permanent deletion is deferred. Category/prompt/settings/output/Generate and theme behavior remain unchanged. Live development media acceptance passes; production deployment remains separate.
- **Cards:** reusable responsive grids for creation options, projects, templates, and marketplace content; preserve readable media thumbnails and supporting text.
- **Modals/authentication:** centered panels over `--overlay`, optionally with restrained backdrop blur. Use accessible primitives with viewport-safe sizing. Clerk sign-in/sign-up must open in centered modals/overlays; do not add dedicated `/signin` or `/signup` pages.
- **Pricing:** responsive one-time credit-pack/free-allowance presentation with clear actions and existing tokens; no recurring tiers or unapproved production prices.
- **Progress:** reflect real persisted job state: queued, actual processing stage or safe failed state. Production stages expose only actual persisted readiness; Cloud is paused and final rendering deferred. Existing failure restoration and held-intermediate semantics remain authoritative. Successful completion requires verified stored-result settlement, with no invented output. Check generation status and activation/pageshow/visibility reads recover state; no simulated percent or timers. Generate requires a saved owned project and all local Files uploaded/removed; its snapshot includes current prompt/settings and all uploaded project media. Stack/wrap on mobile.
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

The viewport-hero follow-up adds a fixed translucent/backdrop-blurred home navbar, an 18-tile percentage-positioned gallery behind the foreground copy, a 100dvh sticky hero and an opaque subsequent story layer with 56–100px section gaps. The story scrolls over the hero using CSS, without scroll-driven JavaScript. The existing root scroll padding supplies fixed-header anchor offsets without an additive section margin. Reduced motion uses normal scrolling, and viewports at most 540px high (including high browser zoom) use content-sized reflow rather than clipping controls or disabling zoom. This follow-up passes local production/browser/visual acceptance; deployment remains pending. See the latest tracker entry.
