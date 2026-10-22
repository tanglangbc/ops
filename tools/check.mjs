#!/usr/bin/env node
/**
 * check.mjs —— `D:\ops` 的守卫（提交前自动跑，见 `.githooks/pre-commit`）。
 *
 * 为什么存在：本仓没有 CI、没有 lint、没有测试；而三类错误在这次会话里都真实发生过，
 * 且全是**机械可判**的：
 *   ① JS 语法错  —— verify-gate.mjs 里 `return {...},` 一路带到运行时才发现
 *   ② JSON 打字错 —— package.json 多一个逗号，直到夜间构建演练才炸
 *   ③ 控制字符   —— shell heredoc 吞掉反斜杠，把 ADR 正文写成 VT（见 docs/gotchas.md G-001）
 *
 * 三项都便宜（毫秒级），所以默认全跑；慢的 `verify-gate.mjs`（要起 9 次无头浏览器）放 `--gate`。
 *
 * 用法：
 *   node tools/check.mjs                 # 快检：全仓语法 + JSON + 控制字符
 *   node tools/check.mjs <文件...>        # 只查给定文件（pre-commit 传暂存文件，保持毫秒级）
 *   node tools/check.mjs --gate          # 追加跑 viz/tools/verify-gate.mjs（约 20–30 s）
 *   node tools/check.mjs --full          # = 快检 + --gate
 * 退出码：0 = 通过；1 = 有未通过项（pre-commit 据此拦下提交）
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const argv = process.argv.slice(2)
const WANT_GATE = argv.includes('--gate') || argv.includes('--full')
const WANT_SHOTS = argv.includes('--shots') || argv.includes('--full')
const files = argv.filter(a => !a.startsWith('--'))

/** 这些目录/前缀不扫：依赖、产物、会话日志、临时目录 */
const SKIP_DIRS = new Set(['.git', '.dsh-ops', 'node_modules', 'dist', 'dist.prev', 'dist.next', '.playwright-mcp'])
const SKIP_PREFIX = ['.tmp-']
const TEXT_EXT = new Set(['.mjs', '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.css', '.html', '.yml', '.yaml', '.ps1', '.py', '.txt', '.gitignore', ''])

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.' || e.name === '..') continue
    const p = path.join(dir, e.name)
    const rel = path.relative(ROOT, p).replace(/\\/g, '/')
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || SKIP_PREFIX.some(x => e.name.startsWith(x))) continue
      walk(p, out)
    } else {
      if (SKIP_PREFIX.some(x => rel.startsWith(x))) continue
      out.push(rel)
    }
  }
  return out
}

const targets = files.length
  ? files.map(f => path.relative(ROOT, path.resolve(ROOT, f)).replace(/\\/g, '/'))
  : walk(ROOT)

const fails = []
const notes = []
let secFails = 0
const ok = (m) => console.log(`  ✓ ${m}`)
const bad = (m) => { console.log(`  ✗ ${m}`); fails.push(m); secFails++ }
const endSection = (m) => { if (secFails === 0) ok(m); secFails = 0 }

/* ── ① JS 语法（.mjs/.js；JSX 交给 ② 的 build 与 --gate 的 verify-gate 覆盖） ── */
console.log('① JS 语法（node --check）')
const jsFiles = targets.filter(f => /\.(mjs|js)$/.test(f))
let checked = 0
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' })
  checked++
  if (r.status !== 0) bad(`${f}: ${(r.stderr || '').split('\n').slice(0, 3).join(' ').trim()}`)
}
endSection(`${checked} 个 .mjs/.js 文件语法正确`)

/* ── ② JSON 合法性（package.json / 生成物 / 数据件） ───────────────────── */
console.log('② JSON 合法性')
const jsonFiles = targets.filter(f => f.endsWith('.json') && !f.includes('/gen/') ? true : f.endsWith('.json'))
let jn = 0, jbad = 0
for (const f of jsonFiles) {
  const abs = path.join(ROOT, f)
  if (!fs.existsSync(abs)) continue
  jn++
  try {
    JSON.parse(fs.readFileSync(abs, 'utf8'))
  } catch (e) {
    jbad++
    bad(`${f}: ${e.message}`)
  }
}
endSection(`${jn} 个 JSON 文件合法`)

/* ── ③ 控制字符（G-001：heredoc 吞反斜杠后写进文件的 VT 等） ──────────── */
console.log('③ 控制字符扫描（除 tab/换行/回车外一律报错）')
let scanned = 0, hits = 0
for (const f of targets) {
  const ext = path.extname(f).toLowerCase()
  if (!TEXT_EXT.has(ext) && !path.basename(f).startsWith('.')) continue
  const abs = path.join(ROOT, f)
  if (!fs.existsSync(abs) || fs.statSync(abs).size > 8 * 1024 * 1024) continue
  let raw
  try { raw = fs.readFileSync(abs) } catch { continue }
  if (raw.includes(0)) continue                     // 二进制跳过
  scanned++
  const text = raw.toString('utf8')
  const m = text.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/)
  if (m) {
    hits++
    const idx = m.index
    const lineNo = text.slice(0, idx).split('\n').length
    const code = m[0].codePointAt(0).toString(16).padStart(2, '0')
    bad(`${f}:${lineNo} 含控制字符 0x${code}`)
  }
}
endSection(`${scanned} 个文本文件无控制字符`)

/* ── ④ 导航指针（AGENTS.md 里反引号包住的仓库路径必须真的存在） ────────── */
/* 「指向空气的指针」是机械可判的：新会话会照着它去找，找不到就白花一次探索。 */
console.log('④ 导航指针（AGENTS.md 指向的文件是否存在）')
const agentFiles = targets.filter(f => path.basename(f) === 'AGENTS.md')
let ptrCount = 0
for (const f of agentFiles) {
  const abs = path.join(ROOT, f)
  if (!fs.existsSync(abs)) continue
  const text = fs.readFileSync(abs, 'utf8')
  const seen = new Set()
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const tok = m[1].trim()
    // 只认「像仓库内路径」的 token：含 / 或以这些后缀结尾；跳过命令、通配、外部路径
    if (/[<>*?|]/.test(tok) || tok.includes(' ')) continue
    if (!(tok.includes('/') || /\.(md|mjs|js|json|ps1|py|yml|yaml)$/.test(tok))) continue
    if (/^[A-Za-z]:/.test(tok) || tok.startsWith('http')) continue
    if (seen.has(tok)) continue
    seen.add(tok)
    ptrCount++
    if (!fs.existsSync(path.join(ROOT, tok))) bad(`${f}: 指针指向不存在的文件 \`${tok}\``)
  }
}
endSection(`${agentFiles.length} 个 AGENTS.md 的 ${ptrCount} 条路径指针全部存在`)

/* ── ⑤ 截图体检（目检的机械替代：空白 / 未上色 / 宽度；约 15 s） ───────── */
if (WANT_SHOTS) {
  console.log('⑤ 截图体检（空白 / 未上色 / 宽度）')
  const sc = path.join(ROOT, 'viz', 'tools', 'shot-check.mjs')
  const hasDist = fs.existsSync(path.join(ROOT, 'viz', 'dist', 'index.html'))
  if (!fs.existsSync(sc)) bad('viz/tools/shot-check.mjs 不存在')
  else if (!hasDist) notes.push('跳过截图体检：viz/dist 不存在（先跑 pnpm build）')
  else {
    const r = spawnSync(process.execPath, [sc, '--quiet'], { cwd: path.join(ROOT, 'viz'), encoding: 'utf8' })
    const tail = (r.stdout || '').trim().split('\n').slice(-3).join('\n')
    if (r.status !== 0) bad(`截图体检未通过（空白/未上色/宽度）:\n${tail}`)
    else ok('9 页截图非空白、已上色、宽度达标（**仍不等于目检**）')
    secFails = 0
  }
}

/* ── ⑥ 慢检：verify-gate（--gate/--full） ─────────────────────────────── */
if (WANT_GATE) {
  console.log('⑥ 结票门 verify-gate（抽数反查 / 字节可复现 / 越界扫描 / 不静默）')
  const gate = path.join(ROOT, 'viz', 'tools', 'verify-gate.mjs')
  const hasDist = fs.existsSync(path.join(ROOT, 'viz', 'dist', 'index.html'))
  const hasDeps = fs.existsSync(path.join(ROOT, 'viz', 'node_modules', 'vite'))
  if (!fs.existsSync(gate)) bad('viz/tools/verify-gate.mjs 不存在')
  else if (!hasDist || !hasDeps) notes.push(`跳过 verify-gate：${!hasDeps ? 'viz/node_modules 不存在（先跑 pnpm install）' : 'viz/dist 不存在（先跑 pnpm build）'}`)
  else {
    const r = spawnSync(process.execPath, [gate], { cwd: path.join(ROOT, 'viz'), encoding: 'utf8' })
    const tail = (r.stdout || '').trim().split('\n').filter(l => /^(结论|   ✗|③)/.test(l)).join('\n')
    if (r.status !== 0) bad(`verify-gate 未通过：\n${tail || (r.stderr || '').slice(-400)}`)
    else ok('verify-gate 四项通过')
    secFails = 0
  }
}

/* ── 汇总 ─────────────────────────────────────────────────────────────── */
console.log('')
for (const n of notes) console.log(`  · ${n}`)
if (fails.length) {
  console.log(`check: **未通过**（${fails.length} 项）—— 提交被拦下；修好再提交，或确认这是有意为之`)
  process.exit(1)
}
console.log(`check: 通过（扫描 ${targets.length} 个文件）`)
process.exit(0)