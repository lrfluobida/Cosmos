# COS93 Native Navigation Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 SOURCE97 集成后的一次免费诊断准备接线，证明真实 native goto/load、可信 ready 与正常清理。

**Architecture:** 复用 COS93 封存输入、TEMP 准备及有界 observer。生产 host 的同一 `native-validation-waits/1` 对象贯穿原调用链；真实导航完成后，在计划迭代入口停止，原 8 段／220 步保留且全部不执行。

**Tech Stack:** TypeScript、Node node:test、现有 Playwright native persistent transport、Cosmos host/controller/OwnedWork。

---

## 范围与前置

基线 `88f9444b25a9adc7806c016402a0f456d35c0bb6`，分支 `codex/cos93-native-navigation-diagnostic`，managed worktree `E:/CodexData/.codex/worktrees/cos74-frozen-template/Cosmos`。依据 COS97 已审设计 `db0366bdd64398067c58272110beb460da585c12`、[spec](../specs/cos97-native-validation-waits.md)、accepted [ADR0002](../adr/0002-native-validation-waits.md) 和[后续诊断关口](2026-10-15-cos97-native-validation-waits.md#后续-actual-准备关口不在本计划实施授权内)。旧来源、完整 before/final 保全、TEMP accounting、observer、drain/process/ports/owner/profile 清理直接沿用 [COS93 卡](../specs/cos93-native-startup-diagnostic.md)及[原计划](2026-10-15-cos93-native-startup-diagnostic.md)，不另造框架。

当前仅提交本计划供 Root 安排独审，不改 source/tests，不运行测试、typecheck/build、browser、actual、真实 controller/715 负载或 provider，不付费。计划批准后，独立只读 ready、descriptor、clone-stop、result unit 与透明包装准备可并行开展；SOURCE97 具体接口接线及新生产顺序的整体验证，必须等其源码独审合入后核对 exact SHA 再做。各阶段只声明实际完成的检查，不提前声称新接口编译或真实导航成功。唯一 merger 为 `batch_c14_cos92_merger`；作者不改 main、不 push、不写 shared tracking/GitHub。

| 后续文件 | 最小改动 |
| --- | --- |
| `tests/transfer/native-startup-diagnostic.fixture.ts` | caller signal／逐 await 检查点、同 wait 对象、v2 分类和阶段证据 |
| `tests/transfer/native-startup-diagnostic.test.ts` | 新增 navigation mode stop、无浏览器 RED/GREEN、v2 actual 断言 |
| `tests/transfer/native-startup-observer.fixture.ts` | 原样复用有界标量、手工 descriptor 包装与 raw ChildProcess close records |

## Task 1：同对象与取消接线

- [ ] 继续调用真实 `createNativeBrowserHostIO`；wait 对象由 SOURCE97 生产 host 构造，不能在 fixture 自建或复制。静态核对并用小夹具断言 consumer/mount/native/lifecycle/runner 为同对象、同 case/window/task/deadline，完整品牌及 cleanDelivery/payload gate 保持。
- [ ] 将当前无参包装改为 `(callerSignal?: AbortSignal) => observer.span('consumer.verifyBinding', () => input.verifyBinding(callerSignal))`，原 caller 身份跨层传递。对 fixture 的 `readManifest/sourceIdentity/verifyAdmission/scopeIdentity/ownSource/readScope` 做必要最小接线：每次 await 前后、下一文件／history／Git／scope 批次前检查；向 SOURCE97 已支持的读取 helper 传 signal。拆开左右两个 await，取消后不得启动后项；不改变已派发组和 COS96 并发数。
- [ ] 保持 pre-ticket 六轮完整 scope、post-register fresh 六轮完整 scope，以及每 HTTP `pre完整verifyScope → fetch/arrayBuffer → post完整verifyScope → fixed与actual Buffer比较 → lease/mount/signal/deadline检查 → 发送已比较的actual Buffer`。复用 SOURCE97 raw-reader/registration/request 跟踪，不以外围 race 返回替代真实 settle。

## Task 2：真实 ready 与零输入 stop

封存原候选为 `.cosmos/e2e/cos20-transfer-validation-14/registry/candidates/cos20-transfer-validation-14-game/v1/project`，源码为对应 `registry/captures/cos20-transfer-validation-14-game-source/v1/files`。静态核读 `_cosmos/transfer-plan.json` SHA-256 为 `b5c603da1e56a436d316f1d987de9d752394f2f1bffc76a6d6a8e626cc6ff0d3`：`start-001/002` 为按钮 visible/text，`start-003` 为首个 click。按钮来自 HTML，不能单独证明 JS ready；`start-004` 是 click 后 snapshot，不作未证明等价的启动期望。

已有无输入启动依据：原 `src/main.ts:71-91` 的 boot 安装只读不可配置 cosmosDebug，创建动态棋盘并启动 Phaser；`src/scenes/GameScene.ts:50-65` 无条件 `playPlayer('idle')`，`:160-169` 仅在真实当前动画匹配后 markStateSeen。`src/debug.ts:88-103` 返回冻结观测。ready 只读检查原按钮 visible/text、动态 board/player cell、唯一 player/idle seen=true；cell 坐标取封存 world 初始 state 并核对已绑定 design，缺失／歧义失败。可记录 snapshot 标量，不与 start-004 比较；单一 idle 不是完整媒体通过。

- [ ] 保留真实 newPage/goto/response。page.goto 包装先 await 原 `goto(load)`；若 response 为 null、response.ok() 为 false（含404）或 page 当前 origin 与原 plan 不同，零 ready 查询并原样 return 同一 response，让 runner 保留原 `Startup HTTP`／`Startup left the project origin` 检查及失败。只有有效且同 origin 的 response 才用现有只读 debug reader/locator 检查 ready；至多沿用原只读检查 3000ms，并受 navigationEnd/W/原 signal 夹紧，每 await 前后检查。错误原对象传播，不发 completed；runner 仍亲自执行原检查并成功 `finishNavigation`。
- [ ] stop 位于原计划迭代入口。基线 runner 先同步 `structuredClone(value)`、后导航、再 `plan.steps.entries()`；输入 steps 身份不能匹配内部 clone。仅本次 runner module observer 调用范围用 `createMethodPatches` 包装 `globalThis.structuredClone`：精确 `value === literalPlan` 时调用原函数并捕获真实返回的 `clone.steps`，立即恢复 clone descriptor；其他 value 原样委托。再包装 `Array.prototype.entries`：只对该真实 steps 身份，在首次迭代前检查 load/ready/生产 navigation 成功记录；全部成立才抛一次普通专属 `DiagnosticNavigationComplete`，缺 gate 则抛原 failure 或专属诊断拒绝 Error，两者均清除引用、零迭代。其他数组原样委托。所有 descriptor finally 恢复；不按内容／步骤 ID 匹配，不留 calls/Promise 历史。
- [ ] SOURCE97 必须实际保持 `同步clone → goto/load → response/origin → finishNavigation → steps.entries`；顺序变更先修订并独审 seam，不能启动 actual。普通 sentinel 须进入外层 catch 后正常 finally，不能在首 click 抛后被 step catch 吞并，也不能用取消类 Error 强迫退出。断言一次 native/open/goto/ready/stop，全部220步 skipped、零 click/mouse/keyboard、无后续 segment、非 forced cleanup。

## Task 3：v2 结论与证据

- [ ] 通过新增显式 navigation mode 接入，保留 v1 默认 observer、测试、pre-newPage stop 与结果字段语义；默认不切换为导航诊断。新 mode 结果为 `cos93-native-startup-diagnostic/2`；旧 v1/v2/v3 是已消费执行尝试，其报告/raw/launcher 不改写或复用。并列新 `native-validation-waits/1` 导航结论、本次 old whole-open15000ms 与 old navigation15000ms 的实测超界观测；旧 whole-open15 仍 failed，不能追认为原 COS93 或 C14 通过。
- [ ] 复用 SOURCE97 标量分报 prepare/register/transport、HTTP pre/body/post count/total/max/pending、navigation、exit 与 consumer/series 总墙钟。HTTP 合计不充当总墙钟，race 与 raw settle 分开，scope/identity raw pending 也须归零；原 deadline/W、5秒scope、45分钟外guard保持。保留全部 host failed evidence、原 cause／native first-cause，intentional stop 单列，不能靠文本匹配掩盖其他失败。
- [ ] diagnostic_completed 仅表示完整落盘；新导航成功另需生产各阶段成功、真实 ready、exact PID/CDP identity、正常清理及完整原文件 before/final proof。原 observer 限额、close records 与独立 OS/current-tree/ports/owner 后核保持；任一 pending/forced/close/port/lock/保全/observer异常均失败。选择范围副本不能代替完整保全，不重复 OOM、220步或62媒体检查。

## Task 4：必要免费测试与评审

- [ ] 先加 `COS93 navigation diagnostic ...` 小型无浏览器 RED：旧 newPage stop 未到 load；输入数组未命中真实 clone；ready/finishNavigation 未成功不得 completed。补 null、404、foreign-origin 三个负例：ready/stop 调用均为0，原 runner 的 `Startup HTTP no response`、`Startup HTTP 404`、`Startup left the project origin` 失败分别保留，不能 classified passed。GREEN 用合成 page/context 驱动生产 runner，证明精确 clone/array 身份、descriptor 恢复、原220步不变且全 skipped、零输入和 `load → ready → finishNavigation → stop → normal close → drain` 次序；不 spawn browser/provider、不准备715负载。
- [ ] 一组小夹具证明 verifyBinding 原 caller 传递及 source/cancel/private-scope/HTTP/ready exact Error 不被 sentinel 替换；阻塞 readScope 一个 leaf、取消后释放，只允许已派发项 settle，后续 file/history/scope 次数不增。复用既有 observer 的 this/exact Promise/restore/close-record 通过证据，新增包装仅验证受影响行为。
- [ ] 计划批准后可先执行独立 unit：`node --experimental-strip-types --experimental-test-module-mocks --test --test-name-pattern="^COS93 navigation diagnostic (ready|descriptor|clone-stop|result)" tests/transfer/native-startup-diagnostic.test.ts`，不引用尚未合入的 SOURCE97 接口。SOURCE97 独审合入并完成具体接线后，再执行 `node --experimental-strip-types --experimental-test-module-mocks --test --test-name-pattern="^COS93 navigation diagnostic" tests/transfer/native-startup-diagnostic.test.ts` 整体验证；记录所选测试实际 PASS 数量，未选 skip 不算通过。此时执行 `node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck tests/transfer/native-startup-diagnostic.test.ts tests/transfer/native-startup-diagnostic.fixture.ts tests/transfer/native-startup-observer.fixture.ts`；按实际 delta 复用 SOURCE97 typecheck/build，不重跑整个 suite。
- [ ] 作者提交 exact SHA、RED/GREEN/strict、known gaps；Root 派独立 reviewer 审实际 diff，先规格后质量，finding 在作者分支修复并复审，由唯一 merger 集成。

## actual 的另行关口

SOURCE97 与 navigation diagnostic 两份源码均独审集成后，actual 仍须 Root 另行授权并批准一次性 launcher；launcher 须单独提交、独审。冻结 SOURCE97 与诊断集成 exact source/toolchain/hash，使用新 `cos93-native-startup-navigation-...` TEMP root、新 root intent 与只读旧来源，复用原准备／保全机制，只运行一次，无自动重试；当前不创建 launcher、不启动 actual。

原 ledger revision3114／715／16901000µ、reserved/unknown0，¥150验证含prior¥0.721771、正式¥200/12h、优化¥100/6h保持；参考安装只读，API keys 不入文件／日志／Git。COS93仍open/partial/startup-failed，原C14 failed/consumed，accepted/human/完整经典等未提升。本提交仅新增本计划，UTF-8无BOM/LF；提交前严格解码、中文回读与 `git diff --check`，不声称测试或导航已通过。
