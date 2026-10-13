# COS75 局部 scope 超时与 origin 生命周期修复计划

> 按已批准窄设计执行；专属 implementer `cos75_implementer`、独立 reviewer `cos75_reviewer`，仅 sole merger 集成和推送。采用 writing-plans、TDD 和 verification-before-completion；复用已通过证据，不重开 C7。

**目标：** 单次验证 scope 的私有计时器超时仍拒绝当前操作，但不永久关闭同一活跃运行的 owned loopback listener。

**设计：** `validation-scope.ts` 使用模块私有错误类型及可信判别函数，只由自身 timer 创建超时错误并作为局部 abort reason。Promise.race 与最终 `signal.throwIfAborted()` 均传播同一类型；原 controller.signal 已取消时始终按运行取消处理。origin.verify、runtime-host guard 与 requireCurrent 的 catch 仅在该可信错误且原运行 signal 仍活跃时保留 listener，随后原样抛出错误。初始化失败、显式 close、最终清理、运行取消、receipt/binding 漂移和其他错误仍关闭。每次调用继续完整 scope 检查；不缓存、重试、延长 5 秒或改预算。

**技术：** TypeScript、Node 22 内置 test runner、现有真实 transfer host/合成免费 controller fixture，无新增依赖或测试框架。

## 修改范围

- `src/runtime/validation-scope.ts`：可信局部 timeout 分类；保持 deadline 与清理。
- `src/runtime/adapters/transfer/loopback-origin.ts`：只调整 verify 的错误关闭条件。
- `src/runtime/adapters/transfer/runtime-host.ts`：只调整 guard / requireCurrent 的错误关闭条件。
- `tests/transfer/scope-timeout-origin.test.ts`：两条实际边界 RED→GREEN，以及取消、伪造错误、漂移和禁止执行底层工具的负例。
- `docs/specs/cosmos-spec.md`、`docs/specs/cosmos-issues.md`、`docs/specs/github-issues.json`、`PROGRESS.md`：追加 COS75 与 source/free-fixture 结果，保持 open / SOURCE_NOT_READY 待审。

## 步骤与检查

- [ ] 独立 reviewer 审查本计划后实施。
- [ ] 将已有免费诊断重现纳入 Node 测试：origin.verify 的局部超时不毒化健康并行调用；真实 createTransferRuntimeHost 的 bindPreparedCandidate → requireCurrent → guard 首句 scope 超时不关闭 listener。先运行确认两条按原关闭问题失败。
- [ ] 新增私有 timeout error / 判别和三处 catch 条件；不改变当前调用失败结果，不执行被拒调用的底层 file 工具。
- [ ] 运行新增测试：两个超时场景、最终 controller.read 期间的超时、真正运行 abort 与 timer 同步发生的优先级、receipt 篡改、binding 失效、同名同 message 普通 Error、初始化失败与显式最终 close。当前失败之后的新调用重新完整验证，未通过 scope 的 file 工具执行次数为 0。
- [ ] `node --experimental-strip-types --test tests/transfer/scope-timeout-origin.test.ts`：完整新增 source 测试通过；`npm run typecheck` 和 `npm run build` 均退出 0。
- [ ] 用构建后的 `dist/runtime/...` 对同一超时/运行取消场景做代表验证；复用旧 transfer 正常路径证据，必要时仅跑受影响 receipt/binding 代表。
- [ ] 回读 UTF-8/LF 与中文，`git diff --check`；记录结果，提交 exact SHA 交独立规格/质量审查并等待 sole merger。

## 已知事实与边界

C7 固定源码 cd6d9a9，实际 18 SDK / 58415 micro-CNY / 945983 ms；insufficient_evidence、未完成 capture、无候选、无 game/build/browser 通过。closure13 后 revision2023、15 stopped、75 closed/13 audits、unknown/reserved0。上述是已登记历史，本任务不读私有账本或 session、不付费、不运行旧 C7。

已证实缺陷是局部 scope 超时经三处 catch 被升级为共享 listener 的永久关闭。真实 C7 最初超时的慢步骤尚未确证，不能写成并行导致；本卡不宣称 C8、完整经典、PERFORMANCE、实际完整 12h 或最终 human 通过。
