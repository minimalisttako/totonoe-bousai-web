const assert = require('node:assert/strict');
const {validPreferences,removedRecord,putBack,useSoon,validDate,calendarText} = require('../assets/experience-v226.js');
const preferences={simple:false,reminders:true,favorites:['more','supplies']};
assert.equal(validPreferences(preferences),true);
assert.equal(validPreferences({...preferences,favorites:['more','more']}),false);
assert.equal(validPreferences({...preferences,favorites:['javascript:alert(1)']}),false);
assert.equal(validPreferences({...preferences,safetyCheck:'2026-02-30'}),false);
assert.equal(validPreferences({...preferences,deviceNotifications:'yes'}),false);
assert.equal(validDate('2028-02-29'),true);assert.equal(validDate('2026-02-29'),false);
const a={id:'a',place:'台所',beforePhoto:'original-photo'},b={id:'b',place:'玄関'},c={id:'c',place:'寝室'};
assert.deepEqual(removedRecord([a,b],[b]),{item:a,index:0});
assert.equal(removedRecord([a,b],[{...b,place:'変更'}]),null);
assert.equal(removedRecord([a,b],[]),null);
assert.deepEqual(putBack([b,c],{item:a,index:0}),[a,b,c]);
assert.throws(()=>putBack([a,b],{item:a,index:0}),/already-present/);
const supply={name:'水',qty:'2',unit:'本'};
assert.deepEqual(removedRecord([supply,supply],[supply]),{item:supply,index:1});
const items=[{name:'食品',qty:1,category:'food',exp:'2026-12-02'},{name:'水',qty:0,category:'water',exp:'2026-11-25'},
 {name:'期限切れ',qty:1,category:'food',exp:'2026-11-01'},{name:'日付不正',qty:1,category:'food',exp:'2026-11-31'},
 {name:'食品2',qty:3,category:'food',exp:'2026-11-24'}];
assert.deepEqual(useSoon(items,'2026-11-22','2026-12-22').map(x=>x.index),[4,0]);
const calendar=calendarText([{id:'a',date:'2026-12-01',title:'水, 食品;確認\n次の行',description:'家族で確認'.repeat(20)}],'20261122T000000Z');
assert.ok(calendar.includes('DTSTART:20261201T000000Z'));
assert.ok(calendar.includes('BEGIN:VALARM\r\nTRIGGER:PT0M'));
assert.ok(calendar.includes('水\\, 食品\\;確認\\n次の行'));
assert.ok(calendar.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
assert.equal(calendar.split('BEGIN:VEVENT').length,2);
console.log('PASS: record-level deletion restore, preserved newer records/photos, preferences validation, expiry selection and UTF-8 folded calendar alarms');
