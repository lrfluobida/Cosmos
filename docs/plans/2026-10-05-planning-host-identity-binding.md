# 主机绑定规划局部别名

> **For agentic workers:** Use the dedicated implementer, independent reviewer and batch08 merger required by AGENTS.md. Execute the steps with TDD; only the merger integrates main.

**Goal:** 在显式启用的严格验证规划中，将已验证的局部提案别名绑定到当前窗口的预声明角色任务身份。

**Architecture:** 新增 host-only `proposalIdentity: 'validation-policy-aliases/1'` 选项；只允许当前 operator validation、三个固定 design/art/coding taskPolicies。模型仍提交原六字段，taskId/dependsOn 使用局部别名。原字段、policy、role、验收和依赖校验通过后，由所选 host policy 的角色绑定当前 grant，随后继续原身份、依赖、预算和 contract 校验。新模式计划保存主机生成的 identityBinding，默认模式提示、身份和计划结构保持。

**Tech Stack:** TypeScript、Node.js 22.22.2、原 RoleFactory、node:test、复用临时零费用 transfer fixture。

## 文件与边界

- 修改 `src/roles/planner.ts`：显式准入、局部别名提示、严格提案校验后的确定性绑定及计划记录。
- 新增 `tests/roles/planning-identity.test.ts`：脱敏 C3 proposal 与主机身份、权限、依赖、拒绝边界的离线测试。
- 本计划记录实际 RED/GREEN、strict、编码与提交证据。
- 不修改 factory/SDK/provider/budget/ledger/角色工具/grant/retry/默认协议或现有 C1/C2/C3 caller，不新增真实调用或付费实验。
- 所有测试使用临时合成 fixture；不读取真实 `.cosmos`、session、凭据或参考游戏。

## 步骤

- [x] 写脱敏 proposal 的默认严格拒绝与新 opt-in 正向测试；先观察缺失功能导致 RED。
- [x] 写非法模式在 session 前拒绝、局部别名和 policy/role/AC/依赖/越权字段严格拒绝的边界测试。
- [x] 最小实现：只由已验证 host policy role 取得当前 grant，重写别名及依赖；保留全部原编译校验。
- [x] 保存主机 identityBinding；检查原权限/上下文/输入/输出、snapshot 字节、grant/fee/history/clock 不变。
- [x] 验证最终当前 scope/signal 改变时不发布 plan。
- [x] 跑新测试及受影响默认 planning 代表检查；复用其他通过证据。
- [x] 显式 strict 检查真实 import closure；检查 UTF-8/noBOM/LF、中文读回、diff；随后提交准确 SHA 交独立审查。

## 证据

- RED：默认严格模式拒绝脱敏局部别名，新 opt-in 同样在原 fixed task ID 检查处失败，1 pass/1 fail/0 skip，3352.1286ms。
- GREEN：新文件 25/25、0 skip，4234.4618ms。包括明确 opt-in 的主机绑定、重排 policy 与跨案例/其他 role 外观别名、默认 exact-ID 提示/计划结构、十二种提案拒绝、七种 host 准入拒绝、实际 operator 字节改变与 caller cancellation。
- 主机生成的 `identityBinding` 按原 drafts 顺序保存 `{protocol,policy,localAlias,actualTaskId}`，协议字面量固定在源码。仅新模式保存此字段，任务和 expectedOutputs 使用绑定身份。
- 最终协议字面量与条件括号小改后，正向绑定及重排/跨案例别名两项 2/2、0 skip，2683.0119ms；其余行为没有变化，复用前述证据。
- 既有五字段 roles 与多个同角色 policy slots：2/2、0 skip，3014.5904ms。既有默认规划、包装 JSON、覆盖不足与缺失/旧 source：6/6、0 skip，3044.7237ms。
- 显式 strict：新测试真实 import closure，包含 planner 与所复用合成 fixture，exit0，6.928 秒。
- 原 planner strict UTF-8/noBOM/LF 已在编辑前确认。三个文件最终 UTF-8/noBOM/LF、中文读回及 diffcheck 通过，原非 ASCII 内容保持。

命令：

```powershell
node --experimental-strip-types --test tests/roles/planning-identity.test.ts
node --experimental-strip-types --test --test-name-pattern='opt-in binds|foreign and other-role-looking' tests/roles/planning-identity.test.ts
node --experimental-strip-types --test --test-name-pattern='planning communicates its exact schema and binds a native mock proposal: roles|planning communicates its exact schema and binds a native mock proposal: repeated-role' tests/roles/planning-schema.test.ts
node --experimental-strip-types --test --test-name-pattern='Cosmos plans host-scoped tasks|planning rejects missing or stale confirmed source' tests/roles/roles.test.ts
node node_modules/typescript/bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --allowImportingTsExtensions tests/roles/planning-identity.test.ts
git diff --check
```

所有本任务证据均为离线身份绑定和校验能力；零实际 SDK/API 调用、浏览器、费用及真实 ledger/window 改写。旧案例不重开，未来 case4 caller 尚未接入；源码通过不代表迁移游戏已生成或最终用户体验通过。
