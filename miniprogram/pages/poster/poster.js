// pages/poster/poster.js：生成商品海报（canvas 2d）
// 用法：详情页点「生成海报」→ 跳本页 → 自动生成 → 保存到相册 / 转发
Page({
  data: {
    id: '',
    item: null,
    loading: true,
    generating: false,
    posterPath: ''    // 生成的临时图片路径
  },

  onLoad(options) {
    this.setData({ id: options.id || '' });
    this.loadDetail();
  },

  loadDetail() {
    wx.cloud.callFunction({
      name: 'getDetail',
      data: { id: this.data.id }
    }).then(res => {
      const data = (res.result && res.result.data) || null;
      this.setData({ item: data, loading: false });
      if (data) {
        wx.setNavigationBarTitle({ title: '生成海报' });
        // 等页面渲染完再画
        wx.nextTick(() => this.drawPoster());
      } else {
        wx.showToast({ title: '内容不存在或已下架', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
      }
    }).catch(() => {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    });
  },

  // 绘制海报
  drawPoster() {
    if (this.data.generating) return;
    this.setData({ generating: true });

    const query = wx.createSelectorQuery().in(this);
    query.select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        wx.showToast({ title: '画布初始化失败', icon: 'none' });
        this.setData({ generating: false });
        return;
      }
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio || 2;

      // 画布尺寸 600 x 800（逻辑像素）
      const W = 600, H = 800;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);

      const item = this.data.item;

      // 背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      // 顶部品牌条
      ctx.fillStyle = '#7C6BC0';
      ctx.fillRect(0, 0, W, 80);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('畅学尼龙 · 校园二手集市', 30, 50);

      // 商品图（上区域 600x420）
      const drawMain = () => {
        if (item.cover) {
          // 云存储 fileID 不能直接给 canvas 加载，先换成临时 https 链接
          wx.cloud.getTempFileURL({
            fileList: [item.cover]
          }).then(res => {
            const tmp = (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) || '';
            if (!tmp) { drawPlaceholder(); drawTexts(); return; }
            const img = canvas.createImage();
            img.onload = () => {
              // 等比裁剪居中显示图片（cover 模式）
              const cw = 600, ch = 420;
              const iw = img.width, ih = img.height;
              const scale = Math.max(cw / iw, ch / ih);
              const sw = cw / scale, sh = ch / scale;
              const sx = (iw - sw) / 2, sy = (ih - sh) / 2;
              ctx.drawImage(img, sx, sy, sw, sh, 0, 80, cw, ch);
              drawTexts();
            };
            img.onerror = () => { drawPlaceholder(); drawTexts(); };
            img.src = tmp;
          }).catch(() => { drawPlaceholder(); drawTexts(); });
        } else {
          drawPlaceholder();
          drawTexts();
        }
      };

      const drawPlaceholder = () => {
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 80, W, 420);
        ctx.fillStyle = '#bbb';
        ctx.font = '60px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('📄', W / 2, 320);
      };

      const drawTexts = () => {
        // 标题
        ctx.fillStyle = '#333';
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'left';
        // 两行截断
        const title = item.title || '';
        const line1 = title.slice(0, 14);
        const line2 = title.slice(14, 28);
        ctx.fillText(line1, 30, 560);
        if (line2) ctx.fillText(line2, 30, 600);

        // 价格
        ctx.fillStyle = '#C9971C';
        ctx.font = 'bold 40px sans-serif';
        let priceText = '';
        if (item.priceType === 'free') priceText = '免费';
        else if (item.priceType === 'bargain') priceText = '可议价';
        else priceText = '¥' + (item.price || 0);
        ctx.fillText(priceText, 30, 660);

        // 卖家昵称
        ctx.fillStyle = '#999';
        ctx.font = '24px sans-serif';
        ctx.fillText('来自卖家：' + (item.nickname || '同学'), 30, 700);

        // 右下角二维码占位（实际画码）
        drawQrcode();
      };

      const drawQrcode = () => {
        // 先生成小程序码（云函数），再画到海报右下角
        wx.cloud.callFunction({
          name: 'getQrcode',
          data: { id: this.data.id }
        }).then(res => {
          const r = res.result || {};
          if (!r.ok || !r.buffer) {
            drawQrcodeFallback();
            return;
          }
          const qrImg = canvas.createImage();
          qrImg.onload = () => {
            const size = 160;
            const x = W - 30 - size;
            const y = H - 30 - size;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(x - 10, y - 10, size + 20, size + 20);
            ctx.drawImage(qrImg, x, y, size, size);
            // 扫码提示
            ctx.fillStyle = '#999';
            ctx.font = '20px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('长按识别小程序码查看', W / 2, H - 70);
            finish();
          };
          qrImg.onerror = () => { drawQrcodeFallback(); };
          qrImg.src = `data:image/png;base64,${r.buffer}`;
        }).catch(() => drawQrcodeFallback());
      };

      const drawQrcodeFallback = () => {
        // 码生成失败：画个提示框替代
        ctx.fillStyle = '#f5f5f5';
        const size = 160;
        const x = W - 30 - size;
        const y = H - 30 - size;
        ctx.fillRect(x - 10, y - 10, size + 20, size + 20);
        ctx.fillStyle = '#999';
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('小程序码生成失败', x + size / 2, y + size / 2 - 10);
        ctx.fillText('去小程序里查看', x + size / 2, y + size / 2 + 20);
        finish();
      };

      const finish = () => {
        wx.canvasToTempFilePath({
          canvas,
          success: (r) => {
            this.setData({ posterPath: r.tempFilePath, generating: false });
          },
          fail: () => {
            wx.showToast({ title: '海报生成失败', icon: 'none' });
            this.setData({ generating: false });
          }
        });
      };

      drawMain();
    });
  },

  // 保存到相册
  savePoster() {
    if (!this.data.posterPath) return wx.showToast({ title: '海报还没生成好', icon: 'none' });
    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterPath,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: (err) => {
        if (err.errMsg.includes('auth deny') || err.errMsg.includes('auth denied')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中开启保存到相册的权限',
            confirmText: '去设置',
            success: (r) => { if (r.confirm) wx.openSetting(); }
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  },

  // 转发海报图片
  onShareAppMessage() {
    const item = this.data.item;
    return {
      title: item ? item.title : '畅学尼龙 - 看看这个',
      path: '/pages/detail/detail?id=' + this.data.id,
      imageUrl: this.data.posterPath || (item && item.cover) || '/images/share_default.png'
    };
  }
});