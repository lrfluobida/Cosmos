# COS101：同一共享账本上的第十五迁移案例

状态：设计提案，2026-10-16；源码与一次实际付费运行分别等待 Root 审批。设计基线 `cd8b4b9fe2ee5e2a72ed976b16ca52d58ee70aad`。拟作为 COS16 / [#17](https://github.com/lrfluobida/Cosmos/issues/17) 的子任务登记；GitHub 编号由 Root 发布后补入，不占父 #1 已有的 100 个直接子项。

## 目标与成功条件

固定新案例 `cos20-transfer-validation-15`（C15）复用 C5 已批准 design/art，重新由运行时 coding 作者产出游戏，完成正式构建、真实 native 八段正常输入、完整媒体消费检查、带截图的独立 coding review、精确候选 promotion 和交付报告。质量、成本、速度依次优先；预算或时限不足时保留实际工程与明确差距。

C15 成功必须同时满足：

1. 新 coding 作者的独立工作副本初始没有 C14 或其他未批准代码；capture、候选、正式构建和后续证据绑定同一新版本。
2. 通过固定 T16-01～06、完整八段计划、存档与同 profile/origin 的真实进程重开；所有必须步骤执行，不能用只运行首段或 diagnostic planned stop 替代。固定 C5 计划原含 220 步，最终按其实际冻结计划核对总数与零失败/零跳过。
3. 正式 build、完整媒体检查及交付检查通过；C5 媒体输入对应的完整 62 字段在新 candidate 上核实，截图、视频和原始 consumer 报告绑定新 candidate。视频须成功 finalize；交付证据需核对可完整解码、退出及清理记录，不能只凭文件存在。
4. 独立上下文 reviewer 读取固定产物、主机证据和正常截图输入后明确 `approved`；任务 `passed`，`ArtifactRegistry.current()` 精确指向该 approved candidate，交付路径、源码/启动说明、费用和差距可定位。
5. 当前窗口正常停止与全部 owned work/服务/子进程清理结束，unknown/reserved 为零；最终报告与 promotion 在停止前后保持同一 candidate。停止、清理与费用未核实时不标成功。

本卡证明固定迁移的自动生成闭环。COS18 的公开 CLI 真实需求确认、两种 brief、用户正常试玩及完整经典游戏仍分别验收；operator 结果中的 `userExperience` 保持 `not_confirmed`。T16 没有 FPS 条目，本卡不增加 render/performance 工作。

## 已有证据与当前缺口

- [C14 实际记录](../research/2026-10-15-transfer-c14-browser-launch.md)：41 分 13.754 秒、35 个 settled 请求、¥0.792063；正式构建通过，浏览器首段启动失败，coding review pending、没有 accepted。C14 已消费，closure20 已执行，不能重开或再次 closure。
- 原 C14 一致副本的 220 步玩法和 62 字段媒体证据只适用于原 candidate，不能替代 C15 新产物验收。C14 coding 未批准，不是历史复用输入。
- Root 已核对的 [COS93 navigation-v2 结果](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6208523921)：`native-validation-waits/2` 导航 1044.6055ms（goto 840.4206 + ready 203.6588），29 HTTP、0 reject；normal cleanup 493ms，视频完整解码 70 帧、exit0。第一 native 段实际 137.277s，whole open 47.913s；actual 总 877848ms，其中 TEMP 构造准备约 319s、host.verify 约 557s。原 467 文件/61 目录、ledger 保持，独立后核无残留、Root 已解除冻结。该结果只证实这次有计划停止的导航诊断；生产报告仍 failed / reportValid:false。
- 已核对账本基线为 snapshot revision3114、ledger5、715 请求、settled 16901000µ、reserved/unknown 0；22 个 stopped 案例、14 delegations、110 closed grants、20 closure audits。共享未分配 57911425µ；原组剩余 1707937µ。启动时须重新只读核对精确基线，漂移则停止并更新报价，不能把这里的数字当长期授权。

## 方案取舍

采用同一 ledger5 上的固定 declaration-2 非分组 C15。现有非分组 grant、quote1、费用与 closure 契约可复用；原 COS16 组和一次 supplement 继续作为同账本历史被认证。

另两个方向不采用：第二组/第二 supplement 需要新预算成员与历史规则，超过本次固定案例需求；用公开 `new` 入口会建立正式 ¥200 human 运行，不能把 operator 决定冒充需求确认或把其费用混记为本次共享验证。

这沿用 [ADR0001](../adr/0001-validation-budget-windows.md) 的同账本窗口原则。C15 属于 COS16 的验证工作，但其新 grants 的资金来源是共享未分配容量，**不是原 COS16 分配组**。

## 固定预算与时限

| 项目 | C15 固定值 |
| --- | --- |
| 账本 / case quote | 原 ledger `5.0.0` / `validation-case-quote-1`，无 `budgetGroup` |
| 声明 / 模型 | `validation-declaration-2` / `deepseek-flash` |
| 共享 / phase / 本案例实际新增硬帽 | ¥150 / ¥30 / ¥5 |
| 五项 allocation | planning ¥2、design ¥1.9、art ¥5.7、coding ¥7.6、repair ¥3.8，合计 ¥21 |
| 窗口 | 5400000ms，即 90 分钟；从原子 claim 至交付、正常停止与清理 |
| 请求 / repair / attempts / review 格式纠正 | 80 / 最多 1 / 2（独立 repair task）/ 1 |
| 声明输出上限 | planning 4096、design 16384、art/coding 65536、reviewer 16384；实际编码请求沿用现有已审较低策略 |

allocation 是角色准入容量，不是允许支出 ¥21。每次请求仍同时受共享、phase、C15 ¥5、角色 grant、请求数和 deadline 限制。原 direct probes 的保守 ¥0.721771 继续包含在共享累计中，不再另加或扣除。按当前基线，claim 后未分配为 36911425µ；若 C15 用满 ¥5，phase 累计为 21901000µ，仍小于 ¥30。原 parent ¥10、supplement ¥1.600314、组有效容量 ¥11.600314 与组已用 ¥9.892377 均保持。

`validationReservation` 对带图请求固定预留 `1000000*2 + 16384*8 = 2131072µ`，真实 host 最多提交八张截图。原组余量 ¥1.707937 不够；C14 coding grant ¥1.9 也不够。参考 C14 作者费 ¥0.792063 加首次截图 review 预留为 ¥2.923135，甚至超过旧组 coding cap ¥2.8。C15 的 coding ¥7.6 / case ¥5 能容纳这组参考费用，但不保证新作者或 repair 的成本相同；每次调用按实际剩余额度准入，不能删图、缩减 review 输出上限或低估预留。repair 与 review 共用 ¥5，没有额外额度；不足则停止并报告未完成阶段。

90 分钟只授权这个固定 C15：

- C14 claim 为 21:31:18.853 UTC，首段浏览器为 22:07:23.660，之前已用 2164807ms（36.08 分钟）；首段失败至最终结束又用 293947ms（4.90 分钟）。这两个区间不是纯 coding 和纯 cleanup 的分解。
- 将新样本首段 137.277s 暂作八段规划参考，八段约 18.30 分钟；与上述区间合计约 59.28 分钟，尚未给新独立 review 和新增媒体/交付工作留余量。该外推含首段固定开销，既不是每段预测，也不是上界；不能用 1.04 秒导航乘八。
- 选择 90 而非 60 分钟，给独立 review、媒体/交付与必要修复留约 30 分钟规划余量。实际 provider、完整八段及清理耗时仍未知，运行中没有自动延时。诊断 TEMP 准备 319s 不直接当作 C15 claim 后固定成本；所有 claim 后准备/等待仍计入 C15。
- 沿用 `/2` 的阶段 deadline、共享 cleanup 余量和取消传播，任何阶段都不能越过 C15 总 deadline。其他验证案例仍最大 45 分钟；正式 ¥200/12h、目标 ¥100/6h 保持。

## 源码边界与接线

### 1. ledger5 的窄准入

当前 `src/runtime/validation-window.ts:62` 拒绝 ledger5 上所有非 declaration-3；`validation-budget.ts:28` 又把 grouped 当前声明固定为 C14 supplement 的 target/grants。后者须保留：`prepareValidationBudgetGroup` 对非 grouped 原本立即返回 `undefined`。

新增一个仅识别完整固定 C15 的纯谓词，放在 `validation-validation.ts` 并供 window 使用。匹配 caseId、declaration-2、完整固定 limits、grants/output 策略、requirements 路径/版本/摘要、模板摘要；模板 files 继续经原声明校验。固定摘要由本卡新输入的实际 UTF-8 字节计算后写入源码，不能由 CLI、环境变量、模型或 receipt 自报。core 不导入 probes。

- `validateValidationDeclaration` 仅对该精确声明允许 5400000ms；使用 C15 ID 的变体拒绝，其他声明继续 2700000ms 上限。
- `eligible` 仅给精确 C15 例外，并要求 ledger5、上一当前案例为已停止且五 grants 已关闭的 C14。其余非 grouped ledger5 继续拒绝；C15 也不在旧账本版本获得例外。固定 entry 进一步认证下面的完整历史与文件来源。
- `claimValidationCase` 继续原子追加五 allocations / run.taskIds 与一个 case，使用 quote1，无新 delegation/supplement、不降账本版本。`requireBudgetGroupQuote` 对 C15 要求双方 `undefined`；伪造 group 一样拒绝。
- `validateValidationBudgetGroups` 继续只投影 declaration-3 历史，supplement validator 继续核原历史前缀；`verifyValidationBudgetSources` 在 prepare、claim、controller 每次身份检查/派发仍读取全部旧 delegation 与 supplement 实际源文件。不得因为当前 C15 非 grouped 跳过该调用。
- `budgetCapacity` 将 C15 五项完整计入共享 allocated；`validationBudgetGroup` 依 membership 排除 C15。`RunController.validationTaskAuthority` 沿用非 grouped 的共享/phase/case/role 交集，`reserveRequest` 仍先预留，结算不得超越事实。无需新 ledger 版本、第二组或 group guard 删除。

### 2. 当前输入与历史来源分开绑定

新增固定 `probes/transfer/requirements-case-fifteen.json`：从原 `requirements.json` 保留所有字段、中文和 preparation 内容，仅移除 `budgetGroup`；版本字符串保持 `cos16-transfer-v1`，不同路径和字节摘要识别当前副本。旧文件及 C1～C14 declaration 不变，模板清单保持。新 declaration 显式无 `budgetGroup`，与 `verifyValidationIdentity` 的非分组输入规则一致。

C5 历史 manifest 继续固定原 case/window/reviewedPlatformSha/frozenCaseInputHash、两个 passed/approved 阶段和七个 captures；由 `historical-passed-stages.ts` 读取原文件验证。C15 使用自己的 input hash 和当前 requirement capture，不能要求其 hash 等于 C5；须额外比较新输入除 `budgetGroup` 外与旧输入语义及 preparation 全等，证明验收未改变。`fixedTransferValidationInput` 只需将 TypeScript 的 `budgetGroup` 字段改为 optional，现有运行时等值检查保留。

### 3. 固定 C15 entry 与现有 driver

C6/C7 entry 不直接套用：它们要求 delegation 随案例增加、所有历史 quote2、新旧 input hash 相同、当前 quote 有 group，最终报告也强制当前 group。C14 的固定 entry 还只认证 closure19 前缀。

新增 C15 专属 declaration/entry/run/source/driver/task 文件。entry 只支持 `--validation-preflight <reviewed-main-sha>` 与 `--validation-case <reviewed-main-sha> <operator-validation-source>`，不接受案例、账本、模型、grant、时限、场景、角色或代码目录选择器。运行根固定 `.cosmos/e2e/cos20-transfer-validation-15`，账本仍 `.cosmos/validation-shared`；复用清单固定 `cos20-transfer-validation-15-reuse.json`。

entry 的首次 preflight 要求实际 22 stopped cases、14 旧 delegations、110 closures、20 audits、一次原 supplement、715 个已结算/取消历史请求、无 owner/registry writer/unknown/reserved，以及 current C14 已关闭。核对 C5 source pins、各旧声明（C14 quote3，其余各自历史格式）、operator/closure/supplement 源字节、真实 settled 费用、root、来源 ancestor 与已推送 main SHA；对每个历史任务保留原失败/通过状态。基线摘要覆盖全部旧 accounting 前缀与 supplement，不只看总金额。

当前 admission envelope 使用 `transfer-case-fifteen-admission/1`，覆盖 quote1、新五 grants、C5 manifest、完整历史 accounting 摘要、源码/dependency/template/worker 闭包和独审来源。当前 source approval 须包括 COS90/91、COS94～100 的已审源码，以及 COS101 自己；COS93 的实际诊断结果用于工程决定，不要求其生产游戏报告变成 passed。免费 preflight 不写文件、占 owner、claim、prepare host、创建 provider/session 或请求；失败前后 snapshot/输出根保持。

启动按已有固定入口生命周期执行：免费 host.prepare → 重验相同 quote → 保存精确 operator/admission 来源 → 原子 claim 一次 → 当前 controller/OwnedWork → 原生 host。当前新 case 不增加 delegation。`createFixedTransferCodingOnlyDriver`、`createFixedTransferCodingOnlyTasks`、`createTransferReusedConsumerHost`、原 orchestrator 和 promotion 直接复用；只通过 C15 固定 source/accounting 回调绑定。必要时复用 C7 已有 source closure / template / worker 校验并只加入字面量 `fifteen`，不把 C6/C7 entry 扩成通用多组框架。

只有新 coding/独立 coding reviewer，以及现有条件满足时的一次 coding repair 可发 SDK 请求；planning grant 仅用于可信 bootstrap，design/art grants 不产生新会话。repair 自动派发沿用 driver 当前 `code_defect` 条件；单纯 reviewer `changes_requested` 不承诺自动返工，须如实报告未批准。repair 不重置作者、请求计数、¥5 或 deadline。

### 4. 停止、恢复、关闭及报告

同一活动窗口冷恢复保留精确 quote/admission、operator 来源、C5 manifest、执行绑定、任务 journal、已用金额和 deadline；current case 变更、已停止、超时、未知费用、残留 owner 均拒绝恢复。恢复后 delegation 仍为 14，案例数为 23；不能通过重命名或重新 claim 续时。当前派发前须核旧预算源与当前 source/requirement/admission，旧 tasks 没有新派发权。

最终报告区分 `allocationSource: shared-unallocated`、当前 case 支出和只读旧组摘要。保留原 run/clock、完整历史前缀与 C14 failed；当前 promotion/capture/review、每阶段耗时、请求 reserve/settlement、cleanup 终点、具体 gap 单列。没有批准 candidate 时保存工程及可定位失败证据，不将 model 文本、build 或单次导航当完成。

正常 stop/drain 后关闭 controller，Root 独立 postcheck 确认无 live owner/process/port、全部费用确定后，另行 prepare/apply **C15 自己的新 closure**。沿用 ledger5 的 closure quote3，因为其 basis 必须保留旧 delegations/supplement；只追加 C15 的五关闭项和一次审计，释放 `21000000 - C15 settled` 到共享未分配容量，旧 group remaining 不变。closure20 保持原样；重放同一新决定只能幂等读回，其他重复关闭拒绝。

## 需要独立证明的实施检查

1. 精确 C15 可在 authentic ledger5 历史上 prepare/claim；改 ID、字段、预算源、90min+1、其他案例 45min+1、未知费用、stale quote 在副作用前拒绝。
2. 通过真实 `RunController` reserve/admit/settle 一次带图 reviewer：精确预留 2131072µ，C15 计费且旧组零变；余额差 1µ、request80 后再调、deadline 边界拒绝且 transport 调用数不增。
3. cold restore 后相同来源仍可继续；改旧 delegation source、supplement source、当前 source/输入/admission/C5 capture 在 provider/tool/child 派发前拒绝。证明没有“非分组跳过旧预算来源”的旁路。
4. stop 后无新派发，unknown 保留待对账；已停止 C15 不恢复；确定费用与 owner 释放后用原 API 成功 closure，reload 验证全部历史、supplement、group 和时钟，重放幂等。
5. SOURCE 免费集成以真实 host/factory/Pi、fake transport 证明新作者初始空目录、只复用 C5、当前 binding/独立 review 与精确 candidate promotion/报告；fake 证据清楚标为 fixture。compiled 检查捕获实际 JS 与 JS worker，不能用它代替 authentic 财务检查。
6. 新实际 C15 自己执行完整必要验收。C14 的历史 220/62 及 COS93 planned-stop 诊断都不计入新 candidate 的通过数。

## 审批与交付顺序

设计/spec/plan → 独立 reviewer → Root 批准源码实施 → 作者分支提交 exact SHA → reviewer 规格及质量审查 → 唯一 merger 集成、必要组合验证并推送 → Root 检查免费 preflight 与精确 quote → 单独批准一次有界付费启动。实现作者不访问凭据或真实账本写入口；实际 launcher、provider、closure 由后续审批控制。

本卡不包含新的 provider 授权。当前设计完成后只提交文档；执行步骤见 [计划](../plans/2026-10-16-cos101-transfer-case15.md)。
