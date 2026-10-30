# Security review record

Reviewed: 2026-10-29. Scope: the single-user server, Android web client, and native iOS source prototype included in this package. This is a focused source review of identified issues and their corrections, not a penetration test or a production certification.

## Final review result

The concrete credential/destination disclosure paths identified during review have been removed in the inspected source. No unresolved blocker from those findings remains for a generated-image trial. Real private-image use still requires the intended device and authorization acceptance checks below.

### Native iOS corrections inspected

- Origin, upload-only token, and credential generation are encoded into one Keychain item. Updating the item cannot assemble a new token with an independently stored old origin. The source no longer reads or writes an `origin.txt` pairing file.
- Enqueue and pairing updates use the same cross-process queue lock. Pairing changes are refused while an image is pending. A pending image records its destination and credential generation.
- Sending compares the confirmed pending-image snapshot with the current pending record and current Keychain pairing. A changed identifier, destination, or credential generation stops the operation before constructing an upload.
- The share extension displays the destination taken from its queued snapshot. The main application's retry requires a destination confirmation dialog. Neither path silently retargets a saved image after pairing changes.
- Closing the extension cancels the preparation task. Preparation checks cancellation after the asynchronous item-provider load and before enqueueing. The close action explicitly says it retains an already saved image; it does not claim to recall a request already sent. In-flight upload cancellation has an uncertain server outcome, and retries preserve the submission identifier.
- Keychain access remains shared only through the configured signing entitlement, non-synchronizable, and `WhenUnlockedThisDeviceOnly`. Original image data uses the protected App Group container. This remains an OS/signing boundary requiring device verification, not an independently encrypted queue.

### Server and Android corrections inspected

- Upload and private MCP authorization are checked before the launcher's HTTP body buffering. The binary-safe adapter bounds request size, response size, concurrent active requests, and request duration. Deadline/close/error cancellation races request reading, handler completion, and response reading. It no longer waits on response `drain`, and guards the final response write after cancellation.
- Android upload/status responses use generation and cancellation checks around asynchronous work. Discard and disconnect invalidate the active operation; late completion does not intentionally restore a deleted local image or overwrite its cancellation UI.
- Expired pairing, missing/expired remote images, and temporary status failures have distinct user-visible handling. Missing images are not presented as successfully queued forever; re-sending requires a later user action.
- OAuth registration/token failures return protocol error categories instead of an unrelated generic error string.

## Evidence and limits

The initial Android cancellation finding was reproduced with a local in-memory fixture: disconnect deleted a record and a delayed upload response wrote it back. The reviewed correction adds cancellation/generation guards, with dedicated regression coverage supplied by the implementation. HTTP deadline regression coverage includes stalled handler and response-body completion. Source review does not replace the recorded test command/output in the validation report.

No credentials, account configuration, private image, browser session, or live callback payload was inspected for this review. No external service was started, no signing action was performed, and no private data was transmitted by the reviewer.

The native iOS code has **not** been compiled against an iOS SDK, signed, installed, or exercised on a physical device as part of this review. Syntax parsing and plist validation are insufficient to establish entitlement correctness, Keychain sharing, extension lifecycle behavior, or networking behavior.

## Required acceptance before private-image use

Use generated samples first. Verify device pairing and exact HTTPS destination, the original supplied file representation and byte equality, rejected non-PNG/JPEG and multiple items, size limits, app/extension concurrency, destination changes while a share is open, cancellation before/after enqueue, expired credentials, dropped connections and retry deduplication. Verify the original conversation actually receives the event, reads the image, and responds.

A server receipt or accepted webhook alone does not establish that last step. Temporary ingress availability, host sleep, operating-system backups, grant renewal, and server revocation remain operational responsibilities. This package does not claim a stable public deployment, automatic recall of a completed upload, or a completed production security assessment.
