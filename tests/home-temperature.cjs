const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||'index.html','utf8');
function extract(name){const start=source.indexOf('function '+name+'('),tail=source.slice(start),end=/\n(?:async )?function /.exec(tail);assert(start>=0&&end,name);return tail.slice(0,end.index)}
const c={Date,Intl};vm.createContext(c);vm.runInContext(['jstWeatherDay','weatherTemperatureRows','homeWeatherTemperatureSummary'].map(extract).join('\n'),c);
const now=Date.parse('2026-11-08T08:00:00+09:00');const data=[{reportDatetime:'2026-11-08T05:00:00+09:00',timeSeries:[{timeDefines:['2026-11-08T00:00:00+09:00','2026-11-08T09:00:00+09:00','2026-11-09T00:00:00+09:00','2026-11-09T09:00:00+09:00'],areas:[{area:{code:'44132'},temps:['-2','0','5','12']}]}]}];
assert.equal(c.homeWeatherTemperatureSummary(data,'44132',now),'今日 最高 0℃ ／ 最低 -2℃');data[0].timeSeries[0].areas[0].temps[0]='';assert(c.homeWeatherTemperatureSummary(data,'44132',now).includes('最低 予報なし'));assert(!c.homeWeatherTemperatureSummary(data,'44132',now).includes('12℃'));
assert.equal(c.homeWeatherTemperatureSummary(data,'unknown',now),'最高・最低 未取得');assert.equal(c.homeWeatherTemperatureSummary(data,'44132',now+48*3600000),'気温：更新が必要');data[0].reportDatetime='bad';assert.equal(c.homeWeatherTemperatureSummary(data,'44132',now),'気温：更新が必要');
console.log('PASS: home uses selected station, today-only forecast, zero/negative values, missing minimum, stale and invalid issue times.');
