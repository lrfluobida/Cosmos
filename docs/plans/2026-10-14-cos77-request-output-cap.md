# COS77 逐请求编码输出上限实施计划

> 采用 writing-plans、TDD 和 verification-before-completion。专属 implementer `cos77_implementer`，独立 reviewer `cos76_implementer` acting COS77 reviewer，唯一 merger `batch75_76_merger`。按已授权窄设计推进；先独立审计划，再实施。

**目标：** 当 validation coding 作者当前请求的完整原始输出上限不可承担时，选择仍在本角色余额内的最大有效上限，保留实际请求预留与发送的一致性。

**设计：** Pi 在取得实际 `inputBytes` / `hasImages` 后调用可选 trusted async `requestOutputLimit`，校验返回正 safe integer 且不超过原配置上限，然后报价、预留与发送共用同一个 effective cap。策略只接 validation coding 作者及同 coding-role repair 作者，使用当前 `validationAuthority.remainingMicroCny` 和既有 `validationReservation`。原 cap 可承担时保持；否则二分查找最大可承担 cap，最低 `min(4096, 原 cap)`。最终 `controller.reserve` 原子核验保持。

**技术：** TypeScript、Node 22 test runner、真实 Pi/ModelRuntime 边界、合成 TEMP controller；无真实网络、账本、密钥或会话输入。

## 修改范围

- `src/providers/pi.ts`：可选策略与安全校验；仅有策略时绑定当前 context 快照，避免新 await 期间输入漂移；估价及原生 stream 的 maxTokens 共用有效值。
- `src/roles/factory.ts`：仅 validation coding author 的生产接线（包含已有同角色 repair）。
- factory 内局部策略用现有报价规则选择有下限的最大可承担 cap，刷新原窗口 authority；无需新增生产模块。
- `tests/providers/request-output-limit.test.mjs`：实际 SDK seam 的合成 405672-byte 输入、零网络、边界与 compiled 代表。
- `tests/roles/validation-output-limit.test.ts`：真实 factory、当前 controller 预留、角色范围与 race/unknown/deadline/floor 守卫。
- 本计划与 `docs/specs/cos77-request-output-cap.md`；共享 PROGRESS/spec/issues/mapping 由 sole merger 记录。

## 步骤

- [x] 独立审阅本计划与任务卡，exact `58a9905df01a137b5b1d6310cf167a4b1e878125` 获 `PLAN_APPROVED`，无 finding。
- [x] 先写实际 Pi 边界测试并运行 RED：405672 bytes、余额1233190、原 cap65536，应选择52730，报价1233184，假 provider 恰好一次、网络0。
- [x] 实现最小 Pi 策略；返回 NaN、负数、非整数、unsafe、above original 拒绝，await 期间 context 变化不能低估新输入。无策略保留既有路径。
- [x] 先写 factory/额度策略 RED，再实现窄接线。原 cap 足额不变；52731越界、余额 race、unknown、deadline、无可承受输入、floor不足全部零发送。不重试或二次重算。
- [x] 验证真实 factory coding/repair，非目标角色和 formal 兼容；length 仍 incomplete；每次请求刷新有效余额。
- [x] 运行新增 focused 测试、既有 Pi/output limits/request timeouts 受影响代表、typecheck/build；构建产物运行新增 Pi/factory/repair 代表。
- [x] 回读 UTF-8/中文、保持现有 LF、git diff --check，准备提交 exact SHA 和证据给独立 reviewer。
- [ ] 独立 reviewer 审实际diff，按发现最小修复并重审。
- [ ] sole merger 在独立批准后集成并更新共享记录；作者不 merge/push main。

## 取舍与范围

选择实际请求级 cap，能准确覆盖随工具回合增长的输入。固定降低角色 cap 会在余额充足时无谓压缩输出；自动 compaction 或失败后重试会扩大编排和计费语义，不在本卡。新增 await 使用独立请求 context 快照并校验原输入未变（或直接保守拒绝），不以旧小输入资助变化后的新请求。

Root 已登记 C8 因下一请求预留超出角色剩余额度停止：14次API/新增487528µ，coding grant1720718µ、remaining1233190µ、未决预留0；原 cap65536要求1335632µ。余额未花完。原C8不重开；不新增付费或验证窗口。缩减下限不保证任务完成；完整经典、human、COS16/COS18 状态不提升。

审查目标 `VALIDATION_CODING_OUTPUT_CAP_SOURCE_READY`；实施与独立审查完成前为 `SOURCE_NOT_READY`。

## 免费验证记录

- Pi 首条实际边界 RED：1条失败，`Budget admission rejected; no provider request sent`，TAP 2782.2908ms；factory 首条 RED：策略 `undefined` 与期望 `function` 不符，TAP 3133.4819ms。
- 新增 Pi source 16/16，0skip，TAP 2825.7331ms；factory/controller 首轮13/13，0skip，TAP 7611.6113ms；随后补充 min(4096,原cap)、formal 与非目标明确断言3/3，TAP3454.8987ms，原行为证据复用。
- 既有 `tests/providers/pi.test.ts`、`tests/providers/request-window.test.mjs`、`tests/roles/output-limits.test.ts`、`tests/roles/request-timeouts.test.ts` 共39/39，0skip，TAP4775.3327ms。原 SDK compaction、cancel、unknown 与request-window回归通过；未跑旧重型迁移fixture。
- `npm run typecheck`、`npm run build` 退出0。新增测试 standalone strict 检查首次通过；增加compiled导入后暴露一处mock rest参数丢失上下文类型，已补 `Parameters<typeof authority>` 显式元组类型。
- Compiled 设置 `COSMOS_OUTPUT_CAP_COMPILED=1`，运行两新增测试文件，pattern `actual Pi metadata|input mutation during final-window|production factory|balance-race|formal coding|same-role claimed`：6/6、0skip，TAP5412.8045ms。实际导入dist Pi与factory；controller/原fixture是合成源码，provider为fake且每个fixture强制network0。
- 所有更改文件经严格UTF-8解码、LF/noBOM检查；仅2个生产文件，无账本、schema、声明上限、自动压缩、重试或调用编排改动。
- 最终source集合32条：31/32在同次运行通过，新增native SDK工具上下文测试最初错误读取 `context.tools`；查阅固定SDK类型确认工具已normalize到system message的 `toolsAdded`，只改测试断言后该条1/1通过，TAP2589.056ms。生产代码无补丁，前31条复用。完整初次输出 `C:/Users/26557/AppData/Local/Temp/cos77-source-initial.tap`；受影响单条修后输出 `C:/Users/26557/AppData/Local/Temp/cos77-native-tool-context-green.tap`。合成中文prompt和真实workspace tool schema均穿过Pi原生请求及快照路径。
- 新增测试严格类型命令：`node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --allowJs --checkJs false --skipLibCheck --strict tests/roles/validation-output-limit.test.ts`。
