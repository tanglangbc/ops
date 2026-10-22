import React from 'react'
import { Chart } from './charts.jsx'
import { MetaBar, VerdictBadge, TierBadge, Gap, Legend, Card, fmt } from './shared.jsx'

const lineColor = (tier) => tier === 'infer' ? '#b26a00' : (tier === 'hypo' ? '#6e7781' : '#1f6feb')

/* ── 首页 ─────────────────────────────────────────────────────────────── */
export function IndexPage({ manifests, link }) {
  const ids = Object.values(manifests.manifests)
  const byObject = [
    ['l2-forward', 'VS-2.1 L2 前向台账', 'manifest: L2_FORWARD_LEDGER'],
    ['l2-acceptance', 'VS-2.2 L2 验收结果', 'manifest: _l2_acceptance_history'],
    ['backtest-4h', 'VS-2.3 4h 回测三段', 'manifest: backtest_metrics'],
    ['edge-scan', 'VS-2.4 210 变体扫描', 'manifest: edge_scan_1d / _4h'],
    ['carry-funding', 'VS-2.5 carry 资金费', 'manifest: BTCUSDT_funding 等 5 份'],
    ['carry-now', 'VS-2.6 carry 现状复核', 'manifest: _carry_now_history / carry_models'],
    ['freeze-log', 'VS-2.7 冻结/闸门记录', 'manifest: FREEZE_4H_RULE / DECISION_LOG'],
    ['exp-index', 'VS-2.8 实验索引', 'manifest: EXPERIMENT_INDEX'],
  ]
  const find = (key) => ids.find(m => m.artifact_id === key)
  return (
    <>
      <Legend />
      <div className="grid idx">
        {byObject.map(([id, title, mdesc]) => {
          const m = find(mdesc.replace('manifest: ', '').split(' / ')[0].split(' 等')[0])
          return (
            <a key={id} href={link(id)} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card" style={{ height: '100%' }}>
                <div className="objtitle">
                  <h3 style={{ margin: 0 }}>{title}</h3>
                  <span style={{ flex: 1 }} />
                  {m ? <VerdictBadge verdict={m.status} /> : <span className="status insufficient">证据不足</span>}
                </div>
                <div className="kv">
                  <span>{mdesc}</span>
                </div>
                {m ? (
                  <div className="kv" style={{ marginTop: 6 }}>
                    <span>数据截止 {m.coverage?.end_utc || '核不到'}</span>
                    <span>缺口 {m.gap_count}</span>
                    <span>档位 {m.verdict_layer}</span>
                  </div>
                ) : (
                  <Gap title="核不到">本对象暂无 manifest —— 按 VS-01 §5 不得出图</Gap>
                )}
              </div>
            </a>
          )
        })}
      </div>
    </>
  )
}

/* ── VS-2.1 台账 ─────────────────────────────────────────────────────── */
export function L2ForwardPage({ data }) {
  const d = data.data
  const dates = d.series.map(s => s.date)
  const mk = (name, key, color) => ({
    name, type: 'bar', stack: 'total', data: d.series.map(s => s[key]),
    itemStyle: { color }, barMaxWidth: 18,
  })
  const option = dates.length ? {
    tooltip: { trigger: 'axis' },
    legend: { data: ['daily', 'backfill', 'correction'], top: 0 },
    grid: { left: 44, right: 16, top: 34, bottom: 46 },
    xAxis: { type: 'category', data: dates, axisLabel: { rotate: 45, fontSize: 10 } },
    yAxis: { type: 'value', name: '条数' },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 8 }],
    series: [mk('daily', 'daily', '#1f6feb'), mk('backfill', 'backfill', '#b26a00'), mk('correction', 'correction', '#6e7781')],
  } : null
  return (
    <>
      <MetaBar manifest={d.manifest} experiment="MSS002-L2-FORWARD" caliber="按记录日计数；kind = daily/backfill/correction（correction 为作废行）" />
      <Legend />
      <Card title="按记录日的台账条数（含 kind 分层）" sub={`共 ${d.rows} 行`}
        right={<span className="badge fact">已发生事实</span>}>
        <Chart option={option} />
        {!dates.length ? <Gap title="核不到">台账没有任何行</Gap> : null}
        <div className="kv" style={{ marginTop: 8 }}>
          <span>daily {d.kinds.daily}</span><span>backfill {d.kinds.backfill}</span>
          <span>correction {d.kinds.correction}</span>
          <span>行数口径：manifest 注明 incl/excl header</span>
        </div>
      </Card>
    </>
  )
}

/* ── VS-2.2 验收 ─────────────────────────────────────────────────────── */
export function L2AcceptancePage({ data }) {
  const d = data.data
  return (
    <>
      <MetaBar manifest={d.manifest} experiment="MSS002-L2-ACCEPTANCE" caliber="四态 PASS/FAIL/NOT_YET/UNKNOWN 由验收器给出；UNKNOWN 不得当通过" />
      <Card title="验收历史（采集器每日 09:00 追加）" sub={`${d.rows.length} 次`}>
        {d.rows.length ? (
          <div className="tablewrap">
            <table>
              <thead><tr><th>记录日</th><th>判定</th><th>退出码</th><th>期望 bar</th><th>PASS</th><th>FAIL</th><th>其他</th><th>检查时刻</th></tr></thead>
              <tbody>
                {d.rows.map(r => (
                  <tr key={r.record_date}>
                    <td className="num">{r.record_date}</td>
                    <td><VerdictBadge verdict={r.verdict} /> <span className="num">{r.verdict}</span></td>
                    <td className="num">{r.exit_code}</td>
                    <td className="num">{r.expected_bar}</td>
                    <td className="num pos">{r.passed}</td>
                    <td className="num neg">{r.failed}</td>
                    <td className="num">{r.other}</td>
                    <td className="num">{r.checked_at_cst}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Gap title="核不到">还没有采集到任何一次验收（等每日 09:00 任务，或手工跑一次 <code>python tools/viz_capture.py</code>）</Gap>}
      </Card>
    </>
  )
}

/* ── VS-2.3 回测三段 ─────────────────────────────────────────────────── */
export function BacktestPage({ data }) {
  const d = data.data
  const rows = d.results || []
  const cols = rows.length ? Object.keys(rows[0]) : []
  return (
    <>
      <MetaBar manifest={d.manifest} experiment="XV-001" caliber={d.meta ? `symbol=${d.meta.symbol} interval=${d.meta.interval} bars=${d.meta.bars}` : undefined} />
      <Card title="三段回测结果" sub={d.meta?.data_coverage || ''}>
        {rows.length ? (
          <div className="tablewrap">
            <table>
              <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>{cols.map(c => <td key={c} className="num">{typeof r[c] === 'number' ? fmt(r[c], 4) : String(r[c] ?? '核不到')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Gap title="核不到">results 为空</Gap>}
        {d.meta?.data_warnings ? (
          <Gap title="数据警告（原始件自带）">{JSON.stringify(d.meta.data_warnings)}</Gap>
        ) : null}
      </Card>
    </>
  )
}

/* ── VS-2.4 变体扫描 ─────────────────────────────────────────────────── */
export function EdgeScanPage({ data }) {
  const d = data.data
  const tf = d['1d'] || d['4h']
  const name = d['1d'] ? '1d' : '4h'
  const rows = tf?.rows || []
  const sorted = [...rows].sort((a, b) => (b.oos_net_pct ?? -1e9) - (a.oos_net_pct ?? -1e9)).slice(0, 40)
  const scatter = rows.length ? {
    tooltip: { formatter: p => `${p.data[2]}<br/>dev ${fmt(p.data[0])}% / oos ${fmt(p.data[1])}%` },
    grid: { left: 52, right: 16, top: 24, bottom: 40 },
    xAxis: { type: 'value', name: 'dev_net_pct' },
    yAxis: { type: 'value', name: 'oos_net_pct' },
    series: [{
      type: 'scatter', symbolSize: 6,
      data: rows.map(r => [r.dev_net_pct, r.oos_net_pct, r.variant]),
      itemStyle: { color: 'rgba(31,111,235,.55)' },
    }],
  } : null
  return (
    <>
      <MetaBar manifest={tf?.manifest} experiment="210 变体扫描" caliber={`interval=${name}；冻结 2026-10-21`} />
      <Card title={`dev vs oos 散点（${rows.length} 个变体）`}
        right={<><span className="badge fact">已发生事实</span>{tf?.counts ? <span className="status insufficient" style={{ marginLeft: 6 }}>noise {tf.counts.noise} / dead {tf.counts.dead}</span> : null}</>}>
        <Chart option={scatter} height={320} />
      </Card>
      <Card title="按样本外净收益排序（前 40）" sub="完整 135 行的原件在 reports/edge_scan_*.json，本页只装展示所需字段">
        {sorted.length ? (
          <div className="tablewrap">
            <table>
              <thead><tr><th>symbol</th><th>family</th><th>variant</th><th>dev%</th><th>oos%</th><th>oos_t</th><th>verdict</th></tr></thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={i}>
                    <td>{r.symbol}</td><td>{r.family}</td>
                    <td style={{ maxWidth: 320 }}>{r.variant}</td>
                    <td className={`num ${r.dev_net_pct > 0 ? 'pos' : 'neg'}`}>{fmt(r.dev_net_pct)}</td>
                    <td className={`num ${r.oos_net_pct > 0 ? 'pos' : 'neg'}`}>{fmt(r.oos_net_pct)}</td>
                    <td className="num">{fmt(r.oos_t, 2)}</td>
                    <td>{r.verdict ?? '核不到'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Gap title="核不到">没有变体行</Gap>}
      </Card>
    </>
  )
}

/* ── VS-2.5 资金费 ───────────────────────────────────────────────────── */
export function CarryFundingPage({ data }) {
  const d = data.data
  const syms = Object.keys(d.series || {})
  const option = syms.length ? {
    tooltip: { trigger: 'axis' },
    legend: { data: syms, top: 0, type: 'scroll' },
    grid: { left: 52, right: 18, top: 34, bottom: 34 },
    xAxis: { type: 'category', data: (d.series[syms[0]]?.points || []).map(p => p[0]), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', name: '年化 %' },
    series: syms.map((s, i) => ({
      name: s, type: 'line', showSymbol: false, smooth: false,
      data: (d.series[s]?.points || []).map(p => p[1]),
      lineStyle: { color: ['#1f6feb', '#b26a00', '#6e7781', '#15803d', '#9333ea'][i % 5] },
      itemStyle: { color: ['#1f6feb', '#b26a00', '#6e7781', '#15803d', '#9333ea'][i % 5] },
    })),
  } : null
  return (
    <>
      <MetaBar manifest={d.manifest} experiment="CARRY/FUNDING" caliber={d.formula} />
      <Card title="近 90 天资金费年化（5 品种）"
        right={<span className="badge infer">数据推断 · formula：{d.formula}</span>}>
        <Chart option={option} height={320} />
        <div className="kv" style={{ marginTop: 8 }}>
          {syms.map(s => <span key={s}>{s} 末笔 {d.series[s].last}</span>)}
        </div>
        <Gap title="口径说明">
          本图是**派生序列**：按 UTC 日把当日各次结算费率求和后 × 365，不是逐笔原值。
          逐笔原值在 <code>binance-spot-quant/data/*_funding.csv</code>，可追文件+行号。
        </Gap>
      </Card>
    </>
  )
}

/* ── VS-2.6 carry 现状复核 ───────────────────────────────────────────── */
export function CarryNowPage({ data }) {
  const d = data.data
  const p = d.latest
  const pair = d.documented_pair
  const w = p?.funding || {}
  const syms = Object.keys(w)
  const windows = ['7', '30', '90', '180']
  return (
    <>
      <MetaBar manifest={d.manifest} experiment="CARRY-NOW-RECHECK"
        caliber="资金费 3 次/日 × 365；占用资本 = 名义 × 1.25"
        fallbackNote={d.captured_at ? `采集于 ${d.captured_at}` : undefined} />
      <Legend />
      <Card title="双数同画（规范红线：只画左边即违规）">
        <div className="dual">
          <div className={`d tier tier-${pair.runbook.tier}`}>
            <div className="v" style={{ color: lineColor(pair.runbook.tier) }}>{pair.runbook.value}</div>
            <div className="cap">runbook 回放层（不是实测）· {pair.runbook.window} · 依据 {pair.runbook.cite}</div>
          </div>
          <div className={`d tier tier-${pair.measured.tier}`}>
            <div className="v" style={{ color: lineColor(pair.measured.tier) }}>{pair.measured.value}</div>
            <div className="cap">最近 30 天实测 · {pair.measured.window} · 依据 {pair.measured.cite}</div>
          </div>
        </div>
        <div className="kv"><TierBadge layer="数据推断" /><TierBadge layer="已发生事实" /></div>
      </Card>
      <Card title="各品种窗口年化（来自最近一次采集的结构化输出）"
        right={p ? <span className="badge fact">已发生事实</span> : null}>
        {syms.length ? (
          <div className="tablewrap">
            <table>
              <thead><tr><th>品种</th><th>末笔结算</th>{windows.map(x => <th key={x}>{x} 天年化</th>)}<th>2023+ 年化</th></tr></thead>
              <tbody>
                {syms.map(s => (
                  <tr key={s}>
                    <td>{s}</td>
                    <td className="num">{w[s].last_settlement?.slice(0, 19) || '核不到'}</td>
                    {windows.map(x => {
                      const e = w[s].windows?.[x]
                      return <td key={x} className={`num ${e?.ann_pct > 0 ? 'pos' : 'neg'}`}>{e ? fmt(e.ann_pct) : '核不到'}{e?.negative != null ? <span style={{ color: 'var(--muted)' }}> (负 {e.negative})</span> : null}</td>
                    })}
                    <td className={`num ${w[s].since2023?.ann_pct > 0 ? 'pos' : 'neg'}`}>{fmt(w[s].since2023?.ann_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Gap title="核不到">还没有采集到 carry 复核历史</Gap>}
        {p?.gaps?.length ? <Gap title="本次复核报告的缺口">{p.gaps.map((g, i) => <div key={i}>{g.rule_id} · {g.sym} · {g.detail}</div>)}</Gap> : null}
      </Card>
    </>
  )
}

/* ── VS-2.7 / VS-2.8 文档类：只出元数据 ─────────────────────────────── */
export function DocsPage({ data }) {
  const d = data.data
  const items = d.items || [{ id: d.id, manifest: d.manifest }]
  return (
    <>
      <Gap title="契约约束：正文不进呈现层">
        {d.note || '按契约 §2，渲染器只读 manifest 与其引用的数据文件，**不读 Markdown 正文**。因此本页只呈现元数据与行数。'}
      </Gap>
      {items.map(it => (
        <Card key={it.id} title={it.id} sub={it.manifest?.artifact_path}>
          <MetaBar manifest={it.manifest} experiment={it.id} caliber="文档件：无费率/滑点口径" />
          <div className="kv">
            <span>行数 {it.manifest?.artifact_rows_incl_header ?? '核不到'}</span>
            <span>{it.manifest?.artifact_row_count_note || ''}</span>
            <span>字节 {it.manifest?.artifact_bytes ?? '核不到'}</span>
          </div>
        </Card>
      ))}
    </>
  )
}
