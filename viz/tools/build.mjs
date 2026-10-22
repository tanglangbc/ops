/**
 * build.mjs —— 每日构建的一站式入口（计划任务调它，不依赖 PATH）。
 *
 * 顺序：烘焙数据 → 生成入口 → 逐页单文件构建（暂存+原子切换）→ 写构建状态文件。
 *
 * 失败语义（用户 2026-10-22 裁 Q8=a / #9 定）：
 *   **构建失败不冒泡到数据链**——本脚本是**独立计划任务**，与 `\mss002-l2-daily`、
 *   `\mss002-viz-capture` 互不影响；失败只写自己的状态文件并返回非零码。
 *   站点侧「陈旧」由页面按 manifest 的 coverage.end 与构建时刻自行判定（36h，连续 3 天升级），
 *   运行时不读状态文件——`file://` 下读本地文件会被 CORS 拦（见 #6 的控制台原文）。
 *
 * 用法：node tools/build.mjs [--root D:/workspace/代币交流群] [--no-swap]
 * 退出码：0 = 构建成功；1 = 任一环节失败（dist 保持上一次可用版本）
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VIZ = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const ROOT = path.resolve(argOf('--root', 'D:/workspace/代币交流群'))
const noSwap = args.includes('--no-swap')
/** 故障注入（演练用）：--fail-step bake 会让该步骤直接判失败，用来验证失败语义 */
const FAIL_STEP = argOf('--fail-step', '')
const DIST = path.join(VIZ, noSwap ? 'dist.next' : 'dist')
const STATUS_FILE = path.join(ROOT, 'binance-spot-quant', 'reports', '_viz_last_status.json')

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const line = (s) => console.log(s)

function step(name, argv) {
  if (FAIL_STEP && name === FAIL_STEP) {
    line(`[build] FAIL ${name} —— 故障注入（--fail-step ${FAIL_STEP}，演练失败路径）`)
    return { name, ok: false, ms: 0, injected: true }
  }
  const t0 = Date.now()
  const r = spawnSync(process.execPath, argv, { cwd: VIZ, encoding: 'utf8', env: process.env })
  const ms = Date.now() - t0
  const ok = r.status === 0
  line(`[build] ${ok ? 'OK  ' : 'FAIL'} ${name} (${ms} ms)`)
  if (!ok) line((r.stdout || '') + (r.stderr || ''))
  return { name, ok, ms }
}

line(`[build] root=${ROOT} swap=${!noSwap}`)
const steps = []
steps.push(step('bake', ['tools/build-data.mjs', '--root', ROOT]))
if (steps[steps.length - 1].ok) {
  steps.push(step('gen-html', ['tools/gen-html.mjs']))
  steps.push(step('build-all', ['tools/build-all.mjs', ...(noSwap ? ['--no-swap', '--out', 'dist'] : [])]))
}
const ok = steps.every(s => s.ok)

// 构建状态文件（#9 约定的 _viz_last_status.json）
let distSha = null, pageCount = 0, coverageEnd = null
try {
  const pages = ['index.html', ...fs.readdirSync(path.join(DIST, 'pages')).map(f => `pages/${f}`)]
  pageCount = pages.length
  distSha = crypto.createHash('sha256').update(pages.map(p => sha(path.join(DIST, p))).join('')).digest('hex')
} catch { /* dist 不存在（首次构建失败） */ }
try {
  const man = JSON.parse(fs.readFileSync(path.join(VIZ, 'src', 'gen', 'manifests.json'), 'utf8'))
  const ends = Object.values(man.manifests).map(m => m.coverage?.end_utc).filter(Boolean).map(t => Date.parse(t)).filter(t => !Number.isNaN(t))
  if (ends.length) coverageEnd = new Date(Math.max(...ends)).toISOString()
} catch { /* 核不到 */ }

const now = Date.now()
const ageH = coverageEnd ? (now - Date.parse(coverageEnd)) / 3600e3 : null
const status = {
  generated_at_utc: new Date(now).toISOString(),
  generated_at_cst: new Date(now + 8 * 3600e3).toISOString().replace('Z', '+08:00'),
  ok,
  steps,
  dist_pages: pageCount,
  dist_sha256_combined: distSha,
  data_coverage_end: coverageEnd ?? '核不到',
  age_hours: ageH === null ? '核不到' : Number(ageH.toFixed(1)),
  stale: ageH === null ? '核不到' : ageH > 36,
  stale_severe: ageH === null ? '核不到' : ageH > 72,
  note: '运行时不读本文件（file:// 下读本地文件被 CORS 拦）；页面按 manifest coverage.end 自行判定陈旧',
}
fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true })
fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2) + '\n', 'utf8')
line(`[build] status -> ${path.relative(ROOT, STATUS_FILE)}`)
line(`[build] ${ok ? '成功' : '失败'} · 页数 ${pageCount} · 产物组合 sha ${distSha ? distSha.slice(0, 16) : '核不到'} · 数据截止 ${coverageEnd ?? '核不到'}（${status.age_hours} 小时，stale=${status.stale}）`)
process.exit(ok ? 0 : 1)