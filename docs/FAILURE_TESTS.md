# Failure and recovery verification

The recovery suite is entirely local. It uses disposable in-memory or temporary SQLite databases, a controlled clock and synthetic byte fixtures. It does not listen on a port, contact a callback, inspect a live database, or use a real credential. Pixel decoding is deliberately injected for queue/auth tests; the decoder and binary HTTP tests remain separate gates.

Run:

```sh
node --test recovery.test.mjs
```

Verified cases (9 tests):

- A failed delivery schedules a retry durably across database reopen; re-uploading the same idempotency ID returns the same file/event IDs. Successful delivery remains complete across another reopen.
- Six unsuccessful attempts mark delivery failed. Refreshing the same subscription does not revive the failed queue row.
- HTTP callback results 410 and 413 are terminal without retry.
- Revocation cancels pending work and denies image reads. Unsubscribe cancels pending work. At image expiry, both pending delivery and image read stop.
- Invalid idempotency keys and mismatched media types enqueue nothing. Twenty images fill the quota; expiry releases capacity.
- Wrong OAuth resource and wrong PKCE verifier cannot exchange a code. A subsequent correct verifier succeeds, then replay fails. A code fails exactly at its two-minute expiry boundary.

Execution receipt: `/opt/homebrew/bin/node --test send-to-dot-release/recovery.test.mjs`, exit code **0**, **9 passed / 0 failed / 0 skipped**. Executed 2026-10-29T03:46 UTC in the existing Node environment. Node emitted its built-in experimental SQLite warning.

These results establish local domain behavior, not internet availability, delivery to ChatGPT, Android share-sheet support, iOS Shortcut behavior or full device acceptance. Public callback TLS/DNS behavior, a real authenticated subscription, original-image readback, phone pairing, sharing on each target device and resumed Mac/network behavior require their own evidence.

## Cancellation and HTTP response deadlines

`node --test cancellation.test.mjs` adds eight pure local regression tests:

- A VM runs the final browser app with a deliberately delayed upload response, JSON decoding, or IndexedDB-like persistence. Both Discard and Disconnect abort the active request, keep the cancellation UI, and leave no resurrected original image after the delayed completion. The persistence variant exercises cleanup after a write finishes late. No status request starts after cancellation.
- A mocked HTTP request/response exercises a hanging application fetch and a hanging response-body reader. Each reaches 408, aborts the application signal, releases the concurrency slot for the next request, and makes no late response writes. The hanging reader is cancelled.

Receipt: `/opt/homebrew/bin/node --test send-to-dot-release/cancellation.test.mjs`, exit **0**, **8 passed / 0 failed / 0 skipped**, 2026-10-29 UTC. This uses VM and stream-boundary doubles, not a live network connection or a real mobile browser. It proves the regression boundaries without transmitting any data or taking a listening port.
