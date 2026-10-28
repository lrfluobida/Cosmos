# COS139：普通规划的完整需求来源与精简显示

状态：`source-integrated / source-scoped-complete`；最终 `92f6da18f423562b5fda229d30f60a0266b65d54` 经planning_context_reviewer独立APPROVED_SOURCE_SCOPED、无P1/P2及Root批准，已发布 `457c90c8e212ff2a4fe0c64584104d6eb1aa34fa`。[完成关闭](https://github.com/lrfluobida/Cosmos/issues/140#issuecomment-6472336109)、closed(completed)及父[x]已GET核证。

任务：[COS139 / #140](https://github.com/lrfluobida/Cosmos/issues/140)，id6081020291，原生父COS18/#19已勾，依赖[COS138 / #139](https://github.com/lrfluobida/Cosmos/issues/139)。作者planning_context_implementer，独审planning_context_reviewer，唯一merger planning_budget_merger。

批准私有输入SHA256：spec `1b34f947b785bf143d41ff5748fbea731674aeef4654dabfce78b38aeffc6a6e`；plan `0143f55b3754360b9809326f35f8ea8e8e981ce2ef92c5481dadf6a1fac41cd3`。

基线：d7db48d52ee5e8a0d37194607da97ace0efa51a6（源码 dbc0a623）；依赖 COS138 / #139。

源码结果：3个批准文件精确、无冲突集成；main typecheck/build0，新增4/4、0skip、TAP5974.4541ms，完整35/35、strict及native证据按源码一致性复用。原reuse5分段读取轨迹的TEMP第三请求71301B/208138µ在原cap8192/余额222875µ内发送，第三规划回复及22600µ费用明确为synthetic；原完整读取、12条验收与真实host全量绑定保持。只完成SOURCE范围，父COS18仍open/partial、33/33仅指源码子项。

[reuse-6实际结果](https://github.com/lrfluobida/Cosmos/issues/19#issuecomment-6473070452)已永久PASS_CLOSED：索引和来源提示实际生效，但完整读取原来源后又读bundle镜像，第三轮预算拒绝，未形成规划或游戏任务；原SOURCE证据未覆盖这一新读取分支。后续新真实运行尚未启动，需先通过源码、集成和预算检查；已有长期授权保持。

## 已核实的问题

reuse-5 已永久 PASS_CLOSED，不恢复、不改写或重结算。两次规划响应均为 read：第一批读取 draft前120行和confirmation，第二批继续读到draft末尾；拼接与完整36675B原draft逐字节相同，确认821B完整。尚无最终规划JSON、格式或语义纠正、开发任务。

planning 原grant250000µ，两笔20481+6644=27125µ，余额222875µ。按生产 requestInputBytes 精确重建前三输入44202/57040/84942B；固定8192输出的第三报价235420µ，比余额多12545µ。生产 reserveEntry 在原账本克隆上精确拒绝。没有普通规划既有4096 floor，不能把其他角色的下限套用。

原packet.acceptance的12条与固定draft.acceptance全字段相等，含宿主design/media条目；该全文JSON14236B，在原需求读取中又完整出现。仅将显示投影为顺序不变的ID索引555B，加388B完整来源读取提示后，反事实第三输入71333B/报价208202µ，余额裕14673µ。此为方案测量，尚非源码或native PASS。详见 `.cosmos/planning/planning-request-capacity/diagnosis.json`。

## 目标与范围

1. 仅可信普通新产品planning启用引用式显示。沿既有ordinary且非validation/preparation/human/binding/inherited分支，覆盖其普通三槽和模块化五槽；不得全局改变任意purpose=planning caller。
2. 可信host在创建planning session前复用ordinary.requireCurrent核对完整当前确认来源，并验证roleInput.requirement与已核验requirement完整相等。投影所指固定来源必须精确存在于task.inputs/requirement.sources且可读；inputFiles中的missing标记不能作为来源证明。
3. 只有已证明与固定来源完全相同的验收全文才能投影。缺来源、内容不同、增加独有项或缺精确输入引用时，启用路径拒绝，不能丢掉内容；未启用路径仍显示原全文。
4. 仅改变传给模型的packet.acceptance为按原顺序的{acceptanceId}索引，并明确其精确完整draft/confirmation来源。提示要求在最终规划前完整读取固定来源，分段须续读到末尾，涵盖brief、问答、体验要求与全部验收字段。
5. 全量requirement、TaskContract、task acceptance、host policies、inputs/inputFiles、read工具/权限、所有原文件及最后的plan校验保持。不能修改或裁剪原需求，也不把索引当作完整需求。
6. 保持8192 maxOutputTokens、16原请求上限、原grant、报价/准入/结算、thinking、JSON output、deadline与清理余量。不增预算、降输出上限、加会话/纠正/压缩或重试。
7. 这是显示优化，不新增执行policy/持久化协议、授权或已读状态框架。无plan/execution的旧运行仍不可重规划；其他作者、reviewer、默认factory、排除的caller保持原显示与行为。
8. 仍由原任务计划验证检查policy/role、ID、覆盖、依赖环、预算、来源和三/五槽职责。模型是否遵守读取指令须如实看native轨迹，不能因提供索引就宣称已读。

## 必要验收

- 免费真实factory/Pi/锁定SDK+fetch-only假SSE重放原两轮完整read轨迹，保留原两笔非零usage、全部文本和工具顺序，仅映射新TEMP绝对根；旧代码第三请求预算RED，新代码在原250000µ内以8192发出第三请求。记录生产inputBytes、HTTP body、quote、每笔settled/remaining；原来的反事实数字不能替代实测。
- 原reuse5没有最终规划回复；第三轮使用明确标注来源的同需求历史合法规划响应或合成合法fixture，走原decode/plan绑定与host校验，不称真实模型产出。第三轮使用明确非零synthetic usage，不以1token伪造可负担性。
- 完整draft/confirmation字节、12条验收全字段、其他packet字段及工具结果保持；精确ID顺序相同。正常三槽和模块化五槽各一个planning-only代表，最终任务仍含原全量acceptance；不执行游戏流水线。
- 缺失/篡改来源、传入不同requirement/独有新增条目、缺精确task input在session前拒绝；未启用、作者/reviewer及排除caller不投影。
- 保留不可负担请求仍发送前拒绝；覆盖/错误依赖等原验证挑短代表复用。typecheck/build及实际diff独审通过；不用重跑旧Edge/media和全部历史矩阵。

## 实施边界

预计生产仅entrypoint-host.ts的可信来源核验/选择和roles/factory.ts显示包构造及一句提示，辅以必要类型与测试。内部选项或回调由host设定，不接受模型自授权。不要改budget算法、SDK、planner验证规则或旧运行。独立implementer→reviewer→唯一merger；免费证据不等于真实游戏完成。
