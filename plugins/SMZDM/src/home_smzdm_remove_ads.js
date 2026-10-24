// 什么值得买 v3/home 首页信息流清洗 (本地化自 kelee home_smzdm_remove_ads.jq, 语义等价)
// 过滤规则:
//   1. zz_content 内: ad_campaign_id(非空字符串) / tag(非空字符串) / model_type=="ads" 的条目删除
//   2. component 组件白名单: 只保留 zz_type 为 circular_banner / filter / list
//   3. zz_content 内: article_channel_type=="questionnaire" 的条目删除
//   4. 删除 data.theme (主题皮肤背景)
//   5. zz_content 为对象时删除 circular_banner_option
const obj = JSON.parse($response.body);
const d = obj?.data;
if (!d || !Array.isArray(d.component)) { $done({}); return; }

// ① 广告特征过滤 + ③ 问卷过滤
d.component = d.component.map(c => {
  if (Array.isArray(c?.zz_content)) {
    c.zz_content = c.zz_content.filter(item => {
      if (item && typeof item === 'object') {
        // 广告特征: 命中任一即删
        if (typeof item.ad_campaign_id === 'string' && item.ad_campaign_id.length > 0) return false;
        if (typeof item.tag === 'string' && item.tag.length > 0) return false;
        if (item.model_type === 'ads') return false;
        // 问卷
        if (item.article_channel_type === 'questionnaire') return false;
      }
      return true;
    });
  }
  return c;
});

// ② 组件白名单 (jq 后置: 白名单在过滤之后, 空组件也会被移除)
d.component = d.component.filter(c => c?.zz_type === 'circular_banner' || c?.zz_type === 'filter' || c?.zz_type === 'list');

// ④ 主题皮肤
delete d.theme;

// ⑤ circular_banner_option (zz_content 为对象时)
d.component = d.component.map(c => {
  if (c?.zz_content && typeof c.zz_content === 'object' && !Array.isArray(c.zz_content)) {
    delete c.zz_content.circular_banner_option;
  }
  return c;
});

$done({ body: JSON.stringify(obj) });
