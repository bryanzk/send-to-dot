# Threat model and trial limits

This is a single-user trial. It is not a hardened public multi-tenant photo service.

## Assets and trusted components

Assets include original image bytes/metadata, owner approval code, upload token, OAuth grants, callback signing secret, storage key, and the conversation context shared by ChatGPT with its connected app.

Trusted components are the user's device and browser/Shortcuts runtime, the local computer/OS administrators, the running server and installed dependencies, the approved TLS ingress provider, and authorized ChatGPT processing. The ingress can process traffic according to its design and policies. Server-side encryption does not conceal images from the running server or protect against a compromised host.

## Boundaries and controls

| Threat | Implemented control | Remaining limit |
| --- | --- | --- |
| Phone token used to read images | Separate upload and read/subscribe grants | Upload token can send unwanted images and query statuses for its owner |
| Public image URL guessing | Authenticated MCP read only; opaque file IDs | Authorized ChatGPT receives original metadata as well as pixels |
| Callback SSRF | HTTPS/443, public IPv4 resolution, private/special ranges denied, pinned lookup, no redirects, bounded deadline/response | IPv6 callbacks are unsupported; code/dependencies need ongoing review |
| Fake subscription callback | Fresh signed verification challenge and exact echo check | A compromised authorized callback is still trusted |
| Unauthorized OAuth exchange | Allowlisted exact redirects, PKCE S256, single-use two-minute code, resource check, issuer response | Owner code is a reusable local approval secret; no account recovery/UI rotation flow |
| Oversized or disguised uploads | 4 concurrent readers, 15-second total deadline, 16 MiB response cap, authentication before upload buffering, 8 MiB stream/body limit, MIME match, Pillow decode, single frame, 16 MP cap, 20-image quota | Decode runs synchronously via subprocess and can still consume bounded resources; ingress-level rate limiting is not included |
| Duplicate delivery/upload | Persistent idempotency key/digest and stable queue event ID | Crash during callback acknowledgement can redeliver; downstream must deduplicate |
| Disk disclosure | AES-256-GCM image/callback-secret blobs, restrictive local modes; token hashes | IDs, timestamps, scopes and queue metadata are plaintext; backups and host admins remain trusted |
| Browser-origin attacks | Same-origin checks for approval/upload, CSP, no public CORS | `Origin` is not an authentication mechanism; native clients can set it. Bearer authorization is essential |
| Image prompt injection | Tool labels image text as untrusted | The receiving assistant must maintain its instruction boundary |

## Client storage

Android stores its upload token and pending image in the origin's IndexedDB. There is no claimed hardware-backed or browser-independent secret vault. Shared/compromised devices and origin script compromise can expose that token. Clear device state when finished; server revocation is separate. Expired phone images are cleared when the app next opens, not by a guaranteed background timer.

Legacy v2/v3 ask for upload code at runtime. V4 public template has blank setup fields; the user may explicitly consent to save an upload-only code as visible plain Text in their private Shortcut. It may sync through iCloud or leak with export/sharing; it is not Keychain or hardware-backed storage. Saving does not extend server lifetime. Do not put real tokens in a downloadable/shared Shortcut, screenshot, log, clipboard history, or a file submitted to Apple for signing. No arbitrary Shortcuts Keychain API is assumed. Native keychain-backed provisioning is future work.

## Operational limits

There is no built-in TLS terminator, public hosting, monitoring, user-facing revoke/renew panel, refresh-token support, or device attestation. The machine and approved ingress must remain online. Temporary URL changes require a new origin-bound connection. Do not test with private photos until the user has agreed to the exact data destination and retention. Start with generated images and verify actual image-based response in the original conversation.

Do not publish this working environment. Release only the audited clean source package after credential/data scanning and license/author decisions.

## Redacted operational diagnostics

Upload-route logs contain only UTC time, a server-generated correlation ID, normalized HTTP method, status and a fixed error category. No request headers, body, image bytes, filenames, IP addresses or client-provided IDs are logged by this observer. Existing OAuth audits use fixed event/outcome values only. Local log retention/rotation and disk monitoring belong to the deployment operator; these diagnostics are not a hosted monitoring service. Private attachment receipts remain in the owner-only local ledger and must not enter a public source package.

##30-day access update

New upload and read/subscribe grants expire after30days; existing token deadlines stay unchanged. Longer access increases exposure from a stolen code. Owner upload maintenance is explicit and can revoke/rotate; read_access.py revokes ChatGPT grants, subscriptions and unexchanged codes. An in-flight read or already saved Library attachment cannot be recalled by token revocation. Source data retention remains1h and old clients remain valid until their recorded expiry. A30day expires_in response is not a30day real-client uptime test.
