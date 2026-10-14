# COS89 可负担编码请求保留上下文实施计划

> 使用 writing-plans；计划 exact `66c51d6a05c5d833242ade918f480a5655926859` 已由 `cos89_reviewer` 独立 PLAN_APPROVED、无阻塞finding。专属 `cos89_implementer` 按 executing-plans、TDD 和 verification-before-completion 执行；同一独立 reviewer 审查实际 diff，唯一 merger 由 Root 指定。

**目标：** 只要现有普通输出裁减仍能安全准入编码请求，就保留原上下文；不能负担现有输出下限时才允许原预算摘要尝试。

**架构：** 仅替换 `src/roles/factory.ts` 的预算压缩谓词，复用 `validationReservation` 和当前 validation authority。Pi 原生 hook、摘要生命周期与实际 reserve/admit/settle 保持原实现。

**技术：** TypeScript、Pi 0.99.2、现有 node:test、真实 factory/controller/Pi 与 fake provider，network0。

**基线与权限：** 基线 main `388defc543ab4445b5446be6618215a61785168c`；managed worktree `E:/CodexData/.codex/worktrees/cos76-transfer-case8/Cosmos`，分支 `codex/cos89-affordable-compaction`。COS89 [#90](https://github.com/lrfluobida/Cosmos/issues/90)，id5854211592，父#1，依赖 COS79/COS85/COS88。计划时 C13 使用冻结源码，Root 后续通知 C13结束、closure19完成并明确解除冻结；本作者仍仅在隔离 worktree运行合成夹具，不整合 main，不读取真实 ledger/session/key，不注入运行时提示，不新增付费运行。

## 问题与固定策略

原谓词是 `inputBytes >= 131072 && validationReservation(request) > remainingMicroCny / 2`。无图片时 B=131072、cap=65536 预留786432µ，在余额1067661µ下完全可付却会选择摘要。Pi 被选中后以 `reserveTokens=model.contextWindow` 强制原生阈值；这不能作为窗口已满的证据。

改为：

```ts
return request.inputBytes >= 131072
  && validationReservation({ ...request, maxOutputTokens: Math.min(4096, request.maxOutputTokens) }) > current.remainingMicroCny;
```

下限与普通输出裁减严格一致；如需共享4096，仅在同一 factory 文件内提取局部常量，不重构其它逻辑。等额可付使用 `>`，不用 `>=`。不改变输出下限、二分最大可付 cap、请求次数、窗口、预算、权限或价格。

先执行现有 case/window/deadline/max-output/admission/abort 校验；选中只允许尝试摘要，每笔实际摘要仍经原输出裁减与原子准入。不足或 stale authority 仍停止，不吞异常、不重试。Pi keepRecent16000、8192摘要 cap、增长/去重/no-benefit、length恢复、manual/overflow均保持。

C13元数据中的重复计划读取与31k–44k tokens摘要只是观察，不能证明模型动机或因果；本卡不承诺实际生成改善。93578-byte计划及其56997-byte单行minify不在本卡变更范围。

## 文件与步骤

- 生产：`src/roles/factory.ts`，仅上述谓词及必要本地常量。
- 定向策略：`tests/roles/validation-output-limit.test.ts`，替换旧半额触发断言并增加边界。
- 实际链：`tests/providers/coding-compaction.fixture.mjs`、`tests/providers/coding-compaction.test.mjs`，新增可负担场景与必要合成压力调整，保留真实 factory/controller/Pi/native，不复制生产策略或摘要逻辑。
- 文档：本计划及 `docs/specs/cos89-affordable-compaction.md`。不改共享 tracking、C13源码/样本游戏或历史结果。

- [x] 独立审查此短计划；记录不能保持的契约并修订，禁止扩大实现。
- [x] 在旧 factory 上先运行真实链 RED：满足旧半额条件而普通输出下限可付，预期0摘要/0checkpoint、原上下文保留且普通派发 cap合法可付；确认失败来自旧摘要选择。
- [x] 策略边界覆盖 full-cap可付、仅缩减cap可付、下限恰好可付、低1µ、128KiB低1byte、图片预留、请求cap小于4096、stale authority和取消。小于4096属于既有普通输出策略代表；当前固定validation原cap仍65536，压缩绑定未放宽。
- [x] 最小替换谓词，运行对应 GREEN；普通实际派发元数据、预留和 sent cap相等，并证明 cap+1不可付（仅缩减场景）。
- [x] 下限不可付场景通过真实 factory选择后仍走原摘要准入，定向证明实际摘要自身不足时0派发且失败锁保持；可负担摘要至少一个真实 native代表。
- [x] 处理旧测试输入契约：以原controller.reserve暂存容量，在原hook返回后controller.cancel释放；普通下限不足才实际选择。原固定grant、费用和生命周期断言保持，未强制策略true。
- [x] 重跑受夹具输入变化影响的native矩阵。未变Pi代码、SDK流程、manual/overflow证据复用；两项新fixture清理错误按原controller停止语义修正并定向复跑，完整记录见下表。
- [x] 在 worktree 运行下列免费验证，记录真实输出和环境问题；不在 main运行测试。

```powershell
node --experimental-strip-types --test tests/roles/validation-output-limit.test.ts
node --experimental-strip-types --test tests/providers/coding-compaction.test.mjs
npm run typecheck
npm run build
$env:COSMOS_COMPACTION_COMPILED='1'
node --experimental-strip-types --test --test-name-pattern='affordable coding|minimum coding|summary input admission' tests/providers/coding-compaction.test.mjs
Remove-Item Env:COSMOS_COMPACTION_COMPILED
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --allowJs --strict --skipLibCheck tests/roles/validation-output-limit.test.ts
git diff --check
```

新测试名称将包含上述三个定向pattern之一；运行前核对匹配项数，0匹配不是通过。源码测试应全通过；compiled只覆盖本卡实际链增量。受影响旧fixture需要重跑，未变证据不重复。

- [x] 检查既有目标文件严格UTF-8/LF后最小patch；回读中文与diff。
- [ ] 提交精确SHA、RED/GREEN及检查证据和已知缺口，交独立规格→质量审查。只有批准SHA才交唯一merger；批准前保持SOURCE_NOT_READY，目标 `AFFORDABLE_CODING_COMPACTION_SOURCE_READY`。

## 契约审查结论与待决项

该谓词缩窄可选预算摘要的选择范围，原实际请求准入与费用守卫仍是最终权威；投影观察与下一实际请求可能不同，仍由原实际 metadata重新估价。不能据策略true推断摘要可付，也不能据false保证后来预算不变。已知测试输入契约需要调整，生产范围目前没有必须扩大的证据。

## 实现与证据

生产仅上述factory谓词，原输出裁减、Pi、SDK、预算及来源代码均未修改。三个可付代表B=131072，余额分别1067661µ、500000µ、294912µ，实际普通cap分别65536、29732、4096；0summary/0checkpoint，hook前后projection逐字节相同，实际inputBytes/cap/预留与派发相符，缩减时cap+1不可付。

原native生命周期夹具仍用相同provider响应、工具与输入。仅在普通下限可付但需验证摘要生命周期的边界，通过真实controller.reserve将即时余额暂降至下限预留减1µ；原factory选择后的每次selected均断言下限不可付。hook结束后cancel未派发合成预留，所有这些行均admittedAt=null、cancelled、reserved=settled=0。首代表原余额1069753µ，暂存534308µ后即时535445µ，低于251339-byte输入的535446µ下限；摘要仍实际准入/结算，返回后释放供同attempt继续。length/no-benefit/no-op的后续成功不依赖永久降低grant或伪造余额。

原始文件均在 `C:/Users/26557/AppData/Local/Temp/`，provider fake/network0，controller/session/registry为新建TEMP合成数据；没有实际游戏证据。

| 原始文件 | 命令与结果 |
| --- | --- |
| `cos89-affordable-red.tap` | `node --experimental-strip-types --test --test-name-pattern='affordable coding' tests/providers/coding-compaction.test.mjs`；旧factory上3 FAIL/0skip，TAP4784.9247ms，三项均实际发送1summary而断言0失败 |
| `cos89-affordable-green.tap` | 同命令；最小生产修正后3/3、0skip，4563.2297ms |
| `cos89-factory-source.tap` | `node --experimental-strip-types --test tests/roles/validation-output-limit.test.ts`；28/28、0skip，12970.6019ms，包含图片下限等额/低1µ、stale bindings、取消、unknown及既有输出/repair路径 |
| `cos89-compaction-source.tap` | `node --experimental-strip-types --test tests/providers/coding-compaction.test.mjs`；31pass/2fail/0skip，22801.4562ms。2fail均新fixture清理在controller.stop已自动取消行后重复cancel；其余31通过证据复用 |
| `cos89-pressure-cancel.tap` | 仅fixture清理按原stop/halt源码区分已cancelled行后，`--test-name-pattern='production compaction cancel\|optional length cannot hide cancel'`运行同文件；受影响2/2、0skip，4935.9267ms。生产没有因该夹具错误再变更 |
| `cos89-compiled.tap` | build后设置`COSMOS_COMPACTION_COMPILED=1`，同文件pattern为`affordable coding\|minimum coding\|summary input admission\|settled optional length-`；dist7/7、0skip，8380.5841ms；finally移除env |
| `cos89-typecheck.log`、`cos89-build.log` | `npm run typecheck`、`npm run build`均退出0 |
| `cos89-strict.log`、`cos89-strict-allowjs.log` | 原计划strict命令退出2/TS7016，原因是既有`.mjs`fixture导入无声明；补与项目tsconfig一致的`--allowJs`后，上述strict命令退出0，无stdout。没有增加声明或放宽strict |

表格中的`\|`为Markdown转义，实际Node pattern使用`|`。compiled扩大为7项以覆盖新压力下COS85单笔/split length续行；未变Pi普通/manual/overflow测试和其它历史验证不重复。

源码测试证据为31项原pass加修正后2项pass，并非声称最终重新全跑33项。新fixture增加真实合成reservation记录及原cancel释放，不代表真实并行或供应商收费。策略只能证明本次边界；后续实际metadata/authority仍会重验，不能保证实际模型进度或下一案例成功。当前等待独立源码审查，不整合或推送。
