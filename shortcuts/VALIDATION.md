> Historical v0/v1 signature/preview checks below did not prove runtime wiring. Confirmed field errors were later found. Use only the separately named v2 candidate and the v2 record at the end; do not recommend the legacy file.

# Validation record

Observed 2026-10-29 on the existing Mac. No user shortcut contents, credentials, clipboard, private image, or live inbox was read or used for this test.

## Passed

1. Existing Apple `shortcuts --help` exposes run/list/view/sign; there is no create subcommand. No `list` of the user's shortcuts was requested.
2. `build_shortcut.py` produced 47 actions, a binary plist and matching review JSON without external packages.
3. `plutil -lint Send-to-dot.unsigned.shortcut`: OK.
4. Official `shortcuts sign --mode anyone` completed with exit code 0 and produced the signed AEA1 container. The restricted sandbox initially returned a generic format error; the same official operation with approved host access succeeded. This is not evidence of iPhone action correctness.
5. Finder opened only the new signed template. Shortcuts displayed **Send-to-dot**, **Add Shortcut**, and **Appears in Share Sheet**. Its action preview parsed **Images and Files**, input counting, numeric/string conditions, stop branches, supplied-file selection, URL/Get Contents actions and `file_id` response handling. No Add or Run was clicked. The action-preview expansion control for HTTP details returned `elementHasNoFrame`; its complete headers/body are statically inspected, not UI-verified.
6. `python3 shortcuts/test_shortcut.py`: **8/8 passed**. Checks source parity, share-sheet inputs, a single POST File body with ActionOutput source, exact four headers, no conversion/clipboard/scripts/persistent variables or credential defaults, single-item/hash-id contract, exactly one nonsecret origin import question targeting an empty Text action, no selected personal payload markers, and AEA1 signed-container header.
7. Source action JSON and readable signature bytes were checked for private filesystem paths, names, email domains, temporary deployment hosts, plugin/tunnel IDs and known credential prefixes. No matches. The source has only the generic `inbox.example.com` example. Readable signature metadata contains Apple certificate chain information and an opaque certificate identifier, with no visible author name or Apple ID. Encrypted/opaque signature metadata is not a proof of anonymity.

## Not yet passed

- No shortcut was added to the user's private library, no share-sheet run occurred, and no network upload was performed.
- iPhone import, Photos/Files input behavior, source representation bytes/MIME, action references at runtime, network permission, hash behavior, HTTP headers/body on the wire, cancellation, expired code, 413/415/429, offline retry, and foreground termination still require acceptance.
- A native HTTP action can throw before JSON receipt handling. The template does not pretend to catch or classify every status.
- iPhone → private event → existing dot → original native attachment/reply remains unverified. Existing Android success is separate evidence.

Do not label this iOS production-ready based on signature or static tests. The first safe next action is adding the reviewed candidate on an iPhone and sharing one generated/non-private PNG to that user's own configured inbox using only a short-lived upload code.

## Nonsecret origin setup revision

The public origin Text action is now blank, configured once by a `WFWorkflowImportQuestions` parameter question (`ActionIndex`, `ParameterKey=WFTextActionText`, `Category=Parameter`, empty default). The only runtime Ask action is the upload-only code. The revised 47-action candidate was regenerated, linted, signed with official Apple CLI (exit 0), and opened in the Mac import preview; the button changed to **Add Shortcut…**, consistent with a setup flow. It was closed without clicking Add or entering any value. Actual setup-question entry, saved origin use, and runtime behavior remain iPhone acceptance items. A missing or invalid configured origin still stops before upload. Format reference: https://github.com/sebj/iOS-Shortcuts-Reference (project-owned serialization reference, not a guarantee of platform behavior).

## v2 correction and real Mac content execution

Confirmed by the public ShortcutsBench action schema: Count uses `Input`, Match Text uses `text`, Quick Look uses the `previewdocument` identifier. Four Match Text fields and HTTP URL now use `WFTextTokenString`; HTTP File body remains a `WFTextTokenAttachment` variable picker. The candidate is distinctly named **Send to dot v2**, file `Send-to-dot-v2.shortcut`. Old v0/v1 Library deliveries are not changed.

Final v2 generation, plist lint and official signing all succeeded. `test_shortcut.py`: 8/8; `v2_schema_test.py`: 8/8. The independent fixture retains technical identifiers/key sets and provenance hash, with descriptive summaries removed. The tests verify schema input key names plus text-token UTF-16 ranges/output references and the HTTP URL/File distinction. They are still static checks.

A separate no-HTTP workflow **Send-to-dot-v2-byte-probe** was actually added and run in the existing Mac Shortcuts editor. It embeds only the generated public `web/sample.png` as base64, decodes and names it `sample.png`, then runs the same Count/First Item/File Extension/Match/Hash actions with that explicit file source. The actual result was:

```
Item count=1
Original supplied file=sample
File extension=png
Allowed file extension=png
Original file hash=b3e930e2de5a45233349e11a44dbb881f34083857717ac001442b10f9575f580
```

The hash exactly matched independent `shasum -a 256 web/sample.png`. This establishes execution of that content pipeline on this Mac; the probe's base64 decode is test-only and is not present in the upload template. It does **not** establish the production ExtensionInput binding from the iPhone share sheet, guard branching with all types, actual prompt progression, or HTTP wire serialization.

`shortcuts run` attempts with generated sample input (including an absolute /tmp copy) remained waiting without result or visible dialog and were cancelled precisely; no output file or runtime success was claimed. The validation copy's Ask For Files fallback also waited without a visible picker and was stopped. No broad Documents access, Finder Automation/TCC grant, credential input or HTTP upload occurred. New local test workflows remain isolated by names; do not delete or modify the user's existing shortcuts. The template still requires iPhone acceptance and an actual authorized upload test.

### Production-prefix probe

A separate **Send-to-dot-v2-prompt-probe** embedded the same generated PNG, replaced only the two share-input references with that named decoded file, used reserved fixture origin `https://inbox.example.test`, and retained production Count/guards/type/MIME/hash/origin/alert/preview/code-Ask prefix. The HTTP action and suffix were completely absent. Actual editor execution advanced through the guards and origin matching to the highlighted **Show alert** destination action. Its native confirmation window was not exposed through available UI surfaces; neither Quick Look nor the code prompt was reached or claimed. The run was explicitly stopped, without entering any code. The separate earlier byte probe remains the actual Count=1/png/hash execution evidence. No claim is made that prompt presentation is verified.

Local validation cleanup found four exact task-created copies: `Send-to-dot-v2-validation`, `Send-to-dot-v2-validation 1`, `Send-to-dot-v2-byte-probe`, `Send-to-dot-v2-prompt-probe`. Selecting only these and requesting deletion displayed “These shortcuts will be deleted from all of your iCloud devices.” The action was cancelled because recoverability was not established. These four test copies remain; the user's existing Send-to-dot shortcut and all Library deliveries were untouched. All test executions are stopped. No Finder Automation, broad folder permission, credential or live upload was used.

### Receipt-flow audit (no new candidate)

`receipt_flow_test.py`: 4/4 graph checks passed. HTTP output is explicitly read by Get Dictionary Value `file_id`; a no-value condition then displays the exact failure text below and executes Stop before the final success action. The final success text occurs once and only after that guard.

Failure text: `No confirmed server receipt. Check pairing/type/limits/network. A timeout is unknown; retry the SAME supplied image so its hash ID is reused. Do not repeatedly resend a different representation.`

Success text: `Server received the image. Check the original dot conversation for the original attachment and reply. Callback acceptance alone is not proof of a reply.`

The current server's upload error bodies contain only `error`; `file_id` is returned only after image transaction commit or an existing valid idempotent record. Thus its ordinary error JSON should not satisfy the intended success guard. Native HTTP errors or JSON/dictionary conversion errors may throw before either custom message; they are not caught. The template itself only gates on a nonempty `file_id`: it does not independently validate HTTP 2xx, UUID syntax, event ID, response origin, or query receipt status. A nonempty `file_id` in an unexpected/error response can therefore satisfy its presence-only gate. Static graph checks cannot prove how the iPhone executed the native actions or explain an unobserved final phone message. No workflow, signature, UI, live upload or secret was changed/used during this audit.
