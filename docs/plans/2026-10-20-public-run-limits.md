# COS107 公开新建运行的预算与时限选择实施计划

> **For agentic workers:** Use `superpowers:executing-plans` to implement this approved plan task by task. Each implementation remains with the dedicated author; Root assigns an independent reviewer and the sole batch merger.

**Goal:** 普通用户可从公开 `new` 入口选择较小的总预算和生成时长，恢复继续使用原限额与时钟。

**Architecture:** 将 CLI 的选择传给已有 `IntakeController`，复用原单账本、一次激活和角色比例。原始选择保存在既有 `intake-origin.json`；公共恢复先核对来源，再准备环境或执行任务。

**Tech Stack:** Node 22、TypeScript、现有 Node test runner；无新依赖。

## 范围与契约

- 基线 `fbacdf5a91c79ebeb299435341c55a2f43ce95ac`；任务 [COS107 / #108](https://github.com/lrfluobida/Cosmos/issues/108)，原生父 [COS18 / #19](https://github.com/lrfluobida/Cosmos/issues/19)。计划 `d31404c0164cc93178deb12bd130e66566146de6` 经 `public_run_limits_reviewer` 独审 `APPROVED_PLAN_SCOPED`、无 P1/P2，Root 批准源码实施。
- `new --max-cny <金额>` 接受十进制正数，最多 6 位小数、不超过 200；拒绝科学计数、符号、空白、前导零及非有限值。按整数元与补齐至六位的小数转换 micro-CNY，沿用追加入口的金额语义，不用浮点乘法取整。
- `new --max-minutes <分钟>` 接受 1..720 的十进制整数。两项各自可省略，默认分别为 200 和 720；重复、缺值、非法或超帽选项在创建目录、取得运行锁、读取模型配置或调用 host 前拒绝。
- 限额选项只用于 `new`；`resume`、`stop`、`status`、`continue` 等命令拒绝。追加继续使用原有单独确认协议。
- 实施核对发现准备模式原 host 在 `entrypoint-human-preparation.ts:139` 与 `entrypoint-human-continuation.ts:49` 固定 ¥200。Root 已批准窄边界：较小限额仅适用于普通生成；准备模式非默认金额或时长在 CLI/session 副作用前拒绝，显式 200/720 归一化为原 origin 格式，不更改 transfer 契约。
- 访谈和规划分别分配 `Math.floor(limitMicroCny / 20)`，默认仍各 ¥10；后续角色继续使用当前剩余池比例。允许最小 1 micro-CNY，分配可为 0；原预算门禁拒绝无法预留的调用，不提高用户限额。
- 选择任一新参数时，在现有 `intake-origin.json` 保存完整 `limits: { limitMicroCny, durationMs }`。没有新参数仍沿用旧默认来源格式。公共 intake 恢复核对 origin 与账本/时长；正式恢复核对账本及 `originalDeadlineAt - originalStartedAt`。缺少 `limits` 的旧公共记录必须匹配原默认 200/720；删除新小额来源、字段不完整、非法或不一致均拒绝。
- 核对放在公共恢复取得 owner、准备环境和新调用之前；`readConfirmedGeneration` 复用同一核对，覆盖正式恢复、原有追加和体验读取。仅对有 `intake-origin.json` 的公共来源和已记录 CLI `local-user` 确认应用公共规则；后者缺失整个 origin 也拒绝。没有公共来源的原内部 API/validation 不套默认 200/720 检查，现有内部较低额度 API 不变。已经确认的停止、费用、起点及截止保持；原始限额与追加窗口的金额/时长分列。
- 输出显示实际总额和分钟，并说明时钟仍在需求确认且环境就绪后激活一次。旧默认运行与旧公共记录继续可读。
- 本卡不更改游戏验收、classic/transfer、角色拓扑、费用规则或共享验证账本，不启动 provider、浏览器、C16 或付费生成。

## 文件归属

| 文件 | 最小职责 |
| --- | --- |
| `src/cli/index.ts` | `new` 参数提取、命令范围和副作用前拒绝、help |
| `src/cli/run-limits.ts`（新增小模块） | 限额解析/校验、原默认值、比例分配和来源核对的纯逻辑 |
| `src/cli/session.ts` | 传递限额、保存原来源、读取原始选择并显示；公共恢复核对 |
| `src/runtime/render-frame-selection.ts:64-65` | 原始来源字段白名单仅准入新 `limits` 字段，保持原帧选择校验 |
| `tests/cli/run-limits.test.ts`（新增） | 金额/分钟边界、取整及命令副作用边界 |
| `tests/cli/session.test.ts` | 选择、确认、intake/正式恢复、来源缺失与不一致 |
| `tests/cli/render-frame-selection.test.ts` | 新限额与帧选择共存及恢复的必要组合 |
| `tests/cli/continuation-session.fixture.ts`、`tests/cli/continuation-session.test.ts` | 较低原限额与追加窗口的真实组合，核对原时长而非追加时长 |
| `tests/cli/continuation-quote.test.ts`、`tests/cli/continuation-session.test.ts` | Root追加批准：按既有契约校正两处已在基线复现的旧断言，不改对应runtime |
| `README.md`、`docs/development/quickstart.md` | 小额通用生成示例、默认与恢复语义 |

优先不改 `src/runtime/intake.ts`：其创建参数、账本验证、时限上限与一次激活已具备。若测试暴露必须改动，先报告具体调用证据。公共登记仅本作者维护 `PROGRESS.md`、`docs/specs/cosmos-issues.md`、`docs/specs/github-issues.json`；COS108 作者独占其实现及计划，双方不互写。

## 实施与验证

### 1. 参数和分配

- [ ] 先写 RED：公开 `runCli(new, --max-cny 5 --max-minutes 30)` 到 stub host 前应接受参数；当前应在 usage 拒绝。非法参数 trap 断言 host 未被读取、目录不存在。
- [ ] 覆盖金额 `0.000001`、`5.123456`、`200`；拒绝 `0`、负数、`200.000001`、7 位小数、指数、NaN/Infinity、空/缺值、重复参数。分钟覆盖 `1`、`720`，拒绝 `0`、`721`、小数、指数、重复及缺值；非 `new` 均拒绝。
- [ ] 实现必要小模块与参数接线。默认分配各 10,000,000µ；5 元各 250,000µ；21µ 各 1µ；1µ 各 0µ，总分配不超额。极小额度沿原 reserve 失败，provider transport 计数为 0。
- [ ] 执行 `node --experimental-strip-types --test tests/cli/run-limits.test.ts`，保存先失败与实现后的完整输出。

### 2. 保存、确认与恢复

- [ ] 先写 RED：`5 / 30` 的真实 session 配合 stub host 保存小额账本、完整 origin，显示准确值；确认后同一账本激活，截止减起点恰为 1,800,000ms。
- [ ] 覆盖只传一项、默认两项、intake 退出后恢复、正式恢复；已用费用和原起点/截止不变。恢复不重新访谈、不再次激活；持久停止仍拒绝。
- [ ] 覆盖 origin 限额被删除、缺字段、金额/时长与快照不符及 CLI 确认后整个 origin 被删除；在 owner 恢复、host.prepare 和 host.execute 前拒绝。旧无 `limits` 的默认公共记录仍可读，包括已完成的只读恢复；无公共来源的内部较低额度 API 保持；追加窗口核对原时钟而非新增窗口时钟。
- [ ] 将选择传入既有 `IntakeController.create`，按原比例分配；在既有原始来源保存及读取位置核对，不新增账本或独立来源框架。
- [ ] 执行 `node --experimental-strip-types --test tests/cli/run-limits.test.ts tests/cli/session.test.ts tests/runtime/intake.test.ts`。复用 `intake.test.ts` 的单账本、原费用和一次激活断言，新增用例只覆盖本次 delta。

### 3. 文档与必要回归

- [ ] README/quickstart 添加 `new <run-dir> --brief "鼠标记忆配对小游戏" --max-cny 5 --max-minutes 30`，说明访谈与生成共用金额、极小额度可能不能预留调用、恢复保留原选择。
- [ ] 执行 `node --experimental-strip-types --test tests/cli/completed-generation-resume.test.ts tests/cli/continuation-quote.test.ts tests/cli/continuation-session.test.ts tests/cli/experience.test.ts tests/cli/render-frame-selection.test.ts`，仅核对共享 `readConfirmedGeneration` 的现有 caller，以及 origin 白名单的限额/帧采样组合；必要时仅补受影响负例。
- [ ] 执行 `npm run typecheck` 与 `npm run build`；重开全部编辑文件，验证 UTF-8、中文、换行和 `git diff --check`。不重复旧浏览器或 transfer 矩阵。
- [ ] 作者提交准确 SHA、测试原输出和已知缺口；独立 reviewer 先查本计划契约再查实际 diff。作者修复有效 finding 后复审，仅 Root 指定的单一 merger 集成和推送。

## 结果边界

源码验收证明公共入口能够保存并执行较低限额，不能代替实际通用游戏生成。后续可用上述记忆配对 brief 验证正常输入、独立角色与交付；实际付费需另按原共享 ¥150 验证账本办理。本卡不新增固定 validation case。

## 作者实施结果（待源码独审）

公开参数与真实stdin激活先RED两项，随后通过。来源检查的RED直接到达owner恢复/host，帧组合RED被旧白名单拒绝；实施后公共/session/frame27/27。准备模式窄边界另先RED两项，最终参数/边界6/6；原intake15/15及较低原限额追加窗口1/1通过。各组存在重叠，不合计为独立通过数。`npm run typecheck` 与 `npm run build` 均exit0。

计划内caller原组合66/68：`continuation-quote` 的future-format旧regex未包含现有continuation错误，`continuation-session` 的已完成窗口stop后恢复旧断言仍期待拒绝。两项在 `fbacdf5a91c79ebeb299435341c55a2f43ce95ac` 归档原源码同样失败（0/2），Root随后批准只校正测试：future-format精确拒绝 `Invalid formal continuation snapshot.`；停止后按 [COS63任务卡](../specs/cosmos-issues.md) 与 [CLI已完成恢复契约](../development/quickstart.md) 返回同一封存报告/候选，实际 `readCompletedGeneration` 与 `readCompletionTiming` 对未确认完成计时维持 `incomplete`，无prepare/execute，费用、时钟及stop快照字节不变。不锁内部原因措辞或可选字段。

同组串行最终68/69；剩余一项新增断言修正后affected1/1，其余68复用，不声称单次69/69。中间并行组合的owner夹具一次构造失败，原样隔离1/1及随后串行通过，原因未确认；全部失败输出保留，未改runtime。两个原frame断言缺少已存在的module-repair版本后缀，已最小对齐其原始来源；对应生产policy源码与基线相同。

原输出索引：作者工作树 `.cosmos/cos107/verification-index.json`。所有场景均使用临时目录与fake host/SDK，不启动provider、真实浏览器、paid或C16；本结果交专职reviewer审查后才由唯一merger集成。
