# HAR 取证方法论

> 抓包文件分析的标准流程。来源: 2026-10 全月实战沉淀。

## 0. 文件定位

- 上传件: `/var/minis/attachments/uploads/*.har`（attachments 会被清空, 重要样本复制到 shared）
- 挂载盘真身: `/var/minis/mounts/File Provider Storage/Downloads/<序号>_<时间戳>.har`
- 大文件（>60MB）: 流式/分块处理, python json.load 会爆内存; 按块扫词定位再精读

### Loon 分目录抓包 zip（另一种格式, 验证插件生效的首选）

用户可能导出 zip（每请求一目录）而非 .har:
```
<目录名>/
├── request_header_raw.txt      # HTTP/2 形态: :authority 与 :path 分离, 重组 URL 需拼接
├── request_body_raw            # 请求体（如有）
├── response_header_raw.txt     # 响应头
├── response_body_raw           # 原始响应
└── replace_response_body_raw   # ★ 插件替换后的响应 — 验证插件真机生效的直接证据
```
- `replace_*` 文件存在且内容为 `{}`/改动版 = 该请求被插件处理过（比 HAR 更强, HAR 记录的处理时点不确定）
- 重组 URL: `https://<:authority的值><:path的值>`

## 1. 词的追踪顺序（"这个词从哪来"标准排查链）

```
① 响应明文 → ② 响应 base64 解码后 → ③ 请求体（上行同步, App 回传数据带词）
→ ④ 压缩层（zstd/gzip/br 全解压; Loon 抓包通常已解压存明文, 但要验证）
→ ⑤ 沙盒缓存（rg -uuu 搜词; 重点 Documents/TBDocuments/gateway/cache_*）
→ ⑥ App 二进制/资源（strings + rg -uuu）
→ ⑦ 全零命中 = ACCS 或原生渲染（终局）
```

每个环节的坑:
- **b64 响应**: HAR 的 content.encoding=base64 只代表 HAR 层编码; 解码后可能还是压缩流（查头 4 字节 magic: zstd=28b52ffd, gzip=1f8b）
- **b64 片段定位**: 词在 b64 流中对齐任意, 整词编码搜不到时用 raw 字节偏移 + 局部对齐解码
- **误命中甄别**: mpms json 里的聊天面板词、加密串随机命中 — 看上下文归属
- **词在 URL 参数**: `hint=词` `query=词`（URL编码形态也要搜）
- **词在埋点**: unwEvents 事件 URL 里（清洗时最易漏）

## 2. 时间线分析

```python
# HAR entries 可能倒序（最新在头）! 先确认方向: sorted(started) vs 原序
# 用户操作定位: 找"点击瞬间"的时间戳, 看前后 3-5 秒全部请求
def sec(s): h,m,x = s.split(':'); return int(h)*3600+int(m)*60+int(x)
```

- **抓包时刻 vs 版本加载时刻必须核对** — 诊断"规则不生效"前先确认抓包时设备跑的是什么版本（探针要在抓包同时段查才有效）
- 启动会话分组: 同一接口多次请求（如 splash.query ×3 = 3 次冷启动）
- HAR 记录的是**插件处理后的响应**（清洗/拦截生效时 size=2/词消失）— 可直接用来验证插件效果

## 3. 判读速查表

| 现象 | 含义 |
|------|------|
| size=2 / `{}` | reject_dict 生效 |
| status=0 + 域名在规则内 | REJECT 生效 |
| DNS 127.0.0.1 | [Rule] REJECT 生效 |
| size=0 + 域名不在规则内 | 环境问题（不是插件）|
| 大响应原样含广告词 | 未拦（查 MITM→段位→开关→规则入口）|
| 同接口短时间 ×N 次 | App 在重试（通常是清洗方案有问题, 如空壳容器）|
| 词只在请求体不在响应 | 上行回传, 源头在未捕获的下发 |

## 4. 素材归因（图片层）

- 疑似广告素材先看 URL 特征: 尺寸段（tps-536-786）/ 素材库后缀（天猫 15TUA）/ 域名
- **归因三硬证据**: 尺寸比例 + spm 培点 + 数据结构字段 — 时序相关性是最弱证据不可单独定论
- 素材 URL 反查: 在全部响应 body（解码后）里搜 URL 片段定位下发者
- 下载素材给用户肉眼裁决: `curl -o` + minis:// 展示（最可靠的终极判定）

## 5. 多源交叉

- **HAR × 沙盒**: 沙盒文件时间戳 + 内容对照（TMHomeLocalData.json = execute 响应的本地缓存）
- **HAR × 二进制**: HAR 发现的接口在二进制里找同族（前缀族扩展规则）; 二进制发现的缺口在 HAR 验证是否活跃
- **A/B 对照探针**: 同版本埋多条形态不同的规则（裸路径 vs 锚定 / reject_dict vs 双参 reject）, 真机一次定位差异

## 6. 沙盒挂载要点

- 路径: `/var/minis/mounts/Patches/<App目录>`（用户挂载）
- **挂载时机**: 先开 App 让目标现象出现, 再挂载 — 否则目录可能为空
- 搜词: `rg -uuu -l "关键词" <目录>`（-uuu 含二进制/隐藏）
- 重点目录: `Documents/TBDocuments/gateway/`（ACCS 缓存）/ `Library/Preferences/*.plist` / `tmp/*Cache*`
