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

更慢的「结票门」按需跑（约 20–30 s，需 `viz/node_modules` 与 `viz/dist`）：

```powershell
node tools/check.mjs --gate      # 追加 抽数反查 / 字节可复现 / 越界扫描 / 不静默
```

确实需要绕过时用 `git commit --no-verify`，并在提交信息里说明原因。
