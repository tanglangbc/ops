/**
 * build-all.mjs —— 逐页构建单文件 HTML。
 *
 * 为什么不用一次多入口构建：多入口时 react/echarts 会被抽成 shared chunk，
 * vite-plugin-singlefile 只内联入口 chunk，产物里会留下指向不存在 .js 的
 * <link rel="modulepreload">，file:// 打开直接白屏（且控制台才看得到线索）。
 * 逐页构建 = 每页只有一个 entry，内联才彻底。
 *
 * 每页构建后自检：产物 HTML 里**不允许**出现 <script src> / <link href> 外链。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PAGES } from './pages.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VIZ = path.resolve(__dirname, '..')
const distOf = (p) => path.join(VIZ, 'dist', p === 'index' ? 'index.html' : 'pages', p === 'index' ? '' : `${p}.html`)

fs.rmSync(path.join(VIZ, 'dist'), { recursive: true, force: true })

let failed = 0
for (const p of PAGES) {
  const r = spawnSync('npx', ['vite', 'build'], {
    cwd: VIZ, env: { ...process.env, VIZ_PAGE: p }, stdio: ['ignore', 'pipe', 'pipe'], shell: true,
  })
  const out = (r.stdout || '').toString() + (r.stderr || '').toString()
  if (r.status !== 0) { console.log(`[build] FAIL ${p}\n${out.slice(-800)}`); failed++; continue }
  const html = fs.readFileSync(distOf(p), 'utf8')
  const external = [...html.matchAll(/<(?:script|link)[^>]*(?:src|href)="([^"]+)"/g)].map(m => m[1])
  const size = (fs.statSync(distOf(p)).size / 1024).toFixed(1)
  if (external.length) {
    console.log(`[build] FAIL ${p} 仍含外链: ${external.join(', ')}`)
    failed++
  } else {
    console.log(`[build] OK   ${p.padEnd(15)} ${size} KB  单文件自洽`)
  }
}
console.log(failed ? `[build] ${failed} 页失败` : `[build] 全部 ${PAGES.length} 页通过`)
process.exit(failed ? 1 : 0)
