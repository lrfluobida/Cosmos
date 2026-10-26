# COS-129 · 复用已确认需求的新生成尝试

状态：已独立APPROVED_PLAN并获Root批准免费实施；源码已独审批准并集成，仅source-scoped完成，本文件不授权实际运行。基线 main `5f1c1db0162fd523714439bc046f49e142977f31`，runtime `93b1b0f8e9da14a804542d3f6f4380baed54e12f`。依据 CONTEXT、cosmos-spec、ordinary-design-intake、COS109/111/112 既有契约。

源码结果：`db6548ace1e930d39f27d9ca30b3318e233e6fda` 已独立reuse_plan_reviewer APPROVED_SOURCE_SCOPED、无findings并合入发布 `6bdc9af3c06fee719e50dac8c129e300df22b46f`，26文件精确一致，typecheck/build及3/3短代表通过。[批准](https://github.com/lrfluobida/Cosmos/issues/130#issuecomment-6423957466)、[关闭](https://github.com/lrfluobida/Cosmos/issues/130#issuecomment-6423965590)已核证。仅source-scoped完成；COS131修复及raw publisher正例已通过，COS130最终新增入口组合待完成，paidReady=false，不声明整个新方法ready。

审批记录：[COS129 / #130](https://github.com/lrfluobida/Cosmos/issues/130)；独立 `reuse_plan_reviewer` 给出 `APPROVED_PLAN`、无P1/P2，用户与Root批准新方法及固定输入的免费源码实施。实现者confirmed_requirements_implementer，独立源码reviewer reuse_plan_reviewer，唯一merger public_agent_batch_merger；源码完成与剩余组合前置见上述状态记录。

- 批准规格输入 SHA256：`52b79cd81647b76b9c0b4603c9b1c775c52341d7aff25b2b2b2c0cbdc9b977ea`
- 批准计划输入 SHA256：`bfb2dcfa7656115373bb8b62263da9f510e75915d9f0d74e91ba0a15d01e976a`

登记/实施基线：`5f1c1db0162fd523714439bc046f49e142977f31`。本批不新付费重跑，不操作真实run/ledger/coordinator；room14未确认，不能作为批准来源。

配套[实施计划](../plans/2026-10-27-confirmed-requirements-reuse.md)。

## 目标

用户可让一次新的普通生成尝试使用某个已经真实确认的完整需求版本，省去重复访谈和重复确认。原确认说明“用户确认了这些要求”；新运行自己的创建请求与 funding 授权决定这次执行的预算和时限。

只接受原 `ordinary-design/1` 完整版本，保留 brief、questions、answers、全部 AC、experienceCriteria、unsupported、codeProfile、benchmark、classicEntry，以及原 renderFrames/modularRepairPolicy 选择。任一内容修改均回到普通 `new --brief` 访谈与确认流程；不以语义相近、摘要或模型改写代替原版本。

## 实现选择

| 选择 | 代价与结论 |
| --- | --- |
| **引用原确认版本，复用现有 reader、固定副本与激活器（推荐）** | 增加一个来源字段与明确分支；原回执、capture、planner、设计和体验链继续使用完整输入。所需改动只在当前 run 与确认来源绑定处。 |
| 把旧草稿导入新 intake，再执行 confirm | 改动表面较少，但再次要求用户确认；自动调用 confirm 则伪造新 run 的人类决定，不满足目标。 |
| 抽出独立需求仓库、导出包与版本注册表 | 可脱离原运行目录存储，但增加迁移、生命周期和新权威来源；当前需求无需此层。 |

## 公开接口

```text
cosmos new <new-dir> --requirements-from <source-run-dir> --requirements-revision <N>
  [--max-cny N] [--max-minutes N] [--render-frames true|false]
```

`--brief` 与来源模式二选一；来源模式不接受 adapter。revision 必填，不能自动选最新草稿。renderFrames 省略时取原选择，显式值只能与原选择相同。普通 host 当前默认不能覆盖原 profile 或选项。原样展示来源 run/revision、原确认人/时间、完整要求和本次限额，明确这是新生成尝试；不出现新的 `confirm N` 提示，也不创建新的需求人类决定。

source/new 目录必须规范化且互不包含，runId/ledgerId 必须不同。新 run 必须满足现有空目录或 funded 初始化规则。只读来源允许已停止、到期、已结算或完成的原运行，也允许已确认但尚未激活的 intake；不会 open/recover/stop/settle 原 controller。来源只能直接指向持有原人类确认的运行，不能用另一个引用型尝试组成递归来源链。

## 最小数据契约

```ts
interface ConfirmedRequirementsSource {
  formatVersion: 'confirmed-requirements-source/1';
  root: string; runId: string; revision: number;
  draftSha256: string; confirmationSha256: string;
}
```

该引用存于新 `intake-origin.json` 和 `IntakeSnapshot`，激活时原样进入 `RunSnapshot`。来源 specVersion 必须与本次受支持的 specVersion 相同；不能用新版本重建旧确认语义。沿用已有 hash、regularFile 和回执发布工具，不新增 registry、签名体系或独立 proof 层。

新 intake 的 `confirmation` 保持 null，保存完整 `draft` 及来源引用；新 formal run 的 requirements humanDecisions 保持空。`RequirementContract.confirmedBy/confirmedAt` 仍为原决定，`sources` 仍为两个固定相对引用。新 root 的 `requirements/vN/draft.json` 与 `confirmation.json` 是原文件的独立逐字节副本，包含原 runId/actor/time；不重序列化、不重写 runId，不与源文件 hardlink。副本只是现有 capture 消费路径，原来源仍须核验。

新 origin/profile source 使用新 runId/createdAt，并保留原 brief/profile/选项值；不复制旧账本、请求、时钟、任务、capture、设计批准或体验决定。新账本保留现有分配政策，未发生访谈的额度不在本卡重分配。现有 created/generation_activated 事件分别记录本次创建与启动，启动 reason 明确引用来源 run/revision；原确认时间只表达需求确认。

## 读取与执行数据流

1. 在任何新拨款、host.prepare 或 controller 创建前，只读核对指定 source snapshot、origin、profile source、revision 原问答、draft 和 confirmation。复用 `readConfirmedGeneration` 的完整核验；抽出的公共 reader 另支持 IntakeSnapshot.confirmation。只接受原 CLI local-user 确认、对应 revision、精确 evidence、完整 hash 和空 unsupported；单个 confirmation.json 不能自证批准。
2. 生成并固定来源引用。对 formal source 核对原 humanDecision；对 intake source 核对当前 draft/confirmation/RequirementContract 与实际原字节。源已修改、未确认、错 identity/profile/specVersion、缺原文件、旧版没有完整摘要或 preparation 一律拒绝，不补造历史字段。
3. 创建新 intake 与新账本，再通过一个窄 `bindConfirmedRequirements` 操作保存原字节副本和完整 StoredDraft。草稿未绑定前的初始化中断可按同一引用重试：已写文件必须逐字节相同；绑定完成后的文件丢失不能现场重建。来源模式禁止 saveDraft/confirm/claimDraftSuccessor/访谈请求。
4. 共用现有 readiness、funding 工作收敛、未知费用、预算耗尽和硬停止门禁。激活前重新核验 source、引用和本地副本，之后仅给新 run 设置 startedAt/deadline。未就绪时保存引用型 intake，`resume` 继续该新尝试，不访谈、不换源、不重置时钟。
5. `executeGeneration` 和 host 的完整来源门禁使用同一 reader。planner、requirement capture、design reviewer、art/code 和普通/persistent consumer 继续读取原完整 draft；persistent `requireCurrent` 当前硬编码的 confirmation.runId === task.runId 改为验证明确的来源关系。
6. report 的 ordinaryConfirmation 增加可选 requirementsSource，绑定原来源和新 candidate/report。experience 继续要求本次交付的真实试玩；旧 approval 不迁移。completed/resume 同样核验原来源，丢失或漂移拒绝使用。

## 必须改变的“每 run 确认”契约

| 当前接缝 | 最小变化 |
| --- | --- |
| `IntakeController.activateGeneration` 必须有本 run confirmation | 接受本 run 原确认或已核验 requirementsSource 两种互斥来源；其余激活条件不变。 |
| `readConfirmedGeneration`、`executeGeneration` 要求当前 humanDecision | 保留旧路径；来源分支验证原人类决定，不往当前数组复制或伪造新决定。 |
| `readFrameSelection` / `readModularRepairPolicy` 从当前决定读取 | 来源分支取得原确认选项，再核对新 origin 与 created 记录；避免与完整 reader 相互递归。 |
| persistent consumer 的 confirmation.runId === task.runId | 经公共 reader 验证 sourceRunId 与当前执行绑定；source 回执身份保持原值。 |
| public limits/status 通过 humanDecisions 识别已确认运行 | 来源模式也必须有新 origin 限额；status 显示已确认的来源及独立新 run。 |
| report/experience 的确认来源只含当前相对引用 | 添加显式原来源引用并核验；现有 report/candidate/试玩决定绑定保留。 |

`readOrdinaryProfile` 可保留当前 run 的 write-once 选择；完整源核验仍在公共 reader。旧 `readConfirmedGeneration` 导出保留，调用方无需批量改 import。旧普通/preparation/内部 validation 的解释和权限保持；引用型新 run 的 `continue` 本卡明确拒绝并提示当前仅支持 new/resume，旧 continue 不变。已通过阶段跨 run 复用不在本卡。

## 公共验证拨款入口

保留 `public-validation-authorization/1` 原格式；新增 `/2`，字段为原格式加必填 requirementsSource，brief/renderFrames 必须等于原完整来源。binding/settlement 格式继续使用原授权文件 hash 固定全部输入，无需新拨款账本。

`runPublicValidationCli new` 读取 v2 授权后先核源，再按现有方式 reserve，并调用公开 `runCli new --requirements-from ... --requirements-revision ...`。`verifyFundedNew`、`acquirePublicFundingGate` 检查新 origin 来源与授权一致；resume 只读原绑定。v1 不得偷偷切入来源模式，v2 不得退回普通 brief；重复初始化保留原 fundingId/runId。此处设计不会实际拨款。

## 验收与边界

- SOURCE/TEMP 原确认 v2 → 新 attempt：完整字符串与 draft/confirmation 字节相同；原 run 文件和停止状态不变，原确认时间不变；新 runId/ledgerId/clock 独立，intake transport 为 0。
- 真调用链至少走公开 `runCli` → session → IntakeController → executeGeneration → createProductHost/createBrowserHost → requirement capture → design/独审 → art/code → consumer/report/experience scope；受控 SDK/IO 只替换外部边界。不能以 fake execute 返回成功代替接线证据。
- 拒绝未确认、错误 revision/identity、unsupported、brief/问答/AC/EX/profile/选项及原回执漂移；启动与激活间漂移也须拒绝，保留来源原字节。
- 覆盖已停止 formal source、已确认未激活 intake source、readiness 暂停后新 attempt resume、已激活恢复/完成只读、public-validation v1/v2 与普通/persistent 代表。新体验决定绑定新 candidate，旧决定不能通过。
- 与独立 preflight 卡共用公开 `runCli` 输入点和现有 ordinary consumer；本卡只提供一个 TEMP 源版本 + 来源参数的窄正例，可替换为 preflight 的 ordinary 真实 delivery fixture host。无需新 runner 框架，两卡可独立开发。
- room14 保持 unconfirmed/deferred，不得用作批准来源；room12 的真实确认 v2 即使原 run 已 stopped 也符合本设计的只读来源类型，本卡只把它作为业务背景，不实际读取或启动。本卡不操作真实 run、ledger、凭据，不调用模型；测试不声称真实游戏质量或交付完成。

最终源码需独立 implementer、独立 reviewer、唯一 merger；本设计已独立APPROVED_PLAN并获Root实施批准、已登记任务；源码已独审批准并唯一合并，交付组合仍待后续验证。
