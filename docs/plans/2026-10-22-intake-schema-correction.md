# COS120 普通草稿格式纠正实施计划

任务：[COS120 / #121](https://github.com/lrfluobida/Cosmos/issues/121)。设计与计划已由独立 reviewer 批准；实施后仍须独立规格与质量审查。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 独立 implementer、独立 reviewer；仅指定 merger 合入 main。

**Goal:** 普通需求草稿可在原额度内消费唯一后继槽，以一次诊断反馈纠正结构错误，并仍等待实际当前版确认。

**Architecture:** 提取普通 proposal 的纯校验，新增窄 schema 后继资格 helper，复用原 interview 请求与计费路径。IntakeController 用原事件历史持久化 ordinary 后继槽消费；旧成功缓存保持兼容，失败不能重放。

**Tech Stack:** TypeScript、Node 22、现有 Pi 0.99.2、node:test；真实 SDK 接 fake fetch、TEMP controller，不使用实际模型或运行账本。

## 文件与责任

- 修改 `src/roles/interview.ts`：纯校验接线、cached-invalid/fresh-invalid 的一次纠正、后继消费与共享 dispatch；避免复制整个请求实现。
- 可新增 `src/roles/interview-schema-recovery.ts`：原 normal-stop/billing/native/reply/问答资格、精确来源重核、固定纠正反馈。
- 可新增 `src/roles/interview-draft.ts`：纯 ordinary proposal 组装与类型化结构诊断。仅在有助于保持 interview 清晰时拆出，不新建通用 schema 框架。
- 修改 `src/runtime/intake.ts`、`src/runtime/run-types.ts` 与实际快照 validator 所在文件：窄 claim 事件/串行消费、同槽防重、activation 兼容。先定位实际校验处，勿猜测新接口。
- 按必要最小范围调整 `src/roles/interview-recovery.ts` / `interview-denial.ts` 接入 shared claim；保留原资格与历史缓存。
- 新建 `tests/roles/interview-schema-recovery.test.ts`，必要 fixture 及 runtime/CLI 相关测试；复用已有 interview/ordinary fixture。
- 发布 `docs/specs/cos120-intake-schema-correction.md` 与本计划到 `docs/plans/2026-10-22-intake-schema-correction.md`。三份全局 tracking 仅 merger 修改。

## 实施顺序

### 1. 确定原失败与纯校验边界

- [ ] 检查目标编码/行尾；说明将改文件。只在独立 managed worktree/`codex/` 分支操作。
- [ ] 写失败回归：real SDK fake fetch 返回普通合法 JSON，但 experience 多 evidenceKinds；原路径缓存后拒绝且不能自行生成合法 draft。
- [ ] 记录 RED 真实断言，不把 fixture 设置错误当 feature RED。
- [ ] 提取/复用同一纯校验，明确结构诊断与 IO/预算/身份异常的区别；保留全部原严格规则。

### 2. 实现一次槽的持久消费

- [ ] 写 TEMP claim 测试：funded/无 funding、重复/并发、claim 后 intent/session/准入失败、删除目录均不得再派发。
- [ ] 最小新增窄事件和串行 claim 方法；原 request/grant/费用不变。
- [ ] 把所有新 ordinary successor 接同一 claim；旧缓存无事件保持可读。补 activation/generation 校验和结束收口代表。

### 3. 接通已结算 schema 后继

- [ ] 先写 normal-stop 来源与漂移负例：真实 native 文本→proposal、request/billing/usage、原 input/system/config、独立模式、未决/后来历史拒绝。
- [ ] 实现最小来源 helper 与发布前重核；模型只见原要求、拒绝 proposal、固定字段说明和有界诊断。
- [ ] 接 fresh/cached-invalid 路径，原 session 完成后建新无工具 maxRequests1 session；继承原预算/输出准入。
- [ ] 回归 GREEN：一次修正可保存 draft；再次非法/length/unknown/准入失败不连锁。缓存合法读取不产生新请求且核原来源。

### 4. 产品边界与回归

- [ ] 最短真实 public CLI TEMP 测试：先非法后合法，仍停在当前 revision 确认；无真实 confirm 就没有 generation。
- [ ] 检查合法 unsupported 不纠正，原 questions/legacy/preparation 与 length/denial 成功缓存兼容。
- [ ] `node --experimental-strip-types --test tests/roles/interview-schema-recovery.test.ts` 及实际受影响定向矩阵。
- [ ] `npm run typecheck`、`npm run build`，对变更测试执行严格 tsc。显式保存命令/退出码，即使 stdout 为空。
- [ ] UTF-8/中文回读、diff check、工作树边界；不要把未跑的真实模型效果写为通过。

### 5. 独审与集成

- [ ] implementer 提交精确 SHA、测试命令/原日志/已知缺口，不 push main。
- [ ] reviewer 实际 diff 先规格后质量，发现问题由原 implementer 修复，再审受影响 delta。
- [ ] 唯一 merger 核 approved SHA，合并、短集成、更新进度/任务映射并发布 GitHub 状态。
- [ ] 后续 room5 仅由 Root/operator 沿原 CLI、原账本和新资格进行实际恢复；本实现任务不接触真实数据。失败则保留实际诊断并走原收口，不造确认或回填原回复。
