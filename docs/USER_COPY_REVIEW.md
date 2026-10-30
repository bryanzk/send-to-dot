# End-user wording review — local candidate only

Audience: people who use a phone but do not work in IT. This local change has not been deployed or published. It does not resolve the separately investigated Android image rejection.

## Wording changes

| Before | Local candidate |
| --- | --- |
| 手机配对码 | 手机连接码；输入设置时得到的码，不要输入账号密码 |
| 此手机只有上传和状态查询权限 | 这台手机只能发图和查看发送结果，不能读取这里以前收到的图片 |
| 问题最多500个字符，且UTF-8不超过2048字节 | 这段话太长了，请缩短后再发送，最多500个字，表情也计入 |
| 图片或文字格式不符合要求 | 这张图或这段文字没有被接收。请保留原图，并联系帮你设置的人 |
| 未能确认发送结果 | 还不能确定图片是否已收到。请先到原dot对话查看；这里不会再次发送 |
| 已发送，请回到原dot查看 | 图片已提交。请回到原dot对话查看图片和回复 |
| 清除此张暂存 | 清除这里选中的图片和文字（不会删除相册原图） |
| 断开此手机并清除暂存 | 断开连接并清除这里的图片和文字 |
| 读取和事件访问授权30天 | 允许ChatGPT在30天内查看图片，并在收到新图片时获知消息 |
| iPhone: exact HTTPS origin / upload-only code / HTTP401 / receipt / callback | Picture-receiving address / phone connection code / connection has expired / photo was received / check original dot conversation |

## State and privacy guarantees retained

- A known rejection says it was not sent this time. An unknown network result never says success or guarantees non-delivery.
- A valid receiving-address receipt confirms receipt there; it does not claim the original conversation has rendered the attachment or answer.
- No automatic resend added. An invalid image is not promised to work merely by selecting it again.
- Connection code lifetime, sending-only permission, visible shortcut storage, iCloud copying, sharing/export leakage and separate conversation retention remain explained in ordinary language.
- Clear actions name the loss of phone copies. They do not claim to revoke a shared code, delete previously received pictures or recall conversation attachments.
- System exception descriptions no longer leak developer terminology/private paths into native prototype views.

## Scope and compatibility

Web form, share-target rejection, connection/help labels, all sending/loading/error/result strings, owner authorization page and native iOS prototype messages were reviewed. Protocol identifiers, diagnostic categories, developer-facing tools and docs retain their technical names.

A separate **unsigned v5** shortcut candidate contains simpler visible setup questions, menus, warnings and result messages. Existing signed v2/v3/v4 artifacts and installed user shortcuts are unchanged. Do not hand the unsigned candidate to a user as an installable signed release. Apple built-in action names and OS permission/error dialogs are controlled by Apple; this project cannot rewrite those system dialogs. The current signed legacy versions still have their original wording until an explicitly approved release replaces them.

## Local checks

- 31 targeted Node checks pass: send state/blank question/Unicode question/duplicate clicks/disconnect/draft races/HTTP failures/unknown receipt/share target/diagnostic privacy/end-user wording.
- 6 v5 candidate checks pass: blank setup, one-time code reuse structure, backward reference graph, known Apple action schemas, unchanged raw image/request contract, privacy and plain visible prompts.
- Swift syntax parse passes for the three native source files; this is not a signed build or device test.
- v5 is not signed/imported or tested on iPhone. Android updated wording has not been accepted on a real phone. No production service restart, credential change or GitHub push was performed for this copy change.

## Follow-up evidence wording review

A successful upload says submitted, never delivered to dot. The web remote-receipt reopen state, v5 result and native prototype result use the same boundary. No UI in these upload clients has a native dot delivery receipt. Unknown outcomes remain unknown. Clear/disconnect code deletes only IndexedDB/app-owned copies; it has no Photos deletion permission or filesystem handle to the source. Buttons and completion messages explicitly say the Photos original is kept. Already submitted images and conversation attachments are separate.
