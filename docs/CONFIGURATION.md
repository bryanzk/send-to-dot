# 首次配置与后续使用：实际实现核查

核查日期：2026-10-30 UTC。结论：当前试用不是“首次配置后永远无需配置”。在同一域名、同一设备、浏览器存储保留且两端授权有效时，Android 通常不需每次重新填写。长期免维护尚未实现或证明。本次仅简化 Android 页面，没有扩大或延长授权。

## 自托管部署者（每位使用者使用自己的资源）

1. 准备持续在线的主机、现有受支持 Node/Python/Pillow 运行环境、固定 HTTPS 域名和入口。当前原型在 Mac 上监听 loopback，由临时 HTTPS 隧道转发；Mac 停机、休眠、断网或隧道失效即不能接收。正式发布应推荐稳定 HTTPS；不能把作者的 Mac、个人临时域名、额度或密钥当依赖。当前核心不调用模型 API，不凭空要求模型 API key；ChatGPT 资格、主机/域名/HTTPS费用另计。
2. 运行本地 setup，确认 origin、允许的官方 OAuth redirect、收件箱数据库及独立存储/owner审批/upload-only凭据。配置文件在部署目录；敏感文件是 owner-only，本地服务读取，不发送到手机。仅有手机上传码可用于手机，不发 owner/read/OpenAI/Tunnel 密钥。配置及持久数据需安全备份，不能提交 GitHub。
3. 本人账号创建并连接自己的私有 MCP 应用，URL 为自己的 origin + /mcp，通过本人 owner OAuth 审批 read subscribe。适用对象是已经能使用 dot 的 ChatGPT 订阅用户；仍需本人环境允许自建 MCP、Events及原生附件工具。不兼容没有 dot 的账号不是产品阻塞，也不表示所有付费套餐自动有 dot。授权由 ChatGPT 保存服务 access token，服务器数据库只存 token hash/owner/scope/expiry；owner审批秘密本地保存。新签发 OAuth exchange 返回30天 access token，已有令牌不重写期限，没有 refresh_token/grant，故到期需要正常重新连接授权，不是永续登录。
4. 在目标已有 dot 绑定唯一 personal/file.created 订阅与附件流程。服务每次订阅最多1小时，返回 refreshBefore；当前平台已实际多次正常续期，但只有 read subscribe grant 有效时才能继续。服务本身不会替平台续订，也不保证平台永远自动恢复。不要另建重复订阅。恢复时应检查真实订阅和目标对话，不以网页200代替。
5. 设备配对：安全交付仅上传码；服务端保存 hash 和到期，明文仅在owner-only维护文件。当前所有已配对手机使用同一部署的上传码，不是每设备独立授权；撤销/轮换会影响它们。运行维护命令前应确认权限及影响，不默默延长授权。

## Android 手机使用者

首次在自己的服务地址用 Chrome 安装 Send to dot；安全粘贴手机专用 upload-only code 并连接。地址由当前网页 origin 决定，不另填一份。码存该 origin 的 IndexedDB settings/upload-token；暂存图片/手工文字在 shares，按1小时规则下次打开清理。凭据不是系统Keychain，拥有同origin脚本访问能力或设备/浏览器访问的人仍在信任边界内。

后续：从相册分享单张 PNG/JPEG，或网页选图 → 可选文字 → 发送。成功回执后清空当前草稿、显示简短确认；它表示服务器收件，不代表对话已显示。网络/回执未知时不自动重传、不显示重试入口；先检查原dot。刷新/重开只恢复未发送草稿或未确认状态，不发请求补传。分享来源的标题/网址/文字不会自动成为问题。

- 同域名刷新/关闭重开：IndexedDB通常保留码；浏览器/系统存储清除、无痕结束或被系统回收不能保证保留。
- 到期前 owner显式 renew 同一码：手机无需重填；当前维护实现每次最多30天，没有自动续期。过期后清理线程会删 token row；一旦已删除，renew拒绝，需要重新签发并重新配对，不能假装原码仍有效。
- rotate/revoke：旧码停止使用；轮换需安全把新码交给手机并重新连接。页面断开仅清本机码和暂存，不撤销服务器授权；服务器维护命令负责撤销。
- 换设备/清网站数据：重新安装或打开并配对。换域名：存储按origin隔离，手机需重新配对，PWA安装/分享目标可能需重装；OAuth issuer/resource也绑定旧origin，不能仅手改跳转URL。
- 相同域名服务重启：DB和秘密文件保留则授权仍只在原有效期内；重启不续期，不应换配对码。临时隧道重启可能换域名，且DB原本绑定origin，需明确迁移，不能承诺无感。

## iPhone 使用者

v5中文公开模板（v4仍兼容）的地址和码都为空。用户首次配置自己的HTTPS root和upload-only码，保存到私人快捷指令Text动作；每次发送复用，不再询问码。这个存储是可见明文，可能iCloud同步或随导出/分享泄露；不是Keychain，必须在真实配置前说明并取得确认，不得分享配置后的副本。v2/v3仍兼容，但继续运行时输入码。换域名、码轮换或授权删除后，必须重新核对地址及上传码。更新模板不会迁移旧码或延长服务器期限。

## 有效期与保留

新签发的upload与read subscribe授权默认30天，旧授权保留原期限；应由部署者只读核查本人的实际到期值。订阅每次最多1小时，并需调用方正常续期。图片/文字在源收件箱保留1小时，Space原图及对话附件独立保留，附件ledger去重不因页面更新删除。当前部署快照不随公共源码分发。

## 要达到接近“只配置一次”，还缺什么

固定域名和持续运行主机；设备独立凭据与撤销；符合协议的OAuth refresh/过期恢复；真实订阅续期/离线恢复健康提示。v4的私人快捷指令保存码不是Keychain；更强的设备安全存储仍需原生方案。实现这些应单独设计、测试和披露权限，不通过无限延长现有授权来冒充完成。GitHub发布前先明确支持范围、维护动作和成本，当前不发布仓库。

## 目标范围与发布验收

仅面向已经能使用 dot 的 ChatGPT 订阅用户，不要求支持没有 dot 的账号。现有单用户证据不能替代另一位符合条件用户的独立部署验收：须使用其自有服务、稳定HTTPS、身份与授权，完成首次配置、手机分享图和可选问题、原对话回应及原图附件，并验证正常再次分享。不得依赖作者额度、主机、密钥或私人任务。这个独立闭环尚未验证；当前30天新授权与手动续期边界不因范围收窄而消失。本次仅同步范围，不新增或改变任何授权。

## 各类期限与撤销

- 新上传凭据、OAuth读取/事件访问：服务端控制，30天；旧记录不自动修改。OpenAI客户端是否保持整个30天仍需真实连接验收，不能从expires_in推断实测完成。
- OAuth审批码：仍为两分钟、单次使用。
- 事件租约：仍为本服务最长一小时，遵守客户端更短的ttlMs，并受访问授权剩余期限制；不是已确认的平台固定一小时上限。平台按refreshBefore刷新。
- 图片和问题：仍保留一小时，Space附件另行删除。
- 手机码：`python3 scripts/phone_access.py revoke` 撤销当前共用upload码；`rotate --days 30`会新建30天码并使旧码失效，实际执行前必须确认；所有使用该码的设备均受影响。`renew --days 30`只延长仍存在的同一码，保存位置不变。
- ChatGPT访问：`python3 scripts/read_access.py status`只看非秘密期限；`revoke --approve-revoke`撤销本owner的读取/订阅与待交换审批码，保留上传及图片。断开应用不等于服务器已执行撤销；用此本机命令核实。重新连接签发新30天授权必须经本人确认。

## Background image decoder

Setup records an absolute `pythonExecutable` with pinned Pillow12.0.0. Startup now checks that exact runtime before reading credentials or opening the service. Do not rely on a login shell PATH: an older managed trial used Pillow9.3 and rejected a valid Android Ultra HDR JPEG as a multi-image MPO. Update the selected runtime and run preflight; do not disable image validation or convert the user original to hide the mismatch. No existing access lifetime is changed by this correction.
