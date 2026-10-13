# COS80 当前候选计划阅读契约实施计划

> 执行：使用 executing-plans 与 TDD，逐项完成并保留独立审查。

目标：编码作者只需完整读取当前候选对应的计划，不再被要求完整读取另一候选的同义计划。

基线：`730cb4de0cb6c3eb08b2f230ec9b09f54644c120`。专属作者 `cos77_implementer`，独立 reviewer `cos76_implementer`，sole merger `batch75_76_merger`。Issue [#81](https://github.com/lrfluobida/Cosmos/issues/81)，id5837669130；依赖 COS38/50/78。只读设计已获 PLAN_APPROVED；本文提交后短核，再改生产文件。

## 最小实现

- [ ] RED：在 `tests/transfer/runtime-host.test.ts` 检查真实 factory 的 v1 packet；在 `tests/transfer/runtime-acceptance.test.ts` 现有真实 linked repair 代表检查 v2 packet。映射根据 `outputs[].destination` 唯一选择，保留全部固定 refs。
- [ ] GREEN：只改 `src/runtime/adapters/transfer/runtime-host.ts` 的编码阅读规则。`initialize` 用可信 `ctx.candidates` 与 `planRefs` 写两项 `{outputDestination,plan,file}` 映射；作者以固定输出 destination 直接选择完整计划，不先读取 JSON 判断版本。两计划 artifact version 均可能为 v1，不能据此猜候选版本。
- [ ] 保持：design 原双计划读取；coding/repair 原输入、权限和历史；双计划字节与等价验收校验、candidate staging/binding、原费用、次数、时限和 repair 路由。无唯一匹配时指令要求停止猜测并报告阻塞。规则只针对编码作者，reviewer 权限不变。
- [ ] 定向验证：运行新增两代表；复用或聚焦核查原候选单计划依赖及 inactive-plan 篡改拒绝。运行 typecheck/build、diff 检查；不重跑 C9 seed 或旧修复长链。
- [ ] 回读 UTF-8/LF/中文，提交 exact SHA 与原始 TAP，交独立规格→质量审查，再由 sole merger 整合。

代表命令：`node --experimental-strip-types --test --test-name-pattern="runtime design prepares|COS40 reliable persistent mismatch" tests/transfer/runtime-host.test.ts tests/transfer/runtime-acceptance.test.ts`；随后 `npm run typecheck`、`npm run build`、`git diff --check`。原始日志保存到任务专属 TEMP 路径。

## 证据边界

C9 两计划各 93542 bytes/2737 行，八段 220 步相同，仅绑定不同。只读内存校验已证明当前 v1 与合成 v2 destination 唯一命中当前计划，旧 C5 refs 保留。取消额外完整阅读要求不保证模型不重读、实际节费或生成成功；初始 packet 不内联计划，不能宣称其直接减少 93542 bytes。仅 SOURCE/TEMP、fake provider、零网络；不读真实账本/会话/密钥，不修改 C9 产物、历史或新增案例。
