# Clerk development authentication

Implementation added on 2026-10-09. SDK: `@clerk/nextjs` 7.9.13 and `@clerk/ui` 1.39.1. Source/build checks pass; the live identity/session flows remain unverified until development credentials are configured. This document does not claim a working external account.

## Local setup

1. Use an existing **development** Clerk application. Retrieve both keys from its development API keys screen.
2. Copy the committed, empty `.env.example` to ignored `.env.local`. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_test_`) and `CLERK_SECRET_KEY` (`sk_test_`) from the same development instance. Never paste secrets into chat or commit `.env.local`. The public key is intended for the browser; the secret stays server-only.
3. Restart `npm run dev`. For production-build testing, rebuild with `npm run build` before `npm run start`: Next.js embeds public environment values at build time, and the missing-configuration dashboard redirect is prerendered. A production build may use test keys; production Clerk credentials are deliberately rejected by this development unit.
4. Use your app's configured Clerk sign-in/sign-up methods. Provider settings, OAuth configuration, email delivery, and real account access cannot be established from repository code. Do not provision another Clerk application or fake credentials to bypass missing configuration.

No other environment variable is required by this unit. The modal-entry URLs, fixed post-authentication destination, and sign-out destination are explicitly set in the provider. Do not override them with dedicated sign-in pages.

## Implemented contract

- One configured ClerkProvider inside the root body; no provider when either key is absent. Public `/` and local `/create` stay available. Missing keys show an honest unavailable notice and deny dashboard content. Invalid/production key prefixes fail configuration validation, without logging values.
- Sign In uses `SignInButton mode="modal"`; Get Started in the navbar/free pricing card uses `SignUpButton mode="modal"`. Creative CTAs continue to open the public local workspace. Registered users receive Dashboard/Create and the official UserButton; registration CTAs become dashboard links. Auth-dependent controls wait for Clerk's `isLoaded` state.
- `/dashboard` and its subtree are guarded at the Next.js 16 `proxy.ts` boundary using Clerk's session verification and `auth.protect`. The dashboard layout **and page** call the server-only `requireClerkUser` helper inside Suspense. No shared cache stores authorization decisions. Future private resources/actions must independently authenticate and authorize ownership; a cached layout is not sufficient data protection.
- Denied dashboard navigation returns to `/?auth=sign-in`. The public modal-return boundary waits for Clerk, consumes the marker, and opens sign-in. `/?auth=sign-up` supports Clerk transfers back into registration. Completed authentication always goes to `/dashboard`; browser return URLs/user IDs are never trusted. Signing out returns to `/`. No `/signin` or `/signup` route exists.
- Clerk's supported shadcn appearance uses shared CSS variables, with Sceenyk input, border, backdrop, focus, radius, font, and primary-action adjustments. The existing root `.dark` toggle updates those variables; no second theme system or internal selector overrides. The mobile dashboard account button lives in the header, outside the navigation Sheet's focus trap; the drawer displays a noninteractive official avatar.
- Dashboard first-name/official-avatar presentation has an account/name fallback. All project/generation/template counts remain explicit empty previews, and credits remain unavailable. No application user synchronization, data persistence, AI, media storage, credits, billing, PayPal, or marketplace implementation.

## Verification and remaining acceptance

- Passed: lint, standalone TypeScript, production build, three configuration security assertions (missing keys closed, production public key rejected, production secret rejected), and `git diff --check`.
- Passed with **no Clerk configuration**: 37 local production-browser checks for public access, direct/subtree dashboard denial, no returned dashboard content, fixed redirect despite an arbitrary return URL, no bypass from browser identity hints, absent auth routes, centered/dismissible fallback notices, mobile controls, and light/dark layouts at 1440/1024/768/390/320px. No browser exceptions or external auth requests.
- Passed: 47 creation regression checks, including local prompt/settings, native category keyboard input, file previews/removal/object-URL cleanup, preview dialog/focus, public navigation, cached back navigation, and light/dark responsive layout. The temporary harness was updated for Get Started's new auth behavior and waits for existing exit animations.
- **Pending with real development keys:** actual Clerk sign-in and sign-up modals, authentication completion, signed-in navbar, UserButton/account profile, authenticated dashboard access, real signed-out denial, sign-out denial, session refresh, OAuth/verification transfers if enabled, and Clerk modal/account styling and keyboard behavior in both themes and mobile. Static checks and the unconfigured fallback do not prove these flows. Do not mark authentication Complete before they pass.

## Sources

Use the installed SDK types as the API contract. Current official references: [Clerk App Router setup](https://clerk.com/docs/nextjs/getting-started/quickstart), [modal sign-in button](https://clerk.com/docs/nextjs/reference/components/unstyled/sign-in-button), [ClerkProvider](https://clerk.com/docs/nextjs/reference/components/clerk-provider), [middleware](https://clerk.com/docs/reference/nextjs/clerk-middleware), and [appearance variables](https://clerk.com/docs/nextjs/guides/customizing-clerk/appearance-prop/variables). Installed Next.js authentication-with-cache-components and Proxy guides were read before coding; cacheComponents/partialPrefetching remain enabled.
