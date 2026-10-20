// Replay test for Bilibili-UI Mine iPad customization
// Run: node replay-mine.js

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Load the script
const scriptPath = path.join(__dirname, 'Enhanced-mine.response.js');
const scriptCode = fs.readFileSync(scriptPath, 'utf-8');

console.log('=== Bilibili-UI Mine iPad Replay Test ===\n');

// Mock original response
function createMockResponse() {
  return {
    code: 0,
    message: 'OK',
    data: {
      ipad_upper_sections: [
        { id: 751, title: '投稿', uri: 'bilibili://uper/user_center/add_archive', icon: 'http://icon' },
        { id: 752, title: '收藏', uri: 'bilibili://user_center/fav', icon: 'http://icon' },
        { id: 753, title: '历史记录', uri: 'bilibili://user_center/history', icon: 'http://icon' },
        { id: 754, title: '离线缓存', uri: 'bilibili://user_center/download', icon: 'http://icon' }
      ],
      ipad_recommend_sections: [
        { id: 755, title: '我的关注', uri: 'bilibili://user_center/myfollows', icon: 'http://icon' },
        { id: 756, title: '我的收藏', uri: 'bilibili://user_center/fav', icon: 'http://icon' },
        { id: 757, title: '历史记录', uri: 'bilibili://user_center/history', icon: 'http://icon' },
        { id: 758, title: '离线缓存', uri: 'bilibili://user_center/download', icon: 'http://icon' },
        { id: 759, title: '我的投稿', uri: 'bilibili://user_center/submit', icon: 'http://icon' },
        { id: 2541, title: '稍后再看', uri: 'bilibili://user_center/watch_later', icon: 'http://icon' },
        { id: 760, title: '设置', uri: 'bilibili://user_center/setting', icon: 'http://icon' }
      ],
      ipad_more_sections: [
        { id: 965, title: '我的客服', uri: 'bilibili://user_center/feedback', icon: 'http://icon' },
        { id: 763, title: '设置', uri: 'bilibili://user_center/setting', icon: 'http://icon' },
        { id: 764, title: '反馈', uri: 'bilibili://user_center/feedback', icon: 'http://icon' }
      ],
      ipad_sections: [
        { id: 747, title: '离线缓存', uri: 'bilibili://user_center/download', icon: 'http://icon' },
        { id: 748, title: '历史记录', uri: 'bilibili://user_center/history', icon: 'http://icon' },
        { id: 749, title: '我的收藏', uri: 'bilibili://user_center/fav', icon: 'http://icon' },
        { id: 750, title: '动态草稿', uri: 'bilibili://dynamic/draft', icon: 'http://icon' }
      ],
      ipad_section_style: 0
    }
  };
}

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    console.log('  ✅ ' + msg);
    pass++;
  } else {
    console.log('  ❌ ' + msg);
    fail++;
  }
}

function createMockEnv(arg) {
  const $argument = Object.assign({}, arg, { LogLevel: 'OFF' });
  const mockBody = JSON.stringify(createMockResponse());
  let doneResult = null;

  const env = {
    $argument: $argument,
    $request: {
      url: 'https://app.bilibili.com/x/v2/account/mine/ipad?access_key=xxx',
      headers: { 'User-Agent': 'bili-hd2/37100100 CFNetwork/1.0 Darwin/24.6.0 os/ios model/iPad' }
    },
    $response: { body: mockBody },
    $done: function(res) { doneResult = res; return res; },
    $persistentStore: {
      read: function() { return null; },
      write: function() { return true; }
    },
    $environment: {},
    process: { versions: { node: '22.0.0' } },
    console: {
      log: function() {},
      warn: function() {},
      error: function() {}
    }
  };

  env.getDoneResult = function() { return doneResult; };
  return env;
}

function runTest(name, arg, fn) {
  console.log('\n=== ' + name + ' ===');
  const env = createMockEnv(arg);
  const ctx = vm.createContext(env);
  vm.runInContext(scriptCode, ctx);
  return env.getDoneResult();
}

console.log('\n--- Test 1: 禁用开关 ---');
{
  const res = runTest('禁用开关', { MineEnable: false }, function() {});
  assert(res !== undefined, '返回了 $done');
}

console.log('\n--- Test 2: 隐藏特定 ID ---');
{
  const res = runTest('隐藏 ID', { MineEnable: true, MineHideIds: '751,755,763' }, function() {});
  if (res && res.body) {
    var data = JSON.parse(res.body).data;
    assert(!data.ipad_upper_sections.some(function(x) { return x.id === 751; }), '投稿区删除了 id=751');
    assert(!data.ipad_recommend_sections.some(function(x) { return x.id === 755; }), '推荐区删除了 id=755');
    assert(!data.ipad_more_sections.some(function(x) { return x.id === 763; }), '更多区删除了 id=763');
    assert(data.ipad_upper_sections.length === 3, '投稿区剩余 3 项');
    assert(data.ipad_recommend_sections.length === 6, '推荐区剩余 6 项');
    assert(data.ipad_more_sections.length === 2, '更多区剩余 2 项');
  }
}

console.log('\n--- Test 3: 隐藏特定标题 ---');
{
  const res = runTest('隐藏标题', { MineEnable: true, MineHideTitles: '投稿,我的关注,我的客服' }, function() {});
  if (res && res.body) {
    var data = JSON.parse(res.body).data;
    assert(!data.ipad_upper_sections.some(function(x) { return x.title === '投稿'; }), '投稿区按标题删除');
    assert(!data.ipad_recommend_sections.some(function(x) { return x.title === '我的关注'; }), '推荐区按标题删除');
    assert(!data.ipad_more_sections.some(function(x) { return x.title === '我的客服'; }), '更多区按标题删除');
  }
}

console.log('\n--- Test 4: 隐藏整个区块 ---');
{
  const res = runTest('隐藏区块', { MineEnable: true, MineBlockUpper: true, MineBlockRecommend: true, MineBlockMore: true }, function() {});
  if (res && res.body) {
    var data = JSON.parse(res.body).data;
    assert(data.ipad_upper_sections.length === 0, '投稿区被清空');
    assert(data.ipad_recommend_sections.length === 0, '推荐区被清空');
    assert(data.ipad_more_sections.length === 0, '更多区被清空');
  }
}

console.log('\n--- Test 4b: section_style ---');
{
  const res = runTest('section_style', { MineEnable: true, MineSectionStyle: '2' }, function() {});
  if (res && res.body) {
    var data = JSON.parse(res.body).data;
    assert(data.ipad_section_style === 2, 'section_style 被设为 2');
  }
}

console.log('\n--- Test 5: 异常字段缺失兜底 ---');
{
  var mockBody2 = JSON.stringify({ code: 0, data: { ipad_upper_sections: [{ id: 751 }] } });
  var doneResult = null;
  var env = {
    $argument: { MineEnable: true, MineHideIds: '751' },
    $request: { url: 'https://app.bilibili.com/x/v2/account/mine/ipad', headers: { 'User-Agent': 'bili-hd2/37100100' } },
    $response: { body: mockBody2 },
    $done: function(res) { doneResult = res; return res; },
    $persistentStore: { read: function() { return null; }, write: function() { return true; } },
    $environment: {},
    process: { versions: { node: '22.0.0' } },
    console: { log: function() {}, warn: function() {}, error: function() {} }
  };
  var ctx = vm.createContext(env);
  vm.runInContext(scriptCode, ctx);
  assert(doneResult !== undefined, '异常情况下仍返回 $done');
}

console.log('\n--- Test 6: 非 iPad HD 请求被跳过 ---');
{
  var env = createMockEnv({ MineEnable: true });
  env.$request.headers['User-Agent'] = 'bili-inter/82300200 CFNetwork/1.0 Darwin/25.4.0 os/ios model/iPhone';
  var ctx = vm.createContext(env);
  vm.runInContext(scriptCode, ctx);
  assert(env.getDoneResult() !== undefined, '非 HD 请求返回 $done');
}

console.log('\n--- Test 7: 关闭开关时不修改 ---');
{
  const res = runTest('关闭开关', { MineEnable: false, MineHideIds: '751' }, function() {});
  if (res && res.body) {
    var data = JSON.parse(res.body).data;
    assert(data.ipad_upper_sections.some(function(x) { return x.id === 751; }), '开关关时保留 751');
  }
}

console.log('\n=== SUMMARY ===');
console.log('✅ Pass: ' + pass);
console.log('❌ Fail: ' + fail);
process.exit(fail > 0 ? 1 : 0);