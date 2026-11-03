# COS172 · 独立交付包附上本版试玩清单

[COS172 / #173](https://github.com/lrfluobida/Cosmos/issues/173) 已登记。最终源码经独审及 Root 批准，待离线集成。普通游戏打包器在封存新候选前，从本次运行已核实的原始确认来源读取主观体验条目，按原顺序写入包内 README.zh-CN.md。玩家可在已交付目录中查看本版的编号、描述、试玩步骤及期望表现。

清单关联运行和候选版本，只展示所需条目。空清单给出整体体验指引。描述中的中文、换行和 Markdown 特殊符号按文字呈现，不能变成意外链接或指令。清单本身不写入玩家决定。

TEMP 中使用真实打包和宿主路径，比对确认需求、封存候选及评审副本里的说明，并检查既有双击和手动启动方式。验证材料使用合成需求。 原生父任务为 COS18/#19，直接依赖 [COS-170 / #171](https://github.com/lrfluobida/Cosmos/issues/171)、[COS-111 / #112](https://github.com/lrfluobida/Cosmos/issues/112)。实现者 `portable_checklist_implementer`，独审 `portable_checklist_reviewer`，唯一 merger `planning_budget_merger` 集成到 `codex/gameplay-offline`。

批准规格原稿 SHA256 为 `e00eb425d04ad6941b478c2a7d9f1e2dde4d00c17ce575ca7ab15b359d265b37`。

基线为同一离线开发分支的 COS170 交付。独立包已有可启动文件、源码和说明；玩家只收到这个目录时，无法从中获得原先确认的主观体验检查项。

在普通候选封存前，使用该次运行经核实的原始确认来源，将体验要求按原顺序写入已有 README.zh-CN.md，与该候选的版本和运行身份关联。显示编号、描述、试玩步骤及期望表现；空列表保留整体体验指引。便携说明帮助玩家反馈具体表现。只取所需条目，按文字展示合法中文、Markdown 特殊符号及换行，不让内容成为意外链接或指令。包内清单不生成用户决定、验收状态或额外运行。

复用原打包、审查副本、完整性检查和干净交付机制；非普通和过去已封存的包维持自己的原行为。TEMP 真实打包/宿主路径验证清单与确认需求一致、候选和评审副本一致，继续支持原一键/手动启动。唯一 merger 仅向 codex/gameplay-offline 集成受审源码；无模型请求或真实账务操作。
