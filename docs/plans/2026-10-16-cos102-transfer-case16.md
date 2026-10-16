# COS102 Fixed Case Sixteen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在原共享¥150账本上为固定C16提供一次¥5/90分钟的新coding验证入口，保留已失败并closed的C15全部历史。

**Architecture:** C15/C16通过两个源码固定policy共享内部入口生命周期，分别保留当前身份、历史前缀、admission与完整source approval。D16复用原无group需求文件和C5 approved design/art，core与host只增加精确C16支持；生成继续使用已有coding-only driver、真实host/factory/Pi、独立review与promotion。

**Tech Stack:** TypeScript、Node.js 22、Pi SDK、现有ledger5/controller/ArtifactRegistry、Playwright native host、PowerShell私有监督器。

---

状态：设计`73aceb8918d49462f6339be599f7952ae74cfbfe`经`cos102_design_reviewer`最终`APPROVED_DESIGN`，无P1/P2，Root已批准设计；唯一merger `batch_c14_cos92_merger`合入`9c959575159ed0b8c2d3c052dc6db23f0caf2feb`。任务[COS102 / #103](https://github.com/lrfluobida/Cosmos/issues/103)，id5881517542，已原生挂父COS16/#17、未勾选；#17直接子项2、根#1直接子项仍100、任务总数102，Root已精确GET核证。Root已[公开授权](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6212342953)免费SOURCE实施；Task A已[独审批准](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6213202409)，Task B实施中、C待B；整卡源码尚未独审批准，实际preflight与paid启动仍待Root另行授权。设计见[spec](../specs/cos102-transfer-case16.md)；基线`2d9b0b5c6d088615010b41d6b6a9b5f5ade970a7`，src/probes/tests等同`ea4876a62df70fcfaa95d795aa2b68c970f6ff67`。常规工程选择不重复询问产品或预算；缺少实际启动授权时完成所有已授权SOURCE工作后交Root审批。

## 文件归属与依赖

每task由专职implementer在独立managed worktree/分支完成并提交exact SHA；独立reviewer用独立上下文先审规格再审实际diff。只有本批唯一merger可合main和push。B依赖A批准接口，C依赖A+B批准实现；实现finding回到所属作者，C不代写A/B修复。

| Owner | 文件 | 职责 |
| --- | --- | --- |
| A | `src/runtime/validation-validation.ts`、`validation-window.ts`、`entrypoint-host.ts` | C16完整predicate、closed C15→C16准入、两个固定case/C5兼容证明 |
| A | `probes/transfer/validation-case-sixteen-declaration.ts` | 固定D16与无selector参数解析 |
| A | `tests/runtime/validation-case-sixteen-budget.test.ts` | 原API财务fixture及core准入回归 |
| B | `probes/transfer/validation-shared-coding-entry.ts`（新增）、`validation-case-fifteen-entry.ts` | 抽取两个固定case共用生命周期，保留C15所有exports与契约 |
| B | `probes/transfer/validation-case-sixteen-{entry,run,source,driver,task}.ts`（新增） | C16固定接线、历史认证、来源与执行绑定 |
| B | `probes/transfer/validation-case-seven-source.ts` | 固定sixteen类型与确有必要的显式seed |
| B | `tests/transfer/validation-case-sixteen.test.ts`（新增） | 历史尾项、approval、admission及共享入口短回归 |
| C | `tests/transfer/validation-case-sixteen.fixture.ts`、`validation-case-sixteen-host.test.ts`、`validation-case-sixteen-runtime.test.ts`、`validation-case-sixteen-compiled.test.ts`（新增） | SOURCE历史尾项、真实host、完整C16 SOURCE、TS/JS闭包与worker验证 |
| C | `tests/transfer/validation-case-fifteen.test.ts`、`validation-case-fifteen-compiled.test.ts`（必要断言） | 抽取后C15原契约与共享/传递依赖漂移拒绝 |
| Root/merger | 本spec/plan、task/mapping及批准记录 | 发布元数据与证据；与实现文件归属分开 |

不修改`requirements-case-fifteen.json`、旧declarations、C5 captures、模板、ledger schema、budget/supplement/closure契约、RunController或验收分母。新增helper只服务两个固定case，禁止通用多组、任意case或budget配置框架。所有文本先检测UTF-8；已有中文只作必要patch，保留换行并读回。

## Task A：固定C16、core准入与host证明

**Files:** 上表A文件。先阅读`AGENTS.md`、`CONTEXT.md`、`cosmos-spec.md`、本spec、COS101卡及C15 budget/runtime/legacy-host测试。新fixture复用原API创建的ledger5，不能手填财务`any`对象作为成功证据。

- [ ] 记录基线和新文件不存在，严格UTF-8读取目标文件；保持C15 predicate原实现和对外语义。
- [ ] 写完整D16：只将D15的case和五task IDs换为固定`cos20-transfer-validation-16`，其余每个字段相同。输入仍引用Fifteen JSON的原path/version/hash，不复制文件。

固定声明的实现形状如下；该常量只在源码中组装，不接受caller参数：

```ts
const caseId = 'cos20-transfer-validation-16';
export const TRANSFER_VALIDATION_CASE_SIXTEEN = freeze<ValidationDeclaration>({
  ...structuredClone(TRANSFER_VALIDATION_CASE_FIFTEEN), caseId,
  grants: {
    planning: { taskId: `${caseId}-planning`, amountMicroCny: 2_000_000 },
    design: { taskId: `${caseId}-design`, amountMicroCny: 1_900_000 },
    art: { taskId: `${caseId}-art`, amountMicroCny: 5_700_000 },
    coding: { taskId: `${caseId}-coding`, amountMicroCny: 7_600_000 },
    repair: { taskId: `${caseId}-repair`, amountMicroCny: 3_800_000 },
  },
});
```

- [ ] 添加RED：原API构造C14已关闭→C15 claim→无task/request/repair的manual stop→该fixture的下一次closure（如实记录计数；完整closure21由Task C覆盖）；原core拒绝固定C16的90分钟/ledger5准入，snapshot前后无写入。先保存这个真实拒绝，不能把导入失败当RED。
- [ ] 执行RED命令，预期至少上述准入测试FAIL且没有provider：

```powershell
node --experimental-strip-types --test tests/runtime/validation-case-sixteen-budget.test.ts
```

- [ ] 新增`isFixedTransferCaseSixteenDeclaration`完整匹配。若复用C15谓词，只无损替换已逐项核实的固定case/task IDs，保留全部未知/额外字段供原完整匹配拒绝；core不导入probes。`validateValidationDeclaration`拒绝任何C16变体，只对精确C15/C16允许5400000ms。
- [ ] `eligible`增加精确C16、ledger5、当前stopped C15、五grants闭合分支；保留C15原C14条件、duplicate/stale/unknown/charge_overrun/容量检查以及旧budget source核验。
- [ ] host兼容函数从通过精确谓词的scope取得C15或C16 ID；保留spec列出的全部C5来源、当前window/operator/root/capture/source和完整字节比较。当前输入hash可等于C15但仍与旧C5不同，不能跳过该证明；import/session/作者前完成，cold restore重验。
- [ ] 补GREEN负例：ID/额外字段/模型/group/grants/output/inputs/template/90分钟+1ms变化、C16 ledger4/错误前任/active或未closed C15、重复/过期quote/unknown拒绝；原C15只接受C14，其他case45分钟+1ms拒绝。正例确认quote1、五allocations共¥21、原group/delegations/supplement不变。
- [ ] 同一budget命令通过后记录实际测试数与耗时；复用未变预算80请求矩阵。运行`npm run typecheck`，预期退出0。
- [ ] re-open中文和diff；提交A的明确文件，报告exact SHA、RED/GREEN、已知缺口（真实host集成由C补）。独立reviewer通过后才交B使用。

## Task B：两个固定case共享入口及C16接线

**Files:** 上表B文件。输入为A已批准SHA；完整阅读C15入口的`transferCaseFifteenHistory`、accounting/source approval、`prepare/start/run/complete`及C6 driver/task、C7 source遍历器。不得只按C15作者总结实施。

- [ ] 在新`validation-case-sixteen.test.ts`先写历史尾项与source approval/admission的RED；使用真实格式snapshot/receipt读取，不通过可跳过来源的callback让入口成功。
- [ ] 将C15生命周期抽入`validation-shared-coding-entry.ts`。内部仅两份冻结policy，两个具名构造函数各绑定一份；不导出接受任意policy的工厂。C15原export名称、签名、22/110/20、marker、manifest、quote/admission格式和source approval保持。
- [ ] C16只在固定policy中增加23/115/21前缀与完整D15尾项，保留原14group成员、一次supplement及715/16901000µ检查。单独认证C15无task/request/费用行、repair=null、manual stop与五grants关闭；C15原operator、admission/reuse实际字节及closure21绑定正确。
- [ ] 历史C15不要求origin/marker/execution/result/candidate；空根仅认作原closure账务目录。旧admission中的execution保留原摘要、source approvals及当时身份，不能按当前源码调用旧capture/require。C16新运行根/marker仍首次必须不存在。
- [ ] C16历史accounting摘要覆盖23cases/115closures/21audits；identityReader及派发前持续认证旧budget、closure和C15 operator-covered来源字节。不要把C15插入原group声明列表，也不要沿用“所有transfer历史均D5.inputs/quote2”的断言。
- [ ] 新C16 admission格式固定为`transfer-case-sixteen-admission/1`，覆盖quote1、grants、C5 manifest、完整历史摘要、当前execution与完整source approvals。C16自身marker定为`TRANSFER_CASE_SIXTEEN_SOURCE_READY`；包含COS102自己的reviewed/merge SHA和原全部前置，包括COS101。C15自己的marker和前置不被新case替换。
- [ ] 新run使用原固定C5 source pins；new task调用`createFixedTransferCodingOnlyTasks(D16, 'cos20-transfer-validation-16-reuse.json')`。driver调用原`createFixedTransferCodingOnlyDriver`，绑定C16自己的source/admission/plan和`.ts/.js` worker URL，不复用C15的当前身份。
- [ ] `captureFixedTransferCodingSource/requireFixedTransferCodingSource`类型联合加入sixteen。检查真实imports：两run→各entry→共享模块，各driver→自己的source/task/shared认证；共享模块实际动态driver用字面量import。现有遍历器不识别的关键依赖必须改为可识别导入或固定seed，不可只靠类型联合宣称闭包完整。
- [ ] 短测覆盖715历史门槛保持、C15尾项假quote2/伪group/缺closure/添加task/request/改旧源拒绝、C16自身approval缺失拒绝、admission错case/manifest/source拒绝；保持免费preflight零write/owner/provider。
- Root澄清测试分层：固定HistoricalTail helper核唯一末项D15零行为及真实quote/operator/五grant closure/admission/source链，可用短真实API prefix验证且不称完整preflight；完整23/115/21与715门槛仍由prepare/accounting固定policy组合执行，Task C覆盖完整SOURCE23/115/21。
- [ ] 运行以下命令，预期新增测试PASS、0skip，typecheck退出0；SOURCE完整链尚留给C，不借stub宣称完整成功：

```powershell
node --experimental-strip-types --test tests/transfer/validation-case-sixteen.test.ts
npm run typecheck
```

- [ ] 核对共享生命周期仍保留免费prepare前后相同quote、原子claim、当前active-window cold restore、停止后不能恢复、正常stop/drain/close、精确accepted与费用检查。运行原C15 completion短代表：

```powershell
node --experimental-strip-types --test --test-name-pattern 'C15 completion releases its real controller owner' tests/transfer/validation-case-fifteen.test.ts
```

- [ ] UTF-8/中文/diff读回并提交B exact SHA；独审规格→质量。review finding由B修并复审，不能以文件搬迁为由免除执行闭包审查。

## Task C：集中补齐SOURCE、真实host与compiled证据

**Files:** 上表C文件。依赖A+B批准SHA，fixture环境采用隔离TEMP或专用SOURCE副本；真实`.cosmos/validation-shared`、C14/C15账务根、凭据和原私有v1均不可写。

- [ ] 核查COS101已存SOURCE来源，复用通过的C1～C14 API前缀与C5 captures，只追加零task/request/fee的C15 claim/manual stop/closure21。沿生产API构造所有财务变化并`validateSnapshot`；如现成副本已有此尾项则直接认证复用，不再构造。SOURCE请求数保持364，不为满足生产715门槛额外seed。
- [ ] 新C16 fixture用原prepare/claim/open和C16 driver/host接线。编写host测试：C16当前完整来源通过；错误C5 window/capture/operator、C16当前身份/source/root、需求其他字段或group、非C15/C16不同hash在import/session前拒绝；cold restore再核；复用未变C6同hash规则证据。
- [ ] 对C15与C16 source capture分别断言共享模块、仅经共享模块到达的传递依赖、各自entry/driver/task/source、真实host/factory/Pi和三个动态worker确实列入。选定传递依赖须记录实际路径，不能用本来就在seed里的文件代替。
- [ ] 在TEMP篡改共享模块和上述传递依赖，原receipt的require与真实dispatch边界拒绝，provider/owned child计数零增量。对TS/JS和两个case均覆盖；恢复原字节后同receipt恢复通过。若现有遍历格式漏读共享模块，先保存RED，再由B修导入接线；不能在测试中补一个生产没有的seed。
- [ ] 编译C15/C16两个run和显式workers，assert compiled闭包为实际`.js`共享/传递文件，执行实际JS build worker的已知编译失败代表；确认非零编译结果保留、不promotion。对C16真实driver验证JS worker URL及case/window/planning grant身份。
- [ ] 运行集中短检查，预期所选测试PASS；记录实际匹配与过滤数量，不把过滤项计为通过。失败须保留诊断并只修受影响部分：

```powershell
node --experimental-strip-types --test tests/transfer/validation-case-sixteen-host.test.ts tests/transfer/validation-case-sixteen-compiled.test.ts
node --experimental-strip-types --test --test-name-pattern 'C15 source closure|compiled C15 binds authentic SOURCE' tests/transfer/validation-case-fifteen.test.ts tests/transfer/validation-case-fifteen-compiled.test.ts
```

- [ ] 新增并运行一次完整C16 SOURCE测试，名称固定为`C16 SOURCE real factory Pi build media image review promotes the exact new candidate and stops normally`。沿真实C16 coding-only driver→reused host→factory/Pi，使用fake transport和合法PNG，验证空作者目录、新capture/正式build、八段fixture媒体消费、独立图像review approved、准确C16 candidate promotion、result与正常stop/drain/controller release。不得复用旧candidate替代新作者输出。

```powershell
node --experimental-strip-types --test --test-name-pattern 'C16 SOURCE real factory Pi build media image review promotes the exact new candidate and stops normally' tests/transfer/validation-case-sixteen-runtime.test.ts
```

- [ ] 报告这一次SOURCE的实际checks/媒体字段/图片请求/费用预留/stop/owner事实；如果fixture仍为176checks/4字段，按原值报告，不写成生产220/62。保留失败与恢复限制，不重复旧C15完整链、80请求矩阵、C14真实220/62或native长诊断。
- [ ] 对共享抽取后C15原export与22/110/20政策、C16 source marker与23/115/21政策保留短代表；C15 stopped/consumed/closed仍拒绝运行。controller的provider/tool/child来源守卫复用旧矩阵，新共享源漂移各取所需代表。
- [ ] 运行最终类型与构建；`npm run typecheck/build`只覆盖src，所以额外strict必须包含新增probes/tests闭包：

```powershell
npm run typecheck
npm run build
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions probes/transfer/validation-case-sixteen-run.ts probes/transfer/validation-shared-coding-entry.ts tests/runtime/validation-case-sixteen-budget.test.ts tests/transfer/validation-case-sixteen.test.ts tests/transfer/validation-case-sixteen-host.test.ts tests/transfer/validation-case-sixteen-runtime.test.ts tests/transfer/validation-case-sixteen-compiled.test.ts tests/transfer/validation-case-fifteen.test.ts tests/transfer/validation-case-fifteen-compiled.test.ts
git diff --check
```

- [ ] 中文/UTF-8读回；提交C exact SHA、完整命令/退出码/实际测试名、证据位置和差距。独审须读实际diff和原始SOURCE结果，不能只看作者结论。A/B发现的生产缺陷由原作者独立提交和affected复审。

## 唯一merger：源码集成与证据复用

- [ ] 核对A→B→C最终独审SHA、文件归属和未决finding；只合批准版本。源码抽取与测试修复若改变闭包，发布最终组合SHA下的新execution capture，不能使用旧当前admission。
- [ ] 比较集成文件与批准来源；按真实delta运行typecheck/build及一组core/entry/闭包短代表。若依赖和代码等同已审组合，复用C完整SOURCE证据，不再机械执行同一完整链。
- [ ] 记录source scoped结果、SOURCE与actual区别、原失败/恢复限制。Root发布COS102自身source marker与reviewed/merge SHA，actual/paid保持NONE；旧COS101 READY及C15failed/consumed/closed保持。未经独审不写完成标记。

## Root后续：实际715 preflight与单次launcher审批

本节是源码集成后的独立操作清单，不随文档或SOURCE审批自动获准。使用原ledger，不能新建账本、重开C15或自动换case。C15费用0、closure21及空账务目录事实引用[C15记录](../research/2026-10-16-cos101-c15-watchdog.md)和[公开闭账结果](https://github.com/lrfluobida/Cosmos/issues/102#issuecomment-6211338359)。

- [ ] Root准备C16专属C5 manifest和独审发布元数据，批准实际只读preflight。核715请求、23stopped、14delegations、115closures/21audits、C15零历史、source/inputs/root及owner/unknown为零；原文件字节/size/mtime保全。

```powershell
node --experimental-strip-types probes/transfer/validation-case-sixteen-run.ts --validation-preflight <reviewed-main-sha>
```

- [ ] preflight必须返回精确quote1、90分钟、¥5 case/¥21 grants、shared-unallocated、完整C16 admission；shared容量至少¥21，phase可覆盖¥5，图片review预留保持。基线漂移即停止并重新审查quote；SOURCE364不是该715正例。
- [ ] Root另制新C16私有launcher，保留原C15 v1、worker及消费记录。原三行UTC补丁SHA`4217badbf2bd30f5c570a2ac433f4feffbce6e50b6e95149e8e01d7a901996e0`与7项通过证据可复用，不重跑原失败launcher。
- [ ] 在新launcher真实JSON读取/日期转换/窗口选择片段上补免费接线样本：snapshot同时含closed C15与active C16；只有批准C16 case/quote/window可选，旧C15不作为deadline来源；`-DateKind String`保留字符串、InvariantCulture/ToUniversalTime保留UTC及毫秒；claim后观察时绝对deadline仍在未来，绝对时间边界正确。不得只断言两时间差90分钟。无provider/worker启动的AST或隔离样本记录需绑定新launcher实际SHA。
- [ ] 审查claim前15分钟免费prepare guard和claim后原90分钟deadline、原预算、一次消费标记、停止清理与凭据不落盘/不入日志。具体source/worker/launcher SHA与guards由本次实际证据填写，不预写虚假值。
- [ ] Root与独立reviewer核完精确quote和launcher后，由Root另行批准一次paid：

```powershell
node --experimental-strip-types probes/transfer/validation-case-sixteen-run.ts --validation-case <reviewed-main-sha> <operator-validation-source>
```

- [ ] 记录claim、作者请求、自检、capture、正式build、完整八段/220步、62媒体字段、截图review、promotion、report、stop/drain/close实际时间和费用。视频完整解码、候选版本及正常进程/端口/owner清理单独核实。
- [ ] 失败、预算/时间不足或unknown时停止，保留差距，不自动重试/改case/延时/删验收。独立postcheck后Root单独审查C16 closure quote/apply；原C15 closure21不可重复。
- [ ] 分别记录SOURCE与actual结果；即使C16自动通过，COS18公开human、正常试玩、两brief及完整经典仍按原关口处理。

## 本次文档交付边界

本次只新增本计划和spec；独立design reviewer通过后由本批唯一merger合设计，Root随后明确授权源码。没有修改production源码、测试、mapping、实际账本、私有launcher，没有新模型或付费请求，也未启动新case。本文件中的复选框是后续实施检查项，不代表已经执行。
