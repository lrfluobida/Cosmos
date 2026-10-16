# COS101 第十五迁移案例实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在原共享 ledger5 上接通固定非分组 C15，让新的运行时 coding 产物可完成完整 native、媒体、独立截图评审与精确交付。

**Architecture:** 仅给完整固定 C15 增加 declaration-2/90 分钟准入例外，复用原账本、controller、closure 与历史 group/supplement 核验。C15 固定入口独立认证 closure20 后历史；driver/task/真实 host/orchestrator/promotion 复用现有实现，C5 design/art 保留原来源。

**Tech Stack:** TypeScript、Node 22、node:test、现有 Pi/provider、Playwright、SnapshotStore/RunController；不增加依赖。

---

设计见 [spec](../specs/cos101-transfer-case15.md)。本计划只供设计独审；源码实施和单次付费运行分别等待 Root 批准。采用专属 implementer、独立 reviewer、唯一 merger；常规工程选择不再重复询问用户。全部文本先 strict UTF-8 检查，最小 patch，保留旧中文、换行与已审历史。

## 文件与任务边界

| 文件 | 职责 |
| --- | --- |
| `src/runtime/validation-validation.ts` | 固定 C15 纯匹配谓词与精确 90min 例外；原 reserve 公式不改 |
| `src/runtime/validation-window.ts` | ledger5 只开放该 C15，要求前窗 C14 stopped/closed |
| `probes/transfer/requirements-case-fifteen.json` | 原固定需求移除 budgetGroup 的新副本 |
| `probes/transfer/validation-input.ts` | `budgetGroup` 类型 optional，运行时原检查保留 |
| `probes/transfer/validation-case-fifteen-{declaration,entry,run,source,driver,task}.ts` | 固定声明、账本历史准入、CLI、实际源码身份与现有 coding 接线 |
| `probes/transfer/validation-case-seven-source.ts` | 已有源码闭包函数的字面量类型加入 `fifteen` |
| `tests/runtime/validation-case-fifteen-budget.test.ts` | authentic ledger5 下 claim、请求、restore、停止和 closure |
| `tests/transfer/validation-case-fifteen.test.ts`、`validation-case-fifteen.fixture.ts`、`validation-case-fifteen-runtime.test.ts`、`validation-case-fifteen-compiled.test.ts` | entry/driver SOURCE 与 compiled 代表 |
| 本 spec/plan；`docs/specs/cosmos-issues.md`、`github-issues.json` | 结果与 exact SHA；公共映射由 Root/merger 发布后登记 |

预计无需修改 `validation-budget.ts`、`validation-allocations.ts`、ledger schema、`RunController`、native host 或生产验收策略。若必要测试揭示真实阻碍，先记录具体失败和最小差异交 reviewer/Root 决定；不为了让 C15 通过而放宽旧组、时限或证据规则。

## Task A：固定输入、声明与 ledger5 准入

**Files:** 前四项生产/输入文件、新 declaration；`tests/runtime/validation-case-fifteen-budget.test.ts`、`tests/transfer/validation-case-fifteen.test.ts`。

- [ ] 确认基线/main 已解除冻结、专属 managed worktree clean；记录源码基线。读取 spec 的预算计算和 C14→C15 窗口规则，不重新跑已通过导航诊断。
- [ ] 建新需求副本并删除唯一 `budgetGroup` 属性；逐字段深比较剩余内容与原文件，确认全部中文和 preparation 不变。计算新 UTF-8 摘要，保留原 template files/摘要和 requirementVersion。
- [ ] 定义固定 declaration：ID `cos20-transfer-validation-15`、format2、无 group、固定五 grants 2000000/1900000/5700000/7600000/3800000、case5000000/phase30000000/shared150000000、duration5400000、80请求、repair1/attempts2/corrections1、原 outputTokens。
- [ ] 添加有效 RED：原 ledger5 拒绝该非分组声明；原 declaration 校验拒绝 90min。用 API 建成的真实格式 ledger5 fixture，拒绝把手填 `any` 财务对象作为准入成功证据。
- [ ] 在 `validation-validation.ts` 实现单一 `isFixedTransferCaseFifteenDeclaration` 纯谓词；固定身份/limits/输入摘要及既有完整 grants/output 契约全部匹配后才返回 true，C15 ID 变体直接拒绝。`eligible` 使用相同谓词，并限定 ledger5、current C14 stopped、五 grants closed；其他路径保持。
- [ ] 运行两项新测试，预期 C15 quote1/claim 成功；旧声明保持 45min、旧 C14 quote3 与 supplement vector 保持。负例覆盖改 ID/group/输入摘要/模板/90min+1、C15 在 ledger4、其他 decl2 ledger5、其他案例45min+1、duplicate/stale/unknown，零新写入与零 dispatch。
- [ ] 检查 claim 后仅新增五 allocations/run.taskIds 与一个 case/事件/revision：ledger5 不变，delegations14/supplement1/旧 closures110/audits20/旧请求715 保持；五 grants 共 ¥21 只降低 shared unallocated，旧 group capacity 与 spent 不变。
- [ ] 提交 Task A；记录 exact SHA、RED/GREEN 与输入摘要给独审。runtime 例外不得依赖 probes import，不能接受用户提供时限或新 budget source。

## Task B：独立固定入口与复用接线

**Files:** 六个 C15 probes、新测试 fixture；修改 `validation-case-seven-source.ts` 字面量类型。

- [ ] 写 entry 负例：直接复用 C6/C7 会因 group/delegation/input hash/quote 格式硬耦合拒绝；新 entry 应认证 22cases/14delegations/110closures/20audits/一次 supplement 的实际源文件前缀。
- [ ] 新 C15 entry 逐项保留 C6 生命周期中的源码 ancestor、pushed main、独审 mapping、历史 roots/owner、精确 operator/admission、host.prepare 前后基线不变、原子 claim/Consumed identity、OwnedWork/stop/drain 与 final result 检查。只替换本 spec 明确的历史与非分组假设；不提取新的通用多组入口。
- [ ] 固定 C5 manifest 路径并认证原 pins、两 passed/approved 阶段和七 captures；用 C5 自己的 input hash 验证历史，用 C15 hash 验证当前。比较新旧需求除 group 外完全一致。注入 C14 source/candidate 作为 author input 必须失败。
- [ ] 实现 C15 admission envelope，覆盖 quote/grants/C5 manifest/source approvals/execution closure/历史 accounting 摘要；沿现有 envelope 格式存储，固定 `transfer-case-fifteen-admission/1`。旧 supplement/delegation/20 closure 源每次在身份检查与派发前重读。
- [ ] C15 source 函数复用 `captureFixedTransferCodingSource`/`requireFixedTransferCodingSource`，只增加 `fifteen` 字面量；覆盖 run/driver/task 与动态 worker，source/compiled 对应 .ts/.js。复用现有四项文件并发核验，不另造缓存或新身份体系。
- [ ] C15 task 调用 `createFixedTransferCodingOnlyTasks(D15, manifest)`；driver 调用 `createFixedTransferCodingOnlyDriver`，提供当前固定来源核验和 .ts/.js worker URL。生成仍经真实 host/factory/Pi/orchestrator/promotion；作者环境先为空。
- [ ] preflight 正例不创建 provider/session/owner/output root、不 claim、不写 ledger；拒绝路径 snapshot 与历史证据零变化。启动只发新 coding/reviewer 和符合既有 code_defect 条件的一次 repair；planner/design/art SDK 计数为0。
- [ ] 同窗口冷恢复正例保留 deadline/费用/quote/current capture/journal，案例23且delegations14。停止、失效来源、未知费、残留 owner 与不同窗口负例在 dispatch 前拒绝。
- [ ] 最终 result 记录 `allocationSource: shared-unallocated`、新 case 与 shared/phase 费用、旧 group 只读摘要、所有阶段结果/耗时、精确 accepted、cleanup 终点与 gap；保留 `userExperience:not_confirmed`。无 approved candidate 或清理未完成时 outcome failed。
- [ ] 提交 Task B，独立 reviewer 先核规格再核实际 diff；作者修 actionable finding，复审受影响变化。

## Task C：一次集中的免费证据与集成

**Files:** 新 budget/unit/runtime/compiled 测试；仅确有新增必要断言时修改既有测试。

- [ ] 复用已验证的 SOURCE API 历史与有效源文件；在独立 TEMP 副本追加 synthetic C14 settled 请求、stop/closure20，形成可完整 `validateSnapshot` 的 ledger5 fixture。只补缺少的 suffix，不重复长 C1～C13 seed。若已存 SOURCE 具备此 suffix，先核出处后直接复用。真实 `.cosmos/validation-shared`、C14 原 artifacts 和密钥不进入实现测试写范围。
- [ ] 通过真实 `RunController` register/reserve/admit/settle 带图 reviewer，断言 reservation2131072µ、case/task/shared 正确、旧组不增。作者参考792063µ时首次review可准入；case余额比2131072少1µ时拒绝。另覆盖 role/case/phase/shared/request80/deadline 真实拒绝，不使用绕过 provider admission 的直接数组修改伪造成功。
- [ ] 当前 controller 的 provider、tool、owned child 三类入口各取代表：篡改旧 delegation source 或 supplement source、当前 admission/源码、C5 capture/新需求后，无新 transport/child/write。身份检查不得因当前声明非 grouped 而跳过旧财务来源。
- [ ] 释放 owner 后同一未停止活动窗口的冷恢复正例验证 deadline 不重置。stop 负例保留 admitted unknown 预留且拒绝再发；先按原对账 API 结算，再由原 closure API 仅关闭 C15 五 grants。验证 quote3、release21000000-minus-spent、shared capacity 变化、group不变、reload通过、原closure20不变、新decision幂等与另一decision重复拒绝。
- [ ] 一次 SOURCE 正向链使用真实 host/factory/Pi 与 fake transport：复用 C5、空 coding workspace、当前 capture/正式build/完整消费 fixture、独立 reviewer image request、approved promotion、host/result 和正常停止。主机 synthetic 运行证据写明 fixture；不据此声称真实 C15 已通过。
- [ ] 加一个必要失败链：正式 build/consumer/review 失败时无 accepted，停止和工程差距仍保存。复用旧无变化 repair 规则证据，仅补 C15 identity/grant 绑定代表。
- [ ] compiled 代表验证实际 JS 闭包、JS worker、源码漂移拒绝；财务成功证据来自上述 authentic SOURCE。所有 TEMP 清理验证 resolved 路径位于专用目录，读回中文与源文件，保留 raw TAP/退出码。
- [ ] 顺序运行以下命令，各退出0且零 skip；失败时修具体原因，不扩为全库重复矩阵：

```powershell
npm run typecheck
npm run build
node --experimental-strip-types --test tests/runtime/validation-case-fifteen-budget.test.ts tests/transfer/validation-case-fifteen.test.ts
node --experimental-strip-types --test tests/transfer/validation-case-fifteen-runtime.test.ts
node --experimental-strip-types --test tests/transfer/validation-case-fifteen-compiled.test.ts
```

- [ ] 从 `tests/runtime/validation-window.test.ts` 与旧 C14 unit 选 ledger5 grouped/supplement/旧45min 受影响代表，使用 `--test-name-pattern` 写下实际测试名与命令；不重复旧导航、220步/62字段或长 seed。补新文件严格类型检查使用现有项目约定，保存 exact 命令。
- [ ] 作者提交 exact SHA 和证据；独立 reviewer 检查实际 diff，重点看预算来源、完整 fixed predicate、冷恢复与closure、C5/C15 hash 分离和旧源码保持。唯一 merger 合入 approved SHA，核组合 typecheck/build及一条 authentic 预算和一条 entry短代表，记录源码标记 `TRANSFER_CASE_FIFTEEN_SOURCE_READY`。已过且字节/环境/输入无 delta 的检查复用。

## Task D：Root 后续单次实际运行（独立授权）

本节是源码集成后的操作清单；不随本计划提交、源码审批或免费测试自动获得付费许可。

- [ ] Root 完成 GitHub COS16 子任务登记、源码独审信息、C15 C5复用 manifest 和精确已推送 main SHA。只读 preflight 使用新固定 entry：

```powershell
node --experimental-strip-types probes/transfer/validation-case-fifteen-run.ts --validation-preflight <reviewed-main-sha>
```

- [ ] Root 与独立 reviewer 检查实际 ledger 基线、shared 未分配至少¥21、phase可覆盖¥5、prior¥0.721771包含、旧group/supplement/closure保持、输入/源码身份、quote1与90min、图片review预留以及无 owner/unknown。费用/来源/基线漂移须重新报价，不读取或输出凭据。
- [ ] Root 另行批准一次精确 quote 的 paid launcher，固定 operator source，启动：

```powershell
node --experimental-strip-types probes/transfer/validation-case-fifteen-run.ts --validation-case <reviewed-main-sha> <operator-validation-source>
```

- [ ] 记录 claim、首/末作者请求、自检、capture、正式build、八段native、媒体、截图review、promotion、report、stop/drain/controller close 的实际时间。完成原固定8段/220步与完整62字段，不复用C14 candidate的通过计数；核新视频完整解码、精确candidate的启动和退出清理。
- [ ] 新 candidate 经独立 review approved 后才允许 promotion；报告正常交付位置和具体证据。遇到费用/时限/验收/未知费边界即停止，保留当前工程，不自动重试、换case、缩小检查或延长窗口。
- [ ] 独立 postcheck 确认无关联进程/端口/owner残留，费用确定、历史保持后，由 Root 单独处理 C15 新 closure quote/apply；原 closure20 和旧 C14 结论保持。记录实际请求、settled/reserved/unknown、case/shared/phase和group隔离、释放额度及cleanup终点。
- [ ] 将本次真实结果与源码状态分别写入任务、研究记录和公开结果。即使 C15 passed，COS18 human 端到端与最终体验仍是单独后续步骤，不能写成正式¥200生成或完整经典游戏已通过。

## 本轮设计交付记录

本轮仅新增本计划与 spec，没有生产源码、测试执行、真实账本写入、provider 或付费运行。设计的独立审查尤其需要确认：90min 的窄授权、¥21分配/¥5支出的区别、ledger5历史来源仍逐次核验、非分组closure对group零影响，以及真实独立截图review与完整验收不会被历史证据替代。
