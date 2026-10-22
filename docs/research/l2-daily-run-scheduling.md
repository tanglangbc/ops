# L2 每日任务：真实调度与失败语义（只读事实核查）

- 核查对象：`D:\workspace\代币交流群`
- 核查时间：2026-10-22 13:2x（本地 China Standard Time UTC+08:00）
- 方法：只读。`read` 读脚本、`schtasks /query` 查计划任务、`Get-Content`/`ls` 查日志与状态件、`grep` 找引用与清理逻辑。
- 未执行：`l2_daily_run.py`、`refresh_l2_data.py`、任何 git 操作、任何写仓库操作。
- 标注约定：事实一律带「文件:行号」或命令输出原文；推不出的写 **核不到**；凡属本人判断而非事实的，集中在 §6 并显式标注「判断」。

---

## 0. 结论速览（TL;DR）

1. **`tools\card_cron.cmd` 不存在**。仓库里唯一的 `card_cron.cmd` 在 `binance-spot-quant\reports\`，属**另一个**任务（`alice-card-4h`，4 小时卡片判定），**与 L2 无关**。
2. L2 的真实调度载体是 Windows 计划任务 **`\mss002-l2-daily`**：**每日 08:10（+08:00）**，动作 = `python.exe "D:\workspace\代币交流群\tools\l2_daily_run.py"`，工作目录 `binance-spot-quant`。
3. 流程顺序（即执行顺序）：**⓪ 刷新 → ① 陈旧闸门 → ② 记录/台账追加 → ③ 不变式硬闸门 I1–I5 → ④ 台账体检**。台账追加**幂等**（键 `record_date+symbol`，重复只报 `SKIP_DUPLICATE`）；快照文件**不幂等**（同日重跑会新增带字母后缀的快照）。
4. 退出码 **0/1/2/3/4**（不是只有 0/1/2）：3=STALE、4=刷新失败。**失败无人自动感知**：任务定义里没有任何通知动作，日志/状态件是唯一留痕，且任务只在**用户已登录**时才会跑。
5. 日志：`reports\_l2_run_<UTC>.log`（每次一份）+ `reports\_l2_last_status.json`（覆写）。**未找到任何清理/保留策略**。
6. 「站点构建」在仓库内**核不到**构建脚本；现存可视化交付是 `tools\manifest_build.py` 派生的 `viz\manifests\*.manifest.json`，且该脚本**拒绝覆写同名输出**。因此最安全插入点是**独立计划任务（或独立包装 cmd）**，不是塞进 `l2_daily_run.py` 尾部。

---

## 1. 调度载体

### 1.1 `tools\card_cron.cmd` —— 不存在（已证实缺席）

```
$ ls -la tools/card_cron.cmd
ls: cannot access 'tools/card_cron.cmd': No such file or directory
```

### 1.2 实际存在的 `card_cron.cmd` 是**另一条线**（4h 卡片任务）

`binance-spot-quant\reports\card_cron.cmd`（16 行，全文）：

```
@echo off
REM 4h card run for plan A. Fetches the public price (no auth) so the
REM no-chasing check has a real price, then runs the read-only card script.
REM Never passes --simulate-now (that is a test clock).
setlocal
set "PY=C:\Users\fixadmin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
set "DIR=C:\Users\fixadmin\.dsh\bot\workspace\binance-spot-quant"
set "LOG=%DIR%\reports\card_cron.log"
set "PX="
for /f "usebackq delims=" %%p in (`"%PY%" "%DIR%\reports\live_price.py"`) do set "PX=%%p"
if defined PX (
  "%PY%" "%DIR%\reports\card_now.py" --price %PX% >> "%LOG%" 2>&1
) else (
  "%PY%" "%DIR%\reports\card_now.py" >> "%LOG%" 2>&1
)
exit /b %ERRORLEVEL%
```

要点：
- 调用的是 `card_now.py`（4h 入场判定/D139 口径），**不是** `l2_daily_run.py`。
- 它把 `DIR` 写死为 **`C:\Users\fixadmin\.dsh\bot\workspace\binance-spot-quant`**（`.dsh` bot 工作区），**不是** `D:\workspace\代币交流群\binance-spot-quant`。两者是不同路径，核查时勿混淆。
- 日志落地 `reports\card_cron.log`；该日志尾部最后几行是 `STALE ... (刷新失败：URLError: <urlopen error [SSL: UNEXPECTED_EOF_WHILE_READING] ...>)` 与一个 `^C`，说明这条 4h 线曾因 TLS 取数失败而 STALE 并被中断（`Get-Content binance-spot-quant/reports/card_cron.log` 尾部原文）。

### 1.3 驱动它的计划任务：`\alice-card-4h`（非 L2）

`schtasks /query /tn "\alice-card-4h" /fo LIST /v` 原文关键行：

```
TaskName:      \alice-card-4h
Next Run Time: 2026/10/22 16:05:00
Status:        Ready
Logon Mode:    Interactive only
Last Run Time: 2026/10/22 12:05:01
Last Result:   0
Task To Run:   "C:\Users\fixadmin\.dsh\bot\workspace\binance-spot-quant\reports\card_cron.cmd"
Start In:      N/A
Run As User:   fixadmin
Schedule Type: One Time Only, Hourly
Start Time:    8:05:00
Start Date:    2026/10/16
Repeat: Every: 4 Hour(s), 0 Minute(s)
```

### 1.4 L2 的真实载体：`\mss002-l2-daily`

`schtasks /query /tn "\mss002-l2-daily" /fo LIST /v` 原文：

```
TaskName:                              \mss002-l2-daily
Next Run Time:                         2026/10/23 8:10:00
Status:                                Ready
Logon Mode:                            Interactive only
Last Run Time:                         2026/10/22 8:10:01
Last Result:                           0
Task To Run:                           C:\Users\fixadmin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe "D:\workspace\代币交流群\tools\l2_daily_run.py"
Start In:                              D:\workspace\代币交流群\binance-spot-quant
Comment:                               MSS-002 L2 前向日线：08:10 刷新→陈旧闸门→记录→I1–I5 硬闸门→体检。仅研究/模拟，不接账户。
Scheduled Task State:                  Enabled
Run As User:                           fixadmin
Stop Task If Runs X Hours and X Mins:  00:30:00
Schedule Type:                         Daily
Start Time:                            8:10:00
Start Date:                            2026/10/19
Days:                                  Every 1 day(s)
```

### 1.5 触发时刻与时区

`schtasks /query /tn "\mss002-l2-daily" /xml`（实时 XML）原文：

```
<Triggers>
  <CalendarTrigger>
    <StartBoundary>2026-10-19T08:10:00+08:00</StartBoundary>
    <ScheduleByDay>
      <DaysInterval>1</DaysInterval>
    </ScheduleByDay>
  </CalendarTrigger>
</Triggers>
```

系统时区（`Get-TimeZone` 输出）：

```
China Standard Time / (UTC+08:00) 北京，重庆，香港特别行政区，乌鲁木齐
```

⇒ **每天 08:10 CST（UTC+08:00）**。日志时间戳与之自洽：`_l2_run_20261022T001002Z.log` 的 `00:10:02Z` 对应本地 `08:10:02`（见该日志 `[refresh] 当前 UTC=2026-10-22 00:10:02  CST=2026-10-22 08:10:02` 原文）。

### 1.6 任务 Settings（实时 XML 原文）

```
<Settings>
  <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
  <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
  <ExecutionTimeLimit>PT30M</ExecutionTimeLimit>
  <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
  <StartWhenAvailable>true</StartWhenAvailable>
  ...
</Settings>
<Principals>
  <Principal id="Author">
    <UserId>S-1-5-21-609768411-3798250213-1495973018-1002</UserId>
    <LogonType>InteractiveToken</LogonType>
  </Principal>
</Principals>
```

含义（可核到的事实层面）：
- `StartWhenAvailable=true`：错过触发点（关机/重启）后**补跑**。
- `MultipleInstancesPolicy=IgnoreNew`：已在跑时**不再起第二个实例**。
- `ExecutionTimeLimit=PT30M`：超 30 分钟**被终止**。
- `LogonType=InteractiveToken` + `Logon Mode: Interactive only`：**只在 fixadmin 已登录交互会话时运行**。
- 电池两个条件均 `false`：不因电池阻止/中止。

### 1.7 快照与实时状态一致性

- `reports\_task_xml_after_actionchange_mss002-l2-daily_20261019.xml` 与上面实时 `schtasks /xml` **内容一致**（同 StartBoundary / 同 Command / 同 Settings）。
- `Compare-Object` 前后快照，差异仅一行：

```
<Command>C:\Users\fixadmin\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe</Command>   (after)
<Command>C:\Users\fixadmin\AppData\Local\Programs\Python\Python313\python.exe</Command>                    (before)
```

- `reports\_task_prereq_mss002-l2-daily_20261019.txt` 原文记录了建任务前状态与当时的解释器：
  `python: C:\Users\fixadmin\AppData\Local\Programs\Python\Python313\python.exe`，`schtasks /query 原文: ERROR: The system cannot find the file specified.`（证明该任务 2026-10-19 才新建）。

### 1.8 一天多次重启（解释 `StartWhenAvailable` 为何必要）

`Get-WinEvent -FilterHashtable @{LogName='System'; Id=6005} -MaxEvents 8` 输出（系统启动事件）：

```
2026/10/22 10:24:28
2026/10/22 8:05:58
2026/10/21 17:07:07
2026/10/21 9:56:21
2026/10/21 7:55:46
2026/10/20 17:39:14
2026/10/20 8:01:51
2026/10/19 10:17:27
```

⇒ 本机**一天内多次重启**（10-21 三次、10-22 两次）。注意 `10/22 8:05:58` 这次重启紧贴 08:10 触发点，`StartWhenAvailable` 在此直接起作用。

### 1.9 全量任务列表里与 L2 相关的只有一条

`schtasks /query /fo CSV /nh | Select-String 'mss002|binance|card|l2'` 输出：

```
"\alice-card-4h","2026/10/22 16:05:00","Ready"
"\mss002-l2-daily","2026/10/23 8:10:00","Ready"
"\Microsoft\Windows\EDP\StorageCardEncryption Task","N/A","Ready"
```

（第三条是 Windows 自带的存储卡加密任务，与项目无关。）
另有 `\alice-shadow-watchdog`、`\ashare_a47_watchdog` 两个看门狗任务，但**没有** L2 的看门狗（全列表 `schtasks /query /fo LIST` 可见，无 L2 项）。

---

## 2. `tools\l2_daily_run.py`：入口与流程顺序

### 2.1 入口

- 计划任务动作 = `python.exe "D:\workspace\代币交流群\tools\l2_daily_run.py"`，`WorkingDirectory=D:\workspace\代币交流群\binance-spot-quant`（§1.4/§1.5 XML 原文）。
- 脚本内默认树 `DEFAULT_TREE = r"D:\workspace\代币交流群\binance-spot-quant"`（`tools/l2_daily_run.py:58`）。
- `main()` 入口在 `tools/l2_daily_run.py:177`；`if __name__ == "__main__"` 在 `:374-379`，`KeyboardInterrupt` → `sys.exit(130)`（`:377-379`）。

### 2.2 顺序 = 执行顺序（docstring 明确写死）

`tools/l2_daily_run.py:9` 原文：
> 「本脚本补五件事（**顺序即执行顺序：⓪ 刷新 → ① 陈旧闸门 → ② 记录 → ③ 硬闸门 I1–I5 → ④ 体检**）」

代码位置逐段核对：

| 段 | 内容 | 代码位置 |
|---|---|---|
| ⓪ | 调用 `reports/refresh_l2_data.py`（子进程，`cwd=tree`） | `l2_daily_run.py:250-292` |
| ① | 陈旧闸门：`expected_bar = as_of - 1 天`；5 品种末根比对；STALE/FUTURE 收集 | `:202-204`、`:294-320` |
| ② | 运行记录器 `reports/mss002_l2_record.py`（子进程）→ 台账追加 | `:322-334` |
| ③ | 不变式硬闸门 I1–I5：子进程 `reports/l2_stats.py`（唯一实现 `l2_invariants.py`） | `:336-352` |
| ④ | 台账体检（字段齐全 / 数据件哈希留痕） | `:354-371` |

关键先后关系（**闸门在记录之前**）：`:316-320` —— 若 `stale` 非空且非 `--audit-only`，**直接 `finish(3)` 返回，记录器根本不会运行**。注释原文（`:19-20`）说明理由：记录器幂等键是 `record_date+symbol`，数据不刷新时每天会为**同一根 bar** 写一条新 `record_date` 行 = 把同一信号重复计入样本。

### 2.3 幂等性：分两层，结论不同

**(a) 台账追加 —— 幂等。**
- 口径：幂等键 `record_date+symbol`，只追加（`l2_daily_run.py:8` docstring：「幂等键 record_date+symbol，只追加」；`L2_DAILY_RUN.md:16`：「同日同品种重复跑只报 `SKIP_DUPLICATE`，不写第二行」）。
- 退出码表把重复运行算作正常：`EXIT_CODES[0] = "正常（含同日重复运行全部 SKIP_DUPLICATE）"`（`l2_daily_run.py:66`）。

**(b) 数据快照 —— 不幂等（会新增文件，但不覆盖、不产生第二行台账）。**
- 刷新只追加 `close_time <= now` 的 bar（`l2_daily_run.py:252` 注释；实测日志 `[refresh] 只追加 close_time <= 当前时间 的 bar`）。
- 无新已收盘 bar → **不落盘**：`refresh_l2_data.py:185` `print(f"[refresh] {sym}: 无新已收盘 bar（末根 ..., 跳过未收盘 ... 根）-> 不落盘")`。
- 同日已有快照时用**字母后缀**避让：`refresh_l2_data.py:80-94` `next_snapshot_name()`，正则 `_snapshot(\d{8})([a-z]?)\.csv$`（`:54`）；若目标仍存在则**拒绝覆写**并记失败：`:191-193` `"目标文件已存在，拒绝覆写 {out_name}"`。
- 即：同日第二次跑若又有新收盘 bar，会产出 `..._snapshot20261022a.csv` 之类**新文件**，台账不会重复。

### 2.4 2026-10-22 实际运行（最有力的一次实证）

`reports\_l2_run_20261022T001002Z.log` 原文要点：

```
EXIT_CODE 表: 0=正常（含同日重复运行全部 SKIP_DUPLICATE） | 1=... | 2=... | 3=STALE... | 4=刷新失败...（唯一口径，2026-10-19 军机定）
as_of=2026-10-22  expected_last_closed_bar=2026-10-21
数据刷新：refresh_l2_data.py
  刷新结果：新建 5 份，最新已收盘 bar={'BTCUSDT': '2026-10-21 00:00', ...}
BTCUSDT: 数据末根 2026-10-21 （行 3353，BTCUSDT_1d_snapshot20261022.csv [snapshot]） 期望 2026-10-21 -> OK
  BTCUSDT: WROTE bar=2026-10-21 signal=NO_SIGNAL close=84093.4 gap=-2605.57 failed=['breakout_not_met'] file=...csv
  rows_written=5  EXIT_CODE=0
  [gate] I1 PASS / I2 PASS / I3 PASS / I4 PASS / I5 PASS
  [gate] STATS_EXIT_CODE=0
台账：55 行（daily 40）
体检通过：有效 daily 行 25，本日 record_date=2026-10-22 有效行数 5
ledger_size : 40448 -> 44747 B
note        : 正常
EXIT_CODE   : 0
```

对应状态件 `reports\_l2_last_status.json`（全文）：

```json
{
  "run_at_utc": "2026-10-22T00:10:06Z",
  "as_of": "2026-10-22",
  "expected_bar_date": "2026-10-21",
  "ledger": "D:\\workspace\\代币交流群\\binance-spot-quant\\reports\\L2_FORWARD_LEDGER.jsonl",
  "ledger_rows_after": 55,
  "log": "D:\\workspace\\代币交流群\\binance-spot-quant\\reports\\_l2_run_20261022T001002Z.log",
  "exit_code": 0,
  "note": "正常"
}
```

---

## 3. 退出码语义与失败感知

### 3.1 唯一口径表在代码里（`0/1/2/3/4`）

`tools/l2_daily_run.py:65-71`：

```python
EXIT_CODES = {
    0: "正常（含同日重复运行全部 SKIP_DUPLICATE）",
    1: "不变式硬闸门 I1–I5 不通过 / 台账体检不通过",
    2: "环境错误（口径件/记录器/刷新脚本/闸门脚本缺失、刷新脚本异常、记录器自身失败）",
    3: "STALE：陈旧闸门触发，数据未刷新，已拒绝落行",
    4: "刷新失败：数据不可得或校验不通过（未运行记录器）",
}
```

每次运行**日志第一行**打整表（`:243-244`），实测见 §2.4 第一行。

### 3.2 各码的触发点（逐条对应代码）

| 码 | 触发点 |
|---|---|
| 0 | `:371` `return finish(0, "正常")` |
| 1 | `:352` 闸门不通过（`l2_stats.py` 非 0）；`:363` 体检 `fails` 非空 |
| 2 | `:191` 记录器缺失；`:195` 闸门模块缺失；`:200` 口径件缺失；`:261` 刷新脚本缺失；`:292` 刷新脚本异常；`:306` 数据件缺失；`:332` 记录器自身失败；`:341` 闸门脚本缺失 |
| 3 | `:320` STALE（数据未刷新，**记录器未运行**） |
| 4 | `:291` 刷新失败 |

### 3.3 刷新失败码的归一化（3/4 → 4）

`tools/l2_daily_run.py:74-82`：

```python
def map_refresh_failure(code: int) -> int:
    return 4 if code in (3, 4) else 2
```

`:288-289` 对旧契约的 3 还额外打一条警告。⇒ **入口输出里的 `3` 只可能表示 STALE**，不会表示刷新失败。

### 3.4 失败留痕：日志 + 状态件（都在 `finish()` 里）

`tools/l2_daily_run.py:217-241`：`finish(code, note)` 统一做四件事——
1. 算 `ledger_size` / `ledger_sha` 前后（`:218-224`）并追加 `note` 与 `EXIT_CODE   : {code}`（`:225-227`）；
2. 写 `reports/_l2_run_<UTC时间戳>.log`（路径构造 `:209-210`，落盘 `:230`）；
3. 写 `reports/_l2_last_status.json`（`:231-238`，含 `exit_code`、`note`、`log`）；
4. 控制台打印 `[l2] EXIT_CODE = n`（`:240`）。

### 3.5 失败时**谁感知**（关键结论）

- **任务定义里没有任何通知动作**：实时 XML 的 `<Actions Context="Author">` 只有一个 `<Exec>`（python + 脚本 + 工作目录），无邮件、无事件日志写入、无脚本钩子。
- **没有 L2 看门狗任务**：全量任务列表中看门狗只有 `\alice-shadow-watchdog`、`\ashare_a47_watchdog`（`schtasks /query /fo LIST` 输出），无 `l2` 相关 watchdog。
- **`LogonType=InteractiveToken` + `Logon Mode: Interactive only`** ⇒ 用户未登录时任务**根本不启动**：既无日志、也不更新 `_l2_last_status.json`，`Next Run Time` 会过去而 `Last Run Time` 不前进。
- 调度器只把结果记进 `Last Result`（当前 `0`，`schtasks /query /tn "\mss002-l2-daily" /fo LIST /v`）。
- **人工感知手段 = 次日手工跑验收器** `tools\l2_acceptance_check.py`（严格只读，不写台账/日志、不触发任务）。其四态与退出码见 `tools/l2_acceptance_check.py:25-33` 原文：

```
PASS     所有硬检查通过
FAIL     目标日的那次运行已发生，但结果不符（LastResult!=0 / 行数不对 / bar 不对 / 闸门 FAIL）
NOT_YET  目标日的那次运行还没发生（未到点）——不是失败，退出码 3
UNKNOWN  读不到（任务查询失败 / 闸门脚本缺失）——按「核不到」处理，退出码 1
退出码：0 PASS / 1 FAIL 或 UNKNOWN / 3 NOT_YET / 2 环境错误
```

  验收标准写死为「RECORDED / 5 行 / bar = record_date - 1 / I1–I5 全 PASS / **EXIT_CODE = 0**」（同文件 `:35-37`）。
- 该验收器**自身没有被任何计划任务调度**（`schtasks` 关键词过滤无命中；仓库内引用仅测试脚本 `_l2_acceptance_passpath_test.py:30`、`_l2_acceptance_recheck_20261020.py:27` 与 `research/EXPERIMENT_INDEX.md:77`）。

### 3.6 30 分钟上限造成的失败形态（由代码结构推出，未实测）

`ExecutionTimeLimit=PT30M`（§1.6）。而所有日志/状态写入都集中在 `finish()`（`l2_daily_run.py:217-241`），且 `main()` 的每个返回路径都经 `finish()`。⇒ 若进程在第 30 分钟被调度器强杀，`finish()` 未执行，**不会留下 `_l2_run_*.log`、也不会更新 `_l2_last_status.json`**，只剩调度器的 `Last Result`。此结论由代码结构推得，**未实际制造超时验证**（见 §7）。

---

## 4. 日志位置与保留策略

### 4.1 `reports\_l2_run_<UTC>.log`（每次一份，累积）

`Get-ChildItem -Filter "_l2_run_*.log"` 共 **22 个**，按日分布（`ls | sed | uniq -c`）：

```
      5 20261017
     14 20261019
      1 20261020
      1 20261021
      1 20261022
```

- 2026-10-17 与 10-19 的多次是开发/演练（10-19 一天 14 份）；10-20 起每天 1 份，与每日 08:10 调度一致。
- 时间戳为 **UTC**（`20261022T001002Z` ↔ 本地 08:10:02）。

### 4.2 `reports\_l2_last_status.json`（单件，每次覆写）

当前 380 B，`LastWriteTime 2026/10/22 8:10:06`，内容见 §2.4。每跑一次就整体覆写（`l2_daily_run.py:237-238`），**只保留最近一次**。

### 4.3 台账 `reports\L2_FORWARD_LEDGER.jsonl`

- 44,747 B / 55 行，`2026/10/22 8:10:06`（当次运行由 40,448 B 增到 44,747 B，见 §2.4 `ledger_size` 行）。
- 只追加，不作废删除：`l2_invariants.py:25`「被作废的行**保留在文件里、不删**，但**不计入有效行**」；`:73` 同义。
- 另有手动备份 `L2_FORWARD_LEDGER.jsonl.bak_20261019`（31,837 B，10-19 08:02）。

### 4.4 `logs\`

- 仓库根 `D:\workspace\代币交流群\logs\`：**空**（`ls -la logs/` 仅 `.`/`..`）。
- `binance-spot-quant\logs\`：仅 `binance_quant_paper.log`（4,690 B，2026-10-15），**与 L2 无关**。

### 4.5 `journal\`

- 仓库根 `journal\` **不存在**（`ls: cannot access 'journal/'`）。
- `binance-spot-quant\journal\` 存在，仅 `DECISIONS.jsonl`（11,868 B，2026-10-21 23:34）。**未见 L2 相关条目**（本次只核了目录与文件名，未逐行审 11KB 内容）。

### 4.6 `reports\_*.txt`

`reports\` 下与 `_*` 相关的 txt/md 是：`_probe_grok_swe.txt`、`_probe_grok_webfetch.txt`、`_env_probe_吏部.md`（均 2026-10-17，Grok/环境探测用途）。**与 L2 每日流程无关**。

### 4.7 保留策略 —— **核不到**

- `grep -rniE "unlink|retention|保留|清理|prune|删除.*log|max.*log"` 扫 `binance-spot-quant/reports/` 与 `tools/`，**未命中任何针对 `_l2_run_*.log` 的清理逻辑**。
- 命中的 `unlink` 只在 `card_now.py:647`、`:653`（卡片任务的临时/目标文件），与 L2 日志无关。
- 实测 22 份日志从 10-17 累积到 10-22，**无轮转、无压缩、无上限**。
- ⇒ 结论：**未发现保留策略；日志无限累积**（并非「有策略但未查到」，而是「代码里没有」）。唯一算「保留」性质的是 `L2_FORWARD_LEDGER.jsonl.bak_20261019` 这类**手动**备份。

---

## 5. 「站点构建」插入点

### 5.1 先在仓库里找「站点构建」——**核不到构建脚本**

```
$ grep -rniE "index\.html|站点构建|build_site|生成站点" --include=*.py --include=*.md --include=*.cmd tools/ viz/ binance-spot-quant/reports/
（无输出）
```

⇒ 仓库内**没有** HTML/index 站点构建脚本。任务描述里的「站点构建」在本仓库**核不到对应实体**（见 §7）。

### 5.2 现存的可视化交付链路（这是最接近「构建」的东西）

- `tools\manifest_build.py:1-16`：按 `viz/DATA_CONTRACT_STANDARD_20261022.md`「DATA_CONTRACT_STANDARD v1」从数据件派生 `*.manifest.json`；docstring 原文：「可视化不读 Markdown 报告正文，只读 manifest + manifest 引用的数据文件」「**全部由脚本计算并打印，禁止手填**」。
- 产物目录 `viz\manifests\` 现有 2 份（2026-10-22 10:20）：
  - `ADAUSDT_1d.manifest.json`
  - `L2_FORWARD_LEDGER.manifest.json`
- 该 manifest 直接锚定台账：`L2_FORWARD_LEDGER.manifest.json` 内 `"artifact_path": "binance-spot-quant/reports/L2_FORWARD_LEDGER.jsonl"`、`"artifact_sha256": "3b8ecd0199829d5d..."`、`"artifact_bytes": 44747`、`"artifact_rows_excl_header": 55` —— 与 §2.4 当次运行完的台账 sha/bytes 完全对上。**⇒ manifest 必须在台账追加之后重建，否则记录的 sha/bytes 会与台账不一致。**

### 5.3 `manifest_build.py` 的致命细节：**拒绝覆写**

`tools/manifest_build.py`：
- 默认输出路径 = `<csv>.manifest.json`（`:225` `out_path or (os.path.splitext(csv_path)[0] + ".manifest.json")`）
- **同名存在即拒绝并退 1**：`:226-228`

```python
if os.path.exists(out):
    print(f"[manifest] 拒绝覆写已存在: {out}")
    return {"ok": False, "reason": "exists"}
```

- `main()` 返回 `0 if r.get("ok") else 1`（`:247`）；argparse 参数错误为 2（`:15` 退出码说明：「0 = 写出成功 / 1 = 失败（文件不存在或目标已存在）/ 2 = 参数错误」）。

⇒ **同一路径每天重跑第二天必然退 1**。任何自动化必须用**带日期的 `--out`**（或先归档旧文件），不能沿用默认路径。

### 5.4 当前没有任何计划任务在跑构建

```
$ schtasks /query /fo CSV /nh | Select-String 'manifest|viz|site|build'
（无输出）
```

⇒ 站点/manifest 构建目前是**手动**的（最后产物 10-22 10:20，晚于 08:10 那次 L2 运行，符合「先跑 L2 再手工构建」）。

### 5.5 最安全的插入点：**独立计划任务（或独立包装 cmd）**，不要塞进 `l2_daily_run.py` 尾部

事实层面的支撑（每条都对得上前面章节）：

1. **退出码是「唯一口径」且被验收器强校验**：`EXIT_CODES` 被定义为唯一表（`l2_daily_run.py:64-71`），日志第一行打表（`:243`），且 `l2_acceptance_check.py:35-37` 把「**EXIT_CODE = 0**」写死为验收标准。在 `:371 return finish(0, ...)` 之后追加构建步骤，只有两种写法：
   - 忽略其退出码 → 构建失败**没有任何信号**（且违背本仓库「闸门必须 exit≠0，不许只打印」的既定纪律，见 `:336-337` 注释）；
   - 把其退出码并入 → 破坏「0 正常」的定义，让验收器把「L2 成功但构建失败」判成 FAIL，语义污染。
2. **`manifest_build.py` 拒绝覆写（§5.3）**：串进 L2 尾部后，同日第二次触发（`StartWhenAvailable` 补跑、人工补跑）会让 L2 名义成功却因构建退 1 而报警。
3. **共享 30 分钟上限**：`ExecutionTimeLimit=PT30M`（§1.6）是整条动作的预算，构建是 IO 型、耗时不稳，会挤占 L2 自己的时间预算。
4. **验收器的操作约束**：`research/EXPERIMENT_INDEX.md:77` 明文写「**08:10 后到验收完成前任何人不得手工触发该任务**（会覆盖 LastRunTime，T3 无法区分计划触发与人工补跑）」。若包装 cmd 里再调一次 L2，就会踩这条。
5. **依赖方向正确**：构建读台账（§5.2），而台账在 L2 尾部才写完 ⇒ 构建必须在 L2 **整条链结束后**，独立任务天然满足；同脚本尾部虽也满足顺序，但会把两者失败域绑死。

⇒ 推荐形态（**判断**，见 §6）：新增独立计划任务（如 `mss002-l2-sitebuild`），触发时间晚于 08:10 并留足余量（如 08:20），动作 = 新包装 cmd/ps1：
- 先读 `reports\_l2_last_status.json` 的 `exit_code`，**非 0 直接跳过构建并退 0/记录跳过原因**（避免在 L2 失败时产出「看起来很新」的 manifest）；
- 用**带日期**的 `--out`（如 `viz\manifests\L2_FORWARD_LEDGER_20261022.manifest.json`）避开 §5.3 的覆写拒绝；
- 绝不调用 `l2_daily_run.py`、绝不 `schtasks /run` 触发 L2（遵守 §5.5-4 的约束）；
- 日志落到独立文件，便于与 `_l2_run_*.log` 分开诊断。
若坚持「一个入口」，则用**新包装 cmd** 串 L2 + 构建（两个独立进程、各自退出码分开记录），而不是改 `l2_daily_run.py` 内部。

---

## 6. 判断（非事实，已与上面事实分离）

- **J1** 插入点选「独立计划任务」优于「同脚本尾部」：核心不是技术上做不到，而是 `EXIT_CODES` 唯一口径 + 验收器写死 `EXIT_CODE=0` + `manifest_build` 拒绝覆写三者叠加，会让「同脚本尾部」在重复触发/构建失败时产生**语义污染或静默失败**。属于工程取舍判断。
- **J2** 构建前加「读 `_l2_last_status.json` 再决定是否构建」的守卫，可避免用旧台账产出新 manifest 的假新鲜。属于设计建议，未被现有代码要求。
- **J3**「站点构建」若其实指某个仓库外的渲染器（如 `.dsh` bot 工作区内的静态站点生成器），则本笔记 §5 只覆盖了本仓库内的 manifest 链路，需要补查该外部目录。

---

## 7. 核不到（明确缺口，禁止当成「没有」）

| # | 项 | 状态 | 缺口说明 |
|---|---|---|---|
| N1 | `D:\workspace\代币交流群\tools\card_cron.cmd` | **已证实不存在** | 否定事实成立：`ls` 报 `No such file or directory`。但同名文件存在于 `binance-spot-quant\reports\`，且属 `alice-card-4h`，**不是 L2**。 |
| N2 | 「站点构建」脚本本体 | **核不到** | 仓库内 grep `index.html`/`站点构建`/`build_site`/`生成站点` 无命中；仅找到 manifest 派生链路（§5.2）。若构建器在仓库外（如 `.dsh` bot 工作区），本次未查。 |
| N3 | L2 日志保留/清理策略 | **核不到（未发现）** | 扫 `unlink/retention/清理/prune/max.*log` 无针对 `_l2_run_*.log` 的逻辑；22 份日志持续累积。不能表述为「有策略但未查到」。 |
| N4 | 30 分钟超时被强杀后的实际产物 | **未实测** | §3.6 仅由代码结构推得（`finish()` 未执行 ⇒ 无日志/无状态）。未制造超时验证，也未查 `Last Result` 的 `0x41306` 实例。 |
| N5 | 「本机每小时重启」的精确频率 | **仅部分可核** | 只核到 System 事件 `Id=6005` 最近 8 次（§1.8），显示**一天多次**重启；**无法证明「每小时」**。 |
| N6 | 是否存在外部告警通道 | **核不到（无证据存在）** | 任务 XML 无通知动作、无 L2 watchdog、无告警脚本引用；但不能排除仓库外有人工/外部监控。 |
| N7 | `binance-spot-quant/journal/DECISIONS.jsonl` 内是否有 L2 相关决策 | **核不到** | 本次只核了目录与文件名（11,868 B / 2026-10-21），未逐行审阅内容。 |
| N8 | 刷新脚本联网取数当前是否可用 | **核不到（未执行）** | 受「不跑会写数据的脚本」约束，未执行 `refresh_l2_data.py`；仅从 10-22 日志看到当日 5 品种刷新成功。历史 TLS 失败证据在 `card_cron.log`（属 4h 线，非 L2）。 |
| N9 | `alice-card-4h` 与 L2 是否共享数据文件而互相干扰 | **核不到** | 两者 `DIR` 不同（`.dsh\bot\workspace\...` vs `D:\workspace\...`），但未核对 `card_now.py` 是否也写 `D:\workspace\...\data`。 |

---

## 8. 证据索引（本次实际用到的只读命令）

```powershell
# 计划任务
schtasks /query /fo CSV /nh
schtasks /query /fo LIST
schtasks /query /tn "\mss002-l2-daily" /fo LIST /v
schtasks /query /tn "\mss002-l2-daily" /xml
schtasks /query /tn "\alice-card-4h" /fo LIST /v
(Get-TimeZone).Id
Get-WinEvent -FilterHashtable @{LogName='System'; Id=6005} -MaxEvents 8
```

```bash
# 文件与日志（只读）
ls -la tools/ logs/ journal/ viz/manifests/ binance-spot-quant/
ls -la tools/card_cron.cmd
find . -maxdepth 3 \( -iname "*cron*" -o -iname "*.cmd" -o -iname "*.ps1" \)
grep -rn "l2_acceptance_check"
grep -rniE "unlink|retention|保留|清理|prune" binance-spot-quant/reports/ tools/
grep -n "snapshot|exists|SKIP|拒绝|return" binance-spot-quant/reports/refresh_l2_data.py
ls binance-spot-quant/reports/_l2_run_*.log | sed -E 's/.*_l2_run_([0-9]{8})T.*/\1/' | sort | uniq -c
```

已读文件（含关键行段）：
- `tools/l2_daily_run.py`（1–379 全文）
- `tools/L2_DAILY_RUN.md`（1–55 全文）
- `tools/manifest_build.py`（1–60、195–251）
- `tools/l2_acceptance_check.py`（1–45）
- `binance-spot-quant/reports/refresh_l2_data.py`（关键词行，未读全文）
- `binance-spot-quant/reports/card_cron.cmd`（全文 16 行）
- `binance-spot-quant/reports/_l2_run_20261022T001002Z.log`（全文）
- `binance-spot-quant/reports/_l2_last_status.json`（全文）
- `binance-spot-quant/reports/L2_FORWARD_LEDGER.manifest.json`（前 45 行）
- `binance-spot-quant/reports/_task_xml_after_actionchange_mss002-l2-daily_20261019.xml`（全文）
- `binance-spot-quant/reports/_task_prereq_mss002-l2-daily_20261019.txt`（全文）
- `research/EXPERIMENT_INDEX.md`（:77 一段）
