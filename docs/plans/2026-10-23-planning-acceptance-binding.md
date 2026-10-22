# COS123 实施计划

[COS123 / #124](https://github.com/lrfluobida/Cosmos/issues/124)；设计与计划由 `planning_assignment_plan_reviewer` 独立批准。

> 使用 subagent-driven-development：独立 implementer、独立 reviewer，唯一 merger `public_agent_batch_merger`。

目标：让 host 已固定的任务验收归属成为结构化可信输入，避免合法 proposal 在普通 browser host 处因设计/编码归属混淆而终止。

## 文件范围

- 生产优先限于 `src/roles/planner.ts` 与 `src/runtime/entrypoint-host.ts`；如需复用既有 helper 或抽取测试 seam，先报告必要性，勿顺带重构。
- 测试复用现有 planner/普通 host/funded/modular 夹具，按实际命名新增聚焦用例。禁止凭空猜测路径。
- 正式文档 `docs/specs/cos123-planning-acceptance-binding.md` 与 `docs/plans/2026-10-23-planning-acceptance-binding.md`。
- 三份全局 tracking 只由 merger 修改；运行与账本只读。

## 执行顺序

1. 在现有 clean managed worktree 从批准基线建 `codex/` 独立分支；保留 ignored 证据。编辑前核 UTF-8/行尾并说明文件。
2. 用普通可信 host 夹具先复现 room7 类型的有效 proposal：design 同时含设计项与玩法，原 planner 接受后原 host 拒绝；保存有效 RED、命令、退出码。用通用测试 ID，不写游戏专属生产实现。
3. 增加可选 policy 配置及前置合法性校验、模型输入字段、原 proposal 检查、可信绑定、绑定后覆盖检查和精简来源记录。legacy 无字段路径保持；补重复 ID 不能被覆盖隐藏的反例。
4. 在 ordinary 产品 host 对实际三槽/五槽配置原有精确归属；明确排除其它入口。验证原 host 接受所生成任务，同时刻意错误依赖仍拒绝。
5. 运行最小重点矩阵：ordinary/funded/modular 正例，未启用/legacy/preparation/fixed validation 兼容，错误可信配置/错误 proposal/绑定后丢覆盖负例；保持原收费和生命周期。不得对已关闭 room7 等调用 controller 或 paid 模型。
6. typecheck/build/变更测试 strict、UTF-8中文回读与 diff check；保留 RED 与所有失败及修正证据，不相加重叠用例。
7. 提交精确 SHA、证据索引、已知边界，交独立 reviewer 先规格后质量审；原作者修 actionable findings 并定向复审。唯一 merger 核批准 SHA，短集成后登记关闭源码任务并发布进度。

设计/计划已获独立审查批准；实现须通过独立源码审查后，由唯一 merger 集成。room7失败、原确认与结算保持，后续实际验证需独立入口与当前实际草稿确认。

## 实施与验证记录

- 生产仅修改 `src/roles/planner.ts` 与 `src/runtime/entrypoint-host.ts`。普通入口在模块槽插入后按精确 policyId 配置归属；原 host.validateTasks 保持原文。
- 真实普通三槽 SOURCE/TEMP RED：有效 proposal 将设计项与玩法都分给 design，原 planner 保存 `validated_proposal` 后 host 拒绝，没有 `execution.json`。新增 planner 矩阵 RED 为 26 项中 12 项因缺少绑定能力失败，其余 14 项原守卫/兼容行为通过。
- 核心 GREEN 为 29/29：26 项 planner 配置、绑定、快照与负例，加普通三槽、真实 ordinary modular 五槽、错误 host 依赖。三槽和五槽使用受控作者、构建与浏览器结果，完成现有独立审查路径。
- 后续两项 host 检查 2/2：普通 funded 入口保持原额度、时钟和 Pi 配置；增强错误依赖用例，确认 planner 已写带 binding 的计划，host 仍拒绝派发。错误依赖项与核心 GREEN 重叠，不相加。
- 兼容回归 54/54：原 planning slots/schema/identity/capacity/JSON 输出，以及实际 legacy/preparation host。后续定向检查 3/3 覆盖增强的未配置槽位断言、旧手动停止和缺 planning 结果的恢复拒绝；其中槽位项与核心矩阵重叠。
- `npm run typecheck`、`npm run build` 和四个变更测试/夹具的 strict 编译均 exit 0；strict 的空 stdout/stderr 也保存。UTF-8、中文片段、LF 行尾与 `git diff --check` 单独核验。
- 作者证据索引位于 managed worktree 的 `.cosmos/cos123/verification-index.json`，每次执行保留 command/exit/stdout/stderr，失败记录不覆盖。后续审核复用未变化范围的证据。

全部验证为免费 SOURCE/TEMP。没有读取凭据、调用真实 provider/browser 或操作实际 run/controller/ledger；没有恢复或再次结算 room7。源码通过不保证下一次真实模型完成设计或游戏验收。
