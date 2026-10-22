# COS121 设计映射提示与反馈实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 独立 implementer、独立 reviewer；唯一 merger 合入 main。

任务：[COS121 / #122](https://github.com/lrfluobida/Cosmos/issues/122)，id5974242973；规格见 [设计映射提示与反馈](../specs/cos121-design-mapping-guidance.md)。设计与计划由 design_mapping_plan_reviewer 独立批准，源码基线 `ffd7ad735c0b51003feb8c78e5b82e757f009ac1`。

**Goal:** 作者收到以实际 ID 为键的合法映射示例，并在犯错时获得同源、具体、有界的字段诊断。

**Architecture:** 仅修改现有 host 的角色提示构造与 validateDesign 内的 mapping 判定；原显式自检和 write/edit 反馈自然复用。不新增执行权限或框架。

**Tech Stack:** TypeScript、Node 22、node:test；原生产 host 与 TEMP/fake SDK fixtures。

## 文件

- 生产：`src/runtime/entrypoint-host.ts`、`src/runtime/entrypoint-media.ts`。
- 优先复用相关测试：`tests/runtime/ordinary-author-thinking.test.ts`、`entrypoint-design-check.test.ts`、`ordinary-acceptance-plan.test.ts`、`ordinary-design-write-feedback.test.ts`；按实际覆盖选择最少必要文件。
- 正式文档：`docs/specs/cos121-design-mapping-guidance.md`、`docs/plans/2026-10-22-design-mapping-guidance.md`。
- 三份全局 tracking 仅 merger 修改；原真实运行、账本、游戏输出全部只读。

## 步骤

- [x] 在附加的 clean managed worktree 从约定主线建立独立 `codex/` 分支；检测 UTF-8/行尾并先说明改动文件。
- [x] 先写 RED：原真实错误形状不能获得字段/missing/unknown/value 诊断；host 现有伪类型不能被作为合法动态 JSON 示例解析。记录真正功能断言，不把 fixture 故障算 RED。
- [x] 最小修改 host 提示，JSON.stringify 动态生成完整 mapping 示例并说明作者必须替换例值；保留原输入、路径、角色和上限。
- [x] 在 validateDesign 附近增加小型 mapping 校验/诊断函数，复用原 text 谓词和精确集合要求，诊断有界；其他 schema 判定保持。
- [x] 定向 GREEN：两套动态 ID、普通/空体验/legacy，真实错误形状与合法中文值，具体错误经两条原反馈通路可见，原读写 scope 和长度上限保持。
- [x] 运行必要兼容代表、`npm run typecheck`、`npm run build`、变更测试严格 tsc；明确保存命令、退出码和空 stdout，保留原失败日志。
- [x] 重新打开变更文件验证 UTF-8/中文、`git diff --check`；发布正式规格与计划，提交精确 SHA/测试索引/已知缺口，不 push main。
- [ ] 独立 reviewer 审实际 diff 和原证据；问题由原作者修复并定向复审。唯一 merger 合并批准 SHA、短集成、更新 PROGRESS/issue 状态后推送。

真实模型效果属于后续独立验证，不能用测试样例、内存修正的旧设计或更改过的历史产物宣称成功。本卡不授权重开 room5。

## 作者验证记录

分支 `codex/design-mapping-guidance`，工作树 `E:/CodexData/.codex/worktrees/cos-05-cli/Cosmos`。仅两个生产文件、三份相关测试及本卡两份文档。后续主线三份 tracking 更新不影响此基线源码，无需重复验证未变结果。

- 原始命令、退出码、stdout/stderr（包括空文件）在 `.cosmos/cos121-evidence/verification-index.json`，每次执行独立保留 `.json`、`.stdout.log`、`.stderr.log`。
- `red` 保留首次工作树模板依赖缺失的环境错误；该结果不能充当 host/反馈的功能 RED。以既有 `COSMOS_TEMPLATE_ROOT=E:/develop/Cosmos/templates/2d` 复用已安装模板后，`red-template` 的 8 项功能断言按预期失败，1 项原有严格门禁代表通过。
- `green` 新增 9/9 通过，0 skip。`compatibility` 实际执行 44/44、0 skip，其中含上述 9 项，不累计重复计数；覆盖原 16 次请求帽、费用/时钟绑定、只读自检、普通 write/edit、Windows 路径、媒体、模块、classic、计划和独立评审门禁。
- `typecheck`、`build` 与三个变更测试的 `strict` 均退出 0；`strict` 的 stdout/stderr 均为空，已显式保存。
- `text-check` 核实 7 个文件均为 UTF-8、无 BOM、LF，原有中文行全部保留；`diff-check` 退出 0。提交前再次检查最终文档与 staged diff。
- 全部验证使用 SOURCE/TEMP、fake SDK/传输及模拟浏览器输出，没有实际 provider/browser 请求或真实 run/ledger 写入。通过仅证明源码契约与反馈行为，不证明模型遵循提示、设计语义或目标游戏成功。
