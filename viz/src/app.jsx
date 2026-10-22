import React from 'react'
import { createRoot } from 'react-dom/client'
import { StaleBar } from './shared.jsx'
import { PAGES, TITLES } from '../tools/pages.mjs'
import * as Pages from './pages.jsx'
import './styles.css'

const COMPONENTS = {
  index: Pages.IndexPage,
  'l2-forward': Pages.L2ForwardPage,
  'l2-acceptance': Pages.L2AcceptancePage,
  'backtest-4h': Pages.BacktestPage,
  'edge-scan': Pages.EdgeScanPage,
  'carry-funding': Pages.CarryFundingPage,
  'carry-now': Pages.CarryNowPage,
  'freeze-log': Pages.DocsPage,
  'exp-index': Pages.DocsPage,
}

function Shell({ page, data, manifests }) {
  const isIndex = page === 'index'
  const link = (id) => (isIndex ? `./pages/${id}.html` : (id === page ? '#' : `./${id}.html`))
  const home = isIndex ? './index.html' : '../index.html'

  // 陈旧判定（#9）：本页相关 manifest 的 coverage.end 最大值；首页看全量
  const ids = isIndex ? Object.keys(manifests.manifests) : relevantManifestIds(page, data)
  const ends = ids.map(id => manifests.manifests[id]?.coverage?.end_utc).filter(Boolean)

  const C = COMPONENTS[page] || Pages.IndexPage
  return (
    <>
      <header className="top">
        <div className="row">
          <h1>{TITLES[page] || page}</h1>
          <span className="meta">呈现层 · 只读 manifest 与其引用文件（契约 v1）</span>
        </div>
        <nav className="crumbs">
          <a href={home}>站点首页</a>
          {!isIndex && page !== 'index' ? <> · <a href={link('index')}>全部对象</a></> : null}
          {PAGES.filter(p => p !== 'index').map(p => (
            <React.Fragment key={p}>
              {' · '}
              {p === page ? <b>{TITLES[p]}</b> : <a href={link(p)}>{TITLES[p].replace(/^VS-[0-9.]+ /, '')}</a>}
            </React.Fragment>
          ))}
        </nav>
      </header>
      <StaleBar ends={ends} builtAt={manifests.generated_at_utc} />
      <main className="wrap">
        <C data={data} manifests={manifests} link={link} />
        {manifests.problems?.length ? (
          <div className="gap">
            <b>构建期报告的缺口（{manifests.problems.length}）</b>
            {manifests.problems.map((p, i) => <div key={i}>{p.page}：{p.what}</div>)}
          </div>
        ) : null}
        <div className="foot">
          烘焙时刻 {manifests.generated_at_utc} ｜ manifest {manifests.manifest_count} 份 ｜
          数据根 {manifests.root} ｜ 口径与视觉约定见 docs/visual-standards.md，架构见 docs/adr/0001
        </div>
      </main>
    </>
  )
}

/** 本页用到哪些 manifest（决定陈旧判定的取数范围） */
function relevantManifestIds(page, data) {
  const ids = new Set()
  const push = (m) => { if (m?.artifact_id) ids.add(m.artifact_id) }
  const d = data?.data || {}
  if (Array.isArray(d.items)) d.items.forEach(it => push(it.manifest))
  if (d.manifest) push(d.manifest)
  if (d['1d']?.manifest) push(d['1d'].manifest)
  if (d['4h']?.manifest) push(d['4h'].manifest)
  if (d.series && !d.manifest) Object.values(d.series).forEach(() => {})
  if (page === 'carry-funding') ['BTCUSDT_funding', 'ETHUSDT_funding', 'BNBUSDT_funding', 'XRPUSDT_funding', 'ADAUSDT_funding'].forEach(x => ids.add(x))
  return [...ids]
}

export function mount(page, data, manifests) {
  createRoot(document.getElementById('root')).render(
    <Shell page={page} data={data} manifests={manifests} />
  )
}
