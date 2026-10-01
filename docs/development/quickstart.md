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

这会在指定空目录内创建 `artifacts/`、`evidence/`、`logs/`。它只准备本地目录，不启动 agent、不创建费用账本或运行状态，也不会读取用户主目录中的隐藏配置。运行身份、预算、恢复与角色调度由 COS-06 及后续任务实现。

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
