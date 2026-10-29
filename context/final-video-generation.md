# Milestone 10 — Final Video Generation

## Version authority (2026-10-29)

**Milestone 10 V1: implemented and proven end-to-end**, per the owner's reported milestone baseline; this update performs no new runtime/provider audit. **Milestone 10 V2 continuous multi-scene generation: Planned / Not Started.** [The authoritative V2 architecture](final-video-generation-v2.md) defines capability-driven Generation Segments, master-audio-first generation, native Seedance synchronization, optional LipSyncProvider, segment-based cost/recovery and future acceptance.

**Everything below is the retained V1 / historical implementation and investigation record**, including the per-scene Seedance + separate Kling pipeline, dated status/permissions, original failures, pending repairs, source/API research and manual commands. Preserve it as evidence for existing executions; those assets/approvals remain valid under their original contracts. Older claims that M10 is not started or acceptance is pending are dated V1 snapshots, not the current milestone summary. The planned V2 flow supersedes V1 as future architecture without changing current code, source schemas, provider settings or existing executions. Existing schema 2 / ugc-execution-v1 is V1, not V2 continuous generation. Historical commands are not authorization in this documentation task.

## Final approval false staleness and saved-media investigation (2026-10-29)

**Source fix and offline verification complete. Migration 075 and the privileged one-execution repair are prepared, not applied. No corrected final candidate was published. Zero provider requests, intents, authorization changes, workers, deployments or live database/storage mutations in this investigation.** This supersedes earlier snapshots of execution `62e93717-9e00-486e-b968-a85f272b831d` being stopped at speech fitting.

### Exact approval finding

The approval was actually persisted, rather than rejected before its transaction committed. Live GETs show execution version **727**, state/phase **approved**, `approved_at=2026-10-29T05:01:20.094078+00:00`; job `e3b27b7c-8f4e-4c2a-acf2-d0455514e927` is completed/complete, `completed_at=2026-10-29T05:01:20.097943+00:00` (**06:01:20 Lagos**). The execution approval event and parent completion event remain saved. The quoted warning is rendered by FinalVideoReview when `review.current=false`; it is not evidence that the approval RPC rejected this attempt.

The existing approval RPC validates `ugc_final_result_valid`, persists approval, then completes the job. Afterwards, `finalVideoAction` calls `readFinalVideo`; its `ugc_final_current` resolves `ugc_package_input(job)=saved_package.input`. That resolver calls `ugc_storyboard_input`, whose admission predicate requires job status queued/failed and stage location_reference. Completion changes those to completed/complete, so the resolver returns SQL NULL. **The failing comparison is NULL current package input versus the saved immutable input, not a changed package hash.** Generation and approval were valid before the completion write made the read resolver ineligible.

| Binding | Execution at admission / current approved package |
| --- | --- |
| Package ID | `1fe9e8ab-88a6-4700-ac70-e1175d36ba17` / same |
| Immutable revision | `2` / `2` |
| Package record version | not saved as execution package_version; current package record version is `6` |
| Package hash | `d58ec93b8c77f8fce63c5f40d20c53975b4dfc1f7b30c70c7e31e7697ededde7` / same |
| Input fingerprint | `bd582fa8a1164c6d1d6f8099489b6f420480499ef19b8e11daf5508b43ff5f29` |
| Bound Storyboard | `aeea0735-db8e-49e3-9022-c9a6a3cdf7bb`, revision `6`, record version `2` |

The historical revision-1 package also remains approved in history; it is not the execution binding or the latest package and is never substituted. Offline reconstruction using current GET-resolved scene/dependencies and saved upstream approval/media rows exactly matches the entire revision-2 input. Rebuilding/strictly validating its schema-2 document returns the same hash and fingerprint. No creative content changed. Migration 075 separates the creative read resolver from Storyboard admission without changing any hash recipe or stored package. Original Storyboard mutation/worker eligibility stays lifecycle-gated; changed source media, approval versions, Storyboard revisions/content, settings, cancellation or stale package still fail currentness.

### Saved Scene 2 chain

Dialogue is **Smooth and ready.** at global **6200–7600ms**, Scene 2 starts at **5000ms**; local window is **1200–2600ms**, never 6200ms locally. Exact private storage keys are retained in ignored `.ugc-final-recovery/media-investigation/measurements.json`; asset filenames use operation IDs below under the execution's existing private prefix. The original response/source files and every published object are preserved.

| Stage | Operation / immutable artifact | Duration | Scene/final timing |
| --- | --- | --- | --- |
| Original ElevenLabs MP3 | voice operation `d8abba4b-eca1-49f9-ab45-639c20f99a61`, original source hash `fb38c7553e67aa4fa8aee6d851059f68ccaa3a1ef2b9117424278ecff6a49fe8` | container about1489ms, decoded1440ms | source-relative acoustic onset135.261ms; original has no downstream/final placement |
| Canonical corrected WAV | same operation's immutable `.wav` output; hash `c8de3ff96aaaa7834c620eb33ab00b664c325d5fc8367fb35b96e6cf2fdb5cbf` |1387.354ms,1.048x fitting | placement1200ms /6200ms; source acoustic onset123.729ms, resulting scene/final onset about1323.73/6323.73ms; includes original silence |
| Kling guide | `e67902f1-ee9f-49fd-88ba-b0753d981989.mp3`; hash `2a1c99923c7384a942e84a9ed74e353865c32b9ed72d11b624514642606a26f8` |5040ms MP3 container, start_time23.021ms encoder delay | decoded audible onset1323.77ms /6323.77ms |
| Raw saved Kling return | `4d268db9-7a2f-4552-99ad-28442607a234.source.bytes`; hash `3e06fc29a572d2a2a396b4a364b6c74c4e1ba7ad8c9b343eea490b6d86b04fdf` | container4967ms, video4966.992ms at30fps, audio4899.002ms | audio/video start0; audible onset1323.76ms |
| Published normalized Kling picture | same sync operation `.mp4`; hash `ac371fd800600b8d8182f216f0ddf691be5f9c84b4f174d36c323614dd9f116d` |4960ms at25fps; intentionally no audio | visual timestamps remain scene-local |
| Composed Scene 2 | `dadc3daf-a1e4-4c5b-a291-624e8bf07ba3.mp4`; hash `f78b1a849da0bc64100690353121431a6c74da0248580d8d62ae70984f78e12a` |5000ms container/audio,4960ms video | audible onset1323.77ms |
| Existing final candidate | `06615f6f-1ef6-47fe-8a2b-fcebfbcd3432.mp4`; hash `c70bee36f62802f49a33f8b237cd6cbe35579a6d87419c1c922495f3e65d382e` |10000ms container/audio,9920ms video | audible onset6323.77ms; final1280x720 |

The persisted guide's input names the canonical corrected WAV hash and local window `[1200,1400]`. The lip-sync intent names that exact guide hash. The scene composition names that same corrected speech hash and sync operation. A disposable guide rebuilt from the corrected WAV matches the Kling guide **byte for byte**. Therefore Kling received the corrected speech, not the original MP3; final composition uses the same corrected speech version. Decoder silencedetect at -40dB measures identical onsets and inter-word silence in guide, raw Kling audio, composed scene and the final Scene 2 segment (differences below one48kHz sample). MP3 start_time is encoder delay, not a commanded23ms speech shift.

There is no measured FFmpeg audio-onset shift to undo. Raw Kling frame inspection at30fps shows the first clear mouth opening around1400–1433ms versus acoustic onset1323.76ms (about76–109ms later). **This is an approximate visual opening observation, not a phoneme-accurate A/V offset measurement**: fricatives can begin before a large opening. Exact perceptual lip-sync offset remains Needs confirmation. The same audio/mouth relationship exists before composition; no deterministic constant offset that repairs the whole utterance is proven. A blind80–110ms speech shift would also overrun the1400ms approved window of the1387ms preserved derivative. No offset was applied, no speech was trimmed/retimed again and no provider was called. Do not promise that recomposition alone repairs generated lip animation.

Separately, old fps normalization allowed a near5s provider result to become4960ms of picture, and visual concatenation accumulated that shortfall while audio stayed on the approved absolute timeline. This moves later visuals earlier, not audio earlier, and does not explain the observed raw Kling mouth opening. Source now pads the last existing frame to exact scene length, resets audio PTS before local delay and avoids concat AAC priming extending the nominal final duration. New offline fixtures verify exact10s video and audio tracks; existing objects are untouched. Character-only scene composition now directly consumes the persisted guide already submitted to lip-sync. Mixed narration remains built from the same immutable utterances. Existing operation fingerprints/paid authority are preserved.

### Approval fix and exact recovery steps

Migration `supabase/migrations/20261029007500_ugc_final_approval_currentness.sql` preserves the non-approval073 action path, adds private append-only approval attempts and revalidates exact package/currentness, expected review version, private-byte candidate proof and final scene/result proof under source/execution locks. It persists approval, validates again, then completes the parent. A final invariant failure rolls back approval and completion in a subtransaction and retains a failed-attempt diagnostic outside it. Server-side failures before the RPC are recorded separately; audit-write failure is logged safely. No failure deletes, requeues or regenerates a candidate. Progress requires current approved execution plus persisted parent completion/time to display Complete; stale approved legacy state displays Final approval needs review.

1. Keep all provider/worker processing stopped. Apply **075 after074** through the privileged Supabase SQL Editor. The available application credential has private reads/RPC grants, not schema/terminal-state maintenance authority; no live SQL was applied here.
2. Run **`scripts/repair-m10-final-review.sql`** in the same privileged editor. It locks the execution/job and sources, verifies the exact execution/package/final hash,12 consumed requests, version727 and both original timestamps, and verifies currentness/result validity with075. Under table write locks it temporarily bypasses only the two named terminal-state guards, reopens the same execution to review and job to awaiting_confirmation, clears only active approval/completion timestamps and restores both guards before commit. The original times, candidate proof and reason remain in an immutable reopened-attempt diagnostic; original event history stays intact. Reruns of this same already-repaired state are no-ops; unexpected state aborts the entire transaction.
3. Run the updated local application and refresh this project's Final Video/Progress. Expect **Final video ready**, existing10s candidate still playable and completion awaiting approval. **There is no newly corrected candidate to review.** Assess the existing Scene 2 lip animation before choosing approval.
4. If visually acceptable, click **Approve Final Video** once. Only a passing final transaction changes progress to Complete. If it fails, use Check status and inspect `ugc_final_approval_attempts`; retain the same candidate. Do not click Reject and Delete, Generate, Recover or Resume as a way to fix this issue. If the existing animation is unacceptable, stop for a separately decided path; no further provider request is authorized.

Offline verification includes73 approval/rollback/audit/permissions/repair checks;121 existing final-video checks;60 speech fitting/replay checks;80 transition/preflight and29 native transition checks; native exact-duration/offset fixtures; strict full input reconstruction with runtime-state/time changes and true creative/version/cancellation negatives; TypeScript and focused lint. Final GET-only before/after comparison confirms execution/job, packages, operations, scenes, events, approvals and upstream records unchanged, including12 consumed requests and the same final hash. Read-only inspection scripts are `inspect-m10-review.ts`; local-only analysis scripts are `analyze-m10-snapshot.ts` and `inspect-m10-media.ts`. No live approval retry, repair, storage upload/deletion, new candidate or deployment acceptance is claimed.

## Saved Scene 2 speech timing and local recovery (2026-10-29)

**Current execution inspected read-only; source fixed and local/static tests passed. No provider/worker/recovery, new intent, amendment, live asset/accounting write, approved-content change or deployment occurred. No new migration is required for this local recovery; the existing 074 path is already in use.** This is the latest execution snapshot; older binding/Design snapshots below remain historical.

### Exact failure and saved evidence

Execution `62e93717-9e00-486e-b968-a85f272b831d` stopped at Scene 2 speech operation `d8abba4b-eca1-49f9-ab45-639c20f99a61`, ElevenLabs `eleven_multilingual_v2`, attempt 1, request `6G0QlOkRqSH8hU90LCHx`. The approved text is **Smooth and ready.**, from **6200 to 7600ms**, an exact **1400ms** window. The successful request used speed **1.0**. There is no provider rejection: the adapter retained a successful response, decoded its audio, and saved both original and normalized alignment before local duration validation failed.

MP3 container duration is **1488.980ms**, rounded to **1489ms** by the old worker. Its exact rejection condition was `metadata.durationMs > line.endMs - line.startMs + 50`: **1489 > 1450**. Thus the measured container was **89ms over the nominal window**, **39ms above the existing tolerance**. Decoded 48kHz PCM has **69103 samples / 1439.646ms**, rounded **1440ms**. Raw original alignment spells the exact approved text and ends at **1440ms**; normalized alignment is also retained. Container padding accounts for about 49ms of the discrepancy but decoded audio is still about 40ms longer than the strict window.

Original MP3 bytes (24284) are saved in `.source.bytes`, SHA-256 `fb38c7553e67aa4fa8aee6d851059f68ccaa3a1ef2b9117424278ecff6a49fe8`. The original provider response (33310 bytes), including base64 audio and timestamps, is saved locally and in R2 with matching proof SHA `b998f074a295041c452a438f3ddf639d509d988dc17aea94eec5aab3362d0536`; decoded response audio matches the saved source. The operation is **result**, with output null: speech succeeded and remains recoverable, but no validated standalone Scene 2 speech asset has been published. Observed provider `character-cost` is **7 credits**; the existing included-credit contract records **$0 immediate USD**. The original 17-credit estimate stays conservatively reserved; the intent is consumed and is not refunded. No provider invoice/account balance was queried.

### Fitting policy and source behavior

`lib/speech-timing/plan.ts` derives a provider-neutral integer-permille target from exact text/window and configured pace: max(words/2.3, nonspace Unicode characters/16) natural seconds, 10% window headroom capped at 200ms, baseline pace 0.9/1.0/1.1, upward rounding to hundredths, and supported speed 0.7..1.2. Infeasible requests fail before admission; targets are never silently clamped. These are conservative heuristics, not provider duration guarantees. Existing hard words/characters/action/timeline constraints remain intact. Schema-2 Storyboard validation, Package validation and final preflight share the additional timing gate. Before new TTS, its neutral target is included in immutable operation input/fingerprint; the adapter alone maps that target to voice_settings.speed and continues using `/with-timestamps`. Scene 2's future estimate selects **1.04**, with 140ms planning headroom. A hypothetical measured-duration retarget would be **1.15** (ceil(1440/1260 to hundredths)); it is not needed or submitted here, and estimates never guarantee a future voice result.

`speech-fitting.ts` decodes all source samples to PCM, compares actual duration/alignment against the exact window, then uses FFmpeg **atempo**, with an explicit maximum **1.080×** and 25ms fitting headroom. The policy permits no slowdown/stretch to fill silence. It performs no silence removal, waveform cutoff, `-t`, text rewrite, pitch-shifting or word deletion. This conservative engineering limit is not an auditory-quality guarantee. WAV avoids reintroducing MP3 encoder padding. Final measured output must fit the strict window, rather than loosening the old tolerance. Original provider response/source/alignments remain intact; receipt.speechFit records source hash, both durations, policy/tempo, output duration and a separately marked linear-tempo alignment approximation. It is not a fresh transcription. FFmpeg atempo and PCM encoding capabilities are checked before future paid work.

The real saved Scene 2 source was tested **only in temporary copies**. **1.048× tempo** produced a **1387ms WAV**, **13ms inside** the 1400ms window. Derived alignment ends at **1374ms**. No edge silence or speech was cut. The original source remained unchanged and the test WAV was not published. **Existing audio is safely reusable within the configured technical policy; another ElevenLabs request is unnecessary.** Ready Scene 1 outputs and Scene 2 video are reused untouched.

On out-of-policy fitting, the worker preserves saved speech, records precise local fitting failure evidence and stops with `FINAL_SPEECH_RETRY_REQUIRED`. Recovery is disabled for that outcome and UI exposes a separate blocked **Retry failed stage** review notice; it never silently submits another TTS. Existing amendment RPC categories remain Design/binding, so a future TTS replacement needs separate controlled stage-retry review/support and, for this budget, an explicit +1 amendment before it can be admitted. No TTS replacement or new amendment was enabled/created in this task.

### Exact consumed intents and remaining work

| # | Logical operation / attempt | Operation UUID | State |
|---|---|---|---|
| 1 | Scene 1 video / 1 | a37f6418-51da-477d-aa93-d5f52f264c75 | ready |
| 2 | Voice Design / 1 | bc728e62-7473-41d8-a4f0-9fe50252e2c4 | rejected |
| 3 | Voice Design / 2 | 560fefe1-cc0a-4e69-9bbd-e6b9b2ed7568 | rejected |
| 4 | Voice Design / 3 | 2b10a074-0307-4ad8-ad8f-f5a52af61954 | rejected |
| 5 | Voice Design / 4 | 55e4205f-8fdf-47be-904c-efe5b3084075 | ready |
| 6 | Voice binding / 1 | 284736e6-ee18-444f-97f5-e8d9df693442 | rejected |
| 7 | Voice binding / 2 | 8fafaeb9-474d-403c-924c-21e3db9a9713 | ready |
| 8 | Scene 1 speech / 1 | a498d097-14ab-47ec-b830-fb91e639e78e | ready |
| 9 | Scene 1 lip-sync / 1 | d0cae73d-45d2-40e8-8d5c-769f8b775daa | ready |
| 10 | Scene 2 video / 1 | 81a69c97-5be4-4e79-95e9-e7c5e301fe65 | ready |
| 11 | Scene 2 speech / 1 | d8abba4b-eca1-49f9-ab45-639c20f99a61 | successful result; local timing blocked |

Scene 1 guide/mux operations are local composition records, not provider intents. Scene 1's completed 5s scene, video, speech, sync, designed/saved voice and Scene 2's video are preserved. After locally publishing Scene 2 speech, the sole remaining provider operation is **Scene 2 Kling lip-sync** (one request, estimated $0.07). Guide alignment, scene mux, final composition and validation are local. Thus **11 consumed / 12 effective / 1 remaining is sufficient**. A replacement speech request plus that lip-sync would instead require **13 effective**; none is needed now. USD ceiling stays $7; cumulative estimate is currently $4.692400 and expected completion $4.762400, with $2.237600 margin.

### Exact safe manual continuation

1. Keep the worker stopped while loading/restarting the corrected local source. Keep the existing execution, authorization, package, Storyboard, voice and assets. No SQL/migration or new amendment is needed.
2. On the existing project's Final Video, Check status, then **Recover saved work**. This queues the same execution in provider-free recovery mode.
3. Run `npm run worker:ugc -- --final-video-only`. For this persisted state it reuses Scene 1 and Scene 2 video, fits the saved Scene 2 speech and saves its WAV/proof without a new ElevenLabs call. It can prepare the local guide, then deliberately stops **before** creating Scene 2's new lip-sync intent with `FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST`. Consumption stays **11/12**.
4. Check status, review the existing **Resume authorized processing** confirmation and confirm only when ready for the final authorized fal.ai lip-sync. The worker then uses the last request (**12/12**) and completes local composition/final review. A new execution or TTS retry is unnecessary. No step above was executed during implementation.

To repeat GET-only evidence inspection and the temporary-copy timing test (no real output/state writes):

```powershell
node --env-file=.env.local --conditions=react-server --import=tsx scripts/inspect-final-video-execution.ts 62e93717-9e00-486e-b968-a85f272b831d --speech-timing --storage
```

`--storage` lists existing R2 objects only; `--speech-timing` reads saved local source/response, verifies their hashes and measures/fits disposable copies. It never publishes a WAV, calls a provider or modifies the real spool/records. `npm run test:ugc-final-speech-timing` uses synthetic local fixtures/replay only and verifies timing limits, infeasible speed, unchanged hard budgets, pitch conservation, repeatable output, original source/alignment preservation and strict fit validation.

## Saved Voice Design and binding-only replacement (2026-10-29)

**Adapter/retry source fixed and offline checks passed. Manual migration 074 after the already-used 073 is required; it has not been applied by this investigation. No real amendment, retry, worker or provider call occurred.** This extends the supported categories below without changing the original authorization/configuration hash, approved package, CharacterVoiceProfile or terminal operation history.

Execution `62e93717-9e00-486e-b968-a85f272b831d` has six consumed intents: preserved Scene 1 video, rejected Design attempts 1–3, saved Design attempt 4, and rejected binding attempt 1. Its three existing +1 amendments make 11 effective requests. Binding rejected POST `/v1/text-to-voice` with retained HTTP 400 / `invalid_labels` / `Each label value cannot exceed 50`. The persisted labels were `application: sceenyk` (7 characters) and `profile: a06659fcfa3e9066ef4f8318a70d580f21a1cd11a8feb4ecf2d7959db9f87891` (64). The profile identifier is a full local digest, unsuitable for the provider's optional short labels.

The adapter now emits only `labels: { application: "sceenyk", language: "en" }`. It keeps the unchanged detailed description in `voice_description`; it omits the profile label instead of truncating the digest. Every outgoing label passes a local 50-character limit, with `FINAL_VOICE_LABEL_VALUE_LIMIT:<offendingKey>` before HTTP submission. No adapter identity/version or approved profile is changed by this optional metadata correction.

Design attempt 4, operation `55e4205f-8fdf-47be-904c-efe5b3084075`, is ready with `receipt.result.previewRef = U3O1s7WmOkd2DHV7Di0f`. This is the saved `generated_voice_id` required by [Create Voice](https://elevenlabs.io/docs/api-reference/text-to-voice/create). It exactly matches binding attempt 1's saved request and its input preview fingerprint matches Design attempt 4. The local 158868-byte MP3 hashes to the persisted `f7b1d6d90f1c33035ea358e7eb94f26a21932522570a042314ea13e7de74215a`; the 695759-byte saved response matches its persisted recovery hash. R2 LIST confirms both objects' sizes/ETags and the preserved Scene 1 objects. No remote preview validity/expiry probe was made. Missing/mismatched saved identifiers or output proofs block replacement; they never cause automatic Design regeneration.

The binding category is narrowly `voice_binding` / `provider_labels_corrected` / retained POST 400 `invalid_labels`. Approval requires the same unbound profile, latest completed Design and exact preview fingerprint/identifier, operator confirmation, current package and output integrity, fresh quote, +1 request and **zero** additional USD. SQL preserves failed binding attempt 1 and creates `voice:binding:attempt:2` with a new fingerprint linked to that failure/amendment. Existing ready Design/video operations resolve before adapter submission, including after worker restart. An uncertain admitted binding is reconciliation-only, never an automatic third attempt.

The proposed fourth amendment changes **6 consumed / 11 authorized / 5 remaining** to **6 / 12 / 6** before replacement admission, then **7 / 12 / 5** after binding attempt 2 admission. The remaining five normal requests are two speech, two lip-sync and Scene 2 video. Binding uses zero additional credits and zero immediate USD; it does not repeat the 119-credit Design request. Conservative Design reservations remain `4 × 119 = 476`; remaining speech uses `5 + 17 = 22`, for 498 reserved/projected against the existing 9981-credit configured snapshot, subject to the server's shared-allowance admission check. Failed-attempt reservations are not silently refunded. Full immediate expected USD remains **$4.762400** (`2 × $2.311200` videos + `2 × $0.070000` sync), leaving **$2.237600** under $7. Actual billing remains separate/unknown where no usage was returned.

### Manual binding retry for the existing execution

1. Keep the local worker stopped. Review/apply only `supabase/migrations/20261029007400_ugc_final_binding_retry.sql` after 073. It changes constraints/guards/RPC definitions and performs no execution/accounting/asset data repair. Do not edit `UGC_FINAL_AUTHORIZATION` or create a new execution.
2. Restart the local application using this source and the existing authenticated configured operator. Open the existing project's Final Video and Check status. Review **Retry failed stage: Voice binding**, HTTP 400 label correction, zero replacement credits/USD, +1 request, resulting effective 12, and preserved Design/video. The immutable original maxRequests remains 8.
3. Confirm the correction/amendment checkbox and click **Retry failed stage** once. This atomically appends the fourth amendment and queues the same execution. Before the worker claims it, the inspector should show 6/12 with six remaining. Repeated submission of the same amendment UUID is idempotent.
4. When ready to submit the corrected binding and continue the five remaining normal stages, run `npm run worker:ugc -- --final-video-only`. It reuses Scene 1 video and Design attempt 4, submits only the replacement **binding** for the failed stage, saves the reusable `voice_id`, then continues the pipeline. Binding admission gives 7/12 with five remaining. No Design/video replacement is authorized by this action.
5. **Recover saved work** cannot retry the terminal rejected binding. After an uncertain request/restart, recovery can reconcile that same intent/replay saved output/storage without a new POST; missing evidence stops safely. Provider-free recovery stops before new downstream intents; **Resume authorized processing** requires a separate displayed confirmation. Exhaustion blocks new intents and never resets counters. Twelve requests allow the expected completion with no further replacement capacity.

Read-only inspection (the optional storage flag performs R2 LIST only):

```powershell
node --env-file=.env.local --conditions=react-server --import=tsx scripts/inspect-final-video-execution.ts 62e93717-9e00-486e-b968-a85f272b831d --storage
```

The inspector now reports original binding payload/label lengths, saved Design linkage and a separately named proposed corrected payload. It never rewrites the historical payload. `npm run test:ugc-final-binding` exercises synthetic migrations through 074, 50/51-character labels, omission of long metadata, response replay with no HTTP, Design reuse, immutable binding history, +1 accounting and lease/recovery fencing. Static UI diagnostics include binding-specific confirmation and pending/failed history. Real retry/provider acceptance remains manual and pending.

## Controlled request amendments and Voice Design retry (2026-10-28)

**Implemented in source; migration 073 and real acceptance remain manual/Pending.** This section supersedes the earlier statement that no amendment/replacement path exists. Implementation did not create an execution/amendment, queue a real retry, contact a provider, edit private funding authorization, alter approved content or delete media.

### Supported reviewed replacement

The first supported scope is a rejected **Voice Design POST**, stage voice_design, after an operator-reviewed HTTP 403 permission correction. Other rejection categories, successful stages, stale packages, bound/changed profiles, active leases and uncertain submissions fail closed. Legacy failures without a retained status can be reviewed as 403 using explicit operator attestation; the original receipt/status is never backfilled or rewritten. No claim of remote permission verification is made.

Separate server-only UGC_FINAL_OPERATOR_USER_ID must equal the authenticated execution owner's app-user UUID. It defaults to disabled and is not part of the original configuration hash. The operator checks a confirmation stating that the 403 was reviewed, permissions were corrected and the displayed request/cost amendment is approved. No request is queued by viewing a quote. The server checks actor/scope, exact original configuration hash, current package/approved assets and fresh byte/ETag/SHA-256 integrity for successful outputs before committing approval.

### Data and accounting

New private append-only ugc_final_authorization_amendments records: amendment UUID; execution/owner/project; original authorization UUID and configuration hash; immutable package hash and CharacterVoiceProfile ID; exact failed operation ID; stage/reason; additional request allowance (one); optional additional micro-USD allowance; authenticated operator UUID, approval/correction flags and reviewed 403 status; exact quote/hash; database creation timestamp. No caller supplies an actor identity. UPDATE/DELETE are forbidden, including after consumption. Service-role writes go through the scoped RPC; browser roles have no table/RPC privileges.

Effective requests = original maxRequests + approved amendment allowances. Effective USD = original maxEstimatedCostMicrousd + approved additional cost allowances. Original configuration/authorization/hash remain immutable. Approved extra request slots are consumed only by their specific replacement attempts; ordinary first attempts retain their original request allocation. Intent admission increments existing counters exactly once, preserving failed/uncertain intent usage. No refund/reset occurs.

| Existing case | Original allowance | Amendments | Effective | Consumed | Remaining |
| --- | ---: | ---: | ---: | ---: | ---: |
| Current persisted execution, not changed here | 8 | 0 | 8 | 2 | 6 |
| After manual amendment approval, before replacement intent | 8 | +1 | 9 | 2 | 7 |
| After replacement intent is admitted | 8 | +1 | 9 | 3 | 6 |
| After all six remaining normal provider intents | 8 | +1 | 9 | 9 | 0 |

The quote recomputes sunk/known cost using the larger of admitted independent estimate and observed actual USD, plus the independent replacement estimate and every unstarted planned stage. It never uses ceilings as estimates. For the reported state: known/sunk estimate $2.311200; replacement Voice Design 119 credits / $0 immediate USD; remaining pipeline $2.451200; projected immediate total $4.762400; effective USD authorization stays **$7**, no extra USD needed. Historical actual bills remain unknown unless provider usage supplies evidence.

The original failed design's 119-credit reservation stays held. A replacement adds 119, remaining speech adds 22, for **260 conservatively reserved/projected included credits** against the reported/configured 9981-credit snapshot, assuming no other account-snapshot reservations. Quotes read shared reservations and the database serializes/rechecks them; no paid rate or automatic overage is invented. The live quote, not this example, is authoritative if other executions consume that snapshot.

Quote hashes use integer micro-USD/credit counts and textual fractional pricing quantities, preserving the existing package hash recipe. They bind execution version, immutable scope, all operation fingerprints/states/timestamps, current counter, independent cost projection and shared included-credit reservations. Changes between review/confirmation reject the quote. Extra USD, if necessary, is proposed explicitly and must be confirmed; it never silently expands authority.

### Stage-only operation and recovery

The amendment queues the **same execution**, with dispatch_mode=retry; it does not admit or submit a provider request in the HTTP action. The worker verifies current assets and preserved ready outputs, reuses Scene 1's exact video, and resolves Voice Design to a new physical intent voice:design:attempt:2 with attempt=2, a new scoped fingerprint, logical key voice:design, supersedes_operation_id and amendment_id. Attempt 1 remains failed and immutable. Duplicate approvals/clicks and repeated claims resolve the same amendment/intent; no fork or duplicate counter/credit reservation.

The replacement retains execution/package/CharacterVoiceProfile. Its new preview fingerprint feeds the existing identity binding/speech/lip-sync/Scene 2/FFmpeg pipeline. Completed scene/video/audio operations continue to reuse stored outputs. Initial and explicit retry/resume modes permit only finite approved normal/replacement intents. Restarting an uncertain replacement reuses its existing intent/receipt/response and never creates attempt 3 automatically. HTTP GET errors are reconciliation failures, not permission to repurchase a POST.

Recover saved work now sets dispatch_mode=recover and **cannot create any provider intent**. It can GET known results, replay saved successful responses, retry storage and perform local composition. Missing/failed uncertain output cannot become a new POST. If recovery reaches an unstarted authorized stage or an approved but unsubmitted replacement, it stops with FINAL_RECOVERY_NEEDS_PROVIDER_REQUEST and exposes a separate confirmed **Resume authorized processing** action. That action rechecks preserved work, current scope, request/USD and included-credit capacity before queuing authorized continuation. A terminal rejected stage itself uses Retry failed stage, never Recover.

UI shows immutable attempt history, operator-reviewed 403/amendment UUID, pending/active/completed replacement, original/amended/effective/consumed/remaining requests, replacement credits/immediate USD, sunk/remaining/projected USD, proposed USD allowance, preserved work and quote-specific confirmation. Invalid/missing operator setup or stale/unsafe scope blocks the button. No generic provider picker or per-scene creative workflow was introduced.

### Exact manual steps for the existing execution

1. Keep the worker stopped. Review and manually apply **supabase/migrations/20261028007300_ugc_final_authorization_amendments.sql after 072/prerequisites**. This task does not apply it. The migration preserves original rows/receipts/configuration, adds immutable amendments/linked attempts/dispatch mode, and replaces only final action/checkpoint admission behavior.
2. Obtain the owner UUID with this read-only query (or the inspector's --operator-setup option):

```sql
select owner_user_id from public.ugc_final_executions
where id = '62e93717-9e00-486e-b968-a85f272b831d';
```

3. Set only **UGC_FINAL_OPERATOR_USER_ID=<that app-user UUID>** in the private local environment. Leave UGC_FINAL_AUTHORIZATION, its authorization ID, maxRequests=8, $7, pricing snapshot and provider identities unchanged. Retain the corrected restricted ElevenLabs key permissions. Restart the local app with this source/configuration; sign in as that same owner/operator. No provider permission probe is required/performed.
4. Open this existing project's Final Video tab and Check status. Confirm the existing execution ID via read-only inspector, preserved Scene 1 video, attempt 1 rejected, +1 request amendment, effective budget 9, replacement 119 included credits / $0 immediate USD, projected total $4.762400 and $7 ceiling. Refresh/review if the live quote differs or is blocked. Do not choose Generate Final Video or delete/reset anything.
5. With the worker still stopped, check the explicit permission-correction/operator-approval confirmation and click **Retry failed stage**. This persists the immutable amendment and queues this same execution. It does not itself contact a provider. Check status/inspector: original budget remains 8, amendment +1, effective 9, consumed 2, remaining 7, replacement pending. No new execution should appear.
6. **Only when ready to execute the separately approved provider work**, manually start the final-only worker:

```powershell
node --env-file=.env.local --conditions=react-server --import=tsx scripts/ugc-worker.ts --final-video-only
```

This step can submit the replacement Voice Design and continue all remaining normal provider stages automatically. It is not run during implementation. After replacement admission expect consumed 3 / remaining 6. Scene 1 video must remain the same saved object/hash. If the outcome is uncertain, stop for reconciliation; do not authorize another replacement or reset the intent.
7. If a later provider-free Recover stops at an unstarted stage, review the effective budget and use the separate confirmed Resume authorized processing action. When final composition/validation finishes, use the normal final review/approval flow.

Read-only verification (does not start processing):

```powershell
node --env-file=.env.local --conditions=react-server --import=tsx scripts/inspect-final-video-execution.ts 62e93717-9e00-486e-b968-a85f272b831d --storage --operator-setup
```

The inspector reports original and effective authorization separately; original maxRequests=8 is expected even after an amendment. Before 073 it reports retrySchemaAvailable=false. No live retry/worker, provider account access, remote migration/concurrency, browser or final provider acceptance is established by offline tests.


## First real provider failure and diagnostic correction (2026-10-28)

[Full read-only investigation](m10-first-provider-failure.md) records execution 62e93717-9e00-486e-b968-a85f272b831d: Scene 1 fal video completed and remains in local/R2 storage; the subsequent global ElevenLabs Voice Design request was rejected with no retained status/body/request ID. The actual remote reason/billing is unknown. Its reconstructed text-only payload matches the official contract; no payload workaround or approved-content change is justified. Two intents used, one success, one rejection, 6/8 capacity left; a design replacement plus remaining planned stages would need seven more requests (nine overall), and the existing attempt=1 contract does not admit a replacement. No authorization was changed.

Future diagnostics preserve sanitized HTTP/provider error evidence and a redacted request snapshot/hash separately from successful response replay. UI/server block terminal rejected-request saved-work recovery. Before this fix, Recover for this exact state would reuse the video then stop at the existing failed design, with no provider request; for other partial states it can submit unstarted authorized downstream stages, now stated before clicking. No recovery was executed, no existing receipts were backfilled and no new migration is required. The existing first video is real partial runtime evidence, not complete M10/provider acceptance.

## ElevenLabs included-credit profile (2026-10-28)

This section supersedes the earlier USD-unavailable state and public-list speech USD estimate below for the explicitly configured local profile. The owner reports a Free account with 10000 included credits, 19 used and 9981 remaining. No provider account request was made. A separate UGC_FINAL_PRICING setting in ignored .env.local now freezes that 9981-credit allowance; UGC_FINAL_AUTHORIZATION, its $7 limit/maxRequests=8 and the approved package are unchanged.

| Operation | Estimated credits | Immediate estimated USD |
| --- | ---: | ---: |
| Voice Design, fixed 119-character audition | 119 | $0 |
| Scene 1 Multilingual v2 speech, 5 characters | 5 | $0 |
| Scene 2 Multilingual v2 speech, 17 characters | 17 | $0 |
| Voice identity save (one slot/request) | 0 | $0 |
| ElevenLabs total | **141** | **$0** |
| fal Seedance, two 5s scenes | n/a | $4.622400 |
| fal Kling lip-sync, two 5s scenes | n/a | $0.140000 |
| Total immediate cost | **141 ElevenLabs credits** | **$4.762400** |

The configured balance after the planned run is **9840 credits**. The unchanged $7 USD authorization has **$2.237600** margin. The read-only approved-package inspector passes video/voice/lip_sync/composition/funding with 8 planned requests against 8 authorized; this is creative/pricing eligibility, not proof that manual database migrations are installed or provider execution has passed.

Voice Design charges the preview text once for all three candidates. Multilingual v2 consumes one credit per Unicode dialogue character, including punctuation and spaces. Sources checked again: [Voice Design](https://elevenlabs.io/docs/eleven-creative/voices/voice-design), [V2 Multilingual credit rule](https://elevenlabs.io/pricing). Code returns both estimatedCredits and estimatedUsdCost, retaining integer estimatedCostMicrousd for the existing USD gate. Included-credit source is configured_included_credits. Identity save retains one request/slot with zero credits and USD.

Configuration is explicit, independent of authorization, and strict:

```json
{"elevenLabsIncludedCredits":{"allowanceId":"<reviewed-account-snapshot-UUID>","remainingCredits":9981}}
```

Reuse that snapshot UUID across every local run using the same provider allowance. Database reservations reduce the shared configured allowance; failures/unknown outcomes remain conservatively reserved and recovery reuses an existing intent. The inspector reports the configured provider-balance snapshot, not a fresh account balance or current database reservation total. Runtime admission rechecks reservations. Do not rotate the UUID or reset remainingCredits merely to replenish budget. External account usage, billing-cycle renewal and snapshot refresh require reconciliation against the provider; no automatic monthly reset or account polling exists.

For later paid/PAYG use, replace included mode with an operator-reviewed elevenLabsMicrousdPerCredit in UGC_FINAL_PRICING. For a paid subscription with remaining included credits, included mode still describes incremental USD cost without allocating the subscription fee to requests. Both modes together are rejected; no automatic overage fallback. Missing both modes makes ElevenLabs USD estimates unavailable. Optional voiceDesignPreviewText remains available. No paid USD-per-credit rate has been invented or configured.

Full-package preflight sums all ElevenLabs stage credits and blocks ELEVENLABS_CREDIT_ALLOWANCE_EXCEEDED before any paid intent if the total exceeds the configured allowance. Over-limit runs have no usable whole-run USD estimate; they never silently turn into paid overage. The fal-specific USD subtotal and unchanged per-stage/whole-run USD ceilings remain independently enforced. An exhausted included allowance does not become a free-work override.

Manual **072 after 071/prerequisites** updates only the existing service-only checkpoint function, preserving earlier migrations unchanged. It validates integer credit evidence, accepts zero immediate USD only for explicit included mode/free binding, acquires a shared transaction lock on the allowance UUID, sums reserved credits across executions (or observed actual credits if larger), and rejects new excess with ELEVENLABS_CREDIT_ALLOWANCE_EXCEEDED. Mismatched limits under the same snapshot UUID fail ELEVENLABS_ALLOWANCE_SNAPSHOT_CONFLICT. New intents persist credit evidence in existing operation input; recovery does not reserve twice. Existing receipt/output/failure/composition/recovery/grant branches are preserved. No new tables/columns/triggers. The worker refuses a database response missing creditAllowanceEnforced. **072 is unapplied; database/runtime acceptance remains Pending.**

Actual credits are recorded only from observed provider usage. Under included mode, actual immediate USD is recorded as zero only when that observed usage fits the operation's reserved credits; absent usage or excess leaves actual USD unknown. Paid mode continues to value observed usage at its reviewed account rate. Estimates are never substituted for actual usage.

Rerun from the repository root:

```powershell
node --env-file=.env.local --conditions=react-server --import=tsx scripts/inspect-final-video-preflight.ts 1fe9e8ab-88a6-4700-ac70-e1175d36ba17
```

Validation is limited to pure pricing/preflight/static checks and GET-only package inspection. No provider API, worker, media generation, SQL application or deployment.


## Independent provider pricing (2026-10-28)

This section supersedes the historical ceiling-as-estimate diagnostics below. Authorization is permission only. Expected provider cost is calculated independently; actual provider cost remains null until observed usage/billing metadata supports it. No authorization ceiling is ever substituted for missing pricing.

Read-only inspection of approved package 1fe9e8ab-88a6-4700-ac70-e1175d36ba17 (revision 2, command version 6) verifies two 5-second 720x1280 scenes, speech lengths 5 and 17 Unicode characters including punctuation/spaces, and two full-scene lip-sync operations. The fixed Voice Design audition repeats the approved dialogue to 119 characters, therefore 119 credits (charged once for three previews). All four creative layers pass. Package/hash, authorization and live state remain unchanged.

| Stage | Exact rule | Expected USD |
| --- | --- | ---: |
| Scene 1 video | 720 x 1280 x 5 x 24 / 1024 = 108000 tokens; 108 x $0.0214 | 2.311200 |
| Scene 2 video | Same 5-second request; reference images are not billable video input | 2.311200 |
| Voice Design | 119 preview characters x 1 credit/character = 119 credits; USD/credit unconfigured | Unavailable |
| Identity save | No separate generation charge; one custom voice slot and one request | 0 |
| Scene 1 speech | 5 characters x published direct API $0.08 / 1000 | 0.000400 |
| Scene 2 speech | 17 characters x published direct API $0.08 / 1000 | 0.001360 |
| Scene 1 lip-sync | ceil(5/5) x 5 seconds x $0.014 | 0.070000 |
| Scene 2 lip-sync | Same full 5-second video; not just speech window | 0.070000 |
| Known subtotal | Excludes unpriced design, not a full estimate | **4.764160** |

Full expected total = **$4.764160 + 119 x account USD/credit**. Full total and remaining authorization margin are null until design pricing/quantity is known. Unallocated amount before design is $2.235840 of the unchanged $7; no claim of full funding sufficiency is made. Existing design ceiling is $0.20, separately enforced. Each request cost rounds upward to integer micro-USD. Seedance uses its authoritative token formula, not its approximate per-second marketing figure. Billing FPS is 24 even though local final output is 25fps. No video reference or native-audio surcharge is invented. Only exact configured model/provider identities are priced.

Sources checked 2026-10-28: [Seedance token rule](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video), [Kling increments/rate](https://fal.ai/models/fal-ai/kling-video/lipsync/audio-to-video), [Multilingual v2 direct API list rate](https://elevenlabs.io/pricing/api), [Voice Design charging/save rule](https://elevenlabs.io/docs/eleven-creative/voices/voice-design), [Voice Design text limits](https://elevenlabs.io/docs/api-reference/text-to-voice/design). Speech defaults to the published direct API list rate; an explicit account USD/credit contract overrides it. Subscription discounts, tax and the actual account invoice are not inferred.

Voice Design now prepares a fixed audition by joining approved speech in scene order, repeating it until at least 100 Unicode characters and capping the audition at the provider's 1000-character limit. This is audition text only; approved scene words/package stay untouched. The adapter always submits exactly that text with auto_generate_text=false and rejects absent/out-of-range preview text before I/O. Preview character count and estimatedCredits are reported even when its USD rate is missing. Per the owner's explicit instruction, the live account USD/credit rate remains unconfigured, so paid execution fails COST_ESTIMATE_UNAVAILABLE. No rate is invented from the authorization ceiling or the separate speech list price.

Later the operator can configure UGC_FINAL_PRICING as a strict JSON object with elevenLabsMicrousdPerCredit (positive integer, reviewed against the account contract). Optional voiceDesignPreviewText (100..1000 Unicode characters) overrides the derived audition. Without an override the preview is deterministically derived from the approved package. Invalid pricing blocks; missing USD/credit blocks design only while still reporting its credits. No private environment file was edited. No sample account rate is asserted as a live contract. Pricing is frozen/hashed with the execution and the derived preview is bound to the approved package and durable operation input. Configuration changes require refreshed consent and cannot silently update existing runs.

Actuals are in existing operation receipt.usage: providerCharacterCost captures observed ElevenLabs response-header credit usage; an explicitly configured account conversion can record actualCostMicrousd with actualCostSource=observed_provider_credits_at_configured_account_rate. Without that conversion, actual USD remains null. fal usage/billing metadata is preserved when returned; fal's queue output has no guaranteed USD bill, so no USD value is fabricated. Actuals never overwrite estimates or alter spending permission.

There are **8 planned requests against maxRequests=8**: 2 video + 1 design + 1 free identity save + 2 speech + 2 lip-sync. This is sufficient for a clean run with zero replacement allowance. The conservative plan includes design/save even when a compatible identity may be reusable. Existing-intent polling, receipt/spool replay, saving and local composition recovery use no new intent. Once all eight intents are admitted, a new one fails FINAL_BUDGET_EXHAUSTED; Recover does not reset counters, grant permission or replay failed/unknown POSTs. Current one-attempt operations require reconciliation rather than a paid retry. Any future paid replacement needs a separately authorized recovery design/budget; increasing the limit alone does not enable it.

Manual migration **071 after 070/prerequisites** changes only the existing service-only checkpoint function: validate/persist independent pricing evidence in operation input, use its estimate for cumulative admission, enforce unchanged per-stage ceilings, and count the free binding API request. Existing tables/columns, grants, currentness, leases, recovery and completion rules are preserved. No rows or prior migrations are rewritten. The worker refuses provider I/O if persisted estimate/evidence still reflects 069 behavior. Migration 071 remains **unapplied**; database/runtime acceptance is Pending.

Rerun the read-only inspector from the repository root:

```powershell
node --env-file=.env.local --conditions=react-server --import=tsx scripts/inspect-final-video-preflight.ts 1fe9e8ab-88a6-4700-ac70-e1175d36ba17
```

Validation in this unit is limited to pure pricing/preflight and static checks. No provider API execution, media generation, worker, SQL application, package mutation, authorization edit or deployment.


## Canonical V1 execution recovery (2026-10-28)

Current source supersedes the older schema-1/contiguous-only compatibility descriptions below. Storyboard schema 2 and package schema/compiler/prompt 2 share `lib/execution-v1/contract.ts`, with `executionVersion=ugc-execution-v1` in packages. Historical schema-1 hashes/content remain readable and unchanged; new approval/admission requires the canonical contract. Composition remains responsible for transitions, not the video or lip-sync provider.

* Transition: `{type: none|cut|crossfade|fade_in|fade_out, durationMs}` plus descriptive `transitionNote`. Cut/none require zero; other transitions require 40ms-aligned positive duration <=2000ms, strictly inside involved source scenes. Source durations are whole-second 4..30s; Character dialogue scenes <=10s. Default planning uses 1×5s / 2×5s / 5×6s and cuts. Explicit overlaps are valid only when source intervals account for them and source-duration sum minus overlap equals selected 5/10/30s. 6s + 5s minus 1s overlap = 10s; two contiguous 5s clips with 400ms crossfade fail. Fades occur within scenes. No pad/freeze/stretch or guessed transition timing.
* Sound: `{requirement: none|optional|required, description, assetId}` separates creative cues from executable requirements. V1 has no music/SFX provider or owned-audio manifest integration. Only none/optional with null asset binding pass, and these descriptions are explicitly not generated/mixed. A required missing/fake binding fails, never masquerades as supplied audio. Speech/narration remain required exactly as approved.
* Delivery: finite pace/energy/tone/emphasis/style, validated before approval and mapped inside the ElevenLabs adapter. Performance prose is retained separately in `deliveryNote`, without becoming a provider command. Speech words/windows/Character bindings stay exact.
* M9 Prepare/worker/Approve run pure video/voice/lip-sync/composition capability checks. Insufficient budget is a separate M10 funding issue. No paid request precedes the full final preflight, scoped SQL admission, operation fingerprint and finite attempt/spend gate.

### Inspected project and proposed recovery

The approved schema-1 Storyboard/package remain unchanged: Scene 1 **`Dissolve into the next shot.`**, Scene 2 **`Fade out cleanly.`**, two contiguous 5000ms intervals. A GET-only local repair preview now passes all creative layers at exactly 10000ms; its sole remaining issue is `EXECUTION_BUDGET_INSUFFICIENT`. This is a preview, not a saved/reapproved project.

**Review local V1 execution repair** clones the existing document in Studio and displays proposals before saving: Scene 1 cut/0ms (explicitly changes the dissolve intent to preserve current timing), Scene 2 fade_out/400ms, six optional audio cues with original wording, normalized delivery plus original performance notes. Owner may edit these values. Unknown creative transitions remain unresolved. Save forks a new review revision through the service-only scoped/idempotent repair RPC; Accept is separate. Original approved Storyboard, requests, package and assets remain intact. Future saves/approvals are privately snapshotted. A **new immutable Generation Package is required** because executable requirements/version/hash change. No OpenAI/provider call is needed for this repair or package compilation.

### Historical ceiling-based cost diagnostics (superseded)

GET-only inspector results from the unchanged configuration:

| Operation | Configured per-request ceiling / estimate |
| --- | ---: |
| Scene 1 video | $6.25 |
| Scene 2 video | $6.25 |
| Voice Design | $0.20 |
| Voice identity save | $0.01 |
| Scene 1 speech | $0.10 |
| Scene 2 speech | $0.10 |
| Scene 1 lip-sync | $0.20 |
| Scene 2 lip-sync | $0.20 |
| Total | **$13.31 (13310000 micro-USD)** |

Total authorization remains **$7.00 (7000000 micro-USD)**; requests **8/8**. These are the existing configured operator ceilings used conservatively as estimates (`source=configured_operator_ceiling`), not independently verified provider tariffs or actual bills. No price, authorization, account funding or customer-credit behavior is changed. Inspector emits each provider/model, stage ceiling, estimate, attempts, aggregate authorization and optional unsaved repair preview; no secrets.

### Manual safe recovery

1. Keep the final-video worker stopped. Review and manually apply **070 after 069/prerequisites** using the normal database migration process. This task does not apply remote SQL. Restart the local app with the updated source and the same private configuration.
2. Open the existing approved Storyboard. Choose **Review local V1 execution repair**. Review every displayed creative change and finite setting, including proposed cut/0ms, final fade/400ms and optional sound. Save; this creates a new review revision. Review and **Accept Storyboard**. Do not use Generate Storyboard, retry paid generation, delete/reset assets or edit old database JSON.
3. With `UGC_PACKAGE_ENABLED=1`, start only the package consumer: `node --env-file=.env.local --conditions=react-server --import=tsx scripts/ugc-worker.ts --packages-only`. Choose **Prepare Generation Package**, inspect the new immutable result and **Approve Package**. This consumer performs deterministic compilation/private input verification, not provider generation. Stop that consumer when done.
4. Run `node --env-file=.env.local --conditions=react-server --import=tsx scripts/check-final-video-config.ts`, then `node --env-file=.env.local --conditions=react-server --import=tsx scripts/inspect-final-video-preflight.ts <NEW_PACKAGE_UUID>`. If no UUID is supplied and history includes multiple approvals, the inspector lists IDs/revisions for selection. `--repair-preview` is optional, never saves, and is primarily for legacy diagnosis.
5. Review the current independent pricing section above and rerun the inspector. The older $13.31 ceiling sum is not a provider estimate and does not justify increasing authorization. With Voice Design USD/credit unconfigured, COST_ESTIMATE_UNAVAILABLE blocks execution. Preserve all ceilings/request limits/funding mode.
6. Only after the new package is current/approved and every preflight layer passes, restart app/worker for matching configuration hashes and refresh the UI/cost consent. Manually start `node --env-file=.env.local --conditions=react-server --import=tsx scripts/ugc-worker.ts --final-video-only`, then choose **Generate Final Video** when ready to authorize paid work. That is outside this task's verification; no generation is started here.

### Focused evidence and limitations

Offline checks cover canonical transitions/delivery/audio, 5/10/30s exact timing and approved overlap, M9 creative eligibility independent of funding, exact configured-cost summation, immutable old Storyboard/package rows through migration/fork/reapproval/new-package approval, scoped idempotence, RLS/grants and LF/CRLF migration reruns. Native FFmpeg fixtures verify fades/crossfades/mixed cuts, duration and absolute voice offsets. Migration 070 remains unapplied remotely; source/runtime/browser/provider/auditory acceptance is not implied by synthetic fixtures. Existing operation fingerprints, one-attempt/uncertain-response recovery and operator-only funding gates remain enforced; customer-credit billing remains disabled.

### Source files in this contract correction

* New canonical contract: `lib/execution-v1/contract.ts`.
* Storyboard: `lib/storyboard/{schema,validation,validation-diagnostics,contract,normalization,prompt,provider,worker,server,correction,execution-repair}.ts`.
* Package: `lib/video-generation-package/{contract,builder,execution,server,worker}.ts`.
* Final execution: `lib/final-video-generation/{providers,preflight,planning,composition,worker}.ts`, `adapters/{elevenlabs,fal}.ts`.
* Review/API: `components/creation/{storyboard-review,generation-package-review}.tsx`, `app/api/ugc/{storyboard,package}/route.ts`.
* Persistence: `lib/db/types.ts`, `supabase/migrations/20261028007000_ugc_execution_contract_v1.sql`.
* Offline fixtures/diagnostics: `scripts/{check-execution-v1,check-storyboard,check-final-video,check-final-video-funding,check-final-video-transitions,final-video-fixture,inspect-final-video-preflight}.ts`; `package.json` adds `test:ugc-execution-v1`.
* Current context: `architecture`, `overview`, `storyboard`, `video-generation-package`, `voice-generation`, `database`, `pricing`, `ui-context`, `final-video-generation`, `progress-tracker` Markdown files. Existing unrelated working-tree changes are retained.

## Status and authority (2026-10-27)

**Milestone 9 — Complete and approved. Milestone 10 — Complete in source for the configured local V1 profile. Runtime/provider/manual acceptance — Pending.** Implemented fal.ai video, ElevenLabs reusable Voice Design/timestamped speech, automatic fal.ai lip-sync, private independent stage recovery and FFmpeg composition with final-only Studio review. Public official API contracts were checked before adapters; real account access, runtime output quality and manual acceptance remain unverified.

The subsequent [implementation authorization](ai-workflow-rules.md#m10-source-implementation-authorization-2026-10-27) supersedes the previous documentation-only task. The source/setup/limits below supersede implementation-status statements in dated planning/assessment sections, while their architectural invariants remain binding. Migration 069 is unapplied remotely; features default disabled. No real paid/provider requests, live database/storage operation, worker process, build/browser suite or deployment ran. Render/Inngest remain disabled.

## Implemented local V1 source and profile

### Composition-owned transitions and preflight (2026-10-28)

Exact approved package revision 1 / command version 6: Scene 1 **`Dissolve into the next shot.`**, Scene 2 **`Fade out cleanly.`**, both strings matching frozen/live approved Storyboard revision 5/version 8. Two contiguous 5000ms scenes fill 10000ms. The old rejection was the global cut/none-only composition policy in `planning.ts`, not Seedance or lip-sync support.

`composition.ts` now defines neutral capabilities, requirements and the normalized composition plan; `capabilities.ts` defines structured scene/layer/code/message diagnostics. Preflight separately validates real video duration/ratio/reference/resolution/format requirements, voice, lip-sync, composition order/type/duration/final timing/audio, and finite funding. HTTP 422 includes all layer issues and a precise first-failure message; no paid admission happens on failure.

| Transition | Supported deterministic interpretation |
| --- | --- |
| Cut | Cut/none/hard cut/straight cut and known cut-to-next-shot wording, zero overlap/duration. |
| Fade | Fade/fade out/fade in and known cleanly/to-black/from-black wording, with explicit duration: e.g. `Fade out cleanly over 400ms.` or `Fade in 0.4 seconds`. Plain fade means visual fade-out. It stays inside its source scene and does not change total duration or dedicated audio gain/offset. |
| Crossfade/dissolve | Equivalent known names, e.g. `Dissolve into the next shot over 1s`, with explicit duration and exactly that approved source overlap. |
| Other creative transition | Precise unsupported scene/requested transition/supported types/composition-layer error; never substituted. |

Non-cut durations must be positive integer milliseconds on the 25fps (40ms) grid, shorter than the source scene(s). **No implicit duration.** Sum of scene durations minus approved overlaps must equal approved final duration: 6000ms + 5000ms with 1000ms approved overlap is 10000ms. Two complete contiguous 5000ms clips crossfaded for 400ms yield 9600ms and must fail; no padding, duplicated/frozen frames, stretching or speech shifting is allowed. Current M9/Storyboard validation requires contiguous intervals, so overlap/handle-capable input is a separate future contract change. Native renderer capability alone cannot authorize a different M9 timeline.

`media.ts` implements FFmpeg fade/xfade and mixed cut composition, normalizes filter time bases, preserves exact speech at absolute timeline offsets and checks plan/count/media/final duration. Needed filters/encoders/FFprobe are verified by the local worker before any paid intent. No FFmpeg subprocess runs in Next.js. Visual transitions do not fade or truncate dedicated speech; declared sound still requires owned assets.

Frozen neutral composition profile: `composition-transitions-v2`; fal visual adapter: `seedance-reference-v2-composition-owned`. The adapter removes only the canonical top-level composition `transition` field from its translated prompt, preserving the immutable original prompt/package/hash and every other visual field. Composition plans persist in final-operation input JSON; existing package/configuration/ordered-scene hashes bind final fingerprints. Existing JSON storage/guards suffice: no migration or private environment edit. Restart app/worker and refresh consent for the new configuration hash; existing runs are not silently upgraded.

Current read-only preflight passes video/lip-sync but remains **ineligible**, because:

- Neither transition supplies a duration, and the dissolve has no approved overlap.
- Both scenes declare music, effects and ambience without owned audio bindings.
- Existing voice mapping rejects `Calm, concise, slight pause before the final word.` and `Natural, confident, with a brief pause between words.`; no rewriting was performed.
- Estimated **$13.31 / 8 requests** exceeds authorized **$7 / 8 requests**. Estimates/caps are unchanged; no funding increase was performed.

Safe retry:

1. Restart the local app and manually restart the final-only worker to load new source/profile; refresh Studio status/consent. No worker is started by this correction.
2. Run `node --env-file=.env.local --conditions=react-server --import=tsx scripts/inspect-final-video-preflight.ts`. It performs one GET of an approved package and pure capability checks, printing exact layer failures and cost bounds. When approved history contains multiple records, it prints available package UUIDs/revisions and requires the exact current package UUID as its only argument; it never guesses which history is active. Studio Check status/Generate still authoritatively recheck current upstream input/version. Current result is `eligible: false`.
3. Decide owner-approved content corrections. For the existing contiguous 10s contract, Cut between scenes and an explicitly timed final fade are compatible. Retaining the dissolve needs separately authorized overlap/handle-capable input support. Preserving required sounds needs an owned-audio integration; otherwise only an explicit owner-approved change to none can remove those requirements. Unsupported delivery needs a supported approved direction or separately implemented mapping.
4. Use Storyboard **Edit → Save → Accept Storyboard**, then prepare/approve a **new Generation Package**. If only the final-only consumer is running, manually use the existing `npm run worker:ugc -- --packages-only` consumer for this deterministic M9 build, with its existing `UGC_PACKAGE_ENABLED=1`; final-only mode cannot claim package builds. Existing approved content is never rewritten automatically. Review any new full-plan estimate and revise funding only by explicit operator authorization; app/worker settings and refreshed consent must match.
5. Repeat inspection. Click **Generate Final Video once only when `eligible: true`** and current cost is authorized. Existing paid-intent/fingerprint/attempt/current-package/version gates remain mandatory.

`npm run test:ugc-final-transitions` exercises pure capabilities and native synthetic FFmpeg pixel/audio/order/duration checks. Existing funding and silent/spoken media fixtures also pass. No provider calls, paid jobs, remote migration, deployment or approved content mutation occurred; real provider/runtime/manual acceptance remains Pending.

### Funding startup diagnostics (2026-10-28)

The reported `FINAL_FUNDING_REQUIRED` startup was a strict authorization-field mismatch: the local JSON contained numeric `ceilings.lipsync`, while the canonical schema/SQL operation kind requires `ceilings.lip_sync`. JSON loading/parsing, funding flags, UUID and finite limits were valid. Configuration now accepts this one unambiguous spelling alias and normalizes it **before** strict validation and configuration hashing; both spellings together are rejected, amounts are never coerced/defaulted and arbitrary unknown fields still fail. Existing canonical authorizations produce unchanged configuration hashes and budgets. No private configuration or approved record is rewritten.

Safe diagnostics distinguish `final_video_disabled`, `local_execution_required`, `operator_funding_disabled`, `authorization_missing`, `authorization_invalid_json` and `authorization_invalid`, with only allowlisted field names and validation rule codes. Existing provider-credential and configuration-hash failures map to `provider_funding_unavailable` and `authorization_stale` respectively. There is no expiry field or customer-credit prerequisite in the current authorization contract; do not infer either from the original generic code. Unknown fields remain strict errors rather than silently ignored expiry/cost instructions.

The final-only worker now labels this local validation phase `final_video_configuration`. Its preceding `getDatabaseConfig()` only validates local connection settings/key class, not database reachability or RPC installation. Migration 069's action/checkpoint functions enforce operator funding and canonical stage ceilings later, after explicit generation admission; they do not produce this startup exception. Read-only live REST metadata confirmed five tables/columns and the four expected RPC signatures on 2026-10-28. Function bodies/policies were not exposed by that inspection, so no full deployed-body/permission/runtime audit is claimed. No corrective migration is required for the spelling/diagnostics fix.

Configuration-only verification (does not start or import a worker, perform an RPC or contact providers):

```powershell
node --env-file=.env.local --conditions=react-server --import=tsx scripts/check-final-video-config.ts
```

This check disables network access and validates full video/voice credential **presence**, not remote account access. Expected: `UGC_FINAL_VIDEO_CONFIGURATION_READY`, operator funding, validated limits/canonical ceilings and `workerStarted: false`. It passed with the actual private environment unchanged. Prefer canonical `lip_sync` for new configuration; retain the same authorized amounts/ID/limits. After the check, restart the local app and manually restart the existing final-only worker when ready. Do not reset/reapprove the package or reapply 069 to fix this error. Regression checks: `npm run test:ugc-final-funding`; these are offline configuration/preflight checks only, with no SQL/media/worker/provider execution.

Normal flow is **approved Package → Generate Final Video → automatic processing → final-only review**. One frozen neutral CharacterVoiceProfile/provider binding serves all speech. Completed scenes are internal readiness checkpoints. Final approval atomically records the exact version and completes the parent UGC job; final rejection queues deletion of only that final object/local copy and never regeneration. A later explicit Generate action after deletion can restitch preserved scenes under the same authorized run without repurchasing them.

| Boundary | Source and actual behavior |
| --- | --- |
| Contracts/providers | `lib/final-video-generation/{contract,providers,planning,preflight}.ts`: neutral configuration/profile/capabilities/asset proof; extends existing M9 VideoGenerationProvider; independent VoiceGenerationProvider and LipSyncProvider. Vendor fields remain adapter-private. |
| Adapters | `adapters/{fal,elevenlabs,http,registry}.ts`: reviewed fixed models, exact text/prompts, explicit no remote retry/fallback, bounded private responses, request/result reconciliation and safe media-host downloads. No model fallback. |
| Persistence | Manual `supabase/migrations/20261027006900_ugc_final_video.sql`: executions, scenes, operations, reusable private profiles and append-only events; RLS, service-only RPCs, immutable identity/configuration, version/lease fencing, approved/current package and finite paid-intent budgets. Existing upstream functions/grants and ledger remain intact. |
| Worker/media | `worker.ts`, `media.ts`, `storage.ts`: 90-second local lease, 20-second serialized heartbeats; independent video/design/create/voice/sync/composition operations, private raw response/source/output recovery, technical validation and ordered FFmpeg composition. Existing fair local runner gains a gated final lane; package-only lane remains isolated. |
| Owned app/UI | `server.ts`, `progress.ts`, `app/api/ugc/final-video/{route,preview/route}.ts`, `components/creation/final-video-review.tsx`, existing UGC workflow/progress integration: explicit bounded funding consent, safe simplified status, short-lived private final preview, duration/ratio/resolution, final approval/deletion and failure-only recovery. No intermediate review. |

### Verified API selection and supported limits

Verified against public official API documentation on 2026-10-27, without authenticated capability or generation calls:

- **Visual:** [fal.ai Seedance 2.5 reference-to-video](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video/api), endpoint `bytedance/seedance-2.5/reference-to-video`. Explicit `task: reference`; three approved Character/Product/Location images via `@Image1/2/3`; complete immutable M9 generation prompt and deterministic absolute-to-local timestamp instruction. Documented whole-second 4–30s, up to 30 reference images, 30MB/image, 16:9/9:16/1:1, 480p/720p/1080p and selectable H264. V1 freezes 720p/H264 with native audio disabled. No stock/native video voice substitutes for dedicated speech.
- **Voice identity:** [ElevenLabs Voice Design](https://elevenlabs.io/docs/api-reference/text-to-voice/design) with `eleven_multilingual_ttv_v2`, approved description/tone/pace/language/delivery, automatically generated preview text, no description enhancement; [save designed voice](https://elevenlabs.io/docs/api-reference/text-to-voice/create) once. Versioned first-technically-valid-preview policy; no user preview-selection gate. Original approved voice description plus provenance stays in the neutral profile; vendor preview/voice IDs stay in its private opaque binding. Compatible profile identity is reused within owner/project/Character version.
- **Speech:** [timestamped TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps) with `eleven_multilingual_v2`, exact approved text, MP3/44.1kHz/128kbps, normalization off; original/normalized alignment when supplied and measured independent duration. [Supported model languages](https://elevenlabs.io/docs/overview/models) are validated; this v2 model does not enforce `language_code`, so no unsupported language override is sent. Language/pronunciation require manual auditory acceptance. Continuity uses up to three known recent same-model request IDs. Pace mapping: slow 0.9, natural 1.0, energetic 1.1. Versioned delivery mappings currently support Natural, Neutral, Conversational, Warm, Friendly, Cheerful, Enthusiastic, Dramatic, Expressive and Excited; other free-form delivery stops full preflight. These descriptive settings do not guarantee auditory fidelity; acceptance remains Pending. Text is never padded, rewritten or tagged to simulate delivery.
- **Lip-sync:** [fal.ai Kling audio-to-video](https://fal.ai/models/fal-ai/kling-video/lipsync/audio-to-video/api), endpoint `fal-ai/kling-video/lipsync/audio-to-video`. Documented MP4/MOV video 2–10s/100MB with dimensions 720–1920 and 720p/1080p; audio 2–60s/5MB. V1 uses normalized 720p-shaped, 25fps silent video plus full-scene 48kHz MP3 guide containing only exact Character speech at approved offsets. Character-dialogue scenes therefore need 4–10s whole-second duration. Narration-only scenes skip mouth synchronization and retain exact narration in composition; silence skips voice/design/sync entirely.

Full-package preflight blocks unsupported durations, oversized references, unsupported delivery/language, overlap, unsupported transitions and required background/music/SFX without an owned asset manifest **before any paid stage**. M9 has no owned audio asset manifest; V1 supports explicit none/silence only for these three sound fields and cut/none transitions. It cannot silently omit a declared sound or invent a dissolve. No general M9 timing/content limit is changed to fit this profile. Account availability, voice-slot limits, safety refusals, preview lifetime and generated-media accessibility still require manual verification before paid acceptance.

### Durability, recovery and completion proofs

Every stage has its own exact package/scene/profile/configuration input fingerprint and immutable paid intent. V1 grants **one paid attempt per operation**, not indefinite automatic retry. New work rechecks approved/current package and finite request/estimate authorization in SQL; successful upstream/other-scene operations are reused. Definitive rejected attempts remain stopped; recovery does not buy a replacement. Failed storage, decoding, download or local composition can recover the existing result without a new provider POST. Unknown POST outcomes enter reconciliation; known IDs use GET only. Missing IDs/expired remote output stop safely for operator investigation.

Raw POST responses are fsynced and copied into private R2 before interpretation, including all Voice Design previews; replay re-parses those bytes and never issues HTTP POST. Header request IDs are checkpointed as soon as available. Local `source.bytes` preserves downloaded paid media separately from normalized `bytes`, so storage retry cannot accidentally transcode an already normalized replacement and change its immutable hash. Stable receipts and response proofs survive worker restart; deterministic private response keys support recovery after a lost SQL acknowledgement. ElevenLabs history recovery matches exact request IDs within one bounded 100-item page; absent/unretained results require reconciliation, never a new synthesis. Design/create identities with lost acknowledgement and no recoverable response cannot be guessed or recreated automatically.

Private objects use `ugc/{owner}/{project}/{job}/final-video-v1/{execution}/{operation}.ext`; conditional immutable PUT, HEAD/conditional readback, SHA-256/ETag/size/MIME and measured full decode proof precede readiness. Provider CDN URLs are temporary recovery locators. Stable local recovery defaults to ignored `.ugc-final-recovery/` or configured private durable storage; keep it across restarts. Claim-scoped scratch is cleaned on exit; abrupt process termination may leave private scratch for manual cleanup after confirming no worker uses it. There is no automatic deletion of paid intermediates/profile history.

FFmpeg performs technical 720p-shape/H264/yuv420p/25fps normalization, exact offset placement with silence, canonical dedicated voice muxing and ordered composition; AAC/48kHz/mono in the final. Silent parts receive silent audio only when needed for compatible concatenation. No automatic speech truncation/tempo repair or creative transition is allowed; measured utterance must fit its approved window within the frozen 50ms technical tolerance. Complete final validation checks every scene, exact package/configuration/revision, video/voice/sync/completed-scene manifest, ordered scene hashes, final operation/fingerprint, full decode, total duration/ratio/dimensions/audio, private bytes and SHA-256. SQL repeats manifest/shape/duration/fingerprint checks before review and approval. Missing required dialogue or sync cannot complete UGC. Existing upstream reference-approval triggers remain active.

### Required manual setup

1. Review and apply **069 after 068 and prerequisites**, using the trusted manual SQL workflow. It is not applied remotely by this task. Confirm deployed columns/functions satisfy its fail-closed preflight. Offline all-migration parsing is not a live catalog or concurrency audit.
2. In private local app/worker configuration, retain `SCEENYK_LOCAL_JOBS_ONLY=1`; set `UGC_FINAL_VIDEO_ENABLED=1`, `UGC_FINAL_OPERATOR_FUNDED=1`, private `FAL_KEY`, private `ELEVENLABS_API_KEY`, existing Supabase/R2/Clerk configuration and stable `UGC_FINAL_RECOVERY_DIR` if desired. No `NEXT_PUBLIC_` provider key. `.env.example` defaults disabled; actual ignored environment was not edited. Existing FFmpeg/FFprobe binaries or configured private `FFMPEG_PATH`/`FFPROBE_PATH` are required.
3. Set `UGC_FINAL_AUTHORIZATION` to a single-line JSON object with a fresh authorization UUID, supported language, maxRequests (1–64), maxEstimatedCostMicrousd (1–1,000,000,000), and positive reviewed conservative micro-USD ceilings for **video, voice, design, binding, lip_sync**. Example **shape only, replace every placeholder**: `{"authorizationId":"<UUID>","language":"en","maxRequests":<integer>,"maxEstimatedCostMicrousd":<integer>,"ceilings":{"video":<integer>,"voice":<integer>,"design":<integer>,"binding":<integer>,"lip_sync":<integer>}}`. Whole-run worst-case counts include design/create once even if a compatible voice may be cached. No prices are invented; the operator must review actual account rates/limits and choose adequate conservative caps. Freeze the same JSON/configuration in app and worker; changed configuration safely stops an existing run.
4. Restart the local app to read configuration. Only when separately ready for funded acceptance, manually run **`npm run worker:ugc -- --final-video-only`**. This command was not executed during implementation. No OpenAI/Character configuration or upstream lane claiming is needed in this mode. Render/Inngest remain disabled.

This is **operator-funded development only**. No customer credits, free allowance, holds, markup, refunds or commercial settlement policy is invented or enabled. Production customer-credit admission remains blocked until its quote/review-hold mapping is explicitly defined and implemented. The UI states the funding authority and bound; Generate confirms the exact owner/package/configuration authorization. Provider-reported usage is retained, with unavailable actual dollar cost null; estimate ceilings are conservative admission bounds, not a provider-side guaranteed billing cap.

### Exact manual acceptance checklist

1. Use an owned current approved M9 package matching the profile: three readable approved images, supported whole-second scenes, cut/none transitions, explicit none/silence for unbound background/effects/music, supported exact delivery. Include one silent scene and one 4–10s Character-dialogue scene whose approved words fit the assigned window. Do not edit or reinterpret the package after approval.
2. Open **Final Video**, inspect the operator funding bound, click **Generate Final Video once**. Verify persisted simplified progress through automatic visual/voice/sync/composition with no manual voice/scene review or stitch trigger. Reload the app and check status; duplicate requests must return the same run.
3. Inspect trusted private operation receipts: one video per required scene, one design/create only when no compatible saved profile exists, same profile/binding for every utterance, no voice/sync for silence, no mouth-sync for a separate narration-only package. Verify exact text, pronunciation/language/tone/pace/delivery, Character/Product/Location consistency, timing and lip performance by listening/viewing. Source fixtures do not establish semantic/visual/provider acceptance.
4. Exercise controlled local interruption after known provider IDs/output, media download and storage acknowledgement, then restart the same local worker/configuration. Confirm saved Scene 1/video/audio/sync stay unchanged and no uncertain paid POST or successful upstream stage is repeated. Simulate these with mocks first; do not induce paid failure/repurchase without separate funding authorization. Test missing/expired response and unknown outcome stop safely.
5. Confirm final order, duration within 50ms, expected ratio/resolution, every required utterance, intact audio/video streams and private hash/ETag/size. Verify another owner cannot invoke review/actions or obtain preview URLs, and stale package/version/lease cannot approve.
6. Choose **Reject and Delete Final Video**: local worker deletes only final private/local media, leaves paid upstream artifacts/profile intact, and does not regenerate/restitch. An explicit subsequent Generate may restitch those saved scenes, with no new paid operation.
7. On a current valid final, **Approve Final Video**: exact approval/version persists, Finalizing and workflow Complete display; duplicate approval is idempotent. Confirm existing accounting/credits/free allowance remain unchanged under operator-funded mode. Test required missing dialogue/sync/scene rejection using fixtures, not paid deletion of valid artifacts.

### Offline source validation and remaining acceptance

`node --conditions=react-server --import=tsx scripts/check-final-video.ts` exercises synthetic package preflight, mocked adapter requests/replay/no fallback, all 69 migrations/reruns and unchanged upstream functions/grants, scoped SQL admission/intents/cost/staleness/leases, required speech/sync, final ordered proofs, rejection/reuse and completion with explicitly stubbed upstream approval resolvers. `scripts/check-final-video-media.ts` generates only synthetic local color/tone fixtures and exercises the actual FFmpeg normalization, timing rejection, mux, silent/spoken ordered composition, measured validation and claim-scratch cleanup. Neither starts a worker process or touches live data/storage/providers. Existing M9/package and queue checks, TypeScript and focused ESLint are included in final verification. No build/browser/provider suite ran.

Real account capabilities/pricing, remote migration/catalog/concurrency, signed-R2/provider access, visual/speech/lip-sync quality, live interruption/recovery, browser preview/accessibility/responsiveness and final acceptance remain **Pending**. Source-complete never means runtime-accepted or production customer-credit-ready.

## Selected video and voice architecture (2026-10-27)

**Normal V1 user flow: Approved Generation Package → Generate Final Video → automatic Sceenyk processing → Final Video review.** The initial generation action includes existing required cost/credit authorization; package approval alone is not payment consent. The user does not select providers or manually trigger/review voice generation, lip-sync, scene alignment, scene acceptance or stitching. Only final review exposes **Approve Final Video** and **Reject and Delete Final Video**. Rejection never automatically regenerates.

Internal flow: full capability/current-input/cost admission → visual scene → approved speech through the same reusable CharacterVoiceProfile → automatic conditional lip-sync → privately verified completed scene → repeat/recover each scene independently → deterministic FFmpeg final composition → validation/private final persistence → final review → approval/trusted Complete. Silent scenes skip voice and lip-sync; exact speaker-based routing is defined below. Save successful intermediate video/audio immediately so later failure cannot discard paid work.

`VideoGenerationProvider`, `VoiceGenerationProvider` and `LipSyncProvider` are internal replaceable boundaries. fal.ai is the planned video service, ElevenLabs supplies Character speech and a fal.ai-compatible lip-sync adapter is planned; FFmpeg owns composition. [The voice contract](voice-generation.md) owns profile/identity/segment rules. Voice Design creates one reusable identity automatically from the approved description; no real recording, manual preview selection or extra profile approval screen is required for V1. Native video audio cannot replace dedicated Character speech unless a future workflow explicitly selects that path.

This automated flow supersedes earlier M10 scene-by-scene acceptance and owner voice-preview selection proposals throughout the current plan. Upstream reference/Storyboard/package approvals remain unchanged. Provider configuration, request IDs, stage-level debugging and advanced scene review stay internal; they do not become normal user tasks.

## Provider suitability assessment (2026-10-27)

**Historical assessment before the dedicated ElevenLabs decision; not the current audio selection or a fresh live read.** Native-voice requirements in this comparison applied to the prior combined video/audio approach. The new separate voice path supersedes that block without approving any exact fal model. Earlier official public documentation was checked without authenticated provider requests. One GET-only database read found an approved package, content revision 1 / command version 6, with two 5,000ms scenes, 16:9 output, required dialogue and `consistentVoice: true`, no narration, and `stale_at: null`. Only safe timing/requirement metadata was printed; no prompts, dialogue, private media, credentials or identifiers were printed or persisted here. This read does not replace execution-time owner/current-upstream/hash/media validation. It made no workflow RPC or database/storage write. No live read occurs in this documentation task.

The existing [strict package voice schema](../lib/storyboard/schema.ts) binds a Character asset, textual description and pace. The [package builder](../lib/video-generation-package/builder.ts) requires consistent voice whenever speech exists. Neither supplies a recording/provider identity. The newly selected [Voice Design/profile plan](voice-generation.md#elevenlabs-voice-design-and-reusable-identity) resolves that input strategy through a separately persisted reusable identity, without mutating M9 or requiring native video-provider voice binding.

| Reviewed fal endpoint | Officially documented relevant support | Compatibility limit / unresolved requirement |
| --- | --- | --- |
| [`fal-ai/kling-video/o3/pro/reference-to-video`](https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video/api) | Image/element conditioning for characters, objects and environment; native audio; whole-second 3–15s clips; 16:9, 9:16 and 1:1; asynchronous queue/result APIs. Elements expose `voice_id` binding. | Candidate for the current 5s scenes, **not selected for execution**. Its documented voice binding needs a voice ID plus a compatible element reference manifest. Current M9 conditioning is composed sheets, not a silently substituted element image set. Exact reference mapping, measured output profile and audio timing still need preflight/acceptance. |
| [`bytedance/seedance-2.5/reference-to-video`](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video/api) | Up to 30 images, audio references, synchronized audio/lip-synced speech, whole-second 4–30s clips, all three package ratios and 480p/720p/1080p. | Current durations/count/ratio fit. No verified route from M9's textual voice description alone to an identical voice across independent requests. Reference audio would be an additional approved execution input. |
| [`bytedance/seedance-2.0/reference-to-video`](https://fal.ai/models/bytedance/seedance-2.0/reference-to-video/api) | Up to nine images and three audio references; synchronized native audio; whole-second 4–15s clips; all three package ratios. | Same unresolved voice-source boundary; a reference-audio capability does not supply an approved recording. |
| [`fal-ai/vidu/q4/reference-to-video`](https://fal.ai/models/fal-ai/vidu/q4/reference-to-video/api) | Up to 12 image references; up to three MP3 voice references, each 3–12s; native dialogue/effects; whole-second 3–16s clips; all three package ratios. | Consistent-voice conditioning is documented with audio references, which M9 does not supply. |
| [`fal-ai/veo3.1/reference-to-video`](https://fal.ai/models/fal-ai/veo3.1/reference-to-video/api) | Reference images, generated audio, 16:9/9:16; default duration 8s. The endpoint announces deprecation on November 17, 2026. | No verified 5s reference-mode/stable-voice path from the current package; 1:1 is absent. Not selected. |

The concrete Kling [Create Voice contract](https://fal.ai/models/fal-ai/kling-video/create-voice/api) requires a clean single-speaker audio/video recording lasting 5–30 seconds and returns a voice ID. It does not synthesize an approved voice from M9's description. No creation request was sent. This is an input/audio-strategy gap, not a claim that these models cannot generate speech. Likewise, the current package's 5s scenes fit several models; fractional/short scenes allowed by the general M9 contract would need their own compatibility rejection rather than silent rounding or trimming.

**Historical outcome:** the implementation attempt stopped before paid submission because the existing description alone did not establish a reusable native voice. The owner has now selected dedicated ElevenLabs Voice Design/TTS behind a generic voice adapter, resolving that architecture decision. Do not reapply the historical stop as a requirement to upload a recording or choose native fal audio. No adapter, scene records, scene/final UI, stitching, accounting integration or completion path was implemented by that assessment or this documentation update. All technical capability/current-input/cost gates remain required before later paid work.

### Verified transport/recovery obligations for later implementation

The official [Queue API](https://fal.ai/docs/documentation/model-apis/inference/queue) documents submit → request ID → status/result retrieval and `X-Fal-No-Retry: 1`. [Reliability](https://fal.ai/docs/documentation/model-apis/inference/reliability) also documents automatic model fallback and per-request `x-app-fal-disable-fallback`. A later adapter must explicitly disable both remote retries and fallback, as well as client POST replay; timeout alone does not cancel inference. A missing submission acknowledgement remains an unknown paid outcome, not permission to submit again. These headers are researched requirements, not implemented protection.

The [retention documentation](https://fal.ai/docs/documentation/model-apis/media-expiration) distinguishes request-history payloads from generated CDN media and supports an explicit media lifecycle preference. Expired media is irrecoverable. A future frozen adapter profile must select an adequate retrieval window/access policy and persist known request IDs/completion receipts plus private recovery bytes before retrying storage. No retention setting, account configuration or exact billing/idempotency guarantee was inferred or changed.

### Required resolution and manual verification before continuing

1. Follow the resolved [ElevenLabs voice strategy](voice-generation.md): later implement the neutral profile/provider boundary, one reusable designed identity and exact segment synthesis, with private approval/provenance/package bindings. Do not require a real recording for V1 or mutate M9 to hide missing audio. This documentation request does not authorize implementation or runtime tests.
2. Resolve exact conditioning from the existing three approved images, output resolution/frame rate/container, quantization tolerance and declared transitions. Validate full translated prompts, duration limits and voice/reference cross-constraints for every scene. Do not round scene timing or silently add views.
3. After a separate implementation request, finish the source implementation, catalog-compatible migration and authorized fixture checks with the selected voice path. Source migration 068 remains the existing baseline; no M10 migration/configuration is created now.
4. Before owner-run paid acceptance, obtain a current exact package validation, compatible capability/profile receipt, finite attempt/spend budget and explicit generation authorization under existing accounting rules. Package approval is not payment consent.
5. Only after implementation and separate acceptance authorization: verify one-action automatic dialogue/silent/narration paths, conditional lip-sync, no intermediate scene/voice gates, duplicate/unknown-outcome recovery, restart/leases, storage/partial-scene reuse, deterministic assembly and final-only approve/reject without regeneration. There is currently no M10 command/UI to test; do not run a worker or paid request from this documentation task.

Assessment verification: public documentation/source review, the single successful GET-only package read and documentation diff/link/whitespace checks. No paid or authenticated provider call, worker/job execution, media generation, storage operation, migration creation/application, test/build, deployment or hosted-setting change. Render/Inngest guards remain unchanged. The planned sections below retain their architectural authority; statements about the earlier documentation task describe that historical preparation, not a new restriction overriding the implementation request.

This is the authoritative planned M10 execution contract. [Video Generation Package](video-generation-package.md) remains authoritative for the implemented M9 immutable input/scene contract. Other context files link here for M10 rules rather than defining competing schemas. Earlier legacy provider/worker acceptance and renderer settings remain dated evidence, not an implemented UGC M10 workflow or permission to execute it.

The approved plan is:

**Approved Generation Package → Generate Final Video with matched cost authorization → automatic video → required ElevenLabs speech/conditional lip-sync → private completed scenes → automatic FFmpeg final composition/validation → Final Video review → Approve or Reject and Delete.**

Scene readiness is automatic internal validation, not owner acceptance. The final manifest binds exact completed visual/audio/sync/profile versions before assembly and final review. Upstream package approval, provider completion, technical readiness and final approval remain separate facts. No final video, paid request or worker runs here. [Current documentation restrictions](ai-workflow-rules.md#automated-m10-documentation-scope-2026-10-27) retain local execution and disabled Render/Inngest.

## Verified source boundary and planned extensions

| Existing source inspected | Current fact / M10 consequence |
| --- | --- |
| [`lib/video-generation-package/contract.ts`](../lib/video-generation-package/contract.ts), [`builder.ts`](../lib/video-generation-package/builder.ts) | M9 freezes exact approved references/Storyboard/settings and structured neutral scene prompts, timing, voice and audio instructions. Current conditioning uses two composed sheets plus one Location image. Output resolution/frame rate/format/seed remain unspecified. Do not mutate the approved package to fit an API. |
| [`lib/video-generation-package/provider.ts`](../lib/video-generation-package/provider.ts) | `VideoGenerationProvider<Payload, Result>` already declares identity/version, capabilities, validation, translation, submit and status operations. It has no concrete UGC adapter, registry, matching or network implementation. |
| [`lib/ugc-jobs/local-runner.ts`](../lib/ugc-jobs/local-runner.ts), [`scripts/ugc-worker.ts`](../scripts/ugc-worker.ts) | Existing local claims/leases/heartbeats/queues and package-only mode remain. M10 adds a gated final lane and isolated final-only command. Package approval still pauses; only explicit Generate Final Video admits M10. Package-only mode stays package-only. |
| [`lib/video-ai/provider.ts`](../lib/video-ai/provider.ts), [`providers/fal.ts`](../lib/video-ai/providers/fal.ts), [`config.ts`](../lib/video-ai/config.ts) | Legacy execution directly selects fal with its own endpoint/model/scene configuration. Evaluate narrow reuse later; do not wire this hardwired API into canonical UGC logic or assume its historical limits/pricing prove M10 compatibility. |
| [`lib/composition/contract.ts`](../lib/composition/contract.ts) | Legacy composition uses integer-ms timing, zero technical timeline tolerance and only none/cut transitions. Preserve those existing contracts; broader M10 audio/transitions require an explicitly versioned integration decision. |
| [`lib/final-render/contract.ts`](../lib/final-render/contract.ts), [`workers/final-render/composition.tsx`](../workers/final-render/composition.tsx) | Legacy rendering has fixed 24fps/H.264/AAC settings and an 85ms output verification allowance. These source settings are not an approved M10 execution profile. Existing Remotion/Render packaging does not authorize hosted execution. |
| [`lib/voice-ai/contract.ts`](../lib/voice-ai/contract.ts) | Legacy voice records are ElevenLabs-specific. M9 stores an approved voice description/pace, not generated audio or a selected synthesis identity. Do not claim those legacy types implement neutral UGC audio. |

Future implementation may extend the generic provider/capability/execution contracts compatibly and with versions. Current types do not yet explicitly declare image-to-video/text-to-video modes, frame-rate support, result retention/retrieval windows, polling/webhook authentication or cancellation semantics. Record these as planned adapter obligations, not already supported methods/fields. No TypeScript, adapter/configuration, worker, SQL, dependency or UI implementation changes occur here.

## Provider-independent architecture

Core owns exact package/scene/profile scope, stale-input and ownership checks, automatic stage scheduling, paid-intent/attempt admission, private media/proofs, recovery, deterministic manifests and final review/accounting. It consumes neutral commands, capabilities, normalized results/status/errors and opaque configuration bindings; it never interprets vendor payload fields. Changing adapters does not rewrite Storyboard/package/core execution.

| Internal boundary | Planned neutral responsibility |
| --- | --- |
| `VideoGenerationProvider` | Existing generic interface, later extended compatibly for one approved visual scene: capabilities, validation, exact reference/prompt translation, submission, status/result recovery and normalized technical output/usage. fal.ai first; no mandatory native voice requirement. |
| `VoiceGenerationProvider` | Planned [voice/profile contract](voice-generation.md#planned-voicegenerationprovider-abstraction): automatic once-per-profile designed identity, exact dialogue/narration synthesis, supported timing/context, result recovery and usage. ElevenLabs first; same committed identity across scenes. |
| `LipSyncProvider` | Planned visual-video plus exact Character speech synchronization, capability/input validation, submission, observation/recovery and normalized synchronized-video result. fal.ai-compatible adapter/model planned, not selected or verified by this document. |
| FFmpeg/FFprobe composition | Local deterministic preparation/alignment, compatible media normalization, final audio mixing and ordered assembly/validation; independent of all provider adapters. |

Adapters/configuration exclusively own provider/model/endpoint IDs, credentials, API fields/payloads, concrete voice/reference formats, synthesis/sync settings, limits, request/job/result IDs, polling/webhooks/retention, error parsing and pricing/usage translation. Normalize safe failure categories; freeze adapter/configuration/capability/translation versions per operation. No silent provider/model/voice fallback, SDK POST replay or unbudgeted paid retry. Safe provenance may be retained privately, not shown as provider-management UI.

## Automatic scene processing and LipSyncProvider

Run the following internal stages automatically after the single admitted Generate Final Video action; no successful stage waits for owner review:

1. Load/revalidate the exact approved package, scene order/content/version, approved Character/Product/Location bindings, output profile and current authorized execution. Check complete video/voice/lip-sync/composition feasibility before spending.

2. Generate the visual scene through `VideoGenerationProvider`, then retain its request/receipt and verify/save the source visual privately immediately. Preserve original successful visual bytes separately from derived synchronization output.

3. For each required nonempty approved Character dialogue segment, synthesize only its exact text through `VoiceGenerationProvider` using the same CharacterVoiceProfile/binding across the execution. Align exact speech windows automatically under the [controlled timing policy](voice-generation.md#dialogue-timing-and-continuity); preserve verified audio privately. Resolve designed identity automatically once, never per scene.

4. Automatically prepare a scene-relative Character dialogue guide/manifest and pass the exact visual and dialogue audio to `LipSyncProvider`. Guide silence/offsets must map to unchanged approved windows. The provider cannot introduce another voice or rewrite speech. For multiple utterances, use only a verified full-scene or explicitly versioned segment mapping that preserves the complete scene; no silent retiming/cropping.

5. For a genuinely silent scene (no required nonempty `speech[]`), skip voice and lip-sync, recording an explicit no-speech reason and zero paid attempts. The existing schema distinguishes Character speech from narration: preserve required narration through the same ElevenLabs profile, place it automatically in composition, and do not invent visible mouth movement for narration-only/off-screen speech. A narration-only scene is not silently treated as silent; mixed narration stays out of the mouth-sync guide.

6. Retrieve/validate synchronized output when required, preserve the source visual/audio and commit a private completed-scene artifact/proof with exact timing/audio/profile lineage. Check readable media, duration/ratio/stream integrity and that required synchronization is present; FFmpeg muxing alone is not lip-sync. Keep ElevenLabs audio authoritative rather than replacing it with a provider-generated voice.

7. Repeat in Storyboard order with independently persisted checkpoints. A failed voice/lip-sync/storage stage reuses upstream success; completed other scenes remain intact. Scene readiness is an internal technical fact, not a user acceptance gate.

8. Once every required scene is internally ready for the same current manifest, FFmpeg automatically assembles ordered synchronized scenes, exact dialogue/narration and declared available music/SFX, validates/stores/verifies the final artifact and opens final-level review only.

Planned `LipSyncProvider` contract:

| Operation / capability | Neutral obligation |
| --- | --- |
| Identity/capabilities | Versioned adapter/configuration identity; accepted video/audio formats, duration/dimension/frame-rate/byte limits, scene/window/target-face support, required language/shot/visibility constraints, duration/ratio/voice-preservation behavior, async or synchronous completion, safe result retrieval/retention, usage and error semantics. Unsupported/unverified required behavior blocks preflight. |
| Validate / translate | Validate owned source visual/audio hashes, exact package/scene/profile/window mapping and technical output profile. Adapter translates these neutral inputs to vendor fields; core never formats a model-specific request. |
| Submit | Frozen source visual asset/version/hash plus Character dialogue asset/version/hash and guide/window manifest; stable operation/fingerprint, distinct paid attempt, current authorization, claim/version fence and cancellation signal. Persist intent before the single submission; return opaque request/job identity and normalized receipt. |
| Observe / recover | Read an already known request/result when supported, preserve pending/completed/known-failed/unknown/unavailable distinctions and retrieve bounded output bytes. A timeout does not prove remote failure. Never resubmit an unknown paid outcome. |
| Result / errors | Synchronized visual artifact metadata, immutable source bindings, normalized timing/technical proof, safe request/usage/cost receipt and exact recoverability. Preserve original ElevenLabs speech identity; no guessed support, provider-specific URLs/fields or credentials in core/client DTOs. |

Exact fal.ai-compatible lip-sync model/endpoint, account access, input constraints, retention, fidelity and cost must be verified from official documentation during later authorized implementation. Strategy is resolved; model suitability/runtime acceptance is not. No provider is called or selected through user controls in this task.

## Capability matching before any paid submission

Compare the complete approved package and every scene against the internally selected video, voice and conditional lip-sync adapters' versioned model/mode/account capabilities plus the final assembly profile. Supported, unsupported and unverified are distinct. Missing or unverified required support blocks submission with exact scene/field/reason and no billing. Do not discover incompatibility only after generating otherwise unusable scenes.

| Capability | Required preflight decision |
| --- | --- |
| Reference images / count | Supported formats/dimensions/bytes, conditioning mode and count for the actual request; current package requires three images, not one interchangeable reference. Never drop a role or add a new unapproved sheet/view silently. |
| Character consistency | Video handles approved visual Character conditioning/continuity; the separate voice profile handles dialogue identity. A preservation prompt alone is not a visual fidelity guarantee; automatic technical checks and final user review remain mandatory; there is no per-scene approval gate. |
| Product / Location | Explicit support for the approved Product and environment reference roles in combination with Character conditioning. |
| Image-to-video / text-to-video | Advertise each mode independently. Select only a mode that preserves all required references/instructions; text-only support does not satisfy a reference-conditioned package. |
| Audio / dialogue | Match exact dialogue/language/delivery/voice/timing to `VoiceGenerationProvider`, automatic Character-dialogue synchronization to `LipSyncProvider` and final placement/mix to FFmpeg. Silent scenes skip voice/sync. Native video audio is optional; muxing alone is not lip-sync. Never omit required speech. |
| Duration / scene length | Min/max/discrete lengths, per-scene and total coverage, frame rounding and output timing guarantees. Reject incompatible scene lengths; no silent padding, trimming, time stretch or changed speech. |
| Aspect ratio / resolution / frame rate | Concrete neutral output profile and cross-constraints with duration/mode. M9 null values require explicit profile resolution before execution, not an undocumented vendor default. |
| Seed | Availability/type/range and the package's optional/required seed policy. Persist the resolved seed if known; a seed does not promise identical AI output. |
| Async jobs / recovery | Durable request ID/client correlation, provider idempotency semantics, status/result retrieval, retention/expiry window and a viable crash-recovery strategy. No assumption of exactly-once remote billing. |
| Polling / webhooks | At least one supported durable observation path, bounded polling/backoff/timeout and authenticated replay-safe callbacks when supported. Local development may use polling; do not require a public localhost tunnel or enable hosting. |

Provider-specific capability values, endpoint/model selection, costs and account access are **Needs confirmation** before implementation/execution. No current fal profile is approved by this document and no API was queried. Full-video generation is not V1's default: a future whole-video mode needs an explicit adapter capability declaration, separately approved suitability and reviewable scene/timing provenance rather than an opaque replacement workflow.

## Scene generation, identity and versioning

Each scene is an automatic internally recoverable unit with separate visual, speech, lip-sync, storage and scene-ready checkpoints. The approved package remains the creative source of truth: exact interval/order, Character/Product/Location versions, prompt, camera/actions/reactions/interaction/light/style/tone, ratio/output and dialogue/delivery are preserved. The video adapter cannot invent dedicated speech; the voice adapter uses exact approved words; lip-sync consumes the exact verified video and Character speech under a recorded timing map.

Bind every stage to owner/project, exact package ID/version/hash/approval, stable scene ID/content version/hash, approved asset versions/hashes, CharacterVoiceProfile/binding where applicable, adapter/model/settings/capability/translation versions and neutral output/timing policy. Fingerprints exclude transient signed URLs, leases, observation counters and timestamps. Video, voice and lip-sync have different operation fingerprints and independent monotonic paid-attempt identities; provider request IDs are separate opaque receipts.

Reuse completed verified work for the same fingerprint; observe a known pending request; reconcile an unknown submitted intent without repurchase. Do not let voice/lip-sync failure reset a successful visual or another completed scene. Any authorized new downstream result creates immutable derived scene/final versions and invalidates dependent final readiness/approval, not upstream artifacts.

Generation proceeds automatically within the frozen execution/authorization policy. Per-scene user acceptance, regeneration and debugging are internal/future advanced behavior rather than V1 review gates. A changed creative package follows normal M9 rebuild/approval and fresh admission; old results remain historical/private and cannot be relabelled current.

## Private scene output and persistence concerns

Provider completion is not durable success. Immediately retrieve bounded bytes, verify exact operation lineage/technical integrity, and save each successful source video, voice output and lip-sync result privately under immutable stage/attempt identities. Verify stored length, MIME/container, checksum/ETag and measured stream metadata before that artifact is ready. A scene becomes internally ready only when every required stage and its durable proof passes; a raw visual alone is insufficient for required dialogue.

These are conceptual persistence concerns, **not new tables/columns/RPCs/migrations**:

| Concern | Durable evidence |
| --- | --- |
| Execution | Owner/project/package ID/version/hash/approval; selected neutral video/voice/sync/output policies and adapter/configuration versions; explicit authorization/budgets; current checkpoints/status. |
| Independent stage/attempt | Exact scene/content/profile/source-asset bindings; video, voice and lip-sync fingerprints, paid intents/attempt counts, provider/model/request/job IDs, normalized status/failure/reconciliation, timestamps and lease/claim/version fences. |
| Private artifacts | Source visual, speech, synchronized scene and final asset identities/keys; SHA-256/length/MIME/ETag and measured duration/dimensions/frame rate/audio metadata; immutable input/output lineage and verification receipts. |
| Voice/guide | [Canonical voice persistence](voice-generation.md#persistence-private-audio-and-independent-recovery): reusable profile/binding, exact segment/text/window, design/create/synthesis receipts, alignment/controlled adjustments and scene-relative Character dialogue guide separate from narration. |
| Usage/cost | Stage/attempt/provider/model/configuration, trusted estimate/rate/units where available, actual reported usage/cost and receipt provenance; absent actual cost remains null. |
| Readiness/composition/final review | Internal completed-scene validation proofs, exact ordered video/audio/sync/profile/mix/transition manifest, immutable final version/hash/proof and final owner approval/deletion evidence. No per-scene owner acceptance requirement. |

Preserve known request/result locators and sanitized completion receipts; temporary provider URLs cannot be canonical storage. Fsync private attempt-bound recovery bytes/metadata as needed; a scratch file alone is not durable readiness. Reconcile an uncertain upload at the same key before another write and retry storage before any new generation. Retrieval must respect declared retention/account permissions and exact original scope.

Before later persistence implementation verify actual catalog, existing job/asset/claim/financial functions and grants, then choose the smallest compatible extension. Source migrations are not proof of deployment. No schema/migration is designed or applied now.

## Failure and restart recovery

Automatic normal processing does not authorize duplicate paid work. The same rules apply independently to video, ElevenLabs design/create/synthesis and lip-sync; retain all successful upstream and unrelated-scene artifacts.

| Boundary | Planned behavior |
| --- | --- |
| Preflight/configuration failure | Stop before paid submission with an exact internal requirement/reason and a simple safe run-level status. Preserve package/media; do not fall back to another provider/model. |
| Video, ElevenLabs or lip-sync timeout / unknown outcome | Keep atomic intent, attempt, fingerprint and known request/job/result IDs; enter reconciliation required. Observe/retrieve the same request where supported; no automatic POST replay, cleared intent, reset attempt count or new paid submission. Missing acknowledgement is not proof of failure. |
| Definitively known provider failure | Fail/recover only that stage. New paid work must be explicitly covered by the initial frozen generation authorization and remaining finite stage/execution budgets, or separately authorized after a safe stop. Retry eligibility requires a definitive outcome and configured policy; unknown outcomes never qualify. This creates no routine intermediate user task. |
| Voice or lip-sync failure | Recover the exact audio/sync operation independently. Keep source visual, reusable voice identity and other successful scenes. Never regenerate visual/video or redesign the voice just to repair a downstream failure. |
| Success then interrupted download/storage failure | Retain provider receipt/output proof and available fsynced recovery bytes; retrieve the same result if supported, reconcile/retry the same private object/key, then validate. Never regenerate to repair storage. |
| Worker restart / expired claim / lost acknowledgement | Reload stage checkpoints, completed private proofs and paid intents; atomically reclaim expired leases and fence old workers. Reconcile existing results/objects before advancing. Worker/read/local recovery counts are separate from paid attempts. |
| Partial scenes | Resume only missing/failed stages. Keep every compatible completed scene and intermediate; no all-scenes restart. |
| Result unavailable/expired | Preserve completion/cost/retention evidence and stop honestly; do not infer a failed/nonbillable request or auto-refund/resubmit. Unknown or unrecoverable paid work needs explicit reconciliation/authorization before replacement. |
| FFmpeg/validation/final persistence failure | Reuse current ready scenes, exact manifest and verified intermediate/final bytes. Retry bounded deterministic processing/storage, not AI generation. |
| Inputs/approval change | Block new paid admission/final approval for stale work. Existing submitted historical work may still be safely observed/saved under its original scope, never rebound to current inputs or allowed to trigger further paid work. |

Local uniqueness/leases do not guarantee exactly-once provider billing. SDK/transport must not replay uncertain POSTs. Callbacks are authenticated/deduplicated observations matched to provider/request/owner/project/stage/attempt and fenced before state changes; they cannot assert final completion or financial settlement.

During unresolved recovery the user sees simple recovering/stopped status and necessary safe diagnostics, not provider management or a requirement to inspect every scene. No code, worker or live recovery is executed by this documentation.

## Paid-request and accounting gates

Generate Final Video is one explicit user action with existing required quote/cost/credit authorization. Freeze finite per-stage and whole-execution budgets for video, voice (including once-per-profile design/create) and lip-sync; this is not unlimited consent and package approval alone is insufficient.

Immediately before **every paid request**, including a new authorized attempt, recheck:

1. Authenticated/worker-authorized owner/project, exact current approved package/hash and upstream approvals; no stale content.

2. Exact scene/content version, stage, source video/audio/profile versions and current adapter/output/timing configuration.

3. Full video/voice/lip-sync/composition capability and private-input-access match; no same-fingerprint completed, submitted, pending or uncertain operation to repurchase.

4. Independent stage/scene/profile and total execution attempt/spend budget, current trusted estimate or finite operator funding authority and resolved prior intent. Known-failure retry must be covered by the authorization; unknown paid outcomes cannot be resubmitted automatically.

5. Matched current quote/confirmation and valid held reservation/credit/free-allowance state where accounting is enabled, using existing server/database financial authority.

6. Atomic immutable submission intent, distinct paid-attempt identity and current lease/version fence committed before the call.

Maintain separate request fingerprints/attempt budgets for **video generation, voice generation and lip-sync**. Lip-sync fingerprint binds the exact successful visual hash, Character audio/guide hash/windows/profile, scene/package versions and sync adapter/configuration/output policy. A changed guide creates a new downstream identity; it cannot reset video/voice attempts or repay their work.

All observation/retrieval calls also validate original persisted scope/configuration and any authorized cost. Reuse known submitted IDs/results instead of unnecessary polling and distinguish read/local recovery from paid-attempt budgets. No provider/account idempotency, zero-cost retrieval or exactly-once remote billing is assumed.

Track estimates and actual returned usage/cost per stage/attempt with safe receipts; unknown actual cost remains null. Provider units/estimates are not customer credits or verified dollars. Disabled accounting still requires finite explicit development funding, not implicit permission to spend.

Preserve existing quote/reservation/immutable ledger/completion/settlement/restoration owners and unresolved review-hold/cancellation/commercial rules. Partial/unknown scene failures must not automatically consume/restore the whole reservation or repurchase successful work. Complete only after trusted validated private final output and current final approval. No financial source/schema/policy change occurs now.

## Scene review and safe deletion

**Normal V1 has no intermediate scene review/acceptance.** `scene_ready` is established automatically from exact private visual/voice/lip-sync/storage/timing proofs. Ready scenes for the current immutable package/manifest automatically enter composition; no Accept Scene, voice picker, lip-sync trigger or Stitch action is required. Internal technical validation and provider-aware diagnostics are not user approval.

Only the validated private final video is presented for normal review. Advanced per-scene inspection/replacement can be internal or a future explicitly scoped mode; do not expose it as a default V1 requirement or build it from this documentation task. Existing upstream Character/Product/Location/Storyboard/package approvals are unaffected.

Final Reject and Delete fences/removes only that exact final candidate through bounded provider-free cleanup, retaining minimum audit/financial/deletion proof and protecting source/ready-scene/profile/audio artifacts needed for permitted recovery. Rejection never queues a replacement or another paid request. Any later explicit generation must pass current admission and can reuse compatible verified intermediates. If cleanup fails, retain its checkpoint and retry deletion without invoking providers; reference/retention policy must protect shared and historical artifacts.

## Provider-independent stitching and exact timing

FFmpeg is the deterministic final composition layer, separate from video/voice/lip-sync adapters. Automatically consume the current immutable manifest of **internally completed synchronized scenes → Storyboard-order final project video**, with exact ElevenLabs dialogue/narration placement and declared/available background music/SFX. Technical guide preparation/alignment may also use FFmpeg internally; neither such preparation nor muxing substitutes for `LipSyncProvider` on spoken Character dialogue. No user alignment/stitching step or scene acceptance is required.

Preserve ratio/framing/creative content, exact approved scene coverage and dialogue windows. Normalize only compatible codec/container/frame-rate/resolution/audio sample/channel settings under the frozen profile. Apply only declared supported transitions and mix/mute/duck rules; never invent speech/music/effects, change the storyboard or duplicate native plus dedicated dialogue. Music/SFX are used where available/authorized; a missing explicitly required asset remains a preflight/validation issue, not silently omitted audio.

Keep final duration aligned as closely as possible to the approved package under a predeclared measurable frame/sample-quantization tolerance. Do not invent a tolerance after failure, conceal gaps, cut words, silently stretch video, or relax legacy strict timing rules. Controlled minor speech fitting remains governed by [voice timing](voice-generation.md#dialogue-timing-and-continuity), applied before lip-sync against unchanged windows. The exact output/tolerance values remain implementation-time choices requiring verification.

Composition fingerprint binds owner/project/package/version/hash, ordered completed-scene versions/hashes, original visual and synchronized output lineage, exact audio/profile/binding versions/hashes, guide/segment/window/alignment/adjustment/mix/transition manifest and output/tool/configuration versions. A new upstream artifact invalidates only affected derived scene/final versions; it never transfers final approval.

Work stays on the existing local worker outside Next.js requests, using fixed shell-free arguments, bounded CPU/memory/disk/time, private scratch and attempt-scoped recovery. Stitch/validation/final upload failure reuses the same ready scenes/manifest/bytes, never calls an AI provider to rebuild the movie. Verify the private stored final object before final review.

## Provider-neutral audio and V1 boundary

[voice-generation.md](voice-generation.md) owns the planned reusable CharacterVoiceProfile/VoiceGenerationProvider/Voice Design and exact segment/continuity/timing/private-audio/cost rules. ElevenLabs remains the dialogue voice source. Normal V1 automatically resolves/commits one designed identity from approved instructions and reuses it; it has no manual voice-preview/profile approval gate and does not require a real creator recording. Uploaded/IVC/PVC voices remain future options.

Character dialogue automatically passes through the internal [LipSyncProvider stage](#automatic-scene-processing-and-lipsyncprovider) using the exact ElevenLabs audio. Silent scenes skip both voice and lip-sync. Required narration remains voiced and correctly placed without inventing on-camera mouth motion. Native video audio is optional and cannot replace dedicated Character speech unless a future workflow explicitly chooses it; prevent duplicate speech.

All strategies are resolved as architecture decisions; exact voice/sync models/account capabilities, language/performance mapping, automatic candidate-selection policy, output/timing/mix/retention/pricing and persistence remain implementation-time verification details. Required speech/synchronization/audio cannot become optional because a first model lacks support. Missing audio/sync blocks readiness/final completion before paid waste; no adapter or runtime support is claimed by this document.

## Final validation, review and completion

Before exposing the final video for review, trusted automatic validation must establish:

- Every required scene is internally complete/private/durable and bound to the exact owner/project/package/scene/version/hash and current composition manifest; no missing, duplicate, stale or technically incomplete scene. No per-scene owner acceptance is required.

- Correct Storyboard order/coverage, target aspect ratio/resolution/profile and expected duration within the predeclared technical tolerance; readable/decodable video with valid stream/time-base metadata.

- Every required dialogue/narration segment uses the exact CharacterVoiceProfile/binding, approved text/window and scene; readable private audio, valid alignment/placement and authoritative ElevenLabs speech. Character dialogue has verified lip-sync-stage output/provenance rather than a mux-only claim. Silent skips and narration routing are explicit; required final audio streams exist.

- Private final object length/MIME/ETag/SHA-256, output/assembly fingerprint, technical validation receipt and immutable source video/audio/sync lineage. Successful FFmpeg exit or a provider URL alone is insufficient.

- Current package/upstream approvals, current execution/cost authority and trusted financial completion eligibility; a late old worker/result cannot overwrite a newer candidate.

Normal V1 shows simple persisted progress: **Preparing final video · Generating scenes · Adding voice · Synchronizing dialogue · Combining scenes · Finalizing video · Final video ready**. Skipped silent stages are not fabricated progress. Detailed per-scene/provider requests, percentages, voice-selection, stage controls and debugging stay internal unless a safe error diagnostic is necessary. Errors/reconciliation show a clear stopped/recovering status without requiring routine manual scene work.

The Final Video view shows only the completed final candidate for normal review: owner-authenticated private player, measured duration, aspect ratio/resolution and generation status. Reuse existing Studio navigation/controls/accessibility/Tailwind/native scrolling; no UI is implemented here. Normal review actions are **Approve Final Video** and **Reject and Delete Final Video**. Advanced scene review/regeneration is internal/future, not an exposed V1 gate.

Final approval atomically binds the exact current package/composition/completed-scene/audio/profile/sync/final asset versions/hashes and expected command version. Recheck trusted stored validation/ownership under database fencing before final_approved and receipt-backed Complete through the existing accounting owner. Duplicate approval/settlement is harmless. Provider/scene/stitch readiness never completes the workflow alone.

Final rejection fences/deletes only the composed final candidate, preserves reusable verified intermediates and audit/financial evidence under the safe retention rules, and does not automatically regenerate, rerun lip-sync or restitch. Any later explicit Generate Final Video action must be admitted anew and can reuse compatible completed work. No refund/hold/abandonment policy is invented.

## Planned persisted states and checkpoints

These are conceptual labels, **not installed enums/tables/RPCs or UI**. Keep independent stage checkpoints and stable successful artifact references; a single global running flag cannot recover a partially completed scene.

| Scope | Planned states / gates |
| --- | --- |
| Admission | Approved current package → explicit Generate Final Video with matched cost authorization → full preflight → automatic internal work. No provider selector or extra scene/voice approval. |
| Video | queued → submitting/generating → reconciling where uncertain → saving → video_ready, or known failure. Preserve request ID/intent, source visual and independent attempt count. |
| Voice | Internal reusable profile design/identity commitment once, then per-segment queued/generating/reconciling/saving → audio_ready or validation issue; explicit skipped_no_speech with zero paid work where applicable. |
| Lip-sync | Waiting for exact visual/Character-audio guide → queued/submitting/generating/reconciling/saving → sync_ready or failure. Silent/non-Character narration skips are recorded. Its own fingerprint/attempt/request/output lineage is separate from video and voice. |
| Storage / scene | Per-artifact pending/saving/verification/recovery failure → durable; scene_ready only after required video/voice/sync/timing/storage proofs pass. Source/derived readiness is not owner acceptance. |
| Final composition | All required current scenes ready → automatic combining → finalizing (inspect/store/verify) → final_review. Bounded deterministic recovery reuses exact manifests/bytes. |
| Final review | Approve Final Video → final_approved → trusted Complete; Reject and Delete → fenced final cleanup with no generation. |

Persist append-only phase/reason/version/attempt/claim/heartbeat/request/checkpoint events. Refresh/reopen and worker restart read this truth and fence expired claims; observation/local retries cannot reset paid attempt counts or resubmit unknown requests. Changing required upstream versions invalidates dependent readiness/final approval while preserving historical success. M9 approval still pauses in current source; this documentation does not enable an execution consumer.

## Security, development restrictions and implementation handoff

Every server command/read/preview/worker/recovery/cleanup/final approval independently verifies application owner → project → exact package → scene/stage/attempt/profile → asset/composition/final relationships. Enforce scoped uniqueness, immutable evidence, compare-and-set/lease fencing and private grants/RLS. Never trust client owner IDs, provider URLs/keys, completion or billing assertions. Automatic scheduling does not weaken authorization.

Credentials/configuration remain server/worker-only. Restrict provider request/voice IDs and asset keys to private records; browser projections contain safe progress/final metadata and short-lived owner-authorized previews. Redact raw provider bodies/exceptions/prompts/dialogue, signed/result URLs, base64, credentials and storage keys. Adapter downloads enforce reviewed hosts/schemes/redirect/size/time rules and never forward credentials to output hosts. No permanent signed links or private media in Marketplace snapshots.

[Current documentation-only scope](ai-workflow-rules.md#automated-m10-documentation-scope-2026-10-27) authorizes no application code, migration, environment/dependency/credential change, provider/live database/storage call, worker/job/media process, tests/build, deployment or hosted setting change. Render and local/hosted Inngest remain disabled; the existing local worker is the development execution path and is not started.

Later separately authorized implementation must verify exact video/Voice Design/TTS/lip-sync model/account capabilities and retention; automatic identity selection/commit policy; approved conditioning; output/quantization/controlled audio fitting; guide/mix/transition contracts; finite per-stage/execution attempts/cost authorization; current financial review/terminal mapping; catalog-compatible persistence and local tool/resource bounds. These are technical details under resolved strategies, not new provider choices for the user or permission to invent support.

Later authorized acceptance must cover dialogue/silent/narration routes, one profile across scenes, no normal intermediate review gates, known-result/unknown-intent reconciliation, duplicate starts/restart/lease fencing, storage-first recovery, independent lip-sync failure, partial scenes, deterministic order/audio placement and final-only approve/reject without regeneration. No such tests or operations run in this documentation task.

## Changed files in this source delivery

- [.env.example](../.env.example)
- [.gitignore](../.gitignore)
- [app/api/ugc/final-video/preview/route.ts](../app/api/ugc/final-video/preview/route.ts)
- [app/api/ugc/final-video/route.ts](../app/api/ugc/final-video/route.ts)
- [components/creation/final-video-review.tsx](../components/creation/final-video-review.tsx)
- [components/creation/ugc-progress-preview.tsx](../components/creation/ugc-progress-preview.tsx)
- [components/creation/ugc-workflow-preview.tsx](../components/creation/ugc-workflow-preview.tsx)
- [context/accounting.md](accounting.md)
- [context/ai-workflow-rules.md](ai-workflow-rules.md)
- [context/architecture.md](architecture.md)
- [context/code-standards.md](code-standards.md)
- [context/database.md](database.md)
- [context/design-system.md](design-system.md)
- [context/final-video-generation.md](final-video-generation.md)
- [context/generation-dispatch.md](generation-dispatch.md)
- [context/generation-jobs.md](generation-jobs.md)
- [context/internal-authorization.md](internal-authorization.md)
- [context/media-storage.md](media-storage.md)
- [context/media-worker-render.md](media-worker-render.md)
- [context/overview.md](overview.md)
- [context/pricing.md](pricing.md)
- [context/progress-tracker.md](progress-tracker.md)
- [context/project-overview.md](project-overview.md)
- [context/storyboard.md](storyboard.md)
- [context/ugc-v1-workflow.md](ugc-v1-workflow.md)
- [context/ui-context.md](ui-context.md)
- [context/video-generation-package.md](video-generation-package.md)
- [context/voice-generation.md](voice-generation.md)
- [lib/db/types.ts](../lib/db/types.ts)
- [lib/final-video-generation/adapters/elevenlabs.ts](../lib/final-video-generation/adapters/elevenlabs.ts)
- [lib/final-video-generation/adapters/fal.ts](../lib/final-video-generation/adapters/fal.ts)
- [lib/final-video-generation/adapters/http.ts](../lib/final-video-generation/adapters/http.ts)
- [lib/final-video-generation/adapters/registry.ts](../lib/final-video-generation/adapters/registry.ts)
- [lib/final-video-generation/config.ts](../lib/final-video-generation/config.ts)
- [lib/final-video-generation/contract.ts](../lib/final-video-generation/contract.ts)
- [lib/final-video-generation/media.ts](../lib/final-video-generation/media.ts)
- [lib/final-video-generation/planning.ts](../lib/final-video-generation/planning.ts)
- [lib/final-video-generation/preflight.ts](../lib/final-video-generation/preflight.ts)
- [lib/final-video-generation/progress.ts](../lib/final-video-generation/progress.ts)
- [lib/final-video-generation/providers.ts](../lib/final-video-generation/providers.ts)
- [lib/final-video-generation/server.ts](../lib/final-video-generation/server.ts)
- [lib/final-video-generation/storage.ts](../lib/final-video-generation/storage.ts)
- [lib/final-video-generation/worker.ts](../lib/final-video-generation/worker.ts)
- [lib/storage/r2.ts](../lib/storage/r2.ts)
- [lib/ugc-jobs/claim-contract.ts](../lib/ugc-jobs/claim-contract.ts)
- [lib/ugc-jobs/contract.ts](../lib/ugc-jobs/contract.ts)
- [lib/ugc-jobs/database-diagnostics.ts](../lib/ugc-jobs/database-diagnostics.ts)
- [lib/ugc-jobs/local-runner.ts](../lib/ugc-jobs/local-runner.ts)
- [lib/ugc-jobs/queue-policy.ts](../lib/ugc-jobs/queue-policy.ts)
- [lib/ugc-jobs/server.ts](../lib/ugc-jobs/server.ts)
- [package.json](../package.json)
- [scripts/check-final-video-media.ts](../scripts/check-final-video-media.ts)
- [scripts/check-final-video.ts](../scripts/check-final-video.ts)
- [scripts/final-video-fixture.ts](../scripts/final-video-fixture.ts)
- [scripts/ugc-worker.ts](../scripts/ugc-worker.ts)
- [supabase/migrations/20261027006900_ugc_final_video.sql](../supabase/migrations/20261027006900_ugc_final_video.sql)
