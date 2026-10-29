# COS146 实施计划

状态：`source-integrated / source-scoped-complete`；最终 `7dc79e19df2088cc3fb8a9eca2809a0083f3787b` 已独审APPROVED_SOURCE_SCOPED、P2闭合且无剩余finding，经Root批准发布 `3ceadde07d19d94cc89a1ff9699da4dd7dab1928`。[SOURCE完成关闭](https://github.com/lrfluobida/Cosmos/issues/147#issuecomment-6488550726)及父[x]已GET核证；main typecheck/build0、有限4/4、0skip，原23/23、host1/1、scope/cap4/4、原稿和两个P2 normal按字节等价复用。R12/R13均永久结案且未到选中reviewer/revision分支，不构成本修复的live成败证据。下列步骤保留为原批准计划。

任务：[COS146 / #147](https://github.com/lrfluobida/Cosmos/issues/147)，id6092397335，原生父COS18/#19已勾；依赖[COS127 / #128](https://github.com/lrfluobida/Cosmos/issues/128)及[COS134 / #135](https://github.com/lrfluobida/Cosmos/issues/135)。作者revision_json_read_implementer，独审revision_json_read_reviewer，唯一merger planning_budget_merger。作者分支起点 `9b844186acfa2138bb2922745b88b5a4bd0cf08b`，与原runtime源码等价。

批准私有输入SHA256：spec `aa49d10c3fa75f142be6f77352edf117d4c1c4e9ee96975455556ee3da35b207`；plan `10a7d2c46ed00656a91864fc505e2ad4a5bde491aa430237f1fee1159697a53f`。

1. 独立reviewer核对固定短规格和实际SDK注入点；dedicated implementer可并行准备clean managed worktree、新codex分支及原断点RED，批准前不改production。
2. 复用已有lexical compact helper，按授权后/SDK截断前的单次调用边界实现有界Buffer展示，明确原始分页与exact-text编辑提示。
3. 通过已验证宿主revision身份选择作者；复用既有reviewer开关，不扩展其他角色。补选择/权限/局部并发/格式保真/原稿真实SDK测试。
4. 冻结SOURCE exactSHA后Root立即唤醒独审，私有原稿测试索引可并行整理；只响应实际finding，不跑旧矩阵。
5. 唯一planning_budget_merger集成批准SHA、有限主线检查、优先发布source并停写；耗时公共状态收尾可放到真实运行关闭后。
6. 原room12v2、phase40、每次5M/30min保持，旧reuse1–11永久关闭。后续真实新运行仅由Root在source/必要验证通过后启动一次，不再问同一需求或预算。
