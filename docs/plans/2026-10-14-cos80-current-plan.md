# COS80 当前候选计划阅读契约实施计划

> 执行：使用 executing-plans 与 TDD，逐项完成并保留独立审查。

目标：编码作者只需完整读取当前候选对应的计划，不再被要求完整读取另一候选的同义计划。

基线：`730cb4de0cb6c3eb08b2f230ec9b09f54644c120`。专属作者 `cos77_implementer`，独立 reviewer `cos76_implementer`，sole merger `batch75_76_merger`。Issue [#81](https://github.com/lrfluobida/Cosmos/issues/81)，id5837669130；依赖 COS38/50/78。只读设计已获 PLAN_APPROVED；本文提交后短核，再改生产文件。

## 最小实现

- [x] RED：在 `tests/transfer/runtime-host.test.ts` 检查真实 factory 的 v1 packet；在 `tests/transfer/runtime-acceptance.test.ts` 现有真实 linked repair 代表检查 v2 packet。映射根据 `outputs[].destination` 唯一选择，保留全部固定 refs。
- [x] GREEN：只改 `src/runtime/adapters/transfer/runtime-host.ts` 的编码阅读规则。`initialize` 用可信 `ctx.candidates` 与 `planRefs` 写两项 `{outputDestination,plan,file}` 映射；作者以固定输出 destination 直接选择完整计划，不先读取 JSON 判断版本。两计划 artifact version 均可能为 v1，不能据此猜候选版本。
- [x] 保持：design 原双计划读取；coding/repair 原输入、权限和历史；双计划字节与等价验收校验、candidate staging/binding、原费用、次数、时限和 repair 路由。无唯一匹配时指令要求停止猜测并报告阻塞。规则只针对编码作者，reviewer 权限不变。
- [x] 定向验证：运行新增两代表；复用或聚焦核查原候选单计划依赖及 inactive-plan 篡改拒绝。运行 typecheck/build、diff 检查；不重跑 C9 seed 或旧修复长链。
- [x] 回读 UTF-8/LF/中文，提交 exact SHA 与原始 TAP供独立规格→质量审查。最终批准与 sole merger 整合仍待完成。

代表命令：`node --experimental-strip-types --test --test-name-pattern="runtime design prepares|COS40 reliable persistent mismatch" tests/transfer/runtime-host.test.ts tests/transfer/runtime-acceptance.test.ts`；随后 `npm run typecheck`、`npm run build`、`git diff --check`。原始日志保存到任务专属 TEMP 路径。

## 证据边界

C9 两计划各 93542 bytes/2737 行，八段 220 步相同，仅绑定不同。只读内存校验已证明当前 v1 与合成 v2 destination 唯一命中当前计划，旧 C5 refs 保留。取消额外完整阅读要求不保证模型不重读、实际节费或生成成功；初始 packet 不内联计划，不能宣称其直接减少 93542 bytes。仅 SOURCE/TEMP、fake provider；不读真实账本/会话/密钥，不修改 C9 产物、历史或新增案例。

## 实现证据

计划 exact `5324f831b2bb64799ffe10418ff5117781fcb15b` 已由 `cos76_implementer` 独立 PLAN_APPROVED。生产仅变编码阅读文字与可信映射，未修改选择/验收函数；仍为 SOURCE_NOT_READY，最终 exact 需独审。

| 检查 | 结果 | 原始证据 |
| --- | --- | --- |
| 两个 packet 代表 RED | 0/2、退出1、0skip；准确失败于实际 packet 缺少映射，TAP 84808.994ms | `C:/Users/26557/AppData/Local/Temp/cos80-current-plan-red.tap` |
| 两代表与两项原守卫 GREEN | 4/4、退出0、0skip；TAP 88226.5657ms | `C:/Users/26557/AppData/Local/Temp/cos80-current-plan-green.tap` |
| `npm run typecheck` / `npm run build` | 均退出0 | 当次 tool 输出；未另存日志 |
| 两测试 strict 编译 | 退出0，无诊断 | 当次 tool 输出；未另存日志 |

GREEN 使用同一命令，pattern 扩为 `runtime design prepares|COS40 reliable persistent mismatch|real v1/v2 candidates stage|inactive repair plan changes`。strict 命令：`node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --allowImportingTsExtensions --allowJs --types node tests/transfer/runtime-host.test.ts tests/transfer/runtime-acceptance.test.ts`。

v1 实际 factory packet 的两项映射与 registry 准确引用一致，inputFiles 保留两个 artifact version 为 v1 的计划；design 仍要求双读。真实 `prepareValidationRepair`→`resumeTaskDag` 的 v2 packet 继承同一映射与全部 inputs，由新 output destination 选 v2，原未改候选依赖/等价 steps/origin 断言通过。未选 v2 计划篡改仍阻止 v1 绑定与恢复。旧 C9 长 seed 与 17 分钟链未重跑。

这些 fixture 使用真实 host、factory、registry 和 linked repair，模型会话及 build/browser 报告为合成；consumer 有本地 loopback HTTP，不调用外部 provider，不付费。它们证明输入契约和原守卫，不能证明实际模型阅读行为或游戏通过。

## 独审修正

独立 reviewer 对 `6d5c924e91ee63fe449c41385067f4fec769c96c` 指出共享 captureLayout 仍有 `Select each ... and read`，可被解释为逐项全读。补实际 v1 packet 负断言后得到有效 RED（1 fail/0skip，TAP 18972.7583ms）；仅将该句改为“需要读取某 capture 时”的条件式路径说明，design 显式双读保持。受影响 v1 GREEN 1/1、0skip，TAP 22462.3638ms。

原始日志：`C:/Users/26557/AppData/Local/Temp/cos80-path-guidance-red.tap`、`cos80-path-guidance-green.tap`。命令同上，仅选择 `runtime design prepares` 与 `tests/transfer/runtime-host.test.ts`。修正后 typecheck/build/两测试 strict 再次退出0；证据为当次 tool 输出，无独立日志。reviewer 明确要求只跑受影响代表，未改 v2、映射、refs 和守卫，复用前述4项通过证据，不声称重跑全套。
