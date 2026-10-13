# COS-81 保留请求准入拒绝的安全失败诊断

状态：SOURCE_NOT_READY / in-progress / open。Issue [#82](https://github.com/lrfluobida/Cosmos/issues/82)，id5837671050；依赖 COS11/77/79。

专属 implementer：`cos76_implementer` acting COS81；独立 reviewer：`cos77_implementer`；唯一 merger：`batch75_76_merger`。计划：[2026-10-14-cos81-admission-feedback.md](../plans/2026-10-14-cos81-admission-feedback.md)。

## 问题与契约

Root 提供的 C9 末条错误为 `Request output limit authority rejected; no provider request sent`。源码已保存可信 `PiSessionError('admission_rejected')`，但反馈 mapper 未识别此码，最终误用作者声明未完成的默认说明。本卡不重新读取真实会话或改写历史报告。

1. 仅在现有 mapper 识别 typed admission；固定 checkId 为 `admission_rejected`，summary/actual 含稳定错误码及“本次被拒请求未发送”的安全说明，不记录任意异常文本。
2. 保持 `insufficient_evidence`；不改为 `external_service` 或 `code_defect`，不增加自动重试/修复资格，不放宽准入、费用、时限或验收。
3. 复用 failure.json 与 task.attempt.failure 的现有持久化，返回任务和报告保留准确原因；旧请求、已结算/预留费用、任务和窗口保持。
4. 普通对象伪造 code 不获得可信诊断；真实作者剩余项、未知异常及已有 typed 错误行为保持。

## 免费验收

mapper 与真实 executeTaskDag 作者失败路径先 RED 后 GREEN；复用现有 fake-provider Pi 夹具，证明当前被拒请求零发送、持久反馈和返回任务准确、下游不派发及合成历史费用不变。范围只有 source/free fixture，无 paid、新窗口或游戏验收结论。实现 exact SHA 需独立批准后才可集成。
