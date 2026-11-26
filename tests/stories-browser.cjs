const assert=require('node:assert/strict');
module.exports=async(browser,base)=>{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',route=>{
  if(route.request().url().includes('common/const/area.json'))return route.fulfill({json:{offices:{'400000':{name:'福岡県'}},class10s:{'400010':{name:'福岡地方',parent:'400000'}},class15s:{'400011':{name:'福岡地区',parent:'400010'}},class20s:{'4013000':{name:'福岡市',parent:'400011'}}}});
  return route.request().url().startsWith(base)?route.continue():route.abort();
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const opened=page.locator('#comicStoryDialog[open]');
 const next=async()=>{await page.locator('#comicStoryContinue:enabled').click()};
 const waitEpisode=async id=>{await opened.locator('#comicStoryTitle').filter({hasText:'第'+id+'話'}).waitFor();await page.locator('#comicStoryContinue:enabled').waitFor()};
 await page.goto(base);
 await page.locator('#tutorialDialog[open]').waitFor();
 assert.match(await page.locator('#tutorialTitle').textContent(),/始めてくれてありがとう/);
 assert.match(await page.locator('#tutorialStep').textContent(),/1 \/ 2/);
 await page.locator('#tutorialNext').click();await waitEpisode(0);await next();
 await page.locator('#sharedRegionDialog[open]').waitFor();
 // Resume at region selection without repeating the welcome or comic 0.
 await page.reload();await page.locator('#sharedRegionDialog[open]').waitFor();
 await page.locator('#sharedRegionDialog form[method=dialog] button').click();
 await page.locator('#hazardStartAction').click();await page.locator('#sharedRegionDialog[open]').waitFor();
 await page.locator('#sharedRegionOffice').selectOption('400000');
 await page.locator('#sharedRegionCity').selectOption('4013000');await page.locator('#sharedRegionSave').click();
 await page.locator('#tutorialDialog[open]').waitFor();
 assert.match(await page.locator('#tutorialTitle').textContent(),/さっそく/);
 assert.match(await page.locator('#tutorialStep').textContent(),/2 \/ 2/);
 assert.equal(await page.locator('#stockGateDialog[open],#hazardGateDialog[open]').count(),0);
 await page.locator('#tutorialNext').click();await waitEpisode(1);await next();
 await page.getByRole('button',{name:'オフにする・そのまま使う',exact:true}).click();
 await page.locator('#hazardGateDialog[open]').waitFor();
 await page.locator('#hazardConfirmed').check();await page.locator('#hazardFinish').click();
 assert.equal(await page.evaluate(()=>tutorialState.completed),true);
 assert.equal(await page.locator('dialog[open]').count(),0);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-stories-v1')).read),[0,1]);
 await page.evaluate(()=>{
  for(const d of document.querySelectorAll('dialog[open]'))d.close();
  localStorage.setItem('toto-tutorial-v1',JSON.stringify({version:2,step:4,completed:true}));
  tutorialState=readTutorialState();tutorialSessionUnlocked=true;
  localStorage.setItem('toto-weather-location-v1',JSON.stringify({office:'400000',area:'400010',station:'',warningCity:'4013000'}));
  localStorage.setItem('totonoe-hazard-confirmed','4013000');
  show('weather');
 });
 await page.waitForTimeout(180);assert.equal(await opened.count(),0);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-stories-v1')).unlocked.includes(21)),true);
 await page.evaluate(()=>show('more'));
 await page.locator('#achievementBadges>summary').click();
 assert.equal(await page.locator('#comicIntroductionsEnabled').isChecked(),false);
 await page.locator('#comicArchiveList button').filter({hasText:'第21話'}).click();await waitEpisode(21);
 await page.locator('#comicStoryDialog').getByRole('button',{name:'拡大',exact:true}).click();
 assert.equal(await page.locator('#comicStoryScroll').evaluate(e=>e.scrollWidth>e.clientWidth),true);
 await next();
 await page.locator('#comicIntroductionsEnabled').check();
 await page.evaluate(()=>show('events'));await waitEpisode(30);await next();
 await page.evaluate(()=>{show('home');show('events')});await page.waitForTimeout(180);assert.equal(await opened.count(),0);
 await page.reload();await page.waitForTimeout(180);assert.equal(await opened.count(),0);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-stories-v1')).introductions),true);
 // Feature order is free; a lower episode may follow a higher one.
 await page.evaluate(()=>show('pouch'));await waitEpisode(20);await next();
 // The story state is included in full backups and rejects invalid references.
 const backup=await page.evaluate(()=>buildFullBackup());
 assert.equal(JSON.parse(backup).data['toto-stories-v1']!==undefined,true);
 assert.equal(await page.evaluate(()=>{const x=JSON.parse(buildFullBackup());x.data['toto-stories-v1']=JSON.stringify({version:1,introductions:true,unlocked:[40],read:[],introduced:[]});try{validateFullBackupObject(x);return false}catch(_){return true}}),true);
 await page.evaluate(()=>{show('emergency')});await page.waitForTimeout(180);assert.equal(await opened.count(),0);
 assert.equal(await page.locator('#emergency').isVisible(),true);
 // All lifestyle comics remain locked until the eight trophies are earned.
 await page.evaluate(()=>{show('minimalistGuide')});await page.waitForTimeout(180);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-stories-v1')).unlocked.some(n=>n>=34)),false);
 await page.evaluate(()=>{localStorage.setItem(achievementKey,JSON.stringify({trophies:[...achievementIds],daily:null}));show('home')});
 await waitEpisode(19);await next();
 await page.evaluate(()=>{localStorage.setItem('toto-living-milestone',JSON.stringify({date:todayLocalDate(),rooms:[],goal:'安全で快適に暮らす',people:1,days:3,guideUnlocked:true}));show('minimalistGuide')});
 await waitEpisode(34);await next();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-stories-v1')).unlocked.includes(39)),true);
 await page.evaluate(()=>show('more'));await page.locator('#achievementBadges').evaluate(e=>e.open=true);
 // Failed preference saves leave the previous value and restore the control.
 await page.evaluate(()=>{window.storyOriginalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='toto-stories-v1')throw Error('quota');return window.storyOriginalSet.call(this,k,v)}});
 await page.locator('#comicIntroductionsEnabled').click();
 assert.equal(await page.locator('#comicIntroductionsEnabled').isChecked(),true);
 assert.match(await page.locator('#comicSettingStatus').textContent(),/保存できません/);
 await page.evaluate(()=>{Storage.prototype.setItem=window.storyOriginalSet});
 // A missing image never becomes read and the archive remains usable.
 await context.route('**/comic-v261-33.webp',route=>route.abort());
 await page.evaluate(()=>show('helpGuide'));
 await opened.locator('#comicStoryLoad').getByText('漫画を読み込めませんでした。',{exact:false}).waitFor();
 assert.equal(await page.locator('#comicStoryContinue').isDisabled(),true);
 await page.locator('#comicStoryClose').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('toto-stories-v1')).read.includes(33)),false);
 // Restore and other tabs update settings; corrupt data remains untouched.
 await page.evaluate(()=>{
  const value={version:1,introductions:false,unlocked:[0,1,20],read:[0],introduced:[0,1]};
  localStorage.setItem('toto-stories-v1',JSON.stringify(value));window.dispatchEvent(new Event('toto-data-restored'));show('more');
 });
 assert.equal(await page.locator('#comicIntroductionsEnabled').isChecked(),false);
 await page.evaluate(()=>{localStorage.setItem('toto-stories-v1','{broken');window.dispatchEvent(new StorageEvent('storage',{key:'toto-stories-v1'}))});
 assert.equal(await page.locator('#comicIntroductionsEnabled').isDisabled(),true);
 assert.equal(await page.evaluate(()=>localStorage.getItem('toto-stories-v1')),'{broken');
 assert.deepEqual(errors,[]);
 await context.close();
 const broken=await browser.newContext({serviceWorkers:'block'});
 await broken.addInitScript(()=>localStorage.setItem('toto-stories-v1','{broken'));
 await broken.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 const brokenPage=await broken.newPage();await brokenPage.goto(base);
 await brokenPage.locator('#tutorialDialog[open]').waitFor();
 assert.equal(await brokenPage.evaluate(()=>localStorage.getItem('toto-stories-v1')),'{broken');
 await broken.close();
 const direct=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await direct.addInitScript(()=>{
  localStorage.setItem('toto-tutorial-v1',JSON.stringify({version:2,step:4,completed:true}));
  localStorage.setItem('toto-weather-location-v1',JSON.stringify({office:'400000',area:'400010',station:'',warningCity:'4013000'}));
  localStorage.setItem('totonoe-hazard-confirmed','4013000');
 });
 await direct.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 const entry=await direct.newPage();await entry.goto(base+'?page=weather');
 assert.equal(await entry.locator('#tutorialDialog[open],#comicStoryDialog[open]').count(),0);
 assert.equal(await entry.locator('#weather').isVisible(),true);
 await direct.close();
 console.log('PASS: startup welcome → comic 0 → region → retained launch guide → comic 1 → choice → hazard; resume and completed-user migration; opt-out still unlocks archive; free-order first-use; no repeat; zoom; persistence; backup validation; restore/cross-tab; corrupt data; emergency access');
};
