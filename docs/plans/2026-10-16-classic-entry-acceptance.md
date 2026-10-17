# 经典条目正常输入检查 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement the single work package below after Root authorizes source work. Use a dedicated implementer, an independent reviewer with separate context, and the batch's sole merger. Steps use checkboxes; this draft author is not authorized to implement them.

**Goal:** 从固定参考事实组装一条独立的正常输入计划，接通真实生产caller、原runner、原始证据与完整目录partial报告。

**Architecture:** 采用[设计草案](../specs/classic-entry-acceptance.md)的独立内部consumer。旧STARTUP/OFFLINE保持；主机固定最多一个已核实exact measurement，设计sidecar只提供目标UI操作/定位，实际`io.play`执行后进入原review与journal链。当前无measurement时明确未执行，不补合成生产事实。

**Tech Stack:** TypeScript、现有Pi角色与ArtifactRegistry、原normal/persistent Playwright runner、TaskJournal、Node test runner。无新依赖、DSL、scheduler或账本。

---

## 状态、基线与实施前置

设计 `772ce6180a73ef436b2efba411c4b5d25e9519ee` 已由 `classic_entry_design_reviewer` 独审 `APPROVED_DESIGN`；本计划SOURCE已完成、独审并发布，标记 `CLASSIC_ENTRY_NORMAL_INPUT_SOURCE_READY`。[COS-104 / #105](https://github.com/lrfluobida/Cosmos/issues/105) 已closed(completed)，原生父 COS14/#15 仍open、对应子项已勾选。初始源码 `806bec6ce454f8164860db323bb110b02ab5befc` 的唯一P2已闭合，最终发布SHA为 `d0773acbdcbac24f5865d41ba7f32246836a58cd`，`classic_entry_reviewer` 最终批准 `APPROVED_SOURCE_SCOPED`；专职 implementer `classic_entry_implementer`、唯一 merger `batch_classic_entry_merger`。原设计基线 `2f84eb328e59f20d73ceccdc69ff708f7be200a5`、实施基线 `7d02729370c6379f0377f7cd42a68672613894b3` 保持，actual/paid 未授权。

- 原设计阶段仅写本计划及配套spec；SOURCE已按下列批准范围完成。不得修改actual C16、主线、private资料、运行账本或依赖安装。
- Root批准设计并明确源码工作区后，implementer才从指定准确基线建立独立managed worktree/branch；独立reviewer先读spec和actual diff，先规格、后质量。
- 主线仍冻结时不做集成或原生验证。sole merger确认允许集成后才合入批准SHA并推送；作者不合main、不push。
- 复用[COS67](2026-10-06-cos67-classic-runtime-policy.md)、[COS69](2026-10-06-cos69-render-frame-sampling.md)、[COS70](2026-10-06-cos70-cli-frame-selection.md)的通过证据，仅因本片真实delta新增检查。
- 验证共享¥150及既有¥0.721771预留、正式¥200/12h和目标¥100/6h保持。所有下面的源码验收均0模型/0付费；不申请新窗口或重跑既有actual案例。

## 文件归属

一个implementer持有以下紧密关联文件；reviewer只读审查，sole merger集成。

| Create / Modify | 文件及职责 |
| --- | --- |
| Create | `src/runtime/classic-entry-input.ts`：固定事实选择、来源和sidecar校验、编译既有AcceptancePlan。 |
| Create | `src/runtime/entrypoint-classic-entries.ts`：当前结果认证、partial完整目录报告、证据引用。 |
| Modify | `src/runtime/entrypoint-classic.ts`：共享可信source root/读取；不改旧两政策契约。 |
| Modify | `src/runtime/entrypoint-host.ts`：确认前host元数据、design/candidate捕获、独立io.play调用和review/promotion接线。 |
| Modify | `src/runtime/entrypoint-design-check.ts`：选中事实时复用sidecar的只读校验。 |
| Modify | `src/roles/requirements.ts`、`src/cli/session.ts`：可选host选择的结构约束和用户可理解的显示/恢复。 |
| Create | `tests/runtime/classic-entry-input.test.ts`、`classic-entry-host.test.ts`、`classic-entry-host.integration.ts`、`tests/cli/classic-entry-session.test.ts`。 |
| Modify, only if needed | `tests/runtime/generic-persistent-host.fixture.ts`：TEMP synthetic reference/sidecar及定向故障，不改默认夹具语义。 |
| Record | 本计划仅追加准确的源码验证结果、限制和提交；任务追踪文档由Root管理。 |

不改`benchmarks/classic-pc/reference/*`的生产事实、不改原runner语法/上限、采样器、scheduler、ledger或已封存run。遇到真实额外文件需要时先报告具体原因。

## 唯一源码任务：从一条固定事实到生产证据闭包

这是同一纵向任务中的顺序检查点，不是多个并行作者任务。每个RED/GREEN只运行受影响目标；失败保留，不把fixture结果写成reference或生成成功。

### 检查点1：固定来源与确认前选择

- [ ] 重读spec第4—6节及现有`createProductHost.draft`、`runProductSession`、`createClassicPolicyScope`和原恢复路径；检测待改文本UTF-8/换行。列出原通过证据与本片delta。
- [ ] 在`classic-entry-input.test.ts`写RED：空measurement返回`null/no_reference_measurements`；只有未知或timing返回`no_verified_exact_measurement`；多个结构合格项只取源顺序第一项，其文件准入失败不得跳到下一项；错误reference/对象/类别/单位/证据覆盖、越界或不存在原始证据被拒。拒绝模型选择第二项或替换expected。
- [ ] 在`classic-entry-session.test.ts`写RED：真实产品draft返回后由host补选择；模型原返回不能注入该字段；准确事实及partial范围先显示再确认；拒绝/EOF不激活；legacy无字段恢复保持旧行为；新来源变动不静默重选；completed分支只读。
- [ ] 执行并保存RED：

```powershell
node --experimental-strip-types --test tests/runtime/classic-entry-input.test.ts tests/cli/classic-entry-session.test.ts
```

预期：缺少新模块/选择接线导致明确断言失败；不能把依赖或环境错误当有效RED。

- [ ] 实施最小输入代码。内部selection保存源字节签名、唯一事实、双类证据引用或明确null原因；原profile字符串保持。默认读仓库source，可信TEMP source root只经host装配传递，不能进入用户或模型输入。
- [ ] `createProductHost.draft`沿既有确认流程补元数据，`requirements.ts`严格验证，CLI显示对象/指标/值/单位和范围；不新加flag，不改变旧confirmed来源。重跑同一命令至GREEN。

### 检查点2：sidecar与固定计划

- [ ] 输入测试增加RED：sidecar只有所选measurement ID、原gameplay acceptanceId、既有鼠标输入、visible text定位和有界timeout；重复/第二/未知mapping、脚本、debug、expected/URL/candidate等越权字段均拒绝。验证点击必须在主机追加assert前。
- [ ] 设计任务仅在measurement非null时获得`authors/design/classic-entry-plan.json`写权限；同次捕获至`_cosmos/classic-entry-plan.json`。在原自检中只读调用同一validator，最终capture再次核对。
- [ ] 编译函数按下列固定规则实现，不把目标定位当参考事实：

```ts
// sidecar.inputs只含原Step的mouse/locator输入；值来自固定source。
const steps = [...mapping.inputs, {
  id: 'classic-entry-observe', kind: 'assert',
  acceptanceId: mapping.acceptanceId,
  observation: mapping.observation,
  expected: String(sourceMeasurement.value), timeoutMs: mapping.timeoutMs,
}];
// 其余AcceptancePlan字段只由当前host的candidate/task/run/spec、
// 已确认viewport、clean URL和唯一reportId提供；调用原validatePlan。
```

输入不能自占`classic-entry-observe` ID。measurement决定entry/entity/metric/unit；acceptanceId必须属于原确认任务。新plan无persistent profile继承或预置状态。

- [ ] 在registry verify锁前登记新mapping capture，依赖同一reference/catalog、参考证据、requirement、design；绑定候选引用和attempt但不形成candidate依赖循环。候选修复必须使用其自己的映射版本。
- [ ] 重跑输入测试和受影响设计自检测试，保存GREEN；不改旧`classic-policy-mapping/1`。无measurement时不创建sidecar写权限或可执行plan。

### 检查点3：真实caller与逐项结果

- [ ] 在`classic-entry-host.test.ts`写RED：现有host的coding verify在同一次clean delivery中，原`playPersistent`执行一次，新独立`io.play`在合格输入下执行一次；检查新plan不等于save/resume plan，其expected来自source而非夹具返回值。
- [ ] 当前生产catalog为空时新增play调用为0，报告明确`no_reference_measurements`；原前置失败、原deadline不足、已选来源丢失、缺sidecar时不能偷跑或换事实。
- [ ] 在`entrypoint-host.ts`接入独立normal plan：放在原save/reopen及media检查之后、同一clean server/owner/deadline之内。调用原`io.play`，不改runner、媒体检查、原persistent profile或repair窗口。
- [ ] 保留原generic结果作为`withCleanDelivery`的原结果；新观察先单独保存，finally后才合取为候选结论。新数值断言失败且共享清理健康时，旧STARTUP/OFFLINE仍按原事实判断；清理本身故障不得被隔离成虚假的旧政策通过。
- [ ] 在新consumer内认证当前plan/raw/report、input送达、assert观察、browser/exit和证据文件。复用`diagnoseBrowser`；normal报告不伪造persistent session，也不调用要求session的segment verifier。
- [ ] clean finally完成后写`classic-entry-report/1`，保留完整catalog所有行。所选行只可有`normalInput`子结果；`mechanism/valueImplementation`均未执行。所有其他行保留unknown、missing和not_executed；顶层始终partial。
- [ ] 补RED/GREEN负例：禁用输入处理后可见值不变化；不符source的expected；错误candidate/run/task/spec/plan或deadline；缺raw/截图/视频/日志；duplicate/unknown mapping；删除catalog条目；源文件在捕获、执行或报告前后变化。可靠游戏不符与证据不足必须保持原分类差异。

```powershell
node --experimental-strip-types --test tests/runtime/classic-entry-host.test.ts
```

预期：健康fixed输入通过该观察；当前空目录诚实未执行；所有负例无新增观察通过，未授权额外调用为0。

### 检查点4：独立review、promotion与恢复

- [ ] 将mapping、所选参考证据、独立normal raw目录与逐项报告放入原`consumerRawEvidence`。保证新断言截图出现在独立review图片中，不被既有8张抽样排除。
- [ ] 以原任务恢复/执行pipeline驱动代表，不只直接调用纯consumer：验证verified/review journal确实签入新增引用，review workspace字节相同，reviewer与author身份独立，原context权限覆盖这些固定只读资料。
- [ ] 新选择启用时，在promotion前复用原journal的verified/review签名核查。加入raw/report/sidecar在review后变化的负例；不能仍promote。无当前签名的模拟直接`finish`不是有效通过证据。
- [ ] 原检查和独立审核均通过时可promote当前范围候选，但finish仍有经典partial gap、generation仍incomplete；不可进入最终human批准入口。新执行失败则当前候选不能promote；无measurement不另造付费修复。
- [ ] 验证新路径未完成恢复使用原selection/mapping/candidate/attempt和原deadline，缺证据保守拒绝；completed读取不创建host/采样/新raw。旧无字段classic与unselected分支保持。

### 检查点5：一个原生SOURCE代表及必要回归

- [ ] 获准后顺序运行一个新原生代表：TEMP source复制当前完整目录，在TEMP加入明确标注synthetic的单个exact measurement和双类证据；不修改生产目录，也不把所属汇总行改为已全面核实。
- [ ] 用现有小UI夹具增加一个可见数字及真实鼠标入口，由固定sidecar定位。实际host调用原编译/打包、clean Node、原persistent和新增normal runner；保存当前plan、raw、独立断言截图、review副本和journal/promotion证据。author/reference/reviewer输入均注明fixture，真实编译/进程/输入事实单列。
- [ ] 禁用输入负例至少经原normal runner实际执行一次小夹具；可以复用该代表的已编译测试工件和原runner测试设施，使用独立测试候选/报告身份，不能篡改已封存健康候选。无需重跑完整构建/持久浏览器矩阵。准确记录哪些证明来自真实runner，哪些是合成transport。

```powershell
node --experimental-strip-types --test tests/runtime/classic-entry-host.integration.ts
```

预期：受控健康观察成立，禁用输入不通过；两者均0模型/0付费；完整目录、参考unknown和partial状态保持。原生代表不能与其他长浏览器测试并发。

- [ ] 运行受影响的旧政策/确认回归以及类型、构建检查：

```powershell
node --experimental-strip-types --test tests/runtime/classic-entry-input.test.ts tests/runtime/classic-entry-host.test.ts tests/cli/classic-entry-session.test.ts tests/runtime/classic-policy.test.ts tests/runtime/classic-policy-host.test.ts tests/roles/classic-policy-draft.test.ts tests/cli/classic-policy-session.test.ts
npm run typecheck
npm run build
```

预期：退出0、无新增skip；原STARTUP/OFFLINE和unselected行为保持。旧native政策/采样重型矩阵、实际付费case、全目录游戏生成不在本片回归内。若新增设计自检受影响，追加该文件的定向测试，先说明delta。

## 交付与独立审查

- [ ] 重新以严格UTF-8读取所有改动，检查中文、换行和`git diff --check`，核对仅批准文件变化。
- [ ] 记录每项验证的命令、实际结果、原始stdout位置、fixture/真实边界与已复用证据。只标本片SOURCE范围，不写完整COS14 ready或正式游戏通过。
- [ ] 作者提交自己的准确SHA，向Root报告文件、证据与剩余缺口；Root指定独立reviewer审查实际diff，先spec compliance再质量。作者修复有效finding并提交affected review。
- [ ] sole merger核对最终批准SHA、工作区/冻结状态及必要集成检查，再按Root授权合入；不因局部通过修改COS01/COS14/COS15/COS18整体状态。

外部参考观察、全经典运行及最终human仍按spec第8—9节执行。本计划不将这些未来证据改写成SOURCE验收条件已满足，也不删原G4或COS15依赖。

## 2026-10-17 SOURCE实施候选与验证记录

当前结果：源码以已发布登记 `e371046a625a3581d37317ff2e6138792534e88d` 为父基线，初始候选 `806bec6ce454f8164860db323bb110b02ab5befc` 经唯一P2修订为 `d0773acbdcbac24f5865d41ba7f32246836a58cd`，已独审 `APPROVED_SOURCE_SCOPED` 并由唯一merger发布；作者未合main或推送。标记 `CLASSIC_ENTRY_NORMAL_INPUT_SOURCE_READY`，[完成记录](https://github.com/lrfluobida/Cosmos/issues/105#issuecomment-6232469977)、#105 closed(completed)与父#15子项勾选已由Root核证；父#15仍open。证据索引为 `E:/CodexData/.codex/worktrees/cos-05-cli/Cosmos/.cosmos/evidence/cos104/verification-index.json`。下列61/61与最终affected6/6包含重叠、不累加；唯一merger核13文件批准字节一致、生产measurements0，并补main typecheck/build0。

- 固定输入、确认前显示、受限sidecar、同clean delivery内独立正常输入、完整目录partial报告、review图片与原journal/promotion均已接通。旧profile/mapping、普通runner及其上限、采样器、scheduler、ledger和生产reference事实未改。原有未启用字段的确认与恢复保持。
- 行为RED保留：`checkpoint1-red.log` 中真实产品draft缺少selection、CLI缺少未执行显示；新输入模块当时尚不存在。`checkpoint3-red.log` 中实际host执行原persistent后新增调用为0、缺逐项报告。`raw-retention-red.log` 另复现新raw内容无效时未进入任务证据，随后仅在失败路径保留实际已产生且路径安全的raw目录。首次原生准备失败另记，不作为行为RED。

| 验证 | 实际结果与原始记录 |
| --- | --- |
| 输入/确认初始GREEN | 16/16、0skip，4373.987ms；`checkpoint1-green.log`。 |
| 新host首轮完整定向 | 15/15、0skip，85393.9567ms；`checkpoint3-green.log`，synthetic browser/build transport与真实clean Node。 |
| sidecar只读自检、删catalog仍保留原分母 | 2/2、0skip，8720.8581ms；`checkpoint2-4-focused.log`。 |
| 失败raw保留修正 | RED 1/1失败后GREEN 2/2、0skip，14767.5307ms；`raw-retention-{red,green}.log`。 |
| 最终受影响回归 | 本计划7文件命令加 `tests/runtime/entrypoint-design-check.test.ts`，61/61、0skip，117086.5578ms；`final-focused.log`，exit0。含旧STARTUP/OFFLINE、未选classic、旧确认、完整新缺失raw/截图/log和空视频负例。 |
| 首条坏文件而第二条独立证据有效 | 收紧测试输入后1/1、0skip，3507.6678ms；`first-match-valid-second.log`。不与前述重复计数相加。 |
| 已完成旧入口只读恢复 | `--test-name-pattern='completed original public resume' tests/cli/completed-generation-resume.test.ts`，1/1、0skip，6977.8848ms；`completed-readonly-regression.log`。 |
| 最终类型、构建、文本 | `npm run typecheck` / `npm run build` exit0；`final-{typecheck,build}.log/.exit`。严格UTF-8/LF、中文复读和 `git diff --check` 记录在 `final-text-check.log`。 |

### 唯一原生SOURCE代表

`node --experimental-strip-types --test tests/runtime/classic-entry-host.integration.ts` 通过1/1、0skip，test35797.437ms、runner39390.7781ms。原始记录 `native-source.log/.exit`，证据根 `C:/Users/26557/AppData/Local/Temp/Cosmos COS104 中文 SOURCE JxLPy2`。该测试实际导入本工作树 `dist` 编译host；当时使用的七个新增/受影响JS模块原字节及SHA已保存于 `native-compiled/` 和 `native-compiled.json`。之后生产改动仅为失败raw目录保留和下述P2明确事实守卫；健康原raw已有完整退出与failureFacts，因此经独审核证后复用本次通过结果。

- 首次准备仅47.144ms即因当前工作树 `templates/2d/node_modules` 不存在失败，未进入编译/浏览器，见 `native-source-environment-failure.log/.exit`。随后使用已存在的 `COSMOS_TEMPLATE_ROOT=E:/develop/Cosmos/templates/2d`，其锁文件与工作树逐字节相同；未安装依赖。不是新的付费案例或正式生成重跑。
- 真实锁定tsc/Vite、原素材renderer、clean Node launcher及Edge `155.0.4283.45` 执行。实际caller顺序为原persistent一次，再独立normal一次；同authority/原deadline `2026-10-17T09:29:49.265Z`。正常输入raw为 `browser-evidence/game/game/v1/classic-source/coding-classic-entry/report.json`；独立plan/raw，末步真实可见值 `7`，无伪persistent session。
- 独立fixture reviewer读取字节相同的参考/mapping/raw/逐项报告，收到保留的新断言图片；原verified/review journal签入这些证据。对review后sidecar、raw report和逐项report三种字节变更分别拒绝promotion，恢复原字节后准许原范围候选晋升。随后通过原 `executeGeneration` 恢复，原角色/浏览器调用数不增，已封存raw字节不变。
- 另用独立candidate/report和已编译副本禁用点击处理，只执行原normal runner：`negative-evidence/game/fixture-disabled/v1/disabled-source/disabled-classic-entry/report.json` 实际可见值 `0`，结果failed/code_defect。健康候选及原raw逐字节保持。未重跑整套编译/持久浏览器矩阵。
- `native-postcheck.json` 保存原normal、persistent和clean回执；helper PID29136、normal PID8440、persistent PID11940/33316后核均不存在。共享运行和正式C16资料未访问或改写。

所有参考事实、作者和reviewer输入均为明确标注的SOURCE fixture；真实编译、浏览器输入、文件和journal事实另列。模型请求0、费用0、human NONE。两次generation结果均为 `incomplete`，报告顶层永久 `partial`；完整230行/原顺序、221条参考未知及机制/数值使用未执行保持。生产measurements仍为空，正常生产结果仍是 `no_reference_measurements/not_executed`。本片不完成COS01/COS14/COS15/COS18、参考冻结、完整classic PvZ目标或最终用户体验；全部原预算与依赖保持。

### 独审P2修订：要求明确退出与当前failureFacts

`classic_entry_reviewer` 对 `806bec6ce454f8164860db323bb110b02ab5befc` 的完整独审仅提出此P2：新consumer复用的诊断器保留legacy兼容分支，raw与返回报告同时缺少failureFacts时，缺失或null退出事实可能被接受。修订只在新consumer增加 `cleanup.processExited === true` 和存在 `failureFacts` 的准入，内容仍交原诊断器核查；原runner及诊断器兼容行为不变。

- `review-p2-lifecycle-red.log` 首轮保留failureFacts的退出缺失/null原已拒绝（2通过），仅缺failureFacts误通过（1失败）。将退出两例同时去掉failureFacts以命中legacy分支后，`review-p2-lifecycle-legacy-red.log` 三例均错误通过、测试3/3失败，23017.7568ms。三个负例的raw/返回report保持一致，失败并非来源不匹配。
- 最小修复后 `review-p2-lifecycle-green.log` 6/6、0skip、40265.2488ms：健康、真实值不符、明确退出失败与三个新负例；新负例均为insufficient_evidence、不promotion，原clean acceptancePassed及STARTUP/OFFLINE仍通过。`review-p2-typecheck.log`、`review-p2-build.log`均exit0，文本检查见 `review-p2-text.log`。
- 既有健康native原始报告本来就含明确退出和完整failureFacts，独审已核其原raw与截图；本次复用而未重跑。相较原native编译版本，最终consumer差异现包含此前失败raw保留和本次明确事实守卫；其余范围、预算与最终缺口保持。修订 `d0773acbdcbac24f5865d41ba7f32246836a58cd` 已获原reviewer定向复审 `APPROVED_SOURCE_SCOPED`，P2闭合且无剩余finding；准确SHA和affected证据由同一verification-index绑定。
