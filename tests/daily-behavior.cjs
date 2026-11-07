const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
function extract(name){const start=source.indexOf('function '+name+'(');assert(start>=0,name);const tail=source.slice(start),end=/\n(?:async )?function /.exec(tail);assert(end,name);return tail.slice(0,end.index);}
const c={Date,console};vm.createContext(c);
vm.runInContext(['cleanResetDue','readCleanPractice','cleanHomeReady','positionCriticalSafetyCard','practiceTopicCatalog','practiceTopicIds','pickPracticeQuestions'].map(extract).join('\n'),c);
function due(date,schedule={resetTime:'05:00',resetDays:2}){return new Date(c.cleanResetDue(date,schedule));}
for(const [completed,expected] of [['2026-11-07T23:59:00','2026-11-09T05:00:00'],['2026-11-07T01:00:00','2026-11-09T05:00:00'],['2026-12-31T22:00:00','2027-01-02T05:00:00'],['2028-02-28T22:00:00','2028-03-01T05:00:00']])assert.equal(due(completed).getTime(),new Date(expected).getTime());
assert.equal(due('2026-11-07T23:00:00',{resetTime:'18:30',resetDays:7}).getTime(),new Date('2026-11-14T18:30:00').getTime());
assert.equal(due('2026-11-07T23:00:00',{resetTime:'05:00'}).getTime(),new Date('2026-11-09T05:00:00').getTime());
const raw={floor:{done:true,at:'2026-11-07T22:00:00'},other:{done:false,at:'2026-11-07T22:00:00'}};
c.readCleanPracticeRaw=()=>raw;c.readCleanSchedule=()=>({resetTime:'05:00',resetDays:2});
let now=new Date('2026-11-09T04:59:59.999').getTime();c.Date=class extends Date{static now(){return now;}};
assert.equal(c.readCleanPractice().floor.done,true);now++;assert.equal(c.readCleanPractice().floor.done,false);assert.equal(raw.floor.done,true);assert.equal(c.readCleanPractice().other.done,false);
let safety=0,tidyDone=6,remaining=0,plan={evPlace:'避難先',evTiming:'判断',evContacts:'連絡'};
c.tidyCounts=()=>({all:6,done:tidyDone});c.homeSafetyCounts=()=>({unknown:safety});c.homeMissionItems=()=>({remaining});c.readEvacuationPlan=()=>plan;c.todayLocalDate=()=> '2026-11-07';c.dateAfterDays=()=> '2026-12-07';
const full=()=>['water','food','toilet'].map(category=>({category,qty:'2',target:'2',exp:'2027-01-01'}));c.supplies=full();assert.equal(c.cleanHomeReady(),true);
for(const alter of [()=>{safety=1},()=>{tidyDone=5},()=>{remaining=1},()=>{plan.evContacts=''},()=>{c.supplies.pop()},()=>{c.supplies[0].qty='0'},()=>{c.supplies[0].exp='2026-12-07'},()=>{c.supplies[0].nextCheck='2026-11-07'},()=>{c.supplies[0].target='3'}]){safety=0;tidyDone=6;remaining=0;plan.evContacts='連絡';c.supplies=full();alter();assert.equal(c.cleanHomeReady(),false);}
let pending=true;const card={dataset:{}},missions={nextElementSibling:null,after(value){assert.equal(value,card);missions.nextElementSibling=card;home.lastElementChild={};}},home={lastElementChild:{},querySelector:()=>missions,append(value){assert.equal(value,card);home.lastElementChild=card;missions.nextElementSibling=null;}};
c.document={getElementById:id=>id==='home'?home:card};c.criticalSafetyState=()=>({remaining:pending?['one']:[]});
c.positionCriticalSafetyCard();assert.equal(card.dataset.priority,'pending');assert.equal(missions.nextElementSibling,card);pending=false;c.positionCriticalSafetyCard();assert.equal(home.lastElementChild,card);assert.equal(card.dataset.priority,'complete');pending=true;c.positionCriticalSafetyCard();assert.equal(missions.nextElementSibling,card);
const start=source.indexOf('const practiceQuestions='),end=source.indexOf('\n',start);vm.runInContext(source.slice(start,end),c);
const total=vm.runInContext('practiceQuestions.length',c);assert.equal(total,30);
vm.runInContext("for(const q of practiceQuestions){if(!q.q||!q.why||q.a.length!==3||!Number.isInteger(q.correct)||q.correct<0||q.correct>2||!q.url.startsWith('https://'))throw Error('Invalid question');}",c);
let seed=123456;const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);const seen=new Set();for(let run=0;run<1000;run++){const ids=c.pickPracticeQuestions(random);assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);for(const id of ids){assert(id>=0&&id<total);seen.add(id);}}
assert.equal(seen.size,30);
console.log('PASS: cleaning reset boundaries/year/leap-day/custom schedule; higher safety and stock needs override cleaning; safety card moves down and returns; 1000 quiz draws each contain five unique questions');
