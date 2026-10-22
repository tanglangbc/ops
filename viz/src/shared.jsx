/**
 * 共享件：元数据条 / 档位徽标 / 状态徽标 / 缺口块 / 陈旧红条。
 * 全部按 docs/visual-standards.md 的约定实现，不要在这里另立口径。
 */

export const TIER_LABEL = {
  '已发生事实': 'fact', '数据推断': 'infer', '交易假设': 'hypo',
}
const tierOf = (v) => TIER_LABEL[v] || 'hypo'

export function TierBadge({ layer }) {
  const t = tierOf(layer)
  const text = t === 'hypo' ? '交易假设·未验证' : layer
  return <span className={`badge ${t}`}>{text}</span>
}

/** 状态只有三态（用户 2026-10-22 明确否决第四态）；不认识的取值一律显示为「证据不足」 */
export function VerdictBadge({ verdict }) {
  const v = String(verdict ?? '')
  if (v.includes('通过') && !v.includes('不')) return <span className="status pass">通过</span>
  if (v.includes('不通过') || v.includes('FAIL')) return <span className="status fail">不通过</span>
  return <span className="status insufficient">证据不足</span>
}

/** VS-01 §5 六项：来源 / 实验编号 / 口径 / 生成时刻 / 数据截止 / 档位。缺一即作废 */
export function MetaBar({ manifest, experiment, caliber, fallbackNote }) {
  if (!manifest) {
    return (
      <div className="metabar">
        <span className="k">元数据条</span>
        <span>核不到：本页没有对应 manifest，按 VS-01 §5 本图作废</span>
      </div>
    )
  }
  const src = `${manifest.artifact_path} · sha ${manifest.artifact_sha256_16}…`
  const gen = (manifest.produced_at_utc || '核不到')
  const cov = manifest.coverage?.end_utc || '核不到'
  return (
    <div className="metabar">
      <span><span className="k">来源</span> {src}</span>
      <span><span className="k">实验编号</span> {experiment || '核不到'}</span>
      <span><span className="k">口径</span> {caliber || manifest.cost_basis || '核不到'}</span>
      <span><span className="k">生成时刻</span> {gen}</span>
      <span><span className="k">数据截止</span> {cov}</span>
      <span><span className="k">档位</span> {manifest.verdict_layer}</span>
      {fallbackNote ? <span>{fallbackNote}</span> : null}
    </div>
  )
}

/** 图级缺口：必须显式，不许留白让人以为没算 */
export function Gap({ title = '核不到', children }) {
  return <div className="gap"><b>{title}</b>{children}</div>
}

export function Legend() {
  return (
    <div className="legend">
      <span><i className="sw fact" />已发生事实：实线框 + 正常色</span>
      <span><i className="sw infer" />数据推断：虚线框 + 斜纹（带 formula）</span>
      <span><i className="sw hypo" />交易假设：点线框 + 灰显，标「未验证」</span>
      <span style={{ color: 'var(--muted)' }}>档位不靠颜色区分——黑白打印与色盲下同样可辨</span>
    </div>
  )
}

/**
 * #9 的陈旧判定：manifest.coverage.end（数据侧）与页面构建时刻（站点侧）任一超 36h 即陈旧；
 * 连续 3 天 → 严重陈旧。这里只看数据侧（站点侧由构建时刻兜底，构建器会写入）。
 */
export function StaleBar({ ends = [], builtAt }) {
  const now = Date.now()
  const parsed = ends.map(e => Date.parse(e)).filter(t => !Number.isNaN(t))
  if (!parsed.length && !builtAt) return null
  const newest = parsed.length ? Math.max(...parsed) : Date.parse(builtAt)
  const hours = (now - newest) / 3600e3
  if (hours <= 36) return null
  const severe = hours > 72
  const when = new Date(newest).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  return (
    <div className="stale-bar">
      <b>{severe ? '严重陈旧' : '本页数据陈旧'}</b>
      ：数据停留在 {when}（距今 {Math.round(hours)} 小时，阈值 36 小时）
      {severe ? '　连续 3 天以上未刷新' : ''}
    </div>
  )
}

export function Card({ title, sub, right, children }) {
  return (
    <section className="card">
      <div className="objtitle">
        <h3 style={{ margin: 0 }}>{title}</h3>
        {sub ? <span className="id">{sub}</span> : null}
        <span style={{ flex: 1 }} />
        {right}
      </div>
      {children}
    </section>
  )
}

export const fmt = (v, digits = 2) => (v === null || v === undefined || Number.isNaN(v) ? '核不到' : Number(v).toFixed(digits))
