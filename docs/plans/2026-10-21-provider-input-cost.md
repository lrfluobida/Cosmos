# Pi 请求报价投影 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 不把provider不接收的toolResult.details计入费用预留，保留原派发与身份约束。

**Architecture:** 新增一个只读输入字节投影helper，供Pi live与compaction报价共用。完整上下文序列化仍用于身份比较；传输和native记录不改变。

**Tech Stack:** TypeScript、Node 22、锁定Pi SDK、node:test、fake fetch。

---

规范：[COS117 规范](../specs/cos117-provider-input-cost.md)。合入文档目标为 `docs/specs/cos117-provider-input-cost.md` 与 `docs/plans/2026-10-21-provider-input-cost.md`。根目录由Root分配独立managed worktree、codex分支和精确base。

## Task 1：复现报价与真实传输差异

**Files:** `tests/providers/pi.test.ts`；可新增 `tests/providers/request-input.test.ts`。

- [x] 阅读CONTEXT、cosmos-spec、本卡和 `src/providers/pi.ts` 及锁定SDK的toolResult转换，仅核相关代码。
- [x] 用真实createPiSession、受控工具结果和fake fetch写RED：同一个content，details从短值变巨大，provider第二次请求body相同但当前inputBytes不同。断言native保留原details。
- [x] 加真实content增大对照，确保provider body和报价都增长、原budget.beforeRequest拒绝时没有额外fetch。不要把完整真实room3文件复制进仓库fixture。
- [x] 运行 `node --experimental-strip-types --test tests/providers/pi.test.ts` 的新test-name-pattern，保存原RED输出。

## Task 2：最小共享报价helper与接线

**Files:** 新增 `src/providers/request-input.ts`；修改 `src/providers/pi.ts`；新增 `tests/providers/request-input.test.ts`。

- [x] 以SDK Context类型实现只读helper，关键投影仅为：

```ts
const messages = context.messages.map(message => {
  if (message.role !== 'toolResult') return message;
  const { details: _details, ...sentAndConservativeFields } = message;
  return sentAndConservativeFields;
});
return Buffer.byteLength(JSON.stringify({ ...context, messages }));
```

该代码示意使用实际SDK类型作最小调整；不能改动传入context对象。不能剔除content中的文本或其他字段。

- [x] live request保持原inputJson用于requireUnchangedInput，只将inputBytes切换到helper。
- [x] compaction projection保留完整serialized/lastProjection比较，仅费用字节改为同一个helper；hasImages与真实context不变。
- [x] 新增无details、其他role、嵌套同名content、工具定义/参数、中文和图片代表。跑RED对应GREEN，核完整输入漂移（含details变化）仍拒绝。

## Task 3：必要兼容、文档和独立审查

**Files:** `tests/providers/pi.test.ts`、`tests/roles/compaction.test.ts` 必要定向代表；上述两份文档。Root明确分配：`docs/specs/cosmos-issues.md`、`docs/specs/github-issues.json`、`PROGRESS.md`由本批唯一merger统一更新，implementer不修改。必要夹具为 `tests/providers/coding-compaction.fixture.mjs` 与 `tests/providers/request-output-limit.fixture.mjs`。

- [x] 运行新增测试与受影响compaction/role/intake代表，保留精确命令、exit和未重复计数的结果；避免全库重跑。
- [x] `npm run typecheck`、`npm run build`；对改动测试按既有tsc strict命令检查。
- [x] UTF-8检测、中文回读、git diff --check；原真实运行/账务文件保持只读。
- [x] 提交源码及文档，报告exact SHA、证据索引、限制；不push main。
- [ ] 专属reviewer先规格后质量。修复可操作发现后再审；唯一merger在两卡都批准后集成、必要组合检查和公开发布。

不把此源码通过表述为实际生成成功；不增加输出上限或重试机会。

## 实施记录（2026-10-21）

本卡为 [COS117 / #118](https://github.com/lrfluobida/Cosmos/issues/118)，id5962948336，父COS18 / #19；设计和计划已经独立批准。实现基线 `74b96c12e4d5f3e8a21d3eb6ac9391932967e87d`，分支 `codex/pi-request-cost`，待专属独立reviewer审查及唯一merger集成。

`requestInputBytes` 只在报价副本中移除 toolResult 顶层 details，live request 和 compaction candidate 共用。`inputJson`、`serialized`、`lastProjection` 的完整身份比较，以及实际context、SDK传输、native记录、图片规则和原准入均保持。Node v22.22.2；已安装pi-ai/pi-coding-agent与锁文件均为0.99.2，无安装或依赖变更。

免费回归先RED：live和compaction各一项在相同provider body、不同native details下报价1920→301908字节，2失败；真实content增长对照通过。最小接线后新增9/9通过：两条投影、真实content增长与原预算beforeRequest拒绝、无details字节不变、只去掉顶层字段、中文/图片/schema/arguments保留，以及policy/admission/final-window三处metadata漂移拒绝。

兼容定向首轮12项中9通过、3失败。旧coding-compaction夹具将每个空details:{}也计入固定字节目标，导致131072目标的报价成131033，原压力不足且history漂移用例未进入预定摘要分支。经Root确认，只去掉夹具构造/返回中的两处无用空details，保持原padding、阈值、预算和行为断言；受影响3/3通过。history用例实际在summary length结算后追加native custom entry，再由原完整身份/leaf检查拒绝为compaction_failed。其余9项通过证据复用。

测试strict首轮发现新增夹具的NestedToolCallRecord字段不符SDK及既有mjs dispatch默认参数推断过窄；已用SDK status字段并补Context JSDoc类型，最终strict退出0；新增helper最终6/6复验与此前9/9重叠，不累计。typecheck/build均退出0。精确命令、原失败输出和其余最终检查见作者工作树 `.cosmos/cos117-evidence/verification-index.json`；源码范围始终只有helper及两个报价调用点。

本次只运行免费SOURCE/TEMP测试，不读取或打开真实controller，不派发真实模型或重结算；原room1/2/3与memory均永久关闭。源码通过只证明费用输入投影修复，不能证明实际模型、游戏生成或交付成功。
