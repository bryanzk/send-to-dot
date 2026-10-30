> v0/v1 had incorrect action parameter keys and must not be used. Use the distinct v3 candidate for optional questions; v2 remains the compatible image-only revision.

# Send to dot: iOS Share Sheet template

Start with [the v3 iPhone guide](../docs/IOS_CAPTION.md). One real user completed iPhone image/question sharing, original-dot image read and native assistant attachment acceptance. This is not broader device/error-path or independent-user acceptance.

- `Send-to-dot-v3.shortcut`: Apple-signed, no-secret optional-question template; see the v3 guide.
- `Send-to-dot-v2.shortcut`: Apple-signed, no-secret distribution candidate.
- `Send-to-dot-v2.unsigned.shortcut`: generated binary plist source; do not use as the distributable.
- `Send-to-dot-v2.actions.json`: human-reviewable action graph.
- `build_shortcut.py`: dependency-free deterministic generator.
- `test_shortcut.py`: static contract checks, not runtime coverage.
- `VALIDATION.md`: observed checks and remaining acceptance work.

No user deployment domain or upload code is embedded in the public template. The nonsecret stable HTTPS origin is requested once by an import question and saved in the user’s private copy. Only the short-lived upload code is requested at runtime. The upload code input is ordinary visible text, not a password vault. Do not publish a configured private copy.

On a Mac with Python 3 and Apple's installed Shortcuts CLI:

```sh
python3 shortcuts/build_shortcut.py
python3 shortcuts/test_shortcut.py
plutil -lint shortcuts/Send-to-dot-v2.unsigned.shortcut
shortcuts sign --mode anyone --input shortcuts/Send-to-dot-v2.unsigned.shortcut --output shortcuts/Send-to-dot-v2.shortcut
```

Apple's CLI supports run/list/view/sign, not create; this generator uses the public workflow container/action serialization used by compiler projects and the system's own public gallery sample. Only sign no-sensitive-data templates: Apple's signing validation sends the workflow to Apple. Signing can need normal host access that a restricted sandbox lacks. Do not bypass system confirmation, permissions or terms.

`ios_<SHA256(file)>` is the deterministic submission ID: an uncertain retry uses the same supplied bytes. Identical intentional reshares within the inbox retention window are deduplicated. The template does not convert HEIC or resize a photo. It sends the source app's supplied representation as an HTTP File body with only upload privileges.
