# iOS v3：单张图片 + 自己写的问题

v3 是独立候选 `shortcuts/Send-to-dot-v3.shortcut`，不覆盖现有 v2 或已安装的私人副本。此功能需要接收服务支持 caption 协议；不能把新快捷指令用于未升级的服务后宣称问题已送达。

## 使用流程

1. 第一次添加 v3 时，配置自己的稳定 HTTPS origin；不填写任何密钥。
2. 相册／文件中选择一张 PNG/JPEG → 分享 → Send-to-dot-v3。
3. 选择 **Image only**，直接发送图片；或选择 **Add my question**，手动写下自己的问题。取消表示不发送。
4. 核对确认框中的目的地、问题和图片元数据范围，点确认或取消。v3 移除单独的 Quick Look 预览步骤，避免不明确的关闭／返回操作成为阻塞。
5. 在设备上输入短期、仅上传码。模板没有长期凭据存储，也没有新增认证权限。不要输入 owner、读取、OpenAI 或 Tunnel 密钥。
6. 收到服务接收提示后，回到原 dot 检查**原图附件及根据所写问题作出的回应**。服务 receipt 不是对话最终完成证据。

只有显式手动输入的问题可成为 caption。分享表单附带文字、OCR、EXIF、网页内容都不会自动变成问题。图片本身依然按来源应用所提供的 PNG/JPEG 原始字节发送，可能包含元数据。问题属于你主动提交给自己收件箱的数据；不要在其中粘贴凭据。

## 协议与限制

- `POST /api/upload` 的 body 仍为 **File**，不改成 JSON、base64 图片或 multipart。
- `X-Inbox-Caption` 是手动问题的标准 **UTF-8 Base64**，显式设置不折行；不是加密。`X-Inbox-Caption-Source` 有问题为 `manual-entry`，无问题为 `none`（caption 为空）。这不会增加读图权限。
- 两个菜单分支均产生明确的 `{caption, source}` record，再读取问题及来源，先按 ECMAScript trim 字符集合去掉首尾空白（含 FEFF），冻结归一化的问题；空问题不调用 Base64 编码，来源降为 none。有问题时来源只能来自所选 record，不能凭非空文本推断授权。这样避免空菜单结果回退到先前图片／MIME 输出。
- 问题上限：服务端严格检查 **500 个 Unicode 码点、2048 UTF-8 字节**。客户端 Count Characters 仅作提前提示；Apple 的字符计数可能按用户感知字符处理，不能等同于服务端码点或字节计数。超限会拒绝整次请求，不静默截断或转写。
- 无问题的提交 ID 保持 `ios_<imageSHA256>`。有问题为 `iosq_<SHA256(UTF8(imageSHA256 + "\n" + Base64(question)))>`，长度小于 100。空白／纯空格的问题也走 image-only ID。一次运行只询问一次问题，并复用该归一化冻结值作为确认、header、提交 ID 的来源。
- 同图同问题重试复用 ID；改问题会形成新 ID。不确定是否送达时，不要更改问题或换图片表示盲目重发。完全相同内容在收件箱保留期内的主动重发也可能去重。
- 服务端用于验证内容绑定的 receipt 摘要可以采用另一个版本化公式；它和上述客户端幂等 ID 目的不同。不能把两个摘要混为一谈。
- 图片上限与保留规则继承服务配置；默认 8 MiB、1600 万像素、PNG/JPEG、收件箱 1 小时。已转成 Space 原生附件及聊天内容的数据不会随收件箱 TTL 自动删除。
- 依然需要自己的账号、主机、HTTPS 和有效事件订阅；不使用作者的额度、密钥或机器。iOS 分享后台完成没有保证。

## 真实验证与尚未验证

静态／schema／合同检查：`python3 shortcuts/v3_caption_test.py`，11 项通过。独立动作 schema 确认 Base64 默认会每 76 字符折行，因此 v3 显式设为 `None`。同样检查了 Count.Input、Match.text 的文本序列化、raw File body、6 个请求头、手动来源、结构化菜单结果、确认框和稳定 ID 的数据流。

在现有 Mac **仅复用本任务自己的无 HTTP 字节探针**，使用固定自编中文、emoji 和换行问题（重复三次，编码后超过 200 字符）实际执行 Text → Base64(None) → imageSHA + newline + Base64 → SHA256。输出 Base64 的 Lines=1，得到：

```
iosq_5c1201eb14ddc1e6d727a0a507afa590910dbf372fe142cc052c2d308010c8c1
```

它与独立 Python 的 UTF-8／标准 Base64／SHA256 计算完全一致。没有读用户图片或问题，没有进入真实接收服务，也没有输入凭据。该探针只证明编码／哈希链，**不证明**完整菜单、空问题分支、iPhone Share Sheet 绑定、确认／取消、手动输入 UI、实际 HTTP headers 或原 dot 回应已通过。它使用旧的任务测试名称，不是给用户安装的 v3。

发布前最少验收：生成样本分别走 image-only 和手动中文问题；核对服务收到的原始图片摘要、原问题和 `manual-entry`，同图同问题重试去重、改问题不覆盖；测试取消、超限、过期码；最后确认原 dot 显示原图并按问题回应。全部完成前不得称 iOS v3 已可日用。

动作格式来源：[shortcutkit 内建动作参数](https://raw.githubusercontent.com/frontboat/shortcutkit/main/data/builtin-actions.json)。本包 schema fixture 只保留技术标识／参数类型与来源摘要，不复制描述性文案。

## 空值实测发现（现已修复）

后续实际 Mac 字典探针发现：Apple 的 `has any value` 会把一个空字符串也判为有值。修复前 probe 虽显示空 caption、Count=0、source=none、空 Base64，却生成了错误的 iosq_ ID。因此 v3 已将编码、来源降级及 ID 分支统一改为明确的 **归一化后字符数 > 0**，并加入独立回归检查；不再使用字符串 has-value 作为有问题的判断。

同次 probe 的非空 manual-entry 字典读取、UTF-8 Base64 及 hash 已实际通过。但最终加入空白／FEFF 归一化的三案例 probe 准备运行时，Mac 被锁定，系统自动解锁失败。当时该最终 probe 尚未执行，因此没有把静态 11/11 当实际空白分支通过。未尝试绕过锁屏、扩展权限或输入秘密；当时正式 v3 候选尚未签名交付。后续已按下一节所述完成三案例真实执行、复核及签名；这里保留的是先前阻塞记录。

## 最终无网络复核：锁屏阻塞已解除

随后重新检查 Mac 可正常操作，未输入密码或更改安全设置。只替换本任务既有字节探针，实际运行最终三案例：

| 固定测试输入 | 归一化问题 | 来源 | 字符数 | Base64 | 提交 ID |
|---|---|---|---:|---|---|
| 空字符串 | 空 | none | 0 | 空 | ios_ + 原图 SHA256 |
| 空格、tab、换行、FEFF、NBSP | 空 | none | 0 | 空 | 与空字符串相同 |
| 自编中文、emoji、换行，重复三次 | 保留原文 | manual-entry | 51 | 标准 UTF-8、1 行 | 与独立计算的 iosq_5c1201…10c8c1 相同 |

前两例的完整 ID 均为 `ios_b3e930e2de5a45233349e11a44dbb881f34083857717ac001442b10f9575f580`；非空例为前文完整 iosq_ 值。真实执行证实 Dictionary 读取、精确空白 trim、Count > 0 分支、来源降级、不折行编码和空／非空幂等 ID 正确。探针运行已结束，未发送 HTTP、读取用户内容或录入上传码。任务测试副本仅按同名 Replace 操作，Shortcuts 仍可能保留自动编号的旧测试副本；未删除用户已有项目。

最终独立候选已通过 11 项静态检查与 plist lint，并用 Apple 官方 `shortcuts sign --mode anyone` 签名。该签名只包含无秘密公共模板，未向用户账号添加生产候选。**完整菜单／确认／手动问答 UI、iPhone 分享和真实上传仍需使用者验收**；不能把这次无网络 Mac 探针当完整手机通过。
