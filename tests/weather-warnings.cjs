const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
function extract(name){const start=source.indexOf('function '+name+'(');assert(start>=0);const tail=source.slice(start),end=/\n(?:async )?function /.exec(tail);assert(end);return tail.slice(0,end.index);}
const c={Date,Intl};vm.createContext(c);vm.runInContext(['warningRowsForCity','homeWarningModel'].map(extract).join('\n'),c);
const now=Date.parse('2026-11-08T00:00:00Z'),city='1310100',saved={office:'130000',warningCity:city,warningCityName:'千代田区'};
function report(status,delta=0,code='15',group='wind',target=city){return{dataTypeCode:group,reportDatetime:new Date(now+delta).toISOString(),warning:{class20Items:[{areaCode:target,kinds:[{code,status}]}]}};}
function model(reports,loaded=now,online=true){return c.homeWarningModel({office:'130000',reports},saved,loaded,now,online);}
const active=report('発表',-3600000),cancel=report('解除');
assert.equal(c.warningRowsForCity([active,cancel],city).length,0);assert.equal(c.warningRowsForCity([cancel,active],city).length,0);assert.equal(model([active,cancel]).state,'clear');
assert.equal(c.warningRowsForCity([cancel,report('発表',1000)],city).length,1);
const clear=report('発表警報・注意報はなし',0,'00');assert.equal(model([clear]).state,'clear');assert.equal(c.warningRowsForCity([active,clear],city).length,0);
const noCode=report('発表警報・注意報はなし');delete noCode.warning.class20Items[0].kinds[0].code;assert.equal(model([noCode]).state,'clear');
assert.equal(model([report('発表',-1000,'15','wind'),report('発表警報・注意報はなし',0,'00','rain')]).state,'active');
assert.equal(model([report('発表',0,'unknown')]).state,'active');assert(model([report('発表',0,'unknown')]).text.includes('名称未対応'));
assert.equal(model([clear],now-300001).state,'unknown');assert.equal(model([clear],now+60001).state,'unknown');assert.equal(model([clear],now,false).state,'unknown');
assert.equal(model([clear,report('発表警報・注意報はなし',0,'00','rain','9999999')]).state,'unknown');
assert.equal(model([report('発表警報・注意報はなし',-86400001,'00')]).state,'unknown');
assert.equal(model([report('発表警報・注意報はなし',3600001,'00')]).state,'unknown');
const missing=report('解除');missing.warning.class20Items[0].kinds=[];assert.equal(model([missing]).state,'unknown');assert.equal(model([]).state,'unknown');
assert.equal(model([report('発表'),report('解除')]).state,'unknown');assert.equal(model([report('発表'),clear]).state,'unknown');
assert.throws(()=>c.warningRowsForCity([report('解除',0,'15','wind','9999999')],city));
const ambiguous=report('発表');delete ambiguous.dataTypeCode;assert.equal(model([ambiguous,clear]).state,'unknown');
console.log('PASS: latest cancellation and reissue; source-order independence; per-type clear isolation; unknown codes remain active; incomplete/stale/offline/future/conflicting data never yields clear');
