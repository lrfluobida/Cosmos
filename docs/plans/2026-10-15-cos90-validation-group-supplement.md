# COS90 验证预算组补充分配 Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans / test-driven-development 逐项实施。作者 `cos90_implementer`；Root 指派独立 reviewer 和唯一 merger。先取得独立 PLAN_APPROVED，再修改生产代码。

**Goal:** 在同一 ¥150 验证账本内，为原 COS16 预算组准备一次固定 1600314µ 的内部补充分配，使下一固定 C14 的 2500000µ 向量具有明确资金来源。

**Architecture:** 新增 ledger5 补充分配记录及同一 snapshot 中的 operator receipt；以独立 prepare/apply API、现有 SnapshotStore 排他原子提交。原 COS16 allocation 行和首个授权保持；共享容量只计入一次新增组容量，旧报价及 closure 按历史 revision 投影，不用当前补充额度改写历史解释。

**Tech Stack:** TypeScript、Node 原生测试、既有 RunController / SnapshotStore；TEMP 合成历史、fake provider、零网络。

**状态与基线：** plan awaiting independent review。Issue [#91](https://github.com/lrfluobida/Cosmos/issues/91)，id5854823746，父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)。分支 `codex/cos90-validation-group-supplement`，managed worktree `E:/CodexData/.codex/worktrees/cos74-frozen-template/Cosmos`，起点 main `3b2002ddd1541e20580e123ded819137dcc23e4c`。计划提交只创建本计划和 [任务卡](../specs/cos90-validation-group-supplement.md)。

## 固定契约与授权

- C13 已 failed 并消费，closure19 已完成；21 stopped / 13 delegations / 105 closed grants / 19 audits，unknown/reserved 为 0。共享已结算 16108937µ；原组 committed/allocated 为 9100314µ、可分配 899686µ。下个 `cos20-transfer-validation-14` 固定 planning/design/art 各 1µ、coding 1900000µ、repair 599997µ，合计 2500000µ；补充缺口为 1600314µ。
- Root 在当前主线只读核对 revision2965、snapshot SHA256 `f16d9740ea6ca8fb08b977892f254fb195c01ee8675c0de8e2cdc7d0a7cdd251`：共享 allocated90488261µ、真正 unallocated59511739µ、phase remaining13891063µ。此为 Root 报告的当前事实，不能代替 quote/apply 时重新读取与验证；作者不读取真实账本。
- ¥150 shared、¥30 phase 与正式生成 ¥200/12h 保持。原 COS16 的 ¥10 是内部 allocation；ADR0001 允许既有用户授权内的真实 operator 决定。本 API 不创建人类确认、正式生成 continuation、新预算组或执行窗口；不自动追加资金，不重跑 C13。
- `COS16_GROUP_GRANTS` 是单个案例五角色上限，不增加累计角色寿命上限。旧 grant 和 closure 不重开：coding 资金见证 258864µ（C13 已关闭未用额）+40822µ（此前组未分配）+1600314µ（补充）=1900000µ；repair599997µ 与三个 1µ 同属新案例独立 grant。

## 最小数据与版本设计

1. `BudgetLedger.contractVersion = '5.0.0'` 只用于已认证的 validation COS16 组。新增 `allocationSupplements`，本契约精确一条，记录原 parentTaskId、首个 authorizationDecisionId、独立 decisionId、固定 targetCaseId、1600314µ、完整五角色 taskId/amount 向量及补充前 revision。原 allocations、entries、delegations、closures 及 ledger limit 不改。
2. `RunSnapshot` 保持 formatVersion3；新增 `allocationSupplementDecisions`，精确对应上述记录，含 appliedAt、完整 quote、operatorDecision/sourceSha256；新增一个 `validation_group_supplemented` event。新 snapshot 必须使记录、回执、事件和历史逐项相符；旧 ledger1..4 禁止携带新字段。
3. 新 `ValidationGroupSupplementQuote` 为 `validation-group-supplement-quote-1`、`activationAllowed:false`，hash 绑定全部 payload：identity、run/ledger/spec、revision、snapshot SHA、原始 clocks/limit、原父 allocation 索引/字节摘要/来源、首个授权、原 group capacity、真正共享 unallocated、phase committed、完整历史 allocations/entries/requests/delegations/closures、固定下一 case/vector/金额。独立 operator receipt 为 `operator-validation-group-supplement-decision-1`，准确授权完整 quote；决定 ID 不与 case/closure/其他补充分配重用。
4. 组上限 = 原10000000µ + 已认证补充1600314µ；group allocated/committed 公式沿用。共享 allocated = 旧公式 + supplement总额，避免随新 case grants 或后续 closure 重复计算或消失。共享 effective limit 保持150000000µ；只允许 actual unallocated >=1600314µ，不能用 unspent 代替。
5. 下一案例保留 declaration3 的原 parent10000000µ 身份；新 `validation-case-quote-3` / `vq3` 的 budgetGroup 绑定补充分配 decisionId 与有效组上限。只有准确 C14/vector 可以使用新增容量；其他 target、向量或已消费案例拒绝。旧 case-quote1/2 按补充前 ledger1..4 投影，保持原10m语义；新的 history 不能让旧报价获得新容量。
6. ledger5 生成 `validation-allocation-closure-quote-3` / `vacq3`，basis 明确包含该时点的 supplements；冷恢复按 quote revision 选择旧 ledger3/4 或 ledger5 与 supplements 前缀。旧 closure quote1/2 原容量、原 allocatedAfter 和字节含义不变；未来 C14 closure 保留组补充与共享分配记录。

## API 与守卫

新增 `prepareValidationGroupSupplement(options)` / `applyValidationGroupSupplement({ ...options, quote, decision })`，经 RunController 静态入口暴露，固定策略常量保存在新模块，不提供 CLI/模型可改金额或目标的接口。prepare 只读，不获取 controller、不创建窗口；apply 使用 SnapshotStore.acquire 与一次 write，失败不写 snapshot。

prepare/apply 都要求已存在 ledger4 的原组、所有案例显式 stopped、所有历史 grant 已关闭、所有任务/attempt 非 running、全部 entries settled/cancelled 且 zero reserved/unknown、无 charge_overrun。检查共享 root 和 repository 派生的每个 `.cosmos/e2e/<caseId>` root 无 owner/registry writer/未清子工作；缺失或不明状态拒绝。apply 自己持有的共享 store lock 仅作排他，不当作其他 owner。

复用可信 identityReader 绑定当前 reviewed platform 与 frozen input，重新读取原 operator case/closure 来源和新 receipt 字节；不增加 COS91 的 source gating wrappers。apply 持锁比较 revision/SHA，重算 fresh quote，写前复核 source/identity/idle。相同 decision/quote/source 重试返回既有 receipt，revision/allocated 不增加；冲突、第二次补充、stale quote、容量不足、来源改变或未对账均拒绝。相同决定历史重试仍须验证记录与实际来源，不能成为另一笔分配。

## 文件范围与职责

| 路径 | 最小职责 |
| --- | --- |
| `src/contracts/{types,structure,budget,validation,updates}.ts` | ledger5、固定单次 supplement 结构/守卫/append-only 与4→5显式升级；容量恰计一次；旧版本维持。 |
| `src/runtime/validation-group-supplement.ts`（新） | 固定 policy、quote/apply、真实来源与 idle 核对、atomic persistence。 |
| `src/runtime/validation-group-supplement-validation.ts`（新） | 结构、记录/回执/event 一一对应与历史 basis 校验，供冷恢复及历史投影复用。 |
| `src/runtime/{validation-types,run-types,run-validation,run}.ts` | 明确类型、receipt/event、校验调用、静态入口及ledger5 dispatch 身份守卫。 |
| `src/runtime/{validation-budget,validation-validation,validation-window}.ts` | 有效组容量、新 case quote3 的固定 target/vector 绑定；按 revision 重建旧预算组；实际补充回执字节在 provider/tool/child dispatch 前复核。 |
| `src/runtime/{validation-allocations,validation-allocation-validation}.ts` | ledger5 closure quote3 与历史 supplements projection；保持旧 closure 原解释。 |
| `tests/runtime/validation-group-supplement.test.ts`、`tests/runtime/validation-group-supplement.fixture.ts`（新）；`tests/budget/validation-group.test.ts` | TEMP 原 API 建史、quote/apply/controller/store 正反例与精确容量测试。仅必要时最小扩既有 group fixture。 |
| 本计划、`docs/specs/cos90-validation-group-supplement.md` | 方案、原始 RED/GREEN、最终 SHA 和证据边界；共享 tracking 由 Root/merger 更新。 |

不修改 transfer C14 wrapper、历史固定声明、来源/当前候选准备、游戏资产、真实 `.cosmos`、GitHub 或 shared tracking。COS91 承接 C14 固定入口与实际来源绑定。

## 实施与免费验收

- [ ] 独立 reviewer 审查本 plan/card exact SHA；收到 Root PLAN_APPROVED 后才开始生产代码。
- [ ] RED：通过既有 groupFixture / RunController claim/reserve/admit/settle/stop/closure API 在 TEMP 建立可恢复的 ledger4。多次独立 group grants 合成累计9100314µ，全部关闭得899686µ；不手工伪造收费或历史。新测试调用缺失静态 API，记录实际 assertion failure。
- [ ] GREEN：实现固定 supplement quote/apply 与 ledger5，验证补充前/后 shared allocated 恰增加1600314µ、effective limit/settled不变、group available变2500000µ；原parent行10m及历史 prefixes逐项深相等。重复同决定零写入、并发竞争最多一笔、冲突/第二笔拒绝。
- [ ] 绑定负例：逐项变更 case、1600314µ、五角色任一 taskId/amount、first authorization、parent source、revision/SHA、identity/operator源；真unallocated不足但unspent充足、unknown/reserved、running、owner/writer/缺root、未关闭或overrun均拒绝，检查snapshot字节不变。所有 fake provider/network计数为0。
- [ ] 新版本闭环：新 C14 仅用测试 declaration3（无正式 wrapper）claim精确向量，原 RunController reserve/admit/settle、可信host/tool/child边界拒绝源漂移；stop/close后ledger5 closure3成功。冷读 validateSnapshot 与 accounting reopen保留原时钟/历史/补充来源，oldclosure1/2仍通过；篡改或去掉回执、重复记录、伪造event拒绝。
- [ ] 旧版本与集成：受影响 budget/group/allocations/window/routing 用例、typecheck/build/affected strict、UTF8/中文回读及diffcheck；只补验实际受影响范围。保存原始命令、TAP、TEMP来源与已知限制，提交 exact SHA 供独立规格→质量审查。作者不合 main、不 push。

```powershell
node --experimental-strip-types --test tests/runtime/validation-group-supplement.test.ts
node --experimental-strip-types --test tests/budget/validation-group.test.ts tests/runtime/validation-group.test.ts tests/runtime/validation-allocations.test.ts tests/runtime/validation-window.test.ts tests/runtime/validation-routing.test.ts
npm run typecheck
npm run build
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions tests/runtime/validation-group-supplement.test.ts tests/budget/validation-group.test.ts tests/runtime/validation-group.test.ts tests/runtime/validation-allocations.test.ts
git diff --check
```

预期 RED 因新能力缺失退出1；GREEN及最终命令退出0，测试数量/时长记录实际输出。旧来源证据不因文档更新重复跑；本轮 TEMP 不使用真实台账、会话、key、参考安装或任何付费能力。源码独审并由唯一 merger 集成后才标 `VALIDATION_GROUP_SUPPLEMENT_SOURCE_READY`；这不表示补充已实际应用、C14已执行、COS16/18或完整游戏/human通过。
