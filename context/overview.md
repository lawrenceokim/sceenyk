# Sceenyk

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
- Establish a foundation for additional content categories, subscriptions, and reusable creator styles without expanding the first MVP beyond a demonstrable core flow.

## Core User Flow

1. A visitor opens Sceenyk and explores public creation options without signing in.
2. The visitor selects a supported content type. The interface guides them with inputs and options relevant to that choice.
3. When generation requires authentication, sign-in or sign-up opens in a centered Clerk modal/overlay. There is no dedicated `/signin` or `/signup` page.
4. The signed-in user enters a prompt and optionally uploads relevant video, image, product, or other media.
5. The user configures the basic generation options available for the selected creation type. Sceenyk checks whether the request is covered by an unused free generation or the user's available credits.
6. Sceenyk creates a project and generation job associated with the user.
7. AI processes the request through the production stages required for that creation type, including planning, scene generation or transformation, commentary/voiceover, captions/effects, and video assembly where applicable.
8. The user sees the job's progress and processing state.
9. When processing completes, the finished video becomes available in the project for preview and download.
10. The generation's usage is recorded against the user's free allowance or credits, and the updated allowance or balance is visible.
11. When the free allowance or available credits cannot cover a request, Sceenyk directs the user to upgrade or buy credits. The hackathon's paid credit flow uses PayPal.

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

Authentication is required for generation, project management, credit purchases, subscriptions, and account-dependent creator features. Dedicated `/signin` and `/signup` pages are excluded from the product flow.

### Free Generations, Credits, and Payments

New users receive two free short video generations of about 10 seconds each. After those generations are used, further generation requires a subscription or purchased credits. Longer or more expensive AI requests should consume more credits, with the requirement clear before submission.

The hackathon version uses PayPal for payments and should provide a working credit-purchase path when users need additional generation capacity. The broader monetization direction includes subscriptions, credit purchases, marketplace purchases, and creator payouts; the full economy is a later phase.

### Creator Templates and Marketplace

The longer-term creator experience lets creators create and publish reusable styles/templates. Other users can discover and purchase those styles and apply purchased styles when generating content.

The first MVP may demonstrate template/style selection within its supported creation path. A fully developed marketplace, paid creator publishing economy, and payout system are not required for the initial release.

### Persistent Product Data

Supabase PostgreSQL stores users, projects, generations, generation jobs, credit balances, credit transactions, subscriptions, payments, templates, marketplace information, and related metadata as those capabilities are introduced.

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
- PayPal-based credit purchases and a clear upgrade/buy-credit entry point when generation capacity is insufficient.
- A responsive interface aligned with the existing light and dark design system and customized shadcn tokens.

The first supported category, AI provider, and media storage service remain implementation decisions. Supporting fewer paths is acceptable when the selected flow works completely.

### Out of Scope

- Supporting every AI video provider or building a universal provider ecosystem.
- Delivering every possible content category during the first MVP.
- Advanced collaborative video editing.
- A full professional timeline editor.
- Native mobile applications.
- A fully developed creator marketplace economy, including complete creator publishing, marketplace purchasing, and payout operations.
- A complete subscription-management system beyond the MVP's working paid credit path and upgrade entry point.
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
10. A new account can use two free short generations of about 10 seconds each. A third generation cannot proceed using the exhausted free allowance.
11. A request that requires credits can proceed only when sufficient generation capacity is available. Longer or more expensive configured requests consume more credits than the baseline short request, and the requirement is shown before submission.
12. Completed generation usage updates the user's free allowance or credit balance and leaves an appropriate usage/transaction record. Revisiting the project shows the updated allowance or balance.
13. When capacity is insufficient, the user can enter the PayPal credit-purchase flow. A successful purchase increases available credits, and those credits can fund a subsequent generation.
14. Creation, project, progress, and result views follow the documented Sceenyk tokens in both themes, with readable text and visible interactive states. Theme switching preserves the current content and generation state.
15. The core flow can be completed on desktop and mobile: creation controls, Clerk authentication, uploads, progress, preview/download, and credit-purchase actions remain accessible without page-level horizontal overflow.
