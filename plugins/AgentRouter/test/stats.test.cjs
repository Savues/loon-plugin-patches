/* stats.test.cjs —— formatStats / averageDailySpend 的单元测试
 * Node 里跑：node test/stats.test.cjs
 *
 * 这些是纯计算函数（只吃 /api/user/self 和 /api/log/self 的返回），不联网，
 * 所以直接从 src/agentrouter.js 里把函数抠出来 eval，测的是真实实现而不是副本。
 */
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "agentrouter.js"), "utf8");
const pick = (name) => {
  const i = src.indexOf("function " + name);
  if (i < 0) throw new Error("找不到 " + name);
  let d = 0;
  const j = src.indexOf("{", i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); }
  }
};
eval([pick("formatAmount"), pick("formatStats"), pick("averageDailySpend")].join("\n"));
const QPU=500000;
const now=Date.now()/1000;
const day=(n)=>now-n*86400;
const usage=(d,quota)=>({type:2,quota,created_at:day(d)});
const signin=(d)=>({type:4,quota:0,content:'每日签到成功，增加额度 ＄25.000000 额度',created_at:day(d)});
const user=(o={})=>({quota:100*QPU,used_quota:7*QPU,request_count:37,...o});
let pass=0,fail=0;
function t(n,f){try{f();pass++;console.log('  ✓ '+n)}catch(e){fail++;console.log('  ✗ '+n+'\n      '+e.message)}}

console.log("=== formatStats ===");
t('今日有消耗 → 显示今日消耗与次数',()=>{
  const s=formatStats(user(),[usage(0.1,0.25*QPU),usage(0.2,0.25*QPU),signin(0.3)],QPU);
  if(!/📅 今日消耗：\$0\.5000（2 次）/.test(s)) throw new Error(s);
});
t('今日无消耗 → 不显示今日消耗',()=>{
  const s=formatStats(user(),[usage(3,0.25*QPU),signin(0.3)],QPU);
  if(/今日消耗/.test(s)) throw new Error('不该显示: '+s);
});
t('items 为 null（日志查询失败）→ 不崩且不显示统计',()=>{
  const s=formatStats(user(),null,QPU);
  if(!/当前余额/.test(s)) throw new Error(s);
  if(/今日消耗|约可用/.test(s)) throw new Error('不该显示用量相关: '+s);
});
t('quotaUnit=null（未取到单位）→ 今日消耗显示原始额度',()=>{
  const s=formatStats(user(),[usage(0.1,100)],null);
  if(!/今日消耗：100（1 次）/.test(s)) throw new Error(s);
});
t('quotaUnit=null → 不做可用天数外推',()=>{
  const s=formatStats(user(),[usage(1,0.25*QPU)],null);
  if(/约可用/.test(s)) throw new Error('不该外推: '+s);
});
t('余额为 0 → 不外推（避免除零/无穷）',()=>{
  const s=formatStats(user({quota:0}),[usage(1,0.25*QPU)],QPU);
  if(/约可用/.test(s)) throw new Error('不该外推: '+s);
});
t('无用量记录 → 不外推',()=>{
  const s=formatStats(user(),[signin(0.3)],QPU);
  if(/约可用/.test(s)) throw new Error('不该外推: '+s);
});
t('外推结果：3 天均 $0.25/天、余额 $100 → 约 133 天',()=>{
  const s=formatStats(user(),[usage(0,0.25*QPU),usage(1,0.25*QPU),usage(2,0.25*QPU),signin(2.5)],QPU);
  if(!/约可用 \d+ 天|约可用 [\d.]+ 个月/.test(s)) throw new Error(s);
  console.log('      → '+s.split('\n').pop());
});
t('request_count 缺失 → 不显示累计调用',()=>{
  const s=formatStats({quota:1,used_quota:1},[],QPU);
  if(/累计调用/.test(s)) throw new Error(s);
});
t('过滤掉 3 天前的样本（对当前用量无参考价值）',()=>{
  const s=formatStats(user(),[usage(10,100*QPU),usage(0.1,0.5*QPU),signin(0.2)],QPU);
  const m=/约可用 ([\d.]+) (天|个月)/.exec(s);
  if(!m) throw new Error('没外推: '+s);
  const v=parseFloat(m[1])*(m[2]==='天'?1:30);
  if(v<50) throw new Error('老样本污染了日均，剩 '+v.toFixed(0)+' 天（应远大于此）');
  console.log('      → '+s.split('\n').pop());
});
console.log('\n'+pass+' 通过, '+fail+' 失败');
process.exit(fail?1:0);
