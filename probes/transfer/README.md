# COS-16 网格推箱子迁移用例

状态：**preparation-only / open**。本文件固定 host 选定的迁移测试用例和验收要求；尚未生成或验收目标游戏，也不代表用户体验验收通过。

任务：[COS-16 / #17](https://github.com/lrfluobida/Cosmos/issues/17)。执行须等待 [COS-10、COS-13、COS-18](../../docs/specs/cosmos-issues.md) 通过，沿用相同角色契约和通用 2D 模板，经 COS-18 的公开需求与生成入口开展。本文不构造用户确认；需求入口须保留真实确认来源及对应的准确输入版本。

## 固定需求

- 单关离散网格解谜，地图不超过 8×8 格，恰好一个玩家、两个箱子、两个目标，地图边界封闭。
- 简体中文界面；提供可见、可点击的“开始”“上”“下”“左”“右”“重新开始”和存档后的“继续游戏”按钮。方向操作全部可用鼠标完成。
- 每次方向点击最多移动一格。玩家遇墙不能移动；箱后为空地或目标时才能推一格；箱后为墙或另一个箱子时，玩家和箱子均不移动，不能一次推动两个箱子。
- 一次合法行走或推箱使步数加一；被阻挡的输入不改变玩家、箱子、目标占用或步数。
- 仅当两个箱子全部位于两个目标上时显示“胜利”；只有一个目标被占用时不能胜利。
- “重新开始”恢复该关初始玩家位置、箱子位置、目标占用、步数和非胜利状态，并将存档更新为这一初始状态。本用例要求重开，不增加撤销功能。
- 每次合法移动后自动保存当前关卡、玩家与箱子位置、目标占用、步数及胜利状态。中途关闭浏览器进程后，使用同一隔离 profile、同一 origin 重新打开，通过“继续游戏”准确恢复。
- 玩家、箱子与目标使用本次运行生成的原创简单几何美术，轮廓和状态可辨识。不引入物理模拟、战斗或多关卡扩展。
- runtime design 产出可覆盖下列所有场景的地图，以及不超过 40 次合法移动的通关解法；推箱计作一次合法移动。

## 固定正常输入验收

验收 ID、操作语义与通过条件在生成前固定。具体地图、合法路径和对应状态由运行中的设计产物绑定，按下一节冻结后执行。

| 验收 ID | 正常玩家路径 | 通过条件 |
| --- | --- | --- |
| T16-01 | 无既有存档的隔离 profile 中打开游戏，点击“开始”。 | 出现单关棋盘、一个玩家、两个箱子、两个目标、四个方向按钮和重开按钮；初始步数为零且未胜利。 |
| T16-02 | 按冻结路径行走一格，再走到墙边并向墙点击。 | 合法行走恰好一格且步数加一；碰墙前后玩家、箱子、目标占用及步数均一致。 |
| T16-03 | 经正常方向点击分别到达可推箱、箱后为墙、箱后为另一箱子的局面，再尝试推箱。各场景可通过可见重开按钮重新开始。 | 可推时玩家进入箱子原格，箱子向前一格，步数加一；后两种局面整次输入无效，不能推墙或连续推动两个箱子。 |
| T16-04 | 至少完成一次普通行走和一次推箱后，点击“重新开始”。 | 玩家、两个箱子、目标占用、步数、胜利状态及保存状态恢复该关初始值。 |
| T16-05 | 重开后至少完成一次普通行走和一次推箱，停在非终局；记录保存完成的状态，真实关闭浏览器进程，再用同一隔离 profile 和同一 origin 启动并点击“继续游戏”。 | 关卡、玩家、两个箱子、目标占用、步数及非胜利状态与关闭前一致；保存状态不能只由同页读档证明。 |
| T16-06 | 从恢复后的局面按冻结解法继续点击，先完成一个目标，再完成全部目标。 | 一个目标到位时仍未胜利；两个目标全部到位后显示“胜利”，实际棋盘画面与状态断言一致。 |

所有棋盘状态变化都通过可见按钮的正常鼠标输入触发。辅助状态接口只用于观测，不能设置玩家位置、箱子、胜利状态或存档，也不能调用内部移动函数代替点击。验收保留固定工程版本、浏览器版本、1280×720 viewport、点击计划、逐步期望与实际值、截图、录像及浏览器日志；页面异常、核心断言失败或必要证据缺失均不能通过。

## 生成与验收计划的冻结边界

1. 生成前冻结本文件的需求、验收 ID、按钮语义和预期规则；准备通用环境、模板及验收工具。本文件不提供地图数组、具体解法、游戏代码或素材。
2. 在生成运行的计时和计费范围内，由 runtime design 生成可执行关卡数据、各碰撞场景的访问路径和不超过 40 次合法移动的解法。所有场景都须从新档、正常重开或已验收的继续游戏状态可达。
3. 可信 host 依据已固定规则校验设计产物：数量、边界、可解性、场景覆盖及每一步期望状态。不能仅采信 design 自报“通过”，也不能从待验收游戏的实际输出反推期望。校验失败交还设计角色在同一次运行内修复。
4. host 校验后冻结设计版本、地图版本和具体鼠标点击 plan，再提供给 coding-agent 与 art-agent。验收读取这些固定版本；编码、美术角色无权改写验收规则、地图依据或预期状态来消除失败。
5. 游戏专属实现、可执行关卡数据、图形规格和最终素材均由 Cosmos 运行时角色产生，记录作者、角色调用、输入输出版本、工具、费用及人工介入。人工准备需求和验收工具，不能预制目标游戏再补运行记录。
6. 对冻结候选工程执行构建、正常输入验收和独立评审，记录新增的平台通用能力与所有人工修改。复用同版本已通过证据，仅对实际受影响条目补验。

## 复用能力与待补接口

复用通用 Phaser 工程、[角色与固定版本交接](../../docs/development/roles.md)、[正常输入验收](../../docs/development/acceptance.md)、[原创几何素材工具](../../docs/development/media.md)、[产物登记与集成](../../docs/development/artifacts.md)以及共享运行账本。先核对 COS-10/13/18 已交付能力，只补仍存在的缺口。

- **隔离 profile 生命周期**：当前正常输入验收每次创建无既有存档的浏览器上下文。需支持持有同一个测试专用 profile，真实关闭浏览器进程，再以相同 origin 重开并保留完整证据。仅刷新页面、同页读档或向新上下文注入预制存档均不能替代 T16-05。
- **可信点击 plan 绑定**：需要将 runtime design 的关卡和路径经 host 独立校验后绑定到固定验收 ID、版本与预期状态；保持角色写入隔离，避免生成游戏自行定义通过标准。
- **通用入口与费用归属**：经 COS-18 切换需求、角色产物和验收配置，复用 COS-10/13 的执行能力。若更换核心规则必须手改编排器的塔防专属分支，应记录迁移失败。角色、评审、修复和素材费用都归入 COS-16 原有额度，不因新增子任务再获得一份额度。

## 预算、时限与完成状态

- 沿用共享验证总额 **¥150**，首批有界探针**累计不超过 ¥30**；这些是既有总额约束，不是本用例新增可用额度。
- 沿用 COS-16 原有 **10,000,000 micro-CNY（¥10）allocation**。全部相关调用先在同一共享账本预留，结算、在途与未知费用共同受原约束控制；不能创建第二本账本或另加角色额度绕过限额。
- 保留原运行身份、已用费用、原始截止时间及停止状态；改名、重开或恢复不能重置预算和时限。
- 本次仅落地用例文档，**不授权新付费试验，不生成游戏，不启动或重跑原试验**。执行须先满足上述依赖和原运行的准入条件；到限或准入失败时记录具体阻塞，不自行续跑。
- COS-16 继续保持 **preparation-only / open**。未来通过须有本次 Cosmos 生成来源、全部固定验收证据、独立评审、费用与耗时记录及人工修改说明；迁移通过只说明这个不同机制用例通过，不代表任意 2D 游戏能力或用户体验已获认可。

## COS-36 可信设计接口（源码准备）

[COS-36 / #37](https://github.com/lrfluobida/Cosmos/issues/37) 的接口位于本目录的 `design.ts`、`oracle.ts` 和 `binding.ts`。它们是独立验收工具；不含游戏渲染、游戏实现、最终地图或素材。通用 `DesignDocument`、pilot、生产 host 和现有 browser runner 保持原接口。源码前置沿用 COS-02、COS-08、COS-14 草稿工具、本文冻结用例和 COS-18 动态 design/media 部分，不把这些源码阶段要求改成任务关闭循环。独立评审和合并后才可登记 `TRANSFER_DESIGN_BINDING_SOURCE_READY`；该标记只代表源码准备，不代表迁移通过或可直接执行完整流程。

### 版本化设计数据

未来 COS-18 adapter 须在同一次生成运行的计时和计费范围内，让 design 角色另写结构化设计文件，与既有玩法说明和媒体 roster 并存；不修改默认 design schema，也不把测试地图加入模板或角色输入。结构为：

~~~ts
{
  formatVersion: 'cos16-design/1',
  requirement: ArtifactReference,
  mapVersion: string,
  map: { tiles: string[], player: Point, boxes: Point[], targets: Point[] },
  solution: Direction[],
  paths: { wall, push, boxWall, doubleBox, restart, restore }
}
// Point = [x, y]，从零开始；Direction = 'up' | 'down' | 'left' | 'right'。
// paths 的每项是 Direction[]；不接收作者自报的 expected、状态或通过结论。
~~~

`tiles` 是 3..8 行、3..8 列的矩形，只含墙 `#` 和地板 `.`，四边封闭。玩家与两个箱子不能互相重叠；目标彼此不同，允许玩家或箱子位于目标上。坐标必须为地板上的整数。地图和需求引用必须是固定版本。通关 `solution` 限 40 次合法移动；各访问路径限 60 次方向输入，这是匹配现有单计划 200 步上限的输出表达边界。

所有访问路径从关卡初始状态开始，只用普通方向输入。`wall` 首步须为普通行走，最后一步碰墙；`push` 最后一步推箱；`boxWall` 最后一步尝试向墙推箱；`doubleBox` 最后一步尝试连续推两箱。此前各步必须合法。`restart` 和 `restore` 都须包含普通行走与推箱，停止在非胜利状态。host 按固定规则计算每步结果：合法输入恰好一格且步数加一；三种阻挡不改变任何状态；恰好两个目标都被箱子占用时才胜利。

`cos16-design/1` 要求 `restore` 是完整 `solution` 的严格前缀，且恢复检查点尚无目标被占用。继续段先到达单目标、后到达双目标。这样 T16-05 的关闭前局面与 T16-06 的继续路径有唯一对应关系，并能在恢复后观察“一个目标仍未胜利”。这是本版本的设计表达约束，没有增加用户玩法，也没有减少六项验收。设计缺陷应交 design 在原运行内修复；coding/art 不能修改规则、地图或期望来消除失败。

### 冻结与绑定顺序

以下 API 只由可信 host 调用，registry、临时准备目录和冻结回执不能作为角色可写工具。实际角色仍受已有 task ownership 和只读输入镜像约束；本模块不新增角色权限。

1. `validateTransferDesign(value, currentRequirementRef)` 校验结构、数量、边界、完整解法及所有场景，返回 host 独立计算的 trace。它不导入游戏代码，也不读取游戏实际值。
2. `freezeTransferDesign({root, registry, requirement, requirementFile, designSource, artifact, taskId, provenance})` 读取已登记的完整 `RequirementContract`，确认其六个验收 ID、固定引用及 `specVersion`，严格解码 UTF-8 设计后验算。它把已经验算的字节复制进 host 暂存目录，再用 ArtifactRegistry 发布 `_cosmos/transfer-design.json` 和 `_cosmos/transfer-binding.json`。返回回执记录实际需求 capture 全文件摘要、设计 SHA-256、地图版本、需求版本和全部验收 ID；host 将回执保存在受保护计划中，再交角色读取。无效设计不会发布 capture。
3. `prepareTransferAcceptance({root, registry, frozen, currentRequirement, candidate, planArtifact, url, runId, reportId})` 在 coding/art 开始前，依据冻结设计构造鼠标期望，发布不可覆盖的 `_cosmos/transfer-plan.json`，返回固定 plan 引用及其字节 SHA-256。`currentRequirement` 为 `{artifact, specVersion}`；`candidate` 是实际任务计划预留的 registry candidate 引用，此时无需已有候选工程。候选引用不能由角色自选。若原任务已有 v1/v2 有界修复安排，host 在生成前分别准备两份计划；两份动作和期望必须一致，仅固定候选、报告等元数据不同。
4. coding/art 读取需求、冻结设计和对应冻结计划。生成后 staging 必须把这三个准确 capture 引用放入 candidate 的 `inputs` 与 `expectedDeps`，依赖版本不能省略。
5. `bindTransferAcceptance({...同一准备输入, prepared})` 重读 plan capture、设计与需求，核对回执、实际摘要、地图版本、全部验收 ID 和 run；再核对真实 candidate manifest、三个固定输入及其全部 staged 文件字节。它重算同一设计的期望与冻结 plan 精确比较，只返回原计划，不改写或重新登记。换错候选、旧需求、旧地图、旧摘要、缺输入或改动文件均拒绝。修复 v2 只能使用生成前为 v2 保留的等价计划，不能拿 v1 的回执静默改绑。

当前 API 要求 requirement capture 内有完整确认契约文件；未来 COS-18 adapter 还须接通该 capture、设计角色输出声明、上述前后调用顺序及同一次运行的来源/费用记录。本次不新增实际生成运行、运行账本或额度。

### 鼠标计划与只读观测

计划按 T16-01、T16-02、T16-03 三个碰撞场景、T16-04、T16-05、T16-06 分为八段，每段均绑定固定 candidate、需求 `specVersion`、run/report ID 和 1280×720 viewport，并符合既有 AcceptancePlan 的 JSON 标量及 200 步限制。所有棋盘操作仅为可见按钮 locator 点击，按钮 test ID 为 `start/up/down/left/right/restart/continue`，中文按钮文字按本文固定。

只读 `cosmosDebug.transfer.snapshot` 与 `saveSnapshot` 返回稳定 JSON 字符串，字段顺序为 `mapVersion, player, boxes, targets, steps, won`。玩家坐标为 `[x,y]`；箱子按 x、y 升序排列；目标同序排列为 `{position:[x,y], occupied:boolean}`；`steps` 为合法移动累计数，`won` 只由两个目标占用决定。单关由 `mapVersion` 标识。保存完成后 `saveSnapshot` 必须等于该步完整状态；阻挡仍等于前一保存状态；重开后保存必须等于初始状态。观测接口不得有 setter 或调用内部移动。

可见棋盘使用 `data-testid="board"` 和 `cell-x-y`，格子以 `data-player="true"`、`data-box="true"`、`data-target="true"`、`data-occupied="true/false"` 暴露实际渲染状态；可见 `status` 文本为“进行中”或“胜利”。每段终点检查棋盘、玩家、箱子、目标和状态；T16-06 还在首次单目标时检查可见棋盘及“进行中”。这些 DOM/debug 断言须配合既有逐步截图、录像、日志和独立实际画面评审，不能只采信游戏自报状态。

所有段与总计划当前均为 **preparation-only / executable:false**。T16-05 的 `restore` 段后保留 `close-process-reopen` 检查点：保存状态、真实进程退出证据、同一隔离 profile、同一 origin，之后才允许 T16-06 的 `victory` 段点击“继续游戏”。现 runner 尚无该能力；八段不能当作八次普通 fresh-context 调用来宣布完整通过。刷新、同页读档、新上下文或注入存档均不能替代检查点。后续独立任务须实现 profile/process 生命周期及连续证据，才能执行完整计划；本次不更改 runner。

### 零付费源码验证

`tests/transfer/design-binding.test.ts` 的六组测试只用临时目录与合成地图，覆盖静态规则、非法地图/路径、场景完整性、UTF-8、真实 ArtifactRegistry 冻结、正常点击计划和陈旧绑定拒绝。它还验证候选不存在时预先冻结 v1/v2 等价计划，再对真实 staged candidate 绑定；不生成目标游戏、不执行浏览器、不调用 provider。定向测试和 strict 编译命令及证据见 [本任务计划](../../docs/plans/2026-10-04-transfer-design-binding.md)。

## COS-37 持久 profile consumer（待独立源码评审）

`src/acceptance/persistent.ts` 提供可信 host 专用的 `runPersistentAcceptance(series, options)`；`probes/transfer/acceptance.ts` 提供 `runTransferAcceptance(bindInput, options)`。后者先调用原 `bindTransferAcceptance`，把同一不可变 `cos16-plan/1` 转成完整八段和一个进程重开检查点，再在每段、每次启动前、关闭后及最终报告发布时重读候选、需求、设计和计划字节。host 的 `verifyBinding()` 还必须核对当前平台 source、运行 scope 和取消状态；该回调不能由游戏或模型提供。

`options` 包含 host 拥有的 `evidenceRoot`、原始绝对 `deadlineAt`、固定 `sourceVersion`（transfer consumer）、独立总报告 `reportId`、可选 `signal`、固定 browser channel 和 `verifyBinding`。series 仅含固定普通鼠标计划、来源与绑定摘要、需求/设计/map 版本和验收 ID；不接收 profile 路径、浏览器 executable、任意 origin、脚本、storage 种子或 debug setter。所有段共享原 deadline，重开不新建运行、费用或额度。

profile 根由内部 `mkdtemp` 创建，带 host 所有权文件，拒绝 junction、既存 profile 和所有权变化。每个 `fresh-profile` 段使用新目录；仅 `restore`/`victory` 复用同一个专用目录和 loopback origin。driver 用参数数组、隐藏窗口和原标准环境 allowlist 启动固定本机 Edge/Chrome 或 bundled Chromium；browser-target 公开 CDP 的唯一 browser PID 必须等于 owned ChildProcess PID，唯一 `--user-data-dir` 必须等于该绝对目录。报告保留这些 CDP 实际字段和环境变量名称，凭据及 preload 变量不传入 browser。

关闭前通过普通鼠标输入得到固定 `snapshot`/`saveSnapshot`，保留实际值、画面、公开 `page.screencast` 生成的 webm 和日志。真实 `Browser.close` 后必须同时看到 child close event、exit code/signal 和 PID 不存在；任何错误、取消、deadline、绑定或必要证据变化、退出未证都停止后续段，并沿既有 owned process 策略清理。第二次启动必须是不同 PID，之后由原 `victory` plan 点击“继续游戏”并检查完整恢复状态与画面。最终报告写入期间的取消也会保留为 failed。

默认 `runAcceptance` 仍使用原 launchServer/newContext 分支。持久流程另存 `persistent_profile_process_reopen` 总报告及各段原始 `normal_browser_input` 报告，不覆盖冻结计划，也不把其 `executable:false` 改为 true。测试专用 profile 留作诊断，浏览器进程必须退出；它们不能用于用户日常浏览。

本次六组纯测试和一条小型真实 Edge 合成保存 fixture 只证明 harness 生命周期；另有一次默认 runner 正常路径代表检查。合成 fixture 不含推箱子地图或游戏，不能当作 Cosmos 生成或 T16-05/06 实际迁移通过。此前失败报告保留，实际迁移、同次运行来源/费用、生产 adapter、独立游戏评审和用户体验仍按原关口执行；不新增 paid window、ledger 或预算。定向证据见 [COS-37 计划](../../docs/plans/2026-10-04-persistent-browser-profile.md)。

## COS-38 运行时输入 adapter（待独立源码评审）

`runtime-host.ts` 的 `createTransferRuntimeHost` 通过可信源码 seam 使用共享验证浏览器 host。冻结输入明确保存 `.preparation: {profile:'operator_validation',adapterId:'cos16-input/1',brief,acceptance,unsupported}`，没有占位 scenario 或伪造 human 确认。普通 `.browser` proposal、默认 host 与 pilot 保留原入口。完整 ExecutionRequirement 另保存于 requirement capture 的 `_cosmos/execution-requirement.json`；每次 scope 检查核对真实 operator 决定、case/window/source/hash 及这个完整 capture。绑定工具也支持显式 human profile 并保留原确认字段，旧六项 human 契约仍使用原默认接口。

规划前 design slot 固定四个输出引用：通用 `_cosmos/design.json`、可信 transfer design、candidate v1 plan、candidate v2 plan。运行中的 design 另写 `authors/design/transfer-design.json`；adapter 先调用既有独立 oracle，再依次调用原 freeze/prepare 工具发布设计及两个等价计划。无效设计保存原始字节和 `invalid_transfer_design` 诊断，停止后续 art/coding，不调用只读格式纠正，也不 claim coding repair。没有地图、解法、游戏或素材预置于本模块或角色提示。

四个输出均进入 design capture 返回值、独立 review inputVersions、host evidence 和 journal signature；art/coding 的固定只读输入也完整保留四个版本。候选工程只 stage 当前 candidate 的 plan：v1 用 plan-v1，v2 用预留 plan-v2。art capture 的实际依赖是需求、通用设计及冻结地图；coding source/candidate 的实际依赖再加入媒体和当前 plan。另一候选的 plan 仍是 task/review 输入，不能同时 stage 到相同 `_cosmos/transfer-plan.json`。原 registry 的精确依赖闭包和冲突检查保持不变；对当前 candidate 绑定时仍验证四个准备输出，另一 plan 被改动也会拒绝。

`loopback-origin.ts` 在冻结计划前创建 host 拥有的 loopback 404 listener。`host-transfer-origin.json` 是 write-once receipt，固定当前 case、window、source、完整需求摘要、run/spec 与 URL。显式 resume 只能重新监听原端口，端口冲突拒绝；不能生成后替换冻结 URL。host 初始化失败、准备阶段验证失败、source/scope 变化或取消都会关闭 listener。固定 receipt 和捕获数据保留，不改账本、停止状态或时钟。

可信 driver 必须用 `host.withPreparation(async () => { ...原 planner / executeTaskDag... })` 包装本阶段；它复用 OwnedWork.run，并在 callback 正常返回、提前抛错或取消后等待同一个关闭 Promise。返回前重新检查取消及原 scope，不依赖 finish 必定执行。`closePreparation()` 可显式等待清理；恢复必须新建准确 resume host，再从原 journal/准备输出读取，不能重新规划或重新生成已消费产物。

当前 coding 验证即使输入和 candidate 绑定正确，也返回 failed / insufficient_evidence，明确 persistent/media 执行 consumer 尚未接通，不调用 generic scenario、build/play 或 promote；finish 不返回 accepted delivery。两个冻结 IR 仍为 preparation-only/executable:false。后续任务须接实际 consumer、媒体证据及可信失败阶段，并准备同一次运行内的有界 design 语义修复和付费入口。源码准备不等于 Cosmos 已生成推箱子或迁移通过。计划 source marker 为 `TRANSFER_RUNTIME_INPUT_ADAPTER_SOURCE_READY`，只有独立审查与集成后才能登记；本项零付费测试与准确命令见 [COS-38 计划](../../docs/plans/2026-10-04-transfer-runtime-adapter.md)。

## COS-41 原设计会话的有界反馈（源码准备）

`runtime-host.ts` 在规划前通过可信 `preparation.designHostTools` 声明 `validate-transfer-design`，沿用原生 role factory。工具仅交给该 design 作者，严格接受空参数，固定读取 `authors/design/transfer-design.json`。它会写 host 审计，因此标记为 mutable；独立 reviewer 无权调用，作者也无权修改审计目录。

每次提交保存不可覆盖的 started、原始字节与 result。第一次无效校验开放一个重作过程，下一份不同字节的提交是第二次校验；第二次失败后永久耗尽。第一次有效提交直接封存，不开放重作。相同字节复用完整结果，不增加校验轮次；started 缺少 result、坏回执或身份/输入变化均拒绝继续。原始无效 UTF-8 字节保持，作者工具仍拒绝改变已有非 UTF-8 文件的编码。

Capture 必须核对成功回执、封存摘要、当前地图、完整需求/source/case/window、固定输入及原 task/attempt/author/context/session。跳过工具、封存后改图或耗尽后写出新图均不能进入 art/coding。Freeze 使用 host 保存的已校验字节，并核对实际冻结摘要；通用设计说明可以在地图不变时准确完善。恢复只检查完整回执和既有 capture，不新建会话、attempt 或分配额度。

所有模型请求及 compaction 仍计入原 design grant、purpose、总调用次数、费用与截止时间；未知费用先对账。语义反馈不借用只读格式纠正，也不占 coding repair。此项仅零付费源码和合成接口测试，实际入口与真实迁移验收留后继；独立评审和集成后才可登记 `TRANSFER_DESIGN_FEEDBACK_SOURCE_READY`。定向证据见 [COS-41 计划](../../docs/plans/2026-10-04-transfer-design-feedback.md)。

## COS-43 固定内部 operator 入口（待独立源码评审）

`validation-run.ts` 固定 `cos20-transfer-validation-1`，只接受 `--validation-preflight <reviewed-main-sha>` 或 `--validation-case <reviewed-main-sha> <operator-validation-source>`。源码绑定原生 bootstrap 与 `createTransferConsumerHost`，CLI、环境和模型不能替换 declaration、host、fixture、profile、origin、时钟或输入路径。`requirements.json` 冻结上述六项 T16 和原两项 host stages，仅含需求与验收规则；没有地图、解法、游戏、素材或 human 确认。

免费 preflight 检查 clean exact main、固定输入、原八个已消费停止案例、四十 closed grants、六笔原始 closure source bytes 和 Source20..42 各自的精确批准 marker/source+merge 祖先。每笔历史 closure 用其 `basis.currentCaseId` 对应的原 declaration input hash 认证；新迁移输入不能替代旧哈希。COS41 未源码 Ready、writer 未收敛、未知费用、陈旧报价或新身份已消费均拒绝，不执行 host 准备或新 claim。

执行复用同一原 shared snapshot/run/ledger。declaration3/quote2 沿 COS16 原 ¥10 parent；首次五 grants 为 planning ¥0.4、design ¥1.2、art/coding/repair 各 ¥2.8。原子 claim 同时登记新 case、ledger3→4 与 delegation，不存在先单独升级账本的步骤，也不增加有效预算。单 case ¥5/45 分钟/80 请求、首批 ¥30/shared ¥150 及原 coding repair 一次上限不变；所有角色、review、格式纠正、设计反馈和 compaction 均沿原账本计费计数。

Bootstrap 使用新 planning grant 的 OwnedWork/runOwnedNode 和现有固定 worker。原 planner、validated tasks、write-once execution receipt、完整 DAG/journal、有界 repair 和 effective finish 都在同一个 `withPreparation` 内。Repair 使用原 host 授权和完整 `resumeTaskDag`，重用 design/art 的通过签名，仅执行新 coding repair；原 coding v1 失败、journal 和 linked v2 来源继续保存在 snapshot、`host-result.json` 与最终 `result.json` 的 taskHistory 中。设计四输出、两版本等价计划、八段持久浏览器、真实媒体样本、独立 review 和准确候选 promotion 都沿既有 consumer。

本任务只有纯源码测试，尚无真实 ledger 升级、case claim、模型生成或 T16 实际证据。最终执行仍由 Root 在独审集成后的准确 main 上重新只读 preflight、冻结 source/余额/route/operator 后单独开展。报告为内部 operator 实验，`userExperience: not_confirmed`；公开 COS16/COS18 的真实需求确认、CLI 和用户体验关口继续 pending，不能凭本入口关闭这些关口。测试与证据见 [COS-43 计划](../../docs/plans/2026-10-04-transfer-validation-entry.md)。
