# COS-88 原预算组余量内的固定迁移 C13

状态：TRANSFER_CASE_THIRTEEN_SOURCE_READY / source scoped complete / closed；实际C13 failed，详见下文。Issue [#89](https://github.com/lrfluobida/Cosmos/issues/89)，id5852981194，已由 Root 精确读回并原生挂父 [#1](https://github.com/lrfluobida/Cosmos/issues/1)；依赖 COS86 #87、COS87 #88。

作者 `cos88_implementer`，独立 reviewer `cos88_reviewer`，唯一 merger `batch_c12_reference_merger`。分支 `codex/cos88-transfer-case13`，起点 main `49e892992749e5511f2bb4135ec67be4459fa30b`；[实施计划](../plans/2026-10-15-cos88-transfer-case13.md)。计划 exact `6ad3235c52cd1e0f2a11dfaaa0b5bfc38eeefeff` 已独立 PLAN_APPROVED，无 finding；[公开批准](https://github.com/lrfluobida/Cosmos/issues/89#issuecomment-6175247486)由 Root 精确读回。

## 实际 C13 结果（2026-10-15）

C13在冻结版本`388defc543ab4445b5446be6618215a61785168c`运行26分26.253秒后failed。唯一coding attempt `eb089674-d935-4cf7-a749-b94e501aa266`为`insufficient_evidence`：请求准入被拒绝，该失败请求未发送给provider。47次已准入请求全部settled，新增¥1.641136，共享累计¥16.108937，unknown/reserved均0；coding原¥1.90剩¥0.258864。清理的`manual`文字表示单次身份已消费，本次由准入拒绝失败，没有触及45分钟截止或发生用户/Root中断。

作者只有空src、0源码文件，53次read/53个tool results/0个tool errors，write/edit/check均0；当前计划v1/v2读取调用为30/1次，不代表每次完整读取。C5 design/art仍passed，journal只有origin、候选为空；registry保留7个C5输入及3个C13计划/需求capture，无编码handoff、游戏capture或正式build/browser/review/repair/accepted，用户体验未确认。10次成功原生压缩后，末次付费响应为8192输出length；是否为可选预算摘要仍是源码及时序推断，请求kind未持久化。条件成立时原projection普通输出下限至少需294912µ，超过剩余258864µ；未取得被拒请求的精确输入字节数。

Root已一次完成closure19，释放¥0.858864；revision2965、21stopped/13delegations/105closed/19audits，旧费用与历史保持，进程及owner/locks已清理并解除main冻结。原COS16组可分配¥0.899686，C13不能重跑或延长。[COS16实际结果](https://github.com/lrfluobida/Cosmos/issues/17#issuecomment-6176958554)与[C13结果](https://github.com/lrfluobida/Cosmos/issues/89#issuecomment-6176959551)已由Root精确读回。完整时间、压缩预算推断和后续边界见[研究记录](../research/2026-10-15-transfer-c13-compaction-budget.md)；COS89最终 `b35124a8` 已经独审APPROVED并合入 `11c823a7`，源码范围待公开关闭；免费fixture不证明实际游戏改善。COS16/COS18、完整经典及human仍未完成。下文保留源码准备及集成时的历史记录。

## 前提与目标

C12 已按原截止结束，failed / coding cancelled，末次自检失败，无正式交接或候选。52 笔请求全部 admitted/settled，费用 1664926µ；closure18 已释放 1335074µ，历史为 20 stopped / 12 delegations / 100 closed grants / 18 closure audits，unknown/reserved 为 0。原组可分配 2540822µ，C12 身份已消费；详见 [C12 结果](cos86-transfer-case12.md)。

COS87 已对四个独立只读 Git 查询完成并行实现，reviewed `ac91cff85ddbdd08720623fd600161f2e61bd6b6`、merge `49e892992749e5511f2bb4135ec67be4459fa30b`；实施前已并入 main `c62499250a5e0dbcdd530d3482c99de068783814` 的最终 source-ready marker/祖先记录。C13 实际准入仍须精确 source-ready、reviewed/merge 祖先及固定来源全部通过；API 不以公开 issue 已关闭作为源码门禁。短基准不能证明实际生成提速或游戏完成。

## 固定范围与完成条件

1. 新案例固定 `cos20-transfer-validation-13`，保留所有旧声明、费用和审计来源。核对原 C12 52 笔 coding author 请求及 closure18；不重开、延长或转移 C12。
2. 新额度 2500000µ / 45min / 80 requests / 一次合格 repair；planning/design/art 各 1µ、coding 1900000µ、repair 599997µ。group 10000000µ / phase 30000000µ / shared 150000000µ 保持，真实准入重算 availableAllocation 与 quote，partial 原公式保持。
3. 独立固定声明函数只服务 C13；旧 `deriveFixedThreeYuanTransferSuccessor` 仍仅支持 ten/eleven/twelve，三个历史 3000000µ 声明不变。只追加六个 wrapper、必要固定类型/闭包入口及测试，不提供 CLI/模型预算或 case 配置。
4. C5 两 passed 阶段、七 capture 只读复用，零 planner/design/art SDK；新作者为空，禁止预置 C12 任何版本源码。新 root、任务、计划、候选、manifest、quote、operator receipt 绑定 C13，原 owner、请求/工具/时限守卫保持。
5. 追加 COS86 `TRANSFER_CASE_TWELVE_SOURCE_READY` / COS87 `PARALLEL_GIT_IDENTITY_SOURCE_READY` 与 reviewed/merge 双祖先检查；只计划批准、未集成或非祖先均拒绝准入。
6. 先独审短计划，随后 RED→GREEN 验证 52 笔历史/closure18、固定额度/available/stale quote、source capture、原 host/factory/Pi、空作者和同窗口 partial 恢复、compiled 闭包、旧 C12 短回归。实际 diff 经独立规格→质量审查，唯一 merger 集成推送后才可标 SOURCE_READY。

## 证据复用与边界

既有 SOURCE-C12 存档的 history-1/2 为 19/11/95/17，result 只有 1 笔 mock C12，不能充当真实 52 笔历史。测试从 history-1 用原 API 新增 52 笔合成记录和 closure18，保存两组费用视图；finally 恢复原 snapshot/mapping 字节、mtime、缺失目录和 owner 状态。原 C5 和 proof 保持，不重建长 seed，不读写真实台账、会话或凭据。

Root 负责最终真实免费预检、独立审查的一次性操作脚本和后续一次有界 C13。沿原 ¥150 及持续推进授权，本轮低于既有 ¥3/45min 边界，没有新的 C13 专属人工确认；任何付费前置不足即停止新增调用。作者本轮不执行新窗口或付费操作，不修改生成游戏、不访问参考安装。

实际结果另记费用、时间、自检、handoff/capture、正式 build/browser/review/repair/accepted。SOURCE、compiled synthetic transport 或短性能基准不当作实际游戏验收；COS16/COS18、完整经典及 human 保持未完成。

## 免费实现证据

实际六项有效 RED 后，C13 unit 6/6、旧 C12 短回归 5/5、SOURCE runtime 1/1、最终 compiled 1/1、最终 source capture 1/1，均 0 skip；typecheck/build/affected strict 退出 0。独立固定声明产生 2500000µ，旧 C10/C11/C12 helper 与历史 3000000µ 声明不变。原始命令、TAP、失败修正及存档路径见计划。

认证 SOURCE 通过原 API 追加两组各 52 笔 C12 合成请求和 closure18，保留 20/12/100/18、C5 两阶段七 capture，验证空作者、当前 host/factory/Pi、COS86/COS87 marker/双祖先拒绝、stale quote 及同窗口 partial 冷恢复。finally 恢复原 snapshot/mapping 字节和 mtime、owner 与缺失目录；compiled worker transport 为 synthetic。

SOURCE 结束后补充了一处遗漏的 `audits` TypeScript union 字面量 `18`。修正前运行字节与 diff 已单独保存；JavaScript emit 逐字节不变，其余八个生产 TS 字节不变。最终 strict、compiled、source capture 已重验，长 SOURCE 按此依据复用；其结果不是最终源字节的重新完整运行。独立 `cos88_reviewer` 已核实际 diff、原始输出与 SOURCE 三份 snapshot，批准该复用依据。

## 独立批准与主线集成

最终 `0ef600389fb10990fad516e85b4389aa4fecbd42` 经 `cos88_reviewer` 实际规格→质量审查APPROVED，无剩余finding；review base 为 `c62499250a5e0dbcdd530d3482c99de068783814`。唯一 `batch_c12_reference_merger` 合入 `9b8be0553c2c43b77ac0724b096d04185ab0cc5d`，17个批准路径在合并时逐字节一致，计划及COS87 reviewed/merge祖先已核对，旧C10/C11/C12声明字节保持。

主线执行计划所列affected strict，退出0；`node --experimental-strip-types --test --test-name-pattern "C13 (fixes|rejects|uses|fixed parser|unknown admission)|C12 (fixes|fixed parser)" tests/transfer/validation-case-thirteen.test.ts tests/transfer/validation-case-twelve.test.ts` 通过7/7、0skip，TAP5874.938ms，覆盖C13额度、历史、可分配容量、quote/准入及两项C12旧代表。raw为 `C:/Users/26557/AppData/Local/Temp/cos88-merge-affected-strict.log` 和 `C:/Users/26557/AppData/Local/Temp/cos88-merge-integration.tap`。作者typecheck/build、SOURCE、最终compiled及source capture按已审证据复用，未重长矩阵。

本卡已[在源码范围完成并关闭](https://github.com/lrfluobida/Cosmos/issues/89#issuecomment-6175718904)，closed(completed)及父勾选已由Root精确读回。该次最终元数据推送后main冻结供Root一次C13免费预检及有界运行；集成当时实际C13、paid、human为NONE。实际C13现已结束，closure19后Root已解除冻结，结果见上文。
