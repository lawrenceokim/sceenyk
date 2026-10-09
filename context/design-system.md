# Sceenyk design system

This is one visual system with light and dark surface treatments. Use the PNGs as the primary visual source; use the semantic tokens in `app/globals.css` to implement it. Theme changes must preserve component structure, hierarchy, spacing, and behavior.

## Sources, evidence, and repository baseline

Both PNG files in `/designs` were inspected in full, including enlarged palette details:

- [Sceenyk Light Design System.png](../designs/Sceenyk%20Light%20Design%20System.png), 1311 × 1200 pixels.
- [Sceenyk Dark Design System.png](../designs/Sceenyk%20Dark%20Design%20System.png), 1312 × 1199 pixels.

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

**Approximate:** the large wordmark uses a heavier rounded sans than body text. The boards show black text on white, white text on purple, and white text on near-black. Preserve the star/circle relationship and clear space around the mark. **Needs confirmation:** production vector logo, exact wordmark font, minimum logo size, and exclusion-zone measurements. Do not recreate the full logo with an arbitrary UI font and call it final artwork.

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

The implemented controller adds/removes `dark` on `document.documentElement`, preserving font/layout classes. `color-scheme` follows the selected theme. A static inline head script uses saved `sceenyk-theme` or system preference before first paint, following the installed Next.js guide. The toggle persists explicit light/dark choices; the controller follows system changes when no choice is saved and synchronizes browser tabs. Blocked storage does not prevent in-page switching. Keep the theme root on the document so portals resolve the same tokens.

Shared compositions available now:

```tsx
<section className="sceenyk-container">
  <article className="sceenyk-card p-6">
    <h2 className="text-heading-3 font-semibold">Project details</h2>
    <p className="text-body-sm text-muted-foreground">Describe your scene.</p>
    <label htmlFor="scene">Scene</label>
    <textarea id="scene" className="sceenyk-field mt-3" />
  </article>
</section>
// <Button>Generate</Button> uses the shared action treatment automatically.
```

Other shared classes/utilities: `.sceenyk-feature-card`, `.sceenyk-interactive`, `.sceenyk-upload`, `.sceenyk-action`, `shadow-card`, `shadow-popover`, `shadow-glow`, `bg-gradient-brand`, `bg-gradient-purple`, `bg-gradient-blue`, and `bg-gradient-dark`. Shared CSS is layered beneath utilities so local composition can override it without specificity fights.

## Implementation boundaries and remaining decisions

Implemented: shared tokens/type/spacing/radii/effects, Inter, Button/Dialog/Sheet, landing/public/dashboard shells, themes, EmptyState and creation controls. Draft persistence adds explicit title/save states, a shared private reopen workspace and metadata-only project cards in source. Hosted migration acceptance is pending in the tracker. No palette change or generated thumbnail/result was introduced.

**Inferred public-page composition (2026-10-09):** sticky 80px navigation, links collapsing below 1024px into an accessible disclosure, a split scene-board hero, six static category cards, three explanatory steps, connected-production value section, three concept-media cards, free/paid pricing preview, and final CTA. Section spacing scales from 48px to 96px; desktop hero uses the existing 56px type token and mobile uses 40px. Local artwork is original vector illustration with purple/blue/cyan and existing dark neutral variables. It is labeled concept artwork and has no fake playback or generation state. The exported star/circle favicon uses fixed equivalents of the primary/white tokens because an external SVG cannot inherit page CSS variables. The wordmark and mark are preview branding, not final approved production artwork. Added `neutral-950` is only a Tailwind alias of the existing neutral variable; no palette values changed.

**Inferred creation composition (2026-10-09):** the boards guide component styling, not a complete workspace wireframe. `/create` uses a 1.5:1 inputs/preview grid at 1024px and above; cards have 20–24px padding and 24–32px gaps. Single-choice category tiles use semantic purple selection/focus, with native radios for keyboard behavior. Prompt/settings reuse field tokens; the local dropzone reuses upload tokens. Output remains empty and source media has a separate labeled card. Browser-native video/audio controls apply only to selected local media, never concept art or generated output. All colors/effects reuse existing tokens; no new palette or production option contract was introduced. Both themes were checked at 1440/1024/768/390/320px, including long filenames at 320px.

**Inferred dashboard composition (2026-10-09):** 240px desktop sidebar uses `sidebar-*` with purple-tinted current Home; the same items move to a left Sheet below 1024px. The Sheet uses existing overlay/shadow tokens, dynamic viewport height, a maximum 320px width with mobile gutter, 44px close action, scrolling, and reduced-motion handling. Main content uses shared page gutters and 32–40px vertical spacing. A single restrained feature-card tint and existing concept illustration anchor Quick Create; summary cards use supporting blue, and the three shared empty states use lavender icon tiles. Counts are labeled preview defaults, not account data; credits show an unavailable balance. These dimensions are implementation choices, not exact PNG measurements. No palette changes or billing capabilities were introduced.

**Inferred owned-draft composition (2026-10-09):** title and Save draft use existing field/button/card/status tokens. Saving disables the actual control; confirmed/unsaved/error feedback is polite and visible. Local media receives the existing warning surface. Private reopening reuses the same studio with a projects back link. Dashboard project cards use category icons, title, draft badge, saved settings and updated date, with no fake artwork. Eight-item pagination uses real route links. Layout and color tokens stay shared across themes. Live saved-record verification remains pending the migration.

Still to implement or confirm:

- Production vector logo and any licensed General Sans font assets; Inter is the authorized board alternative currently used.
- Ambiguous blue/neutral/dark-gradient source labels; a vector design source could settle exact values.
- Owned draft screens/data source is implemented; hosted migration acceptance is pending. Generation results and remaining controls remain future units.
- Final tab pattern, sidebar dimensions, mobile navigation, touch sizing, overlay behavior, and page breakpoints through real content/viewport review.
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
