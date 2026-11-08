const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||'index.html','utf8');const start=source.indexOf('function homeSceneTime('),end=source.indexOf('\nfunction renderHomeSceneTime',start);const c={Date,Intl};vm.createContext(c);vm.runInContext(source.slice(start,end),c);
for(const [time,expected] of [['04:59','night'],['05:00','morning'],['08:59','morning'],['09:00','day'],['15:59','day'],['16:00','evening'],['18:59','evening'],['19:00','night'],['23:59','night'],['00:00','night']])assert.equal(c.homeSceneTime(Date.parse('2026-11-08T'+time+':00+09:00')),expected,time);
assert.equal(c.homeSceneTime(Date.parse('2026-11-07T20:00:00Z')),'morning');
const scene=source.slice(source.indexOf('<div class="game-mascot-scene" role="img"'),source.indexOf('<div class="game-dialogue"'));
assert.deepEqual([...scene.matchAll(/class="game-mascot (\w+) character-art"/g)].map(m=>m[1]),['tricera','octo','bird']);
console.log('PASS: Japan-time boundaries, UTC day crossing and Tricera/Tako/Bird ordering.');
