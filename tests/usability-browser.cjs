const assert=require('node:assert/strict');
module.exports=async function verifyUsability(browser,base){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',route=>{
  const url=route.request().url();
  if(url.includes('common/const/area.json'))return route.fulfill({json:{
   offices:{'400000':{name:'福岡県'}},
   class10s:{'400010':{name:'福岡地方',parent:'400000'}},
   class15s:{'400011':{name:'福岡地区',parent:'400010'}},
   class20s:{'4013000':{name:'福岡市',parent:'400011'}}
  }});
  return url.startsWith(base)?route.continue():route.abort();
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base);
  await page.locator('#tutorialDialog[open]').waitFor();
  await page.locator('#tutorialNext').click();
  await page.locator('#comicStoryContinue:enabled').click();
  await page.locator('#sharedRegionDialog[open]').waitFor();
  await page.locator('#sharedRegionOffice').selectOption('400000');
  await page.locator('#sharedRegionCity').selectOption('4013000');
  await page.locator('#sharedRegionSave').click();
  await page.locator('#tutorialNext').click();
  await page.locator('#comicStoryContinue:enabled').click();
  await page.locator('#hazardGateDialog[open]').waitFor();
  await page.locator('#hazardConfirmed').check();
  await page.locator('#hazardFinish').click();
  await page.locator('#homeSafety').waitFor();
  assert.equal(await page.evaluate(()=>hazardIsConfirmed()),true);
  assert.equal(await page.locator('dialog[open]').count(),0);

  // Previously unsupported direct links now open their requested destinations.
  for(const route of ['family','training','moving','outage','events','helpGuide','emergency']){
   await page.goto(base+'?page='+route);
   await page.locator('#'+route).waitFor();
   assert.equal(await page.evaluate(()=>activePage),route);
  }
  await page.goto(base+'?page=family');
  await page.locator('#familyLabel').fill('非公開の家族メモ');
  await page.locator('#familyEntryForm details summary').click();
  await page.locator('#familySupportNote').fill('非公開の支援内容');
  await page.locator('nav [data-page=more]').click();
  await page.locator('#pageBackButton').click();
  await page.locator('#family').waitFor();
  assert.equal(await page.locator('#familyLabel').inputValue(),'非公開の家族メモ');
  await page.reload();
  await page.locator('#family .draft-resume').waitFor();
  assert.equal(await page.locator('#familySupportNote').inputValue(),'非公開の支援内容');
  await page.locator('#familyEntryForm button[type=submit]').click();
  assert.equal(await page.locator('#familyLabel').inputValue(),'');
  assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(sessionStorage.getItem('toto-form-drafts-v1')||'{}')).length),0);

  await page.evaluate(()=>localStorage.setItem('toto-home-safety-v1',JSON.stringify({sleep:'done',bedpath:'done',door:'done',hall:'done',fix:'done'})));
  await page.goto(base+'?page=supplies');
  await page.locator('#supplyAddFold > summary').click();
  await page.locator('#sname').fill('入力途中の食品');
  await page.locator('#scategory').selectOption('food');
  await page.locator('#smeasureFactor').fill('2');
  await page.reload();
  await page.locator('#smeasureFactor').waitFor();
  assert.equal(await page.locator('#sname').inputValue(),'入力途中の食品');
  assert.equal(await page.locator('#smeasureFactor').inputValue(),'2');
  assert.equal(await page.locator('#scategory').inputValue(),'food');

  await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;
   const photo=canvas.toDataURL('image/jpeg');
   localStorage.setItem('toto-tidy-v1',JSON.stringify([{id:'private-room',place:'非公開の部屋',done:true,afterPhoto:photo}]));
  });
  await page.goto(base+'?page=tidyAlbum');
  await page.getByRole('button',{name:'できたことを共有する',exact:true}).click();
  assert.equal(await page.locator('#shareAddress').isChecked(),false);
  assert.equal(await page.locator('#shareFamily').isChecked(),false);
  assert.equal(await page.locator('#sharePhotos input:checked').count(),0);
  assert.doesNotMatch(await page.locator('#sharePreview').inputValue(),/非公開/);
  await page.locator('#shareFamily').check();
  assert.match(await page.locator('#sharePreview').inputValue(),/非公開の家族メモ/);
  await page.locator('#shareFamily').uncheck();
  await page.locator('#shareAddress').check();
  await page.locator('#shareAddressText').fill('非公開の住所');
  assert.match(await page.locator('#sharePreview').inputValue(),/非公開の住所/);
  await page.locator('#shareAddress').uncheck();
  assert.doesNotMatch(await page.locator('#sharePreview').inputValue(),/非公開/);
  await page.locator('#sharePhotos input').first().check();
  await page.evaluate(()=>{
   Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
   Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.__shared={text:data.text,files:data.files?.length||0}}});
  });
  await page.getByRole('button',{name:'選んだ内容を共有する',exact:true}).click();
  const sent=await page.evaluate(()=>window.__shared);
  assert.equal(sent.files,1);assert.doesNotMatch(sent.text,/非公開/);
  await page.locator('#achievementShareDialog').getByRole('button',{name:'閉じる',exact:true}).click();
  await page.goto(base+'?page=more');
  for(const id of ['moreFamilyGroup','moreSettingsGroup','moreAuthorGroup'])await page.locator('#'+id).waitFor();
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: explanation → region → hazard, all page links, browser Back, reload draft and successful-submit clearing, purpose groups, deliberate private-field/photo sharing');
 }finally{await context.close()}
};
