# COS146 实施计划

状态：revision_json_read_reviewer已APPROVED_PLAN、无必要修正，Root已批准固定短规格/计划的源码实施与登记；SOURCE待实际diff独审。仅选中角色的有界JSON展示，原SDK限额/raw分页/权限/预算/strict保持。

任务：[COS146 / #147](https://github.com/lrfluobida/Cosmos/issues/147)，id6092397335，原生父COS18/#19未勾；依赖[COS127 / #128](https://github.com/lrfluobida/Cosmos/issues/128)及[COS134 / #135](https://github.com/lrfluobida/Cosmos/issues/135)。作者revision_json_read_implementer，独审revision_json_read_reviewer，唯一merger planning_budget_merger。作者分支起点 `9b844186acfa2138bb2922745b88b5a4bd0cf08b`，与原runtime源码等价。

批准私有输入SHA256：spec `aa49d10c3fa75f142be6f77352edf117d4c1c4e9ee96975455556ee3da35b207`；plan `10a7d2c46ed00656a91864fc505e2ad4a5bde491aa430237f1fee1159697a53f`。

1. 独立reviewer核对固定短规格和实际SDK注入点；dedicated implementer可并行准备clean managed worktree、新codex分支及原断点RED，批准前不改production。
2. 复用已有lexical compact helper，按授权后/SDK截断前的单次调用边界实现有界Buffer展示，明确原始分页与exact-text编辑提示。
3. 通过已验证宿主revision身份选择作者；复用既有reviewer开关，不扩展其他角色。补选择/权限/局部并发/格式保真/原稿真实SDK测试。
4. 冻结SOURCE exactSHA后Root立即唤醒独审，私有原稿测试索引可并行整理；只响应实际finding，不跑旧矩阵。
5. 唯一planning_budget_merger集成批准SHA、有限主线检查、优先发布source并停写；耗时公共状态收尾可放到真实运行关闭后。
6. 原room12v2、phase40、每次5M/30min保持，旧reuse1–11永久关闭。后续真实新运行仅由Root在source/必要验证通过后启动一次，不再问同一需求或预算。
