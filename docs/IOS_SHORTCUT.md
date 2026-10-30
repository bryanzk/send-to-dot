> 当前状态（2026-10-29）：一张 iPhone v2 PNG 已实际完成分享上传、原 dot 收件事件、原图读取、私有 Space 字节一致保存和助手原生附件发送 accepted；用户实际可见仍待确认。不是所有 iPhone/格式/错误路径通过。

> 已确认 v0/v1 参数错误会造成单图被判成无输入。不要继续用旧版本或盲重试。独立 v2 修复 Count、Match Text、Quick Look 和 URL 文本参数；当前 v2 已有一次 iPhone 单张 PNG 验收；其他设备和异常路径仍需各部署自行验证。

# iPhone：从相册分享给已有 dot

iOS 首版用 Apple「快捷指令」接收分享，不需要安装 Android 的网页应用或另一份 ChatGPT。入口是：**相册／文件 → 分享 → Send to dot v2 → 自己的私有收件箱 → 已订阅的原 dot**。

本包提供实际经 Apple 官方工具签名的候选文件：`shortcuts/Send-to-dot-v2.shortcut`。Mac 导入与实际样本字节链通过，并已有一次用户 iPhone 单张 PNG 的真实分享、上传、原 dot 事件与原图读取、私有 Space 保存及原生附件 accepted。不能据此推广为所有 iPhone、格式和异常路径都通过。

## 使用前一次准备

1. 按项目主 README 部署**你自己的**收件箱，使用稳定 HTTPS 地址，完成你自己的 ChatGPT OAuth 连接与原 dot 的事件订阅。你的账号必须实际支持本项目所需的自建应用及 Events；普通 ChatGPT 账号是否可用不能只凭付费订阅推断。
2. 在自己的服务端终端运行 `python3 show_pairing.py phone` 取得短期、可撤销、**仅上传**码，用后清除终端显示。不要使用 owner、读取、OpenAI API 或 Tunnel 密钥。地址和码不应发送给作者或写入公开模板。
3. 将签名 `.shortcut` 文件传到 iPhone，在 Apple 快捷指令打开，检查动作后选择添加；设置问题中只填写自己的稳定 HTTPS origin（非秘密地址，不带路径或末尾斜杠），以后无需每次输入地址。在分享表单启用 Send to dot。首轮先用无隐私 PNG/JPEG 测试。系统若要求允许联网，由使用者确认实际自己的域名。

## 每次发送

1. 在「相册」或「文件」选择**一张 PNG/JPEG**，点分享，再点 Send to dot。
2. 检查安装时配置的自己的 HTTPS origin。确认目的地并预览待发送图片；运行时不会再次询问地址。若地址变化，先编辑快捷指令中名为 Approved HTTPS origin 的 Text 动作。空地址或无效地址会停止上传。
3. 在设备上输入仅上传码。当前安全模板只在安装设置时询问地址，每次发送询问码；文本输入可能可见，请避开旁观者。模板不保存码、不读取剪贴板，也没有声称使用系统通用 Keychain 动作。**请勿将填入真实凭据后的私人副本分享或提交到 GitHub。**
4. 成功提示仅证明服务返回 `file_id`。回到原 dot，检查实际原图附件和基于原图的回复，才算完整成功；附件由助手发送，不会伪装成用户原生消息。

安装时配置一次地址，每次运行仍需输入短期仅上传码；不要为了少输入把高权限码或长期码写进公开文件。后续原生 Share Extension + Keychain 才是较好的持久配对路线，当前 Swift 源码不是已签名安装版。

## 已实现的请求及边界

- 接收一项 Images/Files，拒绝空输入、多项、扩展名不是 PNG/JPG/JPEG 的输入。不静默转换 HEIC、PDF、视频，不缩放或去除元数据；iOS／来源应用可能提供导出后的表示，本模板不能保证取得相机原始编码。
- 使用 `POST <origin>/api/upload`，Request Body 选择 **File**，发送提供的文件字节。带 `Authorization: Bearer <upload-only code>`、`Origin`、`Content-Type` 和 `X-Share-ID`，不是 JSON、base64 或 multipart。
- `X-Share-ID = ios_ + SHA256(所提供文件)`，同一字节重试复用同一 ID。超时表示结果未知，应重试同一文件，不能改 ID 盲发。当前服务在有效保留期内会把同一字节的主动再次分享也视为重复；不同导出表示可能有不同 hash。
- 客户端扩展名检查不能替代服务端图片字节检查。服务端上限 8 MiB／1600 万像素，PNG/JPEG；错误时不自动改图或换高权限凭据。
- 当前上传授权默认 24 小时；此版本尚无自动续期；调整授权策略需另行审查。收件箱图片与事件默认保留 1 小时；原图若已存入用户私有 Space 作为聊天附件，则持续保留，**不会随收件箱 TTL 自动删除**，需使用者另行删除。
- 服务端接收失败、网络超时或 Shortcuts 的 HTTP 动作直接报错时，本模板不保证取得可解析 JSON，也不声称捕获所有 HTTP 状态。401/403 重新配对，413/415 检查大小/格式，429 等待，5xx 有限重试同一文件；不要无限自动重试。
- iOS 可能结束前台分享操作，没有后台完成保证。自托管版本需要自己的主机在线；Mac 部署需保持开机联网。临时 Quick Tunnel 可失效，不适合日用固定配置。

## 验收表

| 检查 | 结果 |
|---|---|
| 官方 `shortcuts sign --mode anyone` | 实际成功，退出码 0 |
| Mac 签名文件导入预览 | 更新版实际成功，显示 Add Shortcut…／Share Sheet；未继续添加，设置问题的填写保存待真机 |
| 动作展开解析 | 实际看到计数、条件、停止、文件输入、URL 请求、file_id 回执处理 |
| 静态协议／无转换／无凭据持久化／包扫描 | 8 项检查通过，见 `shortcuts/VALIDATION.md` |
| iPhone 添加与实际分享 | 单次 v2 PNG 用户实测通过；相册／Files 各入口及每种权限状态未完整覆盖 |
| iPhone 原始字节 POST | 单次 PNG 通过，工具及 Space 回读与原字节一致 |
| 错误／取消／断网／重复 | 尚未完整真机覆盖 |
| iPhone → 事件 → 原 dot 原图读取与原生附件 | 单次 PNG 真实事件及读取通过，原生发送 accepted；实际显示仍待用户确认 |

最小真机验收：先分享一张没有隐私的 PNG，核对原图与回复；再测 JPEG、取消、多选、HEIC、断网后同文件重试。真实私人图片应在上述完成后再使用。

## 构建和隐私

公开模板包含示例域名，没有用户真实地址或凭据；非秘密地址通过一个导入问题写入用户副本，上传码没有导入问题或默认值。可审阅 `shortcuts/Send-to-dot-v2.actions.json` 或用 Python 重新生成。签名会把快捷指令提交给 Apple 进行验证；只签无敏感内容的模板。签名文件还带 Apple 证书链和不透明签名元数据，不能把签名当匿名性保证；本次可读元数据未发现作者姓名、Apple ID、个人路径或用户部署域名。

参考：Apple [输入类型](https://support.apple.com/guide/shortcuts/input-types-apd7644168e1/ios)、[请求 API](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/10.0/ios/27)、[签名与共享](https://support.apple.com/en-md/guide/shortcuts-mac/-apd455c82f02/mac)、[快捷指令共享隐私](https://www.apple.com/legal/privacy/data/en/shortcuts-sharing/)。公开动作格式参考编译器作者的 [HTTP File 动作说明](https://docs.scpl.dev/actions/getcontentsofurl)；这些格式说明不代替 iPhone 实测。

## 当前 v2 预览交互

看到带文件名的图片预览时，点预览卡片左上角「×」关闭预览，流程才继续到仅上传码提示；不要点顶部运行状态的停止按钮。这一“×”容易被理解成取消，已列为后续 UX 改进；现有 v2 不自动替换或重配。想取消发送应在目的地确认中取消，或停止快捷指令；只有实际 HTTP 返回有效收件回执才代表服务收到。
