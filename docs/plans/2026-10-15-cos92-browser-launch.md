# COS-92 Browser Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this reviewed plan task-by-task. Dedicated implementer and independent reviewer remain separate; only the assigned merger integrates and pushes.

**Goal:** 本地启动截止后不再迟到启动浏览器或留下本次可证明未 spawn 的 ticket，并删除已定位的同次重复绑定校验。

**Architecture:** 保留每次操作的完整可信校验，只在私有调用栈复用本次已验证输入。runner、persistent、nativeIO 与 controller 共用局部启动寿命；现有 OwnerLock 串行持久化承担确切未 spawn ticket 的释放，原 PID 退出证明与恢复规则保持。

**Tech Stack:** Node 22.22.2、TypeScript、node:test MockTimers/deferred gates、现有 Playwright 与临时 OwnerLock/RunController。

---

规格：[COS92](../specs/cos92-browser-launch.md)。起点 `b20e9a43f26712a1f5a13468057df46b6c012b69`。本阶段只提交 spec/plan；独审批准后才执行下列步骤。作者不改 main、共享 tracking 或 GitHub，不访问真实账本，不启动 paid/provider/C14。

## 已运行的最小 RED

证据目录：`C:/Users/26557/AppData/Local/Temp/cos92-launch-red-41b8414ba8624ef1beaaf94e60269a6b`。两脚本直接导入该 managed worktree 的未改生产模块；不计作新生产测试提交。

| 命令（目录下） | 真实 seam / 结果 |
|---|---|
| `node --experimental-strip-types --test launch-red.test.mjs` | lifecycle + OwnerLock；0pass/2fail/0skip，exit1，691.1629ms，raw `launch-red.tap`。模拟15001ms后迟到prepare留下一个null ticket且close拒绝；模拟15000ms时ticket已写入，spawn拦截计数1。实际两段11.391ms/9.998ms，无OS浏览器。 |
| `node --experimental-strip-types --test guard-count-red.test.mjs` | 非继承真实host/registry/journal/免费synthetic transport；0pass/1fail/0skip，exit1，15378.3635ms，raw `guard-count-red-corrected.tap`。两次bind各scope13/readScope13，429.516ms/440.323ms；目标<=8，基线失败。 |

首次计数 raw `guard-count-red.tap` 的 readScope 为0，因为 host 复制了 binding 后才加探针；修正为建 host 前安装探针后重测。首次13次host计数仍是实测，但只采用修正样本比较。该fixture没有继承C14历史、真实源码费用检查或浏览器，不能宣称完整启动链已测。原单边界只读证据在 `E:/develop/Cosmos/.cosmos/reconciliation/2026-10-13-c6-provider-usage/case14-guard-{assessment.txt,timing.json}`；24×单次时间仅外推。

## Task 1: 固定计数与复用本次已验证输入

**Files:** 修改 `src/runtime/adapters/transfer/runtime-host.ts`、`src/runtime/entrypoint-host.ts`；测试 `tests/transfer/runtime-host.test.ts`，必要时新增 `tests/runtime/entrypoint-host-launch.test.ts` 验证真实 consumer 回调接线。

- [ ] 先将上述计数RED归入现有fixture；分别覆盖第二次独立调用、来源变化、候选/计划/历史绑定变化。原回调不得替换为无条件成功。
- [ ] 私有 requireCurrent 返回它本次已验证的 PreparedInputs；公开 requireCurrent 包装成 void。bindCandidate 使用这个返回值，不再调用第二次 verify，保留最后 guard 和实际 bind 文件核验。未准备好的输入继续拒绝。
- [ ] 私有 requireDispatch 增加当前 candidate 参数，仅在 consumer.requireCurrent 路径选择完整 bindCandidate 替代 preparation.requireCurrent；保留 scope、task、authority 与 signal 检查，消除随后重复的 bindCandidate 调用。其他调用点不改变。
- [ ] 测量同一fixture两次bind，目标每次8次完整scope/readScope，记录实际耗时；测真实consumer组合回调次数。继承路径静态12→6须通过继承fixture观测确认后才能写成实测；可复用已封存历史的临时副本，禁止重建长历史seed或原C14重放。若现有短fixture不能提供该观察，记录缺口并先提交可证明的删减，不推导15秒成功。
- [ ] Run: `node --experimental-strip-types --test tests/transfer/runtime-host.test.ts tests/runtime/entrypoint-host-preparation.test.ts`。预期受影响绑定/来源/恢复检查通过，两个独立操作都重新验证；提交该最小改动及证据。

## Task 2: 把局部取消传到意图持久化与 spawn

**Files:** 修改 `src/acceptance/runner.ts`、`src/acceptance/persistent.ts`、`src/runtime/entrypoint-host.ts`、`src/runtime/run.ts`、`src/runtime/store.ts`、`src/runtime/recovery/ownership.ts`；新增 `tests/acceptance/persistent-launch.test.ts`，扩 `tests/runtime/recovery/ownership.test.ts` 与 `tests/runtime/entrypoint-host-launch.test.ts`。最小适配 `tests/acceptance/media-observations.integration.ts`、`tests/runtime/generic-persistent-host.fixture.ts` 的两个已有 ownedChild 调用点。

- [ ] 先迁入两个RED，加deferred binding、deferred持久化、controller identity及close/drain门；使用mock Date/setTimeout和拦截spawn/CDP，记录真实ticket状态。另加 ticket 已持久化但 handle 交付被 gate 阻塞的用例：abort 并开始 drain，断言 drain 尚未成功；释放 gate 后 raw prepare 交付 handle，断言零 spawn/零残留本次 ticket、drain 完成且 owner 可 close。不可用真实浏览器/任意sleep制造竞态。
- [ ] runner向open传入可信 `{signal, deadlineAt}`，失败/外层race超时即abort。persistent直接调用时创建等价寿命，内部bounded与prepare共享它。`ownedChild.prepare(launch)` 的nativeIO实现检查binding前后；返回 `{ticket, register(pid), releaseUnspawned()}`，回调闭包捕获本次ticket，调用方不能传入其他票。旧controller/owned-command的string ticket API保留。
- [ ] persistent 在 bounded race 之外始终观察 raw prepare，单一 attempt 状态处理全部成功/拒绝结果。每次启动的 completion promise 另交 nativeIO：ready promise 可以先返回 handle，但独立 OwnedWork 继续等待 completion，直到同步 spawn 交接进入既有登记/退出路径或 exact release 真正完成。race 失败后的迟到 handle 仍只释放本次 ticket；spawn/release 不能同时赢。prepare 拒绝且没有 ticket 也结束 completion；release 失败使 completion 失败并保留意图和原错误，不能把跟踪结束当成清理通过。始终不返回的 prepare 沿原 drain 截止失败并保留 owner。测试覆盖这三条终止分支。
- [ ] 给 `RunController.prepareOwnedChild(authority?, launch?)` 增可选局部寿命检查，旧owned-command调用保持原行为；原identity/expire/requireActive保留。向store/OwnerLock传入可信检查闭包，在队列执行且持久化前检查；若持久化期间过期，在同一串行operation中只移除本次仍null ticket后抛出原截止/取消错误，不递归进入serial。
- [ ] 增 `releaseUnspawnedChild(ticket)` 的lock/store/controller窄链路：exact owner + exact existing null ticket，更新childTasks；不要求运行active但拒绝已close/failed，不修改recover。未知ticket、registered PID、owner漂移及release失败必须保留事实并拒绝。调用方闭包只持有本次ticket，只有spawnStarted=false可释放；另造一张null ticket验证它不被这次release清除。
- [ ] prepare返回后检查signal和绝对截止，最后检查与spawn无await；调用spawn前同步置spawnStarted。一旦spawn开始不走null-ticket释放；PID立即走既有register，即使随后截止失败仍保留PID并走终止/完整退出/profile证明。同步spawn错误也不假定无进程。
- [ ] Run: `node --experimental-strip-types --test tests/acceptance/persistent-launch.test.ts tests/runtime/recovery/ownership.test.ts tests/runtime/entrypoint-host-launch.test.ts`。预期迟到prepare零spawn/零残留ticket，owner在drain后可close；及时路径恰一次spawn/register；注册PID不能被release。两种原运行停止与来源漂移仍拒绝。故意release失败时报告failed并保留意图，不伪造cleanup成功。提交实现及原始输出。

## Task 3: 集成、独审与交接

- [ ] 只读核对UTF-8后最小修改；每次写后中文回读。确认生产路径没有新通用授权缓存、全局skip flag、加长15秒或历史恢复捷径。
- [ ] Run: `node --experimental-strip-types --test tests/acceptance/persistent.test.ts tests/acceptance/generic-persistent.test.ts tests/runtime/run.test.ts tests/runtime/recovery/owned-work.test.ts tests/runtime/owned-command.test.ts tests/runtime/entrypoint-host-preparation.test.ts`；复用Task1/2中无变化的通过项。运行 `npm run typecheck`、`npm run build`、`git diff --check`，保留exit与pass/fail/skip。两个旧ownedChild辅助文件最小适配接口并验证受影响fixture。
- [ ] Run: `node --experimental-strip-types --test --test-name-pattern="COS40 new observer records real Phaser" tests/acceptance/media-observations.integration.ts`。只运行这一项免费 TEMP 真实 Edge 正例，验证 prepare→register（CDP调用前）→CDP/PID/profile 身份→close事件/退出码/PID已不存在，保留 qa-summary 与原始报告；预期正例通过，另一负例因名称过滤跳过须如实记载。不跑全矩阵、不重放 C14、不接触真实账本或付费 provider。
- [ ] 用同输入/环境列出修复前后实测次数与耗时。免费回归没有证明实际C14或下一次真实游戏启动通过；完整历史链耗时未测时明确标注，后续性能调查不扩大本次实现。
- [ ] 提交最终SHA、测试证据和已知缺口给独立reviewer；先规格再质量查实际diff，作者修finding并重审。唯一merger集成后Root才能登记SOURCE_READY。C14仍failed/consumed；COS16/COS18、完整经典与human保持未完成。
