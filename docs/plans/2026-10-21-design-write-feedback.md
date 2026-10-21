# 普通设计写入反馈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 普通design作者在成功write/edit后直接得到已有只读结构诊断，capture与独审仍决定是否通过。

**Architecture:** RoleFactory工具包装增加可选afterFileWrite回调，由runtime host仅对当前ordinary design作者配置。回调复用原createGameDesignCheck和guard，返回有界附加内容；不在provider层引入runtime校验器。

**Tech Stack:** TypeScript、Node 22、Pi ToolDefinition、既有design validator、node:test。

---

规范：[COS118 设计写入反馈](../specs/cos118-design-write-feedback.md)。合入文档目标为 `docs/specs/cos118-design-write-feedback.md` 与 `docs/plans/2026-10-21-design-write-feedback.md`。独立managed worktree与分支由Root提供。

## Task 1：复现作者不主动调用自检时无反馈

**Files:** 新增 `tests/runtime/ordinary-design-write-feedback.test.ts`；复用 `tests/runtime/ordinary-design.fixture.ts` 的TEMP运行及受控session。

- [ ] 阅读CONTEXT、cosmos-spec、本卡和 `src/roles/factory.ts`、`src/runtime/entrypoint-design-check.ts`、`src/runtime/entrypoint-host.ts` 当前设计接线。
- [ ] 模拟作者只调用write/edit，写出action非法acceptanceId和selector像素坐标计划，不调用validate-game-design；断言写入工具结果直接包含原validator诊断。先跑定向测试得到RED。
- [ ] 加缺reopen savedSnapshot断言代表及成功修正后的更新反馈；不要复制原小屋关卡或完整plan进入实现。

## Task 2：窄回调和同源校验

**Files:** `src/roles/factory.ts`、`src/runtime/entrypoint-host.ts`、`src/runtime/entrypoint-design-check.ts`；如具体错误定位需要，最小修改原未知字段验证函数所在文件。

- [ ] RoleFactory仅在已获准file tool成功返回且name为write/edit时调用可选afterFileWrite；回调输入提供原RoleInput、tool name/path和取消信号，不授予新的路径。
- [ ] runtime仅ordinary design author提供此回调，要求路径在gameDesignCheckFiles的实际声明集合中；复用createGameDesignCheck、原task/attempt/source/guard。legacy/preparation/validation/reviewer不配置。
- [ ] 保留原成功content后附加诊断；失败或throw不调用回调。输出不超过8条/4096字符，不附全文或diff。
- [ ] 缺文件/半份JSON反馈当前未完成并允许后续分块；schema错误不撤销已成功写入，不把其冒充工具写入失败。
- [ ] guard/abort失效沿原错误控制流处理，不能转成passed。若未知字段诊断不含字段名，补上具体字段名但保持原拒绝谓词。
- [ ] 保留显式自检和原capture/reviewer调用，不创建通过记录、额外provider请求、attempt或repair。

## Task 3：边界、集成及发布

**Files:** 新测试；必要 `tests/runtime/entrypoint-design-check.test.ts`、`tests/runtime/ordinary-design-feedback.test.ts`、`tests/roles/roles.test.ts` 代表；两份本卡文档及常规issue/PROGRESS映射。

- [ ] GREEN：写入缺文件、半JSON→继续写完整；失败edit/read/其他角色/模式不触发；越权/非UTF-8/link由原文件工具拒绝；取消与前后guard、长度限制、中文文本。
- [ ] 受控host验证错误产物仍被capture拒绝，反馈后文件改变不能复用通过结论，合法产物仍沿原独审路径；不做真实provider/browser测试。
- [ ] 运行 `node --experimental-strip-types --test tests/runtime/ordinary-design-write-feedback.test.ts`、必要兼容代表、`npm run typecheck`、`npm run build` 和改动测试strict；复用其余有效证据。
- [ ] UTF-8/中文回读与git diff --check；提交exact SHA并报告证据索引，不push main。
- [ ] 专属reviewer先规格后质量，作者修复后再审；唯一merger集成同批两卡、执行必要组合检查、更新GitHub和PROGRESS。

结构反馈不保证任意游戏语义正确，也不证明本次小屋生成成功。所有已关闭真实运行保持原样。

## 作者实现与证据（2026-10-21）

本卡基于 `74b96c12e4d5f3e8a21d3eb6ac9391932967e87d`，分支 `codex/design-write-feedback`。上述清单保留批准计划；Task 1、Task 2 与 Task 3 的作者实现和免费验证已完成，独立审查及合并由 Root 后续执行。按本批分工，`PROGRESS.md`、`cosmos-issues.md`、`github-issues.json` 由唯一 merger 更新。

- `RoleFactoryOptions.afterFileWrite` 只接收成功 scoped write/edit 的原角色输入、文件路径和合并取消信号；原成功正文与 details 保留。runtime 仅在 ordinary 运行中为当前 design 作者的已声明文件执行检查。
- 自动反馈和显式 `validate-game-design` 共用同一 `check`，继续核对原来源、task/attempt、前后 guard 与 deadline。自动文本最多 8 条、4096 字符；未知字段诊断补充字段名，拒绝条件保持。
- 首次 host RED 为 0/5，全部命中缺少自动反馈。后续真实 file tool 与受控 host 的 14 个新增用例均已有通过结果，覆盖修正、分块、长度、文件 scope/UTF-8/link、取消/guard、非设计角色与 legacy、原选择的 modular/classic 文件，以及 capture/独审拒绝；同一用例的多次结果不叠加计数。
- 兼容设计检查 20/20；角色取消/工具边界 3 个代表；原 acceptance plan 3/3。typecheck、build 与两个改动测试实际 import 闭包的 strict 检查均 exit 0。
- 证据索引 `.cosmos/cos118-evidence/verification-index.json` 记录具体命令与原始输出。保留初始 RED、旧 edit 参数与 TEMP allocation 测试设置错误、首次 `args: unknown` 类型错误及各自修正后的结果；后加或修改测试仅运行受影响代表，复用其余通过证据。

全部验证使用临时目录及受控 session/build/browser；真实模型调用、真实浏览器与真实费用均为零。原已关闭运行和账本未访问或修改。本卡提供结构诊断，不宣称目标游戏生成成功或语义与体验全部正确。
