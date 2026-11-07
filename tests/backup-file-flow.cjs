const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','index.html'),'utf8');
function extract(name){const at=source.search(new RegExp('(?:async )?function '+name+'\\('));assert(at>=0,name);const tail=source.slice(at),end=/\n(?:async )?function /.exec(tail);assert(end,name+' boundary');return tail.slice(0,end.index)}
const aliases=source.match(/const allBackupKeys=(\[[^;]+\]);/)[1];
const declarations=aliases.slice(1,-1).split(',').filter(k=>!k.startsWith("'")).map(k=>'const '+k+'='+JSON.stringify(source.match(new RegExp('\\b'+k+"='([^']+)'"))[1])+';').join('\n');
const fields={};for(const id of ['fullBackupFile','allBackupText','fullBackupPreview','fullBackupFileStatus','fullBackupDiff','backupFileVerifyStatus'])fields[id]={value:'',textContent:'',replaceChildren(){this.textContent=''}};
let previews=0,writes=0;
const ctx={TextEncoder,document:{getElementById:id=>fields[id]},localStorage:{setItem(){writes++},removeItem(){writes++}},previewFullBackup(){previews++},validateFullBackupObject(obj){if(obj.format!=='test')throw Error('bad');return {data:obj.data,keys:Object.keys(obj.data)}}};
vm.createContext(ctx);vm.runInContext(declarations+'\nconst allBackupKeys='+aliases+';let backupFileReadToken=0,pendingFullRestore=null,verifiedFullRestoreSignature=null,verifiedFullRestoreOriginalSnapshot=null;\n'+['backupUtf8ByteLength','backupCategoryNames','invalidateFullRestorePreview','loadFullBackupFile','verifyImportedBackupFile'].map(extract).join('\n'),ctx);
const text=JSON.stringify({format:'test',data:{sample:'ok'}});
function delayed(){let resolve;const promise=new Promise(r=>resolve=r);return {resolve,file:{size:100,text:()=>promise}}}
(async()=>{
 const first=delayed();fields.fullBackupFile.files=[first.file];const read=ctx.loadFullBackupFile(fields.fullBackupFile);assert.equal(fields.allBackupText.value,'');
 fields.allBackupText.value='manually pasted newer backup';ctx.invalidateFullRestorePreview();first.resolve(text);await read;
 assert.equal(fields.allBackupText.value,'manually pasted newer backup');assert.equal(previews,0);
 const old=delayed(),next={size:100,text:async()=>text};fields.fullBackupFile.files=[old.file];const stale=ctx.loadFullBackupFile(fields.fullBackupFile);fields.fullBackupFile.files=[next];await ctx.loadFullBackupFile(fields.fullBackupFile);old.resolve('invalid');await stale;
 assert.equal(fields.allBackupText.value,text);assert.equal(previews,1);
 const check=delayed();fields.fullBackupFile.files=[check.file];fields.allBackupText.value=text;const verifying=ctx.verifyImportedBackupFile();fields.allBackupText.value='changed while checking';check.resolve(text);await verifying;
 assert.match(fields.backupFileVerifyStatus.textContent,/変更/);assert.doesNotMatch(fields.backupFileVerifyStatus.textContent,/✅/);
 const huge={size:100,text:async()=> ' '.repeat(2000001)+text};fields.fullBackupFile.files=[huge];await ctx.loadFullBackupFile(fields.fullBackupFile);assert.equal(fields.allBackupText.value,'');assert.match(fields.fullBackupFileStatus.textContent,/読み込めません/);
 const invalid={size:100,text:async()=>'{broken'};fields.fullBackupFile.files=[invalid];fields.allBackupText.value=text;await ctx.loadFullBackupFile(fields.fullBackupFile);assert.equal(fields.allBackupText.value,'');assert.equal(previews,1);
 ctx.expected=aliases;assert.equal(vm.runInContext('allBackupKeys.every(k=>backupCategoryNames().has(k))',ctx),true);assert.equal(vm.runInContext('backupCategoryNames().size===allBackupKeys.length',ctx),true);
 assert.equal(writes,0);
 console.log('PASS: pending file cannot replace newer manual input or newer selection; mid-check edits cannot report a match; oversized raw UTF-8 and invalid files rejected; all 29 backup categories named; no storage writes');
})().catch(e=>{console.error(e);process.exitCode=1});
