# Cosmos 产品与执行规范

状态：需求基线 v1.0，2026-10-01。用户已确认正式单次验证硬上限 ¥200/12h，优化目标 ¥100/6h；结构审查与局部真实探针已完成。完整生成是否达标由实施任务验证。

仓库：[lrfluobida/Cosmos](https://github.com/lrfluobida/Cosmos)

已发布：[spec 主 issue #1](https://github.com/lrfluobida/Cosmos/issues/1)，包含 100 个原生子任务；编号与依赖见 [发布映射](github-issues.json)。COS-19 承接原 R4/R5/R12 的角色交接与截断处理，COS-20 区分已有 R6/R7 的正式生成时限与开发验证窗口，COS-21 承接原 R5/R11 的 Windows 产物目录原子发布失败，COS-22 验证更高调用上限下的完整原生生成；COS-23/COS-24 处理真实失败暴露的作者格式交接和已停止案例未用分配额度，COS-25 验证作者只读格式纠正后的完整原生生成。COS-26/COS-27 承接有效容量修复，COS-28/COS-29 承接职责澄清和 case6，COS-30 用主机证据/独立评审处理未决项，COS-31 登记证据驱动的独立 case7 验证，COS-32/COS-33 承接浏览器失败分类/有界修复与独立 case8，COS-34 补最终用户体验决定持久化与版本绑定缺口，COS-35/COS-36 准备共享浏览器host和运行时推箱子设计/可信鼠标计划，COS-37 准备隔离profile/同origin的真实进程重开，COS-38 连接运行时设计与固定角色输入，COS-39 记录持久浏览器失败事实并保守分类，COS-40 接通持久浏览器与生成媒体consumer，COS-41 准备原design会话的有界语义反馈，COS-42 准备原COS16预算组绑定，COS-43 准备固定迁移native入口/准入，COS-44 明确规划policyId契约，COS-45 准备第二迁移案例与剩余额度准入，COS-46 准备设计标识符约束与输出自检，COS-47 准备带自检的第三迁移案例，COS-48 绑定规划局部别名与预声明身份，COS-49 准备主机身份绑定的第四迁移案例，COS-50 明确角色输出/capture读取路径，COS-51 准备带契约的第五迁移案例，COS-52 准备迁移验收与角色host生产运行库，COS-53 保存准备型需求草稿，COS-54/55补输入文件清单与会话内编译自检，COS-56历史通过阶段复用源码已独审集成，COS-57仅编码C6源码已独审集成，COS-58公开CLI准备模式源码已独审集成、human仍NONE，COS-59流式编码请求时限源码已审集成，COS-60第七迁移案例源码已审集成、实际freepreflight因未决费用拒绝；COS-61准备模式首个显式编码追加窗口源码审批保持，COS-62生产交付与试玩source/TEMP回归已审合入并complete/closed，前次单任务探针的缺口判断已撤回；COS-63已完成运行的报告与试玩决定保留源码已独审合入，本卡source/TEMP实现验收complete/closed；COS-64分批素材与完整媒体验收源码已审合入/本卡scoped complete，COS-65独立交付源码已审合入/本卡scoped complete，COS-66存档重开与跨阶段媒体验收源码已审合入/本卡scoped complete，COS-67经典启动与离线政策部分验收源码已审合入/本卡scoped complete，COS-68完整交付清理计时源码已审合入/本卡scoped complete，COS-69真实渲染帧采样源码已审合入/本卡scoped complete；COS-70 PUBLIC_RENDER_FRAME_SELECTION_SOURCE_READY已审合入a56b259/本卡scoped complete，历史安装升级读取P2已闭合；COS-71 MODULAR_CODE_GENERATION_SOURCE_READY已审合入9f4f8e6/本卡scoped complete；COS-72 MODULAR_REPAIR_SUCCESSOR_SOURCE_READY已审合入131f153/本卡scoped complete；新确认来源须绑定原唯一修复机会，旧确认不自动迁移；COS-73 MODULE_HELPER_SCOPE_SOURCE_READY已审合入55a6712/本卡scoped complete，修现有模块范围而不增加 owner 返工授权；原产品范围和预算保持。

## 1. 已确认的产品目标

组合复审补正：B原`39400c6bec4bee4532a1ee5888aaab15e0d5214f`及初合并`ea478f12b260f9ed810b660e03fdddb80aefe42b`保留历史。C新增cleanup证明位于segment之外，B预定stop例外原未校验该字段；真实同row品牌、同source及同步durable raw的missing/deadline+1/rawPending1/video_stop failed四负例RED均错误接受。作者最终`5bc4bb6087ff33fc90f3e91e7184eaeb8e603507`仅export并复用C原`validNativeCleanup`，`cos99_reviewer`affected APPROVED、无finding；C生产校验行为不改。主线最终typecheck/build0，四负例和真实/2正例5/5、0skip，4791.9604ms；作者GREEN5/5和strict0、此前无变化HTTP/C1500ms及其余通过证据复用，不相加重复计数。 最终源码组合为`5bc4bb6087ff33fc90f3e91e7184eaeb8e603507`；三项源码范围complete/closed，closed(completed)及父勾选已由Root核证，完整实际导航另行授权。
设计`1c8610e9fd4b20880fb1cafa016ca9f901e71d81`经`native_readiness_design_reviewer`独立规格/可实施性→质量APPROVED，无finding；Root批准工程设计与后续源码实施，唯一merger `batch_c14_cos92_merger`合入`9940c130ce8de32136b579d79c1dded99db17dda`。ADR0003 accepted；COS98/COS99/COS100源码均经各自reviewer独立APPROVED、无finding，唯一merger按A→C→B合入，组合源码`5bc4bb6087ff33fc90f3e91e7184eaeb8e603507`；15个实现文件等于各批准来源。统一`NATIVE_FIXED_CANDIDATE_READINESS_SOURCE_READY`，三卡source scoped complete/closed，三项issue均closed(completed)、父勾选已由Root核证。主线最终typecheck/build退出0，初组合六文件strict0与最终B affected strict0按批准版本复用，导航/就绪与HTTP/清理两组各3/3、0skip（4177.9503ms、3323.5582ms）；旧99/67及B分组证据复用、不相加。实际browser/导航、715历史、provider、付费未执行；actual仍另行授权。 [设计](native-game-readiness.md)、[ADR0003](../adr/0003-native-fixed-candidate-execution.md)与[计划](../plans/2026-10-16-native-game-readiness.md)对应[COS98 / #99](https://github.com/lrfluobida/Cosmos/issues/99)、[COS99 / #100](https://github.com/lrfluobida/Cosmos/issues/100)、[COS100 / #101](https://github.com/lrfluobida/Cosmos/issues/101)。Task A固定候选HTTP/当前执行权，B在原导航余额内轮询ready，C共享native清理余量。三项均closed(completed)/父勾选[x]，当前100个原生子任务。A/B/C均独立实现与独审，完整`native-validation-waits/2`只有三项组合验证通过后发布；B/C依赖A已审接口，不提前发布半契约。原navigation-v1导航失败、视频1000ms/forced、旧whole15/C14 failed、COS16/COS18/完整经典/human与ledger3114/715/16901000µ及原预算保持。

COS90 / [#91](https://github.com/lrfluobida/Cosmos/issues/91)，id5854823746，计划 `0bd6683fd7ec80405da6ebb143e6c4b05715a6c8` 已独审及[公开批准](https://github.com/lrfluobida/Cosmos/issues/91#issuecomment-6177529514)。作者 `cos90_implementer` 最终 `ca350ea612c924150e9f4501932a5799e4fcfbc4` 经 `cos90_reviewer` 独立规格→质量APPROVED，无finding；唯一 `batch_cos90_91_merger` 合入 `7b676094fc16ddb3012804fdc3c78502f34fd0ab`，标记 `VALIDATION_GROUP_SUPPLEMENT_SOURCE_READY`，source scoped complete/closed；[公开源码批准与关闭](https://github.com/lrfluobida/Cosmos/issues/91#issuecomment-6178073975)、closed(completed)及父勾选已由Root精确读回，发布主线 `d868de09a67f10aa4c2d6c5919e55be543ea0c88`。主线typecheck/build退出0，provider/source/coldrestore/closure与完整phase代表2/2、0skip，2025.8667ms；作者新7项、旧98项及修正后单项、budget3/3与strict证据复用。详见[任务卡](cos90-validation-group-supplement.md)。

COS91 / [#92](https://github.com/lrfluobida/Cosmos/issues/92)，id5855021876，依赖COS88/89/90，计划 `dfe83f13c425a8952e1987adb7043eae37170a3b` 已独审PLAN_APPROVED并[公开批准](https://github.com/lrfluobida/Cosmos/issues/92#issuecomment-6177975415)。作者 `cos91_implementer` 最终 `28e89554b933da9409fac7820a12948cc2159271` 经 `cos91_reviewer` 独立规格→质量APPROVED，无finding；唯一 `batch_cos90_91_merger` 合入 `f67979daf2c46752b67778c7433b4b54f202b7a2`，标记 `TRANSFER_CASE_FOURTEEN_SOURCE_READY`，source scoped complete/closed；[公开源码批准与关闭](https://github.com/lrfluobida/Cosmos/issues/92#issuecomment-6178757721)、closed(completed)及父勾选已由Root精确读回，发布主线 `b28fff1589c649dc412826edfd5d187f02a0471e`。主线typecheck/build退出0，C14 unit6/6及旧C7/C13短代表2/2、0skip；已审SOURCE组合证据与最终compiled/source capture复用，首次SOURCE整体清理失败及其恢复限制保留在[任务卡](cos91-transfer-case14.md)。源码关闭时父#1为91个原生子项。 源码审批证据保留。COS90固定¥1.600314补充分配已在C14前一次实际应用，原parent仍¥10，组有效容量¥11.600314；shared¥150、phase¥30、正式¥200/12h保持。C14已failed并消费，closure20后revision3114、sharedsettled16901000µ、组可分配1707937µ；Root已解除main冻结，实际结果见下述记录。COS16/COS18、完整经典和human仍未完成。

### 当前补充证据：C14媒体字段匹配，整体失败

原候选逐字节一致副本在`61d13817ca871d2be04576b4d6fb51fa8a86b541`上单次独立媒体补测：15/15步骤通过、62/62字段匹配，coverage valid/complete；整体failed，`Cleanup: Server cleanup: timed out after 1000 ms`，Node exit1。独审已核对后续进程/端口无残留；`forced=true`只证明强制清理分支，93,887字节视频存在但未验证播放。原文件/候选/harness/账本保持，新请求/费用0，revision3114、共享¥16.901000。[公开结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6181880730)已由Root精确读回，详见[研究记录](../research/2026-10-15-c14-independent-media.md)。原220步玩法证据复用；本次不含render/performance，原C14 failed/consumed、coding未批准、accepted/human未提升。

[COS93 / #94](https://github.com/lrfluobida/Cosmos/issues/94)依赖COS52/56/91/92，计划`40dd033a6d01335edac24e7b55edaa35ca8d9747`已独审及[公开批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6181879964)。作者`cos93_implementer`最终`0b475c1fe2918af5e6b61594f29d3060da766078`经`cos93_reviewer`独立APPROVED，无finding；唯一merger `batch_c14_cos92_merger`合入`3d67a50a09a00d98b8fa6d54ee7745337d7e803d`。v1实现已审、实际未完成，issue保持open、integration partial；执行版`59dd5d3`在历史宿主`7df1e5b`上首次实际诊断765169ms，原5秒scope耗时5014.7298ms后失败，nativeIO/open/CDP/browser均未到达，完整15秒链未测得。[公开结果](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6182530375)已由Root精确读回。原466文件/61目录、ledger及进程/端口/locks后核CLEAN；334文件/40225837字节仅为选择范围副本。主线typecheck/build0、短检查2/2；原C14 failed、COS16/COS18及human保持，详见[研究记录](../research/2026-10-15-cos93-native-startup-diagnostic.md)。

当前v3为diagnostic-completed / startup-failed：在`84f9c885`上983679ms、exit0，无OOM、外guard触发或kill，open在14998.7753ms超时，ticket前binding迟到31908.9892ms返回，未有浏览器ticket/spawn/CDP/identity。完整trace/before/final与正常finally/drain/controller关闭有证据；raw processesExited=false保留，独立`POSTCHECK_NO_LIVE_RESIDUE`确认12个PID复用、全部关联进程/端口/20个locks无残留。原466文件/61目录完整零变，344文件/201目录/41769581字节仅为选择范围副本。[公开v3结果](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6187833755)已由Root精确读回，详见[研究记录](../research/2026-10-15-cos93-v3-native-startup-diagnostic.md)。文档`3232eb970036d166b90b0e08b4b062ed3698a2ea`经`cos93_reviewer`独立APPROVED、无finding，唯一merger合入`bdba88002d2d9ffae323298f9d104f4dc3e64ab8`。COS93仍open/partial/startup-failed，无第四次actual授权；v1/v2/observer源码、原C14和真实ledger3114/715/16901000µ保持，Root已解冻。

COS93退出观测计划`30f7c402052dbf85c27696284b59d63126b0d5c8`经`cos93_reviewer`独立PLAN_APPROVED、无finding，[公开批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6188476349)已精确读回；唯一merger合入`5f85b7edc7ba6f81a7979339fadafa846cadac35`。作者`cos93_implementer`最终`ba990d0d401e9b3296482ed9e593b80e7449b439`经`cos93_reviewer`独立APPROVED、无finding，唯一merger `batch_c14_cos92_merger`合入`ba4b09328804e6c771519080ea8cb78cd6846b4b`，[公开源码批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6188763206)已精确读回。主线三文件strict退出0，退出观测2/2、0skip，260.3278ms；其余observer及未变生产typecheck/build证据复用。未来谓词仅确认原tracked ChildProcess的close，不推后代或browser身份；v3 raw processesExited=false与独立OS/ports/owner后核要求保持。COS93仍open/partial/startup-failed，无第四次actual或付费授权。

COS93导航计划`b00dfb344beff37ac3032512289695c7d6fc6b34`的[公开批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6191465264)保持。作者`cos93_navigation_implementer`最终`dcea6d172020723c5ac880a8f5ee01a1830b2906`经`cos93_navigation_reviewer`整卡规格→质量及P2 affected复审APPROVED，无剩余finding；唯一merger `batch_c14_cos92_merger`合入`4459973868e16c1bc4f3299501a1b0f0c78b8143`，[公开源码批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6197582990)已由Root精确读回。子阶段标记`NAVIGATION_DIAGNOSTIC_SOURCE_READY`；SOURCE97生产前置已满足，observer/src/probes保持不变。主线三诊断文件strict退出0，production lifecycle/真实false诊断预定stop正例/额外失败拒绝3/3、0skip，5047.3798ms。原helper10/10、wired13/13及SOURCE97矩阵与typecheck/build按无delta范围复用，计数不相加。生产游戏failed/reportValid:false不提升；诊断独立验证实际停止对象、durable raw与完整清理/保全。仅源码与免费夹具完成，新actual未运行、未授权launcher或paid；COS93仍open/partial/旧whole-open15 startup-failed，v1/v2/v3、C14、ledger和human保持。

COS93最新实际结果：在已审主线`e2358cd59a6313e049605cd652912d326745d414`上完成单次免费navigation-v1：951026ms、Node exit0/TAP1/1只表示diagnostic_completed；新navigation failed，首因`Diagnostic game engine is not ready`。prepare/register/transport为24575.6104/26057.0091/59.6950ms；open50719.3786ms、goto192051.1234ms已返回，ready单次175.8436ms即拒绝，navigation192228.9083ms failed，旧15秒保持超界。首段21步skipped、无planned stop；HTTP8/8 settled、6rejected、仅2body，后续27条404不能倒推原文件缺失。视频1000ms超时、browser forced/exit1，正常close未证明。独立POSTCHECK_NO_LIVE_RESIDUE、原467文件/61目录零变，ledger3114/715/16901000µ和费用0保持；658文件/297目录/69703280B仅为选择归档，Root已解冻。详见[研究记录](../research/2026-10-16-cos93-navigation-v1.md)及Root精确读回的[公开结果](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6198276862)。launcher已消费，无新actual/paid授权；COS93保持open/partial，旧C14/whole15/accepted/human保持。

此前v2在`5e6847ba`上1056412ms后parent exit1/worker exit134 OOM；此前已落盘原15000ms launch超时、21步skipped，PID/CDP/session未证实，final trace/preservation/result缺失、正常drain未证实。[公开v2结果](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6183943925)已由Root精确读回。独立`POSTCHECK_NO_LIVE_RESIDUE`后Root解冻，无kill/delete/recover，原TEMP owner/profile保留；238文件/61目录仅与v1基线比较，337文件/201目录/38976394字节仅为后置崩溃选择副本。8-read小复现证实method mock calls持有Promise→完整snapshot，手工wrapper不按调用累积；不量化OOM占比、不推v1长尾为GC，详见[研究记录](../research/2026-10-15-cos93-observer-retention.md)。有界观测计划`fb0f341779ff8afd04a77cecb887e5381f02438a`经`cos93_reviewer`独立PLAN_APPROVED、无finding，唯一merger合入`120113df9032c0bd4ba8b84eea918a05fced5a33`；有界观测实现`40b9a310cc15deab962b92d805e0ed1edc1bacd3`经`cos93_reviewer`独立复审APPROVED，无剩余finding；唯一merger `batch_c14_cos92_merger`合入`c39819036464495353bedd72ba7d46891013527f`，[公开源码批准](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6187110787)已由Root精确读回。主线三文件strict退出0，8-read保留、正常stop/drain、restore/I/O失败及pending Promise代表4/4、0skip，5521.65ms；原12/12、delta4/4及无变化生产typecheck/build证据复用。仅修改test diagnostics；无第三次actual授权。COS93保持open/partial，COS94/95 scoped closed及原C14/media/human保持；共享仍3114/715/16901000µ。

[COS94 / #95](https://github.com/lrfluobida/Cosmos/issues/95)依赖COS40/64/92，计划`e9e60894cea81fac3f99bfb4735635d8510f0e03`已独审及[公开批准](https://github.com/lrfluobida/Cosmos/issues/95#issuecomment-6181992162)。作者`cos94_implementer`最终`c772c9c340a8118878190d62755d837a3bf1f511`经`cos94_reviewer`独立APPROVED，无finding；唯一merger `batch_c14_cos92_merger`合入`41de11f697eb79183515a0d71a5101f4bf91c10e`，标记`GENERIC_BROWSER_SERVER_CLEANUP_SOURCE_READY`，本卡source scoped complete/closed，[公开源码批准与关闭](https://github.com/lrfluobida/Cosmos/issues/95#issuecomment-6182227279)、closed(completed)及父勾选已由Root精确读回。主线typecheck/build退出0，短集成3/3、0skip；已审11/11及唯一真实正例1/1复用，正常慢退出超过1秒尚未观察、原OS根因未知，详见[任务卡](cos94-browser-server-cleanup.md)。当前100个原生子任务，main保持unfrozen；原媒体/C14失败、旧任务与预算保持。

[COS95 / #96](https://github.com/lrfluobida/Cosmos/issues/96)，id5858781735，已原生挂父#1，依赖COS52/91/92/93（COS93仅诊断实现/证据）。计划`bd4247cc5afd2d8c78e2e5b6c71d7265a8f400f4`已独审及[公开批准](https://github.com/lrfluobida/Cosmos/issues/96#issuecomment-6182899219)。作者`cos95_implementer`最终`04fdb8bd0b44bd059f49dcf7b43029f7647beb13`经`cos95_reviewer`独立APPROVED，无finding；唯一merger `batch_c14_cos92_merger`合入`862514f269638d7489bb7438dc764777d8ed5c0e`，标记`VALIDATION_SCOPE_AUTHORITY_READ_SOURCE_READY`，本卡source scoped complete/closed，[公开源码批准与关闭](https://github.com/lrfluobida/Cosmos/issues/96#issuecomment-6183200008)、closed(completed)及父勾选已由Root精确读回。主线typecheck/build0、短检查3/3，原行为证据复用；单次组件输入20507280→10285763字节不能证明长尾或完整startup改善，详见[任务卡](cos95-scope-authority-read.md)。COS93仍open/partial/startup-failed，原C14、媒体、账本和human结果保持；父#1为100个子任务，main保持unfrozen。

[COS96 / #97](https://github.com/lrfluobida/Cosmos/issues/97)，id5862972672，已原生挂父#1并勾选，当前100个子任务；依赖COS52及COS93已审源码/v3证据，不要求startup通过。作者`cos96_implementer`的计划`792df6835cd3874dd7f5ff991b318d77978cab73`经`cos96_reviewer`独立PLAN_APPROVED、无finding，[公开批准](https://github.com/lrfluobida/Cosmos/issues/97#issuecomment-6188535611)已精确读回；唯一merger `batch_c14_cos92_merger`合入`81108c62477983243766a06dd27f536118a8a328`。作者最终`0f8d87c4c4d657c2b4a75a38c2f494ae81e7c7aa`经`cos96_reviewer`独立APPROVED、无finding，唯一merger合入`e3372651177006ba66eee6f9b0d73ff50d84a08a`，[公开源码批准与关闭](https://github.com/lrfluobida/Cosmos/issues/97#issuecomment-6189136844)已精确读回。标记`KNOWN_SOURCE_FILE_CONCURRENCY_SOURCE_READY`，本卡source scoped complete/closed，closed(completed)及父勾选已由Root精确GET核证。主线source8/8、0skip、3031.3424ms，受影响strict与fixture语法退出0；生产/core/deps/build输入等同作者通过版本，复用typecheck/build、C14/scope5/5与compiled1/1。compiled只补独立TEMP的TypeScript前提，原失败与断言保持。每调用固定4项并发；即使source叶区间归零，样本binding仍约20.283秒，不能据此保证15秒。见[任务卡](cos96-source-file-concurrency.md)与[计划](../plans/2026-10-15-cos96-source-file-concurrency.md)。唯一叶组件A/B为55.8285→28.0087ms（201项/8990009字节，峰值1→4），有A→B缓存与顺序偏差，不代表完整source/guard/15秒。COS93仍open/partial/startup-failed，无第四次actual或付费授权，原raw/预算保持。

[COS97 / #98](https://github.com/lrfluobida/Cosmos/issues/98)，id5864160449，已原生挂父#1且已勾选，当前100个子任务。作者`cos97_implementer`最终`1f9ae8f7aaccad8c0df0b19dd7a2f8deca508913`经`cos97_reviewer`整卡规格→质量APPROVED，无剩余finding；唯一merger `batch_c14_cos92_merger`合入`e8df0ffcbdcd584e4d67069e7e25c359dcedb196`，[公开源码批准与关闭](https://github.com/lrfluobida/Cosmos/issues/98#issuecomment-6196625698)已由Root精确读回。标记`NATIVE_VALIDATION_WAITS_SOURCE_READY`，本卡source scoped complete/closed；issue closed(completed)及父勾选已由Root精确GET核证，源码发布主线`cfe8b646fab55421333d4409569101d5870fa05b`。设计`db0366b`及accepted ADR0002保持；`native-validation-waits/1`的阶段预算、完整caller/fresh/payload/late raw所有权接线已审集成，generic/human默认和原总deadline保持。主线typecheck/build退出0，三个组合代表3/3、0skip，4610.9721ms；批准源码/probes/tests与作者最终字节一致，原host→clean origin→consumer 1/1（57.7秒、合成浏览器packet）、helper/lifecycle45/45及diagnostic/host37/37按独审范围复用，计数不相加。详见[任务卡](cos97-native-validation-waits.md)和[计划证据](../plans/2026-10-15-cos97-native-validation-waits.md)。这是源码与免费夹具完成，不是实际导航通过；COS93仍open/partial/startup-failed，原whole15/v1/v2/v3、C14 failed/consumed、ledger3114/715/16901000µ及accepted/human未完成保持，actual/paid未授权。

### 此前补充证据：封存C14候选独立玩法通过

在已审`e634119`上对原候选逐字节一致副本单次诊断，40.827秒内原8段220步全部通过、0失败/0跳过；T16-01～06和存档重开checkpoint保留，原游戏生成版本仍为`b20e9a43`。独立评审确认浏览器正常退出、进程/服务清理和原文件保持；新模型请求/费用为0，账本仍revision3114、共享¥16.901000，Root后核后解除main冻结。[公开结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6181057183)与[研究记录](../research/2026-10-15-c14-independent-gameplay.md)保留证据。仅gameplay通过；媒体62字段、性能、coding批准、accepted和human未执行，省略ownedChild/controller的诊断不证明真实nativeIO完整启动链≤15秒。COS16/COS18与完整经典仍未完成，COS91/COS92源码范围关闭保持。

### C14原运行结果：正式构建通过，浏览器启动失败

C14已在冻结版本 `b20e9a43` 实际运行并failed，身份已消费：41分13.754秒、35次请求全部settled，新增¥0.792063，共享累计¥16.901000，unknown/reserved为0。运行时作者生成10文件35,771字节，与末次成功自检、capture、candidate v1及正式构建输入逐字节一致；三次自检失败/通过/通过，正式TypeScript/Vite退出0，814ms仅为Vite时间。持久浏览器首段15秒启动超时，21步全部skipped，未记录session、PID/exit为null，不能证明历史OS spawn；coding review仍pending，无repair/accepted/human。

原锁首次归档调用因PID复用在写入前拒绝；独审精确代际守卫后实际归档一次，原字节/mtime与文件身份保持，失败及清理证据不足结论保留。closure20已一次执行并独立核对，revision3114、22stopped/14delegations/110closed/20audits，释放及组可分配¥1.707937；原费用、历史和补充分配保持。Root已解除main冻结。[COS16实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6180211123)与[C14结果](https://github.com/lrfluobida/Cosmos/issues/92#issuecomment-6180211817)已由Root精确读回。详见[研究记录](../research/2026-10-15-transfer-c14-browser-launch.md)。

[COS92 / #93](https://github.com/lrfluobida/Cosmos/issues/93)，id5856929672，已原生挂父#1，登记时92个子任务，依赖COS37/52/91。作者`cos92_implementer`最终`ffa0ce2918735f5b21b22c4373a390b156e63d33`经`cos92_reviewer`独立规格→质量APPROVED，无剩余finding；唯一merger `batch_c14_cos92_merger`合入`e74815f468b7158b5555ca2e5887ad3459b74dda`，标记`PERSISTENT_BROWSER_LAUNCH_SOURCE_READY`，本卡source scoped complete/closed。主线typecheck/build退出0，短集成5/5、0skip；源码与测试等同批准版本，作者长回归及真实Edge证据复用，generic fixture的4条既有strict诊断保持，详见[任务卡](cos92-browser-launch.md)。[公开源码批准与关闭](https://github.com/lrfluobida/Cosmos/issues/93#issuecomment-6180910087)、closed(completed)及父勾选已由Root精确读回；main保持unfrozen。C14原冻结`b20e9a43`失败/已消费事实不变，完整原生启动链仍未测得，无新付费或C14重放；COS16/COS18、完整经典和human仍未完成。

### C13历史结果：准入拒绝，未产出源码

C13在冻结版本 `388defc` 运行26分26.253秒后因请求准入拒绝failed；47次请求全部settled，新增 **¥1.641136**，共享累计 **¥16.108937**，unknown/reserved均0。作者0源码文件、53次read、10次成功原生压缩，无编码handoff、游戏capture或正式build/browser/review/repair/accepted。末次8192输出length属于摘要仍是源码及时序推断；COS16/COS18、完整经典与human仍未完成。

Root已一次完成closure19，释放 **¥0.858864**；revision2965、21stopped/13delegations/105closed/19audits，进程及owner/locks已清理，main冻结已解除。原COS16组可分配 **¥0.899686**，C13身份已消费。[COS16实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6176958554)与[C13结果](https://github.com/lrfluobida/Cosmos/issues/89#issuecomment-6176959551)已由Root精确读回；详见[研究记录](../research/2026-10-15-transfer-c13-compaction-budget.md)。

[COS89 / #90](https://github.com/lrfluobida/Cosmos/issues/90)，id5854211592，父#1当前89个原生子项，依赖COS79/85/88。计划 `66c51d6a05c5d833242ade918f480a5655926859` 已独审及[公开批准](https://github.com/lrfluobida/Cosmos/issues/90#issuecomment-6177021623)。最终 `b35124a8e48e532bda530607cfa04e25b3e1b57c` 经 `cos89_reviewer` 独立规格→质量APPROVED，无finding；唯一 `batch_c13_cos89_merger` 合入 `11c823a7fd1358cb570b1b80edd4b3300ee0115b`，标记 `AFFORDABLE_CODING_COMPACTION_SOURCE_READY`，source scoped complete/closed；[公开批准与关闭](https://github.com/lrfluobida/Cosmos/issues/90#issuecomment-6177248473)、closed(completed)及父勾选已由Root精确读回。仅普通既有输出下限 `min(4096, cap)` 无法负担时才选择预算摘要；原预算、来源、身份、输出及准入守卫保持。主线typecheck/build退出0，compiled7/7、0skip；作者factory28/28、native31+修正2/2及strict按独审证据复用。免费fixture不证明实际游戏改善；main保持unfrozen，没有新增付费运行。

### C12历史结果：截止取消，末次自检失败

C12在冻结版本 `3cde457` 上运行44分56.013秒，由既定截止前5秒定时器结束，结果`failed`、coding attempt为`cancelled`。52次请求全部准入和结算，新增 **¥1.664926**，共享累计 **¥14.467801**，unknown/reserved均0。首次作者自检通过，继续修改后的第二次因`boardScene.ts:150`的TS2339失败；当前7文件36,508字节与失败副本一致，首次通过不能覆盖当前版本。没有handoff/capture、正式候选或正式build/browser/review/repair/accepted，体验未确认。

Root已一次完成closure18，释放 **¥1.335074**；revision2770、20stopped/12delegations/100closed/18audits，进程及owner/locks已释放，main冻结已解除。原COS16组可分配 **¥2.540822**，不足新的固定¥3案例。C12身份已消费，COS16/COS18、完整经典与human仍未完成。[COS16结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6174293178)和[C12结果](https://github.com/lrfluobida/Cosmos/issues/87#issuecomment-6174294365)已由Root精确读回；[研究记录](../research/2026-10-15-transfer-c12-deadline.md)保留自检版本、压缩推断及清理边界。本批只归档现有证据，没有新付费或案例。

[COS87](cos87-parallel-git-identity.md)最终 `ac91cff` 经 `cos87_reviewer` 独立APPROVED，无剩余finding，唯一 `batch_c12_reference_merger` 合入 `49e8929`；`PARALLEL_GIT_IDENTITY_SOURCE_READY`，已[在源码范围完成并关闭](https://github.com/lrfluobida/Cosmos/issues/88#issuecomment-6175145772)，父勾选已由Root核实。每组四个独立Git查询并行并收齐结果，原校验顺序、守卫、5秒截止和清理保持。主线受影响strict与两项短代表通过，原19/19及typecheck/build证据复用；短基准身份读取中位755.5810→348.6017ms仅属于该环境的identity范围，不代表实际游戏、自检总时长或费用改善。

[COS88固定C13](cos88-transfer-case13.md)最终 `0ef6003` 经 `cos88_reviewer` 独立规格→质量APPROVED，无剩余finding，唯一merger合入 `9b8be05`，标记 `TRANSFER_CASE_THIRTEEN_SOURCE_READY`，已[在源码范围完成并关闭](https://github.com/lrfluobida/Cosmos/issues/89#issuecomment-6175718904)，closed(completed)及父勾选已由Root读回；计划 `6ad3235` 的[公开批准](https://github.com/lrfluobida/Cosmos/issues/89#issuecomment-6175247486)已由Root读回。仅新C13为¥2.50/45分钟/80请求/一次repair，固定向量1/1/1/1900000/599997µ，原COS16组¥10、phase¥30、shared¥150及旧¥3声明保持。主线受影响strict与7项短集成通过，已审SOURCE/compiled等证据复用；SOURCE类型补18发射JS不变，长运行的复用边界见任务卡。以上为源码准备时记录；实际C13现已failed并完成closure19，Root已解除main冻结，结果见本节顶部。

### C11历史结果：自检通过后输出截断

C11在冻结版本 `2a7a291` 上运行31分03.893秒，早于45分钟截止。41次请求均已准入和结算，新增 **¥1.336555**，共享累计 **¥12.802875**，未知费用和预留为0。唯一作者自检的TypeScript/Vite退出码均为0；六个文件共37,377字节，cos77已核与成功自检副本逐字节一致。

最终为`failed / insufficient_evidence`，末条SDK错误为输出截断，最后计费记录`stopReason=length`、output8192，¥0.086264已结算。无handoff/capture、正式候选、build/browser/review/repair/accepted，体验未确认。摘要阶段是源码推断，回执未直接记录请求kind；C11冻结版本的共享失败锁确会将摘要length传至原作者会话。不能归因为预算耗尽或截止时间，详见[研究记录](../research/2026-10-14-transfer-c11-summary-truncation.md)。

Root已一次完成closure17，释放 **¥1.663445**；revision2555、19stopped/11delegations/95closed/17audits，旧费用和历史保持，进程及owner/lock已释放，main冻结已解除。[COS16结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6170776637)和[C11入口结果](https://github.com/lrfluobida/Cosmos/issues/85#issuecomment-6170782350)已精确读回。C11身份已消费，COS16/COS18及完整游戏/human仍未完成；本次只记录结果，不新增付费或案例。

[COS85：保留可选摘要截断后的原作者会话](https://github.com/lrfluobida/Cosmos/issues/86)已审集成：cos76实现的 `b5e8794` 经接续独立 `cos85_reviewer` 实际规格与质量APPROVED，无finding，唯一 `batch85_86_merger` 合入 `f63399f`，标记 OPTIONAL_COMPACTION_TRUNCATION_SOURCE_READY。计划 `c108e9a` 的原cos77批准保持，本卡已[在源码范围完成并关闭](https://github.com/lrfluobida/Cosmos/issues/86#issuecomment-6172184717)，closed(completed)及父勾选已由Root精确读回。可信可选自动摘要已结算的length丢弃部分摘要并保留原上下文、停用后续auto；下一普通请求保持原准入。主线typecheck/build0、Root原复现1/1和dist恢复/accounting失败2/2通过，其他已审证据复用；完整SHA与边界见[任务卡](cos85-optional-compaction-truncation.md)。

[COS86：固定迁移 C12](https://github.com/lrfluobida/Cosmos/issues/87)，id5850243246，已由Root原生挂父，登记时86个子项。依赖COS84/85，由接续 `cos86_implementer` 实现、`cos86_reviewer` 独审，唯一merger为 `batch85_86_merger`。计划 `fc2a06e` 与最终实现 `0801212` 均已独审APPROVED，无finding；合入 `c8f5ecb`，标记 TRANSFER_CASE_TWELVE_SOURCE_READY，本卡已[在源码范围完成并关闭](https://github.com/lrfluobida/Cosmos/issues/87#issuecomment-6172760100)，closed(completed)及父勾选已由Root精确读回，详见[任务卡](cos86-transfer-case12.md)。源码准备时以19stopped/11delegations/95closed/17audits和41笔C11已结算历史为基线，C5两阶段七capture只读复用、新作者为空；原¥150/COS16组¥10/单轮¥3与45分钟保持。主线typecheck/build0、C12与旧C11短代表7/7、0skip；作者18项unit、runtime1/1及compiled1/1证据复用，SOURCE与synthetic transport不代表实际游戏通过。以上为源码准备时证据；实际C12及closure18已结束，Root已解除冻结，结果见本节顶部。

### C10历史结果：因时限取消

C10已在用户授权的最多¥3、45分钟窗口内结束。冻结版本为 `a464b0f`，运行约44分56秒后，既定的截止前5秒清理定时器触发，编码任务记为`cancelled`。40次请求均已准入和结算，新增 **¥1.086265**，共享累计 **¥11.466320**，未知费用和预留均为零。

第一次作者自检发现 `scene.ts:279` 的TS2352错误。作者自主修改后，第二次两项退出码均为0，但仍没有交接、捕获或正式候选，也没有正式build/browser/review/repair/accepted；体验未确认。六个作者文件共30,046字节，cos77已确认与成功自检的临时副本逐字节一致。自检通过不等于正式验收通过。

首次免费预检因C10来源清单尚未准备而拒绝，账本和付费请求数保持不变；Root补齐纯C5历史清单后通过。取消后的旧C6标签来自共享handler，`Historical source changed`来自取消检查的统一catch，不能作为文件改变证据。精确时间、自检记录和工具统计见[研究记录](../research/2026-10-14-transfer-c10-deadline-stop.md)，其中读取次数不用于推断作者动机。

Root已一次完成closure16，释放未使用的 **¥1.913735**。18个案例均已停止，费用和旧历史保持；启动器、Node及锁已清理，主线冻结已解除。[COS16实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6168008318)、[C10入口结果](https://github.com/lrfluobida/Cosmos/issues/83#issuecomment-6168010789)和[COS82源码关闭](https://github.com/lrfluobida/Cosmos/issues/83#issuecomment-6167055060)已由Root精确读回。COS16/COS18仍partial，实际游戏和human未通过；本次不新增付费、C11或预算。

后续源码工作为[COS83：减少作者工具中的重复来源校验](https://github.com/lrfluobida/Cosmos/issues/84)。任务已原生挂父，当前83个子项；cos76负责实现，cos77独审，唯一merger保持不变。基线、生产方案及最终源码均已独审通过；版本 `c8afd76` 已合入 `32af0aa`，本卡已[公开批准](https://github.com/lrfluobida/Cosmos/issues/84#issuecomment-6169208468)并在源码范围内关闭，父勾选已由Root核实。生产只删除一处直接重复scope调用，每次origin.verify仍执行完整校验。普通prepared fixture两次工具调用均从160次降到83次，48.125%仅为该夹具的校验次数降幅，不代表C10实际速度或费用变化。主线typecheck/build和真实guard超时代表通过，旧边界证据复用；[任务卡](cos83-tool-scope.md)保留完整证据。本轮不新增付费、C11或预算。

[COS84固定迁移C11](cos84-transfer-case11.md)任务已原生挂父，当前84个子项；cos76实现的 `7173766` 已由cos77独立规格与质量审查批准，无剩余finding，唯一merger合入 `f4856f9`，标记为 TRANSFER_CASE_ELEVEN_SOURCE_READY。本卡已[在源码范围完成并关闭](https://github.com/lrfluobida/Cosmos/issues/85#issuecomment-6169906507)。沿原¥150持续推进授权，单轮仍最多¥3、45分钟，原COS16预算组¥10不变；准备时Root报告可分配¥5.542303，新向量保持规划、设计、美术各¥0.000001，编码¥2.40、修复¥0.599997。

主线typecheck/build及7项短集成回归通过，作者12项unit、runtime和compiled证据复用。SOURCE证明合成历史、真实host/factory与fake Pi、同窗口partial冷恢复；compiled worker transport为synthetic。以上为源码准备证据，实际C11与closure17已结束，结果见本节顶部；C10失败与费用保持。

### C9历史结果：未通过

C9在冻结版本 `730cb4d` 上运行，于北京时间10月14日04:00开始，约29分36秒后结束，早于原定04:45截止时间。31次编码请求均已结算，新增 **¥0.960162**，共享累计 **¥10.380055**。五次真实原生压缩成功后继续了请求，但最终没有交付通过的游戏。

末条SDK错误为 `Request output limit authority rejected; no provider request sent`。宿主的 failed / insufficient_evidence 是归一化分类，不是作者主动声明未完成。输出只有6个文件、34,507字节，没有handoff或capture，也没有候选、构建、浏览器验收、评审、修复或接受结果。[COS16结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6155055951)和[C9入口结果](https://github.com/lrfluobida/Cosmos/issues/79#issuecomment-6155056831)已由Root公开并精确读回。

后续免费诊断分为两类：cos76在隔离副本中原样构建，发现 `media.ts:206` 的TS2352错误，Vite没有运行，原文件未变；Root离线重放显示下一请求的最低预留超过剩余额度，其中的native no-op不代表已确认的实时事件。[研究记录](../research/2026-10-14-transfer-c9-budget-stop.md)保留精确时间和证据边界。

Root已完成closure15，关闭本次五个角色额度，并解除主线冻结。17个案例均已停止，未知费用和预留均为零；编码余 **¥0.273028**，预算组余 **¥6.628568**，费用保持，C9不能重跑。COS79已在源码范围内完成并关闭；COS16/COS18仍partial/open，COS78/79源码通过不等于C9、完整classic或human通过。下文C9 NONE、旧账本版本和等待准入为各阶段历史。

后续两项源码已独审集成。[COS80](cos80-current-plan.md)让编码作者按固定输出路径选择当前候选对应的必读计划，保留原引用、权限及宿主对双计划的核验。[COS81](cos81-admission-feedback.md)让可信准入拒绝保留安全失败原因，不再使用作者未完成交接的默认文案；原失败分类、历史费用和重试/修复边界保持。

两项已在源码范围内完成并关闭；[COS80公开批准](https://github.com/lrfluobida/Cosmos/issues/81#issuecomment-6155519821)、[COS81公开批准](https://github.com/lrfluobida/Cosmos/issues/82#issuecomment-6155523557)及父勾选均已由Root精确读回。主线typecheck/build及两个真实调用链代表通过，旧长修复链和回归结果复用。父任务仍有81个子项，没有新案例、付费或预算调整，C9历史结果不改写。

COS79（[#80](https://github.com/lrfluobida/Cosmos/issues/80)，id5835178325）“在成功工具回合接通有界上下文压缩”已发布，登记时正文、原生父#1与未勾选checkbox由Root精确读回。依赖COS77/78，专属 `cos77_implementer` acting COS79作者、独立 `cos76_implementer`、唯一merger `batch75_76_merger`；第一阶段计划 exact `e0248f70d96257a7fcac15cb6c8d8e7ad3db2a69` 经 `cos76_implementer` 独立 PLAN_APPROVED，[公开计划批准](https://github.com/lrfluobida/Cosmos/issues/80#issuecomment-6152183815)已由Root精确读回，仅授权免费SOURCE/TEMP设计实验。`cos77_implementer` 执行、`cos76_implementer` 独审；生产设计 exact `b4918b89a525c0ffb97eb0b2b2c01e948b8cde96` 已获 `cos76_implementer` 独立 PRODUCTION_PLAN_APPROVED、无剩余finding，[公开生产设计批准](https://github.com/lrfluobida/Cosmos/issues/80#issuecomment-6153006681)由Root精确读回。19个SOURCE/TEMP/fakeprovider/network0边界为16矩阵+2摘要费用边界+1native no-op有效RED→GREEN；源码 exact `1d783c8f390b9927895d3a2c21c9b7f39a46d6e1` 经独立 `cos76_implementer` 实际11paths规格→质量 APPROVED、无findings，唯一 `batch75_76_merger` 合入 `e06ce718fbec9d72f605d59680db6506aca804e3`；VALIDATION_CODING_COMPACTION_SOURCE_READY；[公开源码批准](https://github.com/lrfluobida/Cosmos/issues/80#issuecomment-6154080327)、closed(completed)及父勾选已由Root精确读回，本卡source/free-fixture scoped complete。以coding1233190µ重放C8历史14请求的反事实仍保留前14cap65536；第14input251339 bytes/before1069753µ/reservation1026966µ/settled324091µ后剩745662µ，低于下一405672-byte输入本身811344µ及floor4096总844112µ；这不改变C8实际费用，也不预测C9。native compact仍经过既有streamSimple hooks。固定设计：成功工具回合仅在inputBytes>=131072且原full-cap quote超过剩余额度一半时触发；一次成功后须再增长32768 bytes，同projection去重，成功后保守需求不降则停止本session auto。真实native no-op仅去重并恢复设置，不更新success或noBenefit；失败锁保持。native摘要cap先取8192/cfg/SDK正上限最小值，再经COS77与当前controller准入。native已有保存前toolCall拒绝，复用原规则、不加摘要schema；compaction_end成功事件在保存之后。不直接开auto overflow或在busy调用manual。主线typecheck/build0、factory目标角色启用/关闭/no-op代表3/3；已读12份生产相关raw，native20场景、compiled7+close2、C9免费marker双祖先1/1及compiled闭包1/1按原证据复用，旧61项采用60原pass加墙钟单独复跑1pass。[任务卡](cos79-coding-compaction.md)保留证据边界。上述为源码集成时证据；其后C9与closure15结果见顶部，原审批与预算保持。

COS78（[#79](https://github.com/lrfluobida/Cosmos/issues/79)，id5834810242）已发布并原生挂父，登记时正文与未勾选checkbox由Root精确读回。标题“准备输出额度修复后的固定迁移 C9”，依赖COS76/77；专属 `cos76_implementer`、独立 `cos77_implementer`、唯一merger `batch75_76_merger`，计划 exact `6bff761e3bcbc093497ddafeef174582e8439647` 经 `cos77_implementer` 独立 PLAN_APPROVED，[公开计划批准](https://github.com/lrfluobida/Cosmos/issues/79#issuecomment-6151555141)已由Root核实；源码 exact `870fa22a447178e04f2ee345e111328362cb385a` 经 `cos77_implementer` 实际17paths规格→质量 APPROVED、无findings，唯一 `batch75_76_merger` 合入 `06045cafa532d7edcd5399ceb6381acc9af69a3f`；TRANSFER_CASE_NINE_SOURCE_READY；[公开源码批准](https://github.com/lrfluobida/Cosmos/issues/79#issuecomment-6152204919)、closed(completed)及父勾选已由Root精确读回，本卡source/free-fixture scoped complete。范围为C8停止后的16cases/8delegations/80closed/14audits基线，C1–8真实净额动态派生原角色余额、C5七capture与零design/art SDK、新增COS76/77源码守卫；原¥5/45分钟/80请求/一次repair和总role budget保持。范围与已审证据见[任务卡](cos78-transfer-case9.md)。主线typecheck/build0、两组费用派生与固定parser/quote/当前费用前缀代表2/2；已读作者5RED→11GREEN、runtime1/1和compiled1/1四份TAP，重型证据复用。SOURCE两组费用及一次fake input405672bytes/cap52730只证明当前绑定，原snapshot字节已恢复；COS79源码前置已审集成；集成时actual C9/paid/window/human/game NONE为历史，实际C9未通过，见顶部最新结果。

COS77（[#78](https://github.com/lrfluobida/Cosmos/issues/78)）已审集成：专属 `cos77_implementer` 的 exact `9d0efc6b362193d81c7fd5c96829a85e399eb5a3` 经独立 acting reviewer `cos76_implementer` 实际规格与质量APPROVED、无findings，唯一 `batch75_76_merger` 合入 `b22120bc5d1012da2ac9df5fc06491b10f6a03e7`；`VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY`；[公开批准](https://github.com/lrfluobida/Cosmos/issues/78#issuecomment-6151413430)、closed(completed)及父勾选已由Root精确读回，本卡source/free-fixture scoped complete。[任务卡](cos77-request-output-cap.md)限定validation coding作者及同角色repair作者：在Pi实际inputBytes/hasImages后按当前角色余额选择min(4096,原cap)以上最大可负担cap，原cap可承担则保持，报价/预留/发送同值。准入后输入漂移零发送但已有admission/events/not_sent receipt，再cancel(provenNoCost)，不能记为账本零变动。主线typecheck/build0、factory52730与final-window漂移代表2/2；作者32新case、39旧回归和6compiled按原证据复用。仅source/free fixture，无新增actual paid/window/human/game、不启动C9，原C8/closure14及预算保持。

C8历史[实际结果](https://github.com/lrfluobida/Cosmos/issues/77#issuecomment-6151353014)：迁移C8在固定source `00eb698fa39a48ba8c4a0f1eaf33c522587d2281` 上于UTC2026-10-13 15:59:41.066—16:19:11.866（本地跨10月14日）运行1170800ms，14SDK新增487528µ，共享9419893µ。`cos16_acceptance_review` 独立核对为insufficient_evidence：仅index.html（4921 UTF-8 bytes/4586 chars）引用缺失的src/main.ts，journal仅origin，无author.json、capture-started、candidate/build/browser/coding review/repair/accepted；C5 design/art仍passed/approved。两次私有scope timeout之后多次读取和write成功，COS75恢复属性有实际证据。第15调用在发送前预算拒绝；免费精确Pi重现input405672、固定cap65536需预留1335632µ > coding剩1233190µ，可负担cap52730预留1233184µ。closure14脚本由`reconciliation_review`独审、Root已执行：revision2086/16stopped/8delegations/80closed/14audits/unknown与reserved0/共享9419893µ，全部旧费用案例保持。COS16/COS18仍partial/open，完整classic、human与游戏验收未通过。COS76仅source scoped complete；[COS77 #78](https://github.com/lrfluobida/Cosmos/issues/78)已登记，按实际剩余额度收紧编码请求输出上限，依赖COS59/75/76，登记时SOURCE_NOT_READY为历史、当前源码审批见上段。下文C8 NONE、旧revision2023与源码集成记录均为各阶段历史。

COS75（[#76](https://github.com/lrfluobida/Cosmos/issues/76)）仅修复局部验证 scope 超时被错误升级为 owned origin 永久关闭的问题。私有计时器产生可信超时类型；当前操作仍失败，原 owner signal 活跃时保留 listener。真正运行/owner 取消、回执或绑定漂移及其他错误仍关闭；每次操作继续完整验证，不缓存、不自动重试、不延长 5 秒或预算。初始化及最终清理保持关闭。exact `e6a3eac510bafe105a5dfc182b515156e7b356c0` 已由 `cos75_reviewer` 独立规格与质量 APPROVED，唯一 `batch75_76_merger` 合入 `005b4ae9557f1e735a3d255f9ccb3e5950163ac6`；`VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY`；[公开批准](https://github.com/lrfluobida/Cosmos/issues/76#issuecomment-6148880003)、closed及父勾选已由Root核实，本卡source/free-fixture scoped complete。主线 typecheck/build0、局部 timeout 代表1/1，其余已审证据复用。真实 C7 最初慢步骤尚未确证，本卡不重开 C7 或声明后续游戏通过。

COS76（[#77](https://github.com/lrfluobida/Cosmos/issues/77)）依赖 COS60/74/75，固定第八迁移案例入口已审集成。`cos76_implementer` 的 exact `ff6b3015081403d2ba5b186c059eb1905ddb8083` 经独立 `cos76_reviewer` 规格与质量 APPROVED、无 findings，唯一 `batch75_76_merger` 合入 `f54d2bbe96055d5c10f82243889f7577422e127a`；`TRANSFER_CASE_EIGHT_SOURCE_READY`；[公开批准](https://github.com/lrfluobida/Cosmos/issues/77#issuecomment-6149728758)、本卡scoped closed及父勾选已由Root核实，详见[任务卡](cos76-transfer-case8.md)。主线 typecheck/build0、C8费用派生与当前任务/候选计划代表2/2；已审focused16/16、compiled1/1、runtime2/2及补充代表复用。真实host修复与cold driver到repair factory，SDK/build为synthetic、无browser/v2 promotion；集成时实际C8/paid/human NONE为历史，当前C8与closure14结果见上段。COS60源码状态修正与原C7失败费用/窗口保持。

2026-10-13 C7 最新实际结果：C6最后207689 micro-CNY结清，closure12已执行至revision1944/70closed/12audits。C7在固定源码`cd6d9a997e85099d4effbda5599d499705fc1dd9`上于UTC14:14:09.410—14:29:55.393运行945983ms，18次SDK新增58415 micro-CNY，共享已结算8932365 micro-CNY。coding一次attempt insufficient_evidence；作者handoff工具阻塞说明，capture-started但无完成capture/候选（0文件），review pending、repair null，无game/build/browser通过。原错误为`Owned transfer origin listener or fixed receipt changed`与`Validation scope check was cancelled or timed out`，根因待独立诊断。`cos16_acceptance_review`核实结果与空候选目录，`reconciliation_review`独审财务脚本；closure13已实际完成，revision2023/15案例全部stopped/7delegations/75closed/13audits/unknown与reserved0。COS16/COS18仍partial/open，完整经典/human未通过。COS74已[公开批准并关闭](https://github.com/lrfluobida/Cosmos/issues/75#issuecomment-6147529687)，仅source scoped完成。下文旧snapshot、unknown及C7未执行状态均为各阶段历史，当前事实以本段为准。

源码集成时历史状态：Root 已按独立核对的供应商小时证据结算 C6 最后一笔 unknown，保守峰值 207689 micro-CNY，snapshot1943/共享8873950 micro-CNY/unknown与reserved0，14 stopped/65 closed/11 audits 保持；原 unknown 回执不变。Closure12 随后因冻结模板目录多出 observer 文件被拒、尚未执行，C7 未运行。[COS-74 / #75](https://github.com/lrfluobida/Cosmos/issues/75) 将原字节观察器移出固定八文件目录，`9a423b316f0b0e1acf12565d9761146b2021a50b` 已独审 FROZEN_TEMPLATE_OBSERVER_ISOLATION_SOURCE_READY，由 sole merger `cos74_merger` 合入 `ad1d7f217bb0df0df9661aa673343356db316d76`；main typecheck/build0、真实仓根 native/C6 固定输入代表2/2。本卡仅 source/free-fixture scoped complete，未更改旧声明、输入哈希或目录检查。下文旧 snapshot1942/unknown 记录为历史，预算、参考冻结与完整游戏验收边界保持。

原生Case8历史：在固定source ef4b2ea上生成v1，真实browser090音频断言code_defect失败，经既有一次linked repair后v2构建、原Edge111/111/0failed/0skip/errors[]及同版本独立codingreview approved，已自动接受有界单关。76请求新增保守峰值估算¥1.549592、共享¥7.008623；六笔免费未用容量closure后revision1414，费用/旧七案例/v1失败与C6 free111诊断保持。COS10/11/13原组件条件经独立验收后complete/closed，沿原closed-only条件自然满足G3，证据层次见[组件验收记录](../reviews/2026-10-04-g3-component-acceptance.md)。C8实际serial/无compaction，COS13并行峰值2/SDK压缩/12h边界证据分别为注入/mock HTTP/模拟时钟；此结果不证明完整经典基准、最终还原目标或实际用户体验；COS34决定入口已独审集成但human NONE，COS35/36源码已独审集成但仍为preparation_only/not_executable，COS37源码已独审集成、仅验证harness fixture的隔离profile/同origin真实进程重开；COS38运行时输入adapter/COS39失败事实分类已独审集成，实际仍为preparation_only，COS40源码consumer已独审集成，只有synthetic验证；COS42原COS16预算组源码已独审集成，实际迁移claim已原子升级ledger4并delegation/不加预算；COS41原会话有界design反馈已独审集成，预算组/consumer source均具备，COS43固定入口源码已独审集成；真实迁移case1仅planning1请求/34.198秒后因三task均缺policyId失败，无生成游戏。C1结束时九案例/revision1421/ledger4/shared¥7.022725及closure7/45closed/七audits为历史，COS44 policy契约源码已独审集成，COS45继任case2源码已独审集成/TRANSFER_CASE_TWO_SOURCE_READY，实际C2 planning三task通过后design generic标识符onTarget失败，15SDK/282562ms/新增¥0.161528；C2结束时10cases/revision1488/ledger4/shared¥7.184253/closure8/50closed八audits为历史，semanticTool check1通过但未generic capture，无game，COS46只读输出自检源码已独审集成；COS47第三迁移case源码已独审集成/TRANSFER_CASE_THREE_SOURCE_READY，实际C3 policy/role/AC/deps正确但taskId别名未匹配grant而失败，1SDK/33413ms/新增¥0.014780/无tasks-game；C3结束时11cases/rev1495/ledger4/shared¥7.199033/closure9/55closed九audits为历史，COS48主机身份绑定源码已独审集成、C4已实际native opt-in；COS49第四迁移case source已独审集成/TRANSFER_CASE_FOUR_SOURCE_READY，实际C4 alias绑定与generic/map capture通过，但独立design review查错capture路径而changes_requested，24SDK/1377154ms/新增¥0.214694、无game；C4结束时12cases/rev1602/ledger4/shared¥7.413727/closure10/60closed十audits为历史，46只读generic自检有实际1次passed、未整体迁移通过，COS50路径契约源码已独审集成、仅synthetic读取验证；COS51第五迁移source已独审集成/TRANSFER_CASE_FIVE_SOURCE_READY，C5结束时（历史）13cases/rev1884/ledger4/shared¥8.530730/closure11/65closed十一audits；design/art host及独立review通过，coding截止前取消、未handoff/capture/build/browser/game。Source52/53已独审集成但只source/TEMP证据，preparation internal API具备、public CLI/connector与实际human未通过；COS54/55/56源码已独审集成、仅source/TEMP验证，COS57源码已独审集成/TRANSFER_CASE_SIX_SOURCE_READY、仅synthetictransport，COS58源码已审集成/PUBLIC_HUMAN_PREPARATION_SOURCE_READY、仅SOURCE/TEMP/fakeSDK，actual C6在13codingauthor请求/682889ms后因120s流取消失败，12settled135531µ与unknown974882µ保留；当前14stopped/rev1942/sharedsettled8666261/reserved974882、6delegations/65closed/11audits，closure12待usage核对。COS59已审集成/CODING_REQUEST_TIMEOUT_SOURCE_READY，仅source/TEMP；COS60固定C7已审集成/TRANSFER_CASE_SEVEN_SOURCE_READY，actual main免费preflight因unknown正确拒/ledger bytes-mtime-filelist不变；须unknown0及closure12完成后才准入。COS61 PUBLIC_HUMAN_CODING_CONTINUATION_SOURCE_READY审批与source/TEMP结果保持，当前offline-verified-awaiting-human/source-integrated；前次人为单任务探针的生产缺口判断撤回。实际派生计划保留原design/art与当前coding三任务，仅coding有新grant；COS62实际生产factory/experience fixture组合1/1通过、源码未改，最终3文件test/docs已独审APPROVED/HUMAN_CONTINUATION_DELIVERY_VALIDATION_READY，唯一merger合入`fd1983a7b84f0ef4b8c611773d1a6d6ef018c957`并推送；[公共审批](https://github.com/lrfluobida/Cosmos/issues/63#issuecomment-5996443626)与closed/父checkbox精确读回，本卡source/TEMP回归范围complete。COS63合法公开入口RED确认报告重发与截止副作用后修复，已独审COMPLETED_GENERATION_RESUME_SOURCE_READY，合入`5815a0c455f20ed67dcbaa242f56f3383ec7707d`；[公共审批](https://github.com/lrfluobida/Cosmos/issues/64#issuecomment-5997549928)与本卡scoped complete/closed已精确读回。仅source/TEMP；reportedAt仍仅自动报告时间，完整cleanup计时缺口保持。COS64已审BATCHED_MEDIA_SOURCE_READY，合入`12899e5ad78db5302a1f9823ea0f67d0e4a7300d`，本卡source/TEMP范围complete/closed；629字段host/真实Edge及4544字段fixture通过，旧兼容11pass3fail保留、仅其中art-tamper在baseline复现，另两项未独立baseline。128/64容量不是经典名册分母。COS65已审STANDALONE_DELIVERY_SOURCE_READY，合入`82fb72735cdbfd5972cd5132336780c9594f5b9c`，本卡source/TEMP范围complete/closed；实际冷tsc/Vite/render/Node clean/Edge与晋升通过，185s helper提前停窄修为原deadline-5000。COS66已审GENERIC_PERSISTENT_SAVE_SOURCE_READY，合入`41abd8ae5186cca8cdac4822ae2d54137ec0c8ab`，本卡source/TEMP范围complete/closed；generic正常save/同profile-origin新PID重开及逐段认证媒体汇总通过。COS67已审CLASSIC_RUNTIME_POLICY_SOURCE_READY，合入`d07b0f8b71f1d7469f2ff81b26ab3bb8aceb7aaf`，本卡source/TEMP范围complete/closed；实际STARTUP/OFFLINE部分报告通过，固定230行、221reference_unknown和其余7未执行政策保留，reference未冻结/G4/完整经典未通过。COS68已审COMPLETION_TIMING_SOURCE_READY，合入`6c65ef8c4ba2106f3d9f6bb4910e993f1e600631`，本卡source/TEMP计时组件complete/closed；真实入口收敛与signed completion/legacy readonly通过，完整经典游戏实际12h成绩仍未测。COS69已审RENDER_FRAME_SAMPLING_SOURCE_READY，合入`51c5f9d6f935383f9cd3b6aee58f821614272637`，本卡source/TEMP采样组件complete/closed；可信native draw-frame数据及advisory绑定通过，PERFORMANCE仍未执行，设备/普通与压力工作量/窗口未冻结，230/221待核实与其余7政策partial保持。真实human确认/新窗口/paid NONE，COS18仍partial/open。源码开发继续，新的paid受unknown阻塞，沿用COS16原预算和时钟约束，进展见 [进度记录](../../PROGRESS.md)。

| 编号 | 要求 |
| --- | --- |
| R1 | Cosmos 是基于 pi agent 的、可扩展的 2D 游戏开发 agent |
| R2 | 首个完整能力目标是开发类《植物大战僵尸》游戏，百分百还原原版核心玩法与内容规模 |
| R3 | 美术原创，允许更简单的画风；角色应与原作一一对应且可辨识；界面布局大体相似 |
| R4 | 从一句话开始，由 design-agent 集中提问并确认需求；执行中自主推进，仅在预算或关键决策问题上寻求用户决定 |
| R5 | 重视 harness engineering，使任务执行、交接、验证和恢复受明确规则约束 |
| R6 | 正式单次生成验证硬上限 12h，包含生成、集成、修复、自动验收、打包和启动检查；优化目标 6h；平台开发另行安排 |
| R7 | 质量优先于成本，成本优先于速度；能力验证合计硬上限 ¥150；正式单次生成验证硬上限 ¥200，优化目标 ¥100；费用达到 80% 提示 |
| R8 | agent 大模型指定为 DeepSeek v4.1 Flash；已核实 API 标识为 `deepseek-flash`，支持视觉输入，实际 pi 接入需验证 |
| R9 | 当前本地硬件为 RTX 3060 6GB，DeepSeek 直接 API 已完成局部测试；美术服务与生产运行配置待验证，可考虑云端资源 |
| R10 | spec 与实施子任务发布至 GitHub Issues，以子代理隔离上下文逐项执行，并持续记录进度 |
| R11 | 首版 Cosmos 在 Windows 本机以命令行运行，交付可在桌面浏览器运行的游戏和完整源码 |
| R12 | 允许复用引擎、通用 2D 模板、测试工具和资产规范；游戏专属实现由 Cosmos 生成 |
| R13 | 经典 PC 版主要内容全纳入，包括冒险、迷你游戏、解谜、生存、禅境花园及商店、图鉴、解锁和存档；GOTY 新增项另列 |
| R14 | 机制和内容完整覆盖，关键数值与节奏对齐并规定容差；原作偶发 bug 单独排除 |
| R15 | 达到最终确定的硬时限时停止，交付当前版本与未达标清单，保留恢复能力，是否续跑由用户决定 |
| R16 | 包含背景音乐和关键操作、战斗音效；音频原创或可再分发；不含角色配音与片尾音乐视频 |
| R17 | 客观条目由 harness 自动验收并保留证据；用户在最终交付时试玩确认手感、美术辨识度和整体体验 |
| R18 | 用户会准备一份可运行的经典 PC 参考版本，用于核对内容、规则、出怪与关键数值；基准任务记录其精确版本 |

## 2. 系统与首个目标游戏

Cosmos 的产物是游戏工程及其验收证据。首个目标游戏用于验证端到端开发能力，后续需要通过不同需求检验能力能否迁移。

当前项目的实施子代理负责开发 Cosmos；目标游戏的专属实现应由完成后的 Cosmos 在生成运行中产出。验收保存来源记录，避免把开发者手工完成的游戏计为系统生成结果。

GitHub Issues 用于管理当前 Cosmos 项目的实施任务；首版生成运行使用本地状态与产物，不把 GitHub 账户作为每次生成游戏的必要条件。

首版实施范围：本机单用户、一次管理一个生成运行，运行内部可以并行执行任务；支持新建游戏与当前运行中的修复。多租户服务、公开托管、商城和任意旧游戏工程迁移列为后续扩展。

目标游戏的机制、内容与美术有不同验收要求：

- 机制和内容：形成完整清单，要求逐项覆盖；不以综合平均分抵消缺失内容。
- 美术：检查原创角色与参考角色的对应关系、风格一致性、动作可读性及界面布局。
- 运行质量：检查启动、输入、游戏流程、存档、性能和稳定性，默认阈值见第 4B 节。

范围已确定为经典 PC 版主要内容，GOTY 新增项另列。最终 spec 需要固定具体参考版本，附完整内容清单、关键数值、计时容差与参考来源；不能混用不同发行版的细节。

## 3. 角色划分

以下沿用用户设想，具体写入权限和输出契约在 COS-02 固定并验证。

| 角色 | 职责 | 候选主要产物 |
| --- | --- | --- |
| Cosmos-agent | 任务拆解、调度、结果收集、集成与审查 | 任务计划、运行状态、集成版本、交付报告 |
| design-agent | 通过提问完善需求，设计玩法与内容 | 需求契约、玩法规则、关卡与单位清单、验收条目 |
| coding-agent | 开发并修复游戏代码 | 工程、构建结果、实现说明和测试证据 |
| art-agent | 制作并处理游戏美术 | 风格规范、角色与动作资产、资产清单 |

Cosmos 为评审创建独立上下文，由评审读取固定要求与交付物。首版把评审作为 Cosmos 的职责；上下文独立不能消除同模型的共同盲点，客观断言与最终用户试玩共同补充验证。art-agent 同时负责音频资产清单与加工，coding-agent 负责接入，design-agent 明确触发时机。

## 4. Harness 执行契约

本节规定实施与验收要求，实际能力以对应任务的验证证据为准。

### 4.1 需求与验收固定

- 将用户确认的要求转成可引用的验收条目，注明参考版本和证据来源。
- coding-agent 与 art-agent 不得通过修改验收要求、删除失败场景或缩小内容清单自行宣布完成。
- 需要改变范围、还原精度或人工介入边界时，交由用户决定。

### 4.2 任务与交接

- 每项任务携带目标、前置产物版本、允许修改范围、输出契约、验收步骤和预算。
- 子代理只接收完成任务所需的上下文，包括相关规则、接口和已知失败；不默认继承完整对话。
- 上下文隔离、文件修改隔离和工具权限分别管理。并行写任务使用不同工作副本并限制文件归属；按模块批量交付，空闲副本可在产物已登记后复用。Cosmos 负责集成，只读评审使用固定产物快照。
- 产物带任务归属和版本；集成步骤检查代码与资产是否匹配。
- 任务输入最小字段：任务 ID、目标、验收条目 ID、前置产物版本、允许修改范围、相关规则、工具集合、剩余预算和截止时间。
- 任务输出最小字段：状态、产物路径与版本、变更摘要、验证证据、实际费用、未解决问题和建议下一步。
- 会话压缩保留验收条目、接口、版本、预算和已知失败；详细日志按需检索。新任务不会因继承完整历史而获得无关写入权限。

### 4.3 状态与进度

- 明确区分未开始、可执行、执行中、待审查、需要修改、通过、失败、等待用户和已取消。
- 保存任务依赖、尝试记录、会话位置、产物及验收结果，以支持中断后恢复。
- `PROGRESS.md` 服务于人和后续代理的阅读；恢复执行所需的精确状态应有结构化记录。格式和存储实现待定。
- 只在验收通过后标记完成。模型说“完成”或工具进程退出均不足以判定游戏达标。
- 候选状态路径：可执行 → 执行中 → 待审查 → 通过；审查失败进入需要修改，依赖未就绪保持未开始。取消和等待用户必须保留原因、最近产物和原运行额度。
- 重启、重试或给运行改名不能重置已用金额与原始截止时间；续跑只有用户明确决定后才获得新增额度或时间。

### 4.4 评审与返工

- 编写产物与评审产物使用不同上下文；验收读取固定版本的要求和工程。
- 自动试玩通过玩家正常输入操作游戏，并保留运行证据；辅助状态接口用于观测和诊断。
- 失败反馈包含复现步骤、实际结果和期望结果，再交给相应角色返工。
- 限制连续无进展的重试；达到阈值时重新拆解或上报。具体阈值待验证。
- 美术验收需要看到导入后的动画与界面；文本说明不能单独证明画面合格。
- 同一版本的已通过证据可复用；产物或其依赖改变后，仅重新验证受影响条目及必要回归。评审者不能改写验收标准来消除失败。

### 4.5 预算、时限与恢复

- 跟踪总耗时、各服务费用和已发出但未结算的请求；发起付费操作前检查剩余额度。
- 时限与金额上限触发后停止派发新工作，保存可恢复产物，并处理正在执行的子任务。
- 中断恢复复用已验收产物；付费生成请求状态不明时先核对结果，避免盲目重试和重复付费。
- 区分普通代码缺陷、外部服务错误、需求冲突和验收依据不足，采用对应处理方式。
- 在途请求按可能费用预留额度；预留与已结算金额共同限制并发派发，模型无法覆盖硬上限。
- 每项任务默认最多两轮定向修复是候选初值；同一失败重复或预计超限时重新规划。正式阈值依据验证结果确定。
- 能力验证的 ¥150 为各探针合计；正式生成的 ¥200 覆盖所有执行角色、评审、重试、美术、音频及额外云端算力。子任务不能分别获得一份完整总额度。
- 计时定义：需求契约确认、运行环境准备完毕后开始；至交付物、自动验收报告、打包和干净目录启动检查完成，最长 12h。最终用户试玩等待单独记录，不计作系统计算时间；运行中的服务等待、重试和暂停不自动延长原截止时间。
- 计时前准备仅包含工具安装、通用模板、参考游戏和需求资料；目标游戏的专属代码、可运行关卡数据与生成美术必须在计时和计费范围内产生。
- 到限前预留停止子进程与保存产物的时间。停止派发后取消可取消的调用、终止写入进程；无法撤回的付费请求已有额度预留，并进入待对账状态。
- 达到上限时保留最近可运行版本；若尚无可运行版本，应交付当前工程与失败原因，不将其标为可玩或验收通过。

### 4.6 事实与模型配置

- 游戏规则记录为已核实、推导或待核实；关键规则缺少依据时不能标记原版还原通过。
- 固定运行所用的配置与模型标识，记录服务返回的模型信息；不以其他模型悄悄替代用户指定模型。
- 优先使用 pi 现有 DeepSeek provider，验证工具调用、推理内容续接、会话压缩、恢复和截图传递。
- 真实直接 API 探针支持继续验证按任务配置推理：有确定性验收的小模块优先 low，复杂设计或难题按需提高。`finish_reason=length` 与不完整产物必须判为未完成，先调整任务或输出额度，再有界重试。数据见 [探针报告](../../probes/2026-10-01-deepseek/README.md)；尚不能当作 pi 集成或整款游戏验证通过。
- API 凭据通过环境配置提供，避免写入任务文档、游戏产物和进度记录。

## 4A. 实施路线与预算

正式单次生成验证采用用户确认的 ¥200/12h 硬上限，以 ¥100/6h 为优化目标。优化目标不是停止条件；超过目标但未到硬上限时，仍可在剩余额度内继续完成验收。首批有界探针在验证总额 ¥150 内累计不超过 ¥30，包含已发生的保守估算费用 ¥0.721771。额度代表停止约束，完整游戏的达标能力仍需实测。

采用二次穿刺确定的验证方向：模型按有界任务调用；确定性检查、构建和输入回放由程序执行；美术优先验证程序图层、关键姿态和少量生图结合；同一生产模拟通过等价性检查后用于加速全量规则测试，真实输入和原速渲染验收另行覆盖。完整内容分母保持原要求。

初始实施路线为 pi SDK + TypeScript 编排器、Phaser 游戏工程和 Playwright 浏览器自动试玩。SDK 提供会话、工具和事件，独立编排器负责长任务状态和交付目录。先通过接入与端到端探针；若验证发现影响目标的缺口，记录替代方案与证据后调整技术路线。

美术位图由独立工具生成或加工，DeepSeek 负责需求、调用和视觉评审。先验证少量角色的一致性与动作，不预先承诺在 RTX 3060 6GB 上本地完成全部生成。服务供应商尚未选定。

正式单次到 ¥160 提示，到 ¥200 停止新增费用；在途请求预留计入判断。初始分配建议为模型 ¥75、美术 ¥70、其他服务 ¥15、返工余量 ¥40，合计 ¥200，可在总额内调配。通过关键帧、图层与程序动画控制图片调用量，复用已验收素材。费用算例和实际探针分别见 [二次穿刺](../research/2026-10-01-cost-latency-challenge.md) 与 [真实记录](../../probes/2026-10-01-deepseek/README.md)。

## 4B. 验收默认值与边界

以下为实施默认值，COS-01 将其与固定参考版本对应；如验证发现需要改变验收要求，应明确记录差异并取得用户决定。

| 类别 | 候选验收条件 |
| --- | --- |
| 浏览器与交付 | Windows 桌面 Chrome 或 Edge 当前稳定版本；提交锁定依赖的源码、构建产物、本地启动说明和验收报告；验收记录具体浏览器版本 |
| 网络与存档 | 游戏完成构建后不依赖模型服务；本地浏览器可以游玩和保存进度；新档、重新打开浏览器后的恢复与重开均验证 |
| 语言与操作 | 默认简体中文界面，鼠标操作；画面按经典布局比例适配桌面窗口；触屏与移动端另行扩展 |
| 内容覆盖 | 固定参考清单的每项机制、角色行为、关卡、模式、解锁和存档规则均有对应实现及证据；缺项不能被其他高分抵消 |
| 数值与时间 | 离散费用、生命、伤害、购买和解锁条件按参考条目对齐；持续时间与动作节奏默认允许 ±5% 或一个模拟步长的较大者；具体例外单列，未经核对的数据不能声称通过 |
| 普通流程 | 新档到最终冒险关的进度可达；特殊关、二周目、其他模式及经济系统各有验证；测试可以准备前置状态，但关键购买、解锁与跨关存档链必须走正常输入 |
| 无尽模式 | 验证规则循环、难度增长和至少 30 分钟稳定运行，记录覆盖波次；有限测试不能证明无限局面的全部行为 |
| 美术与音频 | 角色对应可辨识，必要动作与状态可读，无阻断操作的遮挡或透明脏边；界面布局大体相似；音乐和关键音效可播放且可调节 |
| 性能与错误 | 在冻结的本机验收配置上，1280×720 目标窗口下普通关卡平均不低于 55 FPS，无尽压力场景平均不低于 30 FPS；运行无崩溃、未处理异常、存档损坏或核心流程阻断 |
| 生成能力 | 固定 Cosmos 与模板版本，从无该游戏专属代码的工作目录生成；运行记录可追溯角色、工具与人工介入；另用一个小型不同机制任务验证迁移，单列时间与费用 |

整套验收区分自动通过、自动未通过和等待用户体验确认。用户体验验收通过后才声明最终完成；自动报告应列出未覆盖条目和已知差距。

参考游戏的精确版本和名册先作为内容基准任务交付，记录来源及冲突。GOTY 新增成就、Steam Cloud 与 Zombatar 首版候选默认排除；经典内容不因这些新增功能排除而缩减。

## 5. 必须先验证的能力

1. 指定 DeepSeek 模型在 pi 中完成工具调用、文件编辑、错误修复、上下文延续和取消。
2. 在候选平台构建一个可操控场景，并通过输入和画面证据检查；人为引入输入故障时测试能够失败。
3. 一关包含资源、冷却、波次、胜负和重开的完整游戏能由独立评审验收。
4. 同一原创角色的多个动作可导入游戏，尺寸、锚点、帧序和透明边缘符合约定。
5. 并行编码与美术产物冲突能够被识别，恢复不会遗漏任务或重复消费已完成的付费结果。

验证切片用于决定后续实现路径，不能替代完整内容目标的验收。

## 6. 任务拆分候选

最终拆分以确认后的范围与技术验证结果为准。

| 阶段 | 候选交付 | 主要前置 |
| --- | --- | --- |
| A | 固定参考版本、内容清单、还原容差和最终验收契约 | 用户完成范围决策 |
| B | pi 与指定模型的能力验证报告 | 确定可用模型及访问方式 |
| C | 任务、上下文、产物、预算与恢复的最小执行闭环 | 任务与产物契约、B；不等待完整参考清单 A 冻结 |
| D | 目标平台的运行、操控与证据链路 | 确定平台 |
| E | 一关完整游戏与原创动画资产的端到端交付 | C、D、资产格式 |
| F | 分批扩充完整机制、单位、关卡、模式和界面 | A、E |
| G | 完整验收、失败修复与不同需求的迁移验证 | F、运行预算与迁移用例 |

每项实际 issue 需要明确输入、输出、依赖、文件范围和验收证据。纯调查完成、验证通过、正式功能完成应使用不同的完成条件。

具体拆分见 [75 项任务卡与依赖关口](cosmos-issues.md)。平台实施可与参考资料核对并行；完整基准验收工具的最终版本与完整生成必须等待基准冻结。正式生成的最终打包和干净目录启动检查计入同一次 ¥200/12h；只有等待用户试玩单独记录。父任务完成还需要小型不同机制迁移验证通过，其付费验证共享 ¥150 余额。

## 7. 执行前置与验证关口

| 编号 | 问题 | 当前建议 |
| --- | --- | --- |
| 已确定的外部前置 | 用户准备可运行经典 PC 参考版本 | 基准任务记录版本并核对资料冲突，不凭模型记忆补齐关键规则 |
| 已确认上限 | 单次费用与硬时限 | 硬上限 ¥200/12h；优化目标 ¥100/6h；完整运行验证负责报告是否达标 |
| 技术验证 | 美术服务、pi 与 DeepSeek 实际兼容性 | 先执行小范围验证再固定实现 |

## 8. 调研与进度

- [首轮可行性调研](../research/2026-09-30-feasibility.md)
- [模型、内容基准与预算依据](../research/2026-09-30-model-budget.md)
- [成本与时长二次穿刺](../research/2026-10-01-cost-latency-challenge.md)
- [真实 DeepSeek 探针](../../probes/2026-10-01-deepseek/README.md)
- [领域术语](../../CONTEXT.md)
- [进度与访谈记录](../../PROGRESS.md)
