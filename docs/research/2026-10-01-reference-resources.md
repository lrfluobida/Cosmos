# 指定 PC 参考安装的资源元数据调查

日期：2026-10-01。对应参考 ID：`pvz-pc-goty-1.2.0.1073-c04c524c6a37`。

本记录沿用已完成的只读调查，不重复读取安装或尝试游戏截图。参考目录仍为 **230 项、221 项待核实、9 项验收政策，provisional，未冻结**。本次增加来源定位，不修改 [内容目录](../../benchmarks/classic-pc/reference/catalog.json) 的条目、证据或状态。

## 1. 范围与读取方法

来源为用户指定安装 `C:\Program Files (x86)\PlantsVsZombies` 下的 `main.pak`。同目录 EXE 的 `FileVersion=1.2.0.1073`、`ProductVersion=GOTY` 已记录在 [reference.json](../../benchmarks/classic-pc/reference/reference.json)，本次没有重新计算 EXE 哈希。资源包本身的官方发行渠道、构建版本和完整性尚未证明。

先读取文件头，再核对 PAK 读取库维护者的 [reader.rs](https://raw.githubusercontent.com/nathaniel-daniel/popcap-pak-rs/master/popcap-pak/src/reader.rs) 与 [pak.rs](https://raw.githubusercontent.com/nathaniel-daniel/popcap-pak-rs/master/popcap-pak/src/pak.rs)。调查时查看的是 2026-10-01 的 `master` 页面；链接未固定提交。它们是容器格式的实现依据，不是 PopCap 官方游戏规则来源。

读取方法：以只读方式打开文件，在内存对所读字节进行 XOR `0xF7`；校验魔数与版本；顺序读取标志、文件名长度、文件名、4 字节小端长度和 **8 字节 FILETIME**，直至结束标志；按顺序累计各条目的数据偏移。维护者 README 将 FILETIME 宽度写为 4 字节，而 `reader.rs` 的 `read_records` 明确调用 `read_u64`，本次依据实现。最后检查目录长度加条目长度总和是否等于原文件长度。

只读取目录及选定文本条目；不解析编译动画内容，不读取图像/音频内容，不将资源或完整创作文本导出到磁盘，不修改安装与玩家档案。UTF-8 文本先用严格解码检查；非 UTF-8 条目停止在编码识别处。

## 2. 已观察的目录事实

所有偏移均为从 `main.pak` 开头起算的 **0-based 字节偏移**；长度为字节数。

| 字段 | 值 |
| --- | --- |
| 文件长度 | 46,055,633 |
| 磁盘前 8 字节 | `37 BD 37 4D F7 F7 F7 F7` |
| XOR 后魔数 / 格式版本 | `0xBAC04AC0` / `0` |
| 目录条目数 | 1,223 |
| 数据区起始偏移 | 55,104 |
| 目录长度 + 全部条目长度 | 46,055,633，与文件长度相等 |
| `compiled/reanim` 目录条目数 | 144 |

一级目录条目计数：`compiled` 251、`data` 45、`images` 555、`particles` 194、`properties` 7、`sounds` 171。它们是包内条目统计，不能据此计算植物、僵尸、关卡或模式数量。

编译动画目录中存在以下名称，可作为后续定位线索；未读取这些动画的数据内容：

| 包内路径（均以 `compiled/reanim/` 开头） | 目录记录偏移 |
| --- | --- |
| `PeaShooter.reanim.compiled` | 9,546 |
| `SunFlower.reanim.compiled` | 11,148 |
| `Zombie.reanim.compiled` | 12,376 |
| `Zombie_boss.reanim.compiled` | 12,663 |
| `Zombie_digger.reanim.compiled` | 13,639 |

资源文件可能是共享动画、部件、界面元素或未使用内容；名称存在不能替代角色一一对应及完整名册观察。

## 3. UTF-8 资源清单与配置

`properties/resources.xml` 通过严格 UTF-8 检查，无 BOM；目录记录偏移为 **49,082**，数据偏移为 **37,997,836**，长度 **58,937**。以下为清单中的资源组 ID，行号从解码文本第一行起算：

| 资源组 ID | 行号 | 条目内字节偏移 |
| --- | --- | --- |
| `DelayLoad_MushroomGarden` | 672 | 36,535 |
| `DelayLoad_GreenHouseGarden` | 677 | 36,718 |
| `DelayLoad_Zombiquarium` | 687 | 37,089 |
| `DelayLoad_TreeOfWisdom` | 694 | 37,358 |
| `DelayLoad_ChallengeScreen` | 703 | 37,642 |
| `DelayLoad_Almanac` | 715 | 38,243 |
| `DelayLoad_Store` | 737 | 39,512 |
| `DelayLoad_Zombatar` | 820 | 43,452 |

这些 ID 只证明对应资源组在该清单中有声明，不证明模式可进入、已解锁、规则正确或全部内容已枚举。

`properties/default.xml` 也通过严格 UTF-8 检查，带 UTF-8 BOM；目录记录偏移 **48,894**，数据偏移 **37,875,582**，长度 **6,054**。第 3 行的 `LOCALE` 值为 `Chinese_China`。这是配置事实，尚未获得实际显示语言的画面证据，因此 `installation.uiLanguage` 仍为 `null`。

`properties/Layout.xml`（584 字节，无 BOM）和 `properties/partner.xml`（391 字节，UTF-8 BOM）也通过严格 UTF-8 检查。此次不从布局或合作方配置推导玩法、发行渠道和数值。

## 4. UTF-16LE BOM 与停止边界

| 包内路径 | 目录记录偏移 | 数据偏移 | 长度 | 编码检查 |
| --- | --- | --- | --- | --- |
| `properties/LawnStrings.txt` | 48,930 | 37,881,636 | 109,726 | `FF FE` BOM，UTF-16LE；严格 UTF-8 失败 |
| `properties/ZombatarTOS.txt` | 49,120 | 38,056,773 | 6,424 | `FF FE` BOM，UTF-16LE；严格 UTF-8 失败 |

按当前 AGENTS.md 的 UTF-8 读取规则，本次没有继续解码这两个条目的文本，也没有修改或转码源数据。`LawnStrings.txt` 是后续可见名称调查的候选来源；当前没有从中读取植物、僵尸或模式名称。条目存在不证明它是完整名册，也不能用字符串表单独完成机制验收。

## 5. 已报告窗口观察与捕获失败

协调代理此前使用 computer-use 工具启动了指定 EXE，获得标题 `Plants vs. Zombies GOTY`，但两次捕获均超时。此后插件更新到 `26.928.21956`，协调代理在 **2026-10-01 约 22:43（北京时间）** 做了一次有界重测。以下来源为其已完成的工具观察报告，本批未独立重跑：

- 启动前 `list_windows` 没有目标窗口；`sky.launch_app` 启动指定 EXE 后得到唯一目标窗口 `460320`，标题为 `Plants vs. Zombies GOTY`，应用路径与指定安装一致。
- 首次截图报告 `FrameArrived timed out: timed out waiting on channel`；刷新窗口后重试报告 `window capture timed out: timed out waiting on channel`，随后停止截图。
- `include_screenshot:false` 返回的可访问树仅有窗口、标题栏、系统菜单、最小化、禁用的最大化和关闭，没有游戏内容。
- 未点击游戏内容；正常 `Alt+F4` 后，`list_windows` 确认目标窗口列表为空。没有修改安装、转码或复制素材。

本记录不包含可读的主菜单、图鉴或玩法截图。窗口创建和窗口控件不足以证明参考内容可操作或已观察完整，因此 `runtimeObserved` 保持 `false`；在没有新状态或用户反馈前不重复截图或盲操作。

## 6. 对 COS-01 的影响

新增 `LOCAL-PAK` 来源台账及上述定位，供后续观察复用。静态资源事实不填入 `normal_input` 或 `deterministic_rule` 玩法证据，也不将任何 `needs_reference` 条目升级为通过。名册、规则、关键数值、交互、解锁与存档链仍需正常输入观察和独立评审。

参考冻结仍未满足；平台开发可以继续。此次调查与文档落盘均没有付费 API 调用，没有复制原版素材。
