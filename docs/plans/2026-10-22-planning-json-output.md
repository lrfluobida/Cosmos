# 规划 JSON 输出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 规划实际API请求启用JSON对象输出，减少非法JSON造成的首次规划失败，保持原校验与预算。

**Architecture:** RoleFactory按可信purpose选择固定格式，Pi的originalStream options接入SDK已有的onPayload hook传递json_object。使用一个小型共享示例函数或既有协议模块生成合法JSON示例，供system/user提示复用；不引入纠正请求或历史恢复。

**Tech Stack:** TypeScript、Node22、Pi SDK0.99.2、DeepSeek OpenAI-compatible接口、node:test与fake fetch。

---

规范为 [COS119 任务卡](../specs/cos119-planning-json-output.md)。批准后在独立 managed worktree 的 codex/planning-json-output 分支实施，base bfbf69173cf63ad1530ba1ddf1f610d811df7cce。作者仅新增本卡 `docs/specs/cos119-planning-json-output.md` 和 `docs/plans/2026-10-22-planning-json-output.md`；PROGRESS、cosmos-issues与github-issues三汇总文件由唯一merger维护。

## Task 1：真实请求的定向RED

**Files:** 新增 `tests/roles/planning-json-output.test.ts`；必要时复用或最小扩展 `tests/providers/pi.test.ts` / 既有规划fixture。

- [ ] 阅读AGENTS、CONTEXT、cosmos-spec、本卡及 `src/roles/planner.ts`、`src/roles/factory.ts`、`src/providers/pi.ts`、`src/roles/protocol.ts`。
- [ ] 用TEMP RunController、原RoleFactory/planTaskDag和fake fetch构造正常规划；断言真实request body的response_format等于json_object，并验证原模型/thinking/tools/cap及计费钩子，先获得RED。
- [ ] 准备通用合法plan fixture，objective含中文、嵌入引号、反斜线及换行；用JSON.stringify生成响应而非修复真实room4原文。禁止读写真实运行或调用真实provider。
- [ ] 运行 `node --experimental-strip-types --test tests/roles/planning-json-output.test.ts` 的新定向用例，保存失败命令与原输出。

## Task 2：窄接线与合法示例

**Files:** 修改 `src/providers/pi.ts`、`src/roles/factory.ts`、`src/roles/planner.ts`；若需共享示例，新增 `src/roles/planning-protocol.ts`。

- [ ] 在Pi配置新增窄JSON对象选择，缺省不改变旧payload；由factory仅对planning启用。
- [ ] 当前adapter没有自定义onPayload；在originalStream options接入SDK已有hook，与原model/cap/input guard共存，按SDK返回语义组合已有options.onPayload并保留其他字段，设置固定值：

```ts
if (config.jsonOutput) body.response_format = { type: 'json_object' };
```

实际字段名由实现按既有风格确定；不开放任意payload对象，不改已有thinking处理或派发时序。

- [ ] 生成两种合法通用示例，例如：

```ts
JSON.stringify({ tasks: [{ taskId: 'example-task',
  ...(withPolicyId ? { policyId: 'supplied-policy-id' } : {}),
  role: 'design', objective: 'Preserve the requested "quoted" label.',
  acceptanceIds: ['confirmed-acceptance-id'], dependsOn: [] }] });
```

提示明确这些是格式占位示例，真实标识和选择只能来自既有host policies与已确认需求。保留原所有policy绑定/别名/覆盖规则；示例不能替代模型提出的实际计划。

- [ ] system与planner user提示使用相同合法示例来源，避免继续出现未加引号的伪JSON形状。同步将planning-schema.test.ts旧伪JSON正则提取改为提取并JSON.parse合法示例，保留两种字段集合和真实host数据绑定断言。保持原严格解析与全部后续校验，不加readonlyPrompt或任何重试。
- [ ] 跑新测试获得GREEN，确认真实payload而非仅配置spy。

## Task 3：负例与原门禁

**Files:** 新测试及必要 `tests/roles/planning-schema.test.ts`、`planning-slots.test.ts`、`planning-identity.test.ts`、`planning-capacity.test.ts` 的代表。

- [ ] 验证其他author、reviewer、intake或直接默认Pi没有新增响应格式；planning在正常与validation策略路径均保持原权限与身份绑定。补原hook原地修改及异步返回替代payload的代表，按锁定SDK语义保留结果与其他字段，再加固定规划格式。
- [ ] 空文本、无效JSON、length结果仍失败，只有原请求数，无plan.json/partial任务，不调用纠正；合法中文及转义字段保持。
- [ ] policy/role不符、缺覆盖、重复/cycle、越预算等必要原代表保持拒绝。不要为了让示例通过放宽原schema或验收。
- [ ] 仅运行新增及受影响代表；其余已有证据复用。不得推断修复原引号后room4旧计划已获批准。

## Task 4：验证、提交和独立审查

**Files:** 上述源码/测试及本卡两份正式文档；忽略目录 `.cosmos/cos119-evidence/verification-index.json`。

- [ ] `npm run typecheck`、`npm run build`、按既有tsc命令检查变更测试strict；UTF-8、中文和行尾回读、git diff --check。
- [ ] 保存RED/GREEN/兼容原日志与复用说明；所有中途失败保留，不累加重叠测试。
- [ ] 提交独立分支，报告exact SHA/base/证据/限制，不push main。
- [ ] 专属reviewer先规格再代码质量；作者修复后复审受影响部分。唯一merger在批准后集成、做短集成检查、发布GitHub与PROGRESS。

整个实施不取得真实运行controller、不改账本、不进行付费验证；已有关闭运行不恢复。

## 实施记录

实现和免费定向验证已完成，待独立 reviewer 检查实际 diff；作者不合入或推送 main。源代码仅修改 Pi 固定格式接线、RoleFactory planning 选择、共享示例及 planner 提示。既有 planning-schema 和 planning-identity 的旧伪 JSON 正则已改为 JSON.parse 示例并继续校验字段及主机绑定。

验证命令与结果：

- node --experimental-strip-types --test tests/roles/planning-json-output.test.ts tests/roles/planning-schema.test.ts tests/roles/planning-identity.test.ts：45/45。
- node --experimental-strip-types --test tests/roles/planning-slots.test.ts tests/roles/planning-capacity.test.ts：6/6。
- npm run typecheck、npm run build：退出 0。
- node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --skipLibCheck --types node tests/roles/planning-json-output.test.ts tests/roles/planning-schema.test.ts tests/roles/planning-identity.test.ts：退出 0。

RED/GREEN 与中途 fixture 失败均保存在 .cosmos/cos119-evidence/，不累加重叠测试计数。未变更的旧全矩阵、运行恢复、工具执行与计费实现不重复运行；本次真实 SDK + fake fetch 代表验证实际受影响路径。所有真实已关闭运行保持关闭，真实模型效果尚未验证。
