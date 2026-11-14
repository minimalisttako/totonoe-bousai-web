const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
function extract(name){const start=source.indexOf('function '+name+'(');assert(start>=0);const tail=source.slice(start),end=/\n(?:async )?function /.exec(tail);assert(end);return tail.slice(0,end.index);}
const calls=[];const body={},fold={tagName:'DETAILS',open:false,parentElement:body},target={parentElement:fold,scrollIntoView(){calls.push('scroll')},setAttribute(){},focus(){calls.push('focus')}};
const c={show:id=>calls.push(id),openFullBackupFromReadiness:()=>calls.push('backup'),openStockCalculator:()=>calls.push('calculator'),document:{body,getElementById:id=>id==='replenishmentList'?target:null}};vm.createContext(c);
vm.runInContext(['appFeatureCatalog','normalizeFeatureQuery','findAppFeatures','openFeatureResult'].map(extract).join('\n'),c);
const catalog=c.appFeatureCatalog();assert.equal(catalog.length,24);assert.equal(new Set(catalog.map(x=>x.id)).size,24);for(const item of catalog)assert(source.includes('id="'+item.page+'"'),item.page);
for(const [query,id] of [['掃除','clean'],['自動解除','clean'],['地域','weather'],['市区町村','weather'],['補充','replenish'],['買い足し','replenish'],['家族 訓練','training'],['ＢＥＦＯＲＥ','album'],['　機種変更　','backup'],['引っ越し','moving']])assert(c.findAppFeatures(query).some(x=>x.id===id),query);
assert.equal(c.findAppFeatures(' ').length,0);assert.equal(c.findAppFeatures('<script>alert(1)</script>').length,0);assert.equal(c.findAppFeatures('存在しない検索語').length,0);
c.openFeatureResult('backup');assert.equal(calls.pop(),'backup');c.openFeatureResult('calculator');assert.equal(calls.pop(),'calculator');c.openFeatureResult('clean');assert.equal(calls.pop(),'cleanPractice');c.openFeatureResult('replenish');assert.equal(fold.open,true);assert(calls.includes('supplies'));assert(calls.includes('focus'));
const count=calls.length;c.openFeatureResult('invalid');assert.equal(calls.length,count);
c.activePage="supplies";const calcFold={open:false};c.document.getElementById=id=>id==='supplyCalcFold'?calcFold:{scrollIntoView(){}};c.initStockCalculator=()=>{};vm.runInContext(extract('openStockCalculator'),c);c.openStockCalculator();assert.equal(calcFold.open,true);
console.log('PASS: 24 valid destinations; Japanese aliases, full-width text and AND queries; empty/no-match input; direct backup/calculator/replenishment access; calculator fold opens');
