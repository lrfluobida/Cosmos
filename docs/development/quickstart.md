# Windows CLI 与通用 2D 模板

## 环境与安装

已固定 Node.js **22.22.2**、npm **10.9.7**、TypeScript **5.9.3**、Phaser **3.90.0**、Vite **8.3.1** 和 Playwright **1.63.0**。使用 Node 22；Node 安装自带 npm。根目录及模板分别提交 `package-lock.json`，安装时使用 `npm ci`。

以下命令在 Windows PowerShell 中执行。首次安装依赖与 Chromium 需要网络；初始化、构建和试玩不需要模型 API 或凭据。游戏页面的图片与字体不依赖远程服务。

```powershell
cd E:\develop\Cosmos
npm ci
npm run build
npm test
npm run typecheck
```

`npm start -- --help` 直接运行 TypeScript 入口；`node .\dist\cli\index.js --help` 运行编译后的 CLI。`package.json` 的 `cosmos` bin 指向后者；需要直接使用 `cosmos` 命令时，可在构建后执行 `npm link`，完成后用 `npm unlink -g cosmos-cli` 撤销全局链接。

## 从一句话进入需求访谈

```powershell
node .\dist\cli\index.js new "E:\CosmosRuns\我的游戏" --brief "做一个用鼠标收集星星的小游戏"
node .\dist\cli\index.js status "E:\CosmosRuns\我的游戏"
node .\dist\cli\index.js stop "E:\CosmosRuns\我的游戏"
node .\dist\cli\index.js resume "E:\CosmosRuns\我的游戏"
```

`new` 要求空目录。Cosmos 先检查运行前置，再由原生 design 角色集中提问；终端接收回答并展示带版本号的需求、玩法验收、设计检查和素材检查。输入 `confirm 1` 这样的当前版本确认才会生成；`edit` 修改回答并产生新版本，旧版本确认失效。`cancel` 或输入结束会保留未确认需求。用户不需要手写需求 JSON 或修改编排器。

模型凭据仅由当前进程环境中的 `DEEPSEEK_API_KEY` 提供。访谈与生成使用同一运行身份、同一 ¥200 账本；确认前访谈也预留并记录实际费用。正式 12h 计时只在需求确认、通用环境和执行前置就绪后激活一次，覆盖生成、集成、修复、验收和交付检查。已结算加预留达到 80% 时，终端显示一次提示及剩余额度。¥100/6h 是优化目标。

通用环境还需在 `templates/2d` 执行一次 `npm ci`。产品入口要求 COS-03 至 COS-13 的必需前置完成；当前缺少的真实验收会直接列明，并在任何访谈费用和生成计时发生前退出。离线测试及通用 fixture smoke 不解除这些真实门禁。

首个通用 host 支持鼠标操作、Phaser、可见界面断言、独立 art 角色的图层 SVG 动画和合成 PCM 音频。当前单批支持 1–16 个角色、0–16 段音频；能力说明会交给 design 角色，超出范围或缺少可信验收适配器的要求须明确列为差距，不能悄悄简化。完整经典 PC 基准仍需要 COS-14 的专用可信验收适配器；这个通用入口不缩减原基准分母。

生成由 Cosmos 规划，design、art、coding 在各自目录工作；独立评审读取固定版本及主机证据。设计和素材文件检查不代替玩法验收。最终候选还会核对实际载入、动作及音频启动的只读观测；评审需结合固定源码中的真实 Phaser 事件和正常输入截图检查观测来源。单凭计数不能证明画面或听感合格，最终美术辨识度和听感仍由用户试玩确认。

`status` 只读取原快照，不改账本或取得运行写锁。`stop` 是持久硬停止，只有已记录停止且受控工作收敛后才确认成功；`resume` 只恢复仍在原窗口内、没有持久停止且可以核实的中断。手动停止、费用或时限停止均不会被 `resume` 清除。正式运行的首次追加须另行查看提案并明确确认。

查看已停止或已到期正式运行的续跑提案：

```powershell
node .\dist\cli\index.js continue "E:\CosmosRuns\我的游戏" --quote --add-cny 20 --add-minutes 60
```

只需指定拟追加金额和分钟数。单次申请范围为 ¥0–200、1–720 个整数分钟；金额最多保留六位小数，0 元表示仅申请加时。这些范围不是激活授权，原金额与时间上限不变。输出列明原身份、费用、停止原因、待续任务、拟释放的旧任务未用额度、新任务拟分配额度，以及每项待续任务最多新增一次尝试、没有自动修复轮次的范围；这些条件均未生效。

`quoteId` 绑定准确快照、revision、参数与继任映射，原记录变化后需重新查看。金额明细用整数 micro-CNY（1 元＝1,000,000 micro-CNY），开头同时展示人民币摘要。命令不获取运行锁、不写文件、不调用模型、不重置时间；没有锁文件也不证明原运行已停止。已到期但未保存停止记录时，提案会列出待核实事项。未知或预留费用、未到期仍活动的运行、intake 和 validation 均不能通过这个入口续跑；旧验证记录不获得新窗口。`--confirm`、`--resume` 等附加参数会被拒绝。

确认首次追加并执行：

```powershell
node .\dist\cli\index.js continue "E:\CosmosRuns\我的游戏" --add-cny 20 --add-minutes 60
# 阅读本次完整提案后，在终端输入 confirm 后接本次显示的完整 quoteId。
node .\dist\cli\index.js resume "E:\CosmosRuns\我的游戏" --window "窗口 ID"
node .\dist\cli\index.js stop "E:\CosmosRuns\我的游戏" --window "窗口 ID"
```

交互命令先免费检查环境与生成前置，再显示本次准确提案；只有实际输入 `confirm <quoteId>` 才保存确认并激活。取消、输入结束、报价或原确认资料改变、前置失败均不激活或收费。原 run/ledger、历史费用、失败及停止记录保留；新增额度与时长单列。只关闭本次明示且核实过的旧任务未用额度，再给明确继任任务分配 grant。追加后的成功不能算原 ¥200/12h 内达标。

窗口激活后使用显示的同一 `windowId` 恢复，不再次确认、报价或重新计时。新任务从原固定输入在新目录开始，原部分文件留存；已通过的祖先必须通过原回执、版本、来源和内容核验。每个新任务只有一次尝试，没有自动语义修复；严格评审格式最多纠正一次，仍计入同一账本。缺失阶段回执、未知费用、过期或持久停止不会被当成新尝试。停止命令必须选择准确窗口：活动运行等待受控工作结束；正常关闭后核验空闲证明；未核实的写入或子进程会拒绝假报成功。

推箱子准备模式在原设计与素材已独立通过、来源完整、仅一个有效编码目标未完成时，也支持上述首个追加窗口；原已登记编码修复可作为有效来源。它复用原固定地图与素材，新编码只有一次尝试和独立评审，没有自动修复。原确认资料及实际执行源码、依赖和工具安装必须保持可核实的同一基线；更换平台版本后需要另行处理历史运行迁移。原 ¥200/12h 成绩、费用和停止记录保留，新增金额、时间与窗口结果单列。

当前只支持正式生成的首个追加窗口。不同决定的再次追加、验证预算的新窗口，以及排除最终用户试玩等待的持久计时阶段尚未接入；R15 的全部续跑体验仍未完成。真实生成前置与最终用户试玩不会由这些入口或离线测试自动通过。

交付输出给出当前工程、已接受版本（若存在）、验收报告、原费用与截止时间和具体差距。`awaiting_user_experience` 表示自动检查和独立评审通过、等待用户试玩；`incomplete` 保留当前成果及未完成事项。原失败任务与必要修复的继任任务均保留在同一次运行历史中。

最终试玩后记录体验决定：

```powershell
node .\dist\cli\index.js experience "E:\CosmosRuns\我的游戏"
```

命令展示当前游戏版本、试玩工程、自动报告和实际验收范围。试玩后输入 `approve` 认可或 `reject` 拒绝，`cancel`、输入结束或不明确的回答不会记录决定。提交前核对同一报告、accepted candidate、验收尝试与独立评审；等待期间版本或报告变化时，请重新查看当前版本并试玩。原报告和体验回执保留，同一决定可重复提交，相反决定会报告冲突，不覆盖原证据。

`status` 的 `delivery` 分别显示自动验收、体验决定和最终交付状态。只有当前报告与版本双通过才显示 `complete_for_report_scope`，一关切片的通过不代表完整经典 PC 基准完成；未覆盖范围继续列出。体验命令只读原运行并追加独立回执，不调用模型、不新增费用、不延长截止时间或恢复生成。正式运行与其显式追加窗口可使用此入口；intake、validation 和缺少可核实自动报告的旧运行保持待确认。模拟 stdin 测试只验证契约，不能代替用户实际试玩。

设计或美术出现可信、可复现的产物错误时，Cosmos 可在原未分配额度内安排一次修复，并为尚未启动的受影响下游建立明确的新任务。新任务使用修复后的固定版本，目标、验收和写入范围不变；原任务及旧额度不回收，状态中的 `supersededBy` 指向其继任任务。已经有调用、产物、证据或不明执行回执的下游不会被当作首次任务重开。全组仍受原费用与时间上限约束，继任任务失败不会再获得第二次语义修复。

缺文件、合法 UTF-8 的 JSON 或确定性格式/素材清单错误会先保存原始副本和诊断，再允许修复；副本与诊断的固定内容在恢复时继续核验。无法确认的编码、外部 IO 或主观质量问题保留为差距。旧版已保存的单任务修复计划沿用原恢复语义，不迁移额度来追加下游；没有完整阶段回执的中断也可能需要人工处理。

## 从空目录到浏览器

`<path>` 是必填参数，允许包含空格和中文。目录可以尚不存在，也可以是已有空目录；非空目录、符号链接及 junction 路径会被拒绝。CLI 不会覆盖已有文件。

```powershell
# 以下示例在 Cosmos 仓库根目录执行。
node .\dist\cli\index.js init "E:\CosmosProjects\通用 demo"
Push-Location "E:\CosmosProjects\通用 demo"
npm ci
Pop-Location
node .\dist\cli\index.js build "E:\CosmosProjects\通用 demo"
node .\dist\cli\index.js preview "E:\CosmosProjects\通用 demo"
```

在桌面浏览器打开 <http://127.0.0.1:4173>：点击薄荷色精灵可改变颜色并增加点击次数；点击空白舞台可移动精灵；点击场景按钮进入第二场景，再返回。页面下方只读观测区显示当前场景、点击次数与坐标。Ctrl+C 停止预览。

预览仅监听 `127.0.0.1`；可追加 `--port 4180`，端口占用会明确失败，不会静默换端口。先构建再预览；缺少依赖时 CLI 会提示在项目目录执行 `npm ci`。

生成目录可脱离 Cosmos 仓库独立使用：

```powershell
cd "E:\CosmosProjects\通用 demo"
npm run dev       # 编辑时的开发服务器
npm run build     # 类型检查与生产构建，产物在 dist/
npm run preview   # 预览生产构建
```

## 运行目录入口

```powershell
node .\dist\cli\index.js run-dir ".\runs\local-01"
```

这会在指定空目录内创建 `artifacts/`、`evidence/`、`logs/`。它只准备本地目录，不启动 agent、不创建费用账本或运行状态，也不会读取用户主目录中的隐藏配置。产品生成请使用上面的 `new` 命令和另一个空目录。

## 浏览器验证与证据

```powershell
npx playwright install chromium
npm run build
npm run test:browser
# 实际显示桌面浏览器的同一套验证：
$env:COSMOS_HEADED = '1'
npm run test:browser
Remove-Item Env:COSMOS_HEADED
```

测试在临时的中文和空格目录中执行 `init → npm ci → build → preview`，通过真实鼠标输入点击精灵、移动位置、切换场景并返回，同时检查浏览器异常。预览子进程在后台隐藏运行，结束后清理进程及临时项目。截图保留在 `.cosmos/browser-evidence/`，命令输出与结果在 `.cosmos/browser-report.json` 和 `.cosmos/browser-results/`。

`npm test` 使用 Node 22 的 glob 发现 `tests/**/*.test.ts` 和 `tests/**/*.test.mjs`，涵盖 CLI、参考冻结检查及合并后的契约测试；Playwright 场景使用单独的 `*.spec.ts` 入口。CLI 测试覆盖已有文件保留、junction 拒绝、错误参数、缺依赖和编译失败传播。

`window.cosmosDebug` 通过无 setter 的 getter 返回冻结快照。它只能观测，不提供状态修改入口；浏览器验证的关键状态变化全部来自玩家可用输入。

## 范围

模板只包含通用精灵、输入、场景和只读观测。它没有预制植物、僵尸、塔防波次、商店或关卡表。此样例只验证 COS-05 工程能力，不计为 Cosmos 生成的游戏或完整基准成果。

依赖依据：[Vite 环境要求](https://vite.dev/guide/)、[Phaser 安装说明](https://docs.phaser.io/phaser/getting-started/installation)。实际使用版本通过 npm registry 查询后锁定。
