# 小米电视 adb 重连速查（针对 MiTV4-ANSM0）

> 设备：192.168.31.155 · 代号 MiTV4-ANSM0 (xmen) · Android 6.0.1
> 注意：**每次重启后需要重新打开电视的 adb 开关**，再执行下面的命令。

## 一、打开电视上的 adb 开关（仅重启后需要）

小米电视的 adb 开关**每次重启会被系统自动关闭**，这是小米设置应用（MiTVSettings2）重置的，不是 bug，无法在无 root 情况下永久禁用（已实测：system 只读、无 root、shell 无法写 sys 属性）。

**操作路径：**

1. 遥控器进 `设置 → 关于本机`
2. **狂点「版本号」那一行**（约 7~10 次），直到提示「已进入开发者模式」
   - 如果看不到「关于本机」：按遥控器**菜单键**进入设置
3. 返回设置，进 `安全`（部分机型在 `其他设置` 下）
4. 找到 `ADB 调试` / `调试模式`，**改为「允许」**
5. **电视屏幕会弹出「允许 USB 调试吗?」→ 用遥控器点「确定」**

> 电视上的 adb 端口是 **5555**。

## 二、电脑端连接

```bash
adb connect 192.168.31.155:5555
```

⚠️ 这台机器 **adb 不稳定，频繁掉线**（实测反复 offline / unauthorized）。断了就重连：

```bash
adb kill-server && adb start-server
adb connect 192.168.31.155:5555
adb devices
```

状态含义：
- `device` ✅ 已授权，可操作
- `unauthorized` ⚠️ **看电视屏幕，点「确定」**
- `offline` ⚠️ 重连一次，往往再发一次命令就通

## 三、这台机器的常用信息

```
产品代号   MiTV4-ANSM0
平台代号   xmen
芯片       Amlogic S905 (gxbaby)
系统       Android 6.0.1 / sdk 23 / armeabi-v7a
Build      MHC19J · 22.10.20.3352
系统版本   MiTV OS 1.3.130（该机型最终版）
platformId 632 · hardware_version 2f0233
adb 端口   5555（49152 也开着）
电视 IP    192.168.31.155
```

⚠️ 同为 `MiTV4-ANSM0` 代号的机器，系统版本可能不同（见到过 20.3.9.2061），**别照抄别人的固件包**。

## 四、几个实测结论（省得再踩）

| 事项 | 结论 |
|---|---|
| 有 root 吗 | ❌ 无（`su: not found`） |
| 能写 system 吗 | ❌ 只读（`ro`） |
| 能 setprop 改 sys 属性吗 | ❌ shell 无权限，静默失败 |
| 能改 `/etc/hosts` 永久生效吗 | ❌ 不行，system 只读。只能改**路由器**的 hosts |
| 有原生 `com.android.settings` 吗 | ❌ 没有，只有小米定制 `com.xiaomi.mitv.settings` |
| 广告引擎包名 | `com.miui.systemAdSolution`（**不是** `com.xiaomi.mitv.adserver`，网上文章写错） |

## 五、已备份文件

电视上的两个系统 APK 已拉到本地，可随时装回：

| 文件 | 对应包 |
|---|---|
| `AdServer.apk` | `com.miui.systemAdSolution`（广告引擎） |
| `MobileService.apk` | `cleantools.mitv.com.tvcleantools` |

**装回命令：** `adb install -r AdServer.apk`

## 六、兜底

万一 adb 完全连不上（极少发生）：
**电视 设置 → 恢复出厂设置** —— 会把 `--user 0` 删除/禁用的东西全部还原。
⚠️ 代价：清空所有个人设置和已装应用。