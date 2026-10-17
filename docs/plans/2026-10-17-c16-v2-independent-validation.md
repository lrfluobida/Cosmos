# C16 v2 独立补测计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. 专职 implementer 准备，独立 reviewer 审实际脚本，Root 单独批准一次执行；唯一 merger 集成文档。

**Goal:** 用现有免费 harness 检验封存 C16 v2 的玩法、真实进程重开与媒体，不改变原 C16 已消费、中断、未完成的历史。

**Architecture:** 完整候选逐字节复制到独立 TEMP，保留原需求、设计、八段220步与期望值。仅派生本次诊断身份、路径和 loopback origin，使用原 `transferPersistentSeries`、`runPersistentAcceptance`、`createMediaObservationRequest` 和 `assessMediaCoverage`；同一次执行收集62媒体字段。

**Tech Stack:** Node.js 22、现有 TypeScript/Playwright harness、Edge、候选自带的 Node 静态服务。

---

## 范围与状态

隶属 [COS102 / #103](https://github.com/lrfluobida/Cosmos/issues/103)，不新增 issue、验证案例、预算或修复机会。准备基线 `0113f6e73cad0cee3c3ddb7a871b8d17cd4206a9`；实际生成来源仍为 `2f84eb328e59f20d73ceccdc69ff708f7be200a5`。计划 `cc5a3e13649c27632156190d11240dad51422ade` 与下述精确脚本已独审；Root[单次批准](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6233519607)后执行完成，结果已独审并[公开发布](https://github.com/lrfluobida/Cosmos/issues/103#issuecomment-6233582959)，本次结果文档待发布。

作者分支 `codex/c16-v2-independent-validation`。本计划、`PROGRESS.md` 与 `docs/specs/cos102-transfer-case16.md` 是唯一 tracked 改动；脚本保存在作者 worktree 的 ignored `.cosmos/c16-v2-independent/diagnostic-v1.ts`，不提交原游戏、媒体或私有证据。独立 reviewer 为 `c16_v2_validation_reviewer`；作者不写 main、不 push。

## 固定输入

- 候选为原 `cos20-transfer-validation-16-game@v2`：100文件/1,868,135字节；53个登记输入与8个 capture 相同；37个 dist 文件与原 repair build 相同。原 build 已通过，无需再次编译或安装。
- 原 plan SHA256 为 `58251c80d931823dffdbf176bb116a58f0fcbe57baba43be0924affd499664b3`；八段21/26/26/32/23/29/26/37步，共46次正常点击及174项断言，保留1280×720和原每步超时。原 v2 start plan 与第一段相同，但没有 report；不能沿用 C14 脚本要求完整历史 aggregate 的断言或补造该报告。
- 复用原媒体 manifest `eeab6ab613fcc3d4886b25572a205ff598f0532387be821bf6474f156f5ab6d8`：7角色、15状态、6音频，共62字段。不会注入 COS105 新参考事实。
- 读取既有 interruption preservation 中选定的106个文件条目核对 hash/size/mtime；只保护本次用到的候选、capture、build、原 start plan 与当前 ledger 文件，不遍历全部9187个历史文件。ledger 作为不透明字节保全，必须仍为闭账 SHA256 `34a6ba11f4e96ad1c87a6a0cfb54ae6890e07036500af1a19660e9b45aeb4fef`。

## 准备、独审与执行

- [x] 作者固定一次性脚本：只接受 `--execute-once <approved-harness-sha> <reviewed-script-sha>`，核本 worktree 干净、精确 SHA、脚本 hash，并以独立 `consumed-v1.json` 的 `wx` 创建拒绝重复执行。此标记不在旧 case 内。
- [x] `node --experimental-strip-types --check .cosmos/c16-v2-independent/diagnostic-v1.ts` 与单文件 strict `tsc --noEmit` 均通过；核 UTF-8/LF/中文、`git diff --check`。这些准备检查不调用 runner、浏览器、模型或账务 API。
- [x] 提交三个文档，向 Root/reviewer 提交 exact commit、脚本 SHA、实际执行命令和检查证据。reviewer 审差异、固定输入、完整脚本及 cleanup；有 finding 由作者修复后复审。Root 批准前不执行。
- [x] Root 获批准后仅执行一次。TEMP 副本和证据用新身份；原 capture/plan 保存原字节。只修改派生计划的诊断 artifact/project/task/run/report IDs、TEMP location、URL/checkpoint origin，逐项断言所有步骤、期望和剩余字段相同。
- [x] 在本次固定 source 上用原 runner 执行八段及62媒体观察。原 per-step、navigation、launch、cleanup 默认值保持；没有 `ownedChild`、native validation window、controller、provider、旧 launcher 或原 game 写入。原 game 自带静态服务仅在 TEMP 中以 `port:0` 绑定 loopback。
- [x] 整体预算10分钟，自脚本开始计时；9分钟中止工作，预留最后1分钟清理与保存。保留原 runner 的阶段超时，不因补测延长；deadline/SIGINT/SIGTERM 传同一 AbortSignal。10分钟内仍未清理时，先写失败记录，再仅对仍存活的本诊断 Node PID 及其子树请求 `taskkill`；该请求不冒充退出证明，Root 后核进程/端口。
- [x] 保存每段原报告、截图、视频、checkpoint、媒体 request/coverage 与本次真实起止时间；检查 raw 报告一致、样本时间、退出身份、服务关闭及必要原文件/ledger 未变。失败保留实际已执行/未执行数量，不自动重试或修游戏。完整 video 解码/性能不在本次范围。
- [ ] reviewer 核实际结果后，Root 决定公开有限结论，唯一 merger 更新记录；COS102仍 open/incomplete，原220/62未完成与本次补测结果分别描述。

## 准备证据

脚本 SHA256：`22107737374e72e86f10d307f3c868b7abab3bebd20e330e7d18110269264256`，23,089字节；语法检查和单文件 strict 均退出0。缺执行参数调用退出1，准确拒绝于入口断言，未创建 consumed marker 或诊断输出。UTF-8/LF/中文和 diff check 通过；私有准备索引为作者 worktree `.cosmos/c16-v2-independent/preparation-verification.json`。这不表示脚本实际执行或验收通过。

## 一次执行结果

2026-10-17 UTC `11:48:36.173Z`～`11:49:23.775Z`，47,602毫秒，exit0；原八段220/220、媒体62/62匹配，checkpoint同profile/origin PID1980→33452。8browser非forced/exit0，服务关闭；Root和reviewer独立后核无进程/端口残留。原390保护文件+33harness/script及ledger保持，新增模型/费用0。独审`APPROVED_C16_V2_INDEPENDENT_VALIDATION_RESULT_SCOPED`、无finding；Root接受并解冻，证据与边界见[研究记录](../research/2026-10-17-c16-v2-independent-validation.md)。本计划已消费，不能再次执行。

## 能证明什么

通过只证明当前环境下该实际生成候选副本的220步、存档重开和62媒体字段，以及本次清理；失败则定位该候选真实缺口。没有原 C16 deadline 内完成证明、原 native/controller 全链路证明、独立模型截图 review、promotion、human 或完整经典游戏达标。原费用、revision3334、766请求/18166722µ、closure22、历史时钟与结果保持。
