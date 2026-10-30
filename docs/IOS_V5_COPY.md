# iPhone v5 wording update

The signed blank Chinese file is `shortcuts/Send-to-dot-v5-zh-CN.shortcut`. It appears as **Send to dot v5 中文** after adding. The English v5 source candidate remains unsigned. Existing signed v4 and installed shortcuts are unchanged.

## What to do

1. Open the new file on iPhone and choose Add Shortcut. If it does not open in Shortcuts, save it in Files and open it there.
2. Enter the same picture-receiving address used by v4. Stop after the website name; do not add `/mcp`, `/api/upload`, or a slash at the end.
3. Enter the existing phone connection code yourself. The new copy cannot automatically inherit v4’s private settings. No replacement code is needed merely for this wording update.
4. Keep v4 for now. In Photos/Files, select one JPG or PNG and share to **Send to dot v5 中文**. Choose image only or add your own question, then confirm sending.
5. “图片已提交” means submitted to the receiving address. Return to the original dot conversation and wait for the attachment and reply. It does not prove conversation delivery.

The code remains visible when editing your configured shortcut, may copy through iCloud and is included if you share/export that configured copy. Keep it private. Its actual expiry is unchanged by importing or saving v5. Do not put codes in chat or send configured copies for signing.

## Validation boundary

- Apple’s official signer succeeded for the blank Chinese template. Public address and code fields are empty.
- 6 English candidate and 6 Chinese candidate checks pass, covering schema/reference graph/text-attachment ranges, raw request contract, one-time setup structure, two no-network mock renderings with an inactive fixture, privacy and submission-only wording.
- 31 related Node checks pass. Native Swift prototype syntax was checked separately.
- Current Mac CLI attempts on the existing no-network fixture probe failed generically under sandbox or timed out after15s with host access; these are not passing Apple-runtime tests. Earlier v4 Mac GUI reuse evidence does not establish v5 execution.
- A real iPhone recording later showed the v5 share target, a manual question and a successful upload into the original dot flow. This validates that one send, not repeated no-prompt reuse, every iOS version or 30-day continuity. The 30-second original-visible acceptance failed.
- Importing a new blank template requires entering your own existing address and code; it cannot inherit a configured v4 instance. Keep any configured copy private. No new code is needed merely to update wording.
