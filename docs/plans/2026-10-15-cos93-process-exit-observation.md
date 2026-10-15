# COS93 进程退出观测修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让诊断退出判据依据原ChildProcess的close事件，避免已退出进程的PID被复用后误拒绝startup。

**Architecture:** 复用每次spawn的独立record及现有once('close')写入的exit标志；Node-only observer helper提供一个纯谓词，actual fixture替换裸PID查询。PID继续用于独立OS后核定位，其他启动与清理判据保持。

**Tech Stack:** 现有TypeScript、Node22、node:test；无新依赖、进程框架或通用代际schema。

---

## 基线、证据与边界

基线 `194e23d789bdc3a3b43773fad7b1c14ecdd8fd2d` 已发布；v3文档作者 `3232eb970036d166b90b0e08b4b062ed3698a2ea` 已独审合入。旧managed worktree干净且该提交为基线祖先，在 `E:/CodexData/.codex/worktrees/cos76-transfer-case8/Cosmos` 新建 `codex/cos93-process-exit-observation`，保留旧branches/ignored证据，无reset。作者 `cos93_implementer`，独审 `cos93_reviewer`，唯一merger `batch_c14_cos92_merger`。

[v3研究记录](../research/2026-10-15-cos93-v3-native-startup-diagnostic.md)及[公开结果](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6187833755)已证实：16分23.679秒诊断完成，但startup failed；2503条原ChildProcess.close记录均exit=true/code0，裸 `process.kill(pid, 0)` 检查却使raw processesExited=false，独审确认12个同号PID已复用。`POSTCHECK_NO_LIVE_RESIDUE`仅证明当时无关联活进程。此观测缺陷可能误拒绝将来成功的startup，与v3 ticket前binding超时是两个独立事实。

本次先只提交计划与[任务卡](../specs/cos93-native-startup-diagnostic.md)planned节，待独立计划审查，不改helper/fixture/test。获准后仅处理下表代码；不改生产src、来源校验、guard、预算、heap或原5秒/15秒/45分钟界限，不增加hash/输出schema。

| 后续文件 | 最小责任 |
| --- | --- |
| `tests/transfer/native-startup-observer.fixture.ts` | 导出窄的record退出谓词，仅依赖原exit布尔值，不查OS、不保存引用。 |
| `tests/transfer/native-startup-diagnostic.fixture.ts` | 保留spawn/close接线及每次调用的独立record，仅将processesExited赋值改为调用该谓词。 |
| `tests/transfer/native-startup-diagnostic.test.ts` | 补PID复用及未close的小契约；不导入新生产入口，不改变module mock安装顺序。 |
| 本计划与任务卡 | 记录RED/GREEN、strict和exact提交；共享tracking/GitHub由Root/merger处理。 |

## Task 1: 最小RED→GREEN及actual接线

- [ ] 从旧赋值表达式窄提取record判据供测试调用，先保持旧逻辑。使用node:test替身完全接管process.kill，以纯返回/合成ESRCH模拟PID存在与不存在；不得执行真实OS查询或kill。确认旧逻辑在“已close、PID数值等于process.pid或重复PID”案例RED，记录原始结果。
- [ ] 实现纯谓词，预期形状为 `records.every(record => record.exit)`；records使用已有pid/exit字段，不新增代际对象或ChildProcess引用。process.pid仅作数字测试数据。每次spawn记录分别参与判断，同号PID不去重；任一未close记录必须false，即使其模拟PID不存在。空集合延续原every语义，不能替代独立浏览器登记/身份gate。
- [ ] 将actual fixture的裸process.kill判据替换为该helper调用。已有 `child.once('close')` 是exit的唯一写入来源，按原ChildProcess绑定该次记录；不改listener、spawn返回、记录数量、raw PID/code/signal或其他成功判据。close只证明该进程生命周期结束，不要求code0，也不据此断言执行成功、未跟踪后代或browser identity。
- [ ] 同一小回归GREEN，并断言最终谓词不调用process.kill；测试替身按测试上下文恢复。不启动真实子进程、浏览器、GC压力或历史夹具。独立OS/current-tree/ports/owner/profile后核仍保留，原v3 raw processesExited=false及原始证据一字不改。

## Task 2: 受影响验证与独审交付

- [ ] 仅运行新短回归，预期PID复用与未close两个情形均通过；复用其余已过生产/observer测试、strict历史和v3后核证据，不重跑完整套件。
- [ ] 对三个诊断文件运行strict；核UTF-8无BOM、LF、中文回读和diff。记录实际结果、命令及raw路径，不将预期当作通过。
- [ ] 提交exact SHA交cos93_reviewer复审实际diff，由唯一merger集成；作者不写main或共享tracking、不push。COS93仍open/partial/startup-failed，本修正不能证明15秒启动通过，不授予第四次actual或付费调用。

计划批准后的定向命令（当前未运行）：

```powershell
node --experimental-strip-types --experimental-test-module-mocks --test --test-name-pattern='COS93 process exit observation' tests/transfer/native-startup-diagnostic.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --skipLibCheck tests/transfer/native-startup-observer.fixture.ts tests/transfer/native-startup-diagnostic.fixture.ts tests/transfer/native-startup-diagnostic.test.ts
git diff --check
```
