# 经典条目正常输入检查：设计草案

状态：已由 `classic_entry_design_reviewer` 独立审查 `772ce6180a73ef436b2efba411c4b5d25e9519ee` 并批准 `APPROVED_DESIGN`；Root 已授权免费 SOURCE 实施。稳定任务 [COS-104 / #105](https://github.com/lrfluobida/Cosmos/issues/105)，原生归属 [COS-14 / #15](https://github.com/lrfluobida/Cosmos/issues/15)，父项未勾选。设计基线为 `2f84eb328e59f20d73ceccdc69ff708f7be200a5`，实施基线为 `7d02729370c6379f0377f7cd42a68672613894b3`。本片尚未完成源码验收，不表示 COS-14、完整经典验收或参考冻结已就绪。

## 1. 目标与已核实缺口

增加一条真实生产路径：可信主机从固定参考资料选定一个已核实的离散数值，运行时设计给出目标游戏的正常鼠标操作和可见文本定位，主机组装独立的既有 `AcceptancePlan`，通过原 `io.play` 实际执行，再将原始证据纳入逐项报告和独立评审。

当前 [entrypoint-classic.ts](../../src/runtime/entrypoint-classic.ts) 只运行 STARTUP/OFFLINE，并明确要求 provisional、230 行、221 个 `needs_reference` 与 9 个政策。其余条目没有自己的生产执行计划。[draft.mjs](../../benchmarks/classic-pc/draft.mjs) 的声明映射和数值比较只有测试调用；仅给现有 save/reopen raw 增加目录标签不能补上执行缺口。

当前 [catalog.json](../../benchmarks/classic-pc/reference/catalog.json) 的 `measurements` 为空。第一片可以验证程序如何可靠接收事实、组装计划、执行和留证，不能在生产目录里制造事实来演示成功。单个 measurement 是这条接口所需的最小有意义输入：它已有稳定 ID、对象、指标、数值、单位、容差和双类参考证据；无须先设计完整规则语言。

本片只证明“该固定候选经过这些正常输入后，指定可见文本与固定参考数值一致”。它不证明游戏内部费用、生命、伤害或其他机制真正使用该数值，不证明该条目的全部要求，也不完成 COS-14。以后可复用事实准入、目标定位、主机计划绑定、原 runner 和逐项证据闭包；多条编排、其他事实类型和机制验证需要各自具体设计。

## 2. 方案比较与选择

| 方案 | 实际收益与改动 | 决定 |
| --- | --- | --- |
| 给旧 classic policy mapping 升版，加入 entry plan | 可以执行新增计划，但会把两政策 v1、历史恢复和新事实输入绑在一起；仍需区分两政策与条目观察的含义。 | 本片不采用。旧 mapping/report v1 保持原用途。 |
| 增加独立内部 entry consumer | 在原 clean delivery 生命周期内额外调用一次现有 `io.play`；有独立的固定计划与 raw，复用原 registry、runner、诊断和 review。 | 采用。新增能力可单独证伪，旧两政策的执行与结果保持。 |

仅重新包装旧 save/reopen raw 不具备上述收益，已排除。不增加用户需要选择的实现 profile、CLI flag、通用 DSL、scheduler 或账本；不扩大 generic 的 100 条验收、200 步或两段约束。本片的新计划仍符合原 `AcceptancePlan` 上限，且不是把全目录塞进 generic draft。

## 3. 既有能力与不变边界

直接复用 [COS67 plan](../plans/2026-10-06-cos67-classic-runtime-policy.md)、[COS69 plan](../plans/2026-10-06-cos69-render-frame-sampling.md)、[COS70 plan](../plans/2026-10-06-cos70-cli-frame-selection.md) 和 [参考观察契约](../benchmark/observation-contract.md)，不重复采样、交付或静态参考调查。

- 旧 `classic-pc-runtime-policy/1` 仍表示原 STARTUP/OFFLINE 政策。新 consumer 的内部版本和选定事实另行绑定，不改写旧 profile 的含义。
- 原已确认 draft 没有新增选择字段时，保持旧行为；恢复不能追认新检查，已完成报告继续原只读读取。
- 新的经典 draft 在真实用户确认前展示是否存在可执行的单条参考检查、具体对象/指标/数值/单位及未覆盖范围。仅展示用户需要判断的内容，不要求选择内部版本名。
- 主线或 actual 运行冻结期间不实施。源码、测试与原生 SOURCE 代表须在独立设计审查及 Root 源码授权之后开展。本草案不授权付费、实际生成或新验证窗口。
- 共享验证总额 ¥150，既有直接探针保守预留 ¥0.721771；正式单次 ¥200/12h，优化目标 ¥100/6h。新增检查使用原任务的剩余时限与原 owner，不重置预算、截止或修复机会。

## 4. 固定输入与单条选择

### 4.1 主机选择，不能由模型扩缩

新增内部 `classic-entry-selection/1` 元数据，作为可选 `classicEntry` 字段随原 draft 显示、保存、确认并进入 requirement capture。只由 `createProductHost.draft` 在原设计访谈结果之后补入；模型返回字段的严格白名单不开放该字段，CLI 没有设置任意 measurement 或文件路径的参数。字段仅在已有 classic benchmark 被选择时合法。

选择元数据至少包含：reference ID、reference/catalog 的固定字节签名、选定 measurement 的完整源记录或 `null`、所引用证据文件的固定引用与字节签名、未选中原因。源记录携带的标签和值只供准确显示；执行时仍从相同捕获字节重新核对，不能把 draft 的副本当作独立事实来源。复用既有哈希和 ArtifactReference 工具，不增加签名体系。

选择顺序固定为 `catalog.measurements` 原始顺序中的第一项满足下列第1、2项结构条件的记录，选定后再核对第3项文件条件：

1. `status === verified_for_reference`，`tolerance === exact`，`value` 是有限数，`metric/unit` 非空。
2. `entryId/entityId` 存在且满足原 validator 的类别约束；同一 reference ID 下双类证据分别覆盖 measurement 所属条目和对象。
3. 所选证据有受信任来源文件可供捕获和独立阅读。结构校验通过不代替参考事实审查。

最多选一项，模型不能指定更容易的一项、追加第二项或因执行失败换项。第3项不满足，或选定后证据丢失、路径越界、字节变化，均直接阻止准入，不能跳到下一项。增加事实、修改资料或改变选择需要新的准确 draft 来源，不能迁移旧确认。目标UI sidecar在原设计任务中可以修正；捕获后变更须有新的固定设计版本及独立审查，不能侧载替换同版本plan或复用旧候选的观察。

当前目录为空时固定记录 `measurement: null`、`reason: no_reference_measurements`。有记录但没有已核实的 exact 数值时记录 `no_verified_exact_measurement`。这两种情况不请求设计 sidecar，不调用新增 `io.play`，条目正常输入结果是 `not_executed`，完整报告仍为 partial。不能生成占位事实或把未知写成 0。

单个 measurement 已核实不要求整个目录冻结，也不要求它所属的汇总条目已全面核实；原 validator 已允许这一区别。旧两政策的 230/221/9 守卫保持。未来目录展开或冻结与该守卫不再兼容时，需单独设计旧 profile 的迁移，本片不放松它。

### 4.2 参考事实与目标 UI 分工

参考事实来自已独立核对、固定版本的 reference/catalog 和原始观察/确定性证据。目标游戏的设计作者只提供 UI 操作和定位；它不能提供或覆盖参考数值、单位、容差、来源状态或目录分母。

当 `measurement !== null` 时，设计任务增加一个准确写入文件 `authors/design/classic-entry-plan.json`，与原 `design.json` 同次捕获和独立设计评审。sidecar 为：

```ts
interface ClassicEntryPlan {
  formatVersion: 'classic-entry-plan/1';
  measurementId: string; // 必须等于主机已选定的事实
  acceptanceId: string; // 原已确认 gameplay 条目之一
  inputs: Array<Extract<Step, { kind: 'mouse-click' | 'mouse-move' | 'locator-click' }>>;
  observation: { kind: 'text'; selector: string };
  timeoutMs: number; // 沿用原 assert 的 1..60000 范围
}
```

这里复用现有 Step/Observation 语法。输入总数为 1..199，至少一次鼠标点击；不能包含 assert、脚本、debug、存档注入、循环或新的动作类型。被观察元素的可见文本必须是该数字的 `String(value)` 形式；本片不引入解析表达式、单位换算或模糊比较。设计还须在原说明中指出对象、指标及对应可见控件，独立 reviewer 检查语义对应，不能只信选择器名字。

`acceptanceId` 只关联原已确认需求与失败反馈，不要求它等于 `entryId`，二者相等也不证明参考事实。目录 entry/entity/metric/unit 均由 host 根据 measurement ID 得到。计划从正常新浏览器上下文开始；不能继承旧 persistent profile 或注入解锁状态。无法在本片支持的正常路径内到达该控件时保留 `mapping_missing` 或明确不支持原因，不换事实、不降低原需求。

无可执行事实时不扩设计任务写权限；不得提前写全经典关卡、解法或游戏实现。

## 5. 生产 caller 与证据闭包

### 5.1 来源及设计捕获

`src/cli/index.ts → runProductSession → createProductHost.draft` 在原用户确认前绑定 selection。`createBrowserHost` 继续创建旧 classic policy scope，并使新 consumer 使用同一 reference/catalog 捕获。默认 source root 仍是仓库自有 `benchmarks/classic-pc/reference/`。

来源读取可有一个仅可信 host 使用的源目录参数，便于 SOURCE 测试在 TEMP 构造独立资料副本；它不进入模型、draft 或公开 CLI。原两政策和新 consumer 必须读同一组固定字节，不得测试时只替换一半。生产默认源目录没有任何合成 reference 行。

新增参考证据文件只允许在该 source root 的 `evidence/` 下以安全相对路径引用，使用既有 regular-file/path 检查，拒绝绝对路径、越界和符号链接。保留原观察出处，捕获实际字节；这些是评审证据，不进入生成游戏的媒体目录。已有安装目录始终只读，不能提取原美术/音频充当目标资产。

原设计自检可增加这个固定 sidecar 的只读检查；最终捕获和独立评审仍各自核对。编码任务在原输入闭包中读取该固定设计和参考事实，不能修改捕获。候选发布前登记 `classic-entry-mapping/1`：绑定 source、requirement、design、候选引用、run/task/attempt/spec 与完整 sidecar，不形成 candidate 依赖自身的循环。

### 5.2 独立计划与实际执行

`entrypoint-host.ts` 的 coding verification 在原 `registry.verifyCandidate`、构建/打包与 `withCleanDelivery` 内执行：

1. 原 generic save/reopen 及 media 检查按原路径执行一次，旧 STARTUP/OFFLINE 不从新检查推断。
2. 只有原检查有效、固定单条输入完整且原 deadline 尚可执行时，host 根据 mapping 创建独立 `AcceptancePlan`。它包含全部 sidecar inputs，再追加一个 source-owned assert。assert 的 expected 为 `String(sourceMeasurement.value)`，acceptanceId 为已确认映射 ID；viewport 来自原确认输入。
3. host 填入当前 candidate、project/task/run/spec、唯一 report ID 与 clean server URL；这些字段及期望值不接受模型覆盖。调用原 `io.play(plan, signal, authority)` 恰好一次，不把旧 raw 当成新执行。
4. 原 `io.play → runAcceptance` 负责普通浏览器、输入、截图、视频、日志和退出。新 consumer 不启动第二个服务器、owner 或执行器，也不调用模型；它只使用这次正常 runner 的原始结果。
5. 在 clean delivery 的 finally 完成后，旧政策和新逐项报告分别发布；新报告必须先于 verify 返回、独立 review 和 journal 封存。

无 measurement 时走第5步的明确未执行报告，不新增浏览器。构建、原 save/reopen 或截止失败时不开展后续独立检查，记录实际阻止原因。新 consumer 不将原失败升级成通过，也不因缺参考依据触发新付费修复。

保存原generic结果与新增观察结果两份局部结果。`withCleanDelivery`仍接收原generic结果，确保其原`acceptancePassed`字段和旧STARTUP含义不因一个独立数值断言失败而改变；新增检查的可信失败保存在自己的报告，待finally结束后才与旧结果合取，决定候选是否通过。该清理回执不能单独代表新增检查或完整经典通过。共享服务器/清理本身发生真实故障时，旧政策仍如实失败，不维持虚假的历史成功。

### 5.3 认证原始结果

新 consumer 复用 `diagnoseBrowser` 的失败分类，并核对自己的原始 plan/report 字节。普通 `io.play` 报告没有 persistent session 身份，不能直接套用要求该身份的 `verifyPersistentSegmentEvidence`。

接受正常输入观察前至少检查：

- reference/catalog/证据 capture、原 confirmation、design/sidecar、mapping 与当前 candidate 及实际工程字节仍对应同一来源。
- 返回 plan 与主机计划逐字段相同；raw `plan.json` 和 `report.json` 与该计划、返回报告一致。report ID、路径、run/task/spec/candidate 和原 deadline 均匹配。
- 全部输入实际送达，可信 assert 在点击之后完成，观察有实际次数且值符合 expected；浏览器版本、viewport、异常和退出事实符合原 normal runner 语义。
- 当前 raw 所列截图、视频、日志存在且非空，断言截图是实际有效 PNG；来源路径全部位于原 evidence root。生命周期、raw 或绑定缺失归为 `insufficient_evidence`。
- 对具有健康执行事实的可见数值不符保留 `failed/code_defect`，交给既有失败诊断和原有界修复；因参考资料、映射或工具不可用而未执行不得伪装成作者数值错误。

新增 raw 目录、固定 mapping、参考证据和逐项报告进入既有 `consumerRawEvidence`，被复制到独立 review workspace，并被原 TaskJournal 的 verified/review signatures 覆盖。新断言截图进入 reviewer 的图片列表，必须保留一个名额，不能被原前后各四张的抽样截掉。reviewer 检查目标 UI 是否真的展示所选对象/指标，防止标签或常量文本冒充机制事实；即使认可观察，也不能提升机制结论。

在新选择启用的候选 promotion 前，核对原 verified/review journal 的签名和对应审核身份，复用当前 host 中已有的 journal 校验方法。恢复时同样复用该来源链；不能重跑已封存观察、补造缺失 raw 或按当前安装内容替换旧输入。历史未启用 consumer 的任务走原路径。

## 6. 全目录报告与失败含义

新增 `evidence/<taskId>/classic-entries.json`，格式 `classic-entry-report/1`，顶层始终 `acceptance: partial`。该文件和旧 `classic-policy.json` 各有明确用途，不改写旧格式。

以捕获的完整 catalog 为唯一分母，逐行保留原 ID、顺序、分类、参考状态及要求；不按 mapping 过滤。当前仍为230行，不把230当成未来已冻结总数。每行含：

- `mapping`：missing/defined/invalid，以及所选 measurement/entity 与目标计划引用。
- `normalInput`：not_executed/passed/failed/insufficient_evidence，原计划、raw 和对应 assert 位置。
- `mechanism`、`valueImplementation`：均为 not_executed；PERFORMANCE、无尽与其他未执行政策也不升级。
- 参考未知和其他 gaps：原样保留。`normalInput: passed` 与 `referenceStatus: needs_reference` 可以同时存在，不能合成为 entry passed。

最多只有所选 measurement 所属行具有新增观察；其对象行可有明确交叉引用，但不重复计作另一项通过。未映射和其他事实继续列出，不求平均分或通过率。旧 STARTUP/OFFLINE 的当前结果只以原报告引用保留，不能用本片观察重新计算。

数据无事实时写 `no_reference_measurements`；有事实而未选中写 `not_selected_by_single_measurement_slice`；设计不可达/缺失、原前置执行失败、deadline不足、raw失配分别写明原因。来源或目录被改时，使用已捕获的完整可信快照保留分母并记不足；若初始可信快照根本无法建立，主机初始化失败，不能自造一份成功报告。

新增可执行检查失败或证据失配时，当前候选不得 promotion。全部当前检查通过且独立 review 批准时，允许原有范围内的 candidate promotion；`host.finish` 仍返回完整经典未完成的 gap，`executeGeneration` 仍是 incomplete，正式报告不能成为自动完整通过或用户体验待批准。零测量的诚实未执行本身不另造一次失败修复。

## 7. 最少文件与工作划分

这是一个有顺序依赖的源码任务，使用一名 implementer、另一名独立 reviewer 和本批唯一 merger，不拆成多人同时修改 host。Root 在设计审查后指定身份和源码授权；稳定任务 ID 另由 Root 登记。

| 文件 | 必要职责 |
| --- | --- |
| 新 `src/runtime/classic-entry-input.ts` | 固定选择、参考证据输入、sidecar 检查和既有 AcceptancePlan 的组装。 |
| 新 `src/runtime/entrypoint-classic-entries.ts` | 当前候选的执行结果认证、完整目录报告与证据引用。 |
| `src/runtime/entrypoint-classic.ts` | 仅复用同一可信 source root/捕获读取接口；两政策 mapping、validator 和结论保持。 |
| `src/runtime/entrypoint-host.ts` | draft绑定、design固定写范围/捕获、真实io.play调用、原证据/review/promotion闭包。 |
| `src/runtime/entrypoint-design-check.ts` | 有选定事实时只读检查固定sidecar；复用同一validator。 |
| `src/roles/requirements.ts`、`src/cli/session.ts` | 接受host生成的可选选择元数据、确认前准确显示与原来源恢复；不新增用户flag。 |
| 新 `tests/runtime/classic-entry-input.test.ts`、`classic-entry-host.test.ts`、`classic-entry-host.integration.ts` | 输入、真实caller/闭包、一次原生SOURCE代表与定向负例。 |
| 新 `tests/cli/classic-entry-session.test.ts`；必要最小扩展 `tests/runtime/generic-persistent-host.fixture.ts` | 确认前来源绑定/legacy恢复，TEMP合成参考与固定sidecar夹具。 |

不修改目录事实、普通 runner 语法、媒体采样器、调度器、预算代码或实际运行资料。若实施发现必须超出此范围，先带具体调用证据交 Root 处理，不自行扩成完整基准框架。

## 8. 验收与外部输入

实施验证按[计划](../plans/2026-10-16-classic-entry-acceptance.md)执行。核心代表必须证明真实host caller调用独立原runner，拥有独立plan/raw，而非复用save/reopen报告；证据确实进入独立review与journal。禁用输入、错误期望、候选/plan错绑、缺raw、重复/未知mapping和删catalog条目都不能产生新增观察通过。旧STARTUP/OFFLINE、未选classic、legacy和已完成只读分支保持。

SOURCE使用TEMP合成参考事实和小型既有UI夹具，明确标注 synthetic reference、fixture author/reviewer、模型调用0。真实编译、浏览器输入和原始文件事实另列；这些结果不是参考观察、Cosmos生成游戏或最终用户接受。不得编写手工完整经典游戏。

外部观察沿[原契约](../benchmark/observation-contract.md)：同一reference ID、对象与指标、正常输入原始证据和确定性规则证据、测量方法/单位/误差、独立审查。被本片消费的最小新增资料是一条真实核实的 exact measurement 及其双类证据，按第5节发布为可捕获的安全路径。当前尚未取得可留证的参考观察；取得并独立核对前不填该事实。静态名称/属性调查直接复用，不重新推断有效玩法。

完整参考冻结、全名册和交互闭合、生产模拟及数值比较、性能设备/工作量/时长、无尽30分钟与增长规则，都仍是后续缺口。原观察契约、55/30 FPS和完整内容要求保持。

## 9. COS18、COS15与最终human的证明阶段

文档应区分三个事实：COS18公开入口取得真实需求确认并固定版本；COS15在完整前置满足后实际生成并完成客观验收；用户对同一最终交付版本试玩确认。普通源码fixture或operator决定不能代替第一或第三个事实。

G4与COS18卡存在“入口验证借COS15/16取得实际证据，而COS15启动又依赖COS18”的表述闭环。后续Root可明确入口可用性的前置证据与完整运行结果的回填时机；不能删除COS15对COS01/COS14/COS18的依赖，不能只用本片SOURCE结果关闭COS18，不能提前放行G4。本草案不改原任务映射或状态，也不代填任何human决定。

最终仍沿 `src/cli/experience-session.ts` 和 `src/runtime/experience.ts` 的真实stdin、精确candidate/report绑定及自动验收守卫；本片partial报告不能绕过它们。
