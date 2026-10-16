# Native Game Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. 每项由独立 implementer/reviewer 负责；唯一 merger 为 `batch_c14_cos92_merger`。本提交仅设计，源码及 actual 须 Root 另行下达。

**Goal:** 让既有固定候选在真实异步素材加载后完成一次原生导航，并在原截止内保留视频、正常退出。

**Architecture:** 可信 host 为指定 native 路径选择 `/2`。每 HTTP 验证当前 controller authority 和实际固定 payload，来源/历史仍在原阶段边界及发布前完整核验；ready 复用导航剩余时间，cleanup 使用单一有界共享余量。

**Tech Stack:** TypeScript、Node 22、Playwright 1.63.0、现有 controller/OwnedWork/loopback origin/clean delivery。

---

## 执行约束与顺序

基线 `e2358cd59a6313e049605cd652912d326745d414`；先读 [spec](../specs/native-game-readiness.md) 与 [ADR0003](../adr/0003-native-fixed-candidate-execution.md)。保留现有 `/1` 工厂与验证器，新的源码私有工厂固定选择 `/2`；不提供 CLI/JSON/环境变量的版本或预算开关。

A、B、C 是独立审查单元，可分别用免费小夹具证明。A/C 会碰同一 native helper/diagnostics；实施者各自 branch/worktree，唯一 merger 根据批准 SHA 合并。可以先后实施减少冲突，不要求 C 等 A 的实测结果。`/2` 完整生产选择仅在 A+B+C 合并并通过组合检查后发布。当前文档不创建 issue，不更改 shared tracking，不运行 browser/715/provider。

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
