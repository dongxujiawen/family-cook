/**
 * 二维码生成器（零依赖）
 * 用法：node make_qr.js <网址>
 * 例：  node make_qr.js https://family-order-h5.onrender.com
 * 生成的 点菜二维码.png 可直接发微信给老婆扫码打开。
 */
const https = require('https');
const fs = require('fs');

const url = process.argv[2];
if (!url) {
  console.error('用法：node make_qr.js <网址>');
  process.exit(1);
}

const api =
  'https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=' +
  encodeURIComponent(url);

https
  .get(api, (res) => {
    if (res.statusCode !== 200) {
      console.error('二维码服务返回错误：', res.statusCode);
      process.exit(1);
    }
    const file = fs.createWriteStream('点菜二维码.png');
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('✅ 已生成 点菜二维码.png  ->  ', url);
    });
  })
  .on('error', (e) => {
    console.error('生成失败：', e.message);
    process.exit(1);
  });
