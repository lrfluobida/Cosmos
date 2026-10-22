# COS-120 · 普通需求草稿的一次格式纠正

状态：设计与计划已独审批准，源码待独立审查。任务 [COS120 / #121](https://github.com/lrfluobida/Cosmos/issues/121)，父任务 [COS18 / #19](https://github.com/lrfluobida/Cosmos/issues/19)；基线 `31bbad4b8b1f6143c4722f3f78935a41e08c7fc2`。用户已授权持续开发 Cosmos，本卡属于原需求访谈与 harness 能力范围。实施、独审、合并继续分离；此文件不授权实际模型调用。

## 问题与目标

第五次小屋验证的 questions 成功，draft-1 正常 stop 并返回合法 JSON。四项 experienceCriteria 都携带仅允许用于 acceptance 的 evidenceKinds；当前 validator 正确拒绝 `Invalid ordinary experience criteria.`。reply 已缓存，而 validateGameDraft 在 request 外运行，因此 resume 只会再次返回同一无效 proposal；没有已保存草稿供 edit，也不符合 length/准入拒绝后继条件。

真实运行 `.cosmos/public-validation/room-20261022-5/run` 的 CLI 已 exit 1，未确认、未激活生成时钟。两笔 settled 共 36705µ，reserved/unknown/pending 均 0。独立 operator 已确认资源退出；原运行尚未 stop/settle，共享账本仍持有原 5M 分配。原回复和费用必须保留。COS119 的真实 planning 效果仍未验证，因为本次尚未到 planning。

目标：ordinary-design/1 的需求草稿遇到可确定的结构校验失败时，自动把原要求和诊断交回模型，仅允许一次有界纠正。新草稿仍通过同一完整校验并经真实当前版本确认，才能开始生成。覆盖普通 public CLI 与 funded validation CLI。

## 选择

- 只增加提示说明：不能处理已经返回的结构错误，也不能保证模型遵守，不能解决当前入口反复读取同一非法回复的问题。
- 主机删除多余字段：掩盖模型实际输出并改变产物，不采用。
- 采用一次确定性格式反馈：复用现有 `draft-N-successor-1` 槽、原 intake grant、原请求/费用上限与无工具 session。不是新的通用重试框架。

## 原始输出和校验边界

1. 只覆盖 ordinary-design/1 的 draft；questions、旧 scenario/preparation profile 保持原行为。
2. 先验证可信输入与来源，再用一个可复用的纯函数组装并验证 ordinary proposal。它复用原允许字段、withHostStages 和 validateGameDraft；正常返回完整 draft，结构失败返回明确的类型化诊断。初始诊断范围仅限 proposal 顶层、ordinary draft、acceptance 和 experienceCriteria 的字段形状；必要结构检查先于 withHostStages。不要捕获任意 Error/TypeError、request/IO/身份/预算等运行错误来触发纠正，host stage 重定义保持拒绝。
3. 完整 JSON 必须来自正常 stop、已结算且无未决费用的原请求。JSON 解码失败、length、provider error、unknown、停机、已确认或激活均不走本 schema 路径。length 与原准入拒绝路径保留自己的资格证明。
4. unsupported 非空的合法草稿仍展示原能力缺口，不是格式错误。合法草稿的语义遗漏也不是自动纠正触发条件；现有用户确认和独立设计评审继续负责。
5. 原 reply、native、intent、billing、问答不得修改。不得在主机内删除字段、修补 JSON 或把修补结果保存为模型产物。

## 唯一槽与持久消费

6. 继续共享 `draft-N-successor-1`，不叠加 length、denial 与 schema 机会。一次后继失败、被拒准入、截断或再次非法后都不得再派发。
7. 非 funded intake 的 beginFundingWork 没有持久事件。为普通产品入口同样保留消费事实，新增窄事件 `intake_draft_successor_claimed`，由 IntakeController 串行方法写入原 snapshot。事件只记录固定 round/slot、失败种类和核验过的 predecessor/source 绑定；不伪造 request、admission、billing，也不增额度。
8. 所有新 ordinary 后继启动，在来源核验和发布前重核后，先原子消费该槽，再发布 successor intent/创建 session。当前已有的 funded work 记录仍按原顺序保留和清理。同 round 只允许一次 claim；并发、发布失败或 reserve 前失败也消费槽。
9. claim 已存在时，只能核验并复用完整的已保存 successor 回复。缺文件、改字节、删目录、失败或不完整回复不得重新派发。普通原始 round 的首次创建分支也必须检查已有 claim，避免删除整个 round 绕过。
10. 无此事件的旧成功 successor 仍按原证据规则读取；不回填历史 claim。旧失败和永久关闭运行保持拒绝。intake 与 generation snapshot 都须校验新事件，因为 activation 原样复制历史；后续恢复、停止和结算仍可读该记录。

## schema 后继资格

11. 核对原唯一 request、reserve/admit/settle 及 billing：原 intake task、run/ledger、请求配置、normal stop、usage/金额一致，原请求已结算且没有后来请求或后继消费。复用已有 accounting 对账，不凭错误字符串或零 usage 授权。
12. 原 intent、cached reply、native assistant 解码 proposal 必须一致；native 的模型、off 配置、system/context/user、完整 brief/questions/answers/capabilities 和记录链须与原来源匹配。唯一来源文件、原 regular UTF-8 文件和现有路径约束继续适用。funded 运行额外核完整原 funding/work 来源；非 funded 使用原 request 历史和新 claim，不制造 funded 记录。
13. 核对当前失败来自同一纯 validator，并将该事实及必要来源字节绑定到 successor intent/claim。每次缓存复用前仍核原来源；发布前重读阻止检查与发布间的漂移。来源不全、歧义、配置或问答改变、已停止/确认/激活均拒绝，不先消费付费请求。
14. 保留原 ordinaryPrompt，避免破坏既有 denial 来源的完整 system 对比。纠正请求在 user 数据中添加有界诊断、原 rejected proposal、固定允许字段说明和“保留全部原要求，返回完整 proposal”的说明；完整原问答仍随原 context/input 提供。不要把 native、计费、主机身份或来源证明当作模型指令。

## 请求与发布

15. 使用新无工具 Pi session，原 deepseek-flash/off、maxRequests=1、原 maxOutputTokens/timeout/output affordability、原预算计费及请求上限。原 session 已关闭，不绕过它的请求计数。纠正输入也走原实际请求估价；钱不够即拒绝，不提 grant/总额/次数，不启动或重置生成时钟。
16. 首次遇到结构错误可以在同次 CLI 中完成原 request 清理后尝试一次纠正；已有合法来源的 cached-invalid round 可在 resume 时走同一路径。纠正结果保存到后继自己的 reply，不覆盖 predecessor，再跑完整 validator。只有通过结果才能由原 intake.saveDraft 保存正常 revision；真实 stdin 只能确认当前完整草稿。
17. 当前 room5 不预先 stop，也不直接恢复。源码经独审合入后，由独立 operator 用实际新资格检查核对原完整字节；只有满足同一生产资格才可沿原 CLI 继续。若不满足则按原 stop→close→settle 收口。旧 memory/room1–4 永久关闭，不得恢复。

## 验收

- 真实 pinned Pi SDK + fake fetch 复现原 extra-field 错误；新 ordinary funded 与普通无 funding 入口各完成“原已结算非法 reply→一次纠正→保存合法 draft”。验证完整问答、原回复保留、单后继/原预算和无工具。
- 第二次返回仍非法、length、unknown/provider error、准入不足、publish 失败、重复/并发 claim、删后继/删整个 round、来源漂移、后来请求、已确认/停止/激活均不能新增派发；缓存成功可复用且仍重核原来源。
- length/denial/schema 不连锁；既有无 claim 成功缓存兼容。claim 经 activation、generation validate、恢复与停止/结算完整保留，不改原计费。
- 合法 unsupported、合法草稿、questions、legacy/preparation、原确认与当前版确认约束保持。增加一条最短 public CLI 回归证明纠正后仍等待真实 confirm，不自动生成。
- 只跑受影响矩阵、typecheck/build/changed-test strict；复用未变证据。源码和 fake transport 不证明真实生成成功。任务最终由独立 reviewer 规格→质量审批，唯一 merger 合入并更新 issue/PROGRESS。

## 非目标

不扩展游戏能力、不写目标游戏、不降低 schema 或验收要求、不修复语义不足、不加通用多轮重试、不改变模型/价格/权限/预算、不重新访问参考 PvZ、不修改任何历史真实数据。
