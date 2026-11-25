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
  await require('./usability-browser.cjs')(browser,base);
  await require('./experience-browser.cjs')(browser,base);
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
  await page.evaluate(()=>localStorage.setItem('toto-home-safety-v1',JSON.stringify({ sleep:'needs',bedpath:'done',door:'done',hall:'done',fix:'done' })));
  await page.goto(base + '?page=goBag');
  await page.locator('#stockGateDialog[open]').waitFor();
  assert.equal(await page.locator('#goBag').isVisible(), false);
  await page.evaluate(() => {
   const key = 'toto-tidy-v1';
   const rooms = JSON.parse(localStorage.getItem(key));
   localStorage.setItem('toto-home-safety-v1', JSON.stringify({sleep:'done',bedpath:'done',door:'done',hall:'done',fix:'done'}));
  });
  await page.reload();
  await page.locator('#goBagName').waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-tidy-v1'))[1].done),false);
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
  await page.evaluate(()=>localStorage.removeItem('toto-first-operation-guides-v1'));
  await page.goto(base+'?page=tidy');
  const photoRoom=page.locator('#tidyList > .tidy-place').first();
  await photoRoom.locator(':scope > summary').click();
  const photoFold=photoRoom.locator('[data-tidy-photo-guide]');
  await photoFold.locator('summary').click();
  const photoGuide=photoFold.locator('.first-operation-guide');
  await photoGuide.waitFor();
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   const sizes=await photoFold.evaluate(fold=>{
    const box=el=>el.getBoundingClientRect();
    const guide=fold.querySelector('.first-operation-guide'),grid=fold.querySelector('.tidy-photo-grid');
    return {outsideGrid:guide.parentElement===grid.parentElement,imageWidth:box(guide.querySelector('img')).width,imageHeight:box(guide.querySelector('img')).height,textWidth:box(guide.querySelector('p')).width,guideWidth:box(guide).width,gridWidth:box(grid).width,height:box(guide).height};
   });
   assert.equal(sizes.outsideGrid,true);
   assert.equal(sizes.imageWidth,40);
   assert.equal(sizes.imageHeight,40);
   assert.ok(sizes.textWidth>80,JSON.stringify(sizes));
   assert.ok(Math.abs(sizes.guideWidth-sizes.gridWidth)<2,JSON.stringify(sizes));
   assert.ok(sizes.height<190,JSON.stringify(sizes));
  }
  await photoGuide.getByRole('button',{name:'案内を閉じる'}).click();
  assert.equal(await photoFold.locator('input[type=file]').first().isEnabled(),true);
  assert.equal(await photoFold.locator('input[type=file]').nth(1).isEnabled(),false);
  console.log('PASS: first photo guide stays above both columns with a 40px mascot at 320px and 390px');

  // Inspect the report draft without opening a mail client or sending mail.
  const reviewId='12345678-1234-1234-1234-123456789012';
  await context.route('**/rest/v1/rpc/list_stock_reviews', route=>route.fulfill({json:[{id:reviewId,name:'確認用レビュー',category:'その他',stars:4,photo_count:0,helpful:0,voted:false}]}));
  await context.route('**/rest/v1/rpc/read_stock_review', route=>route.fulfill({json:[{comment:'テスト本文',photos:[]}]}));
  await page.goto(base+'?page=reviews');
  await page.locator('#sharedReviewList summary').click();
  const reportLink=page.getByRole('link',{name:'この投稿を通報・相談する'});
  const reportUrl=new URL(await reportLink.getAttribute('href'));
  assert.equal(reportUrl.pathname,'totonoe.bousai.support@gmail.com');
  assert.ok(reportUrl.searchParams.get('body').includes(reviewId));
  assert.ok(reportUrl.searchParams.get('body').includes('確認用レビュー'));
  await page.goto(base+'privacy.html');
  await page.getByRole('heading',{name:'プライバシーポリシー',exact:true}).waitFor();
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.getByRole('link',{name:'サポートページ',exact:true}).click();
  await page.getByRole('heading',{name:'投稿の通報・削除相談',exact:true}).waitFor();
  assert.equal(await page.locator('a[href="./privacy.html"]').count(),1);
  console.log('PASS: public privacy/support pages fit mobile widths and report draft contains the selected review ID');
  await context.close();

  const controlsContext=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}});
  let blocked=false,myPostDeleted=false,deleteCalls=0,failDelete=false;
  const otherId='40000000-0000-0000-0000-000000000001',ownId='40000000-0000-0000-0000-000000000002';
  await controlsContext.addInitScript(()=>{
   localStorage.setItem('toto-tutorial-v1',JSON.stringify({version:2,step:4,completed:true}));
   localStorage.setItem('toto-weather-location-v1',JSON.stringify({office:'400000',area:'400010',station:'',warningCity:'4013000'}));
   localStorage.setItem('totonoe-hazard-confirmed','4013000');
   sessionStorage.setItem('totonoe-review-session','test-token');
  });
  await controlsContext.route('**/*',async route=>{
   if(route.request().url().startsWith(base))return route.continue();
   const pathname=new URL(route.request().url()).pathname;
   if(!pathname.startsWith('/rest/v1/rpc/')||route.request().method()!=='POST')return route.abort();
   const name=pathname.split('/').pop();
   const body=route.request().postDataJSON();
   let result;
   if(name==='stock_review_controls')result=2;
   else if(name==='list_stock_reviews')result=blocked?[]:[{id:otherId,name:'他の投稿者の用品',category:'水',stars:4,photo_count:0,helpful:0,voted:false}];
   else if(name==='read_stock_review')result=[{comment:'使用した感想',photos:[]}];
   else if(name==='set_stock_review_author_block'){assert.equal(body.p_review,otherId);blocked=true;result=true;}
   else if(name==='clear_my_stock_review_blocks'){blocked=false;result=true;}
   else if(name==='list_my_stock_reviews')result=myPostDeleted?[]:[{id:ownId,name:'送信済みの用品',published:false}];
   else if(name==='delete_my_stock_review'){assert.equal(body.p_review,ownId);myPostDeleted=true;result=true;}
   else if(name==='delete_my_stock_review_account'){
    assert.deepEqual(body,{});deleteCalls++;
    if(failDelete)return route.fulfill({status:500,json:{message:'test failure'}});
    result=true;
   }else return route.abort();
   return route.fulfill({json:result});
  });
  const controlPage=await controlsContext.newPage();
  await controlPage.goto(base+'?page=reviews');
  await controlPage.locator('#reviews').waitFor();
  await controlPage.locator('#reviewAccountControls').waitFor();
  await controlPage.locator('#sharedReviewList summary').click();
  controlPage.once('dialog',dialog=>dialog.accept());
  await controlPage.getByRole('button',{name:'この投稿者をブロック',exact:true}).click();
  await controlPage.locator('#sharedReviewStatus').getByText('この投稿者をブロックしました。',{exact:true}).waitFor();
  assert.equal(await controlPage.locator('#sharedReviewList summary').count(),0);
  controlPage.once('dialog',dialog=>dialog.accept());
  await controlPage.locator('#reviewClearBlocks').click();
  await controlPage.locator('#sharedReviewList summary').waitFor();
  await controlPage.locator('#reviewMyPosts').click();
  await controlPage.getByText('送信済みの用品（非公開・審査待ち）',{exact:true}).waitFor();
  controlPage.once('dialog',dialog=>dialog.accept());
  await controlPage.getByRole('button',{name:'この送信済み投稿を削除',exact:true}).click();
  await controlPage.locator('#reviewAccountStatus').getByText('送信済みの投稿を削除しました。端末内の記録は残っています。',{exact:true}).waitFor();
  await controlPage.locator('#reviewFormFold summary').click();
  await controlPage.locator('#reviewProduct').fill('端末に残す用品');
  await controlPage.locator('#reviewStars').selectOption('5');
  await controlPage.locator('#reviewComment').fill('端末に残す感想');
  await controlPage.locator('#reviewUsed').check();
  await controlPage.locator('#reviewSave').click();
  await controlPage.locator('#reviewList .review-title').getByText('端末に残す用品',{exact:true}).waitFor();
  controlPage.once('dialog',dialog=>dialog.dismiss());
  await controlPage.locator('#reviewDeleteAccount').click();
  assert.equal(deleteCalls,0);
  failDelete=true;
  controlPage.once('dialog',dialog=>dialog.accept('削除'));
  await controlPage.locator('#reviewDeleteAccount').click();
  await controlPage.locator('#reviewAccountStatus').getByText('削除結果を確認できませんでした。',{exact:false}).waitFor();
  assert.equal(await controlPage.evaluate(()=>sessionStorage.getItem('totonoe-review-session')),'test-token');
  failDelete=false;
  controlPage.once('dialog',dialog=>dialog.accept('削除'));
  await controlPage.locator('#reviewDeleteAccount').click();
  await controlPage.locator('#reviewAccountStatus').getByText('アプリ側アカウントと送信済みデータを削除しました。',{exact:false}).waitFor();
  assert.equal(deleteCalls,2);
  assert.equal(await controlPage.evaluate(()=>sessionStorage.getItem('totonoe-review-session')),null);
  assert.equal(await controlPage.locator('#reviewAccountControls').isVisible(),false);
  assert.equal(await controlPage.locator('#reviewList .review-title').textContent(),'端末に残す用品');
  console.log('PASS: block/clear, own-post deletion, cancelled/failed/successful account deletion and retained local reviews');
  await controlsContext.close();

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
  await offlinePage.evaluate(()=>openTutorial(true));
  await offlinePage.locator('#tutorialNext').click();
  await offlinePage.locator('#tutorialTitle').getByText('はじめまして！', { exact: true }).waitFor();
  await offlinePage.locator('#tutorialMain').getByText('たこです！', { exact: false }).waitFor();
  await offlinePage.locator('#tutorialSupport').getByText('トリケラです。', { exact: false }).waitFor();
  await offlinePage.locator('#tutorialDetail').getByText('シマエナガです。', { exact: false }).waitFor();
  assert.equal(await offlinePage.locator('#tutorialWelcomeBird').isVisible(), true);
  for(let step=2;step<=4;step++){
   await offlinePage.locator('#tutorialNext').click();
   for(const width of [320,390]){
    await offlinePage.setViewportSize({width,height:844});
    const detail=await offlinePage.locator('#tutorialDetail').evaluate(el=>{
     const parent=getComputedStyle(el.parentElement);
     return {
      mascotLayout:el.classList.contains('page-intro-line'),
      width:el.getBoundingClientRect().width,
      available:el.parentElement.clientWidth-parseFloat(parent.paddingLeft)-parseFloat(parent.paddingRight),
      height:el.getBoundingClientRect().height
     };
    });
    assert.equal(detail.mascotLayout,false);
    assert.ok(detail.width>=detail.available-2,JSON.stringify(detail));
    assert.ok(detail.height<240,JSON.stringify(detail));
   }
  }
  await offlinePage.locator('#tutorialBack').click();
  await offlinePage.locator('#tutorialBack').click();
  await offlinePage.locator('#tutorialBack').click();
  assert.equal(await offlinePage.locator('#tutorialDetail').evaluate(el=>el.classList.contains('page-intro-line')),true);
  await offlinePage.locator('#tutorialNext').click();
  assert.equal(await offlinePage.locator('#tutorialDetail').evaluate(el=>el.classList.contains('page-intro-line')),false);
  console.log('PASS: tutorial detail uses full width after mascot introduction at 320px and 390px, including back navigation');

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
