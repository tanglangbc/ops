## Where things are

每条都是一个**导航指针**：指向真正持有细节的文件，本文件不复述它们的正文。

- **可视化站点**（8 个对象 / 单文件 HTML / 每日 09:30 自动重建）：`viz/README.md` —— 构建命令、三个计划任务、回滚方式、**三条踩过的坑**。
- **视觉约定**（三档标注 / carry 双数 / 缺口与陈旧分离 / 元数据条六项，已裁决件）：`docs/visual-standards.md`。
- **提交前守卫**（语法 / JSON / 控制字符；`--gate` 追加结票门）：`tools/check.mjs`，由 `.githooks/pre-commit` 自动跑，启用方式见 `README.md`。
- **领域词汇**（三档 / 核不到 / 闸门 / 记录日与期望 bar / manifest）：`GLOSSARY.md`。
- **写文件的坑**（shell heredoc 会吞反斜杠，写坏过 ADR；守卫已能机械拦截同类）：`docs/gotchas.md`。

## Agent skills

### Issue tracker

Issues and specs for this repo live as GitHub issues, driven with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical triage roles mapped onto this repo's label strings. See `docs/agents/triage-labels.md`.

### Domain docs

See `docs/agents/domain.md`.