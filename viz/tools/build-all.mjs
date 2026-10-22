/**
 * build-all.mjs —— 逐页构建单文件 HTML，并**先建到暂存目录、通过自检后再原子切换**。
 *
 * 两个关键决定：
 * 1. **逐页构建**：多入口时 react/echarts 会被抽成 shared chunk，`vite-plugin-singlefile`
 *    只内联入口 chunk，产物会留下指向不存在 .js 的 modulepreload → file:// 白屏且不报错。
 * 2. **暂存 + 切换**：夜间任务中途失败时，不能把用户正在双击的 `dist/` 留成半成品。
 *    一切成功后才把 `dist` 换成新的，旧的留成 `dist.prev` 供一键回滚。
 *
 * 不依赖 PATH：直接用本仓 node_modules 里的 vite bin + 当前 node 可执行文件。
 *
 * 用法：node tools/build-all.mjs [--out dist] [--no-swap]
 * 退出码：0 = 全部页面通过并已切换；1 = 有页面失败（dist 保持不变）
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PAGES } from './pages.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VIZ = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const noSwap = args.includes('--no-swap')
const OUT_NAME = argOf('--out', 'dist')
const DIST = path.join(VIZ, OUT_NAME === 'dist' ? 'dist' : OUT_NAME)
const STAGE = path.join(VIZ, 'dist.next')
const PREV = path.join(VIZ, 'dist.prev')

const VITE_BIN = path.join(VIZ, 'node_modules', 'vite', 'bin', 'vite.js')
if (!fs.existsSync(VITE_BIN)) {
  console.error(`[build] 找不到本地 vite：${VITE_BIN}（先 pnpm install）`)
  process.exit(1)
}

fs.rmSync(STAGE, { recursive: true, force: true })
const htmlOf = (root, p) => path.join(root, p === 'index' ? 'index.html' : 'pages', p === 'index' ? '' : `${p}.html`)

let failed = 0
const results = []
for (const p of PAGES) {
  const r = spawnSync(process.execPath, [VITE_BIN, 'build'], {
    cwd: VIZ,
    env: { ...process.env, VIZ_PAGE: p, VIZ_OUTDIR: path.basename(STAGE) },
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    console.log(`[build] FAIL ${p}`)
    console.log((r.stdout || '') + (r.stderr || ''))
    failed++
    continue
  }
  const file = htmlOf(STAGE, p)
  if (!fs.existsSync(file)) { console.log(`[build] FAIL ${p} 未产出 HTML`); failed++; continue }
  const html = fs.readFileSync(file, 'utf8')
  const external = [...html.matchAll(/<(?:script|link)[^>]*(?:src|href)="([^"]+)"/g)].map(m => m[1])
  const kb = (fs.statSync(file).size / 1024).toFixed(1)
  if (external.length) {
    console.log(`[build] FAIL ${p} 仍含外链: ${external.join(', ')}`)
    failed++
  } else {
    console.log(`[build] OK   ${p.padEnd(15)} ${kb} KB  单文件自洽`)
    results.push({ page: p, kb: Number(kb) })
  }
}

if (failed) {
  fs.rmSync(STAGE, { recursive: true, force: true })
  console.log(`[build] ${failed} 页失败——**dist 未被改动**（暂存目录已清理）`)
  process.exit(1)
}

if (!noSwap) {
  fs.rmSync(PREV, { recursive: true, force: true })
  if (fs.existsSync(DIST)) fs.renameSync(DIST, PREV)   // 旧的留作回滚点
  fs.renameSync(STAGE, DIST)
  console.log(`[build] 全部 ${PAGES.length} 页通过 → 已切换到 ${OUT_NAME}/（旧的留在 dist.prev/ 供回滚）`)
} else {
  console.log(`[build] 全部 ${PAGES.length} 页通过（--no-swap：产物留在 ${path.basename(STAGE)}/）`)
}
console.log(`[build] SUMMARY ${JSON.stringify({ pages: results.length, totalKB: results.reduce((s, r) => s + r.kb, 0).toFixed(1) })}`)