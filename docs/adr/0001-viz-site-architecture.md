# 可视化站点：每对象一个单文件 HTML，构建期烘焙数据

**Status**: accepted（2026-10-22 · 地图 #1 / 站点架构 #4）

代币群研究成果的呈现层要求「双击 `file://` 就能打开」，而 `file://` 会把 ES module 与 `fetch` 一起拦掉（见 `docs/research/vite-echarts-offline.md`）。因此数据必须在构建期烘焙进页面；又不能把 1.85 MB 全量数据（其中 1.6 MB 是五品种逐 8h 的资金费 CSV）塞进一个 HTML。决定：**每个可视对象产出一个独立的单文件 HTML**（`base:'./'` + `vite-plugin-singlefile` + HashRouter），由 `index.html` 导航；**构建期**把 manifest 与其引用的数据烘焙成每页专属的 JSON 模块，前端只 import 烘焙结果，运行时不读群目录、不 fetch。

## Considered Options

- **单页 8 tab 全内联**：每次打开都背 1.85 MB，而 L2 台账页其实只有 44 KB。否。
- **单页 SPA + 运行时 fetch / 动态 import**：`file://` 下被 CORS 拦（`vite-echarts-offline.md` 有控制台原文），等于偷偷放弃离线。否。
- **运行时直接读群目录的 manifest**：会让「删产物重跑字节一致」这条验收失去意义（页面内容随外部文件变）。否。

## Consequences

- 每页一份产物 → sha 可逐页登记，改一页不污染其他页的字节比对。
- 数据更新必须重跑构建（由 #5 挂进每日任务）。
- 资金费按两档呈现：**全历史按日聚合曲线**（标「数据推断」+ formula 写进 manifest `render_hints`）与 **30/90/365 天窗口逐行明细**（可直连文件+行号），满足 VS-01 §4.2 的可追溯要求。
- 构建产物 `D:\ops\viz\dist\` **不入库**（`D:\ops` 是公开仓库）；每次构建留 `SHA256SUMS`。交付给人时把单个 HTML 拷到 `D:\workspace\代币交流群\viz\deliver\`，并按 VS-01 §4 附则逐件登记 sha。
- **不**新增 VS-2.9：§2 登记的是「可可视化的研究成果对象（数据源）」，站点是渲染器产物，不是研究对象。
- 渲染器由 manifest 驱动（读 `render_hints.chart_type` → 有限图表类型），对象专属逻辑只允许进 `src/overrides/` 白名单，且新增一处必须在 README 登记一行。
