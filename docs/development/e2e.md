# COS-10 端到端切片：冻结需求与执行准备

**状态：一次性续跑在评审 JSON 协议检查处未通过。** COS-07 与 COS-09 已独立评审并合入。目标游戏尚未生成或验收通过，COS-10 仍未完成；已使用的 continuation 入口不能再次调用。

续跑补充（2026-10-01）：首次真实运行的原生规划和设计已产生，6 个请求均由 `deepseek-flash` 返回并结算；新增 80447 micro-CNY，共享累计 816418。设计作者把尚未进行的宿主/下游工作写入阻断 handoff，导致捕获完成后未进入主机验收。原失败记录保留，游戏尚未生成或通过。下面的一次性续跑仅处理这个已定位的形态。

第二次结果：只读设计澄清进入主机验收并取得一条 passed 证据，但评审返回 `approved` 和 10 条正面核对说明。版本引用与 evidenceIds 正确，`parseReview` 仍拒绝 approved 与非空 findings 的组合；任务保持 `waiting_user`，review 未持久批准。总请求为 13，共享累计 892282 micro-CNY，预留和未知费用均为零；原 `09:48:34.671Z` 截止时间及两次失败记录保持不变。

## 已冻结的输入

- `probes/e2e/requirements.json` 是 `cos10-pilot-v2` 需求：原创《星庭守望》，3 路 6 列，一关两波；资源生产、投射物、阻挡、普通与装甲敌人、胜负、重开和本地存档。`specVersion` 保持共享运行的 `1.0`，具体需求用独立 sourceArtifactId / version 冻结。
- 中文可见界面，1280×720 逻辑坐标；正常游戏与验收使用同一 1 倍速规则、固定种子和短关卡。需求中的尺寸、数值、波次和观测字段在模型生成前冻结。
- `probes/e2e/acceptance.ts` 固定正常鼠标路径；读取只读 `cosmosDebug` 与可见状态文字，不暴露状态写入、作弊按钮或测试专用胜利模式。
- 这份需求允许简化原创美术；原版完整机制、内容规模和体验验收仍由后续完整基准任务负责。
- v2 在首次付费生成前经主代理批准增加 `PILOT-DESIGN` / `PILOT-MEDIA` 阶段验收与实际素材加载/播放的只读观测。两项阶段通过只支持角色交接，原八项玩法验收和全部 additionalHostChecks 保持完整。

所有游戏专属 TypeScript、可执行关卡数据和 MediaSpec 必须由运行角色新生成。需求与验收程序是平台输入，不能直接拿来冒充模型输出。以前的直接 API 探针和 COS-04 样例只说明格式，不作为新游戏代码或资产。

## 实施计划

**Goal:** 在已批准 SDK、角色、产物、媒体和验收模块上完成真实生成，保留同一版本的正常输入证据及完整费用。

**Architecture:** 主机冻结需求和规则，Cosmos 角色生成有界计划；design、coding、art 在各自权限内产出固定版本。可信主机只负责通用模板、媒体渲染、登记、构建和输入回放，独立角色评审通过后才提升交付版本。

**Tech Stack:** Windows、Node 22.22.2、TypeScript、pi SDK 的 `deepseek-flash`、Phaser、Playwright。

- [x] 冻结需求、界面和正常输入验收路径。
- [x] 先写门禁测试，覆盖依赖未合入、共享账本缺失历史费用、在途/未知费用、预算不足、截止时间和秘密环境变量过滤。
- [x] 实现无付费副作用的准备接口。它不创建账本、不派发模型请求、不宣称游戏通过。
- [x] 准备提交 `e89a323` 已获独立 `APPROVE_PREP_ONLY`；COS-07 / COS-09 已合入。
- [x] 接通角色与产物生产入口，验证入口拒绝不完整计划、原截止时间/总请求数保护、进程取消和评审路径边界。
- [ ] 驱动提交由独立评审检查；主代理随后运行真实生成。
- [ ] 在共享账本持锁期间登记唯一运行起点，保存冻结输入、平台与模板版本、依赖批准 SHA、媒体接口、费用与人工介入记录。
- [ ] 用 design 的需求确认接口接收冻结输入，调用 Cosmos `planTaskDag` 生成有界任务，而非在探针中写死塔防任务图。
- [ ] 执行设计、代码和美术任务；媒体仅由 `renderCharacter` / `synthesizeWav` 渲染角色新输出的规范。
- [ ] 登记不可变 captures，按准确输入版本 stageCandidate；主机 build + 浏览器验收，独立上下文评审后 promoteCandidate。
- [ ] 若失败，保留证据，最多通过角色进行一次受限修复；原账本、截止时间、失败历史和请求数不重置。
- [ ] 交付已接受游戏的独立启动目录、源码、锁文件、媒体来源、费用/时长、输入回放和具体差距；达到门槛后才报告 COS-10 通过。

## 门禁与运行上限

`preparePilot` 只接受已有 `RunController.read()` 快照。调用者负责打开 `E:/develop/Cosmos/.cosmos/validation-shared`（runId `validation-2026-10-01`，ledgerId `cosmos-validation`），读取 `docs/specs/github-issues.json` 中 COS-03 至 COS-09 的批准信息，并把 `isAncestor` 绑定到可信 Git 命令，检查 reviewedCommit 和 mergeCommit 都已包含在正在运行的 `main` HEAD。不得把模型文本当批准记录。

门禁要求共享验证账本包含 `prior-deepseek-direct-probes` 至少 721771 micro-CNY 已结算费用；既无在途请求也无未知费用；现有 COS-10 规划分配不超过 ¥10。其他已有分配不能当作新的免费额度。`preparePilot` 拒绝已存在 COS-10 请求的账本，后续恢复必须走保存的原运行记录，不能再次准备来延后截止时间。

第一阶段累计上限 ¥30，包含所有既有验证费用。主机给新任务的分配合计最多为：

```text
min(共享账本未分配金额,
    30,000,000 - 既有全部已结算/预留金额 - COS-10 完整规划分配)
```

已知起点是 735971 micro-CNY，规划分配 10000000，因此新任务合计最多 19264029。真实运行前重新读取账本计算，不能硬编码旧余额。设计/编码/美术、独立评审和一次修复的分配都在这个余额内。规划费用记到原 COS-10，新增任务通过 RunController 登记，不另开免费账本。新增 taskId 使用本次切片唯一前缀，主机校验计划 ID，避免共享账本后续任务重名。

整次最多 90 分钟、40 个实际模型请求、3 个规划角色任务、一次跟进修复，每任务最多两次尝试。主机应在第一次调用前将起点与请求计数持久化，以原运行账本截止时间和 90 分钟中较早者为准；超时信号传到所有角色、媒体加工、构建、预览和验收。准备接口返回的时间只是本次首次启动的候选值，不能替代持久化运行控制。

生产入口先在持锁的共享账本目录中用 `wx` + `sync` 写 `cos10-pilot.json` 起点标记，再用 `pilot-budget.json` 固定截止时间和全局请求 ID，并在原截止前 5 秒停止新工作以留出清理时间。后续计数用临时文件替换；入口见到已登记起点或既有费用便拒绝自动重开。因此即使首次请求尚未 reserve 就崩溃，也不能改时间目录延后原截止。计时前的通用依赖安装记录不代表生成起点。进程崩溃后的自动恢复属于 COS-12，当前入口保留状态供核对。

`requestReservation` 使用已批准峰值价格：文本输入按 UTF-8 字节数的保守 token 上界，输出按 maxOutputTokens；含图片请求预留完整 1M 上下文输入。模型不能提供价格或预留值。每个模型请求都必须经过同一个控制器 reserve/admit/settle；未知费用保留预留并停止继续派发。总数包含规划、工具续接、评审和修复。

## 固定正常输入验收

1. 标题页启动并检查中文可见状态。
2. 立即重复放置射手，验证冷却拒绝不扣资源、不新增单位；等待真实冷却结束后正常放置成功。
3. 用三个射手花完 300 资源，再购买防守单位，验证资源不足拒绝不扣费、不放置。
4. 重新开始，验证资源、战场、波次、子弹、冷却与本局计数回到初始状态。
5. 放置一个生产者和三个射手，等待真实产能攒够防守单位费用，在上路最右格放置防守者；观察其实际承伤，然后消灭两类共六个敌人并胜利。
6. 保存胜利次数和静音偏好，点击可见“返回标题”链接进行同源整页重载，验证 localStorage 恢复。
7. 开始新局且不布防，等待敌人真实穿线失败，再重开并核对初始状态与保留存档。

上述路径交给现有 `runAcceptance`，总超时 180 秒，保存截图、视频、浏览器版本、日志和固定版本报告。资源生产的正常周期和冷却就绪值用于等待，不改动模拟时钟。

浏览器路径不单独证明资产原创或音频可听。主机另外检查模型会话到新 MediaSpec 的来源、登记媒体清单、游戏导入后的动作画面与实际音频播放证据，提供给独立评审。仅报告已覆盖的动作、音效和场景；缺证据则保持未通过。

## 主机执行边界

- 子进程使用参数数组、`shell: false`、`windowsHide: true` 和 `filteredChildEnvironment`；模型 key、NODE_OPTIONS 和 npm 执行配置不进入游戏构建/预览进程。
- 只能复用通用模板和主机工具；不要从其它 worktree 复制角色、产物模块或生成游戏实现。
- 构建/验收输出必须绑定同一个 candidateRef；独立评审读取固定要求、固定工程、媒体及主机证据，不能继承作者自由会话。
- 自动验收失败、独立评审拒绝、费用未知、触及费用或时间上限，均保留当前产物并停止“通过”提升。
- 平台实施者发现游戏缺陷时，只能把可复现失败交回原运行角色修复，并记录成本与失败版本，不能手工改游戏后声称自动生成。

## 生产入口与固定版本

由主代理在已审查并合入的 `main` 上执行，凭据只通过当前进程环境提供：

```powershell
node --experimental-strip-types probes/e2e/run.ts --preflight
node --experimental-strip-types probes/e2e/run.ts
```

第一条只读取已有共享账本并检查依赖/预算；第二条先安装通用模板锁定依赖，再固定生成起点。输出位于 `.cosmos/e2e/pilot-<时间>/`。`origin.json` 保存平台 SHA、原账本与预算；`confirmed-requirement.json`、`plan-reference.json`、原生 `sessions/`、`registry/`、`browser-evidence/` 与 `result.json` 串起需求、模型输出、版本和主机证据。`run.ts` 是薄命令行入口；`driver.ts` 直接调用现有角色、编排器和登记器。

作者共享本次工作根，但只写 `authors/design`、`authors/art` 或 `authors/coding/src` 与 `index.html`。模型计划决定任务 ID、目标、覆盖项与依赖；主机只约束角色接口和权限，并检查 coding 声明消费 design/art 产物。设计、美术、编码与保留修复额度分别占新增上限的 10%、30%、40%、20%。

原生 SDK 仅增加已有版本 `typebox@1.3.27` 的直接声明，用于两个固定无参数工具：`check_media` 校验当前美术规范；`check_project` 在隔离构建目录执行实际 tsc/Vite，返回有限诊断。模型不能传命令、cwd 或增加依赖。代码作者可在同一受限任务中根据实际诊断修正；最多允许 8 次主机自查。

主机把游戏专属代码、设计与新渲染媒体分别登记为不可变 capture，再按这些精确版本 stageCandidate。构建在候选外进行，只把新 dist 放回候选。`verifyCandidate` 的 `attemptId` 写入固定主机报告，评审读取单独目录里相同相对引用的源码、素材和证据，之后 `promoteCandidate` 绑定该 proof、该次评审者和上下文。

如果最终编码候选未通过，且设计/美术已经独立通过，驱动至多创建一个显式 coding 修复任务。它读取失败报告，输出 `v2`，使用同一预算日志和原截止时间。失败记录保留。上游设计/美术失败会保留具体状态并停止后续生成；本切片不宣称已实现 COS-11 的通用自动重规划。

最终 `result.json` 只有在正常输入、固定版本主机验证和独立评审全部通过后才写 `outcome: passed`。其中的 accepted 位置同时包含源码、锁文件和 dist，按模板的 `npm ci`、`npm run build`、`npm run preview` 可独立启动。原速视频与截图证明本切片的实际流程；音频报告记录加载、播放触发和静音行为，人耳试听不由这些字段替代。

## 准备验证

```powershell
node --experimental-strip-types --test tests/e2e/*.test.ts
```

这些测试验证输入与门禁，不执行付费请求、不生成样例游戏，也不代替后续真实游戏的浏览器证据。

## 一次性 handoff 续跑

```powershell
node --experimental-strip-types probes/e2e/run.ts --continue
```

此入口只读取原共享账本旁的 marker 来定位原目录，不接受新目录、计划、版本、计数或时限参数。它校验 marker/origin/journal/result/native plan 与当前已登记任务一致，要求旧设计恰有一次失败和固定 v1 capture，旧美术/编码均没有尝试、产物或证据。已使用 continuation、在途/未知费用、过期、变更后的计划/输入/版本和计数均拒绝。

宿主先用 `wx` 写 `continuation-origin.json`，记录原请求计数、原计划引用、明确的旧→新任务映射、固定设计版本和新增分配。旧零尝试 art/coding 经公开 `saveTask` 合法取消，并说明继任原因；旧设计失败终态、旧依赖和所有旧 allocation 都不改写。新 art/coding 逐字段复制原计划，仅更新新 ID、actor/context 和声明的依赖映射，并追加继任说明；目标、验收、工具、写路径和输出引用不变。

唯一修复名额用于新只读 design-handoff：原生角色只判断设计阶段真实缺项，宿主/下游未执行事项属于 summary；真实未完成或不确定项仍受原非空门禁阻断。它不能写设计文件，复用 exact design v1，由同一套主机验收和独立评审检查。这是逻辑设计尝试 2/2，之后美术/编码各自第一次执行，禁止再追加 coding repair。

本次经协调者明确授权调整内部继任分配：新 design 为 500000 micro-CNY，art 为 5779208，coding 为 7705611，合计 13984819；旧 55411221 分配原样保留，新 shared allocation 合计 69396040，仍小于 150000000。被替换任务的旧额度不再由本入口派发，记录保留供审计。allocation 是任务权限上限，不是已发生或已预留费用；此调整没有增加用户费用硬上限。

`openPilotGuard` 在共享 controller 持锁期间读取并校验既有 journal，保留原 6/40 计数并仅追加请求 ID；不重建账本、不重跑 planning、不重置起点。共享实际费用加在途预留仍逐请求受累计 ¥30 限制，原截止仍是 `2026-10-01T09:48:34.671Z`，平台修复期间的时间也计入。后续写 `continuation-result.json`，原 `result.json` 不覆盖。任一步失败保留现状，不提供第二次 continuation 或通用进程恢复。

## 评审协议提示修正

原 reviewer 提示只声明 `findings:string[]`，没有把 findings 限定为未解决缺陷；解析器始终要求 `approved` 对应空数组、`changes_requested` 对应至少一条缺陷。现已在提示中明确同一条件：正面核对与解释不得写入 findings，真实缺陷必须保留且不得为获得空数组而隐去。解析器不变，旧 proposal 不改写、不清空。

使用真实 author/reviewer 最终 JSON 在临时 controller 回放，结果为 `verifies=1, reviews=1, state=waiting_user, recordedReview=pending, evidenceCount=1, paidRequests=0`，保持原拒绝行为。四种离线协议组合分别验证正面非空批准被拒、空缺陷批准通过、空缺陷变更请求被拒、真实缺陷变更请求进入 needs_changes。提示修正不是本次 pilot 已通过的证据；后续受约束协议纠错由 COS-11 处理，不属于新增付费或再次 continuation 授权。

## 固定新试验实施计划：cos10-cos11-validation-1

**Goal:** 在已有协议/修复实现发生实质变化后，使用同一共享账本执行且只执行一个独立新 trial；旧 pilot 的两次失败保持不变。

**Architecture:** 新 trial 使用固定身份与 write-once marker/root，复用 `generatePilot`、原 guard 和原生角色；可信主机诊断接入 COS-11 feedback/assessRepair/createLinkedRepairTask。仅允许已通过设计/美术之后的编码构建或正常输入缺陷进行一次关联修复。

**Tech Stack:** 已批准的 Node/TypeScript/pi/Phaser/Playwright 与 COS-11、COS-12 Phase A 公共接口；不修改核心契约或恢复模块。

- [x] 新增 `trial.ts` 的固定身份、批准祖先/原账本/旧失败引用检查、60 分钟与 40 请求限制、一次性持久标记；验证重复入口、过期及在途费用拒绝。
- [x] 新增 `diagnostics.ts`，从确定的 TS/Vite 编译诊断和固定浏览器断言构造可信失败；失败报告中的通过步骤只作为 progress witness。
- [x] 在 `driver.ts` 显式开启每评审 attempt 一次协议纠错，并以 COS-11 关联任务替代新 trial 的临时手写修复路径；新版本执行完整主机检查和独立评审。
- [x] 使用真实 driver、原生会话边界注入和小型主机夹具离线验证预算、失败反馈、版本与 proof；夹具不是目标游戏生成证据。
- [x] 对受影响测试、probes 类型、UTF-8 与差异完成检查，准备独立评审提交。
- [ ] 独立评审合入后，仅由主代理启动这个新 trial 的付费运行。

固定限制：需求仍是 cos10-pilot-v2 的八项玩法验收与全部 host checks；共享验证总限额 ¥150，全部验证实际费用加在途预留仍累计最多 ¥30。新 trial 最多 60 分钟，且不得晚于共享原截止 `2026-10-01T18:16:16.857Z`；40 请求包含规划、工具续接、评审协议纠错和语义修复。设计/美术/编码/修复 allocation 分别为 1900000/5700000/7600000/3800000 micro-CNY；仅需要修复时登记最后一项。原 COS-10 planning allocation 继续计费，所有旧分配和费用保持连续。

新 marker/root 固定为 `cos10-cos11-validation-1`，不接受任意试验名；存在或部分创建即拒绝再次启动，不换目录重开。新规划、设计、媒体与代码均由 native Cosmos 重新生成。原设计、原生计划和旧评审不作为新试验输出。COS-11 尚不自动处理上游版本变更后的下游重新规划、作者 handoff 语义纠错或没有可信主机诊断的评审 prose；这些情况保存具体缺项并停止，不扩大 trial 或 repair 次数。

新入口（仅主代理在独立评审合入后的干净 main 上运行）：

```powershell
node --experimental-strip-types probes/e2e/run.ts --trial-preflight
node --experimental-strip-types probes/e2e/run.ts --trial
```

预检只检查已有账本与旧失败记录。正式入口独占创建 `.cosmos/validation-shared/cos10-cos11-validation-1.json` 和 `.cosmos/e2e/cos10-cos11-validation-1/`；marker 与 origin 用 `wx` 并同步落盘，目录的部分创建也消耗本次机会。正式起点后的工具准备、生成、修复与验收均计入新 60 分钟。旧 pilot marker、两份结果、13 请求日志及旧截止保持原样。

新 origin 保存实际已批准祖先，包括 COS-11 的 reviewed/merged SHA 及其仍为 open、offline-verified 的状态，旧失败结果引用、全部历史已用金额和原共享截止。本次准备时账本已用 892282、预留/未知均为零；累计阶段余额为 29107718 micro-CNY。后续结果同时报告本 trial 消耗与共享总额，不能把 allocation 当作费用或创造新 ¥30。新试验可以有自己的 0/40 请求起点，但旧日志不重置；所有请求继续追加到同一共享账本。

确定的生成源码编译诊断映射到 `build/typecheck` / `build/vite`；健康浏览器中的固定断言实际值不符映射到 `browser/<固定 step ID>`。环境退出、生命周期错误、不可用观测或版本/步骤不一致保持 `insufficient_evidence`。整体失败报告中的通过行仅作为 `HostPassedCheck`，引用该 failed 报告，不产生可完成任务的通过证书。

设计和美术通过之后，仅 `assessRepair` 判定为 `repair` 的编码缺陷会派发一次新任务。主机还检查更紧的 trial 时间、40 请求和累计 ¥30；默认修复估计为 3000000 micro-CNY、10 分钟、5 秒清理和 8 个请求。`retry_service`、`collect_evidence`、`wait_user`、`replan` 都只保存决定，不在本 trial 里偷偷新增尝试。原生 feedback 字节被复制为只读接口，相关固定主机报告也加入只读引用。修复输出使用新 v2，重新完整构建/验收/评审，提升仍要求匹配的本次 proof.attemptId。

离线生产 driver 回归使用原生会话边界注入和非游戏小夹具：实际 TypeScript 编译产生 TS2322，COS-11 形成反馈并创建 v2 修复任务；正确 v2 报告被接受，伪用 v1 浏览器报告被拒绝。一次错误 review JSON 在同一评审会话纠正，模拟请求数和费用连续进入 guard。另有真实 Edge 普通点击的失败用例验证浏览器诊断。上述回归不证明目标游戏已经生成、实际语义修复已经成功或新 trial 已通过。

准备验证记录：e2e 与 COS-11 repair 组合共 78 项，77 项在并行批次通过；真实浏览器诊断夹具与两轮编译同时运行时触发既有 1 秒清理截止。编译全部结束后，该单项串行重跑通过（普通输入缺陷保持 failed，并得到正确诊断）。沿用已确认的资源约束：真实 browser fixture 不与 tsc/build 并行。未改 COS-08 时限或忽略清理错误。probes 专项 strict TypeScript、主 typecheck/build 与 UTF-8/LF 检查通过。
