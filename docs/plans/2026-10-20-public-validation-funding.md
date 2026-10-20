# COS109 公开生成共享验证额度绑定实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this approved plan task by task. Keep the dedicated implementer, independent reviewer and sole batch merger assigned below.

**Goal:** 普通公共 CLI 的完整访谈和生成能够事前占用原开发验证共享额度，并按真实费用安全结清。

**Architecture:** shared 只为整次运行分配完整上限；原公共运行单账本继续处理每笔 provider 请求。版本化来源绑定两个持久化根，按固定锁顺序处理预占、恢复和闭账，不增加生成 pipeline 或固定游戏 case。

**Tech Stack:** Node 22、TypeScript、现有 Node test runner、`SnapshotStore` 与现有回执工具；无新依赖或 ledger6。

## 状态与职责

- [任务 COS109 / #110](https://github.com/lrfluobida/Cosmos/issues/110)，原生父 COS18/#19；[规格](../specs/cos109-public-validation-funding.md)。基线 `415e7a061d1e6ba71bce744fe9b3d51ea68b822e`，COS107/COS108 均已源码范围完成。
- 作者 `public_validation_route_assessment`；独审 `public_run_limits_reviewer`；唯一 merger `public_agent_batch_merger`。
- 计划 `4acc3d104a0b5d0cc3d5f1dfefae1e184fa659f8` 已独审 `APPROVED_PLAN` 并获 Root 批准免费源码实施；当前候选待最终独审。真实账本或付费运行仍不在本卡执行范围。
- 工作树 `cos-05-cli` 的新分支 `codex/public-validation-funding` 保留原私有证据；作者不操作 main、不 push。

## 已核实的复用点

- `src/cli/run-limits.ts`：`RunLimits`、精确金额解析及公共来源核对，默认和小额比例已由 COS107 接通。
- `src/cli/session.ts`：真实 stdin 确认与一次激活；`runCli` 可注入 host/IO，生产仍使用原 `createProductHost`。
- `src/runtime/store.ts`：单 root owner 锁和 fsync 后原子替换。它不提供跨 root 事务。
- `src/contracts/budget.ts`：`budgetCapacity` 的 allocation 容量与 `budgetSummary` 的真实费用。
- `src/roles/provider-budget.ts`：`reconcileRoleReceipt` 会核验已关闭回执并返回 `already_closed`，可通过只读 accounting 适配复用；原 `usageCostMicroCny` 继续决定费用。
- `src/runtime/completion-timing.ts`：自持运行/registry 锁时可用 `readCompletionTiming(root, true)` 核对原签名清理终点，不能据缺锁自行认定完成。
- 现有 `RunController.open`、validation 请求归属和五角色 closure 不接受公共拨款；必须增加明确来源分支，不能借用旧 case 或事后 `importSettled`。

## 类型与接口

新增 `src/runtime/public-validation-funding-types.ts`，使用下列固定职责；实现时补齐严格字段校验，不接受任意扩展字段：

```ts
interface PublicValidationAuthorization {
  formatVersion: 'public-validation-authorization/1';
  fundingId: string;
  sharedRoot: string; sharedRunId: string; sharedLedgerId: string;
  runRoot: string; runId: string; ledgerId: string;
  limits: RunLimits; brief: string; renderFrames: boolean;
  decisionId: string; actorId: string; decidedAt: string;
  sourceRefs: ArtifactReference[];
}
interface PublicValidationFundingBinding {
  formatVersion: 'public-validation-binding/1';
  fundingId: string;
  sharedRoot: string; sharedRunId: string; sharedLedgerId: string;
  runRoot: string; runId: string; ledgerId: string;
  limits: RunLimits;
  authorization: ArtifactReference; authorizationSha256: string;
}
interface PublicValidationFundingRecord {
  binding: PublicValidationFundingBinding;
  taskId: string; claimedAt: string; basisRevision: number;
  settlement?: {
    settledAt: string; outcome: 'closed' | 'overrun';
    source: ArtifactReference; sourceSha256: string;
    settledMicroCny: number; releasedMicroCny: number;
    // Fixed original request/entry identities and their verified receipt references.
    requests: PublicValidationSettledRequest[];
  };
}
```

- child 的 `IntakeSnapshot` 和 `RunSnapshot` 可选保存 `validationFunding`；激活原样复制。`intake-origin.json` 同时保存该绑定。
- shared 的 `RunSnapshot` 可选保存 `publicValidationFundings`，以及两类明确的拨款/结算事件。ledger allocation 的 taskId 由 fundingId 唯一派生，不是游戏角色 task。
- `PublicValidationSettledRequest` 保存原 requestId、taskId、admittedAt、provider、pricingVersion、最终 ledger entry 和实际回执引用。shared entry 使用该拨款 taskId，保留真实 requestId；已有 requestId 冲突时拒绝。
- shared request 增加可选的拨款来源元数据，禁止同时包含旧 `validation`/`windowId`。纯 validator 必须把它与唯一 settlement 内的完整原记录逐项对应。
- 唯一授权来源是上述 `PublicValidationAuthorization` payload，不含自身 hash、授权文件引用或派生的完整 binding；它记录真实 operator 决定，不是 `local-user` 草稿确认。
- 构造顺序固定为：按该字段集合构造 payload → 用既有 write-once receipt 发布 → 读取并校验完整 UTF-8 原字节 → 对原字节计算 hash → 取 payload 的身份/根/限额字段，加外部传入的授权文件引用及该 hash，构造 binding。校验时从同一原字节重新推导并逐项比较，不要求哈希固定点。

新增 `src/runtime/public-validation-funding.ts` 的窄接口：

```ts
reservePublicValidationFunding({ sharedRoot, runRoot, authorization, now? })
verifyPublicValidationFunding({ root, snapshot, dispatch: boolean })
settlePublicValidationFunding({ sharedRoot, runRoot, fundingId, now? })
```

`authorization` 指向上述唯一 payload 文件；原命令参数从该文件读取，不从其它参数推断预算授权。`dispatch: false` 仅验证来源和身份，允许已结清运行的只读展示；`dispatch: true` 要求本拨款仍占用且 shared 无任何公共 overrun。

## 预算与来源不变量

1. 拨款只使用原 `evaluation/validation` shared snapshot；当前旧窗口须明确停止，无未决旧 provider 费用，既有来源校验保持。
2. 新额 `L` 不超过 `budgetCapacity.effectiveLimitMicroCny - allocatedMicroCny`；不修改原 ¥150。
3. `budgetSummary.committedMicroCny + 所有未结清拨款完整上限 + L <= 30_000_000`。已结清拨款真实费用已在 committed 中，不再重复计入。
4. shared 先追加 allocation、run.taskIds、拨款记录和事件，再一次原子写；不创建假的 provider reserve/admission。
5. 所有开放拨款的分配保持完整；新拨款与原角色、case、group、supplement 身份不可碰撞。
6. 新费用只由已核验的完整来源结算导入。旧案例、旧费用前缀、旧 stopReason、原 quote 和五角色 closure 均不可修改。
7. 超预留保留真实 child 账本与回执，在新拨款记录 `overrun` 及实际金额、保持完整占额，阻止后续拨款和该运行派发；不向旧 shared entries 强行导入超帽费用，不改旧 stopReason。
8. 正常无超额路径才导入 shared entries 并结清；overrun 的实际金额单独明确报告为待处理费用，不截断、不说已结清，也不为本卡放宽原阶段或 allocation validator。
9. 采用最窄互斥规则：`H > 0` 或存在公共 overrun 时，旧 case 不得新的 claim/dispatch；不尝试让旧请求共享剩余阶段金额。会计结算、取消未发送预留、stop/read 保持可用。
10. 已打开的绑定 `IntakeController`/`RunController` 在每次新 `reserve` 和 `admit` 都读取最新 shared 公共状态，不缓存打开时的许可。任意拨款 A 的 overrun 已写入 shared 后，B 下一次新请求即使 controller 已打开也须拒绝；已 reserve 未 admit 的请求同样拒绝。

实际链与门禁放置：`validation-window.ts:eligible` 同时覆盖 prepare/claim；`run.ts:validationTaskAuthority` 使旧 case 的 execution/admission authority 在 `H/overrun` 下为 false，现有 `requireValidationRequest` 由 reserve/admit 共用。绑定公共运行则在 `intake.ts` 与 `run.ts` 的 reserve/admit 取得运行根→shared 锁，校验当前公共状态，并在原本地准入写入结束后释放 shared 锁；共享侧只读，不逐请求双写账本。`createRoleBudget.beforeRequest` 原来就等待 reserve/admit，拒绝必须发生在 transport 前。会计、stop/read 不调用 dispatch 门禁。

## 初始化、中断点与锁顺序

operator 先完成唯一授权 payload，再创建写一次 `public-validation-origin.json` intent。intent 严格只有格式版本、授权文件引用和其原字节 hash，作为恢复索引；不复制 binding、ID、brief、限额或另立决定。所有输入均重读并推导自唯一授权。根必须为空或仅有同一 intent 的允许恢复文件；无关文件仍拒绝。

| 中断点 | 可恢复行为 |
| --- | --- |
| intent 已发布，shared 尚未写 | 尚无调用资格；同源重试领取同一拨款，不能换 ID 或输入。 |
| shared 已占额，本地 snapshot 尚无 | 保留完整占额；operator 使用原 intent 调用同一个公共 `new`。 |
| 本地 `intake-origin.json` 已写，snapshot 尚无 | 已绑定新建分支允许仅原 intent/origin 的精确重试；禁止其它目录内容。 |
| intake 已写，调用前失败 | origin 在绑定新建分支先于 snapshot 发布；普通 `resume` 核验双侧绑定，不重建 origin 或账本。 |
| 已激活或有请求后中断 | 用原 `resume` 与原回执对账，限额、起点、deadline 和真实确认保持。 |
| shared 结算写入前/后退出 | 写入前保留全额；写入后同源重试返回原结算，不重复导入或释放。 |

- 所有跨根操作先取得运行根 `.controller.lock`，需要冻结 registry 时再取得其 `.commit.lock`，最后取得 shared `.controller.lock`；反向等待禁止。
- 预占只短暂持有这些锁，释放后才调用原 CLI。`IntakeController.create/open` 与 `RunController.open` 在已持有运行锁后验证 shared；不把旧 shared RunController 作为执行 owner 打开。
- stale owner 只沿既有 `SnapshotStore.recover` 规则处理，未核清孩子 PID 或 spawn intent 时拒绝；本卡不自动扩展 previous-boot 恢复。
- 闭账持有运行和 registry 锁再读终止、费用及完成证据，阻断恢复与发布竞争；shared 写完后释放，不改 child 完成 snapshot。
- `verifyPublicValidationFunding` 从本地 snapshot、origin、intent 与 shared 来源交叉核对；缺一个来源不能退回未绑定路径。

## 公共入口接线

- 新增 `probes/public-cli/validation.ts`，仅提供 `new/resume/settle` 的 operator 包装。生产调用原 `runCli(args, { funding })`，不替换 host、不提供确认输入；stdin/stdout 继续直通。
- `runCli` 的可信 IO 参数新增可选 funding，仅向 session 传递，不新增普通产品的预算来源 flag。普通未绑定命令保持原逻辑。
- 绑定新建通过 intent 索引读取唯一授权内的固定 runId；只在此分支允许恢复上述两个初始化来源文件，并在 `IntakeController.create` 前写原 origin。未绑定 `new` 的空目录规则不变。
- `runProductSession` 在任何 host 调用前核验绑定；真实草稿仍通过现有提问、展示、`confirm N` 分支确认。Root/operator/模型无自动确认分支。
- `IntakeController` 创建/打开及正式 `RunController.open` 共用 funding 核验，覆盖普通 `resume`、直接正式 host 与激活后的 owner 切换；每次 reserve/admit 再核验 shared，覆盖其它拨款后来产生的 overrun。
- `runContinuationSession` 在 `quiescent/host.prepare` 前拒绝绑定运行；`buildContinuationQuote` 同样拒绝，包括仅加时。`continuation-authority.ts` 的 `activateContinuation` 已在持锁后重建 quote，沿该调用再次拒绝，防止直接 API 绕过。
- 绑定运行已完成时普通 `resume` 可复用原只读报告；要派发则必须重新经过 owner 和开放拨款检查。`status/experience` 不需要新付费资格。

## 结算规则

- intake 须持久停止且有原生命周期关闭证明；generation 须认证原 reported/unreported 清理收据，允许游戏失败。仅 stop、报告或缺锁不能证明清理，不以游戏计时 eligible/current 作为资金条件。
- 持有锁后核对规范化根、完整绑定、原运行限额、ledger ID、原时间与所有 requests/entries；reserved/unknown 立即阻止释放。
- 对每笔已 admitted 的关闭记录，按其 billing evidence 的实际路径调用 `reconcileRoleReceipt` 的只读 adapter，必须返回 `already_closed`。adapter 的变更方法全部拒绝，不重算或修改原账本。
- 未 admitted 的零费用 cancellation 核对原 snapshot 的请求及停止证据；不能把无回执的已发送请求解释为零费用。
- 有 unknown 时不在本接口猜费用；沿原 `reconcileEntryReceipts`/controller 会计能力处理后重试。
- 将原 snapshot/回执的固定来源保存在 shared 私有证据中；正常无超额时原子追加真实请求映射、费用、settlement 和仅属于该拨款的 closure。源冲突、缺文件或未确认清理保持全额。
- `released = limit - settled` 只适用于正常关闭；overrun 仅保存实际子账金额与来源，不写 shared entries 或 closure，保留整笔拨款并阻止新增拨款。正常费用在 shared 只计一次。
- 旧 `validateValidationAllocationClosures` 继续逐项证明旧 closures；新 validator 单独证明拨款 closures，两者联合覆盖全部 closure，不按“非旧 case”宽松跳过未知来源。

## 文件归属

| 文件 | 必要改动 |
| --- | --- |
| `src/runtime/public-validation-funding-types.ts`（新） | 绑定、拨款、结算来源类型 |
| `src/runtime/public-validation-funding-validation.ts`（新） | 纯身份、金额、请求/closure 对应及不可变来源校验 |
| `src/runtime/public-validation-funding.ts`（新） | 单次预占、双侧核验、结算、固定锁顺序 |
| `src/runtime/run-types.ts`、`run-validation.ts` | 可选记录/事件与 validator 接线 |
| `src/runtime/validation-validation.ts`、`validation-allocation-validation.ts` | 仅承认已认证的拨款请求/closure 来源；保留旧检查 |
| `src/runtime/validation-window.ts` | `eligible` 在开放公共拨款或公共 overrun 时拒绝旧 case prepare/claim |
| `src/cli/index.ts`、`session.ts` | 可信 funding 参数、稳定新建身份、初始化中断恢复、首 host 门禁 |
| `src/runtime/intake.ts`、`run.ts` | 持锁核验/原样传递；公共 reserve/admit 重读 shared；旧 case authority 拒绝 H/overrun |
| `src/runtime/entrypoint.ts` | Root接受的实际caller：原try内在startControl/createHost前核验dispatch并记录funded执行开始 |
| `src/runtime/completion-timing.ts` | Root接受F1范围：认证原reported/unreported签名清理；仅会计/stop可承接签名原snapshot，不更改原计时结论 |
| `src/roles/interview.ts`、`src/cli/control.ts` | funded会话在真实session.close成功后结束；保留既有recover返回的具体OwnerRecord事实 |
| `src/runtime/validation-allocations.ts` | Root接受F2范围：导出原closure决定核验，复用完整原文/sha检查，不新增授权 |
| `src/runtime/render-frame-selection.ts` | origin 白名单仅增加 funding 字段，原采样确认保持 |
| `src/cli/continuation-session.ts`、`src/runtime/continuation-quote.ts` | owner恢复/host准备前拒绝；原`continuation-authority.ts`重建quote自然复用 |
| `probes/public-cli/validation.ts`、`README.md`（新） | 窄 operator 包装与使用边界 |
| `tests/runtime/public-validation-funding.test.ts`、`.fixture.ts`（新） | 免费 shared 来源/故障/容量与结算测试 |
| `tests/cli/public-validation-funding.test.ts`（新） | 实际 CLI/session/输入与恢复入口测试 |

优先不修改 contracts ledger 形状、provider hooks、生成 orchestrator、游戏 host 或旧 case 声明。若必要 caller 超出该表，先以实际调用证据报告给 Root。

## 实施步骤与验证

### 1. 来源、容量与原子预占

- [ ] 先写 RED：由既有 TEMP validation fixture 建立合法 shared 历史；追加拨款而非 case，保留所有历史记录。
- [ ] 从无自身 hash/binding 的真实 payload 发布授权文件，读回原字节推导 binding 并成功核验；覆盖授权内容被改、来源引用冲突及 intent 试图携带不同 ID/brief/限额的负例。
- [ ] 覆盖两个并发申请、已有开放拨款、接近 ¥30、allocation 不足、source/ID 冲突；无资格时 provider trap 计数为零。
- [ ] 固定 `C=¥18、H=¥10`，验证旧 case 的新 prepare/claim 与 request reserve/admit 被公共占额门禁拒绝，transport 为0；会计/stop/read 仍可用，不改旧历史。
- [ ] 实现类型、纯 validator 和预占接口；对现有 ledger5 保留一个真实 fixture 代表，避免只验证简化 ledger。
- [ ] 执行 `node --experimental-strip-types --test tests/runtime/public-validation-funding.test.ts`，保留 RED/GREEN 原输出。

### 2. 公共访谈、激活与冷恢复

- [ ] 用 `runCli`、原 session 和受控 provider 写 RED；逐次送入 stdin，先等待草稿展示，错误版本不激活，再送对应确认。
- [ ] 断言访谈和生成仍共用同一 child ledger、选定 cap/原时钟与 shared 拨款一致；普通未绑定路径没有额外来源要求。
- [ ] 在 intent/shared/origin/intake 写入边界用测试侧故障注入重启；不添加生产任意回调扩展点。
- [ ] 覆盖绑定删除/篡改、裸 `resume`、直接正式 host 打开、已结清后恢复，以及 `continue` quote/激活拒绝。
- [ ] 执行 `node --experimental-strip-types --test tests/cli/public-validation-funding.test.ts tests/cli/run-limits.test.ts tests/runtime/intake.test.ts`。

### 3. 结算、unknown 和关闭竞争

- [ ] 写 RED：真实格式回执已结清、缺回执、回执金额冲突、admitted unknown、未退出 owner、未解析 spawn intent 均按对应边界处理。
- [ ] 使用原受控 provider 回执和清理证据，核对精确释放与重复结算；整笔预占不是一笔 provider 请求。
- [ ] 构造恢复与闭账竞争，断言仅一方取得运行根锁；闭账后新派发被拒，原只读完成报告仍可读取。
- [ ] 注入超预留费用：保留真实金额与新 overrun 状态，不改旧 shared stopReason/case；新拨款和旧 case 新派发拒绝。先打开拨款 B，再由 A 结算将 overrun 写入 shared，B 下一 reserve→admit 的 transport 为0；另覆盖 B 已 reserve、A 再写 overrun、B admit 拒绝。
- [ ] 执行两个新增测试文件；仅重跑改变或失败的必要代表，不重复整套 transfer/browser 矩阵。

### 4. 收口与独审

- [ ] 执行 `node --experimental-strip-types --test tests/runtime/validation-allocations.test.ts tests/runtime/validation-group-supplement.test.ts tests/cli/continuation-quote.test.ts tests/cli/completed-generation-resume.test.ts tests/cli/render-frame-selection.test.ts`；依实际 delta 选定短代表，记录选择理由。
- [ ] 执行 `npm run typecheck`、`npm run build`、`git diff --check`；UTF-8/中文/换行读回，保存新增定向证据索引。
- [ ] 作者提交准确 SHA、失败及通过原输出、已知缺口；独审先查规格再查实际 diff，作者修复有效 finding 后复审。
- [ ] Root 批准后由唯一 merger 集成和推送。真实 provider/browser、实际账本拨款和新游戏生成均不在本卡免费实施内。

## 初始计划提交的验证

仅验证计划/规格链接、JSON 登记、任务计数、UTF-8/中文及 diff 范围。未运行源码测试或创建真实预算记录；上述实现步骤均待计划批准。

计划独审修订：首版 `1c84a30392a89244c13a14ec5e6819fd77367334` 的两项 P2 修正了授权原字节与派生 binding 分离、旧 case 与已打开公共控制器的最新共享状态准入；该次仅改文档，随后 `4acc3d1` 已获独审批准。

## 作者源码结果（2026-10-21，待最终独审）

- 阶段源码 `ad24b2b32e82fbefe6d7c4a04c0e3bd661bc7dab` 已完成预占/绑定/逐次准入/结算及公开链11项；后续故障组15项与受影响原回归111项通过，均为阶段证据。
- 阶段独审提出清理证明和原预算来源两个P2；Root接受必要caller范围。原RED证明stop+无锁会错误释放、缺非分组operator原文仍预占；原输出保留。
- F1：funded intake记录session/interview生命周期，实际session.close成功才结束interview；操作失败与清理失败分开。冷恢复只记录原API证明的OwnerRecord，并保留recovered历史。会计、warnings/control及owner真正关闭后发布nonce证明；未知旧工作不抹除。
- F1：formal复用原签名reported/unreported cleanup，资金核验与游戏计时分开。funded收据的签名覆盖原snapshot字节；后续仅会计/stop可核证承接，任何新host/child执行均阻止复用。settle不补清理证据。
- F2：共享来源核验统一覆盖全部原operator、allocation closure、group/supplement原字节及既有hash，在预占/每次准入/结算复用；不重放历史SDK调用。
- 最终新增组24/24、0skip；清理相关原调用方76/76、0skip；typecheck/build均exit0。此前111项仅按无变化范围复用，与76项不相加。首次类型注解两诊断及fixture错误路径均修正并保留原输出。
- 原公共CLI、真实分阶段stdin、生产factory与原executeGeneration使用受控SDK完成访谈/草稿/规划三笔30µ；规划处主动结束，无provider网络、browser或真实共享账本操作。
- 私有证据索引 `.cosmos/cos109/verification-index.json`。作者完成候选不等于独审批准、源码集成、实际游戏生成或human验收完成。

### 最终复审的恢复持久化差异

`ebdfb24205bf89b34041c08ee66591515360f65d` 的原F1/F2已独审闭合；新增P2指出旧锁删除后才写恢复记录会丢失唯一来源。Root批准最小触达 `store.ts` 和 `recovery/ownership.ts`：原恢复guard全部核验之后、unlink之前执行受控持久化，再复核原锁字节；默认无步骤路径保持。`control.ts`将既有funding恢复记录放入该边界，记录重试保留首次时间并读回，不扩大previous-boot权限。

精确RED2项保留；本次affected7/7、0skip，含真实Node退出、记录前失败、实际非目录写入失败、记录后中断、unlink响应丢失及记录后锁替换。只复核必要差异，原24/76/111的无变化范围复用；修正候选待同一reviewer差异复审。
