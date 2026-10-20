# COS110 截断需求草稿的有界恢复计划与契约

**任务：** [COS110 / #111](https://github.com/lrfluobida/Cosmos/issues/111)，父 COS18/#19；基线 `5ae8e01d773f42b681db7ab4c997c48187d7fcfd`。Root 已批准本范围直接实施，无须重复产品确认。专职作者 `agent_product_flow_assessment`，独审 `public_run_limits_reviewer`，唯一 merger `public_agent_batch_merger`。

## 根因与最小行为

真实普通 intake 的问题成功、答案保存后，draft 以 `length` 结束；output 与 reasoning 均为8192，没有可用草稿。两笔费用已结算82,311µ，原intake分配剩167,689µ。原SDK输入投影13,508 bytes下，16,384输出token需预留158,088µ；原运行无草稿确认或正式生成时钟。只读诊断已足够，不复现付费调用。

1. 生产普通 draft 上限为16,384；questions仍4096，准备模式draft仍8192。模型、thinking、问题策略和输入契约不变。
2. 原round有完整reply时沿现有缓存复用。只有普通draft的原intent与当前输入相同、无reply、唯一原账单且原请求已settled、`stopReason=length`时，才允许后继。
3. 先要求原请求属于同run/ledger/intake task、无unknown/reserved，并用 `reconcileRoleReceipt` 的 `already_closed` 结果核原身份、价格、费用和账单引用。其它终态、缺账单、多账单或漂移均拒绝，不新增未知费用处理路径。
4. 后继固定为同级 `intake-sessions/<round>-successor-1/`，含自己的intent/native/billing/reply。其intent保留同一原始输入，并附原round、requestId、账单引用与原账单内容；关联数据不进入系统提示、模型context或用户消息。同级位置复用既有 `reconcileEntryReceipts` 的访谈目录发现范围；初稿嵌套位置在“账单已落盘、结算中断”用例中RED，因此按实证改为同级，不改原对账框架。
5. 后继成功缓存重复读取不发请求；已有后继intent但无reply时拒绝，不创建第二后继。原intent、native、账单及答案不覆盖。输入或原账单漂移也不能复用后继。
   原round缺intent时，若该round已有文件或同级后继存在，也必须在mkdir及发布intent之前拒绝；来源丢失不能被当作新访谈。
6. 后继仍为原intake的一次正常请求：原grant、8请求总限额、真实序列化预留、COS109拨款门禁及清理记录保持。费用不足或funding不可派发时transport为0，不挪用planning额度。
7. 当前CLI的`resume`读取原questions和answers后进入上述选择；完整草稿仍须真实stdin确认才能激活原时钟。实际原运行恢复由Root在源码独审集成后另行执行。

## 文件与步骤

| 文件 | 改动 |
| --- | --- |
| `src/roles/interview.ts` | 原缓存分支接入一次后继，模型input保持；沿原会话/计费调用 |
| `src/roles/interview-recovery.ts` | 小型可信核验与后继来源绑定，复用既有receipt核验 |
| `src/runtime/entrypoint-host.ts` | 普通draft16K，准备draft8K，questions4K |
| `tests/roles/interview-recovery.test.ts` | TEMP与受控SDK的截断、账单、后继、预算及输入边界 |
| `tests/roles/interview-recovery.fixture.ts` | 共享的受控SDK流与真实计费hook夹具 |
| `tests/cli/intake-truncation.test.ts` | 已保存问题/答案经公开resume进入后继，确认与funding保持 |
| `docs/development/quickstart.md` | 简述已结算截断可有一次后继及其边界 |
| `PROGRESS.md`、`docs/specs/cosmos-issues.md`、`docs/specs/github-issues.json` | 仅登记本卡进展与实际范围 |

- [ ] 先RED：受控真实SDK返回8192 reasoning、`length`并结算；第二次读取同round目前拒绝，预期同输入进入唯一后继。另断言真实product host普通draft上限16384。
- [ ] 最小实现：只为满足上列核验的普通draft选择独立后继；正常成功缓存、questions及准备模式保持。
- [ ] 正负测试：后继成功复用；第二次截断/unknown拒绝第三请求；输入、账单身份、费用、原引用、终态、多/缺回执漂移拒绝；真实预算拒绝transport，原状态和旧文件保留。
- [ ] 公共代表：原questions/answers经resume复用，完整新草稿显示后仍由stdin确认；未确认无正式时钟；funding gate拒绝不可派发的原绑定。
- [ ] 定向回归：`node --experimental-strip-types --test tests/roles/interview.test.ts tests/roles/interview-recovery.test.ts tests/roles/preparation-draft.test.ts tests/cli/intake-truncation.test.ts tests/cli/session.test.ts`。COS109必要代表只覆盖受影响的原拨款/访谈调用，不重跑旧case/browser矩阵。
- [ ] `npm run typecheck`、`npm run build`、UTF-8/中文复读及`git diff --check`。保留真实RED/GREEN原输出，固定作者SHA交独审，只有指定merger集成推送。

所有新测试只使用TEMP和受控SDK；禁止修改真实run/shared ledger、读取真实key、发provider网络请求或启动浏览器。提高输出上限不保证实际后继成功，源码通过不代表游戏生成完成。

## 作者结果（待独审）

核心两项先RED，最小实现后2/2通过。后继intent丢失但已有失败文件的独立RED促成拒绝；“账单已落盘、settle中断”RED促成同级目录，复用既有对账器而不扩展它。首轮边界12/14保留：准备夹具误传选择对象而非模式字串，funding拒绝发生在预算准入并由provider适配器包装，已仅校正两项夹具。

最终五文件定向组合40/40、0skip、exit0、43.041秒，涵盖15项新增用例与原访谈/准备/公开session；`npm run typecheck`及`npm run build`均exit0。原问题、答案、native、账单和先前费用保持，后继关联未进入模型消息；实际SDK传输由fetch mock截获，成功确认后执行host为stub，未启动真实provider或浏览器。原输出索引：作者工作树 `.cosmos/cos110/verification-index.json`。

初审 `41e4a8f` 的唯一P2已由作者修复、待affected复审：原intent丢失绕过后继门禁。新增两个用例先RED，分别删除原intent及原round目录、保留失败后继，随后验证拒绝且transport仍为2、snapshot和保留文件不变；新建与缓存代表合计affected9/9、0skip，typecheck/build0。原40/40未重复运行，不与9项重叠证据相加。
