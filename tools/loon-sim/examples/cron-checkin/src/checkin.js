// 签到示例: httpClient 调 API + 持久化签到状态 + 通知
const arg = $argument || {};
const last = $persistentStore.read('last_checkin');
console.log('[checkin] user=' + arg.username + ' | 上次签到: ' + (last || '无'));

$httpClient.post({ url: 'https://api.checkin.example.com/v1/sign', body: JSON.stringify({ user: arg.username }) }, (err, resp, body) => {
  if (err) { console.log('[checkin] 请求失败: ' + err.message); return $done(); }
  const r = JSON.parse(body || '{}');
  console.log('[checkin] 响应: ' + resp.status + ' days=' + r.data?.days);
  $persistentStore.write(String(r.data?.days || 0), 'last_checkin');
  if (arg.notify) $notification.post('签到成功', arg.username, '连续 ' + (r.data?.days || 0) + ' 天');
  $done();
});
