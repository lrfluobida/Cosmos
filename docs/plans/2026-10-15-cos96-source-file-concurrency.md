# COS-96 Source File Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this reviewed plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Dedicated implementer and independent reviewer remain separate; only the assigned merger integrates and pushes.

**Goal:** 将已知 execution receipt 平面清单的串行字节核验改为每调用固定 4 路，并保留顺序、收敛、新鲜度和完整来源守卫。

**Architecture:** 仅提取并接入 source-owned 窄叶函数；每组最多 4 项用 `Promise.allSettled` 收齐，再按原索引抛错。receipt 摘要及后续 dependency/解析路径/完整 closure 比较依次保留，无缓存、通用框架或可调并发。

**Tech Stack:** Node 22.22.2、TypeScript、node:test、现有 `readFile`/`validationHash`、隔离 TEMP 与必要的只读依赖 loader。

---

规格：[COS96 任务卡](../specs/cos96-source-file-concurrency.md)，[已发布 #97](https://github.com/lrfluobida/Cosmos/issues/97)。专职作者 `cos96_implementer`、独立 reviewer `cos96_reviewer`、唯一 merger `batch_c14_cos92_merger`。

固定起点 `194e23d789bdc3a3b43773fad7b1c14ecdd8fd2d`；分支 `codex/cos96-source-file-concurrency`；managed worktree `E:/CodexData/.codex/worktrees/cos74-frozen-template/Cosmos`。复用前已核 clean，旧作者提交 `04fdb8bd0b44bd059f49dcf7b43029f7647beb13` 是起点祖先；未 reset、删除旧分支或 ignored 证据。起点已含 COS93 v3 文档与 COS96 映射。

本阶段只提交本计划和任务卡，独立计划审查批准前不写实现。用户已决定范围与持续推进，routine 选择由此计划独审；作者不合 main、不 push、不改共享 tracking 或 GitHub。应用 @superpowers:brainstorming、@superpowers:writing-plans、@superpowers:test-driven-development 和 @superpowers:verification-before-completion；专职作者及独立 review 遵守项目工作流。

## 设计与不变量

选 source-owned 窄导出 `requireKnownTransferCodingSourceFiles(files: readonly { path: string; sha256: string }[], signal: AbortSignal)`。它不是公开 runner selector，没有 reader/limit 参数，只执行既有文件字节核验。私有函数加 loader 附加导出需要重写源码；无界 `Promise.all` 无法满足峰值或失败后组收敛；保留串行不能减少这段独立 I/O。因此使用固定 4 路窄函数，测试与 A/B 直接 import 同一真实模块算法。

生产调用仍在 receipt 摘要通过后构造原平面清单，不排序或去重；只有该调用替换原 110–112 行循环。后续 dependency 名称、解析路径、完整 closure recapture 比较逐行保持。递归捕获、六轮 scope、snapshot/history/accounting、Git before/fixed input/after、5 秒/15 秒、owner、controller 队列和预算均不在修改范围。

每组派发前检查 signal；每项保留原派发前 signal 检查、`readFile(file.path)`、hash 和错误文本。当前组全部 settled 后先按原索引抛 rejected reason，若没有项错误则检查 signal 后才继续；已取消不派发下一组。原文件读取不新增 `{ signal }` 或取消 API。外层 scope 仍可先 timeout，不能把叶函数的等待扩写成外层等待保证。

## Task 1: 受控读取目标 RED

**Files:** 修改 `tests/transfer/validation-case-seven-source.test.ts`；必要时新增 `tests/transfer/validation-case-seven-source.fixture.mjs`。生产 source 文件暂不变。

- [ ] 在隔离 Node child fixture 中使用 loader，仅定向替换目标 source 模块导入的 `node:fs/promises` 读取依赖；`realpath` 与其它导入委托真实实现。用原函数 `requireFixedTransferCodingSource()`、正确 receipt 摘要、至少 9 个原序平面条目与空 dependencies 构造合法摘要的最小输入。叶区间成功后现有 `C7 fixed runtime dependency set changed.` 是固定后置 sentinel；不需要新导出存在，也不以非法摘要作为 RED。
- [ ] gate 只记录 start/settle/active/peak、路径索引和错误标量，读取内容用小型真实 TEMP 文件。第一组释放前要求索引 0–3 都已开始、其余未开始；释放第一组后再检查第二组，最后处理尾组。使用事件屏障，外层有界等待只防卡住，不把墙钟速度作为通过标准。
- [ ] 目标测试一 `COS96 known source reads overlap in groups of four` 验证真实重叠、峰值 4、组间界限和原序。不释放 gate 的失败清理必须释放所有已启动项并观察原 promise，避免 RED 自身挂起或产生 unhandled rejection。
- [ ] 目标测试二 `COS96 known source failure drains its group in original index order`：组内索引 3 先拒绝，索引 0 后拒绝，中间两项更迟 settled；提前拒绝时主调用仍 pending。最后抛索引 0 原 Error 对象，全部已派发项 settled、下一组零读取。另覆盖 hash mismatch 的原错误文本。
- [ ] 运行 `node --experimental-strip-types --test --test-name-pattern='^COS96 known source (reads overlap|failure drains)' tests/transfer/validation-case-seven-source.test.ts`，预期两个匹配测试在旧串行实现失败于同组四项未启动；不能把 loader、语法或 fixture 失败当目标 RED。保存完整 TAP、命令、exit code，并提交测试 SHA。

## Task 2: 最小固定 4 路实现与 GREEN

**Files:** 仅修改 `probes/transfer/validation-case-seven-source.ts`；Task 1 测试继续经原完整函数观察接线。

- [ ] 编辑前严格 UTF-8 检测；保留无 BOM、LF、周围风格与中文。添加下列窄函数，不引入依赖、缓存、通用映射器或其它公开选择：

```typescript
export async function requireKnownTransferCodingSourceFiles(files: readonly { path: string; sha256: string }[], signal: AbortSignal) {
  for (let start = 0; start < files.length; start += 4) {
    signal.throwIfAborted();
    const settled = await Promise.allSettled(files.slice(start, start + 4).map(async file => {
      signal.throwIfAborted();
      if (validationHash(await readFile(file.path)) !== file.sha256) throw new Error('C7 actual executed source or dependency bytes changed.');
    }));
    for (const result of settled) if (result.status === 'rejected') throw result.reason;
    signal.throwIfAborted();
  }
}
```

- [ ] 原 `requireFixedTransferCodingSource()` 摘要校验之后，以原数组表达式直接 `await requireKnownTransferCodingSourceFiles([...source.files, source.platformLock, ...source.dependencies.flatMap(d => [{ path: d.entry, sha256: d.entrySha256 }, { path: d.path, sha256: d.sha256 }, ...d.files])], signal);`。摘要、dependency 集合、resolution 和 recapture 顺序及错误文本保持；不改递归函数。
- [ ] 用 Task 1 同一命令确认两个目标 GREEN。测试直接调用新窄导出的结果须与经完整函数的叶行为一致，后者仍在叶成功后到达 dependency sentinel，证明生产调用确实接入同一算法。
- [ ] 检查 source diff 只有叶函数与原循环接线，提交最小生产补丁 SHA。

## Task 3: 取消、独立调用和真实守卫

**Files:** 扩展 `tests/transfer/validation-case-seven-source.test.ts` 与同一个隔离 fixture；既有 source/compiled/C14/scope 测试原则上只运行。

- [ ] 预先取消：传入已 abort 的 signal，零 read 派发、保留原 reason；读取中取消：第一组 gate 开启后 abort，释放已派发项，全部 settled 后保留原 reason、下一组零 read；取消后迟到拒绝：让已派发的较后索引先拒绝、较早索引更迟拒绝，全部观察后按原索引抛原 reason，无 unhandled rejection。取消与失败不另派发文件读取。
- [ ] 同一文件首次通过后真实改字节，使用新 signal 再调用，必须重新读取并拒绝；恢复合成字节后第三次成功到达后置 sentinel。断言每次 read 次数与内容哈希，不仅检查函数调用计数。另证明两次重叠独立调用各自上限 4，而非声称全局上限 4。
- [ ] 运行 `node --experimental-strip-types --test tests/transfer/validation-case-seven-source.test.ts`，要求全部通过、0 skip；保留原 Playwright descendants 与 compiler execution leaves 绑定测试。
- [ ] 运行 `node --experimental-strip-types --test tests/transfer/validation-case-seven-compiled.test.ts`：该隔离 fixture 覆盖真实 browser/tool/template 字节篡改、source/compiled 两路拒绝和恢复成功。只修改本 fixture 可解析且在其 TEMP 根内的副本；不碰实际仓库依赖或参考安装。
- [ ] 运行 `node --experimental-strip-types --test --test-name-pattern='^C14 source closure includes its fixed wrappers current plan feedback factory and worker$' tests/transfer/validation-case-fourteen.test.ts`，要求匹配 1 项通过、0 skip，保留 C14 closure 和 receipt 摘要拒绝。
- [ ] 运行 `node --experimental-strip-types --test --test-name-pattern='^real transfer host guard timeout preserves its origin before candidate binding$|^controller abort closes origin and wins classification|^owner work cancellation closes the real host even when the controller remains active$' tests/transfer/scope-timeout-origin.test.ts`，要求匹配 4 项通过、0 skip，核原 timeout、abort reason、owner 收尾与下一独立调用重新校验。未变其它 scope/history/accounting/Git 证据复用，不重跑大 C14。

## Task 4: 一次只读平面叶组件 A/B

**Files:** 仅在新 `cos96-source-leaf-*` TEMP 目录保存 `measure.mjs`、标量 `result.json` 和日志；本任务卡与计划补充结果。

- [ ] 在实现与回归稳定后固定生产补丁 exact SHA。只读 v3 raw 根 `C:/Users/26557/AppData/Local/Temp/cos93-native-startup-RK3aDx` 的 `prepared.json` 定位其原 admission，提取 execution receipt 元数据。只读 receipt 摘要与原 201 项清单，不打开 controller、snapshot store、凭据、原账本 owner 或 provider。找不到完整 201 项、摘要无效或原路径缺失则报告并停止测量，不重造输入或 seed。
- [ ] 同一 Node 进程先 serial A，再 import 确切源码版本的 `requireKnownTransferCodingSourceFiles()` 做 B。A 逐条执行原 `readFile`/`validationHash`/比较；B 直接调用生产窄导出，loader 只包装该模块读取依赖做计数并委托真实 read，不重写算法或并发选择。
- [ ] 两路各运行一次，记录有序路径/hash/结果一致的布尔值与有序摘要、entry/read 次数、总读取字节、active 峰值、单次 wall ms、Node 版本、receipt 摘要和源码 exact SHA。A 峰值 1、B 峰值不超过 4，entry/read 均 201；只输出标量，不把路径清单、Buffer、Promise、完整 receipt 或完整状态留在诊断结果。
- [ ] 所有原文件只读，输入仍是 v3 原 201 项；B 所在新代码的完整 closure 与旧 receipt 不同，因此绝不调用新完整 `requireFixedTransferCodingSource()` 冒充完整等价。明确报告 A → B 热缓存/顺序偏差、无预热或择优重测、无性能通过阈值。组件结果不代表完整 source、六轮 guard、15 秒 startup、游戏性能或节费。

## Task 5: 受影响检查、独审与交付

**Files:** 更新本计划与任务卡的实际证据；作者不编辑共享 tracking。

- [ ] 运行 `npm run typecheck`、`npm run build`，均退出 0。主 tsconfig 不包含 probe/test，另运行 `node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions --allowJs --checkJs false probes/transfer/validation-case-seven-source.ts tests/transfer/validation-case-seven-source.test.ts`，要求退出 0；新增 fixture 另用 `node --check tests/transfer/validation-case-seven-source.fixture.mjs`。
- [ ] 重开全部改动文本，严格 UTF-8/no BOM/LF 检测并回读中文；运行 `git diff --check`，审实际 diff 与状态。只对新代码、环境、输入契约 delta 或新失败追加必要验证，已通过结果不重复跑。
- [ ] 在新小 TEMP 保存 RED/GREEN/边界/真实代表/typecheck/build/strict 的完整命令、TAP/log、exit、pass/fail/skip；文档记录 exact 测试与生产 SHA、组件路径、限制及未执行事项。初始失败不得覆盖成通过。
- [ ] 提交作者 own files，报告最终 exact SHA 与 worktree clean。交 `cos96_reviewer` 先规格、后质量独审；作者修 actionable finding 后再审受影响变更。唯一 merger 核批准 SHA、做必要集成检查、合 main/push 并登记结果。

本卡无 actual/paid 授权，不新建 715 请求 seed 或浏览器，不重开原 C14；组件 A/B 不创建 controller，既有免费守卫测试使用各自的隔离 fixture。原 C14 failed/consumed、v1/v2/v3 raw、真实 ledger3114/715/16901000µ、reserved/unknown0、共享 ¥150、正式 ¥200/12h 与 ¥100/6h 目标保持。即使局部 source 归零，既有无重叠 binding 仍约 20.283 秒；COS93 完整启动、COS16/COS18、accepted、完整经典与 human 不由本卡提升。
