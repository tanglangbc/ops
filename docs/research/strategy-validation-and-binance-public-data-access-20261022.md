# 策略滚动样本外验收口径（5 窗口 / 95% CI / 多重比较 / 1.5× 成本压力）与 Binance 公开数据在 IP 封禁下的可达性

> 核查日期：2026-10-22 21:0x–21:5x（Asia/Shanghai，UTC+08:00）
> 用途：为「Binance Quant Workbench」首版验收门与永续行情接入提供一手依据。
> 范围：只解决两件事——(A) 「≥5 个滚动样本外窗口 + 扣除成本后净为正 + 95% 置信区间下界高于零 + 多重比较修正 + 1.5× 成本压力」这句验收语到底指什么、仓里已有什么；(B) 币安 REST 被 418 封禁时，公开行情还能不能拿。
> **不解决**：任何策略的盈利裁决。本文不给任何策略「通过」。

**方法与安全约束（重要，先读）**

- 本文件的操作者（下称「本轮」）只做了两件事：**只读**读取仓库文件；用 `curl` GET **官方文档站与官方文档仓库**的文本。
- **本机出口 IP 已被 Binance USDⓈ-M REST 封禁（418 / `-1003`）**，因此本轮**未对任何 Binance API 业务主机发起请求**：
  - 对 `fapi.binance.com`：**0 次**
  - 对 `api.binance.com`、`data-api.binance.vision`：**0 次**
  - 实际访问的只有：`raw.githubusercontent.com`（Binance 官方文档仓库 raw）、`developers.binance.com`（文档站，2 次：1 次 30s 超时、1 次 202/0 字节）、`api.github.com`（1 次，被 GitHub 自身限流 403）、以及搜索服务。
- 未执行：任何回测、任何仓库脚本、任何 `python`/`pip`、任何 git 操作。
- 唯一写入：本文件。为抓文档在系统临时目录落了若干**只读副本**，未触碰仓库内任何文件。
- **来源更正（2026-10-22 21:5x）**：本路径在 21:15 由**本会话的主导模型（Lead）**写过一版 170 行；同目录的 `binance-trading-cost-facts-20261022.md`（21:07）是 **Lead 执行 `git pull` 时随 `origin/master` 13 个提交一起落盘的既有件**，与本次调研无关。此前版本把这两件事记成「另一个并发会话」、并据此推断存在第二个 agent，**系误判，现更正**：本文件自始至终**只有一个会话（本会话 Lead）在写**。正文中凡保留的「Lead 会话」字样，均指同一个 Lead。
- **关于 §B.6 那批 fapi 实测的时序（更正）**：那批请求由 **Lead 在 2026-10-22 约 20:53–20:58 执行，目的是发现并刻画封禁本身**；「不要碰 fapi」这条约束是**由该发现的结论倒推出来、此后才写进调研任务的**，因此**不能用它回头判 20:53 的行为违规**。但**结论不变且必须承认**：那批重试**确实推后了 `banned until`**——这正是 418「收到 429 后继续发请求」语义的一手证据。此后本会话**未再对 `fapi.binance.com` 发起任何请求**（末次为 20:58 前后）。
- **本文件保留**了那批实测证据（已标注来源），并**替换**了其中无法核实的文献断言、补上了可用的官方引用与工作 URL。凡属 Lead 早期实测的事实，在文中标注「**Lead 实测（发现封禁时，非调研轮）**」。
- 标注约定：事实一律带「文件:行号」或 URL；推不出的写 **核不到**；凡属本人推断或自算，逐条标注「**判断**」或「**本笔记计算**」。

---

## 0. 结论（先读这段）

| 问题 | 硬结论 | 依据 |
|---|---|---|
| 仓里已实现哪些多重检验工具 | **已实现 3 个函数、4 套机制**：Bonferroni `sqrt(2 ln N)`、Deflated Sharpe Ratio、PBO/CSCV、Reality Check。全部照公开定义实现，不依赖商业库（如 mlfinlab） | §A.1 |
| 「≥5 个滚动样本外窗口 + 95% CI 下界 > 0」仓里有吗 | **没有**。它是一个**独立的统计量**（窗口级净收益的区间估计），不是既有 `evaluate_batch` 的开关 | §A.2 |
| 为什么不能拿现有 t 值顶替 | **统计单元不同**：现有 `t_stat` 的单元是 **bar**（样本量 = `bars`），话术要的单元是 **window**（样本量 = W = 5） | §A.2 |
| 「1.5× 成本压力」仓里有吗 | **没有闸门**。代码里出现的 `1.5` 是**集中度比值**，与成本无关（最易混淆点） | §A.1.4 |
| 多重比较校正该在 **N（配置数）** 还是在 **W（窗口数）** 上做 | **在 N 上，不在 W 上**；只有当「窗口长度/起点」本身被搜索时，W 才并入 N | §A.4（**判断**） |
| 「5 个窗口」有文献依据吗 | **没有**。四篇原始文献的框架都以**期间数/模型数**为参数，不以窗口数为参数 | §A.3、§A.4（**判断**） |
| 418 的官方语义 | **IP 在收到 429 后继续发请求触发的自动封禁**（不是「服务器忙」，是**行为惩罚**） | §B.1 |
| 封禁时长规则 | **有记录、对重复者按阶梯升级，2 分钟 → 3 天**；418/429 都带 `Retry-After`（秒） | §B.1 |
| 继续重试会不会加重 | **会**。官方原文把「429 后不退避」**列为触发自动封禁的原因本身**，且封禁时长对重复者**升级** | §B.1 |
| 限流按 IP 还是按 key | **按 IP**：`The limits on the API are based on the IPs, not the API keys.` | §B.1 |
| WS 是否计入 REST 权重 | **不计**。WS 是**另一套**计数：5 条入站消息/秒、1024 订阅/连接、每 IP 每 5 分钟 300 次连接尝试 | §B.2 |
| **REST 被封的 IP 能否用 WS 公开流** | **核不到**。官方文档**无一句**直接回答；仅有「`-1003` 文案主动建议改用 WS」＋「WS 与 REST 计数体系独立」两条间接证据 | §B.2、§B.6 |
| 现货 REST 权重模型 | `REQUEST_WEIGHT` **6000/分钟**；`RAW_REQUESTS` **61000/5 分钟**；`klines` 权重仅 **2** | §B.3.1 |
| USDⓈ-M REST 权重模型 | `REQUEST_WEIGHT` **2400/分钟**（比现货更紧）；`ORDERS` 300/10s、1200/分钟 | §B.3.2 |
| fundingRate / 期货 klines 是否需要鉴权 | **不需要**。规则是「**未标注安全类型即 `NONE`**＝公开市场数据」，而这两个端点在官方目录中**未标注** | §B.4 |
| HTTP 451 与 418 的区别 | **451 在官方文档中不存在（核不到）**；可查到的地域限制是业务码 `-5009 IP_COUNTRY_BLACK`。**区分判据：看有没有「到期时刻」** | §B.5 |

**一句话给架构**：把 418/`-1003` 当成**一等触发条件**接进「保护模式」，配**退避 + 停止重试**；实时行情优先走**推送式 WS streams**，REST 只用于历史补齐与对账。**不要**用「重试到成功」对抗 418——§B.6 的实测已证明重试会把封禁窗口推后。

---

# A 部分：验收话术 vs 仓库现状

## A.1 仓库里已经实现了什么（逐函数、逐行）

### A.1.1 `research/stats.py`（371 行）——三套工具 + 集中度

文件 docstring 自己写明了三部曲及其文献出处（`stats.py:1-26`）：

- `stats.py:9-12` 声明实现 **Deflated Sharpe Ratio (Bailey & López de Prado, 2014)**
- `stats.py:14-18` 声明实现 **PBO via CSCV (Bailey, Borwein, López de Prado & Zhu, 2017)**
- `stats.py:20-22` 声明实现 **Reality Check / SPA-style bootstrap (White 2000; Hansen 2005)**
- `stats.py:5-6` 记录设计动机：**项目已跑过 210 个变体**，并称 Bonferroni `t >= sqrt(2 ln N)` 是「a crude fix」
- `stats.py:24-25` 声明「全部接受普通数组/DataFrame 并返回普通数字；不碰交易引擎、网络或凭据」

**函数清单（名称 → 位置 → 输入 → 输出）**

| 函数 | 位置 | 输入 | 输出 |
|---|---|---|---|
| `_norm_cdf` | `stats.py:41-43` | `x` | 标准正态 CDF |
| `_norm_ppf` | `stats.py:46-70` | `p ∈ (0,1)` | 标准正态分位数（Acklam 有理逼近） |
| `sharpe_ratio` | `stats.py:73-82` | 收益序列、`periods_per_year` | 年化 Sharpe（无风险利率取 0） |
| `moments` | `stats.py:85-96` | 收益序列 | `(skew, excess_kurtosis, mean, n)` |
| `expected_max_sharpe` | `stats.py:99-109` | `n_trials`, `sr_variance` | 零假设下 `E[max SR]` |
| **`deflated_sharpe_ratio`** | `stats.py:112-140` | **被选中配置的逐期收益** + `n_trials` + **跨试验 Sharpe 方差** + `periods_per_year` | **概率标量** |
| **`pbo_cscv`** | `stats.py:143-193` | **T×N 收益矩阵**、`blocks=10`、`max_combinations=4000`、`seed=0` | `{"pbo","n_combinations","logits","median_logit"}` |
| `_column_sharpe` | `stats.py:196-200` | 矩阵 | 逐列 Sharpe |
| **`reality_check`** | `stats.py:203-234` | **T×N 矩阵**、`n_boot=2000`、`block=5`、`seed=0` | `{"best_mean","p_value","crit_value","n_boot"}` |
| `concentration` | `stats.py:299-330` | 贡献映射/序列、`top=3`、`threshold=0.5` | `ConcentrationReport` |
| `monthly_contributions` | `stats.py:333-344` | 需 DatetimeIndex 的收益序列 | 按月聚合贡献 |
| `evaluate_batch` | `stats.py:347-371` | T×N 矩阵、`n_trials`、`periods_per_year` | `OverfittingReport` |

**DSR 的判定阈值与算法要点**

- `stats.py:118-123`（docstring）：`returns` 必须是**被选中配置（the winner）的逐期收益**，`n_trials` 是**试过多少配置**，`sr_variance` 是**（逐期）Sharpe 的跨试验方差**；原文写明「**A probability below ~0.95 means: this is what the best of N noise looks like.**」
- `stats.py:136`：`denom = 1.0 - skew * sr + (kurt - 1.0) / 4.0 * sr ** 2` —— 非正态（偏度/超额峰度）修正项
- `stats.py:139`：`z = (sr - sr0) * sqrt(max(n - 1, 1)) / sqrt(denom)`
- `stats.py:137-138`：`denom <= 0` 时**直接返回 0.0**（防御性裁剪）

**PBO/CSCV 的算法要点**

- docstring `stats.py:147-153`：输入 **T×N**（一列一配置、一行一期），并明确「**out-of-sample returns are not required** — CSCV 反复把**同一样本**对半切」；语义为「**PBO near 0.5 means the in-sample winner is a coin flip out of sample; near 0 is good.**」
- `stats.py:158-162`：`blocks` 强制取偶；行数不足 `blocks*2` 或列数 < 2 时返回 `pbo=NaN` 并附 `reason`
- `stats.py:169-174`：组合数超 `max_combinations=4000` 时**随机抽 4000 个**（`seed=0`）⇒ 大样本下 PBO 是**抽样估计**，非全枚举
- `stats.py:182-189`：`best = argmax(sr_in)`，`rank = mean(sr_out <= sr_out[best])`，`1/(n+1)` 截断后取 `logit`；**PBO = `mean(logits <= 0)`**

**Reality Check 的算法要点**

- docstring `stats.py:205-209`：`p_value` 是「**max of N null means ≥ best observed mean**」的自助概率
- `stats.py:216`：**先对每列中心化**（零假设下每列均值为零）
- `stats.py:223`：注释自称 `Stationary block bootstrap, shared across columns to keep cross-correlation.`
- `stats.py:224-226`：实现是**固定块长 + 随机起点 + 模 n 回绕**（`np.arange(s, s + block) % n`）
- `stats.py:232`：`crit_value = np.quantile(maxima, 0.95)`

> **判断（非一手事实）**：`stats.py:223` 把实现称为 "Stationary block bootstrap"，但 `stats.py:224-226` 的实际做法是「固定块长、随机起点、模 n 回绕」，这是**环形块自助（circular block bootstrap）** 的形态，而非 Politis–Romano 平稳自助（后者块长服从几何分布且随机）。**未做数值复核**（本轮禁止执行代码）。

### A.1.2 判定阈值（唯一口径在 `OverfittingReport.survives`）

`stats.py:247-250` 原文：

```python
    @property
    def survives(self) -> bool:
        return self.deflated >= 0.95 and (not math.isnan(self.pbo)) and self.pbo <= 0.5 \
            and (not math.isnan(self.reality_p)) and self.reality_p <= 0.05
```

⇒ **三条同时成立的硬阈值**（仓库唯一的「过拟合」判定口径）：

| 量 | 阈值 | 出处 |
|---|---|---|
| Deflated Sharpe 概率 | **≥ 0.95** | `stats.py:249` |
| PBO | **≤ 0.5**（且非 NaN） | `stats.py:249` |
| Reality-check p | **≤ 0.05**（且非 NaN） | `stats.py:250` |

`summary()`（`stats.py:252-257`）把三态收敛成一行，非 SURVIVES 即打印 `NOT DISTINGUISHABLE FROM NOISE`。

### A.1.3 `research/edge_scan.py`（615 行）——Bonferroni 与扫描器接线

- docstring `edge_scan.py:30-36`：**「The script reports the Bonferroni-style threshold `sqrt(2 ln N)` alongside each t-stat」**，并写明「with N variants, a t of 2.0 is expected noise」，不达标者一律标 `noise`
- `edge_scan.py:68`：`DEFAULT_ONE_WAY = 0.002` —— 单边成本 = **0.10% 手续费 + 0.10% 滑点**（冻结的项目假设）
- `edge_scan.py:70`：`BARS_PER_YEAR = {"1d": 365, "4h": 365 * 6}`
- `Result` dataclass `edge_scan.py:159-194`（`t_stat` 字段 `:177`）
- **`t_stat` 的定义**（`edge_scan.py:232-234`）：

```python
    std = float(net.std(ddof=1)) or 1e-12
    sharpe = float(net.mean() / std * math.sqrt(bars_per_year))
    t_stat = float(net.mean() / (std / math.sqrt(bars)))
```

  ⇒ **这是「逐 bar 净收益的单样本 t 值」**：分子的均值取自**整个窗口的逐 bar 净收益**，分母是 `std/sqrt(bars)`。**统计单元 = bar**，不是「窗口」。
- `edge_scan.py:222-226`：`years < 0.5` 直接抛 `ValueError`
- `edge_scan.py:243-244`：`cost_per_trade = 2 * one_way_cost`；`edge_over_cost = edge_per_trade / cost_per_trade`
- **`_decide`**（`edge_scan.py:352-368`），docstring 写明「using **out-of-sample evidence only**」：

```python
    if oos.edge_over_cost <= 1.0:
        return "cost-killed" if oos.t_stat >= threshold else "dead"
    if oos.t_stat < threshold:
        return "noise"
    if oos.net_ann <= bh_oos.net_ann:
        return "beta-only"
    return "candidate"
```

  ⇒ (a) 毛利须超过往返成本；(b) t 值须过多重检验门槛；(c) 须**跑赢同标的 buy&hold**（`:355-360` 说明：否则「the 'edge' is just the asset's own beta wearing a costume」）
- **Bonferroni 门槛数值**：`edge_scan.py:396-397`

```python
    variant_count = 60 + 8  # families below + cross-sectional blocks, budgeted high
    threshold = math.sqrt(2 * math.log(max(variant_count, 2)))
```

  ⇒ **N = 68**，门槛 = `sqrt(2·ln 68)` ≈ **2.905**（**本笔记计算**：ln 68 = 4.219508，×2 = 8.439016，开方 ≈ 2.90534）
- **OOS 切分**：`--split` 默认 **`2023-01-01`**（`edge_scan.py:375-376`）；`evaluate(... start=None, end=args.split)` 为 dev、`start=args.split, end=None` 为 OOS（`:404-407`）。**全流程只有这一次切分，没有滚动。**
- `oos_series` 对**每个变体**都保留实际净收益路径（`:436-441`），注释说明理由：集中度闸门需要真实路径

### A.1.4 `1.5` 在代码里的**真实含义**（最易混淆点）

`edge_scan.py:385-387`：

```python
    parser.add_argument("--concentration-ratio", type=float, default=1.5,
                        help="a candidate is concentrated when its top-period share exceeds "
                             "this multiple of the same symbol buy&hold share")
```

`intraday_scan.py:236-238`：

```python
        if record["verdict"] == "candidate" and record["concentration_vs_bh"] and \
                record["concentration_vs_bh"] > 1.5:
            record["verdict"] = "concentrated"
```

⇒ 这个 `1.5` 是**「该策略头部分位占比 ÷ 同标的 buy&hold 头部分位占比」的倍数**（集中度闸门，对应 `stats.py:260-296` 的 `ConcentrationReport`）。
**与「1.5× 成本压力测试」毫无关系。** 仓库里**没有**任何位置把成本乘 1.5 再重算，也**没有**任何闸门要求「成本 ×1.5 后仍通过」。

### A.1.5 兄弟扫描器的接线（结论一致）

- `xs_scan.py:232-264` 的 `null_check`：做 **200 个随机 k-book 的零假设自助**，输出 `null_p05_pct`/`null_p95_pct`/`percentile`/`beats_null_95`（`:256-264`）。⇒ 这是**截面随机性**检验，**不是**时间序列窗口的 CI。
- `intraday_scan.py:203-217`、`xs_scan.py:427-429`、`edge_scan.py:534-536`：都把 OOS 矩阵喂给 `stats.evaluate_batch`，字段名一致（`deflated_sharpe_probability` / `pbo` / `reality_check_p`）。

## A.2 缺口：那句话术里**没有被覆盖**的部分

### A.2.1 逐项对照

| 话术片段 | 仓库是否有 | 说明 |
|---|---|---|
| 「≥5 rolling out-of-sample windows」 | **❌ 无** | 只有 `--split` 一个固定日期做**一次** dev/OOS 切分（`edge_scan.py:375-376`）。全仓 grep 未见「多窗口滚动再逐窗汇总」的代码路径 |
| 「net positive after costs」 | **⚠️ 部分** | 成本已在模型内（`edge_scan.py:20-28,214-215`），有 `edge_over_cost > 1`（`:244,362`）；但仅**单一**成本假设 |
| 「95% confidence interval lower bound > 0」 | **❌ 无** | 见 §A.2.2 |
| 「multiple-comparison correction」 | **✅ 有，四套** | Bonferroni（`:397`）+ DSR（`stats.py:112`）+ PBO/CSCV（`stats.py:143`）+ Reality Check（`stats.py:203`） |
| 「1.5× cost stress」 | **❌ 无** | `--one-way-cost` 可改成本（`edge_scan.py:374`），但**无闸门** |

### A.2.2 为什么「≥5 窗口 + 95% CI 下界 > 0」是**一个独立的统计量**

**判断（本笔记）＋代码事实**：它与仓库现有的量**统计单元不同**，因此**不可互相替代**：

| 量 | 统计单元 | 回答的问题 | 仓库位置 |
|---|---|---|---|
| 逐 bar `t_stat` | **1 个 bar**（样本量 = `bars`） | 「这个窗口的平均逐 bar 净收益是否显著为正」 | `edge_scan.py:234` |
| DSR | **1 个期间**（样本量 = `n`） | 「被选中配置的 Sharpe 在 N 次试验后是否仍可信」 | `stats.py:112-140` |
| PBO/CSCV | **1 个期间 × 1 个配置**（T×N） | 「选择过程本身是否过拟合」 | `stats.py:143-193` |
| Reality Check | **1 个期间 × 1 个配置**（T×N） | 「N 个配置里的**最大值**是否只是运气」 | `stats.py:203-234` |
| **话术要的：窗口级 CI 下界** | **1 个窗口**（样本量 = **W**） | 「把这些窗口看成 W 次实现，**均值的下界**是否 > 0」 | **不存在** |

关键差别有两处，**都不在现有代码里**：

1. **统计单元从 bar 换成 window，样本量骤降到 W=5。** 逐 bar `t_stat` 的分母是 `std/sqrt(bars)`（`edge_scan.py:234`），日线下 `bars` 可达 1000+，因此**天生容易显著**；窗口级 CI 的分母是 `std_window/sqrt(W)`，W=5 时自由度只有 **4**，门槛**大幅抬高**。⇒ 两者**不会**给出同一结论，这是**量纲不同**，不是风格差异。
2. **要的是「下界」而不是「点估计或 p 值」。** 现有代码输出 t 值（`:234`）或概率（`stats.py:140,189,228`），**没有一个**输出「均值的置信下界」。

⇒ 回答任务里的直接提问：**是的，它是一个独立的统计量**（窗口级净收益的单样本置信区间下界），并且**必须**叠上多重比较校正才有意义（否则「试了 W 个窗口长度再挑一个」会引入**新的**选择偏差，见 §A.4）。

### A.2.3 成本压力测试为什么必须单列

`edge_scan.py:68` 的 `DEFAULT_ONE_WAY = 0.002` 是**冻结的单一假设**。`evaluate`（`:197-274`）与 `net_returns`（`:334-349`）都把成本当**入参**（`one_way_cost`），所以**技术上**把 1.5 倍成本跑一遍只需改一个参数；但**仓库没有任何闸门**规定「×1.5 后仍须通过」——`_decide`（`:352-368`）用的 `oos` 是在**原始成本**下算出来的。⇒ 缺的**不是能力，是口径**。

> Lead 会话提到仓内 `viz/src/gen/backtest-4h.json` 已有三档成本压力表、`edge_scan` 有 5 档成本敏感性表。**本轮未打开这两份文件核对**，故只作线索记录（见 §核不到 N7）。

## A.3 方法学出处（一手文献，含工作 URL）

> 本节补上了Lead 会话版**明确省略**的卷期页码与稳定 URL（该版因抓取超时未给出链接）。

### A.3.1 Deflated Sharpe Ratio（DSR）

- **文献**：Bailey, D. H., & López de Prado, M. (2014). *The Deflated Sharpe Ratio: Correcting for Selection Bias, Backtest Overfitting and Non-Normality.* **Journal of Portfolio Management, 40(5), 94–107**（40 周年特刊）。DOI `10.2139/ssrn.2460551`。
- **URL**：SSRN <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551> ・作者站点免费全文 PDF <https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf>
- **它控制什么**：**选择偏差（selection bias under multiple testing）** ＋ **非正态性（偏度/峰度）** ＋ **样本长度**。手法是把观测 Sharpe 与「N 次独立试验下最大 Sharpe 的期望」`E[max SR]` 相比，并对非正态做方差修正。
- **它需要什么输入**：**被选中配置的逐期收益序列**、**试过的配置数 N**、**跨试验的 Sharpe 方差**。⇒ 与 `stats.py:112-123` 的签名一致。
- **补充**：Bailey, Borwein, López de Prado, Zhu, *Pseudo-Mathematics and Financial Charlatanism: The Effects of Backtest Overfitting on Out-of-Sample Performance*, **Notices of the AMS 61(5): 458–471**（DOI `10.2139/ssrn.2308659`）。

### A.3.2 Probability of Backtest Overfitting（PBO）／ CSCV

- **文献**：Bailey, D. H., Borwein, J. M., López de Prado, M., & Zhu, Q. J. (2017). *The Probability of Backtest Overfitting.* **Journal of Computational Finance, 20(4), 39–69**。DOI `10.21314/JCF.2016.322`。
- **URL**：SSRN <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253> ・免费全文 PDF <https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf>
- **它控制什么**：**「选择过程」本身的过拟合**，而非单条曲线的表现。PBO = 「**样本内最优的配置，在样本外落到中位数以下的概率**」；CSCV 把同一段历史的收益矩阵切成 S 块，轮流用 S/2 块做样本内、其余做样本外。
- **它需要什么输入**：**T×N 的逐期收益矩阵**。关键优点：**不需要预先留出独立样本外**，这正是 `stats.py:147-153` docstring 所写。

### A.3.3 White 的 Reality Check

- **文献**：White, H. (2000). *A Reality Check for Data Snooping.* **Econometrica, 68(5), 1097–1126**。DOI `10.1111/1468-0262.00152`。
- **URL**：Econometric Society 官方页 <https://www.econometricsociety.org/publications/econometrica/2000/09/01/reality-check-data-snooping>
- **它控制什么**：**数据窥探（data snooping）**，即「同一份数据被反复用于推断/模型选择」。它检验「**N 个模型里最好的那个**」的相对表现，而非逐个模型的显著性——正面回答「我的最优回测是不是运气」。
- **它需要什么输入**：**每个配置的损失/收益序列** ＋ **依赖结构下可用的自助方案**（时间序列须用块自助，不能 i.i.d. 重抽）。⇒ 对应 `stats.py:203-234`。

### A.3.4 Hansen 的 SPA（Superior Predictive Ability）

- **文献**：Hansen, P. R. (2005). *A Test for Superior Predictive Ability.* **Journal of Business & Economic Statistics, 23(4), 365–380**。DOI `10.1198/073500105000000063`。
- **URL**：DOI 同上；引用信息见 RePEc <https://ideas.repec.org/a/bsa/jnlbes/v23y2005i4p365-380.html>
- **它控制什么**：**White RC 的已知缺陷**——当模型集合里混入大量**很差或无关**的模型时，RC 的原假设会被这些「坏模型」拖偏，导致检验**过于保守、功效低**。SPA 通过**学生化（studentization）** ＋ **对坏模型重新中心化**来消除这种偏离。
- **它需要什么输入**：**各模型与基准的损失差分序列**；同样需要能处理时间依赖的自助方案。
- **与仓库的关系（判断）**：`stats.py:20-22` 自称 `Reality Check / SPA-style bootstrap`，但其实现（`:203-234`）做的是**对最大值做自助**，**未见** SPA 特有的「学生化 + 对坏模型重新中心化」两步。⇒ 更接近 **White RC**，**SPA 成分标注为未实现**（本笔记判断，未逐行复核 SPA 判别条件）。

## A.4 给这条闸门的可辩护配方

> 本节严格分两栏：**「标准做法（有引用）」** 与 **「本笔记建议（无引用，属判断）」**。请勿把后者当文献结论引用。

### A.4.1 标准做法（有引用）

1. **先固定规则，再看结果。** White (2000) 与 Hansen (2005) 的框架都建立在「模型集合事先给定」之上；数据窥探的定义就是「同一份数据被反复用于推断或模型选择」。⇒ **事前注册是这些方法成立的前提，不是可选项。**
2. **多重比较校正的基准量是「被试过的配置数 N」，不是「窗口数 W」。** White RC 与 Hansen SPA 的零假设都建在 **N 个模型的最大值**之上；DSR 的 `E[max SR]` 也以 **N** 为参数（`stats.py:99-109`）。
3. **时间序列自助必须用块自助**，不能 i.i.d. 重抽，否则会摧毁序列依赖、把 p 值做假小。White (2000) 原文即讨论依赖数据下的自助方案。
4. **报告「下界」是区间估计问题**，覆盖率由抽样分布与自由度决定——W 越小，自由度越少，同比置信度下的下界越保守。
5. **成本是收益口径的一部分**，必须在**净收益**上做推断（`edge_scan.py:20-28` 的模型即为该口径）。

### A.4.2 本笔记建议的具体配方（**判断，非文献结论**）

**第 1 步：事前固定 W（窗口数）。** 把 W 写进口径件，**不允许事后按结果调 W**（理由见 A.4.1-1）。Lead 会话建议的「固定长度滚动、步长固定、**窗口之间不重叠**」是正确方向——重叠会让样本不独立、CI 偏窄。

**第 2 步：逐窗口算成本后净收益。** 复用仓库已有口径，避免报告间漂移：

- 逐 bar 净收益 = `held * returns - turnover * one_way_cost`（`edge_scan.py:211-215`、`:344-346`）
- 对窗口 `w = 1..W` 汇总为 `R_w`（建议用**区间累计净收益**或**窗口内平均逐 bar 净收益**二者之一，**事前定死并写明**；两种口径在 W=5 下会给出不同下界）

**第 3 步：算 95% 下界。** 两种实现，**事前选一**：

- **(a) 参数法（t 区间）**：`LB = mean(R_w) - t_{0.95, W-1} · sd(R_w)/sqrt(W)`。
  - W=5 时自由度 = 4，单侧 95% 的 `t_{0.95,4} ≈ 2.132`（双侧 95% 则 ≈ 2.776）。（**本笔记计算**，数值来自 t 分布表；仓库内**无**该实现）
  - **不建议在 W=5 时用参数法**：`sd(R_w)` 由 5 个点估计，且净收益的偏度/峰度通常远离正态，t 区间的实际覆盖率**无法保证**。
- **(b) 自助法（推荐，与仓库风格一致）**：对 `R_w` 做**块自助**重抽（W=5 时块长只能取 1，退化为「对 5 个点有放回重抽」），取 `mean(R_w*)` 的 **5% 分位数**作下界。
  - 注意：W=5 时自助同样只有 5 个信息点，**下界会非常不稳**；这正是「5 窗口」这个数字**统计上偏小**的直接后果。

**第 4 步：把多重比较校正放在 N 上，而不是 W 上。**

- 对「配置集合」用仓库已有的三件套（DSR ≥ 0.95、PBO ≤ 0.5、RC p ≤ 0.05，`stats.py:249-250`），或用 Bonferroni `sqrt(2 ln N)`（`edge_scan.py:397`，N=68 时 ≈ 2.905）。
- **W 不进入 α 的除法**：W 个窗口不是 W 个「独立的比较假设」，它们是**同一个假设的 W 次实现**；把它们当 W 次检验会**过度惩罚**。
- **例外**：若允许自己挑窗口长度/起点，W 就变成选择维度，必须计入 N。
- **判断（重要）**：若对 N=68 做严格 Bonferroni（α = 0.05/68 ≈ 7.35×10⁻⁴），再要求 W=5 的窗口级 t 检验过同一门槛，**几乎必然失败**——W=5 只有 4 个自由度，达到该 α 所需的 t 值远大于正态近似的 z≈3.18（**本笔记计算**）。⇒ **不要让「5 窗口 CI」同时承担多重比较校正**。正确分工是：**窗口级 CI 负责「净收益是否为正且稳健」，DSR/PBO/RC 负责「N 次试验后的选择偏差」**，两者是**并联的两个闸门**。
- 另一条硬约束：`n_trials` 应用**该策略版本实际试过的配置数**，而不是全项目的 210（`stats.py:5` 的 210 是全项目历史）。**判断**：夸大 N 会把 DSR 压死，缩小 N 会放水，二者都破坏口径。

**第 5 步：1.5× 成本压力。** 用同一套 `R_w` 流程，把 `one_way_cost` 换成 `1.5 × 0.002 = 0.003`（`edge_scan.py:68` 基准 ×1.5）重算，要求**下界仍 > 0**。这一步**不需要**改统计方法，只需改成本入参（`evaluate`/`net_returns` 已参数化：`:202`、`:337`）。

**第 6 步：「多少窗口算够」的可辩护说法。**

- **没有任何一篇文献规定「必须 5 个窗口」**（本笔记核查 DSR / PBO / White / Hansen 四篇的框架，均以**期间数**或**模型数**为参数，**不以窗口数**为参数）。⇒ 「5」是**工程约定**，应**如实标注为项目自定口径**。
- **判断（推荐）**：若要让窗口级 CI 真有分辨率，**W ≥ 10 更稳**（自由度 ≥ 9）；W=5 只应作为**最低可接受下限**，且必须**预先声明**其下界对自助/参数法的选择敏感。
- **判断**：更稳的替代是把窗口级 CI 与现有逐期统计**合并报告**（同时给出 `oos_t`、DSR、PBO、RC 与窗口级 LB），让「哪一层没过」可诊断，而不是用一个复合布尔值掩盖。

**第 7 步：把口径写进口径件。** 本仓库已有「唯一口径」的纪律（`D:\workspace\代币交流群\tools\l2_daily_run.py:64-71` 的 `EXIT_CODES`；分析见 `docs/research/l2-daily-run-scheduling.md` §3.1）。这条新闸门应照同一模式落成**可执行、可退非零码**的检查，而不是写在报告正文里的形容词。

> **口径件已核到（2026-10-22 21:5x 更正）**：`FREEZE_4H_RULE.md` **确实存在**，路径为
> `D:\workspace\代币交流群\binance-spot-quant\reports\FREEZE_4H_RULE.md`（3,058 B，mtime 2026-10-17 09:13）。
> 此前版本记「在两个根目录下均未列出」是**检索路径不全**所致（该件在 `reports\` 子目录，不在任何「根」下），现更正。
>
> **该文件的关键内容（供本闸门设计直接引用）**：
> - 冻结时间 2026-10-17T01:13:32Z，范围含规则/参数/成本公式/判定口径/代码树哈希/配置哈希/数据哈希；
> - 明文承诺：**「从此不因结果不好而事后改门槛；任何改动都要新开一条记录并写明理由」**；
> - 成本公式：**`round trip = fee 0.1%×2 + slippage 0.1%×2 = 0.4% of notional`**，并写明「统一，不许各档各写一套」；
> - 判据（筛选前写死）：`trades ≥ 30`、`segmentsWithTrades ≥ 15`、`netAfterCosts > 0`、`vsNull`（per-symbol trade Sharpe > 该品种随机入场 null p95，2000 本）、`holdout = XRPUSDT`；
> - 闸门状态：`4hStrategy = NOT APPROVED (out-of-sample negative; random-entry control better; drift turned negative)`、`dailyStrategy = research candidate only`、**`realMoney = LOCKED`**、`engineering = partially verified`。
>
> ⇒ 因此「只加 5 窗口 CI 而放松既有三件 = 用新门槛替换旧门槛」这一冲突是**已核实的真实冲突**，且冻结件的承诺使「新门槛只对新版本生效」成为唯一不违约的处置。
> 另：`D:\ops\docs\adr\` 下 `0001/0002/0003` 确实存在。

---

# B 部分：REST 被 IP 封禁时的 Binance 公开数据访问

> 以下除 §B.6 外，全部来自 **Binance 官方文档**（开发者文档站 + 官方文档仓库）。本轮未向任何 Binance **API 业务主机**发请求。
> 现货文档的权威原文同源两处：GitHub 官方仓库 `binance/binance-spot-api-docs`（`rest-api.md` / `errors.md` / `web-socket-streams.md` / `faqs/market_data_only.md`）与开发者文档站。下文行号指 **GitHub master 分支 raw 文本**。

## B.1 HTTP 418 与 `-1003` 的确切语义

**（1）HTTP 返回码定义** —— 出处 `rest-api.md:138-140`（官方仓库原文）：

> - HTTP `429` return code is used when breaking a request rate limit.
> - HTTP `418` return code is used when an IP has been auto-banned for continuing to send requests after receiving `429` codes.

⇒ **418 不是「限流」，是「已被自动封禁」**；触发条件是「**收到 429 之后仍继续发请求**」。

**（2）封禁的判定与升级** —— 出处 `rest-api.md:215-229`（`### IP Limits`，官方仓库原文）：

> - Every request will contain `X-MBX-USED-WEIGHT-(intervalNum)(intervalLetter)` in the response headers which has the current used weight for the IP for all request rate limiters defined.
> - Each route has a `weight` which determines for the number of requests each endpoint counts for. Heavier endpoints and endpoints that do operations on multiple symbols will have a heavier `weight`.
> - When a 429 is received, it's your obligation as an API to back off and not spam the API.
> - **Repeatedly violating rate limits and/or failing to back off after receiving 429s will result in an automated IP ban (HTTP status 418).**
> - IP bans are tracked and **scale in duration** for repeat offenders, **from 2 minutes to 3 days**.
> - A `Retry-After` header is sent with a 418 or 429 responses and will give the **number of seconds** required to wait, in the case of a 429, to prevent a ban, or, in the case of a 418, until the ban is over.
> - **The limits on the API are based on the IPs, not the API keys.**

**（3）`-1003` 的文案（三档）** —— 出处 `errors.md:27-33`（官方仓库原文）：

> ### -1003 TOO_MANY_REQUESTS
>
> - Too many requests queued.
> - Too much request weight used; current limit is %s request weight per %s. Please use WebSocket Streams for live updates to avoid polling the API.
> - Way too much request weight used; IP banned until %s. Please use WebSocket Streams for live updates to avoid bans.

⇒ 三档分别对应：**排队过多** / **权重超限（429 档）** / **已被封禁（418 档，文案为「IP banned until …」）**。本机当前命中的是**第三档**。

**（4）USDⓈ-M 期货侧同一套语义** —— 出处 <https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/general-info>（`### IP Limits`；页脚 *Last modified on October 20, 2026*），原文与 §B.1(2) **逐条同义**，含「from 2 minutes to 3 days」「based on the IPs, not the API keys」；同页 `### HTTP Return Codes` 亦明确：

> - HTTP `429` return code is used when breaking a request rate limit.
> - HTTP `418` return code is used when an IP has been auto-banned for continuing to send requests after receiving `429` codes.

**（5）「重试会不会更糟」的答案：会。** 官方原文把「**failing to back off after receiving 429s**」**列为触发自动封禁的原因**，并声明封禁时长对重复者**升级**（2 分钟 → 3 天）。⇒ 在 418 期间继续敲，「加长封禁」是**机制内**的结果，不是运气问题。唯一被文档认可的动作是：**读 `Retry-After`，等到它归零**。§B.6 的实测直接把这一机制**观察到了**。

## B.2 WebSocket 是否受 REST 权重/封禁影响

**（1）文档明确写的：WS 是另一套账本。** `web-socket-streams.md:73-79`（`## WebSocket Limits`，官方仓库原文）：

> - WebSocket connections have a limit of 5 incoming messages per second. A message is considered:
>   - A PING frame
>   - A PONG frame
>   - A JSON controlled message (e.g. subscribe, unsubscribe)
> - A connection that goes beyond the limit will be disconnected; IPs that are repeatedly disconnected **may be banned**.
> - A single connection can listen to a maximum of 1024 streams.
> - There is a limit of **300 connections per attempt every 5 minutes per IP**.

（同样三行亦见于文档站期货侧 `### Websocket Limits`。）

⇒ **WS 的计数单位是「入站消息/秒」「订阅数/连接」「连接尝试/5 分钟/IP」**，**完全没有**出现「request weight」「`X-MBX-USED-WEIGHT`」这类 REST 概念。**REST 的请求权重不适用于 WS 连接。**

**（2）文档明确写的：WS 自己有「反复被断连可能被封」的机制。** 见上引 `web-socket-streams.md:77-78`。⇒ WS 的封禁是**连接/消息层**的，与 REST 权重**不是同一个账本**。

**（3）其他 WS 行为边界**（`web-socket-streams.md:41`、`:49-59`、`:60-61`，官方原文）：

> - The base endpoint is: **wss://stream.binance.com:9443** or **wss://stream.binance.com:443**.
> - A single connection to **stream.binance.com** is only valid for 24 hours; expect to be disconnected at the 24 hour mark.
> - The WebSocket server will send a `ping frame` every 20 seconds. … If the WebSocket server does not receive a `pong frame` back … the connection will be disconnected.
> - The base endpoint **wss://data-stream.binance.vision** can be subscribed to receive **only** market data messages. User data stream is **NOT** available from this URL.

**（4）USDⓈ-M 期货 WS 地址** —— 出处文档站 USDⓈ-M `general-info`（`### Testnet API Information`）与货安 WebSocket Market Streams 页：

> The Websocket base url for **testnet** is "wss://demo-fstream.binance.com"

⇒ 生产环境对应 **`wss://fstream.binance.com`**（测试网 `demo-fstream`）。

**（5）★ 直接问题的答案：REST 被封的 IP，WS 公开流能否用？**

**核不到。** 官方文档**没有任何一句**直接回答「一个正处于 REST 418 状态的 IP，是否可以建立 WS 连接」。本轮已定向检索现货 `rest-api.md`、`errors.md`、`web-socket-streams.md`、`faqs/market_data_only.md`、文档站 USDⓈ-M `general-info`，以及整本 `llms-full.txt`（**8,283,292 字节**，覆盖全部产品文档）——**未找到该陈述**。

**唯一的一手间接证据（文献事实，不是结论）**：`errors.md:30-33` 的 `-1003` 文案**自己就叫用户去用 WebSocket**：

> … Please use WebSocket Streams for live updates to avoid polling the API.
> Way too much request weight used; IP banned until %s. **Please use WebSocket Streams for live updates to avoid bans.**

§B.6 的实测亦独立观察到同一条建议（现货侧与期货侧的 `-1003` 文案一致）。

**判断（本笔记，非文档结论）**：把「`-1003` 封禁档文案主动建议改用 WS」＋「WS 与 REST 计数体系互相独立（§B.2(1)(2)）」两条合起来，**不支持**「WS 也会被 REST 权重封禁」这一说法。但这**不等于**文档确认了从被封 IP 能连上 WS——**未经实测**，且本轮安全约束**禁止**实测（IP 已被封，禁止再敲）。⇒ 若要落到工程决策，应**先做一次单连接、低频、只订阅、可随时中断的探测**，并承担「探测本身消耗 `300 次/5 分钟/IP` 连接预算」的代价；这一步本轮**未做**。

> **Lead 会话的补充（重要）**：Lead 会话记录称存在**两类 WS**，且 WS-**API**（`wss://ws-fapi.binance.com/ws-fapi/v1`，请求/应答式）的官方原文写着 **"This endpoint consumes IP-based request weight."**，即 **WS-API 同样吃 IP 权重**，而推送式 market streams 另论。**本轮未取得该页面原文**（文档站抓取超时），故该条**属Lead 会话断言，本轮未核实**（见 §核不到 N1）。若该条成立，则 §B.2 的结论必须细化为：**「WS 不吃 REST 权重」仅适用于推送式 market streams，不适用于 WS-API。**

## B.3 REST 权重模型（现货与 USDⓈ-M）

### B.3.1 现货（Spot）

**限额表** —— 出处 `rest-api.md:205-213` 与 `/api/v3/exchangeInfo` 响应样例 `rest-api.md:925-947`（官方仓库原文）：

```javascript
    "rateLimits": [
        { "rateLimitType": "REQUEST_WEIGHT", "interval": "MINUTE", "intervalNum": 1, "limit": 6000 },
        { "rateLimitType": "ORDERS", "interval": "SECOND", "intervalNum": 10, "limit": 50 },
        { "rateLimitType": "ORDERS", "interval": "DAY", "intervalNum": 1, "limit": 160000 },
        { "rateLimitType": "RAW_REQUESTS", "interval": "MINUTE", "intervalNum": 5, "limit": 61000 }
    ],
```

同页 `:211-213` 原文：

> - The `/api/v3/exchangeInfo` `rateLimits` array contains objects related to the exchange's `RAW_REQUESTS`, `REQUEST_WEIGHT`, and `ORDERS` rate limits. …
> - Requests fail with HTTP status code `429` when you exceed the request rate limit.

⇒ **现货公开数据预算的四条硬上限**：`REQUEST_WEIGHT` **6000/分钟**；`RAW_REQUESTS` **61000/5 分钟**；`ORDERS` 50/10 秒；`ORDERS` 160000/天。

**逐端点权重**（各端点 `**Weight:**` 行，官方仓库原文）：

| 端点 | 权重 | 出处行 |
|---|---|---|
| `GET /api/v3/ping`（Test connectivity） | **1** | `rest-api.md:842-843` |
| `GET /api/v3/time`（Check server time） | **1** | `rest-api.md:863-864` |
| `GET /api/v3/exchangeInfo`（Exchange information） | **20** | `rest-api.md:888-889` |
| `GET /api/v3/trades`（Recent trades list） | **25** | `rest-api.md:1126-1127` |
| `GET /api/v3/aggTrades`（Compressed/Aggregate trades list） | **4** | `rest-api.md:1238-1239` |
| **`GET /api/v3/klines`（Kline/Candlestick data）** | **2** | `rest-api.md:1280-1281` |
| `GET /api/v3/uiKlines` | **2** | `rest-api.md:1353-1354` |
| `GET /api/v3/avgPrice`（Current average price） | **2** | `rest-api.md:1407-1408` |
| `GET /api/v3/depth`（Order book） | **按 `limit` 调整** | `rest-api.md:1074-1082` |
| `GET /api/v3/ticker/24hr` | **按 symbol/symbols 数调整** | `rest-api.md:1436-1470` |

`GET /api/v3/depth` 的权重表（`rest-api.md:1076-1081` 原文）：limit `1-100` → **5**；`101-500` → **25**；`501-1000` → **50**；`1001-5000` → **250**。

`GET /api/v3/ticker/24hr` 的权重表（`rest-api.md:1450-1470`）：`symbol` 传 1 个 → **2**，省略 → **80**；`symbols` 传 `1-20` → **2**，`21-100` → **40**，`101+` → **80**，省略 → **80**。

**⇒ 客户端预算（本笔记计算，基于上表）**：现货 **`klines` 权重只有 2**，6000/分钟的 `REQUEST_WEIGHT` 理论上允许约 **3000 次/分钟**；但**真正先撞上的是 `RAW_REQUESTS` 61000/5 分钟 ≈ 12200/分钟**，故 `klines` 实际更接近**每秒 ~200 次**——**远高于任何合理研究脚本的需求**。⇒ 「429→418」几乎不可能由**温和的 klines 拉取**造成，更可能来自**高权重端点**（`depth` 250、`ticker/24hr` 80、`exchangeInfo` 20）或**多进程并发失控**（每进程都有「我没超限」的错觉，但权重**按 IP 合并计账**，见 §B.1(2)）。

### B.3.2 USDⓈ-M 期货

**限额表** —— 出处 `llms-full.txt:50138-50158`（USDⓈ-M WebSocket API 的 `rateLimits` 响应样例，官方文档原文）：

```json
  "rateLimits": [
    { "rateLimitType": "REQUEST_WEIGHT", "interval": "MINUTE", "intervalNum": 1, "limit": 2400, "count": 1 },
    { "rateLimitType": "ORDERS", "interval": "SECOND", "intervalNum": 10, "limit": 300, "count": 1 },
    { "rateLimitType": "ORDERS", "interval": "MINUTE", "intervalNum": 1, "limit": 1200, "count": 0 }
  ]
```

⇒ **USDⓈ-M 的 `REQUEST_WEIGHT` 是 2400/分钟**（现货 6000/分钟，**期货更紧**）。

同页 `### LIMITS` 原文说明限额来源：

> - The `/fapi/v1/exchangeInfo` `rateLimits` array contains objects related to the exchange's `RAW_REQUEST`, `REQUEST_WEIGHT`, and `ORDER` rate limits. …
> - A `429` will be returned when either rate limit is violated.

**429 → 418 升级路径**：现货与期货**完全一致**（期货原文见 §B.1(4)）——**违反限流 → 429；429 后退避失败 → 418 自动 IP 封禁；重复者时长 2 分钟～3 天**。

**⇒ 客户端预算（本笔记建议）**：

- **按 IP 而不是按进程计账。** 官方原文「based on the IPs, not the API keys」（`rest-api.md:229`）意味着**多脚本/多 kernel 共享同一份额度**；跨进程预算必须**集中**（单点限速器或令牌桶），而不是每个脚本各自决定「我才 10 次/秒」。
- **把 `X-MBX-USED-WEIGHT-*` 响应头当作唯一真实预算表**（`rest-api.md:217-218`），而不是本地估算的请求数：**先读头，再发下一批**。
- **留安全裕度**：期货 2400/分钟很窄。研究用途建议把**稳态占用压在额度 20% 以下**，并**单线程串行**。
- **收到任何 429 立即停**，读 `Retry-After` 当硬性截止（`rest-api.md:226-228`）；在 418 期间**一次都不发**。

## B.4 `GET /fapi/v1/fundingRate` 与期货 klines 是否需要鉴权

**（1）判定规则（官方原文）** —— 出处 `rest-api.md:263-286`（现货侧）与 `llms-full.txt:5722-5745`（同节的另一产品线副本）：

> - Each endpoint has a security type indicating required API key permissions, shown next to the endpoint name …
> - **If unspecified, the security type is `NONE`.**
> - Except for `NONE`, all endpoints with a security type are considered `SIGNED` requests (i.e. including a `signature`) …

现货侧安全类型表（`rest-api.md:280-286` 原文）：

| Security type | Description |
|---|---|
| `NONE` | Public market data |
| `TRADE` | Trading on the exchange, placing and canceling orders |
| `USER_DATA` | Private account information, such as order status and your trading history |
| `USER_STREAM` | Managing User Data Stream subscriptions |

⇒ **规则即「没标注 = `NONE` = 公开市场数据 = 不需要 key、不需要签名」。**

**（2）把规则应用到这两个端点** —— 出处 `llms-full.txt:205252-205278`（USDⓈ-M REST API 目录，官方文档原文）：

```
##### `GET /fapi/v1/fundingRate`

Get Funding Rate History

Operation ID: `getFundingRateHistory`

##### `GET /fapi/v1/klines`

Kline/Candlestick Data

Kline/candlestick bars for a symbol.
Klines are uniquely identified by their open time.

Operation ID: `klineCandlestickData`
```

⇒ 二者**名称后没有任何安全类型标注**（对比：`GET /dapi/v1/historicalTrades` 被显式标为 **`Old Trades Lookup (MARKET_DATA)`**，`llms-full.txt:205276-205280`，**带**标注）。按 (1) 规则，**`GET /fapi/v1/fundingRate` 与 `GET /fapi/v1/klines` 的安全类型是 `NONE`** ⇒ **公开、无需认证、无需签名**。

**（3）与用户预期的关系**：任务描述说「they should be public/unsigned」——**官方文档支持这一结论**，依据是「未标注即 `NONE`」规则 + 这两端点在目录中确实未标注。

> **判断（需注意的坑）**：USDⓈ-M `general-info` 页里那张**总表**把 `MARKET_DATA` 定义为「Endpoint requires sending a valid API-Key」。这与「未标注即 `NONE`」**不矛盾**——`MARKET_DATA` 是**需要显式标注**的少数端点（如 old trades lookup），普通 klines / fundingRate 属未标注的 `NONE`。⇒ 读文档时**不要**把总表里「MARKET_DATA 需要 key」误推广到所有行情端点。

**（4）现货对应物**：`faqs/market_data_only.md`（官方仓库原文）：

> These URLs do not require any authentication (i.e. The API key is not necessary) and serve only public market data.

并列出了 `data-api.binance.vision` 上免认证的 13 个端点，**含 `GET /api/v3/klines`**，以及免认证 WS 域名 **`data-stream.binance.vision`**（样例 `wss://data-stream.binance.vision:443/ws/btcusdt@kline_1m`）。

**（5）仓库侧的一手佐证（本轮已核实）** —— `data/BTCUSDT_funding.meta.json` 自记（原文）：

```json
  "kind": "funding_rate",
  "rows": 7795,
  "coverage": "2019-09-10 08:00 .. 2026-10-21 08:00 UTC",
  "interval": "8h",
  "source": "binance public futures REST /fapi/v1/fundingRate (no key, unsigned)",
  "audited": false,
```

⇒ **实做证据**：该文件（7,795 行、8h 间隔、覆盖 2019-09-10 至 2026-10-21）是在**不带密钥、不签名**的情况下取到的，与 §B.4(2) 的文档结论一致。
**注意 `audited: false`**：对照 `data/BTCUSDT_4h.meta.json` 的 `"audited": true`（`rows: 20041`，`source: "binance public REST (data-api.binance.vision /api/v3/klines)…"`），二者**不在同一档**。⇒ 首版接永续数据时，**资金费历史是现成的永续侧输入，但当前处于「未审计」状态**，这一区分应写进规格。

## B.5 地域限制（HTTP 451 或类似）与 418 的区别

**（1）HTTP 451：核不到。** 本轮在整本 `llms-full.txt`（8,283,292 字节，覆盖现货/期货/期权/钱包/股票等全部产品文档）检索 `451`——**未命中任何 HTTP 451 状态码**；现货 `rest-api.md` 与期货 `general-info` 的 `### HTTP Return Codes` **均未列出 451**。

**（2）文档里确实存在的「地域限制」是业务错误码，不是 HTTP 层。** 可查到的是**期权侧**错误码（出处 `llms-full.txt:69501-69503`，文档 `/products/derivatives-trading-options/error-code`，官方原文）：

> ### -5009 IP_COUNTRY_BLACK
>
> - Restricted jurisdiction ip address

**（3）418 与地域限制的区别（本笔记判断，基于 §B.1 与 §B.5(2) 的事实）**：

| | 418 / `-1003` | 地域类错误（如 `-5009`） |
|---|---|---|
| 触发原因 | **客户端行为**：429 后退避失败、反复超限（`rest-api.md:222-225`） | **客户端所处位置**：IP 归属受限司法辖区 |
| 是否随时间自愈 | **是**，且有明确到期时刻（`-1003` 文案含 `IP banned until %s`；418 响应带 `Retry-After`） | **否**，换时间无用，需换出口/合规路径 |
| 是否可因「做得更慢」而避免 | **是**（降低权重占用即可避免） | **否** |
| 应对 | 读 `Retry-After`，等到期，降低稳态权重（§B.3.2） | 不能靠退避解决 |

⇒ **怎么区分（判断）**：**看有没有「到期时刻」**。418 一定带 `Retry-After` 头或 `-1003` 的 `IP banned until %s` 文案（`rest-api.md:226-228`、`errors.md:32`）；地域限制**不会**承诺「等到某时刻就恢复」。若错误里出现国家/辖区字样（如 `-5009 IP_COUNTRY_BLACK`），那**不是** 418。

## B.6 Lead 会话的实测记录（**发现封禁时所作，非本轮调研**）

> **来源与性质（已更正）**：以下数据由**本会话的 Lead 模型**在 2026-10-22 约 **20:53–20:58 CST** 实测产生，**目的是发现并刻画封禁本身**；**早于**「不要碰 `fapi.binance.com`」这条约束被写成调研任务书的时间。因此**不按违规论**，但下文第 3 条观测必须承认为 Lead 自身造成的影响。该批请求本身**正是**「收到 429 后继续发请求」这一触发条件的实例——**本文档不为其背书，也不在本轮重复**；仅因它是**目前关于封禁行为最直接的一手观测**而**原样保留并标注来源**。
>
> **此后本会话未再对 `fapi.binance.com` 发起任何请求**（末次约 20:58）。
> 出口 IP `66.90.98.34`（经本机代理 `127.0.0.1:7890`）。

| 端点 | 结果 |
|---|---|
| `https://api.binance.com/api/v3/ping` | **200** |
| `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=3` | **200**（返回完整字段） |
| `https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=3` | **200** |
| `https://api.binance.com/api/v3/exchangeInfo?symbol=BTCUSDT` | **200** |
| `https://fapi.binance.com/fapi/v1/ping` | **418** |
| `https://fapi.binance.com/fapi/v1/klines?...` | **418** |
| `https://fapi.binance.com/fapi/v1/exchangeInfo` | **418** |
| `https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=3` | 首次 **200**，随后 **418** |

418 响应体原文（同一分钟内的连续三次）：

```
{"code":-1003,"msg":"Way too many requests; IP(66.90.98.34) banned until 1792695835787. Please use the websocket for live updates to avoid bans."}
{"code":-1003,"msg":"Way too many requests; IP(66.90.98.34) banned until 1792694753316. Please use the websocket for live updates to avoid bans."}
{"code":-1003,"msg":"Way too many requests; IP(66.90.98.34) banned until 1792696319872. Please use the websocket for live updates to avoid bans."}
```

**三条可用的观测（事实层面）**：

1. **可达性是「不对称」的**：同一 IP 上**现货两个主机 200、期货 REST 418**。⇒ **封禁是分产品的，不是整站一刀切**。这与 §B.1(2) 的「The limits on the API are based on the IPs」并不冲突——**按 IP 计账 ≠ 所有产品线共享同一个封禁状态**。这一条**本轮无法独立证实**（未发请求），但**与 §B.3 的文档结构自洽**（现货与期货各有独立的 `rateLimits` 表）。
2. **重试会把封禁窗口推后**：`banned until` 在连续重试中变化（先 `…835787`，降到 `…753316`，又升到 `…319872`）。这与 §B.1 的官方机制**自洽**，也是本轮安全约束存在的**直接理由**。
3. **官方在报错体里主动建议改走 websocket**（`Please use the websocket for live updates to avoid bans`）——与 §B.2(5) 引用的现货 `errors.md` 文案**同一建议**，可互相印证。

**换算（Lead 会话给出）**：`1792696319872` ms ≈ 该会话当时时刻 **+ 6.2 小时**（同刻现货 `serverTime` 为 `1792673892981`）。本轮**未独立验算**该换算。

---

## 核不到（明确缺口，禁止当成「没有」）

| # | 项 | 状态 | 缺口说明 |
|---|---|---|---|
| N1 | **REST 处于 418 的 IP，能否建立推送式 WS 连接并收到公开行情** | **核不到** | 官方文档（现货 `rest-api.md`/`errors.md`/`web-socket-streams.md`/`faqs/market_data_only.md`、期货 `general-info`、以及 8.28MB `llms-full.txt` 全文）**均无直接陈述**。仅有「`-1003` 文案建议改用 WS」＋「WS 与 REST 计数体系独立」两条间接证据（§B.2）。**未实测**（安全约束禁止）。**另**：Lead 会话称 WS-**API**（`wss://ws-fapi.binance.com/ws-fapi/v1`）公告里有 "This endpoint consumes IP-based request weight."——**本轮未取得该页原文**，该断言**未核实**；若成立，「WS 不吃权重」须限定为**推送式 market streams**。 |
| N2 | **HTTP 451 在 Binance 文档中的定义** | **核不到（未出现）** | 全文检索 `451` 无命中，文档**未定义** 451。已查到的地域限制是业务码 `-5009 IP_COUNTRY_BLACK`（§B.5）。**不能**表述为「Binance 会用 451」。 |
| N3 | **`data-api.binance.vision` 是否也受同一 IP 封禁影响** | **核不到（本轮未测）** | 文档只说该域「不需要认证、只提供公开行情」（`faqs/market_data_only.md`），**未说**它是否与 `api.binance.com` 共享同一份 IP 权重账本或封禁状态。本轮**未对该域发任何请求**。⚠️ Lead 实测（发现封禁时）该域返回 **200**（§B.6）——但那是**一个时间点、一个端点**的观测，**不足以**推断封禁状态下它始终可用。 |
| N4 | **USDⓈ-M 各行情端点的逐端点权重表** | **部分核到** | 已核到总限额（2400/分钟）与「每路由有权重、多 symbol 端点更重」（`general-info`），但**未取得** `/fapi/v1/klines`、`/fapi/v1/fundingRate` 的**逐端点**权重数值（现货侧已逐条核到，§B.3.1）。 |
| N5 | **`stats.py` 中 PBO 随机抽 4000 组合的实际数值影响** | **未复核** | `stats.py:169-174` 在组合数超 4000 时随机抽样。本轮**未跑任何代码**，该近似对 PBO 的偏差**未量化**。 |
| N6 | **`reality_check` 的块自助是否等价于 Politis–Romano 平稳自助** | **未复核** | §A.1.1 的判断仅基于代码结构与注释（`stats.py:223-226`），**未做数值实验**（本轮禁止执行）。 |
| N7 | **仓内是否已有成本压力档位与冻结口径件** | **已核到（2026-10-22 21:5x 更正）** | 前版本因**检索路径不全**（只看了两个「根目录」，漏了 `reports\` 与 `docs\`）误报为「未找到」，现更正如下。**已实地核实存在**：① `binance-spot-quant/reports/FREEZE_4H_RULE.md`（3,058 B，2026-10-17 09:13）——成本公式 `fee 0.1%×2 + slippage 0.1%×2 = 0.4%`、「不因结果不好而事后改门槛」承诺、判据 `trades≥30`/`segmentsWithTrades≥15`/`netAfterCosts>0`/`vsNull`、`realMoney=LOCKED`；② `binance-spot-quant/docs/SYSTEM_ROADMAP.md`（9,554 B，2026-10-21 23:25）——六层蓝图与 G1–G9 缺口，其中 G6 记「成本模型拆成费率/滑点两栏 ✅ 已完成」；③ `viz/src/gen/backtest-4h.json`——确含 6 个结果段（dev/validation/OOS + 3 个成本压力档：手续费×2、单边滑点 0.25%、单边滑点 0.50%）；④ `data/BTCUSDT_funding.meta.json`（`audited: false`）与 `data/BTCUSDT_4h.meta.json`（`audited: true`）；⑤ `D:\ops\docs\adr\` 下 `0001/0002/0003`。**仍未核实**：`edge_scan` 那 5 档成本敏感性表的具体档位数值（`SYSTEM_ROADMAP.md` 仅记「已完成」，本轮未打开 `edge_scan.py` 的成本档位代码段）。 |
| N8 | **期权侧 `-5009 IP_COUNTRY_BLACK` 是否适用于现货/期货** | **核不到** | 该码出现在 `/products/derivatives-trading-options/error-code`。现货/期货的错误码文档**未出现**同一码，因此**不能断言**现货/期货会返回它。 |
| N9 | **`llms-full.txt` 的完整性与时效** | **部分核到** | 该文件为 `developers.binance.com/en/docs/llms-full.txt`，本轮抓取 **8,283,292 字节、HTTP 200**。期货 `general-info` 页脚自标 *Last modified on October 20, 2026*。但**未核对**它与所有逐页文档的**版本一致性**（可能存在站上已更新而 `llms-full` 未同步的页）。 |
| N10 | **本机代理出口 IP 的归属与共享情况** | **核不到** | 只知道出口是 `66.90.98.34`（§B.6），**不知道是独享还是共享节点**。若共享，**他人的请求也会把该 IP 推向封禁**——这会改变「本地降速就能避免 418」这一结论的强度。 |

---

## 证据索引（本轮实际用到的只读命令与来源）

### 仓库（只读）

```bash
read  D:\workspace\代币交流群\binance-spot-quant\research\stats.py          # 1-371 全文
read  D:\workspace\代币交流群\binance-spot-quant\research\edge_scan.py      # 1-120, 150-309, 280-459
read  D:\workspace\代币交流群\binance-spot-quant\research\xs_scan.py        # 232-291
read  D:\workspace\代币交流群\binance-spot-quant\research\intraday_scan.py  # 190-249
grep -rniE "deflated|dsr|pbo|cscv|reality_check|white|spa|hansen|bootstrap|confidence|bonferroni" research/*.py
grep -rniE "1\.5|stress|rolling|window|confidence|lower_bound|percentile" research/*.py
head -c 700 data/BTCUSDT_funding.meta.json          # audited:false, rows:7795, source:(no key, unsigned)
grep -oE '"(audited|source|rows)"[^,]*' data/BTCUSDT_4h.meta.json   # audited:true, rows:20041
ls /d/ops/docs/adr/                                  # 0001 / 0002 / 0003 存在
```

### Binance 官方文档（只读 GET；**未触碰任何 API 业务主机**）

| 来源 | URL | 本轮用途 |
|---|---|---|
| 现货 REST 文档（官方仓库 raw） | <https://raw.githubusercontent.com/binance/binance-spot-api-docs/master/rest-api.md> | §B.1(1)(2)、§B.3.1、§B.4(1) |
| 现货错误码（官方仓库 raw） | <https://raw.githubusercontent.com/binance/binance-spot-api-docs/master/errors.md> | §B.1(3) |
| 现货 WS 文档（官方仓库 raw） | <https://raw.githubusercontent.com/binance/binance-spot-api-docs/master/web-socket-streams.md> | §B.2(1)(3) |
| 仅行情域 FAQ（官方仓库 raw） | <https://raw.githubusercontent.com/binance/binance-spot-api-docs/master/faqs/market_data_only.md> | §B.4(4) |
| 官方仓库 README | <https://raw.githubusercontent.com/binance/binance-spot-api-docs/master/README.md> | 定位 `faqs/market_data_only.md` |
| USDⓈ-M 期货 General Info（文档站） | <https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/general-info> | §B.1(4)、§B.2(4)、§B.3.2、§B.4(1) |
| 全量文档（LLM 版，单文件 8,283,292 B） | <https://developers.binance.com/en/docs/llms-full.txt> | §B.3.2 限额 JSON、§B.4(2) 目录、§B.5(2)、安全类型表 |
| 仓库页（清单/兜底） | <https://github.com/binance/binance-spot-api-docs> | 文件清单 |
| 期货 Fee / 现货 Fee（**Lead 会话**引用） | <https://www.binance.com/en/fee/trading> ・<https://www.binance.com/en/fee/futureFee> | 费率档位（参照 `binance-trading-cost-facts-20261022.md`） |

### 文献（§A.3）

| 方法 | 文献 | URL |
|---|---|---|
| DSR | Bailey & López de Prado (2014), *JPM* 40(5):94–107 | <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551> ・PDF <https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf> |
| PBO / CSCV | Bailey, Borwein, López de Prado & Zhu (2017), *JCF* 20(4):39–69 | <https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253> ・PDF <https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf> |
| Reality Check | White (2000), *Econometrica* 68(5):1097–1126 | <https://www.econometricsociety.org/publications/econometrica/2000/09/01/reality-check-data-snooping> |
| SPA | Hansen (2005), *JBES* 23(4):365–380 | DOI `10.1198/073500105000000063` ・<https://ideas.repec.org/a/bsa/jnlbes/v23y2005i4p365-380.html> |
| 补充 | Bailey, Borwein, López de Prado & Zhu (2014), *Notices of the AMS* 61(5):458–471 | DOI `10.2139/ssrn.2308659` |

### 本笔记的两条自算数字（非引用，可复核）

| 数字 | 算式 | 用途 |
|---|---|---|
| Bonferroni t 门槛 ≈ **2.905** | `sqrt(2 * ln 68)`；`ln 68 = 4.219508` | 复核 `edge_scan.py:396-397` 的 N=68 门槛 |
| W=5 的单侧 95% t 乘数 ≈ **2.132** | t 分布，df = 5−1 = 4，单侧 α = 0.05 | §A.4.2 第 3 步参数法配方 |

---

## 一页纸交付（给决策者）

1. **那句验收话术不是一个有名统计量**，是 5 个条件的捆绑；仓库**已有**最强的一项（多重比较校正的**四套**实现：`stats.py` 的 DSR/PBO/RC ＋ `edge_scan.py:397` 的 Bonferroni），**完全没有**「滚动窗口」「CI 下界」「1.5× 成本闸门」三项。
2. **「≥5 窗口 ＋ 95% CI 下界 > 0」确实是独立统计量**，必须独立实现——它与仓库现有逐 bar t 值（`edge_scan.py:234`）在**统计单元上不同**（窗口 vs bar），**不能**互相顶替。
3. **多重比较与窗口数的正确关系（判断）**：校正在 **N（配置数）** 上做，**不在 W（窗口数）** 上；只有当「窗口长度/起点」本身被搜索时，W 才并入 N。
4. **「5 个窗口」没有文献依据**，是工程约定；W=5 只有 4 个自由度，下界对方法选择很敏感。**建议 W ≥ 10**，或至少**明确标注该口径为项目自定**（判断）。
5. **Binance 侧**：418 = **已被自动封禁**（不是限流）；**重试会延长封禁**（官方原文把「429 后退避失败」列为触发原因，时长 2 分钟→3 天，§B.6 已观察到窗口被推后）；**权重按 IP 计账**，多进程共享同一额度。
6. **WS 与 REST 是两套计数体系**（WS：5 条入站消息/秒、1024 订阅/连接、300 连接尝试/5 分钟/IP），REST 权重**不适用**于推送式 WS；**但「被封 IP 能否用 WS」官方文档没写 ⇒ 核不到**，唯一一手间接证据是 `-1003` 文案**主动建议改用 WS**。（Lead 会话另称 WS-API **吃** IP 权重——**本轮未核实**。）
7. **`fundingRate` 与期货 klines 无需认证**：规则是「**未标注安全类型即 `NONE`**」，而这两个端点在官方目录里**未标注**；仓内 `data/BTCUSDT_funding.meta.json` 的 `source`（`no key, unsigned`、7,795 行）是**实做佐证**。
8. **HTTP 451 在 Binance 文档中不存在**（核不到）；可查到的地域限制是业务码 `-5009 IP_COUNTRY_BLACK`。**区分 418 与地域限制的最简判据：看有没有「到期时刻」**——418 一定带 `Retry-After` 或 `IP banned until`。
9. **给首版的三条直接含义（综合两版）**：
   - 验收门要**新建一层**（滚动窗口 CI），并让**新门与既有三件并联**、两套都过；新门只对**新策略版本**生效，避免与既有冻结承诺冲突（该冲突的裁决**本轮未能核实**，见 N7）。
   - **418 接进「保护模式」**：它是「保护模式」第一个**真实发生过**的触发源，要求**退避 + 停止重试 + 记录事件 + 仅在人工确认后恢复**。
   - **永续侧首版按「历史」与「实时」拆开**：**历史**（资金费 CSV 现成但 `audited:false` 需补审计；永续 K 线可经现货主机或解封后补齐）与**实时**（封禁期内不可保证，须先解决 WS streams 可行性或换出口节点）。