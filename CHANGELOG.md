# Changelog

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
