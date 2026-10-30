# iOS v0 上传未到达：独立诊断

## 当前能确定的事

用户报告 iPhone 发了两张图片；服务方当时健康检查可用、上传授权有效、订阅有效，但未出现图片或事件队列记录。这说明目前没有服务端成功接收的证据，不能称 iPhone 已跑通。健康 200 与授权有效不能证明快捷指令已发出 POST。

v0 与新版必须区分。v0 的已签名文件 SHA256 曾为 `6499198e9b78fdb6d4f61b3794aa31ec4a86e82b5374175fc48326c13c99e100`，动作图当时 47 项；本地此路径随后被 v1 重签覆盖，**没有保留可再次逐字节解析的 v0 归档**。v0 导入预览、动作源与签名成功的记录仍有，但当前 `Send-to-dot.actions.json` 是 v1。已知变更仅为 origin 从每次 Ask 改成空 Text + 一个导入问题；以下单图守卫、类型、MIME、请求体及回执分支未变。当前静态检查只能验证共享分支，不能替代对用户已安装 v0 的运行诊断。

## HTTP 前停止的路径

| 条件 | v0 源码设计的可见行为 | 会调用上传吗 |
|---|---|---|
| 一次分享两项或更多 | 显示 `Share exactly one PNG/JPEG. Multiple items were not sent.`，随后 Stop | 不会；整批拒绝，不会自动循环或只发第一张 |
| 没有输入 | 显示从 Photos／Files 分享一张 PNG/JPEG 的提示，Stop | 不会 |
| HEIC／HEIF／PDF／视频／空扩展名 | 显示仅 PNG/JPEG 支持、不自动转换的提示，Stop | 不会 |
| origin 不符合精确 HTTPS origin 格式 | 显示地址无效，Stop | 不会 |
| 用户取消确认、预览或输入 | 系统取消／中断后停止 | 不应继续；真实取消行为未测 |
| 仅上传码格式不是 24–512 个字母数字、下划线或连字符 | 显示码格式无效，Stop | 不会 |
| 系统动作本身解析／权限／类型错误 | 可能显示 Shortcuts 原生错误 | 未知；不能仅依源码判断 |

因此，“发了两张”若是**同一次分享选两张**，源码设计就是整批不上传，与零图片／零队列相符。但不能在没有用户最后屏幕提示和实际选择方式的情况下把它认定为此次根因。若是**分别分享两次**，多图保护不能解释，需要定位每次停在哪个动作。不要要求用户为了诊断盲目重发。

## JPEG、MIME 与原文件请求

- 扩展名正则为 `(?i)^(png|jpe?g)$`。`jpg/jpeg/JPG/JPEG` 选择 `image/jpeg`，`png/PNG` 选择 `image/png`。这是扩展名分类，不能证明真实字节类型；最终需服务端解码验证。
- 源图来自 Share Sheet Input 的 First Item；先有整个输入数量检查。
- HTTP 动作为 Get Contents of URL（`is.workflow.actions.downloadurl`），`WFHTTPMethod=POST`、`WFHTTPBodyType=File`、`WFRequestVariable` 直接引用源文件动作的 ActionOutput。没有 JSON、multipart、base64、缩放、转换或读取剪贴板动作。
- 头部四项为 Authorization、Origin、Content-Type、X-Share-ID；目标为 origin + `/api/upload`。代码设计发送 iOS／来源应用所**提供的表示**，不能仅靠动作图证明手机实际发送的字节与原始照片编码一致。Photos 可能提供导出的表示，缺扩展名也可能导致前置拒绝。
- 原图 SHA256 构成稳定提交 ID，同一字节不换 ID 重试。未实际观察 iPhone hash 输出和请求头，不宣称已验证运行时序列化。

成功分支必须先从响应取得 `file_id`，然后显示 Server received 提示。响应缺该字段则显示 No confirmed server receipt。HTTP 系统动作自身若直接抛错，后面的自定义提示可能完全不执行；模板没有伪装成能捕获所有网络或状态错误。

## 本轮实际验证及限制

`python3 shortcuts/v0_diagnosis_test.py`：5/5 通过。检查共享守卫在 First Item／HTTP 前、整个多图输入拒绝、HEIC／空扩展名拒绝、单 JPEG/PNG 的 fixture MIME、POST File 对源 ActionOutput 的引用。

这是 **Python fixture 模型 + 当前共享动作图断言**，不是 Apple Shortcuts 执行器，不是 exact-v0 归档回放，也不是 iPhone 线上上传证据。没有读取用户图片、凭据、私人快捷指令；没有操作 UI 或发送测试 POST。不能据此承诺修复已完成。

下一条有判别力的证据是用户已有运行的最后提示／错误及两张是否同一分享批次；同时服务方仅记录无秘密请求阶段与失败类别，可区分请求根本未到、认证／格式拒绝、以及成功落库。不要记录请求头里的码或图片内容。若仍需改模板，先补可见阶段反馈，再在非隐私 fixture 上完成真实 iPhone 验收，不要让用户反复猜测重试。

格式参考：[项目作者维护的 HTTP File 动作参数](https://docs.scpl.dev/actions/getcontentsofurl)、[Apple 的快捷指令输入类型](https://support.apple.com/guide/shortcuts/input-types-apd7644168e1/ios)。格式资料支持设计参数，不证明用户手机运行结果。

## 后续已定位的参数错误（取代前面的根因假设）

实际录屏核查，确认只选一张图片后马上出现 No image 提示，而非多图。因此不能再将多选作为这次根因。独立动作 schema 随后确认生成器把 Count 输入写成 `WFInput`，正确键为 `Input`；另有 Match Text 的 `text`、Quick Look 的 `previewdocument` 以及文本字段序列化错误。v2 独立文件已修复，不覆盖历史候选。Mac 实际无网络字节探针已验证 Count=1、png 匹配及原字节 hash 一致；iPhone 分享绑定及真实 HTTP 仍待验收。详见 shortcuts/VALIDATION.md 的 v2 记录。先前 fixture 对源码意图的模拟没有覆盖 Apple 参数解释，这是原验证缺口。

Historical fixture-model diagnostic tests and broken distributable artifacts were moved out of this release. They are not regression proof; use the v2 independent schema checks and runtime evidence above.
