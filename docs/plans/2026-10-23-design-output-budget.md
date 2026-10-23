# COS124 实施计划

> 采用subagent-driven-development；独立implementer、独立源码reviewer、唯一merger `public_agent_batch_merger`。

目标：普通设计作者可在原预算内选择8192..32768输出容量，避免已见8K截断及固定32K报价倒退。

## 文件

- 生产 `src/roles/factory.ts`、`src/runtime/entrypoint-host.ts`；可新增一个聚焦的 `src/roles/author-output-budget.ts`，封装只读选择，保持factory清晰。
- `src/providers/pi.ts`只作取消所需的窄增量：既有requestOutputLimit兼容地接收已有请求signal，返回后预算预留前核取消/failure。allocator、provider-budget、fixed validation coding callback与intake selector行为原样；不新增生命周期。如果还需改动，先报告具体必要性。
- 测试优先复用ordinary-author与request-capacity/预算/native transport夹具，按实际路径新增聚焦测试；勿猜路径。
- 正式文档 `docs/specs/cos124-design-output-budget.md`、`docs/plans/2026-10-23-design-output-budget.md`。三tracking由merger改；实际运行/账本只读。

## 步骤

1. 重用已附着clean managed worktree，自批准base创建独立codex分支，保留ignored证据。先核UTF-8/行尾，说明编辑文件。
2. 保存有效RED：旧设计sent cap8192与受控length；固定32K复现room6请求12预留失败，而原8K可行。只在TEMP/内存，不触历史真实controller。
3. 增加可信floor配置/选择隔离、聚焦只读budget helper、ordinary host设计32K/8K启用，以及仅该作者安全请求metadata记录；固定启用角色的resolved cap/基础cap，run只比较稳定身份字段。
4. 测真实SDK+fake transport选定cap与真实原budget hook一致、>8K完整工具/交接路径；精确32621边界、报价不变账本、无候选与非法报价、非单调估价、floor与配置快照；连续两次请求和中间结算保持可用。
5. 按既有Pi接口传入请求signal，每固定批次yield并核请求/owner取消与deadline/cleanup，callback返回后预留前核failure/cancel。测搜索中的异步caller abort、owner abort、deadline到期停止报价且零发送/预留；旧单参callback兼容。跑最短角色/模式兼容和authority/并发消费/partial tool不执行及旧失败恢复负例。不改原失败分类或新增retry。
6. 检查原capture/review仍必经，typecheck/build/changed strict、UTF-8中文回读与diff；保存每条命令/退出码/空stdout证据。复用未变通过证据，重叠结果不相加。
7. 作者提交精确SHA和证据索引；独立reviewer先规格后质量，作者修finding后定向复审。唯一merger核SHA、短集成、source-scoped关闭新任务并发布真实边界。

设计/计划已获 design_output_plan_reviewer 最终独审批准；Root 已授权实施。新源码不恢复room8或任何旧关闭运行；后续实际验证使用原公开CLI及当前完整需求确认。

## 源码交付与验证

作者 `cos124_implementer` 在独立 managed worktree 的 `codex/design-output-budget` 分支上，从批准基线 `56fb0c1c6c34e25d3cc9dfe8ccbd33c2ef1b3428` 实施。独立源码 reviewer 为 `cos124_reviewer`；唯一 merger 为 `public_agent_batch_merger`。[任务 #125](https://github.com/lrfluobida/Cosmos/issues/125) 的登记、追踪文件和发布由 merger 处理。

生产改动仅四个文件：factory 固定启用配置与请求记录；author-output-budget 只读选择与每 64 个候选让出事件循环；entrypoint-host 仅普通新设计路径接线；Pi 将已有 SDK signal 传给可选回调并在回调之后、估价及预留之前复核取消。固定 validation coding 回调、allocator、provider-budget 和 intake selector 不改。

原始命令、退出码、标准输出与标准错误（含空文件）均在 `.cosmos/cos124-evidence/verification-index.json` 及对应记录中。RED 为 `red-budget`、`red-length-explicit`、`red-cancel`；初次 strict 的测试类型错误保留为 `strict`，后续修正仅补充测试/夹具类型。

| 记录 | 结果与范围 |
| --- | --- |
| `red-budget` | 2 个预期失败：旧 factory 无选择策略，固定 32K 的真实预算预留拒绝 |
| `red-length-explicit` | 原 ordinary design sent cap=8192，真实 Pi 报 incomplete/truncated |
| `red-cancel` | 旧回调未收到 SDK AbortSignal，预期失败 |
| `green-core` | 33/33，预算选择、SDK 传输及原输入不变边界 |
| `green-host` | 3/3，普通三槽、模块五槽和 funded；原自检、capture、独审继续执行 |
| `green-delta` | 18/18，权限漂移、停止、快速返回取消、length 零工具与 fixed validation 隔离 |
| `modes` | 4/4，legacy、preparation、continuation binding 和 inherited |
| `compatibility` | 21/21，原角色 cap、窗口、取消、32 次上限与旧失败不可恢复；与 modes 有重叠 |
| `metadata-isolation` | 3/3，未启用、planning、reviewer 的回执不增加 request 字段 |
| `typecheck`、`build`、`strict-final` | exit 0；typecheck/build 的 stdout/stderr 为空 |

`strict-modes` 保留首次扩展类型检查失败：原 continuation 夹具两处读取未声明的 `location`，改为相同输出目的地的声明字段 `destination`；新增 callback 补参数类型。`compatibility` 已验证该夹具的新 binding 代表。其余未变的长链回归不重复执行，独立 reviewer 针对实际 diff 复核。表内各组与重跑可能重叠，不汇总为新增唯一测试总数。

核心覆盖包括 room6 的 32621/32622 边界、room8 的 32768、floor/无候选、非单调与非法估价、配置快照、连续两次结算、请求/owner 取消、deadline/cleanup、真实 reserve 竞争拒绝、六字段回执和大于 8K 的完整工具/原交接。普通三槽、模块五槽、funded、legacy、preparation、固定 validation、continuation binding 与 inherited 路径分别使用现有夹具检查。SDK 输入不变、旧单参回调、length 及未启用角色上限复用未变测试，并按受影响调用边界定向执行。重叠测试结果不相加。

旧 room1–8/memory 永久关闭，本批无真实 provider、游戏浏览器、历史账本或凭据操作。32K 只提高可选容量，不保证真实输出完整、设计语义正确、review 余额或整体游戏通过。
