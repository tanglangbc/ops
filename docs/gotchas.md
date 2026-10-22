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
