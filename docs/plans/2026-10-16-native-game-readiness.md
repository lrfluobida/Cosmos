# Native Game Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. 每项由独立 implementer/reviewer 负责；唯一 merger 为 `batch_c14_cos92_merger`。A/B/C源码已独审并组合验证，原清单保留规划要求，实际结果见文末；actual仍须另行下达。

**Goal:** 让既有固定候选在真实异步素材加载后完成一次原生导航，并在原截止内保留视频、正常退出。

**Architecture:** 可信 host 为指定 native 路径选择 `/2`。每 HTTP 验证当前 controller authority 和实际固定 payload，来源/历史仍在原阶段边界及发布前完整核验；ready 复用导航剩余时间，cleanup 使用单一有界共享余量。

**Tech Stack:** TypeScript、Node 22、Playwright 1.63.0、现有 controller/OwnedWork/loopback origin/clean delivery。

---

## 执行约束与顺序

批准记录：设计 `1c8610e9fd4b20880fb1cafa016ca9f901e71d81` 经 `native_readiness_design_reviewer` 独立规格/可实施性→质量 APPROVED，无finding；Root批准工程设计及后续源码实施。唯一merger `batch_c14_cos92_merger` 合入 `9940c130ce8de32136b579d79c1dded99db17dda`。 任务 A 为 [COS98 / #99](https://github.com/lrfluobida/Cosmos/issues/99)，依赖COS93/97；任务 B 为 [COS99 / #100](https://github.com/lrfluobida/Cosmos/issues/100)，依赖COS93及COS98已审接口；任务 C 为 [COS100 / #101](https://github.com/lrfluobida/Cosmos/issues/101)，依赖COS97及COS98已审接口。完整 `native-validation-waits/2` 仅在A/B/C均独审并组合验证后发布，不提前发布半契约；当前actual/paid均未授权。

基线 `e2358cd59a6313e049605cd652912d326745d414`；先读 [spec](../specs/native-game-readiness.md) 与 [ADR0003](../adr/0003-native-fixed-candidate-execution.md)。保留现有 `/1` 工厂与验证器，新的源码私有工厂固定选择 `/2`；不提供 CLI/JSON/环境变量的版本或预算开关。

A、B、C 是独立审查单元，可分别用免费小夹具证明。A/C 会碰同一 native helper/diagnostics；实施者各自 branch/worktree，唯一 merger 根据批准 SHA 合并。可以先后实施减少冲突，不要求 C 等 A 的实测结果。`/2` 完整生产选择仅在 A+B+C 合并并通过组合检查后发布。Root已登记COS98/99/100；本次仅设计文档集成，不运行 browser/715/provider。

## Task A：固定候选 HTTP 与当前执行权

**Files:**

- Modify: `src/runtime/run.ts` — 窄 controller 当前执行检查；复用原 serial/expire/authority。
- Modify: `src/acceptance/native-validation-waits.ts` — `/2` 工厂、固定阶段值、可信回调和旧 `/1` 兼容；不增加通用策略框架。
- Modify: `src/runtime/entrypoint-host.ts` — 仅 validation candidateConsumer 选择新工厂、绑定原 controller/task/deadline。
- Modify: `src/runtime/entrypoint-delivery.ts` — 暴露已有本地 `checkActive`，保留 requireCurrent/verifyPayload/final snapshots。
- Modify: `src/runtime/adapters/transfer/loopback-origin.ts` — 分离本地 receipt/listener 检查，`/2` 请求替换完整 pre/post，原 mount/full guard 保留。
- Modify: `src/runtime/adapters/transfer/persistent-diagnostics.ts` — 可信版本分派，旧固定值保持，校验 `/2`。
- Test: `tests/runtime/validation-native-execution.test.ts`（新增小 controller fixture）、`tests/transfer/native-validation-clean-origin.test.ts`、`tests/acceptance/native-validation-waits.test.ts`、`tests/transfer/persistent-diagnostics.test.ts`。
- Existing callers: `runtime-acceptance.ts`、`runtime-host.ts`、`persistent.ts` 已传同一 wait 对象；仅在类型编译实际需要时做签名调整，不重写原 full guard。

- [ ] 写 RED：真实小 controller 当前允许时通过，合法并行任务 reserved 沿原预算计算仍可允许；case/window/task/deadline 错配、reserved耗尽额度、unknown、额度/请求上限、任务结束、controller stop 均拒绝。对 identity/source reader 设拒绝计数，证明新检查不调它们；不要合成一个永远 true 的 authority 代替控制器行为。
- [ ] 用 `node --experimental-strip-types --test tests/runtime/validation-native-execution.test.ts` 取得所需行为尚缺的 RED；记录失败断言，修夹具错误不能计作功能 RED。
- [ ] 实现 `requireNativeValidationExecution(binding, caller)`：在 `serial` 中 `checkCaller → requireValidationCase → deadline一致 → validationTaskAuthority(...,'reviewer').admissionAllowed → checkCaller`。状态只来自 `this.snapshot`；保留原预算计算，不加零reserved政策。方法不调用 `requireValidationHost/checkValidationIdentity`；原 full guard 边界的零reserved检查和新 live 差异按 spec 保留。
- [ ] 写 HTTP RED：真实本地请求收到原 upstream bytes，固定快照不匹配即拒绝；每请求只走两次新 live 检查/本地 receipt，full verifier 计数只在原入场/发布增加。延迟 body 时取消、当前 ledger 变化、receipt/mount 变化、旧 generation late callback 都不得发有效200。
- [ ] 新工厂必须验证同 owner/case/window/task/deadline；现有 `/1` 工厂保留。新 `/2` stage pre/post 固定5000，body15000；原阶段 raw ownership、错误身份和关闭路径不变。把生产 host 的 closure 接入同品牌对象，origin 必须拒绝缺本地 clean check/payload verifier 的新 mount。
- [ ] 补可达来源漂移测试：已固定 bytes 可在 segment 中继续响应；原下一 full guard 对持久 source/HEAD/history/外部 ledger 来源变化拒绝发布、保留 first cause。另明确瞬变恢复只保证 fixed payload，不强写旧 fresh 拒绝断言。保留 pre-ticket/post-register 原 source 拒绝测试。
- [ ] 兼容测试原 `/1` 每请求仍完整 pre/post；generic/human/non-clean 不经过新回调；旧 `/1` raw 只能按可信 expected `/1` 验证，新 `/2` 不接受旧字段伪装。
- [ ] Run: `node --experimental-strip-types --experimental-test-module-mocks --test tests/runtime/validation-native-execution.test.ts tests/transfer/native-validation-clean-origin.test.ts tests/acceptance/native-validation-waits.test.ts tests/transfer/persistent-diagnostics.test.ts`。期望所有选择项通过、无 browser/provider；记录实际数量，不相加旧日志。
- [ ] `npm run typecheck`、`npm run build`；按这些新增测试做项目现有 strict 检查。提交 exact SHA、RED/GREEN 和已知缺口；独立 reviewer 先 spec 后质量，修 findings 后只复查受影响项。

## Task B：只读 ready 轮询，复用导航余额

**Files:**

- Modify: `tests/transfer/native-startup-diagnostic.fixture.ts` — `readNavigationDiagnosticReady`、`runNavigationDiagnosticReady`、新版结果固定版本检查。
- Modify: `tests/transfer/native-startup-diagnostic.test.ts` — ready pending、边界与生产 clone-stop 组合。
- Modify: `src/runtime/adapters/transfer/persistent-diagnostics.ts` — 组合复审批准的最小export：让B预定stop例外复用C既有纯`validNativeCleanup`；不改变C生产校验行为。

- [ ] 写 RED：合成真实读接口先返回 idle.seen=false，虚拟时间4000ms后true，应成功且零输入；单次读取旧代码会失败。添加永不ready到navigationEnd、signal取消、board晚出现、错误id/name与malformed值明确拒绝。
- [ ] Run: `node --experimental-strip-types --experimental-test-module-mocks --test --test-name-pattern='^native readiness' tests/transfer/native-startup-diagnostic.test.ts`，期望新行为 RED。用受控时钟/可释放 Promise，避免真实等300秒。
- [ ] 最小修改：删除独立 `now+3000`，用原 navigation life/W 较早者；一轮只读既有条件，pending 时等100ms或剩余量的较小值，取消能中断等待。每 await 前后检查、取消后不启动下一轮，原 raw 预登记不变。不要捕获所有异常后无限重试；只有 spec 的 pending 值可重试。
- [ ] 原 null/404/foreign-origin 返回仍不进 ready；成功还要 runner finishNavigation 后唯一 sentinel。结果必须读取实际 `/2` source，保留生产 failed/reportValid:false 与独立诊断结论；没有真实 input，不把 seen=true 写入浏览器。
- [ ] Run 新 ready 组及原 `^COS93 navigation diagnostic (planned stop|production result refuses|production)` 受影响代表；记录实际通过数。Run 原三文件 strict 命令：`node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck tests/transfer/native-startup-diagnostic.test.ts tests/transfer/native-startup-diagnostic.fixture.ts tests/transfer/native-startup-observer.fixture.ts`。
- [ ] 提交 exact SHA 与独审入口。B 不修改生成游戏、220步输入、素材或普通 production step timeout；无需重跑220/62。

## Task C：native 视频清理共享预算

**Files:**

- Modify: `src/acceptance/runner.ts` — 仅 `/2` 的清理时点、共享预算、raw stop跟踪和标量结果。
- Modify: `src/acceptance/native-validation-waits.ts` — `/2` W=D-35000；closing下专用trackCleanup与raw pending；旧默认不变。
- Modify: `src/runtime/adapters/transfer/persistent-diagnostics.ts` — `/2` W和cleanup proof校验；A相同文件由merger集成。
- Test: `tests/acceptance/native-cleanup.test.ts`（新增，无浏览器）、`tests/acceptance/native-validation-waits.test.ts`、`tests/transfer/persistent-diagnostics.test.ts`。

- [ ] RED：模拟 video.stop 在第1500ms成功，browser.close随后正常；旧1秒race会错失败。再设video耗尽共享graceful余量，close不得再得到新25秒；force/raw settle不能越cleanupEnd。使用合成transport/受控时钟，不把mock耗时当真实FFmpeg性能。
- [ ] RED：finally先冻结cleanupEnd，再final screenshot；原异常不被cleanup异常替换，超时raw仍pending且迟到reject被观察；controller/work已取消时不得派发新的graceful工作。
- [ ] 实现 `/2`：W=D-35000；同对象的checkRead、phase/request、consumer/series读取及diagnostic raw proof均使用新W，并加边界测试。finally gate revoke处冻结 `min(D-5000,now+30000)`，gracefulEnd再减5000。截图≤5000且共享该时间，video/close/client按原顺序使用剩余graceful；force和settle共享尾段。剩余≤0拒绝新graceful操作，禁止全局改变bounded或generic清理。
- [ ] 新 `trackCleanup(start)` 仅closing、原owner未取消时，先经原trackRaw登记，再调用start并加入segment子集合；Promise真正settled后才移除。它不等外层drain、不重开gate；超时保留pending和failure，报告不能因browser PID退出宣称视频已保存。补fake-owned-work无自等待/迟到收敛测试。
- [ ] `/2` report记录cleanup起止、固定deadline/gracefulEnd、video/close/force各步骤结果及pending。成功需视频stop/save真实resolved、正常close与既有identity证据；旧 `/1` raw和generic不要求新字段。
- [ ] Run: `node --experimental-strip-types --experimental-test-module-mocks --test tests/acceptance/native-cleanup.test.ts tests/acceptance/native-validation-waits.test.ts tests/transfer/persistent-diagnostics.test.ts`；随后typecheck/build。旧generic cleanup只选原受影响代表，不再运行完整browser suite。
- [ ] 具体慢因若仍影响实施判断，Root可另授权一个免费小实测：全新TEMP，简单本地页面录5秒，只调用一次真实screencast.start/stop/正常close，记录stop开始、协议完成/保存完成、原FFmpeg ChildProcess close、browser close。不得mock stop、关视频或借用715历史；结果只证明该短录像顺序。此步骤不是当前授权，不因缺它阻止先修已证的1秒误限。
- [ ] 提交 exact SHA、最小证据与未决时长；独立 reviewer 核查真实diff后由唯一merger整合。

## 集成后一次实际导航

- [ ] merger核对A/B/C批准SHA，执行受影响组合：真实生产runner的ready等待→finishNavigation→唯一stop→video正常完成→browser关闭→raw归零；controller变化在HTTP中拒绝，source持久变化在发布前拒绝；`/1`兼容代表。typecheck/build仅在最终组合有delta时补做一次。
- [ ] Root另行发布确定任务/批准一次性launcher，冻结集成exactSHA、新TEMP/新intent、原候选只读，检查绑定/版本/绝对deadline。复用navigation-v1准备及保全方式，不消费旧C14身份，不改变ledger。
- [ ] 只运行一次完整native navigation，报告prepare/register/transport、pre/body/post、ready、cleanup及总墙钟。成功需真实ready、零正常输入、有效视频保存、非forced正常退出、全部raw settled、独立OS/port/owner后核和原来源保全。exit0或diagnostic_completed单独不算成功。
- [ ] 若仍失败，保留原首因与具体阶段；仅有新delta才再计划下一次，不自动扩大300秒/30秒或重试。原220/62证据复用，完整玩法/媒体/性能/accepted/human结论另按既有任务处理。

## 文档交付检查

本设计只新增spec、plan、ADR三个UTF-8文件。严格UTF-8解码、回读中文、`git diff --check`，提交exactSHA供独立review；不在本轮执行上述源码测试、browser、715负载或付费操作。预算及产品边界见spec末节。

## A/B/C组合集成（2026-10-16）

| 任务 | 批准源码 | 独立reviewer | merge | 公开批准 |
| --- | --- | --- | --- | --- |
| COS-98 / #99 | `ebb815712a9c4105f0269e604aea59506da28b57` | `cos98_reviewer` | `546051d59e37278e750c4035a4cebccfdde580c1` | [批准](https://github.com/lrfluobida/Cosmos/issues/99#issuecomment-6207749747) |
| COS-99 / #100 | `5bc4bb6087ff33fc90f3e91e7184eaeb8e603507` | `cos99_reviewer` | `5bc4bb6087ff33fc90f3e91e7184eaeb8e603507`（快进） | [批准](https://github.com/lrfluobida/Cosmos/issues/100#issuecomment-6207810569) |
| COS-100 / #101 | `93a479f248a6700364e609cb535b835be8eed716` | `cos100_reviewer` | `51ab8eaa541adbf545c95c3c387284bbeb027d93` | [批准](https://github.com/lrfluobida/Cosmos/issues/101#issuecomment-6207846907) |

唯一merger按A→C→B一次组合，源码终点`5bc4bb6087ff33fc90f3e91e7184eaeb8e603507`，15个实现路径逐一等于其最后批准来源；C覆盖其批准路径，B覆盖两个诊断文件并对现有persistent-diagnostics校验器增加最小export复用；该校验器最终来源为5bc，其生产行为保持C原实现，其余路径保持A/C批准字节。没有手工改写批准源码或单独发布半契约。统一marker为`NATIVE_FIXED_CANDIDATE_READINESS_SOURCE_READY`，本三卡source scoped complete/closed，GitHub三项closed(completed)及父勾选已由Root精确GET核证，源码发布主线`81b0022dc70353d235d2d02e8aeb1d860a5933a7`。

初组合检查命令和raw（均无实际浏览器/provider；先保留通过证据，最后cleanup proof补正另列）：

- `npm run typecheck`、`npm run build`：退出0，`C:/Users/26557/AppData/Local/Temp/native-readiness-abc-merge-typecheck.log`、`native-readiness-abc-merge-build.log`。
- `node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck tests/transfer/native-startup-diagnostic.test.ts tests/transfer/native-startup-diagnostic.fixture.ts tests/transfer/native-startup-observer.fixture.ts tests/acceptance/native-cleanup.test.ts tests/acceptance/native-validation-waits.test.ts tests/transfer/persistent-diagnostics.test.ts`：STRICT_EXIT=0，`C:/Users/26557/AppData/Local/Temp/native-readiness-abc-merge-strict.log`。
- 确认COS93实际诊断环境选择变量未设置后，`node --experimental-strip-types --experimental-test-module-mocks --test --test-name-pattern='^native readiness snapshot result binds real source version and keeps the production planned stop failed$|^native readiness production timeout retains last pending in final trace and the original error$|^native readiness snapshot waits four seconds for actual idle without input or a new three second cap$' tests/transfer/native-startup-diagnostic.test.ts`：3/3、0skip、4177.9503ms，`C:/Users/26557/AppData/Local/Temp/native-readiness-abc-merge-navigation.tap`。
- `node --experimental-strip-types --experimental-test-module-mocks --test --test-name-pattern='^COS98 live controller reserved exhaustion during HTTP body rejects although its signal remains active$|^COS98 payload change during actual response body cannot send valid content$|^COS100 cleanup uses one frozen budget including screenshot and a 1500ms video stop$' tests/transfer/native-validation-clean-origin.test.ts tests/acceptance/native-cleanup.test.ts`：3/3、0skip、3323.5582ms，`C:/Users/26557/AppData/Local/Temp/native-readiness-abc-merge-http-cleanup.tap`。

snapshot正例实际调用production series/runner，产生C cleanup proof并交给B版本分类，预定stop不提升production failed/reportValid:false。4秒ready、原deadline pending与1500ms video分别覆盖；慢ready和慢video不在同一用例组合，不能据此宣称完整真实异步时序或FFmpeg性能通过。A负例使用真实HTTP实际payload和合法小controller动态reserved耗尽，未创建715请求历史。

证据复用：A私有`cos98-source-evidence.json`记录99/99及真实mounted consumer1/1（合成browser packets）；B `C:/Users/26557/AppData/Local/Temp/cos99-readiness-evidence`保存33/6/affected5，重叠不合计；C私有`cos100-source-evidence.json`及`cos100-source-tool-evidence.jsonl`保留原67组与末次仅test delta3，不冒称完整重定向TAP。未重跑这些组、220步/62字段、A/B、实际browser/715/provider/paid。下一次actual仍由Root另审launcher并冻结新exact源码；原ledger3114/715/16901000µ、C14 failed/consumed、旧15秒、COS93 open/partial和human未完成保持。

### 组合cleanup proof缺口的RED、修复与最终验证

组合复审补正：B原`39400c6bec4bee4532a1ee5888aaab15e0d5214f`及初合并`ea478f12b260f9ed810b660e03fdddb80aefe42b`保留历史。C新增cleanup证明位于segment之外，B预定stop例外原未校验该字段；真实同row品牌、同source及同步durable raw的missing/deadline+1/rawPending1/video_stop failed四负例RED均错误接受。作者最终`5bc4bb6087ff33fc90f3e91e7184eaeb8e603507`仅export并复用C原`validNativeCleanup`，`cos99_reviewer`affected APPROVED、无finding；C生产校验行为不改。主线最终typecheck/build0，四负例和真实/2正例5/5、0skip，4791.9604ms；作者GREEN5/5和strict0、此前无变化HTTP/C1500ms及其余通过证据复用，不相加重复计数。

原作者证据：`C:/Users/26557/AppData/Local/Temp/cos99-readiness-evidence/cleanup-proof-red.log`、`cleanup-proof-green.log`、`cleanup-proof-strict.log`（strict退出0由Root和reviewer核证）。最终B与组合源码均为`5bc4bb6087ff33fc90f3e91e7184eaeb8e603507`，在初组合上快进；A/C批准不变。未发布初组合或已知缺口版本，也没有merger手改批准实现。

最终主线因新增export/import真实delta执行`npm run typecheck`和`npm run build`，均退出0，日志`C:/Users/26557/AppData/Local/Temp/native-readiness-abc-final-typecheck.log`、`native-readiness-abc-final-build.log`。确认实际诊断选择变量未设置后运行`node --experimental-strip-types --experimental-test-module-mocks --test --test-name-pattern='^native readiness snapshot rejects .* cleanup in a branded planned stop with matching durable raw$|^native readiness snapshot result binds real source version and keeps the production planned stop failed$' tests/transfer/native-startup-diagnostic.test.ts`，5/5、0skip、4791.9604ms，raw为`C:/Users/26557/AppData/Local/Temp/native-readiness-abc-final-cleanup-proof.tap`。既有六文件strict0与本次作者affected strict0组合使用；未重跑无变化矩阵。
