# Cosmos

基于 pi 的 2D 游戏开发 agent。通过需求访谈、任务拆解、代码与美术生成、独立验收和有界修复，交付浏览器游戏及完整源码。

## 当前基线

- 首个完整能力目标：经典 PC《植物大战僵尸》的主要玩法与内容；原创简化美术，角色对应可辨识。
- 初始路线：Windows 命令行、pi SDK、TypeScript、Phaser、Playwright；agent 模型为 DeepSeek V4.1 Flash。
- 正式单次生成验证硬上限：**¥200 / 12h**；优化目标：**¥100 / 6h**。
- 能力验证共享总额：**¥150**。达到上限时停止新增工作，交付现状和差距；续跑由用户决定。

当前仓库包含规范、任务拆分与局部模型探针。完整 Cosmos、pi 集成和完整游戏仍需实施与验收。

## 文档

- [产品与执行规范](docs/specs/cosmos-spec.md)
- [17 项任务与依赖](docs/specs/cosmos-issues.md)
- [进度](PROGRESS.md)
- [领域术语](CONTEXT.md)
- [成本与时长穿刺](docs/research/2026-10-01-cost-latency-challenge.md)
- [31 次真实模型调用与局部测试](probes/2026-10-01-deepseek/README.md)

API 凭据通过运行环境提供。运行探针会产生服务费用，使用量计入验证总额。
