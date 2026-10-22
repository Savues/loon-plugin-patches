// 徽章资产独立校验（不依赖 manifest.test.mjs 的其它断言）
// v1.89：徽章 106×50（高度收至 50px）；v1.88 起内联为 data URI，本文件校验资产源
import { readFileSync } from 'node:fs'
import { t, done } from './harness.mjs'

const BADGE = readFileSync(new URL('../src/assets/ad-badge.png', import.meta.url))
t('是合法 PNG（魔数）', BADGE[0] === 0x89 && BADGE[1] === 0x50 && BADGE[2] === 0x4E && BADGE[3] === 0x47)
// v1.94：角标改走商品图左上角官方角标槽 ltIcon，
// CSS `.ilx1YR3r{height:.52rem;width:.46rem}` → 宽高比 0.46/0.52 ≈ 0.885，
// 资产按 184×208 做（184/208 = 0.885），填进去不畸变。
t('尺寸 184×208（v1.94：竖版角标，比例 0.885 = 0.46rem/0.52rem 角标槽）',
  BADGE.readUInt32BE(16) === 184 && BADGE.readUInt32BE(20) === 208)
t('宽高比贴近角标槽（|184/208 - 0.46/0.52| < 0.01）',
  Math.abs(184 / 208 - 0.46 / 0.52) < 0.01, `${(184 / 208).toFixed(3)} vs ${(0.46 / 0.52).toFixed(3)}`)
t('体积合理（<8KB）', BADGE.length < 8192, `实际 ${BADGE.length} B`)

const script = readFileSync(new URL('../src/subsidy.response.js', import.meta.url), 'utf8')
t('脚本已内联为 data URI', script.includes("const AD_BADGE_URL = 'data:image/png;base64,"))
t('脚本不再引用外部徽章 URL', !script.includes('raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/PinDuoDuo/src/assets/ad-badge.png')
  && !script.includes('cdn.jsdelivr.net/gh/Savues/loon-plugin-patches@main/plugins/PinDuoDuo/src/assets/ad-badge.png'))
const uri = script.match(/AD_BADGE_URL = 'data:image\/png;base64,([^']+)'/)
t('data URI 与资产文件逐字节一致',
  !!uri && Buffer.from(uri[1], 'base64').equals(BADGE))

// 分页接口脚本必须用同一份资产（两处 data URI 不一致 = 角标长得不一样）
const api = readFileSync(new URL('../src/subsidy_api.response.js', import.meta.url), 'utf8')
const apiUri = api.match(/AD_BADGE_URL = 'data:image\/png;base64,([^']+)'/)
t('分页接口脚本也内联了同一份徽章',
  !!apiUri && Buffer.from(apiUri[1], 'base64').equals(BADGE))
t('生成脚本在仓库里（可复现资产）',
  readFileSync(new URL('../tools/make-badge.py', import.meta.url), 'utf8').includes('make_corner'))

// v1.97：用户直接提供最终角标图（184×208，横排「广告」块贴左上角），
// 生成脚本退化为「校验尺寸 + 复制」，美术源唯一化。
const SRC_BADGE = readFileSync(new URL('../src/assets/ad-badge-src.png', import.meta.url))
t('美术源在仓库里（184×208，与角标槽比例一致）',
  SRC_BADGE[0] === 0x89 && SRC_BADGE[1] === 0x50
  && SRC_BADGE.readUInt32BE(16) === 184 && SRC_BADGE.readUInt32BE(20) === 208)
t('美术源与产物逐字节一致（脚本只做复制）', SRC_BADGE.equals(BADGE))
t('生成脚本读的是美术源并校验尺寸', (() => {
  const py = readFileSync(new URL('../tools/make-badge.py', import.meta.url), 'utf8')
  return py.includes('ad-badge-src.png') && py.includes('make_corner') && py.includes('im.size != (CW, CH)')
})())

done()
