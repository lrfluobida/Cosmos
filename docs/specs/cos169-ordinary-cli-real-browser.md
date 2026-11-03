# COS169 · 复用需求后的普通 CLI 交付与真实浏览器联验

[COS169 / #170](https://github.com/lrfluobida/Cosmos/issues/170) 已在 `codex/gameplay-offline` 离线源码范围完成。`public_real_host_review` 独立审查 `e8c6de4d3370264092ad1f47f2c3cd42dee45f23`，Root 放行后由唯一 merger 集成到 `e567bb828a20eceedd92062f32170063cd32e223`。公开 `runCli(new --requirements-from)` 在编译件的进程内 API 进入生产 ProductHost。模型只提供 23 次脚本 SDK 回复。作者实际使用工具纠正验收编号，构建、素材验收和交付走生产路径。合成游戏在两个不同的真实 Edge 进程中接受正常输入，两个进程均退出，关闭前的可见存档状态与重开恢复匹配。 [结案记录](https://github.com/lrfluobida/Cosmos/issues/170#issuecomment-6603307470)

两份测试及夹具与批准版本逐字节一致。完整离线用例 1/1，构建、生产类型检查、两个测试文件 strict 检查及既有 fixture 调用代表通过。独立操作系统子进程使用集成分支的编译 CLI，在没有模型凭据、禁止模型派发和网络连接的环境下执行 `resume`，恢复同一交付并保留需求源、运行快照及报告的原字节。最终状态为 `awaiting_user_experience`。 复用的原确认来源在 TEMP 留证。完整双 Edge 验收使用受控模型回复，没有进行真实用户试玩或付费模型自主生成。

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
