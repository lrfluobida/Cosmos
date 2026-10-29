# COS144：新需求复用运行的规划分配

状态：`source-integrated / source-scoped-complete`；最终 `92339a0f6fbf2312b9e1231b4e3204a642262786` 经planning_context_reviewer独立APPROVED_SOURCE_SCOPED、无finding及Root批准，已发布 `d97b0a69da6194df3c64a0aa0a05095acacd4a14`。[SOURCE完成关闭](https://github.com/lrfluobida/Cosmos/issues/145#issuecomment-6486246285)、closed(completed)及父[x]已GET核证。phase40原决定有效，总额与阶段额度不变；reuse10实际规划通过但初始设计不完整，已永久结案。

任务：[COS144 / #145](https://github.com/lrfluobida/Cosmos/issues/145)，id6091042587，原生父COS18/#19已勾；依赖[COS129 / #130](https://github.com/lrfluobida/Cosmos/issues/130)及[COS143 / #144](https://github.com/lrfluobida/Cosmos/issues/144)。作者planning_context_implementer，独审planning_context_reviewer，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `86907c5fb4b23e5fc18b319426f58ee88d77f36602aee25ee08e4c02786b4337`；plan `18b20cb7cda7e5faf35b01b3339a3162d00f36ba484191d07da5f476056bbd0d`。

源码基线：02882711225d466660806aa0c59bf81d6457de31（runtime20fa9dae）；依赖COS129/#130与COS143/#144。

SOURCE结果：6个批准文件精确、无冲突集成；main typecheck/build0，有限代表4/4、0skip、TAP7605.0748ms。作者8/8、旧21/21、带费用结算1/1、strict及native按11生产文件指纹复用。新TEMP原R9完整responses/4read/两笔费用保持，0/500000实际初始化后第三110444B/8192/286424µ可由465935µ承担；明确synthetic最终规划及全8文件分支经严格plan/host绑定通过，不称真实模型成功。旧无marker、funded/unfunded恢复及本地settle隔离保持。

[reuse10实际结案](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6486301047)：新0/500k分配实际生效，规划3请求64138µ通过；design作者27请求563763µ，初始验收计划fixed-schema/roster校验失败，review未启动，无revision/game。30笔627901µ、释放4372099µ，child132/shared3385、累计26046010µ/H0，phase40/ref不变；333510ms仅清理时间。最早原因另行独立诊断，本记录不推断根因。父COS18仍open/partial，38/38仅指源码子项。

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
