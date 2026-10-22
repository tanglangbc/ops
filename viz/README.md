# 代币量化研究成果 · 可视化站点（VS-01 呈现层）

> 这是**呈现层**：只把已有研究结论画出来，不产生数字、不改口径。
> 架构决定见 [docs/adr/0001-viz-site-architecture.md](../../docs/adr/0001-viz-site-architecture.md)，
> 视觉约定见 [docs/visual-standards.md](../../docs/visual-standards.md)，规范原文是 `D:\workspace\代币交流群\research\VS_01_可视化规范.md`。

## 一句话

**每对象一个单文件 HTML**，数据在**构建期**从 manifest 烘焙进页面；`pnpm build` 后双击 `dist/index.html` 就能看，不需要服务器、不需要联网。

## 怎么跑

```powershell
cd D:\ops\viz
pnpm install            # 首次
pnpm bake               # 读 manifest + 数据 → src/gen/*.json（每页一份）
pnpm gen:html           # 生成 index.html + pages/*.html + src/entries/*.jsx
pnpm build              # = bake + gen:html + build-all（逐页单文件构建）
```

开发态：`pnpm dev`（Vite dev server，热更新）。

## 目录

```
viz/
├─ tools/
│  ├─ build-data.mjs    # 构建期烘焙：manifest + 数据 → src/gen/（**渲染器不得另算统计**）
│  ├─ gen-html.mjs      # 生成 9 个入口 HTML 与对应入口脚本
│  ├─ build-all.mjs     # 逐页单文件构建 + 自检（产物里不许有外链）
│  └─ pages.mjs         # 页面清单（唯一真源）
├─ src/
│  ├─ app.jsx           # 外壳：头部导航、陈旧红条、页面分发
│  ├─ pages.jsx         # 8 个对象页 + 首页
│  ├─ shared.jsx        # 元数据条 / 档位徽标 / 状态徽标 / 缺口块 / 陈旧判定
│  ├─ charts.jsx        # ECharts 壳（只吃 option）
│  ├─ styles.css        # 视觉 token 移植自 docs/visual-standards.md §2
│  ├─ entries/          # 生成物：每页一个入口（只 import 本页数据）
│  └─ gen/              # 生成物：manifests.json + 每页 <page>.json
├─ index.html / pages/  # 生成物：9 个入口
└─ dist/                # 产物（**不入库**）；交付时拷到群目录并登记 sha
```

## 三条硬约束（踩过才知道）

1. **逐页构建，不能一次多入口**：多入口时 react/echarts 会被抽成 shared chunk，`vite-plugin-singlefile` 只内联入口 chunk，产物里会留下指向不存在 `.js` 的 `<link rel="modulepreload">` → `file://` 下白屏且不报错。`build-all.mjs` 每页单独构建并**自检产物无外链**。
2. **ECharts 必须全量引入**：`echarts/core` + 按需注册在 rolldown 产物里会在 `init` 阶段抛 `TypeError: ... is not a constructor`（注册被内联后失效）。全量引入可用，代价是每页约 +560 KB（gzip +200 KB）。
3. **不要在渲染器里做统计**：所有数字来自 `src/gen/*.json`（构建期烘焙）与 manifest。图上要新数字，先去上游脚本产 manifest。

## 每页带什么

- **VS-01 §5 六项元数据条**：来源（路径 + sha 前 16）｜实验编号｜口径｜生成时刻｜数据截止｜档位。
- **三档标注**：实线框 / 虚线+斜纹 / 点线+灰显，不依赖颜色（黑白打印与色盲可辨）。
- **缺口显式**：图级「核不到」灰块；页面级陈旧红条（>36h，连续 3 天升级）。
- 状态只有 **通过 / 不通过 / 证据不足** 三态（用户 2026-10-22 否决第四态）。

## 数据从哪来

`D:\workspace\代币交流群\viz\manifests\*.manifest.json`（16 份）+ 它们引用的数据文件。
采集两个「原本只打 stdout」的对象由 `tools/viz_capture.py` + 计划任务 `\mss002-viz-capture`（每日 09:00）负责。

## 交付

构建产物不入库。要给人看时：把 `dist/**/*.html` 拷到 `D:\workspace\代币交流群\viz\deliver\`，
并在该目录的 `DELIVER_LOG.md` 里逐件登记 sha（依据 VS-01 §4 附则与 ADR-0001）。
