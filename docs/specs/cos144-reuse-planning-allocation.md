# COS144：新需求复用运行的规划分配

状态：Root与独立planning_context_reviewer已批准方向B及固定短规格/计划，仅免费SOURCE实施；SOURCE待实际diff独审。已有phase40预算决定保持有效，新实际运行尚未启动、待源码与资金readiness，不增加总额或阶段额度。

任务：[COS144 / #145](https://github.com/lrfluobida/Cosmos/issues/145)，id6091042587，原生父COS18/#19未勾；依赖[COS129 / #130](https://github.com/lrfluobida/Cosmos/issues/130)及[COS143 / #144](https://github.com/lrfluobida/Cosmos/issues/144)。作者planning_context_implementer，独审planning_context_reviewer，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `86907c5fb4b23e5fc18b319426f58ee88d77f36602aee25ee08e4c02786b4337`；plan `18b20cb7cda7e5faf35b01b3339a3162d00f36ba484191d07da5f476056bbd0d`。

源码基线：02882711225d466660806aa0c59bf81d6457de31（runtime20fa9dae）；依赖COS129/#130与COS143/#144。

## 依据

reuse9已永久PASS_CLOSED。模型完整读取primary draft/confirmation，再读完整capture镜像；两笔实际费用14368+19697=34065µ。原planning grant250000，余额215935。第三input110463B，4096 floor报价253694，差37759；纯输入预留220926也已超余额。没有最终plan/schema错误，COS140已正确拒绝整个输出区间。

确认复用模式禁止访谈请求，但新运行仍保留intake250000与planning250000。仅新reuse把前者的初始份额用于planning后，grant500000，保留原两笔用量时第三8192报价286462<=465935，余179473。总5M、初始base500000、后续4.5M池均不变。此为纯容量测量，尚非native或真实成功。诊断 `.cosmos/planning/design-author-request-capacity-64/reuse9-planning-diagnosis.json`。

## 新选择

- 仅新的confirmed requirements reuse初始化选择：intake=0，planning=2*floor(L/20)。保留两个allocation行。
- 采用一项窄的固定值可选origin标记；由可信source模式写入，不给模型或自由CLI文本自设额度。
- 既有origin无标记继续旧floor(L/20)+floor(L/20)。new--brief、普通访谈、preparation/fixed validation保持原分配。
- 不用floor(L/10)，它在部分余数下会多1µ。L<20µ时沿无标记legacy等价0/0，不补最小额度；只有share>0的新reuse写标记。
- 不改总run/共享150/已批准阶段40/单次5与30min，不改下游pool、模型、planning16/8192及动态4096 floor，不变更确认内容或旧费用。

## 持久化与兼容

1. origin构造、初始化恢复及ledger创建共用一项选择和公式。新marker先于新snapshot持久；旧缺省解释始终明确。
2. funded origin-only也须读既有origin选择，不能每次按新默认重建并与writeOnce冲突；unfunded原三种中断点照旧处理。
3. origin-only且无snapshot/独立seal时，缺标记按legacy。仅凭该文件无法证明标记曾被删，不能宣称能检测；不为此增加新seal框架。已有funded origin hash等独立绑定继续验证。
4. 已有snapshot时精确核对intake/planning两基础行与origin策略、原limits；激活后可追加其他allocation，但这两行不得改变。删/改marker导致不符、丢origin或unknown/null/错误类型拒绝；source模式不符也拒绝。
5. 已有snapshot/profile等初始化痕迹但无origin时拒绝，不能凭新默认补造。已绑定草稿丢文件不重建；同一来源/身份/原文件字节与原恢复门禁保持。
6. 使用一个窄纯校验贯穿session、公共limits/来源读回及funding gate，不复制各套公式。Funding dispatch:false/settle只核本地origin/来源描述符/ledger，不新增读取旧原source live字节的要求；原会计隔离保持。
7. 读取旧human-confirmed来源保持旧解释，不要求旧源升级marker。无需升级confirmed-requirements-source/1、public authorization v1/v2、binding或BudgetLedger版本；不修改activateGeneration复制和planner读现有grant算法。
8. 已停止/过期/失败运行不会获得额外规划；全部已闭账run永不恢复、改写或重结。

## 必要验证

- 新reuse与--brief对照，两个allocation行/合计/下游池不变；普通访谈、preparation和fixed validation保持。覆盖余数10–19及极小金额0/0等价边界。
- funded/unfunded origin-only、snapshot-before-copy、绑定中断、激活后恢复；旧无marker identity/allocations/文件字节保持；有独立绑定时继续拒绝篡改。
- marker非法/模式不符/与allocation不匹配/origin缺失均在新dispatch前拒绝。旧source只读不升级。
- funding v1 brief、旧v2 reuse、新v2 reuse及readiness/settle代表；模拟原source不能再支持新执行时，仍能按原会计证据结算既有费用。
- 新TEMP真实public初始化产生planning500000；真实factory/Pi/SDK仅fetch假SSE，原R9两responses、4个完整read及14368+19697费用固定重放。旧250k机械RED，新500k第三8192可准入；输出caps/HTTP/billing/实际quote逐轮记录。
- R9没有最终planningJSON；第三合法回复必须明确synthetic（或同需求历史合法规划数据），以非零synthetic usage走严格plan/host绑定，不称真实模型成功。
- 再做一条明确synthetic读取分支，完整覆盖planning可读8文件(primary2+mirror2+template4)，同500k下测实际容量及严格host绑定。保留全部文件/权限/内容，不删镜像或重写原读取来造通过。
- typecheck/build/受影响短回归，独立实际diff审查，唯一merger有限集成。旧有效证据复用，不跑旧全矩阵；真实phase/ledger不用于源码测试。

## 预计范围

session.ts的origin/初始化/创建，run-limits与readReferencedRequirements公共读回，funding本地gate，以及窄共享helper/types和定向测试。保持原资金算法/需求/后续角色池，不改阶段API或旧数据。
