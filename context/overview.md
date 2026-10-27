# Sceenyk

## Current UGC milestone boundary (2026-10-27)

**Milestone 9 — Complete and approved, per owner confirmation. Milestone 10 — Final Video Generation — Planned / Not Started.** M8 remains Complete. This status supersedes earlier source-only/pending-acceptance milestone notes; no fresh live package/catalog/deployment audit is asserted.

M9's [immutable package contract](video-generation-package.md) remains the input. The [canonical M10 plan](final-video-generation.md) covers provider-neutral capability/cost admission, independent scene generation/private storage/recovery, explicit scene acceptance, deterministic local stitching, final validation/review/approval and trusted completion. fal.ai is the first planned adapter behind `VideoGenerationProvider`, not a core dependency. Required audio/output profiles remain unresolved gates; no silent fallback or fake support. This task is documentation only under [current restrictions](ai-workflow-rules.md#milestone-10-documentation-scope-2026-10-27). Existing app behavior and the M9 approval pause remain unchanged.

## Storyboard timing margins and saved-dialogue repair (2026-10-27)

Storyboard generation now receives separate preferred speech targets and absolute limits, 900ms action targets above the unchanged 700ms minimum, exact action/speech timing correction and a final deterministic pre-save gate. Eligible saved speech-budget failures can be explicitly edited by their owner and saved to review without OpenAI or a worker; original responses and attempts remain unchanged. Saving that repair requires new manual migration 067 after 066; prompt changes need no migration/configuration. Current records/approved assets remain untouched; Render/Inngest disabled and Milestone 9 Not Started. [Current contract and manual steps](storyboard.md#timing-targets-and-manual-dialogue-repair-2026-10-27).

## Storyboard dialogue planned within time (2026-10-27)

New Storyboard requests now receive calculated duration-specific scene, action/camera, speaking, reaction and transition windows before writing dialogue, with shared video/scene ceilings and breath allowance. The single existing correction receives exact speech-line timing/count feedback while preserving valid scene structure. Existing validators, two-request budget, saved-work recovery, approved assets, editing/review/delete, accounting and hosted state are unchanged. The current failed Storyboard remains preserved for the owner's later explicit rejection/new generation. No migration/configuration; Milestone 9 Not Started. [Formulas and manual testing](storyboard.md#speech-budget-planning-before-dialogue-2026-10-27).

## Storyboard saved validation correction (2026-10-27)

Current revision 4 has two successful saved responses; strict JSON and scene timing pass, but seven speech budget checks fail in each. The 35 words require more than the selected 10s at the saved pace. Original outputs and approved references remain untouched. Studio shows precise field-level errors; safe equivalent-format normalization and local-only Retry recover valid saved outputs without contacting OpenAI. This content cannot be repaired automatically without creative changes. No migration/configuration/limit changes; Milestone 9 Not Started. [Current evidence and safe recovery choices](storyboard.md#saved-output-validation-investigation-2026-10-27) supersedes the historical provider failure below.

## Storyboard response preservation correction (2026-10-26)

Current revision 2 failed at the provider boundary after about 181s with no retained response, IDs or recovery file. Completion/billing cannot be confirmed; the exact original exception was discarded. Source now streams OpenAI responses, durably saves raw terminal output before processing, retains safe IDs/diagnostics and makes retries recovery-only. Missing output cannot cause another paid call. No migration is needed; optional explicit provider retention applies only to future requests. [Current evidence and safe action](storyboard.md#provider-timeout-evidence-and-recovery-only-correction-2026-10-26) supersedes the older zero-request resume snapshot below. Live records/approved assets remain untouched, and Milestone 9 is Not Started.

## Local Storyboard queue correction (2026-10-26)

The current queued Storyboard has not submitted an OpenAI request. Location's empty claim response was incorrectly executed as a record, causing a misleading LOCATION_STORAGE_FAILED loop before Storyboard discovery. Source now validates empty/runnable claims, rotates queues fairly, bounds failed transport recovery and reports queued delays/worker health. Approved media and live records are unchanged. 066 objects are confirmed present by read-only inspection; no new migration is required. [Exact evidence and existing-job restart instructions](storyboard.md#location-empty-claim-starvation-correction-2026-10-26). No providers, workers, live retries/mutations or Milestone 9 were executed.

## Milestone 8 — AI Storyboard (2026-10-26)

After current Character, Product and Location approval, Generate Storyboard queues automatic OpenAI scene/script planning on the existing local UGC worker. Studio adds a readable expandable timeline, scene editing/saving, Accept Storyboard and Reject and Delete. Deletion returns to a separate Generate action; changed saved inputs require regeneration without overwriting scenes. Approval pauses before the generation package. [Current contract/setup](storyboard.md) supersedes earlier storyboard-not-started statements; provider/runtime/manual acceptance and migration 066 remain pending. Upstream generation, approved media, accounting and hosted guards are preserved.

## Milestone 7 — Location Reference (2026-10-26)

UGC continues from approved Character + Product references into Generate Location → automatic private planning → one location image → Accept Location or Reject and Delete. Acceptance preserves the image and pauses before storyboard. Deletion clears only the rejected candidate and returns to a separate Generate Location action; it never generates a replacement automatically. No plan form/approval. Storage-only Retry saving reuses existing output, with clear unavailable-output messages. [Current Location contract/setup](location-reference.md) supersedes older behavior below. Existing Character/Product work, private storage, local execution and accounting remain unchanged; manual acceptance is pending.

## Character V5 final Front direction (2026-10-26)

Front revision 4 requests 2:3 portrait with complete shoulders/torso/legs/shoes, empty gray margin and explicit rejection of cropped/tightly zoomed/head-visible/shadowed results. Enhancement=false and batch=1 remain. Current new-work flow: Original → generated Face → manual Accept → final shoulders-to-shoes Front generated from accepted Face → manual Accept → Back generated from accepted Face → manual Accept → local Sheet → explicit Character approval. Front has no Back dependency, crop/mask tool, local head-removal stage or second Front review. Existing completed views can be preserved; older unfinished Front candidates require explicit rejection/regeneration rather than automatic migration/retry. Visual acceptance remains manual; only technical failures are automatic. Product workflow is unchanged. [Current recipe/setup/acceptance](character-sheet.md#character-v5-front-full-framing-2026-10-26) supersedes older Front order/source/preparation below. Migration 062 after 061/prerequisites is manual and unapplied; no provider/worker/deployment/Milestone 7 execution occurred.

## Character V5 manual review (2026-10-25)

**Character V5 — Complete in source. V4 is superseded for new Character work. Manual migration 054 and provider/visual/runtime acceptance pending. Milestone 7 remains Not Started.**

Original image → static Soul 2 Face → manual Accept → static Back → manual Accept → static Front source conditioned on accepted Back → manual Accept → local adjustable Sharp headless Front → manual Accept → local FRONT / BACK / FACE sheet → explicit Approve Character Reference. Each paid stage waits for the previous user acceptance. Technical checks only; no automatic semantic rejection or OpenAI prompt/crop validation in V5. Private candidates are separate from accepted canonical pointers; Reject fences the candidate, deletes its R2 file, then clears its image pointer while retaining minimal audit metadata. Historical V1–V4 records remain readable and unchanged. Product generation, views and approval stay the same; only its Character dependency resolver admits approved V5 workflows.

[Authoritative V5 contract, setup, cleanup and verification limits](character-sheet.md#character-v5-manual-review-2026-10-25). Source-only authorization: TypeScript, focused lint and static/schema checks. No provider calls, worker/job execution, live mutation, cleanup runs, R2 deletion, remote SQL, builds, deployment, Render/Inngest or Milestone 7. Older sections below describe historical versions.

## Character V4 — official product direction (2026-10-25)

**Complete in source; manual 053/provider/visual/runtime acceptance pending. Milestone 7 — Not Started.** The [Character V4 contract](character-sheet.md#character-v4-official-workflow-2026-10-25) supersedes older Character strategy/order/version/setup recommendations below. V3 is superseded for new Character reference generation because direct Front-first generation remained unreliable; existing source implementation/history is retained.

Official chain: **Original Character image → OpenAI Character analysis → Soul ID → Face → Back → Front source → local headless Front → local Character Sheet → Reference review → approval**. Each dependency must be validated before the next begins. Higgsfield Soul 2 Image-to-Image generates a clean Face, rear full-body Back and normal full-body Front source; Sceenyk derives canonical headless Front locally and composes only Front / Back / Face on gray. Front uses validated Back as body/outfit authority and Face/Soul identity support. References shows Original, Face, Back, canonical Front and Character Sheet; progress uses persisted events only.

Record Character prompt **4**, generation contract **4**, strategy **`face-back-front-v1`** for future implementation. V1/V2/V3 assets/jobs remain unchanged and interpretable; no historical rewrite or replay. OpenAI keeps analysis and later storyboard/script generation, Soul ID keeps identity, and Product / Prop generation remains unchanged. Implementation acceptance is source-only, with TypeScript, focused lint and isolated schema checks. No provider calls, workers/jobs, live mutations, remote migrations, deployment, Render or Inngest; Milestone 7 remains Not Started.

Implementation refinement: the original may be reused as Face only after the complete V4 portrait contract, including neutral gray, passes; persist its origin. Explicit Face replacement invalidates Back + Front + Sheet/Character approval; Back replacement invalidates Front + Sheet/Character approval; Front replacement preserves Face/Back. Local crop/sheet repairs reuse paid output. See [current setup and acceptance limits](character-sheet.md#manual-setup-and-source-acceptance).

## Milestone 6.6 — Reference Regeneration + Review UX Correction (2026-10-24)

**Milestone 6.6 — Reference Regeneration + Review UX Correction — Complete in source. Manual migration/provider/runtime/ownership/visual acceptance pending. Milestone 7 — Not Started.** This section supersedes the historical 6.5 request-only execution and exclusive Preview rules below. [Current execution, versioning and manual setup](reference-review.md#milestone-66-execution-and-review-contract).

The local worker can consume individual Character/Product replacement requests, reuse successful work and recompose the affected sheet. Studio Preview has compact Progress and References views over the same persisted workflow. Historical assets remain intact and replacements require explicit reapproval. No Location work or automatic approval.

## Milestone 6.5 — Reference Asset Review (2026-10-24)

**Milestone 6 — Complete. Milestone 6.5 — Complete in source; manual 046/runtime/ownership/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This supersedes older stop points below. [Review UI, security, persistence and setup](reference-review.md).

The reference preparation flow now includes private visual review and explicit approval after Character and Product generation. The owner can request individual replacements without automatic paid execution. Original/generated assets remain private and absent from reusable Templates; Location generation is not started.

Input → Reference Analysis → Character Reference generation → Character Review/Approval → Product Reference generation → Product Review/Approval → Location Reference → Storyboard → Generation Package → Final Video → Preview. Existing cost-confirmation/accounting gates remain. Apply 046 manually after 045; no new environment/dependency. Render/Inngest remain disabled. No provider, worker/job, storage request, remote SQL, browser/screenshot, build or deployment executed. Stop after 6.5.


## Milestone 6 — Product / Prop Reference Sheet (2026-10-24)

**Milestone 5 — Complete. Milestone 5.5 — Complete. Milestone 6 — Complete in source; manual migration/provider/runtime/visual acceptance pending. Milestone 7 — Location Reference generation — Not Started.** This current authorization supersedes older M6-not-started stop points below. See [Product Sheet contract and manual setup](product-sheet.md).

The approved Product provider is OpenAI Sunburst Image Edit; Character stays Higgsfield SOUL2. Three source-conditioned Product views form a private server-composed reference sheet. No later stage or user-credit deduction is introduced.

Pipeline: Input → OpenAI Reference Analysis → Character Reference Sheet → Product / Prop Reference Sheet → Location Reference → Structured ChatGPT Storyboard → Generation Package → Final Video → Studio Preview. Existing cost-review/accounting gates remain. Apply pending 044 and new 045 manually; use OPENAI_PRODUCT_SHEET_MODEL=gpt-image-2.5-sunburst and explicit UGC_PRODUCT_SHEET_ENABLED=1 with the existing private OPENAI_API_KEY. Render/Inngest remain disabled. No providers, workers/jobs, private media operations, remote SQL, browser/screenshot suites, build or deployment were executed. Stop after M6.



## Milestone 5 — Character Sheet (2026-10-23)

**Complete in source; manual migration/provider/runtime/visual acceptance pending. Exact next: Milestone 6 — Product / Prop Reference Sheet generation. Not started.** [Character Sheet contract and manual setup](character-sheet.md) supersedes older M5-not-started/OpenAI-Character-image assumptions below; historical evidence remains intact.

SOUL2 now generates the private canonical Character Reference Sheet through the local worker. One frozen named Character/source/analysis produces persisted wardrobe, front/back/face views and a server-composed neutral-gray sheet. No later generation or credit operation.

Approved full flow: Input → validation → OpenAI analysis → SOUL2 Character Sheet → Product Sheet → one primary Location → structured ChatGPT storyboard/script + stable voice specification → generation package → cost review/confirmation → final video → finalization → Studio Preview. No later stage is implemented. User confirms 039 applied; verify/apply 040 then new 041 manually. Render/Inngest remain disabled; only user-started local worker execution. Codex made no provider calls, ran no jobs/worker, applied no hosted SQL and deployed nothing. Offline in-memory schema validation is separate from manual runtime acceptance.

## Milestone 4 - reference analysis (2026-10-23)

**Milestone 4 — Complete in source; manual migration/provider/runtime acceptance pending. Exact next: Milestone 5 — Character Reference Sheet generation. Not Started.** UGC now uses the official OpenAI SDK Responses API through a narrow provider interface to analyze exactly one private Character and one Product reference separately. Strict versioned visual observations preserve uncertainty and prohibit identity/sensitive inference. Each successful role is persisted/reused; durable submission intents stop unknown outcomes from being repaid automatically. Two analyses lead to a real character_reference development pause, with no generated image/storyboard/video or Sceenyk credit operation. See the [provider/schema/privacy/setup contract](reference-analysis.md).

Studio duration choices now share 5/10/30. Existing 15-second projects remain readable/saveable and frozen snapshots retain their historical value; new UGC preparation requires a current choice. Manually apply 038/039 after prerequisites and configure server-only OPENAI_API_KEY, OPENAI_REFERENCE_ANALYSIS_MODEL and explicit UGC_REFERENCE_ANALYSIS_ENABLED=1 before manually running worker:ugc. Render/Inngest remain guarded/local-only. No paid call, worker/job execution, SQL application, build or deployment was performed by Codex. Earlier milestone statuses below are historical.

## UGC Milestone 3 — validation and readiness (2026-10-23)

**Complete in source; manual migration/runtime acceptance pending.** [UGC readiness](generation-jobs.md#milestone-3--ugc-input-readiness-2026-10-23) checks authenticated ownership, complete saved UGC inputs, exactly one verified private Character/Product image and object availability. Studio enables Prepare generation only after server readiness; new enqueue commits an immutable validated snapshot under a race check. Local worker validation records success and pauses before unimplemented reference analysis, with no credit/provider work or fake output. Existing Marketplace/Freestyle and hosted guards stay intact.

Current Studio supports 10/15/30 seconds; the approved 5-second target remains unimplemented under this milestone's actual-configuration scope. Manually apply 037 after 035/036; no SQL, workers/jobs, storage/providers, browser/integration suites, production build or deployment was run by Codex. **Next: Milestone 4 — OpenAI reference analysis (Not Started).**

## UGC Milestone 2 — source infrastructure delivered (2026-10-23)

The [UGC job schema/runner](generation-jobs.md#ugc-generation-jobs--milestone-2-complete-in-source-2026-10-23) is Complete in source, with manual migration 036 application and runtime acceptance pending. The local command `npm run worker:ugc` uses persisted owned UGC jobs, centralized states, append-only history, idempotency, leases/heartbeats, bounded recovery/retries and cancellation. It does not start itself or create jobs. The empty stage registry stops safely at unimplemented validation; Studio Generate, provider stages and financial behavior remain unconnected. All Render/Inngest guards/configuration remain intact. Next: **Milestone 3 — UGC input validation + generation readiness (Not Started)**; do not begin it in this unit. The previous architecture-only milestone remains historical evidence.

## Approved full UGC V1 workflow (2026-10-23)

**Architecture/context Milestone 1: Complete. UGC pipeline implementation: Not Started.** The [UGC V1 workflow contract](ugc-v1-workflow.md) is the current product/implementation contract and supersedes older UGC provider, execution and next-unit recommendations; historical evidence below remains intact. This task adds documentation and reversible local execution guards only. Freestyle stays separate, with its existing product and financial contracts.

UGC requires title, Creation Type UGC, exactly one uploaded Character image and one uploaded Product / Prop image, aspect ratio, creative direction, 5/10/30 seconds, Visual Style (Original, Realistic, Cinematic, Anime, Cartoon / Illustrated), Tone (Professional, Funny, Dramatic, Energetic, Storytelling), UGC Type (Advertisement, Explanation, Unboxing) and supported narration settings. Generate requires all valid inputs and independent server ownership/readiness checks. Current shared code still offers 10/15/30 and stores Cartoon; Milestone 3 must implement the UGC contract compatibly without rewriting older/Freestyle projects. UGC Generate remains unavailable today.

Approved flow: validate → OpenAI source analysis → private Character Reference Sheet → private Product Reference Sheet → structured storyboard → normalized Video Generation Package → determine cost → Review Generation Cost → explicit confirmation → future video generation → finalization → Studio Preview. OpenAI replaces Gemini for UGC reasoning/planning/reference images only; exact models come from central server configuration. Reference sheets preserve visual consistency without claiming perfect 3D reconstruction. Private sources/sheets never enter reusable/public Templates.

All UGC stage execution belongs on the laptop during development. Hosted Render and all Inngest transport are blocked by the current local-only guard; no UGC runner exists yet. Templates preserve existing ownership/snapshot rules and require one adopter-owned Character and Product, with explicit future required counts of 1 each. Existing accounting stays authoritative; preparation funding/consent must be resolved before paid preparation, with no financial change here.

The user performs manual acceptance. No automatic browser/screenshot/full regression/deployed/provider/video/hosted-job tests or paid calls unless explicitly instructed; only minimal compile/type/static checks. **Next implementation milestone: 2 — generation-job schema + local job runner/state machine. Do not start it here.**

## UGC V1 reference limits (2026-10-22)

UGC V1 supports exactly one Character and one Product / Prop per project. Incomplete drafts may start empty; once an image is selected/uploaded, that role's Add button disables and no extra + tile is shown. Removing the reference re-enables replacement immediately without refreshing. State, owned upload/save validation and migration 035 enforce a maximum of one per role, including concurrent uploads. Older extras remain stored/removable with clear warnings; UGC generation readiness is blocked until reduced to one of each. Future generation also requires uploaded references and the other valid UGC inputs; this unit adds no generation pipeline. UGC template adoption therefore requires one Character and one Product / Prop from the adopting user before generation; creator private references are not copied. Freestyle is unaffected. This supersedes the earlier multiple-reference UI capability. Migration/manual review status is in the tracker.

## Project → Template lifecycle (2026-10-21)

Templates originate from existing owned Projects: **Project → Publish as Template → Manage Template → Publish to Marketplace**. Project cards expose Publish only while no Template exists, with no replacement action once linked; `/templates` has New Template, opening `/settings/templates/new` to select a Project with its preview/name/edited date. Both entry points initialize a private draft or open the source Project's existing `/settings/templates/[listingId]`. The existing unique creator/source relationship prevents duplicates, including retries. No independent blank-template system.

Project title, public-text-compatible brief, category, creation/UGC type and settings prefill the separate Template. Draft instructions remain reviewable until first publication; existing rights confirmation explicitly covers privacy and preview rights. Published configuration and purchase/adoption snapshots stay fixed. Later Project edits never automatically overwrite published information. Private views reuse source previews; Marketplace receives a separately re-encoded, metadata-free still/poster after explicit rights-confirmed saving. Source URLs remain private. Existing abstract artwork is the fallback for absent/unavailable media. Migration 033 after 032 is required; local/manual verification limits are in the tracker.

## Dynamic Studio creation flows (2026-10-20)

Studio now supports UGC (User-Generated Content) and Freestyle through the shared custom Creation Type dropdown in Sources. New drafts default to UGC. UGC shows compact Characters and Product / Props image references instead of Project Media, plus Type in Properties → Style & pacing: Advertisement (default), Explanation or Unboxing. Freestyle shows the existing image/video/audio Project Media flow and hides UGC Type. Scene, duration, visual style, tone and existing prompt-driven narration remain shared. Switching types retains both flows' data and the hidden UGC choice; only explicit removal detaches references. Empty Preview summarizes the chosen flow/type/duration.

This supersedes earlier one-option UGC presentation guidance. Creation Type is independent of legacy creative categories; older saved/adopted projects fall back to Freestyle to preserve general creation behavior. References reuse existing owned/private project media, one image per character/product for now with grouping IDs for future references. Migration 032 is required before using this revision. This unit prepares structured inputs only; UGC generation is unavailable, with no sheets, scripts, videos, hosted Inngest or deployment. Application/verification status is in the tracker.

## Studio containment and Credits earnings tab (2026-10-20)

The latest focused refinement supersedes the prior fixed-button Creation Type rule: Sources now exposes the shared custom dropdown with exactly one UGC option, preserving the existing brief category value and backend enums. Studio uses compact feature headings/short descriptions instead of tutorial paragraphs. Errors, upload/save state, quote confirmation and required reservation/pricing notices remain concise and functional. Mobile Stage and Properties stay inside the viewport-bound workspace frame, with a fixed Properties header and only its control body scrolling. Sources retains its existing mounted panel/modal behavior.

Earnings & Payouts moves from Settings to /credits/earnings as the second Credits navigation tab beside Credits & Billing at /credits. It reuses the same fixed-header/scrollable-center composition and existing financial services/components. Old Settings/dashboard earnings URLs redirect with query parameters; financial values, ownership, payment/withdrawal behavior and private-cache policies remain unchanged. Manual UI review is pending; no hosted Inngest or deployment.

## Dedicated Credits workspace and interaction fixes (2026-10-20)

Credits & Billing now lives at authenticated /credits, with its own compact left section navigation, fixed Credits & Billing heading/description and independently scrolling center content using the Settings layout. It is removed from Settings navigation. Main sidebar, account menu, landing, balance and Documentation links point directly there. Old /settings/credits, /dashboard/settings/credits and /dashboard/credits bookmarks/checkout returns redirect with their query parameters. Existing purchase, balance, free allowance, reconciliation and history components/services remain unchanged. Credits has the same private/no-store protections as Settings. Shared dropdown portals now use the library default when no native dialog exists; collapsed-sidebar hints use a 4px offset and compact 11px type. Manual layout review remains pending; no hosted workflows or deployment.

## Focused dropdown and Studio Sources refinement (2026-10-20)

App-owned ordinary dropdowns now share the installed Base UI Select with compact Pryzm-inspired geometry, Sceenyk theme tokens, keyboard/focus/dismissal behavior and approved reduced-motion-aware transitions. Genuine clickable controls show pointer cursors; disabled controls retain their proper behavior/style. Studio exposes one Creation Type label, UGC, as a fixed person-icon control in Sources after Your Project and before Project Media, with no Creation Type choices in Properties. Current saving/generation category enums and saved/adopted/restored/account-default values stay unchanged; no new UGC backend/provider mode is introduced. This is a UI-only refinement, pending manual review; no hosted Inngest or deployment.

## Current Marketplace/Templates routing refinement (2026-10-19)

Canonical private destinations are `/projects`, `/templates`, `/templates/[listingId]` and `/settings/*`. Templates is the owner's visual gallery; Manage Templates and existing publish/edit controls live in Settings. Public Marketplace remains `/marketplace`, with filtered infinite discovery and unchanged adoption/payment rules; private purchase history is `/marketplace/purchases`. Old dashboard bookmarks and existing payment-return URLs redirect to the clean destinations. Persistent muted fallback preview colors are listing presentation metadata only, introduced by migration 029; private creator media and immutable financial/adoption snapshots stay excluded. Implementation/verification and pending migration setup are recorded in the progress tracker. Stop for manual review; no deployment or hosted Inngest execution is authorized.

## Focused Studio refinement and canonical URL (2026-10-18)

The latest request supersedes the earlier edge-to-edge Sources overlay and side-by-side tablet layout. Studio is canonical at /studio; /create permanently redirects with query parameters, while owned /projects/[id] routes and existing handlers remain unchanged. At desktop viewport widths with at least 930px available Studio width, Sources/Stage/Properties use 254px/flexible/252px columns. Otherwise Stage precedes Properties; Sources opens as a 254px right-side nonmodal panel from 768px viewport width, or as a focus-managed modal inset 8px on every edge below 768px. One mounted Sources tree retains inputs and local media. Only the mobile modal locks background scrolling. Toolbar controls are 32px with a centered compact aspect segment/popover for the existing 9:16,16:9,1:1 choices; no invented Share or generation options. Workspace-only scrollbar hiding preserves scrolling and leaves public landing scrollbars unchanged. Preserve logos, themes, business logic and ownership; no hosted Inngest. Stop after Studio review.


## Pryzm reference implementation — Phase 1: Studio (2026-10-18)

Current authorization: use Pryzm_Design_System_Reference_for_Sceenyk.md as the primary workspace geometry reference, with the supplied screenshots for refinement. Implement Studio and necessary shared navigation/frame geometry only, then stop for user review. Templates/Marketplace, Documentation, Projects/Settings and public pages are later phases; preserve their current presentation and existing work. Keep Sceenyk's official logos, configured font, existing colors/themes/features and all backend/auth/financial/provider contracts. No hosted Inngest, generation, checkout or deployment acceptance.

Geometry decisions: a reusable workspace-only token layer; 252px navigation plus an 8px gutter (preserving the current Studio x260 frame position), 64px collapsed rail with no extra gutter, 254px Sources and 252px Properties. Keep the screenshot-tuned 54px toolbar/header and 52px inspector rows within the reference's estimated ranges. Four-area desktop requires at least 930px available Studio width and a desktop viewport; tablet Sources stays a full-screen overlay. A 752px content breakpoint stacks Stage/Properties on viewports up to 767px. CSS owns Sources' rail/modal mode; the native dialog reads that mode and retains one mounted control tree. Controls and type hierarchy are refined without changing handlers or business state. Actual verification is recorded in progress-tracker.md.

## Strict workspace visual-fidelity pass (2026-10-18)

The current user request supersedes earlier phase stop points and geometry guidance for a UI-only pass across Studio, navigation, Templates, Marketplace, Documentation, Projects and Settings. The supplied Pryzm screenshots are the primary layout reference; retain Sceenyk names, official logos, Inter, purple/blue accents and the existing theme controller. No backend, auth, payments, credits, Marketplace behavior, provider, database or guest-draft changes are authorized. Do not trigger hosted Inngest or perform deployment acceptance.

Reference-derived target geometry (Approximate): 260px desktop navigation, 64px collapsed rail, 8px viewport gutters and panel gaps, 14px outer radius, 1px neutral borders, 54px Studio headers/toolbar and 254px Sources/Properties rails at 1366-1440px. Compact desktop navigation uses 32px rows; touch navigation retains larger targets. Panels scroll independently on desktop; mobile retains hamburger/logo, Stage then Properties, and the same mounted full-screen Sources dialog. Gallery cards use a dense responsive grid with compact metadata; actual configuration covers remain labeled rather than inventing artwork. Documentation uses topics/article/contents at reference desktop widths. Settings retains its existing sections and controls. Workspace-scoped neutral surfaces supersede earlier purple-tinted neutrals; brand/action/focus colors remain unchanged. Local screenshots, responsive themes, overflow, lint, types and build are the acceptance scope. See progress-tracker.md for actual results.

## Studio Phase 3 — implemented (2026-10-18)

Current authorization includes desktop, tablet and mobile Studio. Reuse the shared navigation; Sources owns presentation of project title/origin and existing image/video/audio import/upload/recovery; the Stage owns source/result playback, durable status and scene caption preview; Properties owns category, prompt, duration/style/tone, existing generation quote/confirmation and caption preferences. Aspect ratio and Save move to a fixed 64px toolbar. WorkspaceEditor remains the brief/save/media-selection owner; useProjectMedia and useProjectGeneration retain their existing server calls, guards and state. Caption controls use React portals into Properties while their existing preview component owns state. No new scene editor, voice selector, share engine or export capability is introduced.

The same mounted Sources dialog uses native modal focus/scroll behavior below 1050px available content width; above that it is a nonmodal rail. At 720px available width Stage/Properties sit beside each other; below that Stage precedes Properties. A bounded, schema-validated 30-minute sessionStorage handoff restores only guest brief values through existing Clerk authentication; files remain memory-only and full reload requires reselection. Saved/account-switched private projects never use the guest draft. No auth route, ownership, cache, schema, provider, payment or generation-hook contract changes. Inngest Cloud stays paused. Local and scoped live acceptance is recorded in [the tracker](progress-tracker.md). Deployment is not performed; the next bounded unit is deployment and read-only acceptance of this revision, with Inngest Cloud still paused. Stop after Phase 3.


## Remaining workspace migration — Phase 2 (2026-10-18)

Phase 2 adds an authenticated Templates gallery at /dashboard/templates and public product Documentation at /documentation and /documentation/[topic], using the existing shared workspace environment. Templates renders the owner's existing Marketplace listing configurations and existing actions; adopted templates remain owned Projects and paid recovery stays in Marketplace purchases. There is no new saved-template system, fabricated media or unsupported gallery filter.

Documentation now presents seven source-verified topics: getting started, Studio, projects/templates, Marketplace, credits, earnings and Settings/privacy. No prior end-user docs route existed, so this is a curated guide based on existing product UI rather than a rewrite or exposure of internal context. It explicitly distinguishes available behavior from guest-restoration, notification/export/deletion and final-rendering limits. Sidebar Soon markers are removed for these working destinations.

Internal payout support now shares the workspace presentation behind its unchanged admin/support guard. Existing public landing/pricing, intentionally shared public Marketplace/storefronts, private Settings and Studio access keep their boundaries. Small shared heading/spacing adjustments align creator management and Settings. Runtime acceptance and deployment limits are in the tracker. Stop after Phase 2; the exact next unit is Phase 3 — full Studio workspace redesign: Navigation | Sources | Preview Stage | Properties. Inngest Cloud remains paused.


## Studio-first workspace — Phase 1 (2026-10-18)

The authorized workspace foundation replaces dashboard-first Home with Studio at /create. Projects now live at /dashboard/projects; Studio, Projects, public Marketplace and private Settings share the new navigation/content shell. /dashboard is a compatibility redirect, with old project pagination/bookmarks preserved. Create → Studio; Workspace → Projects and planned Templates; Discover → Marketplace; Resources → planned Documentation; Account → Credits and Settings. Identity/account links live at the bottom; Credits opens existing Settings → Credits & Billing. No new billing, template, auth or generation system is introduced.

The desktop sidebar collapses from 240px to an 80px icon rail with local preference, accessible names and keyboard/hover tooltips. Mobile uses a hamburger/logo header and accessible drawer, without a permanent rail. Both themes use existing tokens and logos. Studio guest configuration remains public; generation and private data retain existing server guards. Phase 1 implementation and acceptance are tracked separately below and in progress-tracker.md. The current request supersedes the older Not Started/landing-only statements for this unit. Stop here; Phase 2 is Templates/Documentation/remaining internal presentation migration, Phase 3 full desktop Studio, Phase 4 mobile Studio. Inngest Cloud remains paused.


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
