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
  assert.deepEqual(errors, []);
  console.log('PASS: browser startup, pre-setup backup, first-use guide, room gate and evacuation links');
  await context.close();
 } finally {
  await browser?.close();
  server.close();
 }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
