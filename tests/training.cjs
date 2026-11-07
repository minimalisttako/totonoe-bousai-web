const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
function extract(name){const start=source.indexOf('function '+name+'(');assert(start>=0);const tail=source.slice(start),end=/\n(?:async )?function /.exec(tail);assert(end);return tail.slice(0,end.index);}
let raw=null,saveOK=true;const fields={drillDate:{value:'2026-11-07'},drillType:{value:'非常用トイレを試用'},drillNote:{value:'次回の確認点'},drillStatus:{textContent:''},trainingHistoryFilter:{value:''}};
const c={evacuationDrillKey:'drill',localStorage:{getItem:()=>raw},todayLocalDate:()=> '2026-11-07',document:{getElementById:id=>fields[id]},renderEvacuationDrills:()=>{},verifiedSaveJson:(k,v)=>{if(!saveOK)return false;raw=JSON.stringify(v);return true}};vm.createContext(c);
vm.runInContext(['validTrainingRecords','readEvacuationDrills','saveEvacuationDrill','filteredTrainingRecords'].map(extract).join('\n'),c);
assert.equal(c.readEvacuationDrills().length,0);c.saveEvacuationDrill({preventDefault(){}});assert.equal(c.readEvacuationDrills()[0].type,'非常用トイレを試用');assert.equal(fields.drillNote.value,'');
const first=raw;fields.drillDate.value='2026-11-08';c.saveEvacuationDrill({preventDefault(){}});assert.equal(raw,first);
fields.drillDate.value='2026-02-30';c.saveEvacuationDrill({preventDefault(){}});assert.equal(raw,first);
fields.drillDate.value='2026-11-07';fields.drillNote.value='保存失敗時に残る';saveOK=false;c.saveEvacuationDrill({preventDefault(){}});assert.equal(raw,first);assert.equal(fields.drillNote.value,'保存失敗時に残る');saveOK=true;
raw='{broken';c.saveEvacuationDrill({preventDefault(){}});assert.equal(raw,'{broken');
const legacy={date:'2025-01-01',type:'避難訓練を実施'};assert(c.validTrainingRecords([legacy]));
raw=JSON.stringify(Array(200).fill(legacy));const full=raw;c.saveEvacuationDrill({preventDefault(){}});assert.equal(raw,full);assert.equal(c.readEvacuationDrills().length,200);
assert(!c.validTrainingRecords(Array(201).fill(legacy)));assert(!c.validTrainingRecords([{...legacy,note:'x'.repeat(401)}]));
const records=[legacy,{date:'2026-11-07',type:'備蓄食料を試食',note:'後'},{date:'2026-11-07',type:'備蓄食料を試食',note:'最新'}];const sorted=c.filteredTrainingRecords(records,'備蓄食料を試食');assert.equal(sorted.length,2);assert.equal(sorted[0].note,'最新');assert.equal(records[0],legacy);
console.log('PASS: training save/reopen; old records retained; date validation; failure keeps inputs; corrupt state and 200-record cap preserve originals; stable date sorting and category filtering');
