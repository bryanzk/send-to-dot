# Dot-native delivery (optional, preview)

Optional mode in which the original dot itself saves the exact original image to its Library and sends it in the existing conversation, driven by a `file.created` event. Everything is **off by default**; nothing changes for existing installs unless you set the keys below.

## Configuration keys (`approved.config.json`)

| Key | Meaning |
|---|---|
| `dotNativeDelivery: true` | Registers the delivery tools below. Required for everything else here. |
| `ledgerPath` | Absolute path of the existing canonical delivery ledger (`attachment-map.json`). Enables `pending_deliveries`, argument-free claims, `next_pending` and the unclaimed-event alert. Never point two instances at one ledger. |
| `originalDownloadLinks: true` | Claim returns a single-use, 2-minute download link served by this service (`/api/original/<token>`, memory only, at most 20 pending). |
| `r2CredentialsFile` | Optional. Path to a mode-600 JSON file `{account_id,bucket,access_key_id,secret_access_key}` for a **private** Cloudflare R2 bucket. Originals are uploaded in the background at upload time and the claim returns a 2-minute presigned GET instead of the host link; objects are deleted after recording, on uncertainty, and after 15 minutes at the latest. If R2 is not ready the host link is used. |
| `inlineOriginalLimit` | Bytes (max 8 MiB) for the inline fallback when no link mode is enabled. |
| `dispatchOnUpload: true` | Dispatch the event immediately after upload instead of on the 5 s timer. |

The R2 bucket must stay private (no public access, no custom domain). Use an API token limited to that one bucket with object read/write.

## Tools

- `pending_deliveries` — read-only work list (`pending`, `held`). Uncertain records stay in `held` even after the 1 h inbox copy expires.
- `claim_image_delivery` — dedup/hold check against the ledger, then returns `download_url`, `original_sha256`, `original_bytes`, `claim_id` and `next_pending`. Call without arguments to claim the oldest pending image; `none_pending` means the list is empty.
- `record_images_sent` (up to 10) / `record_image_sent` — record real Library and message receipts. Records only.
- `reserve_answer` / `record_answer_sent` — the separate answer message for an image question.
- `mark_delivery_uncertain` — hold on timeout/unknown outcome; never retried automatically.
- `reconcile_image_delivery` — resolve a held image only from a checked real outcome: `sent` (real receipts) or `not_created` (verified before any Library save; claimable once).

## Dot task outline

1. On trigger, call `claim_image_delivery` at once (event IDs if present, otherwise no arguments). No narration and no extra tool calls before the image is sent.
2. Download the link once with a fixed command, e.g. `curl -fsS -A 'SendToDot-Dot/1.0' --max-time 60 -o /tmp/stdot-<F> -w '%{http_code} %{size_download}' '<URL>' && sha256sum /tmp/stdot-<F>`; check status, size and SHA-256. Some CDNs reject default library user agents.
3. `library.create_library_file` once (it requires a local absolute path), then send once with `library_file_ids`.
4. Follow `next_pending` until it is empty, then `record_images_sent` once, then one argument-free claim to confirm `none_pending`.
5. Anything uncertain: `mark_delivery_uncertain`, check the real conversation, never resave or resend.

## Measured latency (single author deployment, generated test cards, API upload)

Upload to message accepted: 45.5 s (6.5 KB), 60.0 s (1.1 MB), 72.3 s (2.3 MB, third in a burst). The phone showed the image about 1 s after acceptance in earlier screen recordings. Server dispatch is about 1 s and R2 staging under 1 s; the time is platform wake-up (about 12–20 s) plus about 20–30 s of dot tool calls per image. **This path does not reach a 30 s tap-to-visible target.** Native sharing from the phone into the conversation is immediate but is outside this service. Physical-phone timing of this release: not yet verified.
