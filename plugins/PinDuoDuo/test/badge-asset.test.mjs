// 徽章资产独立校验（不依赖 manifest.test.mjs 的其它断言）
// v1.89：徽章 106×50（高度收至 50px）；v1.88 起内联为 data URI，本文件校验资产源
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const BADGE = readFileSync(new URL('../src/assets/ad-badge.png', import.meta.url))
t('是合法 PNG（魔数）', BADGE[0] === 0x89 && BADGE[1] === 0x50 && BADGE[2] === 0x4E && BADGE[3] === 0x47)
t('尺寸 106×50（v1.89 收窄：高度 50px，容纳「广告」二字）',
  BADGE.readUInt32BE(16) === 106 && BADGE.readUInt32BE(20) === 50)
t('体积合理（<8KB）', BADGE.length < 8192, `实际 ${BADGE.length} B`)

const script = readFileSync(new URL('../src/subsidy.response.js', import.meta.url), 'utf8')
t('脚本已内联为 data URI', script.includes("const AD_BADGE_URL = 'data:image/png;base64,"))
t('脚本不再引用外部徽章 URL', !script.includes('raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/PinDuoDuo/src/assets/ad-badge.png')
  && !script.includes('cdn.jsdelivr.net/gh/Savues/loon-plugin-patches@main/plugins/PinDuoDuo/src/assets/ad-badge.png'))
const uri = script.match(/AD_BADGE_URL = 'data:image\/png;base64,([^']+)'/)
t('data URI 与资产文件逐字节一致',
  !!uri && Buffer.from(uri[1], 'base64').equals(BADGE))

done()
