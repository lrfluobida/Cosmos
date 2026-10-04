# 明确原生规划输出中的 policyId 契约

> **For agentic workers:** Use the dedicated implementer, independent reviewer and batch08 merger required by AGENTS.md. Execute the steps with TDD; only the merger integrates main.

**Goal:** 让原生 Cosmos planner 的 system 与 host prompt 一致说明实际校验器要求的字段，保留缺失或非法 policyId 的拒绝行为。

**Architecture:** 只修改两条已有规划提示。taskPolicies 模式明确六字段 JSON；roles 模式保留五字段 JSON。字段值仍是模型提案，权限、输出、依赖和预算由原 host 绑定，校验器保持不变。

**Tech Stack:** TypeScript、Node.js 22.22.2、原 pi RoleFactory、node:test、临时零费用 RunController fixture。

## 范围

- 修改 `src/roles/factory.ts` 的 planning system prompt。
- 修改 `src/roles/planner.ts` 的一次原 planning request prompt。
- 新增 `tests/roles/planning-schema.test.ts`，复用 contracts fixture；仅注入原 sessionFactory，不调用 API。
- 不改变 SDK/provider、校验器、账本、grant、重试、调度器、修复权限或迁移 consumer。
- COS43 实际 case1 的缺字段回复仍是已停止失败记录；本修复不重开该案例、不补旧回复、不新增调用。

## TDD 步骤

- [x] 写测试：通过真实 createRoleFactory/planTaskDag，读取实际 prompt 的字段 schema，编译三角色提案；检查 host 固定权限、输出、输入及持久计划。
- [x] 跑 RED：原 system 仅声明五字段，原 host request 没有完整 schema，测试应明确失败。
- [x] 补 system prompt：优先服从 host schema；有 policyId 的 policies 使用六字段且必填、唯一并匹配 role；原 roles 使用五字段。
- [x] 再跑 RED：确认 host request 缺完整 schema 仍被测试捕获。
- [x] 补 host prompt：依当前实际模式明确完整 JSON schema，并保留全部 host policies 与 task ID 约束。
- [x] 跑 GREEN：三角色、多个同 role slots、roles 默认兼容；缺失/未知/重复/错 role policyId 均拒绝，任务和费用未登记，session 正常关闭。
- [x] 复用已有 slot/默认角色检查，定向运行受影响 planning 测试；不跑 consumer、浏览器或计数/预算组大矩阵。
- [x] 显式 strict 检查两条生产文件与新测试的 import closure。
- [x] 检查 UTF-8/noBOM/LF、中文与 diff；专属 implementer 随后提交准确 SHA 交独立审查。

命令：

```powershell
node --experimental-strip-types --test tests/roles/planning-schema.test.ts
node --experimental-strip-types --test tests/roles/planning-slots.test.ts
node --experimental-strip-types --test --test-name-pattern="Cosmos plans host-scoped tasks|planning rejects missing or stale confirmed source" tests/roles/roles.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions tests/roles/planning-schema.test.ts
git diff --check
```

## 证据

- 原 source RED：3 正向失败，4 负向通过，0 skip，3536.418ms；system 只有五字段的实际差异被捕获。
- 仅修 system 后的 RED：3 正向仍失败，0 skip，2690.4331ms；actual host request 未声明 schema 被捕获。
- 最小修复后 GREEN：7/7，0 skip，2749.0394ms；缺失 policyId 的原脱敏回复仍被拒绝。
- 既有 slot 权限检查：5/5，0 skip，3025.4724ms；重复同 role、重复 slot、越权字段、错 role、超分配保持原行为。
- 既有默认 planning/source 检查：6/6，0 skip，3137.5418ms；原五字段模式、包装 JSON、覆盖不足和缺失/旧 source 保持原行为。
- 显式 strict import closure：exit0，7.039 秒；两条生产文件包含在新测试实际 import closure 中。
- 生产 diff 仅 factory 一条 system 提示、planner 一条 schema 声明和一条 request 提示；校验器及后续 task 编译不变。
- 四个目标文件 strict UTF-8/noBOM/LF 通过；两条生产文件的所有原非 ASCII 片段与基底逐项一致，新测试与计划中文读回正常；diffcheck 通过。

所有本任务证据均为离线提示/校验能力，不证明新迁移游戏已生成或用户体验通过。没有真实 SDK/API 调用、浏览器、费用、ledger/window 改写或旧案例重开。
