# COS-93 真实历史负载下的原生浏览器启动诊断

最新状态：navigation-v1 diagnostic-completed / navigation-failed；旧whole-open15 startup-failed，issue #94保持open、integration partial。实际结果与后核见本卡末节；单次launcher已消费。

此前v3状态：source-reviewed / diagnostic-completed / startup-failed；issue #94保持open、integration partial。v3在 `84f9c8857908d9db7ecbc404c6d5afbdfdc32542` 上983679ms、exit0，无OOM，完整trace/before/final已保存；原15秒open在浏览器ticket前的binding校验中失败。独立后核无关联活进程、原466文件/61目录零变，Root已解冻；不等于浏览器启动通过，无第四次actual授权。v1的5秒scope失败与v2的15秒launch失败、后续OOM及证据缺口保留。原计划 `40dd033a6d01335edac24e7b55edaa35ca8d9747` 已独审PLAN_APPROVED、无finding，[公开计划批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6181879964)保持。Issue [#94](https://github.com/lrfluobida/Cosmos/issues/94)，id5857873638，父 #1，登记时原生子项计数93；依赖 COS52/COS56/COS91/COS92。任务来源为 Root 的私有 `cos93-issue-body.md` 与 `cos93-published.json`，位于 `E:/develop/Cosmos/.cosmos/reconciliation/2026-10-13-c6-provider-usage/`。

专职作者 `cos93_implementer`，独立 reviewer `cos93_reviewer`，唯一 merger `batch_c14_cos92_merger`。分支 `codex/cos93-native-startup-diagnostic`，managed worktree `E:/CodexData/.codex/worktrees/cos76-transfer-case8/Cosmos`；从指定主线 `61d13817ca871d2be04576b4d6fb51fa8a86b541` 建立，旧 COS92 工作树干净且 HEAD 是该主线祖先。首阶段只提交本卡和[实施计划](../plans/2026-10-15-cos93-native-startup-diagnostic.md)；随后v1未达浏览器阶段，fixture结果记录修正已独审集成。作者不改 main、共享 tracking 或 GitHub。

观测器修正分支为 `codex/cos93-bounded-observer`，沿用该managed worktree，从固定 `5e6847ba465b863367e476aa84f4fcaa276d3301` 新建；旧0b475已合入且旧分支/ignored证据保留。该轮先提交计划及记录，独审后再改fixture/test，生产src不在范围。当前v3证据文档分支为 `codex/cos93-v3-evidence`，从84f9c885新建，仅改本卡及新研究记录。

观测器修正已实现无调用记录的方法包装、有界标量trace、quote/claim之前的before清单及单句柄阶段进度；原module入口和全部实际guard保持。短检查覆盖引用回收、原Promise/错误、descriptor恢复、PID事件调用方、上限/I/O失败、异常退出证据，具体结果见[有界观测计划](../plans/2026-10-15-cos93-bounded-observer.md)。计划fb0f341已独审PLAN_APPROVED，源码复审及集成已完成，不提升真实启动或完整任务结论。

`f0eb58f1009c3c9ce590919e082bcaecf590da78` 独审提出pending Promise额外保留operation闭包的P2，作者已将settlement handlers移到独立作用域、无row分支不再安装回调。3个1KiB pending对照RED→GREEN及受影响检查4/4通过，三文件strict退出0；旧12/12等无变化证据复用，详情见[计划P2记录](../plans/2026-10-15-cos93-bounded-observer.md)。修正 `40b9a310cc15deab962b92d805e0ed1edc1bacd3` 已独审APPROVED，唯一merger合入 `c39819036464495353bedd72ba7d46891013527f`，[源码批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6187110787)已公开；Root随后另行批准单次v3。

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

## v3完整诊断与原15秒启动失败

执行源码及历史宿主均为84f9c885；[单次启动](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6187320821)后983679ms、parent exit0，无OOM、外guard触发或kill。3994 spans／5024 events、1117950字节累计序列化计数、0 dropped；8行阶段进度2460字节，before与最终trace/preservation/result齐全。`#2869 lifecycle.open`在14998.7753ms抛ticket超时；其子`#2870 consumer.verifyBinding`迟到31908.9892ms返回，超时发生于第4个scope `#2946`的source `#2948`。六scope均低于5秒，超时前controller实际排队仅0.0262–0.0727ms；同轮open前完整binding已各耗时25.418／25.129秒。没有浏览器ticket、OS spawn、CDP或identity。

fixture正常finally/drain/controller关闭有证据；raw `processesExited=false`保留。独审UTC08:18:06 `POSTCHECK_NO_LIVE_RESIDUE`核到delivery10532/helper17812 exit0、端口64624/65221与20个owner/recovery锁无，12个同号PID为后建复用；原466文件／61目录与真实ledger3114／715／16901000µ保持。profile只有36字节.owner和空子目录，无DevToolsActivePort，未删除或恢复；浏览器正常exit不成立。

[v3研究记录](../research/2026-10-15-cos93-v3-native-startup-diagnostic.md)保存exact SHA、launcher hash、raw及344文件／201目录／41769581字节的选择范围副本路径、超时后重叠与证据限制；[公开结果及后核](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6187833755)已由Root精确读回。首段21步均skipped，下一步仅评估完整来源校验内部的有界并发，未实施或证明15秒通过，无第四次actual授权。COS93继续open/partial/startup-failed；本次只更新文档，全部已有测试和实际后核证据复用。

## 退出观测修正：按原ChildProcess的close记录判定退出（待源码独审）

v3的2503条spawn记录均收到原ChildProcess的close/exit0，但裸PID存活查询把12个已复用号码误当成原进程仍活着，raw processesExited=false保留。[退出观测短计划](../plans/2026-10-15-cos93-process-exit-observation.md)从已发布 `194e23d789bdc3a3b43773fad7b1c14ecdd8fd2d` 建立 `codex/cos93-process-exit-observation`；计划30f7c402已独审PLAN_APPROVED、[公开批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6188476349)，现已完成helper/fixture/test最小修正，待源码独审。

修正以每条已有close标志判断原进程退出，同号PID不去重、不查询当前其他代际来否定原close；原listener、独立OS/current-tree/ports/owner/profile后核及全部browser身份、登记、15秒与drain成功gate保持。受控RED为2fail，GREEN为2/2、0skip、222.4616ms，三文件strict退出0；只用process.pid数值和模拟PID状态，无真实spawn/OS查询/kill，raw路径见计划。原v1/v2/v3证据不改；该P3与binding校验性能方向独立，不证明startup通过，COS93仍open/partial/startup-failed，无第四次actual或付费授权。

## 新阶段：native-validation-waits/1导航诊断（NAVIGATION_DIAGNOSTIC_SOURCE_READY）

COS93导航计划`b00dfb344beff37ac3032512289695c7d6fc6b34`的[公开批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6191465264)保持。作者`cos93_navigation_implementer`最终`dcea6d172020723c5ac880a8f5ee01a1830b2906`经`cos93_navigation_reviewer`整卡规格→质量及P2 affected复审APPROVED，无剩余finding；唯一merger `batch_c14_cos92_merger`合入`4459973868e16c1bc4f3299501a1b0f0c78b8143`，[公开源码批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6197582990)已由Root精确读回。子阶段标记`NAVIGATION_DIAGNOSTIC_SOURCE_READY`；SOURCE97生产前置已满足，observer/src/probes保持不变。主线三诊断文件strict退出0，production lifecycle/真实false诊断预定stop正例/额外失败拒绝3/3、0skip，5047.3798ms。原helper10/10、wired13/13及SOURCE97矩阵与typecheck/build按无delta范围复用，计数不相加。生产游戏failed/reportValid:false不提升；诊断独立验证实际停止对象、durable raw与完整清理/保全。仅源码与免费夹具完成，新actual未运行、未授权launcher或paid；COS93仍open/partial/旧whole-open15 startup-failed，v1/v2/v3、C14、ledger和human保持。

[导航计划及作者证据](../plans/2026-10-15-cos93-native-navigation-diagnostic.md)保留v1默认与原8段/220步；新mode接线已审，真实load、只读JS/engine ready及生产finishNavigation之后的精确clone/steps stop仅在合成transport中验证，零玩法输入；null/404/foreign-origin保留原runner失败，单一idle不代表媒体通过。实际导航、exact浏览器身份和实际清理仍须后续获批单次诊断证明。

主线命令：`node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck tests/transfer/native-startup-diagnostic.test.ts tests/transfer/native-startup-diagnostic.fixture.ts tests/transfer/native-startup-observer.fixture.ts`；确认actual环境选择变量未设置后运行 `node --experimental-strip-types --experimental-test-module-mocks --test --test-name-pattern='^COS93 navigation diagnostic planned stop|^COS93 navigation diagnostic production lifecycle reaches ready then finish before ordinary stop$' tests/transfer/native-startup-diagnostic.test.ts`。原始输出：`C:/Users/26557/AppData/Local/Temp/cos93-navigation-merge-strict.log`（STRICT_EXIT=0）、`C:/Users/26557/AppData/Local/Temp/cos93-navigation-merge-focused.tap`（3/3、0skip、5047.3798ms）。两个诊断文件及计划与批准提交字节完全一致；没有重跑715历史、真实浏览器、provider或付费，新launcher尚未授权。

## navigation-v1实际完成与就绪失败

在已审主线`e2358cd59a6313e049605cd652912d326745d414`上完成单次免费navigation-v1：951026ms、Node exit0/TAP1/1只表示diagnostic_completed；新navigation failed，首因`Diagnostic game engine is not ready`。prepare/register/transport为24575.6104/26057.0091/59.6950ms；open50719.3786ms、goto192051.1234ms已返回，ready单次175.8436ms即拒绝，navigation192228.9083ms failed，旧15秒保持超界。首段21步skipped、无planned stop；HTTP8/8 settled、6rejected、仅2body，后续27条404不能倒推原文件缺失。视频1000ms超时、browser forced/exit1，正常close未证明。独立POSTCHECK_NO_LIVE_RESIDUE、原467文件/61目录零变，ledger3114/715/16901000µ和费用0保持；658文件/297目录/69703280B仅为选择归档，Root已解冻。详见[研究记录](../research/2026-10-16-cos93-navigation-v1.md)及Root精确读回的[公开结果](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6198276862)。launcher已消费，无新actual/paid授权；COS93保持open/partial，旧C14/whole15/accepted/human保持。
