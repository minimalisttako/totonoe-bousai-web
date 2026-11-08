const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'native-web');
// A local, reproducible bundle. Do not include test records, docs or credentials.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('<head>') || !html.includes('</head>')) throw Error('Missing app entry');
fs.rmSync(out, {recursive:true, force:true});
fs.mkdirSync(out, {recursive:true});
fs.writeFileSync(path.join(out, 'index.html'), html);
for (const file of ['manifest.webmanifest', 'offline-worker.js']) fs.copyFileSync(path.join(root,file),path.join(out,file));
fs.cpSync(path.join(root, 'assets'), path.join(out, 'assets'), {recursive:true});
console.log('Prepared bundled web assets in native-web; no remote server URL configured.');
