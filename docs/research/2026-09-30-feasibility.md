# Cosmos 首轮可行性调研

日期：2026-09-30

## 当前结论

Pi 提供构建 Cosmos 所需的会话和工具扩展接口。实现游戏生产流程还需要任务调度、产物交接、集成、恢复以及可重复的游戏验收。

本轮核对源码与官方文档，尚未运行技术原型。用户已确认产品范围为可扩展的 2D 游戏 agent，以类《植物大战僵尸》为首个完整能力验收目标。后续回答将目标明确为核心玩法与内容规模完整覆盖，原创美术可简化；最新要求与待决定项见 [spec 草案](../specs/cosmos-spec.md)。

调研按原 `badlogic/pi-mono` 项目展开。若用户所指 pi 为其他项目，需要调整底座结论。

## 1. 已核实的底座能力

| 事实 | 对 Cosmos 的影响 | 依据 |
| --- | --- | --- |
| 原项目已迁移至 `earendil-works/pi`；本次最新 release 为 v0.99.1，coding-agent 包名为 `@earendil-works/pi-coding-agent` | 实施前固定依赖版本，避免直接使用旧教程中的包名与 API | [仓库](https://github.com/earendil-works/pi)、[release](https://github.com/earendil-works/pi/releases/tag/v0.99.1) |
| SDK 提供 AgentSession、模型和工具配置、持久化、恢复、分支、取消与消息队列 | 可支撑不同角色的执行会话；任务依赖和验收状态需要 Cosmos 定义 | [SDK](https://github.com/earendil-works/pi/blob/0582d9c11da78c1812d4537af2d194f1dd060d26/packages/coding-agent/docs/sdk.md) |
| 官方 subagent 为扩展示例；通过独立进程支持单任务、并行与串链 | 可作为调用方式参考，不代表完整的生产编排系统 | [示例说明](https://github.com/earendil-works/pi/blob/0582d9c11da78c1812d4537af2d194f1dd060d26/packages/coding-agent/examples/extensions/subagent/README.md) |
| 示例使用 `--no-session`，默认继承父进程 cwd | 对话上下文隔离不自动提供子任务恢复或文件写入隔离 | [启动源码](https://github.com/earendil-works/pi/blob/0582d9c11da78c1812d4537af2d194f1dd060d26/packages/coding-agent/examples/extensions/subagent/index.ts#L282-L328) |
| Pi 默认继承启动者权限 | cwd 和 worktree 用于组织工作，不构成权限边界；如需要运行不受信任的工具，应单独设计隔离 | [权限说明](https://github.com/earendil-works/pi#permissions--containerization) |
| RPC 请求成功表示请求已接受；`agent_settled` 用于判断自动执行已稳定结束 | 若选择 RPC，任务完成判断需要遵循实际生命周期 | [RPC](https://github.com/earendil-works/pi/blob/0582d9c11da78c1812d4537af2d194f1dd060d26/packages/coding-agent/docs/rpc.md#run-lifecycle) |

本次源码快照：`0582d9c11da78c1812d4537af2d194f1dd060d26`。release 版本与所查看的 main 快照分别记录，尚未选为项目正式依赖。

## 2. 游戏运行与美术的事实边界

### 运行平台需要先于引擎选择确定

- Phaser 支持浏览器中的帧动画、精灵表和图集。它的 `HEADLESS` 模式不创建 Canvas/WebGL，且仍依赖 DOM，因此不能仅靠该模式证明画面和输入正常。[渲染模式](https://docs.phaser.io/api-documentation/namespace/phaser#headless)、[动画](https://docs.phaser.io/phaser/concepts/animations)
- Godot 提供命令行运行、导出和录制能力。Web 导出要求 WebAssembly 与 WebGL 2，当前 Godot 4 的 C# 项目不能导出 Web。[命令行](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html)、[Web 导出](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)
- Playwright 可发送浏览器鼠标事件并进行截图比较。比较结果受操作系统、硬件和运行模式影响，应固定比较环境。[鼠标输入](https://playwright.dev/docs/api/class-mouse)、[视觉比较](https://playwright.dev/docs/test-snapshots)

**方案建议：**若目标是浏览器试玩，优先验证 Phaser 的构建和操控链路；若目标是原生游戏和编辑器工程，优先验证 Godot。目标平台未确定前保持两项候选。

### 美术交付需要覆盖动画资产

以 OpenAI 图像生成接口为例，官方仍列出跨次角色一致性和精确布局方面的限制；透明输出需要 PNG/WebP。这只是该候选服务的文档事实，不能据此断言所有服务的实际表现。[官方说明](https://developers.openai.com/api/docs/guides/image-generation#limitations)

**方案建议：**art-agent 的交付物应包含资产清单以及尺寸、帧序、锚点、透明通道和动作状态约定。用导入后的动画、状态切换及深浅背景检查验收，单张预览图无法证明整个资产可用。

## 3. “95%”的候选验收办法

更新说明：用户后续要求核心玩法与内容规模百分百还原。以下为首轮评分讨论记录，不能据此放宽最新要求；功能缺项必须逐项处理，美术相似度单独验收。

首先固定参考版本、模式、关卡、单位、流程以及美术目标，再分别衡量：

1. **功能完成度**：通过验收的加权条目，占约定全部条目的比例。
2. **体验相似度**：对规则、节奏、内容、视听和操作反馈分别评价，附可检查的试玩证据。具体权重与评分者待确认。
3. **必须通过的条件**：启动、正常输入、关键玩法、胜负、重开等必需流程。阻断错误不能被其他项目的高分抵消。

建议固定完整分母，并区分验证切片与最终目标。小关卡通过全部验收，只能证明该切片完成，不能算作整个参考游戏的 95%。截图相似也不能直接推导出玩法或内容完成度。

建议由独立评审上下文检查代码代理的产物；这项职责可以由 Cosmos 调用临时评审会话承担，是否增加常设 QA-agent 待讨论。

建议保存交付版本、操作记录、录像、断言和失败记录。关键验收经玩家可用的正常输入完成；辅助状态接口用于读取和诊断。开发期间使用的测试与最终验收场景应有区分。

“一句话生成”的评估同时记录人工补充、人工修改、重试、耗时和费用。自动化程度与游戏质量是两组不同结果。

## 4. 优先技术验证候选

这些任务尚未执行，规模、预算和具体标准需随需求确定。

| 验证 | 产物 | 候选通过标准 |
| --- | --- | --- |
| 运行与操控链路 | 可构建场景、输入脚本、录像 | 干净环境可以启动；正常点击触发可见变化；故意关闭输入后测试会失败 |
| 最小完整塔防关卡 | 资源、冷却、少量单位与波次、胜负和重开 | 独立试玩经正常输入达到胜利和失败；资源不足与冷却边界符合约定；重开恢复初态 |
| 美术资产链路 | 同一角色的待机、攻击、死亡及资产清单 | 全部帧可导入；角色一致性、帧序、锚点、透明边缘和状态切换达到约定标准 |
| 并行产物交接 | 编码与美术的任务产物、集成记录 | 指定版本素材进入对应工程；故意制造资源版本或同路径冲突时能够识别并解决 |
| 取消与恢复 | 中断前后的任务、会话和产物记录 | 已验收设计与素材保留；仅恢复未完成工作；取消后的进程不继续写入；不重复生成已验收资产 |

依赖建议：先确定范围和验收，验证运行与操控，再完成一个端到端关卡；约定资产格式后可并行验证美术。恢复、冲突和预算控制应在长时间无人值守运行前验证。

## 5. 任务拆分原则

建议以可验收的产物和流程拆分 issue，再为任务分配角色。单独的“实现 coding-agent”不足以描述产物能否集成进游戏。

每项任务至少包含：

- 目标与范围，以及关联的 spec 验收条目。
- 前置任务、输入产物及版本。
- 允许修改的文件范围与产物归属。
- 输出契约、验收步骤和所需证据。
- 失败时的处理边界及交接摘要。

GitHub 支持父 issue 与 sub-issue 关系；发布时使用实际关系和任务链接记录层级。[GitHub 文档](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues)

## 6. 当前待用户决定

已确认产品覆盖范围、还原目标、交互方式、资源优先级和 GitHub 仓库。待决定项见 [PROGRESS.md](../../PROGRESS.md)：平台、48h 计时边界、费用上限、复用范围、完整内容清单和还原精度。

这些答案将决定下一轮的交付平台、完整内容清单、验收责任及自动化边界。目前还没有依据对目标游戏的成功率、费用或完成时间作出承诺。
