# COS93 navigation-v1：诊断完成，导航失败

在已审源码 `e2358cd59a6313e049605cd652912d326745d414` 上实际执行一次免费诊断：UTC 2026-10-15 17:07:08.387—17:22:59.442，本地10月16日01:07—01:22，共951026ms。Node exit0、TAP1/1只表示完整落盘；`cos93-native-startup-diagnostic/2` 为 diagnostic_completed，`native-validation-waits/1` 的 navigation 为 failed，首因 `Diagnostic game engine is not ready`。launcher已消费，45分钟外guard未触发、未请求外层kill；浏览器随后进入forced清理，二者分开记录。[公开实际结果及后核](https://github.com/lrfluobida/Cosmos/issues/94#issuecomment-6198276862)由Root发布并精确读回。

原C14生成源码仍为 `b20e9a43f26712a1f5a13468057df46b6c012b69`。本次只用封存候选构成新TEMP诊断，没有运行时作者生成、provider请求或新增费用；旧C14 failed/consumed和旧whole-open15失败保持。只进入首段，21步全部skipped，原8段/220步不变；没有planned stop、finishNavigation成功、玩法、完整媒体、coding批准、accepted或human通过。

## 实测阶段

| 阶段 | 实测ms | 结论 |
| --- | ---: | --- |
| prepare_authority | 24575.6104 | passed |
| register_authority | 26057.0091 | passed |
| browser_transport | 59.6950 | passed，真实PID/CDP/profile已记录 |
| whole open | 50719.3786 | returned；旧15000ms超界 |
| page.goto(load) | 192051.1234 | returned |
| diagnostic.ready | 175.8436 | 单次检查后立即抛错，未耗尽3000ms |
| navigation | 192228.9083 | failed；旧15000ms超界，未达到新300000ms上限 |

HTTP为8 started/8 settled/6 rejected/0 pending。pre阶段count8、total97914.3390ms、max49618.0947ms；body count2、total59.0827ms、max48.5759ms；post count2、total94898.8338ms、max47643.2195ms。HTTP合计含重叠，不能当总墙钟；没有已记录的body或post超时。25846 raw reads全部settled。Observer为4337 spans/5580 events，0 dropped、incomplete=false。

## 已证实的直接失败与后续404

冻结fixture的 `readNavigationDiagnosticReady`（158—180行）检查按钮、动态board/player cell后，只调用一次 `observeDebugScalars` 读取player id、idle name和seen；任一不符合就立即抛错。外层 `runNavigationDiagnosticReady`（184—203行）只给这个单次调用设3000ms上界，并未轮询。trace #3159 的goto已返回；#4216的ready在175.8436ms内抛 `Diagnostic game engine is not ready`，故本次直接失败是单次就绪谓词不满足后立即拒绝，不是3秒等待超时；没有取得3秒内状态是否会转为ready的证据。

时序均来自本次原始证据：

| UTC时间 | 证据 |
| --- | --- |
| 17:22:35.133 | browser.log记录Phaser v3.90.0启动 |
| 17:22:35.648附近 | trace #3159 page.goto返回，随后开始ready |
| 17:22:35.828 | native navigation结束，首因是ready错误 |
| 17:22:35.829附近 | trace #4208—4221的在途source/identity及controller排队以同一ready错误拒绝 |
| 17:22:35.864 | 首条console 404；首个player idle资源loaderror在35.867 |
| 17:22:35.950 | 最后一条资源loaderror |

原游戏 `BootScene.preload` 异步加载SVG/WAV，`BootScene.create` 在loader完成后转入GameScene；GameScene.create才实际播放player idle。document load与该异步资源完成不是同一终点。最终截图保留菜单、动态棋盘、进行中/0步和缺失纹理框；不能据此声明idle ready或素材通过。ready三元组的实际值没有落盘：仅知道至少一项不符合；静态产物顺序支持seen尚未成立的解释，但不把该推断写成已记录采样值。

SOURCE97在首因生效后撤销segment，`runRequest`只允许navigating/input；origin在失败出口统一返回no-store 404。6个已进入pre的请求未进入body，随后其他请求也可在关闭门禁处拒绝。27条404均晚于ready首因，符合取消后的404链；不能用它们倒推原文件缺失、原payload不匹配或HTTP自身先超时。

## 资源路径与证据缺口

browser.log有27个具体loaderror键。按封存 `src/media.ts` 的 `./assets/<dir>/<file>`／`./assets/audio/<file>` 映射及manifest，可还原以下21个SVG和6个WAV路径。所有文件均实际存在于封存候选dist，且在delivery-check的packageFiles（clean fixed文件集）中；origin按同一pathname转发，payload checker查 `dist/<name>`。

| URL前缀 | loaderror对应文件 |
| --- | --- |
| `/assets/player/` | idle-000.svg、walk-000.svg、walk-001.svg、push-000.svg、blocked-000.svg、blocked-001.svg |
| `/assets/box/` | idle-000.svg、pushed-000.svg、on-target-000.svg、on-target-001.svg |
| `/assets/target/` | empty-000.svg、filled-000.svg、filled-001.svg |
| `/assets/wall/` | solid-000.svg |
| `/assets/floor-grid/` | plain-000.svg |
| `/assets/victory-banner/` | hidden-000.svg、shown-000.svg、shown-001.svg |
| `/assets/save-indicator/` | saving-000.svg、saving-001.svg、saved-000.svg |
| `/assets/audio/` | move-step.wav、push-box.wav、blocked-input.wav、restart-reset.wav、continue-restore.wav、victory-fanfare.wav |

已完成的两个body与文档及其唯一模块脚本 `/assets/index-BF96AQ82.js` 相符；这是由页面结构、Phaser启动和count2推断的对应关系。trace未记录每HTTP的URL、request id或响应status，browser.log的console 404也不含location，未保存HAR。因此不能逐个指认8个已登记请求的路径，尤其不能认定6个被取消的pre恰为前6个SVG；浏览器并发6也不是本次证据。本次仅两个body/post完成，未取得任一动态资源实际payload比较的证据。delivery-check的bytesMatched=false是成功出口未到达，不是字节漂移证明。

不能只将ready改单读为3秒poll就保证通过：文档/脚本已消耗192.051秒，pre最大49.618秒、post最大47.643秒；新navigation剩约107.771秒，但27个异步资源的完整guard成本和并发竞争未测得，无法保证300秒覆盖。该容量问题与已证实的立即拒绝缺陷分别记录，不自动增加预算或跳fresh检查。

## 清理、保全与费用

视频收集 `Persistent video collection` 在1000ms超时；runner先执行screencast.stop，失败后跳过正常lifecycle.close并进入forced分支，故trace没有lifecycle.close span。浏览器PID29396、CDP PID/profile匹配、closeEvent/exitConfirmed=true，但forced=true、exitCode1，正常浏览器关闭未证明。trace记录ffmpeg PID31072于monotonic734937.845ms启动，937495.3372ms以code0退出，约晚于ready错误10.322秒且晚于series结束；这只证明1秒等待先超时、编码器稍后正常退出，具体编码慢因未查明。这是ready失败之后的独立清理失败。

外层closePreparation、OwnedWork drain、controller stop/close返回，raw pending0、记录进程均close、三个端口关闭。独立reviewer于UTC17:30:35完成 `POSTCHECK_NO_LIVE_RESIDUE`：原467文件/61目录SHA、大小、纳秒mtime及目录清单零变；2775条tracked spawn均有close，8个当前同号PID为结束后新建复用；相关PID/端口/owner/recovery/Git锁无残留，profile及.owner保留。Root据此解冻main，后核不追认正常浏览器退出。

真实ledger SHA为 `e8a921e618da619eacdd439c3260d2edcc10f48edcb823fd716274531cd85632`，16635066B，revision3114/715请求/16901000µ、reserved/unknown0；新增provider请求0、费用0。验证总额¥150含prior¥0.721771、正式¥200/12h、优化¥100/6h保持。

## 原始证据与最小后续

原始根为 `C:/Users/26557/AppData/Local/Temp/cos93-native-startup-navigation-JBTyHx`，保留result.json、trace.json、progress.ndjson、protected-before及preservation和TEMP repository。首段报告、browser.log、final.png位于 `repository/.cosmos/e2e/cos20-transfer-validation-14/browser-evidence/cos16-transfer/cos20-transfer-validation-14-game/v1/validation-2026-10-01/cos20-transfer-validation-14-transfer-v1-start/`。

私有记录位于 `.cosmos/reconciliation/2026-10-13-c6-provider-usage/`：`cos93-navigation-v1-actual-result.md`、`cos93-native-navigation-launch-v1-result.json`、`cos93-navigation-v1-actual-preservation.json`；launcher SHA-256为 `8b8e9b0170415208362a5452c7fcbbb9693c22a81854b27dc4899234dec73b81`，已消费。选择归档 `cos93-navigation-v1-actual-preserved` 为658文件/297目录/69703280B，复制前后及目标hash一致；它不代替原文件完整保全，也不包含完整Git/dependency checkout。

最小后续先独审一个窄方案：用无浏览器fixture联合异步loader与已观测guard延迟，明确ready的等待起点、300秒导航对完整资源加载的承载范围；同时设计有界request path/stage/status/first-cause与ready采样标量，补齐本次无法逐请求归因的证据缺口。保留每HTTP完整fresh、actual Buffer、原caller/raw所有权、预算及总截止。视频1秒清理失败另列原因待查。本轮仅保存实际结果和只读分析，没有源码修复、测试重跑、游戏修改或新的actual/provider；再次运行须另行授权与新launcher，COS93仍open/partial/navigation-failed。
