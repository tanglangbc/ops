## Where things are

每条都是一个**导航指针**：指向真正持有细节的文件，本文件不复述它们的正文。

- **可视化站点**（8 个对象 / 单文件 HTML / 每日 09:30 自动重建）：`viz/README.md` —— 构建命令、三个计划任务、回滚方式、**三条踩过的坑**。
- **量化交易工作台边界**：`docs/adr/0002-trading-workbench-boundary.md`（独立于只读研究呈现层、首版不接私有交易 API）与 `docs/adr/0003-first-release-market-and-simulation-scope.md`（首版策略、页面与验收范围）。
- **视觉约定**（三档标注 / carry 双数 / 缺口与陈旧分离 / 元数据条六项，已裁决件）：`docs/visual-standards.md`。
- **提交前守卫**（语法 / JSON / 控制字符 / 导航指针；`--shots` 加截图体检、`--gate` 加结票门）：`tools/check.mjs`，由 `.githooks/pre-commit` 自动跑，启用方式见 `README.md`。
- **领域词汇**（三档 / 核不到 / 闸门 / 记录日与期望 bar / manifest）：`GLOSSARY.md`。
- **踩过的坑**（写文件时 heredoc 会吞反斜杠 G-001；会话中途工具面会变、`unknown tool` 是一次性信号 G-002；热重载文件的读保护 G-003）：`docs/gotchas.md`。
- **看页面**（空白 / 没上色 / 过窄用 `viz/tools/shot-check.mjs` 机械筛掉；**好不好看需要图像能力的人或模型**，当前模型不接受图像输入，没看过就写「未目检」）。
- **数据根的工作区**（根仓 + `binance-spot-quant` 子仓各自独立，过程产物不入库；每日 09:45 另有真源快照可回退）：`README.md` 的「数据根的版本控制与快照」一节 + `tools/snapshot-truth.mjs`。

## Agent skills

### Issue tracker

Issues and specs for this repo live as GitHub issues, driven with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles mapped onto this repo's label strings. See `docs/agents/triage-labels.md`.

### Domain docs

See `docs/agents/domain.md`.