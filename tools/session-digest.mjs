#!/usr/bin/env node
/**
 * session-digest.mjs —— 把会话日志（DSH panel 的 ndjson）压成一份可读摘要，供 /retro 使用。
 *
 * 为什么需要：复盘时「这次到底哪儿卡了、花了多少调用」全靠翻日志，而日志是逐条 ndjson + JSON 转义。
 * 本次复盘里我踩了三件事，本脚本把它们固化掉：
 *   ① **别用 grep**：grep 会把**我自己的叙述文本**当成失败（第一版据此把 173 次 ops_bash 误报出 162 条失败）。
 *   ② **有结构化信号就别用文本模式**：结果记录带 `isError`（本次 399 条里 10 条为真）与 `errorCode`。
 *      本脚本因此分两层：**客观失败 = isError**；文本命中只算「疑似」，单列，绝不混进失败数。
 *   ③ **配对用 callId**，不要靠序号或时间戳猜哪条结果属于哪次调用。
 *   ④ **子代理会无声死**。harness **只**把它写成一条 `user/message` 散文
 *      （`Background subagent <id> failed before it finished.`），**没有 isError、没有 errorCode、
 *      也没有对应的 job/registered 载荷**（job 记录只有 type/seq/time）。所以「结构化信号优先」
 *      这条路在子代理上**根本走不通**——本脚本作**一处显式的例外**：只认 `user/message`
 *      上的这一种机器形状。限制在 `user/message` 是关键：**我自己的叙述**是 `assistant/message`、
 *      **我 grep 出来的结果**是 `tool/result`，两者都被这道限制挡在外面，不会污染失败数。
 *      它计进「客观失败」，并计入 subagent 那一行的失败数。
 *
 * 用法：
 *   node tools/session-digest.mjs                # 当前工作区 panel 里最近一次会话
 *   node tools/session-digest.mjs --all          # 所有会话一览（谁大、谁错多）
 *   node tools/session-digest.mjs --errors 8     # 列真实失败明细（客观在前、疑似在后）
 *   node tools/session-digest.mjs --json         # 结构化输出（便于再加工）
 * 退出码：0（只读报告，不是门）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const argv = process.argv.slice(2)
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const PANEL = path.resolve(argOf('--panel', path.join(REPO, '.dsh-ops', 'panel')))
const WANT_JSON = argv.includes('--json')
const ALL = argv.includes('--all')
const ERRORS = Number(argOf('--errors', '0'))

/**
 * 分类模式：每条都要求「机器才写得出的字面形状」，因为**误报会训练人忽略告警**。
 * 只在 isError=true 的结果上做分类；文本命中但 isError=false 的只进「疑似」区。
 */
const NL = String.fromCharCode(10)

const CLASSES = [
  { name: 'unknown tool', re: /unknown tool "/ },
  { name: 'command failed', re: /\[COMMAND_FAILED|\[exit code: [1-9]\d*\]/ },
  { name: 'exception', re: /(?:SyntaxError|Traceback \(most recent call last\)|TypeError|ReferenceError|JSONError)/ },
  { name: 'not found', re: /ENOENT|No such file or directory|cannot find the file/ },
  { name: 'capability', re: /does not declare (?:image input|support)|is not supported|not available in/ },
  { name: 'denied', re: /sandbox: file access denied|permission denied|approval (?:required|rejected)/ },
  { name: 'rejected', re: /"verdict":\s*\{\s*"state":\s*"REJECT|"moved_to":\s*"rejected"/ },
  { name: 'subagent died', re: /^Background subagent [0-9a-f]/ },
  { name: 'quota/deferred', re: /gate-defer|read quota|quota[: ]*deferred|"deferred":\s*true/ },
]
const classify = (text) => CLASSES.filter(c => c.re.test(text)).map(c => c.name)

function readSession(file) {
  const bytes = fs.statSync(file).size
  const callsById = new Map()
  const byTool = new Map()
  const types = {}
  const errors = []        // 客观：isError === true
  const suspected = []     // 疑似：文本命中但 isError 不为真
  const errorCodes = new Map()
  const times = []
  let n = 0

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const s = line.trim()
    if (!s) continue
    let o
    try { o = JSON.parse(s) } catch { continue }
    n++
    types[o.type] = (types[o.type] || 0) + 1
    if (typeof o.time === 'number') times.push(o.time)

    if (o.type === 'tool/call') {
      const nm = o.payload?.name || o.name || '?'
      callsById.set(o.callId, nm)
      const e = byTool.get(nm) || { calls: 0, fails: 0 }
      e.calls++; byTool.set(nm, e)
    } else if (o.type === 'tool/result') {
      const tool = callsById.get(o.callId) || '?'
      const text = String(o.payload?.text ?? '')
      const snippet = text.replace(/\s+/g, ' ').slice(0, 170)
      if (o.isError === true) {
        const cls = classify(text)
        if (o.errorCode) errorCodes.set(o.errorCode, (errorCodes.get(o.errorCode) || 0) + 1)
        if (byTool.has(tool)) byTool.get(tool).fails++
        errors.push({ tool, classes: cls.length ? cls : ['other'], errorCode: o.errorCode ?? null, snippet, seq: o.seq })
      } else {
        const cls = classify(text)
        if (cls.length) suspected.push({ tool, classes: cls, snippet, seq: o.seq })
      }
    } else if (o.type === 'user/message') {
      const text = String(o.payload ? (o.payload.text || '') : '')
      const firstLine = text.split(NL)[0]
      if (/^Background subagent [0-9a-f][0-9a-f-]{7,} failed before it finished/.test(firstLine)) {
        const cls = classify(text)
        errors.push({ tool: 'subagent', classes: cls.length ? cls : ['subagent died'], errorCode: 'SUBAGENT_DIED', snippet: firstLine.slice(0, 170), seq: o.seq })
        if (byTool.has('subagent')) byTool.get('subagent').fails++
      }
    }
  }

  return {
    file: path.basename(file), bytes, records: n, types,
    span: times.length ? [Math.min(...times), Math.max(...times)] : null,
    byTool: [...byTool.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.calls - a.calls),
    errors, suspected, errorCodes: [...errorCodes.entries()],
  }
}

const fmtTime = (ms) => new Date(ms).toLocaleString('zh-CN', { hour12: false })
const kb = (b) => (b / 1024).toFixed(0) + ' KB'

function printOne(d) {
  console.log(`会话 ${d.file} · ${kb(d.bytes)} · ${d.records} 条记录`)
  if (d.span) console.log(`跨度 ${fmtTime(d.span[0])} → ${fmtTime(d.span[1])}（${((d.span[1] - d.span[0]) / 60000).toFixed(0)} 分钟）`)
  console.log(`工具调用 ${d.types['tool/call'] || 0} 次 · 结果 ${d.types['tool/result'] || 0} 条`)
  console.log(`客观失败（isError）${d.errors.length} 条 · 疑似失败（文本命中）${d.suspected.length} 条`)
  {
    const sub = d.byTool.find(t => t.name === 'subagent')
    const died = d.errors.filter(e => e.tool === 'subagent').length
    if (sub || died) console.log(`子代理 派 ${sub ? sub.calls : 0} 次 · 无声失败 ${died} 次（含在「客观失败」里）`)
  }
  if (d.errorCodes.length) console.log(`errorCode：${d.errorCodes.map(([k, v]) => `${k}×${v}`).join('  ')}`)
  console.log('')
  console.log('工具'.padEnd(30) + '调用   客观失败')
  for (const t of d.byTool.slice(0, 15)) {
    const short = t.name.length > 28 ? t.name.slice(0, 27) + '…' : t.name
    console.log(short.padEnd(30) + String(t.calls).padEnd(7) + String(t.fails))
  }
  if (d.errors.length) {
    const tally = new Map()
    for (const f of d.errors) for (const c of f.classes) tally.set(c, (tally.get(c) || 0) + 1)
    console.log('')
    console.log('客观失败分类：' + [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join('  '))
  }
  if (ERRORS > 0) {
    if (d.errors.length) {
      console.log('')
      console.log(`客观失败明细（前 ${ERRORS} 条）`)
      for (const f of d.errors.slice(0, ERRORS)) console.log(`  · [${f.classes.join(',')}${f.errorCode ? ' ' + f.errorCode : ''}] ${f.tool} → ${f.snippet}`)
    }
    if (d.suspected.length) {
      console.log('')
      console.log(`疑似失败（仅供参考：文本命中但 isError 为假，多为工具输出里**提到了**这些词）`)
      for (const f of d.suspected.slice(0, ERRORS)) console.log(`  · [${f.classes.join(',')}] ${f.tool} → ${f.snippet}`)
    }
  }
}

const files = fs.readdirSync(PANEL).filter(f => f.endsWith('.ndjson'))
  .map(f => path.join(PANEL, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)

if (WANT_JSON) { console.log(JSON.stringify((ALL ? files : files.slice(0, 1)).map(readSession), null, 2)); process.exit(0) }

if (ALL) {
  console.log(`panel: ${PANEL}\n`)
  const ds = files.map(readSession).sort((a, b) => b.bytes - a.bytes)
  console.log('会话'.padEnd(46) + '体积     记录   工具调用  客观失败  疑似')
  for (const d of ds) {
    console.log(d.file.padEnd(46) + kb(d.bytes).padEnd(9) + String(d.records).padEnd(7) +
      String(d.types['tool/call'] || 0).padEnd(10) + String(d.errors.length).padEnd(10) + String(d.suspected.length))
  }
  console.log(`\n共 ${ds.length} 个会话；合计 ${kb(ds.reduce((s, d) => s + d.bytes, 0))}`)
  process.exit(0)
}

printOne(readSession(files[0]))