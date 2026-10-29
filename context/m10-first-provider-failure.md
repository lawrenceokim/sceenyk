# First real M10 provider failure investigation — 2026-10-28

## Historical investigation only — new V3 cycle is independent (2026-10-29)

Preserve all V1/V2 provider failures, voice/Kling/master-audio recovery evidence and exact old-execution commands below. They are historical/experimental, not the normal future path. [Canonical V3 OpenAI + Higgsfield](generation-architecture-v3.md), **Planned / Not Started**, starts its next test cycle with a brand-new project, different supplied image, fresh references/Storyboard and fresh authorization/accounting.

Do not resume, migrate, rebind or reuse the previous test execution/media/voice/master assets for V3, or interpret historical recovery steps as current permission. Nothing in this investigation or its saved project/assets is altered or executed during this documentation update.

**V1 / historical execution investigation.** Preserve the dated evidence and recovery instructions below; the owner's current milestone baseline is M10 V1 implemented and proven end-to-end, not a claim that every historical repair/check is complete. [Final Video V2](final-video-generation-v2.md), **Planned / Not Started**, replaces per-scene + normal Kling as future architecture without changing this execution, its assets, requests, authorization or history. No historical command is run during this documentation update.

Latest speech-timing follow-up (2026-10-29): binding attempt 2 succeeded and Scene 1 is fully ready. Scene 2 video is ready; Scene 2 TTS request `6G0QlOkRqSH8hU90LCHx` returned and saved audio/alignment, then local validation rejected its 1489ms MP3 duration against 1400ms+50ms. The decoded source is 1440ms. A temporary-copy 1.048× atempo test produces a 1387ms WAV without cutting speech, so saved-output recovery needs no new TTS. The live execution remains unchanged at 11/12 with one request for Scene 2 lip-sync. Source now supports bounded fitting, neutral targets, preserved timing proof and explicit provider-free recovery/authorized continuation; no live recovery/amendment/intent/provider ran. [Full evidence, all eleven intents and safe continuation](final-video-generation.md#saved-scene-2-speech-timing-and-local-recovery-2026-10-29).

Latest read-only follow-up (2026-10-29): Design attempt 4 is ready with saved preview `U3O1s7WmOkd2DHV7Di0f`, complete local/R2 audio and response proofs. Binding attempt 1 (`284736e6-ee18-444f-97f5-e8d9df693442`) rejected with retained POST 400 / invalid_labels / `Each label value cannot exceed 50`. Its optional profile label was a 64-character SHA-256 digest; application was 7 characters. Source now omits the digest, validates short labels locally, and adds binding-specific amendment/replacement support through manual migration 074. The live run remained failed, unchanged at six intents and three amendments (11 effective), with no voice binding, speech, sync or final output. No live amendment/retry/provider/worker ran. [Verified evidence, +1 proposal and safe manual steps](final-video-generation.md#saved-voice-design-and-binding-only-replacement-2026-10-29). Historical snapshots below are retained as dated evidence.

Follow-up: the controlled same-execution amendment/Voice Design replacement path is now implemented in source, with manual migration 073 and operator setup still Pending. No actual amendment/retry was performed. [Current contract and exact manual steps](final-video-generation.md#controlled-request-amendments-and-voice-design-retry-2026-10-28). The original investigation/audit below retains its historical evidence.

Execution `62e93717-9e00-486e-b968-a85f272b831d`, job `e3b27b7c-8f4e-4c2a-acf2-d0455514e927`, approved package `1fe9e8ab-88a6-4700-ac70-e1175d36ba17`.

Investigation used only SELECT-equivalent Supabase REST GETs, execution-scoped R2 LIST metadata, local recovery-file reads/hashes, source inspection and public documentation. No fal/ElevenLabs API request, retry, recovery action, worker, RPC, live mutation, SQL application, deletion or deployment. Dates below use Africa/Lagos (WAT, UTC+1).

## Persisted failure

### Owner-reported cause and permission correction

After the initial investigation, the owner identified the response as **HTTP 403 caused by missing permissions on the restricted ElevenLabs key**. They enabled Text to Speech Access, Voice Generation Access, Voices Write and Models Access, retaining Restrict Key and leaving IP restriction off. This is owner-supplied evidence; no provider call was made to verify those permissions, and the original persisted status/body remain absent. The original evidence table below describes what the execution itself retained, not a denial of the subsequently supplied cause.

Fresh GET-only inspection after that correction confirms the execution still failed at the same timestamp, with the same two operations and 167 events. The local configuration hash still matches the execution; maxRequests remains 8 and the USD ceiling remains $7. Key permissions are not part of the execution configuration hash.

**Current Recover saved work cannot resume the rejected design.** The server rejects that action with FINAL_SAVED_RECOVERY_CANNOT_RETRY_REJECTED, and the worker independently stops at the failed operation before calling its provider. Even the older requeue-only path would find the existing failed intent rather than create a new design request. No execution was created, requeued or retried during this check.

The HTTP 403 consumed one Sceenyk request-intent/attempt slot regardless of whether ElevenLabs billed it. Counters remain 2/8; no failed attempt or credit reservation is refunded automatically. A successful replacement plus all remaining stages would require seven more requests, nine overall. The $7 USD ceiling remains adequate under the included-credit cost estimate, but full completion requires an explicitly reviewed request-cap amendment to at least nine and an explicit rejected-stage retry path that preserves the old attempt/accounting and reuses the saved video. Neither path exists yet. Editing only UGC_FINAL_AUTHORIZATION changes the hash and makes the existing worker stop with FINAL_CONFIGURATION_CHANGED; it does not safely amend the execution. No authorization was changed.

| Field | Evidence |
| --- | --- |
| Context | Scene 1 processing; global Voice Design prerequisite before its speech |
| Failed operation | `bc728e62-7473-41d8-a4f0-9fe50252e2c4`, key `voice:design`, kind `design`, scene_id null |
| Provider/model | ElevenLabs / `eleven_multilingual_ttv_v2` |
| Attempt | 1; existing SQL enforces attempt=1 |
| Fingerprint | `8a900f7d8cc6e419ceb875e9ab055ad5cdb747c30a58aace24781c2dd9b6dd8a` |
| Failed at | Operation 19:50:52.219887 WAT; execution stopped at 19:50:52.526377 WAT |
| Execution state | failed / scene_failed / FINAL_PROVIDER_REJECTED |
| Provider request/job ID | Not retained: operation.request_id null, receipt null |
| HTTP status | Not retained |
| Provider error code/message | Not retained; exact rejection reason unavailable |
| Acceptance | HTTP-level rejection observed; no successful design/preview/job receipt. Whether remote processing began is not provable from retained evidence. |
| Billing | ElevenLabs credit consumption/immediate charge unknown; no usage receipt. The reserved 119-credit estimate is not actual usage. |

The original `jsonRequest()` branch canceled every non-success response body without parsing/persisting status, provider code, message or generic request headers. It mapped status >=500 to FINAL_UNCERTAIN_PROVIDER_OUTCOME, 429 to FINAL_PROVIDER_RATE_LIMIT and every other non-success response to FINAL_PROVIDER_REJECTED. That establishes an HTTP rejection class, not the original exact status. It cannot establish a particular 401/403/422, account restriction, safety failure or payload error.

The execution's local spool has four files, all belonging to the successful fal operation, with no file at all for the failed design operation. Its complete R2 prefix listing has only the successful video and fal queue receipt. The 167 persisted events contain phases/error code, not provider status/body. No matching provider diagnostic was found in the available local Next development logs or worker log files. No provider was contacted to fill this evidence gap. Existing external provider logs are needed to establish the exact remote reason; a new paid attempt is not an acceptable diagnostic substitute.

## Failed outbound payload

The request was not captured as wire bytes. This is a **deterministic reconstruction from the failed operation's saved profile/previewText and the adapter source**, not a claim that an original request-body log exists. The source refactor extracts the same body without changing its fields or values.

`POST https://api.elevenlabs.io/v1/text-to-voice/design?output_format=mp3_44100_128`

Headers: `Content-Type: application/json`, `xi-api-key: [REDACTED]`.

```json
{
  "voice_description": "Clear, calm young adult male voice with a confident professional delivery and slight upbeat energy.\nApproved tone: Professional. Pace: natural. Language: en. Delivery: natural",
  "model_id": "eleven_multilingual_ttv_v2",
  "auto_generate_text": false,
  "text": "Nice. Smooth and ready. Nice. Smooth and ready. Nice. Smooth and ready. Nice. Smooth and ready. Nice. Smooth and ready.",
  "should_enhance": false
}
```

The text is 119 Unicode characters. No image/video/audio references, signed URLs, duration, aspect ratio, resolution, video native-audio setting or additional provider fields apply to this Voice Design request. `voice_description` is the voice prompt; `text` is the audition script. MP3/44.1kHz/128kbps is the requested audio output.

Compared with the current [official Voice Design contract](https://elevenlabs.io/docs/api-reference/text-to-voice/design): endpoint/method, model ID, 20..1000-character description, 100..1000-character text, auto_generate_text=false and should_enhance=false match documented fields/limits. The model is explicitly listed. There is no evidence of an adapter field/length mismatch, so no endpoint/model/payload workaround or approved content change is justified. This comparison does not establish account/key permissions, quota, moderation or provider acceptance. fal reference URL format/expiry/count cannot explain this later text-only failure: fal already generated the video, and those references are not sent to ElevenLabs.

## Preserved successful work

Scene 1 video operation `a37f6418-51da-477d-aa93-d5f52f264c75` is ready. Provider `fal`, model `bytedance/seedance-2.5/reference-to-video`, accepted request ID `01a183d6-9d68-7251-aab6-eccdcea1ad6d`, attempt 1, fingerprint `100cdb34faeb7d9066bd4bcaa3385d845ff7c3c888ca867d654eecda9185219a`.

Saved normalized MP4: **5000ms, 1280x720, no audio, 1,816,068 bytes**, SHA-256 `5ca738a6157812c5ee63d75f58685b2885212a413448fed54aa12b8559b8d5d4`. Its local `.bytes` hash matches persisted output.sha256. The raw provider `.source.bytes` is **1,175,511 bytes** and remains local. Local receipt and response JSON also remain.

The complete R2 execution-prefix LIST confirms exactly:

| Object suffix | Bytes | ETag |
| --- | ---: | --- |
| `a37f6418-51da-477d-aa93-d5f52f264c75.mp4` | 1816068 | f1a8135eb8937d7bec33b15b0457f7ca |
| `a37f6418-51da-477d-aa93-d5f52f264c75.json` | 497 | bab9b6978c61e992042edc553b06465d |

These ETags/sizes match the persisted output and response proof. The remote video was not downloaded again during this investigation. Full private keys/URLs are omitted.

Voice Design: failed, no preview output. Saved identity: absent (zero matching profile rows, no binding). Speech audio: none. Lip-sync: none. Scene 2 video: not started. Scene-level muxed outputs/manifests: none. Local/final composition outputs: none. Scene 1's video operation is ready even though the scene row still says video_saving with no scene-ready manifest; that row is not evidence of a missing video.

The successful fal video is likely billable. Its intent estimate is $2.311200; actual USD is null and no provider usage/billing metadata was returned. Do not report that estimate as the actual charge or claim this failed execution spent nothing.

## Request accounting and recovery

Two provider intents exist and the execution paid_requests counter is 2/8. Both reached HTTP submission: one fal generation accepted and completed; one ElevenLabs design returned an HTTP rejection. **Completed 1, failed/rejected 1, remaining authorized new-request capacity 6.** No binding, speech, sync, Scene 2 or composition intent exists.

The original clean eight requests assumed one successful design. Replacing its rejected attempt adds one request. Still needed after the current two intents: one replacement design + identity binding + two speeches + two lip-syncs + Scene 2 video = **7**. Full completion would therefore require **9 total requests**, exceeding maxRequests=8 by one. There is room for a single new request in isolation, but not for that replacement plus all remaining planned stages. Authorization was not changed. Attempt=1, unique execution/key and failed-operation guards mean raising maxRequests alone would not make the existing design operation retryable.

Before this source fix, clicking Recover would requeue the same execution. The worker would reuse the ready Scene 1 video operation, find no cached identity, load the same failed voice:design operation and throw its saved error **before** invoking design, retrieval or later provider stages. It would not issue another provider request for this exact state, and it would not solve the rejection. It was not clicked or simulated against live data.

For other partial states, Recover can retrieve known results, retry storage, resume local processing **and submit still-unstarted authorized downstream requests**. The old blanket UI promise of no new paid requests in reconciliation was therefore misleading. The revised UI states this before the action. For terminal provider rejection/rate-limit errors, both the DTO and server action now block the unhelpful recovery action while preserving all outputs. A future stage-only paid replacement requires an explicit recovery/attempt contract and reviewed request budget, not a concealed replay or intent reset.

## Source changes and safest next step

Confirmed local root cause: diagnostic loss, not a proven remote rejection cause. Future HTTP failures now retain bounded sanitized status/code/message/request-correlation ID in operation receipt.failure and local receipt JSON; worker logs include stage/scene/provider/model/operation/attempt/fingerprint. Redacted outbound fields and an exact request-byte hash are captured before submission. Credentials, headers and signed URLs are omitted/redacted. Error bodies never enter the successful-response replay spool. Existing historical rows are unchanged; missing information is shown as not retained, not fabricated.

The owner-scoped UI receives only validated sanitized failure fields. It shows the stage/provider/model/status/reason, prevents rejected-request saved-work recovery, and explains new-request behavior for recoverable partial states. No adapter contract change, paid retry implementation, schema migration or funding change was made.

**Safest next step:** keep this execution stopped and preserve its Scene 1 video. Inspect any already-existing ElevenLabs dashboard/support/error record around **19:50:51 WAT on 2026-10-28**, and establish the rejection and actual credit usage before choosing a configuration/adapter correction. If no such record exists, the original exact reason cannot be recovered from current local data. Do not click Recover or Generate as a probe. Any later paid design replacement must reuse the existing video and requires separate explicit authorization/attempt design, with one additional request beyond the original clean-run budget if all remaining stages are to finish.

Read-only reinspection:

```powershell
node --env-file=.env.local --conditions=react-server --import=tsx scripts/inspect-final-video-execution.ts 62e93717-9e00-486e-b968-a85f272b831d --storage
```

`--storage` performs only an execution-prefix R2 LIST. The inspector never imports a worker, uses RPCs, signs media URLs, writes recovery files, or calls provider services. Output is sanitized; API endpoint/credential values are not read from failed-provider logs because none were retained.

Validation passed: 37 offline diagnostic/transport fixtures, 11 static UI assertions, 93 pricing/preflight and 87 funding assertions (228 total), TypeScript, focused ESLint and whitespace checks. Final GET-only inspection confirms the execution still failed with the original timestamp, exactly two operations/167 events and unchanged approved package hash/maxRequests=8. No live provider, recovery, worker or SQL execution was used to validate the source changes; browser/runtime acceptance of the new diagnostic display remains pending.
