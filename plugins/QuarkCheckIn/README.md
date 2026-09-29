# 夸克网盘签到 · QuarkCheckIn

每天自动签到领空间。7 天一轮，普通会员 20/40/20/20/20/20/100 MB，SVIP 最高 1024 MB。

> 个人使用插件 · 仓库里的 `quark_checkin.js` **内置了真实登录凭证**（见下方「凭证」一节）。
> 仅供本人取用，他人请自行抓包替换。

---

## 安装 · Install

订阅地址（Loon → 配置 → 插件 → 右上角 `+` → 粘贴）：

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/QuarkCheckIn/QuarkCheckIn.lpx
```

> ⚠️ `raw.githubusercontent.com` 的 CDN 缓存最长约 24h。拉不到时在地址末尾加随机参数：`?cb=2`

| 文件 | 用途 | Purpose |
|---|---|---|
| [QuarkCheckIn.lpx](QuarkCheckIn.lpx) | 插件清单 | Plugin manifest |
| [quark_checkin.js](quark_checkin.js) | 签到脚本（2.3 KB） | Check-in script |
| [quark_checkin.test.mjs](quark_checkin.test.mjs) | 回归测试，17 个用例 | Regression tests |

跑测试：`node quark_checkin.test.mjs`

---

## 用法 · Usage

插件设置里有一个开关：

| 开关 | 默认 | 作用 |
|---|---|---|
| **每日自动签到** | **关** | 打开后每天 09:00 自动执行 |

插件页面有两个可点项：

| 按钮 | 行为 |
|---|---|
| **立即签到** | 手动触发一次，**不受开关影响** |
| **自动签到** | 开关关闭时为灰色，Loon 不调度，脚本一次都不执行 |

**多设备**：所有设备都装上，只在**一台**上打开「每日自动签到」，其余保持默认关闭。

结果通过通知推送：签到成功（+N MB）/ 今日已签 / 凭证失效 / 异常。

### 改签到时间

编辑 [QuarkCheckIn.lpx](QuarkCheckIn.lpx) 里：

```ini
cron "0 9 * * *" ...   # 分 时 日 月 周
```

---

## 特点 · Features

- **不解密任何域名** —— 只用 `$httpClient` 主动发请求，没有 `[MITM]` 段，**不用装 Loon 根证书**，与其他插件零冲突
- **不影响主配置** —— 显式 `node:"DIRECT"`，不消耗代理流量
- **凭证不外流** —— `auto-cookie:false` + `insecure:false`
- **开关在调度层** —— `enable={auto}` 由 Loon 拦截，关着时脚本不执行、不发请求

---

## 原理 · How it works

```
POST https://drive-member.quark.cn/1/clouddrive/capacity/growth/sign?kps=&sign=&vcode=&pr=&fr=
Content-Type: application/json;
body: {"sign_cyclic":true}
```

最小参数集 5 个，其余（`dn`/`ve`/`mi`/`uc_param_str`…）全部可省。

### 三个反直觉的坑

这个接口用状态码撒谎的地方比用错误码的多，都实测过：

| 坑 | 表现 |
|---|---|
| 缺 `pr=qk_clouddrive` | **500** cyclic sign config error —— 不是 401，容易误判成鉴权问题 |
| 缺 `fr=iphone` | **200 但 `data` 为空** —— 读不到 `sign_daily`，会误判成"未签到"而白白发一次 POST |
| 缺 `Content-Type` | **200 + `code:0` 但 `data:{}`** —— 假成功，签到根本没执行 |

最后一条最阴：返回 `code:0` 看着像成功，实际奖励是空的。脚本已加判断兜住
（`code 0` 但无 `sign_daily_reward` 一律按"已签过"处理）。

### vcode 不能用当前时间重算

`sign` 内部锚定了**签发时刻**，`vcode` 必须落在那个时刻附近。实测：sign 签发 22 小时后，
vcode 取签发时刻 → 200；取当前时刻 → 401。

窗口锚在 sign 上，**不是**服务器当前时间 —— sign 越老，可用区间越往回漂。
所以脚本原样使用抓包时的 vcode，不重算。

### 返回码

| code | 含义 | 插件提示 |
|---|---|---|
| 0 | 成功 | ✅ 签到成功 +N MB |
| 44210 | `cap_growth_sign_repeat` | 📅 今日已签 |
| 31001 | `require login [guest]` | 🔑 凭证已失效 |
| 其他 | — | ⚠️ 异常 + 原始 message |

---

## 凭证 · Credentials

`quark_checkin.js` 顶部三个常量：

```js
const KPS   = "...";   // 账号密文
const SIGN  = "...";   // 签名密文，客户端 SDK 生成，无法自行计算
const VCODE = "...";   // 原样抄抓包 URL 里 vcode= 的值
```

**这些值等同于网盘登录凭证。** 本仓库公开，因此任何拿到仓库的人都能读到。
盘里没有有价值的数据，故未做加密处理 —— 但仍不建议转发本仓库。

### sign 过期了怎么办

接口返回 `31001` 时会推送「🔑 凭证已失效」。届时：

1. 抓一次夸克网盘签到，找 URL 里带 `capacity/growth/sign` 的 POST 请求
2. 替换脚本顶部三个值
3. 在 Loon 插件页点「更新外部资源」（远程脚本有 CDN 缓存）

---

## 开发记录 · Development

本插件的全部迭代都是在这个会话里完成的，几处关键转折：

1. **先测出最小参数集**再写脚本 —— 抓包里 20+ 个参数其实只有 5 个必填，
   其中 2 个缺失时返回的是误导性的状态码
2. **窗口锚点判断错了两次**。第一次测出"28 小时窗口"就下了结论，
   但当时 sign 才 10 小时大，"锚在 sign"和"锚在 now"观测上无法区分。
   隔天 sign 21.8 小时才分得清 —— **观测条件不足时不要下结论**
3. **`$notification.post` 是 3 个参数**，只传 2 个时 Loon 把正文显示成 `null`。
   而当时的 mock 用 2 参签名去接，测试全绿也没发现。
   **mock 忠实度必须 ≥ 被调 API 的签名**
4. **异常路径没测 = 没测**。`JSON.parse` 裸奔，服务端回 HTML 错误页时抛异常，
   `$done()` 不执行，脚本挂到超时且无任何提示。

`quark_checkin.test.mjs` 的 17 个用例把这几条都钉死了。

---

## 致谢 · Credits

- 插件结构参考 [MaYIHEI/paperclip](https://github.com/MaYIHEI/paperclip) 的
  `app/agentrouter`（Loon `[Argument]` + `argument=[{...}]` 写法）与
  `loon/paperclip-cookie`（`switch,false` 默认关 + `enable={xxx}` 的开关范式）
- 官方文档 [LoonManual](https://github.com/loon0x00/LoonManual)
