const assert = require('node:assert/strict');
module.exports = async function verifyExperience(browser,base) {
 const firstUse=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await firstUse.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 await firstUse.addInitScript(()=>{
  if(localStorage.getItem('toto-tutorial-v1'))return;
  localStorage.setItem('toto-tutorial-v1',JSON.stringify({version:2,step:4,completed:true}));
  localStorage.setItem('toto-weather-location-v1',JSON.stringify({office:'400000',area:'400010',station:'',warningCity:'4013000'}));
  localStorage.setItem('totonoe-hazard-confirmed','4013000');
 });
 const fresh=await firstUse.newPage();
 try {
  await fresh.goto(base+'?page=homeSafety');await fresh.locator('#safe-sleep').waitFor();
  assert.equal(await fresh.locator('dialog[open]').count(),0);
  assert.equal(await fresh.locator('#furnitureSafetyPanel').isVisible(),true);
  assert.equal(await fresh.locator('#routeSafetyPanel').isVisible(),false);
  await fresh.locator('#furnitureSafetyPanel > button').click();
  assert.equal(await fresh.locator('#furnitureSafetyPanel').isVisible(),false);
  assert.equal(await fresh.locator('#routeSafetyTitle').evaluate(node=>document.activeElement===node),true);
  await fresh.locator('#routeSafetyPanel > button').click();
  assert.equal(await fresh.locator('#furnitureSafetyTitle').evaluate(node=>document.activeElement===node),true);
  await fresh.goto(base+'?page=homeSafety&focus=route');
  await fresh.locator('#routeSafetyTitle').waitFor();
  for(const width of [320,390]){
   await fresh.setViewportSize({width,height:844});
   assert.equal(await fresh.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.equal(await fresh.locator('#routeSafetyPanel').evaluate(node=>getComputedStyle(node).borderTopWidth),'4px');
  }
  assert.equal(await fresh.locator('nav button').count(),5);
  assert.equal(await fresh.locator('nav .chibi-icon').count(),0);
  const navIcons=fresh.locator('nav button > svg.nav-icon');
  assert.equal(await navIcons.count(),5);
  assert.equal(await navIcons.evaluateAll(icons=>new Set(icons.map(icon=>getComputedStyle(icon).color)).size),5);
  assert.equal(await fresh.locator('#stockLockBadge').isVisible(),true);
  for (const width of [320,390]) {
   await fresh.setViewportSize({width,height:844});
   for (const [route,icons] of [['more',['family-card','map',18,11,4]],['learn',[8,'seasonal-checklist','map',1]]]) {
    await fresh.goto(base+'?page='+route);
    const cards=fresh.locator('#'+route+' .refresh-menu-grid button > .chibi-icon');
    assert.deepEqual(await cards.evaluateAll(nodes => nodes.map(node => node.dataset.objectIcon??Number(node.dataset.illustration))),icons);
    assert.equal(await fresh.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await fresh.locator('header #favoritePageToggle,header #pageFeedback').count(),0);
    assert.equal(await fresh.locator('#pageFeedback').evaluate(n=>n.closest('main > section').id),route);
    const positions=await fresh.evaluate(()=>{
     const launch=document.getElementById('favoritesLauncher').getBoundingClientRect();
     const tab=document.querySelector('nav [data-page=more]').getBoundingClientRect();
     const nav=document.querySelector('nav').getBoundingClientRect();
     return {left:launch.left,right:launch.right,width:innerWidth,bottom:launch.bottom,top:nav.top,centers:Math.abs((launch.left+launch.right-tab.left-tab.right)/2)};
    });
    assert(positions.left>=0 && positions.right<=positions.width && positions.bottom<positions.top && positions.centers<2,JSON.stringify(positions));

    if (route==='learn') {
     const exam=fresh.locator('#learn > .card').filter({has:fresh.getByRole('button',{name:'例題・音声学習',exact:true})});
     assert.equal(await exam.locator('h2 > .chibi-icon').count(),1);
     assert.equal(await exam.locator('.exam-bird,.character-art').count(),0);
    }
    if (route==='more') {
     const objects=fresh.locator('#more .more-menu-button > .object-icon');
     assert.deepEqual(await objects.evaluateAll(nodes=>nodes.map(node=>node.dataset.objectIcon)),
                      ['weather-card','calculator-bottle','home-checklist','shield-folder','settings-book','settings-book']);
     assert.equal(await fresh.locator('#more .object-icon > svg').count(),8);
     const rows=fresh.locator('#more :is(.more-menu-button,#optionalLifestyleGuide).with-chibi:visible');
     const placement=await rows.evaluateAll(nodes=>nodes.map(row=>{
      const label=row.querySelector('.chibi-card-copy');
      const copy=label.getBoundingClientRect();
      const icon=row.querySelector('.chibi-icon');
      const art=icon.getBoundingClientRect();
      return [copy.width,copy.right,art.left,art.width,row.getBoundingClientRect().right,Boolean(icon.dataset.objectIcon),parseFloat(getComputedStyle(label).fontSize),getComputedStyle(label).color===getComputedStyle(row).color];
     }));
     assert(placement.length>=4);
     for (const [copyWidth,copyRight,artLeft,artWidth,rowRight,isObject,fontSize,labelColorMatches] of placement) {
      assert(copyWidth>0 && copyRight<=artLeft && artWidth>=(isObject?52:width===320?72:84) && artLeft+artWidth<=rowRight);
      assert(fontSize>=15 && labelColorMatches);
     }
     for (const title of ['機能を探す','削除の取り消し']) {
      const heading=fresh.getByRole('heading',{name:title,exact:true}).filter({visible:true});
      assert.equal(await heading.locator('.chibi-icon').count(),1);
     }
    }
   }
  }
  await fresh.evaluate(()=>show('helpGuide'));
  await fresh.locator('#favoritesLauncher').click();
  await fresh.locator('#favoritePageToggle').click();
  assert.equal(await fresh.evaluate(()=>validateFullBackupObject(JSON.parse(buildFullBackup())).keys.includes('toto-experience-v1')),true);
  await fresh.locator('#favoritesDialog').getByRole('button',{name:'閉じる',exact:true}).click();
  await fresh.locator('#globalEmergencyButton').click();
  const emergency=fresh.locator('#emergency');
  await emergency.waitFor();
  assert.equal(await fresh.locator('.experience-toolbar').isVisible(),false);
  const marked=emergency.locator('h2,h3,summary').filter({hasText:/^(災害時の確認画面|自分の緊急時チェックリスト|最新の災害情報|通信が使えない場合の事前確認|緊急時情報をコピーする|チェック項目を編集（平常時）)/});
  assert.equal(await marked.count(),6);
  assert.equal(await marked.locator('.chibi-icon').count(),0);
  const familyIcon=emergency.locator('#emergencyFamily > h3 > [data-object-icon="family-card"] > svg');
  await familyIcon.waitFor();
  await fresh.locator('nav [data-page="home"]').click();
  assert.equal(await fresh.locator('#favoritesLauncher').isVisible(),true);
  assert.equal(await fresh.locator('#favoritePageToggle').isVisible(),false);
  assert.equal(await fresh.locator('#pageFeedback').isVisible(),true);
  await fresh.locator('#globalEmergencyButton').click();
  await familyIcon.waitFor();
  assert.equal(await familyIcon.count(),1);
  await fresh.goto(base+'?page=tidy');
  const tidy=fresh.locator('#tidy');
  assert.equal(await tidy.getByRole('heading',{name:/ととのえる[3３]ステップ/}).count(),0);
  assert.equal(await tidy.getByRole('heading',{name:'実践ノート',exact:true}).isVisible(),true);
  const rooms=fresh.locator('#tidyList > .tidy-place');
  assert.equal(await rooms.locator(':scope > summary > .chibi-icon').count(),
               await rooms.count());
  assert.equal(await rooms.locator('.tidy-place-body:visible').count(),0);
  const firstRoom=rooms.first();
  const secondRoom=rooms.nth(1);
  const firstSummary=firstRoom.locator(':scope > summary');
  assert.deepEqual(await firstSummary.evaluate(node=>[...node.children].map(child=>child.className)),
                   ['chibi-icon','tidy-place-name','tidy-place-progress-count']);
  assert.equal(await firstSummary.locator('.tidy-place-progress-count').innerText(),'0/4 完了');
  assert.equal(await firstSummary.evaluate(node=>getComputedStyle(node).listStyleType),'none');
  await firstSummary.click();
  await firstRoom.locator('.tidy-step-list').waitFor();
  await firstRoom.getByText('Before／After写真を残す',{exact:true}).waitFor();
  await firstRoom.getByText('メモ・記録・削除（必要なときだけ）',{exact:true}).click();
  await firstRoom.getByRole('button',{name:'記録を編集（任意）'}).click();
  await firstRoom.getByText('場所の名前',{exact:true}).waitFor();
  await firstRoom.getByRole('button',{name:'キャンセル',exact:true}).click();
  assert.equal(await firstRoom.getAttribute('open'),'');
  const firstTask=firstRoom.locator('.tidy-step-list input').first();
  await firstTask.check();
  assert.equal(await firstTask.isChecked(),true);
  assert.match(await firstRoom.locator(':scope > summary').innerText(),/1\/4 完了/);
  await secondRoom.locator(':scope > summary').click();
  await firstRoom.locator('.tidy-place-body').waitFor({state:'hidden'});
  await secondRoom.locator('.tidy-place-body').waitFor();
  await fresh.reload();
  assert.equal(await rooms.locator('.tidy-place-body:visible').count(),0);
  assert.match(await firstRoom.locator(':scope > summary').innerText(),/1\/4 完了/);
  await fresh.evaluate(()=>{
   const records=readTidyPlaces();
   saveTidyPlaces(records.map((room,i)=>i===0?{...room,stepChecks:[true,true,true,true],done:true}:room));
  });
  await fresh.reload();
  const completedSummary=rooms.locator(':scope > summary').filter({hasText:'4/4 完了'});
  assert.equal(await completedSummary.locator('.tidy-place-progress-count').innerText(),'4/4 完了');
  assert.equal(await completedSummary.evaluate(node=>node.textContent.trim().endsWith('4/4 完了')),true);
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
  for(const field of ['sleep','fix'])await fresh.locator('#safe-'+field).selectOption('done');
  await fresh.locator('nav [data-page="supplies"]').click();
  await fresh.locator('#stockGateNext').click();
  await fresh.locator('#safe-bedpath').waitFor();
  assert.equal(await fresh.locator('#safe-bedpath').evaluate(node=>document.activeElement===node),true);
  for(const field of ['bedpath','door'])await fresh.locator('#safe-'+field).selectOption('done');
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
  const homeHeadings=fresh.locator('#home :is(.refresh-home-mission,.refresh-journey) > .refresh-heading');
  assert.equal(await homeHeadings.count(),2);
  const homeSteps=fresh.locator('#home .refresh-journey .refresh-tiles button');
  assert.deepEqual(await homeSteps.locator('strong').allTextContents(),['整理','整頓','備蓄']);
  for(const step of await homeSteps.all())assert.equal(await step.isVisible(),true);
  assert.equal(await homeHeadings.locator('.chibi-icon').count(),0);
  assert(await homeHeadings.evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node,'::before').display==='none')));
  assert.equal(await fresh.locator('.refresh-home-mission > div:first-of-type > .home-priority-action').count(),1);
  assert.equal(await fresh.locator('#homeOtherSuggestions').getAttribute('open'),null);
  for(const width of [320,390]){await fresh.setViewportSize({width,height:844});assert.equal(await fresh.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}
  console.log('PASS: separate safety sections and direct route link; tidy accordions, room edit and progress persistence');
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
  await page.locator('#favoritesLauncher').click();
  await page.locator('#favoritePageToggle').click();
  assert.match(await page.locator('#favoritePages').textContent(),/その他/);
  await page.locator('#favoritesDialog').getByRole('button',{name:'閉じる',exact:true}).click();
  await page.reload();await page.locator('#simpleDisplay:checked').waitFor();
  assert.match(await page.locator('#favoritePages').textContent(),/その他/);
  await page.locator('nav [data-page=home]').click();
  await page.locator('#favoritesLauncher').click();
  await page.locator('#favoritesDialog [data-favorite-page=more]').click();
  assert.equal(await page.locator('#favoritesDialog').isVisible(),false);
  assert.equal(await page.evaluate(()=>activePage),'more');
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
