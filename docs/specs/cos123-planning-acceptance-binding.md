# COS123 · 规划任务的可信验收归属

[COS123 / #124](https://github.com/lrfluobida/Cosmos/issues/124)，issue ID `5983405083`。

状态：设计与计划已获独立批准；父 COS18 / #19。基线 `33956c44b79d25095945b754f09bbde1887c25c8`，runtime `4b2eae9a9bccec19f590dd09951b5059d72785f4`。用户已授权持续开发 Cosmos；本卡仅免费 SOURCE/TEMP。room7 已通过原 API 停止并结算，不得恢复或再次结算。

## 问题与已核证据

room7 实际 v3 经用户“继续”授权，在原 CLI 输入 `confirm 3` 后生成窗口为 2026-10-22T15:51:01.970Z 至 16:21:01.970Z，9.175 秒后 incomplete。两次规划模型请求共 31954µ（首次工具读取、第二次 JSON 回答，非纠正）；含访谈共 6 笔 136637µ。没有任务、execution.json、作者、capture、独审或游戏候选。本案没有运行到 COS122 的设计作者 32 次容量。

`planTaskDag` 接受合法 JSON、确认 ID 与总体覆盖，并写 `validated_proposal`。但 design 的 acceptanceIds 同时包含 COSMOS-DESIGN 与全部八项玩法，而 browser host 仅允许设计任务承担 COSMOS-DESIGN，玩法交最终 coding。host.validateTasks 在 execution.json 发布前拒绝，通用 catch 只显示 planning 未完成。

独立 `planning_scope_assessment` 提取原 host 校验表达式纯内存重现：原 room7 计划拒绝，仅在内存副本把 design.acceptanceIds 改为 [COSMOS-DESIGN] 就通过该表达式；任务数、角色、art/coding 归属与全部依赖其余七条件均满足。room5/6 设计仅专属项。原文件未更改。

固定验收归属已由 host 强制规定，不应继续只依赖自然语言规则让模型猜测。增加规划重试会扩大生命周期，本卡采用显式可信绑定，不添加重试槽。原 strict host 终验继续保留。

## 范围与接口

1. 仅在 `PlanningTaskPolicy` 增加可选可信 `acceptanceIds?: string[]`，不扩大 `PlanningRolePolicy` 的 legacy roles API。不配置时保持原模型分配行为；不得从模型字段生成或修改可信策略。
2. 对明确配置的 taskPolicies，在创建模型会话前验证非空字符串数组、无重复、每项均属于完整已确认 requirement。`validation` 固定案例显式拒绝该新覆盖，保持原 grants、身份与 requireValidationTask 条件。纯配置错误不能发模型请求。
3. 发送到规划器的 policy 数据包含同一已核验归属；用短提示区分任务负责的验收与设计文件需要映射的玩法。保持模型 JSON 形状及 taskId、policyId、role、objective、acceptanceIds、dependsOn 字段，不扩展模型权力。
4. 先保留原 proposal 的形状、合法 ID、角色/槽位、唯一身份、依赖、总体覆盖等校验。尤其不能因后续替换掩盖重复 acceptanceIds：保持原 validateTaskInputs 对重复 ID 的拒绝等价行为，必要时在绑定前显式检查。空、未知、重复、缺总体覆盖的原 proposal 仍拒绝，不以 host 字段修复这些输入。
5. 仅为启用归属的选中 policy，使用可信 ID 列表构造最终 TaskContract.acceptanceIds；TaskContract.acceptance 从同一原 requirement 按该列表选取。未启用的槽位沿原路径。绑定后重新核对完整 requirement 覆盖，缺任一项拒绝；不得静默丢弃要求、绕过预算/依赖/路径/工具/输出/验证规则。
6. 在本次新 plan 中记录精简 `acceptanceBinding` 来源，至少含 policyId、taskId、原 proposedIds、最终 boundIds，仅启用项出现。保留原 native 回答，既不覆盖原模型事实也不修改历史文件。未启用的 plan 格式保持原样。提示、绑定与记录使用同一可信值，防外部可变配置漂移。
7. 生产启用范围是 ordinary browser 产品入口，包括普通 shared-funded 运行和现有 3/5 槽模式。design=[COSMOS-DESIGN]，art=[COSMOS-MEDIA]，最终 coding=实际 gameplay IDs；已支持 modular 的每个模块仅对应其既有 module acceptance ID。复用当前真实常量与策略，不猜测模块名称。不在 legacy、preparation、fixed validation、continuation binding 或 inherited 入口开启此配置。若实际结构无法安全隔离，先报告给 Root，不扩大范围。
8. 原 host.validateTasks、capture、独审、角色 grants、预算/时间、Pi 配置、输出上限、repair、历史恢复条件均不变。没有 execution.json 的旧失败运行不能因本卡重新付费规划。本卡不绑定依赖、不新建恢复机制、不改变通用失败报告或做其它重构。

## 验收

- 有效 proposal 把普通 design 错分成专属项+玩法时，带可信策略的真实 planner 产出精确 host 归属，保留原 proposal 来源；通过原 browser host 验证与最短作者派发代表，不需调用真实 provider。
- 拒绝无效策略、重复/空/未知 proposal IDs、原总体覆盖不足及绑定后覆盖不足。失败不得发布通过的 plan 或构造越权任务；保留原会话清理和预算行为。
- 归属变化不影响 objective、依赖、路径、输入、输出、工具、grants、时间或完整已确认要求；故意无效依赖和其它 host 缺陷仍拒绝。
- ordinary 三槽、普通 funded 和现有 modular 五槽启用；legacy roles/未启用taskPolicies/preparation/fixed validation/历史关闭与绑定恢复保持原语义。fixed validation 配置错误在创建session前拒绝。
- 真实 pinned Pi SDK + fake transport 或既有真实 planner/host TEMP 夹具证明原失败 RED 和修复 GREEN。仅复用经过影响分析仍有效的历史证据，不重新付费或手改旧计划。
- typecheck/build、变更测试 strict、UTF-8/中文/行尾、diff；独立作者、独立源码 reviewer、唯一 merger 合并批准 SHA 并更新 issue/PROGRESS。

源码通过只证明归属绑定及守卫行为，不保证后续真实模型设计或游戏验收成功。
