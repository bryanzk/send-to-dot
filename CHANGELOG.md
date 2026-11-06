# Changelog

## 0.9.1 (preview)

- One-sentence Cloudflare setup with your own dot, no Mac: README “No Mac” prompt and the “Cloudflare path” in INSTALL_FOR_DOT.md. Deployment uses Cloudflare's “Deploy to Cloudflare” page (root `wrangler.toml`, Worker `send-to-dot-cloud`, free plan) and asks only for your owner code.
- The Worker needs no address or encryption-key secret: the key is generated inside the Durable Object, the owner's first `/setup` binds the address, and `/setup` issues phone codes (shown once). Admin endpoints accept the owner code.
- Setup form accepts same-origin posts when the browser sends `Origin: null`.
- The unclaimed-event alert is logged once per event even after the Durable Object restarts (it was repeated every 15 s).
- Verified on the author's account: deployed from the Deploy page into a new private repository, `/setup` bound the address and issued a phone code, a phone upload was received, and ChatGPT connected over OAuth and called `inbox_status` (read and subscribe authorized). Another user's independent deployment and screen-recorded tap-to-visible timing remain not yet verified.

## 0.9.0 (preview)

- Optional Cloudflare deployment (`cloud/`, `docs/CLOUDFLARE_DEPLOYMENT.md`): the whole inbox runs on Workers + one Durable Object, so a Mac no longer has to stay on. Free plan; no R2 bucket needed.
- Same code on both hosts: `app.mjs` and `store_core.mjs` hold the platform-neutral app and inbox; `server.mjs` and `store.mjs` keep the Mac defaults (file SQLite, Python decoder and ledger, Node webhook transport). The Mac install path and its prompt are unchanged.
- Cloud delivery ledger ported from `split_delivery.py` with the same states, leases, dedup and hold rules; imported histories stay deduplicated.
- Cloud image check: PNG/JPEG structure and checksums, size and pixel limits; multi-picture (Ultra HDR) JPEGs from current Android cameras accepted by their primary image, delivered unchanged. Rejections record a reason code.
- Single-use original links stored in SQLite; signed `fetch` webhooks with alarm retries; owner admin tool `cloud/admin.mjs` (status, upload code, ledger import, audit timeline).
- `claim_image_delivery` without arguments claims the oldest pending image (one fewer dot tool call); `reconcile_image_delivery`; uncertain records stay held after the inbox copy expires.
- Measured on the author deployment: upload to accepted 43–56 s for test cards; real phone photos 28.6–35.1 s from event to accepted. Screen-recorded tap-to-visible timing for this release is not yet verified.

## 0.3.0 (preview)

- Optional dot-native delivery (`dotNativeDelivery`, off by default): one-call claim against the canonical ledger, single-use 2-minute original download links, optional private Cloudflare R2 pre-staging with presigned GETs, batch receipt recording, `next_pending` draining and argument-free claims. See `docs/DOT_NATIVE_DELIVERY.md`.
- `pending_deliveries` work list; uncertain records stay held after the inbox copy expires. Unclaimed-event alert in the audit log.
- `reconcile_image_delivery` resolves an uncertain image only from a checked real outcome; nothing is resent automatically.
- `inbox_status` connection check, OAuth registration audit, `/.well-known/oauth-protected-resource/mcp` alias and per-dispatch audit records.
- Measured upload-to-accepted 45–72 s on the author deployment; the 30 s target is not met on this path. Physical-phone timing of this release is not yet verified. iPhone Shortcut and Android page are unchanged.

## 0.2.1

- Put ready-to-copy dot install instructions first in English and Chinese README, with the release URL on its own line to avoid Chinese punctuation entering the link.
- Resolve the newest published non-draft release, explicitly including previews, instead of using main or GitHub’s stable-only latest shortcut. Verify the selected tag, assets and checksums before installation.
- Publish the blank signed iPhone Shortcut as `Send-to-dot.shortcut`, with installed display name **Send to dot**. Functional actions and saved-code behavior are unchanged. Importing a new copy still requires your own settings.
- Preserve v0.2.0 and its assets. No service, authorization or delivery-latency change is part of this patch.

## 0.2.0

- Keep the Android send screen focused on one image, an optional question and Send; use plain-language state/error messages and avoid automatic resends.
- Add a signed blank Chinese iPhone v5 Shortcut with clearer setup, confirmation and submission messages. It preserves saved private configuration and the existing 30-day grant policy; importing a new copy still requires entering your own address and upload-only code.
- Check the setup-selected absolute Pillow12.0.0 runtime at service startup. An older managed trial decoder rejected an Android Ultra HDR JPEG as a multi-image MPO; selecting the pinned decoder preserves the original bytes and avoids that mismatch.
- Add local image-first / answer-later orchestration, independent durable receipts and a recording-based latency acceptance scorer. Existing accepted records remain skips; uncertain sends require reconciliation.
- Document actual trial evidence and remaining limits. The 30-second image-visible target was not met. There is no backend API for directly posting a native assistant attachment to an arbitrary ChatGPT thread.

No private photos, recordings, live probe tool, credentials, private deployment address, runtime database or delivery ledger is part of this source candidate. Another qualified user's independent installation and 30-day continuous operation remain unverified.

## 0.1.0

Initial public source with dot-guided setup, bilingual documentation, Android sharing, iPhone templates and 30-day access support. Code upgrades do not extend existing authorizations.
