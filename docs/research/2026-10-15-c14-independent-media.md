# 封存 C14 候选：独立媒体补测字段匹配，整体失败

记录日期：2026-10-15。在源码 `61d13817ca871d2be04576b4d6fb51fa8a86b541` 上，对原 C14 候选的逐字节一致 TEMP 副本单次执行生产 generic `runAcceptance`。**15/15 步骤通过、62/62 媒体字段匹配，但整体仍为 failed**，错误为 `Cleanup: Server cleanup: timed out after 1000 ms`。`c14_media_diagnostic_reviewer` 已独立核对报告、coverage、绑定、时序及后核；[公开结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6181880730)已由 Root 发布并精确读回。

## 实测与边界

| 项目 | 记录 |
| --- | --- |
| 诊断 ID | `c14-media-10ea2e4d-3bc7-480d-9e06-14eefe83eb45` |
| 开始／结束（2026-10-15 UTC） | 00:30:34.649／00:30:41.177 |
| 用时 | 诊断6,528毫秒；外层启动器7,099毫秒 |
| 步骤 | 1次只读就绪等待、14次正常可见点击；15通过、0失败、0跳过 |
| 媒体字段 | 7个角色ID + 7个loadedFrames + 15个状态名 + 15个seen + 6个音频ID + 6个decoded + 6个started = 62，全部匹配；coverage valid/complete |
| 媒体范围 | 7角色、15状态、21帧、6音频 |
| 整体结果 | failed；Node PID756、exit1；服务关闭超时1000毫秒 |
| 后核 | 生产报告记录浏览器PID9376、processExited=true；独审确认相关进程及端口58995无残留 |
| 文件与费用 | 原文件、账本、候选及harness保持；新增模型请求/费用0；revision3114、共享¥16.901000 |

`forced=true` 只证明进入强制清理分支；这份旧报告没有记录是否实际发出 OS kill 或浏览器退出码。`browser.webm` 的93,887字节文件存在，尚未验证可播放性；原视频警告不能作为文件缺失证明。后核无残留不把本次整体失败改为通过。

本次只补媒体观察，**不包含 render/performance 验收**，也不新增玩法或存档重开证明。已通过的原8段220步[独立玩法证据](2026-10-15-c14-independent-gameplay.md)直接复用，没有重跑。[原C14](2026-10-15-transfer-c14-browser-launch.md)仍 failed/consumed，coding 未批准，accepted 与 human 未提升；COS16/COS18与完整经典仍未整体通过，真实 nativeIO 完整启动链≤15秒仍未证明。

## 保存与后续

本地私有证据前缀为 `E:/develop/Cosmos/.cosmos/reconciliation/2026-10-13-c6-provider-usage/`：

- `case14-independent-media-preserved/` 是原 TEMP `C:/Users/26557/AppData/Local/Temp/cosmos-c14-media-I2ZXHy` 的逐字节副本，共117文件、2,438,064字节。原 TEMP 仍保留；`case14-independent-media-preservation.json` 保存源与副本的逐文件 SHA-256、大小及mtime，未改写报告内部路径。
- 副本的 `media-summary.json`、`media-coverage.json` 与 `evidence/` 下的原 `report.json` 保存结果。完整证据位于 Git 忽略目录；公开正文为 `c14-independent-media-qualified-result.md`。
- `case14-independent-media.ts` SHA-256：`52f2ded2a67d4186d2642e47e93116bd867a2345e11bae6dacde0a1a823d2c9b`。v1 launcher 在 Node 启动前因 `Get-Command` 返回数组而失败；v2 是唯一实际 Node 执行，未重跑原C14或玩法。
- `case14-independent-media-launch-v2.ps1` SHA-256：`9bb350658fbf6976accf08843bbc398f7db4ea7f398a79cee405de03c998c80f`。两版 launcher、intent、stdout、stderr、result 均保留，不删除或重跑。

[COS93 / #94](https://github.com/lrfluobida/Cosmos/issues/94)承接真实历史负载下的完整原生浏览器启动测量；[COS94 / #95](https://github.com/lrfluobida/Cosmos/issues/95)承接普通浏览器验收服务关闭超时。本记录提交时两项计划均已独立 PLAN_APPROVED、实现中；后续COS94源码已独审集成，范围与限制见[任务卡](../specs/cos94-browser-server-cleanup.md)，COS93仍未实测/未SOURCE_READY。本记录的原媒体及C14失败结论保持。
