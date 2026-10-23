/**
 * build-data.mjs —— 构建期把 manifest + 其引用的数据文件烘焙成站点可用的 JSON。
 *
 * 依据（不要在这里改口径）：
 *  - docs/adr/0001-viz-site-architecture.md：数据必须在构建期烘焙，运行时不读群目录、不 fetch
 *  - viz/DATA_CONTRACT_STANDARD_20261022.md：渲染器只读 manifest 与其引用文件，**禁止另算统计**
 *  - docs/visual-standards.md：三档标注 / carry 双数 / 缺口显式 / 元数据条六项
 *
 * 本脚本做的事只有「取数 + 必要的轻量聚合」（聚合必须写 formula 并标 数据推断），
 * 不做任何判定性统计（那是研究脚本的职责，同一判据不许两处算）。
 *
 * 用法：node tools/build-data.mjs [--root D:/workspace/代币交流群]
 */
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const argOf = (k, d) => {
  const i = args.indexOf(k)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const OUT = path.resolve(HERE, '..', 'src', 'gen', 'data.json')
const ROOT = path.resolve(argOf('--root', 'D:/workspace/代币交流群'))
const REPORTS = path.join(ROOT, 'binance-spot-quant', 'reports')
const DATA = path.join(ROOT, 'binance-spot-quant', 'data')

const readJson = (p) => JSON.parse(tolerant(readText(p)))

/**
 * Python 的 json.dump 会写出裸 NaN / Infinity（研究脚本里 concentration_top3_pct
 * 就有 NaN），标准 JSON.parse 会直接抛。这里把它们归成 null 并**记录缺口**，
 * 而不是静默丢掉整行——「核不到」必须显式。
 */
function tolerant(s) {
  return s.replace(/:\s*NaN\b/g, ': null')
          .replace(/:\s*-?Infinity\b/g, ': null')
}
const readText = (p) => fs.readFileSync(p, 'utf8')
const exists = (p) => { try { fs.accessSync(p); return true } catch { return false } }

function readJsonl(p) {
  if (!exists(p)) return []
  return readText(p).split('\n').map(s => s.trim()).filter(Boolean).map(l => JSON.parse(l))
}

/** manifest 是唯一入口：先读全部 manifest，页面只认它 */
const MANIFEST_DIR = path.join(ROOT, 'viz', 'manifests')
const manifests = {}
for (const f of fs.readdirSync(MANIFEST_DIR).filter(f => f.endsWith('.manifest.json'))) {
  const m = readJson(path.join(MANIFEST_DIR, f))
  manifests[m.artifact_id] = m
}

const problems = []   // 缺口/核不到，全部显式带到页面上（不许静默）

/* ── ① L2 前向台账：按记录日的条数（含 kind 分层） ───────────────────────── */
function bakeL2Forward() {
  const rows = readJsonl(path.join(REPORTS, 'L2_FORWARD_LEDGER.jsonl'))
  const byDate = new Map()
  let noDate = 0
  for (const r of rows) {
    // correction 行只有 row_id/kind/written_at，没有 record_date：单列一格，不并入任何一天
    const hasDate = Boolean(r.record_date)
    if (!hasDate) noDate++
    const d = hasDate ? r.record_date : '(无记录日)'
    if (!byDate.has(d)) byDate.set(d, { date: d, daily: 0, backfill: 0, correction: 0, total: 0 })
    const e = byDate.get(d)
    e.total++
    if (r.kind === 'daily') e.daily++
    else if (r.kind === 'backfill') e.backfill++
    else if (r.kind === 'correction') e.correction++
  }
  const series = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  if (!series.length) problems.push({ page: 'l2-forward', what: '台账一行都没有' })
  if (noDate) problems.push({ page: 'l2-forward', what: `${noDate} 行没有 record_date（全部是 correction 行），已单列一格「(无记录日)」，不并入任何一天` })
  return {
    series,
    kinds: { daily: rows.filter(r => r.kind === 'daily').length, backfill: rows.filter(r => r.kind === 'backfill').length, correction: rows.filter(r => r.kind === 'correction').length },
    rows: rows.length,
    manifest: manifests.L2_FORWARD_LEDGER || null,
  }
}

/* ── ② L2 验收历史（采集器产物） ────────────────────────────────────────── */
function bakeL2Acceptance() {
  const recs = readJsonl(path.join(REPORTS, '_l2_acceptance_history.jsonl'))
  const rows = recs.map(r => {
    const p = r.payload || {}
    const checks = Array.isArray(p.checks) ? p.checks : []
    return {
      record_date: r.record_date || r.key,
      verdict: p.verdict ?? '核不到',
      exit_code: p.exit_code ?? null,
      checked_at_cst: p.checked_at_cst ?? '核不到',
      expected_bar: p.expected_bar ?? '核不到',
      passed: checks.filter(c => c.status === 'PASS').length,
      failed: checks.filter(c => c.status === 'FAIL').length,
      other: checks.filter(c => c.status !== 'PASS' && c.status !== 'FAIL').length,
      not_passed: Array.isArray(p.not_passed) ? p.not_passed.length : 0,
    }
  })
  if (!rows.length) problems.push({ page: 'l2-acceptance', what: '还没有采集到任何一次验收（等 09:00 任务或手工跑一次 viz_capture.py）' })
  return { rows, manifest: manifests._l2_acceptance_history || null }
}

/* ── ③ 4h 回测三段 ─────────────────────────────────────────────────────── */
function bakeBacktest() {
  const p = path.join(ROOT, '_trader_4h_scratch', 'reports', 'backtest_metrics.json')
  if (!exists(p)) { problems.push({ page: 'backtest-4h', what: 'backtest_metrics.json 不存在' }); return { results: [], meta: null, manifest: manifests.backtest_metrics || null } }
  const j = readJson(p)
  return {
    results: Array.isArray(j.results) ? j.results : [],
    meta: { generated_at: j.generated_at, symbol: j.symbol, interval: j.interval, bars: j.bars, data_coverage: j.data_coverage, data_warnings: j.data_warnings },
    manifest: manifests.backtest_metrics || null,
  }
}

/* ── ④ 210 变体扫描（只留页面要显示的字段，避免把 93 KB 原件塞进页面） ── */
function bakeEdgeScan() {
  const keep = ['symbol', 'family', 'variant', 'dev_net_pct', 'oos_net_pct', 'oos_t', 'oos_trades_py', 'oos_excess_pct', 'verdict', 'concentration_top3_pct', 'concentration_passed']
  const out = {}
  for (const tf of ['1d', '4h']) {
    const p = path.join(REPORTS, `edge_scan_${tf}.json`)
    if (!exists(p)) { problems.push({ page: 'edge-scan', what: `edge_scan_${tf}.json 不存在` }); continue }
    const j = readJson(p)
    out[tf] = {
      counts: j.counts || null,
      variants: j.variants ?? (j.rows || []).length,
      bonferroni_t_threshold: j.bonferroni_t_threshold ?? null,
      generated_at: j.generated_at,
      rows: (j.rows || []).map(r => Object.fromEntries(keep.filter(k => k in r).map(k => [k, r[k]]))),
      manifest: manifests[`edge_scan_${tf}`] || null,
    }
  }
  return out
}

/* ── ⑤ carry 资金费：近 90 天「当日结算费率之和 × 365」（数据推断，带 formula） ── */
function bakeCarryFunding() {
  const SYMS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT']
  const FORMULA = '当日 Σ(各次结算 funding_rate) × 365'
  const series = {}
  for (const s of SYMS) {
    const p = path.join(DATA, `${s}_funding.csv`)
    if (!exists(p)) { problems.push({ page: 'carry-funding', what: `${s}_funding.csv 不存在` }); continue }
    const lines = readText(p).trim().split('\n')
    const perDay = new Map()
    for (let i = 1; i < lines.length; i++) {
      const [t, rate] = lines[i].split(',')
      if (!t || !rate) continue
      const d = t.slice(0, 10)
      perDay.set(d, (perDay.get(d) || 0) + Number(rate))
    }
    const days = [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-90)
    series[s] = { points: days.map(([d, v]) => [d, +(v * 365 * 100).toFixed(3)]), last: days.length ? days[days.length - 1][0] : '核不到' }
  }
  return { series, formula: FORMULA, manifest: manifests.BTCUSDT_funding || null }
}

/* ── ⑥ carry 现状复核：双数 + 窗口表 ───────────────────────────────────── */
function bakeCarryNow() {
  const recs = readJsonl(path.join(REPORTS, '_carry_now_history.jsonl'))
  const latest = recs.length ? recs[recs.length - 1].payload : null
  if (!latest) problems.push({ page: 'carry-now', what: '还没有采集到 carry 复核历史' })
  return {
    latest,
    captured_at: recs.length ? recs[recs.length - 1].captured_at_utc : null,
    // 双数里的一对来自规范原文，不是本脚本算的：见 docs/visual-standards.md §3 与 VS-01 §3
    documented_pair: {
      runbook: { value: '3.6%/年', tier: 'infer', window: 'runbook 回放层（90~180 天窗口）', cite: 'VS-01 §3' },
      measured: { value: '1.8–2.1%/年', tier: 'fact', window: '最近 30 天实测（按占用资本）', cite: 'VS-01 §3 / D-CARRY-*' },
    },
    manifest: manifests.carry_models || null,
  }
}

/* ── ⑦ 冻结/闸门记录（Markdown：只出 manifest 元数据，正文按契约不进渲染器） ── */
function bakeDocs() {
  const ids = ['FREEZE_4H_RULE', 'DECISION_LOG']
  return {
    items: ids.map(id => ({ id, manifest: manifests[id] || null })),
    note: '按契约 §2，渲染器只读 manifest 与其引用的数据文件，**不读 Markdown 正文**——所以这一页只呈现元数据与行数，正文请看仓库文件本身。',
  }
}

function bakeExpIndex() {
  return { id: 'EXPERIMENT_INDEX', manifest: manifests.EXPERIMENT_INDEX || null }
}

const pagesData = {
  // 首页不背明细数据，只用 manifests.json
  index: {},
  'l2-forward': bakeL2Forward(),
  'l2-acceptance': bakeL2Acceptance(),
  'backtest-4h': bakeBacktest(),
  'edge-scan': bakeEdgeScan(),
  'carry-funding': bakeCarryFunding(),
  'carry-now': bakeCarryNow(),
  'freeze-log': bakeDocs(),
  'exp-index': bakeExpIndex(),
}

/** 精简 manifest：页面只用到元数据条 + 状态 + 缺口计数，字段字典留在磁盘原件里 */
function trimManifest(m) {
  if (!m) return null
  const gaps = Array.isArray(m.gaps) ? m.gaps.length : 0
  const anomalies = Array.isArray(m.anomalies) ? m.anomalies : []
  return {
    schema_version: m.schema_version,
    artifact_id: m.artifact_id,
    artifact_path: m.artifact_path,
    artifact_sha256_16: String(m.artifact_sha256 || '').slice(0, 16),
    artifact_bytes: m.artifact_bytes,
    artifact_rows_incl_header: m.artifact_rows_incl_header,
    artifact_rows_excl_header: m.artifact_rows_excl_header,
    artifact_row_count_note: m.artifact_row_count_note,
    produced_at_utc: m.produced_at_utc,
    produced_by: m.produced_by,
    producer_sha256_16: String(m.producer_sha256 || '').slice(0, 16),
    source_kind: m.source?.kind ?? '核不到',
    source_endpoint: m.source?.endpoint ?? '核不到',
    source_timezone: m.source?.timezone ?? '核不到',
    coverage: m.coverage,
    verdict_layer: m.verdict_layer,
    status: m.status,
    returns_claimed: m.returns_claimed,
    cost_basis: m.cost_basis,
    chart_type: m.render_hints?.chart_type ?? '核不到',
    title: m.render_hints?.title ?? m.artifact_id,
    gap_count: gaps,
    anomaly_counts: anomalies.map(a => ({ rule_id: a.rule_id, count: a.count })),
    // 三档的机器键与判定代码指纹：都由数据根给出，渲染器不再自维护「中文名→类名」的映射表
    verdict_tier: m.verdict_tier ?? null,
    judgement_sha256_16: m.judgement_sha256 ? String(m.judgement_sha256).slice(0, 16) : null,
    // 陈旧判定的**规则**（阈值）来自数据根的共享判定模块 tools/verdict.py，随 manifest 下来。
    // 页面按查看时刻用这套阈值求值——阈值不在 JS 里写死，这是 #14 的要点。
    staleness: m.staleness ?? null,
  }
}

const trimmed = Object.fromEntries(Object.entries(manifests).map(([k, v]) => {
  const t = trimManifest(v)
  // 缺阈值就**不静默**（problems 的注释写着：缺口/核不到全部显式带到页面上）。
  // 但必须**按版本**判：契约 §6 明说 v1.0/v1.1 的存量件继续有效——自称 ≥1.2 却缺才是违约；
  // 早于 1.2 的件照样报（该页确实判不了陈旧），措辞上区分开，别把旧件说成违约。
  if (v && !v.staleness?.thresholds_hours) {
    const sv = String(v.schema_version || '1.0')
    const parts = sv.split('.').map(n => Number(n) || 0)
    const atLeast12 = parts[0] > 1 || (parts[0] === 1 && parts[1] >= 2)
    problems.push({
      page: t.artifact_id,
      what: atLeast12
        ? `manifest 缺 staleness.thresholds_hours，而它自称 schema_version ${sv}（契约 v1.2 起该字段必填）→ 该页陈旧档位不可判定`
        : `manifest 缺 staleness.thresholds_hours（schema_version ${sv}，早于 v1.2，按契约 §6 仍有效）→ 该页陈旧档位不可判定`,
    })
  }
  return [k, t]
}))

const PAGE_IDS = [
  'index',
  'l2-forward', 'l2-acceptance', 'backtest-4h', 'edge-scan',
  'carry-funding', 'carry-now', 'freeze-log', 'exp-index',
]

const OUT_DIR = path.resolve(HERE, '..', 'src', 'gen')
fs.mkdirSync(path.join(OUT_DIR, 'pages'), { recursive: true })

// 共享件：精简 manifest 表 + 烘焙元信息
fs.writeFileSync(
  path.join(OUT_DIR, 'manifests.json'),
  JSON.stringify({
    generated_at_utc: new Date().toISOString(),
    root: ROOT,
    manifest_count: Object.keys(trimmed).length,
    manifests: trimmed,
    problems,
  }, null, 2),
  'utf8'
)

// 每页一份：**每页只背自己的数据**（ADR-0001），避免单文件内联把 260 KB 全塞进每一页
const pageFiles = {}
for (const id of PAGE_IDS) {
  const payload = { page: id, generated_at_utc: new Date().toISOString(), data: pagesData[id] }
  const rel = `pages/${id}.json`
  fs.writeFileSync(path.join(OUT_DIR, id + '.json'), JSON.stringify(payload, null, 2), 'utf8')
  pageFiles[id] = `${(fs.statSync(path.join(OUT_DIR, id + '.json')).size / 1024).toFixed(1)} KB`
}

const total = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.json'))
  .reduce((s, f) => s + fs.statSync(path.join(OUT_DIR, f)).size, 0)
console.log(`[bake] manifests=${Object.keys(trimmed).length} problems=${problems.length} -> src/gen/ (共 ${(total / 1024).toFixed(1)} KB)`)
console.log(`[bake] 每页数据: ${Object.entries(pageFiles).map(([k, v]) => `${k}=${v}`).join('  ')}`)
for (const p of problems) console.log(`[bake] 缺口 ${p.page}: ${p.what}`)
