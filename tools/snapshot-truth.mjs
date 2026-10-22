#!/usr/bin/env node
/**
 * snapshot-truth.mjs —— 给「没有版本控制的数据根」做每日真源快照。
 *
 * 背景（/retro 的第 6 条发现）：`D:\workspace\代币交流群` **不是 git 仓**——台账、决策记录、16 份 manifest、
 * 冻结件全在里面，靠自建的 sha256 与「先定后看」纪律兜底。一次误改或误删就没有回退点。
 * 该目录整体 60 MB+（reports/ 里含大量过程产物），所以**不能整目录快照**，只快照「真源」。
 *
 * 两档（体积实测 2026-10-22）：
 *   ① 默认：决策与台账类 ≈ 190 KB/次 —— ledger、两份采集历史、两份状态、DECISION_LOG、
 *      EXPERIMENT_INDEX、FREEZE_4H_RULE、VS-01 规范、viz/manifests/*.json
 *   ② --with-inputs：再加 manifest 引用的**全部原始输入**（16 件 / 2.06 MB）→ 站点可逐字节复现
 *
 * 行为：
 *   · 写 `_snapshots/<stamp>/`（保留相对路径 + SHA256SUMS + TRUTH_SET.md）
 *   · **内容与上一次相同则跳过**（不产生 30 份一模一样的副本），并把这一事实写进 INDEX
 *   · `--keep N`（默认 30）裁剪旧快照；`--dry-run` 只报告不落盘
 *
 * 用法：node tools/snapshot-truth.mjs [--root <数据根>] [--with-inputs] [--keep 30] [--dry-run]
 * 退出码：0 = 快照完成或已存在；1 = 有文件缺失/读取失败
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const ROOT = path.resolve(argOf('--root', 'D:/workspace/代币交流群'))
const WITH_INPUTS = argv.includes('--with-inputs')
const DRY = argv.includes('--dry-run')
const KEEP = Number(argOf('--keep', '30'))
const SNAP_DIR = path.join(ROOT, '_snapshots')

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const exists = (p) => { try { fs.accessSync(p); return true } catch { return false } }

/** ① 真源清单（显式列举，可审计；改这里就等于改「什么算真源」） */
const TRUTH = [
  'binance-spot-quant/reports/L2_FORWARD_LEDGER.jsonl',
  'binance-spot-quant/reports/_l2_acceptance_history.jsonl',
  'binance-spot-quant/reports/_carry_now_history.jsonl',
  'binance-spot-quant/reports/_viz_capture_last_status.json',
  'binance-spot-quant/reports/_viz_last_status.json',
  'binance-spot-quant/reports/FREEZE_4H_RULE.md',
  'binance-spot-quant/docs/DECISION_LOG.md',
  'research/EXPERIMENT_INDEX.md',
  'research/VS_01_可视化规范.md',
]

/** manifest 与 manifest 引用的输入（② 档时才纳入） */
function manifestFiles() {
  const dir = path.join(ROOT, 'viz', 'manifests')
  if (!exists(dir)) return { manifests: [], inputs: [] }
  const manifests = fs.readdirSync(dir).filter(f => f.endsWith('.manifest.json')).map(f => `viz/manifests/${f}`)
  const inputs = new Set()
  for (const m of manifests) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(ROOT, m), 'utf8'))
      if (j.artifact_path && !manifests.includes(j.artifact_path)) inputs.add(j.artifact_path)
    } catch { /* manifest 坏了：让它出现在下面的缺失列表里 */ }
  }
  return { manifests, inputs: [...inputs].sort() }
}

const { manifests, inputs } = manifestFiles()
const list = [...TRUTH, ...manifests, ...(WITH_INPUTS ? inputs : [])]

// 收集内容（内存里算 sha，避免读两次）
const files = []
const missing = []
for (const rel of list) {
  const abs = path.join(ROOT, rel)
  if (!exists(abs)) { missing.push(rel); continue }
  const buf = fs.readFileSync(abs)
  files.push({ rel, buf, sha: sha(buf), bytes: buf.length })
}
if (missing.length) {
  console.log(`[snapshot] 缺失 ${missing.length} 个真源文件（不静默，列在下面；快照仍继续）`)
  for (const m of missing) console.log('   · ' + m)
}

const sumsText = files.map(f => `${f.sha}  ${f.rel}`).join('\n') + '\n'
const totalBytes = files.reduce((s, f) => s + f.bytes, 0)
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z'

/** 与上一次快照比对：内容一致就不落盘（避免 30 份相同副本） */
fs.mkdirSync(SNAP_DIR, { recursive: true })
const prevDirs = fs.readdirSync(SNAP_DIR).filter(d => /^\d{4}-/.test(d)).sort()
const prev = prevDirs.length ? prevDirs[prevDirs.length - 1] : null
const prevSums = prev ? path.join(SNAP_DIR, prev, 'SHA256SUMS') : null
const unchanged = Boolean(prevSums && exists(prevSums) && fs.readFileSync(prevSums, 'utf8') === sumsText)

console.log(`[snapshot] 根 ${ROOT}`)
console.log(`[snapshot] 档位 ${WITH_INPUTS ? '② 含原始输入' : '① 决策与台账'} · ${files.length} 个文件 · ${(totalBytes / 1024).toFixed(0)} KB`)
if (missing.length) console.log(`[snapshot] 缺失 ${missing.length} 个（见上）`)

if (unchanged) {
  console.log(`[snapshot] 与上一次（${prev}）内容完全一致 → 跳过落盘`)
  updateIndex({ stamp, files, totalBytes, unchanged: true, skippedDir: prev })
  process.exit(missing.length ? 1 : 0)
}
if (DRY) {
  console.log(`[snapshot] --dry-run：将写入 ${stamp}/（${files.length} 个文件）`)
  process.exit(0)
}

const outDir = path.join(SNAP_DIR, stamp)
for (const f of files) {
  const dest = path.join(outDir, f.rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, f.buf)
}
fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), sumsText, 'utf8')
fs.writeFileSync(path.join(outDir, 'TRUTH_SET.md'), truthSetDoc(files, totalBytes, missing), 'utf8')
console.log(`[snapshot] 已写入 ${path.relative(ROOT, outDir)}/（${files.length} 个文件 / ${(totalBytes / 1024).toFixed(0)} KB）`)

prune()
updateIndex({ stamp, files, totalBytes, unchanged: false, skippedDir: null })
process.exit(missing.length ? 1 : 0)

/** ── 辅助 ─────────────────────────────────────────────────────────────── */
function truthSetDoc(files, bytes, missing) {
  return [
    '# 本次快照纳入了什么',
    '',
    `- 生成时刻：${stamp}（UTC）`,
    `- 档位：${WITH_INPUTS ? '② 决策与台账 + manifest 引用的原始输入' : '① 决策与台账（默认）'}`,
    `- 文件数：${files.length}，合计 ${(bytes / 1024).toFixed(0)} KB`,
    '',
    '## 清单',
    '',
    ...files.map(f => `- \`${f.rel}\` — ${f.bytes} B — \`${f.sha.slice(0, 16)}…\``),
    '',
    missing.length ? `## 缺失（本次没纳入）\n\n${missing.map(m => `- \`${m}\``).join('\n')}` : '',
    '',
    '> 为什么只快照这些：该数据根整体 60 MB+（reports/ 含大量过程产物），整目录快照既慢又无意义；',
    '> 这里只放「不可再生的真源」——台账、决策记录、冻结件、manifest，以及按需的原始输入。',
    '> 清单本身在 `D:\\ops\\tools\\snapshot-truth.mjs` 里（那个仓有版本控制）。',
    '',
  ].filter(Boolean).join('\n')
}

function prune() {
  const dirs = fs.readdirSync(SNAP_DIR).filter(d => /^\d{4}-/.test(d)).sort()
  const extra = dirs.length - KEEP
  if (extra > 0) {
    for (const d of dirs.slice(0, extra)) {
      fs.rmSync(path.join(SNAP_DIR, d), { recursive: true, force: true })
      console.log(`[snapshot] 裁剪旧快照 ${d}（保留最近 ${KEEP} 份）`)
    }
  }
}

function updateIndex(entry) {
  const idx = path.join(SNAP_DIR, 'INDEX.md')
  const rows = exists(idx)
    ? fs.readFileSync(idx, 'utf8').split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| 时刻'))
    : []
  const cell = `| ${entry.stamp} | ${entry.unchanged ? `与 ${entry.skippedDir} 相同（跳过）` : entry.files.length + ' 个文件'} | ` +
    `${entry.unchanged ? '—' : (entry.totalBytes / 1024).toFixed(0) + ' KB'} | ${entry.files.length} |`
  const header = [
    '# 真源快照索引', '',
    '每次 `tools/snapshot-truth.mjs` 运行一行；内容与上次相同则记「跳过」，不落盘也不占体积。', '',
    '| 时刻(UTC) | 内容 | 体积 | 文件数 |', '| --- | --- | --- | --- |',
  ]
  fs.writeFileSync(idx, [...header, ...rows, cell].join('\n') + '\n', 'utf8')
}