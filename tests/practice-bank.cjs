const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
function extract(name){const at=source.indexOf('function '+name+'(');assert(at>=0,name);const tail=source.slice(at),end=/\n(?:async )?function /.exec(tail);assert(end,name);return tail.slice(0,end.index)}
const at=source.indexOf('const practiceQuestions='),end=source.indexOf('\n',at),c={};vm.createContext(c);vm.runInContext(source.slice(at,end)+'\n'+['practiceTopicCatalog','practiceTopicIds','validPracticeResult','findPracticeExplanations'].map(extract).join('\n'),c);
const bank=JSON.parse(vm.runInContext('JSON.stringify(practiceQuestions)',c));assert.equal(bank.length,30);assert.equal(new Set(bank.map(q=>q.q)).size,30);
assert.equal(crypto.createHash('sha256').update(JSON.stringify(bank.slice(0,15))).digest('hex'),'b21409fb4db27c6a805e8efcf6fd9bf3cf900027ea3c92ed8f96dc8567f4d0f2');
const counts=[0,0,0];for(const q of bank.slice(15)){assert.equal(q.a.length,3);assert.equal(new Set(q.a).size,3);assert(Number.isInteger(q.correct)&&q.correct>=0&&q.correct<3);counts[q.correct]++;assert(q.why.length>20);assert(q.lesson.match(/^第\d+講 /));assert.equal(q.checkedAt,'2026-11-08');const host=new URL(q.url).hostname;assert(host==='bousaisi.jp'||host.endsWith('.go.jp'),q.url);}assert.deepEqual(counts,[5,5,5]);
function result(wrong){return {version:1,total:5,score:5-wrong.length,wrong,completedAt:'2026-11-08T00:00:00Z'}}
for(const wrong of [[14],[15],[29],[15,16,17,18,29],[]])assert(c.validPracticeResult(result(wrong)));
for(const wrong of [[30],[-1],[15,15],[1.2]])assert(!c.validPracticeResult(result(wrong)));
assert(c.findPracticeExplanations('第14講').includes(23));assert(c.findPracticeExplanations('BCP').includes(23));assert(c.findPracticeExplanations('地区防災計画').includes(24));
assert(source.includes('全30問の解説を読む・検索する'));assert(source.includes('30種類の例題'));
console.log('PASS: 30 unique three-choice questions; legacy 15 IDs/content unchanged; new official sources/curriculum/date metadata; balanced correct positions; old and new result IDs valid; out-of-bank/duplicate IDs rejected; topic search');
