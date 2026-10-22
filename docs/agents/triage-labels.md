# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  | 现状（2026-10-22 实地核对） |
| -------------------------- | -------------------- | ---------------------------------------- | --- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  | ⚠️ **仓库中不存在** |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information | ⚠️ **仓库中不存在** |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  | ✅ 已创建（2026-10-22） |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            | ⚠️ **仓库中不存在** |
| `wontfix`                  | `wontfix`            | Will not be actioned                     | ✅ 已存在 |

> **先核再用**：上表「现状」列由 `gh label list --repo tanglangbc/ops` 实地核对得出。本文件此前把五个标签都写成「已映射」，但它们**大多从未创建**——`gh issue create --label <不存在的标签>` 会直接失败。套用任何一个角色前先确认它存在，不存在就先建（或改右列表格）。仓库现有的其它标签是 GitHub 默认那批加五个 `wayfinder:*`。

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.
