# COS-94 Browser Server Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this reviewed plan task-by-task. Dedicated implementer and independent reviewer remain separate; only the assigned merger integrates and pushes.

**Goal:** 普通浏览器服务关闭使用原清理预算内的有界余量，并准确保留已完成的视频保存事实。

**Architecture:** 保留当前关闭顺序和原绝对截止。仅为 generic BrowserServer 分配 `cleanupReserveMs` 扣除 force reserve 后的额度；用成功 `saveAs` 的控制流判定是否应记录视频不可用。现有错误分类、强制终止及退出检查继续决定失败。

**Tech Stack:** Node 22.22.2、TypeScript、node:test MockTimers、锁定 Playwright 1.63.0、Windows Edge、独立 TEMP loopback fixture。

---

规格：[COS94](../specs/cos94-browser-server-cleanup.md)。基线 `61d13817ca871d2be04576b4d6fb51fa8a86b541`，工作副本 `E:/CodexData/.codex/worktrees/cos74-frozen-template/Cosmos`，分支 `codex/cos94-browser-server-cleanup`。复用前已核实 clean、旧 `fd5008c` 为基线祖先；没有 reset。

本阶段仅创建本计划和任务卡。**提交后停止，等待独立计划评审；批准前不修改生产代码。** 不改 main、共享 tracking、GitHub、原报告、候选、参考安装或真实账本。所有 fixture 和新运行结果只在 TEMP；无模型或 provider 调用。

计划 `e9e60894cea81fac3f99bfb4735635d8510f0e03` 已由 `cos94_reviewer` 独立 PLAN_APPROVED，无 finding，协调者授权继续。下述计划正文保留批准时要求，当前执行证据见文末。

## 已执行的诊断与 RED

证据目录：`C:/Users/26557/AppData/Local/Temp/cos94-cleanup-af7b3174b1d44d9ca7b14cab59875aa1`。

| 命令 | 已观察结果 |
|---|---|
| `pwsh -File <证据目录>/guard.ps1` | 未改 runner 单步真实 Edge RED；原错误 `Cleanup: Server cleanup: timed out after 1000 ms`，Node exit1，guard 未触发。视频先保存；随后确实 taskkill、浏览器 exit1；详见任务卡。 |
| 各对照目录中的 `guard.ps1` | 一个原始 SDK 顺序正例，八个仅放宽观察窗口的 TEMP runner 副本正例；server 关闭 213–255 ms、exit0，无自然正常关闭超过 1 秒的证据。不得把该诊断 6 秒窗口用于实现。 |
| `node --experimental-strip-types --test <证据目录>/cleanup-red.test.mjs` | 真实生产 runner + 合成外部边界；0/2 passed、0 skip、exit1，663.7119 ms。1,200 ms close 被 1,000 ms cap 拒绝；保存成功后仍错误提示 unavailable。 |

真实慢退出的底层 OS 原因未确定。此计划是已有预算内的等待策略修正及已确认文案错误修正，不承诺历史失败必定消失。已释放真实浏览器计时 slot；实现后的唯一真实正例需先与协调者预约，避免与 COS93 互扰。

## Task 1: 固定通用清理的可观测行为

**Files:** 新增 `tests/acceptance/generic-cleanup.test.ts`；可参考现有 `tests/acceptance/persistent-launch.test.ts` 的 MockTimers 和 deferred 模式，不修改该文件。

- [ ] 把已运行的两个 TEMP RED 迁移成类型完整的生产回归测试。测试直接调用 `runAcceptance`，仅模拟 chromium 和 owned ChildProcess 外部边界；不增加生产注入参数。合成视频明确不是可播放证据。
- [ ] 增加正常快速关闭、1,200 ms 成功关闭、server 挂起、server reject、退出未证实、已保存/未保存视频的检查。所有挂起 Promise 均由测试 gate 收尾；模拟终止只拦截当前 fixture 的子进程调用，不发 OS kill。
- [ ] 用 MockTimers 验证上限：通常 2,000 ms，原 gracefulDeadline 更早时按更早时间结束；timeoutMs≤3,000 时 `cleanupReserveMs-forceReserveMs=0`，不能新开等待。原强制终止剩余额度及 unproven failure 保持。
- [ ] 加一个 `runAcceptanceInOwnedSession` 取消代表，确认信号仍失败、原 persistent 1,000 ms cleanup cap 未变；不重复 COS92 的完整启动矩阵。
- [ ] 执行 `node --experimental-strip-types --test tests/acceptance/generic-cleanup.test.ts`。预期新增 1,200 ms 正例及已保存视频文案检查在未改生产源码时 RED；失败原因必须是目标行为。
- [ ] 提交测试，报告确切 SHA 和 RED 输出，不创建新运行身份或费用记录。

## Task 2: 最小生产补丁

**Files:** 仅修改 `src/acceptance/runner.ts` 的 `finally` 清理块及一个私有视频保存状态变量。检测 UTF-8，保持 LF；保留无关代码和所有中文。

- [ ] 在既有 reserve 计算中命名 force reserve，保持值不变。只把 server 等待改为以下预算计算；其余 cleanup 调用仍用原 1,000 ms cap：

```typescript
const forceReserveMs = Math.min(1000, cleanupReserveMs);
const gracefulDeadline = lifecycleDeadline - forceReserveMs;
// Context/video/client/persistent cleanup retains its existing limit.
if (server) await bounded(() => server!.close(),
  Math.min(cleanupReserveMs - forceReserveMs, gracefulDeadline - Date.now()), 'Server cleanup');
```

通常最多 2,000 ms，非全部剩余运行窗口；非正余量由现有 `bounded` 拒绝。保持最后 `stopBrowserProcess(owned, max(1, min(2000, lifecycleDeadline-now)))` 及原退出检查。不得调用 SDK 无界 `kill()` 或吞异常。

- [ ] 设置私有 `videoSaved`，只在 generic `video.saveAs` 完成后置 true。Generic 只有尚未保存时才追加原 unavailable 错误；server 失败仍记录原错误、termination=lifecycle、outcome=failed。Persistent 分支的既有保存和失败行为保持。
- [ ] 运行 Task 1 测试，必须全部 GREEN。断言保存成功只来自完成回调，不能从文件存在、文件大小或媒体字段推断；文件保留不赋予播放通过。
- [ ] 运行 `node --experimental-strip-types --test tests/acceptance/deadline.test.ts`，复用未受影响的 COS92 启动、220 步玩法和 62 字段证据。
- [ ] 按 Task 3 检查后提交最小源码补丁，提供 SHA、覆盖范围和已知限制。

## Task 3: 一次受影响真实正例及交付检查

**Files:** 新增 `tests/acceptance/generic-cleanup.integration.ts`，只包含一个正常 loopback 页面、一次 generic runAcceptance 和 own-process 后核。该文件按现有 integration 命名，单独执行；结果写 TEMP。

- [ ] 与协调者确认真实浏览器 slot 空闲后执行一次。沿用已验证的外部 guard：独立 Node、`Start-Process -WindowStyle Hidden`、25 秒杀本次进程树、30 秒总界限；不杀已有用户浏览器。
- [ ] 运行 `node --experimental-strip-types --test tests/acceptance/generic-cleanup.integration.ts`（外层 guard）。记录 context/video/client/server 时点、browser PID、exit/close/code、原 deadline；要求 passed、无 forced、进程实际不存在、HTTP listener 关闭、视频保存路径保留。此正例不证明真实慢退出已治愈，也不声称视频播放通过。
- [ ] 运行 `npm run typecheck` 和 `npm run build`。
- [ ] 运行受影响测试 strict：`npx tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck tests/acceptance/generic-cleanup.test.ts tests/acceptance/generic-cleanup.integration.ts`。不修无关既有 strict 诊断。
- [ ] 运行 `git diff --check`，严格 UTF-8 解码并重新读取修改文件，核对中文、LF、无乱码；确认除上述文件及本 spec/plan 状态记录外无改动。
- [ ] 独立 reviewer 读取实际 diff，先规格再质量；作者修复可执行 finding，提交精确 SHA 后复审受影响部分。作者只提交自己的分支，不合 main、不推 batch。
- [ ] 将批准 SHAs、真实/TEMP 证据、检查结果和未确定 OS 根因的限制交唯一 merger。仅 source scoped complete；原 C14 与媒体补采失败事实不改。

## 作者实现证据（待源码独审）

- 测试提交 `3e7d0641df20e4fbee9110ffe4e0a1f279776a35`：新 10 项确定性 runner 回归先得 6 pass / 4 fail / 0 skip、exit1、829.8609 ms；四项目标 RED 为 1,200 ms 正常关闭、2 秒局部上限、短预算零余量及保存后视频误报。该提交受影响 strict 退出 0。
- 生产补丁仅 `src/acceptance/runner.ts`：通常最多 2 秒且受原 gracefulDeadline 限制；成功 generic `saveAs` 后不再追加 unavailable。Persistent 分支、强制终止和退出判断代码保持。
- `node --experimental-strip-types --test tests/acceptance/generic-cleanup.test.ts tests/acceptance/deadline.test.ts`：11 pass / 0 fail / 0 skip、exit0、994.8575 ms。覆盖强制失败、退出未证实、原 deadline、短预算及 persistent 取消。
- `npm run typecheck`、`npm run build` 均退出 0。新增 integration wrapper 首次 strict 报隐式 any；补显式参数类型后，两份新增测试的指定 strict 命令退出 0，无放宽类型配置。
- 生产提交 `f8b3b2f5f0002ce08b2f7e1f0348cf7e0f5417d1` 上唯一真实正例已在协调者交接的独占 slot 执行：1/1 pass、0 skip、测试 1,387.2406 ms、TAP 总 2,023.4926 ms；外部 guard 2,178 ms，Node3196 exit0、guard 未触发。完成后立即释放 slot，无追加样本。
- 实际 context/video/client/server 关闭分别 147.797 / 7.280 / 2.528 / 236.621 ms；Edge13548 exit/close=0、forced=false、processExited=true，报告在原 15 秒预算内完成。保存了视频文件，不宣称可播放；原 Windows 慢退出原因仍未确定。
- 实际证据 `C:/Users/26557/AppData/Local/Temp/cos94-cleanup-real-FV5N3a/{events.jsonl,summary.json,postcheck.json}` 及相对 `cos94-synthetic/inline/v1/real/cleanup/report.json`；guard/TAP 在 `C:/Users/26557/AppData/Local/Temp/cos94-real-guard-b194da483a874474b11ff5b412073af9`。后核 Node3196、Edge13548、直接子进程及 HTTP64638/WS64639 listener 均未残留。
- 所有编辑文件严格 UTF-8/noBOM/LF、中文回读及 diffcheck 通过。原 C14、paid/ledger/window、生成资产与共享 tracking 均未写入。作者验证完成，等待独立源码评审和唯一 merger。
