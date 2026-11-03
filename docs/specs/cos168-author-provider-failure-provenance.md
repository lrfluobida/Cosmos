# COS168 · 保留设计作者的真实服务故障分类

[COS168 / #169](https://github.com/lrfluobida/Cosmos/issues/169) 已登记。`provider_handoff_reviewer` 独立核对规格并批准 `provider_handoff_implementer` 的最终源码 `0e2b392df40174d5ae518bd9f36cb5c4a54182d7`，Root 已放行离线集成。设计作者的可信服务错误现在应按原分类留证。R27 设计请求返回错误、缺少用量，未形成最终作者提案，持久反馈却称作者声明了未完成项。旧记录不足以确定实际 HTTP 状态或服务方处理结果。

仅可信 PiSessionError 的 author_output_budget 或 author_review_reserve 进入既有预算收尾资格检查。其余原始异常经既有分类留证。只有已解析提案因 remaining 或 uncertainty 被拒，反馈才归因于作者声明。其他作者阶段异常使用中性提示。保留原 checkId、请求次数及未知回执，避免保存原异常或请求正文。 父任务为 [COS18 / #19](https://github.com/lrfluobida/Cosmos/issues/19)。直接依赖 [COS03 / #4](https://github.com/lrfluobida/Cosmos/issues/4) 的 Pi provider 适配、[COS11 / #12](https://github.com/lrfluobida/Cosmos/issues/12) 的受约束修复反馈，以及 [COS136 / #137](https://github.com/lrfluobida/Cosmos/issues/137) 的作者预算收尾。

批准规格原稿 SHA256 为 `9bc16c6852ef5ba494ff8c1c5ba6a6e28b47cb448a7aa1fd3e4f11291a4e845d`。

基线 b2aa562abadf76db1d86349094606e58975d85a7。R27 在设计请求返回 error 且没有 usage 后退出，没有最终作者提案。其持久反馈却称作者声明了未完成项。此记录不足以确定当次实际 HTTP 状态或服务端处理。

用普通生产 host、真实 Pi SDK 与本地 fake transport 复现：SDK 以可信 provider_error 拒绝，原费用回执为 unknown；一般性预算收尾探测触发宿主准入检查，该检查在费用未核对时拒绝并替代原错误。关闭这一次无关探测的对照得到正确的 external_service 分类，发送次数与费用状态相同。

1. 只在捕获到可信 PiSessionError 且属于 author_output_budget 或 author_review_reserve 时，才进入原有预算内收尾资格检查。保留原运行权限、未发送来源、对象身份、native 证据和已有的一次槽位。
2. 其他原始错误通过原有分类留证。持久反馈只有在已解析的作者提案确实因 remaining/uncertainty 被拒时，才声称作者声明未完成；来源不明的作者阶段异常使用中性提示。保留既有 checkId 和未受影响的分类，不保存原异常正文、HTTP 报文或凭据。
3. 验证正常生产路径的模拟服务错误只有一次模拟发送，保留原 unknown 和 provider_error/external_service，无收尾派发或虚构作者回执；对比真正未完成提案、伪造同名 code 和真实有资格的未发送预算拒绝。测试和发布均限离线分支，旧 R27 记录不改写。
