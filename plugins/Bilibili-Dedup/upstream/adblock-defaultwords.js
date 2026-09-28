/*
 * 搜索框滚动推荐词过滤（Search/DefaultWords，gRPC）
 *
 * 响应是 gzip 压缩的 protobuf（帧首字节 flag=1），在 Loon 里解 gzip 需要
 * 完整的 inflate 实现（数百行），不划算。
 *
 * 但这个响应**整体只服务于滚动词**：f1/f2 是 ID、f3/f4 是滚动词副本、
 * f5 恒为 1、f6 是词条 ID 串。滚动词没了，整个响应就没有显示价值了。
 * 所以直接返回一个空 gRPC 帧 —— App 收到空结果后自行回落到默认占位提示
 * （「搜索视频、番剧或up主」，由另一条 [Rewrite] mock 提供）。
 *
 * 简单可靠：不解压、不重写、字段变化免疫。
 */
$done({
  bodyBytes: new Uint8Array([0, 0, 0, 0, 0])   // flag=0, length=0
});
