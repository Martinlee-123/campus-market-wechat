// _shared/sec.js —— 内容安全检测公共模块（方案A：本地DFA词库 + 微信msgSecCheck）
// 供 publish / want / chat 等云函数复用。用法：
//   const sec = require('./sec');
//   const r = await sec.checkText(cloud, openid, '要检测的文本', { scene: 2, title: '' });
//   if (!r.ok) return { ok: false, msg: r.msg };   // ok=false 表示违规
//   sec.checkImagesAsync(cloud, openid, [fileID...], { scene: 3, target: 'goods', targetId: id })
//     .catch(() => {}); // 图片异步检测，fire-and-forget，结果由定时任务/手动核验处理
//
// 词库：同目录的 keywords.json（由 tools/build_keywords.py 生成）
//   - 若该文件缺失，回退到内置的少量核心词，保证不崩。
//   - 词库来源：konsheng/Sensitive-lexicon (MIT)，方案A精选清洗
//     （色情/违法涉枪爆恐/诈骗赌博/非法网址样本/广告清洗），不含政治类。

const MAX_TEXT_LEN = 2500; // msgSecCheck 文本上限
const path = require('path');
const fs = require('fs');

// ============ 内置兜底核心词（keywords.json 缺失时使用） ============
const FALLBACK_WORDS = [
  '博彩', '赌博', '赌场', '下注', '百家乐', '六合彩', '时时彩', '代开',
  '洗钱', '跑分', '刷单', '套现', '办证', '代考', '替考', '代写论文',
  '约炮', '一夜情', '裸聊', '色情', '黄片', '招嫖', '援交', '特殊服务',
  '枪支', '弹药', '毒品', '冰毒', '大麻', '海洛因', '迷药', '炸药', '雷管',
  '仿真枪', '假币', '假证', '刻章', '处方药', '壮阳', '传销', '资金盘',
  '杀猪盘', '诈骗', '高薪兼职', '日入过万'
];

// ============ 敏感词库加载 + DFA 构建 ============
let DFA = null;
let WORD_COUNT = 0;

function loadWords() {
  // 优先读同目录 keywords.json
  try {
    const p = path.join(__dirname, 'keywords.json');
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      const obj = JSON.parse(raw);
      const arr = Array.isArray(obj) ? obj : (obj && obj.words) || [];
      if (arr.length) return arr;
    }
  } catch (e) {
    console.error('[sec] 读取 keywords.json 失败，回退内置词库:', e.message);
  }
  return FALLBACK_WORDS;
}

// 构建 DFA 树（一次加载后常驻容器内存）
function buildDFA(words) {
  const root = Object.create(null);
  let n = 0;
  for (const raw of words) {
    const w = String(raw || '').trim().toLowerCase();
    if (!w) continue;
    let node = root;
    for (const ch of w) {
      if (!node[ch]) node[ch] = Object.create(null);
      node = node[ch];
    }
    node.isEnd = true;
    n++;
  }
  WORD_COUNT = n;
  return root;
}

function getDFA() {
  if (!DFA) {
    DFA = buildDFA(loadWords());
    console.log(`[sec] 本地敏感词库已加载：${WORD_COUNT} 词`);
  }
  return DFA;
}

// 文本紧凑化：去除常见分隔干扰（“博 彩”/“博-彩”/“博＊彩”也能命中）
function compact(s) {
  return String(s || '').replace(/[\s\-_*\.·、，,。;；:：!！?？~|/\\]+/g, '');
}

// DFA 匹配：返回第一个命中的敏感词，无命中返回 ''
function matchDFA(tree, text) {
  const s = String(text || '').toLowerCase();
  const len = s.length;
  for (let i = 0; i < len; i++) {
    let node = tree;
    let j = i;
    let lastHit = '';
    while (j < len && node[s[j]]) {
      node = node[s[j]];
      if (node.isEnd) lastHit = s.slice(i, j + 1);
      j++;
    }
    if (lastHit) return lastHit;
  }
  return '';
}

// 命中本地敏感词返回命中的词，否则返回空串
function hitLocalBadWord(text) {
  const s = String(text || '');
  if (!s) return '';
  const tree = getDFA();
  // 原文 + 紧凑化文本都过一遍
  return matchDFA(tree, s) || matchDFA(tree, compact(s)) || '';
}

// ============ 文本检测 ============
// 文本检测（v2）。scene: 1资料 2评论 3论坛 4社交日志
// 返回 { ok: true } 通过；{ ok: false, msg } 违规/失败。
async function checkText(cloud, openid, text, opts = {}) {
  const scene = opts.scene || 3;          // 默认 论坛
  const content = String(text || '').trim();
  if (!content) return { ok: true };

  // ① 先过本地 DFA 词库（快、离线、必拦）
  const hit = hitLocalBadWord(content);
  if (hit) {
    console.warn('[sec.checkText] 命中本地敏感词:', hit);
    return { ok: false, msg: '内容包含违规信息，请修改后重试', local: hit };
  }

  // ② 再调微信内容安全接口（语义检测）
  try {
    const payload = {
      version: 2,
      scene,
      openid,
      content: content.slice(0, MAX_TEXT_LEN)
    };
    if (opts.title) payload.title = String(opts.title).slice(0, 2500);
    if (opts.nickname) payload.nickname = String(opts.nickname).slice(0, 2500);

    const res = await cloud.openapi.security.msgSecCheck(payload);
    const suggest = res && res.result && res.result.suggest;
    if (suggest === 'pass') return { ok: true };
    if (suggest === 'risky') return { ok: false, msg: '内容包含违规信息，请修改后重试' };
    // review（需人工复审）：放行但记录，配合举报兜底
    return { ok: true, review: true };
  } catch (e) {
    console.error('[sec.checkText] 检测异常:', e.errCode || e, e.errMsg || e.message);
    // 接口不可用（如 -604101 权限未开放）：默认放行，避免“全员发布失败”。
    // 本地 DFA 词库仍在上一步拦基础违规。如需恢复“接口不可用也拦截”，调用处传 blockOnError:true。
    if (opts.blockOnError === true) return { ok: false, msg: '内容安全检测暂不可用，请稍后重试' };
    return { ok: true, warn: true };
  }
}

// 把云存储 fileID 转成可被检测服务器下载的 https 链接
function toHttpsUrl(cloud, fileID) {
  if (!fileID) return '';
  if (fileID.startsWith('http://') || fileID.startsWith('https://')) return fileID;
  try {
    return cloud.getTempFileURL({ fileList: [fileID] })
      .then(r => (r.fileList && r.fileList[0] && r.fileList[0].tempFileURL) || '')
      .catch(() => '');
  } catch (e) {
    return '';
  }
}

// 图片异步检测（v2，mediaCheckAsync）。结果 30 分钟内异步推送，本函数不等待。
// 推送拿到 result.suggest: risky/review/pass，需在消息接收服务器里处理
// （或由人工在 admin 后台核验）。这里只负责“发起检测”。
async function checkImagesAsync(cloud, openid, fileIDs, opts = {}) {
  const scene = opts.scene || 3;
  const list = (Array.isArray(fileIDs) ? fileIDs : []).slice(0, 9);
  if (!list.length) return;
  for (const fid of list) {
    try {
      const mediaUrl = await toHttpsUrl(cloud, fid);
      if (!mediaUrl) continue;
      await cloud.openapi.security.mediaCheckAsync({
        mediaType: 2,      // 图片
        version: 2,
        scene,
        openid,
        media_url: mediaUrl
      });
    } catch (e) {
      console.error('[sec.checkImagesAsync] 检测异常:', e.errCode || e, e.errMsg || e.message);
    }
  }
}

module.exports = { checkText, checkImagesAsync, toHttpsUrl, hitLocalBadWord };
