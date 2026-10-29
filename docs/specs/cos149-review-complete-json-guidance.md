# COS149：普通设计评审优先完整JSON读取指引

状态：SOURCE范围完成。review_json_guidance_reviewer已对 `aef3b221abd9bd10886f0261846535091acb569f` 独审APPROVED_SOURCE_SCOPED、无finding，Root批准唯一merger发布 `dc1d6f61d60929f4121e0b033cfc57925d5f4421`；[批准](https://github.com/lrfluobida/Cosmos/issues/150#issuecomment-6494620746)、[关闭](https://github.com/lrfluobida/Cosmos/issues/150#issuecomment-6494621393)及父[x]已GET核证。Root原先直接批准最小实施，未追加独立plan审批。main typecheck/build0、有限4/4、0skip；16regression/strict/原稿保真证据复用。

任务：[COS149 / #150](https://github.com/lrfluobida/Cosmos/issues/150)，id6096612550，原生父COS18/#19已勾（仅SOURCE，父仍open/partial）；依赖[COS146 / #147](https://github.com/lrfluobida/Cosmos/issues/147)及[COS141 / #142](https://github.com/lrfluobida/Cosmos/issues/142)。作者review_json_guidance_implementer，独立源码reviewer review_json_guidance_reviewer，唯一merger planning_budget_merger。

[R16结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6494632627)：真实review采用5次null/null整JSON读，展示34585/680/26768/1016/30216B且均完整；5个review请求cap均16384。首份inputVersions6项经唯一COS148明确诊断纠正为5项，两份verdict均changes_requested、各9findings，文本并非逐字相同。有效独审后自动revision启动；预置137main+20reopen被作者save空scenario替换，再append59步、无reopen，6个selector鼠标点击保留pixel坐标并缺4AC，raw edit锚点失败，strict拒绝。无revision review/game，来源路径正确，不据此作工具或预算bug结论。

R16 planning2/29590µ、initial author53/551023µ、initial review5/122572µ、revision author19/367290µ，共79笔1070475µ、释放3929525µ。09:40:37.484Z→09:53:43.864Z的786380ms仅清理；09:55:11.043Z永久stop、09:55:15.347Z一次settle。独立PASS_CLOSED：child336 SHA `6d3c48710fda93a2c3ce2ff599c0b1a850b161fd52fd049cf2e55917eb569d54`；shared3397 SHA `4ff15dc32a8f2805956393f01ca176fd0fafde94533922f0f39b29e77529828b`，C30816188µ/H0。phase40/ref、room12v2、5M/30min保持；证据 `.cosmos/public-validation/room-20261029-reuse-16/{generation-closure.json,generation-execution.json}`。旧run永久closed，无新paid准备。

Root批准输入SHA256：spec `cb75e438c2cf6a6899dc0b01f16fc8c25b6cc506d36765d5b7e9164d6582be79`；plan `9b66a033057415033570f960d9000e90d7cd346adf2a49b7b448c9078e5d0e20`。

运行时代码基线479d890fdeb4ad1b379ac7e6bbfbeca7ea1da967。父COS18/#19；依赖COS146/#147(id6092397335)及COS141/#142(id6083423627)。GitHub身份与SOURCE关闭已核证；43/43仅为父任务源码子项完成。

## 依据

R15已永久PASS_CLOSED；初稿host/capture通过，review第9请求首次收尾length，output/reasoning均4848，无text、无proposal、无correction，COS148未触发。其input186062B，可用410914µ；4848报价410908，4849报价410916，所以原预算选择器正确；16384需503196，不能以改上限/放宽guard解决。
11次read全有offset/limit，计划五段连续读1–400、401–850、851–1300、1301–1750、1751–2075到EOF，没有重复或漏页。原production compactor可将同一计划58364B→37132B，完整满足原51200B/2000行展示上限；只是未选择已有分支。
证据：.cosmos/planning/review-output-reuse15/{diagnosis.md,check.mjs}。登记时共享3395/C29745713/H0，phase40、单次5M30min、总验证150M、原room12v2不变；当时没有下一paid已准备，R16后当前状态见上。

## 唯一行为改进

- 只对已有可信ordinaryDesignReviewBudget选择的普通design reviewer，给read工具增加明确且简短的优先指引（优先使用tool.description前缀；不扩成新协议/工具或metadata框架）。JSON整读不要填numeric offset/limit：若接口允许就省略；已安装SDK的实际strict provider schema把两键变为required且nullable，因此要求这些键时都用null。SDK既有normalizeOptionalNulls会将原可选null规范成未指定，从而进入已有完整JSON展示；不新增或改写该转换，不要求模型违反实际wire schema。
- 如果结果明确显示truncation/剩余行，再按工具提示分页直到所需内容完整；不能把部分前缀当完整文件。针对非JSON/目标原文仍使用原分页。指引是模型选择提示，不强制/改写模型参数，不跳读必要输入、裁剪数据、抬高上限或接受无效review。
- 建议新增指导原文<=512 UTF8 bytes，不重复长schema或游戏需求；复制工具metadata时保持参数schema、executionMode和execute原对象/语义，不修改共享SDK定义。原SDK和COS146说明保留，显式分页仍原SDK原文，默认整读仍按现有compactor+cap处理。
- 初始/修订作者（含其exact-text editing说明）、planning/art/coding、generic或fixed-validation/preparation/continuation/未选中reviewer不获新指引；选择必须复用现有可信predicate，不靠task名后缀/brief推断。
- 不改frozen task.rules/tools、execution政策版本、角色权限、budget/grant/reserve/thinking/model/caps/floor/request数、纠正次数、parser/capture/review判断。旧有效结果不重做；不修旧真实run。

## 验证与结论限制

1. RED证明当前选中reviewer缺少明确path-only-first指导；新provider实际payload出现指导，其他profile无指导且原schema/execute/mode保持。测试metadata描述和真实factory/native，不仅检查源码常量。
2. 复用C146数据保真/权限等通过证据；用原R15计划做最短真实scoped SDK读取，path-only完整返回37132B及原lexical token数据，显式1/400等窗口与SDK原行为一致。原文件UTF8/字节/hash保持，权限/参数不改。
3. 仅fakefetch原生代表：实际provider payload保持原required-nullable schema，明确synthetic模型用offset:null/limit:null作整读，真实SDK规范化后返回完整数据；显式数值窗口仍保持原文。直接path-only调用可证明本地API行为，不能谎称它满足要求两键的strict wire。不得手工转换fake参数来冒充SDK行为，不把这些当真实模型采纳或语义评审成功。无需制作假批准或完整review verdict。
4. 若报告容量收益，只作带明示假设的反事实/测量：原grant/原发送前余额固定，原数据完整；不能调低usage/grant或删除真实记录来制造通过，也不把能到16K设成必须达成的数字。新增指导自身的实际wire byte增量应可见。源码功能正确性不依赖猜测模型会省多少调用。
5. typecheck/build、聚焦短回归、独立actualdiff、唯一merger有限主线验证。无source delta的旧预算/native/会计矩阵复用；不跑整场原8读轨迹只为重证旧失败。

预计仅roles/factory.ts（必要小helper）及一份聚焦role test。provider read执行、底层compactor、strict validators和资金代码原则上不改。若要改变参数schema或强制读取行为，先报告偏离，不自行扩大。
