# 真实迁移 C6：流式编码请求绝对时限与未决费用

## 实际结果

- frozen source：6b8aa15f5d029b313f82fdf98c5ae4b847a5f461；window：validation-vq2-3a9bea268f435090933cb090d39f7a09aa1879b29ab1c21c45642db5d6a11585。UTC02:50:02.916开始，原deadline03:35:02.916；03:01:25.805结束，elapsed682889ms。manual停止、身份已消费；不重开或续发。
- 实际复用清单：cos20-transfer-validation-6-reuse.json，rawSHA4acd4d03a924a882a96a1fca90aa1f9b5509824654d108c94184f04fb27e9b50、52160bytes、原2passed与7capture来源，48source批准freshpreflight通过、ledger原bytes/mtime不变。
- 13个admitted请求均current coding author；planner/design/art零SDK。20个成功read，toolerrors0，write/edit/check-game-build0；coding external_service.failed，无capture/build/browser/review/repair/accepted，human NONE。
- 原Nodeexit1、父PSexit0、credentialClearedTrue；四controller/registry与recovery锁不存在，源码freeze在停止/凭据/owners核对后解除，支付门禁仍阻塞。

## 原始时限证据与源定位

最后request362645f2-c865-47a0-99e8-e16bfdf50316，UTC02:59:21.768准入，firstResponse352.2225ms、elapsed120005.8155ms、responseModeldeepseek-flash/outcomeunknown/stopReasonaborted，无provider usage。pi最后error为Provider stream exceeded requestTimeoutMs，usage0是SDK默认字段，不是免费凭据。

只读定位：src/providers/pi.ts161在dispatch前启动绝对timer，事件进展不重置，同值传SDKtimeoutMs167；entrypoint-host.ts518全部角色120000ms，coding/art允许65536output；factory.ts149没有作者role timeout override。既有caller/controller stop与authority仍有效，provider-budget无usage保留unknown。不能把此失败归为已验证code defect，也不能伪造未观察到的model输出或费用。

## 账本状态

12笔已按provider usage结算135531 micro-CNY；最后一笔974882 micro-CNY unknown reservation保持。共享settled8666261/reserved974882/committed9641143，revision1942，14stopped/6delegations/65closed/11audits；closure12未执行。COS16 current group committed2632520、allocated10000000、remaining7367480；旧C1–5费用及原parent/firstauth保持。Root异步请求用户提供仅该笔后台费用/usage；没有APIkey文件或新paid。

官方说明以API usage为用量依据：[Token用量](https://api-docs.deepseek.com/zh-cn/quick_start/token_usage/)，流式最后chunk承载usage：[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)。只读余额不能替代该请求明细；未决费用不解为0，不改billingreceipt或ledger。

## 完整性与后续

resultSHA18d707be19462e999546b212aab34408368dfa1c6370469ed7700204ad4cf72c；unknownbillingSHAc2e768c6450723a0a6954729f8de4c283a07da50d1541d7fc9f7084ac8edfd25；snapshot1942SHAa9d0aa4c7813ef36bd570ded375a8f0dc5a5463b09e67507492d7f256bde4d5a；原case文件不改。

[COS59/#60](https://github.com/lrfluobida/Cosmos/issues/60)仅修可信coding author长响应时限、裁剪原deadline清理余量，其他role/intake与billing/重试策略保持；CODE SOURCE_NOT_READY。COS58public human接线已独审集成：`6137cd77940953ab795f2b427e759625330a602d`→`1d300b3e31959911fa95bb3cf5639dcd3d8c2db9`，PUBLIC_HUMAN_PREPARATION_SOURCE_READY；实际human NONE。原150/首30/group10、case5/45min/80/一次repair、formal200/12h/target1006、完整经典未冻结保持。
