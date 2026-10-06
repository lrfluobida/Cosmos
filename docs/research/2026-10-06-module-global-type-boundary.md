# 编码模块的脚本级全局类型影响

日期：2026-10-06。状态：实际 compiler/caller 反例已复现；修复尚未实施。对应 [COS73 / #74](https://github.com/lrfluobida/Cosmos/issues/74)。

## 实验与因果对照

来源固定为 COS72 f8bfecc694708ad85503bd0fca26e9114c06b1ee。只运行一个 TEMP 案例，复用实际 product host、原 owned TypeScript workers、ABI 检查、captures 与最终 tsc；provider、运行时审查为 fixture，没有真实模型、browser 或费用。

1. A 与 B 的局部真实 tsc 均 code0，ABI 分别包含 advance、label；运行时独审回复为 synthetic approved。
2. 最终实际 tsc 为 code2：两条 TS2322 都在 src/modules/a/index.ts(2,56)/(2,91)。
3. B 的 src/modules/b/global-types.ts 是脚本级 interface Window { cosmosBoundaryType: string }。它合并到全局 Window，改变 A 的条件类型，使完整编译失败。
4. 只在独立 TEMP 组装副本移除 B 的该 helper，同一 pinned tsc 为 code0；A 字节未改，原 A/B captures 的 SHA 与 mtime 全部未改。

A capture signature：861363e4e8dd6461e6de7856eb5de10190a6f40fc5df04946691b02bbff2d9c6。

B capture signature：ff25706397b5f8748143fb1b609b9c37d93875190f28c12a703172b0571b072a。

原 pipeline：C:/Users/26557/AppData/Local/Temp/cos71-host-q9Guxm。完整原 worker/results/review/refs/diagnostics 与对照存于 cos73-module-boundary-evidence.json，脚本为 cos73-module-boundary-experiment.mts，均在同一 TEMP 目录。没有候选接受，TEMP ledger entries0。临时对照副本已清理；原失败证据保留。

## 根因与最小修复范围

当前 validateModuleFiles 已拒绝显式 ModuleDeclaration、d.ts、外部引用/导入和编译抑制；没有检查普通 helper 是否为模块。[TypeScript 官方说明](https://www.typescriptlang.org/docs/handbook/2/modules.html)指出脚本声明进入共享全局范围，import/export 可使文件使用模块作用域。

下一修复应验证每个实际源码文件的模块作用域，作用到原作者自检、捕获/局部批准、当前输入与最终组合。合法局部 helper 仍允许；export {} 不代替 index 的实际 callable 导出和 ABI 检查。不能通过改 tsconfig 或自动修改作者代码掩盖失败。

本反例也证明：全部诊断位于 A，仍不能授权返工 A。普通输入失败和 passed 模块的 owner 归属需额外因果证据，本次不增加该框架。

## 边界

参考目录、原安装、预算和 C6 未决费用未变。仅证明当前模块检查的缺口；不是实际模型生成或完整经典100%/95%验收。修复须独立计划、TDD、源码规格/质量审查和 sole merger 集成；现状态 SOURCE_NOT_READY。
