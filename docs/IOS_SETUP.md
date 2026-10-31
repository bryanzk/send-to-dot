# Add Send to dot on iPhone

1. Ask your dot to select the newest published release, including previews, using [the release guide](LATEST_RELEASE.md). Open its `Send-to-dot.shortcut` attachment on iPhone. If it does not open in Shortcuts, save it in Files and open it there.
2. Choose Add Shortcut. Enter your own picture-receiving address, ending at the website name; do not add `/mcp` or `/api/upload`.
3. Enter your existing phone upload-only code yourself. Never enter your account password, owner approval code or an OpenAI key. The two settings start blank in the public template.
4. Check that the shortcut appears as **Send to dot**. In Photos or Files, choose one JPG or PNG, share to Send to dot, optionally add a question and confirm sending.
5. “图片已提交” means the receiving service accepted the image. Return to your original dot conversation and wait for the image and reply; it is not proof they have appeared.

The configured code is visible when editing the shortcut and may sync through iCloud or accompany an export. Do not share or export the configured copy. It has only upload permission, but someone who gets it could upload into your inbox. Ask the person managing your service to revoke or rotate it if exposed. Its expiry is unchanged by installing this file.

A newly imported copy cannot inherit settings from an older shortcut. Enter the same valid address/code yourself, then remove an old copy only after checking the new one. Existing configured shortcuts keep working within their actual authorization period; this naming update does not require issuing a new code.

The public name is now Send to dot and the signed asset contains the same actions as the earlier Chinese template, except for the display name. Signing, blank fields and action equivalence were checked locally. The newly named file's iPhone import/display has not yet been separately tested; previous single-user sends do not prove every iOS version, repeated no-prompt reuse or 30-day continuity. The 30-second delivery goal remains unmet.
