const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
const aliases=source.match(/const allBackupKeys=(\[[^;]+\]);/)[1];
const declarations=aliases.slice(1,-1).split(',').filter(k=>!k.startsWith("'")).map(k=>{const value=source.match(new RegExp('\\b'+k+"='([^']+)'"));if(!value)throw Error('Missing key '+k);return 'const '+k+'='+JSON.stringify(value[1])+';'}).join('\n');
function extract(name){const at=source.indexOf('function '+name+'(');assert(at>=0,name);const tail=source.slice(at),end=/\n(?:async )?function /.exec(tail);assert(end,name+' boundary');return tail.slice(0,end.index)}
const dataStore=new Map(),ctx={TextEncoder,localStorage:{getItem:k=>dataStore.get(k)??null}};vm.createContext(ctx);
vm.runInContext(declarations+'\nconst allBackupKeys='+aliases+';\n'+['backupUtf8ByteLength','buildFullBackup','isEmergencyChecklistData','validateFullBackupObject','validSupplyMeasure','validTidyPhoto','validWeatherPreference','validEventSearchSettings','validPracticeResult','cleanPracticeDefinitions','validCleanPractice','validCleanSchedule','validFamilyNotes','validTrainingRecords','applyValidatedRestoreToStorage'].map(extract).join('\n'),ctx);
const when='2026-11-07T12:00:00.000Z',photo='data:image/jpeg;base64,YWJj';
const fixtures={
 'toto-supplies-v1':[{name:'トイレ用品',qty:'2',category:'toilet',measureFactor:'50'}],
 'toto-stock-days-v1':{mode:'7',customDays:'',people:4},
 'toto-tidy-v1':[{id:'test',place:'玄関',beforePhoto:photo,afterPhoto:photo,done:true}],
 'toto-family-profiles-v1':[{id:'family-test',type:'adult',label:'家族A',count:1,suppliesNote:'予備の眼鏡',supportNote:'付き添い',foodNote:'食品の確認'}],
 'toto-weather-location-v1':{office:'130000',area:'130010',station:'44132',warningCity:'1310100',warningCityName:'千代田区'},
 'toto-event-search-v1':{pref:'東京都',city:'千代田区',kind:'防災 イベント',month:'2026-11'},
 'toto-practice-result-v1':{version:1,total:5,score:4,wrong:[14],completedAt:when},
 'toto-clean-practice-v1':{floor:{done:true,at:when}},
 'toto-clean-schedule-v1':{resetTime:'05:00',resetDays:2},
 'toto-rest-settings-v1':{enabled:false}
};
for(const [k,v] of Object.entries(fixtures))dataStore.set(k,JSON.stringify(v));
const exported=ctx.buildFullBackup();ctx.backupInput=exported;
const checked=vm.runInContext('validateFullBackupObject(JSON.parse(backupInput))',ctx);
assert.equal(checked.keys.length,10);
function storage(map){return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}}
const dest=new Map([['unrelated','preserve']]);let result=ctx.applyValidatedRestoreToStorage(checked.data,checked.keys,storage(dest));assert(result.ok);
for(const [k,v] of dataStore)assert.equal(dest.get(k),v);assert.equal(dest.get('unrelated'),'preserve');
const before=new Map(checked.keys.map((k,i)=>[k,'original-'+i])),failedDest=new Map(before);let once=false;const failing=storage(failedDest);failing.setItem=(k,v)=>{if(k===checked.keys[2]&&!once){once=true;throw Error('quota')}failedDest.set(k,v)};
result=ctx.applyValidatedRestoreToStorage(checked.data,checked.keys,failing);assert(!result.ok&&result.rolledBack);assert.deepEqual(failedDest,before);
const silentDest=new Map(before),silent=storage(silentDest);silent.setItem=(k,v)=>{if(k===checked.keys[1]&&v===checked.data[k])return;silentDest.set(k,v)};result=ctx.applyValidatedRestoreToStorage(checked.data,checked.keys,silent);assert(!result.ok&&result.rolledBack);assert.deepEqual(silentDest,before);
let writes=0;result=ctx.applyValidatedRestoreToStorage(checked.data,checked.keys,{getItem(){throw Error('blocked')},setItem(){writes++},removeItem(){writes++}});assert(result.readFailed);assert.equal(writes,0);
function validate(payload){ctx.backupInput=JSON.stringify(payload);return vm.runInContext('validateFullBackupObject(JSON.parse(backupInput))',ctx)}
const malicious=JSON.parse(exported);const tidy=JSON.parse(malicious.data['toto-tidy-v1']);tidy[0].beforePhoto='https://invalid.example/p.jpg';malicious.data['toto-tidy-v1']=JSON.stringify(tidy);assert.throws(()=>validate(malicious));
const oversized=JSON.parse(exported);oversized.data['toto-tidy-v1']='x'.repeat(2100000);assert.throws(()=>validate(oversized));
validate({format:'toto-full-backup-v1',data:{'toto-supplies-v1':'[]'}});
console.log('PASS: 10 data types roundtrip including photo strings, household notes and warning city; unrelated data preserved; quota and silent-write rollback; read failure performs no writes; invalid photo/oversize rejected; legacy backup accepted.');

const movingData={'toto-moving-v1':JSON.stringify({risk:true,route:false,backup:true})};
const movingValidated=validate({format:'toto-full-backup-v1',data:movingData});
const movingDest=new Map();assert(ctx.applyValidatedRestoreToStorage(movingValidated.data,movingValidated.keys,storage(movingDest)).ok);
assert.equal(movingDest.get('toto-moving-v1'),movingData['toto-moving-v1']);
for(const invalid of ['null','[]','{"risk":"yes"}','{"unknown":true}'])assert.throws(()=>validate({format:'toto-full-backup-v1',data:{'toto-moving-v1':invalid}}));
vm.runInContext(['movingChecklistGroups','readMovingChecklist','setMovingCheck'].map(extract).join('\n'),ctx);
ctx.localStorage=storage(movingDest);const movingStatus={};ctx.document={getElementById:()=>movingStatus};ctx.renderMovingChecklist=()=>{};
ctx.verifiedSaveJson=(k,v)=>{movingDest.set(k,JSON.stringify(v));return true};
ctx.setMovingCheck('route',true);assert.equal(JSON.parse(movingDest.get('toto-moving-v1')).route,true);
vm.runInContext('readMovingChecklist()',ctx);assert.equal(ctx.readMovingChecklist().risk,true);
ctx.setMovingCheck('route',false);assert.equal(ctx.readMovingChecklist().route,false);
movingDest.set('toto-moving-v1','{broken');ctx.setMovingCheck('risk',true);assert.equal(movingDest.get('toto-moving-v1'),'{broken');
assert.equal(ctx.movingChecklistGroups().flat().length,12);
console.log('PASS: moving checklist 12 tasks; save/reopen/uncheck; full-backup restoration; invalid state rejected and protected');

const trainingPayload=validate({format:'toto-full-backup-v1',data:{'toto-evacuation-drills-v1':JSON.stringify([{date:'2026-11-07',type:'非常用トイレを試用',note:'確認した点'}])}});
const trainingDest=new Map();assert(ctx.applyValidatedRestoreToStorage(trainingPayload.data,trainingPayload.keys,storage(trainingDest)).ok);
assert.equal(JSON.parse(trainingDest.get('toto-evacuation-drills-v1'))[0].note,'確認した点');
assert.throws(()=>validate({format:'toto-full-backup-v1',data:{'toto-evacuation-drills-v1':JSON.stringify([{date:'2026-02-30',type:'訓練'}])}}));
console.log('PASS: training backup preserves notes and rejects nonexistent calendar dates');

const expandedQuiz=validate({format:'toto-full-backup-v1',data:{'toto-practice-result-v1':JSON.stringify({version:1,total:5,score:4,wrong:[29],completedAt:when})}});
const expandedDest=new Map();assert(ctx.applyValidatedRestoreToStorage(expandedQuiz.data,expandedQuiz.keys,storage(expandedDest)).ok);assert.equal(JSON.parse(expandedDest.get('toto-practice-result-v1')).wrong[0],29);
assert.throws(()=>validate({format:'toto-full-backup-v1',data:{'toto-practice-result-v1':JSON.stringify({version:1,total:5,score:4,wrong:[30],completedAt:when})}}));
console.log('PASS: expanded-bank wrong-answer IDs survive backup/restore; out-of-range question IDs rejected');

const emergencyValidated=validate({format:'toto-full-backup-v1',data:{'toto-emergency-checklist-v1':JSON.stringify({items:['確認A','確認B'],checked:{確認A:true,確認B:false}})}});
const emergencyDest=new Map();assert(ctx.applyValidatedRestoreToStorage(emergencyValidated.data,emergencyValidated.keys,storage(emergencyDest)).ok);assert.equal(JSON.parse(emergencyDest.get('toto-emergency-checklist-v1')).checked['確認A'],true);
for(const state of [{items:['同じ','同じ'],checked:{}},{items:['確認'],checked:{確認:'yes'}}])assert.throws(()=>validate({format:'toto-full-backup-v1',data:{'toto-emergency-checklist-v1':JSON.stringify(state)}}));
console.log('PASS: emergency checklist backup preserves boolean confirmation state and rejects duplicate items or non-boolean confirmations');

for(const mode of ['auto','fixed','hidden']){const data={'toto-mascot-speech-v1':JSON.stringify(mode)};const checked=validate({format:'toto-full-backup-v1',data});assert.equal(checked.data['toto-mascot-speech-v1'],JSON.stringify(mode));}
assert.throws(()=>validate({format:'toto-full-backup-v1',data:{'toto-mascot-speech-v1':JSON.stringify('invalid')}}));
dataStore.clear();ctx.localStorage=storage(dataStore);dataStore.set('toto-mascot-speech-v1','hidden');const speechExport=JSON.parse(ctx.buildFullBackup());assert.equal(speechExport.data['toto-mascot-speech-v1'],JSON.stringify('hidden'));assert.equal(dataStore.get('toto-mascot-speech-v1'),'hidden');
console.log('PASS: all three speech preferences validate; invalid mode rejected; legacy raw preference exports without changing stored data');
