# B 站青少年模式引导弹窗 · 完整逆向记录（2026-11-01）

> 结论先行：**HTTP / Loon 插件层无法关闭该弹窗**。唯一已知解法是代码补丁
> （Android 用 ReVanced，iOS 需越狱）。本文记录全部证据链，供后续复用。

样本：`tv.danmaku.bilibilihd` 3.71.0（iPad，bili-hd2，318 MB 脱壳二进制）
辅助样本：3.20.1 沙盒、LC 3.71.0 沙盒、手机版 `bili-universal/91300100` 抓包

---

## 一、弹窗判定逻辑（反汇编实证）

地址 `0x10cf977e8`（`BFCRestrictedModeManager` 类方法，返回 BOOL）：

```asm
; 前置闸门（任一成立即 return false）
+[xxx ...]              ; 10cf97700 是否已开启青少年模式
[0x103384ec0 ...]       ; 10cf97714 登录态检查
[0x103353f38 ...]       ; 10cf97740 另一开关
self.checkXxx           ; 10cf97758 / 10cf97764

; 主判定
x0 = [Config class]                          ; __objc_classrefs @0x103353f60
x2 = "teenagers_mode_show_dialog_interval"   ; 方法名 getConfigByPath:
interval = [x0 getConfigByPath:x2]           ; 10cf977b8
cmp  x20, #1
b.lt → return false                          ; interval < 1 → 永不弹

lastShow = defaults["BFCTeenagersModeAlertShowDate"]
cbz  x0 → return true                        ; 无记录 → 弹

days = abs(NSCalendarUnitDay 差值)            ; w2=#0x10 = NSCalendarUnitDay
cmp  x8, x20                                  ; x8=abs(days), x20=interval
cset w20, hs                                  ; 弹 = (abs(days) >= interval)
```

**要点**：
- 单位是**天**，且取**绝对值**（所以把 `AlertShowDate` 设成未来日期也会弹）
- `interval` 来自 `getConfigByPath:`（类方法），**不是** `/x/v2/param` 下发的配置
- 同函数还读 `restrictedmode.teenagers_alert_api_config` 走另一分支

### 交叉验证

BiliRoamingX 的 `TeenagersModeFingerprint.kt` 用完全相同的方式定位该方法：

```kotlin
object TeenagersModeFingerprint : MethodFingerprint(
    strings = listOf("restrictedmode.teenagers_alert_api_config",
                     "teenagers_mode_show_dialog_interval"),
    returnType = "Z"
)
```

其补丁（`TeenagerModePatch.kt`）在方法开头注入 `return false` —— **代码补丁**。

---

## 二、HTTP 层实验（全部失败）

| 版本 | 改动 | 抓包确认 | 结果 |
|---|---|---|---|
| v8.0.4 | 无（ModeStatus 真实结构 mock） | — | 弹 |
| v8.0.5 | `teenagers_mode_show_dialog_interval` = 864000 | 写入 configDict ✓ | 弹 |
| v8.0.6 | interval=365 + 改写 `ver` 强制生效 | ver 已变 ✓ 315 项完整 | 弹 |
| v8.0.7 | interval=0（反汇编：<1 应永不弹） | interval='0' ✓ | **弹** |

**时序排除**：v8.0.7 抓包中 param 响应 `04:17:25.747` 到达，弹窗 `04:17:27.706`
—— 配置提前 2 秒就位，不是时序问题。

→ **`getConfigByPath:@"teenagers_mode_show_dialog_interval"` 不读 `/x/v2/param` 下发的配置。**

### 排他项

- `bilibili.account.fission.v1.Fission/Window`：弹窗时刻被调用，但请求体与响应**均为空**，
  是启动例行调用，非弹窗源
- 无独立 alert API 端点（全二进制 URL 扫描：只有 timer/get、timer/set、anti_addiction、
  realname/teen/age/check 等）
- 弹窗文案不在 App 包内（全包搜「青少年」0 命中）→ 文案来自 param 配置

---

## 三、沙盒对照实验（LC，全部实测）

| 组 | `alertTnterval` | `AlertShowDate` | 结果 |
|---|---|---|---|
| A | 0 | 26 秒前 | 不弹 |
| 02:41 | 缺失 | 21 分钟前 | 弹 |
| C | 0 | 2 天前 | 弹 |
| D | 864000 | 2 天前 | 弹 |
| E | 864000 | 2030 年（未来） | 弹（绝对值） |

→ `BFCTeenagersModePreferences` 里的 `alertTnterval` **不是闸门**，是 App 写给自己看的缓存。

**注意**：iOS `NSUserDefaults` 走 `cfprefsd`，直接改 plist 可能不被进程感知
（测试 E 中 App 用当前时间覆盖了我们写入的 2030），此类沙盒实验结论需谨慎。

---

## 四、memex 配置加密（部分破解）

### 存储结构

```
Library/Preferences/BFCMemexConfigPreferenceName.plist
  { infoVer, dataVer, configType, data: { "<key>": "<base64 密文>", ... } }
Library/Application Support/memex/MemexConfig/UnzipData/<ver>/<file>   ← 同一份 JSON
```

值格式：base64，长度均为 16 的倍数（16/32/48/…）。

### 加密参数（反汇编 `0x10dc5dd64`）

```asm
mov w0, #1      ; kCCDecrypt
mov w1, #0      ; kCCAlgorithmAES128
mov w2, #1      ; kCCOptionPKCS7Padding（无 ECB 标志 → CBC）
mov w4, #0x10   ; keyLength = 16
x3 = sp+0x20    ; key
x5 = sp+0x20    ; IV = key（同一指针）
x6 = dataIn ; x7 = dataInLength
```

**AES-128-CBC + PKCS7 + IV = key（前 16 字节）**

确定性验证：23 个布尔开关共用同一密文 `Y260Cyvp6HZEboaGO+YGMw==` → 同明文同密文。

### 密钥未找到

| 思路 | 候选数 | 结果 |
|---|---|---|
| `__cstring` 中 16/24/32 字符可打印串 | 80,646 | ❌ |
| 任意长度串取前 16/24/32 字节 | 273,649 | ❌ |
| hex / base64 解码后当 key | 1,246 | ❌ |
| **全二进制** `[A-Za-z0-9]{16,24}` | 254,150 | ❌ |
| MD5 / SHA1 / SHA256 派生（ECB 与 CBC 各一轮） | 207,047 | ❌ |

→ 密钥不是字面量，推测运行时派生（设备指纹/常量拼接）或来自非字符串源。

### 后续可行路径

1. 动态 hook `CCCrypt`（本目录 `lcf-crypt.c` 已就绪），但 **B 站 无法注入 tweak**
   （见第五节）
2. 静态追踪 `0x10dc5dd64` 的调用者，看 `arg0`（key 素材）从哪来
   —— 直接 BL 调用者扫描为 0，可能经 block / Swift witness 间接调用
3. 逆向 `getConfigByPath:` 所属类，确认它读哪个配置存储

---

## 五、B 站 tweak 注入不可用的原因

`Applications/tv.danmaku.bilibilihd.app/LCAppInfo.plist`：

```xml
<key>dontInjectTweakLoader</key><true/>
<key>LCTweakLoaderCantInject</key><true/>
```

LiveContainer 尝试注入失败后自行打上标记，之后不再重试。
其他 App 的 `LCAppInfo.plist` 均无这两项，且它们的 `lcf-log` 正常产出
（但全部停在 10-27，说明整体注入自那时起已不工作）。

---

## 六、环境问题：lld 硬依赖 libscudo

Alpine 的 `lld15` 二进制 `DT_NEEDED` 含 `libscudo.so`，而 scudo 在 iSH 中
初始化失败（`Error loading shared library libscudo.so: Out of memory`）。

绕过方式（不改动系统 lld）：

```sh
cp /usr/bin/lld /tmp/ld64.lld
python3 - <<'EOF'
p='/tmp/ld64.lld'
d=bytearray(open(p,'rb').read())
old=b'libscudo.so'; new=b'libssl.so.3'   # 等长替换
i=d.find(old); d[i:i+11]=new
open(p,'wb').write(d)
EOF
chmod +x /tmp/ld64.lld
```

`libgcc_s.so` 不可用（是链接脚本，`Exec format error`）；`libssl.so.3` 是真实 ELF，可用。

---

## 七、最终结论

| 层 | 能否关闭弹窗 |
|---|---|
| HTTP / Loon 插件 | ❌ 4 个版本实测全部无效 |
| 本地沙盒 plist | ❌ cfprefsd 覆盖，且只对 LC 有效 |
| **代码补丁** | ✅ 唯一已知解（Android ReVanced；iOS 需越狱） |
| iOS 无越狱 | ❌ **无解** |

实际频率：`interval=1` 天 + 日历天比较 → **每台设备每天最多 1 次**。
双设备（iPad + iPhone）合计 2 次/天，与用户观察一致。
