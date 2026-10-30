# Subscription renewal and recovery

## Verified local behavior

`subscription-recovery.test.mjs` runs actual MCP SDK HTTP handlers against Web Request/Response objects and the real in-memory SQLite store. It injects callback verification and dispatch; no network listener, live callback, phone, user image or real credential is involved.

Seven cases pass:

1. Refreshing an existing subscription before expiry verifies the callback again, returns the same deterministic subscription ID, advances `refreshBefore`, and keeps existing delivered queue rows deduplicated.
2. At expiry, sweep removes the subscription and its queue rows. A new platform `events/subscribe` for the same callback/filter recreates the same subscription ID and queues still-retained images, including images uploaded during the gap. Image/event IDs stay stable.
3. Calling the delivery worker does not renew expired callback authority. Pending images wait for an actual platform subscription.
4. Failed callback verification neither extends an existing expiry nor creates a replacement subscription.
5. At the read/subscribe grant expiry boundary, renewal fails before callback verification, pending delivery stops, and image reads fail.
6. If the grant expires during callback verification, recording the subscription fails closed.
7. Requested subscription TTL above one hour is capped at one hour.

Receipt: `node --test subscription-recovery.test.mjs`, exit **0**, **7 passed / 0 failed / 0 skipped**, 2026-10-29 UTC. The source test is in the release root; it was copied to the existing clean dependency checkout for execution without installing or changing shared source. Node emitted its built-in experimental SQLite warning.

## Delivery semantics and limitation

Delivery is **at least once**. Normal pre-expiry renewal preserves the delivery ledger, but subscription expiry deletes it. Recreating the same subscription can therefore send an already accepted, still-retained image event again. Its `eventId` remains unchanged. The test receiver suppresses duplicate processing with an event-ID set; this demonstrates the required receiver behavior, not a claim that the real platform has been verified to deduplicate it.

If application-level exactly-once processing is required, the platform/consumer must retain processed event IDs through the image retention window. Alternatively, a future server delivery ledger could preserve per-event delivery state across same-identity expiry until image expiry. That improvement is not implemented or implied by these passing tests. Existing attempts/terminal states may likewise reset when the expired subscription is recreated. No sender can infer that a lost HTTP response means the receiver did not process the event.

Images expire after one hour regardless of subscription recovery. An image that expired while offline cannot be recovered by renewing a callback; the user must deliberately resend it. Grant expiry after one day is separate from the callback's maximum one-hour TTL.

## Who renews

The platform that owns the callback must refresh `events/subscribe` before `refreshBefore`, supplying its current delivery URL/secret and receiving fresh verification. The server must not silently extend its own subscription TTL, invent a callback, bypass verification, renew OAuth grants, or send events to a stale destination. The app's five-second delivery worker is not a platform subscription renewer.

## Normal recovery of the existing dot subscription

Use the existing original-dot automation; do not create another task or subscribe from a different chat.

1. Confirm the approved HTTPS origin and service are healthy. Check the app's protected-resource metadata, issuer, authorization endpoint, and connector resource all use that same exact origin. Do not edit a saved OAuth URL to substitute a host.
2. If the existing application's read/subscribe grant expired, reconnect that same private application through its normal OAuth flow and have the owner complete the local approval. No OpenAI key belongs on the phone. Then return to the original dot.
3. Refresh the original webhook automation with its **complete existing trigger set** (same connector, `file.created`, `inbox_id: personal`) using the normal automation update. Keep its original action/prompt and delivery context. An update acknowledgment alone is insufficient: verify a successful server-side callback challenge/subscription and a future `refreshBefore`.
4. If updating the original automation does not recreate the service subscription, disable and re-enable **that same automation ID** once. Do not create a duplicate automation. Again verify the callback challenge, active subscription and expiry. If approval/connection is required, complete that ordinary flow instead of fabricating subscription state.
5. Send one generated nonprivate image with a fresh share ID. Verify the original dot receives its event and fetches the original image. If an older retained event repeats, identify it by `eventId`; do not present it as another upload or another successful phone acceptance.

Do not repeat update/toggle loops blindly. A missing subscription, rejected verification, expired grant, failed dispatch and missing image are different failures. Record the specific boundary before choosing the next operation. This document describes recovery; none of these live changes was executed by the test suite.
