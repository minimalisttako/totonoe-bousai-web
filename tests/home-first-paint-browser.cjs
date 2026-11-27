const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const scripts=[...fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').matchAll(/<script src="\.\/assets\/((?:experience|stories)-v\d+\.js)"/g)].map(match=>match[1]);
const experience=scripts.find(name=>name.startsWith('experience-'));
assert(experience&&scripts.length===2,'Expected versioned home scripts');
module.exports=async(browser,base)=>{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.addInitScript(()=>{
  localStorage.setItem('toto-tutorial-v1',JSON.stringify({version:3,step:1,completed:true,startup:'done'}));
  localStorage.setItem('toto-stories-v1',JSON.stringify({version:1,introductions:false,unlocked:[],read:[],introduced:[]}));
  localStorage.setItem('toto-weather-location-v1',JSON.stringify({office:'400000',area:'400010',station:'',warningCity:'4013000'}));
  localStorage.setItem('totonoe-hazard-confirmed','4013000');
 });
 let release,started;
 const gate=new Promise(resolve=>release=resolve),requestStarted=new Promise(resolve=>started=resolve);
 await context.route('**/*',async route=>{
  const url=route.request().url();
  if(new URL(url).pathname.endsWith('/assets/'+experience)){started();await gate;return route.continue()}
  return url.startsWith(base)?route.continue():route.abort();
 });
 const page=await context.newPage();
 try{
  const navigation=page.goto(base);await requestStarted;
  // CSS must protect the first paint before the external tree renderer can execute.
  await page.locator('#home .game-mascot-scene').waitFor({state:'attached'});
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.locator('#home .game-mascot-scene>.character-art:visible').count(),0);
   assert.equal(await page.locator('#home .anime-approved-home-image:visible').count(),0);
   assert.equal(await page.locator('#homePreparednessTree').count(),0);
   assert.deepEqual(await page.locator('#home .game-mascot-scene').evaluate(n=>[getComputedStyle(n).backgroundImage,getComputedStyle(n,'::before').display,getComputedStyle(n,'::after').display]),['none','none','none']);
  }
  release();await navigation;await page.locator('#homePreparednessTree').waitFor();
  assert.equal(await page.locator('#home .game-mascot-scene>.character-art:visible').count(),0);
  await page.evaluate(()=>show('emergency'));
  assert.equal(await page.locator('#emergency .emergency-mascot-image:visible').count(),1,'Emergency-page mascot must remain visible');
 }finally{release();await context.close()}
 // Even a failed renderer must not revive the previous home illustration.
 const failed=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await failed.route('**/*',route=>{
  const url=route.request().url();
  if(scripts.some(name=>new URL(url).pathname.endsWith('/assets/'+name)))return route.abort();
  return url.startsWith(base)?route.continue():route.abort();
 });
 try{
  const page=await failed.newPage();await page.goto(base);
  assert.equal(await page.locator('#home .game-mascot-scene>.character-art:visible').count(),0);
  assert.equal(await page.locator('#home .anime-approved-home-image:visible').count(),0);
  assert.deepEqual(await page.locator('#home .game-mascot-scene').evaluate(n=>[getComputedStyle(n).backgroundImage,getComputedStyle(n,'::before').display,getComputedStyle(n,'::after').display]),['none','none','none']);
 }finally{await failed.close()}
 console.log('PASS: legacy home art never paints during delayed/failed tree loading at 320/390px; tree and other-page characters remain visible');
};
