const fs = require('node:fs/promises');
const exportWebBackup = require('./web-migration-fixture.cjs');

async function migrate(backup, phase) {
 const review = {
  name: 'iOSへの移行テスト', category: '水', comment: '写真付きレビュー',
  stars: 4, photos: [backup.photo], used: true
 };
 const data = JSON.parse(backup.full).data;
 if (phase === 'verify') {
  for (const [key, value] of Object.entries(data)) {
   if (localStorage.getItem(key) !== value) throw new Error('Restored data missing after restart: ' + key);
  }
  const row = await new Promise((resolve, reject) => {
   const open = indexedDB.open('totonoe-stock-reviews', 1);
   open.onerror = () => reject(open.error);
   open.onsuccess = () => {
    const db = open.result;
    const read = db.transaction('reviews').objectStore('reviews').getAll();
    read.onerror = () => { db.close(); reject(read.error); };
    read.onsuccess = () => { db.close(); resolve(read.result[0]); };
   };
  });
  if (row?.name !== review.name || row?.photos?.[0] !== backup.photo) throw new Error('Restored review photo missing after restart');
  return 'PASS: Web backup and review photo persisted after restarting the iOS app';
 }

 function selectFile(id, json) {
  const transfer = new DataTransfer();
  transfer.items.add(new File([json], 'migration.json', { type: 'application/json' }));
  const input = document.getElementById(id);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
 }
 async function waitForStatus(id, expected) {
  const status = document.getElementById(id);
  for (let i = 0; i < 60; i++) {
   if (status.textContent.includes(expected)) return;
   await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(id + ': ' + status.textContent);
 }

 openFullBackupFromReadiness();
 selectFile('fullBackupFile', backup.full);
 await waitForStatus('fullBackupFileStatus', '読み込みました');
 document.querySelector('[onclick="restoreAllData()"]').click();
 document.querySelector('[onclick="restoreAllData()"]').click();
 await waitForStatus('allBackupStatus', '復元しました');
 document.getElementById('reviewBackupFold').open = true;
 selectFile('reviewBackupFile', JSON.stringify({ format: 'toto-local-review-backup-v1', reviews: [review] }));
 document.getElementById('reviewBackupImport').click();
 await waitForStatus('reviewBackupStatus', '1件を追加しました');
 return 'PASS: Web backup and review imported in the iOS app';
}

async function prepare() {
 const backup = await exportWebBackup();
 const swift = 'ios/App/App/SceneDelegate.swift';
 const source = await fs.readFile(swift, 'utf8');
 const anchor = '        window?.makeKeyAndVisible()';
 if (source.split(anchor).length !== 2) throw new Error('Unexpected generated SceneDelegate');
 const script = 'return await (' + migrate + ')(argBackup, argPhase);';
 const harness = `
#if DEBUG && targetEnvironment(simulator)
        if let phase = ProcessInfo.processInfo.arguments.last,
           ["import", "verify"].contains(phase),
           let bridge = window?.rootViewController as? CAPBridgeViewController {
            Task { @MainActor in
                let target = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("migration-\\(phase).txt")
                do {
                    for _ in 0..<100 {
                        if let webView = bridge.webView,
                           let ready = try? await webView.evaluateJavaScript("typeof openFullBackupFromReadiness === 'function' && document.readyState === 'complete'") as? Bool,
                           ready {
                            let outcome = try await webView.callAsyncJavaScript(
                                #"""
                                ${script}
                                """#,
                                arguments: [
                                    "argBackup": ["full": #"${backup.full.replaceAll('\n', '')}"#, "photo": #"${backup.photo}"#],
                                    "argPhase": phase
                                ], contentWorld: .page
                            )
                            try (outcome as? String ?? "FAIL: No result").write(to: target, atomically: true, encoding: .utf8)
                            return
                        }
                        try await Task.sleep(nanoseconds: 200_000_000)
                    }
                    throw NSError(domain: "WebView did not start", code: 1)
                } catch {
                    try? ("FAIL: " + String(describing: error)).write(to: target, atomically: true, encoding: .utf8)
                }
            }
        }
#endif`;
 // Multiline Swift strings require the same indentation on every content line.
 const indentedHarness = harness.replace(script, script.split('\n').join('\n                                '));
 await fs.writeFile(swift, source.replace('import Capacitor', 'import Capacitor\nimport WebKit').replace(anchor, anchor + '\n' + indentedHarness));
}

prepare().catch(error => { console.error(error); process.exitCode = 1; });
