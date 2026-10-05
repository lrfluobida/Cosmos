# COS65 独立游戏交付与干净目录启动计划

> **For agentic workers:** Use superpowers:executing-plans; each task has its dedicated implementer and independent reviewer. Steps use checkbox syntax.

**Goal:** 未来生成候选包含源码、dist、通用 Node launcher、中文说明和真实来源资料；原验证从干净副本启动同版本游戏后才交给独立评审。

**Architecture:** 在既有 `registry.verifyCandidate` 的 build 回调成功后包装，在 acceptance 回调内复制整个包并启动同一 launcher。沿用原正常输入、媒体观测、controller / owned work / deadline、全目录 snapshot 和 journal 签名；报告在接受后仍发布到现有 immutable sidecar。

**Tech Stack:** Node 22、TypeScript、现有静态 HTTP、Phaser / Vite 锁定工具链、Playwright / Edge、node:test。

**Contract:** [COS65 / #66](https://github.com/lrfluobida/Cosmos/issues/66)，COS15 / COS17 / COS18；plan base `f6f7751c28380b18f6f785443ffa29ace49e4c80`。Source64 candidate `459b5baa2083bdadd32e1a815990951140d2dd55` 仅作只读接口参考，实施须等其独审集成 SHA 并更新本分支基线。

## 实际接线与文件

- 新建 `src/runtime/standalone-launcher.mjs`：source-owned、零第三方依赖的 loopback 静态服务器；从自身位置读取 `dist`，支持显式端口并输出 URL，拒绝缺入口、非法路径和端口冲突，提供信号退出与供可信 worker 使用的关闭接口。
- 新建 `src/runtime/entrypoint-delivery.ts`：最小包装与干净目录生命周期；复制 launcher，写 `README.zh-CN.md`、`_cosmos/delivery.json`、`_cosmos/sources.json` 和需要再分发的依赖许可文本。使用既有安全路径 / snapshot 核对整个包，clean 副本放在含中文和空格的 TEMP 目录。
- 新建 `src/runtime/entrypoint-delivery-worker.ts`：由现有 `runOwnedNode` 启动的固定可信 helper，导入 clean 副本中的 launcher，写 ready 回执，接收有界结束标记并关闭服务器。正常和异常返回都保留退出事实；取消 / owner 丢失 / deadline 沿原 owned process tree 收敛。它不实现新的浏览器验收 runner。
- 修改 `src/runtime/entrypoint-host.ts`：构建后包装；原 acceptance 使用 clean launcher；新增版本绑定的启动证据及 reviewer 读取引用，保留 Source64 的 `mediaObservations` options、manifest / normal-plan binding 和就绪检查。
- 必要修改 `src/runtime/entrypoint-preparation.ts`、`src/runtime/adapters/transfer/runtime-host.ts`、`src/runtime/adapters/transfer/loopback-origin.ts`：只传可信 clean 服务信息，保留冻结 origin / profile / sourceVersion / candidate guard。
- 新建 `tests/runtime/entrypoint-delivery.test.ts` 和 `tests/runtime/entrypoint-delivery.integration.ts`；最小修改 `tests/runtime/entrypoint-host.test.ts` 与 `tests/transfer/runtime-host.test.ts` 的受影响 fixture。修改 `docs/development/quickstart.md` 与本计划记录证据。Root 负责四份 tracking docs。

## Task 1: 包装契约 RED / GREEN

- [ ] 等待 Root 给 Source64 merged SHA；保留本 plan commit 后，将 feature 分支更新到该已审基线，核对实际 IO / media 接口。
- [ ] 先写 fixture RED：旧生产 capture → build → verify 后缺 launcher、说明和候选来源；记录 `node --experimental-strip-types --test --test-name-pattern="standalone package" tests/runtime/entrypoint-delivery.test.ts` 的失败输出。
- [ ] 包装只写未 sealed 的未来候选，在 build 完成且原权限仍有效时执行。保留模板四配置、作者 `src/` 与 `index.html` 和所有 capture 媒体；不增加 `node_modules`。缺 `src/main.ts`、`index.html`、`dist/index.html` 或声明媒体即失败。
- [ ] `delivery.json` 记录原 run / task / candidateRef、source / dist 位置和 capture refs；`sources.json` 从真实 capture metadata 保留 generator / licensed / generated 来源事实，并列出锁定依赖版本 / license。运行依赖的许可文本从版本匹配的工具链 package / LICENSE 读取；缺资料不得编造许可或降级成通过。
- [ ] 中文 README 给出 `node standalone-launcher.mjs`、浏览器 URL、端口选择、Ctrl+C、源码与重建依赖位置。说明原运行的 `delivery/current-report.json` 指向接受后自动报告，单独复制游戏包时可另带该 sidecar；不预填批准或体验结论。
- [ ] GREEN 核对所有中文、UTF-8 / LF、原 capture 和模板 bytes；测试已有包拒绝覆盖、来源 / lock 版本错配拒绝，保留合法 original-procedural 与有真实许可 metadata 的代表。

## Task 2: 原窗口中的 clean launcher

- [ ] `OwnedWork.run` 持有复制、ready、原 browser 验收和 helper 关闭整个生命周期；`runOwnedNode` 使用原 task / window / case authority 和原 deadline，先保留既有 5 秒清理余量。ready 超时、非 loopback / 错端口、启动失败或 helper 未确认退出均失败。
- [ ] 通过 `snapshot` 将整包复制到无 Cosmos repo、无项目 `node_modules` 的 TEMP 目录；复制前后与验收后逐文件 / bytes 比较原候选，不引入新 hash 体系。helper 和浏览器证据留原 evidence 目录，TEMP 包不成为第二候选。
- [ ] 默认 browser 以实际 clean launcher URL 构造原 plan，调用现有 `io.play`；Source64 的正常步骤及完整媒体取样不缩水，失败不能只认 HTTP 200。启动回执记录原 candidate、clean 字节一致结果、实际 URL、正常浏览器报告、原 deadline、helper 退出事实。
- [ ] transfer 的 `reserveTransferOrigin` 已占用冻结端口且 `mountCandidate` 只允许 registry project，因此保持原 URL / receipt / candidate guard；mount 后代理已核逐字节 clean launcher 的 loopback 服务，原 persistent series / profile / sourceVersion 完整保留。每次代理请求及结束都沿原 binding guard；异常撤 mount 并关闭 helper，不伪造新的 transfer 来源。
- [ ] 仅准备型、无 `candidateConsumer` 的路径保持无法通过玩法验收；具备 consumer 的 human / validation 路径实际调用 clean 包服务。host.finish 不启动检查，也不给 passed task 新权限。

## Task 3: 必要真实 fixture 与独审

- [ ] 一项免费 fixture 实际走 production capture → build → 包装 → 中文空格 TEMP → Node launcher → 原正常输入 / 媒体观测 → 独立 review → exact promotion。使用运行时 fake role 文件输出、真实 generic renderer 和真实 browser；明确分列 fake 模型 / build 与实际素材 / launcher / browser 证据，不手写目标游戏。
- [ ] reviewer 的独立工作副本包含最终包装 bytes 与启动 evidence；原 journal verified / review 签名与 `registry.promoteCandidate` 全目录比较覆盖它们。包装或来源说明在 verify 后变动，promotion 必须拒绝。
- [ ] 定向故障：缺 dist / 入口 / asset、非法路径 / 端口与占用、错候选 / version / copy bytes、启动失败、必要资源加载失败；至少一个停止和一个 deadline 代表核 server / browser / helper 退出并禁止后续派发。原 source / dist / metadata bytes 保持且异常不成为 accepted。
- [ ] 一项轻 transfer fixture 核真实 mount 代理源为 clean 副本、同 origin / profile / frozen binding 和清理；原 Source64 大媒体与 Source63 报告 / experience 矩阵复用，只运行本次影响的代表，不重跑 110 秒生成或旧 Edge 全矩阵。
- [ ] 运行新增两个测试文件、受影响 host / transfer 代表、`npm run typecheck` 和 launcher 的独立 Node 子进程代表；原始 stdout 存 TEMP 索引到本计划。UTF-8 / 中文 readback 和 `git diff --check` 通过后提交 exact SHA 给专属 reviewer；有效 finding 在本分支修复并定向复审，仅 batch08_merger 集成推送。

## 边界与完成记录

本卡只完成 source / 免费 TEMP fixture 的交付路径。实际 C6 unknown974882、closure12 / C7 / human 前置保持；不读取 Root 实际 `.cosmos`、凭据、会话或参考安装，不启动 paid 或修改账本。共享验证 ¥150、正式原 ¥200 / 12h、目标 ¥100 / 6h保持。

清理回执只证明本次 launcher / browser / helper 收敛；完整运行最终 cleanup 时刻仍需原验收。接受后的自动报告、Source63 完成恢复和最终用户体验继续原版本 binding。完整经典内容与 95% 还原目标由正式生成验证，fixture startup 不替代它们。

## 实施与原始证据

专属 reviewer 已批准 plan `17f125f3501be27c22911d95123a5a2357b0a4e8`。Source64 final `076c1107866cec3cb4c00d069efb387ea15ea721` 经独审后合入 `12899e5ad78db5302a1f9823ea0f67d0e4a7300d`；本分支以 no-ff merge `011b525e9f8c77561aac7d55778687a039214dfb` 保留两者祖先后开始实施。

包装在原 build 成功回调内写入；默认 browser 与已连接 transfer consumer 都实际调用同一个 clean lifecycle。transfer 继续原 origin、profile、sourceVersion 和 frozen plan，所有代理请求前后都核原 binding guard。通用 `.mjs` 通过最小 `tsconfig.json` 的 allowJs / include 进入 cold dist，包内 launcher 自身仅依赖 Node 标准库。报告与最终体验模块未改。

来源资料保留 capture metadata；Phaser 3.90.0、EventEmitter3 5.0.4 的实际 package version / MIT 字段逐项对 lock，并按原 bytes 复制 LICENSE。另保留 Phaser 随包 Earcut、Simplify、Matter 和 AudioContext polyfill 的原 notice 源文件；不把 metadata 当作新许可结论。

新资产完整契约要求 fake build 与真实 Vite 一样复制 public/assets。因此对以下已有 synthetic build fixture 仅增加 cp 和必要 import：`tests/cli/continuation-session.fixture.ts`、`tests/runtime/entrypoint-group.test.ts`、`tests/runtime/entrypoint-host-continuation.test.ts`、`tests/runtime/entrypoint-host-validation.fixture.ts`、`tests/transfer/human-continuation.fixture.ts`、`tests/transfer/human-continuation.test.ts`、`tests/transfer/human-preparation.test.ts`、`tests/transfer/passed-stage-reuse.test.ts`、`tests/transfer/runtime-acceptance.test.ts`、`tests/transfer/validation-case-seven-runtime.test.ts`、`tests/transfer/validation-case-six-runtime.test.ts`。这些不是新的真实构建证据。

原始 stdout 均位于 `C:/Users/26557/AppData/Local/Temp/`：

- `cos65-package-red.tap`：真实旧 host verify 已通过，但包无 launcher，1 FAIL / 0 skip；GREEN `cos65-package-green.tap` 1 PASS / 0 skip，1496.1079ms。
- `cos65-final-twelve-boundaries.tap`：12/12 PASS、0 skip，19606.1222ms；准确来源、promotion 包装漂移、版本 / 路径 / copy bytes、缺 dist / source entry / capture asset、sealed、依赖版本、launcher 启动失败、HTTP 200 但必要浏览器资源失败、目录外 Node CLI、非法路径 / 端口冲突，以及真实 server / Edge / helper 的停止和 deadline 收敛。
- `cos65-host-representatives.tap`：4/4 PASS、0 skip，8964.0035ms；原 wrong report、独审 proof、最终 review 包与截图代表。`cos65-affected-transport.tap`：3/3 PASS、0 skip，43045.6278ms；已登记 continuation 输出、validation grants 与实际 transfer consumer 同候选晋升。未重跑 Source64 旧 11/3 guard 矩阵或 Source62/63 重型组合。
- `cos65-clean-node-browser.tap` 首轮整条冷生产链已完成，最后测试把 journal signature 的 `location` 写成 `ref.location`，因此 command 1 FAIL，不能称整命令通过。修正后的 `cos65-clean-node-browser-green.tap` 1/1 PASS、0 skip，14601.3367ms；固定免费模型 / 独审 fixture、实际 tsc/Vite、renderer、干净 Node 和 Edge 154.0.4258.48 的 9 步正常输入 / 媒体，以及独立 review workspace、journal 与 exact promotion。
- `cos65-delivery-final-boundaries.tap` 旧 deadline fixture 8/9：原 runner 使用自身 cleanup reserve 返回 failed report，但 fixture 只盼 Promise reject。修正为读取实际 lifecycle / deadline failureFacts 后，`cos65-browser-cleanup-green.tap` 2/2 PASS；正式 timeout / reserve 没有为测试改变。最终 12 项也覆盖这两项。
- `cos65-final-cold-build.txt` 首次因 generic 返回值 required cast 的 TS2352 退出 2；改成先读 optional 字段再收窄布尔类型后，`cos65-final-cold-build-green.txt` cold tsc exit 0 / tool 8.3030181s。此前 typecheck 也通过。

最终冷生产链 `cos65-final-cold-production-chain.tap`：1/1 PASS、0 skip，14685.7862ms / 总17736.8728ms；实际证据保留在 `C:/Users/26557/AppData/Local/Temp/Cosmos COS65 中文交付 UYSAcv`，9/9 normal / media 步骤、errors[]、browser cleanup 和 clean helper exit 均通过。最终准确 SHA 与 reviewer verdict 由独审交接记录。所有 stdout 是免费 source / TEMP 证据，真实 human / model generation / paid 均 NONE；原实际账本与参考安装保持未访问。
