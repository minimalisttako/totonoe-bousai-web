const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json')));
assert.equal(config.appName, 'ととのえ防災');
assert.equal(config.webDir, 'native-web');
assert(!config.server?.url, 'Production shell must bundle local assets');
assert(!config.server?.cleartext, 'No cleartext override');
const dirs = ['native-web', 'android/app/src/main/assets/public', 'ios/App/App/public'];
const files = ['index.html','manifest.webmanifest','offline-worker.js'];
function walk(dir) { return fs.readdirSync(path.join(root, dir), {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(dir+'/'+e.name) : [dir+'/'+e.name]); }
files.push(...walk('assets'));
for(const dir of dirs) {
  for(const file of files) assert.deepEqual(fs.readFileSync(path.join(root, dir, file)), fs.readFileSync(path.join(root, file)), dir+'/'+file);
  assert(!fs.existsSync(path.join(root, dir, 'tests')));
  assert(!fs.existsSync(path.join(root, dir, 'package-lock.json')));
}
for(const target of ['android/app/src/main/assets/capacitor.config.json','ios/App/App/capacitor.config.json']) {
  const native = JSON.parse(fs.readFileSync(path.join(root, target)));
  assert.equal(native.appId, config.appId);
  assert.equal(native.appName, config.appName);
  assert(!native.server?.url);
}
console.log('PASS: local bundles identical on both platforms; identity matches; no remote URL or test payload. This does not compile or launch native binaries.');
