const assert = require('node:assert/strict');
module.exports = async function verifyExperience(browser,base) {
 const firstUse=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await firstUse.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 const fresh=await firstUse.newPage();
 try {
  await fresh.goto(base+'?page=homeSafety');await fresh.locator('#safe-sleep').waitFor();
  assert.equal(await fresh.locator('dialog[open]').count(),0);
  assert.equal(await fresh.locator('nav button').count(),5);
  assert.equal(await fresh.locator('nav .chibi-icon').count(),0);
  const navIcons=fresh.locator('nav button > svg.nav-icon');
  assert.equal(await navIcons.count(),5);
  assert.equal(await navIcons.evaluateAll(icons=>new Set(icons.map(icon=>getComputedStyle(icon).color)).size),5);
  assert.equal(await fresh.locator('#stockLockBadge').isVisible(),true);
  for (const width of [320,390]) {
   await fresh.setViewportSize({width,height:844});
   for (const [route,icons] of [['more',[15,9,18,11,4]],['learn',[8,20,9,1]]]) {
    await fresh.goto(base+'?page='+route);
    const cards=fresh.locator('#'+route+' .refresh-menu-grid button > .chibi-icon');
    assert.deepEqual(await cards.evaluateAll(nodes => nodes.map(node => Number(node.dataset.illustration))),icons);
    assert.equal(await fresh.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if (route==='more') {
     const rows=fresh.locator('#more :is(.more-menu-button,#optionalLifestyleGuide).with-chibi:visible');
     const placement=await rows.evaluateAll(nodes=>nodes.map(row=>{
      const copy=row.querySelector('.chibi-card-copy').getBoundingClientRect();
      const art=row.querySelector('.chibi-icon').getBoundingClientRect();
      return [copy.width,copy.right,art.left,art.width,row.getBoundingClientRect().right];
     }));
     assert(placement.length>=4);
     for (const [copyWidth,copyRight,artLeft,artWidth,rowRight] of placement) {
      assert(copyWidth>0 && copyRight<=artLeft && artWidth>=(width===320?72:84) && artLeft+artWidth<=rowRight);
     }
     for (const title of ['機能を探す','削除の取り消し']) {
      const heading=fresh.getByRole('heading',{name:title,exact:true}).filter({visible:true});
      assert.equal(await heading.locator('.chibi-icon').count(),1);
     }
    }
   }
  }
  await fresh.goto(base+'?page=tidy');
  assert.equal(await fresh.locator('#tidyList .tidy-checklist summary > .chibi-icon').count(),
               await fresh.locator('#tidyList .tidy-checklist summary').count());
  const sprite=await fresh.evaluate(async () => {
   const image=new Image();
   image.src='./assets/chibi-icons-v232.webp';
   await image.decode();
   return [image.naturalWidth,image.naturalHeight];
  });
  assert.deepEqual(sprite,[1024,640]);
  await fresh.goto(base+'?page=supplies');await fresh.locator('#stockGateDialog[open]').waitFor();
  assert.equal(await fresh.locator('#supplies').isVisible(),false);
  await fresh.locator('#stockGateNext').click();await fresh.locator('#safe-sleep').waitFor();
  for(const field of ['sleep','fix','bedpath','door'])await fresh.locator('#safe-'+field).selectOption('done');
  assert.equal(await fresh.evaluate(()=>stockIsUnlocked()),false);
  await fresh.locator('#safe-hall').selectOption('na');await fresh.locator('#stockGateDialog[open]').waitFor();
  await fresh.locator('#stockGateNext').click();await fresh.locator('#optionalStockSetup').waitFor();
  assert.equal(await fresh.locator('#stockSetupDialog[open]').count(),0);
  assert.equal(await fresh.evaluate(()=>readTidyPlaces().some(item=>!item.done)),true);
  await fresh.reload();await fresh.locator('#optionalStockSetup').waitFor();
  assert.equal(await fresh.evaluate(()=>stockIsUnlocked()),true);
  await fresh.evaluate(()=>updateHomeSafety('sleep','needs'));
  assert.equal(await fresh.locator('#supplies').isVisible(),false);
  await fresh.goto(base);await fresh.locator('.refresh-home-mission').waitFor();
  assert.equal(await fresh.locator('.refresh-home-mission > div:first-of-type > .home-priority-action').count(),1);
  assert.equal(await fresh.locator('#homeOtherSuggestions').getAttribute('open'),null);
  for(const width of [320,390]){await fresh.setViewportSize({width,height:844});assert.equal(await fresh.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
  console.log('PASS: no mandatory regional/profile forms before safety, five tabs, safety required for stock, unfinished rooms allowed, optional quantity setup, persistent unlock and relock, single primary mission');
 }finally{await firstUse.close()}
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 await context.addInitScript(()=>{
  const write=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
   if(window.__failExperienceWrite===key)throw new DOMException('full','QuotaExceededError');
   if(window.__silentExperienceWrite===key)return;
   return write.call(this,key,value);
  };
  if(localStorage.getItem('experience-test-seeded'))return;
  localStorage.setItem('experience-test-seeded','1');
  localStorage.setItem('toto-tutorial-v1',JSON.stringify({version:2,step:4,completed:true}));
  localStorage.setItem('toto-weather-location-v1',JSON.stringify({office:'400000',area:'400010',station:'',warningCity:'4013000'}));
  localStorage.setItem('totonoe-hazard-confirmed','4013000');
  localStorage.setItem('toto-evacuation-plan-v1',JSON.stringify({evHazard:'確認済み',evPlace:'集会所',evRoute:'大通り',evTiming:'家族で確認',evContacts:'電話',evMeeting:'集会所'}));
  localStorage.setItem('toto-home-safety-v1',JSON.stringify({sleep:'done',bedpath:'done',door:'done',hall:'done',fix:'done'}));
  localStorage.setItem('toto-tidy-defaults-v2','true');
  localStorage.setItem('toto-tidy-v1',JSON.stringify([{id:'room1',place:'玄関',done:true}]));
  localStorage.setItem('toto-stock-days-v1',JSON.stringify({people:1,mode:'3'}));
  localStorage.setItem('toto-toilet-frequency-v1','5');
  const expiry=new Date(Date.now()+9*3600000+2*86400000).toISOString().slice(0,10);
  localStorage.setItem('toto-supplies-v1',JSON.stringify([{name:'テスト食品',qty:'3',unit:'個',category:'food',exp:expiry,target:'5'},{name:'テスト用ライト',qty:'1',unit:'個',target:'2'}]));
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try {
  await page.goto(base+'?page=more');await page.locator('#simpleDisplay').waitFor();
  await page.locator('#simpleDisplay').check();
  assert.equal(await page.locator('body').evaluate(node=>node.classList.contains('simple-display')),true);
  if(await page.locator('#experienceStorageStatus').isVisible())await page.locator('#experienceStorageStatus button').click();
  await page.locator('#favoritePageToggle').click();
  assert.match(await page.locator('#favoritePages').textContent(),/その他/);
  await page.reload();await page.locator('#simpleDisplay:checked').waitFor();
  assert.match(await page.locator('#favoritePages').textContent(),/その他/);
  await page.locator('#remindersEnabled').check();
  assert.match(await page.locator('#reminderList').textContent(),/テスト食品/);
  await page.locator('#workshopDetails summary').click();
  assert.match(await page.locator('#workshopDetails').textContent(),/30,000円／回/);
  const pdf=await context.request.get(base+'assets/workshop-worksheet-sample.pdf');assert.equal(pdf.status(),200);assert.ok((await pdf.body()).subarray(0,4).equals(Buffer.from('%PDF')));
  await page.locator('#pageFeedback').click();await page.locator('#feedbackDialog textarea').first().fill('表示確認の感想');
  const mail=decodeURIComponent(await page.locator('#feedbackDialog a').getAttribute('href'));
  assert.match(mail,/ページ：その他/);assert.match(mail,/表示確認の感想/);assert.doesNotMatch(mail,/テスト食品/);
  await page.locator('#feedbackDialog').getByRole('button',{name:'閉じる',exact:true}).click();
  await page.evaluate(()=>show('supplies'));await page.locator('#dailySupplyTools').waitFor();
  assert.match(await page.locator('#useSoonList').textContent(),/テスト食品/);
  await page.locator('#useSoonList button').first().click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-supplies-v1'))[0].qty),'2');
  await page.locator('#dailySupplyTools').getByRole('button',{name:'買い物画面を開く'}).click();
  assert.match(await page.locator('#shoppingList').textContent(),/あと3個/);
  await page.locator('#shoppingList input').first().check();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-supplies-v1'))[0].qty),'2');
  await page.locator('#shoppingDialog').getByRole('button',{name:'閉じる',exact:true}).click();
  await page.evaluate(()=>{window.__failExperienceWrite='toto-supplies-v1'});
  await page.locator('#useSoonList button').first().click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-supplies-v1'))[0].qty),'2');
  assert.match(await page.locator('#experienceStorageStatus').textContent(),/保存できません/);
  await page.evaluate(()=>{window.__failExperienceWrite='';window.__silentExperienceWrite='toto-supplies-v1'});
  await page.locator('#useSoonList button').first().click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-supplies-v1'))[0].qty),'2');
  await page.evaluate(()=>{window.__silentExperienceWrite=''});
  await page.locator('#experienceStorageStatus button').click();
  await page.getByRole('button',{name:'テスト用ライトの編集・点検・削除を開く',exact:true}).click();
  await page.getByRole('button',{name:'テスト用ライトを削除',exact:true}).click();
  await page.getByRole('button',{name:'テスト用ライトの削除を確定',exact:true}).click();
  await page.evaluate(()=>show('more'));await page.locator('#recentDeletions').getByRole('button',{name:'元に戻す',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-supplies-v1')).length),2);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-supplies-v1'))[0].qty),'2');
  const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-experience-v1')));
  assert.equal(prefs.simple,true);assert.equal(prefs.reminders,true);assert.deepEqual(prefs.favorites,['more']);
  assert.equal(await page.evaluate(()=>validateFullBackupObject(JSON.parse(buildFullBackup())).keys.includes('toto-experience-v1')),true);
  for(const width of [320,390]) {
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: mobile feature entry points, persistent favorites/simple view, reminders, worksheet, private feedback, stock use/shopping, quota/silent failures, deletion restore and settings backup');
 }finally{await context.close()}
};
