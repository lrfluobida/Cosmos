# COS-86 验证摘要截断恢复后的固定迁移 C12

状态：TRANSFER_CASE_TWELVE_SOURCE_READY / source scoped complete / closed；实际C12 failed / coding cancelled，详见下文。Issue [#87](https://github.com/lrfluobida/Cosmos/issues/87)，id5850243246；父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)，依赖 COS84 #85、COS85 #86。

作者 `cos86_implementer`；独立 reviewer `cos86_reviewer`；唯一 merger `batch85_86_merger`。分支 `codex/cos86-transfer-case12`，初始基线 `ecd8d8e0c3f28e6d8f4cd34ea6219342900b9328`，最终 review base `d1064fdcb7532d1c565b8048b0a2922338dcb7d4`；[实施计划](../plans/2026-10-14-cos86-transfer-case12.md)。

## 实际 C12 结果（2026-10-15）

以下为源码准备之后的实际结果；本卡SOURCE_READY保持，公开#87已在源码范围closed。C12在冻结版本 `3cde457f77ef8990d73a650319b76900df3cdc11` 运行44分56.013秒，由既定截止前5秒定时器结束；结果`failed`，唯一coding attempt `13fc5130-fb5b-4bf4-bc57-80d393ecb809`为`cancelled`。52次请求均admitted/settled，新增¥1.664926，共享累计¥14.467801，unknown/reserved均0。沿原¥150持续验证授权执行，没有新增C12专属人工确认。

第一次作者自检TypeScript/Vite退出码0/0；作者继续修改后，第二次因 `src/boardScene.ts(150,18)` 的TS2339失败（`AnimationState`无`on`属性），退出码2。当前7文件36,508字节与第二次失败副本逐字节一致；与首次通过副本有2个源码文件变化，首次通过不能覆盖当前版本。Root保留两次现有自检副本及逐文件核对元数据，没有人工修改或重建游戏。

无handoff/capture、正式候选、正式build/browser/review/repair/accepted；journal仅origin，registry candidates为空，host-result不存在，体验未确认，C5 design/art仍passed。6次成功原生压缩之后，一次已结算的8192输出length后原会话继续请求与工具；可选摘要恢复仅由COS85源码与时序支持，回执未持久化请求kind。

Root一次完成closure18，释放¥1.335074；revision2770、20stopped/12delegations/100closed/18audits，旧历史和费用保持，进程、owner/locks已释放，main冻结已解除。原COS16组可分配¥2.540822，不足新的固定¥3案例。C12身份已消费，不能重启或延长；COS16/COS18及完整游戏/human未完成。[COS16结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6174293178)与[C12结果](https://github.com/lrfluobida/Cosmos/issues/87#issuecomment-6174294365)已由Root精确读回；精确时间、自检差异、停止文字与推断边界见[研究记录](../research/2026-10-15-transfer-c12-deadline.md)。下文保留原源码准备与集成时的历史记录。

## 契约与完成条件

1. 固定新 C12，保留 19 stopped / 11 delegations / 95 closed grants / 17 closure audits。C11 41 笔 coding author 请求全部 admitted/settled、无 repair/unknown/reserved，费用与 closure17 来源逐项吻合；旧 C11 不重开。
2. 新向量 1/1/1/2400000/599997µ，合计 ¥3；45min、80 requests、一次合格 repair。原 COS16 group ¥10、phase ¥30、shared ¥150 保持，按 availableAllocation 核准，原 partial 恢复公式保持。
3. C5 两 passed 阶段七 capture 只读复用，零 planner/design/art SDK，新作者为空，不预置 C11 六个文件。C12 身份、当前 plan/quote 与 source/compiled、owner、请求及工具守卫完整绑定。
4. 仅扩 ten/eleven helper 至固定 twelve 及必要字面量、六个 wrapper、四个测试文件与 README；旧 ten/eleven 行为不变。新增 COS84/COS85 最终 ready marker 和 reviewed/merge 双祖先，COS85 未最终批准时拒绝准入。
5. 先独审计划，再做 41 笔历史/closure17、固定额度及拒绝、当前 host/factory/Pi fake、partial 冷恢复、compiled 闭包与旧 C11/C10 unit 回归。复用原 SOURCE 前缀，通过原 API 新身份补合成历史，finally 恢复 snapshot/mapping/目录；旧一笔 mock 不能冒作 41 笔。

实际 C11 自检通过后末次输出截断，无正式候选；摘要阶段仍为源码推断。Root 报告原组可分配 4205748µ，仅作背景，实际前置须再次免费核准。本卡准备源码与合成证据；最终 exact 独审、merger 集成推送及 Root 固定来源/免费准入后，Root 才能执行一次真实 C12。

作者不读写真实台账、会话、凭据、启动器或 C11 生成文件，无付费行为。SOURCE、编译通过不代表实际 C12、完整游戏或 human 通过；COS16/COS18 与完整经典未完成状态不变。共享 tracking 和公开发布由 sole merger/Root 处理。

## 免费源码证据

计划 `fc2a06e8b4668145133b393533d91d2dc8987d96` 已独立 PLAN_APPROVED，无 finding。测试前并入 COS85 最终已推主线 `5b2f16387ea0cfee79eaecba632cd06924c60ee8`；新 C12 六项有效 RED→C10/C11/C12 18/18 GREEN，runtime1/1、compiled1/1，0skip，typecheck/build/affected strict退出0。

SOURCE 通过原 API 补足两组各 41 笔 C11 合成费用与 closure17，保留 19/11/95/17 及旧历史；空作者、C5 两阶段七 capture、当前 host/factory/Pi、审批双祖先和 partial 冷恢复通过。原 snapshot/mapping/目录与 owner 已恢复，证据归档及全部原始命令/TAP见计划。compiled worker transport为synthetic，未执行C12正式build/browser/repair或完整游戏。

后并入 `d1064fdcb7532d1c565b8048b0a2922338dcb7d4` 的六文档关闭记录；核实源码、依赖、固定输入、夹具及 COS84/85 marker/approved/merge未变，定向元数据和祖先检查通过，复用已通过证据。最终 exact 已独立规格→质量APPROVED，源码ready标记与主线证据见下。

## 独立审查与主线集成

最终源码 `08012122685cb66e104f85c1da00bbe7915cebee` 经 `cos86_reviewer` 对base `d1064fdcb7532d1c565b8048b0a2922338dcb7d4` 的实际18路径规格→质量APPROVED，无finding。唯一 `batch85_86_merger` 合入 `c8f5ecb117e7a68715aa7d8ce0c31f5562ec86ee`；批准源码、测试及README字节保持。公开issue仍open，等待Root关闭；本次集成推送后main冻结供Root免费预检及一次有界C12运行，仅Root可解除。

主线 `npm run typecheck`、`npm run build` 退出0。`node --experimental-strip-types --test --test-name-pattern='C12 (fixes|rejects|uses|fixed parser|unknown admission)|C11 (fixes|rejects)' tests/transfer/validation-case-twelve.test.ts tests/transfer/validation-case-eleven.test.ts` 7/7、0skip、TAP6571.5138ms：C12五项固定额度、历史拒绝、available、quote与unknown准入，以及C11两项旧额度/历史拒绝。原始输出均位于 `C:/Users/26557/AppData/Local/Temp/`：`cos86-merge-typecheck.log`、`cos86-merge-build.log`、`cos86-merge-integration.tap`。已核作者八份raw，复用18项unit、runtime1/1、compiled1/1及finally恢复证据，未重长SOURCE。

仅免费SOURCE/TEMP合成证据，compiled worker transport为synthetic；没有新付费、真实台账/会话/凭据/启动器读取或实际C12 build/browser/repair/accepted/human结果。C11失败和费用、COS16/COS18及完整经典未完成状态保持。
