# COS-96 · 对已知执行来源文件进行有界并发核验

任务：[COS96 / #97](https://github.com/lrfluobida/Cosmos/issues/97)，id5862972672，父 #1，登记时 96 个原生子任务。依赖 COS52 / #53 已审生产 host，以及 COS93 / #94 已审诊断实现与 v3 证据；不等待 COS93 完整启动通过。

状态：`spec-defined / plan-pending`，本阶段只交付任务卡和[实施计划](../plans/2026-10-15-cos96-source-file-concurrency.md)，源码尚未实施。专职作者 `cos96_implementer`，独立 reviewer `cos96_reviewer`，本批唯一 merger `batch_c14_cos92_merger`。计划须独审批准后才写实现。

## 问题与证据边界

[COS93 v3 完整诊断](../research/2026-10-15-cos93-v3-native-startup-diagnostic.md)在固定源码 `84f9c8857908d9db7ecbc404c6d5afbdfdc32542` 上记录：无超时后重叠的完整 binding `#2605` 耗 25.4176 秒；其中 12 次 identity/scope source 共 5.1343 秒、12 次 Git/fixed input 共 8.4290 秒、19 次 history 共 6.4491 秒。这些互不重叠叶区间不能与 scope/controller 父区间相加。`#2869 open` 在 14998.7753ms 超时，子 binding `#2870` 迟到；browser ticket、OS spawn、CDP 均未到。

本卡只减少已知 receipt 平面文件清单的串行 I/O。当前清单 201 项，含 173 个执行文件、1 个平台 lock、4 个依赖的 entry/manifest 共 8 项和 19 个 browser 文件；不包含另行递归捕获的全部 toolchain closure。即使上述 source 耗时全部归零，完整 binding 仍约 20.283 秒。本卡完成至多证明局部源码调度与守卫保持，不能关闭 COS93 或声称完整 15 秒启动通过。

原始证据根为 `C:/Users/26557/AppData/Local/Temp/cos93-native-startup-RK3aDx`；[公开结果及独立后核](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6187833755)已由 Root 读回。复用已审 v3 原始记录，不重跑实际诊断。

## 选定方案

只调整 `probes/transfer/validation-case-seven-source.ts` 原第 110–112 行平面字节循环。提取一个 source-owned 窄叶函数 `requireKnownTransferCodingSourceFiles(files, signal)`，由现有 `requireFixedTransferCodingSource()` 在 receipt 摘要通过后调用。函数仅接收原顺序的 `{ path, sha256 }` 清单和已有 signal；固定每次调用最多 4 路，没有 reader、limit 或并发选择参数。

每组最多 4 项，使用 `Promise.allSettled` 观察全部已派发项。只并发原来的 `readFile`、`validationHash` 和 hash 比较；组内按原索引抛最早 rejection reason。错误或取消后不派下一组；已派发项须收敛，没有未观察的 rejection。每调用 4 不等于全局 4，两次独立调用重叠时可有 8 项。保留原 `readFile` 调用形态，不新增文件读取取消机制。

叶函数是内部源码模块的窄导出，供测试和唯一离线组件 A/B 直接执行同一生产算法；公开 CLI、模型及环境变量不能选择它、改变并发或绕过完整守卫。相比私有叶函数再经 loader 重写源码以附加出口，这一方案少一层源码变换。受控测试仅在隔离 child fixture 中定向替换该模块的读取依赖，不复制或改写生产算法。

保持以下执行顺序及边界：

- receipt 摘要 → 平面字节 → dependency 名称集合 → 当前解析路径 → 重新 capture 完整 closure 并比较。
- 原清单顺序、重复项和读取次数；不排序、去重、缓存或复用上次读取结果。
- 全部六轮实时 scope、每次新鲜来源读取、来源比较、取消 reason、owner 收尾，以及下一独立操作的完整核验。
- 原 5 秒 scope、15 秒 open、整体 deadline、heap、预算及 controller 串行队列。
- 递归 capture/browserClosure、toolchain、snapshot/history/accounting、Git before → fixed input → after。

外层 scope 可以先响应 timeout；叶函数收敛已派发项的要求不表示外层 scope 一定等待全部 I/O 后才失败。

## 文件范围

| 文件 | 允许变更 |
| --- | --- |
| `probes/transfer/validation-case-seven-source.ts` | 固定 4 路平面叶函数、窄导出及原循环接线 |
| `tests/transfer/validation-case-seven-source.test.ts` | 受控重叠、失败顺序、收敛、取消和 fresh-call 测试；保留原真实 closure 测试 |
| `tests/transfer/validation-case-seven-source.fixture.mjs` | 必要时新增隔离读取 gate，只替换 source 模块的读取依赖 |
| 本任务卡与计划 | 记录批准、实施、检查、独审证据和限制 |

既有 source/compiled、C14、scope/owner 代表原则上只运行，不改共享 fixture。作者不改 main、共享 tracking、GitHub、COS93 诊断、原账本、游戏或原始证据；唯一 merger 集成独审批准的确切 SHA。

## 免费验收

1. 在真实生产算法上用 gate 控制至少两组读取，证明释放第一组之前只启动原索引前 4 项、峰值为 4；下一组不提前启动。下一独立调用重新读取全部条目。
2. 较后索引先拒绝、较早索引后拒绝时，结果仍为原索引最早 reason。失败出口前当前组全部已观察，下一组零派发，无 unhandled rejection。
3. 预先取消、读取中取消、取消后迟到拒绝三类均停止后续组；按原索引传播已派发项错误，无读取错误时保留原 abort reason。取消后的下一独立调用使用新 signal 并重新读文件。
4. 保留真实 browser/tool/template 字节变化、source/compiled 两路拒绝及恢复成功；C14 closure/receipt 摘要与 scope timeout/abort reason/owner 收尾选必要代表复验。未变证据按实际 diff 复用。
5. 受影响 typecheck/build/strict、严格 UTF-8/中文回读及 `git diff --check` 通过；独立 reviewer 先审实际规格差异，再审代码质量。
6. 一次只读组件 A/B：同 Node 进程，对 v3 TEMP admission 的真实 201 项 execution receipt 执行 serial A → 固定 4 路生产叶函数 B。记录有序路径/hash/结果一致的标量证明、次数、总字节、峰值、Node 版本和确切源码 SHA，不保留 Promise、Buffer 或完整状态。新小 TEMP 保存脚本和标量结果，不改变原输入。

A → B 存在热缓存及顺序偏差，耗时不设通过阈值。旧 receipt 的完整 closure 与新实现不同，因此只测平面叶核验，不能直接调用新完整 guard 声称等价。组件结果不代替完整 source/guard/15 秒实测；不创建 controller、715 请求 seed、浏览器或 provider 请求。

## 运行与交付边界

本卡只授权免费源码、隔离合成 fixture 和上述一次只读组件 A/B，无第四次 actual 或任何付费运行。原 C14 failed/consumed、v1/v2/v3 raw 与后核保持；真实账本仍 revision3114、715 请求、16901000µ，reserved/unknown 为 0。共享验证 ¥150（含 prior probes 保守预留 ¥0.721771）、正式生成 ¥200/12h、优化目标 ¥100/6h 保持。

原参考游戏安装只读。COS93 完整启动、COS16/COS18、accepted、完整经典与 human 仍待完成，本卡的源码通过不提升这些结论。
