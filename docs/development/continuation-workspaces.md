# 续跑任务的固定输入镜像（D3b1）

`src/runtime/entrypoint-workspace.ts` 提供：

```ts
materializeTaskInputs({ artifactRoot, workspace, task, requirement, signal }): Promise<void>
```

`artifactRoot` 保持原运行根目录；`workspace` 必须是其中独立的 `continuations/<decision>/workspace`。helper 只把明确列出的 `requirement.sources`、`task.inputs` 和 `task.context.interfaces` 复制到相同相对路径。原 `authors/*` 部分输出和已有 continuation 副本不能作为来源；符号链接、junction、硬链接文件、路径越界及输入与任务写区重叠均拒绝。

所有来源和已有镜像先检查，再独立创建缺失文件。已存在文件必须字节相同，引用目录不能含额外文件；不覆盖、不更新其 mtime。完成前重新读取来源和目标，确认字节及文件集合一致。已知图片、音频、视频、字体及 `.bin/.zip/.pdf` 后缀按二进制原样复制，其余文件要求合法 UTF-8；不猜测转码。相同进程内，对同一 workspace 的并发调用排队，沿用外层运行 owner，不新增锁或账本。

取消或中断会拒绝本次调用，可能保留已写入的独立文件；没有“完成”标记或隐含成功。重试可以补缺失文件，但残缺文件、内容冲突、额外文件或改变的来源会阻断，helper 不删除或修补它们。检查范围仅限明确引用的子树；不把其他已有工作区内容视为可信。

**边界：复制不构成认证。** 原 passed 祖先仍须由后续 host 在原 `artifactRoot` 核验 journal、provenance 和 signature。当前模块没有接入生产 host 或 `preAuthor`，不创建任务、授权窗口、验收记录或 registry 记录。后续应在依赖通过、开始新 attempt 之前调用，replacement 输出尚未产生时不能提前镜像。保留现有 `root/sessions/<attemptId>/{author,review}` 层级。

## 离线验证

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test --test-reporter=spec tests/runtime/entrypoint-workspace.test.ts
```

使用真实临时文件、中文、二进制、junction、硬链接和文件监听，覆盖来源 bytes/mtime 不变、独立复制、重复与并发调用、补缺失、冲突拒绝、路径和写区限制、编码、取消以及复制期间来源改变。先确认缺少复制行为的两项红灯，再实现；无常见文本后缀的编码反例也先红后修。最终 12 tests / 12 pass / 0 fail，`duration_ms: 875.9275`；单独 `npm run typecheck` exit 0。测试没有 provider、API、浏览器或编译子进程调用，不复跑 D2 的 98/70 项证据。本步未重跑 build，组合构建由 merger 负责。
