# blockAds.plugin 补丁

`blockAds.plugin`（fmz200/wool_scripts）由 `tools/splitRules/mergeLoon.js` 从
`db/inaisi.db` 自动生成，直接跟踪 `main` 分支，**没有 tag / release**，
无法引用固定版本，只能在本地生成打过补丁的副本。

## 用法

```bash
# 拉上游最新版 → 打补丁 → 输出
python3 patch-blockads.py -o blockAds.patched.plugin

# 对已下载的文件打补丁
python3 patch-blockads.py blockAds.plugin -o blockAds.patched.plugin

# 只看会改什么
python3 patch-blockads.py --dry-run blockAds.plugin -o /dev/null

# 额外禁用与 Biliverse Enhanced 冲突的两条 jq
python3 patch-blockads.py --with-tab-jq-block -o blockAds.patched.plugin
```

导入 Loon 时把订阅地址指向 `blockAds.patched.plugin`（建议放自己仓库的 raw 链接）。

## 设计原则

- **声明式**：按参数名 / 规则特征定位，不依赖行号 —— 上游增删行后补丁仍能重放
- **幂等**：已打过补丁的版本再跑一次不会重复插入
- **最小改动**：除补丁条目外，其余内容逐字节保持原样

## 补丁集

### P001 · 补齐 kokoryh 脚本引用的 3 个未定义参数（默认应用）

blockAds 的 `[Script]` 段调用 kokoryh 的 `bilibili.protobuf.response.js`。
该脚本**内置默认值**：

```js
var L = Bn({displayUpList:"show", purifyComment:!0, sponsorBlock:!0})
initArgument(e){ Object.assign(this.argument, e) }   // 传入值覆盖默认值
```

但 blockAds 的 `[Argument]` 只声明了 `sponsorBlock` 和 `logLevel`。
另外三个未声明的参数传入 `undefined`，会**覆盖掉脚本的正常默认值**：

| 参数 | 脚本默认 | blockAds 传入 | 后果 |
|---|---|---|---|
| `sponsorBlock` | `true` | `true` | ✅ 正常（所以空降助手可用） |
| `purifyComment` | `true` | `undefined` | ❌ 评论区电商广告过滤被跳过 |
| `displayUpList` | `"show"` | `undefined` | ❌ 走 `auto` 分支而非 `show` |

更严重的是 `bilibili.request` 规则写着 `enable={optimizeRequest}`，
而 `optimizeRequest` **未声明** —— 该规则**永不生效**，评论区加载优化完全没跑。

补丁只增加 3 行声明，**不删除任何规则**。

### P002 · 禁用与 Biliverse Enhanced 冲突的两条 jq（`--with-tab-jq-block`）

blockAds 里有两条 `response-body-json-jq`，会**整体重写**响应体：

```
show/tab/v2   →  .data.tab / .data.top / .data.bottom  全部写死
account/mine  →  我的页服务入口写死
```

而 Biliverse Enhanced 也改写这两个端点，**后执行者覆盖前者**。

补丁将这两行注释掉（加 `# [patched]` 前缀），原文保留在文件里可随时还原。

> 副作用：顶栏、标签栏、底部导航栏将回到 B 站默认，无法自定义。
> 不装 Enhanced 就别加这个开关。

## 上游更新后怎么办

```bash
python3 patch-blockads.py -o blockAds.patched.plugin
```

一条命令重新生成。如果输出里出现 `无变化` 说明上游已经自己修好了，
可以去掉对应补丁。补丁失效会在 `--dry-run` 时直接暴露。
