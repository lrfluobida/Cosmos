# COS-93 真实历史负载下的原生浏览器启动诊断

状态：source-reviewed / actual-incomplete；诊断实现已独审合入，issue #94保持open、integration partial。v1在浏览器前5秒scope失败；v2在 `5e6847ba465b863367e476aa84f4fcaa276d3301` 上实际15秒launch失败，之后约4GB堆OOM，缺最终trace/preservation/result，正常drain未证实。现准备[有界观测短计划](../plans/2026-10-15-cos93-bounded-observer.md)，尚未实施或授权第三次actual。原计划 `40dd033a6d01335edac24e7b55edaa35ca8d9747` 经 `cos93_reviewer` 独审 `PLAN_APPROVED`，无finding；[公开计划批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6181879964)。Issue [#94](https://github.com/lrfluobida/Cosmos/issues/94)，id5857873638，父 #1，登记时原生子项计数93；依赖 COS52/COS56/COS91/COS92。任务来源为 Root 的私有 `cos93-issue-body.md` 与 `cos93-published.json`，位于 `E:/develop/Cosmos/.cosmos/reconciliation/2026-10-13-c6-provider-usage/`。

专职作者 `cos93_implementer`，独立 reviewer `cos93_reviewer`，唯一 merger `batch_c14_cos92_merger`。分支 `codex/cos93-native-startup-diagnostic`，managed worktree `E:/CodexData/.codex/worktrees/cos76-transfer-case8/Cosmos`；从指定主线 `61d13817ca871d2be04576b4d6fb51fa8a86b541` 建立，旧 COS92 工作树干净且 HEAD 是该主线祖先。首阶段只提交本卡和[实施计划](../plans/2026-10-15-cos93-native-startup-diagnostic.md)；现已完成一次未达浏览器阶段的实际诊断，fixture结果记录修正已独审集成。作者不改 main、共享 tracking 或 GitHub。

当前观测器修正分支为 `codex/cos93-bounded-observer`，沿用该managed worktree，从固定 `5e6847ba465b863367e476aa84f4fcaa276d3301` 新建；旧0b475已合入且旧分支/ignored证据保留。该轮先提交计划及记录，独审后再改fixture/test，生产src不在范围。

## 事实与问题

COS92 作者批准提交 `ffa0ce2918735f5b21b22c4373a390b156e63d33`，合入 `e74815f468b7158b5555ca2e5887ad3459b74dda`。已通过的启动取消、来源变化、exact ticket、drain 及 Edge 回归按[原卡](cos92-browser-launch.md)复用。小夹具的继承 consumer 每次6个 scope 不能证明实际历史负载下15秒内启动。

原 C14 冻结源码 `b20e9a43f26712a1f5a13468057df46b6c012b69`，failed/已消费；新增35次请求、792063µ，closure20 后共享16901000µ、unknown/reserved为0。组剩余1707937µ不授予后继案例：ledger5要求 supplement 的准确 C14 target 和完整 grants，C14不能再次claim。独立封存候选玩法220步/40.827秒已通过，但省略 ownedChild/controller；媒体诊断另行执行，两者本卡均不重跑。

2026-10-15只读解析得到以下实际规模，未启动 controller 或进行计时实验：

| 原始输入 | revision | 字节 | cases / delegations / closures / audits | requests / entries | tasks / events |
| --- | ---: | ---: | --- | --- | --- |
| `snapshot-after-case14-supplement.json` | 2966 | 15,246,901 | 21 / 13 / 105 / 19 | 680 / 680 | 45 / 2968 |
| `snapshot-after-case14-closure.json` | 3114 | 16,635,066 | 22 / 14 / 110 / 20 | 715 / 715 | 46 / 3116 |

两份快照均为ledger5、一个supplement；前者21个案例全停止且C14未claim。后者与当前真实 `.cosmos/validation-shared/snapshot.json` 的以上字段相同。原 `case14-guard-timing.json` 另记录revision3113的独立样本：15个budget来源/398480字节、19个closure来源/11011102字节、173个执行文件、27个依赖文件；这些是旧版本组件样本，当前源码数量及整链时间必须重新记录。

## 最小方案与可信边界

选择“新TEMP活动状态 + 原历史只读来源”。先把revision2966快照及其实际 operator/closure/supplement 回执逐字节复制到全新TEMP账本，完整 `validateSnapshot` 和生产来源校验通过后，通过生产 `prepareValidationCase`、`claimValidationCase`、`openValidationCase` 建立明确标记为COS93 fixture的新测试C14窗口。只有TEMP副本获得新quote/decision/owner；原C14没有重放或新授权。

在TEMP注册真实当前 coding task，通过原 reserve/admit/settle API添加35行合成请求，费用及模型/输出限制元数据取原35行的安全记账字段，不读取会话正文或推理、不建立provider。目标测量负载为22 cases、14 delegations、105 closures、19 audits、715 requests、46 tasks，正好保留运行中尚未closure20的结构；记录最终实际revision、events、文件字节和与原运行的差异，不能手写活动/预算字段凑数。准备耗时单列，不计入启动15秒。

原closure的 `artifactRoot`、C5 journal的 `artifactRoot/sessionRoot` 及历史manifest绑定绝对原路径。不得重定位、改写回执或补造摘要。原C5七个capture、journal回执、design audit保持只读，使用生产 `createHistoricalPassedStages` 核验实际原根；TEMP目标独立。旧 `withTransferCaseFourteenFixture` 会写固定仓库、mapping并恢复utimes，因此不原样调用。

固定C14 entry/driver要求历史根在同一repository，本夹具不能原样搬迁该包装层。测试准备层组合现有生产函数，显式固定原历史根与新TEMP当前根；逐项执行真实来源、模板/toolchain、历史成本前缀、回执、Git/冻结输入身份及 `requireValidationScope`，不得以空guard替换。当前任务、候选、plan、manifest和新operator receipt按生产API绑定。该差异是夹具限制，不声称验证固定C14 CLI准入。若不能保持这些检查，停止并交独审调整方案，不能缩小历史来得到快结果。

已有C14的10个源码文件/35771字节及已构建候选只作为合成输入；原字节不改。TEMP建立自己的捕获和候选身份，coding review保持pending，不生成accepted/human记录。所有活动store、registry、owner、profile、输出和Git临时引用必须解析到新TEMP；无指向原可写目录的junction、symlink或hardlink。原来源仅按明确清单读取。

另一方案是从零seed全部历史，成本高且重复已有认证证据；直接恢复原C14或改历史绝对路径不满足本任务边界，排除。

## 实际启动路径与计时

消费端必须是生产 `createTransferReusedConsumerHost` 实际生成的 `verifyBinding`，进入同一 `nativeIO.playPersistent` → `createPersistentOwnedChild` → `RunController` → `SnapshotStore`/`OwnerLock` →真实spawn/register → CDP身份→退出/drain。允许最窄地导出现有nativeIO factory用于测试装饰，函数实现和默认接线保持一致，不另写IO副本。当前源码中注入 `input.io` 只选择IO对象；`SnapshotStore.acquire` 的controller owner缺省 `untrackedWriters=false`，`registry.verifyCandidate` 无论IO来源均以true持有registry owner。运行时仍须记录两类实际标记及调用路径，不能把注入回调当成无差异原入口或将标记改成false。

为只启动一次，保留consumer的原series与绑定，在测试专有的 `context.newPage` 接缝于真实CDP身份验证完成、lifecycle返回后抛出明确的 `DiagnosticStartupComplete`。它不改变启动前guard，不取消启动、不修改15秒，也不执行玩法步骤；runner按普通异常进行正常 `Browser.close`，后续segment不运行。整体验收报告预期failed，诊断分别记录“启动是否在原界限内完成”“预定停止点是否到达”“清理是否完成”，不得将该报告转换成游戏通过。只有真实PID登记、CDP/profile身份、15秒内open、正常close和drain均被证实，独立startup结论才为passed；测试停止点必须独审确认可达且发生于身份验证之后。

计时使用单调时钟，记录UTC对应点；透明包装只记录事件并调用原函数，保持参数、返回值、错误和串行顺序。区分nativeIO入口到返回、原15秒 `lifecycle.open` 区间、binding各次调用、identity/source/accounting/history、controller和OwnerLock的排队/执行、意图持久化、spawn/PID登记、CDP连接/身份、正常或强制退出、drain/owner关闭。嵌套区间不能相加当总耗时，准备和组件独立样本不能代替整链；未到达的阶段写null及原因。

Root已批准测试专有的Node `mock.module` 观测方式：在fixture/nativeIO导入前，透明包装runner接收的真实lifecycle，分别包裹原 `open`/`close`，再调用原runner。命令需 `--experimental-test-module-mocks`；不改生产生命周期代码。`open` 的返回点独立记录，后续route setup与newPage另计，不能以停止点时间替代open。此mock与实验旗标均列为相对生产运行的差异。已构建dist复用是合成fixture的准备步骤，不代表本轮正式编译通过。

一个真实样本足以给出本机诊断，不做热身或多次重跑直到通过。失败时记录超时边界、迟到prepare/ticket最终状态、保留的cleanup错误；15秒失败不授权放宽时限、来源守卫或跨操作缓存。先依据实际结果提出最小后续方向交独审。

## 验收与产物

- 最小fixture、入口及说明；缺失私有输入明确失败，不降级成小夹具或计为skip后的通过。无模型调用、provider网络、新依赖或通用框架。
- 原始trace、结果、保护清单和中文研究记录，记录源码exact SHA、依赖/Edge版本、实际输入工作量、原/新根、fixture差异和计时定义。
- 对所有读到的原snapshot/receipt/C5证明/capture/C14候选记录前后SHA-256、大小、纳秒mtime及目录清单。原文件只读，禁止恢复写回或utimes。finally覆盖失败路径；若原文件变化即失败并报告，不掩盖。
- 清理须有ticket/PID、CDP身份、close event、实际退出、OwnedWork drain、controller/owner结束、监听端口/服务和专用profile证据；保留无法证明的部分，不根据Promise结束宣称清理完成。
- 作者提交exact SHA、测试和raw路径，独立reviewer审实际diff与结果，唯一merger集成。诊断完成只表示该免费fixture的结论已查明；C14失败、COS16/COS18、完整经典与human状态保持。真实费用16901000µ与shared¥150/phase¥30/正式¥200/12h保持。

## 首次实际结果（v1）与报告修正

在上述已审执行版、历史宿主main `7df1e5b3b8662a4fa836c466f266f9b80d04d2e8` 上执行一次，外层765169ms、Node exit1，45分钟guard未触发、没有kill。TEMP经真实API完成715请求负载；nativeIO/open/CDP/browser均未到达。原host报告首因 `Validation scope check timed out.`，scope.read span2197为5014.7298ms；bytesMatched=false表示最终成功出口未到达，不能解释为文件不一致。`host.verify`返回的failed evidence原先被fixture丢弃，本轮仅补结果保留、not_reached和failingGate的小契约测试，不重跑实际历史。

`cos93_reviewer`已独立核对原466文件/61目录、真实ledger、进程/端口/owner清理，Root解除冻结。[中文研究记录](../research/2026-10-15-cos93-native-startup-diagnostic.md)保存完整来源、原raw及334文件的选择范围副本；[公开结果](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6182530375)已精确读回。原raw、已消费launcher/intent/log保持。本卡仍未完成，下一独立性能调查复用证据；当前不修改生产guard或启动界限，不授权原共享账本新窗口或第二次actual。

## v2 OOM与有界观测计划

因已审COS95及P2行为有实质变化，Root另行审查v2启动器并执行一次新样本。1056412ms后parent exit1/worker exit134，外guard未触发、无kill；首段报告已记录15000ms启动超时，之后发生OOM。已证实实际method mock的calls保留Promise→完整snapshot；8-read小RED和手工包装GREEN见[研究记录](../research/2026-10-15-cos93-observer-retention.md)。该保留链不能量化OOM占比，也不能据此推断v1长尾为GC。

独立 `POSTCHECK_NO_LIVE_RESIDUE` 后Root解冻，v2 TEMP owner/profile原样保留；238文件/61目录仅与v1基线比较，非完整v2保全，正常drain仍未证实。[公开结果](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6183943925)已精确读回；337文件/201目录的稳定选择范围崩溃副本及限制见研究记录。新[短计划](../plans/2026-10-15-cos93-bounded-observer.md)只处理无调用记录的包装、有界标量和fatal前证据；原5秒/15秒/45分钟、heap、预算及v1/v2全部原始记录保持。COS93继续open，不追加actual授权。

## 诊断实现已审集成

最终 `0b475c1fe2918af5e6b61594f29d3060da766078` 经 `cos93_reviewer` 独立规格→质量 APPROVED，无finding；唯一merger合入 `3d67a50a09a00d98b8fa6d54ee7745337d7e803d`。COS93入口与两测试文件等同批准提交；主线已审COS94 runner及测试保持。typecheck/build退出0，native factory导出与failed evidence分类短检查2/2、0skip，4786.382ms；原6/6、P2 2/2及strict证据复用，命令和主线日志见计划。

本次合入没有第二次actual、浏览器或35行历史重建；执行59dd、历史宿主7df及原游戏b20的区别保持。原C14失败与真实revision3114/共享¥16.901000不变；COS93完整目标、COS16/COS18及human均未完成，main已由Root解冻。
