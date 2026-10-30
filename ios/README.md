# Native iOS source prototype

This directory contains **importable Swift source**, not an installable IPA or a completed Xcode project. It has not been type-checked against an iOS SDK, signed, installed, or tested on a phone. The available environment has Apple Command Line Tools, not a selected full Xcode/iOS SDK. Do not represent parser success as a successful iOS build. The Shortcuts starter guide in `../docs/IOS_SHORTCUT.md` is the lower-setup first trial path.

## Included implementation

- SwiftUI main app: manual HTTPS-origin and upload-only-code pairing, retry/discard of one saved image, local disconnect.
- Shared Keychain generic-password item storing origin, upload token and random credential generation together as one Codable value with an atomic Keychain update, `WhenUnlockedThisDeviceOnly`, non-synchronizable. No owner/read/OpenAI/Tunnel credentials in the device implementation.
- App Group container: protected pending-image bytes and metadata bound to its exact confirmed origin and credential generation. Short cross-process file locking prevents two enqueues overwriting one pending image. The upload uses the saved UUID on retry. Pairing changes are refused while an image is pending; sending rechecks the confirmed image identity, origin and credential generation. A changed pairing never silently rebinds a saved image.
- Share Extension: one explicit PNG/JPEG `NSItemProvider` file representation, max 8 MiB/16 MP/single frame. HEIC/HEIF, PDFs, video and multi-item shares are rejected; there is no silent conversion. The supplied file representation is preserved; a source app may itself export a representation, so verify actual bytes in device acceptance.
- A confirm button shows the exact destination before a foreground POST with raw file body, MIME, `Origin`, upload-only Bearer token, and stable `X-Share-ID`. Redirects are rejected. A server receipt is distinct from dot receiving/reading/responding.
- Network timeout leaves outcome unknown and retains the pending image. Retry is explicit from the app after a confirmation displaying the saved destination, using the same submission ID. An expired pairing requires discarding the old saved image, pairing again, then sharing and confirming it again. There are no automatic background retries or background URLSession guarantees. Closing cancels preparation before enqueue where possible; an image already enqueued is retained and the Close button says so. Cancelling an in-flight upload cannot recall a request that already arrived.

## Build setup in Xcode (user operation)

1. Install/select full Xcode through Apple's normal workflow, then create a new iOS SwiftUI App project with your own organization/bundle identifiers. Use iOS 16 or later, Swift 5 language mode. This package does not create an Apple account or pay for membership.
2. Replace the generated App entry with `App/SendToDotApp.swift`. Add `Shared/Inbox.swift` to the app target.
3. Add an iOS **Share Extension** target, remove its generated controller/storyboard references, and add `ShareExtension/ShareViewController.swift` plus `Shared/Inbox.swift` to that target. Embed this extension in the main app. Ensure the Swift files' target memberships are correct.
4. Merge the provided Info.plist keys into each target's generated/explicit Info.plist. The extension must use `NSExtensionPrincipalClass` and must not retain `NSExtensionMainStoryboard` from a generated template.
5. Choose the same signing team for both targets. Configure App Groups and Keychain Sharing using identifiers actually available to that team. Define `INBOX_APP_GROUP` (your actual group identifier) and `INBOX_KEYCHAIN_SUFFIX` (your shared keychain suffix) as build settings in **both** targets. Do not use placeholder values in an installed app. The shared `.entitlements` template is referenced via each target's Code Signing Entitlements setting; resolve `AppIdentifierPrefix` through normal signing.
6. Verify both profiles permit the selected capabilities. A free Personal Team may have capability/profile limitations; do not promise these entitlements or durable installation without checking the actual account and Xcode. Do not weaken the storage scheme to avoid signing requirements.
7. Build on the intended physical device. Pair only after reviewing the exact server/HTTPS provider, retention and upload-only credential scope. Never include real values in source, a distributable shortcut, screenshots or build logs.

The provided plist files are fragments intended for a newly generated project. Xcode supplies normal bundle identity/build keys. No developer identity, provisioning profile, account identifier, signing key, real endpoint or credential is included.

## Acceptance still required

Use generated PNG/JPEG samples first. Verify real Photos and Files sharing, one-file rejection, supplied representation and byte equality, cancellation, expired pairing, over-limit image, dropped connection, duplicate/retry with the same ID, app/extension concurrency, device lock, and original-dot event → read → response. Confirm the pending image is protected on disk and only the two intended targets can retrieve the Keychain item.

The main app's saved pending image remains until successful receipt or explicit discard; this source does not claim a guaranteed background retention timer. OS backups/App Group data and host access remain within the user's trust boundary. No third-party analytics are included. Disconnect clears only local pairing and current queue, not the server grant or already received server image. Server images follow the server's one-hour policy.

A production native version still needs a reviewed Xcode project, real SDK build tests, UX/accessibility work, safe credential renewal/revocation, backup policy, and real-device acceptance. The code does not keep the Mac awake, create a stable hostname, or solve the server's deployment dependencies.

## Verification performed

`xcrun swiftc -frontend -parse Shared/Inbox.swift App/SendToDotApp.swift ShareExtension/ShareViewController.swift` passed as a syntax-only check. `plutil -lint` passed for both Info.plist files and the entitlements fragment. No iOS SDK compilation, signing, installation or runtime test was performed.

## Apple references

- [Extension shared containers and URL sessions](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html)
- [NSItemProvider](https://developer.apple.com/documentation/foundation/nsitemprovider)
- [Keychain Services](https://developer.apple.com/documentation/security/keychain-services)
- [App Groups entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.application-groups)
