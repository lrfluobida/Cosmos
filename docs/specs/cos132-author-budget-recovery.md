# COS132：设计作者预算恢复与独审容量

状态：固定规格/计划已由独立 `author_budget_recovery_reviewer` APPROVED_PLAN、无P1/P2，Root批准工程设计及免费源码实施；source pending，尚未独审或集成。

任务：[COS-132 / #133](https://github.com/lrfluobida/Cosmos/issues/133)，原生父COS18/#19、未勾选。实现者 `author_budget_recovery_implementer`，独立源码reviewer `author_budget_recovery_reviewer`，唯一merger `public_agent_batch_merger`。

- 批准规格输入 SHA256：`365be142f7b150f21b710d66c3a56b2481f996175acc7b4ba356ec3a4724a5e9`
- 批准计划输入 SHA256：`33ce22beec281c3ec0978bd212186288a81a35e6b7abb6af401a06375932aef3`

登记/实施基线：`844df4c7e09d7bbbad0b1a4d0cf2e3006801d9fd`；已发布runtime `ac1c745eb0be016f8a556edbadabad013fbf61bd`。下文设计诊断基线按批准原文保留。[配套实施计划](../plans/2026-10-27-author-budget-recovery.md)。COS132/COS133并行，不互设阻塞；最终组合的实际reviewer报价为下一次付费前置。本次仅免费源码实施，旧reuse-1永久failedclosed，不操作真实run/ledger/coordinator。

## 范围与事实

基线：final main `7b5d837`，运行源码 `ac1c745`。本卡修复通用 ordinary 游戏生成中的作者请求容量；不重开任何旧运行，不修改需求或验收标准。现有 ¥5 / 30 分钟、项目 ¥150、phase ¥30 和原作者 32 请求上限保持。

`room-20261027-reuse-1` 已永久 stop / close / settle。精确复用 room12 v2 成功，之后 30 次请求、457374µ、213394ms，设计未交接，art / coding 均为 0。作者 26 次回复与 3 次成功摘要共 29 请求、432885µ；原设计任务 675000µ，余 242115µ。

最后待发原生输入 91664B：8192 输出最低报价 `2*91664 + 8*8192 = 248864µ`，短 6749µ；7349 输出也不足，7348 虽报价可容纳，却低于完整文件写作的 8192 下限。最后压缩后 75809B，新增 15855B 小于固定 32768B 冷却。现实现既先挡在冷却，又仅在普通下限可付时选择摘要；错误随后被统一成 `admission_rejected`。

结构检查通过不能证明语义完整。最终计划仍缺“跨进程重开前的未保存变化”等要求，必须继续由独立审查拒绝。媒体语义反馈由 COS133 负责。

## 免费诊断依据

保留的最短探针目录：`C:/Users/26557/AppData/Local/Temp/cos132-review-quote-1ryq5834/`。`quote.mjs` / `quote.json` 经实际 roleFactory、只读文件工具、Pi 及 SDK 归一化；只替换模型 transport，网络调用 0。读取原 run 文件，未打开真实 controller；capture 路径和 host evidence 按生产形状在独占 TEMP 重建。原运行没有真实 capture / review，本报价不冒充实际审查。

| 独审请求 | 原生输入 | 4096 输出报价 | 8192 输出报价 |
| --- | ---: | ---: | ---: |
| 首次，尚未读取文件 | 15968B | 64704µ | 97472µ |
| 一次读取完整 draft、confirmation、design、plan、host report 后 | 105647B | 244062µ | 276830µ |
| 两请求最高费用相加 | — | 308766µ | 374302µ |

五次 read 均完整、未截断，走既有 JSON 展示压缩。余 242115µ 连第二请求最低价都短 1947µ，尚未计算第一次独审费用。因此单独放低作者下限不能解决链路。

`summary-quote.mjs` / `.json` 经实际 native prepareCompaction / compact，原生最后输入精确为 91664B；摘要输入 12861B，8192 最高报价 91258µ。合成短摘要只写入 TEMP native 副本，之后输入 77253B、普通下限报价 220042µ。短摘要是有界验证数据，不预测真实摘要质量。旧余额若按摘要最高费用结算仍不足；必须在实际结算和新 projection 后重新报价。

`boundary.mjs` / `.json` 对内存账本克隆调用现有 production reserveEntry / authorBudgetCompaction / authorBudgetOutputLimit，复现 `false` 和 floor 拒绝。只为探针赋予合成 active authority，原关闭状态和账本未改变。

已量化排除重复前缀重构：原作者 preamble 13685B；packet 的 acceptance 只有 COSMOS-DESIGN 一项 350B，objective 1592B、rules 7500B。完整 draft 36675B 从文件读取，没有重复内嵌整份需求。

## 方案比较与选择

1. **只解除压缩冷却**：能遇到真实摘要，但作者仍能耗尽独审费用；拒绝单独采用。
2. **统一把写作下限降至 4096，或结构通过就强制交接**：混淆文件写作与 JSON 收尾，且可能掩盖语义遗漏；拒绝。
3. **仅调整初始分配**：给当前输入更多余量，但仍没有独审保留，也没有越过冷却后的稳定退出；不足。
4. **选择最小组合**：新 ordinary 固定初始分配 + 原任务内独审保留 + 一次预算压力冷却例外 + 已有只读纠正的独立小容量 + 明确失败原因。复用既有 Pi hook、预算串行区和严格交接协议，不新增交接框架或动态配额系统。

## 行为契约

### 1. 仅新 ordinary 的固定政策

- 原 pool 定义不变。设计分配从 `floor(pool*0.15)` 调为 `floor(pool*0.25)`；art 25%、coding 40% 保持，未分配 repair 余量从约 20% 变为约 10%。¥5 例 pool 4500000µ，设计 1125000µ、art 1125000µ、coding 1800000µ、未分配 450000µ。
- 既有 `execution.json` 增加可选版本字段 `ordinaryDesignBudgetPolicy: "review-reserve/1"`；只由新普通入口写入。恢复沿用原字段；无字段保留旧 15% 分配与旧预算策略，未知值拒绝。固定 validation、preparation、human/modular binding、inherited 等当前排除范围保持。
- 不修改旧 snapshot、旧任务 allocation、授权、账本条目或已结算记录。不通过新 task ID 重新发放同一旧任务额度。
- 新政策作者请求（包括摘要和只读纠正）保留 `floor(task.budget.allocationMicroCny/3)` 给独审。在 ¥5 例是 375000µ，作者可用总额 750000µ；已知 432885µ 费用之后作者可用 317115µ。使用比例，不硬编码小屋金额。
- 保留是同一个 task grant 内的准入约束，不新增账本 allocation 或虚构已花费条目。只读报价和实际 `coordinateAccounting` 内 reserve 前检查均执行；reserved / unknown / settled 均计入，审查者自己的请求可使用原任务剩余额度。
- 375000µ 只证明当前五文件、一次批量 read 加一次 verdict、两次 8192 最高报价 374302µ 可容纳。它不保证任意产物大小、任意审查轮数或修订后的 COS133 提示都足够。最终组合必须重算实际修改后的 reviewer 输入；若最低必要路径超过保留额，先报告精确差额并修正本卡设计，不能启动付费后再发现。

### 2. 有界的预算压力压缩

- 保持原普通文件写作下限 8192、cap 32768；预算在扣除独审保留后计算。原完整 cap 付不起时，新 ordinary policy 返回明确的 `budget_pressure` 选择，包括连 floor 也付不起的情况。
- Pi 在判断 32768B 冷却之前询问这个可信选择。相同 projection 仍不重复；正常超过冷却的压缩保持现规则。**每个原作者 session 最多一次** `budget_pressure` 例外绕过冷却；只有实际使用例外时消耗这个机会，无新请求额度。
- 仍只在成功 tool batch 后触发；少于 3 个剩余原生请求槽时不发摘要。只读纠正、取消、失效授权、相同 projection、已有无收益禁用状态不能借此触发摘要。原 32 是整 session 累计，包含摘要与 readonlyPrompt，不能按 prompt 重置；实际 29 次之后仅余 3 次。
- 摘要仍按实际原生输入、最高 8192 输出报价并正常 reserve / admit / settle；付不起摘要时，只有旧普通 floor 仍付得起才可 skip，否则以明确预算错误结束。不得先发送再判断余额。
- 成功摘要后用实际 projection 与实际结算重新选择普通输出。无下降则禁用后续自动摘要；新 floor 仍不足则停止，不再尝试补额度或重摘要。保留原 split-summary、length、skip 的 native checkpoint / leaf / context 一致性要求；失败与 unknown 仍不能继续。
- 已知输入的有益样本：新分配作者余 317115µ；91258µ 最高摘要结算后余 225857µ，可付合成短摘要后的 220042µ floor。若摘要更长、费用更高或其他请求占用导致不足，必须走明确失败分支，不保证恢复成功。

### 3. 已有只读纠正与原因报告

- 仅既有 `readonlyPrompt` 格式纠正路径可用 4096 输出上限 / 下限；所有 callable tools 为零，沿用同一个 session、request counter、deadline、预算保留与原一次纠正槽。普通文件写作和摘要不因此降为 4096。
- 不因文件结构通过而自动调用收尾，不从失败的 prompt 伪造自然终止，不吞掉 `remaining` / `uncertainty`。本卡不新增提前终止/强制交接协议；32 次内没有合法交接仍失败。
- 用可信固定错误码区分普通输出下限不足、独审保留导致作者不足、审查下限不足及 session request limit。Pi 只保留这些明确允许的类型/码，其他异常仍脱敏。failure.json / 自动报告中有具体 checkId 与固定解释，注明请求未发送；不要只留下 `insufficient_evidence` 或原始 provider 异常。
- 这些资源错误在既有 repair policy 中返回明确 stop reason；不能当作生成代码缺陷自动消耗 repair，不能以“补证据”掩盖预算不足。底层 FailureRecord 分类无需增加新枚举。
- 原 capture / verification / independent reviewer / semantic rejection 均保持。审查发现真实遗漏时 art / coding 派发为零，结构 passed 不能提升为 approved。

## 完成证据

只做本卡真实形状的免费有限回归，复用未变证据，不运行付费模型、全仓矩阵或完整浏览器。独立 reviewer 审规格与实际 diff，唯一 merger 合入并记 progress。源码通过不等于游戏生成通过；COS133 合并后的实际报价、语义拒绝链与最小组合检查通过后，root 才安排下一次有界真实验证。
