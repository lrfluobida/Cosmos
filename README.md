# Cosmos

基于 pi 的 2D 游戏开发 agent。通过需求访谈、任务拆解、代码与美术生成、独立验收和有界修复，交付浏览器游戏及完整源码。

## 当前基线

- 首个完整能力目标：经典 PC《植物大战僵尸》的主要玩法与内容；原创简化美术，角色对应可辨识。
- 初始路线：Windows 命令行、pi SDK、TypeScript、Phaser、Playwright；agent 模型为 DeepSeek V4.1 Flash。
- 正式单次生成验证硬上限：**¥200 / 12h**；优化目标：**¥100 / 6h**。
- 能力验证共享总额：**¥150**。达到上限时停止新增工作，交付现状和差距；续跑由用户决定。

已接通 pi 角色编排、公开 CLI 访谈与恢复、独立交付和试玩决定，并通过有界案例及源码／临时目录验收。完整经典 PC 内容与性能基准、真实完整生成时限和最终用户体验仍需验收。

## 推箱子准备模式

安装仓库依赖与通用模板工具链后，可从公开 CLI 开始：

```powershell
npm start -- new <run-dir> --adapter sokoban --brief "中文单关鼠标推箱子"
npm start -- resume <run-dir>
```

CLI 集中提问、展示完整草稿，只有真实 stdin 的 `confirm <revision>` 才能确认当前版本。此模式固定为一个玩家、两个箱子和两个目标、最多 8×8 的封闭地图；超出范围的要求保留为 unsupported。地图、解法和验收计划由同一次正式运行中的设计作者生成。恢复沿用原账本、截止与封存绑定；同窗口的合格编码缺陷可按既有策略自动修复一次。设计与素材已独立通过、仅一个有效编码目标未完成时，可通过真实 `confirm <quoteId>` 授权首个正式 `continue` 窗口，再用 `resume --window` 恢复；该窗口只新增一次编码尝试，原 ¥200/12h 成绩与追加费用、时间和结果分列。

## 渲染帧采样

普通生成可用 `new <run-dir> --brief "点击星星获胜" --render-frames true` 启用实际帧采样。确认前会展示范围；`resume` 与首个 `continue` 恢复原选择，省略选项不会关闭已选择的采样。准备模式不能启用；帧率样本不表示完整性能政策通过。完整命令与恢复说明见 [Windows CLI 指南](docs/development/quickstart.md)。

## 文档

- [GitHub spec 与子任务](https://github.com/lrfluobida/Cosmos/issues/1)
- [产品与执行规范](docs/specs/cosmos-spec.md)
- [任务与依赖](docs/specs/cosmos-issues.md)
- [进度](PROGRESS.md)
- [领域术语](CONTEXT.md)
- [成本与时长穿刺](docs/research/2026-10-01-cost-latency-challenge.md)
- [31 次真实模型调用与局部测试](probes/2026-10-01-deepseek/README.md)

API 凭据通过运行环境提供。运行探针会产生服务费用，使用量计入验证总额。
