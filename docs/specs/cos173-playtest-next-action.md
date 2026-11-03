# COS173 · 从完成结果找到试玩入口

[COS173 / #174](https://github.com/lrfluobida/Cosmos/issues/174) 已在 `codex/gameplay-offline` 离线源码范围完成。`player_route_reviewer` 独立批准 `9497bf50e5e7c2458a8f7aad8b52c70ae41f2255`，Root 放行后由唯一 merger 集成到 `15db482af0a762696872adb870b4108c5f3d3407`。当自动验收已通过、完成证明与当前报告和候选均可核实、且玩家尚未作决定时，`new`、完成态 `resume` 和 `status` 都返回结构化 `nextAction`，命令为 `cosmos`，参数为 `experience` 和本次运行目录。已有决定、未完成或无法核实的状态不会给出待决定提示。 [发布及验证记录](https://github.com/lrfluobida/Cosmos/issues/174#issuecomment-6604829762)

7 个文件与批准版本逐字节一致。离线集成类型检查、构建和公开 CLI 的特殊路径代表 1/1 通过，无跳过。测试覆盖含空格路径、命令参数分离和同一交付的只读状态。P2 已修复：即使报告内容摘要相同，如果报告引用不同，仍拒绝给出操作提示。作者最终代表 1/1、strict/build 及无变更部分既有 22/22 证据复用，重叠用例不累加。 独立只读复核还用最终源码的编译 CLI 对待决定、已拒绝两份保留的合成运行各执行 status、resume、experience EOF，共六个禁写、禁网络的独立进程。待决定的 JSON 返回精确命令与独立路径参数；已拒绝的运行保留原观察，没有待决定提示。两次运行及其确认来源的快照和全部 delivery JSON 均逐字节一致。 `experience` 只有在当前候选的 Play.cmd 与 standalone-launcher.mjs 均为安全普通文件，且与可信打包器字节一致时，才显示具体路径、Node 22 和 Ctrl+C 指引。缺件、篡改或链接异常回退为目录提示。已有决定按实际状态展示。独审在 TEMP 核对空输入、匹配文件、缺件、硬链接和 junction。验证仅覆盖离线源码和合成运行，真实用户体验仍待确认。

批准规格原稿 SHA256 为 `6775092609f1b6b632d6f32622106052e4ad1a280b50830a0e72c7a3874f32f2`。

在现有新生成、完成后的恢复和状态输出中，用户能读到报告和交付目录，但要自行推断下一条命令。experience 能核对版本和清单，现有界面只显示工程目录。

给已完成自动验收、当前仍待玩家决定并满足既有完成条件的结果增加可选 nextAction。命令和参数分开表达，目标为 cosmos、experience、真实运行目录；作用域只到该次运行。沿用原 JSON、已验证的状态、终止及恢复语义。已拒绝、已批准、未完成或不可核实的状态不显示待试玩指引。该信息属于显示，不写回不可变报告或回执，不产生模型调用。

玩家进入 experience 时，根据当前绑定候选读取包内的 Play.cmd 和 standalone-launcher.mjs。只有二者与可信打包器对应的字节均匹配且为安全普通文件时，才给出具体启动文件路径及 Node 22、双击和停止方法。旧包、缺件或被改动的启动文件给通用目录指引，不自动启动浏览器或作出决定。

离线 TEMP 场景覆盖带空格/中文等字符的运行目录、公开 new/resume/status 输出、现代/旧版/篡改包、已作决定状态和只读体验输出。复用现有包和确认绑定。由独立 implementer / reviewer 及唯一 merger 合入 codex/gameplay-offline。
