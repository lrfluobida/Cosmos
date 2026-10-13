# COS80 按当前候选选择完整计划

状态：PLAN_APPROVED（只读设计）/ SOURCE_NOT_READY。Issue [#81](https://github.com/lrfluobida/Cosmos/issues/81)，id5837669130；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)，依赖 COS38/50/78。

计划 exact `5324f831b2bb64799ffe10418ff5117781fcb15b` 已独立 PLAN_APPROVED；最小实现完成，等待 exact 源码审查。

作者 `cos77_implementer` acting COS80；独立 reviewer `cos76_implementer`；唯一 merger `batch75_76_merger`。计划：[2026-10-14-cos80-current-plan.md](../plans/2026-10-14-cos80-current-plan.md)。

## 问题与契约

现有 transfer 编码规则两处要求完整读取 v1/v2 计划。C9 两份文件各 93542 UTF-8 bytes、2737 行，八段 220 步操作与断言相同，差异仅候选、任务和报告绑定。当前输入还保留旧 C5 计划；完整读取所有历史计划不是当前作者完成任务的必要条件。

由 host 在编码规则中提供两项可信映射：`outputDestination` 对应准确的 `plan` artifactId/version/location 及 `_cosmos/transfer-plan.json`。编码作者与同角色修复作者只匹配固定 packet 的 `outputs[].destination`，完整读取唯一匹配计划；不得先读两份 JSON 猜版本，不得根据 artifact version 选择（两份都可能是 v1）。没有唯一匹配时报告阻塞，不猜路径或改计划。

原 linked repair 克隆规则后由 host 替换 output destination；因此规则同时保留两项映射，修复自然选 v2。design 保持原双计划职责。所有 refs、inventory、只读权限、捕获字节、历史签名和双计划校验保持；host 仍独立选择 staging/验收计划。作者规则不限制独立 reviewer，不改变任何验收条目。

## 验收

1. 实际 v1 factory packet 明确映射当前输出到当前 v1 计划；全部输入与原 host 依赖保持。
2. 实际 linked repair→factory 的 v2 packet 使用同一映射，随可信 output destination 选 v2；原地图、步骤、origin、反馈与一次修复约束保持。
3. 原 inactive-plan 篡改仍阻止候选绑定/恢复，candidate 只暂存自己版本计划；不减少 host 校验范围。
4. 原始 RED/GREEN、typecheck/build、UTF-8/中文检查及 exact diff 独审齐备。

仅修正必读输入契约；不增加 JSON 工具、schema、预算、权限、自动重试或新案例，不手改游戏。SOURCE/TEMP 不能证明实际模型阅读行为或节费；C9 的 failed/insufficient_evidence 及费用历史保留，不能宣称本修改足以使其通过。

## 作者验证

两个实际 packet 代表有效 RED→GREEN；加原候选单计划依赖与 inactive-plan 篡改守卫共4/4、0skip。typecheck/build/受影响测试 strict 编译均退出0；原始 TAP 与命令见计划。真实 v2 linked repair 保留同一映射，随 host 替换的 output destination 选择 v2；两个 plan artifact version 均为 v1。合成 provider/build/browser，仅本地 loopback，无实际模型或新付费。

独审发现共享路径说明仍可能要求逐项全读，已改条件式路径说明；新增 v1 断言有效 RED→1/1 GREEN，修后 typecheck/build/strict0。未改的 v2 和守卫通过证据复用；最终 exact 等待独立复核。
