# Sceenyk design system

## Planned M10 review presentation (2026-10-27)

M10 Planned / Not Started; M9 Complete/approved. [Planned scene/final review](final-video-generation.md#final-validation-review-and-completion) reuses Studio segmented navigation, shared Buttons/status/warning/error surfaces, accessible private video controls, native expandable scene details and bounded native scrolling. Clearly distinguish generated/private-ready/accepted, uncertain/recovering/failed, stitching/validating/review and approved/Complete; no fake percentages or unsupported actions. Final Video joins the existing views without redesigning Studio. Preserve Tailwind utilities, the sole existing `app/globals.css`, focus/keyboard behavior, responsive containment and reduced motion. Documentation only: no components/styles/player or tests are added here.

## M9 summary presentation (2026-10-27)

M9 is Complete and approved per the owner. Its shared controls/status tokens, native scene disclosures, wrapping tabs, bounded scrolling and existing responsive/Tailwind presentation remain unchanged. [M9 review behavior](video-generation-package.md#workflow-and-failure-states) is current; dated manual/visual notes below retain their historical evidence. Current [M10 preparation](final-video-generation.md) changes no UI or styling and runs no visual test.

## Storyboard dialogue-only repair controls (2026-10-27)

Use existing native scene disclosures, labelled textareas, shared Buttons and warning/status tokens for explicit saved-response dialogue editing. Other fields remain readable and fixed. Per-line counts distinguish preferred target from absolute maximum; local checking and explicit saving are separate actions. Original response reports are labelled independently from the saved review document. Preserve native scroll/focus, responsive wrapping and the sole existing global stylesheet. [Behavior/setup](storyboard.md#timing-targets-and-manual-dialogue-repair-2026-10-27); no browser/visual tests executed.

## Storyboard provider/recovery details (2026-10-26)

Use the existing warning/status surfaces and a native details disclosure for safe provider/recovery metadata; IDs wrap and missing values read Not retained. Recovery actions reflect real availability, never imply resubmission or an unverified provider result. No new CSS, palette, layout or animation system. [Current recovery correction](storyboard.md#provider-timeout-evidence-and-recovery-only-correction-2026-10-26); manual visual acceptance pending.

## Storyboard queue state refinement (2026-10-26)

Use plain queued/processing/paused/failed labels and existing warning tokens for an unclaimed queue older than 90s or an expired heartbeat/lease. Required recovery information includes attempts/request counts and Check status; never imply video generation has begun or offer a duplicate Generate for an existing queued request. Reuse existing Studio regions/Tailwind tokens, with no layout, stylesheet or animation-system change. [Queue correction](storyboard.md#location-empty-claim-starvation-correction-2026-10-26); manual visual acceptance remains pending.

## Milestone 8 — Storyboard review (2026-10-26)

Reuse Preview segmented buttons with a Storyboard option, shared Buttons, existing theme tokens, native details/summary timeline cards and bounded native scroll. Scene headers show number/start/end/purpose. Labelled text/number/select controls expose edits; timestamps display seconds to three decimals and persist integer milliseconds. Required instructions remain readable, generation prompts wrap, and speech is optional. Explicit save/status/error feedback and disabled dirty/stale approval retain accessibility and coarse-pointer behavior. No new palette, CSS file, animation system or Studio layout redesign. [Contract/setup](storyboard.md); manual visual/accessibility acceptance pending.

## Milestone 7 — Location review (2026-10-26)

Location reuses References, shared Button tokens, native scrolling and a large contained private preview. Generate Location is the only initial/post-deletion generation action; plan fields/text are absent. Image review uses Accept Location / Reject and Delete. Rejection hides the image immediately, deletion failure offers Retry deletion, and recovery announces storage-only work. Failed previews block Accept. Existing theme/focus/reduced-motion behavior remains; no new stylesheet or design system. [Current contract](location-reference.md); manual visual acceptance pending.

## Milestone 6.6 — Reference Regeneration + Review UX Correction (2026-10-24)

**Milestone 6.6 — Reference Regeneration + Review UX Correction — Complete in source. Manual migration/provider/runtime/ownership/visual acceptance pending. Milestone 7 — Not Started.** This section supersedes the historical 6.5 request-only execution and exclusive Preview rules below. [Current execution, versioning and manual setup](reference-review.md#milestone-66-execution-and-review-contract).

Preview uses one compact theme-token Progress | References segmented control with real buttons, aria-pressed, keyboard focus and coarse-pointer sizing. Both views fill the existing bounded Preview with native scrolling. Preserve restrained motion/reduced-motion support, light/dark surfaces, responsive reference cards and Base UI dialogs. Tailwind only; no new CSS.

## Milestone 6.5 — Reference Asset Review (2026-10-24)

**Milestone 6 — Complete. Milestone 6.5 — Complete in source; manual 046/runtime/ownership/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This supersedes older stop points below. [Review UI, security, persistence and setup](reference-review.md).

Reference review reuses Studio Preview, compact theme-aware two/four-column cards and a larger full-row sheet. Small labelled refresh actions confirm requests; compact purple approval Buttons and shared Base UI dialogs retain focus/Escape, responsive containment, native scrolling and reduced-motion behavior. Tailwind only; no stylesheet or Studio layout redesign.

Input → Reference Analysis → Character Reference generation → Character Review/Approval → Product Reference generation → Product Review/Approval → Location Reference → Storyboard → Generation Package → Final Video → Preview. Existing cost-confirmation/accounting gates remain. Apply 046 manually after 045; no new environment/dependency. Render/Inngest remain disabled. No provider, worker/job, storage request, remote SQL, browser/screenshot, build or deployment executed. Stop after 6.5.



## Milestone 5 — Character Sheet (2026-10-23)

**Complete in source; manual migration/provider/runtime/visual acceptance pending. Exact next: Milestone 6 — Product / Prop Reference Sheet generation. Not started.** [Character Sheet contract and manual setup](character-sheet.md) supersedes older M5-not-started/OpenAI-Character-image assumptions below; historical evidence remains intact.

Existing UGC controls show Character ready at the persisted Product pause. Presentation, geometry, themes, focus/scroll and Tailwind/global stylesheet policy remain. No generated-asset layout or wardrobe control is added; manual visual acceptance is pending.

Approved full flow: Input → validation → OpenAI analysis → SOUL2 Character Sheet → Product Sheet → one primary Location → structured ChatGPT storyboard/script + stable voice specification → generation package → cost review/confirmation → final video → finalization → Studio Preview. No later stage is implemented. User confirms 039 applied; verify/apply 040 then new 041 manually. Render/Inngest remain disabled; only user-started local worker execution. Codex made no provider calls, ran no jobs/worker, applied no hosted SQL and deployed nothing. Offline in-memory schema validation is separate from manual runtime acceptance.

## Reference-name fields beneath UGC thumbnails (2026-10-23)

Character name / Product / Prop name appear only beneath uploaded sources, with e.g. Maya / e.g. Nova Watch placeholders and explicit associated labels. Keep 64px thumbnails, compact full-panel-width fields, min-w-0 containment, existing field colors/focus ring and coarse-pointer sizing through Tailwind. Reuse the Preview-header Save feedback and existing readiness messages. No new stylesheet, panel sizing/layout redesign or Sources status system. Removal hides fields; replacement starts empty. Manual visual review pending; Milestone 5 is not started.

## Milestone 4 - existing Studio controls (2026-10-23)

Use shared 5/10/30 duration choices; preserve a selected historical 15 value with its legacy label until the user changes it. The existing generation control shows References analyzed at the real character_reference pause and retains Check status for paused jobs. No new component styling, layout, theme or stylesheet. Tailwind/global stylesheet policy remains. [Current analysis behavior](reference-analysis.md); manual inspection pending. Earlier duration/pause notes below are historical.

## UGC readiness control — Milestone 3 (2026-10-23)

Studio UGC now uses the existing compact generation control area for Prepare generation, safe missing-input paragraphs, Check inputs and owner-only Check status. Preserve Sources/Properties sizing, themes, native focus/scroll and shared Button/AccountAction behavior; ordinary styling remains Tailwind-only with no new stylesheet. Readiness disables the action until saved/settled server-validated inputs; pending checks use real async state. Reference analysis pause is real persisted state, not fake processing. Freestyle cost controls remain unchanged. [Behavior/setup](generation-jobs.md#milestone-3--ugc-input-readiness-2026-10-23); manual UI acceptance pending, no browser/screenshots/build.

## UGC V1 contract reference (2026-10-23)

The [approved UGC workflow](ugc-v1-workflow.md) documents future required inputs and real persisted Preview stages, including awaiting cost review/confirmation and safe failure. Preserve existing Studio geometry, Tailwind/global stylesheet policy, themes, focus and native scrolling. No controls/layout are changed by this architecture task; current 10/15/30 durations and Cartoon stored value need compatible future UGC 5/10/30 and Cartoon / Illustrated presentation work. No fake progress percentages or fabricated generated assets. Current UGC acceptance is manual; no automatic browser/screenshot/full regression/provider/hosted suites without explicit instruction.

## UGC V1 Add controls (2026-10-22)

Keep the existing compact Add Character/Add Product / Prop labels, dimensions, outline geometry and thumbnail/removal styling. Each role accepts one selected/uploaded image. At capacity disable both the button and single-image input, using muted theme utilities, cursor-not-allowed and actual disabled semantics; override pointer-events only locally so the disabled cursor is visible, while native disabled activation stays blocked. Remove trailing + tiles. Removal re-enables the Add control without refresh. Retain visible/removable legacy extras with concise role warnings; no clipping or destructive trimming. Use Tailwind only and preserve existing native Sources layout/focus/motion. Freestyle is unchanged. This supersedes earlier multiple-reference/trailing-plus guidance.

## Remote loading states (2026-10-21)

Default to real page structure immediately: persistent navigation, heading, description and safe static actions remain visible while only remote content loads. Match each skeleton to the actual card/preview aspect ratio, typography lines, action row, field, avatar, summary or history layout. Share the real gallery grid classes and reuse Settings/Studio scroll containers; preserve approximate height, minimum widths and nested viewport containment. Neutral `bg-muted`, existing card/border/radius tokens and `motion-safe:animate-pulse` provide light/dark and reduced-motion support without new CSS or glow. Use `components/ui/skeleton.tsx` primitives with feature-specific compositions; expose one meaningful status label and hide decorative shapes from assistive technology. Primary page loading should not use generic spinners. Existing operation/progress indicators may remain for uploads, generation and mutations.

Show placeholders only during real remote/auth/database/storage/API work. Stream request-bound Server Components behind local Suspense boundaries; client effects use their existing pending/settled/error state. Keep loaded content during refresh and append compact skeleton cards for infinite pagination. Never add a fake delay, conceal errors with permanent skeletons, or share-cache authenticated user data. See [the loading audit and implementation map](progress-tracker.md#remote-loading-audit-2026-10-21). Visual review remains manual under Fast UI Development Mode.

## Dynamic Studio creation controls (2026-10-20)

This supersedes earlier UGC-only/fixed-type guidance. Sources' shared Select offers UGC/UserRound and Freestyle/Sparkles. Keep compact section labels and sibling dividers; UGC Characters and Product / Props use small Add controls, wrapping 64px square rounded thumbnails, individual X actions and a trailing +. Use existing theme borders/surfaces/focus and restrained motion; no large upload cards or standalone CSS. Preserve Sources' existing desktop/tablet/mobile geometry and native scroll/focus behavior. Properties uses the existing SettingSelect for Type (Advertisement, Explanation, Unboxing) only when UGC is selected. Freestyle keeps Project Media and hides UGC Type. Preview summary follows the active type. All interactive controls use pointer cursors with real disabled states and visible keyboard focus.

## Current Studio and Credits presentation refinement (2026-10-20)

Sources Creation Type is a shared Select with one UGC option and a person icon; it is now a dropdown, superseding the earlier fixed checked-control rule. It retains the existing backend category value. Follow shared motion, accessible keyboard/focus, dialog-local portals and theme tokens.

Studio copy is heading/control plus a short description only where useful. Avoid repeated walkthrough paragraphs and technical request IDs. Preserve concise real status/error, local-upload limitations and financial confirmation information. Mobile Stage/Properties use bounded viewport rows separated by a 16px gap; borders remain inside the workspace gutter, Properties header stays fixed and only its body scrolls. Media uses constrained flex/min-height/object containment rather than expanding the page. Sources keeps its single mounted modal/panel. Supplemental preview controls/details belong in the existing Properties presentation target.

Credits uses the existing account-layout frame for two navigation entries: Credits & Billing and Earnings & Payouts. The chosen tab owns its center header and independent scroller. Use /credits and /credits/earnings; Settings no longer lists either. Preserve existing theme, compact navigation, financial components and query-preserving compatibility links.

## Credits layout, Select portal default and sidebar hint refinement (2026-10-20)

Credits & Billing uses its own /credits page with the existing Settings account-layout composition: compact left navigation, fixed heading/supporting description and independent native center scrolling. It no longer appears as a Settings section; do not recreate financial components or state. Both pages share active-route data-workspace-layout=account geometry while retaining distinct view markers.

Collapsed-sidebar hints use 4px trigger spacing, 11px/16px text and compact px-2/py-1 padding, retaining shared popup motion and keyboard/hover semantics. Shared Base UI Select portals must receive undefined for the normal portal default; explicit null means wait for a container and leaves an expanded trigger without options. Preserve real native-dialog containers where needed. The current source fix supersedes the earlier faulty default-container implementation; manual visual review remains pending.

## Shared Select, pointer cursors and fixed Studio type (2026-10-20)

All future app-owned, user-facing ordinary dropdowns use components/ui/select.tsx, built on the installed Base UI Select from the existing shadcn/Base UI foundation. No visible native browser select menus; keep any technically unavoidable dependency/platform exception explicit. Do not replace radios, tabs, segmented controls, accordions or action menus merely because they offer choices.

The supplied Pryzm dropdown screenshots guide geometry only (Approximate): 32px desktop trigger, 28px option rows, 8px surface corners, compact 12px text, small chevron/check, quiet token borders and selected/highlighted backgrounds. Use Sceenyk bg-field/bg-popover, foreground, input/border and muted tokens in both themes. Keep selected-item alignment on desktop, with Base UI's viewport/touch fallback; use 44px targets on coarse pointers. Existing Base UI keyboard/typeahead, Escape/outside dismissal, focus and presence behavior remain authoritative. Shared popup motion uses 220ms and cubic-bezier(0.22, 1, 0.36, 1), subtle fade/translate/scale, and reduced-motion suppression. No new framework or component stylesheet.

The shared Select preserves typed values, grouping, disabled/readiness states, accessible labels and named form inputs; client callbacks retain their existing owners. Portals normally escape scrolling panels; when hosted inside an open native dialog, keep the popup in that dialog's top layer. Do not change persisted enums, option values, saving, payments or generation to style a dropdown.

Genuinely clickable controls use a pointer cursor, including links, buttons, clickable card links, options, tabs, navigation and role-based controls. Disabled controls retain actual disabled behavior and an appropriate disabled cursor/style. A minimal shared base rule in app/globals.css covers native/semantic interaction affordances; use Tailwind cursor-pointer/cursor-not-allowed in shared controls. Do not mark ordinary text or non-clickable containers as actionable.

Studio has one visible Creation Type: UGC (User-Generated Content), a compact checked person-icon control in Sources immediately after Your Project and before Project Media, separated by existing panel dividers. Properties has no Creation Type selector/options. This UI rule is presentation-only: no ugc enum exists in the current project/generation contracts, so preserve the existing WorkspaceEditor category initialization from saved/adopted projects, restored guest briefs or account defaults. The fixed control carries that same category value; never silently rewrite existing categories or invent provider/database values. Stage empty-state metadata uses UGC consistently. This supersedes historical multi-type Studio and native Documentation picker descriptions. Manual review remains required.

## Motion & Interaction Standard (2026-10-20)

This is the default for all future Sceenyk UI, superseding older motion timings in reference/history sections. Respond immediately and finish with a soft ease-out and restrained momentum. Preserve existing branding, layout and theme behavior; motion is progressive enhancement, never a delay before an action.

| Purpose | Approved range | Global token/default |
| --- | --- | --- |
| Micro interaction, hover, icon/button | 150–200ms | --motion-micro: 180ms |
| Dropdown, popover, tooltip, section picker | 180–250ms | --motion-popover: 220ms |
| Modal/backdrop | 220–300ms | --motion-modal: 260ms |
| Sidebar, panel, drawer | 250–350ms | --motion-panel: 300ms |
| Optional major section reveal | 300–500ms | --motion-reveal: 420ms |

Use --motion-ease: cubic-bezier(0.22, 1, 0.36, 1). Existing --duration-fast/normal and --ease-standard alias this scale. Compose Tailwind transition properties, duration-[var(--motion-*)], ease-[var(--motion-ease)], opacity and small translate/scale values. Share Base UI presence classes through components/ui/motion.ts; keep focus trapping, Escape, focus return and the primitive's transition lifecycle. Native Sources uses the reusable motion-native-panel utility for discrete display/top-layer exit; unsupported browsers may dismiss it instantly. This browser-specific CSS belongs only in app/globals.css.

Sidebar width and matching main inset move together for 300ms; keep row heights/icon coordinates fixed, keep labels mounted and fade/slide them rather than remounting navigation. Use small card lifts (2–3px), clipped preview zoom where already present, and quiet background/opacity transitions. Avoid bounce, dramatic scale, blur animation, large glows and incidental reveals everywhere. Avoid abrupt snapping unless a native/platform constraint or responsive mode switch requires it.

Lenis provides ordinary wheel/trackpad inertia (lerp 0.18, no multiplier boost) on public pages and normal workspace/gallery roots. It uses actual DOM scrolling; do not replace scroll containers or infinite-observer roots with transformed content. Touch, keyboard/focus, history and anchors retain native behavior. Documentation article/topics/contents, Settings center/navigation (including its infinite management gallery), Studio Sources/Properties, dialogs and other nested panels remain native and independently contained. Never route nested panels through one global controller. Settings and Documentation mobile selection use the shared Base UI Select with compact popup motion; their independently scrolling content stays native. Clerk-managed overlays retain their provider lifecycle.

Respect live prefers-reduced-motion changes: destroy inertia, remove nonessential transforms/reveals and make transitions instant. Preserve positioning transforms (such as centered dialogs), accessible state, keyboard controls and usability. Lenis alone owns its animation-frame loop; do not add React scroll state or new animation frameworks. Native display/overlay transitions and tiny Lenis compatibility rules are justified shared CSS exceptions; ordinary motion stays Tailwind-first. Manual motion review remains required; source checks do not establish perceived smoothness.

## Styling Policy — Tailwind CSS + global.css

Follow the mandatory [Styling Policy](code-standards.md#styling-policy) for all future frontend work unless the user explicitly instructs otherwise. Sceenyk uses **Tailwind CSS + global.css**, not **Tailwind + scattered component CSS files**. The global stylesheet's existing repository filename is `app/globals.css`; this is one file, not permission to create an additional `global.css`.

Express layout, spacing, sizing, typography, semantic colors, borders/radius, responsive behavior, interaction states, transitions, positioning, overflow, flex/grid and light/dark themes with Tailwind utilities directly in React/Next.js components. Reuse existing theme tokens, spacing, breakpoints, shared React components and component variants. Tailwind 4's CSS-first token definitions do not make hand-written component CSS the default.

Do not create page/component `.css` files, CSS Modules (`*.module.css`, `*.module.scss`) or another styling framework. Do not use inline `<style>` blocks or styled-components unless an existing dependency absolutely requires that mechanism and the requirement is explained.

Reserve the single global stylesheet for genuinely shared tokens/variables, reset/base rules, fonts, reusable scrollbar hiding, shared animation keyframes, browser-specific fixes, third-party overrides or minimal reusable effects/utilities that Tailwind cannot reasonably express. Complex keyframes, browser-specific pseudo-elements and unsupported selectors can qualify; ordinary layout or repeated component classes do not. Explain each necessary exception and why Tailwind alone was insufficient. Prefer a reusable React component over moving ordinary styling into global CSS.

The subsequently authorized full migration is implemented: app/globals.css is the only project-owned stylesheet. Existing class markers remain for DOM/state selectors, but their appearance now comes from static Tailwind utilities on React elements. Historical separate-stylesheet/shared-class examples are implementation history, not permission to recreate those files. Older screenshot geometry and visual evidence remain useful; retain the same visual system. Shared inclusive responsive variants preserve the previous max-width/container boundaries exactly. Runtime template colors, artwork geometry and caption paint remain dynamic; the isolated next/og renderer retains its required inline styles. Manual visual review remains pending.

## Focused Studio refinement and canonical URL (2026-10-18)

The latest request supersedes the earlier edge-to-edge Sources overlay and side-by-side tablet layout. Studio is canonical at /studio; /create permanently redirects with query parameters, while owned /projects/[id] routes and existing handlers remain unchanged. At desktop viewport widths with at least 930px available Studio width, Sources/Stage/Properties use 254px/flexible/252px columns. Otherwise Stage precedes Properties; Sources opens as a 254px right-side nonmodal panel from 768px viewport width, or as a focus-managed modal inset 8px on every edge below 768px. One mounted Sources tree retains inputs and local media. Only the mobile modal locks background scrolling. Cached route deactivation releases the native Sources dialog and its body lock; reactivation resynchronizes its CSS mode without remounting controls. Root scrollbar hiding uses active WorkspaceShell effects, because hidden cached DOM must not affect the public landing page. Toolbar controls are 32px with a centered compact aspect segment/popover for the existing 9:16,16:9,1:1 choices; no invented Share or generation options. Existing completed-video download appears as Export in the toolbar through a presentation-only portal; URLs, fetching and handlers stay with the existing result component. At 320px the selected ratio/menu and icon-only Save/Export preserve space and accessible names. Workspace-only scrollbar hiding preserves scrolling and leaves public landing scrollbars unchanged. Preserve logos, themes, business logic and ownership; no hosted Inngest. Stop after Studio review.


## Pryzm reference implementation — Phase 1: Studio (2026-10-18)

Current authorization: use Pryzm_Design_System_Reference_for_Sceenyk.md as the primary workspace geometry reference, with the supplied screenshots for refinement. Implement Studio and necessary shared navigation/frame geometry only, then stop for user review. Templates/Marketplace, Documentation, Projects/Settings and public pages are later phases; preserve their current presentation and existing work. Keep Sceenyk's official logos, configured font, existing colors/themes/features and all backend/auth/financial/provider contracts. No hosted Inngest, generation, checkout or deployment acceptance.

Geometry decisions: a reusable workspace-only token layer; 252px navigation plus an 8px gutter (preserving the current Studio x260 frame position), 64px collapsed rail with no extra gutter, 254px Sources and 252px Properties. Keep the screenshot-tuned 54px toolbar/header and 52px inspector rows within the reference's estimated ranges. Four-area desktop requires at least 930px available Studio width and a desktop viewport; tablet Sources stays a full-screen overlay. A 752px content breakpoint stacks Stage/Properties on viewports up to 767px. CSS owns Sources' rail/modal mode; the native dialog reads that mode and retains one mounted control tree. Controls and type hierarchy are refined without changing handlers or business state. Actual verification is recorded in progress-tracker.md.

## Strict workspace visual-fidelity pass (2026-10-18)

The current user request supersedes earlier phase stop points and geometry guidance for a UI-only pass across Studio, navigation, Templates, Marketplace, Documentation, Projects and Settings. The supplied Pryzm screenshots are the primary layout reference; retain Sceenyk names, official logos, Inter, purple/blue accents and the existing theme controller. No backend, auth, payments, credits, Marketplace behavior, provider, database or guest-draft changes are authorized. Do not trigger hosted Inngest or perform deployment acceptance.

Reference-derived target geometry (Approximate): 260px desktop navigation, 64px collapsed rail, 8px viewport gutters and panel gaps, 14px outer radius, 1px neutral borders, 54px Studio headers/toolbar and 254px Sources/Properties rails at 1366-1440px. Compact desktop navigation uses 32px rows; touch navigation retains larger targets. Panels scroll independently on desktop; mobile retains hamburger/logo, Stage then Properties, and the same mounted full-screen Sources dialog. Gallery cards use a dense responsive grid with compact metadata; actual configuration covers remain labeled rather than inventing artwork. Documentation uses topics/article/contents at reference desktop widths. Settings retains its existing sections and controls. Workspace-scoped neutral surfaces supersede earlier purple-tinted neutrals; brand/action/focus colors remain unchanged. Local screenshots, responsive themes, overflow, lint, types and build are the acceptance scope. See progress-tracker.md for actual results.

## Studio Phase 3 — implemented (2026-10-18)

Current authorization includes desktop, tablet and mobile Studio. Reuse the shared navigation; Sources owns presentation of project title/origin and existing image/video/audio import/upload/recovery; the Stage owns source/result playback, durable status and scene caption preview; Properties owns category, prompt, duration/style/tone, existing generation quote/confirmation and caption preferences. Aspect ratio and Save move to a fixed 64px toolbar. WorkspaceEditor remains the brief/save/media-selection owner; useProjectMedia and useProjectGeneration retain their existing server calls, guards and state. Caption controls use React portals into Properties while their existing preview component owns state. No new scene editor, voice selector, share engine or export capability is introduced.

The same mounted Sources dialog uses native modal focus/scroll behavior below 1050px available content width; above that it is a nonmodal rail. At 720px available width Stage/Properties sit beside each other; below that Stage precedes Properties. A bounded, schema-validated 30-minute sessionStorage handoff restores only guest brief values through existing Clerk authentication; files remain memory-only and full reload requires reselection. Saved/account-switched private projects never use the guest draft. No auth route, ownership, cache, schema, provider, payment or generation-hook contract changes. Inngest Cloud stays paused. Local and scoped live acceptance is recorded in [the tracker](progress-tracker.md). Deployment is not performed; the next bounded unit is deployment and read-only acceptance of this revision, with Inngest Cloud still paused. Stop after Phase 3.


## Phase 2 page composition (2026-10-18)

Existing palette, theme controller, logos, frame radius and responsive padding remain authoritative. New WorkspacePageHeader centralizes the existing eyebrow, 30/36px heading, body description and action hierarchy for new pages and creator-management consistency. Templates uses existing configuration covers, restrained border-border rounded-2xl cards, gap-6 gallery spacing, text-muted-foreground metadata and text-link actions. No new media assets or theme tokens.

Documentation composition decisions are Inferred from the supplied reference and adjusted for content fit: 12rem topic rail at xl, article max 46rem, optional 10rem contents rail at 2xl, gap-8, sticky top-8, 16px article copy with 32px line height and shared heading scale. Mobile uses the existing field token/control height for topic selection, a single readable article column and the existing workspace hamburger. Anchors have responsive scroll margins and focus rings. These are implementation choices, not Exact reference measurements. All existing source-confidence labels remain intact.


## Workspace presentation application (2026-10-18)

Phase 1 reuses existing light/dark tokens and official full/compact PNG logos. Reference screenshots inform composition only; the following are implementation decisions rather than exact measurements from the references: 240px expanded sidebar, 80px collapsed rail, 1024px desktop threshold, 64px mobile header, 16px content-surface radius, 16/24/32/40px responsive inner padding. Use bg-background around a restrained border-border/bg-card workspace surface; sidebar active/hover and focus use existing sidebar-accent/sidebar-ring tokens. No new palette, glow, gradient or theme controller. Sidebar links/actions have at least 44px targets. Base UI Menu, Tooltip and existing Sheet retain keyboard/focus behavior. Full desktop/mobile Studio panel geometry remains deferred.


## Approved redesign composition, existing identity preserved (2026-10-17)

**Creative studio first. SaaS dashboard second. Redesign implementation: Not Started.** [The approved redesign contract](ui-context.md) controls new page composition/navigation/responsive interactions; PNGs continue to guide Sceenyk identity and component styling. Preserve all existing **Exact / Approximate / Inferred / Needs confirmation** labels below. Historical board navbar/sidebar labels and page geometry are observations, not current information-architecture requirements.

Retain current `:root`/`.dark` tokens, purple/blue/violet/cyan language, semantic foreground/surface pairs, spacing/radius/elevation/type scales, Inter/Geist Mono where practical and the official full/compact light/dark PNG logos through `SceenykLogo`. Keep shared root theme initialization/controller, `sceenyk-theme` persistence, Light/Dark/System, favicon synchronization and storage-failure behavior. No palette, logo, typeface or shadcn-default replacement is approved; token refinement needs a concrete documented implementation reason. Settings → Appearance owns selection, and Credits & Billing owns persistent personal balances; neither returns to global navigation.

Apply output-first hierarchy, generous spacing, fewer unnecessary cards, subtle surface changes, restrained borders/shadows, artwork-led page color and quieter controls. Avoid excessive gradients/glows or generic admin-dashboard styling. Studio retains professional control density; public discovery is spacious. Novelty cannot reduce clarity. Modern creative tools inspire spatial restraint only; use Sceenyk's own typography, icons, components, motion, names and branding.

Desktop Studio uses Navigation | Sources | Stage | Properties with the Stage largest and a compact fixed-height toolbar around 56–64px, never 10%. Tablet progressively collapses panels; mobile is Top Navbar → Stage → Properties with hamburger navigation and a separate full-screen Sources overlay opened from the Stage toolbar. These approved patterns supersede unspecified/old form-first mobile behavior; precise widths/breakpoints remain implementation decisions. Marketplace grids prioritize preview/title/creator/price; Settings retains its existing responsive navigation.

Landing uses layered generated imagery, subtle desktop pointer parallax and a few meaningful stacked scroll stories. Touch/mobile uses a strong static composition; `prefers-reduced-motion` removes nonessential movement. Optimize/lazy-load noncritical media, reserve geometry and prefer performant transforms without excessive JavaScript. Preserve keyboard/visible focus/semantic controls/readable contrast (including over media), accessible overlays/focus return, screen-reader labels and 44px touch targets in both themes. The first unit is **Phase 1 — shared public/workspace shells and navigation architecture**; no animation or application change occurs in this documentation task.

## Approved Settings placement (2026-10-16)

The [Settings UI contract](ui-context.md#approved-settings-ui-2026-10-16) supersedes earlier navbar/header theme-control and general dashboard credit-balance placement. Theme selection moves to Settings → Appearance (Light/Dark/System) through the existing controller; persistent personal AI-credit balances move to Settings → Credits & Billing. Contextual generation costs, insufficient-credit warnings and top-up/payment information remain. Settings uses existing light/dark tokens, cards/fields, accessible section navigation and responsive shell patterns. Reference-image observations below retain their confidence labels; they do not require duplicate Credits/theme controls or a notification system. The Settings placement is implemented; this redesign documentation adds no application UI or new theme implementation.

This is one visual system with light and dark surface treatments. Use the PNGs as the primary visual source; use the semantic tokens in `app/globals.css` to implement it. Switching themes must preserve the same content, component structure, hierarchy, spacing and behavior within the approved layout; the redesign may reorganize composition consistently in both modes.

## Sources, evidence, and repository baseline

Both PNG files in `/designs` were inspected in full, including enlarged palette details:

- [Sceenyk Light Design System.png](../designs/Sceenyk%20Light%20Design%20System.png), 1311 × 1200 pixels.
- [Sceenyk Dark Design System.png](../designs/Sceenyk%20Dark%20Design%20System.png), 1312 × 1199 pixels.

The later approved production branding adds four unchanged transparent PNG assets: [`sceenyk logo lightmode.png`](../designs/sceenyk%20logo%20lightmode.png), [`sceenyk logo darkmode.png`](../designs/sceenyk%20logo%20darkmode.png), [`sceenyk small-logo lightmode.png`](../designs/sceenyk%20small-logo%20lightmode.png), and [`sceenyk small-logo darkmode.png`](../designs/sceenyk%20small-logo%20darkmode.png). The full art is 2172×724; the small art is 341×351 light and 339×370 dark. These files supersede the boards' preview wordmark/star mark for application branding. No separate metadata logo was supplied.

Each board contains the same 21 numbered groups: brand/logo, colors, typography, iconography, buttons, inputs/forms, badges/tags, toggles/checkboxes, slider, desktop navbar, mobile navbar, sidebar, cards, media card, pricing card, alerts/notifications, modals, progress steps, video player, pagination, and empty state. Their positions and content largely match. The boards are component catalogs, not screenshots establishing production page dimensions.

Evidence labels used throughout:

- **Exact**: clearly readable text or labeled values on the boards; image dimensions and repository facts verified locally.
- **Approximate**: visual estimates, sampled pixels, or uncertain labels; not authoritative source tokens.
- **Inferred**: implementation choices consistent with the references, including accessibility and responsive recommendations.
- **Needs confirmation**: information that the PNGs do not resolve.

**Exact repository baseline (updated 2026-10-09):** Next.js 16.4 App Router, Tailwind CSS 4 with `@tailwindcss/turbopack`, shadcn `base-nova`, Base UI primitives, Lucide, and CSS variables enabled in `components.json`. `app/globals.css` is imported by the root layout. Button, Dialog, and Sheet are installed locally. Landing/public shell, local creation, dashboard shell/empty states, and system/saved themes are implemented. Clerk Next.js/UI are installed; supported shadcn appearance uses these same tokens, with field/backdrop/focus/radius/font/action adjustments. Actual Clerk development modals/account overlays passed live, centered, keyboard and responsive theme checks. Appearance elements use safe centering and existing gutters; identity failure UI shares the same tokens. Preserve CSS import order and existing Turbopack configuration.

## Brand style and visual direction

**Exact:** “Modern • Bold • Minimal • Creative • Dark-first • Purple/Blue Accent.” The wordmark reads “Sceenyk,” accompanied by a purple circle containing a white star/spark. The tagline reads “Create the scene you imagine.”

The interface should feel like a creative video studio: bold headings, compact labels, generous whitespace, clear rectangular controls with rounded corners, and restrained neon accents. Purple communicates creation, selection, and primary actions. Blue/cyan communicates media, discovery, and information. Color should emphasize useful hierarchy rather than decorate every surface.

**Historical board interpretation:** the board's preview wordmark used a heavier rounded sans and a star/circle mark. The later official PNGs above are now the exact brand artwork: dark lettering/mark on light backgrounds and white lettering/mark on dark backgrounds, with a compact S-shaped mark for narrow layouts. Preserve the supplied proportions and transparent clear space. **Needs confirmation:** vector source, minimum logo size, and formal exclusion-zone measurements. Do not recreate the full logo with an arbitrary UI font.

## Light and dark themes

| Role | Light appearance | Dark appearance |
| --- | --- | --- |
| Canvas | Clean almost-white, faint cool tint | Near-black with a subtle cool cast |
| Cards | White, soft edge and low shadow | Charcoal/near-black, slightly above the canvas |
| Elevated menus/dialogs | White, clearer shadow | Brighter charcoal, fine cool border |
| Main text | Almost-black | Soft white |
| Supporting text | Cool gray | Pale lavender-gray |
| Controls | Pale gray/lavender fill | Dark charcoal fill |
| Selected areas | Pale lavender with purple text | Deep purple tint with pale lavender text |
| Brand actions | Purple gradient, white label, small shadow | Same purple gradient and white label, controlled glow |
| Borders | Light gray/lavender | Fine slate/lavender outlines |

**Approximate:** board pixels vary across surfaces and glows. For example, a light modal interior at `(1050,980)` is `#FEFEFE`; its dark counterpart is `#0E0E16`. Canvas samples at `(10,600)` are `#FBFDFE` and `#03050A`. These samples support the surface direction; they are not universal component colors.

**Inferred implementation:** default to light through `:root`; put `.dark` on the root `<html>` to switch. Both modes use the same font, sizes, radii, component variants, and purple action ramp. Dark mode increases glow visibility without adding a glow to every panel.

## Color tokens

### Reference palette and ambiguities

| Reference role | Reading | Evidence and use |
| --- | --- | --- |
| Primary purple | `#8B5CF6` | **Exact** readable label on both boards; `--brand-purple` |
| Secondary blue | Approximately `#3B82F6` | **Approximate**: small glyphs resemble `#3882F6`/`#38B2F6`; the blue-gradient label supports the chosen blue family; `--brand-blue` |
| Accent violet | `#A855F7` | **Exact** readable label on both boards; `--brand-violet` |
| Cyan gradient endpoint | Approximately `#06B6D4` | **Approximate** small gradient label; `--brand-cyan` |
| Darkest neutral | Approximately `#080B0F` | **Approximate**: zero/B glyphs are ambiguous; `--neutral-950` |
| Charcoal | `#111118` | **Exact** readable label; `--neutral-900` |
| Raised charcoal | Approximately `#1E1E28` | **Approximate**: dark board supports this reading; the light board appears to say `#E1E2E8`; use a semantic surface instead of assuming those labels are equivalent |
| Border charcoal | `#2A2A37` | **Exact** readable label; `--neutral-700` |
| Mid-neutral label | Appears to read `#BEBEA1` | **Needs confirmation**: the apparent beige hex conflicts with the cool gray swatch; do not use it as the production text color |
| Pale gray | `#E5E7EB` | **Exact** readable label; `--neutral-200` |

The visible swatches and component gradients are not reliably flat fills matching every printed hex. Prefer readable labels where consistent; record uncertain readings rather than silently correcting the artwork. The semantic palette below is the implemented, accessible interpretation.

### Implemented semantic palette

All values in this table are **Inferred implementation choices**, including reference-derived surface assignments. Raw brand values remain available for artwork and decorative accents.

| Token | Light | Dark | Purpose |
| --- | --- | --- | --- |
| `background` | `#FCFCFF` | `#080B0F` | Page canvas |
| `foreground` | `#111118` | `#F5F5FA` | Main text |
| `card` | `#FFFFFF` | `#111118` | Cards, sidebar |
| `card-foreground` | Foreground | Foreground | Card text |
| `popover` | `#FFFFFF` | `#1E1E28` | Menus and dialog surfaces |
| `popover-foreground` | Foreground | Foreground | Elevated text |
| `primary` | `#7C3AED` | `#7C3AED` | Solid primary actions |
| `primary-foreground` | `#FFFFFF` | `#FFFFFF` | Primary labels |
| `primary-hover` | `#6D28D9` | `#6D28D9` | Stronger action hover |
| `primary-end` | `#9333EA` | `#9333EA` | Accessible action-gradient endpoint |
| `link` | `#7C3AED` | `#A78BFA` | Readable purple text links |
| `secondary` | `#EAF2FF` | `#13233D` | Blue-tinted secondary actions |
| `secondary-foreground` | `#1D4ED8` | `#93C5FD` | Secondary labels |
| `muted` | `#F4F4FA` | `#1E1E28` | Quiet surfaces, skeletons, tracks |
| `muted-foreground` | `#646477` | `#B8B8C8` | Supporting text and placeholders |
| `accent` | `#F1EAFF` | `#26183D` | Hover/selected purple tint |
| `accent-foreground` | `#6D28D9` | `#D8B4FE` | Text on accent surfaces |
| `border` | `#E5E7EB` | `#2A2A37` | Decorative dividers and card edges |
| `input` | `#D9D9E6` | `#45455B` | shadcn input **border**, not field fill |
| `field` | `#F8F9FD` | `#14141E` | Opt-in form/upload surface |
| `ring` | `#7C3AED` | `#A78BFA` | Visible keyboard focus |
| `destructive` | `#B91C1C` | `#F87171` | Error text, destructive controls |
| `destructive-foreground` | `#FFFFFF` | `#080B0F` | Labels on solid destructive fills |
| `destructive-surface` | `#FFF1F2` | `#2B121A` | Error alert background |
| `overlay` | Black-cool, 48% | Black, 72% | Proposed dialog backdrop |

Status colors are also centralized:

| Role | Light color / text / surface | Dark color / text / surface |
| --- | --- | --- |
| Success | `#047857` / `#065F46` / `#ECFDF5` | `#34D399` / `#6EE7B7` / `#07271F` |
| Info | `#1D4ED8` / `#1E40AF` / `#EFF6FF` | `#60A5FA` / `#93C5FD` / `#0C203A` |
| Warning | `#B45309` / `#92400E` / `#FFFBEB` | `#FBBF24` / `#FDE68A` / `#2C200B` |

`sidebar-*` aliases the corresponding surface, foreground, primary, accent, border, and ring tokens. `chart-1` through `chart-5` use primary purple, blue, cyan, violet, and success; actual chart series must also use labels/patterns when color alone is insufficient. **Needs confirmation:** chart designs are not pictured.

Use `bg-card text-card-foreground`, `bg-secondary text-secondary-foreground`, and similar paired utilities. Avoid raw `bg-white`, `text-black`, or ad hoc component hex values. `accent` means shadcn's interactive tinted surface; the saturated board “Accent” is separately named `brand-violet`. Similarly, shadcn `secondary` is a usable blue tint, while `brand-blue` is the saturated artwork color.

The raw `#8B5CF6` purple does not provide enough contrast for small white labels. The action ramp is intentionally darker. Decorative borders are subtle; they are not a promise that every control boundary reaches 3:1. Preserve readable labels/fills and use a stronger semantic outline where a boundary is essential to recognize a control. Full component accessibility remains a screen-level validation requirement.

## Gradients

**Exact observation:** purple, blue/cyan, and dark gradients have labeled examples. Purple/blue/cyan also appears in the header ribbon and a button example. **Approximate:** tiny dark-gradient endpoint labels differ from the clearest neutral labels. **Inferred:** angles and stops below; no angles are specified by the PNGs.

| Token / utility | Stops | Use |
| --- | --- | --- |
| `gradient-purple` / `bg-gradient-purple` | 135°, brand purple → violet | Brand art, icon tiles, decorative badges |
| `gradient-blue` / `bg-gradient-blue` | 135°, blue → cyan | Media accents and art |
| `gradient-brand` / `bg-gradient-brand` | 110°, purple → blue at 65% → cyan | Creative banners and decorative highlights |
| `gradient-dark` / `bg-gradient-dark` | 145°, darkest neutral → raised charcoal | Intentionally dark artwork/media surfaces in either theme |
| `gradient-action` / `.sceenyk-action` | 110°, primary → primary-end | White-label primary controls |
| `gradient-action-hover` | 110°, primary-hover → primary | Stronger hover without reducing contrast |
| `gradient-surface` / `.sceenyk-feature-card` | 135°, card → accent | Gentle themed card tint |

Do not place small white text directly on the cyan end of a decorative ramp. Use an accessible text backing or the action ramp. Do not automatically darken all gradients when switching themes; change surrounding surfaces and glow strength.

## Typography

**Exact:** the board specifies “General Sans (or similar, e.g. Inter/Satoshi).” Inter is the implemented alternative, loaded through `next/font/google` with `--font-inter`. Geist Mono remains for existing code text. `font-sans` and `font-heading` share Inter; the former self-referencing `--font-sans` mapping has been corrected.

| Board style | Size / line height | Weight | Tailwind utility |
| --- | --- | --- | --- |
| Display XL | 72 / 80 px | Bold, 700 | `text-display-xl font-bold` |
| Display L | 56 / 64 px | Bold, 700 | `text-display-lg font-bold` |
| Heading 1 | 40 / 48 px | Bold, 700 | `text-heading-1 font-bold` |
| Heading 2 | 32 / 40 px | Bold, 700 | `text-heading-2 font-bold` |
| Heading 3 | 24 / 32 px | Semibold, 600 | `text-heading-3 font-semibold` |
| Body Large | 18 / 28 px | Medium, 500 | `text-body-lg font-medium` |
| Body | 16 / 24 px | Regular, 400 | `text-body` |
| Body Small | 14 / 20 px | Regular, 400 | `text-body-sm` |
| Caption | 12 / 16 px | Medium, 500 | `text-caption font-medium` |

These labeled sizes and weight names are **Exact**; numeric weight mapping is **Inferred**. Use the same hierarchy in both themes. Body defaults to 16/24. Give labels and button text medium weight. **Inferred:** slightly tight heading tracking (`tracking-tight`), regular body tracking, and smaller display sizes on mobile. Example: `text-heading-1 md:text-display-lg font-bold tracking-tight`. No global heading rule forces sizes onto existing pages.

## Spacing, radius, borders, shadows, and motion

**Approximate:** the boards show compact internal gaps, more generous card padding, softly rounded rectangular controls, and pill badges. Measurements cannot be equated to production pixels because the components are compressed into a catalog.

**Inferred implemented scale:** spacing 4, 8, 12, 16, 24, 32, 48, and 64 px (`--space-1/2/3/4/6/8/12/16`), matching Tailwind's default 4 px spacing unit. Prefer 8 px icon-label gaps, 16–24 px card padding, 24–32 px section gaps, and 16–32 px page gutters. `.sceenyk-container` caps width at 1280 px with a fluid `clamp(16px, 3vw, 32px)` gutter.

`--radius` is 12 px. The shared `rounded-*` scale is sm 6, md 8, lg 12, xl 16, 2xl 24, 3xl 32, and 4xl 48 px. Cards default to 16 px; buttons default to 12 px; fields use 8 px; larger dialogs may use 16–24 px; tags and circular controls use `rounded-full`.

Borders are normally 1 px with `border-border`; inputs use `border-input`. Purple borders identify focus, highlighted pricing, and upload targets. Avoid thick saturated borders on every surface.

| Effect token | Light | Dark |
| --- | --- | --- |
| `elevation-card` / `shadow-card` | 2/8 and 8/24 px layered shadows, 4%/3% dark opacity | 4/16 px shadow, 20% black |
| `elevation-popover` / `shadow-popover` | 12/40 px, 12% dark | 16/48 px, 48% black |
| `glow-primary` / `shadow-glow` | 4/16 px, 18% brand purple | Centered 16 px blur, 22% brand purple |
| `glow-primary-hover` | 6/22 px, 26% purple | Centered 24 px blur, 32% purple |
| `focus-shadow` | 3 px translucent ring | Same geometry, brighter theme ring |

**Inferred:** transition durations 150 ms for feedback, 200 ms for larger changes; `--ease-standard` is available for future transitions. Current shared styles disable transitions under reduced motion, including button active translation. Future spinners, progress animations, and skeletons must also respect reduced motion.

## Icons

**Exact:** “Using Lucide Icons (or similar) with custom purple accent style.” Use the installed Lucide library, with consistent outlined geometry, rounded joins/caps, and `currentColor`. **Inferred:** 16 px inside ordinary buttons, 20–24 px for navigation, larger 24–32 px artwork in 40–48 px rounded icon tiles; use consistent approximately 2 px strokes.

Light icons are dark or semantic purple/blue; dark icons are pale or semantic lavender/cyan. Filled gradients belong behind feature icons, not on every outline. Decorative icons use `aria-hidden`; standalone icon buttons need an accessible name. The white play triangle is a media-specific exception to the outline language.

## Buttons and button states

**Exact observation:** primary “Generate,” secondary “Create Project,” outline “Learn More,” ghost “Cancel,” icon buttons, spinner/“Generating...” loading examples, and muted disabled examples. The reference also shows a purple/blue gradient treatment and neutral filled alternatives.

| Variant | Light | Dark |
| --- | --- | --- |
| Primary | Purple action gradient, white medium label, subtle purple shadow | Same ramp and white label, localized purple glow |
| Secondary | Pale blue surface and blue label | Deep blue surface and pale blue label |
| Outline | Card fill, input border, dark label; lavender hover | Dark card fill, visible input border, light label; deep purple hover |
| Ghost | Transparent with ordinary text; lavender hover | Transparent with pale text; deep purple hover |
| Destructive | Soft red tint and dark red text | Dark red tint and light red text |
| Link | Semantic purple, underline on hover | Semantic lavender, underline on hover |

**Inferred implemented sizes:** default 44 px tall, small 36, extra-small 28, large 48; icon sizes match. Compact sizes are for dense desktop contexts; increase touch targets on mobile. Primary behavior remains in the existing Base UI `Button` primitive. No DOM structure or event handling was rewritten.

Hover strengthens the primary ramp/glow on hover-capable devices. Active uses the existing 1 px translation except popup triggers and reduced-motion users. Focus keeps shadcn's visible border and ring, with an additional opt-in shared outline on the action treatment. Disabled keeps opacity 50% and the primitive's disabled behavior. Loading should retain button width, show a spinner plus meaningful text, use `aria-busy`, and prevent duplicate submission through the component/application logic. A style class alone does not enforce busy or disabled behavior.

## Inputs, textareas, selects, and upload areas

**Exact observation:** default and purple-focused inputs, search input with leading icon, multiline prompt textarea, select with trailing chevron, and dashed purple upload zone.

Light mode uses very pale fields, cool borders, dark entered text, and gray placeholders. Dark mode uses charcoal fields, slate borders, pale text, and lavender-gray placeholders. Use `.sceenyk-field` as an opt-in shared treatment or compose `bg-field border-input text-foreground placeholder:text-muted-foreground` with the normal shadcn input primitive. It provides full width, minimum 44 px height, 12/16 px padding, and an 8 px radius; textareas should grow vertically and keep resizing where appropriate.

The focus state uses `ring` and a visible 2 px outline; invalid fields use `destructive`, including the focus outline. Provide associated labels and errors; placeholders are not labels. Prefix icons align with text and reserve padding. Select menus use `popover` colors and keep the primitive's keyboard navigation; do not replace a select with an unlabelled clickable div.

`.sceenyk-upload` supplies a centered icon/text group, 24 px padding, dashed border, field surface, hover tint, and focus-within ring. `[data-dragging="true"]` shows the active tint. **Inferred behavior:** include a real labelled file input or keyboard-operable browse button; drag/drop must have an equivalent browse action. `[aria-disabled="true"]` only changes appearance; code must disable the input and reject drop actions. **Needs confirmation:** limits, accepted file types, upload progress, validation, and retry behavior.

## Cards and feature tiles

**Exact observation:** Create with AI, Transform Video, Explore Templates, and Marketplace feature tiles with rounded icon tiles, title/supporting copy, and a small circular purple arrow action.

Use `.sceenyk-card` for plain cards: a 1 px border, 16 px radius, semantic card text, and soft theme shadow. `.sceenyk-feature-card` adds the gentle themed gradient. Light mode reads as white with a lavender edge/tint; dark mode reads as charcoal with a deep purple edge/tint. Keep the icon, title, and supporting text hierarchy identical.

Interactive cards may add `.sceenyk-interactive` for purple border/glow on hover and visible focus. It does not make a div interactive; use a link or button when the entire tile activates. Static cards must not imply clickability. **Inferred:** grid layout with 16–24 px gaps and 16–24 px padding; collapse to fewer columns when content requires it.

## Navigation, sidebar, and tabs

**Historical reference observations:** Exact below describes what the boards show, not approved destinations. Use the 2026-10-17 redesign contract for Studio naming, signed-in/out navbar, workspace groups, hamburger navigation and full-screen mobile Sources. Credits/theme stay in Settings; Subscriptions is outside current scope. Retain tokens and accessible active/focus treatments, not obsolete labels/dimensions.

**Exact desktop navbar:** logo on the left; Home, Create, Templates, Marketplace, Pricing; search with shortcut hint; notification bell; circular avatar, name, and dropdown chevron. The active route uses purple text and an underline. Light surface is white with a fine border; dark surface is near-black with a faint purple tint and border.

**Exact mobile navbar:** logo, search icon, avatar; the desktop text links and expanded search are absent. **Inferred:** expose those destinations through accessible navigation at narrow widths, preserve account/search actions, and use 44 px hit areas. The board does not specify a hamburger, bottom navigation, sticky behavior, or exact collapse breakpoint.

**Exact sidebar:** logo and collapse chevron above icon/text rows: Dashboard, Create, My Projects, Templates, Marketplace, Subscriptions, Credits, Settings. The active Dashboard row is rounded lavender in light mode and deep purple in dark mode; other icons and labels are neutral. Use `sidebar-*` tokens and `aria-current="page"`. **Inferred:** an approximately 240 px desktop sidebar, an icon rail or dismissible drawer on smaller screens, and predictable label tooltips in collapsed mode. **Needs confirmation:** shell dimensions and collapse behavior.

**Inferred tabs:** there is no separate tabs example. Follow the navbar's active underline for page-like tabs, or tinted segmented surfaces for local mode choices. Use purple/dark lavender emphasis for the active tab, neutral inactive labels, and semantic focus rings in both themes. Implement with the accessible shadcn/Base UI tabs primitive so arrows, focus, and panel associations work; route links remain links.

## Badges and tags

**Exact observation:** New (purple), Popular (blue/cyan), Pro (neutral), Free (cyan/teal), Coming Soon (muted); Video, Image, Audio, Template; and Cinematic, Anime, Comedy, Ad, Social, Story tags.

Status badges are compact pills; category/style tags are gently rounded rectangular chips with fine borders. Light mode uses soft neutral surfaces plus colored accents; dark mode uses charcoal surfaces and lighter outlines/text. Use saturated fills only with a contrast-checked foreground; “Free” has dark text over cyan. Purple/blue glow belongs on a small featured badge, not every tag. **Inferred:** caption-size labels and 4/8 px padding. Interactive filter chips need pressed/selected semantics, keyboard focus, and a larger hit area than static labels.

## Toggles, checkboxes, and sliders

**Exact toggles:** pill track with circular thumb; gray/off and purple/on. **Exact checkboxes:** empty outlined square, purple square with white check, and a muted minus/indeterminate sample. Both modes preserve the same shape and layout. Light off-tracks are cool gray; dark off-tracks are charcoal. Use the existing primitive's checked/indeterminate attributes; do not restyle away the checked indicator or focus ring.

**Exact slider:** thin neutral track, purple filled segment, white circular thumb with purple rim/glow, and endpoints “10s”/“60s.” Dark mode changes the unfilled track, keeping the thumb visible. **Inferred:** `bg-primary` filled track, `bg-muted` remaining track, `border-ring bg-card` thumb, visible focus ring, and a larger invisible pointer hit area. Give the slider a label and meaningful value text, preserve arrow-key support, and ensure the value is not communicated only by color.

## Alerts and notifications

**Exact observation:** compact success, info, warning, and error banners with a colored status icon, title, supporting sentence, and trailing close icon. Light uses pale green/blue/amber/red; dark uses deep tinted surfaces with brighter icons and text.

Use the relevant `*-surface` with `*-foreground`, an approximately 1 px color-tinted border, and an 8–12 px radius. Destructive alerts pair `destructive-surface` with `destructive`. Keep the message readable before decoration; do not announce every informational banner urgently. **Inferred:** use polite status announcements for asynchronous progress, alert semantics for critical immediate errors, and a labelled close button. Toast placement and duration are **Needs confirmation**.

## Modals

**Exact observation:** a “Confirm Purchase” dialog with centered purple star tile, title, supporting purchase copy, top-right close icon, and Cancel/Pay actions. Light is white with soft border/shadow; dark is charcoal with fine border and purple action glow.

Use `bg-popover text-popover-foreground border-border shadow-popover`, 16–24 px radius, and 24 px padding. Primary action uses the purple action ramp; cancellation uses outline/neutral. **Inferred:** a themed `overlay` backdrop, viewport-safe width, scrolling content on small screens, and stacked actions where needed. Use the dialog primitive to retain focus trapping, Escape dismissal, initial focus, title/description association, and focus return. **Needs confirmation:** backdrop opacity is a proposed token; the boards do not show a full-page overlay or checkout behavior.

## Pricing cards

**Product contract approved 2026-10-13:** the Free/Creator/Pro cards and Subscriptions sidebar label in this document are historical reference-image observations, not current billing or navigation requirements. Sceenyk uses pay-as-you-go credit packs and manual top-ups; monthly subscriptions/allocations are outside current scope. Preserve these visual observations and their confidence labels, but use the approved contract in [overview.md](overview.md#approved-commercial-model--pay-as-you-go-2026-10-13) for product decisions. No application artwork, styling or UI is changed in this documentation task.

**Exact observation:** three cards (Free, Creator, Pro), plan/features above a bold price, action at the bottom. Creator has a purple outline and floating “MOST POPULAR” pill. Paid actions are purple; Free has an outline treatment.

Light mode uses white surfaces and faint lavender on the featured tier. Dark uses dark surfaces with a restrained purple wash/glow on the featured tier. Use a common card height, aligned price/actions, 16–24 px padding, and a stronger semantic purple border for the featured plan. Avoid glow clipping around the floating badge. **Inferred:** three columns on wide screens and one column on mobile. Pricing copy in the image is illustrative and is **not** product billing configuration.

## Media/video cards and player

**Exact media card:** rounded landscape thumbnail, blue “PRO” badge at upper-right, duration chip at lower-right, title (“Neon Cinematic”), creator attribution, and a cart action. Light surrounding surface is white; dark is near-black. Use semantic card text and a neutral dark backing behind thumbnail overlays in either theme. Preserve image color across theme changes. **Inferred:** a stable landscape aspect ratio, approximately 16:9, with `object-cover`; use separate accessible controls for preview and purchase, avoid nested interactive elements, and provide useful thumbnail alternative text.

**Exact player:** play control, purple seek fill, elapsed/total time, volume, settings, and fullscreen controls over a video/neutral control strip. A player may keep a dark control backing in both themes when needed for footage contrast; the surrounding card follows the theme. **Inferred:** responsive aspect ratio, visible focus, labelled controls, keyboard seeking, captions, and a touch-friendly control bar. The mock's timeline and action icons do not establish a playback implementation or codec requirements.

## Progress steps, pagination, and empty states

**Exact progress:** Upload → Analyze → Generate → Render → Complete. Completed steps use purple circles with checks; Generate is a purple numbered current step; upcoming steps are neutral numbered circles. Connecting segments change from purple to neutral. Light uses dark supporting labels; dark uses pale labels. **Inferred:** use an ordered list and `aria-current="step"`; pair visual status with text. On narrow screens wrap or use a vertical list instead of forcing tiny text. Do not infer actual job completion from a visual animation.

**Exact pagination:** previous chevron, selected 1 in purple, neutral 2/3, ellipsis, and last page 10. Light neutral cells are pale gray; dark cells are charcoal. Selected page uses an accessible primary fill/white label; keyboard focus remains distinct from selection. **Inferred:** use a labelled pagination navigation, `aria-current="page"`, explicit labels for previous/next, and disabled boundaries. Show fewer neighbors on narrow screens.

**Exact empty state:** purple outlined illustration in a tinted tile, “No projects yet,” supporting copy, and “Create your first video.” Light uses lavender/white; dark uses deep purple/near-black with pale text. Keep the state friendly, concise, and focused on one useful action. **Inferred:** center or align it within the relevant content region, give it generous padding, and use real text outside the illustration. Error and no-results states need their own actionable copy; they are not interchangeable with the pictured first-use state.

## Shared states and responsiveness

| State | Light treatment | Dark treatment | Behavior |
| --- | --- | --- | --- |
| Hover | Stronger purple action or soft lavender tint | Controlled brighter glow or deep-purple tint | Only actionable elements signal clickability |
| Focus | Purple outline/ring with separation | Brighter lavender outline/ring | Visible on keyboard navigation; never remove without replacement |
| Active/selected | Primary fill, lavender panel, or purple underline | Same action fill, deep purple panel, lavender text | Preserve checked/current/expanded semantics |
| Disabled | Lower opacity and neutral treatment | Same opacity, muted dark treatment | Disable at the primitive/event layer, not just CSS |
| Loading | Spinner/text; pale muted skeleton surfaces | Spinner/text; charcoal skeleton surfaces | Reserve dimensions, expose busy/status text, respect reduced motion |
| Invalid | Red border, error message and icon | Light red border/text over dark red tint | Associate message with field; color is not the only signal |

Loading spinners are pictured; skeletons are **Inferred**. There is no complete hover-state matrix or skeleton specification in the PNGs. A glow must never be the sole focus indicator. Focus/active styles stay distinguishable in both themes.

**Exact:** desktop and mobile navigation examples. **Inferred:** use mobile-first flexible layouts, `min-w-0` for shrinking flex/grid content, wrapped labels, full-width fields, responsive media, and fluid page gutters. Keep controls and dialogs inside the viewport. Start from Tailwind's existing breakpoints (sm 640, md 768, lg 1024, xl 1280 px) and collapse based on actual content fit. These are implementation defaults, not source-labeled Sceenyk breakpoints. Preserve accessible hit areas and typography before maximizing column count; avoid page-level horizontal overflow at 320–390 px and at zoom. Light and dark use identical breakpoints.

## shadcn alignment and theme usage

`components.json` already points to `app/globals.css` with `cssVariables: true`. Keep `base-nova`, Base UI, Lucide, aliases, and shadcn's Tailwind import. The generator's `baseColor: neutral` is scaffold metadata, not the runtime palette; runtime styling comes from the customized semantic variables. Do not rerun theme initialization over this stylesheet.

All standard shadcn colors, sidebar/chart colors, radii, and font aliases are retained and mapped through Tailwind 4's `@theme inline`. This means generated components using `bg-card`, `text-muted-foreground`, `border-input`, `ring-ring`, etc. inherit the shared theme. The existing Button's variants/sizes were adjusted, retaining its Base UI primitive, props, accessibility hooks, invalid state, popup exception, and disabled behavior. New component installation still needs review for hardcoded dark utilities and density; token support does not mean uninstalled components have already been implemented or tested.

Theme switching is CSS-ready:

```tsx
// Root document with light tokens (default):
<html lang="en" className="...font variables...">

// Root document with dark tokens and dark: utilities:
<html lang="en" className="...font variables... dark">
```

The implemented controller adds/removes `dark` on `document.documentElement`, preserving font/layout classes. `color-scheme` follows the selected theme. The HTML and static inline head script default to Dark before first paint. Saved `sceenyk-theme` light/dark choices are retained; explicit system is persisted separately and follows OS changes. Missing/invalid preferences default to Dark, including blocked-storage initialization. Settings → Appearance already implements Light/Dark/System through this controller; no global toggle is added. Cross-tab changes, favicon synchronization and in-page blocked-storage choices remain supported. Blocked storage must not prevent in-page switching. Keep the theme root on the document so portals resolve the same tokens.

Tailwind-first composition example (reuse an existing React field/card component when available):

```tsx
<section className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
  <article className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-card">
    <h2 className="text-xl font-semibold">Project details</h2>
    <p className="text-sm text-muted-foreground">Describe your scene.</p>
    <label htmlFor="scene">Scene</label>
    <textarea id="scene" className="mt-3 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
  </article>
</section>
// <Button>Generate</Button> uses the shared action treatment automatically.
```

Markers such as `.sceenyk-feature-card`, `.sceenyk-interactive`, `.sceenyk-upload` and `.sceenyk-action` no longer define global component CSS; their existing React consumers carry Tailwind classes. Reuse React components/variants rather than adding global component rules. Shared theme utilities such as `shadow-card`, `shadow-popover`, `shadow-glow`, `bg-gradient-brand`, `bg-gradient-purple`, `bg-gradient-blue` and `bg-gradient-dark` remain available. The component-layer Tailwind variant keeps former shared defaults below caller utilities; repeated-selector variants retain the specificity of former contextual overrides without changing component/state structure.

## Implementation boundaries and remaining decisions

Implemented: shared tokens/type/spacing/radii/effects, Inter, Button/Dialog/Sheet, landing/public/dashboard shells, themes, EmptyState and creation controls. Draft persistence adds explicit title/save states, a shared private reopen workspace and metadata-only project cards in source. Hosted migration acceptance is pending in the tracker. No palette change or generated thumbnail/result was introduced.

**Inferred public-page composition (2026-10-09):** sticky 80px navigation, links collapsing below 1024px into an accessible disclosure, a split scene-board hero, six static category cards, three explanatory steps, connected-production value section, three concept-media cards, free/paid pricing preview, and final CTA. Section spacing scales from 48px to 96px; desktop hero uses the existing 56px type token and mobile uses 40px. Local artwork is original vector illustration with purple/blue/cyan and existing dark neutral variables. It is labeled concept artwork and has no fake playback or generation state. The old star/circle favicon and text wordmark were preview branding and are superseded by the official PNGs above. Added `neutral-950` is only a Tailwind alias of the existing neutral variable; no palette values changed.

**Inferred creation composition (2026-10-09):** the boards guide component styling, not a complete workspace wireframe. `/create` uses a 1.5:1 inputs/preview grid at 1024px and above; cards have 20–24px padding and 24–32px gaps. Single-choice category tiles use semantic purple selection/focus, with native radios for keyboard behavior. Prompt/settings reuse field tokens; the local dropzone reuses upload tokens. Output remains empty and source media has a separate labeled card. Browser-native video/audio controls apply only to selected local media, never concept art or generated output. All colors/effects reuse existing tokens; no new palette or production option contract was introduced. Both themes were checked at 1440/1024/768/390/320px, including long filenames at 320px.

**Inferred dashboard composition (2026-10-09):** 240px desktop sidebar uses `sidebar-*` with purple-tinted current Home; the same items move to a left Sheet below 1024px. The Sheet uses existing overlay/shadow tokens, dynamic viewport height, a maximum 320px width with mobile gutter, 44px close action, scrolling, and reduced-motion handling. Main content uses shared page gutters and 32–40px vertical spacing. A single restrained feature-card tint and existing concept illustration anchor Quick Create; summary cards use supporting blue, and the three shared empty states use lavender icon tiles. Counts are labeled preview defaults, not account data; credits show an unavailable balance. These dimensions are implementation choices, not exact PNG measurements. No palette changes or billing capabilities were introduced.

**Inferred owned-draft composition (2026-10-09):** title and Save draft use existing field/button/card/status tokens. Saving disables the actual control; confirmed/unsaved/error feedback is polite and visible. Local media receives the existing warning surface. Private reopening reuses the same studio with a projects back link. Dashboard project cards use category icons, title, draft badge, saved settings and updated date, with no fake artwork. Eight-item pagination uses real route links. Layout and color tokens stay shared across themes. Live saved-record verification remains pending the migration.

Still to implement or confirm:

- Production vector source and any licensed General Sans font assets; the supplied PNGs are the current official logo, and Inter remains the authorized board alternative for UI text.
- Ambiguous blue/neutral/dark-gradient source labels; a vector design source could settle exact values.
- Owned draft screens/data source is implemented; hosted migration acceptance is pending. Generation results and remaining controls remain future units.
- Exact tab pattern, panel widths and breakpoints through content/viewport review. Mobile hamburger navigation, Stage + Properties, full-screen Sources/Close/state return and 44px touch targets are approved; implementation/acceptance remains Not Started.
- Busy/upload/progress/error behavior, payment and media integration, and accessible player controls; PNG examples do not establish those systems.
- Screen-level keyboard, screen-reader, contrast, zoom, and responsive verification when the real components are built.

Treat these as explicit open decisions, not completed functionality. Extend the tokens and shared variants when needed; do not duplicate a second palette inside individual pages.

## Validation performed

- ESLint, `tsc --noEmit`, and the Next.js production build passed. The build reports an unrelated parent-directory lockfile warning; project configuration was preserved.
- The stylesheet compiled with the installed Tailwind compiler and parsed with Lightning CSS.
- An isolated headless Chrome fixture rendered the actual Button's server-generated markup and shared card/field/upload styles. Both themes passed at emulated 1280, 390, and 320 px viewports without horizontal overflow. Button/field focus styling, disabled appearance, and reduced-motion transition suppression were checked.
- Fourteen semantic foreground/background pairs per theme exceeded 4.5:1; the lowest tested ratio was 5.28:1. White action labels measured 5.70:1 and 5.38:1 against the two gradient endpoints. These checks do not cover text over arbitrary media or future component compositions.
- Whitespace checks covered all six task files, including untracked files. The pre-existing `.gitignore` change was preserved.

The browser fixture verifies this foundation's styles, not hydrated application workflows or complete keyboard/screen-reader behavior for the uninstalled reference components.
