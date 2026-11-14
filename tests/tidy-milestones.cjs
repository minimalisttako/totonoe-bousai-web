const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(process.argv[2], 'utf8');
let places = [{id:'entry', place:'玄関'}, {id:'kitchen', place:'キッチン'}];
let canSave = true;
const milestones = [];
const storage = new Map();
const status = {};
const context = vm.createContext({
  readTidyPlaces: () => places,
  saveTidyPlaces: next => {
    if (!canSave) return false;
    places = next;
    return true;
  },
  document: {getElementById: id => id === 'tidyActionStatus' ? status : null},
  localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
  renderTidy() {},
  renderPageMascotGuide() {},
  openProgressUnlock: title => milestones.push(title),
  openTidyMilestone: (...args) => milestones.push(args),
  todayLocalDate: () => '2026-11-13',
  activeTidyChecklistId: null,
});
for (const [start, end] of [
  ['function tidyHasSorted(', 'function renderTidy('],
  ['function takeTidyMilestone(', 'function openTidyMilestone('],
  ['function validTidyPhoto(', 'async function prepareTidyPhoto('],
  ['function tidyAlbumRecords(', 'function openTidyAlbumRecord('],
]) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + 1);
  assert.ok(from >= 0 && to > from, start);
  vm.runInContext(source.slice(from, to), context);
}
context.toggleTidyStep('entry', 2, true);
assert.equal(places[0].stepChecks, undefined);
context.toggleTidyStep('entry', 0, true);
canSave = false;
context.toggleTidyStep('entry', 1, true);
assert.equal(context.tidyHasSorted(places[0]), false);
assert.deepEqual(milestones, []);
canSave = true;
context.toggleTidyStep('entry', 1, true);
assert.equal(context.tidyHasSorted(places[0]), true);
assert.equal(context.tidyHasSorted({done:true}), true);
assert.equal(context.tidyHasSorted(places[1]), false);
context.toggleTidyStep('kitchen', 2, true);
assert.equal(places[1].stepChecks, undefined);
context.toggleTidyStep('kitchen', 0, true);
context.toggleTidyStep('kitchen', 1, true);
assert.deepEqual(milestones, [['set', '玄関', 'entry']]);
assert.match(status.textContent, /キッチン.*解放/);

assert.equal(context.minimalistGuideIsUnlocked(), false);
for (const index of [2, 3]) context.toggleTidyStep('entry', index, true);
context.toggleTidyStep('kitchen', 2, true);
assert.equal(context.minimalistGuideIsUnlocked(), false);
context.toggleTidyStep('kitchen', 3, true);
assert.equal(context.minimalistGuideIsUnlocked(), true);
assert.equal(milestones.at(-1), 'ミニマリストのススメ');
context.toggleTidyStep('kitchen', 3, false);
assert.equal(context.minimalistGuideIsUnlocked(), false);
places = [];
assert.equal(context.minimalistGuideIsUnlocked(), false);

const photo = 'data:image/jpeg;base64,AAAA';
assert.equal(context.tidyAlbumRecords([{beforePhoto:photo}], true).length, 0);
assert.equal(context.tidyAlbumRecords([{beforePhoto:photo, afterPhoto:photo}], true).length, 1);
assert.equal(context.takeTidyMilestone('album'), true);
assert.equal(context.takeTidyMilestone('album'), false);
console.log('PASS: tidy unlock per location, failed save, legacy records, photo pair and one-time milestone');
