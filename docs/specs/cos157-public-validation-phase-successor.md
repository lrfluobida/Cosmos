# COS157：公共验证阶段的一次显式继任

状态：phase_successor_reviewer已独立DESIGN_APPROVED，Root批准免费SOURCE/TEMP实施；SOURCE pending，尚非源码批准或真实预算授权。作者phase_successor_implementer（cos01），同一独立reviewer后续审actualdiff、与作者保持独立，唯一merger planning_budget_merger。原稿准备/等待设计审查措辞仅为批准前快照，当前设计状态以本段为准。

任务：[COS157 / #158](https://github.com/lrfluobida/Cosmos/issues/158)，id6111325804；原生父COS18/#19未勾，依赖[COS143 / #144](https://github.com/lrfluobida/Cosmos/issues/144)。runtime基线 `0341094c8cc12179f0de3a303318227681f907d3`。沿ADR0001同一权威账本，无新ADR。

设计批准输入SHA256：spec `03e603f57f23b0f7a40b147c49ccef1b52a9431ae650f05831793cd790381892`；plan `494757eeebc603f4dababd60e3e2e13f6261a51bf5c09cfec29d3434b7081927`；原批准快照保留。实际phase40/C35395421µ/H0不变；下一完整5M exposure40395421µ超395421µ，当前禁新fullpaid。X须显式，45M仅可能提案，未生成真实quote或apply，增额未批准。

实现基线：`0341094c8cc12179f0de3a303318227681f907d3`。作者工作树：`E:/CodexData/.codex/worktrees/cos-01-reference/Cosmos`，分支 `codex/phase-successor-budget`。唯一 merger：`planning_budget_merger`。后续免费 SOURCE/TEMP 实施须经独立设计审查和 Root 批准；实际预算仍须另行明确决定。

## 问题与边界

Root 提供的最新事实为 R22 永久 PASS_CLOSED、shared revision 3409、已结 35,395,421µ、held/reserved/unknown 均为 0。本轮没有读取或操作该真实账本。用户此前只批准一次 30M→40M，原扩展已应用。再预留完整 5M 后为 40,395,421µ，超过现阶段 395,421µ。原 lifetime 为 150M，每个公开探针仍不超过 5M/30min。

COS143 的三个契约把扩展固定为一次 30M→40M：类型和 quote validator 固定金额；历史重构删除唯一 extension；全部带 phaseDecisionId 的历史 funding 都按唯一 extension 验证。本卡增加恰好一个独立继任槽位，保留原扩展及其来源，不覆盖旧决定、不重绑定历史 funding。

不改变原 150M 总额、初始 30M 历史、已批准 40M、旧声明、COS16 supplement、单次 grant、时限、需求/人工确认、未知费用/cleanup/overrun 门禁。已关闭案例及旧 run 永久关闭；不能用较小完整生成拨款、另一账本、清除历史或恢复旧 case 绕过阶段决策。SOURCE 升级本身保持真实有效上限 40M。

## 方案选择

1. **采用：单个 `publicValidationPhaseSuccessor`。** 独立 quote/decision/receipt/event，目标显式输入，原回执保留。范围最小，可完整验证两段既有授权和一段新授权。
2. 不采用覆盖原 extension：会改变 COS143 来源与旧 funding 的解释，破坏原 quote 和幂等重试。
3. 不采用任意阶段列表/自动递增：当前只需要一次继任，没有通用循环需求；再下一次增加必须另立工程和预算决定。

这沿用 ADR0001 的同一权威账本，没有新增账本、执行器或预算域，不另建 ADR。下面的阶段记录和兼容规则是本卡的具体设计决定。

## 确切数据与接口

保留全部旧类型、格式和值。`src/runtime/public-validation-phase-types.ts` 新增：

```ts
export interface PublicValidationPhaseSuccessorQuote {
  formatVersion: 'public-validation-phase-successor-quote/1';
  scope: 'public_validation_funding'; activationAllowed: false;
  quoteId: string; sharedRoot: string; repositoryRoot: string;
  fromMicroCny: 40_000_000; toMicroCny: number;
  lifetimeMicroCny: 150_000_000;
  maxRunMicroCny: 5_000_000; maxDurationMs: 1_800_000;
  predecessor: {
    quoteId: string; decisionId: string;
    receiptSha256: string; sourceSha256: string;
  };
  basis: PublicValidationPhaseQuote['basis'];
}
export interface PublicValidationPhaseSuccessorDecision {
  kind: 'operator_public_validation_phase_successor';
  decisionId: string; actorId: string; decidedAt: string;
  source: ArtifactReference; sourceRefs: ArtifactReference[];
}
export interface PublicValidationPhaseSuccessorReceipt {
  activationAllowed: false; appliedAt: string;
  quote: PublicValidationPhaseSuccessorQuote;
  operatorDecision: PublicValidationPhaseSuccessorDecision & { sourceSha256: string };
}
```

`RunSnapshot` 仅新增可选单个 `publicValidationPhaseSuccessor?: PublicValidationPhaseSuccessorReceipt`。事件增加 `public_validation_phase_successor_applied`，reason 精确为 `JSON.stringify({ quoteId, decisionId })`，requestId 为 null。无数组、无阶段循环，也不升级 ledger、funding authorization 或 binding 协议。

在现有 `public-validation-phase-extension.ts` 增加两个导出，复用现有 idle/source/store 路径：

```ts
preparePublicValidationPhaseSuccessor(
  options: PublicValidationPhaseOptions & { toMicroCny: number }
): Promise<PublicValidationPhaseSuccessorQuote>

applyPublicValidationPhaseSuccessor(
  options: PublicValidationPhaseOptions & {
    quote: PublicValidationPhaseSuccessorQuote;
    decision: PublicValidationPhaseSuccessorDecision;
  }
): Promise<PublicValidationPhaseSuccessorReceipt>
```

目标必须为 safe integer，满足 `40_000_000 < toMicroCny && toMicroCny <= 150_000_000`。无默认值、环境变量、配置回退或隐式 45M。quoteId 为 `pvpsq1-${sha256(JSON.stringify(quoteWithoutQuoteId))}`。所有字段精确白名单验证，未知/缺字段拒绝。predecessor 从原 extension 推导；receiptSha256 对原 receipt 的原对象顺序 JSON 序列化取哈希，sourceSha256 是其既存原决定文件字节哈希。

独立决定文件严格等于：

```ts
{
  formatVersion: 'operator-public-validation-phase-successor-decision/1',
  kind, decisionId, actorId, decidedAt, sourceRefs, quote
}
```

source 仍是该文件的 ArtifactReference，不写入文件内部以保持旧模式；sourceRefs 必须包含精确原 phase40 决定 source。新决定与旧 phase、全部已用 human/operator/closure/supplement/public funding 决定 ID 均不同，时间不得早于原 phase 决定或晚于当前时间。完整 quote 绑定本次基线、目标及原 receipt/source；工程批准和剩余 lifetime 不是该预算决定。

## prepare 与 apply

prepare 只读原 canonical shared/repository roots 及原来源，不创建目录、controller/owner/registry lock、时钟、run、allocation 或 provider 请求。必须存在有效的原 30→40 receipt 且不存在 successor；当前有效上限必须确为 40M，同一 runId/ledgerId/lifetime150M。

沿用 `requirePhaseHistoryStopped`、`idle`、`sharedSources`，核验原 run 和全部 case 已 stopped 且非 overrun，所有旧 public funding 正常 closed、H/R/U 为 0，原案例、共享根及每个 funding child 无 owner/registry writer。只保留所属 stopped case 的旧 running task 标签；含糊归属或可派发旧窗口拒绝。历史 source 缺失、字节变化、根 alias 或根不匹配拒绝。

basis 完整沿用 COS143 的 revision、raw snapshot SHA、committed/held/allocated、全部前缀计数和 history SHA。committed 必须不超过 40M，held 固定为 0。successor 历史哈希保留原 extension，只移除 successor；保留原 case/task/delegation/supplement，并按 basis 截取追加历史。准备结束重查无 owner 与 snapshot 原字节，变化则拒绝。

apply 获取原 shared SnapshotStore 锁后：

1. 验证完整 snapshot、quote、独立决定原文件及全部历史来源。
2. 若 successor 已存在，只允许完全相同 quote、决定（含原 sourceSha256）返回原 receipt；其他调用冲突失败，不写入。此路径允许之后已有合法新 funding/settlement，不重新要求当前零 held。
3. 新应用必须没有 successor，决定身份未消费，revision/raw SHA 等于 quote basis；在持锁模式重新构造 quote，逐字段相同。
4. 提交前再次核验来源、owner/registry、决定文件及 snapshot 字节，严格满足原 40M→显式目标/150M 与停止条件。
5. 仅追加 successor receipt 和唯一对应事件、revision+1。原 receipt 的 JSON 序列化字节、外部原 source 文件、ledger、费用、allocations、旧 funding、旧事件/时钟/stop/task 均不修改。先 validateSnapshot 再原子写入。

新 apply 的 lost-response 重试返回原 receipt；换决定、换目标、换来源、重复/冲突 ID、陈旧 quote、来源变化、再次 successor 都拒绝。原 30→40 apply 用原参数重试仍返回原 receipt，不能重置更高有效上限。

## 历史校验与新拨款

保留 `validatePublicValidationPhaseExtension` 导出作为整体 phase 状态入口，内部核验原 receipt、可选 successor 和 funding 分段。原 `phaseHistory` 必须删除两个可选 phase 字段，使 COS143 的既存 historySha256 完全不变；新 successor history 的重构只删除 successor 并保留原 receipt。二者可共享小型前缀截取内部 helper，但不泛化预算服务。

不存在原 extension 时，successor/event/phase-tagged funding 一律拒绝。存在 successor 时，其 predecessor 与原 receipt/hash/source 精确一致，basis 严格在原 apply 之后，fundingCount/eventCount/各前缀计数有序，原及新 event 各恰好一个、序号/时间/reason 精确。新 receipt 的 history 哈希冻结此前全部已结 funding/source 引用及原 receipt。

设原 extension 的 fundingCount 为 L，successor 的 fundingCount 为 S：

| funding 下标 | 原 phaseDecisionId 与授权来源 |
| --- | --- |
| `< L` | 保留 undefined；按原 pre-extension 授权核验，不追加任何 phase source |
| `>= L` 且无 successor，或 `L <= index < S` | 必须为原 phase40 decisionId，继续使用原 source/时间/单次上限 |
| `>= S` | 必须为 successor decisionId，使用 successor source/时间/单次上限 |

带 phase 的 funding 的 basisRevision 必须晚于所属 phase quote basis、claimedAt 不早于所属 apply；两阶段间既有历史由 successor frozen prefix 进一步锁定。无法解析/缺失/改写 phaseDecisionId 拒绝。全部历史 authorization/settlement 来源仍逐字节验证，任何阶段决定 ID 均不能充当单次 funding decisionId。

`requirePhaseFundingAuthorization(state, authorization, phaseDecisionId?: string)` 新增可选第三参数：省略时选当前有效 receipt，仅用于新 funding；明确传入时只解析该已知原 receipt，未知 ID 拒绝。`sharedSources` 对历史带 tag 的记录显式传入原 record.phaseDecisionId；pre-extension 记录保持旧核验。`verifyPublicValidationPhaseSource` 核验两份 phase 原来源。新 `reservePublicValidationFunding` 选择 successor 优先的有效 receipt，并在新记录写其 decisionId。

`publicValidationPhaseLimit` 完整校验后返回 successor.toMicroCny，否则原 40M，否则原 30M。现有 reserve 的 C+H+L、funding validator 的 C+H、validation profile 累计账务检查通过这个函数统一使用有效上限；原 150M allocation capacity 同时约束。不得直接给旧 fixed-case dispatch 提高限额；原 extension 仍存在，所以 `requireLegacyFundingAvailable` 永久阻断旧新派发。

历史 accounting/相同 funding reserve 或 settlement 重试仍解析其原授权；不迁移 sourceRefs、不更新 binding、无新费用。dispatch=true 对已 settled funding 仍拒绝；settlement 的既有 cleanup、未知收费、逐笔来源与幂等机制保持。新 run 仍须独立的完整单次授权，精确引用当前 phase source，且不超过 5M/30min。

## 最小文件面与验证

生产仅预期修改六个既有文件：`src/runtime/public-validation-phase-types.ts`、`public-validation-phase-extension.ts`、`public-validation-phase-validation.ts`、`public-validation-funding.ts`、`run-types.ts`、`run-validation.ts`。新增 `tests/runtime/public-validation-phase-successor.test.ts`，复用既有 fundingFixture/真实生产 API。无需修改 contracts、CLI/UI、依赖、run.ts、funding binding 类型或三处累计检查的调用者。

测试必须覆盖：prepare 零锁零写；没有原 extension/非法目标/目标150M边界；H/R/U、active window、owner/registry、overrun 拒绝；stale revision/raw/history/predecessor/source；身份复用与冲突/重复 successor；原 history/source/receipt/pre-extension 与 phase40 funding 保留；三段历史来源选择；原 apply 与新 apply 在后续 funding/settlement 后幂等；新 phase 来源/时间/5M/30min/cumulative+held/capacity 门禁；旧 funding 只读 accounting 和 settlement 重试可用但 dispatch/旧 fixed-case/continuation 不复活；原 running 标签保留。所有正负例使用独立绝对 TEMP 根、合成决定、无真实 provider。

## 交付和真实操作边界

本轮止于两份私有规划文件，提交 Root 独立设计审查。后续只在批准设计后实施 SOURCE/TEMP、独立审查实际 diff、唯一 merger 集成稳定主线。可在候选批准后的单独只读审计中读取真实状态，并用完整复制到绝对 TEMP 的候选检验兼容；不得打开真实 controller 或写回真实数据。

本任务不调用真实 prepare，即使只读也留待 Root 在独立源码批准和稳定 main 后执行。届时 Root 可提出例如 45M 的具体 quote：45M 只是候选金额，没有自动许可。只有用户对精确当前 quote 作独立明确预算决定后，才允许后续另行 apply；新 funding/run 仍有自身授权与 readiness。SOURCE_READY 不代表预算增加、真实运行通过或游戏完成。
