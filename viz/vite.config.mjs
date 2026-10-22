/**
 * Vite 配置 —— 关键约束都来自 ADR-0001 与 docs/research/vite-echarts-offline.md：
 *  - base: './'            ：file:// 下的相对资源路径
 *  - viteSingleFile        ：把 JS/CSS 内联进单个 HTML（否则 ES module 在 file:// 被 CORS 拦，白屏且不报错）
 *  - 多入口                ：每对象一个 HTML，页间用相对链接；**不使用 router**（多入口下没必要，
 *                            也就绕开了 history 模式在 file:// 下 pathname 变成磁盘全路径的坑）
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PAGES } from './tools/pages.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const input = Object.fromEntries(
  PAGES.map(p => [p, path.resolve(__dirname, p === 'index' ? 'index.html' : `pages/${p}.html`)])
)

/**
 * 关键：**每页单独构建**（VIZ_PAGE 指定单页）。
 * 多入口一次构建时，rollup 会把 react/echarts 抽成 shared chunk，
 * 而单文件内联只处理入口 chunk → 产物里留一个指向不存在 .js 的 modulepreload，
 * file:// 下直接白屏。单页构建没有共享 chunk，才能真正内联干净。
 */
const only = process.env.VIZ_PAGE

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    // 暂存目录由 build-all.mjs 传进来：先建到 dist.next，自检通过后才切到 dist
    outDir: process.env.VIZ_OUTDIR || 'dist',
    emptyOutDir: false,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { input: only ? { [only]: input[only] } : input },
  },
})
