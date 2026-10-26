# COS127 普通设计评审请求容量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. 本计划已独立APPROVED_PLAN并获Root实施批准；由Root安排独立implementer、独立reviewer及唯一merger。各步骤使用checkbox记录。

**Goal:** 对可信选择的普通设计reviewer，将完整JSON读取展示做词法空白压缩，并在原grant中选择4096至8192的最大可负担输出cap，保持完整verdict与失败语义。

**Architecture:** 宿主现有ordinary门槛和角色判定决定一个组合opt-in。现有scoped read wrapper在返回结果前调用小型纯helper；factory直接复用authorBudgetOutputLimit与recordRequest，Pi/SDK实际报价、派发和结算继续使用既有链路。

**Tech Stack:** TypeScript、Node22.22.2、pi-ai/pi-coding-agent0.99.2、node:test；免费合成TEMP文件和fake provider transport。

**Status:** source-scoped-complete；源码已独立审查与主线集成，没有真实run授权。

源码结果：独立cos127_reviewer对 `13af7dbec0eddb0d6deb69193f2244ef3c75ebb3` 完成规格/质量审查，APPROVED_SOURCE_SCOPED、无actionable finding；唯一merger合入发布 `d088df021825f1813e5d8fe9f1c775f011144321`，10文件精确一致，主线typecheck/build及3/3短代表通过。[批准](https://github.com/lrfluobida/Cosmos/issues/128#issuecomment-6406706248)、[完成关闭](https://github.com/lrfluobida/Cosmos/issues/128#issuecomment-6406710871)已核证。仅SOURCE范围完成，父COS18仍open/partial；room11永久关闭，新源码尚无真实review verdict或游戏结果。

审批记录：[COS127 / #128](https://github.com/lrfluobida/Cosmos/issues/128)；独立 `design_review_budget_plan_reviewer` 给出 `APPROVED_PLAN`、无P1/P2阻塞项，Root批准固定输入的正式发布与免费源码实施。源码后续独审与集成结果见上述状态记录。

- 批准规格输入 SHA256：`e984dd75874ee3476ad4bb30d1a1d330ae9d933e25ec12e555d5f5cac5d126a8`
- 批准计划输入 SHA256：`850a9af4cdd97f5730af43efb93ce4c707f738006c0862bcb7b000a5edfc848d`

已获独审与Root认可的非阻塞测试组织说明：历史byte边界由helper验证，真实SDK按实际bytes核证；批准技术行为不变。

---

## 依据与边界

- 规格：[COS127正式规格](../specs/cos127-design-review-budget.md)，基线main `7b6d01ab749cd912a11b2abeb36deda6db882d04`。
- 先读仓库AGENTS.md、CONTEXT.md、cosmos-spec及届时批准的COS127任务卡；公开任务由唯一merger登记，源码作者按指定职责实施。
- room11已永久关闭；只使用Root保留的诊断作为数值依据，测试生成自己的合成完整JSON，不打开原controller、不重放terminal请求、不改私有原产物。
- 一个连贯实现任务在独立managed worktree/分支完成，不能将只启用一半策略的版本作为本卡完整交付。实现提交后由独立reviewer按规格→代码质量审查，唯一merger仅集成已批准SHA。

## 文件职责

拟改源码仅四处：

| 文件 | 责任 |
| --- | --- |
| `src/providers/json-read-display.ts`（新增） | 固定SDK read结果的完整性判定与词法去外部空白 |
| `src/providers/workspace-tools.ts` | 新可选compactFullJsonReads，在原read成功后、返回Pi前调用helper |
| `src/roles/factory.ts` | ordinaryDesignReviewBudget选择器、精确reviewer门槛、复用预算helper、recordRequest |
| `src/runtime/entrypoint-host.ts` | 既有ordinary排除门槛内注入选择器，使用既有role(task) |

复用但预期无需改动：`src/roles/author-output-budget.ts`、`src/roles/provider-budget.ts`、`src/providers/pi.ts`、`src/providers/request-input.ts`、`src/budget/ledger.ts`、现有review parser/orchestrator。不要为命名重构作者helper；若实施证据要求扩大源码边界，先交具体diff理由给Root/独审。

拟新增测试：

- `tests/providers/json-read-display.test.ts`
- `tests/roles/design-review-budget.test.ts`
- `tests/providers/design-review-budget.test.mjs`
- `tests/providers/design-review-budget.fixture.mjs`（测试辅助，不是另一个生产框架）

宿主选择测试优先扩展现有 `tests/runtime/ordinary-design-request-capacity.test.ts`。复用既有fixture中真实RunController/预算与TEMP隔离做法，只为本卡增加需要的参数；不得让fake session替代最终组合链路。

## Task 1：完整读取展示与精确角色选择

- [ ] 在独立worktree确认批准规格/基线；编辑前检测目标UTF-8并记录原换行。只对上述文件做最小patch，完成后重新读取检查中文。
- [ ] 先添加 `COS127 JSON` 与 `COS127 scope` 失败用例。没有选项时保留旧结果；命中普通design reviewer时转换。
- [ ] JSON正例通过真实createWorkspaceTools和SDK read读取TEMP文件：完整对象/数组/标量、中文字符串、转义引号/反斜杠/Unicode、大整数、指数、-0、重复键、键顺序。断言只删除字符串外四种JSON空白，原文件bytes不变，native前结果保留其他字段。
- [ ] 回退例覆盖offset>1（即使片段是合法JSON）、limit提前结束且没有details.truncation、SDK默认字节/行截断、非JSON、图片、多block、isError及不确定参数。源路径越权仍在原scoped检查处被拒。
- [ ] 运行定向RED，确认失败来自缺失转换/选项，不是fixture或导入错误。
- [ ] 实现 `compactCompleteJsonRead`：完整性条件全部成立后只验证JSON语法，再做字符串/转义状态扫描。永不输出JSON.parse所得对象；无变化或不确定时返回原result。固定SDK剩余行尾注须单独处理，不能只看details。
- [ ] 在现有read.execute返回之后按 `compactFullJsonReads` 调helper，保持原SDK读取与图片检测、原一次IO和取消语义，不给provider加隐藏转换。
- [ ] 在factory声明并捕获 `ordinaryDesignReviewBudget?: (task: Readonly<TaskContract>) => boolean`；校验配置函数与8192 cap。仅role reviewer、无purpose、无validation调用；传冻结task，非布尔结果/异常拒绝，false保持旧行为。
- [ ] 在既有ordinary且排除validation/preparation/human/binding/inherited门槛内注入 `task => role(task) === 'design'`。不读取taskId形状决定角色。宿主tests使用相同语义角色但不同taskId证明选择，其他role/purpose不能命中。
- [ ] 运行上述GREEN；scope包含作者、planning、普通art/coding reviewer及旧/fixedvalidation/绑定入口。通过既有宿主fixture确认入口排除条件，无须新增真实环境。

初次定向命令（PowerShell，工作目录为实施worktree）：

```powershell
node --experimental-strip-types --test tests/providers/json-read-display.test.ts tests/roles/design-review-budget.test.ts
node --experimental-strip-types --test --test-name-pattern="COS127" tests/runtime/ordinary-design-request-capacity.test.ts
```

RED预期为新行为断言失败；GREEN预期全部选中测试通过，无意外provider网络。

## Task 2：原grant中的4096至8192选择与安全记录

- [ ] 先补 `COS127 budget` 失败用例，使用现有真实预算controller的TEMP副本。命中reviewer配置maxOutputTokens8192，output policy使用floor4096。
- [ ] 直接调用已有 `authorBudgetOutputLimit`，传factory已存在的snapshot、task、executionAuthority与estimate；不改helper算法/作者配置，不为reviewer启用authorBudgetCompaction。
- [ ] 在命中reviewer的createRoleBudget中复用 `recordRequest:true`，保持作者原条件；只出现原六个request安全字段，未命中reviewer保留旧billing结构。
- [ ] 验证原cap可负担时保留8192；否则选择最大可负担cap，floor不可负担时拒绝；非单调estimate仍逐个候选选择最大值，报价不修改原snapshot/ledger。
- [ ] 复用既有authority和取消用例，增加新接线的必要覆盖：原grant/run/window/截止时间变更拒绝、搜索yield时取消、deadline五秒清理边界拒绝。真正reserve/admit仍是最后准入，不能把预报价当授权。
- [ ] 核对输入估计仍来自真实Pi normalized context；helper只返回cap，不改context或请求身份。requestId与billing保持实际调用一致。
- [ ] 运行本卡roles测试GREEN；对未改的helper既有测试证据按SHA/环境有效性复用。仅因新增factory调用影响的作者/旧reviewer代表用例做定向回归。

```powershell
node --experimental-strip-types --test tests/roles/design-review-budget.test.ts
```

不创建新grant、预算分配、诊断文件、重试或窗口，不降低floor到2K，不把安全metadata扩大到prompt、工具内容或凭证。

## Task 3：真实factory至SDK的组合证明

- [ ] 使用现有Pi测试的fake底层provider transport模式新增本卡fixture：真实createRoleFactory、createWorkspaceTools、createPiSession、SDK工具调用/normalize以及TEMP RunController；仅替换网络transport并拒绝任何真实网络，使用显式synthetic key。不能用fake role/session/手工拼装context替代链路。
- [ ] fake响应首先发出真实read tool calls，让SDK读取完整合成JSON；下一轮实际native/model/报价看到同一词法压缩结果。读取原TEMP文件前后bytes相同，scope不可扩大。
- [ ] 构造与room11拒绝点等量的完整合成JSON及必要固定上下文，使实际归一化输入原103650、压缩后92144（通过合成数据/空白校准，不改生产context或引用私有原文）。在该请求前原task余额固定229213µ；先前合成收费如存在须明确计入。断言组合cap5615、quote229208；5616不能报价；floor4096报价217056。
- [ ] 同量负对照分别关闭显示转换或adaptive选择，得到原4K240068和压缩8K249824仍不适配229213。floor报价217056刚好可负担与217055余额不可负担；拒绝后fake transport调用数不增加。
- [ ] 回执recordRequest严格六字段，并与真实normalized inputBytes、实际cap、原quote一致。native持久化的toolResult与fake transport收到的工具文本相同，不能只检查helper返回值。
- [ ] fake最终响应分别返回合法approved和完整多finding changes_requested；通过真实现有review解析/请求流程验证inputVersions、evidenceIds和所有findings不丢失。所有verdict均为合成测试，不记录到room11。
- [ ] fake返回length（包括看起来像完整JSON的文本）仍触发原Pi incomplete失败，已发费用按既有链路结算，不产生approved/passed或新review retry。缺失真实findings、错误版本等仍被原schema拒绝，不修改parser放行。
- [ ] 运行组合RED→GREEN。只有fake底层transport，真实请求数/费用均为0；测试TEMP账务不混入验证总账。

```powershell
node --experimental-strip-types --test tests/providers/design-review-budget.test.mjs
```

若需要复用私有数值重建脚本，只在内存读取原native作诊断；正式测试应自足，不依赖closed room11目录或其用户需求内容。

## Task 4：最小回归、独审和唯一合并

- [ ] 运行本卡三组与宿主命中/排除代表用例一次。修复新的失败后仅重跑受影响行为。
- [ ] 运行typecheck/build；对现有作者预算与COS125压缩、旧reviewer默认行为执行受factory接线影响的代表回归。未改实现的既有广泛通过证据引用原SHA，不重跑完整历史validation。
- [ ] `git diff --check`，重新读取所有编辑文件并检查中文/编码；确认源码diff仅为批准范围，没有私有需求、凭证、真实账本、生成游戏或旧产物改动。
- [ ] implementer提交完整组合，提供精确SHA、差异文件清单、测试命令/退出码、native/metadata关键证据与未验证项；不自行合入main或push主线。
- [ ] 独立reviewer读取实际diff和批准spec/plan，先规格后质量；有可执行finding由原implementer在原分支修，affected复审。
- [ ] 唯一merger只集成获批SHA，做受影响整合检查并记录结果。Root决定公开任务/源码状态及后续真实新run；不得恢复room11或把免费SOURCE当实际游戏完成。

```powershell
npm run typecheck
npm run build
git diff --check
```

本候选不安排paid验证、不更改预算、模型或时间政策，不处理七项设计语义缺口，不创建版本/诊断服务。完成定义仅为本卡源码范围获批与集成，最终游戏、COS16/COS18及体验验收保持原状态。
