# Vite + React + ECharts 离线站点可行性验证

> 验证时间：2026-10-22 13:20–13:35（Asia/Shanghai）
> 方法：全部结论来自本机真实命令输出与浏览器控制台原始报错。**没有一条是推断**；推断不了的项目集中列在文末「核不到」。
> 实验目录：`D:\ops\.tmp-research\`（未触碰 `D:\ops` 其他文件，未在仓库根建 package.json，全程无 git 操作）
> 环境：Windows / node v24.19.0 / npm 11.17.0 / pnpm 12.9.1 / Edge（仅用于无头验证 `file://`）

---

## 0. 结论（先读这段）

| 问题 | 硬结论 | 依据小节 |
|---|---|---|
| 能否安装依赖 | **能**（本机有网；代理已配且非必需） | §1 |
| 断网冷启动能否装 | **不能**。pnpm 与 npm 各有一条确定性报错，不是网络抖动 | §2 |
| 本机复用现有安装能否离线构建 | **能**。把 exit proxy 指向关闭端口后 `vite build` 仍成功 | §2.4 |
| 构建产物能否字节比对 | **能**。两次构建 + 换目录构建，SHA-256 完全一致，content hash 文件名一致 | §3 |
| ECharts 能否离线打进产物 | **能**。按需引入后 751.20 kB(248.27 kB gzip)，全量 1,378.34 kB(453.60 kB gzip) | §4 |
| `file://` 双击能否打开 **默认** Vite 产物 | **不能**。ES module 被 CORS 拦死，`#root` 空 | §5.1 |
| `file://` 双击能否打开 **内联单文件** 产物 | **能**。React 挂载 + ECharts 真实 `<canvas 520x320>` | §5.2 |
| 路由该用哪种 | **必须 hash（或 memory）**。history 模式在 `file://` 下 pathname 是磁盘全路径，路由必然不匹配 | §5.3 |

**给架构票 C 的一句话**：`base: './'` + `vite-plugin-singlefile` 内联 + **HashRouter**，三者同时成立才能双击打开；缺任一条都会得到白屏（且白屏不报错，只在控制台有 CORS / 路由不匹配）。

---

## 1. 网络可达性（本题不是假设，是实测）

### 1.1 `npm ping`

```console
$ npm ping
npm notice PING https://registry.npmjs.org/
npm notice PONG 760ms
```
→ registry 可达。

### 1.2 版本查询

```console
$ npm view vite version
8.3.5
$ npm view echarts version
6.1.0
```

顺带取到的相关版本（同一命令族）：

```console
$ npm view @vitejs/plugin-react version   → 6.1.2
$ npm view react version                  → 19.3.1
$ npm view react-dom version              → 19.3.1
$ npm view react-router-dom version       → 7.18.4
$ npm view vite engines.node              → ^20.19.0 || >=22.12.0
```

本机 node v24.19.0 满足 vite 8 的 engines 要求。

### 1.3 代理现状：**已经配好了，而且不是必需品**

```console
$ npm config get registry      → https://registry.npmjs.org
$ npm config get proxy         → http://127.0.0.1:7890
$ npm config get https-proxy   → http://127.0.0.1:7890
```

任务书里担心的「是否需要代理」这一步，**本机不需要再判断——代理已经在 npm 配置里生效**。为了确认它确实是必需品而非摆设，做了对照实验（显式清空代理走直连）：

```console
$ npm view vite version --proxy="" --https-proxy=""
npm warn invalid config https-proxy="" set in command line options
8.3.5
```

→ **直连也能拿到 8.3.5**。结论：代理存在但非必需；两个方向都通，所以 §1/§2 的失败都不可能归因于代理。

> 注：任务书写的是 `HTTS_PROXY`，实际环境变量名是 `HTTPS_PROXY`（少一个 P）。本次未使用环境变量，改用了命令行 `--proxy`，效果等价且不污染环境。

---

## 2. 离线可行性：**"有 store" ≠ "能离线装"**

### 2.1 pnpm store 与 npm cache 都在，而且不小

```console
$ pnpm store path
D:\.pnpm-store\v11
```

```console
$ ls D:\.pnpm-store\v11
files/  index.db (6.1 MB)  projects/
$ find D:\.pnpm-store\v11\files -type f | wc -l
26683
```

```console
$ npm config get cache
C:\Users\fixadmin\AppData\Local\npm-cache
$ du -sh <cache>
766M    C:\Users\fixadmin\AppData\Local\npm-cache
```

### 2.2 在线安装成功（建立基线）

在 `D:\ops\.tmp-research\demo` 用固定版本安装 react/echarts/vite：

```console
$ pnpm install
Packages: +26
Progress: resolved 26, reused 7, downloaded 19, added 26, done
dependencies:
+ echarts 6.1.0
+ react 19.3.1
+ react-dom 19.3.1
+ react-router-dom 7.18.4
devDependencies:
+ @vitejs/plugin-react 6.1.2
+ vite 8.3.5
Done in 25.3s using pnpm v12.9.1
```

注意 `reused 7` —— store 里**确实已有部分包**，但 19 个仍需下载。

### 2.3 关键实验：删掉 node_modules 后 `pnpm install --offline` **失败**

```console
$ rm -rf node_modules
$ pnpm install --offline
Lockfile is up to date, resolution step is skipped
Error: ERR_PNPM_META_FETCH_FAIL
  × installing dependencies
  ╰─▶ ERR_PNPM_NO_OFFLINE_META: Failed to resolve react in package mirror
      C:\Users\fixadmin\AppData\Local\pnpm-cache\v11/metadata-full\https%3A+registry.npmjs.org\react.jsonl
```

加 `--frozen-lockfile` 换了个包名，但**同一类错误**：

```console
$ pnpm install --offline --frozen-lockfile
Lockfile is up to date, resolution step is skipped
Error: ERR_PNPM_META_FETCH_FAIL
  ╰─▶ ERR_PNPM_NO_OFFLINE_META: Failed to resolve set-cookie-parser in package mirror
      ...\metadata-full\https%3A+registry.npmjs.org\set-cookie-parser.jsonl
```

**机制**：pnpm `--offline` 不只需要 store 里的**内容**（`files/`），还需要**注册表元数据缓存**（`metadata-full/*.jsonl`）。本机 metadata 缓存是残缺的：

```console
$ ls C:\Users\fixadmin\AppData\Local\pnpm-cache\v11\metadata-full\https%3A+registry.npmjs.org | wc -l
23                       # 只有 23 条
$ ls ... | grep -iE 'react|vite|echarts'
（无输出）
```

即 26,683 个 store 文件 + 一个「几乎空」的元数据缓存 = 离线装不上。**store 命中率和离线可装性是两件事**。

### 2.4 npm 的离线同样失败

```console
$ npm install --package-lock-only     # 生成 lockfile
$ npm ci --offline
npm error code ENOTCACHED
npm error request to https://registry.npmjs.org/zrender/-/zrender-6.1.0.tgz failed:
          cache mode is 'only-if-cached' but no cached response is available.
```

766 MB 的 npm cache 里也没有这批 tarball（cache 大 ≠ 有你需要的包）。

### 2.5 三条替代路径，各自的实测状态

**路径 A：vendored 本地 tarball —— 机制可行（已验证）**

```console
$ npm pack            # 造一个无依赖包
vendor-test-1.0.0.tgz
$ pnpm add --offline "file:../tb/vendor-test-1.0.0.tgz"
Packages: +1
Progress: resolved 1, reused 0, downloaded 1, added 1, done
dependencies:
+ vendor-test 1.0.0
Done in 115ms
```

→ **本地 tarball 完全绕过注册表**。但本次只验证到「无依赖包」，**整棵树（vite 的 26 个包）vendored 后能否离线装，未验证**（见「核不到」）。

**路径 B：复用本机已有安装 —— 可离线构建（已验证，且这是本机最现实的路径）**

把代理指向关闭端口，模拟「构建时没有任何外网出口」：

```console
$ HTTP_PROXY=http://127.0.0.1:1 HTTPS_PROXY=http://127.0.0.1:1 \
  ALL_PROXY=http://127.0.0.1:1 NO_PROXY= \
  npm_config_proxy=http://127.0.0.1:1 npm_config_https_proxy=http://127.0.0.1:1 \
  pnpm build
✓ built in 417ms
```

→ **构建阶段不需要网络**（依赖已在 `node_modules`）。因此「本机可离线构建 + 产物可离线打开」这条路是通的。

**路径 C：CDN —— 会直接破坏离线目标（已验证失败模式）**

用不可达域名模拟断网 CDN，在 `file://` 下加载：

```console
$ msedge --headless=new --dump-dom file:///D:/ops/.tmp-research/cdn2/index.html
CDN_OK=false onerror=true
```

→ CDN 一断，`echarts` 未定义，`onerror` 触发。同一页面在真网络下是 `echarts loaded: true`（即 CDN **只在有网时**可用）。**选 CDN = 放弃离线**，这条不能自欺。

### 2.6 §2 结论

- **能装 / 不能装：断网冷启动 → 不能装**（pnpm `ERR_PNPM_NO_OFFLINE_META`，npm `ENOTCACHED`，两条独立证据）
- **本机 → 能离线构建**（依赖已就位，构建零网络）
- **替代路径优先级**：复用本机 `node_modules`/store（已验证）＞ vendored tarball（机制已验证，整树未验证）＞ CDN（与离线互斥）

---

## 3. Vite 构建产物的字节可复现性

### 3.1 实测：两次构建 → 完全一致

```console
$ pnpm build          # 第 1 次
dist-default/index.html                    0.35 kB │ gzip:   0.27 kB
dist-default/assets/index-BHJAKDnU.js  1,378.34 kB │ gzip: 453.60 kB
✓ built in 451ms

$ cp -r dist-default dist-run1
$ pnpm build          # 第 2 次
dist-default/assets/index-BHJAKDnU.js  1,378.34 kB │ gzip: 453.60 kB
✓ built in 397ms
$ cp -r dist-default dist-run2

$ diff -r dist-run1 dist-run2
（无输出）
DIFF: identical
```

**content hash 文件名两次都是 `index-BHJAKDnU.js`**（哈希没变），这一点很关键：它意味着 content hash 在输入不变时是**确定的**，不是随机的。

### 3.2 实测：换目录构建 → 仍然一致（排除绝对路径泄漏）

```console
$ cp -r demo demo-copy && cd demo-copy && pnpm build
dist-default/assets/index-BHJAKDnU.js  1,378.34 kB │ gzip: 453.60 kB

$ sha256sum demo/dist-run1/index.html demo/dist-run1/assets/*.js
4776304c...450d8  demo/dist-run1/index.html
76eff90b...096f8a  demo/dist-run1/assets/index-BHJAKDnU.js
$ sha256sum demo-copy/dist-default/index.html demo-copy/dist-default/assets/*.js
4776304c...450d8  demo-copy/dist-default/index.html      ← 同
76eff90b...096f8a  demo-copy/dist-default/assets/index-BHJAKDnU.js  ← 同
```

产物里也**没有**时间戳/用户名/绝对路径：

```console
$ grep -oE '20[0-9]{2}-[0-9]{2}-[0-9]{2}T?|D:\\ops|D:/ops|fixadmin' dist-run1/assets/*.js | sort -u
（无输出）
```

### 3.3 天然易变的四类东西（哪些要排除，哪些可以放心比）

| 易变项 | 本次实测 | 处理方式 |
|---|---|---|
| **content hash 文件名** | 输入没变时**不变**（两次同为 `BHJAKDnU`）；但任何输入字节变化都会变 | 比对时**按内容比，不按文件名比**；或先归一化文件名 |
| **sourcemap 内嵌 install 布局路径** | 开了 `--sourcemap` 后 `sources` 是 `"../../node_modules/.pnpm/react@19.3.1/node_modules/react/cjs/react.production.js"` —— 带 pnpm 特有 `.pnpm/<pkg>@<ver>/` 布局 | **产物不含 map 时无需处理**；要交 map 就排除 `*.map`（体积也大：7,992.38 kB） |
| **构建时间戳** | 本次产物 grep **未发现**任何时间注入 | 只要不自己 `define: { __BUILD_TIME__: ... }`，默认没有 |
| **绝对路径** | 跨目录构建 SHA-256 相同 → 未泄漏 | 无需处理 |

补充：本次 build 使用的打包器是 **rolldown 1.2.14**（从报错栈里读到：`node_modules/.pnpm/rolldown@1.2.14/...`），即 vite 8 的默认引擎。跨工具链版本的一致性**没测**（见「核不到」）。

### 3.4 可执行的比对命令（PowerShell，已跑通并输出 `RESULT: byte-identical (2 files)`）

```powershell
# 两次构建后，在项目根执行（把 dist-run1 / dist-run2 换成本次要对比的两个目录）
$a = Get-ChildItem dist-run1 -Recurse -File | ForEach-Object {
  [pscustomobject]@{ P = $_.FullName.Substring((Resolve-Path dist-run1).Path.Length)
                     H = (Get-FileHash $_.FullName -Algorithm SHA256).Hash } }
$b = Get-ChildItem dist-run2 -Recurse -File | ForEach-Object {
  [pscustomobject]@{ P = $_.FullName.Substring((Resolve-Path dist-run2).Path.Length)
                     H = (Get-FileHash $_.FullName -Algorithm SHA256).Hash } }
$d = Compare-Object $a $b -Property P,H
if ($d) { "MISMATCH"; $d | Format-Table -AutoSize } else { "RESULT: byte-identical ($($a.Count) files)" }
```

实测输出：

```console
=== run1 hashes ===
\index.html               4776304C9E0CD65E85E75F08AC8C3634A8182EAF6F897FCBC9E04AE8A39450D8
\assets\index-BHJAKDnU.js 76EFF90BED8AC40E9F265E653F8C4A78CDE5813D23CC51DA88E3A7D58C096F8A
=== run2 hashes ===
（同上，逐字节相同）
RESULT: byte-identical (2 files)
```

**要排除易变文件时**（比如产物带 `.map`、或你自建了 manifest）在管道里加一道过滤即可：

```powershell
Get-ChildItem dist-run1 -Recurse -File |
  Where-Object { $_.Extension -notin '.map' -and $_.Name -ne 'manifest.json' }
```

---

## 4. ECharts 离线加载

### 4.1 包体积（registry 元数据，一手）

```console
$ npm view echarts dist.unpackedSize dist.fileCount dist.tarball
dist.unpackedSize = 60297703          # ≈ 57.5 MiB
dist.fileCount = 1347
dist.tarball = 'https://registry.npmjs.org/echarts/-/echarts-6.1.0.tgz'
```

57.5 MiB 是**整包**（含大量未用模块、类型、示例），不是最终产物体积。

### 4.2 两种引入方式的实测产物体积

**全量引入** `import * as echarts from 'echarts'`：

```console
dist-default/index.html                    0.35 kB │ gzip:   0.27 kB
dist-default/assets/index-BHJAKDnU.js  1,378.34 kB │ gzip: 453.60 kB
✓ 616 modules transformed
```

**按需引入**（`echarts/core` + `BarChart` + Grid/Tooltip/Title + CanvasRenderer）：

```console
dist-default/assets/index-C8MrzC0_.js  751.20 kB │ gzip: 248.27 kB
```

→ **省 45.5%**（1,378 → 751 kB）。按需引入需注意一个实际踩到的坑：

```console
error during build:
[PARSE_ERROR] Identifier `BarChart` has already been declared   # 组件名与 ECharts 导出名撞了
```
改 `import { BarChart as BarSeries } from 'echarts/charts'` 即通过。

### 4.3 可否认本地打包进产物

**能，两条都已验证**：

1. 独立 `.js` 资源（默认构建）：产物是 `assets/index-*.js`，与页面同源相对路径 `./assets/...`
2. 内联进 HTML（`vite-plugin-singlefile`）：产物只有一个 `index.html`，1,378.66 kB / 751.51 kB，无外部请求

### 4.4 CDN 是否会破坏 `file://` 离线打开

**会，且是硬破坏**（§2.5 路径 C 的实测）：断网时 `CDN_OK=false onerror=true`，图表直接不存在。另外即使「有网」，`type="module"` 形式的 CDN 依赖在 `file://` 下同样会被 CORS 拦（§5.1 同一条规则）——只有 **classic script** 形式的 CDN `<script src=...>` 在有网时可用（已验：`echarts loaded: true`）。

---

## 5. `file://` 双击打开：这一节是否决项

### 5.1 默认 Vite 产物：**打不开**（白屏，控制台 CORS）

```console
$ msedge --headless=new --dump-dom --virtual-time-budget=5000 \
    "file:///D:/ops/.tmp-research/demo/dist-default/index.html"
<!DOCTYPE html>
<html lang="zh-CN"><head>
    ...
    <script type="module" crossorigin="" src="./assets/index-BHJAKDnU.js"></script>
  </head>
  <body>
    <div id="root"></div>          ← 空的！React 没挂载
  </body></html>
```

控制台原始报错（`--enable-logging=stderr` 抓到的 CONSOLE 行）：

```
"Access to script at 'file:///D:/ops/.tmp-research/demo/dist-default/assets/index-BHJAKDnU.js'
 from origin 'null' has been blocked by CORS policy: Cross origin requests are only supported
 for protocol schemes: chrome-experimental-site-token-provider, chrome-extension,
 chrome-untrusted, data, edge, http, https, isolated-app."
```

**机制**：Vite 默认产物是 `<script type="module">`，而 `file://` 下文档 origin 是 `null`，**ES module 的加载被当作跨源请求**，直接被拦。这与 `base` 配不配 `./` 无关——`base: './'` 只解决「路径对不对」，解决不了「协议被拒」。

**对照实验**（证明是 module 特有的限制，不是「外部文件都不行」）：

```console
# 外部 classic script，同目录、file:// 打开
$ msedge --headless=new --dump-dom file:///D:/ops/.tmp-research/classic/index.html
<h1 id="ok">CLASSIC 外部脚本已执行</h1>
```

→ classic script 能加载，**module 不能**。

### 5.2 内联单文件产物：**能打开**（React + ECharts 都正常）

用 `vite-plugin-singlefile@2.3.4`（peer 已声明支持 `vite ^8.0.0`）：

```console
$ pnpm add -D vite-plugin-singlefile
+ vite-plugin-singlefile 2.3.4
```

```console
$ vite build --config vite.config.single.js
[plugin vite:singlefile] Inlining: index-BHJAKDnU.js
dist-single/index.html  1,378.66 kB │ gzip: 453.81 kB
$ find dist-single -type f
dist-single/index.html          ← 只有一个文件，零外部请求
```

`file://` 打开后的 DOM（真实渲染，不是骨架）：

```console
$ msedge --headless=new --dump-dom "file:///D:/ops/.tmp-research/demo/dist-single/index.html"
id="root"
<h1 data-testid="home-title">HOME 路由正常</h1>
<canvas data-zr-dom-id="zr_0.0" width="520" height="320" style="position: absolute; ...">
```

→ React 挂载成功、**HashRouter 解析出 HOME**、**ECharts 真的建出了 520×320 的 canvas**。按需引入版本同样通过：

```console
dist-single/index.html  751.51 kB │ gzip: 248.50 kB
<h1 data-testid="home-title">HOME 路由正常</h1>
<canvas data-zr-dom-id="zr_0.0" width="520" ...
```

**原理**：内联后的 `<script type="module">` 内容是**行内**的（`<script type="module" crossorigin>var e=Object.create...`），不产生任何 `file://` 请求，因此不触发 CORS。

### 5.3 路由：hash 可用，history 必然失败，memory 是可选项

**hash 路由（`#/chart`）—— 可用**：

```console
$ msedge --headless=new --dump-dom "file:///D:/ops/.tmp-research/demo/dist-single/index.html#/chart"
<h1 data-testid="chart-title">CHART 路由正常</h1>
```

**history 路由（BrowserRouter）—— 根路径就挂**：

```console
$ msedge --headless=new --dump-dom ".../dist-history/index-history.html"
（没有任何 <h1>，整页无内容）
```

控制台给出了确切原因（不是猜的）：

```
"No routes matched location "/D:/ops/.tmp-research/demo/dist-history/index-history.html""
```

**机制**：`BrowserRouter` 读 `window.location.pathname`，而 `file://` 下 pathname 是**磁盘绝对路径** `/D:/ops/...`，因此永远匹配不上 `/`。同理 `file:///.../chart` 会被当成文件系统路径 → 文件不存在（实测该 URL 返回空）。

**memory 路由**：不读 URL，能渲染，但**拷贝给别人打开时无法深链**，刷新即回首页。对「双击打开」场景可用，对「给个链接直达某图表」不可用。

**架构票 C 的结论**：用 **HashRouter**。它同时满足「双击打开可用」+「URL 可深链」+「刷新保持」，是本机唯一同时满足三项的选择。

### 5.4 `base: './'` 的位置

Vite 官方文档对 `base` 的合法值写的是：`Absolute URL pathname, e.g. /foo/`、`Full URL`、**`Empty string or ./ (for embedded deployment)`**
（来源：<https://vite.dev/config/shared-options.html#base>，2026-10-22 抓取，HTTP 200）

实测产物印证了这一项的**必要性但不充分性**：

```html
<script type="module" crossorigin src="./assets/index-BHJAKDnU.js"></script>
```

`./assets/...` 是 `base: './'` 的结果（相对路径，才能在任意目录双击）。但如 §5.1，路径正确仍会被 CORS 拦住——**`base: './'` 是必要条件，不是充分条件**，必须配内联。

### 5.5 最小可用配置（本次跑通的组合）

```js
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: './',                                  // 必需：产物引用变相对路径
  plugins: [react(), viteSingleFile()],        // 必需：把 JS/CSS 内联进 HTML
  build: { outDir: 'dist-single', emptyOutDir: true }
})
```

```jsx
// 入口路由
import { HashRouter, Routes, Route } from 'react-router-dom'
<HashRouter>...</HashRouter>                   // 必需：history 模式在 file:// 下必挂
```

---

## 6. 本机可复现的实验目录（供复核）

```
D:\ops\.tmp-research\
├─ demo\                     # 主工程（vite 8.3.5 + react 19.3.1 + echarts 6.1.0）
│  ├─ vite.config.js               # 默认 ES module 产物 → dist-default
│  ├─ vite.config.single.js        # 单文件内联   → dist-single
│  ├─ vite.config.history.js       # BrowserRouter 对照 → dist-history
│  ├─ dist-run1\ dist-run2\        # 两次构建，SHA-256 相同
│  └─ dist-srcmap\                 # 带 sourcemap，观察 sources 路径
├─ demo-copy\                # 换目录构建对照，SHA-256 与 run1 相同
├─ classic\                  # 外部 classic script 在 file:// 下可用
├─ cdn\  cdn2\               # CDN 有网可用 / 断网 onerror
├─ tb\ tbuse\                # 本地 tarball + --offline 安装成功
└─ npmtest\                  # npm ci --offline 失败现场（ENOTCACHED）
```

（`edge-profile-*` 是 headless Edge 的临时 profile，可随时删。）

---

## 7. 核不到（明确未验证，不要当结论用）

1. **跨机器 / 跨 OS / 跨工具链版本的字节一致性** —— 只验证了「同机、同 lockfile、同 node/rolldown 版本」两次构建一致。换 node 小版本、换 rolldown 版本、换到 Linux，是否仍字节一致：**核不到**。
2. **整棵树 vendored 后能否离线安装** —— 只验证到「单个无依赖包从本地 tarball + `--offline` 成功」。vite/react/echarts 全树打包成 tarball 后离线装：**核不到**。
3. **`metadata-full` 缓存为何残缺** —— 实测只有 23 条且不含 react/vite/echarts，但没查到 pnpm 文档说明它何时写入、为何在线装完仍缺。**机制核不到**，只能给出「现象 + 报错」。
4. **Firefox / Safari 的 `file://` 行为** —— 只用了 Edge（Chromium）。`origin: null` 是规范行为，但另两个引擎是否同样拦 module、是否对 `file://` 有额外限制：**核不到**。
5. **官方文档对「`file://` 不支持 ES module」的原文条款** —— 只有 Chromium 控制台的原始报错（第一手运行证据），没有对应的规范/文档条文抓取。**文档依据核不到**。
6. **vite 8 默认使用 rolldown 的官方声明** —— 只在报错栈里读到 `rolldown@1.2.14`，对应关系的官方说明未抓。
7. **`file://` 下的 storage / IndexedDB / fetch(local json) 行为** —— 本次只验证了渲染与路由，没测 `fetch('./data.json')`、localStorage 持久化。若产品要读本地 JSON 数据文件，**需另开一轮验证**（按 §5.1 同一规则，`fetch('file://...')` 极可能同样被 CORS 拒，但未实测，不作结论）。

---

## 8. 三条硬结论（复述，便于引用）

1. **能装 / 不能装**：本机有网 → **能装**；断网冷启动 → **不能装**（pnpm `ERR_PNPM_NO_OFFLINE_META`、npm `ENOTCACHED`）；本机复用已有 `node_modules` → **能离线构建**。
2. **离线可开**：**条件式可行**。`base:'./'` + `vite-plugin-singlefile` 内联 + `HashRouter` 三件套齐全 → 双击可用（React 与 ECharts canvas 均已实测渲染）；缺内联或误用 history 路由 → 白屏。
3. **可复现校验命令**：两次构建后 `Get-ChildItem -Recurse -File | Get-FileHash -Algorithm SHA256` + `Compare-Object`（§3.4 全文），本次输出 `RESULT: byte-identical (2 files)`；带 sourcemap 时排除 `*.map`。
