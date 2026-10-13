# COS75 局部 scope 超时与 origin 生命周期修复计划

> 按已批准窄设计执行；专属 implementer `cos75_implementer`、独立 reviewer `cos75_reviewer`，仅本批 sole merger `batch75_76_merger` 在 Root 授权后集成和推送。采用 writing-plans、TDD 和 verification-before-completion；复用已通过证据，不重开 C7。

**目标：** 单次验证 scope 的私有计时器超时仍拒绝当前操作，但不永久关闭同一活跃运行的 owned loopback listener。

**设计：** `validation-scope.ts` 使用模块私有错误类型及可信判别函数，只由自身 timer 创建超时错误并作为局部 abort reason。Promise.race 与最终 `signal.throwIfAborted()` 均传播同一类型；原 controller.signal 已取消时始终按运行取消处理。origin.verify、runtime-host guard 与 requireCurrent 的 catch 仅在该可信错误且原 listener owner signal（input.signal / ctx.signal，含 OwnedWork）仍活跃时保留 listener，随后原样抛出错误。初始化失败、显式 close、最终清理、运行取消、receipt/binding 漂移和其他错误仍关闭。每次调用继续完整 scope 检查；不缓存、重试、延长 5 秒或改预算。

**技术：** TypeScript、Node 22 内置 test runner、现有真实 transfer host/合成免费 controller fixture，无新增依赖或测试框架。

## 修改范围

- `src/runtime/validation-scope.ts`：可信局部 timeout 分类；保持 deadline 与清理。
- `src/runtime/adapters/transfer/loopback-origin.ts`：只调整 verify 的错误关闭条件。
- `src/runtime/adapters/transfer/runtime-host.ts`：只调整 guard / requireCurrent 的错误关闭条件。
- `tests/transfer/scope-timeout-origin.test.ts`：两条实际边界 RED→GREEN，以及取消、伪造错误、漂移和禁止执行底层工具的负例。
- `docs/specs/cosmos-spec.md`、`docs/specs/cosmos-issues.md`、`docs/specs/github-issues.json`、`PROGRESS.md`：追加 COS75 与 source/free-fixture 结果，保持 open / SOURCE_NOT_READY 待审。

## 步骤与检查

- [x] 独立 reviewer 审查本计划后实施：7b2eb4c 已 PLAN_APPROVED；owner signal 澄清由 reviewer 独立确认。
- [x] 将已有免费诊断重现纳入 Node 测试：origin.verify 的局部超时不毒化健康并行调用；真实 createTransferRuntimeHost 的 bindPreparedCandidate → requireCurrent → guard 首句 scope 超时不关闭 listener。先运行确认两条按原关闭问题失败。
- [x] 新增私有 timeout error / 判别和三处 catch 条件；不改变当前调用失败结果，不执行被拒调用的底层 file 工具。
- [x] 运行新增测试：两个超时场景、最终 controller.read 期间的超时、真正运行 abort 与 timer 同步发生的优先级、receipt 篡改、binding 失效、同名同 message 普通 Error、初始化失败与显式最终 close。当前失败之后的新调用重新完整验证，未通过 scope 的 file 工具执行次数为 0。
- [x] `node --experimental-strip-types --test tests/transfer/scope-timeout-origin.test.ts`：完整新增 source 测试通过；`npm run typecheck` 和 `npm run build` 均退出 0。
- [x] 用构建后的 `dist/runtime/...` 对同一超时/运行取消场景做代表验证；复用旧 transfer 正常路径证据，必要时仅跑受影响 receipt/binding 代表。
- [x] 回读 UTF-8/LF 与中文，生产文件非 ASCII 字符序列与基线一致；`git diff --check` 通过，mapping JSON 可解析且 pending 状态/75 项一致。
- [ ] 提交 exact SHA 交独立规格/质量审查并等待 sole merger。

## 已知事实与边界

C7 固定源码 cd6d9a9，实际 18 SDK / 58415 micro-CNY / 945983 ms；insufficient_evidence、未完成 capture、无候选、无 game/build/browser 通过。closure13 后 revision2023、15 stopped、75 closed/13 audits、unknown/reserved0。上述是已登记历史，本任务不读私有账本或 session、不付费、不运行旧 C7。

已证实缺陷是局部 scope 超时经三处 catch 被升级为共享 listener 的永久关闭。真实 C7 最初超时的慢步骤尚未确证，不能写成并行导致；本卡不宣称 C8、完整经典、PERFORMANCE、实际完整 12h 或最终 human 通过。

审查目标标记为 `VALIDATION_SCOPE_TIMEOUT_ORIGIN_SOURCE_READY`；exact SHA 源码规格与质量审查前，tracking 保持 open / SOURCE_NOT_READY。

## 免费验证记录

- 基线新增两测试 RED 0/2（TAP 18416.7206 ms）：并行调用报 `Owned transfer origin listener or fixed receipt changed`，真实 host 外层 guard 后 fetch failed；修后两测试 GREEN 2/2（16755.3322 ms）。
- 首次扩展运行 10/11（39383.7056 ms）：新增文件工具夹具选择了未授权的 scope-tool.txt，失败于正常文件权限检查；改用已授权 design.json，原字节未变与下一次完整验证后写入均通过（1/1，14225.3303 ms）。生产代码未因此扩改。
- `npm run typecheck`、`npm run build` 均退出 0；新增测试显式 strict/NodeNext/noEmit 检查退出 0。首次显式检查仅报 optional validateTasks 调用，已补非空断言，与既有 host 初始化契约一致。
- 最终 source：`node --experimental-strip-types --test tests/transfer/scope-timeout-origin.test.ts`，11/11，0 skip，40110.9581 ms；原始 TAP：`C:/Users/26557/AppData/Local/Temp/cos75-source-green.tap`。
- Compiled：设置仅该命令环境 `COSMOS_TEST_COMPILED=1`，同测试使用 `--test-name-pattern='local scope timeout preserves|real transfer host outer guard|controller abort.*false'`；3/3，0 skip，18044.453 ms。原始 TAP：`C:/Users/26557/AppData/Local/Temp/cos75-compiled-green.tap`。
- 既有完整 source/receipt 守卫：`node --experimental-strip-types --test --test-name-pattern='source changes reject prepared binding|changed frozen receipt' tests/transfer/runtime-host.test.ts`，2/2，0 skip，46187.5801 ms；原始 TAP：`C:/Users/26557/AppData/Local/Temp/cos75-existing-guards.tap`。
- 显式测试类型命令：`node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck --strict tests/transfer/scope-timeout-origin.test.ts`。
