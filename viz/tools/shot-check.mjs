/**
 * shot-check.mjs —— 「目检」的机械替代：本模型不接受图像输入（`read_image` 直接报
 * `model ... does not declare image input`），所以把「看一眼」拆成机器能判的三件事：
 *
 *   ① 页面**不是空白**（非白像素占比）
 *   ② 页面**真的上了色**（不同颜色数；没上色往往是 CSS 没生效或图表没画）
 *   ③ 尺寸符合预期（宽 ≥ 1200）
 *
 * 这恰好覆盖本仓真实踩过的坑：单文件站点里 ECharts 没初始化时页面照旧有文字，
 * 但整页只剩一种颜色——当时靠截图**只有 8.7 KB** 才起的疑。现在变成一条断言。
 *
 * 它**不能**判断「好不好看」——那仍然需要图像能力的人或模型。所以本脚本的意义是
 * **缩小必须目检的范围**：先让它把空白/未上色/裁切筛掉，人只需要看剩下的。
 *
 * 零依赖：PNG 自己解（IHDR + IDAT + 行滤波），只用 node:zlib。
 *
 * 用法：node tools/shot-check.mjs [--edge <path>] [--extra <html 绝对路径>] [--keep] [--quiet]
 * 退出码：0 = 全部页面达标；1 = 有页面疑似空白 / 未上色 / 过窄
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PAGES } from './pages.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VIZ = path.resolve(HERE, '..')
const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const EDGE = argOf('--edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
const EXTRA = args.filter((a, i) => args[i - 1] === '--extra')
const KEEP = args.includes('--keep')
const QUIET = args.includes('--quiet')
const SHOT_DIR = path.join(VIZ, '.shots')
const WIDTH = Number(argOf('--width', '1280'))
const HEIGHT = Number(argOf('--height', '1400'))

/* ── PNG 解码（8 位、非隔行；本仓截图都是这种） ─────────────────────────── */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) throw new Error('不是 PNG')
  let off = 8, w = 0, h = 0, bd = 0, ct = 0, inter = 0
  const idat = []
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('latin1', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    off += 12 + len
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; inter = data[12] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
  }
  if (bd !== 8) throw new Error(`仅支持 8 位色深，实际 ${bd}`)
  if (inter) throw new Error('不支持隔行扫描')
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : ct === 0 ? 1 : 0
  if (!bpp) throw new Error(`不支持的 colorType ${ct}`)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const out = Buffer.alloc(h * stride)
  let p = 0
  for (let y = 0; y < h; y++) {
    const f = raw[p++]
    const line = raw.subarray(p, p + stride); p += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0
      let v = line[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[x] = v & 255
    }
  }
  return { w, h, bpp, data: out }
}

function stats(png) {
  const { w, h, bpp, data } = png
  let sampled = 0, ink = 0
  const colors = new Set()
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const i = (y * w + x) * bpp
      const r = data[i], g = bpp >= 3 ? data[i + 1] : r, b = bpp >= 3 ? data[i + 2] : r
      sampled++
      if (!(r > 245 && g > 245 && b > 245)) ink++
      if (colors.size < 4096) colors.add((r << 16) | (g << 8) | b)
    }
  }
  return { w, h, sampled, inkRatio: ink / sampled, colors: colors.size }
}

/* ── 逐页截图 + 判定 ───────────────────────────────────────────────────── */
fs.mkdirSync(SHOT_DIR, { recursive: true })
const jobs = PAGES.map(p => ({
  label: p,
  file: p === 'index' ? path.join(VIZ, 'dist', 'index.html') : path.join(VIZ, 'dist', 'pages', `${p}.html`),
})).concat(EXTRA.map((f, i) => ({ label: `extra:${path.basename(f)}`, file: path.resolve(f) })))

let failed = 0
if (!QUIET) console.log(`shot-check · ${WIDTH}×${HEIGHT} · 渲染器 ${path.basename(EDGE)}\n`)
console.log('页面'.padEnd(26) + '非白占比  颜色数   尺寸       判定')
for (const j of jobs) {
  if (!fs.existsSync(j.file)) { console.log(j.label.padEnd(26) + `—  文件不存在：${j.file}`); failed++; continue }
  const out = path.join(SHOT_DIR, `${j.label.replace(/[^a-zA-Z0-9_.-]/g, '_')}.png`)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'))
  const r = spawnSync(EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', `--user-data-dir=${tmp}`,
    '--virtual-time-budget=8000', `--window-size=${WIDTH},${HEIGHT}`, `--screenshot=${out}`,
    `file:///${j.file.replace(/\\/g, '/')}`], { encoding: 'utf8' })
  fs.rmSync(tmp, { recursive: true, force: true })
  if (!fs.existsSync(out)) { console.log(j.label.padEnd(26) + `—  截图失败：${(r.stderr || '').slice(-120)}`); failed++; continue }
  let s
  try { s = stats(decodePng(fs.readFileSync(out))) } catch (e) {
    console.log(j.label.padEnd(26) + `—  解码失败：${e.message}`); failed++; continue
  }
  const blank = s.inkRatio < 0.005
  const mono = s.colors < 6
  const narrow = s.w < 1200
  const why = [blank && '疑似空白', mono && '未上色', narrow && '宽度不足'].filter(Boolean)
  const verdict = why.length ? `✗ ${why.join(' / ')}` : '✓'
  console.log(j.label.padEnd(26) + `${(s.inkRatio * 100).toFixed(2)}%`.padEnd(11) +
    `${String(s.colors).padEnd(9)}${s.w}×${s.h}`.padEnd(11) + ` ${verdict}`)
  if (why.length) failed++
}
if (!KEEP) fs.rmSync(SHOT_DIR, { recursive: true, force: true })

console.log('')
if (failed) {
  console.log(`shot-check: **未通过**（${failed} 页）——这不能代替目检，但空白/未上色一类必须先排除`)
  process.exit(1)
}
console.log('shot-check: 全部页面非空白、已上色、宽度达标（**这仍不是目检**：好不好看需要图像能力的人或模型）')