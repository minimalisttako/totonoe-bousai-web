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
  const guide=page.locator('#preparednessReasons'),dialog=page.locator('#contextHelpDialog'),close=page.locator('#contextHelpClose');await guide.waitFor();
  assert.match(await guide.innerText(),/解説ヘルプ/);
  assert((await guide.locator('[data-help-topic]').count())>=100);
  assert.equal(await guide.locator('#contextHelpCategory option').count(),10);
  await guide.locator('#contextHelpCategory').selectOption('備蓄・持ち出し');
  assert(await guide.locator('.help-index-group').evaluateAll(nodes=>nodes.every(n=>n.open&&n.dataset.category==='備蓄・持ち出し')));
  await guide.locator('#contextHelpCategory').selectOption('');
  await guide.locator('#contextHelpSearch').fill('仕事部屋');
  assert.equal(await guide.locator('[data-help-topic="room:仕事部屋"]').count(),1);
  await guide.locator('#contextHelpSearch').fill('');
  const audit=await page.evaluate(()=>TotonoeHelpAudit());
  assert.equal(new Set(audit.topics.map(t=>t.id)).size,audit.topics.length);
  for(const [id,topic] of Object.entries(audit.pages)){
   assert(audit.topics.some(t=>t.id===topic));
   assert((await page.locator('#'+id+' .context-help-button').count())>0,'Missing page help: '+id);
  }
  const rendered=await page.evaluate(()=>TotonoeHelpAudit().topics.map(topic=>{totoOpenContextHelp(topic.id,document.getElementById('contextHelpSearch'));const dialog=document.getElementById('contextHelpDialog'),body=document.getElementById('contextHelpBody');const result=[topic.id,document.getElementById('contextHelpTitle').textContent,body.firstElementChild?.textContent||body.textContent];dialog.close();return result}));
  for(const [id,title,body] of rendered){assert(title.length>2,id);assert(body.length>35,id)}
  assert(await page.locator('.context-help-button').evaluateAll(nodes=>nodes.every(n=>n.querySelector('svg')&&n.textContent==='解説')));
  const search=guide.locator('#contextHelpSearch');await search.fill('キッチン');
  assert.equal(await guide.locator('[data-help-topic]').count(),1);
  await guide.locator('[data-help-topic="room:キッチン"]').click();await dialog.waitFor();
  const canonical=await dialog.locator('#contextHelpBody').innerText();
  assert.match(canonical,/食器/);assert.equal(await dialog.locator('.reason-sources a').count(),7);
  for(const width of [320,390]){await page.setViewportSize({width,height:844});const box=await dialog.boundingBox();assert(box.width<width);assert(box.height<=844*.74);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await close.click();await search.fill('存在しない解説');assert(await guide.getByText('該当する解説がありません。別の言葉で探してください。').isVisible());await search.fill('');
  await page.goto(base+'?page=tidy');
  const kitchen=page.locator('#tidy-record-why-kitchen'),question=kitchen.locator(':scope>summary .context-help-button');
  const before=await page.evaluate(()=>localStorage.getItem('toto-tidy-v1'));
  assert.equal(await kitchen.evaluate(n=>n.open),false);
  await question.click();await dialog.waitFor();
  assert.equal(await kitchen.evaluate(n=>n.open),false,'Question mark must not toggle the room');
  assert.equal(await dialog.locator('#contextHelpBody').innerText(),canonical);
  assert.equal(await page.evaluate(()=>localStorage.getItem('toto-tidy-v1')),before);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert(await question.evaluate(n=>n===document.activeElement));
  await kitchen.locator(':scope>summary').click();assert.equal(await kitchen.locator('.tidy-reason').count(),0);
  await page.goto(base+'?page=supplies');
  await page.locator('#supplyEssentials>summary').click();
  for(const heading of ['現金・大切な書類','薬・健康管理','水・食料・トイレ','停電への備え','家族やペットに合わせて']){
   const button=page.locator('#supplyEssentials h3').filter({hasText:heading}).locator('.context-help-button');
   await button.click();await dialog.waitFor();assert((await dialog.locator('#contextHelpBody').innerText()).length>50);await close.click();
  }
  await page.goto(base+'?page=learn&focus=toiletReason');await dialog.waitFor();assert.match(await dialog.innerText(),/排水管/);
  await dialog.getByRole('button',{name:'トイレの必要量を確認する',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.locator('#supplyCalcFold').evaluate(n=>n.open),true);
  const people=page.locator('#calcPeople');await people.fill('4');
  await page.locator('#stockCalculator h2 .context-help-button').click();await dialog.waitFor();await close.click();assert.equal(await people.inputValue(),'4');
  await page.evaluate(()=>document.getElementById('stockSetupDialog').showModal());
  await page.locator('#stockSetupPeople').fill('3');
  await page.locator('#stockSetupDialog label[for=stockSetupPeople] .context-help-button').click();await dialog.waitFor();
  await close.click();assert.equal(await page.locator('#stockSetupDialog').evaluate(n=>n.open),true);assert.equal(await page.locator('#stockSetupPeople').inputValue(),'3');
  await page.evaluate(()=>document.getElementById('stockSetupDialog').close());
  await page.goto(base+'?page=learn&focus=bosReason');await dialog.waitFor();assert.match(await dialog.innerText(),/作者のおすすめ/);assert.match(await dialog.innerText(),/課題の条件ではありません/);
  await dialog.getByRole('button',{name:'備蓄ページのおすすめを見る'}).click();assert.equal(await page.locator('#supplyRecommendations').evaluate(n=>n.open),true);
  await page.goto(base+'?page=tidy');const custom=page.locator('#tidy-record-why-custom');await custom.locator(':scope>summary .context-help-button').click();await dialog.waitFor();assert.match(await dialog.innerText(),/通れる場所/);
  await close.click();
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   for(const id of Object.keys(audit.pages)){
    const status=await page.evaluate(id=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());show(id);return {active:activePage,width:document.documentElement.scrollWidth}},id);
    if(status.active===id)assert(status.width<=width,'Page overflow after help buttons: '+id+' at '+width);
   }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: shared searchable help catalogue and contextual dialogs, closed-room click isolation, focus/Escape, preserved checks and inputs, all pages and 100+ topics, nine categories, book labels, field accessibility, nested dialogs, preserved records/inputs, legacy links, action routes and 320/390px');
 }finally{await context.close()}
};
