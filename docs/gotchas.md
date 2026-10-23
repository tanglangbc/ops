# 环境陷阱记录（Gotchas）

> 记录「已经真实咬过一次」的工具/环境坑。每条必须写明：现象、成因（若已知）、正确做法、怎么验证。
> 这是给下一次会话省时间的清单，不是规范。

---

## G-001 · `ops_bash` 的 heredoc 里反斜杠会被吞一层（2026-10-22）

**现象**：在 `ops_bash` 里用 `python - <<'PY' ... PY` 写文件时，源码里写的 `"D:\\ops\\viz"`（双反斜杠）到 Python 手里已经变成 `"D:\ops\viz"`（单反斜杠）。后果是 `\v`、`\d`、`\o` 被当成转义序列解释——Python 抛 `SyntaxWarning: invalid escape sequence`，**落盘文本里 `\viz` 静默变成「垂直制表符 + iz」**，Windows 路径被改坏。

**实际咬到**：一次性污染了两处——`docs/adr/0001-viz-site-architecture.md` 的一行，以及地图 issue 正文（`Notes`）的一行。两处都是**路径**，肉眼扫一眼不一定发现，是逐字节检查才查出来的。

**正确做法**
1. 内联脚本里**不要出现字面反斜杠**：用 `B = chr(92)`，再拼字符串，例如 `ops = "D:" + B + "ops"`。
2. 必须写字面反斜杠时，改用 `write` / `edit` 工具直接落文件——它们不做这层处理。
3. 已污染的行用**整行替换**修，不要用局部 `replace`：局部模式串本身也会被吞。

**怎么验证**
- 落盘后立刻扫控制字符：`python -c "s=open(p,encoding='utf-8').read(); print([hex(ord(c)) for c in s if ord(c)<32 and c!=chr(10)])"` —— 输出必须是 `[]`。
- 目标行用 `read` 工具或 `gh api ... --jq .body | cat -A` 复核，看到的是**单个反斜杠**的期望路径。
- 一次写入可能同时污染多处，**每个落点都要各自复查**。

---

## G-002 · 会话中途工具面会变，而且**不会通知**（2026-10-22）

**现象**：同一个工具在会话前半段可用、后半段消失，调用它得到 `Error: unknown tool "<名>"`。日志里**没有任何宣布记录**——只有那次调用的结果本身告诉你。

**实测时间线**（从本会话日志解析：`tool/call` 与 `tool/result` 记录）：

```
11:50:21 → 13:34:00   某个工具 11 次调用全部成功
15:41:18              第 12 次调用 → 记录 #780 返回 unknown tool
之后                  0 次重试（行为本身是对的，代价是那一次「撞墙」才发现的往返）
```

**成因（已确认与未确认分开写）**
- 确认：会话中途**会话级工具集发生变化**（同一会话里 skill 目录被整体替换过两次，也出现过 `agent-preset/selected` 记录），而工具注册表随之变化。
- 未确认：具体是哪一层把该工具摘掉的（preset 切换 / 客户端插件断连 / 插件被禁用），本仓看不到那一层。

**正确做法**
1. **以当前会话菜单为准**：工具清单是会变的，不要把「哪个工具可用」写进长期记忆或仓库文档。
2. `unknown tool` 是**一次性信号**，不是偶发错误：**立刻改道**（换等价工具或换成脚本），不要重试同名工具。
3. 仓库文档里**优先写动作**（「用脚本导出」）而不是工具名；确需提名时，同句标注「工具名以当前菜单为准」。
4. 另有一类同类错误：把**别的 profile/会话**里的工具名当成本会话的（本次曾直接调 `bash`，而本会话的菜单里是 `ops_bash` / `pwsh`）。看到 `unknown tool` 先怀疑「这是不是别处的名字」。

**怎么验证**
- 关键不是验证，而是**记录代价**：如果要判断某工具是否还在，调一次看结果；把探测次数控制在 1 次以内（重试 = 纯浪费）。
- 复盘时用结构化日志计数，不要凭印象：用 `node tools/session-digest.mjs`。
  （更正：本会话早前我写的「`tool/result` 常常没有 `time`」**是错的**——实测 399/399 条都带 `time`，
  且带 `callId`；配对应当用 **`callId`** 精确配对，不要靠序号或时间戳猜。那次误判来自我自己脚本里的一处取值错误。）

---

## G-003 · 改「会被热重载」的文件会撞上读保护（2026-10-22）

**现象**：`edit` 被拒，两种报错：

```
Error: cannot modify "...": file has not been read — read the file, then retry          (errorCode: FS_NOT_OBSERVED)
Error: cannot modify "...": file changed since it was read — re-read the file, then retry (errorCode: FS_STALE_VERSION)
```

**实际咬到**：本次会话各 2 次（`tools/session-digest.mjs --json` 的 `errorCode` 统计直接给出：`FS_NOT_OBSERVED×2`、`FS_STALE_VERSION×2`）。后者全部发生在 **`AGENTS.md`** 上——该文件会被 harness **热重载**（会话里出现过两次 `Updated instructions from: AGENTS.md` 的系统提示），重载后文件版本变了，我紧接着的 `edit` 就被判为「读过的版本已过期」。

**成因**
- `FS_NOT_OBSERVED`：文件操作策略要求**本次会话内**由 `read` 工具读过目标文件才允许改；上一轮/上一个 checkpoint 里读过**不算**。
- `FS_STALE_VERSION`：读之后文件被（自己、别的会话、或 harness 的热重载）改动过，缓存版本对不上。
- **热重载只是其中一种成因，别一口咬定是它**：任何**外部命令改了文件**都一样触发。2026-10-23 实测一次：`git pull` 把 `AGENTS.md` 从 `173d943` 推到 `5ff8ba0`，紧接着的 `edit AGENTS.md` 立刻被判 `FS_STALE_VERSION`——当时并没有发生热重载。看到这个错先问「**谁刚动过这个文件**」（`git pull` / 脚本 / 另一个 agent / harness），再按 read → 重试。

**正确做法**
1. 改**会被热重载**的文件（`AGENTS.md`、以及任何被其他 agent 共享的文档）前，**先 `read` 再 `edit`**，不要拿记忆里的内容直接改。
2. 被拒就按提示 **read → 重试**；**不要改用 shell 写文件绕过**——绕过等于放弃版本保护，会踩出更难查的并发覆盖。
3. 同一个文件要连续改多处时，每处改完最好重读一次；跨 agent 协作时尤其如此。

**怎么验证**
- `node tools/session-digest.mjs --errors 8`：客观失败里会带 `errorCode`，FS 类问题直接可数。

---

## G-004 · 搜索与抓取是**三套**通路，各自会单独失效（2026-10-23）

**现象**：同一次会话里 `web_fetch` **3/3 全败**（每次 `TOOL_TIMEOUT`，30 s）、`web_search` **1/1 全败**（`WEB_PROVIDER_CONFIGURED_MISSING`：`configured web provider "auto" is not registered`），而 `advanced_search` **3/3 全通**。三者不是同一个东西，也不共享健康状态。

**实测（本次会话日志，`node tools/session-digest.mjs` 原样计数）**

| 通路 | 调用 | 结果 |
|---|---|---|
| `web_fetch` | 3 | **3 失败**，全部 `TOOL_TIMEOUT`（30 s） |
| `web_search`（默认 provider `auto`） | 1 | **1 失败**，`WEB_PROVIDER_CONFIGURED_MISSING` |
| `advanced_search`（显式 engine + 自动 fallback） | 3 | **0 失败** |

**正确做法**
1. **要搜**：用 `advanced_search` 并**显式指定 engine**（或让它 fallback），不要用裸 `web_search`。
2. **要页面正文**：不要指望文档站（`developers.binance.com` 一类）在 30 s 内返回——**走该项目的官方文档仓库 raw**（如 `raw.githubusercontent.com`）。本会话同一批币安官方文档：文档站 2 次全超时，换 raw 仓库这条路把内容拿到了。
3. **别重试超时的抓取**：3 次超时 = 3 次白等 30 s。换通路，或者派子代理去查——但子代理会无声死，收结果前先确认它有 closing message（`session-digest.mjs` 现已把无声死计成客观失败）。

**怎么验证**
- `node tools/session-digest.mjs` 的按工具失败表：`web_fetch` 3/3、`web_search` 1/1、`advanced_search` 0——这三行就是本条的证据。

---

## G-005 · 远端超时会让**回执**和**票面**都说错话（2026-10-23）

**现象**：这一整轮里 `api.github.com` 反复出现 `net/http: TLS handshake timeout`。**读操作一直正常，写操作时好时坏**——而坏的时候，工具给出的说法**不一定对**。本会话真实撞到四种形态，每一种都值得单独记住：

| # | 形态 | 真相 |
|---|---|---|
| 1 | 建票/上报回执说「超时了，是否生效说不清」 | **票其实建成了**。`gh issue list --search <标题>` 一查就在（#32 就是这样） |
| 2 | 票面被**自动追加**一段「你在本仓只有**读权限**，标签打不上，建议先 fork 到自己名下」 | **假的**。一次幂等写测试当场证伪：`gh issue edit 32 --add-label ready-for-agent` 成功，复核 `labels == ["ready-for-agent"]`。真正原因是**TLS 超时被误判成权限不足** |
| 3 | 写操作**回执**里的字段：`parentKey: null`、`comments: []`、assignee 缺 `kind`/`name` | **薄投影，不是票的真值**。同一时刻 `deck_issue_get` 读到的父票与评论都是对的（与 GraphQL 地面真相逐项吻合） |
| 4 | 关闭回执说「写命令**已回成功**，但写后**读回失败**，是不是 closed 没确认」 | 这句**是准确的**：去 gh 侧核实，#15 确实 `closed_at=2026-10-23T13:05:12Z` |

**已冻结的第一号教训 —— 绝不要用带 `2>&1` 的重定向去喂 `--body-file`**

本轮差点干成一次破坏性操作：

```bash
gh issue view 32 --json body --jq .body > /tmp/b32.md 2>&1   # ← 危险
...
gh issue edit 32 --body-file /tmp/b32.md                     # ← 会把正文覆盖成报错文本
```

若那条 `view` 超时，`/tmp/b32.md` 里装的就是 **71 字节的 `Post "...": TLS handshake timeout`**——下一条 `--body-file` 会把整张票的正文**替换成一段报错信息**。**取正文与写正文必须分两步、且中间要有守卫**（本轮的护栏：文件必须含幂等锚 `DSH-IDEMPOTENCY-KEY`、剥离后长度仍 > 800、写回后复核关键串仍在）。不要 `2>&1` 进数据文件。

**正确做法**

1. **超时后先核实，再决定要不要重放**：建票查 `gh issue list --search <标题>`；改票读 `gh api repos/<owner>/<repo>/issues/<n>` 看 `state`/`labels`。**读比写可靠得多，先读。**
2. **对「权限不足」这类论断，用一次幂等写测试当场验**，不要照它去动配置或改仓库形态（#32 那次若照做就会白 fork 一个仓）。
3. **要票的真实状态一律用 `deck_issue_get`**（或 gh），**不要把写操作的回执当状态用**——回执可能只带薄投影，且可能是**动作前**的快照。
4. 写操作**一律幂等**（打标签、加评论、写回同一正文），这样超时后重试是安全的；不幂等的写（建票）超时后必须先查再决定。

**怎么验证**

- 查票是否真建成：`gh issue list --repo tanglangbc/ops --search "T19" --json number,title,state`
- 验「读权限」论断为假：`gh issue edit <n> --add-label ready-for-agent` 然后 `gh issue view <n> --json labels`
- 验回执 vs 真相不一致：同一条票，比较 `deck_issue_get`（父票/评论/A）与任一写回执的 `parentKey`/`comments`
- 验重定向护栏：故意让 `gh issue view` 超时，`wc -c` 那个临时文件——正常应是票面字节数，而不是 71。
