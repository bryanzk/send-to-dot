# 使用自己的稳定 HTTPS

正式日用需要自己控制的固定域名与常在线主机。项目不创建云账号、购买域名、提供作者主机或代付；默认公共 HTTPS 路线不需要模型 API key。先核对账号的 MCP Events 资格，再决定是否投入主机费用。

本服务只监听同机 `127.0.0.1:43187`。可使用自己已有的反向代理/TLS服务；必须把上游 Host 改为 `127.0.0.1:43187`，保持公网原始 HTTPS origin 不变。只映射本应用，不开放文件夹或其他本机服务。

例如同一台主机的 Caddy 配置（示例，不会自动安装或应用）：

```caddyfile
inbox.example.com {
    reverse_proxy 127.0.0.1:43187 {
        header_up Host 127.0.0.1:43187
    }
}
```

将域名换成自己控制的地址，并按自己的网络配置 DNS、80/443端口、持久证书存储和进程管理。Caddy 的公开域名自动 HTTPS 有这些前置条件；不要把本地自签证书或绕过浏览器警告当作手机可用入口。参见官方 [reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) 与 [Automatic HTTPS](https://caddyserver.com/docs/automatic-https)。本候选未安装/执行 Caddy，也未在新 VPS 上验收此示例。

服务启动且 HTTPS 准备好后，运行 `node scripts/preflight.mjs approved.config.json --live`。它检查首页、manifest、OAuth issuer/resource一致性和MCP401认证挑战。检查通过仍不替代自己账号的 OAuth、订阅和手机实测。

使用自己的进程管理器维持 Node 与代理，查看本地脱敏诊断。不要把 SSH 断开即结束的前台命令当作已持久上线。当前没有代管主机、DNS或无限期保活服务。临时 Quick Tunnel 只适合试用，初始化需显式 `--trial`；临时地址改变后不能继续沿用旧 origin 绑定或旧 OAuth 链接。
