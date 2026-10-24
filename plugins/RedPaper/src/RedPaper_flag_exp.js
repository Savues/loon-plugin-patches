// 小红书 flag_exp 清洗: 点点/AI 入口实验旗标全关 (开关 removeDianDian)
const obj = JSON.parse($response.body);
const arg = typeof $argument === "object" && $argument !== null ? $argument : {};
if (arg.removeDianDian !== false) {
  const flags = obj?.data?.flags?.ios;
  if (flags && typeof flags === "object") {
    let changed = false;
    for (const k of Object.keys(flags)) {
      if (/diandian|agent_?spark|spark_|ai_assistants/.test(k)) {
        const v = flags[k];
        if (v && typeof v === "object" && "value" in v) {
          if (v.value !== false && v.value !== 0) { v.value = typeof v.value === "number" ? 0 : false; changed = true; }
        }
      }
    }
    if (changed) { $done({ body: JSON.stringify(obj) }); return; }
  }
}
$done({});
