# 本机所有者维护手机上传权限

以下命令由部署所有者在自己的服务目录运行。只修改当前实例的 owner/upload 授权，不改 OAuth read/subscribe、订阅、原图或存储密钥；不会打印码值。无需停服务，不会因重启自行续期。

```sh
python3 scripts/phone_access.py status
python3 scripts/phone_access.py renew --days 30
python3 scripts/phone_access.py revoke
python3 scripts/phone_access.py rotate --days 30
python3 scripts/phone_access.py recover
```

- `renew`：明确将已有授权有效期设为现在起 1–30 天，原手机不用重新配对。已撤销/被过期清理删除的授权不会复活，改用 rotate。
- `revoke`：立即撤销当前手机码，仅上传停止，已入库图片和原 dot 的读取/订阅不受影响。
- `rotate`：生成新的短期码并撤销旧码，需用户在自己的交互终端运行 `python3 show_pairing.py phone` 后重新手机配对；iOS 下次使用新码。不会把新码放到聊天、URL 或日志。
- `recover`：处理被进程/机器中断的轮换。数据库已提交则完成新码文件切换；未提交则保留旧码。遇到歧义保留文件并停止，不能手动删除 journal 盲试。

命令仅限 owner-only 配置、凭据、state 目录和数据库，拒绝 symlink。轮换使用进程锁、SQLite 事务、私有 pending 文件及 fsync journal；磁盘/系统故障仍可能需要显式 recover，不能承诺所有设备故障自动恢复。操作须由拥有服务端文件访问权限的部署所有者执行，网页和手机不能调用此命令。公开仓库不包含任何实例凭据。

这不是 OAuth 授权续期命令。读取授权到期仍需平台正常重新授权；事件回调续订由平台负责，见 SUBSCRIPTION_RECOVERY.md。不要用 setup、数据库编辑或无限延长服务端 TTL 绕过这些边界。

新默认为30天，可用--days 1..30或兼容的--hours 1..720；二者互斥。仅安装新代码不会执行renew/rotate，也不会延长现有记录。改实际权限期限或新建生产码前，必须确认owner、upload-only范围、期限和安全保存方式。当前码供多个设备共用；撤销或轮换会影响所有这些设备。iPhone v4只在用户批准后把码写入私人快捷指令明文Text；它可能iCloud同步或随导出泄露。删除手机副本不撤销服务器授权。
