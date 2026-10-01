# 正常输入验收 API（COS-08）

## 入口与执行边界

从 `src/acceptance/index.ts` 导入 `runAcceptance(plan, options)`。它为每次调用启动独立 Chromium 进程和无既有存档的浏览器上下文，通过鼠标或 locator 点击操作工程，并保存 JSON 报告、截图、WebM 录像和浏览器日志。默认使用 headless；`{ headless: false, channel: 'chrome' }` 或 `channel: 'msedge'` 可选本机已安装的桌面浏览器。报告记录实际 `browser.version()`、channel、headless 和 viewport。

可信编排器负责：固定需求和工程快照，将该快照构建后绑定到本地预览 URL，调用 API，最后停止预览服务。当前 CLI 没有构建／预览函数导出，因此本模块接受已经就绪的 URL；不会把 URL 本身当作产物版本证明。调用方必须保留构建日志和不可变工程快照，校验所绑定的 artifact ID、version、location。API 不证明游戏来源于 Cosmos 生成，也不替代独立评审或用户体验确认。

计划只接受 loopback HTTP(S) 地址；HTTP(S) 资源请求限于该项目 origin，service worker 关闭。浏览器只读固定 `window.cosmosDebug` 数据路径，或 DOM `innerText`／可见性。debug 根属性必须不可配置且没有 setter／可写数据属性，后续路径只能经过数据属性；接口没有脚本、表达式、内部状态写入、force click 或浏览器快进操作。正常鼠标点击会受到真实遮挡影响。游戏本身仍是可信本地程序，此入口不是对恶意网页的隔离沙箱。

## 最小调用示例

```ts
import { runAcceptance } from './src/acceptance/index.ts';

const report = await runAcceptance({
  formatVersion: '1.0.0', projectId: 'sample', taskId: 'COS-08',
  runId: 'run-001', reportId: 'attempt-001', specVersion: '1.0',
  artifact: { artifactId: 'game', version: 'snapshot-001', location: 'runs/run-001/artifacts/game' },
  url: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 720 },
  acceptanceIds: ['click-count'],
  steps: [
    { id: 'click', kind: 'mouse-click', selector: 'canvas', x: 0.3, y: 0.5 },
    { id: 'count', kind: 'wait-for', acceptanceId: 'click-count',
      observation: { kind: 'debug', path: ['clicks'] }, expected: 1, timeoutMs: 2000 },
  ],
}, { evidenceRoot: '.cosmos/acceptance' });
if (report.outcome !== 'passed') process.exitCode = 1;
```

`validatePlan(unknown)` 返回问题字符串列表；空列表代表结构合法。计划格式为 `1.0.0`，与需求 `specVersion`、工程 `artifact.version` 分开。步骤 ID 唯一，声明的每个验收 ID 必须有断言。拒绝额外字段、可变版本名（如 `main`／`latest`）、不安全路径标识和 200 步以上的计划。

| 步骤 | 字段与含义 |
| --- | --- |
| `mouse-click` / `mouse-move` | `x`、`y` 为 viewport 像素坐标；有 `selector` 时为目标包围框内 `[0,1)` 的比例坐标 |
| `locator-click` | `selector`、`timeoutMs`；使用浏览器可见性、可操作性和遮挡检查 |
| `assert` | `acceptanceId`、`observation`、`expected`、`timeoutMs`；读取一次并严格相等比较 |
| `wait-for` | 同上；有界轮询直到严格相等或超时，保留最后实际值 |

观测为 `{ kind: 'debug', path: ['clicks'] }`、`{ kind: 'text', selector: '#counter' }` 或 `{ kind: 'visible', selector: 'canvas' }`。期望值限 JSON 标量；可见性要求布尔值。每个显式 timeout 为 1–60000 ms；启动最多 15000 ms，鼠标目标定位最多 2000 ms，单张截图最多 5000 ms。每步失败后继续收集后续断言，任何失败、跳过、页面异常、console error 或证据收集错误都使总结果失败。无效计划与不可写／已存在的报告目录抛出异常；浏览器启动或 HTTP 启动失败在已建目录中形成失败报告。

输出目录固定为：

```text
<evidenceRoot>/<projectId>/<artifactId>/<artifactVersion>/<runId>/<reportId>/
  plan.json
  report.json
  browser.log
  browser.webm
  <step-number>-<step-id>.png
  final.png
```

同一目录拒绝覆盖，重试需新的 report ID。报告保留完整输入计划、步骤期望／实际值／错误、截图路径及总错误列表；未能启动时没有伪造截图或版本号。`files` 与证据 `source.location` 相对 `evidenceRoot`。`evidence` 使用 COS-02 `EvidenceContract`，引用本次固定工程版本；报告携带通过／失败结论，截图、录像、日志仅标为观测。调用方导入证据时应按该根目录解析或转成其产物登记位置。截图和 debug 状态都不能单独证明完整玩法；视觉模型判断需另行记录，本模块没有视觉模型通过结论。

## 加速规则验证边界

`compareFixedStepPacing` 是单独的 `mechanism_equivalence` 探针。调用方传入同一个生产 fixed-step 函数、`initial(seed)`、按 tick 的输入、终点及检查点；两次运行仅改变每批 tick 数，逐检查点精确比较状态和带 tick 的累计事件。检查点必须包含终点，保存字段、冷却、胜负等需要由生产快照暴露。`pace(batchTicks)` 允许调用方给原速批次等待一个模拟步长、给加速批次减少等待；默认只检查批次调度，不代表实测原速。

测试使用独立的通用计数／冷却机制夹具，固定 seed=2、输入 tick 2/6、检查点 1/2/6/12，比对 value、cooldown、outcome、save 与事件，并注入存档分歧确认失败。它证明探针能发现分歧，不证明尚未生成的游戏可安全加速。目标游戏必须复用自己的同一生产模拟重新验证。正常鼠标流程、真实渲染、动画、音频和帧率仍单独验收；本模块不快进浏览器时钟。

## 验证与本次证据

依赖沿用根目录锁定的 `@playwright/test@1.63.0`（直接从该已声明包导入）。仓库安装依赖和 Playwright Chromium 后执行：

```powershell
npm run typecheck
node --experimental-strip-types --test tests/acceptance/*.test.ts
node --experimental-strip-types --test tests/acceptance/fresh-build.integration.ts
```

实现顺序：先写计划拒绝、报告与等价性用例，确认尚无入口时失败；实现最小 API 后跑真实浏览器负例；最后从新目录执行 CLI init → npm ci → build → preview 并接入同一 API。集成测试的预览进程使用隐藏窗口启动，在 finally 停止进程树并确认端口已关闭；浏览器由 API 的 finally 关闭。新构建工程和输出留在 `.cosmos/`，不提交录像或依赖。

2026-10-01 验证结果：`typecheck` 与 `build` 通过，acceptance 测试 16 项通过，新目录构建集成测试 1 项通过。实际配置：Windows、Node 22.22.2、Playwright 1.63.0、bundled Chromium **153.0.8010.12**，headless。夹具 viewport 1280×720；通用 Phaser 工程沿用模板验收的 1280×900。后者只验证工程与正常输入链路，不能用作正式游戏 1280×720 性能验收证据。

证据根为 `.cosmos/acceptance/`：

- 浏览器夹具：`input-fixture/fixture/input-fixture-v1/browser-1790833564492/`。`normal/report.json` 通过；`disabled`、`broken-response`、`overlay` 的输入断言期望 1、实际 0；`wrong-display` 内部输入断言通过，但显示期望“计数：1”、实际“计数：999”。另有页面异常、HTTP 503 和 locator 遮挡失败报告。每个场景目录含实际截图、录像与日志。
- 新构建工程：`generic-template/phaser-template/1121ae25c071c2d7e4dd4f0c8c3440e5546efe88/fresh-1790833652150/fresh-build/`，8 步通过，记录精灵点击、移动和场景切换。源工程与构建日志：`.cosmos/acceptance-projects/fresh-1790833652150/独立 project/`。
- 已查看错误数字截图 `wrong-display/005-display.png` 与新构建的 `008-gallery.png`，中文与实际画面正确显示。故障只存在于 `tests/acceptance/fixtures/input.html`，生产模板未修改。

以上属于平台验收证据，没有调用付费服务，也不是目标游戏生成结果。
