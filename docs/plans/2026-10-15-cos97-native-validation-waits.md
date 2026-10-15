# COS97 Native Validation Waits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在指定原生验证 transfer consumer 路径实现有限阶段预算，保留全部实时授权、原截止、取消和精确所有权，并覆盖真实 HTTP 导航等待。

**Architecture:** 可信 host 构造一个绑定当前验证 authority 的窄 wait 对象，consumer 将同一对象传给 clean origin 与 native persistent lifecycle。runner/persistent 逐段使用固定预算；origin 使用当前 segment lease 和原完整 pre/post guard，标量证据保存总耗时与错误来源。

**Tech Stack:** 现有 Node 22.22.2、TypeScript 5.9.3、node:test、Playwright 1.63.0；无新依赖。

---

状态：`design-revision / REVIEW_PENDING`，只写文档，全部实施/测试复选框未执行。前版2d61d0a的caller/generation/payload两项P2已独审解决；本版仅补scope/identity内部raw reader预登记与收尾，待affected复审。任务 [COS97 / #98](https://github.com/lrfluobida/Cosmos/issues/98)，id5864160449；[完整规格](../specs/cos97-native-validation-waits.md)、[ADR0002 proposed](../adr/0002-native-validation-waits.md)。设计基线 `dd367c5dd007ecbd43e2daf5b4e29635afc87fbb`，作者 `cos97_implementer`、独审 `cos97_reviewer`，唯一 merger `batch_c14_cos92_merger`。作者在 `codex/cos97-native-validation-waits` 和 own managed worktree 工作，不改 main/shared tracking/GitHub，不 push。

用户已授权持续推进 harness 工程，现阶段仅准备可审设计。产品决定已确认；Root 与独立 reviewer 审 routine 工程选择。本计划须独审通过，且 Root 明确授权源码阶段后才能运行下列步骤。actual、浏览器、真实 controller/715 seed、provider 与付费始终另需授权。

## 文件归属与最小范围

| 文件 | 责任 |
| --- | --- |
| `src/acceptance/native-validation-waits.ts`（新） | 固定 caps/版本、source factory provenance、阶段 race、HTTP segment lease、first cause、标量计时；不做通用框架 |
| `src/acceptance/runner.ts` | 可选可信 lifecycle 接线；native open/navigation、可信导航 gate、finally revoke、raw 标量证据；普通输入/default 保持 |
| `src/acceptance/persistent.ts` | native 三阶段 open、可选 register lifetime、raw registration settle 跟踪与 per-segment context；generic 分支保持 |
| `src/runtime/entrypoint-host.ts` | 仅validation transfer consumer构造与校验wait对象；nativeIO/ownedChild lifetime/completion，validationScope/preparationScope/requireDispatch真实caller signal接线 |
| `src/runtime/entrypoint-preparation.ts` | consumer context只读可选wait字段、result终点摘要，requireCurrent/requireScope/bindCandidate可信可选callerSignal类型 |
| `src/runtime/adapters/transfer/runtime-acceptance.ts` | 同一对象传 mount/playPersistent/diagnostic expected，consumer 总计时 |
| `src/runtime/adapters/transfer/runtime-host.ts` | 将可选对象沿 mount closure 转交，保持全部 binding 调用顺序 |
| `src/runtime/adapters/transfer/loopback-origin.ts` | 仅新native clean mount的gate、HTTP阶段、实际body核验；origin.verify/mounted.verifyScope可选caller signal；旧non-clean/generic保持 |
| `src/runtime/entrypoint-delivery.ts` | CleanDelivery及input.requireCurrent可选callerSignal；私有fixed Map闭包verifyPayload，保留最终双snapshot与原helper规则 |
| `src/runtime/entrypoint-validation.ts` | 两个requireValidation*Scope可选callerSignal转交controller/scope/fixed读取 |
| `src/runtime/validation-scope.ts` | 可选callerSignal合入原controller/private timer；readScope/readBytes/前后authority；原5秒/品牌/原reason保持 |
| `src/runtime/run.ts` | read/readValidationScopeAuthority/validationAuthority/requireValidationHost/checkValidationIdentity必要可选signal；原serial/expire与PID登记收尾保持 |
| `src/runtime/validation-window.ts`、`src/runtime/validation-budget.ts` | identity原options.signal贯穿，budget source可选signal与循环checkpoint，原5秒/实际来源保持 |
| `src/runtime/historical-passed-stages.ts` | verify已有signal传入完整只读历史循环，停止后续批次，保留原来源/读序/签名 |
| `src/runtime/recovery/task-journal.ts` | 只读resume open/read/signature/requireSignature可信可选signal，取消reason不被catch转换；写入/恢复规则保持 |
| `src/artifacts/paths.ts` | safePath/regularFile/snapshot可选signal及每轮前后检查；原路径/链接/nlink/默认与顺序保持 |
| `src/runtime/adapters/transfer/binding.ts` | bind/verifyPrepared及内部只读链可选signal，实际plan/design/candidate核验保持 |
| `probes/transfer/validation-case-six-driver.ts`、`probes/transfer/validation-case-six-entry.ts` | 实际运行期readScope/requireHistorical/scopeIdentity/verifyAdmission已有signal逐步转交与checkpoint；不改case/seed/预算 |
| `probes/transfer/validation-case-seven-driver.ts`、`probes/transfer/validation-case-seven-entry.ts` | requireOwnSource/accounting已有signal在批次间和实际receipt读取前后检查，controller.read传signal |
| `probes/e2e/validation-identity.ts`、`probes/transfer/validation-input.ts` | identity的readFixedInput回调与transfer固定目录/文件读取可选callerSignal，保留Git before→fixed→after |
| `src/runtime/adapters/transfer/persistent-diagnostics.ts` | 可选 expected 版本与新 timing 校验；旧报告兼容 |
| `tests/acceptance/native-validation-waits.test.ts`（新） | 有限预算、父夹紧、reason、stage/lease 与计数单元测试 |
| `tests/acceptance/persistent-launch.test.ts` | 生产 native handoff/lifecycle 的长授权、后登记、取消与迟到回归；旧 COS92 断言保持 |
| `tests/acceptance/native-validation-runner.test.ts`（新） | 无真实浏览器的 production runner transport fixture，导航与原正常输入时限 |
| `tests/transfer/native-validation-origin.test.ts`（新） | 隔离 TEMP + loopback 合成服务的 gate、实际 bytes 与 pre/post drift；不启动浏览器/真实历史 controller |
| `tests/transfer/runtime-acceptance.test.ts` | 当前 production consumer 与 clean 路径的同对象/选择范围代表 |
| `tests/transfer/persistent-diagnostics.test.ts` | 新契约缺失/漂移/时序/未收敛拒绝与旧 expected 兼容 |
| `tests/e2e/validation-scope.test.ts`、`tests/runtime/validation-scope-authority.test.ts` | 新caller取消真实scope链、原private5秒/原Error/controller优先与旧无参数代表 |
| `tests/transfer/passed-stage-reuse.test.ts`、`tests/transfer/validation-input.test.ts`、`tests/e2e/validation-identity.test.ts` | 只读历史/固定输入/Git下一批不再启动，exact reason；已有小TEMP fixture复用 |
| `tests/runtime/entrypoint-delivery.test.ts` | 新payload闭包fixed与actual比较、最终snapshot保留；新COS97用例不启动浏览器 |
| 本 spec / ADR / plan | 独审、实施、命令与结果记录；ADR 接受状态由独审结果决定 |

只对上述必要只读链添加可信可选signal及checkpoint，不改validation-scope的原5秒/品牌、RunController原serial/expire/PID收尾、OwnedWork默认drain、source/identity/history验证算法、通用bounded、standalone-launcher、游戏、参考安装、真实账本与旧报告。无signal路径保持。新增payload比较仅用于new native转发，原最终双snapshot保持。不新增CONTEXT词条：采用既有“当前执行绑定”“自动验收”“交付清理终点”，技术阶段名放spec。

## Task 1：固定契约、阶段 race 与 segment lease

- [ ] 阅读最终批准 spec/ADR 与当前实际 diff，确认源代码相对设计基线的变化；只更新被真实变化影响的步骤。
- [ ] 检查上述目标文件字节，严格 UTF-8/no BOM 和现有行尾；发现非 UTF-8 在写入前停止并报告。开始编辑前说明具体文件。
- [ ] 新建 `tests/acceptance/native-validation-waits.test.ts`，先写最小 RED：源码工厂存在且不能选择 cap；prepare 25 秒合法、60 秒精确到期；W 较短时父夹紧，剩余≤0 零派发。使用 Node fake Date/setTimeout 与真实 deferred Promise，不能用此模拟时长声称性能。
- [ ] Run: `node --experimental-strip-types --test tests/acceptance/native-validation-waits.test.ts`。预期 RED 是缺工厂/未实现契约的具体断言；保留原始日志，不把导入配置错误当作行为 RED。
- [ ] 创建窄模块，固定 `native-validation-waits/1`、prepare/register 60000、transport 15000、navigation 300000、HTTP 60000/15000/60000；只接收 authority/signal/工作跟踪，不接受 cap 或 clock override。内部 WeakSet 验证 source factory 对象。
- [ ] 实现 spec 的固定状态机、一次 stage 冻结、原 reason 首因、timer/listener finally 收尾、入口捕获 lease 与标量 snapshot。beginSegment返回捕获唯一generation的handle，close/abort撤销；旧callback不得获取新段generation或打开/撤销后续gate。操作promise必须观察迟到rejection；成功不得取消后续exact handoff使用的lifetime。
- [ ] 扩展边界测试：预取消原 reason 同对象、parent 到期、私有 timer 独立品牌、首因后 cleanup 附加、closed/reopen/旧 lease拒绝、无源码对象/身份漂移拒绝、计数溢出失败、HTTP 聚合有界。原私有 scope classifier 另在 Task 4 真实生产路径验证，不靠同名 Error 替代。
- [ ] 重跑同一目标命令，预期全 pass、0 skip、无 unhandled rejection；记录 SHA、断言和可复用证据，提交 `feat: add fixed native validation wait contract`。

## Task 2：可信选择与三阶段 owned launch

- [ ] 在 `tests/acceptance/persistent-launch.test.ts` 使用现有真实 production `createPersistentOwnedChild` 和合成 spawn/CDP seam；保留旧无对象 COS92 fixture。先加 RED：new native pre-ticket binding 超过15秒仍无早 spawn；post-register binding 超过15秒仍零 CDP，只有 fresh 完成后一次 connect；transport 自己15秒到期。
- [ ] Run: `node --experimental-strip-types --test --test-name-pattern="COS97" tests/acceptance/persistent-launch.test.ts`。预期长授权/分段或对象接线断言失败，原测试不改成更宽容的旧默认。
- [ ] `entrypoint-host.ts` 在 validation transfer consumer 分支构造源对象；验证 current coding case/window/task/deadline。consumer context 类型增加可选字段；nativeIO 拒绝错 identity/series/deadline 或无 provenance 对象，generic/human 不构造。
- [ ] `runtime-acceptance.ts` 与 `runtime-host.ts` 只转交同对象，不重建、不复制 caps、不减少任何 current guard。native object 无 cleanDelivery 立即拒绝。
- [ ] verifyBinding/consumer.guard/context.requireCurrent/preparation.requireCurrent及bindCandidate改为spec中的可信可选callerSignal；prepare传launch.signal、register传registrationLifetime.signal、HTTP pre/post传各阶段signal。不得以外围race代替下述Task2A的真实接线。
- [ ] `persistent.ts` 的 native open 实现 prepare→spawn→register+fresh→transport 三段；所有边界检查使用 W。原 ordinary lifetime 和 runner15秒行为保持；保留 endpoint/profile/PID/default context/service-worker 检查。
- [ ] `PreparedPersistentChild.register` 增加可选registration lifetime。先启动exact PID持久化，再检查lifetime并完整fresh；不因本地到期丢弃已spawn的PID。按spec纸面图只让raw registration observer结算新native completion；stage catch不得提前结算，prepare不等待browser close/series/public drain，runner finally不等待包含自身的OwnedWork集合。raw prepare迟到仍释放exact unspawned ticket。
- [ ] 增加阶段间 source/HEAD/index/window/budget drift 断言：pre-ticket读取中漂移零ticket/spawn；pre检查通过后至postfresh期间漂移允许owned spawn/PID登记，但零CDP/零gate；postfresh后漂移由HTTP pre/post拒绝有效字节。用现有最小production守卫fixture/隔离TEMP，不把检查间隙写成零OS副作用事务保证。
- [ ] 增加取消、late handle、late register fulfilled/rejected、exact release失败、release rollback、public drain pending/cleanup AggregateError、原abort reason。逐项断言retained ticket/PID、completion pending→raw settled唯一结算、无drain自等待/重复登记/悬空rejection；未收敛时不得controller.close成功。
- [ ] Run: `node --experimental-strip-types --test tests/acceptance/persistent-launch.test.ts tests/acceptance/native-validation-waits.test.ts`。预期全 pass/0 skip。旧 COS92默认15秒断言是兼容验收；提交 `feat: separate native authorization and browser launch waits`。

## Task 2A：取消贯穿真实授权、历史与固定输入

- [ ] 先在既有小TEMP fixture写COS97 RED：真实consumer的pre/request取消到达readScope/identity/history信号；阻塞当前leaf后取消并释放，只观察已派发项settle，下一scope/history/file/Git批次次数不增加。无715历史、无browser/provider。
- [ ] Run: `node --experimental-strip-types --test --test-name-pattern="COS97" tests/e2e/validation-scope.test.ts tests/runtime/validation-scope-authority.test.ts tests/transfer/passed-stage-reuse.test.ts tests/transfer/validation-input.test.ts tests/e2e/validation-identity.test.ts`。预期RED是信号未到达/下一轮仍启动/原reason被包装的行为断言。
- [ ] 按spec“Caller signal的实际贯穿”表逐项实施：requireDispatch增加第四caller参数并保留原taskSignal，validationScope/preparation/origin/cleanDelivery跨层原样转交caller，本地active仅给读取；entrypoint-validation传requireValidationHost与requireValidationScope；controller排队前和serial原expire后检查，identity/options.signal与budget source贯穿；不改原guard/timeout/读序。
- [ ] native模块私有WeakMap绑定原phase/request signal与wait/segment/generation；origin.failCurrent统一verify及runtime-host两个catch的失效规则。可信当前局部取消只撤销旧lease，旧generation迟到error不得close/clear新mount或invalidate新preparation；原controller/work取消仍关闭对应origin，当前真实source/window漂移保留原close，私有5秒例外保持。真正clear/close前再次比对origin/mount/wait/generation，关闭后不得回调清除新对象。
- [ ] raw settled/计数/completion只在完整catch/failCurrent/必要close与自身listener清理后结算；下一段等该链和原browser exit。成功移除自身listener，保留原controller/work服务寿命listener；晚到callback固定入口mount/generation，不读取当前段操作新lease。以阻塞invalidation finally的fixture证明新段不会提前开始。
- [ ] requireValidationScope增加可选callerSignal，组合原controller/private5秒timer并传readScope/readBytes；controller原reason在catch优先，其余原对象重抛。每个await后检查，取消后不启动后置snapshot或下一scope；timer/listener finally保持。
- [ ] 仅native caller的requireValidationScope readScope/readBytes及verifyValidationIdentity完整work，在创建raw前调用工厂host trackRaw(start)回调；回调固定input.work.run(thunk)，先登记owner再在受控microtask启动真实reader。已abort时thunk零启动，不能把已启动Promise交给可能拒绝的work.run追认；无native owner保留原调用形态。
- [ ] run.checkValidationIdentity与上述两处组合signal用associateNativeReadSignal继承原native owner/caller/generation；native consumer/series默认guard使用工厂专属读signal，不标记共享controller.signal。derived signal只有raw关联、不改变已审local-cancel分类。race仍及时返回原5秒/首因，独立raw集合保留到内层reader完整catch/finally/listener cleanup，观察late rejection并删除settled项。
- [ ] 新deferred reader RED→GREEN：分别阻塞scope readScope/readBytes与identity work，先让private5秒/caller取消返回，断言内层raw pending、segment不能启动下一段且public drain不能成功；释放后才settle。取消后下一scope/history/file/Git批次零启动，预先abort的thunk启动计数0，原Error/reason/品牌保持。segment等待只含独立raw子集合，不含playPersistent/runner自身，外部OwnedWork快照须已包含raw operation；复用Task2A的同一目标命令，不新增actual或全局框架验证。
- [ ] historical.verify已有signal真正用于每个capture/receipt/signature/目标副本循环，TaskJournal只读方法和paths safePath/regularFile/snapshot可选signal逐层转交。catch遇active abort重抛reason，不包RecoveryBlocked；没有signal的读写/恢复路径原样保留。
- [ ] 固定six/seven运行期readScope/identity/history/source/admission/accounting调用间检查；identity readFixedInput转交已有combined给transfer固定目录/文件读取。source算法与COS96每组4路保持，已派发组全部观察，取消后下一组零派发。metadata getCapture/getCandidate单个原读取前后检查，不改registry API。
- [ ] GREEN断言：原Error/reason对象严格相等；真实私有scope Error仍被isValidationScopeTimeout识别；controller同时abort时原controller reason优先且对应origin关闭；当前caller局部取消保留listener；取消后下一轮计数不变。旧lease callback迟到reject经过真实guard/requireCurrent catch时，新mount/listener/preparation/gate/首因全不变；当前真实source漂移仍关闭、旧无signal调用仍有效。late registration成功/失败、exact ticket/PID、completion pending与public drain一起复验，防接线提前解除所有权。
- [ ] 重跑同一目标命令与Task2的launch目标，预期全pass/0skip；提交 `fix: propagate native validation cancellation through read guards`，记录仅必要可选参数/检查的actual diff。

## Task 3：真实 HTTP 等待、恢复门禁与 runner 导航

- [ ] 在 `tests/transfer/native-validation-origin.test.ts` 创建新的隔离 TEMP clean服务，走生产 `reserveTransferOrigin.mountCandidate`；新对象到达时 gate关闭。RED：恢复请求在注册fresh/CDP/导航前404且不读取upstream；同一请求不能在后来open时转为合法；新段拒绝旧lease。
- [ ] 在 `tests/acceptance/native-validation-runner.test.ts` 用最小合成 context/page/CDP transport 驱动 production runner，无真实 browser。RED：合法HTTP授权等待超过15秒仍等待，同样normal-input仍原2秒/plan值，navigation300秒与W任一先到立即失败。
- [ ] Run: `node --experimental-strip-types --test tests/transfer/native-validation-origin.test.ts tests/acceptance/native-validation-runner.test.ts`。保留行为 RED。
- [ ] `entrypoint-delivery.ts` 返回可选verifyPayload(name,{status,bytes},callerSignal)，闭包只读原fixed Map的dist/name exactkey；newnative mount要求它存在。origin沿现已计算name转交，不新增URL mapper/decode，不改launcher。listed200必须actual Buffer.equals(fixed)，listed非200或错body拒绝；unlisted404只发固定Not found，绝不转发错误body；unlisted200拒绝。
- [ ] `loopback-origin.ts` 仅newnative clean mount捕获当前lease、跟踪raw request；严格pre完整verifyScope(activePre)→fetch/arrayBuffer(activeBody)→body边界→post完整verifyScope(activePost)→verifyPayload(activePost)→signal/deadline/lease/mount→同步writeHead/end。每stage真实转交caller，closed/旧lease直接404；旧non-clean/generic保持。比较并发送同一个actual Buffer，原最终双snapshot不删。
- [ ] `runner.ts` native open不套旧15秒总race；使用同对象父界限和三阶段证据。原页面/route/视频/异常设置完成后紧邻goto调用beginNavigation，goto/load/response/origin成功后finishNavigation；navigation既有请求不重置自身截止。
- [ ] runner finally先revoke再原清理，取消本段请求并在原剩余cleanup预算内检查settle；超时记录pending/cleanup failure，host-owned tracker继续保留责任。不能将网络连接关闭视为授权工作settled。
- [ ] 补HTTP body期间实际source/HEAD/index/window/budget、origin receipt与mount漂移拒绝，pre/post检查次数与顺序明确。payload RED→GREEN至少包括：正常fixed body有效200；pre后改clean dist且上游读取错body、随后磁盘恢复仍零有效200；上游返回错误Buffer但disk始终正常仍拒绝；listed404/unlisted404/编码路径/Unicode/query与原映射一致；不靠最终snapshot替代actualbody断言。
- [ ] 在新origin与entrypoint-delivery COS97用例覆盖取消/latebody/post取消：传入fetch/read的signal已abort，下一scope未启动，lease失效后零200、原payload/取消Error首因保留且goto错误为次生。副本末态未恢复时原最终snapshot仍失败；generic/no-wait调用不因新增方法改变行为。
- [ ] 静态疑点 `runtime-acceptance.test.ts` 的旧 `completeBindings===1` 与现源码每HTTP调用verifyBinding不一致：先在新的独立TEMP用原fixture单一baseline核证，记录结果，再只按批准spec与实际必要性修正受影响断言；不得为全suite通过删除fresh断言或现在提前跑baseline。
- [ ] Run: `node --experimental-strip-types --test tests/transfer/native-validation-origin.test.ts tests/acceptance/native-validation-runner.test.ts tests/transfer/runtime-acceptance.test.ts`；Run: `node --experimental-strip-types --test --test-name-pattern="COS97" tests/runtime/entrypoint-delivery.test.ts`（只选新Node/helper合成用例，不运行该文件旧browser用例）。预期新行为通过；若旧baseline失败，保留失败和最小修正证据。提交 `feat: verify native response bytes before guarded forwarding`。

## Task 4：版本化证据、诊断与兼容

- [ ] `tests/transfer/persistent-diagnostics.test.ts` 先加RED：可信expected新版本但raw缺记录、错task/deadline、阶段越界/次序错、pending非零、elapsed/总起止不一致都拒绝；旧expected无version仍读旧raw，旧v3不改。
- [ ] 在runner/persistent raw增加spec限定nativeWaits，只记已发生的segment/series终点与consumer起点；consumer最后guard完成后在result及host原browser envelope记consumer独立终点，不回写已认证raw。Date绝对时间与performance实际elapsed分清；并发HTTP固定3行聚合，非加和成总墙钟，race结束与raw未收敛pending分别记录。
- [ ] diagnostic expected仅由可信consumer传version；校验新记录后仍执行原report/evidence/identity/checkpoint/failure facts全部检查。生命周期/权限/HTTP错误保持insufficient_evidence；sourcefirstcause不能被派生goto/404改成code_defect。
- [ ] 用真实 `requireValidationScope` 生产guard的最小合成绑定触发原5秒私有timer，并跨native stage/HTTP验证`isValidationScopeTimeout`对象身份与原controller abort reason；预取消/同名伪Error不能获得私有分类。只用独立TEMP，不复制715历史seed或真实账本。
- [ ] 验证 selector 范围：generic persistent、human、无可信对象、plain runAcceptance 仍原open/navigation15秒，普通输入2000/locator/observations保持；伪native对象与series JSON中的预算字段拒绝。复用现有generic unit fixture，若其中browser步骤需要实际浏览器则列为另待授权，先运行其合成兼容代表。
- [ ] Run: `node --experimental-strip-types --test tests/transfer/persistent-diagnostics.test.ts tests/acceptance/native-validation-waits.test.ts tests/acceptance/persistent-launch.test.ts tests/acceptance/native-validation-runner.test.ts tests/transfer/native-validation-origin.test.ts`。预期全pass/0skip；旧证据只因真实代码delta选择代表，不重跑220/62。
- [ ] 提交 `feat: record and verify native wait contract evidence`，在本计划记录targeted命令、结果、exactSHA、首因/阶段与已知未测项。

## Task 5：受影响检查与独立源码审查

- [ ] 执行 `npm run typecheck`、`npm run build`。预期exit0；不通过时修复当前delta，再重跑受影响检查。
- [ ] 对新增及受影响文件运行现有项目strict命令：`node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck src/acceptance/native-validation-waits.ts tests/acceptance/native-validation-waits.test.ts tests/acceptance/persistent-launch.test.ts tests/acceptance/native-validation-runner.test.ts tests/transfer/native-validation-origin.test.ts`。若既有transitive基线诊断出现，先固定baseline核证并记录，不通过扩大源码范围掩盖；其余必要strict根据实际触及文件补精确清单。
- [ ] 运行独立reviewer指定的最少组合代表：真实private scope timeout/abort、source+closure drift、ownership late release/drain、consumer clean mount与旧generic synthetic；已通过未变组按版本复用。不要运行全量paid/e2e或复制715历史。
- [ ] 严格UTF-8/no BOM解码全部编辑文件并回读中文，检查原文件行尾/中文minimalpatch；执行 `git diff --check` 和 `git status --short`。预期无编码变化、无无关diff、仅批准范围。
- [ ] 交独立`cos97_reviewer` actual diff与exactSHA、批准spec/ADR/plan、原始检查日志与known gaps；先规格后质量。可行动finding仅在作者branch修复，补受影响验证并复审。
- [ ] 唯一merger只集成独审批准SHA，按实际变化做最少integration checks并记录；作者不合main/push。ADR的accepted须有独审通过记录，不能靠作者自行提升。

## 后续 actual 准备关口（不在本计划实施授权内）

- [ ] 若Root另行授权新的免费完整诊断，先单独提交一次性launcher方案并独审；冻结已审集成源码，新TEMP与new intent，只读旧来源，保持原45min外guard、5秒scope和所有预算。
- [ ] 至少走真实导航/ready与正常browser/helper/controller/ports/owner清理；pre-newPage sentinel不足。分报prepare/register/transport/HTTP/navigation/exit及consumer/series总墙钟，同时列新contract与旧15秒超界观测，不提升旧C14/accepted/human。
- [ ] Actual由Root授权的运行方执行一次并独立核证；当前不创建脚本、不启动browser/controller、不复制seed、不调用provider、不付费。

## 设计提交验证与证据复用

本次只新增spec、ADR proposed、plan三份UTF-8无BOM/LF文档；不改CONTEXT或源码/测试。作者提交前只做文本严格解码、中文回读、链接/实际源文件路径静态核对与git diff --check，不运行测试/构建/诊断。已有COS92/93/96的通过与失败均按原版本复用。

原C14 failed/consumed与v1/v2/v3不改；真实ledger revision3114、715请求、¥16.901000、reserved/unknown0，¥150验证（含prior¥0.721771）、正式¥200/12h、优化¥100/6h保持。参考游戏只读，不复制美术音频；APIkeys不得进入文件、日志、任务、Git或模型上下文。COS93仍open/partial/startup-failed，COS16/COS18、完整经典、coding批准、accepted与human仍未完成。

## 作者源码切片 1：固定预算与原生 raw helper（局部，待源码独审）

实施base为已发布`88f9444b25a9adc7806c016402a0f456d35c0bb6`，作者branch已ff合入。新增helper与6项受控测试，先验证prepare/register固定60秒、原D-5000夹紧、source factory身份、native reader在host取得所有权后才启动、取消pending drain、late rejection与普通reader即时默认。navigation/HTTP/generation完整接线及scope/identity生产race接线尚未完成，不能把本切片称为完整契约或source ready。

同一命令`node --experimental-strip-types --test tests/acceptance/native-validation-waits.test.ts`实际RED 0/6、6fail、0skip、exit1，缺source factory断言；GREEN 6/6、0skip、exit0、190.3257ms。首次GREEN因Node strip-only不支持参数属性语法失败，改显式字段后通过，原失败保留。source/test定向strict exit0；类型注解修正不改变已过运行路径，未重复该组或未变220/62证据。

原始日志根`C:/Users/26557/AppData/Local/Temp/cos97-native-waits-1b7732209ed34c1b95002b7640383398`：`helper-red.tap`、首次语法失败`helper-green.tap`、最终`helper-green-2.tap`与`helper-strict.log`。无真实browser、provider、715历史seed、actual或付费；下一步先写真实scope/identity deferred-reader RED，再接生产raw所有权。

## 作者源码切片 2：scope/identity 内层 raw 预登记（局部，待源码独审）

真实`requireValidationScope`的readScope/readBytes与`verifyValidationIdentity`的完整work使用同一helper，在native caller关联下取得host所有权再派发；scope增加可信可选caller并保留原controller reason优先/私有5秒品牌。无native关联时保留原reader调用形态，外层race仍及时返回；完整host/controller/consumer信号链接线仍待后续切片。

`node --experimental-strip-types --test --test-name-pattern="COS97" tests/runtime/validation-scope-authority.test.ts`：实际RED 0/4、4fail、0skip、exit1（raw pending错误为0，caller原因被原private timer取代），GREEN 4/4、0skip、exit0、487.0636ms。deferred未释放时owner/raw仍pending，100ms有界drain拒绝；释放后收敛且不开始下一轮，原scope品牌与exact caller Error保持。

受影响完整`tests/runtime/validation-scope-authority.test.ts`回归17/17、0skip、exit0、1483.9687ms，覆盖旧队列/expiry/window/authority/source默认；helper/scope/window/test定向strict exit0。日志仍在上述TEMP：`inner-readers-red.tap`、`inner-readers-green.tap`、`scope-authority-regression.tap`、`inner-readers-strict.log`。新增fixture只用隔离TEMP的小controller和免费固定来源，没有715历史、browser/provider/actual或付费。下一步为helper的generation/导航/HTTP及贯穿闭包写新的RED。

## 局部审查修正：阶段到期派发与排队取消计数

独审49058切片提出两项P2：timer回调迟到时raw microtask仍可派发已过stageEnd的操作；reader启动才计started而所有已登记operation均计settled，排队取消会出现0/1。两项先做真实RED 0/2，再在operation之前检查冻结deadline，统一started/settled为已取得所有权的operation计数（不冒充实际reader派发次数）。queued取消的reader调用仍为0，计数1/1/pending0。

受影响helper完整GREEN8/8、0skip、exit0、243.1437ms，定向strict exit0；`helper-p2-red.tap`、`helper-p2-green.tap`、`helper-p2-strict.log`在同TEMP。未改scope/window生产或其17项行为，复用此前4/17通过证据；继续完整navigation/HTTP/lease与host信号链实施。

第二切片独审另发现readBytes裸函数丢失原method receiver。两个native/no-native合法this.reference用例实际RED0/2 TypeError，最小改为`active => fixed.readBytes(active)`后GREEN2/2、0skip、exit0、470.8573ms，定向strict0；`reader-receiver-{red,green}.tap`及`reader-receiver-strict.log`同TEMP。原scope品牌/计数/reader所有权逻辑保持，其余4/17与helper8证据复用。

## 作者源码切片 3：helper 导航、HTTP 与 generation（局部，待接生产）

新增5项状态/门禁/收尾RED0/5及原caller provenance RED0/1；helper完整GREEN14/14、0skip、exit0、241.8728ms，定向strict0。固定navigation300秒与HTTP60/15/60分别执行，HTTP仅3类聚合行；恢复早请求门禁关闭、旧handle/request/generation失效、中性旧revoke、navigation完成不延长已进入request上界、独立raw/request/stage集合settle等机制已在受控单元验证。原caller有generation失效身份，derived signal只有读取所有权关联。

日志同TEMP：`lease-http-red.tap`、`caller-generation-red.tap`、`lease-http-green.tap`、`lease-http-strict.log`。生产runner/nativeIO/origin/完整caller链尚未接入；本切片不证明真实导航/ready/cleanup、whole-open15通过或整卡完成。下一步继续按批准文件边界连接并验证实际生产方法，无browser/provider/actual/715 seed/付费。

## 作者源码切片 4：controller caller 与 identity owner 贯穿（局部）

controller read/readValidationScopeAuthority/validationAuthority/requireValidationHost接可信可选caller；排队前及原serial expire后检查，checkValidationIdentity组合signal继承native owner，原5秒identity race及时返回但raw不提前消失。budget source在每个receipt前后检查caller，scope前后authority读也转交它；无caller保持原入口与队列行为。

预取消与controller→identity raw两项实际RED0/2→GREEN2/2、0skip、445.8454ms；追加真实串行前项阻塞/后项取消零新identity及controller原reason优先代表。受影响scope authority完整23/23、0skip、exit0、2123.4667ms，run/budget/scope/test定向strict0。`controller-caller-{red,green}.tap`、`controller-caller-regression.tap`、`controller-caller-strict.log`在同TEMP；只有合成小controller/免费来源，无实际账本或浏览器。

host/preparation/origin/clean delivery/固定输入与历史的余下可选caller接线、payload发前核验及runner物理启动仍待后续切片；不把本次组件通过提升为整卡完成。

## 作者源码切片 5：路径读取 caller（局部）

safePath/regularFile/snapshot添加可信可选signal，目录/文件前后检查，实际readFile传signal并按原reason重抛；budget receipt转交同signal。原默认路径、链接/nlink/ownership与读取顺序保持。3种预取消与真实首文件完成时取消共4项RED0/4→GREEN4/4、0skip、253.7643ms；下一文件零派发。旧capture与路径/符号链接代表2/2、0skip、642.5088ms，定向strict0。

`path-caller-{red,green}.tap`、`path-default-regression.tap`、`path-caller-strict.log`仍在同TEMP。测试的readFile gate实际观察生产读取，不以mock计数替代真实文件字节；无browser/provider/actual或真实账本。

493切片独审补正expire后原reason优先：identity内advance到原deadline且先取消caller，单项RED仍抛caller；将优先检查置于整个try/finally expire之外后GREEN1/1、0skip、520.3169ms，strict0。保留原expire副作用与无caller路径；日志`expiry-reason-{red,green}.tap`、`expiry-reason-strict.log`同TEMP。其余无delta23/helper14/既有通过证据复用。

509路径切片独审补正safePath await与readdir派发之间的取消窗口：受控真实lstat continuation后取消，RED实际启动1次readdir；拆target await→原caller检查→readdir后GREEN1/1、0skip、266.9658ms，strict0。日志`path-dispatch-{red,green}.tap`、`path-dispatch-strict.log`同TEMP；不重跑无delta4路径/旧capture2/23等组。

## 作者源码切片 6：历史来源与只读 journal caller（局部）

history.verify的capture/receipt/signature/实际字节与目标副本读取贯穿已有signal，保留原per-call复用与读序。TaskJournal只读resume open/read/signature/requireSignature增加可选caller；原取消Error不被RecoveryBlocked吞并，write/非resume默认保持。2项实际RED中，历史取消后仍读69次，journal预取消未拒；GREEN2/2、0skip、19624.4369ms，第一历史字节后取消现只读1次。另扩journal实际读取中取消的三个catch路径，并以旧完整closure验证/双次import代表校验兼容，2/2、0skip、20541.1103ms；定向strict0。

日志`history-journal-red.tap`、`history-journal-green.tap`、`history-journal-compat.tap`、`history-journal-strict.log`在同TEMP。仅真实SOURCE/TEMP固定回执与合成已通过stage，没有实际账本/715或浏览器。consumer/host/origin等余下闭包接线仍待完成。

2801历史切片独审补正两组Promise.all的内层raw：仅native关联下，每个signature/receipt分支真实开始前经既有runNativeValidationRead取得host所有权，先拒仍及时传播原Error，其他已派发项保持pending；普通路径/同调用复用/读序保持。两个已开始receipt一项先取消、另一deferred未释放的单项RED缺pending→GREEN1/1、0skip、13003.2098ms，释放前drain失败、释放后才settled，strict0。日志`history-batch-{red,green}.tap`与`history-batch-strict.log`同TEMP；原20秒2+2等无delta组按指示复用。

## 作者源码切片 7：entrypoint validation caller（局部）

requireValidationPreparationScope/BrowserScope可选caller转交controller host与scope，读取固定requirement/template时原controller reason优先并停止后续读取；无caller保持原读取形态。预取消与controller guard返回后取消两项RED0/2→GREEN2/2、0skip、584.152ms；active native caller完整scope与两个内层raw owner正确收尾代表1/1、0skip、713.2615ms；定向strict0。日志`preparation-caller-{red,green}.tap`、`preparation-caller-positive.tap`、`preparation-caller-strict.log`同TEMP。

Root已把6个probes固定输入/identity/readScope signal转交独立作者与reviewer，基于7a731f9；本作者保留这些文件不修改，待APPROVED exactSHA后在ownbranch集成。剩余binding/host/origin/payload/runner由本作者继续，真实browser/provider/715/actual仍未授权。

Root批准记录（2026-10-15）：设计 `db0366bdd64398067c58272110beb460da585c12` 经 `cos97_reviewer` 独立 SPEC/ADR/PLAN APPROVED、无剩余finding；[公开批准](https://github.com/lrfluobida/Cosmos/issues/98#issuecomment-6190820982)已由Root精确读回，唯一merger合入 `eaeabf8d60cf2897e0bf538f3f703566bb3c8762`。ADR0002为accepted；设计合入后实施授权生效，作者按已审计划独立实施及必要免费验证，源码仍待独审，actual/paid未授权。
