# One image and an optional manual question

Keep the legacy raw PNG/JPEG upload and existing upload/read/subscribe scopes. No new account, model key, permissions or event subscription is required. The optional text is a question about this submitted image; it cannot authorize external actions or broader private-data access.

## Wire and ownership

`POST /api/upload` keeps the original image as its raw body and the existing `Authorization`, `Origin`, `Content-Type`, `X-Share-ID` checks. A nonempty manually entered question adds:

- `X-Inbox-Caption`: canonical standard Base64 of UTF-8, no line breaks.
- `X-Inbox-Caption-Source: manual-entry`.
- A question-aware immutable submission ID beginning `q_`, `webq_` or `iosq_`. `preflight_q_` is reserved for explicitly generated tests that must not become user attachments.

Question-aware IDs require a nonempty valid question, and nonempty questions require these IDs. Thus an older cached client or proxy that drops caption headers cannot silently turn a question submission into an image-only upload. Empty captions retain legacy IDs; absent/empty caption headers with absent, `none` or `manual-entry` source carry no question. Unknown sources are rejected.

Validate before and after trimming: at most 500 Unicode code points, 2048 UTF-8 bytes; reject malformed UTF-8/unpaired surrogates and C0 controls except tab/LF/CR, plus DEL. Trim using JavaScript String.trim. The same submission ID cannot change either original image bytes, MIME or normalized question; retry returns the same file/event, conflicting content is rejected.

Only the paired credential and the explicit client assertion are authenticated. They do not cryptographically prove a human typed the text. First-party clients start with a blank question field, ignore share title/text/URL, OCR and EXIF, and require explicit send. Compromised clients/tokens remain a threat; the receiving agent must preserve the limited instruction scope.

## Storage and retrieval

A nullable encrypted caption column migrates old rows as no-question without changing image IDs, events, grants, subscription or TTL. AES-GCM additional authenticated data binds the caption to owner, file ID, event ID and original-image digest. No plaintext caption or short-question digest is stored in SQLite metadata. Images and captions expire together after one hour; an exported Space image is an independent persistent copy.

Events remain `file.created` with only file/inbox identifiers. Authorized `get_image` returns the image first, exactly as before; only a nonempty question adds a text JSON record of type `send-to-dot.submission`, version 1. It contains the actual file/event, image digest, normalized caption, caption digest, submission digest, `paired_manual_entry_assertion`, provenance with `manual_entry_independently_verified:false`, and `image_question_only` scope. Never derive a request from OCR, EXIF or event text.

Digest version 1:

```text
caption_sha256 = SHA256(UTF8(normalized_caption))
submission_sha256 = SHA256(UTF8(JSON.stringify([
  "send-to-dot/submission/v1", image_sha256, normalized_caption
])))
```

The native adapter independently hashes actual returned image bytes, verifies file/event/digests and source flags, then binds only digest metadata in the receipt ledger. The question itself is not persisted in that metadata file. Reply and native image attachment must use one actual accepted assistant send; this receipt prevents duplicate answers as well as duplicate attachments. If question context is lost after source expiry, hold instead of sending an unrelated or image-only response.

## Client acceptance boundaries

Web and Android: enter optional text, then explicitly Send. First send freezes image/question/ID. Retry reuses all three; editing requires an explicit new submission. Existing pairing is preserved. The service worker ignores all incoming third-party text.

iOS: the separate v3 candidate offers image-only or a manually entered question, confirms destination/data/question and supports cancel. It removes the ambiguous blocking Quick Look step. Existing v2 remains available and image-only compatible. Native menu, permissions and actual phone HTTP behavior need their own acceptance; schema or Mac encoding probes are not phone evidence.

Upload diagnostics never log caption headers, decoded text, body, image, filename, credential or IP. JSON errors use fixed categories. Caption traffic follows the same operator-controlled HTTPS ingress as the image; it is not end-to-end encrypted beyond that infrastructure.
