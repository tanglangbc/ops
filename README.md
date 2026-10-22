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

## 数据根的版本控制与快照（复盘第 6 条 · 已执行）

### 先修正一条结论：那个数据根**部分**已经是 git 仓

我在复盘里写「数据根不是 git 仓」——**不准确**。实查：`<数据根>\binance-spot-quant\` **早有独立 git 仓**
（branch `master`、383 个跟踪文件、3 次提交、**无远端**），它跟踪的是源码/测试/文档。

真正的问题在别处，有两处：

1. **它把自己最不可再生的件挡在了门外**：`.gitignore` 里 `reports/**/*.jsonl` 的本意是挡「跑一次就重新生成」的过程产物，
   但**台账与两份采集历史是只追加、按天累积**的证据，被同一条规则连带排除；
2. **这个根本身没有版本控制**：`tools/`（生产者脚本）、`research/`（研究脚本与笔记）、
   `viz/manifests/` + 契约文档，全在无历史的目录里。

### 本次做了两件事

| 动作 | 落点 | 结果 |
|---|---|---|
| ① 子仓纳入证据件 | `<根>\binance-spot-quant\` | 新提交 `b5e166e`：`L2_FORWARD_LEDGER.jsonl`、`_l2_acceptance_history.jsonl`、`_carry_now_history.jsonl`、`DECISION_LOG.md`；`.gitignore` 里给这三件加了**带理由的例外**（regenerable 的 `reports/*.json|csv` 仍不入库） |
| ② 根仓 init | `<根>\.git` | 新提交 `484f6d7`：**81 个文件 / 2.4 MB**（`tools/`、`research/`、`viz/manifests/`、契约文档、`tests/`）；工作区干净 |

排除范围（合计 **400+ MB 全部不入库**）：`binance-spot-quant/`（自带历史，避免嵌套仓）、
`_*_scratch/`、`_v2/`、`_dshlib/`、`_packages/`、`_quarantine_*/`、`logs/`、`_snapshots/`、
根层 `reports/`（探测残留含 vendored deps）、以及 viz 的全部生成物（`dist*`、`node_modules`、`src/gen`、`deliver`）。

### 与「真源快照」的分工（两者都留，不互相替代）

- **git 管 diff 与归因**：谁在什么时候改了哪一行，可回溯；
- **快照管时间点全景**：`--with-inputs` 那一档会把**未入库的大输入**（5 份资金费 CSV 等）也留一份，
  这是 git 不做的（那是 2 MB 的二进制/数据，不适合进历史）。

```powershell
node tools/snapshot-truth.mjs                  # ① 决策与台账（25 件 / 159 KB）
node tools/snapshot-truth.mjs --with-inputs     # ② 含原始输入（41 件 / 2.2 MB）
```

计划任务 `\mss002-truth-snapshot`（每日 09:45）自动跑 ①。

### 回滚（两处各自独立）

```powershell
Remove-Item -Recurse -Force "<根>\.git"                      # 去掉根仓（快照与子仓历史都不受影响）
cd "<根>\binance-spot-quant"; git reset --hard 590823f      # 回到纳入证据件之前（590823f 是上一提交）
schtasks /delete /tn "\mss002-truth-snapshot" /f             # 停掉快照任务
```

**两个仓都没有远端**——历史只在本机。要不要推到远端是另一个决定（涉及数据是否离开本机，我不擅自做）。
