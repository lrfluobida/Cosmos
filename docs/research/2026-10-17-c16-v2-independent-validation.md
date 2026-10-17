# 封存 C16 v2 候选：独立玩法与媒体补测通过

2026-10-17，在已审 `cc5a3e13649c27632156190d11240dad51422ade` 上，对原 C16 v2 候选的逐字节一致 TEMP 副本执行一次免费补测：**八段220步全部通过，62个媒体字段全部匹配，清理完成，用时47.602秒**。独立 reviewer 给出 `APPROVED_C16_V2_INDEPENDENT_VALIDATION_RESULT_SCOPED`、无finding；Root 接受后核并解冻，[公开结果](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6233582959)已逐字读回。结果文档组合 `06c714bfd5eb8f4ef30c1887ce95b2dcd2c2828b` 经独审 `APPROVED_C16_V2_INDEPENDENT_VALIDATION_RESULT_DOCS`、无finding；Root批准后由唯一merger按固定SHA快进合入并发布，远端已读回。

这是封存的实际生成推箱子候选，其生成来源仍为 `2f84eb328e59f20d73ceccdc69ff708f7be200a5`。原 C16 保持 interrupted / consumed / incomplete，[COS102 / #103](https://github.com/lrfluobida/Cosmos/issues/103)保持 open；原运行的中断、费用和闭账见[历史记录](2026-10-17-cos102-interrupted-actual.md)。本次没有重开原运行、修游戏、重新构建、模型调用或新增费用。

## 实测

[补测计划](../plans/2026-10-17-c16-v2-independent-validation.md)与脚本先经独审，Root [单次执行批准](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6233519607)后仅执行一次。保留原需求、设计、全部步骤、期望值及每步超时，只派生诊断身份、TEMP 路径和 loopback origin；没有加入 COS105 新参考事实。

| 项目 | 结果 |
| --- | --- |
| 诊断 ID | `c16-v2-diagnostic-c63fc14b-bf85-47ea-af43-544dbccd5700` |
| 起止（2026-10-17 UTC） | `11:48:36.173Z` → `11:49:23.775Z`，47,602毫秒；Node exit0 |
| 原计划 | T16-01～06；46次正常点击、174项断言；220 passed、0 failed、0 skipped |
| 各段步数 | start21、walk-wall26、push26、box-wall32、double-box23、restart29、restore26、victory37 |
| 媒体 | 原manifest的7角色、15状态、6音频；62/62字段匹配，coverage valid/complete |
| 保存重开 | checkpoint passed；同profile、同origin，restore PID1980 → victory PID33452 |
| 清理 | 8个浏览器均非forced、exit0，生产退出证据完整；静态服务端口50892关闭 |
| 独立后核 | Root `11:51:37Z`、reviewer `11:53:37Z`：诊断及浏览器无活进程、专用profile/script无进程匹配、50892无残留监听；reviewer进一步确认无该端口TCP项 |
| 文件保持 | 390个保护文件与33个harness/script的hash/size/mtime等于输入manifest；TEMP候选100文件/1,868,135字节与原候选相同 |
| 账本 | 闭账snapshot hash未变，revision3334、766请求/18,166,722µ保持；本次新增请求/费用0 |

独审核对全部原始分段报告、checkpoint、媒体样本和witnesses。报告引用的214个文件存在，包括182个1280×720 PNG和8个WebM；视频只检查文件头，未解码验证。Root 实际查看了start和victory画面，末段显示胜利；这不代替用户最终体验验收或独立模型美术评审。

## 结论边界

本次通过只证明该候选副本在当前环境的220步、存档重开、62媒体字段和本次清理。独立harness没有走原controller/ownedChild路径；不能补称原C16在原deadline内成功、原native链完成、独立模型review批准或promotion。完整视频播放、性能、美术质量、human、COS16/COS18及完整经典游戏仍未验收完成。

## 私有证据索引

原始TEMP：`C:/Users/26557/AppData/Local/Temp/cosmos-c16-v2-independent-WRX92b`。原始计划、输入manifest、派生series、媒体request/coverage及各段截图/视频保留在此，不复制进Git。

- `diagnostic-summary.json` SHA256：`539ef0f298a21daada588efbc921fbcfc60231608bac1b12b838708770a79f06`；其中 `reportPath` 指向aggregate，其SHA256为 `275b5930bc86f6e2afdb79c1d6032c25a83b99574fc0f27f2af3550967b0d0cf`。
- 作者worktree `.cosmos/c16-v2-independent/`：`diagnostic-v1.ts` SHA256 `22107737374e72e86f10d307f3c868b7abab3bebd20e330e7d18110269264256`；`consumed-v1.json`、`execution-pty-result-v1.json`、`execution-receipt-v1.json`保存一次执行身份、原PTY尾输出/退出码及索引。
- 主项目 `.cosmos/reconciliation/2026-10-13-c6-provider-usage/`：`case16-v2-independent-authorization-v1.json`保存单次授权；`case16-v2-independent-postcheck-v1.json`保存Root后核，SHA256 `eb01d51d283be659348e1e3a626a19468305e0b828151827df9f0d8dabfc0575`。
- 原ledger闭账SHA256：`34a6ba11f4e96ad1c87a6a0cfb54ae6890e07036500af1a19660e9b45aeb4fef`。本次只作不透明文件保持核对，未调用账务API。
