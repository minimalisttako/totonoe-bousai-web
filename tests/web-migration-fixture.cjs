const path = require('node:path');
const { chromium } = require(process.env.TOTO_PLAYWRIGHT_PATH || 'playwright');

async function exportWebBackup() {
 const browser = await chromium.launch({ executablePath: process.env.TOTO_CHROMIUM_PATH || undefined });
 try {
  const page = await browser.newPage();
  const url = 'http://localhost:19434/';
  await page.route('**/*', route => route.request().url() === url
   ? route.fulfill({ path: path.resolve(__dirname, '../index.html'), contentType: 'text/html' })
   : route.abort());
  await page.goto(url);
  return await page.evaluate(() => {
   const canvas = document.createElement('canvas');
   canvas.width = canvas.height = 16;
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = 'salmon';
   ctx.fillRect(0, 0, 16, 16);
   const photo = canvas.toDataURL('image/jpeg');
   const rooms = [{ id: 'migration', place: '移行テスト用の玄関', beforePhoto: photo, afterPhoto: photo }];
   localStorage.setItem(tidyKey, JSON.stringify(rooms));
   localStorage.setItem(key, JSON.stringify([{ name: '移行テスト用の水', qty: '2', category: 'water' }]));
   return { full: buildFullBackup(), photo };
  });
 } finally {
  await browser.close();
 }
}

module.exports = exportWebBackup;
