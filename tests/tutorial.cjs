const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||'index.html','utf8');
function extract(name){const start=source.indexOf('function '+name+'(');assert(start>=0,name);const tail=source.slice(start),end=/\n(?:async )?function /.exec(tail);assert(end,name);return tail.slice(0,end.index);}
const store=new Map([['private-record','keep']]);let fail=false;
const elements=new Map();function el(id){if(!elements.has(id))elements.set(id,{textContent:'',open:false,isConnected:true,focus(){},showModal(){this.open=true},close(){this.open=false}});return elements.get(id)}
const routes=[];const c={console,localStorage:{getItem:k=>store.get(k)||null,setItem(k,v){if(fail)throw Error('quota');store.set(k,v)}},document:{getElementById:el,activeElement:el('source')},requestAnimationFrame:fn=>fn(),show:id=>routes.push(id)};vm.createContext(c);
const start=source.indexOf("const tutorialKey="),end=source.indexOf('const moreGroupKey=',start);
for(const name of ['readTutorialState','saveTutorialState','tutorialNeedsGate','renderTutorial','openTutorial','moveTutorial','closeTutorial','pauseTutorial','finishTutorial','openTutorialEmergency'])vm.runInContext(extract(name),c);
vm.runInContext(source.slice(start,end)+"let activePage='more'",c);
assert.equal(c.tutorialNeedsGate('supplies'),true);assert.equal(c.tutorialNeedsGate('emergency'),false);
c.openTutorial();assert(el('tutorialDialog').open);c.moveTutorial(1);c.moveTutorial(1);assert.equal(c.readTutorialState().step,2);
c.openTutorialEmergency();assert.equal(routes.at(-1),'emergency');assert(!c.readTutorialState().completed);assert(c.tutorialNeedsGate('home'));
c.openTutorial();assert(el('tutorialStep').textContent.includes('3 / 4'));c.moveTutorial(1);c.moveTutorial(1);assert.equal(routes.at(-1),'homeSafety');assert(!c.tutorialNeedsGate('supplies'));assert(c.readTutorialState().completed);
c.openTutorial(true);assert(el('tutorialStep').textContent.includes('1 / 4'));c.pauseTutorial();assert.equal(routes.at(-1),'more');assert(c.readTutorialState().completed);
for(const bad of ['bad','null','{"version":1,"step":-1,"completed":false}','{"version":1,"step":4,"completed":false}','{"version":1,"step":0,"completed":"yes"}']){store.set('toto-tutorial-v1',bad);assert.equal(c.readTutorialState().step,0);assert(!c.readTutorialState().completed)}
vm.runInContext('tutorialState={version:1,step:1,completed:false};tutorialSessionUnlocked=false;tutorialReplay=false;',c);c.pauseTutorial();assert(!c.readTutorialState().completed);assert(!c.tutorialNeedsGate('home'));
vm.runInContext('tutorialSessionUnlocked=false;',c);assert(c.tutorialNeedsGate('home'));fail=true;c.finishTutorial(true);assert(!c.tutorialNeedsGate('home'));assert.equal(store.get('private-record'),'keep');
const a=source.indexOf('const pageNames='),b=source.indexOf(';let activePage=',a);const names=vm.runInNewContext(source.slice(a,b)+';pageNames');const x=source.indexOf('const pageMascotGuides='),y=source.indexOf('\nfunction contextualMascotAdvice',x);const guides=vm.runInNewContext(source.slice(x,y)+';pageMascotGuides');for(const id of Object.keys(names))if(id!=='home')assert(guides[id],id);
console.log('PASS: first use, resume, emergency bypass, completion, replay, pause, skip with failed storage, corrupt state, record isolation and mascot coverage for every page.');
