# Repeatable30-second visibility acceptance

No live test has been run for the new path. Unit fixtures are not phone acceptance.

## Minimal user participation

Use **iPhone’s built-in screen recording**, which avoids synchronizing two clocks or needing a second camera:

1. After activation/health/tool checks, prepare a non-private test card with a unique `STDOT-...` marker. Do not send it until the user approves this test submission to the original dot.
2. User opens the **original dot conversation** on iPhone once so it is ready in recent apps, then starts screen recording. Do not record other conversations or personal photos.
3. From Photos/Files, share the unique card using the configured shortcut. Complete any optional question before the timed final Send confirmation.
4. Tap final Send, immediately return to that original dot conversation, and keep it open. Stop recording after the marked original picture is actually visible or after at least35s without it. No repeated sends.
5. User provides this one recording privately. Agent actually reviews sending-confirmation transition and first frame showing the unique original card in the correct dot. Filename/attachment tile/preview spinner/text reply/API accepted alone do not count.

If the original dot cannot be opened on that phone, stop and use one camera recording both the phone final Send tap and the original-dot computer display in the same continuous clip. Do not combine unrelated wall clocks/screenshots and call the result verified.

## Evidence and scorer

`python scripts/verify_latency.py RECORDING_PATH REVIEW_JSON_PATH`

The tool hashes the actual local recording and obtains media frame timestamps using the existing `ffprobe`. The reviewing agent supplies **actual** zero-based frame observations, never guessed times. Example shape (placeholders, not real evidence):

```json
{"source":"single_continuous_recording","recording_sha256":"ACTUAL_RECORDING_SHA256","marker":"STDOT-UNIQUE12345","conversation_id":"VERIFIED_ORIGINAL_DOT","visible_conversation_id":"VERIFIED_ORIGINAL_DOT","phone_start":{"kind":"phone_tap_send","ui_reviewed":true,"marker":"STDOT-UNIQUE12345","frame_index":0},"dot_visible":{"kind":"original_image_pixels_visible","ui_reviewed":true,"marker":"STDOT-UNIQUE12345","frame_index":900}}
```

For iOS recording without touch indicators, use the **last frame before the final send-confirmation disappears** as the conservative observable start, and the first reviewed frame where the unique original card pixels are visible as end. This upper-bound interval may be slightly longer than actual tap-to-visible (frame resolution). Pass only if that conservative interval is≤30s. Do not claim millisecond-accurate physical touch detection.

If no image is visible by deadline, omit dot_visible and provide a reviewed continuous deadline observation:

```json
{"kind":"image_absent_through_deadline","ui_reviewed":true,"continuous_review":true,"frame_index":1050}
```

Place this as `deadline` in the same run evidence. The recording must cover at least30s after start. Scorer verdicts:

- **PASS** only matching recording/marker/original conversation/actual reviewed UI frames, conservative duration≤30000ms.
- **FAIL** if observed duration exceeds30000ms, or continuous reviewed absence covers30s.
- **INVALID_EVIDENCE** if phone click/UI visibility, matching marker/recording or original conversation is not established. This is not acceptance passed.

Review is necessary to identify genuine UI transitions; the script automatically calculates duration and verdict from the media timestamps. It does not autonomously understand a phone screen or turn a filled JSON flag into visual proof. Tests use simulated observations only.

Collect timestamps for upload accepted, event dispatch response, task wake, compact read, byte verification, Library save, image post accepted and visible-frame end. API timestamps diagnose failed segments but never replace visible-frame evidence. Answer delivery is separate and does not delay the image. Android receives its own acceptance run **after** invalid_image is fixed; iPhone success is not Android success.

## One bounded approval request

Ask once for the exact bundle: update/restart the current private service once and refresh the same plugin’s read tools; install the same-ledger fast adapter and preserve existing permissions/address/code/subscription; enable immediate dispatch on the same queue; send one generated non-private marked test card through the user’s configured iPhone to the original dot; privately review only this test’s screen recording. No public push, new credential, resource purchase or broad screen monitoring. User performs the phone tap/recording; agent prepares everything else first and reports measured pass/fail.
