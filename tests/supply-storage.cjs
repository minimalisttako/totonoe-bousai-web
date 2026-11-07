const assert=require('assert'),vm=require('vm');let raw=null;const ctx={key:'supplies',localStorage:{getItem:()=>raw,setItem:(k,v)=>raw=v}};vm.createContext(ctx);const fs=require('fs'),path=require('path');const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');const start=source.indexOf('function validStoredSupplies('),end=source.indexOf('const tasks=',start);assert(start>=0&&end>start);vm.runInContext(source.slice(start,end),ctx);

for(const bad of ['{','null','{}','[null]','[{"name":"水","qty":"bad"}]','']){raw=bad;assert.equal(ctx.readSaved('supplies',[]).length,0);assert.equal(ctx.saveSaved('supplies',[{name:'水',qty:'1'}]),false);assert.equal(raw,bad);}
raw=null;assert.equal(ctx.saveSaved('supplies',[{name:'水',qty:'1'}]),true);
raw='[null]';assert.equal(ctx.saveSaved('supplies',[{name:'食料',qty:'2'}],true),true);assert.equal(JSON.parse(raw)[0].name,'食料');
raw='[null]';assert.equal(ctx.saveSaved('supplies',[null],true),false);assert.equal(raw,'[null]');
console.log('PASS: malformed JSON and invalid records remain untouched; normal save and explicit valid restore succeed');
