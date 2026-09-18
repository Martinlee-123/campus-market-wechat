// _shared/sec.js —— 内容安全检测公共模块
// 供 publish / want / chat 等云函数复用。用法：
//   const sec = require('./sec');
//   const r = await sec.checkText(cloud, openid, '要检测的文本', { scene: 2, title: '' });
//   if (!r.ok) return { ok: false, msg: r.msg };   // ok=false 表示违规或检测失败(默认拦截)
//   sec.checkImagesAsync(cloud, openid, [fileID...], { scene: 3, target: 'goods', targetId: id })
//     .catch(() => {}); // 图片异步检测，fire-and-forget，结果由定时任务/手动核验处理

const MAX_TEXT_LEN = 2500; // msgSecCheck 文本上限

// 文本检测（v2）。scene: 1资料 2评论 3论坛 4社交日志
// 返回 { ok: true } 通过；{ ok: false, msg } 违规/失败。
// strict=false 时，检测失败（接口异常）不拦截，仅记录，避免误伤正常用户。
async function checkText(cloud, openid, text, opts = {}) {
  const scene = opts.scene || 3;          // 默认 论坛
  const strict = opts.strict !== false;   // 默认严格：检测失败也拦截
  const content = String(text || '').trim();
  if (!content) return { ok: true };

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
    if (strict) return { ok: false, msg: '内容安全检测暂不可用，请稍后重试' };
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

module.exports = { checkText, checkImagesAsync, toHttpsUrl };