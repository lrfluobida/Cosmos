# COS93 v2：启动超时、OOM与观测器保留链

日期：2026-10-15。v2在已审COS95与COS93 P2组合后的 `5e6847ba465b863367e476aa84f4fcaa276d3301` 上实际运行。[公开结果及后核](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6183943925)已由Root精确读回。记录保留第一次诊断的失败含义，当前COS93仍open/partial。后续工作先按[有界观测计划](../plans/2026-10-15-cos93-bounded-observer.md)独审，不进行第三次actual。

## v2实际失败

已审launcher SHA-256 `a486eb30187c2b0bf613d95690d1a9072d8eb2816cbe5005a1029bcab44994cd`；执行源码和历史宿主main均为上述5e6847ba，原C14游戏生成版本仍为 `b20e9a43f26712a1f5a13468057df46b6c012b69`。

| 事实 | 原记录 |
| --- | --- |
| UTC起止 | 2026-10-15 02:55:12.159—03:12:48.595 |
| 外层耗时／退出 | 1056412ms，parent PID30448 exit1；worker PID16184 exit134 |
| 外guard | 未触发，未请求kill；45分钟限制保持 |
| 首段浏览器报告 | 03:09:26.180—03:09:41.182，failed；`Persistent browser launch: timed out after 15000 ms` |
| 浏览器身份／退出 | browserPid=null、processExited=null、session缺失；没有成功的PID/CDP/profile/退出证明 |
| 聚合报告 | failed，`complete owned process exit/profile identity is unproven` |
| 后续fatal | 约4GB堆OOM；native stack包含ValueDeserializer::ReadValue/structuredClone |
| 顶层final输出 | prepared.json存在；trace.json、preservation.json、result.json缺失 |

首段错误中的video/termination文字不能单独证明OS进程曾被强杀；其cleanup.forced为false且PID为空。实际15秒launch失败必须保留，但缺少完整分段trace，不能据此量化某个生产guard的开销或宣称正常drain完成。

Root转达 `cos93_reviewer` 的 **POSTCHECK_NO_LIVE_RESIDUE**，随后解除main/worktree冻结。该结论证明检查时无关联活进程，58782/59323端口无TCP项，不补造正常退出或finally证据。真实账本仍revision3114、715请求、共享16901000µ、reserved/unknown为0；238文件/61目录只按v1基线比对，不是v2完整before/after保全。v2 TEMP中的owner/profile原样保留，没有删锁、恢复或kill。

## 受控小复现：自动调用记录保留完整结果

Node v22.22.2内置 `internal/test_runner/mock/mock` 的 `#setupMock` 在每次调用结束时，把arguments、result、this和stack存入 `MockFunctionContext.#calls`（运行时源码770–779行）。`restore()`仅恢复方法descriptor，`resetCalls()`才清除调用记录。

实际fixture用 `t.mock.method(RunController.prototype, 'serial', ...)` 包装每次串行操作；其返回Promise完成为完整snapshot。即使应用trace只记耗时，node:test仍通过 `calls → result Promise → snapshot` 保留每份复制结果。

小复现只创建新TEMP账本，8次真实read，所有snapshot序列化合计6472字节：

| 检查 | 结果 |
| --- | --- |
| mock calls／不同完整snapshot | 8／8 |
| GC后仍活着的snapshot | 8 |
| 恢复方法并stop后 | calls仍8，snapshot仍8 |
| resetCalls再GC后 | calls0，snapshot0 |
| probe末次heapUsed | 10033568字节，无heap limit调整 |

一次极小Node子进程另证明spawn mock的 `call.result` 是实际ChildProcess，`call.arguments[2]`及其env仍是原对象。没有把这些对象内容打印或当trace保存；这说明method mock会额外保留它们。

这是已证实的按调用次数增长的强引用链。v2缺heap dump和最终trace，因此不能量化它占4GB的比例，也不能将v1的1539.609ms controller长尾判为GC。两轮时间均包含该包装，不能直接用于判定无包装生产路径的内存或性能表现。

## 手工包装对照与证据

只计时的手工wrapper通过Reflect.apply调用原函数，纯计时层返回原Promise，记录仅含名称、时钟和状态。小测试证明原this/参数、同步throw、异步reject的Error及Promise对象身份保持。真实controller再做8次read，GC后仅原controller.pending保留最后1份，stop后0份；9行标量占929字节，末次heapUsed9535608字节，原descriptor已恢复。两个小账本owner锁均已关闭。

`mock.module`与method mock不同：Node的MockModuleContext只保存普通namedExports，不将其函数包装为MockFunctionContext调用代理；该只读实现检查支持保留现有runner接缝，后续仍须补短契约测试。

- 小复现目录：`C:/Users/26557/AppData/Local/Temp/cos93-mock-retention-fb47b55a476440479fd6b4a9dfcbccd4`。`probe.mjs` SHA-256 `77a6c0403782799b47e464097e1156b8c5b0d69192af22e6077b8d154e5b298f`，`red.log`为预期断言8≠0、exit1，`result.json`保存标量证据。
- 对照：同目录 `manual-real.mjs` SHA-256 `6519928774e1f04ad2a94f3742df956ae5b939c5b6cabd4daba327e89e34aadc`，`manual-green.log` exit0，`manual-result.json`保存真实controller对照。仅 `--expose-gc`，无扩大heap、无大历史/provider/browser。
- v2原TEMP：`C:/Users/26557/AppData/Local/Temp/cos93-native-startup-2qpwoG`。浏览器报告在其 `repository/.cosmos/e2e/cos20-transfer-validation-14/browser-evidence/` 下；专用profile为 `C:/Users/26557/AppData/Local/Temp/cosmos-browser-vWjBZf`，保留原样。
- v2 launcher、Root intent、launch intent、stdout/stderr及result在 `E:/develop/Cosmos/.cosmos/reconciliation/2026-10-13-c6-provider-usage/`，文件名含 `cos93-native-startup-...-v2`，均保持原记录。没有向缺失的final文件补写推测结果。
- 稳定的选择范围崩溃副本：上述reconciliation目录下 `cos93-v2-crash-preserved`，337文件、201目录、38976394字节；范围为prepared、完整TEMP ledger/current case及profile，不含Git/tracked checkout。相邻 `cos93-v2-crash-preservation.json`记录源目标hash、原source纳秒mtime/dev/ino、空目录和三个最终文件缺失；这是后置崩溃副本，不是完整v2 before/after保全。原TEMP/profile/owner锁未移动或修改。

下一步仅修观测器：actual路径去method调用记录、去args/函数引用，有界标量trace，危险阶段前一次写保护清单，并只在阶段边界写有界进度。原5秒/15秒/45分钟、heap、预算和真实guard保持；进度文件不能冒充cleanup证明。

## 有界观测实现待独审

计划fb0f341已独审批准。作者已把actual method mock替换为手工descriptor包装，scope/queue观测只存标量；before清单在quote/claim前写一次，阶段进度有64行/128KiB上限，细粒度trace有数量和8MiB序列化预算。observer安装/恢复、上限或I/O错误会阻止完整诊断分类；PID登记事件及其调用方已一起改用标量pid。

短集12/12及后续受影响进度、queue引用、字符串检查通过；真实controller8次读取在正常pending中最多留最后1份，stop后归零。小子进程显式exit23后仅留下已写before/阶段行，没有final或cleanup成功声明。三文件strict退出0，原始命令与独立raw路径见计划。未重造715历史、未运行真实浏览器或第三次actual；v1/v2原始记录及其证据局限保持。

源码独审另在 `f0eb58f1009c3c9ce590919e082bcaecf590da78` 发现pending Promise的P2：span内部settlement回调共享operation的词法作用域；没有row的超限分支仍安装回调。3个始终pending且保持引用的原Promise、各1KiB payload的小回归证明：直接调用后payload/operation均回收，原正常与超限span均额外保留两者。这是此前已settle的8-read检查没有覆盖的情形。

修正仅将handlers移到不含operation/args的独立作用域，并在无row时直接执行原调用。GREEN中三组payload/operation均回收，超限分支没有then调用，Promise身份保持。受影响4项检查全过、strict退出0；RED/GREEN原始路径和命令见计划的P2节，其余证据复用。本次仍未测真实历史，不能把这条保留链换算为v2的OOM占比或推断v1长尾属于GC。
