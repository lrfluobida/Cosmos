# COS173 · 从完成结果找到试玩入口

[COS173 / #174](https://github.com/lrfluobida/Cosmos/issues/174) 已登记。正式规格经独立设计审查，Root 已批准实施，源码待独审。公开 new、完成态 resume 和 status 在核实自动验收已通过且仍待玩家决定时，提供可选的结构化 nextAction。命令与参数分开，指向 cosmos experience 和本次运行目录，带空格或中文的路径作为一个参数传递。

experience 核对当前绑定候选的 Play.cmd 和 standalone-launcher.mjs。只有两者都是安全普通文件、字节与可信打包器一致时，才显示具体启动路径、Node 22 要求和停止方法。旧包、缺件或字节漂移时显示目录指引。已批准、已拒绝、未完成或无法核实的运行不显示待决定的 nextAction。

以离线 TEMP 用例验证现代与旧版包、含特殊字符的路径、启动文件被改动、已有决定以及只读结果展示。提示本身不启动程序、不派发模型、不写回不可变报告或回执。 原生父任务为 COS18/#19，直接依赖 [COS-170 / #171](https://github.com/lrfluobida/Cosmos/issues/171)、[COS-171 / #172](https://github.com/lrfluobida/Cosmos/issues/172)、[COS-63 / #64](https://github.com/lrfluobida/Cosmos/issues/64)。实现者 `playtest_route_implementer`，独审 `player_route_reviewer`，唯一 merger `planning_budget_merger` 集成到 `codex/gameplay-offline`。

批准规格原稿 SHA256 为 `6775092609f1b6b632d6f32622106052e4ad1a280b50830a0e72c7a3874f32f2`。

在现有新生成、完成后的恢复和状态输出中，用户能读到报告和交付目录，但要自行推断下一条命令。experience 能核对版本和清单，现有界面只显示工程目录。

给已完成自动验收、当前仍待玩家决定并满足既有完成条件的结果增加可选 nextAction。命令和参数分开表达，目标为 cosmos、experience、真实运行目录；作用域只到该次运行。沿用原 JSON、已验证的状态、终止及恢复语义。已拒绝、已批准、未完成或不可核实的状态不显示待试玩指引。该信息属于显示，不写回不可变报告或回执，不产生模型调用。

玩家进入 experience 时，根据当前绑定候选读取包内的 Play.cmd 和 standalone-launcher.mjs。只有二者与可信打包器对应的字节均匹配且为安全普通文件时，才给出具体启动文件路径及 Node 22、双击和停止方法。旧包、缺件或被改动的启动文件给通用目录指引，不自动启动浏览器或作出决定。

离线 TEMP 场景覆盖带空格/中文等字符的运行目录、公开 new/resume/status 输出、现代/旧版/篡改包、已作决定状态和只读体验输出。复用现有包和确认绑定。由独立 implementer / reviewer 及唯一 merger 合入 codex/gameplay-offline。
