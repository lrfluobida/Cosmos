# COS108：公共通用验收共享清理时间实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 独立 reviewer 审计划及实际 diff；Root 指定的唯一 merger 负责集成。

**Goal:** 普通生成的浏览器验收在原时限内共享一次清理预算，使正常 1500ms 录像停止能够通过，并保留取消、超时、证据缺失和退出未证实的失败。

**Architecture:** 只在现有 runner 的无 `nativeValidationWaits` 分支固定工作、正常清理、强制退出及报告收口截止点。复用原浏览器所有权、失败分类、证据文件及主机评审/晋级链；不增加 case 身份、策略版本或执行器。

**Tech Stack:** TypeScript、Node 22、Playwright、`node:test` 受控时钟及现有模块 mock。

---

## 范围与来源

- Issue：[COS108 / #109](https://github.com/lrfluobida/Cosmos/issues/109)，父 COS18 / #19。
- 基线：`fbacdf5a91c79ebeb299435341c55a2f43ce95ac`。
- 专属分支：`codex/generic-browser-cleanup`；工作树：`E:/CodexData/.codex/worktrees/cos-04-media/Cosmos`。保留 ignored 历史证据，不改 main、不 push。
- 生产修改：`src/acceptance/runner.ts`。只有实际 caller 无法满足下述绝对时限或退出证明时，才增加其必要小改动，并先将实际缺口交 reviewer；当前未发现必须改 caller。
- 定向测试：`tests/acceptance/native-cleanup.test.ts`；必要的无 lifecycle 入口及报告写入覆盖放在 `tests/acceptance/generic-cleanup-budget.test.ts`。原 `generic-cleanup.test.ts` 保留 COS94 全部覆盖，只调整受本次契约影响的断言与 OS absence mock。
- 公共链代表：现有 `tests/runtime/entrypoint-delivery.integration.ts`。公共登记、任务卡、映射由 COS107 作者统一处理。

已读 `AGENTS.md`、`CONTEXT.md`、产品 spec 和 COS18/COS65/COS66/COS100 记录。目标文件均严格 UTF-8、无 BOM、LF；使用小 patch，复读中文。当前仅创建本计划，源码实施须等独审。

## 已有证据与实际 caller

`entrypoint-host.ts:180–203` 的普通单场景 worker 与持久 browser IO 都进入现有 runner。公共存档重开在 `entrypoint-host.ts:1077–1078` 调用 `playPersistent`，不携带 validation waits。`runner.ts:338–347` 因而给录像及正常关闭各设 1000ms；`native-cleanup.test.ts:147–152` 已证明 generic 录像 1500ms 会超时并 forced/failed。

这是本卡明确改变的旧兼容行为。保留 `/1` 的一秒兼容断言及 `/2` 的原共享 30 秒行为。COS65/66 已通过的编译、正常输入、独审与晋级证据复用；本卡不重新生成游戏、不跑 C16。

## 固定时限算法

仅 `native === undefined` 使用以下规则；`/1`、`/2` 的原计算和 raw owner 路径保持。

1. 在本次 runner 调用开始、首次异步文件操作前记录 `startedAt`，沿用已校验的 `timeoutMs`。普通单场景由 `createNativeBrowserHostIO.play` 传入 `min(180000, authority.deadlineAt - now - 5000)`；持久路径的 `runPersistentAcceptance` 默认传入原绝对 deadline 的剩余时间，并另提供 `lifecycle.deadlineAt`。本地最终截止为：

   ```ts
   const endAt = Math.min(lifecycle?.deadlineAt ?? Infinity, startedAt + timeoutMs);
   const budgetMs = Math.min(5000, Math.floor(timeoutMs / 3));
   const forceMs = Math.min(1000, Math.floor(budgetMs / 3));
   const publicationMs = Math.min(500, Math.floor(budgetMs / 6));
   const workEndAt = endAt - budgetMs;
   ```

   五秒是普通 runner 的总清理上限，包含截图、录像、退出及证据收口；满额时正常清理最多 3500ms，强制退出保留 1000ms，收口保留 500ms。短场景按原 `timeoutMs / 3` 缩小预留。它只提前停止本次工作，不推迟原场景或运行截止。

2. 进入 `finally`、最终截图之前记录一次 `cleanupStartedAt`，冻结：

   ```ts
   const finishAt = Math.min(endAt, cleanupStartedAt + budgetMs);
   const forceEndAt = finishAt - publicationMs;
   const gracefulEndAt = forceEndAt - forceMs;
   ```

   最终截图、录像停止/保存、context/lifecycle/client/server 正常关闭均消费 `gracefulEndAt - Date.now()`。截图自身原上限仍可取更小值。每一步不得重算 `finishAt`、不得把非正余额变成 `Math.max(1, ...)` 继续派发。`lifecycle.close` 的整个 Promise 受这一外层余额约束，即使内部有两个等待也不能获得双份时间。

3. 普通路径的工作到限、原 signal 取消、清理开始已过工作截止均保留失败，停止新的正常清理步骤。强制退出使用 `forceEndAt - now` 的剩余时间，不使用已取消 signal 阻止必要停止；没有余额则不派发新等待，明确记录退出未证实并交原 owner 收尾。已失败的玩法/运行首因保留。

4. 正常关闭 resolve 不代表退出：沿用 owned child 的 exitCode/signalCode；持久路径还须 `closeEvent`、原 PID/profile identity 和 OS absence。出现 forced、无法确认退出或录像未成功完成时，普通路径不能 passed。录像只在真实停止/保存成功后进入 files；不把仅有文件路径当作落盘完成。

5. `browser.log` 与最终 `report.json` 都须实际 await 写入，成功返回前再次检查 signal、`finishAt` 与 `endAt`。证据写入失败、缺失或迟到只能 failed/throw，不能交出 passing host proof；迟到后补记失败不得改变原截止。超时 race 的底层操作须捕获迟到 rejection，并保留到实际结算/原进程停止，不以 Promise.race 的结束声明已落盘或已退出。优先在 runner 内用少量局部状态完成，不新建通用策略层。

## 确认来源与兼容

清理等待属于可信主机实现，不在 `GameDraft.scenario`、用户确认回执或任务验收步骤中。实现不改写原确认、步骤 timeout、费用、已封存候选或旧报告。尚需执行的普通恢复仍取原绝对 deadline；已完成运行仍由 `readCompletedGeneration` 只读返回原证据。无需新增确认策略版本，也不自动重验已通过任务。

## 实施与验收

### 1. 先建立有意义的 RED

- [ ] 将既有 generic 1500ms 例单独改为 `COS108 generic 1500ms video closes normally`，在足额时断言 passed、非 forced、视频完成、真实退出；`/1` 原兼容例保留。先运行新断言，确认旧实现因 1000ms 视频限制失败。
- [ ] 用现有受控时钟增加小组边界，测试名统一 `COS108`：
  - 截图与录像累计耗时压缩后续 close 余额，超过同一 `gracefulEndAt` 就停止正常清理；不能逐步续期。
  - 挂起的视频以及清理前/录像中取消：保留第一失败、跳过后续正常步骤、强制退出受剩余余额约束；晚到 Promise 不能提升结果。
  - 正常 close resolve 但 child 未退出，或缺 closeEvent/OS absence：failed；force 后退出也不得变为成功。
  - 原绝对 deadline 更早、场景 timeout 更早、到限才进 finally：取较早边界，不能启动零余额操作。
  - 无 lifecycle 的 `runAcceptance` 同样使用固定预算；视频/报告写入失败或写入期间跨截止均不能返回 passed。
- [ ] RED 命令：

  ```powershell
  node --experimental-strip-types --experimental-test-module-mocks --test --test-name-pattern='^COS108' tests/acceptance/native-cleanup.test.ts tests/acceptance/generic-cleanup-budget.test.ts
  ```

  首次未创建第二文件时只传现有文件。保存实际 RED 原因，不把测试装配错误当作行为失败。

### 2. 最小生产修改与 GREEN

- [ ] 依固定算法修改 `runner.ts` 的 generic 时限、最终截图、清理、真实退出及报告收口，保留 native 分支。
- [ ] 重跑上述 `COS108` 定向组，全部通过。然后运行 `native-cleanup.test.ts` 的 `/1`、`/2` 原代表，确认分支未改变；不扩跑全部 validation 矩阵。
- [ ] 运行：

  ```powershell
  npm run typecheck
  npm run build
  node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck tests/acceptance/native-cleanup.test.ts tests/acceptance/generic-cleanup-budget.test.ts tests/acceptance/generic-cleanup.test.ts
  node --experimental-strip-types --experimental-test-module-mocks --test --test-name-pattern='^COS100 cleanup uses one frozen budget including screenshot and a 1500ms video stop$|^COS100 compatibility retains 1 one-second video cap$' tests/acceptance/native-cleanup.test.ts
  ```

  所有选中测试、typecheck/build/定向 strict 均须退出 0，记录真实数量和耗时。

### 3. 一个生产公共 caller 与独审

- [ ] 在锁定依赖已存在时运行一个既有生产代表：

  ```powershell
  node --experimental-strip-types --test --test-name-pattern='^compiled production DAG verifies an independent clean package before review and exact promotion$' tests/runtime/entrypoint-delivery.integration.ts
  ```

  此例走真实 compiled 主机、构建、Node 干净包、Edge 输入、清理、独立 fixture review 与 exact promotion；断言原 task/deadline/包字节、视频/日志/报告、browser/helper 退出。模型与 reviewer 为明确注入，费用 0。仅这一个浏览器代表；若失败，只诊断受影响路径，不重跑 C16 或旧大矩阵。
- [ ] 复读修改文件及中文，`git diff --check`；作者提交源码和本计划的实测索引，报告准确 SHA、测试证据及差距。独审按实际 diff 先规格后质量，修复后只复审 affected 范围；由 Root 的唯一 merger 集成。

## 本阶段记录

2026-10-20：指定工作树 tracked clean，从基线建立专属分支；未删除 ignored 文件。本提交只含计划，未运行源码/浏览器测试或付费调用，等待独立计划审查。

## 源码候选与实测（2026-10-20）

计划 `bd6e85e26106c57ebea7a7f19c97fd81fe84f788` 经独立 reviewer `PLAN_APPROVED`、Root 批准后实施。生产仅修改 `runner.ts`；没有修改 ownership、公共 caller、原生 validation 权限或已封存运行。

- 真实 RED：原 generic 1500ms 用例 0/1，首因 `Persistent video collection: timed out after 1000 ms`。无 lifecycle 新边界首次 3/8 通过、5/8 行为失败，包含同一视频限制、无视频文件、强制退出后错误通过及两类迟到写入。
- 最终定向 GREEN：20 个 COS108、原 COS94 全部 10 个回归、两个 `/1` 与 `/2` 代表，共 **32/32、0 skip、1708.7793ms**。固定共享余额、取消、挂起、真实退出缺口、写入失败/迟到/未结算均覆盖。
- `npm run typecheck`、`npm run build` 与最终三测试文件 strict 均退出 0。生产源码此后未变，构建/类型检查证据复用。
- 文件名纠正：最初误把原 COS94 测试路径当新文件。原文件先完整恢复至 HEAD，新测试移至 `generic-cleanup-budget.test.ts`，随后按 Root 授权仅调整原 COS94 受影响断言；没有删除旧测试覆盖。原 RED/尝试日志保留，不覆盖或改写。

### 公共交付代表：整体失败，需独立分类

唯一首次 compiled 公共 DAG 于 `2026-10-20T13:42Z` 执行，**TAP 0/1、exit1**，test 21534.6172ms、process 25879.0384ms。真实 tsc/Vite 退出 0；Edge `155.0.4283.62` 的 9 步正常输入、媒体、干净 Node 包、fixture 独审与 exact promotion 均已达到各自断言；随后 `after` hook 的 `controller.close()` 报 `Owned child PID is alive; recovery refused.`。局部通过不能覆盖整体失败。

本次 TEMP：`C:/Users/26557/AppData/Local/Temp/Cosmos COS65 中文交付 v00HtT`。原 owner PID18420，记录 launcher PID32408/2968/30672/31404。浏览器 PID32752 的 raw 报告结束于 `13:42:43.735Z`，非 forced、processExited=true、errors=[]；干净 helper PID10280 结束于 `13:42:44.018Z`，code0/helperExited=true，端口65193。源码与该实际候选使用的编译版本一致。

只读后核 `13:46:51.247Z`：上述七个 PID 均无当前进程，本次 TEMP 标识的 node/msedge 为零、65193 无监听。原 v1 owner 只有 ticket/PID，异常未标明具体 PID，未保存失败瞬间的 CreationDate/exe；当前无进程不能倒推当时 PID 复用或 ownership 缺陷。原 owner/候选/raw 均保留，没有清锁、kill 或重跑。

Root 已要求准备一次私有观测方法，先独审具体 instrumentation 再决定执行同一公共 fixture；该步骤尚未执行，不计本源码完成证据。

### 私有原始输出索引

目录：本工作树 `.cosmos/cos108-verification/`。

- `red-1500ms.tap`、`red-generic-boundaries.tap`：上述行为 RED。
- `green-attempt-1.tap`：17/19；两项已到限测试原期待 failed report，实际按计划拒绝发布并 throw，后改为明确拒绝断言。
- `green-focused.tap`：早期 22/22；最终采用 `green-affected.tap` 的 32/32，不相加。
- `typecheck.log`、`build.log`：生产检查退出 0；`strict-affected.log`：最终三测试文件 strict 退出 0。
- `public-dag.tap`：首次整体失败的完整输出及 TEMP 位置。
