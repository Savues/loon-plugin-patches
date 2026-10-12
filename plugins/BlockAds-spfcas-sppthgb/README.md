# JavDB 去广告与公告插件

屏蔽 JavDB App 的启动广告图片、开屏广告、启动公告、首页轮播广告。保留正常影片、磁力、搜索、历史记录功能。

## 功能特性

| 功能 | 实现方式 | 状态 |
|------|---------|------|
| 启动广告图片 | 拦截 `tp.spfcas.com/.../ads/` CDN 路径 | ✅ |
| 开屏广告配置 | Rewrite `splash_ad = {}` | ✅ |
| 启动公告 | Rewrite `settings.NOTICE = ""` | ✅ |
| 首页轮播/横幅广告 | Rewrite `data.enabled = false` + `data.ads.enabled = false` + 清空广告数组 | ✅ |
| 磁力/网页顶部广告 | 同首页轮播，清空 `web_magnets_top` / `magnets_top` | ✅ |
| 旧版计划公告 | Rewrite `plan_message = ""` | ✅ |
| 点击追踪域名 | 拦截 7 个跳转追踪域名 | ✅ |

## 适用版本

- JavDB iOS App (测试版本 1.9.29)
- Loon 3.4.0+ (需支持 `response-body-json-jq`)
- iOS 15+ / iPadOS 15+

## 安装方法

### 方式一：订阅安装（推荐）

在 Loon 中添加订阅链接：

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/master/plugins/BlockAds-spfcas-sppthgb/block-spfcas-ads.lpx
```

### 方式二：手动导入

1. 下载 `block-spfcas-ads.lpx`
2. Loon → 插件 → 从文件导入

## 必须配置

### 1. 开启 MITM 并信任证书

**Loon 设置 → MITM → 开启 HTTPS 解密**

**iOS 设置 → 通用 → 关于本机 → 证书信任设置 → 开启 Loon CA 完全信任**

### 2. 确认 MITM 域名覆盖

插件已声明以下域名，Loon 全局 MITM 需包含：

```
tp.spfcas.com
apidd.spthgb.com
apidd.czssdgz.com
apidd.btyjscl.com
api.aliycloud.com
api.ffaoa.com
api.liquidlink.cn
```

## 更新日志

### v1.9.2 (2026-10-12)
- ✅ 修复首页广告留白：双重设置 `data.enabled=false` + `data.ads.enabled=false`
- ✅ 完整覆盖 5 个启动 API 域名 + 2 个广告配置域名
- ✅ 保留搜索历史、推荐、磁力等核心功能

### v1.9.1
- ✅ 新增 `data.ads.enabled=false` 隐藏广告容器

### v1.9.0
- ✅ 新增 `/api/v1/ads` Rewrite 清空 `index_top`/`web_magnets_top`/`magnets_top`

### v1.8.0
- ✅ 移除 `/api/v1/ads` 拦截（导致"未找到查询信息"），仅拦截图片

### v1.7.0
- ✅ 合并重写规则，修复响应损坏问题

### v1.5.0
- ✅ 覆盖备用域名 `apidd.btyjscl.com` `api.aliycloud.com` `api.ffaoa.com`

## 技术细节

### 广告拦截策略

```
┌─────────────────────────────────────────────────────────────┐
│  1. 广告图片 CDN (tp.spfcas.com)                             │
│     → URL-REGEX REJECT /ads/ 路径 (保留 /covers/ /avatars/)  │
├─────────────────────────────────────────────────────────────┤
│  2. 启动接口 (/api/v1/startup) - 5 个域名                   │
│     → splash_ad = {}        # 移除开屏广告配置               │
│     → settings.NOTICE = ""  # 移除启动公告                   │
├─────────────────────────────────────────────────────────────┤
│  3. 广告配置 (/api/v1/ads) - 2 个域名                       │
│     → data.enabled = false        # 顶层禁用                 │
│     → data.ads.enabled = false    # 广告模块禁用             │
│     → index_top = []              # 首页轮播                 │
│     → web_magnets_top = []        # 网页磁力顶部             │
│     → magnets_top = []            # 磁力顶部                 │
├─────────────────────────────────────────────────────────────┤
│  4. 旧版计划接口 (/api/v4/plans)                             │
│     → plan_message = ""                                          │
├─────────────────────────────────────────────────────────────┤
│  5. 追踪域名 (7 个)                                          │
│     → DOMAIN-SUFFIX REJECT                                      │
└─────────────────────────────────────────────────────────────┘
```

### 覆盖的 API 域名

| 类型 | 域名 | 备注 |
|------|------|------|
| 广告图片 CDN | `tp.spfcas.com` | 仅拦截 `/ads/` 路径 |
| 主启动/广告配置 | `apidd.spthgb.com` | 主域名 |
| 备用启动/广告配置 | `apidd.czssdgz.com` | 常用备用 |
| 备用启动 | `apidd.btyjscl.com` | 冷启动发现 |
| 备用启动 | `api.aliycloud.com` | 冷启动发现 |
| 备用启动 | `api.ffaoa.com` | 冷启动发现 |
| 空配置 | `api.liquidlink.cn` | 返回空响应 |

## 常见问题

### Q: 安装后无效果
- 确认 Loon MITM 已开启且证书已信任
- 确认订阅已更新到最新版本 (v1.9.2+)
- **完全重启**：杀掉 Loon 后台进程 → 杀掉 JavDB → 重新打开

### Q: 提示"未找到查询信息"
- 这是旧版本 (v1.7 及以下) 拦截 `/api/v1/ads` 导致的
- v1.8.0+ 已修复：仅拦截图片，不拦截配置接口

### Q: 首页广告位留白
- v1.9.0 仅清空数组，容器仍渲染
- v1.9.1+ 设置 `enabled=false` 彻底隐藏容器
- v1.9.2 双重禁用 `data.enabled` + `data.ads.enabled` 兼容所有版本

### Q: 搜索历史/推荐消失
- 这是 v1.0 误拦截整个 `/api/v1/startup` 导致
- v1.3.0+ 改为 Rewrite 保留 `recent_keywords` 等字段
- 当前版本完整保留 41 项搜索历史 + 41 项磁力历史

## 许可证

MIT License

## 仓库

https://github.com/Savues/loon-plugin-patches/tree/master/plugins/BlockAds-spfcas-sppthgb
