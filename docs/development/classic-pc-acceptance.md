# 经典 PC 验收工具草稿（COS-14 Phase A）

状态：`draft`。COS-01 尚未冻结，COS-14 / #15 保持未完成，不能据此通过 G4。

## 本次小计划

1. 在 `tests/benchmark/draft.test.mjs` 写分母、映射、版本和数值边界故障测试，先确认缺少入口时失败。
2. 在 `benchmarks/classic-pc/draft.mjs` 复用参考 `validate` 和现有 `validatePlan`，输出完整草稿与缺口；另提供纯比较函数。
3. 定向测试、严格 UTF-8 复读、检查实际 diff 后提交给独立评审。仅新增这三份文件。

本阶段不执行参考游戏、目标游戏或付费服务，不提供运行时验收成功入口。当前目录中的候选槽位不能替代已冻结的完整名册。

## 草稿映射 API

用 Node 22 的 `--experimental-strip-types` 导入 `benchmarks/classic-pc/draft.mjs`：

```js
buildAcceptanceDraft(reference, catalog, binding, mappings = [])
```

- `reference` / `catalog`：可信 host 读取的完整参考快照；函数调用原有 `reference/validate.mjs`，原样保留 `referenceValidationErrors`。未知条目、缺模式或伪造冻结仍然阻塞。
- `binding`：`{ referenceId, reference, artifact, runId, specVersion }`。`reference` 为整份参考快照的 `ArtifactReference`，`artifact` 为目标工程的 `ArtifactReference`，均使用现有 `{ artifactId, version, location }` 契约。快照的读取、实际内容与版本绑定由可信 host 负责。
- `mappings`：每项为 `{ entryId, binding, normalInputPlan?, mechanism? }`。每项的 `binding` 必须与本次绑定一致。`normalInputPlan` 使用现有 `AcceptancePlan`，`mechanism` 只是独立机制证据的 `ArtifactReference`。

返回值始终为 `phase: 'draft'`、`acceptance: 'blocked'`。它从整份 `catalog.entries` 生成输出，缺映射不会缩小分母；重复映射、未知 ID、版本冲突分别列出。`coverage.mappedEntries` 仅计结构上声明完整的映射，不能解释为已测或通过数；缺失、不完整、非法映射各自保留 ID，不计算综合分数。当前输入基准为 230 个条目，221 个待核实、9 个已定义政策；名册尚未闭合，不能将 230 宣称为最终分母。

正常输入计划复用 `validatePlan`。草稿要求计划只声明本条目的验收 ID，产物、run 和 spec 一致，并至少有一次点击在本条目断言之前。断言前只有鼠标移动、另一条目的断言、带 `force` 的点击都不能满足它。允许先观察初始状态，再点击并断言。跨多个验收 ID 的报告归属留给后续 host adapter；当前可以为一个条目安排多个正常操作和断言。

这些检查只证明计划结构和引用一致，不能证明点击具有正确玩法含义，不能证明实际文件、URL 与版本相符，也不会打开、执行或认证证据。每条都保留正常输入和机制执行待验证的缺口。传入 JSON `outcome: 'passed'` 不会影响结果。机制引用与正常输入计划分开保存；机制或截图不能替代正常购买、解锁、跨关和恢复存档流程。

## 纯比较函数

```js
compareExact({ value: 7, unit: 'count' }, { value: 8, unit: 'count' })
// { judgment: 'mismatch' }，仅为合成示例
compareTiming({ value: 100, unit: 'ms' }, { value: 105, unit: 'ms' }, { value: 2, unit: 'ms' })
// { judgment: 'matches', difference: 5, tolerance: 5 }，仅为合成示例
```

`compareExact` 对有限数字、字符串或布尔值严格比较；单位必须相同，`7` 与 `'7'` 不相等。`null`、缺值、非有限数字和对象均为 `invalid_input`，不会将未知数值当作已核实。

`compareTiming` 先要求三个值都是有限非负数字、步长严格大于零、单位完全相同且为 `ms`、`s` 或 `min`。不自动换算单位。随后使用 `abs(actual-reference) <= max(abs(reference)*0.05, recordedStep)`；边界含等号，测量误差不加进容差。实现直接比较 `reference-tolerance <= actual <= reference+tolerance`，避免先相减导致小数端点误判；不额外添加 epsilon 或扩大容差。返回的 `difference` 保留浮点计算值，仅用于观察。输出只可能是 `matches`、`mismatch`、`invalid_input`。

比较结果不生成 `EvidenceContract`，不证明输入数值来自实测。`recordedStep` 目前是纯函数参数；将来的可信 host adapter 必须从本次执行记录和同一生产模拟的等价性证据取得步长，并与 reference、工程、run 绑定。不能直接读取游戏作者验收请求里的步长。当前缺少该见证，所以草稿始终阻塞，不能用任意大步长使游戏通过。

## 已知政策与后续见证

| 已定义条目 | 可复用能力与仍需补齐的验证 |
| --- | --- |
| CORRESPONDENCE | 冻结名册后的原创角色一一对应表，目标画面中的动作和状态检查 |
| LAYOUT / ART | 实际截图、原速动画和正常操作，配合布局、来源、遮挡与可读性评审 |
| AUDIO | 原创或可再分发来源、实际播放与音量操作证据 |
| STARTUP | 锁定依赖的干净构建、真实启动日志与固定浏览器版本的正常输入报告 |
| OFFLINE | 构建后离线操作、新档、关闭并重新打开浏览器后的恢复与重开 |
| PERFORMANCE | 冻结本机配置、1280×720 原速渲染采样；普通场景平均 ≥55 FPS，无尽压力场景 ≥30 FPS |
| STABILITY | 实际运行的崩溃、异常、存档完整性和核心流程记录；时间与场景必须明确 |
| USER-ACCEPTANCE | 用户实际试玩后的决定及其对应交付版本，不能由自动报告代签 |

`src/acceptance/runner.ts` 的实际类型是 `AcceptanceReport`，内含 COS-02 `EvidenceContract[]`。最终 adapter 应调用已有 `runAcceptance`，保存真实报告、构建快照、浏览器版本、日志和媒体，并核对每一步与期望及同一交付版本。现有 `compareFixedStepPacing` 只提供 `mechanism_equivalence` 检查，不携带可信步长与工程版本见证；它也不会证明真实原速渲染、音频或帧率。Phase A 没有第二个 runner、证据认证器或最终报告汇总入口。

每个无尽条目附带 `minimumWallClockMs: 1800000` 和 `finite_observation_only` 边界。最终分别检查循环、难度增长、覆盖波次及至少 30 分钟原速稳定运行。加速模拟的 tick 数、短时 runner 通过或总进程存活时间均不能充当这段观测；需记录游戏实际运行窗口、场景与波次。循环与增长的准确判定仍等待参考冻结，有限观测不能证明无限局面的全部行为。

## 验证

```powershell
node --experimental-strip-types --test tests/benchmark/draft.test.mjs tests/reference/validate.test.mjs
```

初版八个草稿测试使用合成计划与数值，检查完整分母、移除模式、伪造冻结、缺映射、重复或未知 ID、版本混用、错误输入归属、机制与输入分离，以及离散/计时边界和非法单位。既有参考、runner 和核心契约未修改，沿用其通过证据；本测试不是游戏运行、完整基准或用户试玩通过证明。

2026-10-01，Windows / Node 22.22.2：上述命令 24/24 通过（8 个草稿测试、16 个参考测试）；新增两个 `.mjs` 的 `node --check` 和根目录 `npm run typecheck` 通过。根 TypeScript 配置仅覆盖 `src/`，草稿模块的实际加载与行为由这 8 个测试验证。新增三份文件通过严格 UTF-8 解码，中文文档已复读。

同日独立评审发现小数秒边界误判。新增 5% 与一步长的两个回归测试，先分别复现 `0.95 s` 下界、`1.1 s` 上界失败；修复后 `node --experimental-strip-types --test --test-name-pattern="timing" tests/benchmark/draft.test.mjs` 的 4 个计时测试通过，覆盖上下界、紧邻边界外的值及等价毫秒结果。其余未变代码沿用上述证据。草稿仍为 `draft/blocked`。
