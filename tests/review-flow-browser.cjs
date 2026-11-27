const assert=require('node:assert/strict');
module.exports=async(browser,base)=>{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.addInitScript(()=>{
  if(localStorage.getItem('audit-seeded'))return;
  localStorage.setItem('audit-seeded','1');
  localStorage.setItem('toto-tutorial-v1',JSON.stringify({version:3,step:1,completed:true,startup:'done'}));
  localStorage.setItem('toto-stories-v1',JSON.stringify({version:1,introductions:false,unlocked:[0,1],read:[0,1],introduced:[0,1]}));
  localStorage.setItem('toto-weather-location-v1',JSON.stringify({office:'400000',area:'400010',station:'',warningCity:'4013000'}));
  localStorage.setItem('totonoe-hazard-confirmed','4013000');
 });
 await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 const page=await context.newPage(),errors=[],findings=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'?page=more&focus=achievements');
  await page.evaluate(()=>openTutorial(true));await page.locator('#tutorialNext').click();
  if(await page.locator('#tutorialNext').textContent()!=='案内を閉じる')findings.push('replay button does not describe its action');
  await page.locator('#tutorialNext').click();
  if(await page.evaluate(()=>activePage)!=='more')findings.push('replay leaves the originating page');
  await page.evaluate(()=>{show('weather');show('more')});
  await page.locator('#achievementBadges').evaluate(e=>e.open=true);
  const archive21=page.locator('#comicArchiveList button').filter({hasText:'第21話'});
  await archive21.click();await page.locator('#comicStoryContinue:enabled').click();
  await page.waitForFunction(()=>document.activeElement?.dataset.comicRead==='21',null,{timeout:1500}).catch(()=>findings.push('archive reading loses keyboard focus'));
  await page.locator('#comicIntroductionsEnabled').check();
  await page.evaluate(()=>show('weather'));await page.waitForTimeout(250);
  if(await page.locator('#comicStoryDialog[open]').count()){
   findings.push('already-read archive episode appears again as an introduction');
   await page.locator('#comicStoryClose').click();
  }
  // Viewing the two guide pages must not complete an unfinished startup flow.
  await page.evaluate(()=>localStorage.setItem('toto-tutorial-v1',JSON.stringify({version:3,step:0,completed:false,startup:'region'})));
  await page.goto(base+'?page=backup');await page.locator('#fullBackupDialog[open]').waitFor();
  await page.locator('#fullBackupDialog form[method=dialog] button').click();
  const before=await page.evaluate(()=>localStorage.getItem('toto-tutorial-v1'));
  await page.evaluate(()=>openTutorial(true));await page.locator('#tutorialNext').click();await page.locator('#tutorialNext').click();
  if(await page.evaluate(()=>localStorage.getItem('toto-tutorial-v1'))!==before)findings.push('guide replay overwrites unfinished startup progress');
  await page.evaluate(()=>openTutorial(true));await page.locator('#tutorialNext').click();
  await page.locator('#tutorialDialog[open]').getByRole('button',{name:'あとで',exact:true}).click();
  if(await page.evaluate(()=>localStorage.getItem('toto-tutorial-v1'))!==before)findings.push('pausing replay overwrites unfinished startup progress');
  await page.evaluate(()=>openTutorial(true));await page.keyboard.press('Escape');
  if(await page.evaluate(()=>localStorage.getItem('toto-tutorial-v1'))!==before)findings.push('Escape from replay overwrites unfinished startup progress');
  await page.evaluate(()=>openTutorial(true));
  await page.locator('#tutorialDialog[open]').getByRole('button',{name:'災害時モードをすぐ開く'}).click();
  if(await page.evaluate(()=>localStorage.getItem('toto-tutorial-v1'))!==before)findings.push('emergency from replay overwrites unfinished startup progress');
  assert.equal(await page.evaluate(()=>activePage),'emergency');
  assert.deepEqual(errors,[]);assert.deepEqual(findings,[]);
  console.log('PASS: guide replay returns to its origin and preserves unfinished progress; archive retains focus and read episodes do not auto-repeat');
 }finally{await context.close()}
};
