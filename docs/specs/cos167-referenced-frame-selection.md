# COS167 · 复用已确认需求时恢复采帧设置

COS167 的离线源码范围已完成。`frame_reuse_reviewer` 独立批准最终源码 `239c645784b2fa9e126934fd9c0b168c59a27087`，`ledger.scope` 伪造反例已复核通过，P1 已闭合。Root 授权唯一 merger 合入 `codex/gameplay-offline`。 运行时提交 `c17425731ad04545fc3f232c4912455cc077c52b`。公开 CLI 复用已确认的普通需求并启用 `renderFrames` 时，现在在受认证的引用分支识别合法 `planningAllocation`。新建和恢复均能沿用原采帧选择、观察器源码及确认绑定。引用需求必须通过公开运行与账本额度检查，伪装成验证账本的快照会在 host 准备前被拒。 GitHub #168 已关闭，父 #19 保持开放，61 项子任务中 59 项已关闭。[发布及验证记录](https://github.com/lrfluobida/Cosmos/issues/168#issuecomment-6601614244)

本卡 3 个批准文件与候选逐字节一致，与 COS166 已批准的 9 个文件没有交叉；组合的 12 个文件按各自批准版本核实。离线类型检查与构建通过。两个 CLI 集成代表分别验证停止来源的只读复用、暂停 intake 的新建后恢复，以及伪造 validation scope 无法绕开分配核验，合计 2/2、无跳过。 复用已审的定向 4/4、相关帧选择与恢复 15/15 及 typecheck 证据。初版的额度检查提前返回问题已在最终版本修复，现有未知字段、分配标记、原始来源和采帧哈希的校验继续生效。验证使用临时目录和模拟 host，实际游戏及体验验收仍未完成。

原生父任务 COS18/#19，依赖 COS70/#71、COS129/#130 与 COS144/#145。

批准规格原稿 SHA256 为 `d5afa38e5f141885291b7b3377bdd2c68f93ddc89bad85fc00d50ee00a304980`。

在公开 CLI 复用已确认的普通需求且原配置启用了 renderFrames 时，新 intake 的合法 origin 包含 planningAllocation。旧采帧读取器把此字段当成未知字段，导致进入环境准备之前失败。问题出现在 readFrameSelection 的字段清单。需求来源、额度和分配的真实性已有独立的生产检查。

只在成功读取并验证原始复用需求的分支，允许经现有验证的规划分配标记通过字段清单。沿用原始采帧选择、观察器源码与确认绑定。未知字段、错误标记或不一致的 allocation、替换采帧来源、无引用的原始运行带外来标记，须由相应原检查拒绝；无标记的兼容路径保留。不得放松通用 origin 检查或修改费用和额度算法。

验证既有 stopped-source / paused intake new→resume 的 CLI 用例和必要负例，在 TEMP 目录、模拟 host 中完成，不运行真实模型或改旧运行。按同一离线分支的 implementer/reviewer/唯一 merger 流程交付。
