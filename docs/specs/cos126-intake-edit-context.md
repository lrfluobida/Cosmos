# COS-126 · 普通需求编辑携带上一版草稿

状态：已独立APPROVED_PLAN并获Root批准发布与免费实施；源码尚未独审和集成。设计作者 `/root/intake_edit_context_assessment`；基线 `8485321c35bacf06c285596eb808d588027f1774`。独立实现者cos126_implementer，源码reviewer由Root另行指派，唯一merger public_agent_batch_merger；仅SOURCE/TEMP范围。

审批记录：[COS126 / #127](https://github.com/lrfluobida/Cosmos/issues/127)；独立 `intake_edit_plan_reviewer` 给出 `APPROVED_PLAN`、无finding，Root批准以下固定输入的正式发布与免费源码实施。源码独审和集成待完成。

- 批准规格输入 SHA256：`338cf6350db090ba1e24a14b14e70c799908ec2cb93d20669248f9b2a9f29be8`
- 批准计划输入 SHA256：`457e4419dbf02c174297bc48393f5e1df4deef2d9226849be70dce7b125c610e`

配套[实施计划](../plans/2026-10-26-intake-edit-context.md)。

## 问题与证据

- `src/cli/session.ts:235-267` 的 `edit` 清空本次循环的 `current`，下一轮以 snapshot 当前 draft revision + 1 保存完整新回答，再调用 `host.draft`。此处没有向新回答注入旧生成内容。
- `src/runtime/entrypoint-host.ts:1594-1601` 经真实 `requestDesignDraft` 调用 Pi。`src/roles/interview.ts:64-67,155` 的 intent、context 与 user input 都只有当前 phase/brief/questions/answers，没有上一版 acceptance 或 experienceCriteria。用户回答中的“保留上一版”因而缺少对应参照。
- room10 的 `draft-1/2/3/intent.json` 实际 input 字段均只有上述四项。改动一处后别处回退的具体模型行为有多种可能原因；本卡确认并修复的是上一版生成内容缺失，不能承诺消除所有语义回退。
- `requireOrdinaryDraftSource` 已核普通 profile、原 brief 与同 revision 的完整 answers；`validateIntakeSnapshot` 固定当前 draft source/revision 并验证 draft；`IntakeController.requireDraftFile` 已使用“文件内容等于 snapshot draft payload”的模式。新读取复用这些规则与 `regularFile` 的目录、独立常规文件、链接及 UTF-8 边界。

依赖已集成的 COS111/112 普通需求契约、COS115 edit、COS116 原预算内输出与 denial、COS120 单次 schema correction。稳定任务映射从 `docs/specs/github-issues.json` 读取；[COS126 / #127](https://github.com/lrfluobida/Cosmos/issues/127) 已登记，源码保持pending。产品目标仍是可复用的游戏开发 agent。

## 目标与取舍

普通 `ordinary-design/1` 的新编辑轮次获得可信上一版生成条目，按当前真实回答修订并输出完整新 proposal。未被当前回答要求改变且仍符合当前要求的旧条目应保留，包括 ID、步骤、期望与体验项。当前回答优先；旧候选不能扩大需求、确认需求、授予工具或运行权限。

选择主机提供独立编辑上下文。仅改提示无法补回缺失数据；把整份旧草稿拼入 answers 会污染原始用户来源并重复扩大下游输入；JSON patch 或主机合并输出会改变产物语义与协议。后两种方案均不采用。

## 适用范围和数据形状

1. 仅在无原始 intent 的 ordinary `draft-N`，N >= 2，且原 intake 未停止、未确认、未激活，当前已保存草稿恰为 N-1 时首次建立上下文。N 来自可信现有 roundId；不是模型给出的文件名。首次 draft、questions、legacy 与 preparation 保持原请求形状。
2. 读取固定 `requirements/v{N-1}/draft.json`，不能接受调用方或模型任意 path。严格 UTF-8 解码；验证完整普通 draft、原 profile/origin/answers，以及完整 payload 等于当前 snapshot draft 去掉 revision/source。brief/questions 须与当前输入相同；answers 可按本轮真实输入改变。
3. 只把以下模型可生成字段投影给模型：`gameplayAcceptance(previous)`、experienceCriteria、unsupported，以及存在的 benchmark/codeProfile。不投影旧 brief/questions/answers、source/revision、classicEntry、host/module 固定阶段或确认/运行身份。host 固定阶段继续由原函数生成。
4. 身份元数据复用当前 `ordinaryDraftSha256(bytes)` 绑定核验过的完整旧稿字节，不发明新摘要算法或通用版本服务。旧 answers 不需要进入模型 context，也不需要进入新答案记录。

建议的窄内部形状如下；名称可在实现中等义调整，语义不可扩展：

```ts
type EditableProposal = Pick<OrdinaryGameDraft,
  'acceptance' | 'experienceCriteria' | 'unsupported' | 'benchmark' | 'codeProfile'>;
interface OrdinaryEditContext {
  formatVersion: 'ordinary-draft-edit/1';
  previousRevision: number;
  previousDraftSha256: string;
  proposal: EditableProposal;
  instruction: string; // 主机固定文本，不读取模型提供的指令
}
```

固定 instruction 的含义：previous proposal 是未确认的模型候选；以完整当前 brief/questions/answers 为准；只作当前回答要求的修订，保留仍适用的未改项；冲突以当前回答为准；返回原协议允许的完整 proposal，不返回 patch、上下文、身份或主机字段。既有 unsupported 只有仍符合当前需求和能力时保留，不能因旧候选误判而阻止用户修正。

## 请求身份、缓存和后继兼容

5. 保持现有 `ordinaryPrompt` 的字节。独立 `editContext` 加在新 intent 和 JSON context 的顶层，`input` 与 `session.prompt(JSON.stringify(input))` 保持原问答结构。schema correction 仍仅在原 user input 上加既有 schemaCorrection。模型总是得到完整当前问答与独立编辑参照。
6. 新带上下文的原始 intent 使用明确的 `formatVersion: 2`；版本 2 必须具备完整合法 editContext。其余请求和已经存在的旧 intent 仍为版本 1，不补字段、不改 native、不改变旧 prompt/context。读取 recorded intent 应先于选择上下文版本，再按该版本重构预期 intent 并做原有 `sameValue` 比较。未知版本、版本 2 缺字段、额外字段或来源不一致都拒绝。
7. 旧版本 1 只走原有精确身份、缓存和 length/denial/schema 流程。即使它对应 draft-2，也不能现场升级为新版请求。没有原 intent、但已有残留目录、successor 或持久 claim 时，原缺来源拒绝仍优先，不能因新功能获得一次新请求。
8. 版本 2 缓存复用必须重读固定 N-1 文件、profile/origin/旧 answers，核完整 schema、原摘要与投影相等。当前 snapshot 已保存 N 或更晚时，可读取仍一致的完成缓存；不能据此新派发旧 round。新的派发或后继仍要求 current revision == N-1 且未确认/未停止。首次身份来自当前 snapshot；后续身份来自原 write-once intent 的版本和绑定，并按固定路径核实际文件。
9. 原 `sameValue`、successor predecessor、claim 与 billing/native 核验继续工作。新 editContext 是 intent/context 的一部分，因此 denial/schema 的 native system/context 精确比较应自然包含它；不得删掉这些比较来兼容。schema input 的 brief/questions/answers 与保存回答仍使用既有 reader/比较，不要求 answers 文件出现 editContext。
10. 在首次 intent 发布前、每次新 session 创建前复核编辑来源；后继复核须在原持久 claim 前完成并与原 recheck 顺序组合。来源失效不得创建 session、reserve/admit 或新增后继机会。已完成缓存读取不产生请求。取消、缺失、篡改、链接、非法 UTF-8 或旧稿/问答漂移均保持失败关闭；不将此类错误视为格式纠正。
11. 原始失败和 successor 槽仍由现有框架决定，length/denial/schema 不连锁。新上下文不增加 request、grant、retry、window 或账务事件；不回填旧请求证明。只在确有必要时改 successor 文件，不泛化重写恢复框架。

## 输出、预算、确认与下游

12. 输出仍是原 `ordinaryDraftProposal`/`validateGameDraft` 接受的完整 proposal。主机不执行 patch、不自动补回条目、不把旧上下文写进新 draft、answers、confirmation 或 requirement。新 draft 的 brief/questions/answers 继续精确来自当前用户输入；旧文件保持不变。
13. 复用 deepseek-flash/off、原 16K 配置与既有最低输出、实际输入估价、reserve/admit/settle、最大请求数和超时。新增 context 字节进入 Pi 实际归一化请求估价；不可为了容纳上下文提高预算或截断原问答/旧条目。额度不足走现有拒绝路径。
14. 当前完整 revision 的真实 stdin confirm、unsupported 拒绝、当前版本绑定、生成时钟启动和独立设计评审全部保留。假传输证明上下文确实到达 SDK、完整返回经过原校验并保存；不能证明真实模型必然保留所有语义，也不能证明游戏生成或体验通过。

## room10 的后续边界

本轮只读确认 snapshot 为 intake-1/revision32、draft v3、4 次 settled 共 128821µ、confirmation/stop/start 均为空。独立 operator 的 `.cosmos/public-validation/room-20261025-10/draft-v3-wait.json` 记录 `PASS_CLEAN_WAIT`、shared3355、held5000000µ、exposure/pending/资源/锁为 0，v3 摘要 `71a8bd509e0e1c060e4f28f6f5b9345bcf59f13f20c93e5863630eac2fd55c9f`。该核验由 operator 完成，本设计没有打开真实 controller 或重新查账。

原 CLI resume 会先展示已有 v3；收到 edit 才走新 draft-4。当前不存在 draft-4 目录，因而源修复能以 v3 为新上下文，不需要重放 draft-3 或改原 native/answers/draft。实现合入后仍由 Root/operator 核新主线与实际原来源、原剩余额度和资源状态；本候选不执行该恢复、不保证付费准入或模型语义成功。不 stop/recreate/settle 原 run；room1–9 永久关闭。

## 免费验收

- 真实 public CLI → `createProductHost` → interview → Pi → pinned SDK，只替换底层 transport，完成首稿→edit→新完整稿→cancel。旧稿独有标记不在任何回答里，必须实际出现在第二个 draft 的 SDK 请求；首稿请求无上下文。第二 draft 响应按看到的上下文修订一个条目并保留其他条目，CLI 展示/保存完整结果。
- 与真实 funded 临时 fixture 同样走来源、预算与会话流程；旧 v3→新 draft-4 的代表可用临时数据复现，不读取/打开 room10 运行对象。
- 新 answers、draft.answers、最终确认读取不含旧 proposal/context，当前答案覆盖冲突项；host stages、codeProfile/benchmark、experience、unsupported 投影边界有断言。
- 旧版本 1 完成 cache、已有 length/denial/schema 后继继续使用原 prompt/context，无额外 transport；新版完成 cache 同样复用。新版来源变动、旧轮次新派发、确认后新派发、缺 intent/claim 残留拒绝。
- 新版 edit 的 schema correction 与至少一个既有 length/denial 代表保持同一 editContext 和唯一 successor；失败不产生第三次请求。复用其余未变预算/后继矩阵。
- 源文件/answers/profile 漂移、独立常规文件/UTF-8 边界、取消和输入结束、原预算/请求帽、旧 revision confirm 拒绝。没有真实当前确认前，generation 未启动。
- typecheck/build、改动测试的 strict 检查、UTF-8/中文回读与 `git diff --check`。独立 reviewer 先规格后质量，唯一 merger 仅合批准 SHA；既有有效证据复用且不累计重叠。

## 非目标

不增加编辑命令、自动语义审查、自然语言差异引擎、JSON patch 执行器、版本服务、模型工具、预算策略、重试授权或游戏专属规则；不改真实历史数据，不手工修 room10 draft，不编写目标游戏，不修改 GitHub 或 main。
