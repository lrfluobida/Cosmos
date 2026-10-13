# COS-81 保留请求准入拒绝的安全失败诊断

状态：ADMISSION_FAILURE_FEEDBACK_SOURCE_READY / source scoped complete / closed。Issue [#82](https://github.com/lrfluobida/Cosmos/issues/82)，id5837671050；依赖 COS11/77/79。

计划 exact `844305124605ff4d8c675a26f5ca8ced38c44b75` 已独审 PLAN_APPROVED。最终实现已由 `cos77_implementer` 完成实际规格与质量独审，没有finding；唯一merger已集成。[COS81公开批准](https://github.com/lrfluobida/Cosmos/issues/82#issuecomment-6155523557)、closed(completed)及父勾选已由Root精确读回，本卡源码范围完成。

| 记录 | 提交 |
| --- | --- |
| 批准版本 | `4f9f0b86b980a7515dceb32367fc675f85be4a2c` |
| 合并提交 | `0f03be14b761729749eb1615e78230af81426939` |

专属 implementer：`cos76_implementer` acting COS81；独立 reviewer：`cos77_implementer`；唯一 merger：`batch75_76_merger`。计划：[2026-10-14-cos81-admission-feedback.md](../plans/2026-10-14-cos81-admission-feedback.md)。

## 问题与契约

Root 提供的 C9 末条错误为 `Request output limit authority rejected; no provider request sent`。实施前源码已保存可信 `PiSessionError('admission_rejected')`，但反馈 mapper 未识别此码，最终误用作者声明未完成的默认说明。本卡不重新读取真实会话或改写历史报告。

1. 仅在现有 mapper 识别 typed admission；固定 checkId 为 `admission_rejected`，summary/actual 含稳定错误码及“本次被拒请求未发送”的安全说明，不记录任意异常文本。
2. 保持 `insufficient_evidence`；不改为 `external_service` 或 `code_defect`，不增加自动重试/修复资格，不放宽准入、费用、时限或验收。
3. 复用 failure.json 与 task.attempt.failure 的现有持久化，返回任务和报告保留准确原因；旧请求、已结算/预留费用、任务和窗口保持。
4. 普通对象伪造 code 不获得可信诊断；真实作者剩余项、未知异常及已有 typed 错误行为保持。

## 免费验收

mapper 与真实 executeTaskDag 作者失败路径先 RED 后 GREEN；复用现有 fake-provider Pi 夹具，证明当前被拒请求零发送、持久反馈和返回任务准确、下游不派发及合成历史费用不变。范围只有 source/free fixture，无 paid、新窗口或游戏验收结论；批准版本和合并记录见本卡顶部。

已完成两个有效 RED→2/2 GREEN；真实 Pi→factory→orchestrator 持久链通过。受影响两文件74/74、0skip；typecheck/build/测试strict均退出0。原始 TAP、命令、UTF-8/中文核对及证据边界见计划。生产只修改 feedback mapper，原 `insufficient_evidence`、费用记录和修复路由保持。

合并后typecheck/build通过，真实Pi准入拒绝经factory、orchestrator保存失败原因的代表通过1/1；与COS80代表合计2/2。原始输出为 `C:/Users/26557/AppData/Local/Temp/cos80-81-merge-integration.tap`。74项回归证据复用；原strict检查是作者当次工具退出0、没有独立日志，未把空日志当作证据。
