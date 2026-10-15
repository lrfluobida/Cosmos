# COS93 有界诊断观测 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除实际诊断计时包装的调用历史强引用，并让fatal之前已经落盘的保护清单和阶段进度可供独立后核。

**Architecture:** 实际路径使用不保存调用对象的手工方法包装，只记录有界标量；保留原runner module mock接缝。保护清单在危险阶段前一次发布，阶段进度使用一个只追加的文件句柄，细粒度trace留在受限内存中。生产controller、guard和浏览器执行路径保持原契约。

**Tech Stack:** 现有TypeScript、Node22、node:test、文件句柄及AsyncLocalStorage；无新依赖。

---

## 状态、事实与文件边界

基线 `5e6847ba465b863367e476aa84f4fcaa276d3301`，包含已审COS93 P2 `0b475c1fe2918af5e6b61594f29d3060da766078`、COS94及COS95。已轻核旧工作树干净且0b475为基线祖先，在原managed worktree新建 `codex/cos93-bounded-observer`；旧分支和ignored证据保留，无reset。专职作者 `cos93_implementer`，独审 `cos93_reviewer`，唯一merger由Root指派。

本次先提交本计划、[任务卡](../specs/cos93-native-startup-diagnostic.md)当前状态和[研究记录](../research/2026-10-15-cos93-observer-retention.md)，待计划独审；此阶段不改fixture/test/source。后续实施文件：

| 文件 | 责任 |
| --- | --- |
| `tests/transfer/native-startup-observer.fixture.ts`（新） | 仅依赖Node内建模块的计时包装、逆序恢复、有界标量trace和阶段进度；不导入生产host，以保持module mock安装顺序。 |
| `tests/transfer/native-startup-diagnostic.fixture.ts` | 将实际路径method mock换成上述包装；去掉原args/函数闭包记录；在固定新TEMP输出根提前发布保护清单并记录阶段进度。 |
| `tests/transfer/native-startup-diagnostic.test.ts` | 复用短transport测试，补保留链、原Promise/error/descriptor和有界写入契约；只保留短测试里的模拟method mock。 |
| 本计划、任务卡、研究记录 | exact SHA、短测试和raw路径、未完成范围。 |

v2实际执行过15秒launch且失败，随后约4GB堆OOM，parent exit1/worker exit134，外guard无触发、无kill。缺最终trace/preservation/result，正常drain未证实。独审 `POSTCHECK_NO_LIVE_RESIDUE` 只证明检查时无关联活进程；238文件/61目录的比较仅依赖v1基线，不能升级为v2完整前后保全。v2 TEMP owner/profile按原样保留，不恢复、删锁或kill。

已证实 `mock.method(serial)` 的调用记录持有每次返回Promise及完整snapshot；8个真实小read全部被保留，清除calls后归零。手工包装对照在原controller.pending中只剩最后1份，stop后归零。该链可解释OOM风险，未量化实际OOM占比，不能推断v1的1.54秒长尾属于GC。

选择手工包装。周期性 `mock.resetCalls()` 仍在每次调用记录真实参数/结果，并依赖清除时机；本任务不采用这种做法。

## Task 1: 无调用历史的实际方法包装

- [ ] 将已有8-read保留链RED和真实controller手工GREEN迁成最小测试，单次只用8个小snapshot。使用 `--expose-gc` 和跨job GC检查，不改变heap limit；复用已获得的证据，不制造GB压力或715历史。
- [ ] 保存原own descriptor与原函数。自有方法用原descriptor属性安装wrapper；继承方法只在本实例建立可配置override，恢复时删除该override。恢复列表按安装逆序处理，仅存每个安装目标/原descriptor一次，绝不按调用保存对象。安装失败回滚已装项并传播；异常路径也恢复，恢复失败留明确诊断失败。
- [ ] 纯计时wrapper保持同步返回/同步throw，调用 `Reflect.apply(original, this, args)` 恰一次；原函数返回Promise时返回同一Promise，附加只记录状态/耗时的观察，不存Promise或结果。原Error保持同一对象；观察回调不能替换原失败。controller/OwnerLock队列和执行区间继续嵌套，原callback的this、参数及执行顺序保持。
- [ ] CDP对象、session和现有newPage sentinel的装饰仍按原顺序await原方法，安装失败向调用者传播。该装饰层不承诺原Promise对象身份，保持原已审的完成/失败语义；不把安装移入无人等待的 `.then` 后继续执行玩法。literal open返回、route setup与sentinel各自计时，原身份检查和原8段series保持。
- [ ] actual路径不再使用 `t.mock.method`：覆盖serial、OwnerLock.acquire/save、controller child methods、spawn、CDP/session/route/newPage。spawn仅记录PID/命令名/时间/退出码，包装立即返回原ChildProcess，记录与恢复列表不保存ChildProcess/options/env。controller.done只记taskId/windowId/ticket/PID等必要标量，去掉args和checkLaunch闭包。
- [ ] 保留既有 `mock.module` 的runner接缝，不扩大范围。Node22内建实现将普通namedExports存入module context，不经MockFunctionContext的函数代理；补一个短测试验证普通导出调用没有自动calls记录，并保持原函数实际调用和错误传递。短测试中模拟OS/CDP的method mock不属于实际诊断路径。

## Task 2: 有界标量与fatal前证据

- [ ] trace只收字符串/数字/布尔/null字段，复杂输入不作JSON展开、不保留引用。事件按已知字段投影；错误只留截断name/message。上限固定为8192 spans、16384 events、8MiB累计序列化数据，单字符串至多2048字符；记录实际计数、字节估算和丢弃数。不能把序列化预算当实际heap测量。
- [ ] 超限、非标量输入或观测I/O失败置 `observer.incomplete` 和首个标量原因，停止接收相应数据；不吞掉原错误、不改变原guard结果。最终诊断不能因业务路径通过而越过该失败标志。已挂起span只留标量ID/时钟，不能保存operation、arguments、Promise或Error对象。
- [ ] 在完整原输入清单已收集、开始新的quote/claim及35行合成记账之前，以现有安全路径和CreateNew/write-once机制发布 `protected-before.json`，只含路径、SHA、大小、纳秒mtime、目录清单及版本/计数，最多2MiB。发布失败在活动controller创建前拒绝。最终preservation仍须独立比较；before清单本身不证明原文件保持。
- [ ] 新 `progress.ndjson` 只在当前 `mkdtemp` 根以 `wx` 打开一次，最多64条、每条2048字节、总计128KiB；行内容限定phase、UTC、monotonic、计数及 `process.memoryUsage()` 的数字。只在准备/host.verify/nativeIO/open/cleanup边界追加，禁止对每个scope、spawn或细粒度span打开/关闭文件。
- [ ] 仅在fixture明确的准备检查点和正常收尾flush；host.verify/nativeIO/open等方法入口只排入有界写队列，不额外await文件写入。方法计时从原调用入口开始，包含同步记录开销；另记入队和flush耗时，不从整轮耗时减去。保留原15秒外层计时并说明后台写入也可能影响实测。正常finally等待有界队列并关闭句柄；fatal只能使用已经写出的完整行，尾行不完整或缺结束标记都记为证据不完整，不推断cleanup成功。
- [ ] 固定文件名只来自fixture当前新TEMP根，复用safePath/独立文件及CreateNew检查，不开放环境变量选择输出或覆盖旧文件。原v1/v2 raw、launcher、Root intent、owner/profile和输出均不写。

## Task 3: 最少短回归与独审交付

- [ ] RED→GREEN仅覆盖：8次真实小read引用不逃逸；同步返回/throw及async Promise/原error；自有/继承descriptor恢复和安装失败；module接缝不记调用历史；原literal open/route/sentinel顺序。
- [ ] 用新小TEMP覆盖：before清单在危险回调前存在且不可覆盖；原根/外部路径拒绝；进度一次open、有界队列/条数/字节；超限和写失败不能变成完整诊断；模拟异常终止后仅宣称已有完整阶段行，不宣称finally。错误注入不使用真实账本、provider或浏览器。
- [ ] 按新代码差异做strict、UTF-8/中文回读与diff check。已通过的COS93/COS95生产回归及原短transport证据按无变化范围复用；不再跑715 seed、真实浏览器或actual。若需要新的真实样本，必须另由Root独审并授权，本计划不授予第三次actual。
- [ ] 作者提交exact SHA、测试数量/时间和raw路径，交 `cos93_reviewer` 规格→质量独审；唯一merger集成。COS93保持open/partial，不能把观测器修复或无活进程后核记为15秒目标通过。

计划实施后的短命令（当前未运行新测试）：

```powershell
node --experimental-strip-types --experimental-test-module-mocks --expose-gc --test --test-name-pattern='COS93 observer|COS93 diagnostic stop|COS93 timing|COS93 fixture preserves returned' tests/transfer/native-startup-diagnostic.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --skipLibCheck tests/transfer/native-startup-observer.fixture.ts tests/transfer/native-startup-diagnostic.fixture.ts tests/transfer/native-startup-diagnostic.test.ts
git diff --check
```

无生产src修改、无新依赖/框架、无heap扩大。原5秒scope、15秒open、45分钟外guard、原run deadline、共享¥150/phase¥30/正式¥200与12h保持。Root负责公开结果、PROGRESS和共享映射，作者不改这些文件。

## 作者实现与短验证（待源码独审）

计划 `fb0f341779ff8afd04a77cecb887e5381f02438a` 已获 `cos93_reviewer` 的独立 `PLAN_APPROVED`，无finding。实施范围为表列三个test/fixture文件及本轮自有文档；src和共享tracking无改动。

actual路径已移除所有method mock。手工包装逆序恢复descriptor，继承方法删除实例override；纯计时返回原Promise，CDP/session/sentinel保留已审await及错误传播顺序。controller.done改为pid/taskId/windowId/ticket标量，成功判据同步改用pid；短的真实lifecycle/controller+模拟OS/CDP集成已验证正确PID在CDP前登记可以通过该判据，错误PID或缺记录拒绝。

before清单在quote/claim/open之前发布；进度仅在当前新TEMP打开一次，以阶段行写入，enqueue耗时为单独标量，flush耗时为单独span；未把观测开销从总耗时减去。trace和进度按计划上限处理，非标量、超限、安装/恢复或I/O失败均保留incomplete；即使输入声称startupPassed，也不能覆盖观测失败。没有通过增大heap解决保留链。

| 验证 | 实际结果 | raw路径（均为`C:/Users/26557/AppData/Local/Temp/`下） |
| --- | --- | --- |
| helper契约RED | 4fail/0skip，缺新API，exit1 | `cos93-bounded-observer-red.tap` |
| helper GREEN | 4/4、0skip，449.4061ms | `cos93-bounded-observer-helper-green.tap` |
| I/O失败分类RED | 已发生写失败仍被分类passed，1fail/0skip，exit1 | `cos93-observer-io-red.tap` |
| 组合短集 | 12/12、0skip，5530.9061ms | `cos93-bounded-observer-final.tap` |
| 最终进度/异常退出补充 | 4/4、0skip，4161.9274ms；小子进程exit23后before与已写阶段行可读，无final result/cleanup成功声明 | `cos93-observer-progress-final.tap` |
| 实际queue/execute包装的8-read引用检查 | 1/1、0skip，466.317ms；仅正常pending最多1份，stop后0，descriptor恢复 | `cos93-observer-queue-retention.tap` |
| 字符串/中文及Error保留补充 | 1/1、0skip，243.7251ms；2048字符上限，原Error及原3000字符消息不改 | `cos93-observer-string-bound.tap` |
| 最终三文件strict | exit0；命令同上 | `cos93-bounded-observer-final-strict.log` |

上述检查分属不同提交前差异，数量不相加成一次完整suite。原无变化生产typecheck/build和COS93/COS95证据复用。新fixture未在真实715历史或浏览器上执行；原v1/v2数据、launcher、intent、owner/profile均未修改，第三次actual未获本轮授权。作者提交具体diff后交独审；COS93继续open/partial。

### 独审P2：pending Promise的闭包保留

`f0eb58f1009c3c9ce590919e082bcaecf590da78` 的源码独审发现：settlement回调与operation共享词法作用域，pending Promise因此额外持有operation/payload；span超限、没有row时也挂了回调。最小修正将handlers放入独立作用域，只接收row和初始字节数；无row直接调用原operation，保持恰一次调用及原返回/throw/Promise身份。

固化reviewer的3个pending Promise对照，每个payload仅1KiB，三个原Promise始终留有引用。RED得到direct `[false,false]`、正常及超限span `[true,true]`；GREEN三组均为 `[false,false]`，超限Promise的then调用次数为0。只复验该回归及原身份/错误、嵌套/open边界、标量上限，共4/4、0skip、258.228ms；三文件strict退出0。其余上述证据复用，未重复完整短集或actual。

- RED：`C:/Users/26557/AppData/Local/Temp/cos93-pending-observer-red.tap`，1fail/0skip、279.7756ms。
- GREEN：`C:/Users/26557/AppData/Local/Temp/cos93-pending-observer-green.tap`。
- strict：`C:/Users/26557/AppData/Local/Temp/cos93-pending-observer-strict.log`。

GREEN命令为上面同一Node flags与test文件，选择 `--test-name-pattern='COS93 observer pending and over-limit|COS93 observer preserves this|COS93 observer bounds scalar|COS93 timing preserves'`；RED仅选择第一个名字前缀。本次修正待独立复审，不提升任何真实启动结论。
