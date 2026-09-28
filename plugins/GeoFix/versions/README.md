# 钉版清单 · Pinned manifests

每个文件把 `script-path` 钉在一个具体 commit 上，**内容此后永不变化**。
用来做 A/B 对照、排查「升级后是不是坏了」、以及给别人一个可复现的环境。

| 文件 | 钉在 | 相对最新版的差异 |
|---|---|---|
| `GeoFix-v1.2.lpx` | tag `geofix-v1.2` | 解析器**不认** `coordinate=` 参数，苹果地图 App 分享链接会 422 |
| `GeoFix-v1.3.lpx` | tag `geofix-v1.3` | 补上 `coordinate` / `coordinates`，短链判定收紧 |

另有 `../GeoFix.lpx` —— 跟随 `main`，始终是最新版。

## 怎么切

Loon → 插件 → 找到 GeoFix → 删除 → 导入你要的那个 `.lpx` → 重启 Loon。

切换只是换一个 URL，不用碰仓库、不用 git 操作，也不会被 CDN 缓存坑到
（地址里带固定的 tag，内容不变）。

## 验证某个钉版确实是那个版本

```bash
SHA=$(git rev-parse geofix-v1.2)
curl -s "https://raw.githubusercontent.com/Savues/loon-plugin-patches/$SHA/plugins/GeoFix/src/geo-parse.js" \
  | grep -c coordinate        # 0 = v1.2 不认这个参数，>0 = 认
```

## 新增钉版

```bash
git tag geofix-vX.Y <commit>
git push origin geofix-vX.Y
```

然后把 `../GeoFix.lpx` 里的 `loon-plugin-patches/main/plugins/GeoFix`
替换成 `loon-plugin-patches/geofix-vX.Y/plugins/GeoFix`，另存为 `GeoFix-vX.Y.lpx`。

⚠️ 钉版会永远引用那个 commit，**别用 `git gc --prune` 或改写历史**，否则 raw 地址会 404。
用 tag 而不是裸 commit hash，地址可读、好记。
