// 断言：每条调用字幕/去广告脚本的规则，都必须把对应参数传进去。
// 背景：上游 YouTube双语翻译 的 4 条 **http-response** 规则写的是空的 `argument=`，
// 而 Position / ShowOnly 只在**响应**脚本里被读取（Jl() 拼双语那一步），
// 于是「原文字幕位置」这个开关在任何设置下都不生效 —— 恒为默认 Forward。
// 请求侧有 argument（所以 Type 生效、双语能出），响应侧没有（所以 Position 失效）。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const lab = readFileSync(join(here, '..', 'YouTube-Test.lpx'), 'utf8')

let fail = 0
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fail++ }

const rules = lab.split('\n').filter(l => /^http-(request|response)/.test(l))
const SUB_ARG = 'argument=[{Type},{AutoCC},{ShowOnly},{Position}]'
const AD_ARG = 'argument=[{blockUpload},{blockShorts},{blockImmersive},{debug}]'

// 1) 11 条规则全部带 argument，且没有一条是空 argument
ok(rules.length === 11, `规则共 11 条（实测 ${rules.length}）`)
const empty = rules.filter(l => /argument=\s*(,|$)/.test(l))
ok(empty.length === 0, `无空 argument 的规则（实测 ${empty.length} 条）` +
   (empty.length ? ' → ' + empty.map(l => l.split(' ')[1].slice(0, 40)).join(' | ') : ''))

// 2) 逐条：脚本身份 → 应有的 argument
for (const l of rules) {
  const script = (l.match(/script-path=([^,]+)/) || [, ''])[1].split('/').pop()
  const dir = (l.match(/script-path=([^,]+)/) || [, ''])[1].includes('youtube.response.js') ? 'ad' : 'sub'
  const want = dir === 'ad' ? AD_ARG : SUB_ARG
  ok(l.includes(want), `${script} 传入 ${dir === 'ad' ? '去广告' : '字幕'}参数`)
}

// 3) 关键回归：两条 timedtext 响应规则必须带 Position（历史 bug 点）
const ttResp = rules.filter(l => /^http-response/.test(l) && l.includes('timedtext'))
ok(ttResp.length === 2, `timedtext 响应规则 2 条（实测 ${ttResp.length}）`)
for (const l of ttResp) {
  ok(l.includes(SUB_ARG), `timedtext 响应规则带 ${SUB_ARG}`)
}

// 4) Music 歌词那两条同样要带 Position（精确按 endpoint 过滤，别把 player 算进来）
const musicResp = rules.filter(l => /^http-response/.test(l) && l.includes('browse\\?(.*)subtype=Translate'))
ok(musicResp.length === 2, `Music 歌词响应规则 2 条（实测 ${musicResp.length}）`)
for (const l of musicResp) ok(l.includes('{Position}'), 'Music 歌词规则带 {Position}')

// 5) Position 参数本身必须已声明
ok(/^Position\s*=\s*select,\s*"Reverse"/m.test(lab), 'Position 默认 Reverse（译文在上）')

// 6) 🔴 每个参数的默认值必须与脚本内置默认一致 —— 上一版只查「有声明」，
//    结果 ShowOnly 默认 true 压过脚本的 !1，原文被整个丢掉（只剩中文）。
//    这里的做法：直接把脚本源码里的默认值抠出来跟清单比对。
const js = readFileSync(join(here, '..', 'src', 'YouTube_Subtitles_Translate_response.js'), 'utf8')
const adJs = readFileSync(join(here, '..', 'src', 'youtube.response.js'), 'utf8')

// 清单里 switch 的默认值（第 2 个字段）
const defOf = name => {
  const m = lab.match(new RegExp('^' + name + '\\s*=\\s*switch\\s*,\\s*(\\w+)', 'm'))
  return m && m[1]
}
// 脚本里 !0=true / !1=false
const scriptDef = (src, re) => (src.match(re) || [, null])[1]

// ShowOnly：脚本默认 !1(false) ⇒ 清单也必须默认 false，否则原文被 Jl() 丢掉
const adDef = scriptDef(adJs, /blockUpload:(!0|!1)/)
ok(defOf('ShowOnly') === 'false',
   `ShowOnly 默认 false = 双语（脚本内置 ${adDef && 'ShowOnly:!1'}）实际 ${defOf('ShowOnly')}`)
ok(defOf('AutoCC') === 'true', `AutoCC 默认 true（脚本内置 AutoCC:!0）实际 ${defOf('AutoCC')}`)

// 底栏三个按钮默认屏蔽：与脚本内置 !0 一致
ok(scriptDef(adJs, /blockUpload:(!0|!1)/) === '!0', '脚本内置 blockUpload=!0（屏蔽）')
ok(defOf('blockUpload') === 'true', `blockUpload 默认屏蔽 实际 ${defOf('blockUpload')}`)
ok(defOf('blockShorts') === 'true',
   `blockShorts 默认屏蔽（脚本内置 !1=false，靠清单覆盖成 true）实际 ${defOf('blockShorts')}`)
ok(defOf('blockImmersive') === 'true', `blockImmersive 默认屏蔽 实际 ${defOf('blockImmersive')}`)
ok(defOf('debug') === 'false', `debug 默认关闭 实际 ${defOf('debug')}`)
ok(defOf('youtube_enable') === 'true', `youtube_enable 默认开启 实际 ${defOf('youtube_enable')}`)

// Type / Position：select 的默认值 = 第一项
ok(/^Type\s*=\s*select,\s*"Translate"/m.test(lab), 'Type 默认 Translate')
ok(/^Position\s*=\s*select,\s*"Reverse"/m.test(lab), 'Position 默认 Reverse（译文在上）')
// 脚本对 Type=Translate 的内置 Position 是 Forward，我们要的是 Reverse
ok(/x=\{Vendor:"Google",ShowOnly:!1,Position:"Forward"/.test(js), '脚本内置 Position=Forward，清单已反转成 Reverse')

console.log(fail ? `\n${fail} 例失败` : '\n全部通过')
process.exit(fail ? 1 : 0)
