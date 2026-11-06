# 各 App 通道地图

> 每个广告形态在每个 App 的通道独立判定, 不能类推。★=已实证。

## 已知 ACCS / 原生死角（HTTP 不可达, 插件侧终局）

| App | 内容 | 证据 |
|-----|------|------|
| 淘宝 | 搜索框轮播词 | 沙盒 cache_newface_home_main_base + HAR 零请求 |
| 淘宝 | 搜你想搜/热榜面板（原生 fallback）| MuisePopup.swift 原生渲染 |
| 特价版 | 搜索框滚词典（比亚迪充电桩等 90 词位 mst_roll_1）| 沙盒 cache_ltao_newface_home_main_base |
| 一淘 | 拍图搜索入口 + 介绍页 | picSearchButton + etao_picSearch.isShow (ACCS/zconfig) |
| 天猫 | 未登录期本地默认词（创意园艺植物清单）| 清数据后首启, HAR/沙盒零命中 |
| 天猫 | 淘宝秒杀"限时惊喜"弹窗文案 | 全网络+App包零命中, 疑原生 fallback |

这些的 HTTP 侧配套接口仍要拦（断增量）, 残留展示只能越狱 Hook 根治。

## 天猫

| 形态 | 通道 | 状态 |
|------|------|------|
| 开屏 | mtop.tmall.rpm.splash.query（主）+ infinity.gateway fcResource 素材 | 双断★ |
| 开屏素材 | gw.alicdn imgextra **15TUA 后缀**（素材库标识, 不依赖尺寸; 正常商品图 0 命中）| 断★ |
| 搜索框滚词典 | placeholder 接口 + infinity.gateway→tabHeader.search.query 双通道 | 双断★ |
| 搜搜省/搜索发现 | searchsign / search.hq | 断★ |
| 首页促销券条 | execute 内 tm_my_promotion_* / tmall_home_landscape_promotion_*（前缀族）| 清洗★ |
| 弹窗注册表 | fc.resource.float.protocol.get（35 弹窗位: protocol_pop/message_style_pop/float_point）| 断★ |
| 浮点红包 | tmall.fc.resource.floatingpoint.get | 断★ |
| 摇钱树悬浮窗 | tacdata tips 入口(fudian) + yqs.ssp 数据 + spine 素材 | 三链路断★ |
| 消息盒子弹窗 | fc.touch.msgbox.materials/topcard | 断 |
| 优惠券分发 | fc.promotion.coupon.dispatch / bulgari / mallx.tjhb | 断 |

容器命名规律: 我猫页 tm_my_* / 首页 tmall_home_*（同功能双命名, 前缀族匹配）。
本地缓存: tmp/TMHomeTempCacheFolader/TMHomeLocalData.json = execute 响应快照（旧词残留靠覆盖衰减）。

## 淘宝（主站）

| 形态 | 通道 | 状态 |
|------|------|------|
| 开屏/热启动 | wireless.home.splash.awesome.get + newface.awesome.* + 素材(octopus/tps-1080) | 断★ |
| 弹窗调度器 | poplayer.template md5.json / popcdn | 断★ |
| UCP 弹窗闸门 | taobao.auge.delivery.private.popup.control | 断 |
| 搜索门组件 | g.alicdn search_door_*（MITM 已补）| 断★ |
| 直播膨胀红包 | livex.event.client.rule.report 规则引擎 + skylar 浮窗 | 断 |
| 直播浮层全族 | /skylar_hummer_/ 模板 | 断★（108请求全2B 实证）|
| iliad 任务悬浮 | usertask.tasks / interact.task.trigger / reward 族 | 断 |

## 闲鱼

| 形态 | 通道 | 状态 |
|------|------|------|
| 开屏 | idlecommerce.splash.* | 断★ |
| 搜索域 | shade/suggest/activate 三段式 — **三条硬约束: keywords 不能空数组 / link 不能清 / 只能动长度+text** | 断★ |
| 悬浮策略 | idle.user.strategy.* | 断 |
| 利益频道 | idle.interact.mac.user.launch | 断 |
| 小游戏广告 | idle.mini.game.ad / idle.play.ad | 断 |

## 特价版

| 形态 | 通道 | 状态 |
|------|------|------|
| 闪屏全族 | wireless.home.awesome.{get,update,recommend} + morning.* + newface.{morning,bottombar} | 断★ |
| 推荐广告 | relationrecommend.* 族 | 断 |
| 增长任务 | gaia.tjb.growth.* 全族 | 断★ |
| 滚词典 | **ACCS（cache_ltao_newface_home_main_base）** | 死角 |

## 一淘

| 形态 | 通道 | 状态 |
|------|------|------|
| 开屏 | noah.query/trigger/wireless.config（NOAH_SPLASH 体系）| 断★ |
| 首页容器 | **home.metax.query = 功能主干（reject 即白屏, 只能清洗）** | 清洗★ |
| 滚词典 | metax.headerList[].searchDefaultText（text+URL参数+unwEvents 三处藏词）| 清洗★ |
| 搜索发现 | search.middle.query → search_discovery_sec 容器（**整删**; 空壳会无限重试）| 整删★ |
| 膨胀红包 | noah.query assetResult resKey=etao_home_task_freemove | 过滤★ |
| 红包/券 | chaojisheng.hongbao / coupon.(batch.)?draw ×3 | 断 |
| 拍图入口 | **ACCS** | 死角 |
| ⚠️ 保留 | fe.search / search.ultron / search.middle 主链路（一淘靠搜索吃饭）| 放行 |

## 直播（淘宝直播）

skylar_hummer 浮层全族（45 模板: 红包/召回/催单/福利）断★; livex.delivery 断; 金币/红包雨断;
蜜蜂惊喜社权益条（live.column.entry limitRightList）清洗★; 视频流"马上抢"带货卡（bottomCardList）清洗★。
直播间内容推荐（tblive.recommend.*）是功能, 不拦。

## 美团 (2026-10-25, 全新从零开发)

| 形态 | 通道 | 状态 |
|------|------|------|
| 搜索框热搜/发现/滚词 | mtgsdk 长连接 | ⚫ 不可达 (三份HAR 3600条+沙盒全零命中) |
| 首页信息流 | 长连接 | ⚫ (待终验, 同款判定) |
| **horn 远程配置** | portal-portm/h.meituan.com 明文 (mergeRequest 1.1MB/169模块/650缓存文件) | ✅ 键级反转清洗 (v0.4~v0.6 共48键) |
| 我的页会员营销 | market.waimai.meituan.com 明文 JSON | ✅ 拦截 |
| 弹窗族 (直播券/消息横幅/DSP/酒店/问卷/topcube) | 各自 .com 域明文 | ✅ 预置拦截 (等活跃验证) |
| 素材 CDN | mss_* .meituan.net (picasso-ad 路径) | ✅ 广告路径拦 |

### 美团特有架构知识
- **无统一网关**: 域名极度分散 (327 URL常量各司其职), 逆向 URL 大多不活跃 (运行时拼装) — 域名靠 HAR 逐场景实证
- **horn = 美团版橙配**: 清数据冷启动 mergeRequest 全量拉取; 沙盒 cipstorage/sakhorn/ 落地 650 配置; 双端点各含不同模块子集 (清洗用全文正则, 键名全限定唯一所以安全)
- **.bin 后缀** = 美团序列化响应 (mapi/general/platform/mtlist/*) — 非明文, 只能 reject 不能字段清洗
- 弹窗框架: METPopupConfiguration + METPopupFrequencyRule (popup_frequency) — frequency 类接口不拦 (防反弹)
- 沙盒高价值目录: Documents/com.cipstorage.archiver/public/ (horn配置/alita广告策略js/picasso广告缓存/MRN包)

## 二进制审计基线

提取命令: `strings -a <主二进制> | grep -E "^mtop\.[a-z0-9.]+$" | sort -u`
规模: 淘宝750/天猫725/直播893/特价583/闲鱼535/一淘424。
**审计覆盖检查必须用 loon-sim 求值**（手写正则提取会漏 Script 段规则, 曾虚报 90 个缺口）。
大缺口里通常 84/90 是死代码（HAR 零请求）— 只拦实测活跃+高置信广告语义, 其余存档观察。

## 非阿里系（2026-10-24 新增）

| App | 形态 | 通道 | 状态 |
|-----|------|------|------|
| 小红书 | 信息流广告五特征(ads_info/card_icon/note_attributes/live_v2/has_related_goods) | HTTP (v6/homefeed) | ✅ 清洗 |
| 小红书 | 实况照片水印/保存 | HTTP 双响应调包(imagefeed+save) | ✅ (双sign畸形URL修复) |
| 小红书 | 点点 AI | HTTP (agentspark/inspiration/askdiandian域) | ✅ 拦截(开关) |
| 小红书 | 通知引导弹窗 | HTTP switch_config→push_guide_actions | ✅ 清洗 |
| 小红书 | 点点入口图标 | 本地 UserDefaults | ⚫ 不可达 |
| 什么值得买 | 开屏/信息流/热榜/微信弹窗 | HTTP | ✅ |
| B站 | ViewProgress 双端点: 国内 view.v1 / **国际版 viewunite.v1** — 按 URL 匹配 View/ViewProgress 的规则必须两者都覆盖 | gRPC | ✅ (Airborne v1.59) |
| B站 | 降落伞图标 = chronos 校验包内 res/others/airborne.png; 重签为透明占位图(引擎急切加载, 只能换透明不能删) | gRPC 三元组重签(md5/URL/sign) | ✅ |
| B站 | 青少年模式弹窗 = 本地计时+本地UI, 服务端 rules:null; ModeStatus mock 需 CloseStatus(0) 语义 | ⚫ 本地不可达 | ✅ 判定 |
| 什么值得买 | 同接口双网关域(haojia-api/a-api) | — | 规则用 (?:A\|B)-api 形态 |
| 京东 | 搜索组件/滚词典 | HTTP | ✅ (滚词典残留=缓存) |
| 京东 | 域名探针借道 | acs.m.taobao.com(自己MITM补该域) | ✅ 模板合规 |
| Zepp | 开屏/推广卡 | HTTP cards/*_ad/_promotion | ✅ |
| 支付宝 | 搜索推荐组件 | mobilegw 长连接 | ⚫ 不可达 |
