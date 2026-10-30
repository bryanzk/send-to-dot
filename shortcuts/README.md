# iPhone Share Sheet templates

Use [v4 setup](../docs/IOS_V4_SETUP.md) for once-only address and upload-code configuration. Every public template has **blank credential fields**. V4 stores the configured value as visible Text in the user's private Shortcut; it can iCloud-sync or leak with export/sharing. Obtain specific consent before entering a real code. This is not Keychain.

| Version | Image/question | Upload code |
|---|---|---|
| v2 | Image only; corrected input fields | Enter at each run |
| v3 | Image plus optional manually typed question | Enter at each run |
| v4 | Same image/question protocol | Configure once, reuse saved private Text |

V0/v1 had incorrect action keys and must not be used. V2/v3 remain compatible; upgrading the template does not change or extend any server grant. A new server grant defaults to30days, but an existing saved code retains its actual recorded expiry.

- `Send-to-dot-v4.shortcut`: Apple-signed blank distribution template.
- `Send-to-dot-v4.unsigned.shortcut`: generated binary plist, for review/signing.
- `Send-to-dot-v4.actions.json`: reviewable action graph.
- `build_shortcut_v4.py`: dependency-free generator.
- `v4_setup_test.py`:16 static/schema/dataflow checks, not an iPhone acceptance test.

Build/sign only a blank template:

```sh
python3 shortcuts/build_shortcut_v4.py
shortcuts sign --mode anyone --input shortcuts/Send-to-dot-v4.unsigned.shortcut --output shortcuts/Send-to-dot-v4.shortcut
```

Do not sign, export, share or commit a private copy containing a real code. Never use owner/read/OpenAI/Tunnel credentials as an upload code. If a code expires or is revoked/rotated, obtain the specifically authorized replacement and edit the private Text field. A changed origin requires reviewing both destination and its code.

V4 signature and static tests passed. A separate Mac no-network saved-Text probe ran twice and returned the same expected fixture digest without input prompts. It is not the full Shortcut/iPhone/network flow. Existing real v2/v3 image-question trial evidence is not v4 acceptance; see [validation](VALIDATION.md).
