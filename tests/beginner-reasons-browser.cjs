const assert=require('node:assert/strict');
module.exports=async function(browser,base){
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 await context.addInitScript(()=>{
  if(localStorage.getItem('reason-test-seeded'))return;
  localStorage.setItem('reason-test-seeded','1');
  localStorage.setItem('toto-tutorial-v1',JSON.stringify({version:2,step:4,completed:true}));
  localStorage.setItem('toto-weather-location-v1',JSON.stringify({office:'400000',area:'400010',station:'',warningCity:'4013000'}));
  localStorage.setItem('totonoe-hazard-confirmed','4013000');
  localStorage.setItem('toto-home-safety-v1',JSON.stringify({sleep:'done',bedpath:'done',door:'done',hall:'done',fix:'done'}));
  localStorage.setItem('toto-tidy-defaults-v2','true');
  localStorage.setItem('toto-tidy-v1',JSON.stringify([{id:'why-kitchen',place:'キッチン',done:false,stepChecks:[false,false,false,false]},{id:'why-custom',place:'仕事部屋',done:false,stepChecks:[false,false,false,false]}]));
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(base+'?page=learn&focus=reasons');
  const guide=page.locator('#preparednessReasons');await guide.waitFor();
  assert.match(await guide.innerText(),/なぜ危ない/);
  assert.equal(await guide.locator('.reason-sources a').count(),3);
  await guide.locator('#reasonPlaces>summary').click();
  assert.equal(await guide.locator('.reason-places>section').count(),8);
  for(const width of [320,390]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await guide.getByRole('button',{name:'片付けを始める',exact:true}).click();
  const kitchen=page.locator('#tidy-record-why-kitchen');await kitchen.locator(':scope>summary').click();
  const before=await page.evaluate(()=>localStorage.getItem('toto-tidy-v1'));
  assert.match(await kitchen.locator('.tidy-reason>p').innerText(),/食器/);
  await kitchen.locator('.tidy-reason summary').click();
  assert.match(await kitchen.locator('.tidy-reason details p').innerText(),/落ちる/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('toto-tidy-v1')),before);
  await kitchen.locator('.tidy-reason button').click();
  await guide.waitFor();
  await guide.getByRole('button',{name:'トイレの必要量を確認する'}).click();
  await page.locator('#stockCalculator').waitFor();
  assert.equal(await page.locator('#supplyCalcFold').evaluate(n=>n.open),true);
  await page.locator('#stockCalculator').getByRole('button',{name:'なぜ非常用トイレが必要？'}).click();
  await guide.waitFor();assert.match(await page.locator('#reasonToilet').innerText(),/排水管/);
  await page.goto(base+'?page=learn&focus=bosReason');
  assert.match(await page.locator('#reasonBos').innerText(),/作者のおすすめ/);
  assert.match(await page.locator('#reasonBos').innerText(),/課題の条件ではありません/);
  await page.locator('#reasonBos').getByRole('button',{name:'備蓄ページのおすすめを見る'}).click();
  assert.equal(await page.locator('#supplyRecommendations').evaluate(n=>n.open),true);
  await page.goto(base+'?page=tidy');
  const custom=page.locator('#tidy-record-why-custom');await custom.locator(':scope>summary').click();
  assert.match(await custom.locator('.tidy-reason').innerText(),/通れる場所/);
  assert.deepEqual(errors,[]);
  console.log('PASS: offline-readable beginner reasons, eight rooms and custom fallback, unchanged checks, working tidy/calculator/product routes, sources and author distinction, mobile widths');
 }finally{await context.close()}
};
