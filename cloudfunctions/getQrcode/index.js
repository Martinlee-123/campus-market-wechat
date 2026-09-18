// 云函数 getQrcode：生成带参数的小程序码（海报分享用）
// 用 wxacode.getUnlimited 生成，scene 传商品 id
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { id } = event;
  if (!id) return { ok: false, msg: '缺少商品id' };

  try {
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: 'id=' + id,          // 最大32字符
      page: 'pages/detail/detail', // 落地页（必须是已发布页面）
      checkPath: false,
      width: 430,
      envVersion: 'release'       // 正式版
    });
    // result.buffer 是图片二进制
    return {
      ok: true,
      contentType: result.contentType,
      buffer: result.buffer.toString('base64')  // 云函数返回二进制需转 base64
    };
  } catch (e) {
    return { ok: false, msg: '生成失败: ' + e.message };
  }
};