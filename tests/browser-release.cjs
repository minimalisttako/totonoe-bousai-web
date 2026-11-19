const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.TOTO_PLAYWRIGHT_PATH || 'playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

async function run() {
 const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
   res.writeHead(404).end();
   return;
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' });
  fs.createReadStream(filename).pipe(res);
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const base = 'http://127.0.0.1:' + server.address().port + '/';
 let browser;
 try {
  browser = await chromium.launch({ executablePath: process.env.TOTO_CHROMIUM_PATH || undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', isMobile: true, hasTouch: true });
  await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(base + '?page=backup');
  await page.locator('#fullBackupDialog[open] #fullBackupFile').waitFor();
  assert.equal(await page.locator('#stockGateDialog[open]').count(), 0);
  await page.locator('#fullBackupDialog form[method="dialog"] button').click();
  await page.locator('#supplies #supplyBackupFold').waitFor({ state: 'attached' });

  await page.goto(base + '?page=evacuationVideos');
  await page.locator('#evacuationPreview[open]').getByText('自宅が安全なら、在宅避難を').waitFor();
  assert.equal(await page.locator('#evacuationPreview a[href*="youtu.be"]').count(), 0);

  await page.evaluate(() => {
   localStorage.setItem('toto-tutorial-v1', JSON.stringify({ version: 1, step: 3, completed: true }));
   localStorage.setItem('toto-weather-location-v1', JSON.stringify({
    office: '400000', area: '400010', station: '', warningCity: '4013000'
   }));
   localStorage.setItem('totonoe-hazard-confirmed', '4013000');
  });
  await page.goto(base + '?page=evacuation');
  await page.locator('#evacuationFirstGuide').waitFor();
  await page.locator('#evacuationEditButton').click();
  assert.equal(await page.locator('#evacuationFirstGuide').isVisible(), false);
  await page.locator('#evPlace').waitFor();
  await page.reload();
  assert.equal(await page.locator('#evacuationFirstGuide').isVisible(), false);

  await page.evaluate(() => {
   localStorage.setItem('toto-evacuation-plan-v1', JSON.stringify({
    evHazard: '確認済み', evPlace: '集会所', evRoute: '大通り', evTiming: '家族で確認',
    evContacts: '電話', evMeeting: '集会所'
   }));
   localStorage.setItem('toto-home-safety-v1', JSON.stringify({ sleep: 'done', bedpath: 'done', door: 'done', hall: 'done', fix: 'done' }));
   localStorage.setItem('toto-tidy-defaults-v2', 'true');
   localStorage.setItem('toto-tidy-v1', JSON.stringify([
    { id: '1', place: '寝室', done: true }, { id: '2', place: '玄関', done: false }
   ]));
  });
  await page.goto(base + '?page=goBag');
  await page.locator('#stockGateDialog[open]').waitFor();
  assert.equal(await page.locator('#goBag').isVisible(), false);
  await page.evaluate(() => {
   const key = 'toto-tidy-v1';
   const rooms = JSON.parse(localStorage.getItem(key));
   rooms[1].done = true;
   localStorage.setItem(key, JSON.stringify(rooms));
  });
  await page.reload();
  await page.locator('#goBagName').waitFor();
  await page.goto(base + '?page=evacuationVideos');
  await page.locator('#evacuationVideos a[href*="youtu.be"]').first().waitFor();
  assert.equal(await page.locator('#evacuationVideos a[href*="youtu.be"]:visible').count(), 4);
  await page.goto(base + '?page=reviewBackup');
  await page.locator('#reviewBackupFile').waitFor();
  const reviewFile = {
   name: 'toto-test-reviews.json',
   mimeType: 'application/json',
   buffer: Buffer.from(JSON.stringify({
    format: 'toto-local-review-backup-v1',
    reviews: [{ name: 'テスト用の水', category: '水', comment: '復元確認', stars: 4, photos: [], used: true }]
   }))
  };
  const reviewStatus = page.locator('#reviewBackupStatus');
  await page.locator('#reviewBackupFile').setInputFiles(reviewFile);
  await page.locator('#reviewBackupImport').click();
  await reviewStatus.getByText('1件を追加しました。重複 0件。').waitFor();
  await page.locator('#reviewBackupFile').setInputFiles(reviewFile);
  await page.locator('#reviewBackupImport').click();
  await reviewStatus.getByText('0件を追加しました。重複 1件。').waitFor();
  await page.goto(base + '?page=reviews');
  await page.locator('#reviewFormFold summary').click();
  const samplePhoto = await page.evaluate(() => {
   const canvas = document.createElement('canvas');
   canvas.width = 1280;
   canvas.height = 960;
   const ctx = canvas.getContext('2d');
   const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
   gradient.addColorStop(0, '#9b593d');
   gradient.addColorStop(1, '#f5d77e');
   ctx.fillStyle = gradient;
   ctx.fillRect(0, 0, canvas.width, canvas.height);
   return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#reviewPhotoInput').setInputFiles({
   name: 'test-photo.png', mimeType: 'image/png', buffer: Buffer.from(samplePhoto, 'base64')
  });
  await page.locator('#reviewFormStatus').getByText('写真 1/3枚を準備しました。').waitFor();
  const photo = await page.locator('#reviewPhotoPreview img').evaluate(async img => {
   await img.decode();
   return { width: img.naturalWidth, height: img.naturalHeight, src: img.src };
  });
  assert.equal(Math.max(photo.width, photo.height), 480);
  assert.ok(photo.src.length <= 60000);
  await page.locator('#reviewProduct').fill('写真付きのテスト用ランタン');
  await page.locator('#reviewStars').selectOption('4');
  await page.locator('#reviewComment').fill('写真付きバックアップの確認');
  await page.locator('#reviewUsed').check();
  await page.locator('#reviewSave').click();
  await page.locator('#reviewList summary').getByText('写真付きのテスト用ランタン').waitFor();
  const savedReview = page.locator('#reviewList details').filter({ hasText: '写真付きのテスト用ランタン' });
  await savedReview.locator('summary').click();
  await savedReview.getByRole('button', { name: 'このレビューを公開申請する' }).click();
  await page.locator('#sharedReviewLogin[open] #reviewGoogleLogin').waitFor();
  assert.equal(await page.locator('#reviewGoogleLogin').evaluate(el => el === document.activeElement), true);
  await page.evaluate(() => sessionStorage.setItem('totonoe-review-session', 'test-session'));
  let submittedReview;
  await context.route('https://*.supabase.co/rest/v1/rpc/submit_stock_review', async route => {
   submittedReview = route.request().postDataJSON();
   await route.fulfill({ json: 'test-review', headers: { 'access-control-allow-origin': '*' } });
  });
  await page.reload();
  await savedReview.locator('summary').click();
  page.once('dialog', dialog => dialog.accept());
  await savedReview.getByRole('button', { name: 'このレビューを公開申請する' }).click();
  await savedReview.getByRole('status').getByText('公開申請を受け付けました。').waitFor();
  assert.deepEqual(submittedReview, {
   p_name: '写真付きのテスト用ランタン', p_category: 'その他', p_comment: '写真付きバックアップの確認',
   p_stars: 4, p_photos: [photo.src], p_used: true
  });
  let rejectSubmission = true;
  await context.route('https://*.supabase.co/rest/v1/rpc/submit_stock_review', route =>
   route.fulfill({ status: rejectSubmission ? 500 : 200, json: 'test-direct-review',
    headers: { 'access-control-allow-origin': '*' } }));
  if(!await page.locator('#reviewProduct').isVisible())await page.locator('#reviewFormFold summary').click();
  await page.locator('#reviewProduct').fill('公開申請から保存するレビュー');
  await page.locator('#reviewStars').selectOption('5');
  await page.locator('#reviewComment').fill('申請失敗後も端末に残す');
  await page.locator('#reviewUsed').check();
  await page.locator('#reviewPhotoInput').setInputFiles({
   name: 'test-photo.png', mimeType: 'image/png', buffer: Buffer.from(samplePhoto, 'base64')
  });
  await page.locator('#reviewFormStatus').getByText('写真 1/3枚を準備しました。').waitFor();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reviewShare').click();
  await page.locator('#reviewFormStatus').getByText('公開申請できませんでした。', { exact: false }).waitFor();
  const directReview = page.locator('#reviewList details').filter({ hasText: '公開申請から保存するレビュー' });
  await directReview.locator('summary').waitFor();
  assert.equal(await page.locator('#reviewProduct').inputValue(), '公開申請から保存するレビュー');
  rejectSubmission = false;
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reviewShare').click();
  await page.locator('#reviewFormStatus').getByText('公開申請を受け付けました。', { exact: false }).waitFor();
  assert.equal(await page.locator('#reviewList details').count(), 3);
  await page.locator('#reviewSignOut').click();
  await page.reload();
  await directReview.locator('summary').click();
  assert.equal(await directReview.locator('img').getAttribute('src'), photo.src);
  assert.equal(await page.locator('#reviewList details').count(), 3);
  console.log('PASS: direct submission keeps photos locally after failure, retry, sign-out and reload without duplicates');
  await page.getByRole('link', { name: 'レビューと写真のバックアップ' }).click();
  const [download] = await Promise.all([
   page.waitForEvent('download'),
   page.locator('#reviewBackupSave').click()
  ]);
  const backupPath = await download.path();
  const exported = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert.deepEqual(exported.reviews.find(review => review.name === '写真付きのテスト用ランタン').photos, [photo.src]);
  const restoreContext = await browser.newContext();
  const restorePage = await restoreContext.newPage();
  await restoreContext.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
  await restorePage.goto(base + '?page=reviewBackup');
  await restorePage.locator('#reviewBackupFile').setInputFiles({
   name: 'review-backup.json', mimeType: 'application/json', buffer: fs.readFileSync(backupPath)
  });
  await restorePage.locator('#reviewBackupImport').click();
  await restorePage.locator('#reviewBackupStatus').getByText('3件を追加しました。重複 0件。').waitFor();
  await restorePage.locator('#reviewPasteFold summary').click();
  const recovered = { ...exported.reviews.find(review => review.photos.length), name: 'たまごっち', comment: 'びっちりばっちりたまごっち', stars: 5 };
  await restorePage.locator('#reviewBackupText').fill(JSON.stringify([recovered]));
  await restorePage.locator('#reviewBackupPaste').click();
  await restorePage.locator('#reviewBackupStatus').getByText('1件を追加しました。重複 0件。').waitFor();
  await restorePage.locator('#reviewBackupText').fill(JSON.stringify([recovered]));
  await restorePage.locator('#reviewBackupPaste').click();
  await restorePage.locator('#reviewBackupStatus').getByText('0件を追加しました。重複 1件。').waitFor();
  await restorePage.locator('#reviewBackupText').fill('[{"name":"invalid"}]');
  await restorePage.locator('#reviewBackupPaste').click();
  await restorePage.locator('#reviewBackupStatus').getByText('レビューのバックアップ形式を確認できませんでした。').waitFor();
  assert.equal(await restorePage.locator('#reviewBackupText').inputValue(), '[{"name":"invalid"}]');
  await restorePage.evaluate(() => {
   localStorage.setItem('toto-tutorial-v1', JSON.stringify({ version: 1, step: 3, completed: true }));
   localStorage.setItem('toto-weather-location-v1', JSON.stringify({ office: '400000', area: '400010', station: '', warningCity: '4013000' }));
   localStorage.setItem('totonoe-hazard-confirmed', '4013000');
  });
  await restorePage.goto(base + '?page=reviews');
  const recoveredCard = restorePage.locator('#reviewList details').filter({ hasText: 'たまごっち' });
  await recoveredCard.locator('summary').click();
  assert.equal(await recoveredCard.locator('img').getAttribute('src'), recovered.photos[0]);
  await recoveredCard.getByText('びっちりばっちりたまごっち').waitFor();
  assert.equal(await restorePage.locator('#reviewList details').count(), 4);
  console.log('PASS: pasted SQL review export restores photos, merges duplicates and rejects invalid input');
  await restoreContext.close();
  console.log('PASS: review photo compression, local save, download and restore in a fresh browser context');
  assert.deepEqual(errors, []);
  console.log('PASS: browser startup, pre-setup backup, first-use guide, room gate, evacuation links and review deduplication');
  await context.close();

  const offlineContext = await browser.newContext();
  const offlinePage = await offlineContext.newPage();
  await offlinePage.goto(base);
  // Local loopback supports service workers, but the app starts its installer only on HTTPS.
  await offlinePage.evaluate(() => navigator.serviceWorker.register('./offline-worker.js').then(() => null));
  await offlinePage.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 20000 });
  await offlineContext.setOffline(true);
  await offlinePage.reload();
  await offlinePage.locator('#home').waitFor();
  assert.equal(await offlinePage.locator('#gameDialogueText').textContent() === '', false);
  await offlinePage.locator('#tutorialDialog[open]').getByRole('button', { name: '災害時モードをすぐ開く' }).click();
  await offlinePage.locator('#emergency').waitFor();
  console.log('PASS: offline restart and access to disaster mode before initial setup');
  await offlineContext.close();
 } finally {
  await browser?.close();
  server.close();
 }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
