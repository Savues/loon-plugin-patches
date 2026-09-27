# BlockAds-Patched

`blockAds.plugin` 打上 [P001 补丁](../../patches/README.md) 后的可直接订阅版本。

## 订阅地址

```
https://raw.githubusercontent.com/Savues/loon-plugin-patches/main/plugins/BlockAds-Patched/BlockAds.patched.plugin
```

## 改了什么

在 `[Argument]` 段末**增加 3 行声明**（8490 行 → 8493 行，其余零改动）：

```ini
displayUpList=select,"show","hide","auto",tag=[bilibili] 最常访问显示方式
purifyComment=switch,true,false,tag=[bilibili] 移除评论区置顶广告
optimizeRequest=switch,true,false,tag=[bilibili] 优化评论区加载异常
```

## 为什么

上游 blockAds 调用 kokoryh 的 `bilibili.protobuf.response.js`，脚本内置默认值：

```js
var L = Bn({displayUpList:"show", purifyComment:!0, sponsorBlock:true})
initArgument(e){ Object.assign(this.argument, e) }   // 传入值覆盖默认值
```

但上游 `[Argument]` 未声明这三个参数，`undefined` 会**覆盖脚本的正常默认值**：

| 功能 | 上游表现 | 补丁后 |
|---|---|---|
| 空降助手 | ✅ 正常 | ✅ 不变 |
| 评论区电商广告过滤 | ❌ 被跳过 | ✅ 生效 |
| 最常访问显示方式 | ❌ 走 auto | ✅ 可选 show/hide/auto |
| 评论区加载优化 | ❌ 规则永不执行 | ✅ 生效 |

最后一项尤其隐蔽：上游的 `bilibili.request` 规则写着 `enable={optimizeRequest}`，
而 `optimizeRequest` 未声明 —— **Loon 加载不报错，规则却一次都不会触发**。

## 上游更新后

本文件是静态快照。想同步新版：

```bash
python3 patches/patch-blockads.py -o plugins/BlockAds-Patched/BlockAds.patched.plugin
git commit -am "同步 blockAds 上游更新" && git push
```

补丁器幂等，重复运行安全。详见 [patches/README.md](../../patches/README.md)。

## 致谢

- **奶思 / fmz200** — <https://github.com/fmz200/wool_scripts>（原作者）
- **kokoryh** — <https://github.com/kokoryh>（B 站 protobuf 脚本作者）

上游版权与许可全部适用。
