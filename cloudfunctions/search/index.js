// 云函数 search：搜索辅助
//  action='log' → 记录一次真实搜索（用于热门词聚合），fire-and-forget 不阻塞
//  action='hot' → 返回近期热门搜索词（近30天按关键词聚合 TOP10，按次数降序）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

const HOT_LIMIT = 10;      // 返回热门词数量
const HOT_DAYS = 30;       // 聚合窗口（天）
const MAX_WORD_LEN = 30;   // 关键词长度上限，防脏数据

exports.main = async (event, context) => {
  const action = event.action || 'hot';

  // ---- 记录一次搜索 ----
  if (action === 'log') {
    const keyword = (event.keyword || '').trim().slice(0, MAX_WORD_LEN);
    if (!keyword) return { ok: true };
    const wxContext = cloud.getWXContext();
    try {
      await db.collection('searchLogs').add({
        data: {
          keyword,
          _openid: wxContext.OPENID,
          createdAt: db.serverDate()
        }
      });
    } catch (e) { /* 记录失败不影响主流程 */ }
    return { ok: true };
  }

  // ---- 返回热门词 ----
  if (action === 'hot') {
    try {
      const since = new Date(Date.now() - HOT_DAYS * 24 * 3600 * 1000);
      const agg = await db.collection('searchLogs')
        .aggregate()
        .match({ createdAt: _.gte(since) })
        .group({
          _id: '$keyword',
          count: $.sum(1)
        })
        .sort({ count: -1, _id: 1 })
        .limit(HOT_LIMIT)
        .end();
      const words = (agg.list || []).map(x => x._id).filter(Boolean);
      return { ok: true, data: words };
    } catch (e) {
      return { ok: false, data: [] };
    }
  }

  return { ok: false, msg: '未知 action' };
};
