# COS61 准备模式首个显式编码追加窗口实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本卡由专属 implementer 实施，独立 reviewer 审规格与质量，batch08 唯一 merger 集成；本计划提交后须取得 `PLAN_APPROVED` 才写源码。

**Goal:** 让原 human 推箱子准备运行在 design/art 已独立通过、恰一个有效 coding 目标未完成时，经真实 stdin 确认首个追加窗口，在新编码尝试中复用原地图与素材，并能恢复同一窗口。

**Architecture:** 复用原 quote、真实确认、窗口激活、统一账本和 DAG executor。原两个 passed 阶段只提供可认证的历史来源；新增独立 human continuation scope，固定唯一 coding task/candidate、两张当前审计计划、明确 primary 计划与当前执行闭包。当前计划引用先进入 immutable ContinuationPlan 和 prepared task/context，之后封存 origin、注册任务并派发；原 human 回执不覆盖。

**Tech Stack:** Windows、Node 22、TypeScript、原生 pi/Flash、ArtifactRegistry、TaskJournal、RunController、生产 transfer consumer、既有编译自检、Node test runner；新增验收仅 source/TEMP 与 fake SDK。

---

## 批准输入与当前边界

- 任务卡：[COS61 / #62](https://github.com/lrfluobida/Cosmos/issues/62)，id5708959437；Root 已发布并精确读回。计划读取 Root `batch08-source60-ready-records` 的任务卡候选 `59c2a3ac1dda979da77b04aa9af017a7319f32ae`，其文档整合独审与本卡源码审批分别记录。
- 基底：批准 main `5a15510a1201482d9fa629096a17449463176d31`。复用 managed worktree `E:/CodexData/.codex/worktrees/cos-05-cli/Cosmos`，从 clean COS58 `6137cd77940953ab795f2b427e759625330a602d` 新建 `codex/cos61-preparation-coding-continuation`；旧 COS58 分支与证明保留。
- 已读 `AGENTS.md`、`CONTEXT.md`、`docs/specs/cosmos-spec.md`、COS18/53/58/61 卡及 COS58 实现计划。COS58 已审 `6137cd7` → `1d300b3`；COS59 已审 `b912f0e` → `4139a82`；COS60 已审源码已在本基底。依赖使用 source stage，不要求未完成的 COS16/COS18 或完整经典基准先 closed。
- 本计划阶段只新增此文件并提交，不跑测试、模型、浏览器、build 或服务。后续测试只用 TEMP 合成资料；不读取 Root `.cosmos`、凭据、真实 sessions、账本或参考安装，不 push 或合 main。
- 真实 C6 unknown974882 micro-CNY、65 closed grants/11 audits、closure12 未执行与真实 C7 NONE 保持。共享验证 ¥150/首阶段 ¥30/COS16 原 ¥10、案例 ¥5/45min/80、formal 原 ¥200/12h 和目标 ¥100/6h 均不改变。
- 本卡只接首个显式窗口；design/art 未 passed、无有效 coding 目标、多个有效目标、第二次追加在显示可确认报价和激活前拒绝。最终试玩等待计时阶段另卡。

## 固定契约与最小文件归属

新增源码集中于两个有限模块，不拆原执行器或改写 operator 历史复用体系。

| 文件 | 责任与必要变更 |
| --- | --- |
| `src/runtime/continuation-preparation.ts`（新） | 只读识别已保存 human `cos16-input/1`，认证原两个 passed 阶段及唯一有效 coding source；派生固定当前引用和 ContinuationPlan 的 preparation 字段。不能建 listener、任务、origin、grant 或用户确认。 |
| `src/runtime/entrypoint-human-continuation.ts`（新） | 当前窗口的 source/task binding 回执、scope、原 lineage 复核和当前任务映射；不复用 v1 活动权限，不转换 validation profile。 |
| `src/runtime/continuation-quote.ts` | 准备模式报价前执行有限准入，绑定原 human 模式、需求、execution、source/tasks/prepared/origin 等实际回执字节；默认 browser quote 路径不变。必要时有限导出已有有效 repair mapping 读取，避免另写不一致解析器。 |
| `src/cli/index.ts`、`session.ts`、`continuation-session.ts` | 用严格有限准入替代准备模式统一拒绝，保持公开参数与实际 stdin；确认前后重新核验准确 quote 和原来源，窗口恢复严格匹配。 |
| `src/runtime/continuation-plan.ts` | 可选严格 preparation descriptor；固定当前计划 refs 和 coding context/interfaces、rules、来源摘要；每次 derive 一致，不派发后 append。保持原 task.inputs 与 dependency topology。 |
| `src/runtime/entrypoint-human-preparation.ts` | 有限导出已审实际执行 source 捕获/校验帮助器，原 receipt 格式与 v1 scope 保持；当前新模块、动态入口及 worker 必须纳入实际 source/compiled 闭包。 |
| `src/runtime/entrypoint.ts` | 按保存模式校验 continuation draft；createHost 后 await prepared binding，再认证/封存 plan/origins/注册/执行；await preparation cleanup 后完成 owner idle 收敛。 |
| `src/runtime/entrypoint-host.ts`、`entrypoint-preparation.ts` | 显式 human continuation factory/context，有限 current binding 分支；旧 passed recoverCapture 与 current dispatch 分离；候选版本来自完整绑定，编译工具/consumer/reviewer/promotion沿原路径。 |
| `src/runtime/adapters/transfer/runtime-host.ts` | 当前 single-candidate 模式，读取原 frozen map 与素材，生成/验证当前两张计划；显式选择 primary，不从 version 字符串猜角色/权限。 |
| `src/runtime/adapters/transfer/loopback-origin.ts` | 新明确 human continuation binding 和 code-owned receipt location；当前 origin/端口独立持久化、冷恢复复用、await close。原 null-window receipt 分支保持。 |
| `tests/cli/public-preparation.test.ts`、`tests/cli/continuation-session.test.ts` | 参数/真实命令与合成 stdin、scope 拒绝、准确 quote、无确认/陈旧、冷恢复与 stop。 |
| `tests/transfer/human-continuation.test.ts`、`tests/transfer/human-continuation.fixture.ts`（新） | 复用 COS58 human fixture/fake SDK，组合一次 current coding、原两 passed、双计划、consumer、评审、promotion，及代表恢复/篡改。 |
| `tests/runtime/continuation-plan.test.ts`、`tests/runtime/human-preparation.test.ts` | 新 preparation descriptor 与旧 v1/default binding 保真；已有恢复测试复用。 |
| `README.md`、`docs/development/quickstart.md`、本计划 | 准确说明有界首个 coding 窗口、原结果与新增费用/时间、当前恢复命令及 fixture 证据。 |

`continuation-inputs.ts` 默认无需放松：原 task.inputs 与两张旧 design plan 仍是历史依赖；新增当前计划作为严格的 context.interfaces。若现有输入校验实际拒绝这一明确 descriptor，只允许增加与 descriptor 完全相等的有限验证分支，并加拒错映射 RED/GREEN；不得允许任意额外 task.inputs。`design-validation.ts` 的原活动 `seal` 不用于停止后的历史阶段认证；有限历史 audit 核验放在新模块，避免给旧设计作者活动 authority。`binding.ts`、`runtime-acceptance.ts`、预算/provider/编译工具算法优先原样复用。

## 当前 descriptor 与回执

下列为 source-owned 类型形状，字段在实际实现中使用现有合同类型；严格校验 key、引用、摘要与完整等值，不接受模型选择、任意 path 或 caller 注入映射。

```ts
interface HumanContinuationPreparation {
  formatVersion: 'human-continuation-preparation/1';
  adapterId: 'cos16-input/1';
  runId: string; ledgerId: string; windowId: string; decisionId: string;
  sourceTaskId: string; taskId: string;
  candidate: ArtifactReference; // registry.candidateRef('game', window.windowId)
  plans: [ArtifactReference, ArtifactReference]; // plan-v1/plan-v2, version=windowId
  primaryPlan: ArtifactReference;
  originalPrimaryPlan: ArtifactReference;
  originalSources: { path: string; sha256: string }[];
}
```

- `ContinuationPlan.preparation` 仅在严格识别保存的 human preparation 且满足卡范围时出现。默认 browser 的格式与派生保持。
- 唯一新 candidate 和两张 current plan 都绑定同一准确 coding task/run/confirmed acceptance。第二张计划保持原双计划读取与审计契约；没有另一 candidate/task/grant，也不授予修复或第二次尝试。
- 有效 source 为原 coding 时，`originalPrimaryPlan` 必须是原 v1 计划；为已登记 coding repair 时，必须通过原 repair-plan 的完整 task/output/alias 证明，选其原 v2 计划。新 `primaryPlan` 明确指向当前第一张引用；不能把 old v1/v2 candidate 元数据当成当前候选。
- 两张 current plan 的八段动作、expected、六 T16、checkpoint 规则保持原固定地图的确定性结果，并与原两张计划的 steps/expected 对照。允许变化仅限当前 task/candidate/report/origin/ref 元数据；不借本卡改变地图、观察、规则或验收分母。
- 新 coding `task.inputs` 保留已认证的原依赖版本；`context.interfaces` 在纯 derive 阶段增加准确两张 current plan refs，`context.rules` 明示 current primary、source mapping 和 autorepair0。原 rule/interface 保留。当前 plans 进入作者/reviewer 的 interfaces 与 inputFiles、origin prepared contract、输入保护/编译自检签名、host 完整 evidence content signature及恢复检查。
- 当前回执固定于 `continuations/<decisionId>/human-source.json`、`human-tasks.json`、`transfer-prepared-inputs.json`、`transfer-origin.json`；固定位置从已校验 decisionId 派生。原根目录 human source/tasks/prepared/origin 和 journal/capture 字节与 mtime 不改变。
- source 回执明确 `formatVersion:'human-continuation-source/1'`、run/ledger/window/decision/quoteId、原 source receipt 摘要、确认 source 实际 sha256、完整 current execution closure 和 descriptor。task 回执明确 `formatVersion:'human-continuation-tasks/1'`、source digest、完整 preparation descriptor 与固定 plan.tasks。
- 当前 scope 校验原 ¥200 ledger.limit 与已明示 authorizations 的 effective limit，精确当前 grant/deadline/stop，拒绝 unknown、尚未收敛 reservation、source drift 和错 scope；不修改原 stop/deadline。当前一次调用中的合法新请求 reservation 由原预算控制器处理，不能误把它当旧未对账费用，也不能给其额外准入。

## 原 passed lineage 的认证

1. 从保存的 mode、原 requirements confirmation、execution/native plan 和已登记 repair mapping 得出三角色与有效 source；不信任 taskId 名称或 acceptanceId 单独推断角色。
2. 原 design/art 必须属于该原 run/ledger/完整 confirmed requirement，状态 passed、独立 approved review、完整固定 inputs/outputs/topology；所有 author/capture-started/capture/verify-started/verified/review-started/review 回执与 origin 保持一致。复用 `TaskJournal.open(..., true)`、`requireOriginalTask`、signature/evidence 检查，不制造丢失回执。
3. 原 design 四输出、art 一输出及依赖实际 inventory/bytes、media manifest/provenance、frozen binding、原两张计划和原 prepared receipt完整核对。两份 semantic check允许原一次合法 rewrite：核对 check1/check2 的 raw/start/result/hash/previousReceipt、original null-window authority 与原截止范围，最终成功 raw 等于 frozen map；不调用当前 `executionAuthority(oldDesign)`，不再读写旧作者会话。
4. 原 human source/tasks/intake-mode/需求确认实际 bytes 必须匹配封存来源。原 source execution receipt保持历史身份；本卡保守要求安装的原执行闭包仍能认证，不隐式迁移来自更旧/不同安装版本的运行。当前闭包另封存并在恢复、工具、consumer/promotion前复核；两者不能互相替代。
5. `HistoricalPassedStages` 的 operator_validation manifest/import 不用于 human。此处原 artifacts 已在同一 registry，不复制 C5/C7、不重跑 planner/design/art/其 reviewer、不新增其费用或通过结论。

## 顺序、恢复与拒绝

1. `continue --quote` 严格参数解析后只读准入：原正式 v1 已停止/到期、unknown/reserved0、twoPASS + exactonecoding、已认证来源。报价将准备模式实际来源摘要加入 auxiliarySources，保留原 snapshot/revision/金额/时间/repair mapping。命令不获取运行锁、不写文件、不准备服务、不调用模型。
2. 交互 continue 沿原 owner/child quiescence 和 host.prepare，显示完整准确 quote。只有真实 stdin 的 `confirm <quoteId>` 保存新决定；EOF/cancel/错误确认不激活。确认后重新核验 quote 和原 preparation 来源，任何变化拒绝；不接受文件/模型自确认。
3. 原 `activateContinuation` 原子 v1→v2、旧 grant closures、唯一新 grant与新 deadline。只授权一次新 coding attempt；原结果始终 `not_met`，追加成功单列 `awaiting_user_experience`，用户体验未确认。
4. 纯 `loadContinuationPlan` 先得到固定 descriptor/current refs/context。factory 核对当前 authority，建立或读回当前 source/task scope，认证旧 lineage；只当前 listener 及固定 plan captures属于当前 host effects。
5. 在新 origin、任务注册及任何作者 context/signature/SDK 前：当前 origin明确 window/source；从固定 map生成并封存两张 current plans；`await host.bindPreparedTasks(plan.tasks)`核对完整 descriptor。`prepareContinuationPlan`重新 derive相等、认证旧 journal/证据，写 immutable plan、新 origins 并原子注册。之后唯一 current coding开始。
6. 计划仅派生 refs时没有地图/素材生成；当前计划制作是已审 oracle 的确定性转换。candidateExtraInputs显式选 current primary；capture/build/八段persistent consumer/media/独立review/promotion完整保留，当前coding编译自检使用新 workspace 和 authority。
7. 激活后 plan 前可凭 stored window重建同一确定性 binding；current source/origin/plans 存在时只读复核相等。若 plan/origin部分封存但尚未注册，只补缺少且可认证的固定项；注册原子边界沿原机制，不伪造部分登记的缺失 origin/plan。
8. cold resume只接受当前 `windowId`，保留 deadline/ledger/确认/两 passed bytes；完整完成后零额外 SDK。缺 request/phase receipt或unknown不重发；失败的一次尝试不重启，不自动 repair。`resume`未选 window、错 window/额外continue均免费拒绝。
9. stop与返回路径先停止派发，await受控 work/child与 preparation listener关闭，再发布可信 owner idle/ACK。setup失败、verify失败、正常结束和持久stop均使用既有关闭幂等性，不能先报告成功再异步清理。

## TDD 与分步提交

以下是同一卡的实现顺序，由同一 implementer 负责；本轮仅提交计划，所有复选项待 `PLAN_APPROVED` 后执行。每一段先定向 RED、再最小实现、定向 GREEN；新增 source/TEMP组合只跑一次，修正影响的情况才重跑。

### 1. 有限准备模式报价与固定来源

- [ ] 在 `tests/cli/public-preparation.test.ts` 更新旧“统一拒绝”测试：合法 twoPASS/onecoding 首个 quote可读；设计/美术未通过、多个/无目标、validation、second-window、unknown/reserved、错mode和missing原proof拒绝，snapshot/原文件bytes/mtime与prepare/SDK计数不变。
- [ ] Run `node --experimental-strip-types --test --test-name-pattern="preparation.*continuation|coding.*quote" tests/cli/public-preparation.test.ts`；期望新合法scope因当前拒绝而 RED，非法scope已有拒绝不作为RED证明。
- [ ] 新增只读 `continuation-preparation.ts` 和quote auxiliarySources接线，有限替换CLI统一拒绝；重跑同一测试为GREEN。确认前后原source变化也使quote失效。
- [ ] Commit源码与测试：`feat: gate the first human preparation coding quote`。

### 2. immutable descriptor 与当前 human scope

- [ ] 在 `tests/runtime/continuation-plan.test.ts` 和新 `tests/transfer/human-continuation.test.ts` 写原coding与registeredrepair source的plan mapping代表：唯一candidate、两currentplans、originalPrimary对应、interfaces提前封存；拒错task/候选/primary/planref、缺originalaudit或source闭包漂移。
- [ ] Run `node --experimental-strip-types --test --test-name-pattern="human.*binding|preparation.*plan|registered.*repair" tests/runtime/continuation-plan.test.ts tests/transfer/human-continuation.test.ts`；期望descriptor/factory缺失或当前v1 scope拒绝导致RED。
- [ ] 加严格可选descriptor、纯derive与独立current scope；有限导出source帮助器，原source回执shape保持。按需扩展固定current context，不放松默认inputs/topology。
- [ ] 新scope current source closure覆盖CLI continuation动态入口、新helper、roles/factory/provider、runtime-host/consumer、coding-check-worker、acceptance/process/runner/persistent及实际pi/typebox/Playwright入口与manifest、已加载浏览器implementation、实际tsc/Vite相对执行闭包和工具锁；参考COS58与COS60的明确seed，不扫描整个仓库/vendor，不引入probes生产依赖。
- [ ] 重跑上述代表为GREEN；Commit：`feat: seal human coding continuation authority and plans`。

### 3. 当前 host、consumer 与公开组合

- [ ] 扩展COS58 fake SDK fixture，原synthetic design/art通过后保留其proof；唯一新coding在current isolated workspace产生TEMP synthetic输出，经existing consumer fake IO/独立review/准确promotion通过，断言planner/design/art/旧review0新调用、oldauthor partial未复制、original结果/原费用前缀保持、所有新增requests窗口正确、automaticrepair0。
- [ ] Run `node --experimental-strip-types --test --test-name-pattern="first human coding window" tests/transfer/human-continuation.test.ts`；期望默认draft校验/host绑定/v1v2候选限制导致RED。
- [ ] 接通explicit human continuation factory、binding/taskWorkspace、current source/双plan/primary/loopback、 awaited bind、compiled advisorytool和consumer。真实pipeline使用合成stdin完成continue→resume--window；不增加模型选择入口、不预制生产game/map/assets。
- [ ] 重跑该source/TEMP组合为GREEN；断言两currentplans的steps/expected与原对应plans一致，所有build/persistent/promotion的task/window/deadline精确。Commit：`feat: run one preparation coding continuation through the public host`。

### 4. 恢复、篡改与停止的受影响代表

- [ ] 复用continuation-session fixture机制注入激活后plan前、source/origin/plans后、plan/origins后但注册前的中断；cold恢复同一binding。已有原子注册/部分注册缺origin拒绝证据复用，只增加准备模式连接点与合法恢复一组。
- [ ] 拒绝originalsemantic raw/result/signature、current source/plan/interface/origin/candidate、wrong primary、unknown或ownerchild未收敛代表；输入/计划变动必须在SDK前拒绝。新attempt已失败或response receipt缺失不得重新请求。
- [ ] Run `node --experimental-strip-types --test --test-name-pattern="human.*resume|human.*drift|human.*stop|human.*unknown" tests/transfer/human-continuation.test.ts tests/cli/continuation-session.test.ts`；未实现恢复/await清理时RED，局部修复后GREEN。
- [ ] listener关闭和已持久child收敛前不能发布idle/ACK；cleanup后可重新绑定同一端口，旧origin receipt不改。Commit：`fix: preserve preparation window recovery and owned cleanup`。

### 5. compiled代表、文档与交付

- [ ] 一个fresh TEMP compiled公开入口代表，复用已构建的sourcefixture行为：执行真实dist host/factory、准确stdin、当前binding与同window cold恢复，实际record `variant:compiled` 与执行`.js`闭包。compiled关键helper/实际SDK入口、Playwright内部实现、tsc/Vite相对执行文件分别做小型drift拒绝代表；需要改字节的dependency代表使用隔离TEMP副本和该进程真实解析入口，禁止改共享node_modules或已批准source。不重复26分钟/Edge测试。
- [ ] Run `node --experimental-strip-types --test --test-name-pattern="compiled human coding window" tests/transfer/human-continuation.test.ts`；compiled动态路径遗漏应RED，修复明确seeds/分支后GREEN。真实SDK网络、browser和nativecompiler仍NONE，fakeSDK/IO明示。
- [ ] Run `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`；期望exit0。涉及interfaces与host新增类型需本次strict；原编译自检/预算/Edge全矩阵未变化的证据复用。
- [ ] 仅运行受影响CLI/human preparation/continuation plan测试文件的一次合并检查，记录test数量、skip、时长与exit。已有TDD GREEN不重复逐项审计；失败后只重跑受影响代表。
- [ ] 最小更新README/quickstart；精确说明twoPASS/onecoding范围、真实quote确认、autorepair0、原200/12成绩与新增明细。UTF8严格解码、中文readback、LF/原行尾及 `git diff --check`；所有不相关中文保持。
- [ ] Commit：`docs: describe the first preparation coding window`。报告最终exact SHA、文件清单、RED/GREEN与组合/compiled/strict证据和已知差距给Root；专属reviewer审actualdiff，问题由implementer修复并复审，唯一merger集成与push。

## 已知风险与审查重点

- 当前context.interfaces方案必须贯穿author inputFiles/保护路径、origin、compile signature、host evidence signature和恢复；只把ref写入plan但context没有读权限或后续签名遗漏都不符合卡。
- 原registeredrepair可能改变任务ID、candidate与原selected plan；只允许原合法单批repair mapping，拒绝不完整alias/源plan错误，不继承旧partial作者文件。
- 历史design audit允许原合法第二次semantic check，但不能凭自报passed、单一digest或snapshot passed替代全部原独立证据；当前v1活动seal不适用于已停止旧task。
- 现有human scope因原安装source漂移拒绝恢复，本卡保持这一保守限制；跨平台版本的历史运行迁移不在本卡。单独封存current closure不能消除原source无法认证的事实。
- current listener/plans/source写入可能早于immutableplan，恢复必须核验其固定身份后补缺，注册后不能制造缺失回执。关闭时须await listener而非仅依赖signal callback。
- offline结果只记录`source-and-TEMP-only/offline-verified-awaiting-human`；真实human、paidC7、closure12、COS16迁移和最终完整classic/体验均另行验收。本计划完成不代表`SOURCE_READY`。
