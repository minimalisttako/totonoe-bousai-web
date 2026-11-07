const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
function extract(name){const start=source.indexOf('function '+name+'(');assert(start>=0);const tail=source.slice(start),end=/\n(?:async )?function /.exec(tail);assert(end);return tail.slice(0,end.index);}
let status='',shouldSave=true;const ctx={todayLocalDate:()=> '2026-11-07',renderSupplies:()=>{},setStorageStatus:s=>status=s,saveSaved:()=>shouldSave,key:'supplies'};vm.createContext(ctx);
vm.runInContext(['replenishmentNeeds','supplyReplenishmentChange','applySupplyReplenishment','formatReplenishmentList'].map(extract).join('\n'),ctx);
const item={name:'保存食',qty:'3',target:'10',unit:'袋',exp:'2027-01-01',location:'非公開の保管場所',category:'food',measureFactor:'2'};
assert.equal(ctx.supplyReplenishmentChange(item,'2','2026-11-07').qty,'5');assert.equal(item.qty,'3');
for(const raw of ['0','-1','1.5','','bad','99999'])assert.equal(ctx.supplyReplenishmentChange(item,raw,'2026-11-07'),null);
assert.equal(ctx.supplyReplenishmentChange({...item,exp:'2026-11-06'},'1','2026-11-07'),null);
assert.equal(ctx.supplyReplenishmentChange({...item,qty:'99998'},'1','2026-11-07').qty,'99999');
ctx.supplies=[item];assert(ctx.applySupplyReplenishment(0,'2'));assert.equal(ctx.supplies[0].qty,'5');assert.equal(ctx.supplies[0].target,'10');assert.equal(ctx.supplies[0].measureFactor,'2');
assert.equal(ctx.replenishmentNeeds(ctx.supplies)[0].missing,5);assert(ctx.formatReplenishmentList(ctx.supplies).includes('あと 5袋'));assert(!ctx.formatReplenishmentList(ctx.supplies).includes('非公開'));
shouldSave=false;assert.equal(ctx.applySupplyReplenishment(0,'1'),false);assert.equal(ctx.supplies[0].qty,'5');
shouldSave=true;assert(ctx.applySupplyReplenishment(0,'5'));assert.equal(ctx.replenishmentNeeds(ctx.supplies).length,0);
assert.equal(ctx.replenishmentNeeds([{...item,target:''}]).length,0);
assert(ctx.formatReplenishmentList([{...item,exp:'2020-01-01'}]).includes('期限切れ'));
console.log('PASS: partial replenishment, remaining shortage, full replenishment, rejected invalid/expired/overflow values, failed save keeps memory, conversion fields preserved, shopping memo omits location');
