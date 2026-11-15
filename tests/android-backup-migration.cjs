const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require(process.env.TOTO_PLAYWRIGHT_PATH || 'playwright');

const appId = 'jp.minimalisttako.totonoebousai';
const android = path.resolve(__dirname, '../android');
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', timeout: 30000 }).trim();

async function exportWebBackup() {
 const browser = await chromium.launch({ executablePath: process.env.TOTO_CHROMIUM_PATH || undefined });
 try {
  const page = await browser.newPage();
  const url = 'http://localhost:19434/';
  await page.route('**/*', route => route.request().url() === url
   ? route.fulfill({ path: path.resolve(__dirname, '../index.html'), contentType: 'text/html' })
   : route.abort());
  await page.goto(url);
  return await page.evaluate(() => {
   const canvas = document.createElement('canvas');
   canvas.width = canvas.height = 16;
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = 'salmon';
   ctx.fillRect(0, 0, 16, 16);
   const photo = canvas.toDataURL('image/jpeg');
   const rooms = [{ id: 'migration', place: '移行テスト用の玄関', beforePhoto: photo, afterPhoto: photo }];
   localStorage.setItem(tidyKey, JSON.stringify(rooms));
   localStorage.setItem(key, JSON.stringify([{ name: '移行テスト用の水', qty: '2', category: 'water' }]));
   return { full: buildFullBackup(), photo };
  });
 } finally {
  await browser.close();
 }
}

async function waitFor(check, name) {
 const deadline = Date.now() + 45000;
 do {
  const value = await check();
  if (value) return value;
  await delay(500);
 } while (Date.now() < deadline);
 throw new Error('Timed out waiting for ' + name);
}

async function run() {
 const backup = await exportWebBackup();
 adb('install', '-r', path.join(android, 'app/build/outputs/apk/debug/app-debug.apk'));
 const launch = adb('shell', 'am', 'start', '-W', '-n', appId + '/.MainActivity');
 assert.match(launch, /Status: ok/, launch);
 const socketName = await waitFor(() => {
  const pid = adb('shell', 'pidof ' + appId + ' || true');
  if (!pid) return undefined;
  const name = 'webview_devtools_remote_' + pid;
  return adb('shell', 'cat', '/proc/net/unix').includes('@' + name) ? name : undefined;
 }, 'Android app WebView');
 const port = adb('forward', 'tcp:0', 'localabstract:' + socketName);
 let socket;
 try {
  const target = await waitFor(async () => {
   const response = await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(5000) });
   const targets = await response.json();
   return targets.find(item => item.type === 'page' && item.url.startsWith('https://localhost/'));
  }, 'bundled app page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
   socket.addEventListener('open', resolve, { once: true });
   socket.addEventListener('error', reject, { once: true });
  });
  let commandId = 0;
  function send(method, params) {
   return new Promise((resolve, reject) => {
    const id = ++commandId;
    const onMessage = event => {
     const response = JSON.parse(event.data);
     if (response.id !== id) return;
     clearTimeout(timeout);
     socket.removeEventListener('message', onMessage);
     if (response.error) reject(new Error(JSON.stringify(response.error)));
     else resolve(response.result);
    };
    const timeout = setTimeout(() => {
     socket.removeEventListener('message', onMessage);
     reject(new Error('WebView command timed out: ' + method));
    }, 15000);
    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
   });
  }
  async function evaluate(fn, ...args) {
   const result = await send('Runtime.evaluate', {
    expression: '(' + fn + ')(...' + JSON.stringify(args) + ')',
    awaitPromise: true, returnByValue: true,
   });
   if (result.exceptionDetails) throw new Error(result.result.description);
   return result.result.value;
  }
  async function openBackup(page) {
   await send('Page.navigate', { url: 'https://localhost/?page=' + page });
   await waitFor(() => evaluate(expected =>
    new URLSearchParams(location.search).get('page') === expected &&
    document.readyState === 'complete' &&
    (expected === 'backup' ? !!document.querySelector('#fullBackupDialog[open]') : !!document.querySelector('#reviewBackupFold[open]')),
   page), page);
  }
  async function selectFile(inputId, content) {
   await evaluate((id, json) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([json], 'migration.json', { type: 'application/json' }));
    const input = document.getElementById(id);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
   }, inputId, content);
  }
  await openBackup('backup');
  const exported = JSON.parse(backup.full).data;
  await selectFile('fullBackupFile', backup.full);
  await waitFor(() => evaluate(() => document.querySelector('#fullBackupFileStatus').textContent.includes('読み込みました')), 'backup preview');
  await evaluate(() => {
   const restore = document.querySelector('[onclick="restoreAllData()"]');
   restore.click();
   restore.click();
  });
  await waitFor(() => evaluate(() => document.querySelector('#allBackupStatus').textContent.startsWith('復元しました')), 'full backup restored');
  await openBackup('reviewBackup');
  const review = { name: '移行テスト用レビュー', category: '水', comment: '写真付きレビューの移行', stars: 4, photos: [backup.photo], used: true };
  await selectFile('reviewBackupFile', JSON.stringify({ format: 'toto-local-review-backup-v1', reviews: [review] }));
  await evaluate(() => document.querySelector('#reviewBackupImport').click());
  await waitFor(() => evaluate(() => document.querySelector('#reviewBackupStatus').textContent.includes('1件を追加しました')), 'review restored');
  await openBackup('backup');
  assert.deepEqual(await evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(exported)), exported);
  const storedReview = await evaluate(() => new Promise((resolve, reject) => {
   const opened = indexedDB.open('totonoe-stock-reviews', 1);
   opened.onerror = () => reject(opened.error);
   opened.onsuccess = () => {
    const db = opened.result;
    const read = db.transaction('reviews').objectStore('reviews').getAll();
    read.onerror = () => { db.close(); reject(read.error); };
    read.onsuccess = () => { db.close(); resolve(read.result[0]); };
   };
  }));
  assert.deepEqual(storedReview.photos, review.photos);
  assert.equal(storedReview.comment, review.comment);
  console.log('PASS: Web backup and photo review restored and persisted in Android WebView');
 } finally {
  socket?.close();
  adb('forward', '--remove', 'tcp:' + port);
 }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
