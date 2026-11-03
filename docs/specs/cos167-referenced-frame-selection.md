# COS167 · 复用已确认需求时恢复采帧设置

[COS167 / #168](https://github.com/lrfluobida/Cosmos/issues/168) 已登记。`frame_reuse_reviewer` 已独立核对固定规格，Root 批准 `frame_reuse_implementer` 实施，源码待独审。公开 CLI 使用已确认的普通需求新建尝试时，如果原选择启用了 `renderFrames`，采帧读取器会把新 origin 的合法 `planningAllocation` 当作未知字段。这使带引用来源的运行在进入环境准备前失败，也影响已暂停 intake 的恢复。

只在原始需求引用及分配策略均通过认证的分支识别该标记，并复用原采帧选择、观察器源码与确认绑定。未知字段、错误分配、采帧来源篡改，以及未引用原需求却携带外来标记，仍须拒绝。原无标记的兼容路径按冻结含义恢复。 父任务为 [COS18 / #19](https://github.com/lrfluobida/Cosmos/issues/19)。直接依赖 [COS70 / #71](https://github.com/lrfluobida/Cosmos/issues/71) 的公开采帧选择及恢复绑定、[COS129 / #130](https://github.com/lrfluobida/Cosmos/issues/130) 的已确认需求复用和 [COS144 / #145](https://github.com/lrfluobida/Cosmos/issues/145) 的规划分配策略。

批准规格原稿 SHA256 为 `d5afa38e5f141885291b7b3377bdd2c68f93ddc89bad85fc00d50ee00a304980`。

在公开 CLI 复用已确认的普通需求且原配置启用了 renderFrames 时，新 intake 的合法 origin 包含 planningAllocation。旧采帧读取器把此字段当成未知字段，导致进入环境准备之前失败。问题出现在 readFrameSelection 的字段清单。需求来源、额度和分配的真实性已有独立的生产检查。

只在成功读取并验证原始复用需求的分支，允许经现有验证的规划分配标记通过字段清单。沿用原始采帧选择、观察器源码与确认绑定。未知字段、错误标记或不一致的 allocation、替换采帧来源、无引用的原始运行带外来标记，须由相应原检查拒绝；无标记的兼容路径保留。不得放松通用 origin 检查或修改费用和额度算法。

验证既有 stopped-source / paused intake new→resume 的 CLI 用例和必要负例，在 TEMP 目录、模拟 host 中完成，不运行真实模型或改旧运行。按同一离线分支的 implementer/reviewer/唯一 merger 流程交付。
