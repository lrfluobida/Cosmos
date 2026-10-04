# COS-38 运行时迁移输入准备

依据：[COS-38 / #39](https://github.com/lrfluobida/Cosmos/issues/39)。基线 `8b6fef9d1ff18fe55afa33649e16cdef450acaae`。本项只连接运行时设计、固定角色输入与候选绑定；persistent/media 执行 adapter、机器可读失败阶段、有界 design 语义修复及实际付费入口仍待后续任务。

## 实现顺序

1. 定向测试先验证显式 `.preparation` operator proposal 和完整 ExecutionRequirement，保留六个 T16 与两个原 stage ID；缺实现时看到 RED。
2. 通用 host 只接收可信源码提供的准备 seam；默认 human/browser/pilot 契约不变，不从 `src` 导入 `probes`。
3. design 在原任务写入通用说明及独立 `cos16-design/1`；先验算原始地图，再发布四个预留输出：通用设计、transfer 设计、候选 v1/v2 等价 plan。独立评审和 journal 覆盖四个实际引用。
4. host 在双 plan 之前保留 loopback origin；receipt 固定原 case/window/source/requirement。重开只能使用原端口；冲突、绑定变化和取消拒绝。listener 仅提供 404，不启动浏览器或模型。
5. art/coding 的原固定输入包含双 plan。code capture 与 candidate 仅 stage 当前版本的 plan，真实 registry 验证精确依赖和字节，拒绝错版或陈旧绑定。
6. 无效 design 保存原始字节与明确诊断，停止下游。未接执行 consumer 时，即使候选绑定正确，也返回 failed / insufficient_evidence，不调用 build/play/promote，不交付 accepted candidate。

## 验证

新增纯测试使用独立临时 ledger/registry、合成 provider/IO；不读取真实 ledger/cases/sessions，不提供目标游戏或付费请求。覆盖四 capture、只读镜像、独立 review/journal、真实 v1/v2 candidate、不覆盖双 plan、错绑定/字节、无效设计及 source/scope/origin 变化。旧 oracle 和真实浏览器证据按未变部分复用。最后运行新增定向测试、默认 host 代表回归和一次 strict import closure 编译。

## 工作约束

专属 implementer 分支 `codex/transfer-runtime-input-adapter`，独立 reviewer 审实际 diff，仅 sole merger 集成。UTF-8、最小 patch、中文复读适用。本项零付费，不新增实际 window/额度，不重开旧案例。源码准备不等于 Cosmos 生成推箱子或迁移通过。

## 实现与证据

- 实际路径为计划中的 12 个文件。可信 seam 只有准备生命周期、额外固定输出和候选绑定；`src` 不导入 probe。`.preparation` 与原 `.browser` 各自读取真实固定输入，完整需求字节在每次 dispatch 时核对。
- `withPreparation` 包装原 planner/DAG 回调，复用 OwnedWork.run；callback 成功、提前错误或取消均等待同一个关闭 Promise。返回前核对取消与原 scope；初始化或验证失败也释放 listener。恢复只重开原端口/receipt，不新增角色或费用。
- RED：六个入口/准备 API 缺失；operator 契约被旧 human validator 拒绝；early-failure envelope 缺失；取消 callback 未拒绝；origin scope 错误后仍监听；缺地图仅得到通用失败。各项定向 RED 后实现 GREEN，原失败输出保留于本次工具记录。
- 最终 `node --experimental-strip-types --test tests/runtime/entrypoint-host-preparation.test.ts tests/transfer/runtime-host.test.ts tests/transfer/design-binding.test.ts`：**19/19、0 failed、0 skipped，24.2360006 秒**。只用隔离临时 ledger/registry 和合成 provider/IO；两个真实 registry candidate 验证 plan 选择与精确依赖闭包，没有浏览器、模型或目标游戏。
- 默认 host 代表：`--test-name-pattern='delivery requires|passing gameplay text' tests/runtime/entrypoint-host.test.ts` **2/2，4.4965448 秒**；`--test-name-pattern='synthetic pipeline binds' tests/runtime/entrypoint-host-validation.test.ts` **1/1，7.0363299 秒**，包括原一次 linked coding repair。后续改动仅是显式 preparation 生命周期/诊断与对应规则，原默认证据复用。
- 最终 strict import closure：`node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --allowImportingTsExtensions --verbatimModuleSyntax --types node src/runtime/entrypoint-host.ts src/runtime/entrypoint-preparation.ts src/runtime/entrypoint-validation.ts probes/transfer/binding.ts probes/transfer/runtime-host.ts probes/transfer/loopback-origin.ts tests/runtime/entrypoint-host-preparation.test.ts tests/transfer/runtime-host.test.ts tests/transfer/runtime-host.fixture.ts tests/transfer/design-binding.test.ts`：**exit 0，7.705532 秒**。首次只有 union narrowing，下一次只有 test 类型推断错误；已修正，最终无诊断。
- `git diff --check` 通过。全部编辑文件重新严格 UTF-8 解码，保持 LF；原 host/binding 中文内容保留，README 原始字节前缀精确相同。

本项候选待独立审查；计划 source marker 是 `TRANSFER_RUNTIME_INPUT_ADAPTER_SOURCE_READY`。未接 persistent/media consumer 时 coding 明确 failed / insufficient_evidence，不执行 generic build/play/promote，不返回 accepted delivery。新的 design 语义修复及实际迁移入口仍未实现。
