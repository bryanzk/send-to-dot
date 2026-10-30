# 平台资格、网络与成本

核验日期：2026-10-29。功能资格和价格会变化，安装前请重新查看以下官方页面。一个账号的成功试用不能证明所有账号或工作区都可用。

## 适用范围：已经可以使用 dot 的订阅用户

本项目明确面向已经能使用 dot 的 ChatGPT 订阅用户。无需兼容没有 dot 的账号，也不将该兼容性列为发布阻塞；这不暗示所有付费套餐自动拥有 dot。此处不承诺替用户开通平台入口。

在自己的现有 dot 环境内，部署仍需要：

1. 本人的自建 MCP 应用连接／创建权限，以及适用的工作区许可。
2. 事件发现与原对话的 file.created 订阅能力。
3. 本人的私有 Space/Library 保存及助手原生附件发送能力。MCP image 结果不等于聊天附件；不能复用作者私有自动化或假设通用公开附件 API。

已有官方入口说明见 [MCP Events](https://developers.openai.com/plugins/build/mcp-events) 与 [dot access](https://learn.chatgpt.com/docs/dots#access)。本文不以套餐名称推断具体用户是否已获 dot。

## 自己的固定 HTTPS 与身份授权

[连接与测试文档](https://developers.openai.com/plugins/deploy/connect-chatgpt)允许公共 HTTPS 或 Secure MCP Tunnel 连接自建 MCP；账户／工作区策略仍适用。开发隧道可用于测试，但公开插件提交需要公共 HTTPS 服务。GitHub 源码发布与进入官方插件目录是不同的交付，前者不自动完成后者。

本项目还需要手机可访问的 HTTPS 网页和上传接口。正式日用优先选择使用者自己控制的固定域名与常在线主机；具体供应商、域名、证书和服务进程均由使用者管理。本地电脑方案必须保持在线；临时 Quick Tunnel 仅适合试用。项目把授权数据库绑定到固定 origin，域名变更需要正常迁移与重新连接，不能手改既有 OAuth 链接或复用其他部署的状态。

按照 [OpenAI OAuth 文档](https://developers.openai.com/plugins/build/auth)，资源发现、issuer、回跳 URI、PKCE S256 和资源绑定需要一致。应从自己的插件管理界面复制实际回跳 URI。符合 issuer identification 条件时可使用稳定回跳；不符合时可能使用 callback-ID 专属 URI，不应盲目沿用他人的配置。用户必须亲自完成授权和手机配对，不把密码、owner码或平台密钥发到聊天。

## 不需要作者的账号，也不默认需要模型 API key

当前核心服务执行上传、加密存储、OAuth、自建 MCP 和事件投递；源码没有 OpenAI 模型 API 调用。因此默认公共 HTTPS 路线不要求 `OPENAI_API_KEY`。图片由使用者自己的 ChatGPT/dot 读取和处理，其账号资格、计划和用量限制独立适用；“不调用模型 API”不表示平台服务或主机永久免费。

| 项目 | 谁提供／承担 |
|---|---|
| 已可使用 dot 的 ChatGPT订阅及相关用量 | 使用者自己的账号和工作区 |
| 主机、电力、存储、网络、域名及 HTTPS | 使用者自己的资源；按其供应商实际计费 |
| 本服务的 owner／手机上传／存储密钥 | 使用者本机初始化，最小权限、私有保存 |
| Space/Library 附件存储 | 使用者账号自身的可用功能及限制 |
| 作者账号、额度、主机、隧道和图片数据 | 不提供，也不是安装前提 |

可选的 [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)有另外的身份要求：自己的 Platform tunnel 和 runtime API key，创建/管理需 Tunnels Read+Manage，运行需 Read+Use，且需要正确关联工作区。它只处理 MCP 连接，不是本项目手机上传网站的替代品。公共 HTTPS 路线不必为此额外创建 OpenAI 模型密钥。本项目不承诺 Tunnel 免费或适合公开分发。

## 验收与证据边界

安装检查只能证明依赖、配置和服务入口。每位使用者仍须用非私密样本完成自己的 OAuth → 事件订阅 → 手机分享 → 原图读取 → 原对话回应；需要附件时再确认原生附件发送及实际显示。不能把 HTTP 200、webhook 2xx、单次工具调用或发送 accepted 回执分别当作整条链路成功。

项目已有单用户 Android 和 iPhone 图文分享、原 dot 事件／实际读图、私有原图附件与同次回应 accepted 证据；accepted不独立证明用户端显示。这不代替第二位已经能使用 dot 的订阅用户从干净源码独立完成部署、授权及原对话附件闭环。该独立验收尚未进行。

核心发布标准是目标用户使用自己的服务、账号、授权与用量，首次配置后正常分享便捷；验证刷新／重开、过期／撤销和离线恢复，不承诺当前实现已经永久免配置。没有 dot 的账号不在验收范围。原生 iOS源码仍非已签名安装成品。
