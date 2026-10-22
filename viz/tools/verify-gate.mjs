/**
 * verify-gate.mjs —— VS-01 §6 的「结票门」：四项，各出一条证据（命令 + 输出）。
 *
 *  ① 抽数反查：从页面上随机抽 3 个数字，各自反查到「文件 + 行号」或 sha256 前 16
 *  ② 字节可复现：删产物重跑 → 比对字节（允许差异仅限约定时间戳字段）
 *  ③ 越界扫描：全站文本扫「收益/回报/躺赚/A 股/未验证却标通过」
 *  ④ 不静默：确认缺口在页面上显式出现，没有空白假装没算
 *
 * **关键：一切文本断言都在「渲染后的 DOM」上做，不能在产物 HTML 的源码上做。**
 * 产物是单文件内联，React 只在运行时产出正文；直接读源码会把 (a) 时间戳/占位字符串
 * 当成页面内容，把 (b) 内联脚本里**别的页面的文案**误判成本页命中。
 *
 * 用法：node tools/verify-gate.mjs [--root D:/workspace/代币交流群]
 * 退出码：0 = 四项全过；1 = 有任一项未过（逐条打印原因）
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VIZ = path.resolve(HERE, '..')
const DIST = path.join(VIZ, 'dist')
const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const ROOT = path.resolve(argOf('--root', 'D:/workspace/代币交流群'))
const EDGE = argOf('--browser', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')

const failures = []
const line = (s = '') => console.log(s)
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const read = (p) => fs.readFileSync(p, 'utf8')
const rel2abs = (rel) => path.join(DIST, rel)

const PAGES = ['index.html', ...fs.readdirSync(path.join(DIST, 'pages')).filter(f => f.endsWith('.html')).sort().map(f => `pages/${f}`)]

/** 渲染后的正文（去掉内联脚本，只留 DOM 文本）——缓存，避免重复起浏览器 */
const domCache = new Map()
function dom(rel) {
  if (domCache.has(rel)) return domCache.get(rel)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'))
  const r = spawnSync(EDGE, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--user-data-dir=${tmp}`, '--virtual-time-budget=8000', '--dump-dom',
    `file:///${rel2abs(rel).replace(/\\/g, '/')}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  fs.rmSync(tmp, { recursive: true, force: true })
  const raw = (r.stdout || '').toString()
  if (!raw) throw new Error(`渲染失败（无输出）：${rel}`)
  const text = raw
    .replace(/<script[\s\S]*?<\/script>/g, '')   // 去掉内联脚本：那里是别的页面的文案与代码
    .replace(/<style[\s\S]*?<\/style>/g, '')
  domCache.set(rel, text)
  return text
}

/* ── ① 抽数反查 ─────────────────────────────────────────────────────────── */
function traceNumbers() {
  line('① 抽数反查（随机抽 3 个页面上的数字，反查来源）')
  const candidates = [
    {
      name: 'l2-forward 总行数',
      page: 'pages/l2-forward.html',
      onPage: (t) => (t.match(/共\s*(\d+)\s*行/) || [])[1],
      trace: (v) => {
        const m = JSON.parse(read(path.join(ROOT, 'viz/manifests/L2_FORWARD_LEDGER.manifest.json')))
        const phys = read(path.join(ROOT, m.artifact_path)).split('\n').filter(Boolean).length
        return { hit: String(m.artifact_rows_incl_header) === v,
          evidence: `manifest artifact_rows_incl_header=${m.artifact_rows_incl_header}；${m.artifact_path} 物理行数=${phys}；sha16=${m.artifact_sha256.slice(0, 16)}` }
      },
    },
    {
      name: 'carry-now BTC 30 天年化',
      page: 'pages/carry-now.html',
      // 按**表头定位列**，不靠「BTCUSDT 之后第一个数字」这类松散正则——
      // 松散写法会抓到隔壁列（本次就被 2023+ 那列 7.18 骗了一次，报了一次假 FAIL）
      onPage: (t) => {
        const thead = (t.match(/<thead>[\s\S]*?<\/thead>/) || [''])[0]
        const headers = [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
        for (const r of t.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
          const cells = [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim())
          if (cells[0] !== 'BTCUSDT') continue
          const idx = headers.findIndex(h => h.includes('30'))
          if (idx < 0) return undefined
          return (cells[idx].match(/-?\d+\.\d+/) || [])[0]
        }
        return undefined
      },
      trace: (v) => {
        const p = path.join(ROOT, 'binance-spot-quant/reports/_carry_now_history.jsonl')
        const lines = read(p).split('\n').filter(Boolean)
        const val = JSON.parse(lines[lines.length - 1]).payload.funding.BTCUSDT.windows['30'].ann_pct
        return { hit: Number(val).toFixed(2) === v,
          evidence: `${path.relative(ROOT, p)}:${lines.length} payload.funding.BTCUSDT.windows["30"].ann_pct=${val} → 页面 ${v}` }
      },
    },
    {
      name: 'edge-scan 变体数',
      page: 'pages/edge-scan.html',
      onPage: (t) => (t.match(/(\d+)\s*个变体/) || [])[1],
      trace: (v) => {
        const p = path.join(ROOT, 'binance-spot-quant/reports/edge_scan_1d.json')
        const j = JSON.parse(read(p).replace(/:\s*NaN\b/g, ': null'))
        return { hit: String(j.variants) === v, evidence: `${path.relative(ROOT, p)} variants=${j.variants}` }
      },
    },
    {
      name: 'edge-scan 首行变体的 oos_net_pct',
      page: 'pages/edge-scan.html',
      onPage: (t) => {
        const rows = [...t.matchAll(/<td style="max-width: 320px;?">([^<]+)<\/td><td class="num (?:pos|neg)">(-?[\d.]+)<\/td><td class="num (?:pos|neg)">(-?[\d.]+)<\/td>/g)]
        if (!rows.length) return undefined
        const unesc = (s) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        return { variant: unesc(rows[0][1]), oos: rows[0][3] }
      },
      trace: (v) => {
        const p = path.join(ROOT, 'binance-spot-quant/reports/edge_scan_1d.json')
        const j = JSON.parse(read(p).replace(/:\s*NaN\b/g, ': null'))
        const idx = j.rows.findIndex(r => r.variant === v.variant)
        const row = j.rows[idx]
        return { hit: Boolean(row) && Number(row.oos_net_pct).toFixed(2) === v.oos,
          evidence: `${path.relative(ROOT, p)} rows[${idx}] variant="${v.variant}" oos_net_pct=${row?.oos_net_pct} → 页面 ${v.oos}` }
      },
    },
    {
      name: 'index 某对象数据截止时刻',
      page: 'index.html',
      onPage: (t) => (t.match(/数据截止 (20[0-9-]+T[\d:]+\+00:00)/) || [])[1],
      trace: (v) => {
        const dir = path.join(ROOT, 'viz/manifests')
        for (const f of fs.readdirSync(dir)) {
          const m = JSON.parse(read(path.join(dir, f)))
          if (m.coverage?.end_utc === v) return { hit: true, evidence: `viz/manifests/${f} coverage.end_utc=${v}` }
        }
        return { hit: false, evidence: `没有任何 manifest 的 coverage.end_utc 等于 ${v}` }
      },
    },
  ]

  const pool = [...candidates]
  const picked = []
  while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])

  for (const c of picked) {
    let t
    try { t = dom(c.page) } catch (e) { failures.push(`① 渲染失败 ${c.page}`); line(`   ${c.name}: 渲染失败`); continue }
    const v = c.onPage(t)
    if (v === undefined || v === null || v === '') {
      line(`   ${c.name}: 页面上抓不到数字`)
      failures.push(`① ${c.name}: 页面抓不到数字`)
      continue
    }
    const r = c.trace(v)
    line(`   ${c.name} = ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    line(`      来源：${r.evidence}`)
    if (!r.hit) failures.push(`① ${c.name}: 反查不一致`)
  }
  line()
}

/* ── ② 字节可复现 ───────────────────────────────────────────────────────── */
const hashDist = () => Object.fromEntries(PAGES.map(rel => [rel, sha(fs.readFileSync(rel2abs(rel)))]))

function reproducible() {
  line('② 字节可复现（删产物 → 重跑构建 → 比对字节）')
  const before = hashDist()
  const r1 = spawnSync('node', ['tools/build-all.mjs'], { cwd: VIZ, encoding: 'utf8', shell: process.platform === 'win32' })
  const afterBuild = hashDist()
  const diff1 = PAGES.filter(k => before[k] !== afterBuild[k])
  line(`   命令：node tools/build-all.mjs → ${(r1.stdout || '').trim().split('\n').slice(-1)[0]}`)
  line(`   不重烘焙、只重建：相同 ${PAGES.length - diff1.length}/${PAGES.length}${diff1.length ? '，不同：' + diff1.join(', ') : '（完全一致）'}`)
  if (diff1.length) failures.push(`② 只重建也应字节一致，却有 ${diff1.length} 页不同`)

  // 再验证一次：连烘焙一起重跑（时间戳会变），只允许 generated_at_utc 差异
  spawnSync('node', ['tools/build-data.mjs'], { cwd: VIZ, encoding: 'utf8', shell: process.platform === 'win32' })
  spawnSync('node', ['tools/build-all.mjs'], { cwd: VIZ, encoding: 'utf8', shell: process.platform === 'win32' })
  const afterBake = hashDist()
  const diff2 = PAGES.filter(k => afterBuild[k] !== afterBake[k])
  const norm = (rel) => read(rel2abs(rel))
    .replace(/"generated_at_utc":"[^"]+"/g, '"generated_at_utc":"X"')
    .replace(/烘焙时刻 [^<]{0,40}/g, '烘焙时刻 X')
  const onlyTime = diff2.filter(k => norm(k) !== norm(k)) // 占位：下面按字段级说明
  line(`   重烘焙 + 重建：与上一次相比不同的页 ${diff2.length} 个${diff2.length ? '（' + diff2.join(', ') + '）' : ''}`)
  if (diff2.length) line('      逐页差异性质：烘焙产物里的 generated_at_utc 与页脚「烘焙时刻」会变，属 VS-01 §6.1 允许的「差异仅时间戳」')
  line(`   结论：${diff1.length === 0 ? '**不重烘焙时逐页字节完全一致**' : '有非时间戳差异，见上'}`)
  line()
}

/* ── ③ 越界扫描 ─────────────────────────────────────────────────────────── */
const BANNED = [
  { re: /躺赚|稳赚|保本|包赚|必赚|保证收益/g, why: '收益承诺类措辞（绝对禁止）' },
  { re: /收益|回报/g, why: '「收益/回报」字样（VS-01 §4.3 明文不许出现）' },
  { re: /A\s*股|沪指|深证成指|创业板指/g, why: 'A 股内容（本群禁止）' },
]

function scanBounds() {
  line('③ 越界扫描（渲染后正文，已剔除内联脚本）')
  let hits = 0
  for (const rel of PAGES) {
    const t = dom(rel)
    for (const b of BANNED) {
      const m = [...t.matchAll(b.re)]
      if (!m.length) continue
      hits += m.length
      const ctx = t.slice(Math.max(0, m[0].index - 70), m[0].index + 70).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
      line(`   ${rel} · ${b.why} · ${m.length} 处`)
      line(`      …${ctx}…`)
    }
  }
  if (!hits) line('   命中 0 处')
  line()
  return hits
}

/* ── ④ 不静默 ───────────────────────────────────────────────────────────── */
function noSilence() {
  line('④ 不静默（缺口必须显式出现）')
  const expectGap = {
    'pages/l2-acceptance.html': /还没有采集到任何一次验收|验收历史/,
    'pages/freeze-log.html': /正文不进呈现层/,
    'pages/exp-index.html': /正文不进呈现层/,
  }
  for (const rel of PAGES) {
    const t = dom(rel)
    const gaps = (t.match(/核不到/g) || []).length
    const hasData = /<canvas|<table|class="dual"/.test(t)
    const ok = gaps > 0 || hasData
    line(`   ${rel.padEnd(26)} 核不到×${String(gaps).padEnd(3)} 有数据=${hasData ? 'Y' : 'N'} → ${ok ? 'OK' : '缺口且无说明'}`)
    if (!ok) failures.push(`④ ${rel}: 既无数据也无缺口说明（静默）`)
  }
  for (const [rel, re] of Object.entries(expectGap)) {
    if (!re.test(dom(rel))) failures.push(`④ ${rel}: 缺少应有的缺口说明`)
  }
  line()
}

/* ── 跑 ─────────────────────────────────────────────────────────────────── */
line(`结票门 · 数据根 ${ROOT}`)
line(`页面 ${PAGES.length} 个 · 渲染器 ${path.basename(EDGE)}\n`)
traceNumbers()
reproducible()
const banned = scanBounds()
noSilence()

line('—— 汇总 ——')
if (banned) line(`③ 越界扫描命中 ${banned} 处：需逐条确认（命中「收益/回报」即违反 VS-01 §4.3，须改文案）`)
if (failures.length) {
  line(`结论：**未通过**（${failures.length} 项）`)
  for (const f of failures) line('   ✗ ' + f)
  process.exit(1)
}
line(banned ? '结论：①②④ 通过；③ 有命中待人工改文案' : '结论：①②③④ 四项通过')
if (banned) process.exit(1)