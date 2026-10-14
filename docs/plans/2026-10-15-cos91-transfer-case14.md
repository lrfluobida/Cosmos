# COS91 补充分配后的固定迁移 C14 Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans / test-driven-development 逐项实施。专职作者 `cos91_implementer`；Root 指派独立 reviewer 和唯一 merger。先取得独立 PLAN_APPROVED，且 COS90 接口已独审稳定并由 Root 指定集成基线，才修改生产代码。

**Goal:** 准备独立固定 `cos20-transfer-validation-14`，在 COS90 的一次内部补充分配后，通过真实 ledger5 / quote3 准入运行时编码作者。

**Architecture:** 六个固定 C14 薄 wrapper 复用现有 entry/task/driver 与 C5 历史通过阶段。固定声明从已停止 C13 及其实际费用、closure 推导，允许在资金补充前存在；资金由 COS90 prepare/apply 单独处理，C14 正常预检再要求精确目标和向量的已应用补充及真实 quote3。旧声明、quote2、历史来源与费用保持原解释。

**Tech Stack:** TypeScript、Node 原生测试、RunController、SnapshotStore、既有 SOURCE/TEMP 存档、真实 host/factory/Pi 配合 fake provider transport；零付费、零网络。

**状态与基线：** plan awaiting independent review / production implementation not started。Issue [#92](https://github.com/lrfluobida/Cosmos/issues/92)，id5855021876，父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)，Root 已报告原生挂父，登记时 91 个子任务。依赖 COS88 #89、COS89 #90、COS90 #91；[任务卡](../specs/cos91-transfer-case14.md)。分支 `codex/cos91-transfer-case14`，managed worktree `E:/CodexData/.codex/worktrees/cos76-transfer-case8/Cosmos`，起点 main `3b2002ddd1541e20580e123ded819137dcc23e4c`。本次计划提交仅创建这两份文档，不更新共享 tracking。

计划首版 `2fd886bc1394c40606de0b7f3907ef9653bb1584` 独审提出 P1：递归旧历史推导最终进入 C7 的 ledger4-only guard，补充后的 genuine ledger5 无法推导。以下修订仅增加最小纯历史推导兼容方案和验证要求，等待独立复审；生产仍未开始。

## 固定契约

- C13 已 failed 并消费，不能重跑或延长；前缀为 21 stopped / 13 delegations / 105 closed grants / 19 closure audits。47 笔 admitted coding-author 请求全部 settled，共 1641136µ，unknown/reserved 为 0，无 repair。closure19 五角色实际释放合计 858864µ；新作者不使用 C13 会话、工作目录或源码，C13 实际为 0 源码文件。
- C14 固定 2500000µ / 2700000ms / 80 requests / 一次合格 coding repair、原两次 logical attempts。完整 taskId 为 `cos20-transfer-validation-14-<role>`；planning/design/art 各 1µ，coding 1900000µ，repair 599997µ。保持固定输入、输出 cap、验收范围与当前计划绑定，不开放金额、case、角色或来源的 CLI/模型选择。
- 原 COS16 parent allocation 10000000µ 与首个授权不变；补充前 committed/allocated 9100314µ、available 899686µ，不足 C14。COS90 仅在同一账本内准备并应用一次固定 1600314µ 补充，绑定 C14 和完整五角色向量，使有效组容量为 11600314µ、available 为 2500000µ。共享 150000000µ、phase 30000000µ、正式生成 ¥200/12h 与优化目标 ¥100/6h 保持。
- 上述费用、历史数量和余额是 Root 已核对的实际基线说明，生产运行仍必须核实际 snapshot、请求、原始回执字节和新 quote，不用文档数值代替准入，不硬编码历史费用为唯一合法费用。合成费用变体保持同一固定声明；其真实可用容量及是否准入按最终 COS90 契约计算。
- C5 两个 passed 阶段及七个 capture 只读复用，零 planner/design/art SDK。新的 coding author 工作副本必须为空并在运行时生成；原 C5 历史 origin 保留原任务/窗口，新的任务、需求、计划、候选、manifest、角色 grant 与 operator receipt 都准确绑定 C14。

## 依赖关口与两步引导

COS90 计划 exact `0bd6683fd7ec80405da6ebb143e6c4b05715a6c8` 已由 Root 报告独立 PLAN_APPROVED，见 `E:/CodexData/.codex/worktrees/cos74-frozen-template/Cosmos/docs/plans/2026-10-15-cos90-validation-group-supplement.md`。它定义 `RunController.prepareValidationGroupSupplement` / `applyValidationGroupSupplement`、ledger5 补充记录及 receipt、`validation-case-quote-3` / `vq3`、`validation-allocation-closure-quote-3` / `vacq3`。这只是已审设计，不能当成已审生产实现或复制正在修改的源码。

Root 随后转交 COS90 作者的稳定接口说明（首次 GREEN 3/3，尚非最终批准）：`src/runtime/validation-group-supplement.ts` 导出 `prepareValidationGroupSupplement(options: ValidationContextOptions): Promise<ValidationGroupSupplementQuote>` 和 `applyValidationGroupSupplement(options: ApplyValidationGroupSupplementOptions): Promise<ValidationGroupSupplementReceipt>`，并有 RunController 静态入口；类型位于 `validation-types.ts`。quote3 `budgetGroup` 保留旧字段并增加 `supplement: { decisionId: string; limitMicroCny: number }`，标准 limit 为11600314µ。已有 `src/runtime/validation-budget.ts` 的 `verifyValidationBudgetSources(root: string, state: RunSnapshot): Promise<void>` 验证全部 group 与 supplement 实际 receipt 字节。closurequote3 basis 包含 `allocationSupplements`；phase 明确检查 committed +2500000µ <=30000000µ。

实施前仍须取得 COS90 最终独审批准、Root 指定集成基线、reviewed/merge exact SHAs 和 `VALIDATION_GROUP_SUPPLEMENT_SOURCE_READY`，并核对上述导出。若最终接口影响本计划的安全边界，由原作者更新两份文档并补独审；不通过猜字段或增加旁路来适配。

引导顺序固定如下，均使用同一真实固定 D14：

1. `deriveTransferValidationCaseFourteenDeclaration(state)` 只验证真实停止历史、47 笔结算、五个 closure 与固定向量。**禁止复制 C13 函数末尾的 `prepareValidationBudgetGroup(state, declaration)` 可负担检查到 C14 推导。** 在 ledger4、未补充且 available899686µ 时，D14 仍可生成，不写状态、不创建窗口。
2. `fixedTransferValidationInput(D14).createTransferValidationIdentityReader({ repository, reviewedPlatformSha })` 是已有的固定 tracked requirements/template 身份读取入口；它不读预算。Root 使用该 reader 和真实 D14 调用 COS90 prepare、审查 quote，再显式 apply 独立 operator decision。不能为引导构造假 quote、fake identity、skip flag、特殊 C14 预算 bypass 或自动 supplement。
3. 补充已应用后，原 C14 `--validation-preflight` / `--validation-case` 走正常 entry 与 `prepareValidationCase`，生成 genuine quote3 并检查补充 target/vector、实际 source、容量、source approvals 和当前 snapshot。未补充、补充错目标/向量、过期或篡改 quote 均在 host/provider/发布前拒绝。

固定历史由 `transferCaseThirteenHistory(state)` 加上 `deriveTransferValidationCaseThirteenDeclaration(state)` 组成 13 个迁移声明；这条递归链会进入 `deriveTransferValidationCaseSevenDeclaration`。其 `validation-case-seven-declaration.ts:24` 目前只允许 ledger4，必须对纯推导作必要兼容：只将该 version guard 扩为 ledger4 或 ledger5，更新对应错误说明，其余历史费用、原 `COS16_GROUP_GRANTS`、10000000µ 原始角色向量与固定声明构造保持。C14 的 ledger5 推导边界先调用 `validateSnapshot(state)` 验证完整真实状态，再递归旧 helper；不得改写/克隆为 fake ledger4、删除 supplements，或用有效新容量重新分配旧 grants。

C7/C8/C9 已存在时，原 helper 的 group 检查走历史分支，不用新剩余容量生成旧 grant；C10/C11/C12/C13 已存在时，原 helper 也不会再为旧案例调用 `prepareValidationBudgetGroup` 申请容量。因此评估范围是 C7 的最小 version guard 兼容，无需复制旧声明链或抽象新框架。返回的 C1–C13 固定声明序列化字节、各历史 quote2、费用和审计必须与补充前一致；旧 entry 仍单独拒绝 ledger5，这个纯 helper 的返回值不授予旧案例执行或资金权限。另检查八个 native 与十三个 transfer 的全部历史、13 个 delegation 和 19 个原始 closure receipt，由现有 entry/validator 完成真实性验证。

推导核心沿用 C13 最小形状，仅改变固定新身份；旧 helper 的唯一必要生产调整是上述 C7 纯推导 version guard：

```typescript
const amounts = { planning: 1, design: 1, art: 1, coding: 1_900_000, repair: 599_997 };
const declaration = freeze<ValidationDeclaration>({ ...structuredClone(previous),
  caseId: 'cos20-transfer-validation-14',
  limits: { ...previous.limits, incrementalMicroCny: 2_500_000 },
  grants: Object.fromEntries(VALIDATION_ROLES.map(role => [role, {
    taskId: `cos20-transfer-validation-14-${role}`, amountMicroCny: amounts[role],
  }])) as ValidationDeclaration['grants'],
});
validateValidationDeclaration(declaration);
return declaration; // No affordability check here; normal quote3 admission follows funding.
```

在此之前精确检查唯一 stopped C13/no-repair/window/declaration，47 个唯一 request/entry 对应、coding role、author purpose、admittedAt、settled/zero unknown/reserved、有效费用证据，以及每个 grant 恰一个 closure、released = grant − role 实际 settled。缺失、重复、错 role/window/purpose、非安全费用、超过 grant 或释放漂移均拒绝。

## 文件结构与责任

| 路径 | 最小改动 |
| --- | --- |
| `probes/transfer/validation-case-fourteen-declaration.ts`（新） | 固定 D14、13 个历史声明和固定 parser；资金前可推导，不包含可负担检查。 |
| `probes/transfer/validation-case-fourteen-entry.ts`（新） | C14 manifest/admission/accounting wrappers，21 cases/19 audits；要求 ledger5、COS90 supplement 实际来源与目标/向量绑定。 |
| `probes/transfer/validation-case-fourteen-{driver,task,source,run}.ts`（四个新文件） | 沿原工厂连接真实运行、同窗口恢复、固定 source/compiled 闭包；run 沿原历史 source pins。 |
| `probes/transfer/validation-case-seven-declaration.ts` | 只扩纯历史推导的 ledger4/5 version guard 及对应错误说明；保留原角色向量、费用检查与返回固定契约。C14 ledger5 调用前验证完整 snapshot。 |
| `probes/transfer/validation-case-six-entry.ts` | 最小扩 C14 manifest、closure19 literal，以及固定配置显式选择 ledger5，缺省仍 ledger4。旧 C1–C13 历史 quote2 校验保持；resume 按当前 quote3 和原公式核 grant net。 |
| `probes/transfer/validation-case-seven-entry.ts` | 扩 21 cases/19 audits、C14 admission format/config 类型；在已有 requireAccounting/identity 链接入 COS90 已审 `verifyValidationBudgetSources(root, state)` 实际补充 source 守卫。 |
| `probes/transfer/validation-case-seven-source.ts` | 只扩 fourteen seed；闭包自然包含已审 COS89、COS90 执行依赖。 |
| `tests/transfer/validation-case-fourteen{,-runtime,-compiled}.test.ts`、`validation-case-fourteen.fixture.ts`（四个新文件） | 纯声明算术、认证 SOURCE finance、真实 host/factory/Pi fake、partial 冷恢复、compiled worker 与防漂移。 |
| `probes/transfer/README.md`、本计划、任务卡 | 追加固定 C14 使用顺序及原始免费证据/限制。 |

优先让新 fixture 复用旧夹具工具与 SOURCE history，不修改旧 C13 声明源码或旧测试断言。“旧声明保持”指返回的固定契约、序列化字节和持久历史保持；不排除上述必要的 C7 纯 helper version guard 调整。仅当确需共享测试 seam 才最小修改 `tests/transfer/validation-case-ten.fixture.ts`；实施时记录原因和旧代表结果。无需另建通用预算框架。共用 driver/task 若现有 requireAccounting 回调已覆盖则不改；实际缺口才补最小 hook 并记录受影响路径。COS90 的 ledger/type/validator 实现由其专职作者负责，COS91 不复制或重写。

旧 accounting hash 仍覆盖旧 cases/delegations/closures/audits/requests/entries；C14 admission 已绑定完整 quote3、snapshot revision/hash、角色 grant、manifest 和执行 source。补充记录与真实 receipt 字节由 COS90 已审守卫核对，不为了形式另加重复 hash。当前 request、tool 与 child dispatch 边界及 partial 冷恢复都必须重新验证实际来源，不只在首次 quote 验证。

partial 的原公式 `window.quote.budgetGroup.allocatedMicroCny + sum(current grants)` 保持。标准费用样本为 9100314 + 2500000 = 11600314µ；新 C14 测试不能沿用 C13 的 `<10000000` 断言。旧 C13 测试与历史预算含义保持。

## 源码审批与固定输入

继承原 entry 的全部 prerequisite/source markers，并新增 COS88 `TRANSFER_CASE_THIRTEEN_SOURCE_READY`、COS89 `AFFORDABLE_CODING_COMPACTION_SOURCE_READY`、COS90 `VALIDATION_GROUP_SUPPLEMENT_SOURCE_READY`。每项精确 reviewed/merge 都须为所选 clean pushed exact-main 的祖先，marker/集成状态唯一且正确。COS89 reviewed `b35124a8e48e532bda530607cfa04e25b3e1b57c`、merge `11c823a7fd1358cb570b1b80edd4b3300ee0115b` 已在当前 mapping；COS88 reviewed `0ef600389fb10990fad516e85b4389aa4fecbd42`、merge `9b8be0553c2c43b77ac0724b096d04185ab0cc5d`。

COS90 exact SHAs 待 Root 最终交接，禁止临时填实现分支 head 当批准。COS91 自身独审/合并后由 Root/唯一 merger 写 `TRANSFER_CASE_FOURTEEN_SOURCE_READY` 与 reviewed/merge 来源记录；仅计划批准、公开关闭或尚未合并均不能表示 C14 SOURCE_READY。Root 实际脚本另独审并核这些记录。

## SOURCE 证据复用与恢复

采用已评估存档 `C:/Users/26557/AppData/Local/Temp/cosmos-transfer-entry-T81i3U/.cosmos/SOURCE-C13-proof-6daadf13-4334-44c6-b00b-006f3116c153`。history-1/2 都为 ledger4/snapshot3/revision928、20 stopped / 12 delegations / 100 closures / 18 audits，含 52 笔 C12 admitted rows、无 C13，unknown/reserved 为 0；C12 合成费用分别 1664926µ / 1100000µ。result 只有一笔 C13 mock、没有 closure19，**不得作为 C14 的资金基线**。

从未改的 history-1 前缀用原 prepare/claim、RunController reserve/admit/settle/stop/closure API 追加 47 笔 C13 合成请求和 closure19，得到 21/13/105/19。标准 C13 费用为 1641136µ；第二个独立视图从同一未改前缀出发改变 C13 合成费用，重新走实际 API closure 和 COS90 prepare/apply。两视图固定 D14 相等，费用/容量差异遵循 COS90 最终契约；不伪造 ledger5 字段或 receipt，不能将算术 fixture 称作认证财务证据。

用最终已审 COS90 原 API 在 TEMP 应用精确一次 supplement，检查父 allocation 与历史前缀不变、effective group capacity 和 shared allocated 恰增加 1600314µ，再进行真实 C14 preflight/claim。finance 证明来自此认证 SOURCE；compiled 简化窗口只证明 JavaScript source/worker 选择与防漂移，不能充当 ledger5 资金授权证明。

finally 关闭本夹具全部 controller/owner/locks，恢复原 snapshot/mapping/已有 fixture 文件字节、mtime、原缺失目录状态与 owner 状态；保留新 SOURCE history/result/receipt 归档和恢复清单。C5 两阶段七 capture、旧 proof 均只读；不重跑旧长 seed，不访问真实 `.cosmos`、会话、key 或参考安装，不把 keys 写入任何输出。来源或恢复前提不符时报告实际差异，不自动重建旧基线。

## 实施步骤与免费验证

### Task 1：依赖交接和 RED

- [ ] Root 指定独立 reviewer 对本 plan/card exact SHA 作规格→架构审查；PLAN_APPROVED 后继续等待 COS90 最终接口和 Root 指定已审集成基线。
- [ ] 在作者分支合入 Root 指定基线，核 clean status、COS90 reviewed/merge/marker，重读已审接口。仅补受接口变动影响的计划内容和独审，不复制未审源。
- [ ] 新 `validation-case-fourteen.fixture.ts` 添加纯算术数据；新增单元动态 API 断言，先运行下方 C14 unit 命令，记录缺 C14 API 的实际 RED（exit1），排除 import/环境设置错误。
- [ ] RED 具体行为：47 笔历史/五 closure 校验、固定向量/旧返回契约不变、ledger4 未补充仍可 derive D14 与真实固定 identity、但正常预检零 host/provider/写入拒绝；补充后的真实 ledger5 递归推导应通过，旧 C7 guard 尚未兼容时记录实际失败。

### Task 2：最小 wrapper 与版本选择

- [ ] 实现六个 C14 wrapper、必要字面量与显式 ledger5 配置；仅扩 C7 纯 helper guard，C14 ledger5 递归前执行完整 `validateSnapshot`。运行 unit 至 GREEN。旧无配置和 C7–C13 entry 配置仍要求 ledger4，历史 quote2 loop 不放宽；新当前 C14 必须 genuine quote3。
- [ ] 通过真实 COS90 apply 取得 genuine ledger5 后，断言 `deepEqual(D14_before, D14_after)` 及全部 C1–C13 历史声明序列化字节相等、原 parent/grants/quote2 历史不变；正常 C14 entry/driver/task 均可重新推导。错误 ledger5 supplement/receipt 状态在完整验证时拒绝，不以伪装 ledger4 规避。
- [ ] 使用已审 COS90 verifier 核 supplement actual source、target/vector、parent/首授权与 quote3；在 provider/tool/child 前保持原 guard。补充前 declaration/identity 成功不得创建 quote3/window 或触发自动资金操作。
- [ ] 单元反例覆盖 request 数量/重复/费用/证据/role/purpose/window/repair/closure、unknown/reserved、错误 parent、CLI 额外预算/案例参数、admission format/vector/source/hash 漂移；新增旧 C7/C13 entry 对 genuine ledger5 的零写入拒绝与旧 quote2 保持检查，受影响旧 C7 短代表及 C13 五项短代表通过后提交生产与单元变更。

### Task 3：认证 SOURCE 与恢复

- [ ] 新 fixture 只读验证并复用上述 history 前缀，通过原 API 追加两套 C13/closure19/COS90 supplement；逐项保存历史未改证据、补充前后组容量/shared allocation、原始 receipt 与 query 输出。
- [ ] SOURCE 负例：未补充、补充/当前 quote revision 或 snapshot stale、金额/target/vector/source receipt 篡改、marker缺失、reviewed/merge非祖先、C5 manifest/capture/current plan 或执行 source 漂移、unknown/reserved/owner/root异常，均零 host/provider/发布/新增写入；分别恢复原夹具字节和 mtime。
- [ ] 以真实当前 host/factory/Pi + fake provider transport 执行一个 C14 coding request，核空作者、C5两阶段七capture、零 planning/design/art SDK、准确当前角色/计划/quote3/grant、原 source/fees 前缀和源字节守卫。fake 内容不作为实际游戏证据。
- [ ] 同窗口 partial 停止/关闭 owner 后冷恢复，重新读取 genuine ledger5 并实际执行 C14 历史声明/driver/task 推导，验证 D14 与补充前 deepEqual、原截止、需求/当前绑定、supplement/actual receipt 和 partial 11600314µ 标准公式；篡改 quote allocated 拒绝。保存 finally 恢复原 bytes/mtime/dirs/owner 的独立核对，再提交 SOURCE 测试。

### Task 4：compiled、文档与作者交付

- [ ] 新 compiled 测试构建完整 C14 JS 闭包，确认 JS worker；unknown admission 零写入，修改 compiled task/source 后零派发。标明简化窗口不验证资金准入。
- [ ] 执行 typecheck/build/affected strict、旧 C13 短代表及 diffcheck；UTF-8 严格解码新改文本并回读中文。只因实际代码、依赖、环境或失败差异补验证，不重做旧长矩阵或 COS89基准。
- [ ] README 记录“真实 D14身份→Root 独立 supplement quote/apply→正常 C14预检/运行”，保存 raw RED/GREEN、SOURCE/compiled 的实际数量/时间/恢复证据和已知限制；作者提交 exact SHA，交独立 reviewer 实际 diff 规格→质量审查。作者修 actionable findings，reviewer 重审受影响变更；作者不合 main、不 push。

```powershell
node --experimental-strip-types --test tests/transfer/validation-case-fourteen.test.ts
node --experimental-strip-types --test --test-name-pattern='C7 (declaration|parser|admission|readonly entry)' tests/transfer/validation-case-seven.test.ts
node --experimental-strip-types --test --test-name-pattern='C13 (fixes|rejects|uses|fixed parser|unknown admission)' tests/transfer/validation-case-thirteen.test.ts
node --experimental-strip-types --test tests/transfer/validation-case-fourteen-runtime.test.ts
node --experimental-strip-types --test tests/transfer/validation-case-fourteen-compiled.test.ts
npm run typecheck
npm run build
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions --allowJs --checkJs false probes/transfer/validation-case-fourteen-run.ts tests/transfer/validation-case-fourteen.test.ts tests/transfer/validation-case-fourteen-runtime.test.ts tests/transfer/validation-case-fourteen-compiled.test.ts tests/transfer/validation-case-thirteen-runtime.test.ts
git diff --check
```

有效 RED 预期因缺新 API 或 C7 ledger4-only guard 退出1；GREEN/最终检查预期退出0，旧 C7 pattern 命中五项、C13 pattern 命中五项，测试计数/skip/时长按 raw 记载。计划本轮只检两份文档的 UTF-8、中文回读、diffcheck，不运行无源码变化的测试。

## 集成与实际运行边界

唯一 merger 核批准 exact SHAs、组合已审 COS90/COS91、执行受影响集成验证并记录结果后，Root 更新 shared tracking 与 own SOURCE_READY。Root 才负责真实 supplement quote 的独审/显式 apply、免费预检、独立审查的一次性操作脚本及一次 C14 有界运行；没有自动加钱、重试、续跑 C13 或开启第二个 C14。

本任务作者只做免费 source/TEMP；实际付费、窗口、supplement apply、游戏生成、正式 build/browser/review/repair/accepted 与 human 均尚未发生。实际运行另记时间、费用、作者文件、自检、handoff/capture、正式验收与清理。SOURCE_READY 或 synthetic 成功不能表示 Cosmos 已生成目标游戏，COS16/COS18、完整经典与 human 仍未完成。
