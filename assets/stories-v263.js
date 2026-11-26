/* Approved comic pages; first-use story navigation, v261. */
(()=>{
'use strict';
const episodes=[{"id":0,"title":"防災とお片付けのアプリ","image":"./assets/comic-v261-00.webp"},{"id":1,"title":"ハザードマップの確認","image":"./assets/comic-v261-01.webp"},{"id":2,"title":"通れない玄関","image":"./assets/comic-v261-02.webp"},{"id":3,"title":"ライトはどこ？","image":"./assets/comic-v261-03.webp"},{"id":4,"title":"ごはんはあるけど…","image":"./assets/comic-v261-04.webp"},{"id":5,"title":"ここで寝ていて大丈夫？","image":"./assets/comic-v261-05.webp"},{"id":6,"title":"この家具、動かない？","image":"./assets/comic-v261-06.webp"},{"id":7,"title":"見たつもり、だったかも","image":"./assets/comic-v261-07.webp"},{"id":8,"title":"まずは、ここだけ！","image":"./assets/comic-v261-08.webp"},{"id":9,"title":"片付いた場所が増えた！","image":"./assets/comic-v261-09.webp"},{"id":10,"title":"掃除の前に、ひと仕事？","image":"./assets/comic-v261-10.webp"},{"id":11,"title":"家に何があるんだっけ？","image":"./assets/comic-v261-11.webp"},{"id":12,"title":"これで足りるの？","image":"./assets/comic-v261-12.webp"},{"id":13,"title":"数えてみたら、意外な結果","image":"./assets/comic-v261-13.webp"},{"id":14,"title":"あれ？ この日付は…？","image":"./assets/comic-v261-14.webp"},{"id":15,"title":"食べたら、なくなった！","image":"./assets/comic-v261-15.webp"},{"id":16,"title":"リュック、持ち上がらない！","image":"./assets/comic-v261-16.webp"},{"id":17,"title":"みんな同じでいいの？","image":"./assets/comic-v261-17.webp"},{"id":18,"title":"決めただけで、できるかな？","image":"./assets/comic-v261-18.webp"},{"id":19,"title":"防災の木と、これからの暮らし","image":"./assets/comic-v261-19.webp"},{"id":20,"title":"お出かけ中だったら？","image":"./assets/comic-v261-20.webp"},{"id":21,"title":"この天気、どう見ればいい？","image":"./assets/comic-v261-21.webp"},{"id":22,"title":"電気と水が止まったら？","image":"./assets/comic-v261-22.webp"},{"id":23,"title":"夏の備えのまま、冬が来た","image":"./assets/comic-v261-23.webp"},{"id":24,"title":"引っ越したら、備えもお引っ越し","image":"./assets/comic-v261-24.webp"},{"id":25,"title":"何から見直せばいい？","image":"./assets/comic-v261-25.webp"},{"id":26,"title":"全然進んでない…と思ったら","image":"./assets/comic-v261-26.webp"},{"id":27,"title":"この道具、どう選ぶ？","image":"./assets/comic-v261-27.webp"},{"id":28,"title":"知っているつもりだった！","image":"./assets/comic-v261-28.webp"},{"id":29,"title":"防災を、もっと学びたい","image":"./assets/comic-v261-29.webp"},{"id":30,"title":"一緒にやってみよう！","image":"./assets/comic-v261-30.webp"},{"id":31,"title":"記録が消えたら困る！","image":"./assets/comic-v261-31.webp"},{"id":32,"title":"通信できない時、開ける？","image":"./assets/comic-v261-32.webp"},{"id":33,"title":"あの機能、どこだった？","image":"./assets/comic-v261-33.webp"},{"id":34,"title":"どんな暮らしにしたい？","image":"./assets/comic-v261-34.webp"},{"id":35,"title":"少なくすれば、いいのかな？","image":"./assets/comic-v261-35.webp"},{"id":36,"title":"たこのエクスカリバー理論","image":"./assets/comic-v261-36.webp"},{"id":37,"title":"「いつか使う」がいっぱい","image":"./assets/comic-v261-37.webp"},{"id":38,"title":"戻す場所がある暮らし","image":"./assets/comic-v261-38.webp"},{"id":39,"title":"わたしたちの、ととのう暮らし","image":"./assets/comic-v261-39.webp"}];
 const storageKey='toto-stories-v1';
 const empty=()=>({version:1,introductions:null,unlocked:[],read:[],introduced:[]});
 let damaged=false,pending=null,setupContinuation=null,setupRunning=false,current=null,returnFocus=null,loaded=false;
 let startupActive=false,startupWaiting=false,startupTarget='home';
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
 const button=(text,fn)=>{const n=node('button',text);n.type='button';n.className='secondary';n.onclick=fn;return n};
 function read(){
  try{const raw=localStorage.getItem(storageKey);if(raw===null){damaged=false;return empty()}const v=JSON.parse(raw);if(!validStoryRecord(v))throw Error();damaged=false;return v}
  catch(_){damaged=true;return empty()}
 }
 let state=read();
 function save(update){
  const fresh=read();if(damaged){status.textContent='4コマの記録を読み込めませんでした。バックアップの復元をご確認ください。';return false}
  const next=update(fresh);if(!validStoryRecord(next)||!verifiedSaveJson(storageKey,next)){status.textContent='4コマの設定を保存できませんでした。端末の空き容量などをご確認のうえ、もう一度お試しください。';if(dialog.open)loadStatus.textContent=status.textContent;return false}
  state=next;renderArchive();return true;
 }
 const hasTree=()=>{try{return readAchievementsForStories().length===8}catch(_){return false}};
 function readAchievementsForStories(){const v=JSON.parse(localStorage.getItem(achievementKey)||'null');return validAchievementRecord(v)?v.trophies:[]}
 const available=id=>id<19||id>19&&id<34||hasTree();
 const pageEpisodes={homeSafety:[2,3,5,6,7],tidy:[8,9],cleanPractice:[10],supplies:[11,12,13,14,15],stock:[4],goBag:[16],family:[17],training:[18],evacuation:[18],pouch:[20],weather:[21],outage:[22,4],seasonalCheck:[23],moving:[24],diagnosis:[25],readiness:[25],tidyAlbum:[26],reviews:[27],practiceQuiz:[28],examStudy:[29],events:[30],helpGuide:[33],minimalistGuide:[34,35,36,37,38,39],set:[38]};
 function unlock(ids){const allowed=ids.filter(available);if(!allowed.some(id=>!state.unlocked.includes(id)))return true;return save(s=>({...s,unlocked:[...new Set([...s.unlocked,...allowed])]}))}
 const style=node('style');style.textContent=`
 #achievementBadges>summary{cursor:pointer;font-size:18px;font-weight:700;min-height:44px;padding:8px 0}
 #comicArchive{margin-top:16px;border-top:1px solid #dbe7df;padding-top:12px}
 #comicArchive label{display:flex;align-items:center;gap:9px;min-height:48px;font-weight:700}
 #comicArchive input{width:22px;height:22px;flex-shrink:0}
 #comicArchiveList{display:grid;gap:6px;margin:12px 0;padding:0;list-style:none}
 #comicArchiveList button{display:block;text-align:left;width:100%;min-height:48px;line-height:1.6;white-space:normal}
 #comicStoryDialog{box-sizing:border-box;width:calc(100% - 16px);max-width:810px;height:92dvh;max-height:94dvh;margin:auto;padding:0;overflow:hidden;border:1px solid #89b392;border-radius:16px;background:#fffdf6;color:#2e4335}
 #comicStoryDialog[open]{display:flex;flex-direction:column}#comicStoryDialog::backdrop{background:#142e2370}
 body:has(#comicStoryDialog[open]){overflow:hidden}
 .comic-bar,.comic-footer{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;background:#f1f6e9}
 .comic-bar h2{font-size:16px;line-height:1.5;margin:0;flex:1}
 .comic-bar button{min-width:44px;min-height:44px;margin:0;padding:6px;font-size:14px}
 #comicStoryScroll{overflow:auto;min-height:0;flex:1;overscroll-behavior:contain;text-align:center}
 #comicStoryImage{display:block;width:100%;height:auto;margin:auto}#comicStoryScroll.comic-zoom #comicStoryImage{width:850px;max-width:none}
 #comicStoryLoad{padding:12px;text-align:left;font-size:14px}#comicStoryLoad:empty{display:none}
 .comic-footer{flex-wrap:wrap;font-size:12px}.comic-footer button{margin:0;min-height:44px}.comic-footer .primary{flex:1}
 #comicStoryChoice{padding:18px;text-align:left}#comicStoryChoice[hidden]{display:none}
 #comicStoryChoice button{display:block;width:100%;margin:12px 0;min-height:48px}
 .comic-feature-link{margin:8px 0;font-size:13px}.comic-feature-link button{font-size:13px;min-height:44px}
 `;document.head.append(style);
 const archive=node('section');archive.id='comicArchive';archive.setAttribute('aria-labelledby','comicArchiveTitle');
 const archiveTitle=node('h3','これまでの4コマ');archiveTitle.id='comicArchiveTitle';
 const label=node('label'),toggle=node('input');toggle.type='checkbox';toggle.id='comicIntroductionsEnabled';label.htmlFor=toggle.id;label.append(toggle,node('span','4コマストーリーを導入で表示する'));
 const help=node('p','オフでも、使った機能の漫画はここに追加されます。第0・1話はいつでも読めます。');
 const status=node('p');status.id='comicSettingStatus';status.setAttribute('role','status');
 const count=node('p'),list=node('ul');list.id='comicArchiveList';
 archive.append(archiveTitle,label,help,status,count,list);document.getElementById('achievementBadges').append(archive);
 const dialog=node('dialog');dialog.id='comicStoryDialog';dialog.setAttribute('aria-labelledby','comicStoryTitle');
 const bar=node('div');bar.className='comic-bar';const title=node('h2');title.id='comicStoryTitle';
 const zoom=button('拡大',()=>{const expanded=scroll.classList.toggle('comic-zoom');zoom.textContent=expanded?'全体':'拡大';zoom.setAttribute('aria-pressed',String(expanded))});zoom.setAttribute('aria-pressed','false');
 const close=button('×',()=>finish(false));close.id='comicStoryClose';close.setAttribute('aria-label','4コマを閉じる');
 bar.append(title,zoom,close);
 const scroll=node('div');scroll.id='comicStoryScroll';scroll.tabIndex=0;scroll.setAttribute('aria-label','4コマ漫画。上から下へお読みください');
 const loadStatus=node('div');loadStatus.id='comicStoryLoad';loadStatus.setAttribute('role','status');
 const image=node('img');image.id='comicStoryImage';image.width=1024;image.height=1536;
 const choice=node('div');choice.id='comicStoryChoice';choice.hidden=true;
 choice.append(node('h3','これからも、4コマで機能を紹介しますか？'),node('p','使い始める機能に合うお話が開きます。「その他」のトロフィー・バッジで、いつでも変更できます。'),button('オンにする・4コマで始める',()=>choose(true)),button('オフにする・そのまま使う',()=>choose(false)));
 scroll.append(loadStatus,image,choice);
 const footer=node('div');footer.className='comic-footer';
 const emergency=button('緊急対応',()=>{setupContinuation=null;setupRunning=false;pending=null;current=null;dialog.close();show('emergency')});
 const next=button('読み終えた・使ってみる',()=>finish(true));next.id='comicStoryContinue';next.className='primary';
 footer.append(emergency,next);dialog.append(bar,scroll,footer);document.body.append(dialog);
 dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false)});
 dialog.addEventListener('close',()=>{if(returnFocus?.isConnected&&!document.querySelector('dialog[open]'))returnFocus.focus({preventScroll:true});returnFocus=null;schedule()});
 function renderArchive(){
  state=read();toggle.checked=state.introductions===true;toggle.disabled=damaged;
  if(damaged)status.textContent='4コマの記録を読み込めませんでした。バックアップの復元をご確認ください。';
  count.textContent='読了 '+state.read.length+'話 ／ 全40話';list.replaceChildren();
  const ids=[...new Set([0,1,...state.unlocked])].sort((a,b)=>a-b);
  for(const id of ids){const item=node('li'),ep=episodes[id];item.append(button('第'+id+'話　'+ep.title+'　'+(state.read.includes(id)?'✓ 読了':'未読'),()=>{if(unlock([id]))open(id,'archive')}));list.append(item)}
 }
 toggle.onchange=()=>{const enabled=toggle.checked;if(save(s=>({...s,introductions:enabled}))) {pending=null;status.textContent=enabled?'4コマの導入をオンにしました。次に使う機能から表示します。':'4コマの導入をオフにしました。漫画はここで読めます。'}else toggle.checked=state.introductions===true};
 function open(id,mode='intro'){
  if(dialog.open||document.querySelector('dialog[open]')||activePage==='emergency')return false;
  if(!unlock([id]))return false;
  current={id,mode};loaded=false;returnFocus=document.activeElement;
  title.textContent='第'+id+'話　'+episodes[id].title;
  image.hidden=false;choice.hidden=true;zoom.hidden=false;next.hidden=false;next.disabled=true;
  next.textContent=mode==='onboarding'?'次へ':mode==='archive'?'読み終えた・一覧に戻る':'読み終えた・使ってみる';
  scroll.classList.remove('comic-zoom');zoom.textContent='拡大';zoom.setAttribute('aria-pressed','false');scroll.scrollTop=0;scroll.scrollLeft=0;
  image.alt='第'+id+'話「'+episodes[id].title+'」の4コマ漫画';
  loadStatus.textContent='漫画を読み込んでいます…';
  image.onload=()=>{loaded=true;next.disabled=false;loadStatus.textContent=''};
  image.onerror=()=>{loaded=false;next.disabled=true;loadStatus.replaceChildren(node('p','漫画を読み込めませんでした。通信を確認して再読み込みしてください。後から「その他」でも読めます。'),button('画像を再読み込み',()=>{image.src=episodes[id].image+'?retry='+Date.now()}))};
  image.src=episodes[id].image;
  dialog.showModal();close.focus({preventScroll:true});return true;
 }
 function finish(markRead){
  if(!current)return;
  if(current.mode==='choice'){if(!choose(false)){current=null;dialog.close();resumeSetup()}return}
  const {id,mode}=current;
  const saved=save(s=>({...s,read:markRead&&loaded?[...new Set([...s.read,id])]:s.read,introduced:mode==='archive'?s.introduced:[...new Set([...s.introduced,id])]}));
  if(!saved&&markRead)return;
  if(!saved&&mode==='startup'){current=null;dialog.close();runStartup(id===0?'region':'choice');return;}
  current=null;dialog.close();
  if(mode==='startup')runStartup(id===0?'region':state.introductions===null?'choice':'hazard');
 }
 function showChoice(){
  current={mode:'choice'};title.textContent='4コマストーリーの設定';image.hidden=true;loadStatus.textContent='';choice.hidden=false;zoom.hidden=true;next.hidden=true;
  if(!dialog.open)dialog.showModal();choice.querySelector('button').focus({preventScroll:true});
 }
 function resumeSetup(){if(startupActive){runStartup('hazard');return}setupRunning=false;const continuation=setupContinuation;setupContinuation=null;if(continuation)continuation()}
 function choose(enabled){
  if(!save(s=>({...s,introductions:enabled})))return false;
  current=null;dialog.close();if(startupActive){runStartup('hazard');return true}setupRunning=false;const continuation=setupContinuation;setupContinuation=null;if(continuation)continuation();visit(activePage);return true;
 }
 let timer=null;
 function schedule(){clearTimeout(timer);timer=setTimeout(flush,80)}
 function flush(){
  if(document.hidden||activePage==='emergency'||document.querySelector('dialog[open]'))return;
  if(startupWaiting){startupWaiting=false;runStartup(tutorialState.startup||'welcome');return}
  if(!pending)return;
  if(pending.page!==activePage){pending=null;return}
  if(pending.mode!=='startup'&&(state.introductions!==true||state.introduced.includes(pending.id))){pending=null;return}
  // Do not take focus from a partially entered form or from another modal.
  if(document.activeElement?.matches('input,textarea,select,[contenteditable=true]'))return;
  const request=pending;pending=null;open(request.id,request.mode);
 }
 function request(id){
  if(activePage==='emergency'||!available(id)||!unlock([id]))return;
  if(state.introductions===true&&!state.introduced.includes(id)&&!setupRunning){pending={id,page:activePage,mode:'intro'};schedule()}
 }
 function visit(page){
  if(page==='emergency'){pending=null;return}
  pending=null;
  const ids=(page==='minimalistGuide'&&!minimalistGuideIsUnlocked()?[]:pageEpisodes[page]||[]).filter(available);unlock(ids);
  if(hasTree()){
   unlock([19]);
   if(!state.introduced.includes(19)&&['home','more','minimalistGuide'].includes(page)){request(19);return}
  }
  if(ids.length)request(ids[0]);
 }
 const previousShow=show;
 show=function(id){const before=activePage,result=previousShow.apply(this,arguments);if(activePage===id&&before!==id){if(id==='emergency'){startupActive=false;startupWaiting=false;setupContinuation=null;setupRunning=false;current=null;pending=null;if(dialog.open)dialog.close()}visit(id);}return result};
 // Secondary introductions follow the specific operation, rather than episode number.
 document.addEventListener('click',event=>{
  const target=event.target.closest('button,summary,label,input,select');if(!target||target.closest('#comicStoryDialog,#comicArchive'))return;
  let id;
  if(target.closest('#furnitureSafetyPanel')){const row=target.closest('label')?.textContent||target.closest('li')?.textContent||'';id=row.includes('固定')?6:5;}
  if(target.closest('#routeSafetyPanel')){const row=target.closest('label')?.textContent||target.closest('li')?.textContent||'';id=row.includes('ライト')||row.includes('明かり')?3:2;}
  if(target.closest('#homeSafetyOverview'))id=7;
  if(target.closest('#supplyCalcFold'))id=12;
  if(target.closest('#supplyOptionalDates')||target.id==='sexp'||target.id==='supplyFilter')id=14;
  if(target.closest('#replenishmentList')||target.closest('button')?.textContent.includes('使った'))id=15;
  if(target.closest('#fullBackupDialog,#supplyBackupFold'))id=31;
  if(target.id==='offlineRepairRun'||target.closest('#firstTimeGuideFold'))id=32;
  const topic=target.closest('#minimalistGuideContent .living-topic');
  if(topic&&hasTree()){
   const text=topic.querySelector('summary')?.textContent||'';
   id=text.includes('好き')?36:text.includes('防災')?35:text.includes('いつか')?37:text.includes('整理・整頓')?38:34;
  }
  if(id!==undefined)request(id);
 },true);
 // Dedicated entry points make all six lifestyle stories reachable without a forced sequence.
 for(const [page,ids] of Object.entries(pageEpisodes)){
  const section=document.getElementById(page);if(!section)continue;
  const fold=node('details');fold.className='comic-feature-link';fold.dataset.comicPage=page;
  fold.append(node('summary','この機能の4コマを読む'));
  for(const id of ids){const readButton=button('第'+id+'話　'+episodes[id].title,()=>{if(unlock([id]))open(id,'archive')});readButton.dataset.comicEpisode=String(id);fold.append(readButton)}
  fold.addEventListener('toggle',()=>{if(fold.open){unlock(ids);for(const b of fold.querySelectorAll('button'))b.hidden=!available(Number(b.dataset.comicEpisode))}});
  if(page==='minimalistGuide')document.getElementById('minimalistGuideContent').prepend(fold);
  else section.append(fold);
 }
 function progress(){
  if(activePage==='emergency')return;
  renderArchive();
  if(hasTree()){unlock([19]);if(['home','more','minimalistGuide'].includes(activePage)&&!state.introduced.includes(19))request(19)}
  if(activePage==='tidy'&&readTidyPlaces().filter(x=>x.done).length>=3)request(9);
  if(activePage==='supplies'&&readSaved(key,[]).length>=5)request(13);
 }
 document.addEventListener('toto-record-saved',e=>{if(e.detail?.key===storageKey)return;setTimeout(progress,0)});
 window.addEventListener('storage',e=>{if(e.key===storageKey||e.key===null){pending=null;renderArchive();if(current?.mode==='intro'&&state.introductions!==true){current=null;dialog.close()}}else if(e.key===achievementKey){progress();schedule()}});
 window.addEventListener('toto-data-restored',()=>{startupActive=false;startupWaiting=false;pending=null;setupContinuation=null;setupRunning=false;current=null;if(dialog.open)dialog.close();renderArchive()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderArchive();schedule()}});
 document.addEventListener('focusout',schedule);
 new MutationObserver(schedule).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
 renderArchive();
 // A single initial flow interleaves the two retained guide screens with the comics.
 const baseMoveTutorial=moveTutorial,baseFinishTutorial=finishTutorial,basePauseTutorial=pauseTutorial;
 moveTutorial=function(delta){
  if(!startupActive||tutorialReplay)return baseMoveTutorial.apply(this,arguments);
  if(tutorialState.startup==='welcome'&&delta>0)runStartup('comic0');
  else if(tutorialState.startup==='launch')runStartup(delta>0?'comic1':'region');
 };
 finishTutorial=function(){
  if(startupActive&&!tutorialReplay&&['welcome','launch'].includes(tutorialState.startup)){runStartup(tutorialState.startup==='welcome'?'comic0':'comic1');return}
  return baseFinishTutorial.apply(this,arguments);
 };
 pauseTutorial=function(){
  if(startupActive&&!tutorialReplay){startupActive=false;startupWaiting=false;setupRunning=false;setupContinuation=null;pending=null;}
  return basePauseTutorial.apply(this,arguments);
 };
 function completeStartup(){
  startupActive=false;startupWaiting=false;setupRunning=false;pending=null;
  tutorialPendingPage=startupTarget==='home'?'homeSafety':startupTarget;
  baseFinishTutorial(true);
  const continuation=setupContinuation;setupContinuation=null;if(continuation)continuation();
  visit(activePage);
 }
 function runStartup(phase){
  if(!startupActive||activePage==='emergency')return;
  pending=null;setupRunning=true;
  tutorialState={...tutorialState,version:3,step:phase==='launch'?1:0,startup:phase};saveTutorialState();
  if(document.getElementById('tutorialDialog').open)closeTutorial();
  if(phase==='welcome'||phase==='launch'){
   tutorialReplay=false;openTutorial();
   document.getElementById('tutorialNext').textContent=phase==='welcome'?'第0話を読む':'第1話を読む';
  }else if(phase==='comic0'||phase==='comic1'){
   if(!open(phase==='comic0'?0:1,'startup'))runStartup(phase==='comic0'?'region':state.introductions===null?'choice':'hazard');
  }else if(phase==='region')openSharedRegion(()=>runStartup('launch'),{direct:true});
  else if(phase==='choice'){
   if(state.introductions===null)showChoice();else runStartup('hazard');
  }else if(phase==='hazard'){
   if(hazardIsConfirmed())completeStartup();else openHazardGate(false);
  }else completeStartup();
 }
 const previousOpenHazardGate=openHazardGate;
 openHazardGate=function(unlocked){
  if(!unlocked&&!tutorialState.completed&&!tutorialReplay&&tutorialState.startup!=='hazard'){
   startupActive=true;startupWaiting=false;startupTarget=activePage;runStartup(tutorialState.startup||'welcome');return;
  }
  return previousOpenHazardGate.apply(this,arguments);
 };
 const previousHazardFinish=document.getElementById('hazardFinish').onclick;
 document.getElementById('hazardFinish').onclick=function(){
  previousHazardFinish.apply(this,arguments);
  if(startupActive&&tutorialState.startup==='hazard'&&hazardIsConfirmed()){
   document.getElementById('stockGateDialog').close();completeStartup();
  }
 };
 window.totoStories={startSetup(continuation){
  if(activePage==='emergency'||['backup','reviewBackup','evacuationVideos'].includes(new URL(location.href).searchParams.get('page')))return;
  if(tutorialState.completed){continuation();visit(activePage);return}
  setupContinuation=continuation;startupTarget=activePage;startupActive=true;setupRunning=true;startupWaiting=true;schedule();
 }};
})();
