# COS148 实施计划

状态：`source-integrated / source-scoped-complete`；最终 `6c175bc6aafc72a9e680e795542d29286250fdad` 已经review_input_correction_reviewer实际diff独审APPROVED_SOURCE_SCOPED、无finding与Root集成批准，发布 `479d890fdeb4ad1b379ac7e6bbfbeca7ea1da967`。[SOURCE完成关闭](https://github.com/lrfluobida/Cosmos/issues/149#issuecomment-6492302540)及父[x]已GET核证；main typecheck/build0、4/4、0skip，49/49、admit delta1/1、严格类型与native A/B证据复用。未新增独立plan审批。R15在provider length时终止，无proposal/correction，未触发本live分支；下列步骤保留为原批准计划。

任务：[COS148 / #149](https://github.com/lrfluobida/Cosmos/issues/149)，id6094791306，原生父COS18/#19已勾；依赖[COS138 / #139](https://github.com/lrfluobida/Cosmos/issues/139)及[COS141 / #142](https://github.com/lrfluobida/Cosmos/issues/142)。作者review_input_correction_implementer，native辅助review_input_correction_replay，独立源码reviewer review_input_correction_reviewer，唯一merger planning_budget_merger。

Root批准输入SHA256：spec `ac99996c9aafa7911f9ecd1baccdfdc5020db9026f30efcea0e0f5bca031d936`；plan `34c6fd463726a020efe1a5b83abdfb0e652c216683041f8acb8c286117958a64`。

1. dedicated implementer读取已复现证据与本规格，在clean managed worktree新codex/review-input-version-correction分支建立实际correction遗漏RED；Root已批准实施，不额外等计划审批。
2. 仅保留可信inputVersions失败诊断并带入原单次correction；strict、0|1计数、durable record、原scope/budget及专用协议不变。
3. 做聚焦边界测试并准备R14精确native fakefetch正/负两分支；不写真实旧输出、不真实付费、不补造语义批准。
4. 候选SOURCE固定SHA立即给独审做spec→质量实际diff；报告可并行整理，仅修实际finding并复核delta。
5. 唯一planning_budget_merger登记/集成批准SHA、有限主线检查，优先发布source并停写；公共状态可在real验证关闭后收尾。
6. 后续新run仅在source/必要证据就绪后按原room12v2/phase40/5M30min启动。当前R1–R14永久closed，无后续paid准备。
