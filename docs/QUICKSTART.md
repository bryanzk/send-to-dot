# 快速开始：用自己的资源跑通一张样本

目标是先跑通一张非私密图。目标使用者是已经能使用 dot 的 ChatGPT订阅用户，须完成自己的HTTPS、授权和手机验收；不会复用项目维护者的运行环境。

## 0. 使用自己的 dot 与连接权限

阅读[平台要求](PLATFORM_REQUIREMENTS.md)，使用本人已有的 dot 环境、能连接自建 MCP，并获工作区许可。仅看到 MCP 工具入口还不能证明 Events 可用；部署后还须发现事件并订阅。如果需要原图在聊天中作为附件显示，确认该代理还有自己的私有 Library 保存、助手原生附件工具与安全执行环境。没有这些能力时，先停止相应功能，不用私有 API 补齐。

## 1. 安装依赖

在一份新的源码目录运行，使用自己的主机。不要复制其他部署的 `.secrets/`、`state/`、数据库或配置。

从正式仓库 `https://github.com/bryanzk/send-to-dot` 下载源码并解压，或克隆该仓库。打开终端，进入解压后的源码目录，再运行下面的命令。不得克隆来源不明的同名项目。先安装合适的 Node.js、npm、Python 3（含 venv/pip；本轮实测 Python 3.14），然后运行：

```sh
sh scripts/bootstrap.sh
npm test
node scripts/smoke.mjs
```

Bootstrap 使用锁定 npm 依赖并禁用安装脚本，创建项目自己的 Python venv，仅安装固定 Pillow wheel；不改变系统电源设置、部署主机、生成云凭据或启动公网服务。需要联网下载依赖，费用与网络由使用者承担。

若需要手动安装：

```sh
npm ci --ignore-scripts
python3 -m venv .venv
.venv/bin/python -m pip install --only-binary=:all: -r requirements.txt
```

要求 Node.js 25.6.1+、Python 3 和 Pillow 12.0.0。测试只证明本地代码，不是手机或平台资格验收。`.env.example` 是说明文件，当前应用不会自动加载 `.env`。Setup 会记录选定的解释器，优先使用项目 venv；需要其他解释器时，在 setup 前设置 `DOT_INBOX_PYTHON`。macOS 已实测，Linux 需要使用者验收，Windows 原生权限/进程流程尚未适配。

## 2. 准备稳定 HTTPS

选择自己控制的固定 HTTPS origin，例如 `https://inbox.example.com`。证书必须能正常验证，不能使用 HTTP 公网地址或绕过浏览器警告。

服务只监听 `127.0.0.1:43187`。由自己的反向代理/托管入口将整个应用的 HTTPS 请求转发到该地址，并把上游 `Host` 设置为 `127.0.0.1:43187`。这包括网页、`/api/`、`/oauth/`、`/.well-known/` 和 `/mcp`；不要只代理 `/mcp`，也不要开放文件目录。代理与服务需按部署方案处于同一主机/网络边界，不能把环回地址误当成远程主机。

初始化脚本不申请域名、部署代理、购买资源或安装后台服务。日用应配置自己的进程管理、供电/网络及监控。本地笔记本休眠或断网会中断服务。临时 Quick Tunnel 只用于试验，网址变化后需要新 origin 的正常迁移/重连。

## 3. 初始化与启动

替换示例域名后运行：

```sh
node scripts/setup.mjs --origin https://inbox.example.com
node scripts/preflight.mjs approved.config.json
npm start
```

Setup 为新实例生成独立存储、owner 与手机秘密，保存 owner-only 本地文件，初始化仅上传授权，并准备可直接启动的配置；不在终端打印秘密。重复运行会保留并拒绝覆盖既有配置/秘密/数据库；不要用重新 setup 来续期。保留原存储密钥，丢失它会使数据库内图片无法解密。

可以先运行 `node scripts/setup.mjs --origin https://inbox.example.com --check`，检查前置条件而不生成文件。非默认回跳使用 `--redirect` 指定自己平台要求的精确 HTTPS URI，可重复给出多个；当前拒绝 query/hash/通配。临时试用域名需要显式 `--trial`，不作为正式日用推荐。

如果你是在手动迁移旧版实例，先阅读脚本输出及当前配置，不要把新密钥写进旧数据库，也不要以新 origin 打开原数据库。旧的 `provision.mjs` 现为 setup 的兼容入口；新安装使用 setup，避免“第一次启动只初始化后退出”与手改 JSON 的流程。

## 4. 检查公网入口，再连接

在服务与 HTTPS 都运行后，先执行综合匿名健康检查：

```sh
node scripts/preflight.mjs approved.config.json --live
```

需要手动定位时，用自己的地址检查：

```sh
curl -fsS https://inbox.example.com/.well-known/oauth-protected-resource
curl -fsS https://inbox.example.com/.well-known/oauth-authorization-server
curl -sS -o /dev/null -w '%{http_code}\n' https://inbox.example.com/mcp
```

前两项应成功，resource、issuer、authorize/token/register 都必须属于该同一 origin。最后一项在没有凭据时应是 **401**，这是认证挑战；200 才应检查是否误开放读取。首页、`/manifest.webmanifest`、`/sw.js` 和 `/sample.png` 也应能访问。

HTTPS 200 不等于 OAuth 或 MCP Events 成功。入口不稳定时先修复部署，不让手机反复配对。

## 5. 亲自完成 ChatGPT 授权

1. 在自己的自建 MCP/插件管理入口添加 `https://inbox.example.com/mcp`，选择 OAuth。核对实际回跳 URI，不能复制别人 callback-ID 专属地址。当前服务启用 issuer identification，默认配置采用稳定 ChatGPT 回跳；以自己平台实际给出的要求为准。
2. 在你自己的交互终端运行：

   ```sh
   python3 show_pairing.py owner
   ```

3. 将显示的 owner 码只输入**自己的 HTTPS 授权页**，提交一次，按终端提示清除显示。不要发送到聊天，也不要写进 URL。owner 授权和安装手机应用必须由你亲自完成。
4. 确认平台真的连接成功且能调用 `get_image`、发现 `file.created`。若按钮卡住，按[排障指南](TROUBLESHOOTING.md)恢复，不连续提交授权表单。

## 6. 手机安装与配对

Android personal profile 的 Chrome 打开自己的 HTTPS 首页，安装 Send to dot。电脑交互终端运行：

```sh
python3 show_pairing.py phone
```

核对手机页面的目的地，将这个**仅上传码**输入手机配对框，再清除终端显示。不要使用 owner、OAuth read、OpenAI 或 Tunnel 凭据。配对界面会说明传输范围；只分享你主动选择的内容。

iOS 使用 [iPhone 首次设置指南](IOS_SETUP.md)，其原生源码另见 [iOS README](../ios/README.md)。不要把 Safari 添加主屏当成 Android 同样的文件分享接收器；已提供签名 Shortcut 候选与 Mac 导入预览证据；已有单用户iPhone实际链路证据，其他用户仍需自己的真机验收；没有已签名原生 App。

## 7. 原对话订阅与首次验收

在打算长期使用的**既有对话**中，选择自己的连接，订阅 `file.created`，参数 `inbox_id: personal`。明确让助手读取事件指定的原图，并按你的要求回复；如果要原生附件，还需配置自己代理上的附件保存/发送编排。

如果平台在创建事件任务前要求一次真实读取，在**尚未建立订阅时**运行：

```sh
node scripts/sample-upload.mjs
```

该命令只上传包内固定生成样本，凭据留在本机受控运行时，仅输出非秘密的 `file_id`/`eventId` 回执。让原对话调用 `get_image(file_id)` 预检，再建立订阅。已有活动订阅时命令会拒绝，避免测试样本干扰用户附件；不要为此断开有效订阅。网络结果不确定时再次运行同一命令会复用保存的提交 ID，不能盲目删除回执换 ID。旧样本过期时先核实，再有意安排新测试。不要使用其他实例的 ID，也不将测试图当作用户交付附件。

先下载自己网站的 `/sample.png`：

1. 网页选图上传，确认正常收件。
2. 从相册选样本 → 系统分享 → Send to dot，确认安装后的分享入口存在。
3. 检查原对话是否收到真实事件、读取原图，并正确描述图片内容。
4. 若需要附件，确认收到的是助手原生附件，而且你在聊天中实际能看到；accepted 回执只代表发送被接受。
5. 测一次网络失败与刷新，确认简化Android页不会自动重发，也不把未知结果称为成功；服务端同ID去重与附件去重需在隔离测试验证。未通过前不要改用私人照片扩大试验。

## 每天使用前记住

当前授权不是永久的：新签发上传及读取/订阅授权30天，旧记录不自动延长，事件订阅最多一小时，需要平台续订；本机维护命令已提供，手机自助界面尚未提供。重启服务不会自动续期，再次输入同一手机码也不会延长授权。本机所有者可按 [上传授权维护](PHONE_ACCESS.md) 使用 status/renew/revoke/rotate/recover；请勿删除数据库或重新 setup 来绕过。源图一小时过期；已保存的 Space 附件独立持续保留。请在自己的实例核对过期和正常续订，不把一次成功当长期无人值守保证。

`smoke.mjs` 在临时目录生成独立配置及样本，实际环回 HTTP 完成 fixture OAuth、SDK 订阅、上传去重及原图读取后清理；回调是测试适配器，不使用真实平台或私人数据。它不替代 HTTPS、用户浏览器授权或手机验收。
