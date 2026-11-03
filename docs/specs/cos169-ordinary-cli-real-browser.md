# COS169 · 复用需求后的普通 CLI 交付与真实浏览器联验

[COS169 / #170](https://github.com/lrfluobida/Cosmos/issues/170) 已登记。`public_real_host_review` 独立核对固定规格，Root 批准 `public_real_host_probe` 实施，最终源码已获独审及 Root 精确批准，待离线集成。用独立 TEMP 需求源驱动编译后的公开 `runCli(new --requirements-from)` 和生产 ProductHost，串联真实 Pi SDK 工具、构建、浏览器验收和交付。模型决策与传输使用本地脚本响应。设计作者通过实际工具写入草稿并纠正验收编号，独立角色读取固定产物与宿主证据。

同一次运行须用正常输入验证关闭前存档、首进程真实退出、同源同 profile 的第二个 Edge 进程重开及恢复，接着核验媒体、干净目录启动、候选绑定和最终报告。公开 resume 应返回同一交付，保持模型派发数与快照字节。启用留证时保存原始需求确认来源，以便复核。 父任务为 [COS18 / #19](https://github.com/lrfluobida/Cosmos/issues/19)。直接依赖 [COS130 / #131](https://github.com/lrfluobida/Cosmos/issues/131) 的离线验证与交接检查、[COS163 / #164](https://github.com/lrfluobida/Cosmos/issues/164) 的按步骤验收编号纠正和 [COS166 / #167](https://github.com/lrfluobida/Cosmos/issues/167) 的关闭前存档核验。

批准规格原稿 SHA256 为 `b3cd7ff717abf89d20a8f181da3e419350fa59a553d2257f9f7bebbfd8531584`。

在 codex/gameplay-offline 基线 3e2cfe334780834cc91eb3688a48e86cfd4d750f 上，新增一个可复跑的离线纵向用例。既有真实浏览器和单环节检查继续使用；本卡关注它们在同一次普通生成里的配合。

用 TEMP 中独立且已确认的普通需求作为来源，通过编译后的公开 runCli(new --requirements-from) 进入生产 ProductHost。测试仅替换模型决策/传输并禁用真实外部模型。设计作者通过 SDK 的实际工具写入、发现并纠正错误验收编号，独立角色读取固定产物和宿主证据。美术和编码使用已准备的合成材料。构建、两个 Edge 进程的正常输入和真实退出、同源同 profile 重开、关闭前存档观测、媒体核对、干净目录启动、候选绑定与最终报告均走生产路径。通过后还须能用公开 resume 读取同一交付而不新增模型派发或改写快照，留证模式保存验证所需的需求源。

源码、人工试玩与模型能力分开记录：该用例的输入和回复是合成脚本，自动通过仅覆盖被测试的普通链路，不计作付费模型自主生成“小屋寻物”、经典游戏或真实用户确认。不动实际账本、R27、主线或会计发布分支。分工为独立 implementer public_real_host_probe、reviewer public_real_host_review、唯一 merger planning_budget_merger。

## 运行离线集成用例

在 Windows 上使用项目要求的 Node 22、可启动的 Microsoft Edge 及已安装依赖的仓库和 2D 模板。源码集成后在仓库根目录执行。如果使用托管工作树，`COSMOS_TEMPLATE_ROOT` 应指向已安装模板依赖的目录。

```powershell
$primaryWorktree = (git worktree list --porcelain | Select-Object -First 1) -replace '^worktree ', ''
$env:COSMOS_TEMPLATE_ROOT = Join-Path $primaryWorktree 'templates/2d'
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw '项目编译失败' }
node --experimental-strip-types --test tests/cli/ordinary-real-browser.integration.ts
```

需要保留 TEMP 供复核时，在运行测试前设置 `$env:COSMOS_KEEP_EVIDENCE = '1'`。模型回复是合成脚本，验收关注公开入口到交付与恢复的协作行为。
