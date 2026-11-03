# COS165 · 在追加窗口核验历史设计写入策略

[COS164 / #166](https://github.com/lrfluobida/Cosmos/issues/166) 已登记。`offline_repair_origin_reviewer` 已对固定规格给出 APPROVED_DESIGN，Root 批准 `continuation_history_implementer` 实施。源码待独审。普通非验证资金运行的设计、美术已通过而编码尚未完成时，显式确认的追加窗口应能核验历史设计并派发新的编码任务。既有 F1 用例在登记编码任务前失败：原设计冻结了结构化写入策略，绑定宿主却用新窗口的工具选择去核对它。修复目标是按原始 planning/execution 选择认证历史设计契约和已通过的来源，再按当前窗口授权派发新任务。

原省略值、`structured-plan/1` 及 `structured-design-plan/1`、`/2`、`/3` 都按冻结版本解释。未知值、单边漂移和历史来源篡改须在派发前拒绝。新窗口不会继承历史设计的结构化写入、预算收尾或修订权限。 直接依赖 [COS147 / #148](https://github.com/lrfluobida/Cosmos/issues/148) 的冻结写入规则和 [COS136 / #137](https://github.com/lrfluobida/Cosmos/issues/137) 的 F1 续跑回归。父任务 [COS18 / #19](https://github.com/lrfluobida/Cosmos/issues/19) 的 [续跑宿主契约](https://github.com/lrfluobida/Cosmos/blob/2021750d901bc2c719cabde9116aa4230ea6e9d8/docs/development/continuation-host.md) 定义历史来源与当前执行绑定。

批准规格原稿 SHA256 为 `aee24c5a3a62f8901d5fd98425b6de320b1961e84f9efd7e20b8f25387a56c22`。

基线 d36065c24cf19cb0773af2e271393428e060ca8d，生产代码 2021750d901bc2c719cabde9116aa4230ea6e9d8。全程离线，集成目标 codex/gameplay-offline。

普通非验证资金运行的设计和美术已通过，编码未完成。用户在临时夹具中明确确认原有追加窗口后，生产入口生成含历史任务和一个新编码任务的计划。F1 supported continuation 用例在新任务登记前失败。只读复现取得原始异常：Frozen task differs from its ordinary plan authoring policy。历史设计拥有原运行选择的 structured-design-plan/3 写入规则，绑定宿主在新窗口没有选择写入策略，两者被错误地作为同一个选择来比对。

历史来源只用于认证。验证原 planning/execution 选择一致、原设计契约与可复用的已通过历史来源相符，保留现有 journal、选择/证据、窗口与任务边界。已确认版本省略、structured-plan/1、structured-design-plan/1、/2 和 /3 要按其原本含义处理；未知、单边漂移、原任务或历史标记被篡改时须在派发前拒绝。新派发任务继续遵循窗口策略，不能从已有祖先获取结构化写入、只读预算收尾或设计修订权限。不得将整个历史选择传成绑定宿主的新能力或跳过严格校验。

用现有普通生产入口与 TEMP 模拟角色证明：原本失败的正式追加窗口执行到新编码任务 passed，设计祖先没有重复执行，原始来源字节保持。补受影响的拒绝场景及旧版兼容代表；测试中的授权与产物限于该夹具。发布实际 diff 的独审与唯一 merger 复核结果，保留真实 R27 账务及验收状态。
