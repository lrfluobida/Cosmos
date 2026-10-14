# COS-87 Parallel Git Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 并行读取一次身份检查中独立的 Git 字段，保留当前身份、取消与子进程清理边界。

**Architecture:** 只改 `inspect()` 内四个只读查询的调度。每组用 `Promise.allSettled` 收齐结果，再按原顺序校验；根目录检查、before、固定输入、after 仍依次完成。

**Tech Stack:** Node.js 22.22.2、TypeScript 5.9.3、Git、现有 `node:test` / `runChild`。

---

## 范围与基线

- 任务 [COS-87 / #88](https://github.com/lrfluobida/Cosmos/issues/88)，详情见 [任务卡](../specs/cos87-parallel-git-identity.md)。作者 `cos87_implementer`；独立 reviewer `cos87_reviewer`；唯一 merger `batch_c12_reference_merger`。
- 隔离分支 `codex/cos87-parallel-git-identity`，worktree `E:/CodexData/.codex/worktrees/cos76-transfer-case8/Cosmos`；起点 `b94d0d49f032888d46d8e1a56e774713fe8fe973`。该起点的 identity/host 与实测源码 `3cde457f77ef8990d73a650319b76900df3cdc11` 无差异。
- 复用 `C:/Users/26557/AppData/Local/Temp/cos-coding-perf-20261015/` 的 `measurement-context.json`、`prepared-production-cost.{json,tap}`、`components.json`。普通 prepared fixture 一次工具 135679.100ms；83 次 scope 121935.049ms，其中完整 Git 身份 77662.116ms、源码检查 44219.650ms。独立 9-Git 读取 879.665ms。嵌套累计值不能相加。
- 上述夹具使用生产读取和合成 compiler；不是 inherited C12 重演。旧 `sourceBaseline=a464...` 是复用 harness 的标签，实际读取源码为 `3cde457...`。不重跑该大夹具或已消费的 C12。

## 设计

每次调用仍建立一个 5000ms deadline 和组合 signal。根目录查询成功且实际 root 匹配后，启动一组 `symbolic-ref`、`rev-parse HEAD`、`ls-files -v -z`、`status`，每组最多四个 Git child。全部 settled 后依次取 branch、head、index；先保留 index flags 拒绝，再取 status 并检查 clean main / exact SHA。这样查询失败按原字段顺序传播，index flags 仍优先于 status 失败，结果不由完成时序决定。

`readFixedInput` 只在完整 before 成功后执行；完整 after 只在输入读取和 `remaining()` 成功后启动。原 before/after 比较、输入摘要、Git 参数和每次 `remaining()` 检查均保留。即使一个查询先失败，也等待已启动 siblings 完成或由同一 deadline / abort 清理后才抛出。下一次调用重新执行全部查询。

备选 `Promise.all` 会在 sibling 尚未结束时拒绝；保留串行不能解决已测等待成本。选择 `allSettled`，不新增生产注入接口、持久缓存、依赖或并发框架。

## 实施步骤

### 1. 测试先行

**Files:** 修改 `tests/e2e/validation-identity.test.ts`；新增仅测试的 `tests/e2e/validation-identity.fixture.mjs`。

- [x] 独立计划批准后，先新增受控 fixture。通过独立 Node 进程内的 module loader，仅替换 identity 导入的 `runChild`；生产导出保持不变。受控 deferred 查询记录 start/settle、signal 与 timeout；真实取消/超时场景委托原 `runChild` 启动有界 Node child。
- [x] 新测试在 root 完成后要求同组四个查询均已开始且尚未释放；释放整组后才允许输入读取，再允许 after。验证 max-active=4、根查询+两组共9次、第二次调用重新读取。旧串行实现须在并发断言失败；用事件/屏障断言，不用速度阈值。
- [x] 补确定性失败测试：不同顺序完成的多个 query 失败仍按 branch/head/index/status 顺序传播；index flags 与 status 失败组合仍报 flags。一个 sibling 失败后，read 不能在其余 started siblings settled 前拒绝，且 input/after 不启动。
- [x] 补 root 不匹配和固定输入读取期间的实际源码变更；已有 wrong SHA、非main/detached、dirty/untracked、flags、fresh call、abort 测试保留。
- [x] 真实 child fixture 分别覆盖 caller abort 与原5秒总截止，记录所有已启动 PID，拒绝返回后检查 PID 均退出。检查同组 signal 一致、timeout 使用同一剩余总额；测试自身有更外层清理，防止断言失败泄漏。
- [x] 保存旧源码 RED 的完整命令、TAP 与退出码到 `C:/Users/26557/AppData/Local/Temp/cos87-parallel-git-identity/`。

### 2. 最小实现

**Files:** 修改 `probes/e2e/validation-identity.ts`。

- [x] 将四个 `git(...)` 放入 `Promise.allSettled`，按设计顺序读取 fulfilled 值或抛原 rejection reason；其余逻辑不变。
- [x] 运行新增测试为 GREEN，再运行完整 identity 测试。仅修本任务触及的失败；不改 `host.ts`、source snapshot 或取消政策。

### 3. 验证、实测与交付

**Files:** 更新本计划与 `docs/specs/cos87-parallel-git-identity.md` 的实际证据。

- [x] `node --experimental-strip-types --test tests/e2e/validation-identity.test.ts`：全部通过、0 skip，包含 RED→GREEN 与真实 PID 清理。
- [x] `npm run typecheck`、`npm run build`：退出0。
- [x] `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions --allowJs --checkJs false tests/e2e/validation-identity.test.ts`：退出0；该项覆盖未纳入主 tsconfig 的 probe/test。
- [x] 等 Root 确认 main 干净后，固定当时最新 reviewed SHA，在同一仓库、同一 manifest、同一 Node/Git 环境交替调用旧与新 identity reader。各记录一次预热与至少5个样本，报告9次实际 Git 查询的原始毫秒值和中位数；旧代码取精确起点版本，新代码取作者分支，两者只读取同一真实main。基准不绕过真实 Git，不读实际账本/session/key，不启动模型；保留TEMP脚本与JSON，墙钟不作为单元测试通过条件。
- [x] 严格 UTF-8 回读、非ASCII内容检查、`git diff --check`、完整差异审查。最终 exact `ac91cff85ddbdd08720623fd600161f2e61bd6b6` 经 `cos87_reviewer` 独立APPROVED，无剩余finding；唯一 merger 合入 `49e892992749e5511f2bb4135ec67be4459fa30b` 并更新共享跟踪，作者不写 main、不 push。

## 验收边界

本任务只证明身份读取优化及其守卫保持。共享验证 ¥150、正式 ¥200/12h、目标 ¥100/6h、原5秒 identity 时限均保持；不删来源检查、不改生成游戏、不访问参考安装、不新增付费或窗口。COS16/COS18、完整经典、PERFORMANCE 和 human 不因本任务提升。

## 实施证据

计划 exact `f509606a8da1ebe6e5f73ff2d0c430d787fe85c9` 已由 `cos87_reviewer` 独立 PLAN_APPROVED，无 findings。生产只修改 `inspect()` 调度与结果展开，增加5行净代码；原 root/before/input/after、全部守卫与 `runChild` 保持。

原始证据均在上述 TEMP 目录：

| 检查 | 实际结果 | 文件 |
| --- | --- | --- |
| 旧生产 RED，pattern `COS87 identity overlap` | 0/1，退出1，准确失败于只有branch开始；TAP593.2563ms | `red-overlap.tap` |
| 新生产受控组，pattern `COS87 identity` | 5/5、0skip、退出0；TAP8868.2017ms | `green-controlled.tap` |
| 完整identity回归 | 19/19、0skip、退出0；TAP32545.1387ms | `identity-full.tap` |
| typecheck / build / 受影响strict | 全部退出0 | `typecheck.log` / `build.log` / `affected-strict.log` |
| 同环境旧/新真实身份读取 | 各预热1次、交替5次，前后main干净，每次9查询且结果一致 | `compare.mjs` / `comparison.json` / `comparison.log` |

完整回归中，真实查询失败、caller abort、原5秒timeout各启动4个Node child，经原生产 `runChild` 执行；读取器拒绝前均确认PID已退出。受控并发的两次独立调用共18次查询，inputs=2、maxActive=4、active=0。失败按字段顺序返回，flags优先于status失败；无输入或after越过失败组。

基准命令：`node --experimental-strip-types C:/Users/26557/AppData/Local/Temp/cos87-parallel-git-identity/compare.mjs`。读取同一真实main `59b89897435c2acd8d9cf64b878fd8306f3d154a` 与固定输入；Node22.22.2、Git2.43.0.windows.1。旧源码取上述b94d起点，新源码取作者分支；TEMP只重定位import并包装命令边界计数，实际执行原 `runChild` 和Git。起初main出现Root公开记录的未跟踪文件，预检拒绝且0样本；Root归档后才有效采样，原拒绝保留于 `comparison-preflight-dirty.log`。

| 轮次 | 旧版ms | 新版ms |
| --- | --- | --- |
| 1 | 730.7152 | 338.7814 |
| 2 | 755.5810 | 325.6303 |
| 3 | 752.7546 | 349.3482 |
| 4 | 888.7882 | 369.0948 |
| 5 | 896.7414 | 348.6017 |
| 中位数 | 755.5810 | 348.6017 |

该短基准中位数下降53.8631%；旧峰值1、新峰值4，每次仍9次查询。此数值只描述该环境的完整身份读取；没有重跑135秒工具夹具，不能推导工具总时长、实际C12速度或节费，也不构成游戏性能验收。无网络、付费、实际ledger/session/key或参考安装操作。

状态：PARALLEL_GIT_IDENTITY_SOURCE_READY / source scoped complete / closed；[公开批准与关闭](https://github.com/lrfluobida/Cosmos/issues/88#issuecomment-6175145772)及父勾选已由Root精确读回。主线strict与两项短集成代表通过，合并记录见[任务卡](../specs/cos87-parallel-git-identity.md)。
