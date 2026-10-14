# COS-87 Parallel Git Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 并行读取一次身份检查中独立的 Git 字段，保留当前身份、取消与子进程清理边界。

**Architecture:** 只改 `inspect()` 内四个只读查询的调度。每组用 `Promise.allSettled` 收齐结果，再按原顺序校验；根目录检查、before、固定输入、after 仍依次完成。

**Tech Stack:** Node.js 22.22.2、TypeScript 5.9.3、Git、现有 `node:test` / `runChild`。

---

## 范围与基线

- 任务 [COS-87 / #88](https://github.com/lrfluobida/Cosmos/issues/88)，详情见 [任务卡](../specs/cos87-parallel-git-identity.md)。作者 `cos87_implementer`；Root 指派独立 reviewer；唯一 merger `batch_c12_reference_merger`。
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

- [ ] 独立计划批准后，先新增受控 fixture。通过独立 Node 进程内的 module loader，仅替换 identity 导入的 `runChild`；生产导出保持不变。受控 deferred 查询记录 start/settle、signal 与 timeout；真实取消/超时场景委托原 `runChild` 启动有界 Node child。
- [ ] 新测试在 root 完成后要求同组四个查询均已开始且尚未释放；释放整组后才允许输入读取，再允许 after。验证 max-active=4、根查询+两组共9次、第二次调用重新读取。旧串行实现须在并发断言失败；用事件/屏障断言，不用速度阈值。
- [ ] 补确定性失败测试：不同顺序完成的多个 query 失败仍按 branch/head/index/status 顺序传播；index flags 与 status 失败组合仍报 flags。一个 sibling 失败后，read 不能在其余 started siblings settled 前拒绝，且 input/after 不启动。
- [ ] 补 root 不匹配和固定输入读取期间的实际源码变更；已有 wrong SHA、非main/detached、dirty/untracked、flags、fresh call、abort 测试保留。
- [ ] 真实 child fixture 分别覆盖 caller abort 与原5秒总截止，记录所有已启动 PID，拒绝返回后检查 PID 均退出。检查同组 signal 一致、timeout 使用同一剩余总额；测试自身有更外层清理，防止断言失败泄漏。
- [ ] 保存旧源码 RED 的完整命令、TAP 与退出码到 `C:/Users/26557/AppData/Local/Temp/cos87-parallel-git-identity/`。

### 2. 最小实现

**Files:** 修改 `probes/e2e/validation-identity.ts`。

- [ ] 将四个 `git(...)` 放入 `Promise.allSettled`，按设计顺序读取 fulfilled 值或抛原 rejection reason；其余逻辑不变。
- [ ] 运行新增测试为 GREEN，再运行完整 identity 测试。仅修本任务触及的失败；不改 `host.ts`、source snapshot 或取消政策。

### 3. 验证、实测与交付

**Files:** 更新本计划与 `docs/specs/cos87-parallel-git-identity.md` 的实际证据。

- [ ] `node --experimental-strip-types --test tests/e2e/validation-identity.test.ts`：全部通过、0 skip，包含 RED→GREEN 与真实 PID 清理。
- [ ] `npm run typecheck`、`npm run build`：退出0。
- [ ] `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions --allowJs --checkJs false tests/e2e/validation-identity.test.ts`：退出0；该项覆盖未纳入主 tsconfig 的 probe/test。
- [ ] 等 Root 确认 main 干净后，固定当时最新 reviewed SHA，在同一仓库、同一 manifest、同一 Node/Git 环境交替调用旧与新 identity reader。各记录一次预热与至少5个样本，报告9次实际 Git 查询的原始毫秒值和中位数；旧代码取精确起点版本，新代码取作者分支，两者只读取同一真实main。基准不绕过真实 Git，不读实际账本/session/key，不启动模型；保留TEMP脚本与JSON，墙钟不作为单元测试通过条件。
- [ ] 严格 UTF-8 回读、非ASCII内容检查、`git diff --check`、完整差异审查。提交 exact SHA、原始证据路径与局限给独立 reviewer；修复 findings 后复审。唯一 merger 合入及更新共享跟踪，作者不写 main、不 push。

## 验收边界

本任务只证明身份读取优化及其守卫保持。共享验证 ¥150、正式 ¥200/12h、目标 ¥100/6h、原5秒 identity 时限均保持；不删来源检查、不改生成游戏、不访问参考安装、不新增付费或窗口。COS16/COS18、完整经典、PERFORMANCE 和 human 不因本任务提升。

状态：PLAN_REVIEW_PENDING。源码与测试尚未修改。
