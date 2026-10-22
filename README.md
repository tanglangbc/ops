# Operations

This directory contains local evidence and release management data. Do not package this directory into any marketplace Skill unless explicitly required and sanitized.

## 提交前检查（pre-commit 守卫）

本仓没有 CI，所以守卫落在 git hook 上。启用一次即可：

```powershell
git config core.hooksPath .githooks
```

之后每次提交会自动跑 `node tools/check.mjs`（只查本次暂存的文件，毫秒级），三项都便宜且都是**真实发生过**的错误类别：

| 检查 | 拦住的真实事故 |
|---|---|
| `node --check` 语法 | `viz/tools/verify-gate.mjs` 里一个多写的逗号，一路带到运行时才炸 |
| JSON 合法性 | `viz/package.json` 多一个逗号，直到夜间构建演练才发现 |
| 控制字符扫描 | shell heredoc 吞掉反斜杠，把 ADR 正文写成 `0x0b`（见 `docs/gotchas.md` G-001） |
| 导航指针 | `AGENTS.md` 指向不存在的 `GLOSSARY.md`（指向空气的指针会白烧一次探索；本仓此后按 `docs/agents/domain.md` 的约定**懒创建**，现已补齐） |
| 工具名不写死 | 工具面会在会话中途变化（`docs/gotchas.md` G-002 记了实测时间线）；`AGENTS.md` 这类**总是加载**的文档只写路径与「动作」，写死工具名会被拦下 |

更慢的「结票门」按需跑（约 20–30 s，需 `viz/node_modules` 与 `viz/dist`）：

```powershell
node tools/check.mjs --gate      # 追加 抽数反查 / 字节可复现 / 越界扫描 / 不静默
```

确实需要绕过时用 `git commit --no-verify`，并在提交信息里说明原因。

## 复盘：一条命令出会话摘要

`/retro` 要读的是会话日志，而日志是逐条 ndjson + JSON 转义，**用 grep 会把模型自己的叙述当成失败**。
`tools/session-digest.mjs` 把这件事做对：结构化信号（`isError` / `errorCode`）优先，文本模式只用于分类，
配对用 `callId`。

```powershell
node tools/session-digest.mjs              # 最近一次会话：工具调用分布 + 客观失败 + errorCode
node tools/session-digest.mjs --errors 8   # 失败明细（客观在前，"疑似"单列不混入）
node tools/session-digest.mjs --all        # 全部会话一览（体积 / 记录数 / 失败数）
```

三类 session 级坑已记在 `docs/gotchas.md`：G-001 写文件吞反斜杠、G-002 工具面中途会变、G-003 热重载文件的读保护。

## 数据根的真源快照（复盘第 6 条）

`D:\workspace\代币交流群` **不是 git 仓**，而台账、决策记录、冻结件、16 份 manifest 全在里面——一次误改就没有回退点。该根整体 **60 MB+**（`reports/` 含大量过程产物），所以不能整目录快照，只快照「真源」。

```powershell
node tools/snapshot-truth.mjs                     # ① 决策与台账（25 件 / 约 159 KB）
node tools/snapshot-truth.mjs --with-inputs        # ② 再加 manifest 引用的原始输入（+16 件 / 约 2.1 MB）
node tools/snapshot-truth.mjs --dry-run             # 只报清单不落盘
```

- 落点：`<数据根>\_snapshots\<UTC 时刻>\`（保留相对路径 + `SHA256SUMS` + `TRUTH_SET.md`），外加一份 `INDEX.md` 索引；
- **内容与上一次相同则跳过**——只在真变了才生成新快照，历史表就是「变化日志」，不堆副本；
- 保留最近 **30** 份，自动裁剪；
- 计划任务 **`\mss002-truth-snapshot`（每日 09:45）**，排在 L2 记录 08:10 / 采集 09:00 / 构建 09:30 之后；
- 抽查过：快照里 ledger 的 sha256 与现场文件一致（`3b8ecd0199…`）。
- 回滚：`schtasks /delete /tn "\mss002-truth-snapshot" /f`，并删掉 `_snapshots/`（两者都不影响数据链）。

**没做的一件事（等你点头）**：`git init` 那个数据根。
快照给的是「时间点副本 + 完整性证明」，git 才能给 diff 与归因。真要 git 化，建议**只纳入真源集**并配一份 `.gitignore`：

```
data/            # 5 份资金费 CSV + 日线 CSV ≈ 2 MB（用快照 ② 兜底即可）
reports/*.csv / *_scratch/ / _quarantine_*/ / _packages/   # 过程产物与 60 MB 的大头
.vscode/  _snapshots/   # _snapshots 自身不入库（它是快照，不是历史）
```

体积估计：首次提交约 **0.2 MB**（真源集）。这是一次**结构性改动**（在数据根里放 `.git`），我按纪律先给方案、不动手。
