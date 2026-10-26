# COS-127 · 普通设计独立评审的原额度内请求容量

状态：已完成独立源码审查与主线集成，source-scoped-complete；不构成真实运行授权。实现者cos127_implementer，独立源码reviewer cos127_reviewer，唯一merger public_agent_batch_merger。

源码结果：独立cos127_reviewer对 `13af7dbec0eddb0d6deb69193f2244ef3c75ebb3` 完成规格/质量审查，APPROVED_SOURCE_SCOPED、无actionable finding；唯一merger合入发布 `d088df021825f1813e5d8fe9f1c775f011144321`，10文件精确一致，主线typecheck/build及3/3短代表通过。[批准](https://github.com/lrfluobida/Cosmos/issues/128#issuecomment-6406706248)、[完成关闭](https://github.com/lrfluobida/Cosmos/issues/128#issuecomment-6406710871)已核证。仅SOURCE范围完成，父COS18仍open/partial；room11永久关闭，新源码尚无真实review verdict或游戏结果。

审批记录：[COS127 / #128](https://github.com/lrfluobida/Cosmos/issues/128)；独立 `design_review_budget_plan_reviewer` 给出 `APPROVED_PLAN`、无P1/P2阻塞项，Root批准固定输入的正式发布与免费源码实施。源码后续独审与集成结果见上述状态记录。

- 批准规格输入 SHA256：`e984dd75874ee3476ad4bb30d1a1d330ae9d933e25ec12e555d5f5cac5d126a8`
- 批准计划输入 SHA256：`850a9af4cdd97f5730af43efb93ce4c707f738006c0862bcb7b000a5edfc848d`

已获独审与Root认可的非阻塞测试组织说明：历史byte边界由helper验证，真实SDK按实际bytes核证；批准技术行为不变。

配套[实施计划](../plans/2026-10-26-design-review-budget.md)。

基线：main `7b6d01ab749cd912a11b2abeb36deda6db882d04`；room11 runtime `c189c49b0094873d2a8270151915d3aef0eba273`。

## 1. 问题与目标

room11 设计作者完成交接、固定 capture 和宿主结构检查后，独立 reviewer 的第三次模型请求因原设计任务额度不足而未派发。真实归一化输入为 103650 bytes，输出上限8192，报价272836µ；原设计任务 grant675000µ、已结算445787µ、剩余229213µ。全运行仍有余额不能代替该任务的 grant。失败不是请求次数耗尽。

本卡将两项行为作为一个明确的普通设计评审选项：完整 JSON 读取结果只去字符串外空白；每次请求在原 grant 内选择4096至8192之间可负担的最大输出 cap。保持完整输入内容、独立评审协议和失败处理。让 reviewer 有机会输出完整意见，不预判其 verdict，也不解决所有后续设计、媒体、编码或运行时缺口。

## 2. 证据与选择

拒绝上下文来自原 reviewer native 的 leaf `284c2a2a`，经现有 SDK `buildSessionContext → convertToLlm → normalizeContext → requestInputBytes` 重建。四份完整 JSON 的词法空白压缩共减少11506个归一化输入字节：需求2103、确认168、设计697、验收计划8538。对应输入92144 bytes。只压缩显示，不改变已结算费用。

| 同一原余额229213µ下的请求 | 报价 | 结果 |
| --- | ---: | --- |
| 原输入103650、cap8192 | 272836µ | 不可准入 |
| 原输入103650、cap4096 | 240068µ | 不可准入 |
| 压缩输入92144、cap8192 | 249824µ | 不可准入 |
| 压缩输入92144、cap4096 | 217056µ | 可报价，余12157µ |
| 压缩输入92144、最大可负担cap5615 | 229208µ | 可报价，余5µ |
| 压缩输入92144、cap5616 | 229216µ | 不可准入 |

选择组合策略，上限8192、可信下限4096。不会使用原请求仅靠降cap得到的2739作为生产下限，也不会使用2K下限。4096仍需模型在真实任务中给出完整结果；容量增加不是语义质量证明。

五个已完成设计评审样本（native-validation-6/7/8、transfer-validation-4/5）均为 deepseek-flash/low，含approved和真实changes_requested；33次调用的最大实际输出1885 tokens，最终verdict输出320至1489 tokens。这是工程容量参考，不是任意复杂评审的上界；reasoning占用已经包含在usage.output中。原协议不限制findings数量或缩短真实问题。

## 3. 精确启用范围与最小接口

### 3.1 可信宿主选择

在 `src/roles/factory.ts` 的 `RoleFactoryOptions` 新增一个组合选项：

```ts
ordinaryDesignReviewBudget?: (task: Readonly<TaskContract>) => boolean;
```

这是可信宿主代码的选择器，不是模型输出字段、任务字符串标签、CLI参数或持久化授权。配置存在时须为函数，且原通用 `maxOutputTokens` 必须为8192；不接受任意新floor/cap。构造factory时捕获该选择器，保持既有选项快照方式，不允许之后改options对象改变已建factory行为。

factory只有在 `input.role === 'reviewer'`、无planning purpose、无 `input.validation` 时才调用选择器，传入冻结的任务副本；只有严格返回true才启用。其他role/purpose不调用选择器。true以外的布尔值为未启用；异常或非布尔返回不得默默启用。

`src/runtime/entrypoint-host.ts` 只在既有普通作者预算策略的宿主门槛内传入选项：

```ts
ordinary && !validation && !preparation && !human && !binding && !inherited
```

选择器使用该宿主已有的 `role(task) === 'design'` 角色判定。该判定读取可信的既有任务绑定或已经校验的阶段验收身份，不用taskId名称、前后缀或输出路径猜角色。现有普通任务验证、需求绑定和beforeTool检查仍执行。普通模块化流程如满足上述门槛，只允许其设计reviewer命中；模块/最终编码reviewer不命中。

fixed validation、legacy、preparation、human binding、continuation binding、inherited阶段以及其他reviewer均不获得此选项。作者、planning、工具权限、模型、thinking、请求次数和超时配置保持既有行为。低层 `RoleInput` 不新增角色来源字段，TaskContract与持久化格式不变。

### 3.2 scoped read 显示选项

在 `WorkspaceToolOptions` 增加 `compactFullJsonReads?: true`。仅上述命中reviewer的factory把该选项传给 `createWorkspaceTools`；默认调用路径保持原样。此选项只控制既有read结果展示，不赋予读取范围或文件写入权。

新增小型纯helper `src/providers/json-read-display.ts`，例如：

```ts
compactCompleteJsonRead(
  result: AgentToolResult<ReadToolDetails | undefined>,
  args: ReadToolInput,
): AgentToolResult<ReadToolDetails | undefined>
```

类型使用固定SDK已导出的现有read/result类型。实现可保留result已有的额外字段；不能重建或丢弃details、错误标记等信息。

## 4. 完整 JSON 的词法空白压缩

转换放在现有 `workspace-tools.ts` 的scoped read wrapper内：原路径/realpath/symlink/权限检查通过，原SDK read成功返回后、结果交还Pi并持久化之前。继续使用同一个SDK read，不能复制SDK读取/截断实现、替换图片检测、添加第二次文件读取，或在provider层悄悄改context。

固定SDK0.99.2的真实返回契约：

- 默认行数/字节截断、首行超限会返回 `details.truncation` 和对应文字提示。
- 用户limit提前结束会在text末尾追加 `[N more lines in file. Use offset=N to continue.]`，此分支没有 `details.truncation`。
- 从后续offset开始可以返回有效JSON片段；所以无truncation不等于全文。
- 完整未截断的文本返回单一text，内容为该次SDK读取的原文本，不提供统一completeFile标记。

只在以下条件全部成立时转换；任何不确定性原样返回：

1. 原SDK read成功，未出现isError；signal在返回/转换前仍未取消。
2. args.offset省略或严格等于1；若limit存在，必须是正安全整数。后续offset、非法/不确定参数原样。
3. content恰好一个text block，没有image或其他block。
4. 无 `details.truncation`；没有固定SDK的截断、剩余行数或超限提示。显式核对用户limit的尾注，不能只检查details。
5. 整个text是单一合法JSON文档（允许JSON标准外部空白）。解析仅验证语法，解析所得对象永不用于生成替换内容。

对通过的text做一次词法扫描：只删除字符串外的U+0020、U+0009、U+000A、U+000D。扫描必须正确追踪引号、反斜杠与转义状态。字符串内所有字节序列、中文、Unicode转义、键序、重复键、数字词法（大整数、指数、-0）全部保持。禁止JSON.parse后stringify、字段排序、摘要、截断或删除键值。无需添加额外说明文字；无可删空白时原样返回。

因此原文件、capture、输入版本、read权限和原证据字节不变；native工具结果、下次模型输入与准入报价共同使用转换后的text。完整性判断只依赖固定SDK原返回契约和调用参数，不为本卡建立新的文件版本或诊断服务。

## 5. 原额度内 adaptive 输出

命中reviewer时直接复用 `authorBudgetOutputLimit`，参数固定 `floor:4096, maxOutputTokens:8192`，其余使用当前factory已读取的original snapshot、原task、executionAuthority和既有estimate。现有helper的名字不要求重构；不复制选择算法，不改变作者行为。只复用输出选择，不给reviewer启用作者compaction或新增摘要请求。

保留helper和Pi现有约束：

- 对真实归一化输入报价；输入身份不在选择中变化。
- 读当前原authority、原run/ledger/grant/clock并验证稳定身份；剩余不足原deadline五秒清理余量时拒绝。
- 每个候选在独立ledger clone上调用真实reserveEntry，报价本身不写账、占款或消费request slot。
- 从8192向4096逐个下降选择最大可负担cap，适用于非单调注入estimate；沿用每64次yield及取消检查，不改成假设单调的二分查找。
- floor仍不可负担则沿原admission失败路径停止，不再降cap、不借其他任务额度。
- 真正dispatch仍经过当前真实reserve/admit与requestWindow校验；报价成功不承诺派发，竞态导致余额/authority变化时仍拒绝。

为该reviewer启用现有 `createRoleBudget({ recordRequest:true })`。继续只记录既有六个安全字段：requestId、modelId、maxOutputTokens、inputBytes、hasImages、estimatedMaxCostMicroCny。复用原billing receipt；不新增拒绝诊断文件、服务或凭证内容。

## 6. verdict、失败与原运行边界

现有合法schema保持：`verdict`、完整固定 `inputVersions`、已记录host `evidenceIds`、完整 `findings:string[]`。approved必须findings空；changes_requested必须至少一个真实未解决问题，包含未满足要求与实际/期望。不得通过截短、多finding合并丢义、忽略真实缺陷或修改schema降低输出要求。

Pi的 `stopReason:length` 继续失败；即使截断文本外观是合法JSON也不能当成批准。费用仍如实结算，不能因失败把已发送费用改成零。现有一次格式纠正策略保持，不新增retry、compaction、window、grant或attempt恢复渠道。原terminal请求与review-started缺少verdict的恢复门槛保持。

独立语义评估已确认room11固定产物有七项缺口，详情由Root保留。本卡不手修该产物、不把fake transport输出写成真实runtime verdict、不宣称游戏通过；测试中的approved/changes_requested仅为合成协议用例。

Root已报告room11永久closed且独立PASS_CLOSED：child171/shared3358，36笔settled568980µ、released4431020µ；shared committed21274700µ、unallocated53537725µ，held/exposure/pending/locks均0。本文引用该移交事实，不重新审计账本。原确认、clock、capture和失败native保持；不得恢复room11验证本卡。

## 7. 验收范围

1. 宿主精确opt-in与角色范围成立，旧调用默认不变。
2. 完整JSON词法展示确实进入native与真实SDK后续请求；部分/不确定读取完整回退。
3. 同量合成输入在原229213µ余额下，组合选择5615/229208µ；单项原4K或压缩8K仍拒绝；4096/217056µ边界通过、低于floor成本拒绝。合成数据不复制私有需求或改写SDK context。
4. 原authority、非单调报价、取消/清理时限和真实reserve/admit守卫复用成立，安全metadata限于六字段。
5. 真实factory → scoped read → Pi → SDK，仅fake底层provider transport，能给出完整多finding changes_requested及合法approved；length保持失败且无伪批准。
6. 必要旧作者COS125与旧reviewer兼容证据按实际受影响路径定向复用，不重复宽泛审计或真实付费。

源码完成只能标记本卡source-scoped-ready/complete；真实新run与付费另行授权。本文和配套plan已独立APPROVED_PLAN并获Root实施批准；源码已独审批准并由唯一merger合入，限source-scoped完成。
