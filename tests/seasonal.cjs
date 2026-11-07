const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
function extract(name){const start=source.indexOf('function '+name+'(');assert(start>=0);const tail=source.slice(start),end=/\n(?:async )?function /.exec(tail);assert(end);return tail.slice(0,end.index);}
let raw=JSON.stringify({'hot:water':{status:'done',checkedAt:'2025-11-07'},'hot:heat':{status:'na',checkedAt:'2026-10-01'},'hot:food':{status:'done',checkedAt:'2026-11-06'}}),saveOK=true,savedType='cold';const status={};
const c={Date,todayLocalDate:()=> '2026-11-07',seasonalKey:'season',seasonalSelectedKey:'selection',localStorage:{getItem:k=>k==='selection'?savedType:raw},verifiedSaveJson:(k,v)=>{if(!saveOK)return false;raw=JSON.stringify(v);return true},renderSeasonalCheck:()=>{},document:{getElementById:()=>status}};vm.createContext(c);
const start=source.indexOf('const seasonalTemplates='),end=source.indexOf('function readSeasonalState',start);assert(start>=0&&end>start);
vm.runInContext(source.slice(start,end)+'\n'+['readSeasonalState','seasonalNeedsReview','suggestedSeasonalType','homeSeasonalType','seasonCounts','setSeasonalStatus'].map(extract).join('\n'),c);
assert.equal(c.seasonalNeedsReview({status:'done',checkedAt:'2025-11-07'},'2026-11-06'),false);assert.equal(c.seasonalNeedsReview({status:'done',checkedAt:'2025-11-07'},'2026-11-07'),true);
for(const checkedAt of [undefined,'bad','2026-02-30','2027-01-01'])assert.equal(c.seasonalNeedsReview({status:'done',checkedAt},'2026-11-07'),true);
assert.equal(c.seasonalNeedsReview({status:'done',checkedAt:'2024-02-29'},'2025-02-28'),false);assert.equal(c.seasonalNeedsReview({status:'done',checkedAt:'2024-02-29'},'2025-03-01'),true);
assert.equal(c.seasonCounts('hot').review,1);assert.equal(c.seasonCounts('hot').done,1);assert.equal(c.seasonCounts('hot').na,1);assert.equal(c.seasonCounts('hot').unchecked,1);
const before=raw;c.seasonCounts('hot');assert.equal(raw,before);c.setSeasonalStatus('hot','water','done');assert.equal(c.seasonCounts('hot').review,0);assert.equal(JSON.parse(raw)['hot:water'].checkedAt,'2026-11-07');assert.equal(JSON.parse(raw)['hot:heat'].status,'na');
saveOK=false;const stable=raw;c.setSeasonalStatus('hot','food','na');assert.equal(raw,stable);assert(status.textContent.includes('保存できません'));
assert.equal(c.suggestedSeasonalType(new Date('2026-11-07T12:00:00')),'cold');assert.equal(c.suggestedSeasonalType(new Date('2026-07-07T12:00:00')),'hot');assert.equal(c.suggestedSeasonalType(new Date('2026-04-07T12:00:00')),'rain');assert.equal(c.homeSeasonalType(),'cold');savedType='regular';assert.equal(c.homeSeasonalType(),'regular');
console.log('PASS: seasonal yearly boundaries and leap day; unknown/invalid dates require review; counts separate stale entries; old data retained; reconfirm refreshes date; failed save reported; explicit seasonal selection respected');
