/**
 * gen-html.mjs —— 生成 9 个入口 HTML（index + 8 个对象页）。
 * 之所以用生成而不是手写 9 份：导航栏/头部完全一致，手写必然漂移。
 * 每页只有：<body data-page="..."> + #root + 同一个入口脚本。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PAGES, TITLES } from './pages.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VIZ = path.resolve(__dirname, '..')
const ROOT = path.resolve(VIZ, '..')

const html = (page) => {
  const isIndex = page === 'index'
  const depth = isIndex ? '.' : '..'
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${TITLES[page]}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script type="module" src="${depth}/src/entries/${page}.jsx"></script>
</head>
<body data-page="${page}" data-root="${depth}">
<div id="root"></div>
<noscript>本页需要 JavaScript（产物是单文件内联，不需要网络）。</noscript>
</body>
</html>
`
}

/**
 * 每页一个入口文件：只 import **本页**的烘焙数据。
 * 这样单文件内联时，每页只背自己的那几 KB，而不是把全部数据塞进每一页（ADR-0001）。
 */
const entry = (page) => `// 由 tools/gen-html.mjs 生成，勿手改（改生成器）
import { mount } from '../app.jsx'
import data from '../gen/${page}.json'
import manifests from '../gen/manifests.json'

mount('${page}', data, manifests)
`

fs.mkdirSync(path.join(VIZ, 'pages'), { recursive: true })
fs.mkdirSync(path.join(VIZ, 'src', 'entries'), { recursive: true })
for (const p of PAGES) {
  const file = p === 'index' ? path.join(VIZ, 'index.html') : path.join(VIZ, 'pages', `${p}.html`)
  fs.writeFileSync(file, html(p), 'utf8')
  fs.writeFileSync(path.join(VIZ, 'src', 'entries', `${p}.jsx`), entry(p), 'utf8')
}
console.log(`[gen-html] 生成 ${PAGES.length} 个入口 + ${PAGES.length} 个入口脚本 -> ${path.relative(ROOT, VIZ)}/{index.html,pages/*.html,src/entries/*.jsx}`)
