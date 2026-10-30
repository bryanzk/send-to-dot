# Unified Android / iOS upload protocol

The caller holds only a one-day, revocable `upload` grant. It cannot read image bytes or subscribe to events. Pairing is manual on the user's device; never use owner approval, OAuth read, OpenAI, or ingress credentials here.

## POST /api/upload

Send one raw original PNG/JPEG body, not JSON, base64, or multipart. Headers:

- `Authorization: Bearer <upload-only credential>`
- `Origin: <exact HTTPS origin>` (no trailing slash)
- `Content-Type: image/png` or `image/jpeg`, matching decoded bytes
- `X-Share-ID: <stable random submission ID>` — 16–100 ASCII letters/digits/underscore/hyphen; UUID works

Limits: 8 MiB encoded bytes, 16 million pixels after full decode, one frame, 20 unexpired images. Unsupported formats are rejected without conversion. A successful 201 response has `file_id` and `eventId`. Retry the exact body with the same submission ID after an uncertain network result. A different body under the same ID is rejected. Idempotency records expire with the image after one hour; this is not indefinite deduplication.

Current errors: 401 invalid/expired grant, 403 wrong Origin, 413 excessive request body, 400 invalid image/MIME/submission ID/conflict/quota. Overload returns 503; total request deadline is 15 seconds and concurrent body readers are capped at four. Do not treat any non-2xx or a timeout as a confirmed delivery. Preserve the existing submission for a user-requested retry. The entry proxy can have its own limits.

## GET /api/status/{file_id}

Use the same bearer token. Returns `file_id` plus `state`: `queued`, `callback_accepted`, or `delivery_failed`. A 401 requires re-pairing. A 404 means no accessible retained image; never keep telling the user it is queued. Neither 201 nor callback acceptance proves that dot has read or answered. The real acceptance test is a response in the intended original conversation identifying an image feature omitted from the event payload.

## Event and reader

The OAuth protected `/mcp` speaks MCP `2026-07-28`; discovery declares `capabilities.events`. `events/list`, `events/subscribe`, `events/unsubscribe` use the same authenticated endpoint. Event `file.created` has argument `inbox_id: personal`; data includes only `inbox_id` and an opaque `file_id`. Signed HTTPS callback challenge and event delivery use Standard Webhooks-compatible headers. `get_image(file_id)` returns original bytes, including embedded metadata, to authorized ChatGPT.

Do not relax Origin or bearer checks for a Shortcut. Native clients can explicitly set Origin; Origin itself is not authentication. This API has no public image URL and no public upload grant issuance.
