// 共享测试框架：断言计数与汇总。各测试文件只 import 这三个，不再各抄一份。
const S = { pass: 0, fail: 0 }

export const t = (name, cond, detail = '') => {
  if (cond) { S.pass++; console.log(`  ✅ ${name}`) }
  else { S.fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`) }
}

export const done = () => {
  console.log('\n' + '='.repeat(56))
  console.log(`通过 ${S.pass} · 失败 ${S.fail}`)
  process.exit(S.fail ? 1 : 0)
}
