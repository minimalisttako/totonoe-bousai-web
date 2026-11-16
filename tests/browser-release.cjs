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
  await restorePage.locator('#reviewBackupStatus').getByText('2件を追加しました。重複 0件。').waitFor();
  await restoreContext.close();
  console.log('PASS: review photo compression, local save, download and restore in a fresh browser context');
  assert.deepEqual(errors, []);
  console.log('PASS: browser startup, pre-setup backup, first-use guide, room gate, evacuation links and review deduplication');
  await context.close();

  const reviewContext = await browser.newContext({ serviceWorkers: 'block' });
  let posted;
  let published = false;
  let votes = 0;
  const reviewId = 'mock-review-id';
  await reviewContext.addInitScript(() => {
   localStorage.setItem('toto-tutorial-v1', JSON.stringify({ version: 1, step: 3, completed: true }));
   localStorage.setItem('toto-weather-location-v1', JSON.stringify({ office: '400000', area: '400010', station: '', warningCity: '4013000' }));
   localStorage.setItem('totonoe-hazard-confirmed', '4013000');
   if (location.search.includes('code=')) sessionStorage.setItem('totonoe-review-oauth-verifier', 'mock-verifier');
  });
  await reviewContext.route('**/*', async route => {
   const request = route.request();
   const url = new URL(request.url());
   if (request.url().startsWith(base)) return route.continue();
   if (!url.hostname.endsWith('.supabase.co')) return route.abort();
   const cors = {
    'access-control-allow-origin': new URL(base).origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'apikey, authorization, content-type'
   };
   if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
   const respond = json => route.fulfill({ json, headers: cors });
   const body = request.postDataJSON();
   const headers = await request.allHeaders();
   if (url.pathname === '/auth/v1/token') {
    assert.deepEqual(body, { auth_code: 'mock-code', code_verifier: 'mock-verifier' });
    return respond({ access_token: 'mock-session' });
   }
   if (url.pathname.endsWith('/submit_stock_review')) {
    assert.equal(headers.authorization, 'Bearer mock-session');
    posted = body;
    return respond(reviewId);
   }
   if (url.pathname.endsWith('/list_stock_reviews')) {
    return respond(published ? [{
     id: reviewId, name: posted.p_name, category: posted.p_category, stars: posted.p_stars,
     helpful: votes, photo_count: 0, voted: Boolean(votes && headers.authorization)
    }] : []);
   }
   if (url.pathname.endsWith('/read_stock_review')) {
    assert.equal(body.p_review, reviewId);
    return respond([{ comment: posted.p_comment, photos: [] }]);
   }
   if (url.pathname.endsWith('/set_stock_review_helpful')) {
    assert.equal(headers.authorization, 'Bearer mock-session');
    votes = body.p_vote ? 1 : 0;
    return respond([{ helpful: votes, voted: Boolean(votes) }]);
   }
   return route.abort();
  });
  const shared = await reviewContext.newPage();
  shared.on('dialog', dialog => dialog.accept());
  await shared.goto(base + '?code=mock-code');
  await shared.locator('#reviewSignOut').waitFor();
  assert.equal(new URL(shared.url()).searchParams.has('code'), false);
  await shared.locator('#reviewFormFold summary').click();
  await shared.locator('#reviewProduct').fill('公開申請テスト');
  await shared.locator('#reviewCategory').selectOption('水');
  await shared.locator('#reviewStars').selectOption('4');
  await shared.locator('#reviewComment').fill('テスト用の感想');
  await shared.locator('#reviewUsed').check();
  await shared.locator('#reviewShare').click();
  await shared.locator('#reviewFormStatus').getByText('公開申請を受け付けました。').waitFor();
  assert.deepEqual(posted, { p_name: '公開申請テスト', p_category: '水', p_comment: 'テスト用の感想', p_stars: 4, p_photos: [], p_used: true });
  assert.equal(await shared.locator('#sharedReviewList summary').count(), 0);
  published = true;
  await shared.reload();
  await shared.locator('#sharedReviewList summary').getByText('公開申請テスト').click();
  const vote = shared.getByRole('button', { name: '👍 役に立った', exact: true });
  await vote.click();
  await shared.getByRole('button', { name: '👍 役に立ったを取り消す', exact: true }).click();
  await vote.waitFor();
  assert.equal(votes, 0);
  published = false;
  await shared.reload();
  await shared.locator('#sharedReviewStatus').getByText('公開されたレビューはありません。').waitFor();
  await shared.locator('#reviewSignOut').click();
  await shared.locator('#sharedReviewLogin').waitFor();
  await reviewContext.close();
  console.log('PASS: simulated OAuth callback, public review request, moderation visibility, vote and sign-out');

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
