/*
 * 头像角标 v2：翻开新头像视图的 AB 实验开关。
 *
 * 反汇编定案（详见 bilibili-splash-re README 第十七章，2026-10-19）：
 *   iPad 3.71.0 我的页/空间页的头像装配二选一：
 *     avatarNewViewEnable = [BBAvatarView isEnabled] && avatar && avatarItem && hasLogined
 *   +[BBAvatarView isEnabled] = [BFCMemexABTest hitExperimentalGroupForKey:@"ff_new_avatar_view_enabled"]
 *   国际版 3.20.1 没有这道门（永远走新视图）→ 我的页有角标；
 *   iPad 被服务器分到对照组 → 走旧视图 → 旧视图传的是账号模型，
 *   它不响应 bfc_ 前缀协议（refreshData 逐项 respondsToSelector: 检查）→
 *   setVipTheme:0 → installFirstBadge 直接 return → 角标永远不出现（与数据无关）。
 *   翻开这个开关 = 把 iPad 的头像渲染切到国际版同款新视图 → 角标出现。
 *
 * 注入点：/x/resource/abtest/abserver 响应的 data.vars。解析链（反汇编实证）：
 *   BFCABTestConfigModel{expire, vars} → vars 元素 = BFCABTestConfigItem{name, group, value, force}
 *   → storageDict = {name, value, group}（⚠ 三者必须同时非空，缺一整个条目被丢弃）
 *   → setAbtConfigArray: → 命中判定 _hitTestForKey:
 *   force=1 时跳过本地分组哈希直接采用该条目；value=="true" 是已确认的命中字符串
 *   （远程命令 abInfo 条目用同一判定）。兄弟开关 ff_new_avatar_view_same_data_is_update
 *   （新视图数据更新行为，同一 Swift 源文件）一并注入。
 *
 * 注意：abserver 响应自带 expire=1800000（30 分钟），客户端缓存过期才重新请求。
 * 开关关闭后本规则整体失能，客户端下次自然拉回原始响应，无需清理。
 */
const A = $argument || {};
const on = (v) => v === true || v === "true";
const FLAGS = ["ff_new_avatar_view_enabled", "ff_new_avatar_view_same_data_is_update"];

try {
  if (!on(A.vipAvatarBadge)) {
    $done({});
  } else {
    const j = JSON.parse($response.body);
    const d = j && j.data;
    if (!d) {
      $done({});
    } else {
      d.vars = Array.isArray(d.vars) ? d.vars : [];
      const inject = { group: "1", value: "true", force: 1 };
      for (const name of FLAGS) {
        const hit = d.vars.find((v) => v && typeof v === "object" && v.name === name);
        if (hit) {
          // 服务器分了对照组的条目就地翻转（保留未知字段）
          hit.value = inject.value;
          hit.group = hit.group == null ? inject.group : hit.group;
          hit.force = inject.force;
        } else {
          d.vars.push({ name: name, group: inject.group, value: inject.value, force: inject.force });
        }
      }
      $done({ body: JSON.stringify(j) });
    }
  }
} catch (e) {
  $done({});
}
