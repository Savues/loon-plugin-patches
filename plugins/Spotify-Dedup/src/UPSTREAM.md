# UPSTREAM · 上游出处与改动记录

## 脚本

| 项 | 值 |
|---|---|
| 文件 | `src/spotify.response.js` |
| 来源 URL | `https://kelee.one/Resource/JavaScript/Spotify/Spotify_remove_ads.js` |
| 采集日期 | 2026-09-29 |
| 大小 | 9389 B |
| SHA256 | `198cb5869d9710c56ed1945156c8f6227fdf9d19da38ee1c8870f4d72f26c6c8` |
| 作者 | 001ProMax <https://github.com/001ProMax> |
| 改动 | **无** —— 逐字节副本 |

`cmp` 与采集时的线上文件完全一致。改托管位置是本仓库的通例
（见 `PinDuoDuo`、`YouTube-Dedup` 的同类说明）：第三方站点一旦消失，
已导入的 Loon 插件会直接加载失败。

## 三份脚本的关系

`001ProMax/Surge` 的 `Script/Spotify.Crack.Dev.js` 有三个版本在流传：

| 版本 | 提交 | 大小 | `$argument` | 说明 |
|---|---|---|---|---|
| 730 指向的 | `2e3eb28d`（2026-07-26） | 10446 B | **0 次** | 重构版，改走 `new Request/Response` fetch 重写，**开关功能丢失** |
| kelee 托管的 | 基于 `8986b9b9`（2026-03-13）自行改造 | 9389 B | 4 次 | 保留了开关，另加了 `tab_configuration` / `ios-feature-share` / `publish-playlist` / `financial-product` |
| 中间版 | `8986b9b9`（2026-03-13） | 12899 B | 0 次 | 无开关版 |

**本仓库用 kelee 那份**，因为只有它真正读 `$argument`。
730 当前指向的重构版会让 `tab` / `useractivity` 两个开关形同虚设
（脚本里 `$argument` 出现 0 次）。

### kelee 版的实现细节

去掉 Loon 状态守卫包装后，脚本的三个动作是：

1. 改 `accountAttributesSuccess.accountAttributes`：
   `ads` / `com.spotify.madprops.use.ucs.product.state` 等置为 premium 语义
2. 遍历 `resolveSuccess.configuration.assignedValues`：
   - `ios-system-your-plan-sidedrawer` + `is_row_enabled` → `boolValue` 强制 `false`（无开关，永远生效）
   - `tab_configuration` + `ios-feature-navigation` → `enumValue` 置空（受 `tab` 开关控制）
   - `is_useractivity_sharing_enabled` + `ios-feature-share` → `boolValue` 置 `false`（受 `useractivity` 开关控制，`useractivity` 为真时**不**改，即默认保留接力）
3. 写回 `$response.body`

### 开关语义（`switch, 默认值, 取反值`）

```
tab=switch, false, true        → 默认关（保留底栏创建按钮）
useractivity=switch, true, false → 默认开（保留 Apple 设备接力）
```

⚠️ 两者都作用于 **bootstrap 响应**，而 bootstrap 只在登录/冷启动时下发，
**改完开关需要重新登录 Spotify 才生效**（kelee 的 `#!desc` 里也是这么写的）。

## 清单层

`Spotify-Dedup.lpx` 的规则逐条溯源见该文件末尾的注释块。
唯一需要说明的：`#!system` 上游写的是空值，本版按仓库惯例补全为
`iOS, iPadOS, macOS`。

## 许可

上游未声明明确的开源许可。按仓库通例：
**上游版权与许可全部适用**，本仓库只做托管位置替换，不修改脚本任何一行。

致谢：**001ProMax** <https://github.com/001ProMax> — 原作者
