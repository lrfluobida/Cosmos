# COS52 生产迁移运行库实施计划

> **For agentic workers:** 按本计划执行最小提取，由独立 reviewer 审查实际 diff；仅本批 sole merger 可集成与推送。

**Goal:** 让已有迁移设计、验收及角色 host 闭包能够通过正常 `src` 编译和 `dist` 入口加载。

**Architecture:** 九个 `probes/transfer` helper 的实现移入 `src/runtime/adapters/transfer`，原入口只重导出同一实现。Source32 的诊断算法移入 `src/runtime/repair/browser-diagnostics.ts`，以结构化 build 结果类型替代 probe host 类型依赖。复用现有通用 host、controller、owned launcher、registry 和源码/编译后 worker URL。

**Tech Stack:** TypeScript 5.9 / Node 22、正常 `tsconfig.json`、Node test runner、隔离 TEMP 合成 fixture。

## 文件与边界

- 新增 `src/runtime/adapters/transfer/{design,oracle,binding,acceptance,loopback-origin,design-validation,runtime-host,runtime-acceptance,persistent-diagnostics,index}.ts`。
- 新增 `src/runtime/repair/browser-diagnostics.ts`；原九个同名 transfer probe 和 `probes/e2e/diagnostics.ts` 为薄重导出。
- 新增 `tests/transfer/production-runtime.test.ts` 与本计划。
- 固定 validation declaration/input/driver/run、旧结果、fixture/template、原浏览器 worker 协议保持原样。未实现 human CLI 选择或确认流程。
- 不读取真实 ledger/case/session，不调用付费 provider，不复制游戏或参考素材，不扩大修复、路径读取或授权范围。

## 实施与验证

- [x] 写生产入口、probe 兼容入口与 TEMP 编译执行测试，确认缺少生产入口时 RED。
- [x] 提取九 helper 与 Source32 诊断，修正相对 imports；生产源码没有 `src → probes` 类型或运行时依赖。
- [x] 用同一合成输入核对 oracle、binding、四个输出、计划和诊断；跑受影响的旧 probe 代表测试。
- [x] 正常 `tsc -p tsconfig.json --outDir <TEMP>/dist` 后实际加载 compiled entry，执行 compiled transfer host 的合成四输出捕获及受控 compiler 失败。验证源码/编译后 owned worker 在登记前不能写入、退出已确认；工具链为 TEMP mock，零真实模型调用。
- [x] 复用未变的 deadline、生命周期、80 SDK 调用与完整持久化矩阵证据。一次旧诊断命令误包含三个实际 Edge 合成 fixture，已通过并结束，不再重跑浏览器验证。
- [x] 严格 UTF-8 复读全部编辑文件，检查中文、LF 与 `git diff --check`，记录命令、结果及缺口；最终 SHA 由本提交产生。

## 已核对的闭包

九 helper 仅通过 `probes/e2e/diagnostics.ts` 依赖额外 probe；该诊断模块的 `buildProject` 只用于类型。将其结果明确为 `passed/work/results(code,stdout,stderr)` 后无需移入固定验证 host。通用 `entrypoint-host` 与 `owned-command` 已按 `import.meta.url` 选取 `.ts/.js`，不需改 worker 协议。

## 实施证据

- RED：`node --experimental-strip-types --test tests/transfer/production-runtime.test.ts` 三组均仅因生产入口缺失失败，3534.8845 ms。
- 新测试首次 GREEN：source/compiled 入口、完整 `src` import 闭包、九 probe 同实现导出、同合成 oracle/状态序列与 build 诊断组通过（9008.1143 ms）；source/compiled owned worker 登记前禁止写入、真实 launcher/worker PID 已退出、TEMP ledger 0 entries 组通过（481.0705 ms）。一次 TEMP 编译结果由同文件的各组复用。
- 编译后 host 组初次误把源码 orchestrator 与 compiled host 混用，`buildRepairFeedback` 的 `instanceof HostFailure` 丢失编译后诊断身份。测试改为编译后的 orchestrator，生产实现未改；随后 `--test-name-pattern='compiled transfer host' tests/transfer/production-runtime.test.ts` **1/1、0 failed/skip，25690.3861 ms**。四输出/capture/独立 review、Source50 scoped 读取、同 fixture 的旧 probe/新 source/compiled plan binding、八段等价计划、固定 mock compiler 参数、实际 PID 退出与无 promotion/human decision 均通过。
- 旧入口代表：`node --experimental-strip-types --test --test-name-pattern='runtime design prepares four|invalid design gets one same-session rewrite|reliable early mismatch|complete success' tests/transfer/runtime-host.test.ts tests/transfer/design-feedback.test.ts tests/transfer/persistent-diagnostics.test.ts`：**4/4、0 failed/skip，22378.2632 ms**。保留原会话一次 design rewrite、精确四输出/current capture、失败前缀 witness 与 reopen 身份。
- 旧诊断命令 `node --experimental-strip-types --test tests/e2e/diagnostics.test.ts`：**48/48、0 failed/skip，10319.9851 ms**，其中误包含三个隔离实际 Edge fixture；均为原合成 browser 输入、零模型调用，无真实 case/ledger/session 读取。此偏差已报告 Root，不重复运行。
- 最后固定路径增量：owned worker 的合成脚本分别真实 import `src/acceptance/runner.ts` 与 TEMP `dist/acceptance/runner.js`，只加载模块、不启动浏览器，再写入 PID。`--test-name-pattern='owned workers' tests/transfer/production-runtime.test.ts` **1/1、0 failed/skip，12439.9163 ms**，保留原登记前禁止写入、launcher/worker 退出和零 ledger entries 断言。
- 最终 strict closure：`node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --types node src/runtime/adapters/transfer/index.ts src/runtime/repair/browser-diagnostics.ts tests/transfer/production-runtime.test.ts` **exit 0，6.8295786 s**；先前两条诊断仅为新测试 callback 的 erased type 注解，已补齐。
- 九 helper 去掉 imports 后的文本与基线逐字一致；Source32 去掉 imports 和唯一 erased build-result type 替换后逐字一致。十 wrapper 只重导出，23 路径重新严格 UTF-8 解码、无 BOM/LF，原非 ASCII 字符序列精确保留，中文按钮复读正确；`git diff --check` 通过。

本项未更改通用 host/worker、预算、grant、origin/profile、权限、修复协议、fixed validation profiles 或旧结果。独立审查和 sole-merger 集成尚待完成。源码与 TEMP 合成 compiled execution 不代表真实迁移或目标游戏已通过，human CLI 选择/草稿/确认流程留后继任务。
