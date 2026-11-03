# COS168 · 保留设计作者的真实服务故障分类

COS168 的离线源码范围已完成。`provider_handoff_reviewer` 独立批准最终源码 `0e2b392df40174d5ae518bd9f36cb5c4a54182d7`，无剩余 finding。Root 授权唯一 merger 合入 `codex/gameplay-offline`。 运行时提交 `3a4f9ef292f4b0bb27bfb64a8de047cf7ff10211`。作者响应报错时，只有可信 PiSessionError 对象报告 author_output_budget 或 author_review_reserve，才进入原有预算收尾资格检查。已解析的作者提案确有 remaining 或 uncertainty 且因此被拒时，持久反馈才记录作者声明未完成。其他作者阶段异常保留真实错误分类或使用中性提示。 GitHub #169 已关闭，父 #19 保持开放，62 项子任务中 60 项已关闭。[发布及验证记录](https://github.com/lrfluobida/Cosmos/issues/169#issuecomment-6602093672)

5 个批准文件与候选逐字节一致，离线集成 typecheck、build 通过。使用真实普通 host 和 Pi SDK、本地 fake transport 的集成代表 1/1、无跳过：仅模拟发送一次，原回执为 unknown，持久 checkId 为 provider_error，故障分类为 external_service。没有收尾派发、作者提案或捕获回执。独审另核错误对象身份与探测次数 7/7，作者端到端及正反例 4/4，原有合格未发送预算拒绝的证据复用。 本次发布修复后续运行的反馈归因。R27 既有记录表明设计请求返回错误且未提供用量，不能从该记录推断当次 HTTP 状态、服务方处理结果或实际费用。历史记录保留，目标游戏与用户体验验收仍待完成。

原生父任务 COS18/#19，依赖 COS03/#4、COS11/#12 与 COS136/#137。

批准规格原稿 SHA256 为 `9bc16c6852ef5ba494ff8c1c5ba6a6e28b47cb448a7aa1fd3e4f11291a4e845d`。

基线 b2aa562abadf76db1d86349094606e58975d85a7。R27 在设计请求返回 error 且没有 usage 后退出，没有最终作者提案。其持久反馈却称作者声明了未完成项。此记录不足以确定当次实际 HTTP 状态或服务端处理。

用普通生产 host、真实 Pi SDK 与本地 fake transport 复现：SDK 以可信 provider_error 拒绝，原费用回执为 unknown；一般性预算收尾探测触发宿主准入检查，该检查在费用未核对时拒绝并替代原错误。关闭这一次无关探测的对照得到正确的 external_service 分类，发送次数与费用状态相同。

1. 只在捕获到可信 PiSessionError 且属于 author_output_budget 或 author_review_reserve 时，才进入原有预算内收尾资格检查。保留原运行权限、未发送来源、对象身份、native 证据和已有的一次槽位。
2. 其他原始错误通过原有分类留证。持久反馈只有在已解析的作者提案确实因 remaining/uncertainty 被拒时，才声称作者声明未完成；来源不明的作者阶段异常使用中性提示。保留既有 checkId 和未受影响的分类，不保存原异常正文、HTTP 报文或凭据。
3. 验证正常生产路径的模拟服务错误只有一次模拟发送，保留原 unknown 和 provider_error/external_service，无收尾派发或虚构作者回执；对比真正未完成提案、伪造同名 code 和真实有资格的未发送预算拒绝。测试和发布均限离线分支，旧 R27 记录不改写。
