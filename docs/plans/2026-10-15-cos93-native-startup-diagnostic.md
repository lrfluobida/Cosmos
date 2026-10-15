# COS93 原生浏览器启动诊断 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在真实C14规模的免费隔离fixture上，定位原15秒界限内完整原生浏览器启动链的实际耗时及清理结果。

**Architecture:** 新TEMP独立账本通过生产quote/claim/controller API建立合成当前窗口，原历史及C5证明保持原路径只读。使用真实consumer绑定、同一nativeIO实现和实际Edge；CDP身份完成后以测试专有停止点退出，不执行玩法或媒体矩阵。

**Tech Stack:** 现有TypeScript、Node22、node:test、Playwright/Edge、SnapshotStore/OwnerLock；不新增依赖。

---

## 基线、文件与门禁

[任务卡](../specs/cos93-native-startup-diagnostic.md)是本计划的规格。基线 `61d13817ca871d2be04576b4d6fb51fa8a86b541`，COS92已审 `ffa0ce2918735f5b21b22c4373a390b156e63d33` / merge `e74815f468b7158b5555ca2e5887ad3459b74dda`；原C14生成版本 `b20e9a43f26712a1f5a13468057df46b6c012b69`。本轮仅新增本plan/card，提交后停止等待独审；Root当前媒体操作冻结及诊断测量门禁解除前，不运行fixture、计时或浏览器。

后续文件归属：

| 文件 | 责任 |
| --- | --- |
| `tests/transfer/native-startup-diagnostic.fixture.ts`（新） | 私有输入清单、只读保护、新TEMP准备、真实生产guard组合、当前synthetic候选、finally清理。 |
| `tests/transfer/native-startup-diagnostic.test.ts`（新） | 定向guard/计时器契约测试与显式选择的一次实际历史诊断；输出raw JSON/TAP。 |
| `src/runtime/entrypoint-host.ts`（最小修改） | 仅导出现有nativeIO factory并沿用默认调用；供测试透明装饰，不增加权限、配置或另一套实现。 |
| `docs/research/2026-10-15-cos93-native-startup-diagnostic.md`（新）及本plan/card | 操作命令、实际结果、限制、exact SHA及raw路径。 |

源码修改前检测UTF-8，非UTF-8停止报告；最小patch保留中文与换行。共享tracking、原 `.cosmos`、真实预算及原生成游戏不在写范围。

### Task 1: 在新TEMP准备完整历史负载和真实当前绑定

- [ ] 从 `E:/develop/Cosmos/.cosmos/reconciliation/2026-10-13-c6-provider-usage/snapshot-after-case14-supplement.json` 读取已核规模：revision2966、ledger5、21 stopped/13 delegations/105 closures/19 audits/680 requests/45 tasks，一个supplement。列举其operator/closure/supplement实际回执与C5七capture、journal、audit、原C14候选所需文件；先保存SHA-256/大小/纳秒mtime/目录清单。拒绝非独立文件、原缺失输入和不完整来源。
- [ ] 建全新 `mkdtemp` 根及独立Git副本，记录实际平台HEAD和依赖版本。当前repository/ledger/current case/profile/registry全部在该根；原历史的绝对路径保持只读。只复制需要的快照及回执，不复制session正文、模型推理、key或整个旧 `.cosmos`。依赖使用已有锁定版本的独立文件副本，禁止安装网络依赖。所有写入目的地做真实路径边界检查；不调用会恢复原snapshot/mapping/utimes的旧fixture。
- [ ] 以 `validateSnapshot`、`requireTransferCaseFourteenAccountingSources`、`verifyValidationBudgetSources` 核验副本。用 `deriveTransferValidationCaseFourteenDeclaration` 和真实 `fixedTransferValidationInput` identity reader，经 `prepareValidationCase` 生成genuine quote3，写COS93专属fixture decision，再 `RunController.claimValidationCase/openValidationCase`。保持target/vector/原parent/supplement守卫；不手写quote、活动字段或费用历史。
- [ ] 组合scope时显式绑定原C5根和新TEMP当前根，逐项调用生产source/template/toolchain/accounting/history/identity函数与实际operator receipt校验，再交真实 `requireValidationScope`。与 `validation-case-six-driver.ts:stageTransferValidationCaseSixInput`、`validation-case-seven-driver.ts:requireOwnSource` 的检查逐项对照，记录唯一必要差异是历史根保持原位；不使用默认空 `requireOwnSource`。不能原样运行固定C14 entry/driver的路径限制必须写入结果，不声称真实CLI闭环。
- [ ] 用生产 `createHistoricalPassedStages`、`createTransferReusedConsumerHost`、当前task/registry/capture API建立真实当前候选绑定。复制原10文件/35771字节为明确synthetic作者输入，已有构建产物只作fixture，不重建游戏、不调用roleFactory/provider。通过原reserve/admit/settle添加35个synthetic记账请求，取原安全记账元数据/实际费用，目标启动前22/14/105/19、715requests、46tasks；记录实际revision/events/字节与原启动状态差异。所有API准备耗时单列。
- [ ] 先做短的fixture安全契约RED→GREEN：原根作为写目标、缺回执/manifest、篡改TEMP来源、错误target/grants均拒绝，进入browser/provider次数为0。测试不需要重seed整个历史。raw输出记录真实测试数量/时间；原文件前后保持。提交Task1供独立review，不靠作者说明代替diff审查。

### Task 2: 接入单次完整启动与透明测量

- [ ] 先写缺少nativeIO测试入口的RED，再仅导出现有factory；测试调用与host默认接线必须是同一函数。装饰真实 `playPersistent` 获取consumer实际series、verifyBinding和authority后委托原实现，禁止手工简化series、替换guard、增大timeout或跨操作缓存。当前源码的controller owner缺省untrackedWriters=false，registry.verifyCandidate的owner固定true；保存注入IO后两类实际标记及调用路径，保留差异，禁止改低标记或以回调结束代替子进程证明。
- [ ] 对实际对象方法作测试内透明包装，保留原参数/返回/错误/串行顺序。controller与OwnerLock的serial包装分别记录入队、action开始、结束；binding、identity/source/accounting/history各次调用记录调用次数、起止和父span。spawn包装仍调用原spawn，登记PID、CDP连接和身份、close/exit、drain单独记录。事件仅缓存在内存，测量结束后写盘，记录包装开销与未到达阶段。
- [ ] 设置测试专有 `DiagnosticStartupComplete` 停止点：真实CDP身份完成且lifecycle返回后，由context.newPage抛出普通Error，触发runner正常close且后续segment停止。先用短确定性测试证明停止点在open成功返回之后，命中恰一次、步骤全skipped、report failed、forced=false、exitConfirmed=true及正常drain；超时/取消不得被识别成该预定停止。无截图/视频是预定停止的局限，不伪造完整验收证据。复用COS92已有竞态/cleanup回归，只新增该停止点与计时分类所需检查。
- [ ] 一份trace同时保存nativeIO总区间和runner原15秒open区间；区分准备、外层guard、binding、controller/OwnerLock排队与执行、持久意图、spawn、register后二次binding、CDP身份、退出/drain。边界包含关系明确，不能把嵌套时长相加，也不能拿独立组件样本推导整链通过。
- [ ] 失败路径保持原取消和deadline，等待迟到work进入现有drain，核exact ticket和PID事实；drain拒绝、null ticket或不能确认退出即保留失败。捕获错误不吞掉cleanup failure。受影响typecheck/build和短测试通过后提交，独立reviewer批准实际diff才可执行真实样本。

### Task 3: 单次运行、独立核对与研究记录

- [ ] Root明确解除测量门禁，确认原根无其他写操作；记录批准源码SHA、依赖与Edge版本、输入保护清单。设置唯一TEMP输出目录。私有材料缺失则失败并列缺口，不使用小夹具降级。
- [ ] 仅运行一次实际历史诊断。下列变量是测试私有输入选择，不是生产CLI参数；测试必须校验路径和原清单，未选择actual模式时不隐式读取真实材料。

```powershell
$env:COS93_DIAGNOSTIC_SOURCE = 'E:/develop/Cosmos'
$env:COS93_DIAGNOSTIC_HISTORY = 'E:/develop/Cosmos/.cosmos/reconciliation/2026-10-13-c6-provider-usage/snapshot-after-case14-supplement.json'
node --experimental-strip-types --experimental-test-module-mocks --test --test-name-pattern='COS93 actual history native startup' tests/transfer/native-startup-diagnostic.test.ts
Remove-Item Env:COS93_DIAGNOSTIC_SOURCE, Env:COS93_DIAGNOSTIC_HISTORY
```

- [ ] 预期测试断言是“完整fixture准备真实、各边界可追踪、停止点/超时分类准确、原文件保持、清理结论有证据”；启动≤15秒是独立测量结果，只有真实登记、CDP/profile身份、正常close/drain均确认才可标startup passed。启动失败允许诊断测试成功记录事实，但研究记录必须显著区分两者。若提前在5秒identity/scope守卫或fixture准备处失败，标明未测得15秒整链，不将其归为浏览器性能结论。
- [ ] 保存raw TAP、trace、result、preservation、cleanup清单的绝对路径与hash。核原共享ledger仍revision3114、22/14/110/20、715requests、16901000µ且unknown/reserved0；原读集所有字节/mtime保持。核本fixture进程、服务/监听端口、专用profile、owner/locks、未登记意图与drain；原文件不得“恢复”或utimes。报告失败/保留现场也属于有效诊断结果，不能伪造清理通过。
- [ ] 中文研究记录列真实工作量、复制/原位读取差异、source与C14冻结SHA、测量钟边界、首次失败位置和最小后续建议。没有新付费/生成、C14重放、review/accepted/human提升，也没有对1707937µ余额作后继使用。实现者提交exact SHA，独立reviewer核实际diff和raw结果，唯一merger整合并记录结果；Root负责共享tracking。

## 定向检查与证据复用

```powershell
node --experimental-strip-types --test --test-name-pattern='COS93 native factory|COS93 fixture|COS93 diagnostic stop|COS93 timing' tests/transfer/native-startup-diagnostic.test.ts
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

初次计划提交时尚未执行上述命令；实现后的实际证据见下节。复用COS92作者/merger已通过的17、59、15、2、1、27项及补充1项，按原卡保留各自范围，不合并成新总数。旧generic fixture四条strict诊断保持；不因本轮文档更动重跑。仅对新源码/fixture差异运行必要检查、严格UTF-8及中文回读。诊断完成不等于15秒启动通过，更不等于COS16/COS18或完整目标游戏完成。

## 执行前的实现准备与轻检查

计划 `40dd033a6d01335edac24e7b55edaa35ca8d9747` 已获 `cos93_reviewer` 的 `PLAN_APPROVED`，无finding；[公开批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6181879964)。Root随后授权代码准备及轻检查，专用测量时段已交COS93，真实历史样本仍须实现diff独审后单次执行。

实现仅把原 `nativeIO` 改名导出为 `createNativeBrowserHostIO`，默认host使用同一函数。fixture保留生产quote3/claim/open、全部原历史及真实C5来源；新35行通过原API记账，不建provider/session。构建回调复用原dist并明确标为synthetic，未运行编译器。停止点及计时helper由实现侧独立helper编写并交回，随后由专职作者整合；此helper工作不替代独立reviewer。

Root批准用Node内建 `mock.module` 透明包装 `runAcceptanceInOwnedSession` 收到的真实lifecycle；原open的起止单列，实际route设置和newPage sentinel在其后。该方式需要上方actual命令的 `--experimental-test-module-mocks`，模块观测差异写入结果；不改生产runner或deadline。短确定性测试实际调用原lifecycle/runner/controller/OwnerLock，只有OS spawn/CDP为测试transport。

| 检查 | 实际结果 | 原始证据 |
| --- | --- | --- |
| factory RED | 缺少导出，1fail/0skip，exit1 | `C:/Users/26557/AppData/Local/Temp/cos93-native-factory-red.tap` |
| helper短GREEN | 4/4、0skip；停止点、正常close/drain、错误保留与独立时钟 | `C:/Users/26557/AppData/Local/Temp/cos93-diagnostic-short.tap` |
| 整合轻检查 | 6/6、0skip，5952.0068ms，exit0；含原根/缺材料拒绝及无效snapshot在controller/browser前拒绝并保留来源 | `C:/Users/26557/AppData/Local/Temp/cos93-integrated-short.tap` |
| 生产typecheck/build | 均exit0 | 本轮工具原始输出；没有虚构独立日志文件 |

两个新测试文件strict检查exit0，命令为 `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --skipLibCheck tests/transfer/native-startup-diagnostic.fixture.ts tests/transfer/native-startup-diagnostic.test.ts`；原始工具输出为空且退出0，不声称有独立日志文件。原预算target/grants拒绝沿用未修改的production API及COS90/COS91已审证据，不为了本诊断重seed历史重复测财务守卫。此准备阶段尚未运行真实历史路径，不能以该阶段的短测试宣称TEMP历史准备或15秒启动通过。运行时profile按原生产逻辑保留为新TEMP诊断证据，另核PID退出、精确端口不再监听、owner/drain和原保护集保持；不删除原历史或恢复时间戳。

## 首次实际未完成与P2结果保留

上述实现提交为 `59dd5d3a34fb65d5e6933f492aa91613a0fab19b`，精确提交strict退出0，raw `C:/Users/26557/AppData/Local/Temp/cos93-final-strict.log`。经 `cos93_reviewer` 的 `PRE_RUN_SOURCE_APPROVED` 及私有45分钟launcher独审后，Root在历史main `7df1e5b3b8662a4fa836c466f266f9b80d04d2e8` 冻结时单次执行。外层765169ms、exit1、无guard/kill；真实TEMP API完成715请求负载，原共享账本没有新窗口或费用。

scope.read span2197在5014.7298ms触发原5秒限制；nativeIO/open/CDP/browser全部0，15秒启动结果未测得。原host-report有精确failed summary，fixture却丢弃返回evidence并写phase=cleanup/error=null；这是当前P2修正范围。原466文件/61目录和ledger保持，独立POSTCHECK CLEAN后Root解冻。详见[研究记录](../research/2026-10-15-cos93-native-startup-diagnostic.md)与[公开结果](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6182530375)。原raw及launcher不改；334文件的稳定材料仅为选择范围副本，不是整棵TEMP归档。

- [x] 小契约RED：新增返回failed evidence分类要求，因缺API失败，1fail/0skip，raw `C:/Users/26557/AppData/Local/Temp/cos93-returned-evidence-red.tap`。
- [x] 最小修正：保存真实host.verify返回的完整evidence；未进入nativeIO写not_reached及精确failingGate/summary/span，保留throw exception与预定停止点的区别。无生产代码更改、无放宽guard、无大历史重建。
- [x] 定向GREEN：返回失败分类与无效小snapshot准备拒绝2/2、0skip、3913.1063ms，raw `C:/Users/26557/AppData/Local/Temp/cos93-returned-evidence-green.tap`；两测试文件strict退出0，raw `C:/Users/26557/AppData/Local/Temp/cos93-p2-strict.log`。
- [x] 补充真实fixture输出字段断言后，受影响两项2/2、0skip、4685.9324ms，raw `C:/Users/26557/AppData/Local/Temp/cos93-returned-evidence-integration.tap`；最终两文件strict退出0，raw `C:/Users/26557/AppData/Local/Temp/cos93-p2-final-strict.log`。未改变生产源码，原typecheck/build及其余轻检查证据复用。
- [x] 当前P2实际diff及研究记录已由 `cos93_reviewer` 独立APPROVED，无finding，唯一merger已整合。未执行第二次actual，原运行记录不被新分类函数重写；本任务完整15秒目标仍未完成，不标SOURCE全目标通过或关闭。

## 诊断实现已审集成

作者 `cos93_implementer` 最终 `0b475c1fe2918af5e6b61594f29d3060da766078` 经 `cos93_reviewer` 独立规格→质量 APPROVED，唯一merger `batch_c14_cos92_merger` 合入 `3d67a50a09a00d98b8fa6d54ee7745337d7e803d`。当前source-reviewed / actual-incomplete，issue #94保持open、integration partial；[公开实际结果](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6182530375)不表示15秒启动通过。

合并后COS93入口与两个测试文件等同批准版，COS94已审runner与测试保持。主线 `npm run typecheck` / `npm run build` 均退出0，raw为 `C:/Users/26557/AppData/Local/Temp/cos93-merge-typecheck.log`、`cos93-merge-build.log`。确认两个actual环境选择变量均未设置后，只执行 `node --experimental-strip-types --test --test-name-pattern='^COS93 (native factory exposes|fixture preserves returned verification failure)' tests/transfer/native-startup-diagnostic.test.ts`：2/2、0skip，4786.382ms，raw `C:/Users/26557/AppData/Local/Temp/cos93-merge-focused.tap`。

原6/6、P2 2/2和最终strict证据复用，未再构造35行模拟历史、执行actual或启动浏览器。唯一实际版仍为59dd，历史宿主7df、原游戏b20保持；稳定334文件/40225837字节是选择范围副本，原raw未重写。共享revision3114/¥16.901000和原C14失败保持，Root已解冻main。
