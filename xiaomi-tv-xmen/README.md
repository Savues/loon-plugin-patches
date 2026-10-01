# 小米电视 xmen 实机调优手册

> 设备:**MiTV4-ANSM0**(代号 `xmen`)/ 小米电视 4A 55寸
> 记录时间:2026-10-01 · 全部结论基于本机 adb 实测
> ⚠️ 本文档已过滤位置坐标、账号 ID、VIP 状态等隐私字段

---

## 0. 一句话结论

**去广告成功了(三次重启验证持久生效),其他四项需求经实测确认无解。**

---

## 1. 设备档案

| 项 | 值 |
|---|---|
| 产品代号 | `MiTV4-ANSM0` |
| 平台代号 | `xmen` |
| 芯片 | **Amlogic S905(gxbaby)** / `ro.hardware=amlogic` |
| 架构 | **armeabi-v7a(32位)** |
| 系统 | **Android 6.0.1** / SDK 23 |
| Build | `MHC19J` · `22.10.20.3352` · incremental `3352` |
| 系统版本 | **MiTV OS 1.3.130**(该机型最终版) |
| 安全补丁 | **2017-04-01**(已停止更新) |
| 内核 | `3.14.29` |
| SELinux | **Enforcing** |
| platformId | `632` · hardware_version `2f0233` |
| 内存 | **1.66 GB 总量** |
| /data | 5.0 GB |
| adb 端口 | **5555**(备用 49152) |

⚠️ **型号重名警告**:`L55M5-AZ` 在恩山对照表里对应 **三台**不同机器(4A 55寸 / 4C 55寸 / 全面屏 E55A)。**必须用 `ro.product.model` 确认,别只看型号串。**

⚠️ **同代号多版本**:`MiTV4-ANSM0` 至少跑过 1.3.130 和 20.3.9.2061 两种系统。**别照抄别人的固件包。**

---

## 2. ✅ 已达成(持久生效)

### 2.1 广告引擎卸载 —— 主要成果

```bash
adb shell pm uninstall --user 0 com.miui.systemAdSolution
```

**三次重启后验证 `installed=false` 依然成立。** 效果持久。

⚠️ **包名极易搞错**:网上文章普遍写 `com.xiaomi.mitv.adserver`,**这台机器上不存在该包**。真实包名是 `com.miui.systemAdSolution`,而**目录名却叫 `AdServer`**(名与实不符是踩坑根源)。

### 2.2 广告开关全部归零(在 `system` 命名空间)

```
boot_ad                = 0    开机广告
boot_ad_sound_enable   = 0    广告声音
boot_ad_switch_show    = 0    广告提示条
boot_auto_play         = 0    自动播放  ← 唯一由我修改(1→0)
```

🔴 **关键坑:这四个键在 `system` 命名空间,不在 `secure`/`global`。**
查 `settings get secure boot_ad` 会返回 `null`,容易误判为"不存在"。

**这四个开关抗过了三次重启**,与 adb 开关/simple_mode 形成鲜明对比(见 §4)。

### 2.3 多看视频隐藏,省 24 MB

```bash
adb shell pm uninstall --user 0 com.duokan.videodaily
```

⚠️ **注意其特殊性**:与广告引擎不同,它在 system 分区有原件,卸载后 `installed=true` + `hidden=true`,即**"隐藏 + 省空间"而非真删**。数据分区副本(24MB)已移除。

### 2.4 内存

- TvHome 内存从 **306 MB → 约 200 MB**(卸载其数据分区副本后)
- 删除 videodaily 后 MemAvailable 达 **813 MB**

---

## 3. ❌ 实测确认无解的五项

| 需求 | 实测结论 | 根因 |
|---|---|---|
| **固化 adb 开关** | ❌ 三次重启独立验证,每次必关 | 见 §4.1 |
| **切换默认桌面** | ❌ 系统不认第三方桌面 | 见 §4.2 |
| **HOME 键不返回 TvHome** | ❌ 三层锁死 | 见 §4.3 |
| **关闭 HDMI 信号源搜索** | ❌ 厂商设计,非故障 | `hdmirx` 驱动开机检测,无信号才回落桌面 |
| **simple_mode 桌面降级** | ❌ 改 1 后重启自动回 0 | 见 §4.1 同机制 |

---

## 4. 三类机制的对照(本次最核心的发现)

### 4.1 会被 TvHome 启动时重写 vs 不会被

| 设置 | 命名空间 | 重启后 | 机制 |
|---|---|---|---|
| `boot_ad*` / `boot_auto_play` | `system` | ✅ **保持** | TvHome 不重写 |
| 广告引擎 uninstall | data 分区 | ✅ **保持** | 存储层面 |
| `adb_enabled` | — | ❌ **重置为关** | `sys.set_adb_disabled=true` |
| `mitv.settings.support.simple_mode` | `system` | ❌ **重置为 0** | TvHome 启动时重写 |

🔴 **规律:凡 TvHome 启动时会重写的键,外部修改一律无效。** 这解释了为什么"改 simple_mode"和"固化 adb"都失败,而广告开关能成功。

**罪魁祸首定位**:`sys.set_adb_disabled` 的持有者经 grep 确认为
`/system/app/MiTVSettings2/oat/arm/MiTVSettings2.odex` —— **小米设置应用干的**。

### 4.2 不能切换默认桌面

**三个启动器都没有 `CATEGORY_HOME`**(实测计数全为 0),且 `settings get secure default_home` = `null`。

⇒ **小米电视不走 Android 标准 HOME 流程**,HOME 键由厂商私有机制接管。

### 4.3 HOME 键的三层锁死

```
① 按键采集  com.milink.runtime(独立进程,zygote 派生)
      ↓
② 协议处理  milink.sdk.* (6 个组件)
      ↓
③ intent路由 com.mitv.tvhome.HOME_PAGE → .MainActivityUserMode
              ⚠️ 仅 TvHome 声明(实测:tvhome=1, litehome=0)
```

⚠️ **魔改 litehome 的方案已验证走不通**,三重阻断:
- 重签名后 `sharedUserId=android.uid.system` 不匹配 → **装不上**
- milink SDK 依赖官方签名 → **重签后遥控器可能失灵**
- 双应用同时响应 `HOME_PAGE` → **电视上会弹选择框,更糟**
- 移除 TvHome 的 action 需改 system → 无 root 做不到

⚠️ litehome 签名主体为小米官方密钥(`Locality: Mountain, California`)。

### 4.4 权限限制:不是所有 pm 命令都能用

| 命令 | 结果 |
|---|---|
| `pm disable` | ❌ `SecurityException: Permission Denial` |
| `pm hide` | ❌ `SecurityException: MANAGE_USERS` |
| `pm uninstall --user 0` | ✅ **可用** |
| `settings put system` | ✅ 可用 |
| `setprop sys.*` / `persist.*` | ❌ 静默失败 |
| `setprop debug.*` | ✅ 可写(但与 adb 无关) |

🔴 **这是本次最实用的发现之一:这台机器只能用 `uninstall --user 0`,不能 `disable`。**
网上文章说"Android 6.0 无太多限制,可直接禁用" —— **实测不成立**。

### 4.5 系统分区卸载的"自愈"现象

```
adb uninstall com.mitv.tvhome  → Success
pm path → 空(数据分区副本已删)
dumpsys → installed=true       ← system 原件立刻接管
pm path → /system/vendor/app/TvHome/TvHome.apk
```

⇒ **system 分区有原件的应用,卸载只会隐藏,不会真删。**
广告引擎之所以能真删,是因为它卸载后没有原件接管(这个差异值得记住)。

---

## 5. 无法提权(已穷尽验证)

| 路径 | 实测 |
|---|---|
| setuid/setgid 二进制 | ❌ `find -perm /6000` **零结果** |
| `su` 二进制 | ❌ 不存在 |
| `adb root` | ❌ user 版固件,无此命令 |
| `setprop sys./persist./service./ctl.` | ❌ 静默失败 |
| DirtyCow (3.14.29 < 3.14.44 理论可利用) | ❌ 需编译,而**iSH 无法运行 java**(`getcpu(2) system call not supported`)、电视端无编译器 |

🔴 **结论:无 root、无 setuid、SELinux Enforcing ⇒ 提权闭环,不可绕过。**

---

## 6. adb 断连规律(重要,影响所有后续操作)

### 实测数据

| 传输 | 大小 | 结果 |
|---|---|---|
| AdServer.apk | 333 KB | ✅ 0.9s |
| MobileService.apk | 7.3 MB | ✅ 22s |
| litehome.apk | 14.7 MB | ✅ 44s |
| TvHome.apk | 37 MB | ❌ **46% 处断,连续 3 次失败** |
| leanback.apk | 14.4 MB(push) | ✅ 39s |

### 规律

- **速率恒定 0.3~0.4 MB/s**
- **≤ 8 MB 稳定;15 MB 勉强;> 35 MB 必断**
- 公式:`传输时长 ≈ 体积 ÷ 0.35 MB/s`,**单次连续传输安全上限 20 秒**
- ⚠️ 另一类断连是 **adb daemon 被系统杀**(`not found`),与数据量无关,重连即通

### 解决方案(已验证)

**① 分块脚本** `tvpull.sh` — 2MB/块 + 断线重连 + 断点续传
⚠️ 脚本里 `wc -c` 在 adb shell 中重定向会失败,需改用其他方式取大小

**② ★电视端本地复制(最优)** ← 85MB 一次成功
```bash
adb shell cp /data/app/xxx/base.apk /storage/<U盘卷标>/
```
⚠️ **不走 adb 传输,完全不受断连影响。** 大文件一律用这个。

---

## 7. U 盘方案(最实用,绕开 adb 依赖)

| 项 | 值 |
|---|---|
| 卷标 | `4BF4-D99B` |
| 路径 | `/storage/4BF4-D99B` |
| 格式 | **FAT32(必需)** |
| 容量 | 57.7 GB |

⚠️ **实测要点**:
- `/udisk` 和 `/media` **为空**,真实路径只有 `/storage/<卷标>`
- 挂载后会出现 `.mediaexplorer`(系统已扫描)
- 该机 Android 6.0 **不支持 exFAT/NTFS**

**已备份内容:**
```
TvHome.apk     85,145,821 字节
litehome.apk   15,363,742 字节
```

**装回方式**:电视文件管理 → 找 APK → 安装(完全不需要 adb)

---

## 8. 隐藏开关清单(完整挖掘结果)

### 8.1 广告相关(已全部归零)
见 §2.2。

### 8.2 其他有价值的发现

```
install_non_market_apps = 1          ✅ 允许第三方安装
intelligent_update      = 0          ✅ 自动更新本来就关着
can_be_deleted          = <17个包>    官方"可删清单"
cloud_show_uninstall_list = <15个包>  第二份可删清单(更偏服务)
mitv.settings.device.level = 2  type=low    设备被判定为低端
hdmi_control_auto_wakeup_enabled        HDMI 唤醒
```

⚠️ **`can_be_deleted` 内容**:多看视频、录屏、商店、游戏中心、天气、钱包、智能家居、闹钟、视频、日历、相册、健康、手册、音乐

⚠️ **`cloud_show_uninstall_list` 内容**(更值得删,全是臃肿服务):DVB 播放器、直播、云游戏、电视视频通话、电视健康检测、reset_tool 等

⚠️ **`boot_lbs_net_switch = 1`(LBS = 基于位置服务,天气应用消费)**
⚠️ **未修改** —— 名字含 `boot`,疑与开机流程相关,关掉风险不确定;
且本机 `location_mode = null`(本就无定位硬件),实际收益≈0。

### 8.3 三类命名空间的坑

| 命名空间 | 特点 |
|---|---|
| `settings list system` | **广告开关在这** |
| `settings list secure` | `install_non_market_apps`、输入相关 |
| `settings list global` | `adb_enabled`、`3rd_app_show_loading_page` |

⚠️ **查错命名空间会误判"键不存在"** —— 本次广告开关就踩过这个坑。

---

## 9. 设置应用页面清单(73 项)

从 `dumpsys package com.xiaomi.mitv.settings` 提取。

**★ 重点发现**:
- **`RECOVERY`** ← 🔴 **设置内直接有 Recovery 入口**,比遥控器组合键更可靠
  (组合键:蓝牙遥控器=确定+返回 / 红外=主页+菜单)
- `RC` ← 遥控器设置
- `DISKINFO_SETTINGS` / `SDINFO_SETTINGS` ← 存储信息
- `FAST_LINK_LISTEN_SERVICE` ← 快速启动

**分类**:系统(RECOVERY/ABOUT/GENERAL)、显示(DISPLAY/ScreenScale/backlight/eye_protect/3D)、
声音(sound/DOLBY/SOUNDBAR/SUBWOOFER/Surround)、网络(WIFI/ETHERNET/NETWORKINFO/diagnose/speedtest)、
外设(GAMEPAD/ADD_GAMEPAD/ADD_REMOTE/RC/BLE)

⚠️ **无 DeveloperOptions 页面** —— 开发者选项由系统注入,不在小米设置内。
这也解释了为何 `pm disable` 被拒(开发者相关组件管控更严)。

---

## 10. TvHome / litehome 组件情报

### TvHome(系统原件,`/system/vendor/app/TvHome/`)
```
MainActivity / MainActivityUserMode / SearchActivity / ErrorActivity
com.mitv.tvhome.HOME_PAGE → MainActivityUserMode   ← 主页键落点
com.xiaomi.ACTION_MODE_CHANGE → MainActivityUserMode
权限:CHANGE_MI_HOME_MENU_STATE / HOME_STATE / MANAGE_MEDIA / VIDEO_DATA
```

### litehome(`/data/app/`,可卸载可替换)
```
版本:50.0.1338-0786a492-09061916  minSdk 23  targetSdk 30
Launcher: com.xiaomi.eetv.litehome.Launcher
⚠️ 无任何 MAIN/LAUNCHER/HOME intent-filter(所以应用列表里找不到)
⚠️ 官方签名(Locality: Mountain, California)→ 重签名装不上

内置 milink SDK(6组件):
  com.mi.milink.sdk.service.MiLinkService / MiLinkJobService
  milink.sdk.receiver.BootReceiver / NetworkReceiver / AlarmReceiver
  milink.sdk.heartbeat
```

---

## 11. 踩坑清单(直接可用的教训)

| # | 坑 | 正确做法 |
|---|---|---|
| 1 | 广告引擎包名写成 `com.xiaomi.mitv.adserver` | 实际是 **`com.miui.systemAdSolution`**,目录名 `AdServer` 是误导 |
| 2 | 用 `settings get secure boot_ad` 查不到 | **在 `system` 命名空间** |
| 3 | 以为 `pm disable` 能用 | **被拒绝**,只能用 `uninstall --user 0` |
| 4 | 直接 `adb pull` 拉大文件 | **超过 ~15MB 必断**,用电视端 `cp` 到 U 盘 |
| 5 | 改 `simple_mode` 期待生效 | **TvHome 重启时重写,必回默认值** |
| 6 | 找 U 盘看 `/udisk` | **路径是 `/storage/<卷标>`** |
| 7 | `am start -a android.intent.action.SHUTDOWN` | ⚠️ **会触发重启不是关机**,关机需 `adb reboot -p` 或遥控器 |
| 8 | 用 Leanback 默认包名 `com.rockon999.*` | release 实际是 **`com.amazon.tv.leanbacklauncher`** |
| 9 | 看 `pm list packages -d` 判 disable 成功 | 该命令**不显示系统应用**,须用 `dumpsys` 看 `installed=` |
| 10 | 在 iSH 里装 java/apktool | ⚠️ **java 无法运行**(`getcpu` 不支持),只能用纯 Python 方案 |

---

## 12. 后续操作速查

### 打开 adb(重启后必做)
```
设置 → 关于本机 → 狂点「版本号」7~10 次 → 开发者模式
设置 → 安全 → ADB 调试 → 允许
⚠️ 电视屏幕弹窗 → 点「确定」
```

### 常用命令
```bash
adb connect 192.168.31.155:5555
adb devices                      # offline/unauthorized 时重连
adb shell am start -n com.xiaomi.eetv.litehome/.Launcher   # 切回 lite 桌面
adb shell settings get system boot_ad                      # 查广告开关
```

### U 盘装回
```
电视文件管理 → /storage/4BF4-D99B → 点 APK → 安装
```

### 最后兜底
**恢复出厂设置** —— 所有 `uninstall --user 0` 改动会还原
⚠️ 代价:清空全部个人设置与已装应用

---

## 13. 已备份文件

| 位置 | 内容 |
|---|---|
| **U 盘 `4BF4-D99B`** | `TvHome.apk` (85MB)、`litehome.apk` (15MB) |
| `tv-backup/` | `AdServer.apk`、`MobileService.apk`、`leanback.apk` |
| `tv-backup/launchers/` | `litehome.apk` |

---

## 14. 总体评估

**这台电视的硬约束**:无 root、无 setuid、system 只读、1.66GB 内存、
安全补丁停在 2017、Android 6.0.1 已过支持期。

**能做的已做尽**:去广告(持久)、省内存、隐藏冗余应用。

**做不到的已确证**:固件固化、桌面切换、HOME 键改绑、HDMI 搜索关闭。
⚠️ 这些都需要 root 或刷机,而该机**无降级退路**(1.3.130 是最终版),
风险收益完全不成比例。

**若将来一定要动**,唯一路径是拆机 + eMMC 编程器写分区
(参考同代机型资料:`MiTV4-ANSM0` 分区表已知,主板 TPD.T962)。
⚠️ 同代机器多用海力士 eMMC,寿命短的已读不出数据。
