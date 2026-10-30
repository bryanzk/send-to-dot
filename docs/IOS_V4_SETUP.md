# iPhone v4: configure once, reuse the upload code

[简体中文](#中文说明)

The public [Send-to-dot-v4.shortcut](../shortcuts/Send-to-dot-v4.shortcut) contains **blank** address and credential fields. Add it in Shortcuts, then configure your own HTTPS root and upload-only code through the two setup questions. Sending reuses these saved fields; only the optional question is asked at runtime. V2/v3 remain available if you prefer not to store a code.

## Consent before saving a real code

The saved code is **visible plain Text inside your private Shortcut**, not Keychain. It may sync through your Apple iCloud Shortcuts setting and travels with exports/shares of that configured copy. Anyone with access to the editor or shared copy can obtain it. Do not share, publish or submit a configured copy for signing. Distribute only the blank official template.

Use only an upload-only code for this exact inbox, never owner/read/OpenAI/Tunnel credentials. New server grants default to30days; old grants keep their deadline. Saving a value does not grant or renew access. Obtain explicit confirmation of scope,30day duration, storage and sync/export risk before issuing/extending a real code or entering it on an actual device. This code release does not perform those actions.

## Install and use

1. Open the signed v4 file and configure the shortcut.
2. Set your root such as `https://inbox.example.com` (replace it; no path or trailing slash).
3. Review the storage warning. If you accept it, personally enter your own upload-only code once; otherwise leave blank and do not send.
4. In Photos/Files, share one PNG/JPEG to Send-to-dot-v4.
5. Choose image-only or manually enter a question; confirm the destination. No upload-code input action runs during sending.
6. A receipt confirms the inbox accepted the image, not dot delivery. Check the original dot for the answer and original assistant attachment.

Never put the real code in chat, screenshots, public source, a shared Shortcut or logs. Image/caption limits, provenance and idempotent IDs are unchanged. Imported third-party text is not a request. A supplied original may contain metadata.

## Expiry, revocation and reconfiguration

- HTTP401 can mean expired/revoked authorization. Shortcuts may stop with its own error before custom receipt handling. Do not assume success or repeatedly resend.
- Check server grant status through the owner-local maintenance command. An owner may explicitly renew the same existing code for up to30days; your saved value then remains usable without retyping.
- A revoked, rotated or swept code must be replaced after authorization. Edit the `Saved upload-only code` Text action in your private copy, or reimport a blank v4. A changed address requires reviewing both the root and the code for that inbox. Do not send an old inbox code to another address.
- `phone_access.py revoke` revokes the current shared upload code; all devices using it stop. `rotate --days 30` creates a replacement and invalidates the old code. These are explicit owner actions, not automatic client repair.
- Deleting/disconnecting the local shortcut does not revoke the server grant or delete saved conversation attachments. Revocation cannot recall already delivered images.

## Verification boundary

Static/schema/dataflow tests confirm two empty import questions, no runtime credential Ask, raw file bytes, optional manual caption and stable submission ID. Apple signing of the blank template succeeded. Real import question rendering, configured persistence and the full iPhone upload have not yet been accepted for v4. A Mac GUI no-network probe ran twice using a deliberately inactive fixture Text value and produced the same expectedSHA256 both times without input prompts. It tests stored Text reuse only, not import questions/fullShareSheet/HTTP/iPhone behavior. Earlier CLI attempts failed name lookup during duplicate-name import or timed out; they are not passing checks. No actual user code has been saved by this change.

## 中文说明

v4首次添加时配置自己的地址和仅上传码，以后发送复用。公开模板两个字段都为空。

**码保存在私人快捷指令的可见明文中。** 它不是Keychain，可能iCloud同步，也会随导出/分享泄露。真实保存前必须确认这个范围；不得分享已填写的副本。若不接受，可以继续使用v3，每次手动输入码。

新服务器签发的上传、读取/订阅授权默认30天。旧连接不会随代码升级自动延长。过期、撤销、换码或换地址后，必须核对并重新配置；仅保存码不会续期。正式凭据的创建、延长及真机保存都要另行确认。
