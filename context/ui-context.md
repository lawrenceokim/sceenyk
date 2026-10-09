# UI Context

Quick reference for building Sceenyk UI. Use [design-system.md](design-system.md) for detailed component/evidence guidance and [overview.md](overview.md) for product scope. The light and dark PNGs in [`/designs`](../designs/) are the visual references; [`app/globals.css`](../app/globals.css) owns the implemented tokens. Values below describe current CSS, not new palette proposals.

## Theme

Sceenyk supports light and dark styling with a modern, bold, minimal, creative, premium AI/video-production feel. Purple leads; blue/cyan supports it. Use purple/blue gradients selectively, strong typography, subtle borders, soft shadows, and controlled glow around meaningful actions.

Light mode uses clean white/light surfaces. Dark mode uses layered near-black surfaces with brighter text and localized purple glow. Both themes share geometry, spacing, hierarchy, and behavior: they must feel like the same product.

Light is the `:root` fallback. The public UI follows system preference until the user toggles light/dark, then persists that explicit choice in `localStorage` under `sceenyk-theme`. Apply `.dark` on `<html>` before first paint, preserving font classes. Follow system changes when there is no saved choice and synchronize changes across tabs. Storage restrictions must not prevent the toggle from working. Reuse `shadow-card`, `shadow-popover`, and `shadow-glow` instead of introducing independent effects.

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

The landing page, local `/create` preview, and server-protected `/dashboard` shell implement these patterns. Real project screens/data remain unimplemented. Clerk modal/account integration exists in source; development configuration and live verification are pending. Public navigation collapses below 1024px into a disclosure with Escape dismissal; navigation links close it. Signed-out controls show Sign In/Get Started, signed-in controls show Dashboard/Create/UserButton, and loading displays neutral placeholders. Get Started opens registration; creation CTAs retain `/create`. Mobile auth triggers stay visible for modal focus return. Missing configuration shows an honest account-unavailable notice. Clerk's supported shadcn appearance uses shared tokens in both themes. Concept artwork is illustrative and has no fake video playback or generation progress.

- **Public pages:** top navigation with responsive mobile navigation; keep public exploration available without authentication.
- **App workspace:** persistent sidebar on desktop and an accessible mobile drawer on smaller screens. Use sidebar tokens and clearly mark the active destination.
- **Implemented dashboard shell:** 240px fixed sidebar at 1024px and above; below that, a labeled left Sheet with focus trapping, Escape/close dismissal, focus return, and link dismissal. Header exposes Create/theme plus the mobile Clerk UserButton outside the drawer. Desktop sidebar shows the official account button; mobile drawer shows a noninteractive official avatar. User information comes from Clerk with safe name fallbacks; live account checks remain pending. Home has `aria-current="page"`; Projects/Templates/Credits reach real dashboard section anchors; Marketplace/Settings are noninteractive Soon entries. Shared EmptyState supports icon/title/description and optional primary/secondary actions. Empty counts are explicitly preview values and credits remain unavailable. Public and dashboard layouts share the root theme; each owns its main/skip link, using distinct target IDs to tolerate cached route DOM.
- **Main content:** centered, responsive regions with intentional maximum widths. `.sceenyk-container` uses `--content-width: 80rem` (1280px) and `--page-gutter: clamp(1rem, 3vw, 2rem)`; use narrower regions for focused forms.
- **Creation:** choose a content type, then group prompt, optional uploaded media, relevant settings, and generation progress in a focused workspace. Stack controls on mobile.
- **Implemented creation preview:** `/create` reuses the public shell. Six native radio tiles have purple selected/focus treatment; prompt, local-media area, and four labeled native selects use existing field/card/upload classes. Inputs occupy the larger desktop column from 1024px; the output/brief/source column stacks below them on mobile. Generate follows settings so it is reached before the output on mobile. Source files are explicitly local and separate from the empty generated result. Settings are exploratory, Generate opens an informational notice, and no progress is fabricated. Preserve local inputs/files through theme changes.
- **Cards:** reusable responsive grids for creation options, projects, templates, and marketplace content; preserve readable media thumbnails and supporting text.
- **Modals/authentication:** centered panels over `--overlay`, optionally with restrained backdrop blur. Use accessible primitives with viewport-safe sizing. Clerk sign-in/sign-up must open in centered modals/overlays; do not add dedicated `/signin` or `/signup` pages.
- **Pricing:** responsive cards with aligned prices/actions and a clear featured/popular tier using a purple outline and badge.
- **Progress:** show upload → analysis → generation → rendering → completion, distinguishing completed, current, and upcoming stages. Reflect real job state; stack/wrap steps on mobile.
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
