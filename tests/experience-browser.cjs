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
  await page.getByRole('button',{name:'テスト食品の編集・点検・削除を開く',exact:true}).click();
  await page.getByRole('button',{name:'テスト食品を編集',exact:true}).click();
  const editor=page.locator('#supplyList .supply-edit');
  for(const width of [320,390,430]){
   await page.setViewportSize({width,height:844});
   const sizes=await editor.evaluate(form=>{
    const row=form.parentElement;
    const fields=[...form.querySelectorAll('.field')].filter(field=>field.getClientRects().length);
    return {rowWidth:row.getBoundingClientRect().width,formWidth:form.getBoundingClientRect().width,
     minField:Math.min(...fields.map(field=>field.getBoundingClientRect().width)),
     display:getComputedStyle(row).display,art:row.querySelectorAll('.inventory-art').length,
     fits:document.documentElement.scrollWidth<=innerWidth};
   });
   assert(sizes.formWidth>=sizes.rowWidth-30&&sizes.minField>170&&sizes.display==='block'&&sizes.art===0&&sizes.fits,JSON.stringify(sizes));
  }
  await editor.getByLabel('数量',{exact:true}).fill('48');
  await editor.getByRole('button',{name:'キャンセル',exact:true}).click();
  assert.equal(await page.evaluate(()=>supplies[0].qty),'3');
  await page.getByRole('button',{name:'テスト食品の編集・点検・削除を開く',exact:true}).click();
  await page.getByRole('button',{name:'テスト食品を編集',exact:true}).click();
  await editor.getByLabel('目標数量（任意・補充チェック用）',{exact:true}).fill('5');
  await editor.getByRole('button',{name:'変更を保存',exact:true}).click();
  await editor.waitFor({state:'detached'});
  await page.reload();
  await page.locator('#supplies').waitFor();
  assert.equal(await page.evaluate(()=>supplies[0].target),'5');
  assert.equal(await page.locator('#supplyList>.illustrated-stock-row').count(),2);
  console.log('PASS: supply editor uses full row width at 320/390/430px, cancel preserves quantity, save/reload preserves fields');
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
  await page.clock.setFixedTime(new Date('2026-11-25T11:00:00Z'));
  await page.goto(base+'?page=home&focus=today');
  const daily=page.locator('#todayAchievements');
  assert.equal(await daily.evaluate(node=>node.nextElementSibling.id),'homeOtherSuggestions');
  assert.match(await daily.innerText(),/まだ記録はありません/);
  assert.equal(await page.locator('#home #achievementBadges').count(),0);
  await page.evaluate(()=>{
   updateHomeSafety('fall','done');
   setCleanPractice('floor',true);
   saveSaved(key,[...supplies,{name:'今日の備蓄テスト',qty:'1',unit:'個'}]);
  });
  assert.match(await daily.innerText(),/安全点検 1項目・掃除 1項目・備蓄登録 1品/);
  await page.reload();
  assert.match(await daily.innerText(),/備蓄登録 1品/);
  await page.goto(base+'?page=more&focus=achievements');
  const achievement=page.locator('#more #achievementBadges');
  await achievement.waitFor();
  assert.match(await page.locator('#preparednessTreeStage').textContent(),/若木トロフィー 5\/8/);
  const collection=page.getByRole('dialog',{name:'バッジ・トロフィー'});
  const entry=achievement.getByRole('button',{name:'バッジ・トロフィーを見る',exact:true});
  await entry.click();
  await collection.waitFor();
  assert.equal(await collection.getByRole('heading',{name:'片付け・備蓄のバッジ'}).count(),1);
  assert.equal(await collection.getByRole('heading',{name:'トロフィー',exact:true}).count(),1);
  const datedTrophy=collection.locator('[data-achievement="clean-first"]');
  await datedTrophy.locator('summary').click();
  assert.equal(await datedTrophy.locator('time').getAttribute('datetime'),'2026-11-25');
  assert.match(await datedTrophy.innerText(),/獲得日 2026年11月25日/);
  const legacyTrophy=collection.locator('[data-achievement="safety-first"]');
  await legacyTrophy.locator('summary').click();
  assert.match(await legacyTrophy.innerText(),/獲得日の記録なし/);
  const closeCollection=collection.getByRole('button',{name:'バッジ・トロフィーを閉じる'});
  assert.equal(await closeCollection.innerText(),'×');
  await closeCollection.click();
  await collection.waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.activeElement.id==='openAchievementCollection');
  assert.equal(await achievement.isVisible(),true);
  assert.equal(await page.locator('#preparednessTrophies [data-earned=true]').count(),5);
  const medals=page.locator('#preparednessTrophies .preparedness-trophy-art');
  assert.equal(await medals.count(),8);
  assert.equal(await medals.evaluateAll(nodes=>new Set(nodes.map(node=>node.style.backgroundPosition)).size),8);
  const dimensions=await page.evaluate(async()=>{
   const image=new Image();
   image.src='./assets/achievement-art-v244.webp';
   await image.decode();
   return [image.naturalWidth,image.naturalHeight];
  });
  assert.deepEqual(dimensions,[1024,768]);
  const backedUp=await page.evaluate(()=>{
   const {data}=validateFullBackupObject(JSON.parse(buildFullBackup()));
   return JSON.parse(data[achievementKey]);
  });
  assert.equal(backedUp.trophies.length,5);
  assert.equal(backedUp.daily.stock,1);
  assert.equal(backedUp.earnedOn['clean-first'],'2026-11-25');
  assert.equal(backedUp.earnedOn['safety-first'],undefined);
  await page.evaluate(()=>{
   saveSaved(key,[]);
   setCleanPractice('floor',false);
  });
  assert.match(await page.locator('#preparednessTreeStage').innerText(),/5\/8/);
  await page.clock.setFixedTime(new Date('2026-11-26T11:00:00Z'));
  await page.goto(base+'?page=home&focus=today');
  assert.match(await daily.innerText(),/まだ記録はありません/);
  console.log('PASS: dated home summary, trophy growth, persistence after deletion and backup, next-day reset');
  const stageCases=[
   [0,'種',[]],
   [1,'芽',['tako']],
   [3,'若木',['tako','tricera']],
   [6,'大きな木',['tako','tricera','shimaenaga']]
  ];
  const positions=[];
  for(const [earned,name,friends] of stageCases){
   await page.evaluate(count=>{
    [key,tidyKey,homeSafetyKey,'toto-clean-practice-v1'].forEach(storageKey=>localStorage.removeItem(storageKey));
    verifiedSaveJson(achievementKey,{trophies:achievementIds.slice(0,count),daily:null});
   },earned);
   await page.goto(base+'?page=home');
   const art=page.locator('#home .preparedness-tree-art');
   assert.match(await page.locator('#preparednessTreeStage').innerText(),new RegExp('^'+name));
   const speech=page.locator('#home .game-mascot-scene>.refresh-speech');
   assert.equal(await page.locator('#homePreparednessTree').isVisible(),true);
   assert.equal(await page.locator('#home .game-mascot-scene>.character-art:visible').count(),0);
   assert.equal(await speech.locator('strong').innerText(),earned?'たこ':'防災の木');
   assert((await speech.locator('span').innerText()).length>5);
   assert.equal(await page.locator('#home #openAchievementCollection').count(),0);
   const companions=art.locator('.preparedness-tree-friend:visible');
   assert.deepEqual((await art.getAttribute('data-characters')).split(',').filter(Boolean),friends);
   if(earned<6)assert.equal(await page.locator('#home .game-mascot-scene').getAttribute('data-tree-pose'),'solo');
   assert(await companions.evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).backgroundImage.match(/achievement-friends-and-badges-v245|home-mascot-poses-v251/))));
   positions.push(await art.locator('.preparedness-plant').evaluate(node=>node.style.backgroundPosition));
   for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    const box=await art.boundingBox();
    assert(box.width>=100&&box.height>=120);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
  }
  assert.equal(new Set(positions).size,4);
  for(const [i,mode] of ['solo','ride','lift','sleep','drink','exercise'].entries()){
   await page.evaluate(index=>{Math.random=()=>((index+.1)/6);show('more');show('home')},i);
   const scene=page.locator('#home .game-mascot-scene');
   assert.equal(await scene.getAttribute('data-tree-pose'),mode);
   const group=scene.locator('.preparedness-group');
   assert.equal(await group.isVisible(),mode!=='solo');
   const expectedSingles=mode==='solo'?3:['drink','exercise'].includes(mode)?0:1;
   assert.equal(await scene.locator('.preparedness-tree-friend:visible').count(),expectedSingles);
   await page.evaluate(()=>document.dispatchEvent(new Event('toto-storage-changed')));
   assert.equal(await scene.getAttribute('data-tree-pose'),mode);
  }

  await page.goto(base+'?page=more&focus=trophies');
  await collection.waitFor();
  assert.equal(await collection.locator('#preparednessTrophySection .preparedness-trophy-art').count(),8);
  await closeCollection.click();
  await collection.waitFor({state:'hidden'});
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('focus')==='achievements');
  console.log('PASS: four medium tree illustrations, cumulative approved characters, eight distinct trophy images, direct trophy route');
  await page.evaluate(()=>{
   saveTidyPlaces(tidyDefaultPlaces.map((place,i)=>({id:'badge-'+i,place,done:true,stepChecks:[true,true,true,true],completedAt:'2026-11-20'})));
   saveSaved(key,[{name:'備蓄バッジのテスト',qty:'1'}]);
  });
  await page.goto(base+'?page=more&focus=badges');
  await collection.waitFor();
  const recordBadges=collection.locator('#preparednessRecordBadges');
  assert.equal(await recordBadges.isVisible(),true);
  assert.equal(await collection.locator('#preparednessTrophySection').isVisible(),true);
  const badgeArt=recordBadges.locator('.milestone-badge-art');
  assert.equal(await badgeArt.count(),7);
  assert.equal(await badgeArt.evaluateAll(nodes=>new Set(nodes.map(node=>node.style.backgroundPosition)).size),7);
  assert.match(await recordBadges.innerText(),/備蓄品を登録（1品）/);
  const artDimensions=await page.evaluate(async()=>{
   const image=new Image();
   image.src='./assets/achievement-friends-and-badges-v245.webp','./assets/home-mascot-poses-v251.webp';
   await image.decode();
   return [image.naturalWidth,image.naturalHeight];
  });
  assert.deepEqual(artDimensions,[1024,768]);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const width of [320,390]){
   await page.setViewportSize({width,height:620});
   const closeBefore=await closeCollection.boundingBox();
   assert(closeBefore.x+closeBefore.width<=width&&closeBefore.y<45&&closeBefore.width>=44);
   await collection.locator('.achievement-collection-scroll').evaluate(node=>{node.scrollTop=node.scrollHeight});
   const closeAfter=await closeCollection.boundingBox();
   assert.equal(closeBefore.y,closeAfter.y);
  }
  await page.goto(base+'?page=more&focus=collection');
  await collection.waitFor();
  await closeCollection.click();
  await collection.waitFor({state:'hidden'});
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('focus')==='achievements');
  await page.reload();
  assert.equal(await collection.count(),0);
  console.log('PASS: shared badge and trophy screen, pinned close button, mobile layout, previous links, focus restoration and reload');
  await page.goto(base+'?page=more&focus=collection');
  const stockBadge=collection.locator('[data-achievement="stock-badge"]');
  await stockBadge.locator('summary').click();
  assert.equal(await stockBadge.locator('time').getAttribute('datetime'),'2026-11-26');
  await page.evaluate(()=>verifiedSaveJson(homeSafetyKey,{sleep:'done',bedpath:'done',door:'done',hall:'done',fix:'done'}));
  await stockBadge.getByRole('button',{name:'備蓄管理へ',exact:true}).click();
  await collection.waitFor({state:'hidden'});
  await page.locator('#supplies').waitFor();
  await page.goto(base+'?page=more&focus=badges');
  const roomBadge=collection.locator('[data-achievement="room:badge-0"]');
  await roomBadge.locator('summary').click();
  assert.equal(await roomBadge.locator('time').getAttribute('datetime'),'2026-11-20');
  await roomBadge.getByRole('button',{name:'玄関のチェックリストへ'}).click();
  await collection.waitFor({state:'hidden'});
  await page.locator('#tidy-record-badge-0[open]').waitFor();
  await page.goto(base+'?page=more&focus=trophies');
  await legacyTrophy.locator('summary').click();
  await legacyTrophy.getByRole('button',{name:'住まいの安全点検へ'}).click();
  await collection.waitFor({state:'hidden'});
  await page.locator('#homeSafety').waitFor();
  console.log('PASS: dated and legacy achievement details, saved dates, supply and exact room links, safety link');

  await page.evaluate(()=>{
   saveSaved(key,[
    {name:'期限未入力の水',category:'water',qty:'5',unit:'本',factor:'2',exp:''},
    {name:'期限未入力の食料',category:'food',qty:'5',unit:'袋',measureFactor:'2',exp:''},
    {name:'携帯トイレ',category:'toilet',qty:'15',unit:'個',exp:'2027-01-01'}
   ]);
   localStorage.setItem(stockDaysKey,JSON.stringify({people:1,mode:'3'}));
   localStorage.setItem(toiletFrequencyKey,'5');
  });
  await page.goto(base+'?page=supplies');
  for(const kind of ['water','food']){
   const card=page.locator('.refresh-stock-stat.'+kind);
   assert.equal(await card.getAttribute('data-readiness'),'ready');
   assert.match(await card.innerText(),/10/);
  }
  await page.goto(base+'?page=home');
  const expiryAction=page.getByRole('button',{name:/消費期限・賞味期限を入力/}).first();
  if(!await expiryAction.isVisible())await page.locator('#homeOtherSuggestions > summary').click();
  await expiryAction.click();
  assert.equal(await page.locator('#supplyFilter').inputValue(),'noExpiry');
  await page.getByRole('button',{name:'期限未入力の水の編集・点検・削除を開く',exact:true}).click();
  await page.getByRole('button',{name:'期限未入力の水を編集',exact:true}).click();
  await editor.getByLabel('期限（任意）',{exact:true}).fill('2027-01-01');
  await editor.getByRole('button',{name:'変更を保存',exact:true}).click();
  await page.getByRole('button',{name:'期限未入力の食料の編集・点検・削除を開く',exact:true}).click();
  await page.getByRole('button',{name:'期限未入力の食料を編集',exact:true}).click();
  await editor.getByLabel('期限（任意）',{exact:true}).fill('2027-01-01');
  await editor.getByRole('button',{name:'変更を保存',exact:true}).click();
  await page.goto(base+'?page=home');
  assert.equal(await page.getByRole('button',{name:/消費期限・賞味期限を入力/}).count(),0);
  console.log('PASS: undated food/water count toward required stock, expiry task opens missing dates and disappears after entry');

  assert.deepEqual(errors,[]);
  console.log('PASS: mobile feature entry points, persistent favorites/simple view, reminders, worksheet, private feedback, stock use/shopping, quota/silent failures, deletion restore and settings backup');
 }finally{await context.close()}
};
