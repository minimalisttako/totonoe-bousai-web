/* Everyday use, record protection and workshop information. */
(function () {
 'use strict';
 const preferenceKey = 'toto-experience-v1';
 const allowedPages = ['home','learn','tidy','supplies','more','emergency','homeSafety','evacuation','pouch','goBag','training','family','weather','readiness','seasonalCheck','outage','minimalistGuide','examStudy','moving','tidyAlbum','select','set','stock','diagnosis','reviews','helpGuide','cleanPractice','events','practiceQuiz'];
 function validPreferences(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
   && ['deviceNotifications'].every(field => value[field] === undefined || typeof value[field] === 'boolean')
   && ['safetyCheck','goBagCheck'].every(field => value[field] === undefined || value[field] === '' || validDate(value[field]))
   && typeof value.simple === 'boolean' && typeof value.reminders === 'boolean'
   && Array.isArray(value.favorites) && value.favorites.length <= 8
   && new Set(value.favorites).size === value.favorites.length
   && value.favorites.every(page => allowedPages.includes(page));
 }
 function removedRecord(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length + 1) return null;
  let index = 0;
  while (index < after.length && JSON.stringify(before[index]) === JSON.stringify(after[index])) index++;
  if (JSON.stringify(before.slice(index + 1)) !== JSON.stringify(after.slice(index))) return null;
  return {item: before[index], index};
 }
 function putBack(current, deletion) {
  if (!Array.isArray(current)) throw Error('invalid-records');
  if (deletion.item.id && current.some(item => item.id === deletion.item.id)) throw Error('already-present');
  // Supplies have no IDs. Keep intentional identical entries and restore just this deletion.
  if (!deletion.item.id && deletion.remainingCopies !== undefined && current.filter(item => JSON.stringify(item) === JSON.stringify(deletion.item)).length !== deletion.remainingCopies) throw Error('record-changed');
  const next = current.slice();
  next.splice(Math.min(deletion.index, next.length), 0, deletion.item);
  return next;
 }
 function useSoon(items, today, horizon) {
  return items.map((item,index) => ({item,index}))
   .filter(({item}) => ['water','food'].includes(item.category) && Number(item.qty) > 0 && validDate(item.exp) && item.exp >= today && item.exp <= horizon)
   .sort((a,b) => a.item.exp.localeCompare(b.item.exp));
 }
 function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
 }
 function calendarText(events, stamp) {
  const escape = value => String(value).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Totonoe Bousai//Reminders//JA','CALSCALE:GREGORIAN'];
  events.forEach(event => {
   const id = Array.from(event.id).reduce((hash,char) => Math.imul(hash ^ char.charCodeAt(0),16777619) >>> 0,2166136261).toString(16);
   // Fixed UTC+9 start avoids a timezone database dependency in calendar readers.
   const date = event.date.replaceAll('-','');
   lines.push('BEGIN:VEVENT','UID:'+id+'@totonoe-bousai','DTSTAMP:'+stamp,'DTSTART:'+date+'T000000Z','DURATION:PT15M',
    'SUMMARY:'+escape(event.title),'DESCRIPTION:'+escape('ととのえ防災で記録を確認してください。\n'+event.description),
    'BEGIN:VALARM','TRIGGER:PT0M','ACTION:DISPLAY','DESCRIPTION:'+escape(event.title),'END:VALARM','END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  // Fold at UTF-8 boundaries, including Japanese text, per the iCalendar line limit.
  return lines.flatMap(line => {
   const chunks=[];let current='',size=0;
   for (const char of line) {const bytes=new TextEncoder().encode(char).length;if(size+bytes>73){chunks.push(current);current=' ';size=1}current+=char;size+=bytes}
   chunks.push(current);return chunks;
  }).join('\r\n')+'\r\n';
 }
 if (typeof module !== 'undefined' && module.exports) {
  module.exports = {validPreferences,removedRecord,putBack,useSoon,validDate,calendarText};return;
 }
 const $ = id => document.getElementById(id);
 const undoEntries = [];
 let restoringDeletion = false, lastFailure = '', lastSavedAt = '', storageSummary = '', refreshTimer, statusTimer;
 let preferences = {simple:false,reminders:false,favorites:[]};
 let preferencesReadable = true;
 function element(tag, text, className) {
  const node = document.createElement(tag);if(text !== undefined)node.textContent=text;if(className)node.className=className;return node;
 }
 function button(text, callback) {
  const node=element('button',text,'secondary');node.type='button';node.addEventListener('click',callback);return node;
 }
 function card(id,title) {
  const node=element('div',undefined,'card experience-card');node.id=id;node.append(element('h2',title));return node;
 }
 function loadPreferences() {
  try {
   const raw=localStorage.getItem(preferenceKey);
   preferencesReadable=raw===null||validPreferences(JSON.parse(raw));
   if(preferencesReadable)preferences=raw===null?{simple:false,reminders:false,favorites:[]}:JSON.parse(raw);
  } catch(e) {preferencesReadable=false}
 }
 function savePreferences(next) {
  loadPreferences();
  if(!preferencesReadable){saveMessage('表示設定を読み取れません。設定の変更を保存できませんでした。',true);return false}
  if(!validPreferences(next)||!verifiedSaveJson(preferenceKey,next))return false;
  preferences=next;applyPreferences();return true;
 }
 const statusPanel=element('aside',undefined,'experience-storage-status');statusPanel.id='experienceStorageStatus';statusPanel.setAttribute('role','status');statusPanel.hidden=true;
 const statusMessage=element('span');statusPanel.append(statusMessage,button('閉じる',()=>statusPanel.hidden=true));document.body.append(statusPanel);
 function saveMessage(message,failed=false) {
  clearTimeout(statusTimer);statusMessage.textContent=message;statusPanel.dataset.error=String(failed);statusPanel.hidden=false;
  if(!failed)statusTimer=setTimeout(()=>statusPanel.hidden=true,3500);
  if(failed)lastFailure=message;
  const summary=$('recordStorageSummary');if(summary)summary.textContent=lastFailure||message;
 }
 const protectedArrays=new Set([key,tidyKey,pouchKey,familyProfileKey,evacuationDrillKey]);
 function refreshAfterWrite() {
  clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{renderStorage();renderReminders();renderSupplyTools();renderUndo();if(typeof optionalSetup!=='undefined')renderOptionalSetup()},0);
 }
 // Observe all app record writes, including older callers that use localStorage directly.
 let storagePrototype,originalSet,originalGet,originalRemove;
 try {storagePrototype=Object.getPrototypeOf(localStorage);originalSet=storagePrototype.setItem;originalGet=storagePrototype.getItem;originalRemove=storagePrototype.removeItem;}catch(e){saveMessage('端末の保存領域にアクセスできません。設定を確認してください。',true)}
 if(storagePrototype)storagePrototype.setItem=function(storageKey,value) {
  if(this!==localStorage||(!allBackupKeys.includes(storageKey)&&storageKey!==preferenceKey))return originalSet.call(this,storageKey,value);
  let before,changed=false;
  try {
   before=originalGet.call(this,storageKey);
   originalSet.call(this,storageKey,value);changed=true;
   if(originalGet.call(this,storageKey)!==String(value))throw Error('write-verification');
  } catch(error) {
   if(changed)try{if(before===null)originalRemove.call(this,storageKey);else originalSet.call(this,storageKey,before)}catch(rollbackError){}
   saveMessage('保存できませんでした。入力を残して、バックアップと端末の保存領域を確認してください。',true);
   throw error;
  }
  if(!restoringDeletion&&protectedArrays.has(storageKey)&&before!==null) {
   try {
    const deletion=removedRecord(JSON.parse(before),JSON.parse(String(value)));
    if(deletion){undoEntries.unshift({...deletion,remainingCopies:JSON.parse(String(value)).filter(item=>JSON.stringify(item)===JSON.stringify(deletion.item)).length,key:storageKey,label:deletion.item.name||deletion.item.place||deletion.item.label||'記録'});undoEntries.splice(5)}
   }catch(e){}
  }
  if(storageKey!==preferenceKey){
   lastSavedAt=new Date().toLocaleString('ja-JP');lastFailure='';
   if(!restoringDeletion&&before!==String(value))document.dispatchEvent(new CustomEvent('toto-record-saved',{detail:{key:storageKey,before,value:String(value)}}));
  }
  refreshAfterWrite();
 };
 function refreshRecordViews(storageKey) {
  if(storageKey===key){supplies=readSaved(key,[]);renderSupplies()}
  if(storageKey===tidyKey){syncStockGate();renderTidy();renderTidyAlbum()}
  if(storageKey===pouchKey)renderPouch();
  if(storageKey===familyProfileKey)renderFamilyProfiles();
  if(storageKey===evacuationDrillKey)renderEvacuationDrills();
 }
 function renderUndo() {
  const panel=$('recentDeletions');if(!panel)return;panel.replaceChildren(element('h2','削除の取り消し'));
  panel.append(element('p','アプリを再読み込みするまで、直近5件の端末内記録を戻せます。','notice'));
  if(!undoEntries.length){panel.append(element('p','取り消せる削除はありません。','notice'));return}
  undoEntries.forEach(entry=>{
   const row=element('div',undefined,'experience-row');row.append(element('span',entry.label),button('元に戻す',()=>{
    try {
     const raw=localStorage.getItem(entry.key);const current=raw===null?[]:JSON.parse(raw);
     const next=putBack(current,entry);
     validateFullBackupObject({format:'toto-full-backup-v1',data:{[entry.key]:JSON.stringify(next)}});restoringDeletion=true;
     if(!verifiedSaveJson(entry.key,next))throw Error('save');
     undoEntries.splice(undoEntries.indexOf(entry),1);refreshRecordViews(entry.key);renderUndo();
     saveMessage('「'+entry.label+'」を元に戻しました。');
    }catch(e){saveMessage('元に戻せませんでした。保存状態や同じ記録の有無を確認してください。',true)}finally{restoringDeletion=false}
   }));panel.append(row);
  });
 }
 const undoPanel=card('recentDeletions','削除の取り消し');$('more').append(undoPanel);
 const storageCard=card('recordStorageCard','記録の保存状態');
 const summary=element('p','この端末の保存状態を確認できます。');summary.id='recordStorageSummary';summary.setAttribute('role','status');
 const capacity=element('p',undefined,'notice');capacity.id='recordCapacity';
 storageCard.append(summary,capacity,button('保存状態を確認',checkStorage),button('バックアップを開く',()=>openFullBackupFromReadiness()));$('more').append(storageCard);
 function renderStorage() {
  try {
   let bytes=0;for(const storageKey of allBackupKeys){const value=localStorage.getItem(storageKey);if(value!==null)bytes+=new Blob([storageKey,value]).size}
   $('recordCapacity').textContent='記録の文字データ：約'+Math.ceil(bytes/1024)+' KB。ブラウザの保存領域に含まれます。'+storageSummary;
   $('recordStorageSummary').textContent=lastFailure||(lastSavedAt?'この表示中の最終保存確認：'+lastSavedAt:'記録はこの端末のブラウザに保存されます。バックアップも別に保管してください。');
  }catch(e){$('recordStorageSummary').textContent='保存領域を読み取れません。端末の設定を確認してください。'}
 }
 async function checkStorage() {
  const probe='toto-storage-check-'+Date.now();
  try {
   originalSet.call(localStorage,probe,'ok');if(originalGet.call(localStorage,probe)!=='ok')throw Error('verify');originalRemove.call(localStorage,probe);
   lastFailure='';saveMessage('保存領域への書き込み・読み取りを確認しました。');
   if(navigator.storage?.estimate){const estimate=await navigator.storage.estimate();if(estimate.quota>0)storageSummary=' サイト全体の使用量の目安：約'+Math.ceil((estimate.usage||0)/1048576)+' MB／約'+Math.floor(estimate.quota/1048576)+' MB。記録専用の上限とは異なります。'}
  }catch(e){saveMessage('保存領域を確認できませんでした。容量不足やブラウザの保存設定を確認してください。',true)}
  finally{try{originalRemove.call(localStorage,probe)}catch(e){}renderStorage()}
 }
 const optionalSetup=card('optionalStockSetup','必要量の計算は、あとから設定できます');
 optionalSetup.append(element('p','安全点検が済んだら、まず家にある備蓄を1つ登録しましょう。人数・日数・トイレの回数を設定すると、必要量の目安を計算できます。','notice'),button('人数・日数を設定する',openStockSetup));
 $('supplies').insertBefore(optionalSetup,$('supplyInventoryCard'));
 function renderOptionalSetup(){optionalSetup.hidden=stockSetupComplete()}
 renderOptionalSetup();
 const lifestyleCard=button('',()=>show('minimalistGuide'));lifestyleCard.id='optionalLifestyleGuide';lifestyleCard.classList.add('minimalist-menu-card');lifestyleCard.setAttribute('aria-label','ミニマリストのススメを開く');
 const leaf=document.createElementNS('http://www.w3.org/2000/svg','svg');leaf.setAttribute('viewBox','0 0 24 24');leaf.setAttribute('fill','none');leaf.setAttribute('stroke','currentColor');leaf.setAttribute('stroke-width','1.7');leaf.setAttribute('stroke-linecap','round');leaf.setAttribute('stroke-linejoin','round');leaf.setAttribute('aria-hidden','true');leaf.setAttribute('focusable','false');
 const leafPath=document.createElementNS('http://www.w3.org/2000/svg','path');leafPath.setAttribute('d','M5 15C5 8 11 5 19 5c0 8-3 14-10 14H5v-4ZM5 19 15 9');leaf.append(leafPath);
 const lifestyleName=element('span','ミニマリストのススメ');const lifestyleArrow=element('span','→');lifestyleArrow.setAttribute('aria-hidden','true');
 lifestyleCard.append(leaf,lifestyleName,lifestyleArrow);$('more').querySelector('.refresh-menu-grid').append(lifestyleCard);
 const manualGuide=element('div',undefined,'experience-actions');manualGuide.append(button('はじめての案内を見る',()=>openTutorial(true)));document.querySelector('#home .refresh-home-mission').append(manualGuide);
 const favoritesPanel=element('dialog');
 favoritesPanel.id='favoritesDialog';
 favoritesPanel.setAttribute('aria-labelledby','favoritesTitle');
 const favoritesHeading=element('div',undefined,'favorites-panel-heading');
 const favoritesTitle=element('h2','お気に入り');
 favoritesTitle.id='favoritesTitle';
 const closeFavorites=button('閉じる',()=>favoritesPanel.close());
 favoritesHeading.append(favoritesTitle,closeFavorites);
 const favoriteToggle=button('このページをお気に入りに追加',toggleFavorite);
 favoriteToggle.id='favoritePageToggle';
 const favoriteStatus=element('p',undefined,'notice');
 favoriteStatus.id='favoriteStatus';
 favoriteStatus.setAttribute('role','status');
 const favoritesCard=element('div');
 favoritesCard.id='favoritePages';
 favoritesPanel.append(favoritesHeading,favoriteToggle,favoriteStatus,favoritesCard);
 const favoritesLauncher=button('',()=>{
  loadPreferences();
  renderFavorites();
  favoriteStatus.textContent='';
  favoritesPanel.showModal();
  favoritesLauncher.setAttribute('aria-expanded','true');
 });
 favoritesLauncher.id='favoritesLauncher';
 favoritesLauncher.setAttribute('aria-haspopup','dialog');
 favoritesLauncher.setAttribute('aria-controls','favoritesDialog');
 favoritesLauncher.setAttribute('aria-expanded','false');
 favoritesLauncher.innerHTML='<svg viewBox="0 0 24 24" fill="#ffe19a" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9Z"/></svg><span>お気に入り</span>';
 favoritesPanel.addEventListener('close',()=>{
  favoritesLauncher.setAttribute('aria-expanded','false');
 });
 document.body.append(favoritesPanel,favoritesLauncher);
 const feedback=button('感想・不具合を送る',openFeedback);
 feedback.id='pageFeedback';
 const feedbackFooter=element('footer',undefined,'page-feedback-footer');
 feedbackFooter.append(feedback);

 function positionFavoritesLauncher() {
  const navigation=document.querySelector('nav');
  const moreButton=navigation.querySelector('[data-page="more"]');
  const navBox=navigation.getBoundingClientRect();
  const moreBox=moreButton.getBoundingClientRect();
  const right=Math.max(12,innerWidth-moreBox.left-(moreBox.width+56)/2);
  document.documentElement.style.setProperty('--favorites-right',right+'px');
  document.documentElement.style.setProperty('--favorites-bottom',(innerHeight-navBox.top+12)+'px');
 }
 window.addEventListener('resize',positionFavoritesLauncher);
 if(typeof ResizeObserver!=='undefined'){
  new ResizeObserver(positionFavoritesLauncher).observe(document.querySelector('nav'));
 }
 positionFavoritesLauncher();
 function pageTitle(page) {return pageNames[page]||page}
 function renderFavorites() {
  favoritesCard.replaceChildren();
  if(!preferences.favorites.length){
   favoritesCard.append(element('p','よく使うページを開き、上のボタンから登録してください。最大8件です。','notice'));
  }
  const row=element('div',undefined,'experience-favorites');
  preferences.favorites.forEach(page=>{
   const item=element('div',undefined,'experience-favorite-item');
   const open=button(pageTitle(page),()=>{
    favoritesPanel.close();
    show(page);
   });
   open.classList.add('experience-favorite-open');
   open.dataset.favoritePage=page;
   const remove=button('解除',()=>removeFavorite(page));
   remove.classList.add('experience-favorite-remove');
   remove.setAttribute('aria-label',pageTitle(page)+'のお気に入り解除');
   item.append(open,remove);
   row.append(item);
  });
  favoritesCard.append(row);
  favoritesLauncher.setAttribute('aria-label','お気に入りを開く（'+preferences.favorites.length+'件）');
  favoriteToggle.disabled=!allowedPages.includes(activePage);
  const registered=preferences.favorites.includes(activePage);
  favoriteToggle.textContent=registered?'このページのお気に入りを解除':'このページをお気に入りに追加';
  favoriteToggle.setAttribute('aria-pressed',String(registered));
  const section=$(activePage);
  if(section)section.append(feedbackFooter);
 }
 function removeFavorite(page) {
  loadPreferences();
  if(savePreferences({...preferences,favorites:preferences.favorites.filter(saved=>saved!==page)})){
   favoriteStatus.textContent='「'+pageTitle(page)+'」のお気に入りを解除しました。';
   favoriteToggle.focus();
  }
 }
 function toggleFavorite() {
  loadPreferences();
  const favorites=preferences.favorites.slice();
  const index=favorites.indexOf(activePage);
  if(index>=0)favorites.splice(index,1);
  else if(favorites.length<8)favorites.push(activePage);
  else{
   favoriteStatus.textContent='お気に入りは8件までです。登録済みのページを解除すると追加できます。';
   return;
  }
  if(savePreferences({...preferences,favorites})){
   favoriteStatus.textContent=index>=0?'お気に入りから外しました。':'このページをお気に入りに追加しました。';
  }
 }
 const displayCard=card('simpleDisplayCard','表示を選ぶ');
 const simpleLabel=element('label',undefined,'experience-row');const simpleCheckbox=element('input');simpleCheckbox.type='checkbox';simpleCheckbox.id='simpleDisplay';
 simpleLabel.append(simpleCheckbox,element('span','簡易表示にする'));displayCard.append(simpleLabel,element('p','キャラクターの大きなイラストを省き、余白を詰めて表示します。','notice'));$('more').append(displayCard);
 simpleCheckbox.addEventListener('change',()=>{loadPreferences();if(!savePreferences({...preferences,simple:simpleCheckbox.checked}))simpleCheckbox.checked=preferences.simple});
 function applyPreferences() {document.body.classList.toggle('simple-display',preferences.simple);simpleCheckbox.checked=preferences.simple;reminderCheckbox.checked=preferences.reminders;renderFavorites()}
 const feedbackDialog=element('dialog');feedbackDialog.id='feedbackDialog';feedbackDialog.setAttribute('aria-labelledby','feedbackTitle');
 const feedbackTitle=element('h2','感想・不具合を送る');feedbackTitle.id='feedbackTitle';
 const feedbackLabel=element('label','内容');const feedbackText=element('textarea');feedbackText.className='field';feedbackText.rows=5;feedbackText.maxLength=2000;feedbackLabel.append(feedbackText);
 const feedbackContext=element('p',undefined,'notice');const feedbackStatus=element('p',undefined,'notice');feedbackStatus.setAttribute('role','status');
 const email=element('a','メールを作成','secondary');const feedbackCopy=button('文章をコピー',async()=>{
  try{await navigator.clipboard.writeText(feedbackBody());feedbackStatus.textContent='コピーしました。メールなどに貼り付けて送れます。'}catch(e){feedbackFallback.value=feedbackBody();feedbackFallback.hidden=false;feedbackFallback.focus();feedbackFallback.select();feedbackStatus.textContent='下の文章を選択してコピーしてください。'}
 });
 const feedbackFallback=element('textarea');feedbackFallback.className='field';feedbackFallback.readOnly=true;feedbackFallback.hidden=true;feedbackFallback.setAttribute('aria-label','コピー用の報告文');
 const contact=element('p','送信先：totonoe.bousai.support@gmail.com','notice');
 feedbackDialog.append(feedbackTitle,feedbackContext,feedbackLabel,email,feedbackCopy,feedbackFallback,contact,feedbackStatus,button('閉じる',()=>feedbackDialog.close()));document.body.append(feedbackDialog);
 let feedbackPage='home';
 function feedbackBody() {return 'ととのえ防災 ご意見・不具合\nページ：'+pageTitle(feedbackPage)+'\nバージョン：v260\n\n'+feedbackText.value}
 function updateFeedbackLink(){email.href='mailto:totonoe.bousai.support@gmail.com?subject='+encodeURIComponent('ととのえ防災 ご意見・不具合（'+pageTitle(feedbackPage)+'）')+'&body='+encodeURIComponent(feedbackBody())}
 feedbackText.addEventListener('input',updateFeedbackLink);
 function openFeedback(){feedbackPage=activePage;feedbackContext.textContent='対象ページ：'+pageTitle(feedbackPage)+'。備蓄・住所・写真などの記録は自動添付しません。';feedbackStatus.textContent='';feedbackFallback.hidden=true;updateFeedbackLink();feedbackDialog.showModal()}
 const updates=element('details',undefined,'card experience-card');updates.id='appUpdateNews';updates.append(element('summary','更新のお知らせ'));
 updates.append(element('h3','v260　2026年11月26日'),element('p','防災の木の水分補給とラジオ体操を、前足を修正した高解像度のトリオイラストに差し替えました。'));
 updates.append(element('h3','v249　2026年11月25日'),element('p','食品・飲料水は期限未入力でも必要量と比較し、ホームから期限の入力をご案内します。'));
 updates.append(element('h3','v248　2026年11月25日'),element('p','備蓄の編集欄が細くなり、文字や数字が読みにくくなる表示を修正しました。'));
 updates.append(element('h3','v247　2026年11月25日'),element('p','トロフィーとバッジをタップすると、獲得日と関連ページへの案内が開きます。'));
 updates.append(element('h3','v246　2026年11月25日'),element('p','バッジとトロフィーを同じ画面で見られるようにしました。'));
 updates.append(element('h3','v245　2026年11月25日'),element('p','片付け・備蓄のバッジを追加し、防災の木の仲間を新しいイラストにしました。'));
 updates.append(element('h3','v244　2026年11月25日'),element('p','防災の木に成長段階ごとの絵と仲間を追加し、8つのトロフィーにそれぞれのイラストを付けました。'));
 updates.append(element('h3','v243　2026年11月25日'),element('p','その他に「防災の木」を追加しました。ホームには今日できたことを表示します。'));
 updates.append(element('h3','v242　2026年11月25日'),element('p','片付けページの「ととのえる3ステップ」を削除しました。整理・整頓・備蓄はホームから開けます。'));
 updates.append(element('h3','v241　2026年11月25日'),element('p','住まいの安全点検を2つの画面に分け、お片付けノートを場所ごとに開ける表示にしました。'));
 updates.append(element('h3','v231　2026年11月24日'),element('p','その他のミニマリストのススメを、4枚の青いカードの下に葉のアイコン付き横長カードとして配置しました。'));
 updates.append(element('h3','v230　2026年11月24日'),element('p','優先安全点検の完了で備蓄を解放し、初回設定を必要な場面に分けました。下のメニューを5つに整理し、今日やることは1つと、折りたたんだ追加のおすすめを表示します。'));
 updates.append(element('h3','v229　2026年11月23日'),element('p','住まいの安全点検が完了したら、場所ごとのチェックリストへ進める案内を追加しました。'));
 updates.append(element('h3','v227　2026年11月22日'),element('p','ホームのお気に入りをイラストと「今日やること」の間に移動し、各項目の端に「お気に入り解除」を追加しました。'));
 updates.append(element('h3','v226　2026年11月22日'),element('p','感想・不具合報告、保存状態の確認、削除の取り消し、お気に入り、簡易表示、期限・点検のお知らせ、先に使う備蓄、買い物画面、講座の詳細とワークシート見本を追加しました。'));
 updates.append(element('h3','v225まで'),element('p','講座の相談窓口、YouTubeチャンネルへのリンク、左上のアプリアイコンを追加しました。'));$('more').append(updates);
 const reminderCard=card('reminderCard','期限・点検のお知らせ');
 const reminderLabel=element('label',undefined,'experience-row'),reminderCheckbox=element('input');reminderCheckbox.type='checkbox';reminderCheckbox.id='remindersEnabled';reminderLabel.append(reminderCheckbox,element('span','アプリ内のお知らせを表示する'));
 const reminderList=element('div');reminderList.id='reminderList';const reminderStatus=element('p',undefined,'notice');reminderStatus.id='reminderStatus';reminderStatus.setAttribute('role','status');
 reminderCard.append(reminderLabel,element('p','期限の30日前からと、点検予定日を過ぎた物をお知らせします。','notice'),reminderList,
  button('開いている間の端末通知を許可',enableNotifications),button('予定をカレンダーに追加',exportCalendar),
  element('p','アプリを閉じている間のお知らせは、書き出した予定を端末のカレンダーに取り込んでください。予定は自動更新されません。通知の有無はカレンダー側の設定にもよります。','notice'),reminderStatus);$('more').append(reminderCard);
 const reminderDates=element('div');
 [['safetyCheck','住まいの安全点検の予定日'],['goBagCheck','防災リュックの点検予定日']].forEach(([field,title])=>{
  const label=element('label',title),input=element('input');input.type='date';input.className='field';input.id=field+'Date';
  label.append(input);reminderDates.append(label);input.addEventListener('change',()=>{loadPreferences();if(input.value&&!validDate(input.value)){reminderStatus.textContent='有効な日付を入力してください。';return}if(savePreferences({...preferences,[field]:input.value}))renderReminders();else input.value=preferences[field]||''});
 });reminderCard.insertBefore(reminderDates,reminderList);
 const homeReminders=card('homeReminders','期限・点検のお知らせ');$('home').prepend(homeReminders);
 reminderCheckbox.addEventListener('change',()=>{loadPreferences();if(savePreferences({...preferences,reminders:reminderCheckbox.checked}))renderReminders();else reminderCheckbox.checked=preferences.reminders});
 function reminderEvents() {
  if(!supplyStorageReadable())throw Error('unreadable');
  const items=readSaved(key,[]),events=[];
  items.forEach((item,index)=>{
   if(validDate(item.exp)&&Number(item.qty)>0){const date=new Date(item.exp+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-30);events.push({id:'expiry-'+index+'-'+item.name+'-'+item.exp,date:date.toISOString().slice(0,10),title:item.name+'の期限を確認',description:'期限 '+item.exp,page:'supplies'})}
   if(validDate(item.nextCheck))events.push({id:'stock-check-'+index+'-'+item.name,date:item.nextCheck,title:item.name+'を点検',description:'備蓄の点検',page:'supplies'});
  });
  readPouchItems().forEach(item=>{if(validDate(item.nextCheck))events.push({id:'pouch-'+item.id,date:item.nextCheck,title:item.name+'を点検',description:'防災ポーチの点検',page:'pouch'})});
  const review=readEvacuationReview();if(validDate(review.next))events.push({id:'evacuation-review',date:review.next,title:'避難計画を見直す',description:'家族と避難先・連絡方法を確認',page:'evacuation'});
  [['safetyCheck','住まいの安全点検','homeSafety'],['goBagCheck','防災リュックの点検','goBag']].forEach(([field,title,page])=>{if(validDate(preferences[field]))events.push({id:field,date:preferences[field],title,description:'次回の点検予定日を確認してください。',page})});
  return events.sort((a,b)=>a.date.localeCompare(b.date));
 }
 function dueEvents(){const today=todayLocalDate();return reminderEvents().filter(event=>event.date<=today)}
 function renderReminders() {
  for(const field of ['safetyCheck','goBagCheck']){const input=$(field+'Date');if(input&&document.activeElement!==input)input.value=preferences[field]||''}
  homeReminders.hidden=!preferences.reminders||activePage==='emergency';reminderList.replaceChildren();homeReminders.replaceChildren(element('h2','期限・点検のお知らせ'));
  if(!preferences.reminders){reminderList.append(element('p','アプリ内のお知らせはオフです。','notice'));return}
  try {
   const due=dueEvents();
   if(!due.length){reminderList.append(element('p','今すぐ確認する期限・点検はありません。','notice'));homeReminders.hidden=true;return}
   [reminderList,homeReminders].forEach(host=>{host.append(element('p',due.length+'件の確認予定があります。'));due.slice(0,5).forEach(event=>host.append(button(event.title+'（'+event.date+'）',()=>show(event.page))));if(due.length>5)host.append(element('p','ほか'+(due.length-5)+'件。各管理画面で確認できます。','notice'))});
  }catch(e){reminderList.append(element('p','記録を読み取れないため、期限・点検を確認できません。','notice'));homeReminders.append(element('p','記録の保存状態を確認してください。'))}
 }
 let notificationsEnabled=false,notificationDate='';
 async function enableNotifications() {
  if(!('Notification' in window)||!window.isSecureContext){reminderStatus.textContent='この環境では端末通知を使えません。カレンダーへの追加をご利用ください。';return}
  try {
   const permission=await Notification.requestPermission();notificationsEnabled=permission==='granted';
   if(!notificationsEnabled){reminderStatus.textContent='端末通知は許可されていません。アプリ内のお知らせやカレンダーをご利用ください。';return}
   loadPreferences();if(!savePreferences({...preferences,reminders:true,deviceNotifications:true}))return;
   reminderStatus.textContent='この画面を開いている間、確認予定がある日に通知します。';renderReminders();await notifyDue();
  }catch(e){reminderStatus.textContent='通知を開始できませんでした。カレンダーへの追加をご利用ください。'}
 }
 async function notifyDue() {
  notificationsEnabled=preferences.deviceNotifications===true;
  if(!('Notification' in window)||!notificationsEnabled||!preferences.reminders||activePage==='emergency'||notificationDate===todayLocalDate()||Notification.permission!=='granted')return;
  try {
   const due=dueEvents();if(!due.length)return;
   const registration=await navigator.serviceWorker?.getRegistration('./');
   if(!registration?.showNotification){reminderStatus.textContent='端末通知はこの環境で利用できません。カレンダーに予定を追加できます。';return}
   await registration.showNotification('ととのえ防災 期限・点検のお知らせ',{body:due.length+'件の確認予定があります。',tag:'totonoe-reminder',data:{url:new URL('?page=more',location.href).href}});notificationDate=todayLocalDate();
  }catch(e){reminderStatus.textContent='端末通知を表示できませんでした。アプリ内で確認してください。'}
 }
 function downloadBlob(content,type,name) {
  const url=URL.createObjectURL(new Blob([content],{type}));const a=element('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 function exportCalendar() {
  try {
   const today=todayLocalDate(),events=reminderEvents().map(event=>({...event,date:event.date<today?today:event.date}));
   if(!events.length){reminderStatus.textContent='今後の予定がありません。期限・次回点検日を登録してください。';return}
   const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
   downloadBlob(calendarText(events,stamp),'text/calendar;charset=utf-8','totonoe-reminders.ics');reminderStatus.textContent='予定を書き出しました。端末のカレンダーに取り込み、通知設定を確認してください。再取り込みで重複する場合は、以前の予定を確認してください。';
  }catch(e){reminderStatus.textContent='予定を書き出せませんでした。保存した記録を確認してください。'}
 }
 const supplyTools=card('dailySupplyTools','備蓄を使う・買い足す');
 const soonList=element('div');soonList.id='useSoonList';supplyTools.append(element('h3','先に使う備蓄'),element('p','期限が30日以内の飲料水・食料です。期限切れの品は備蓄一覧で確認してください。','notice'),soonList,button('買い物画面を開く',openShopping));$('supplies').insertBefore(supplyTools,$('supplyInventoryCard'));
 function renderSupplyTools() {
  soonList.replaceChildren();
  if(!supplyStorageReadable()){soonList.append(element('p','保存内容を読み取れません。'));return}
  const today=todayLocalDate(),date=new Date(today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+30);
  const items=readSaved(key,[]),soon=useSoon(items,today,date.toISOString().slice(0,10));
  if(!soon.length){soonList.append(element('p','30日以内に期限を迎える飲料水・食料はありません。','notice'));return}
  soon.slice(0,8).forEach(({item,index})=>{
   const row=element('div',undefined,'experience-row');row.append(element('span',item.name+'　'+item.exp+'　残り'+item.qty+(item.unit||'個')),
    button('1'+(item.unit||'個')+'使った',()=>{supplies=readSaved(key,[]);if(JSON.stringify(supplies[index])!==JSON.stringify(item)){saveMessage('備蓄の内容が更新されています。一覧を確認してから操作してください。');renderSupplyTools();return}adjustSupplyQuantity(index,-1);renderSupplyTools()}));soonList.append(row);
  });
  if(soon.length>8)soonList.append(element('p','ほか'+(soon.length-8)+'件。備蓄一覧で確認できます。','notice'));
 }
 const shopping=element('dialog');shopping.id='shoppingDialog';shopping.className='experience-shopping';shopping.setAttribute('aria-labelledby','shoppingTitle');
 const shoppingTitle=element('h2','買い物リスト');shoppingTitle.id='shoppingTitle';const shoppingList=element('div');shoppingList.id='shoppingList';const shoppingStatus=element('p');shoppingStatus.setAttribute('role','status');
 shopping.append(shoppingTitle,element('p','目標数量に足りない品を表示します。補充の記録は、購入後に備蓄画面で行ってください。','notice'),shoppingList,shoppingStatus,button('閉じる',()=>shopping.close()));document.body.append(shopping);
 function openShopping(){renderShopping();shopping.showModal()}
 function renderShopping() {
  shoppingList.replaceChildren();shoppingStatus.textContent='';
  if(!supplyStorageReadable()){shoppingStatus.textContent='備蓄の保存内容を読み取れません。';return}
  const items=readSaved(key,[]),needs=replenishmentNeeds(items);
  if(!needs.length){shoppingStatus.textContent=items.some(item=>Number(item.target)>0)?'目標数量に対する不足品はありません。':'備蓄の編集で目標数量を設定すると、不足品が表示されます。';return}
  needs.forEach(({item,missing})=>{
   const label=element('label',undefined,'experience-shopping-item'),check=element('input');check.type='checkbox';
   const text=element('span',item.name+'　あと'+missing+(item.unit||'個'));label.append(check,text);shoppingList.append(label);
   check.addEventListener('change',()=>label.classList.toggle('shopping-checked',check.checked));
  });
 }
 const lecture=$('lectureInformation');
 if(lecture) {
  const details=element('details');details.id='workshopDetails';details.append(element('summary','講座の流れ・料金条件・見本を見る'));
  details.append(element('h3','講座の進め方'),element('p','講師による講座、ワークシートを使った整理、アプリを使った自宅での振り返りを組み合わせます。対象者やご希望に合わせ、内容・時間をご相談いただけます。'));
  details.append(element('p','参加者は地域の住民・親子・企業の従業員などを想定しています。60分の場合の進行例は、導入10分、講座・ワーク30分、振り返り20分です。実際の時間と内容はご相談のうえ決定します。'));
  details.append(element('h3','料金条件'),element('p','30,000円／回。講座・参加者用ワークシート・アプリでの自宅振り返りを含みます。交通費は別途。開催場所・時間・参加人数をお知らせください。税の扱いを含む最終金額は、お見積もり時にご案内します。'));
  details.append(element('h3','参加者用ワークシートの見本'),element('p','親子向け「わが家の防災プラン」の1ページ見本です。避難先、連絡方法、備蓄、今週やることを書き込みます。講座で使う内容は対象者に合わせてご相談ください。'));
  const sample=element('a','ワークシート見本を開く（PDF）','secondary');sample.id='worksheetSampleLink';sample.href='./assets/workshop-worksheet-sample.pdf';sample.target='_blank';sample.rel='noopener noreferrer';
  const sampleDownload=element('a','見本をダウンロード','secondary');sampleDownload.href=sample.href;sampleDownload.download='totonoe-bousai-worksheet-sample.pdf';details.append(sample,sampleDownload,element('p','PDFの初回表示には通信が必要です。','notice'));lecture.append(details);
 }
 // Keep the new settings together below the existing workshop information.
 loadPreferences();applyPreferences();renderUndo();renderStorage();renderReminders();renderSupplyTools();
 const originalRestore=restoreAllData;
 restoreAllData=function(){restoringDeletion=true;try{return originalRestore.apply(this,arguments)}finally{restoringDeletion=false}};
 const originalShow=show;
 show=function(page){const previous=activePage;const result=originalShow.apply(this,arguments);if(previous!==activePage&&favoritesPanel.open)favoritesPanel.close();renderFavorites();renderReminders();if(activePage==='supplies'){renderSupplyTools();renderOptionalSetup()}return result};
 window.addEventListener('storage',event=>{
  if(event.key===preferenceKey||event.key===null){loadPreferences();applyPreferences()}
  if(event.key===null||protectedArrays.has(event.key)){undoEntries.length=0;renderUndo()}
  if(event.key===null||allBackupKeys.includes(event.key)){if(event.key===null||event.key===key)supplies=readSaved(key,[]);refreshAfterWrite();if(shopping.open)renderShopping()}
 });
 window.addEventListener('toto-data-restored',()=>{undoEntries.length=0;loadPreferences();applyPreferences();refreshAfterWrite();if(shopping.open)renderShopping()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadPreferences();applyPreferences();refreshAfterWrite();notifyDue()}});
 setInterval(()=>{if(!document.hidden){renderReminders();renderSupplyTools();notifyDue()}},60000);
 notifyDue();
 window.TotonoeExperience={validPreferences,removedRecord,putBack,useSoon,validDate,calendarText};
})();

(() => {
 if (typeof document === 'undefined') return;
 // The sprite follows the order of the approved 40 illustrations.
 const headings = {
  home: {
   "自宅周辺のハザードマップを確認": 28,
   "仲間からのひとこと": 29,
   "今日の優先チェック": 29,
   "まずは、住まいの安全から": 8,
   "お気に入り": 13,
   "期限・点検のお知らせ": 39,
   "ほかのおすすめを見る": 29
  },
  learn: {
   "防災士試験対策・無料学習": 10,
   "防災 × お片付けの3ステップ": 10,
   "お片付けの4ステップ": 10,
   "電気・水道・ガスが止まったら？ 夏と冬の避難生活": 30,
   "自宅で過ごす備え": 10,
   "自宅を離れるときの備え": 10,
   "テーマから学ぶ": 10
  },
  minimalistGuide: {
   "ミニマリストのススメ": 4,
   "わが家の理想の暮らし": 14,
   "考え方を読む": 4,
   "どんな暮らしにしたいか": 14,
   "どんな暮らしに時間を使いたいですか？": 14,
   "整理・整頓・収納・掃除": 32,
   "整理で、毎日の片付けを楽にする": 2,
   "「好き」×「使う」で整理する": 2,
   "「好き」と「使う」で、持ち物を見直す": 2,
   "手放しは、迷いの少ないモノから": 2,
   "ミニマリズムと防災": 4,
   "ミニマリズムと防災の相性がいい理由": 4,
   "暮らしの変化とたこの部屋": 4,
   "片付けで毎日の暮らしが変わる": 4,
   "整理で生まれた余白を、どんな暮らしに使いますか？": 14,
   "アプリ作者・ミニマリストたこの部屋": 4,
   "片付けた場所を使いやすく保つ": 4,
   "実践の4ステップ": 4,
   "1．減らす前に、目的を決める": 14,
   "2．必要な物を選ぶ〈整理〉": 2,
   "3．使う場所・戻す場所を決める〈整頓・収納〉": 3,
   "4．暮らしに合わせて、備えと掃除を続ける": 32,
   "わが家で実践する": 4
  },
  select: {
   "整理": 2,
   "整理のポイント": 2
  },
  set: {
   "整頓": 3,
   "整頓のポイント": 3
  },
  stock: {
   "備蓄": 5,
   "備蓄のポイント": 5
  },
  supplies: {
   "必要なもの一覧": 5,
   "現金・大切な書類": 5,
   "薬・健康管理": 27,
   "水・食料・トイレ": 26,
   "停電への備え": 37,
   "家族やペットに合わせて": 15,
   "いまある備蓄": 5,
   "備蓄リスト": 5,
   "検索・絞り込み": 5,
   "＋ 備蓄品を登録する": 5,
   "備蓄を登録": 5,
   "保管場所・点検設定（任意）": 5,
   "補充リスト": 17,
   "買い物用の補充メモを作る": 17,
   "わが家の備蓄目安を計算する": 16,
   "食料の内容量を確認": 25,
   "わが家の備蓄目安を計算": 16,
   "飲料水の内訳と合計": 16,
   "持ち出しの備え": 5,
   "バックアップ・復元を開く": 38,
   "備蓄データのバックアップ": 38,
   "アプリ全体のバックアップ": 38,
   "機種変更の手順": 38,
   "コピー・貼り付けで操作する（予備）": 5,
   "備蓄レビューのバックアップ・復元": 38,
   "コピーしたレビューを貼り付けて復元": 38,
   "必要量の計算は、あとから設定できます": 16,
   "備蓄を使う・買い足す": 35,
   "先に使う備蓄": 35
  },
  reviews: {
   "みんなの備蓄レビュー": 36,
   "みんなの投稿": 36,
   "投稿・投票のためにログイン": 36,
   "公開投稿とアカウント": 38,
   "＋ 使った備蓄のレビューを書く": 36,
   "この端末のレビュー": 36
  },
  diagnosis: {
   "家庭別の防災弱点診断": 29,
   "防災ミッションの完了履歴": 29
  },
  emergency: {
   "緊急時情報をメモに控える": 8
  },
  evacuation: {
   "自宅が安全なら、在宅避難を": 9,
   "保存した避難計画": 38,
   "✎ 避難計画を登録・編集する": 9,
   "マイ避難計画": 9,
   "見直し予定を設定する": 39,
   "避難計画の見直し": 9,
   "訓練・確認の記録": 18
  },
  homeSafety: {
   "住まいの安全点検": 8,
   "① 寝る場所・家具の安全": 8,
   "② 部屋から屋外への避難経路": 8,
   "住まいの安全点検が完了しました": 8
  },
  pouch: {
   "0次持ち出し・防災ポーチ": 6,
   "いまの持ち物": 6,
   "検索・絞り込み": 6,
   "新しい持ち物を登録する": 6,
   "持ち物を登録": 6,
   "防災ポーチの中身の一例": 6,
   "用途・メモを追加する（任意）": 6,
   "防災ポーチ・防災ボトルの実例": 6
  },
  goBag: {
   "1次持ち出し・防災リュック": 7,
   "中身を追加する": 7,
   "防災リュックの中身の一例": 7,
   "防災リュックの実例": 7
  },
  tidy: {
   "お片付けを進める": 1,
   "場所ごとのチェックリスト": 1,
   "検索・絞り込み": 1,
   "＋ ほかの場所を追加する": 1,
   "新しい場所を記録": 1,
   "作業メモ・片付け前の様子を残す（任意）": 1,
   "記録を書き出す（必要なときだけ）": 1,
   "記録を文章で控える": 1,
   "防災を意識した部屋づくりの実例": 1,
   "実践ノート": 12,
   "写真とチェックで、変化を記録": 12
  },
  seasonalCheck: {
   "季節別の防災点検": 20,
   "確認する項目": 20
  },
  readiness: {
   "わが家の防災準備状況": 29,
   "次に確認すること": 29,
   "点検内容をテキストで控える": 29
  },
  family: {
   "家族・ペットの防災カルテ": 15,
   "個別に必要な備え・支援（任意）": 15,
   "登録した家族・ペット": 15,
   "必要な備えの確認": 15
  },
  training: {
   "訓練・実践記録": 18,
   "気づいたことを記録する（任意）": 18
  },
  moving: {
   "引越し防災サポート": 11,
   "1．転居先を決める前・転居前": 11,
   "2．荷造り・持ち物の見直し": 11,
   "3．入居直後に命を守る": 11,
   "4．新しい地域での備え": 11
  },
  outage: {
   "停電・断水シミュレーター": 30,
   "停電時の確認ポイント": 30
  },
  examStudy: {
   "アプリ内で例題を解く": 10,
   "全30問の解説を読む・検索する": 10,
   "防災士試験対策・無料学習": 10,
   "学習の進め方": 10,
   "試験の基本情報": 10,
   "家庭の備えにも生かす": 10
  },
  weather: {
   "気象庁の天気予報": 19,
   "最高・最低気温": 19,
   "警報・注意報と詳しい予報": 19
  },
  events: {
   "防災イベントを探す": 18,
   "全国の情報源から探す": 18
  },
  practiceQuiz: {
   "防災士試験対策・基礎例題": 10
  },
  helpGuide: {
   "使い方・データ保護ガイド": 38,
   "はじめての準備": 40,
   "記録はどこに保存される？": 38,
   "機種変更・復元の順番": 38,
   "通信がなくても使うには": 40,
   "保存できない・記録が見つからないとき": 38,
   "Web版の公開状況": 40,
   "プライバシーとデータ": 38,
   "お問い合わせ": 33
  },
  cleanPractice: {
   "掃除の実践": 32,
   "無理なく続けるコツ": 32
  },
  tidyAlbum: {
   "暮らしの備えの達成記録": 12,
   "成長アルバム": 12
  },
  more: {
   "その他の防災メニュー": 40,
   "機能を探す": 40,
   "備えをまとめて確認": 40,
   "避難・安全を確認する": 40,
   "訓練・実践を振り返る": 18,
   "引越しの備え": 40,
   "家族に合わせた備え": 40,
   "地域の天気": 19,
   "防災シミュレーション": 40,
   "備えを見直す": 40,
   "はじめての使い方": 40,
   "バックアップ・機種変更": 38,
   "ホーム画面に追加・オフラインの準備": 40,
   "表示設定": 40,
   "不具合報告用の情報を確認": 33,
   "動作診断・公開準備（必要なときだけ）": 40,
   "リリース候補版の総合診断": 40,
   "今回のリリース対象と今後の機能": 40,
   "✅ リリース前チェック": 40,
   "🐙 キャラクター6枚とまばたきの確認": 40,
   "保存データの総合点検": 38,
   "リリース前の実機検証表": 40,
   "次に行う実機検証": 40,
   "アプリの自動整合性チェック": 40,
   "検証結果を手動でコピーする": 40,
   "自動スモークテスト": 40,
   "初回Web版の公開準備：100%": 40,
   "初回リリースの対象と今後の機能": 40,
   "試作中の機能": 40,
   "片付け完了！": 12,
   "片付けも備蓄も、達成！": 12,
   "わが家の暮らし、こう変わりました": 12,
   "ミニマリストのススメが解放されました": 4,
   "わが家の備蓄目安を設定": 16,
   "天気・災害情報の地域": 40,
   "自宅周辺のハザードマップを確認": 28,
   "お気に入り": 13,
   "暮らしに合わせる": 14,
   "キャラクターの吹き出し": 40,
   "データとアプリ": 38,
   "講座のご依頼・ご相談": 34,
   "削除の取り消し": 38,
   "記録の保存状態": 38,
   "表示を選ぶ": 40,
   "更新のお知らせ": 39,
   "期限・点検のお知らせ": 39
  }
 };
 const pages = {
  home:29, learn:10, tidy:1, select:2, set:3, stock:5, supplies:5,
  pouch:6, goBag:7, homeSafety:8, evacuation:9, examStudy:10,
  practiceQuiz:10, moving:11, tidyAlbum:12, minimalistGuide:4,
  family:15, training:18, events:18, weather:19, seasonalCheck:20,
  diagnosis:29, readiness:29, outage:30, cleanPractice:32, reviews:36,
  helpGuide:40, more:40
 };
 const shortcuts = {
  '住まいの安全':8, '季節の防災':20, '避難生活':9, 'お片付け':1,
  '家族・ペットカルテ':15, 'マイ避難計画':9, '訓練・実践記録':18, '引越し防災':11,
  '地域・天気の設定':19, '世帯人数・備蓄日数':16, '住まいの安全点検':8,
  'バックアップ・機種変更':38, 'オフライン利用の確認':40, 'プチガイドをもう一度表示':40,
  '使い方・お問い合わせ':33, 'プライバシーポリシー':38
 };
 // Only the marked shortcuts use the object on its own.
 const shortcutObjects = {
  '地域・天気の設定':'weather-card',
  '世帯人数・備蓄日数':'calculator-bottle',
  '住まいの安全点検':'home-checklist',
  'バックアップ・機種変更':'shield-folder',
  'オフライン利用の確認':'settings-book',
  'プチガイドをもう一度表示':'settings-book',
  '季節の防災':'seasonal-checklist',
  '避難生活':'map',
  '家族・ペットカルテ':'family-card',
  'マイ避難計画':'map'
 };
 const checklist = '<rect x="10" y="8" width="28" height="34" rx="3" fill="#fff9e8"/><path d="M19 8V6a5 5 0 0 1 10 0v2h3v5H16V8z" fill="#b6c7d5"/>';
 const objectArtwork = {
  'weather-card': '<rect x="5" y="8" width="38" height="32" rx="4" fill="#fff7df"/><circle cx="30" cy="20" r="5" fill="#ffbf4b" stroke="#a45f13"/><path d="M30 11v2m7 2 2-2m0 7h2m-4 5 2 2" stroke="#a45f13"/><path d="M16 33a5 5 0 0 1 0-10 7 7 0 0 1 13 1 4.5 4.5 0 1 1 1 9Z" fill="#bce5f6"/>',
  'calculator-bottle': '<rect x="5" y="7" width="23" height="34" rx="4" fill="#e7edf2"/><rect x="9" y="12" width="15" height="7" rx="1" fill="#b9ded0"/><path d="M10 25h2m4 0h2m4 0h2m-14 5h2m4 0h2m4 0h2m-14 5h2m4 0h2m4 0h2"/><path d="M35 18h6v5l2 3v12a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3V26l2-3z" fill="#cef0ff"/><path d="M35 18h6v4h-6zm-2 11h10v5H33z" fill="#67b9e0"/>',
  'home-checklist': checklist+'<path d="m19 23 5-5 5 5v6H19z" fill="#9bd0ec"/><path d="m15 34 2 2 3-4m-5 7 2 2 3-4" stroke="#54802d"/><path d="M24 34h8m-8 5h8"/>',
  'shield-folder': '<path d="M4 13a3 3 0 0 1 3-3h12l5 5h16a4 4 0 0 1 4 4v17a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" fill="#ffda80"/><path d="M5 19h38" stroke="#987233"/><path d="m24 21 8 3v4c0 6-5 8-8 10-3-2-8-4-8-10v-4z" fill="#91cce9"/>',
  'settings-book': '<path d="M24 14c-6-5-13-6-20-5v26c7-1 14 0 20 5 6-5 13-6 20-5V9c-7-1-14 0-20 5z" fill="#a1d6f2"/><path d="M24 14v26M9 16c3 0 6 1 10 3M9 24c3 0 6 1 10 3"/><circle cx="34" cy="24" r="5" fill="#f4fbff"/><path d="M34 17v2m0 10v2m-7-7h2m10 0h2m-12-5 1.5 1.5m7 7L39 29m-10 0 1.5-1.5m7-7L39 19"/>',
  'seasonal-checklist': checklist+'<path d="m15 23 2 2 4-5m-6 14 2 2 4-5" stroke="#54802d"/><path d="M29 18v10m-4-7 8 4m-8 0 8-4" stroke="#3978a5"/><circle cx="29" cy="35" r="3" fill="#ffbe48" stroke="#a96a1d"/><path d="M29 30v1m0 8v1m-5-5h1m8 0h1" stroke="#a96a1d"/>',
  'map': '<path d="m5 14 12-5 14 4 12-5v27l-12 5-14-4-12 5z" fill="#dcf0c2"/><path d="M17 9v27m14-23v27" stroke="#73905b"/><path d="m6 29 11-6 12 5 14-7M9 19l7 5m4 11 8-7" stroke="#fff9db" stroke-width="3"/><path d="M35 16c0 5-7 11-7 11s-7-6-7-11a7 7 0 0 1 14 0z" fill="#e97463" stroke="#8d4539"/><circle cx="28" cy="16" r="2.2" fill="#fff" stroke="none"/>',
  'family-card': '<rect x="7" y="6" width="34" height="36" rx="4" fill="#fff7df"/><path d="M18 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 22a6 6 0 0 1 12 0Zm12 0a6 6 0 0 1 12 0Z" fill="#6ba1bd" stroke="none"/><path d="M18 36c0-2 3-5 6-5s6 3 6 5c0 3-4 2-6 1-2 1-6 2-6-1Z" fill="#9e755f" stroke="none"/><path d="M17 30h0m5-3h0m4 0h0m5 3h0" stroke="#9e755f" stroke-width="3"/>'
 };
 const tidyPlaces = [
  [/寝室|寝る場所/u,21], [/玄関|廊下/u,22], [/台所|キッチン/u,23],
  [/リビング|居間/u,24], [/クローゼット|押入れ|押し入れ/u,31],
  [/洗面|浴室|風呂/u,32]
 ];
 const label = node => node.textContent.replace(/[\s→⌄]+$/u,'').replace(/\s+/gu,' ').trim();
 function addIcon(node,artwork,replaceSelector) {
  if (!node || (typeof artwork !== 'number' && typeof artwork !== 'string') || node.querySelector(':scope > .chibi-icon')) return;
  const icon = document.createElement('span');
  icon.className = 'chibi-icon';
  icon.setAttribute('aria-hidden','true');
  if (typeof artwork==='string') {
   icon.classList.add('object-icon');
   icon.dataset.objectIcon=artwork;
   icon.innerHTML='<svg viewBox="0 0 48 48" focusable="false" aria-hidden="true"><g fill="none" stroke="#35546a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+objectArtwork[artwork]+'</g></svg>';
   node.classList.add('with-object-icon');
  } else {
   const index=artwork-1;
   icon.dataset.illustration=artwork;
   icon.style.backgroundPosition=(index % 8 * 100 / 7)+'% '+(Math.floor(index / 8) * 25)+'%';
  }
  const previous = replaceSelector && node.querySelector(replaceSelector);
  if (previous) previous.replaceWith(icon);
  else node.prepend(icon);
  node.classList.add('with-chibi');
 }
 const decorateHeading = (node,section) => {
  const title=label(node);
  const number=headings[section]?.[title.replace(/ YOUR MISSIONS$/u,'')];
  addIcon(node,number);
 };
 for (const section of document.querySelectorAll('main > section')) {
  section.querySelectorAll('h2,h3,summary').forEach(node => decorateHeading(node,section.id));
 }
 document.querySelectorAll('.refresh-menu-grid button, #more .more-menu-button').forEach(node => {
  const title=label(node);
  const artwork=node.id==='optionalLifestyleGuide' ? 4 : shortcutObjects[title]??shortcuts[title];
  addIcon(node,artwork,':scope > svg');
  if (artwork!==undefined && node.matches('.more-menu-button,#optionalLifestyleGuide')) {
   const icon=node.querySelector(':scope > .chibi-icon');
   const copy=document.createElement('span');
   copy.className='chibi-card-copy';
   copy.append(...Array.from(node.childNodes).filter(child => child!==icon));
   node.prepend(copy);
  }
 });
 document.querySelectorAll('.refresh-tiles .refresh-tile').forEach((node,index) => {
  addIcon(node,[2,3,5][index],':scope > svg');
 });
 for (const [id,number] of Object.entries({
  stockTargetButton:16, pageFeedback:33
 })) addIcon(document.getElementById(id),number);
 document.querySelectorAll('main a[href^="https://disaportal.gsi.go.jp/"]').forEach(node => addIcon(node,28));
 for (const [id,number] of Object.entries({
  fullBackupDialog:38, stockSetupDialog:16, stockGateDialog:8, livingMilestoneDialog:12, shoppingDialog:17
 })) {
  addIcon(document.querySelector('#'+id+' h2'),number);
 }
 function decorateList(host,decorate) {
  if (!host) return;
  decorate(host);
  new MutationObserver(records => {
   if (records.some(record => Array.from(record.addedNodes).some(node =>
    node instanceof Element && !node.classList.contains('chibi-icon')
   ))) decorate(host);
  }).observe(host,{childList:true,subtree:true});
 }
 decorateList(document.getElementById('emergencyFamily'),host => {
  addIcon(host.querySelector(':scope > h3'),'family-card');
 });
 decorateList(document.getElementById('tidyList'),host => {
  host.querySelectorAll('.tidy-checklist > summary').forEach(node => {
   const place=node.querySelector('.tidy-place-name').textContent;
   addIcon(node,tidyPlaces.find(([pattern]) => pattern.test(place))?.[1] ?? 1);
  });
 });
 for (const [id,number] of [['homeReminders',39],['recentDeletions',38]]) {
  decorateList(document.getElementById(id),host => addIcon(host.querySelector('h2'),number));
 }
 for (const id of ['favoritePages','homeFavorites']) {
  decorateList(document.getElementById(id),host => {
   addIcon(host.querySelector('h2'),13);
   host.querySelectorAll('[data-favorite-page]').forEach(node => addIcon(node,pages[node.dataset.favoritePage]));
  });
 }
 decorateList(document.querySelector('#supplies .refresh-stock-grid'),host => {
  host.querySelectorAll('.refresh-stock-stat label').forEach((node,index) => {
   addIcon(node,[25,25,26][index],':scope > svg');
  });
 });
})();

/* Purpose-based menus, actual achievements, explicit sharing and resumable forms. */
(function improveEverydayUse() {
 if(typeof document==='undefined')return;
 const $=id=>document.getElementById(id);
 const entryUrl=new URL(location.href),entryPage=entryUrl.searchParams.get('page');
 const targetPage=validPage(entryPage)?entryPage:'homeSafety';
 function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
 function action(text,run){const n=el('button',text,'secondary');n.type='button';n.onclick=run;return n}
 const style=el('style');
 style.textContent=`
 main p,main label,main li{line-height:1.7}main .notice{color:#465969;font-size:14px}
 main :is(button.primary,button.secondary,a.secondary){border-radius:12px;min-height:44px}
 .refresh-tiles .refresh-tile strong{font-size:21px}.refresh-tiles .refresh-tile small{font-size:11px;font-weight:500}
 .more-purpose{margin:22px 0 28px;border-top:2px solid #e2edf1;padding-top:16px}.more-purpose>h2{font-size:21px;margin:0 0 14px}
 #todayAchievements{margin:10px 0 6px;padding:8px 10px;background:#f3f7f1;border-radius:8px;color:#2c5140;font-size:13px;line-height:1.5}
 #todayAchievements strong{margin-inline-end:8px;font-size:13px}
 #achievementBadges>h2::before{display:none}
 #home .home-scene-actions .game-mascot-scene{display:block!important;width:100%!important;max-width:none!important;aspect-ratio:auto!important;min-height:0!important;height:auto!important;padding:0!important;background:transparent!important}
 #home .game-mascot-scene::before,#home .game-mascot-scene::after{display:none!important}
 #home .game-mascot-scene>.character-art,#home .game-mascot-scene>.anime-approved-home-image{display:none!important}
 #homePreparednessTree{width:100%;box-sizing:border-box;padding:12px 12px 8px;background:linear-gradient(145deg,#eff8e6,#e2f1df);border:1px solid #bdd5b9;border-radius:16px}
 #homePreparednessTree .preparedness-tree-art{width:min(100%,340px);height:174px;margin:6px auto 12px;background:none}
 #homePreparednessTree .preparedness-plant{width:205px;bottom:4px}
 #homePreparednessTree .preparedness-tree-friend{width:72px;bottom:0}
 #homePreparednessTree .preparedness-tree-friend[data-friend=tako]{left:0}
 #homePreparednessTree .preparedness-tree-friend[data-friend=tricera]{right:0;width:82px}
 #homePreparednessTree .preparedness-tree-friend[data-friend=shimaenaga]{top:auto;bottom:82px;right:8px;width:60px}
 #homePreparednessTree .preparedness-tree-friend,#homePreparednessTree .preparedness-group{z-index:2}
 #homePreparednessTree .preparedness-pose{background-image:url('./assets/home-mascot-poses-v251.webp');background-size:400% 300%;background-repeat:no-repeat}
 #homePreparednessTree .preparedness-group{position:absolute;width:148px;aspect-ratio:1;bottom:0;left:0}
 #homePreparednessTree .preparedness-group[data-pose=lift]{left:auto;right:0;width:132px}
 #homePreparednessTree .preparedness-group[data-pose=drink],#homePreparednessTree .preparedness-group[data-pose=exercise]{width:230px;aspect-ratio:2;background-image:url('./assets/home-trio-v260.webp');background-size:100% 200%;bottom:0;left:50%;transform:translateX(-50%)}
 #home .game-mascot-scene:not([data-tree-pose=solo]) .preparedness-tree-friend[data-friend=shimaenaga]{bottom:16px}
 #homePreparednessTree .preparedness-tree-copy{display:flex;align-items:center;justify-content:space-between;gap:6px}
 #homePreparednessTree h3{margin:0;font-size:16px;white-space:nowrap;color:#2b543b}
 #homePreparednessTree #preparednessTreeStage{margin:0;font-size:12px;text-align:right;color:#365541;display:flex;align-items:baseline;justify-content:flex-end;flex-wrap:wrap;gap:3px 6px}
 #homePreparednessTree #preparednessTreeStage>span{display:inline}
 #homePreparednessTree .preparedness-count{margin:0!important;font-size:11px}
 #homePreparednessTree>.refresh-speech{position:relative!important;inset:auto!important;display:flex;max-width:none!important;width:100%!important;margin:0!important;min-height:58px!important;border:1px solid #bdd5b9;background:#fff;border-radius:12px;padding:7px 10px 7px 49px;transform:none!important}
 #homePreparednessTree>.refresh-speech::after{content:"";display:block;position:absolute;top:-6px;left:21px;width:10px;height:10px;background:#fff;border-top:1px solid #bdd5b9;border-left:1px solid #bdd5b9;transform:rotate(45deg)}
 #homePreparednessTree>.refresh-speech::before{content:"";position:absolute;left:7px;top:9px;width:34px;height:34px;background:url('./assets/achievement-friends-and-badges-v245.webp') no-repeat;background-size:400% 300%;background-position:0 0}
 #homePreparednessTree>.refresh-speech[data-kind=tricera]::before{background-position:33.333333% 0}
 #homePreparednessTree>.refresh-speech[data-kind=bird]::before{background-position:66.666667% 0}
 #homePreparednessTree>.refresh-speech[data-kind=tree]::before{background-image:url('./assets/achievement-art-v244.webp')}

 #homePreparednessTree>.refresh-speech span{font-size:13px!important;color:#294737;line-height:1.5}
 #homePreparednessTree>.refresh-speech strong{font-size:12px!important;color:#356148}
 body[data-speech-mode=hidden] #homePreparednessTree>.refresh-speech{display:none!important}
 @media(max-width:350px){#homePreparednessTree .preparedness-tree-art{height:160px}#homePreparednessTree .preparedness-plant{width:180px}#homePreparednessTree .preparedness-tree-friend{width:66px}#homePreparednessTree .preparedness-tree-friend[data-friend=tricera]{width:76px}#homePreparednessTree .preparedness-tree-friend[data-friend=shimaenaga]{width:54px}#homePreparednessTree .preparedness-group{width:132px}#homePreparednessTree .preparedness-group[data-pose=lift]{width:120px}#homePreparednessTree .preparedness-group[data-pose=drink],#homePreparednessTree .preparedness-group[data-pose=exercise]{width:210px;bottom:0}#homePreparednessTree h3{font-size:15px}#homePreparednessTree #preparednessTreeStage{font-size:11px}#homePreparednessTree .preparedness-count{font-size:10px}}

 #achievementBadges .preparedness-tree{display:flex;align-items:center;gap:14px;padding:14px;border:1px solid #bdd5b9;border-radius:14px;background:linear-gradient(145deg,#f6fbf0,#e8f4e6)}
 #achievementBadges .preparedness-tree h3,#achievementBadges .preparedness-tree p{margin:0}
 #preparednessTreeStage>span{display:block}
 #preparednessTreeStage .preparedness-count{margin-top:3px;font-size:13px;white-space:nowrap;color:#365541}
 .preparedness-tree-art{position:relative;flex:0 0 clamp(104px,39vw,164px);height:134px;border-radius:10px;background:radial-gradient(ellipse at 50% 82%,#d7e8c7 0%,#f7faf0 73%)}
 .preparedness-illustration{display:block;aspect-ratio:1;background:url("./assets/achievement-art-v244.webp") no-repeat;background-size:400% 300%}
 .preparedness-plant{position:absolute;bottom:9px;left:50%;transform:translateX(-50%);width:min(100%,128px)}
 .preparedness-friend-badge{display:block;aspect-ratio:1;background:url("./assets/achievement-friends-and-badges-v245.webp") no-repeat;background-size:400% 300%}
 .preparedness-tree-friend{position:absolute;width:57px;bottom:2px}
 .preparedness-tree-friend[data-friend=tako]{left:-1px}
 .preparedness-tree-friend[data-friend=tricera]{right:-2px}
 .preparedness-tree-friend[data-friend=shimaenaga]{right:0;top:2px;bottom:auto;width:49px}
 @media(max-width:340px){.preparedness-tree-art{height:122px;flex-basis:44%}.preparedness-tree-friend{width:49px}.preparedness-tree-friend[data-friend=shimaenaga]{width:41px}}
 .preparedness-trophies{list-style:none;padding:0;margin:10px 0 16px}
 .preparedness-trophies li{border-bottom:1px solid #e6eee7;padding:6px 0;font-size:14px}
 .preparedness-trophy-art{width:50px;flex:none}
 .preparedness-trophies li[data-earned=false]{color:#4b5b52}
 .preparedness-trophies li[data-earned=false] .preparedness-trophy-art{filter:saturate(.35);opacity:.62}
 .preparedness-trophies li[data-earned=true]{color:#28553a;font-weight:700}
 #openAchievementCollection{margin-top:12px}
 #achievementCollection{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;border:0;border-radius:0;padding:0;background:#f8fbf7;color:#20392d;overflow:hidden}
 #achievementCollection[open]{display:flex;flex-direction:column}
 body:has(#achievementCollection[open]){overflow:hidden}
 .achievement-collection-bar{flex:none;background:#fff;border-bottom:1px solid #dce8dd;padding:max(10px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) 10px max(14px,env(safe-area-inset-left))}
 .achievement-collection-bar>div{display:flex;justify-content:space-between;align-items:center;gap:10px;max-width:640px;margin:auto}
 #achievementCollectionTitle{margin:0;font-size:clamp(18px,5vw,24px)}
 #achievementCollectionClose{display:grid;place-items:center;flex:none;width:44px;height:44px;border:1px solid #c9dbcd;border-radius:12px;background:#eff6f0;color:#20392d;font-size:24px;line-height:1;cursor:pointer}
 .achievement-collection-scroll{min-height:0;flex:1;overflow-y:auto;overscroll-behavior:contain}
 .achievement-collection-content{max-width:640px;margin:auto;padding:18px max(14px,env(safe-area-inset-right)) max(20px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}
 .achievement-collection-content section{margin:0 0 18px;padding:14px;border:1px solid #dae6dc;border-radius:14px;background:#fff}
 .achievement-collection-content h3{margin:0 0 8px;font-size:17px;font-weight:700}

 .milestone-badges{display:grid;gap:8px;list-style:none;padding:0}
 .milestone-badges li{min-width:0;background:#f8faf5;border:1px solid #dfe9d7;border-radius:12px;padding:7px 10px;font-size:14px;overflow-wrap:anywhere}
 .milestone-badge-art{flex:0 0 48px;width:48px}
 .milestone-badge-label{min-width:0}
 .achievement-item summary{display:flex;align-items:center;gap:10px;min-height:48px;cursor:pointer;list-style:none}
 .achievement-item summary::-webkit-details-marker{display:none}
 .achievement-item-chevron{margin-inline-start:auto;color:#55705c}
 .achievement-item[open] .achievement-item-chevron{transform:rotate(180deg)}
 .achievement-item-data{padding:4px 0 8px 60px;color:#2d4836;font-size:14px;font-weight:400}
 .achievement-item-data p{margin:0 0 8px}
 .achievement-item-data button{min-height:44px}


 .milestone-notice{padding:12px;background:#fff7dd;border-radius:12px;margin:12px 0;color:#514221}.milestone-notice:empty{display:none}
 #achievementShareDialog{width:min(94vw,620px);max-height:90dvh;overflow:auto}#achievementShareDialog label{display:flex;align-items:flex-start;gap:9px;padding:8px 0;font-size:15px}
 #achievementShareDialog input[type=checkbox]{flex:0 0 21px;width:21px;height:21px;margin-top:3px}
 #sharePhotos img{width:64px;height:64px;object-fit:cover;border-radius:6px}#sharePreview{width:100%;min-height:130px;font-size:15px;line-height:1.7}
 .related-video{margin:14px 0;padding:14px;background:#f2f8fc;border-radius:12px}.related-video a{display:inline-block;min-height:44px;padding:8px 0}
 .draft-resume{background:#f4f8ee;border-radius:10px;padding:10px;font-size:14px}#draftStatus{font-size:13px;color:#465969}#draftStatus:empty{display:none}
 `;document.head.append(style);

 // Keep each existing control and its event handlers while moving it into a purpose group.
 const more=$('more'),quick=more.querySelector('.refresh-menu-grid'),cards=[...more.children];
 function group(id,title){const n=el('div',undefined,'more-purpose');n.id=id;n.append(el('h2',title));return n}
 const familyGroup=group('moreFamilyGroup','家族の備え'),settingsGroup=group('moreSettingsGroup','アプリの設定・データ'),authorGroup=group('moreAuthorGroup','作者・講座・お問い合わせ');
 const authorGrid=el('div',undefined,'refresh-menu-grid');authorGrid.append($('optionalLifestyleGuide'));authorGroup.append(authorGrid);
 familyGroup.append(quick);
 for(const card of cards){
  if(card===quick||card.id==='favoritePages'||card.matches('.refresh-title-row,.page-intro,.feature-search-card,.wrap-up-entry,.page-feedback-footer'))continue;
  if(card.id==='lectureInformation'){authorGroup.append(card);continue}
  if(card.querySelector('h2')?.textContent.trim()==='暮らしに合わせる'){familyGroup.append(card);continue}
  for(const link of [...card.querySelectorAll(':scope > .more-menu-button')])if(/使い方・お問い合わせ|プライバシーポリシー/.test(link.textContent))authorGroup.append(link);
  settingsGroup.append(card);
 }
 more.append(familyGroup,settingsGroup,authorGroup);
 const channel='https://youtube.com/@bousai_minimalist?si=XpsfAOzwURehwpo5';
 function video(host,text,url){const box=el('aside',undefined,'related-video'),link=el('a',text);link.href=url;link.target='_blank';link.rel='noopener noreferrer';box.append(link);host.append(box)}
 video($('select'),'動画で、必要な物の選び方を学ぶ',channel);
 video($('set'),'動画で、使う場所・戻す場所の決め方を学ぶ',channel);
 video($('stock'),'動画で、水・食料・トイレの備えを学ぶ',channel);
 video(authorGroup,'防災ミニマリストたこのYouTubeを見る',channel);
 const examVideo=$('examStudy').querySelector('a[href*="youtu"]');if(examVideo)video($('learn'),'防災士試験の例題・音声を動画で学ぶ',examVideo.href);


 const reasons=el('details',undefined,'card beginner-reasons learn-compact-fold');reasons.id='preparednessReasons';
 reasons.innerHTML=`<h2>片付けと備蓄が必要な理由</h2>
 <p class="notice">理由が分かると、最初の一歩を選びやすくなります。このページだけで読めます。</p>
 <div class="reason-index" role="navigation" aria-label="理由の目次"><a href="#reasonTidy">片付ける目的</a><a href="#reasonPlaces">場所ごとの危険</a><a href="#reasonToilet">非常用トイレ</a><a href="#reasonBos">BOSを選ぶ理由</a></div>
 <section id="reasonTidy"><h3>何のために片付けるの？</h3><p>目的は、けがを減らすこと、出口まで通れること、必要な物をすぐ取り出せることです。全部を一度に片付ける必要はありません。</p>
 <h3>物が多いと、なぜ危ないの？</h3><p>床の荷物はつまずく原因になり、高い所の物や家具は揺れで落ちたり倒れたりすることがあります。まず床・出入口・寝る場所の周りから整えましょう。</p><p class="notice">物の数だけで安全は決まりません。置く場所や家具の固定も大切です。ミニマリストは作者がおすすめする暮らし方の一つで、無理に持ち物を減らす必要はありません。</p><div data-reason-action="tidy"></div></section>
 <details id="reasonPlaces"><summary>場所ごとの危険と、最初の一歩を見る</summary><div class="reason-places"></div></details>
 <section id="reasonToilet"><h3>なぜ非常用トイレを備えるの？</h3><p>断水・停電や排水管の損傷で、いつもの水洗トイレを使えなくなることがあります。水があっても排水管が壊れていれば流せません。使用できるか分からないときは無理に流さず、自治体や建物の管理者の案内を確認しましょう。</p><p>便器に袋を取り付けて使う携帯トイレを備えると、水を流さずに対応できます。人数と回数から必要量を考え、1回分を試して、家の便器に合うか・家族が使えるかを確認しておきましょう。</p><div data-reason-action="stock"></div></section>
 <section id="reasonBos"><h3>たこがBOSをおすすめする理由</h3><p class="reason-author">ここは作者のおすすめです。</p><p>固めることに加え、使用後のにおい対策まで備える点を重視しています。紹介しているBOSの4点セットは、防臭袋・凝固剤・汚物袋・便器カバーをまとめてそろえられます。</p><p>この商品を買うことが課題の条件ではありません。ほかの商品でも、袋の大きさ・必要回数・におい対策・保管場所を比べて選べます。</p><details><summary>選ぶ前に確認したいこと</summary><p>商品によってセット内容が異なります。たとえば1回分の商品には便器カバーが付きません。防臭に関する性能はメーカーの表示です。説明書どおりに使い、使用済み袋の保管・処分は自治体の案内に従ってください。</p></details><div data-reason-action="bos"></div></section>
 <details class="reason-sources"><summary>説明の参考・公式情報</summary><p>防災の基本は自治体の案内、商品の内容はメーカー公式情報を参考にしています。作者の選定理由と分けて掲載しています。2026年11月25日確認。</p>
 <ul><li><a href="https://www.bousai.metro.tokyo.lg.jp/bousai/1000027/1005737.html" target="_blank" rel="noopener noreferrer">東京都：家具類の転倒・落下・移動防止対策 ↗</a></li><li><a href="https://www.pref.kanagawa.jp/docs/j8g/bousai/keitaitoirebitiku.html" target="_blank" rel="noopener noreferrer">神奈川県：携帯トイレを備蓄しましょう ↗</a></li><li><a href="https://bos-bos.com/product/toilet/" target="_blank" rel="noopener noreferrer">BOS公式：セット内容・使い方 ↗</a></li></ul><p class="notice">本文は通信がなくても読めます。外部サイトは通信が必要です。</p></details>`;
 for(const [place,[short,explanation]] of Object.entries(tidyReasonTemplates)){
  const item=el('section');item.append(el('h4',place),el('p',short),el('p',explanation));reasons.querySelector('.reason-places').append(item);
 }
 reasons.querySelector('[data-reason-action=tidy]').append(action('片付けを始める',()=>show('tidy')),action('住まいの安全を確認する',()=>show('homeSafety')));
 reasons.querySelector('[data-reason-action=stock]').append(action('トイレの必要量を確認する',()=>{show('supplies');if(activePage!=='supplies')return;$('supplyCalcFold').open=true;$('stockCalculator').scrollIntoView({block:'start'})}));
 reasons.querySelector('[data-reason-action=bos]').append(action('備蓄ページのおすすめを見る',()=>{show('supplies');if(activePage!=='supplies')return;const panel=$('supplyRecommendations');panel.open=true;panel.scrollIntoView({block:'start'})}));
 const learn=$('learn'),learnTitle=learn.querySelector(':scope>.refresh-title-row');if(learnTitle)learnTitle.after(reasons);else learn.prepend(reasons);
 const learnIntro=el('div',undefined,'reason-entry');learnIntro.append(action('はじめに：片付けと備蓄が必要な理由',()=>openPreparednessReasons()));$('tidy').prepend(learnIntro);
 const stockReason=el('div',undefined,'reason-entry');stockReason.append(action('なぜ非常用トイレが必要？',()=>openPreparednessReasons('reasonToilet')));$('stock').querySelector('.card').prepend(stockReason);
 const calculatorReason=el('p');calculatorReason.append(action('なぜ非常用トイレが必要？',()=>openPreparednessReasons('reasonToilet')));$('stockCalculator').querySelector('h2').after(calculatorReason);
 const bosReason=el('p');bosReason.append(action('BOSを選ぶ理由・選ぶときの注意点',()=>openPreparednessReasons('reasonBos')));$('supplyRecommendations').querySelector('.affiliate-product').prepend(bosReason);
 const reasonStyle=el('style');reasonStyle.textContent=`.beginner-reasons>section,.beginner-reasons>details{border-top:1px solid #d9e6df;padding-top:12px;margin-top:16px}.beginner-reasons h3{font-size:18px}.beginner-reasons h4{margin-bottom:4px}.beginner-reasons p{font-size:14px;line-height:1.75}.beginner-reasons summary,.tidy-reason summary{cursor:pointer;font-weight:700;min-height:44px;padding:10px 0;line-height:1.5}.reason-index{display:flex;flex-wrap:wrap;gap:6px 14px}.reason-index a{font-size:14px;min-height:44px;display:inline-flex;align-items:center}.reason-author{font-size:12px!important;color:#5b6655}.reason-places>section{padding:8px 0;border-bottom:1px solid #e3ebe4}.reason-sources a{display:inline-block;min-height:44px;padding:8px 0}.reason-entry{margin:8px 0 14px}.tidy-reason{background:#f0f6ed;border-radius:10px;padding:9px 12px;margin:0 0 12px}.tidy-reason>p{font-size:14px;margin:0}.tidy-reason details p{font-size:14px;margin:4px 0 10px}.tidy-reason button{font-size:13px}.beginner-reasons [data-reason-action]{display:flex;flex-wrap:wrap;gap:8px}.beginner-reasons{scroll-margin-top:100px}.beginner-reasons section{scroll-margin-top:100px}`;document.head.append(reasonStyle);

 // Keep the two video groups independently collapsed without changing their locks or links.
 function foldLearnVideos(title,id){
  const heading=[...$('learn').querySelectorAll('h3')].find(node=>node.textContent.trim()===title);if(!heading)return;
  const fold=el('details',undefined,'learn-compact-fold');fold.id=id;const summary=el('summary');summary.className=heading.className;summary.append(...heading.childNodes);
  const body=el('div',undefined,'learn-fold-body');let next=heading.nextElementSibling;heading.before(fold);heading.remove();fold.append(summary,body);
  while(next&&next.matches('.author-video-entry')){const current=next;next=next.nextElementSibling;body.append(current)}
 }
 foldLearnVideos('自宅で過ごす備え','learnHomePreparedness');foldLearnVideos('自宅を離れるときの備え','learnAwayPreparedness');
 const learnFoldStyle=el('style');learnFoldStyle.textContent=`#learn .learn-compact-fold{margin:10px 0;border:1px solid #cbdcd2;border-radius:14px;padding:0!important;background:#fff}#learn .learn-compact-fold>summary{display:flex;align-items:center;gap:8px;padding:10px 12px;min-height:52px;cursor:pointer;list-style:none;font-size:16px;font-weight:700;color:#254f3d}#learn .learn-compact-fold>summary::-webkit-details-marker{display:none}#learn .learn-compact-fold>summary::before{content:'▸';flex:none;display:inline-block;width:12px;color:#42745d}#learn .learn-compact-fold[open]>summary::before{transform:rotate(90deg)}#learn .learn-compact-fold>.learn-fold-body{padding:0 12px 12px}#learn #preparednessReasons>p,#learn #preparednessReasons>div{margin:10px 12px}#learn .learn-compact-fold>summary .chibi-icon{flex:none;width:30px;height:30px}#learn .learn-compact-fold>summary:focus-visible{outline:3px solid #317cbd;outline-offset:2px}`;document.head.append(learnFoldStyle);
 // A single help catalogue powers both contextual question marks and Learn.
 const helpTopics=new Map(),helpGroups=['片付けの理由','場所ごとの片付け','備蓄の理由','機能の使い方'];
 const originalSections={tidy:reasons.querySelector('#reasonTidy'),toilet:reasons.querySelector('#reasonToilet'),bos:reasons.querySelector('#reasonBos')};
 const helpSources=reasons.querySelector('.reason-sources').cloneNode(true);
 const extraSource=el('li'),extraSourceLink=el('a','政府広報オンライン：災害に事前に備える ↗');extraSourceLink.href='https://www.gov-online.go.jp/tokusyu/bousai/preparation.html';extraSourceLink.target='_blank';extraSourceLink.rel='noopener noreferrer';extraSource.append(extraSourceLink);helpSources.querySelector('ul').append(extraSource);
 function helpCopy(node){const copy=node.cloneNode(true);copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));copy.querySelectorAll('[data-reason-action]').forEach(n=>n.remove());if(copy.tagName==='SECTION'&&copy.firstElementChild?.tagName==='H3')copy.firstElementChild.remove();return copy}
 function addHelp(id,title,category,text,run,label){helpTopics.set(id,{id,title,category,body:typeof text==='function'?text:()=>{const box=el('div');for(const line of text)box.append(el('p',line));return box},run,label})}
 addHelp('tidy','片付ける目的・物が多いと危ない理由','片付けの理由',()=>helpCopy(originalSections.tidy),()=>show('tidy'),'片付けを始める');
 addHelp('toilet','なぜ非常用トイレが必要？','備蓄の理由',()=>helpCopy(originalSections.toilet),()=>{show('supplies');if(activePage==='supplies'){$('supplyCalcFold').open=true;$('stockCalculator').scrollIntoView({block:'start'})}},'トイレの必要量を確認する');
 addHelp('bos','たこがBOSをおすすめする理由','備蓄の理由',()=>helpCopy(originalSections.bos),()=>{show('supplies');if(activePage==='supplies'){$('supplyRecommendations').open=true;$('supplyRecommendations').scrollIntoView({block:'start'})}},'備蓄ページのおすすめを見る');
 for(const place of Object.keys(tidyReasonTemplates))addHelp('room:'+place,place+'で気をつけたいこと','場所ごとの片付け',tidyReasonFor(place),()=>show('tidy'),'片付けノートを開く');
 const essentials=[
 ['valuables','現金・大切な書類',['避難先でも本人確認や家族との連絡ができるよう、必要な情報と持ち出す物を確認します。現金も備えの候補です。','連絡先は紙にも控え、保管場所を家族で共有しましょう。']],
 ['health','薬・健康管理',['普段使う薬やお薬手帳は、いつもの治療や薬の情報を伝えるための備えです。眼鏡や補聴器など、自分の生活に必要な物も一緒に確認しましょう。','薬の量や保管方法は、医師・薬剤師と確認して備えましょう。']],
 ['waterFoodToilet','水・食料・トイレ',['ライフラインが止まったときに、自分や家族の生活を続けるための備えです。飲み水、食べ慣れた食料、水を流さず使える携帯トイレを確認しましょう。','備蓄目安の計算で人数と日数を確認し、手持ちの数量を登録します。トイレの必要性は「なぜ非常用トイレが必要？」で詳しく読めます。']],
 ['power','停電への備え',['暗い中でも周囲を確認し、連絡や情報収集を続けるための備えです。懐中電灯・予備電池・携帯電話の充電手段を確認しましょう。','家族が分かる場所に置き、普段から点灯・充電できるか確認しておきましょう。']],
 ['familySupplies','家族やペットに合わせて',['家族によって必要な物は異なります。乳幼児、介護、アレルギー、ペットなど、自分の家庭で欠かせない物を確認するための欄です。','普段使っている物を出発点に、家族の事情に合う備えを考えましょう。']]
 ];
 for(const [id,title,text] of essentials)addHelp(id,title,'備蓄の理由',text);
 addHelp('inventory','備蓄の登録・数量・期限','機能の使い方',['家にある備蓄を登録し、数量・期限・置き場所を確認する機能です。使ったら数量を減らし、不足した分を補充します。','食品と飲用水は期限が未入力でも数量に数えます。ただし期限の点検はできないため、分かるものから登録しましょう。分類や食数が未設定だと必要量の計算に反映できない場合があります。']);
 addHelp('calculator','わが家の備蓄目安の計算','機能の使い方',['人数・備える日数・トイレの使用回数を入力して、家庭の備蓄目安を確認します。トイレの回数は、家族の実際の使い方に合わせます。','目安と登録済みの備蓄を比べて不足を確認します。一般的な目安が全員に合うとは限らないので、家族の事情に合わせて考えましょう。']);
 addHelp('safety','住まいの安全点検','機能の使い方',['寝る場所、出口までの通り道、家具などを自己確認する機能です。未確認はまだ調べていない、要対策は直すことがある、対策済みは実際に確認・対処した、該当なしは自宅にはその項目がないという意味です。','備蓄管理の前に、優先する安全項目を確認します。チェックを終えるだけで災害時の安全が保証されるわけではありません。']);
 addHelp('tree','防災の木・トロフィー・バッジ','機能の使い方',['トロフィーの獲得が進むと、種・芽・若木・大きな木へ成長します。1個で芽、3個で若木、6個で大きな木になります。大きな木ではペア＋1匹の構図が登場し、8/8達成後にトリオ2種類も抽選に加わります。','トロフィーと片付け・備蓄のバッジは「その他」で確認できます。安全性の点数ではなく、取り組んだ記録です。']);
 const beginnerHelpCategories=['はじめに・毎日の使い方','片付け・掃除','備蓄・持ち出し','住まいの安全・避難','家族・暮らし','学ぶ・訓練','天気・地域','記録・共有','設定・データ保護'];
 const categoryAliases={'片付けの理由':'片付け・掃除','場所ごとの片付け':'片付け・掃除','備蓄の理由':'備蓄・持ち出し','機能の使い方':'はじめに・毎日の使い方'};
 for(const topic of helpTopics.values())topic.category=categoryAliases[topic.category]||topic.category;
 for(const [id,category] of [['inventory','備蓄・持ち出し'],['calculator','備蓄・持ち出し'],['safety','住まいの安全・避難'],['tree','記録・共有']])helpTopics.get(id).category=category;
 helpGroups.splice(0,helpGroups.length,...beginnerHelpCategories);
 const expandedHelp=[
 ['home','ホームから何を始める？',0,'最初に確認したいことと、次に取り組む作業を探す入口です。','「今日やること」に出ている項目を1つ開きます。全部を一度に終える必要はありません。分からない機能は、その横の「本＋解説」から読めます。'],
 ['learn','学ぶページ・解説の探し方',0,'機能の使い方や備える理由を、カテゴリ別に確認するページです。','カテゴリを開き、読みたい解説を選びます。一覧と各機能の「本＋解説」は同じ説明を開きます。'],
 ['more','その他のメニュー',0,'家族、避難計画、訓練、設定など、普段の作業以外の入口をまとめています。','目的に合う見出しから開きます。よく使うページは、お気に入りに登録すると探しやすくなります。'],
 ['priorities','今日の優先チェック・次にやること',0,'まだ確認していないことや記録から、次の作業を探すための案内です。','表示された項目を開いて、実際に確認してから記録します。表示順は取り組む目安で、現場の危険や緊急性を自動判定するものではありません。'],
 ['featureSearch','機能を名前から探す',0,'どのメニューにあるか分からない機能を検索する入口です。','「トイレ」「避難」「写真」など、やりたいことの言葉を入れます。解説を読みたいときは、学ぶのカテゴリ一覧から選びます。'],
 ['start','初めて使うとき・機能の解放',0,'地域や自宅の危険を確認し、住まいの安全点検から備えを進めます。','鍵の付いた機能は、ボタンの案内に従って先に必要な確認をします。説明を読んだだけでは安全点検や作業の完了にはなりません。'],
 ['sorting','整理：残す物を選ぶ',1,'整理は、使う物と使っていない物を見直し、必要な物を選ぶことです。','床や作業台の物を確認し、使う・迷う・手放す候補に分けます。大切な物や家族の物を、急いで捨てる必要はありません。'],
 ['organizing','整頓・収納：使う場所と戻す場所',1,'整頓は、必要な物を使いやすい場所に置くことです。収納は、出し入れしやすく収めることです。','よく使う場所の近くに定位置を作り、重い物の落下や通路をふさぐ配置に注意します。置き場所を決めたら、家族にも伝えましょう。'],
 ['tidyChecklist','片付けの4項目と完了数',1,'場所ごとに小さな作業を確認するチェックリストです。0/4は、4項目のうち0項目を終えたという意味です。','場所名を開き、実際に終えた項目にチェックします。置き場所を決める項目は、先に整理の2項目を終えると選べます。作業と関連する住まいの安全点検は別の記録です。'],
 ['tidyAdd','片付ける場所を追加する',1,'一覧にない部屋や収納も、自分で名前を付けて記録できます。','場所を選び、自由な名前が必要なときは入力して追加します。作業メモや写真は、必要なときだけ残せます。'],
 ['tidyNotes','片付けの作業メモ・次の一歩',1,'どこで困っているか、次に何をするかを忘れないためのメモです。','「床の箱を棚へ戻す」のように、短く具体的に書きます。メモを書くことと、チェック項目の完了は別です。'],
 ['tidyPhotos','Before／After写真とは？',1,'Beforeは片付ける前、Afterは片付けた後の写真です。同じ場所の変化を見返せます。','写真欄を開いて、前後の写真を選びます。顔・住所・書類などが写っていないか、保存や共有の前に確認しましょう。'],
 ['tidyExport','片付け記録を文章で控える',7,'場所や作業の記録を、コピーできる文章にする機能です。','表示内容を確認してメモなどへ控えます。文章の控えは、写真も含めて復元するバックアップファイルとは異なります。'],
 ['clean','掃除の実践・片付けとの違い',1,'片付けで置き場所を整えた後、床などを掃除して暮らしを保つための記録です。','終えた掃除にチェックします。繰り返す作業なので、設定した日数・時刻が来ると、次の掃除のためにチェックが解除されます。'],
 ['cleanSchedule','掃除チェックの解除日・時刻',1,'次に掃除する目安を、自分の生活に合わせて決める設定です。','何日後に解除するかと時刻を設定して保存します。解除は次の作業を示すためのもので、前に掃除した事実を否定する意味ではありません。'],
 ['minimalism','ミニマリストのススメ',4,'作者がおすすめする暮らし方の一つを紹介しています。持ち物を減らすこと自体が目的ではありません。','どんな暮らしにしたいかを考え、使う物・好きな物・必要な備えを残します。家族の考えや生活に合わせ、無理に取り入れる必要はありません。'],
 ['album','成長アルバム・達成記録',7,'片付けの写真や取り組んだ変化を、まとめて見返す機能です。','表示を絞り込んで写真を確認します。写真を見返すことと、他の人に送ることは別です。共有するときは内容を選んで確認します。'],
 ['stock','備蓄とは？ 持ち出しとの違い',2,'備蓄は、自宅などで生活を続けるために用意しておく水・食料・日用品です。','まず手元にある物と保管場所を確認します。持って避難する荷物は重さや持てる量も考えて、防災リュックなどの欄で別に確認します。'],
 ['supplyAdd','備蓄品を登録・編集する',2,'手元にある物を記録して、数・期限・保管場所を把握する機能です。','品名と数量を入れ、分かる分類・単位・期限を追加して保存します。編集後も保存を確認し、使った分を数量から減らします。'],
 ['quantity','数量：いくつ持っているか',2,'数量は、今ある本数・個数・袋数などです。1箱なら「1箱」のように、単位とセットで記録します。','水6本を1本ずつ数えるなら数量6・単位本にします。携帯トイレは、使える回数が計算に合うよう内容を確認して登録しましょう。'],
 ['unit','単位：本・個・袋・回など',2,'単位は、数量が何を数えているかを表します。箱と本を混ぜると、残量を取り違える原因になります。','自分が使ったときに減らしやすい単位を選びます。計算に使う水の容量や食品の食数は、必要な欄で別に設定します。'],
 ['category','備蓄の分類と必要量への反映',2,'飲用水・食料・トイレなど、何の備えかを区別する設定です。','品名だけでは用途を正しく判断できないことがあるため、必要量と比べたい品は分類を確認します。分類が不明なままの品は、一覧と計算結果を見比べて見直しましょう。'],
 ['waterCapacity','水1本・1容器の容量とL',2,'L（リットル）は水の量を表す単位です。数量ではなく、1本や1容器に入っている容量を入力します。','例：2Lの水が6本なら、数量6・1本の容量2Lです。500mLは0.5Lです。生活用の水と、飲むための水は分けて確認します。'],
 ['foodServings','数量1単位あたりの食数',2,'1個・1袋・1箱が、何食分として数えられるかを表します。数量と掛け合わせて食料の量を見ます。','例：2食分入りが3袋なら、数量3・1袋あたり2食分です。1つのお菓子をそのまま1食と決めず、中身や食べ方を確認しましょう。'],
 ['expiry','商品の期限・未入力・期限切れ',2,'商品の賞味期限・使用期限などを、パッケージで確認して記録する欄です。点検する日とは別です。','食品・飲用水は期限が空欄でも数量に数えますが、期限の確認が必要な品として案内します。期限切れと表示されても安全性を自動判定する機能ではありません。'],
 ['stockLocation','保管場所を記録する',2,'必要なときに見つけられるよう、物を置いた場所を残します。','「台所の下段」「玄関の棚」など、自分と家族が分かる名前にします。場所を移したら記録も直しましょう。'],
 ['stockInspection','商品の期限と点検予定日の違い',2,'最後に点検した日は、実際に中身や数量を確かめた日です。次の点検予定日は、次に見直すための目安です。','点検したら数量・期限・保管場所を確認します。点検予定日を変えても、商品の賞味・使用期限が延びるわけではありません。'],
 ['inspectionInterval','点検を繰り返す間隔',2,'定期的に残量や状態を見直すため、次に確認する間隔を決めます。','生活に合う間隔を選び、予定日を確認して保存します。予定が来たら実物を見て、記録も更新しましょう。'],
 ['stockTarget','目標数量・不足数',2,'目標数量は、この品をいくつ持っておきたいかという自分の目安です。今ある数量とは別です。','同じ単位で目標と手持ちを比べます。目標を入れただけでは買ったことにはならず、補充後に数量も更新します。'],
 ['useStock','備蓄を使う・先に使う品',2,'普段から備蓄を使い、減った分を補うための機能です。','対象の品を確認して使う数量を減らします。「先に使う」は登録した期限などからの案内です。実物の状態や商品の表示も確認しましょう。'],
 ['shopping','補充リスト・買い物メモ',2,'不足している物や買い足したい物を、買い物中に見返すためのメモです。','内容と単位を確認して持ち出します。メモに載せることや共有することだけでは、備蓄の数量は増えません。買って補充した後に更新します。'],
 ['filters','検索・絞り込みの使い方',0,'たくさんの記録の中から、見たい物だけを表示する機能です。','言葉を入れるか表示条件を選びます。見つからないときは検索欄と条件を戻して確認します。絞り込んでも元の記録は削除されません。'],
 ['pouch','0次持ち出し・防災ポーチとは？',2,'0次持ち出しは、普段から外出時に持ち歩く備えという意味で使っています。','使い慣れた小型ライトや必要な用品など、外出先と持ち運べる量に合わせます。自宅に置く備蓄や、避難時に持つリュックとは分けて考えましょう。'],
 ['pouchChecks','持ち物のチェック・点検日',2,'持ち物リストで、今持っている物と見直す日を記録します。','実際に入っているか、電池や期限に問題がないか確認してチェックします。リストのチェックだけで、中身が自動で補充されるわけではありません。'],
 ['goBag','1次持ち出し・防災リュックとは？',2,'自宅から避難するときに、すぐ持ち出すための荷物という意味で使っています。','自分や家族に必要な物を選び、背負って持ち運べるか試します。自宅用の備蓄を全部詰め込む必要はありません。鍵の表示がある場合は案内された準備を先に確認します。'],
 ['safetyBedroom','寝る場所・家具の安全点検',3,'寝る場所へ家具が倒れたり物が落ちたりしないか、危険を確認する欄です。','実際の配置を見て、未確認・要対策・対策済み・該当なしを選びます。分からない状態を、完了にするためだけに対策済みへ変えないようにしましょう。'],
 ['safetyRoute','避難経路・動線とは？',3,'動線は、人が通る道筋です。ここでは寝る場所や部屋から出口まで、安全に通れるかを確認します。','ドアの開閉、床の物、倒れると通路をふさぐ家具を見ます。屋外の経路は、自宅周辺の災害リスクも合わせて確認します。'],
 ['hazard','ハザードマップとは？',3,'洪水・土砂災害・津波など、地域で想定される災害の危険を確認する地図です。','自治体などの地図で自宅や職場の場所を探し、凡例を見て災害の種類と避難先を確認します。色の有無だけで、あらゆる災害に対する安全が決まるわけではありません。'],
 ['evacuation','マイ避難計画の作り方',3,'家族が、どこへ・どの道で・いつ・どう連絡して避難するかを、平常時に考えて保存する機能です。','地域の危険を確認してから、分かる項目を自分の言葉で書きます。保存は自治体への提出ではなく、家族で見返すための記録です。'],
 ['hazardMemo','自宅周辺の災害リスクの書き方',3,'確認したハザードマップの内容を、避難計画に残す欄です。','例：「川の近くで浸水想定を確認」「裏手の斜面の区域を確認」のように書きます。まだ調べていない内容を、危険なしと決めつけないようにしましょう。'],
 ['destination','避難先・安全な場所の選び方',3,'災害の種類や自宅の状況に応じて、向かう先を考える欄です。','自治体が示す場所と、家族が利用できる避難先を確認して記録します。地震・洪水・津波などで使える場所が異なることがあるため、名前だけでなく対象の災害も確かめます。'],
 ['route','避難する経路と注意点',3,'避難先までの道と、途中で気をつける場所を残します。','地図だけでなく平常時に歩いて確認し、通れない場合の別の道も考えます。災害時は事前の経路にこだわらず、現場と自治体の最新の案内を確認します。'],
 ['timing','避難を始めるタイミング',3,'移動にかかる時間や支援の必要性も含め、早めに行動するための約束を考えます。','自治体の避難情報や気象庁の情報をどこで見るか、家族で確認して書きます。アプリは現在地の危険や避難開始時刻を自動判定しません。'],
 ['contacts','家族との連絡方法',3,'普段の連絡が使えない場合も考え、誰と何で連絡するかを決めます。','電話以外の方法や、離れて住む家族との確認方法も相談して記録します。端末を見られない場合に備え、必要な情報は紙などでも控えましょう。'],
 ['meeting','連絡できない場合の集合・安否確認',3,'家族に連絡できないとき、どう安全を確かめ合うかを決める欄です。','集合場所や確認手順を相談します。危険な場所へ集合する約束にならないよう、災害の種類と移動の安全も考えましょう。'],
 ['reviewPlan','避難計画の見直しと訓練',3,'引越しや家族の変化に合わせて、計画が今も使えるか見直します。','見直す日を決め、実際に道や連絡方法を試したら訓練・確認の記録に残します。予定を入れただけでは確認済みにはなりません。'],
 ['emergency','災害時ページでできること',3,'事前に保存した確認項目や避難・家族の情報を、急ぐときに見返すページです。','平常時に記録を整えておきます。災害時はまず身の安全を確保し、最新の自治体・気象庁等の案内を確認してください。保存情報は現在の安全を保証しません。'],
 ['emergencyMemo','緊急時情報をコピー・紙に控える',3,'端末や通信が使えないときにも見返せるよう、必要な情報を控えるための機能です。','含める情報を選び、コピー前に内容を確認します。家族・ペットの個別情報などは、渡す相手に必要な範囲だけにしましょう。'],
 ['family','家族・ペットの防災カルテ',4,'一人ひとりに必要な用品、食事、移動の支援などを忘れないための記録です。','家族の種類と人数・頭数を確認し、必要な内容だけ書きます。表示名は、本名や住所を使わず区別できる名前でも構いません。'],
 ['familyNumbers','人数・頭数・世帯人数の違い',4,'家族・ペットの登録数と、備蓄の計算に使う世帯人数は、それぞれの画面で確認します。','人とペットでは必要な備えが異なります。人数を変えた後は、計算欄の設定と表示される必要量も見直しましょう。'],
 ['familyNeeds','家族ごとの食事・用品・支援',4,'乳幼児、介護、アレルギー、ペットなど、家庭ごとの事情を伝えやすくするメモです。','普段使う物や避難に必要な支援を書きます。薬や療養上の備えは、担当の医師・薬剤師等と相談して確認しましょう。'],
 ['diagnosis','家庭別の防災弱点診断',4,'回答から、自分の家庭で見直したい備えを考える入口です。','実際の状態に近い選択肢で答え、結果から確認する項目を選びます。医学的な診断や、災害時の安全を保証する判定ではありません。'],
 ['readiness','わが家の防災準備状況',4,'アプリの記録から、確認できたこと・まだ確認したいことを見返すページです。','表示された次の項目を開いて、実物や家族の状況を確かめます。進捗の数字だけで、家の安全性や必要な備えが完全に分かるわけではありません。'],
 ['outage','停電・断水シミュレーター',4,'人数・日数・手持ちの備えから、生活を続ける準備を考えるための目安です。','想定する期間とトイレの回数・在庫を入れて結果を見ます。実際にいつ復旧するかや、停電が起きるかを予測する機能ではありません。'],
 ['seasonal','季節別の防災点検',4,'暑さ・寒さなど、季節や状況で変わる備えを見直すチェックです。','対象の季節を選び、実際に確認した項目を記録します。季節や家族の状態が変わったら、前に確認した内容も見直しましょう。'],
 ['moving','引越し前後の防災確認',4,'新しい住まい・地域に合わせて、危険と備えを見直すための案内です。','転居前、荷造り、入居直後、地域の備えの順で確認します。地域を変えたら、天気の設定と避難計画も新しい場所の内容に直しましょう。'],
 ['training','訓練・実践記録',5,'実際に歩いた・使った・確認した経験と、次に直すことを残します。','実施日と内容を選び、気づいたことを短く書いて保存します。読むだけの学習と、実際に行った確認は分けて振り返ると役立ちます。'],
 ['quiz','アプリ内の基礎例題',5,'防災の知識を、選択問題と解説で確認する学習機能です。','分野と問題数を選んで解き、正解だけでなく理由も読みます。公式試験そのものや合格を保証する機能ではありません。'],
 ['quizReview','間違えた問題・学習結果の見直し',5,'答えを覚えるだけでなく、分からなかった理由を確認するための機能です。','結果や解説から見直し、必要ならもう一度解きます。解説の検索では、気になる言葉から問題を探せます。'],
 ['exam','防災士試験の動画・音声学習',5,'作者の例題動画や音声など、学習を進めるための入口です。','自分に合う形式を選んで学びます。外部動画は通信が必要です。試験の最新情報は、案内されている公式の情報で確認してください。'],
 ['videos','実例動画の見方',5,'作者が実際の備えや暮らしを紹介する動画への入口です。','動画は考え方や使い方の参考にして、自分の家族・住まいに合う部分を取り入れます。再生は外部サイトで行うため、通信が必要です。'],
 ['weather','地域の天気予報の見方',6,'設定した地域の天気や気温を確認する機能です。','対象の地域・地点と取得時刻を確かめて読みます。取得に失敗した場合や古い表示の場合は、気象庁等で最新情報を確認します。'],
 ['weatherRegion','天気の地域・気温地点・市区町村',6,'予報の地域、気温を表示する地点、警報等の市区町村は、対象範囲が異なることがあります。','自宅など確認したい場所に合うものを選び、表示される地名も確かめます。引越しや別の地域を見る場合は、設定を見直しましょう。'],
 ['warnings','警報・注意報と避難情報',6,'気象庁の防災気象情報と、自治体が発令する避難情報は、発表元と役割が異なります。','対象地域・発表時刻・情報の内容を確認し、自治体の避難情報や気象庁の最新案内も確認します。アプリの表示だけで避難の要否を決めないようにしましょう。'],
 ['weatherStale','取得時刻・更新・通信エラー',6,'取得時刻は、アプリが情報を取りに行った時刻の目安です。今この瞬間の状態と同じとは限りません。','通信できないと最新情報に更新できません。古い情報や取得できない状態を、危険がないという意味に受け取らないようにしましょう。'],
 ['events','地域の防災イベントを探す',6,'地域や月などの条件から、防災に関する体験や学習の情報を探す入口です。','地域と内容を選び、開催日時・対象・申込みの要否は主催者の最新案内で確認します。外部の情報を見るには通信が必要です。'],
 ['reviews','備蓄レビュー・みんなの投稿',7,'使った人の感想を読み、自分の備えを考える参考にする機能です。','商品や分類から探します。感想は個人の体験で、すべての人に同じ効果や使いやすさがあるとは限りません。'],
 ['reviewWrite','使った備蓄のレビューを書く',7,'自分が実際に使って分かったことを、商品名・評価・感想で残します。','どんな場面で使ったか、良かった点と気をつけたい点を書き、保存先や公開の操作を確認します。使っていない商品の体験を作って書かないようにしましょう。'],
 ['reviewPhotos','レビューの写真と個人情報',7,'写真を付けると、使い方や大きさを伝えやすくなります。','顔、宛名、レシート、位置が分かる物などが写っていないか確認します。この端末の保存と、他の人への公開は別の操作です。'],
 ['reviewPublic','この端末のレビュー・公開レビュー',7,'この端末に残す記録と、他の人が読める公開投稿は別です。','公開する場合はログインや投稿の案内を確認し、公開前に内容を見直します。端末のバックアップと公開先のアカウント管理も別に確認しましょう。'],
 ['account','公開投稿用のアカウント・削除',8,'公開レビューなど、ログインが必要な機能で使うアカウントです。','ログアウトとアカウント削除は異なります。削除前に、確認画面で消える情報と残る端末の記録を読み、必要な控えを保存してください。'],
 ['favorites','お気に入り・星ボタン',0,'よく使うページを、すぐ開けるように登録する機能です。','星のボタンから現在のページを登録・解除し、一覧から開きます。登録できるのは8件までです。不要なページを外すと別のページを追加できます。'],
 ['share','できたことを共有する',7,'取り組んだ内容を、相手に伝える文章などにまとめる機能です。','含める項目を選び、プレビューを確認してからコピーや共有をします。ボタンを押しただけで、すべての個人メモを公開する仕組みではありません。'],
 ['sharePrivacy','写真・家族メモを含めるとき',7,'家族の事情や家の写真には、他の人に見せたくない情報が含まれることがあります。','誰に何を伝えるかを決め、共有前の画面で内容を確認します。相手に渡した後の保存や転送までは、このアプリでは取り消せません。'],
 ['backup','バックアップ：記録の控えを作る',8,'端末内の記録が消えたり機種変更したりしたときに備え、復元に使うファイルを保存します。','今の端末で書き出し、保存先にファイルがあることを確かめます。バックアップには個人のメモや写真が含まれる場合があるため、保管先にも注意しましょう。'],
 ['restore','復元：控えから記録を戻す',8,'前に保存したバックアップを読み込み、記録を戻す操作です。','現在の記録も先にバックアップし、読み込むファイルと表示される確認内容をよく見ます。今の記録がどう変わるかを確認してから実行しましょう。'],
 ['backupTypes','アプリ全体・備蓄だけ・レビューの控え',8,'書き出す方法によって、含まれる記録の範囲が異なります。','JSON（ジェイソン）は、アプリが記録を読み戻すためのデータ形式です。中身を編集せず保存します。機種変更ではアプリ全体のバックアップを確認し、備蓄だけの控えや文章と、含まれる範囲を区別しましょう。'],
 ['offline','ホーム画面への追加・オフライン準備',8,'一度読み込んだアプリと保存した記録を、通信がないときも使えるよう準備します。','通信できるときに案内に従って準備し、機内モードなどで起動を確認します。天気の更新、公開レビュー、外部リンク・動画は通信が必要です。'],
 ['deviceStorage','記録はどこに保存される？',8,'片付けや備蓄などの多くの記録は、使っている端末・ブラウザの中に保存します。','別の端末やブラウザに自動で同じ記録が出るとは限りません。データ消去や故障に備え、定期的にアプリ全体のバックアップを保存しましょう。'],
 ['saveFailure','保存できない・記録が見つからない',8,'保存の失敗や、いつもと違う端末・ブラウザの利用などが考えられます。','画面の案内と保存状況を確認します。慌ててデータを消したり初期化したりせず、入力内容を控え、必要なら不具合報告用の情報を確認して相談しましょう。'],
 ['deleteRestore','削除・取り消しの違い',8,'削除は記録を取り除く操作です。取り消しの案内が出る場合は、そこから戻せます。','何を消すかを確認してから操作します。取り消せる範囲や期間は案内に従い、すべての削除が後で戻せるとは考えないようにしましょう。'],
 ['display','簡易表示・表示設定',8,'大きなキャラクターのイラストや余白など、見え方を自分に合わせる設定です。','通常表示と簡易表示を切り替えて使いやすい方を選びます。記録の数や作業の完了とは別の設定です。'],
 ['speech','キャラクターのコメント表示',8,'キャラクターのひとことを、自動交代・固定・非表示から選べます。','自動交代では約15秒ごとに変わります。読みやすさに合わせて変更します。コメントは励ましや案内で、最新の災害情報ではありません。'],
 ['reminders','期限・点検のお知らせ',8,'記録した期限や予定日から、見直したい項目を一覧で確認する機能です。','お知らせを表示する設定と、各品の期限・点検日を確認します。表示を有効にしただけで、端末へ必ずプッシュ通知が届くという意味ではありません。'],
 ['calendar','カレンダーへ予定を書き出す',8,'期限や点検日などを、カレンダーで見返すためのファイルにする機能です。ICS（アイシーエス）は、予定をカレンダーへ取り込むための形式です。','書き出した予定をカレンダー側で読み込み、日付や通知を確認します。後からアプリの記録を直しても、取り込んだ予定が自動で直るとは限りません。'],
 ['feedback','感想・不具合を伝える',8,'使って困ったことや感想を、作者へ相談する入口です。','ページ名・起きたこと・再現する操作を短く書きます。メール作成画面が開く方式では、内容を確認し、自分で送信して初めて相手に届きます。'],
 ['support','不具合報告用の情報',8,'動作状況などを、相談時に説明しやすくするための情報です。','コピー前の画面で内容を確認し、必要なものを相談に添えます。私的な記録をまとめて送る前に、個人情報が含まれていないか確かめましょう。'],
 ['privacy','プライバシー・データ保護',8,'端末への保存、外部サイト、公開投稿など、情報の扱いを確認する案内です。','写真や家族の情報を残す前、共有する前に、保存先と公開範囲を確かめます。詳しい方針はプライバシーポリシーから確認できます。'],
 ['lecture','講座・相談の案内',5,'作者の講座やワークシートを使った学びについて、内容や相談先を確認する入口です。','開催条件や料金の案内を読み、希望する内容を相談します。アプリのチェックを終えるために、講座への申込みが必要なわけではありません。'],
 ['worksheet','ワークシート・PDFの見本',5,'紙に書きながら考えたり、講座や家庭で使い方を確認したりするための資料です。','見本を開いて内容を確認します。PDFなどの外部資料を開くときは、通信や保存先も確認しましょう。'],
 ['releaseNews','更新内容・公開状況',8,'アプリの変更点や、利用できる範囲を確認する案内です。','更新後は必要な記録があるか確認します。開発中・試作中と書かれた機能は、その画面の案内も確認してから使いましょう。']
 ];
 expandedHelp.push(['recommendations','おすすめ欄・PR・外部ショップ',2,'作者が紹介する備えの候補をまとめた欄です。PRは広告を含むことを示し、リンク経由の購入で運営者に報酬が入る場合があります。','購入はアプリの課題の条件ではありません。手持ちの物や家庭に合うかを確認し、価格・在庫・送料・商品内容は外部ショップの最新表示で確かめましょう。']);
 expandedHelp.push(['evacuationPlaces','避難場所と避難所の違い',3,'指定緊急避難場所は、災害の危険から命を守るために緊急に避難する場所です。指定避難所は、避難した人が一定期間生活するための施設です。','同じ施設が両方に指定されることもあります。近いという理由だけで選ばず、対象の災害と自治体の最新の案内を確認して、避難計画に残しましょう。']);
 for(const [id,title,index,why,how] of expandedHelp)addHelp(id,title,beginnerHelpCategories[index],[why,how]);
 for(const [id,category] of [['stock','備蓄・持ち出し']])helpTopics.get(id).category=category;
 for(const [href,title] of [['https://www.jma.go.jp/jma/kishou/know/bosai/alertlevel.html','気象庁：防災気象情報と警戒レベル'],['https://www.bousai.go.jp/oukyu/hinanjouhou/r3_hinanjouhou_guideline/','防災情報：避難情報に関するガイドライン'],['https://www.bousai.go.jp/taisaku/hinanbasyo.html','防災情報：避難場所と避難所']]){const li=el('li'),a=el('a',title+' ↗');a.href=href;a.target='_blank';a.rel='noopener noreferrer';li.append(a);helpSources.querySelector('ul').append(li)}
 helpSources.querySelector('p').textContent='防災の説明は自治体・政府・気象庁、商品情報はメーカーの公式情報を参考にしています。作者の選定理由やアプリの操作説明と分けて読めます。2026年11月確認。';

 const contextHelp=el('dialog');contextHelp.id='contextHelpDialog';contextHelp.setAttribute('aria-labelledby','contextHelpTitle');
 const helpBar=el('div',undefined,'context-help-bar'),helpTitle=el('h2');helpTitle.id='contextHelpTitle';
 const helpClose=action('×',()=>contextHelp.close());helpClose.id='contextHelpClose';helpClose.setAttribute('aria-label','解説ヘルプを閉じる');
 const helpBody=el('div');helpBody.id='contextHelpBody';helpBar.append(helpTitle,helpClose);contextHelp.append(helpBar,helpBody);document.body.append(contextHelp);
 let helpTrigger=null,helpOrigin=null;
 function showContextHelp(id,trigger){
  let topic=helpTopics.get(id);if(!topic&&id.startsWith('room:')){const place=id.slice(5);topic={id,title:place+'で気をつけたいこと',category:'場所ごとの片付け',body:()=>{const box=el('div');tidyReasonFor(place).forEach(t=>box.append(el('p',t)));return box}}}
  if(!topic)return;

  helpTrigger=trigger||document.activeElement;helpOrigin=activePage;helpTitle.textContent=topic.title;helpBody.replaceChildren(topic.body());
  helpBody.append(helpCopy(helpSources));
  const links=el('div',undefined,'context-help-actions');
  if(topic.run)links.append(action(topic.label,()=>{contextHelp.close();topic.run()}));
  links.append(action('学ぶで解説ヘルプを探す',()=>{contextHelp.close();openPreparednessReasons()}));helpBody.append(links);
  contextHelp.dataset.topic=id;if(!contextHelp.open)contextHelp.showModal();helpBody.scrollTop=0;helpClose.focus({preventScroll:true});
 }
 window.totoOpenContextHelp=showContextHelp;
 contextHelp.addEventListener('close',()=>{if(helpOrigin===activePage&&helpTrigger?.isConnected)helpTrigger.focus({preventScroll:true})});
 function helpButton(id,title){const button=action('',event=>{event.preventDefault();event.stopPropagation();showContextHelp(id,button)});button.className='context-help-button';paintContextHelpButton(button);button.dataset.contextHelpTopic=id;button.setAttribute('aria-label',title+'の解説ヘルプ');button.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')event.stopPropagation()});return button}
 let helpLabelSequence=0,helpTargetQueue=null;
 function attachHelp(heading,id){
  if(helpTargetQueue){if(heading&&!helpTargetQueue.has(heading))helpTargetQueue.set(heading,heading.querySelector(':scope>.context-help-button')?.dataset.contextHelpTopic||id);return}
  if(!heading||!helpTopics.has(id)||heading.querySelector(':scope>.context-help-button')||heading.closest('#contextHelpDialog,#preparednessReasons'))return;
  if(heading.tagName==='LABEL'){
   heading.classList.add('context-help-label');
   const text=heading.querySelector(':scope>.context-help-label-text')||el('span',undefined,'context-help-label-text');
   for(const node of [...heading.childNodes])if(node.nodeType===3)text.append(node);
   if(text.textContent.trim()){
    heading.prepend(text);if(!text.id)text.id=heading.dataset.contextHelpLabel||('context-help-label-'+(++helpLabelSequence));heading.dataset.contextHelpLabel=text.id;
    const control=heading.htmlFor?$(heading.htmlFor):heading.querySelector('input,select,textarea');
    if(control&&!control.hasAttribute('aria-label')&&!control.hasAttribute('aria-labelledby'))control.setAttribute('aria-labelledby',text.id);
   }
  }else {if(/^H[23]$/.test(heading.tagName)&&!heading.hasAttribute('aria-label'))heading.setAttribute('aria-label',helpText(heading));heading.classList.add('context-help-heading');}
  heading.append(helpButton(id,helpTopics.get(id).title));
 }
 // Replace the long explanation panel with a searchable, grouped catalogue.
 reasons.replaceChildren(el('summary','解説ヘルプ'),el('p','各機能の「本＋解説」と同じ説明をまとめています。カテゴリを開いて解説を選んでください。','notice'));
 const helpCount=el('p',undefined,'notice');helpCount.id='contextHelpCount';const helpList=el('div');reasons.append(helpCount,helpList);
 function renderHelpIndex(){
  const opened=new Set([...helpList.querySelectorAll('.help-index-group[open]')].map(node=>node.dataset.category));helpList.replaceChildren();let count=0;
  for(const category of helpGroups){const topics=[...helpTopics.values()].filter(topic=>topic.category===category);if(!topics.length)continue;
   const section=el('details',undefined,'help-index-group');section.dataset.category=category;section.open=opened.has(category);section.append(el('summary',category+'（'+topics.length+'件）'));
   for(const topic of topics){const button=action(topic.title+'  ›',()=>showContextHelp(topic.id,button));button.className='help-index-entry';button.dataset.helpTopic=topic.id;section.append(button);count++}helpList.append(section);
  }helpCount.textContent='解説 '+count+'件 ／ '+helpGroups.length+'カテゴリ';
 }
 renderHelpIndex();
 document.querySelectorAll('.reason-entry').forEach(n=>n.remove());calculatorReason.remove();bosReason.remove();
 attachHelp($('tidy').querySelector('.refresh-title-row h2')||$('tidy').querySelector('h2'),'tidy');
 attachHelp($('stock').querySelector('h2'),'stock');attachHelp($('stockCalculator').querySelector('h2'),'calculator');attachHelp($('supplyInventoryCard').querySelector('h2'),'inventory');
 attachHelp($('homeSafety').querySelector('h2'),'safety');
 [...$('supplyEssentials').querySelectorAll('h3')].forEach((heading,index)=>{if(essentials[index])attachHelp(heading,essentials[index][0])});
 attachHelp($('supplyRecommendations').querySelector('.affiliate-product h3'),'bos');
 const helpStyle=el('style');helpStyle.textContent=`.context-help-heading{display:flex!important;align-items:center;gap:8px;justify-content:space-between}.context-help-button{display:inline-grid!important;place-items:center;flex:0 0 36px;width:36px!important;min-width:36px!important;height:44px;min-height:44px!important;margin:0!important;padding:0!important;border:0;background:transparent!important;color:#36745d;font-size:20px!important;font-weight:800;border-radius:50%;cursor:pointer}.context-help-button:focus-visible{outline:3px solid #2071bc;outline-offset:1px}#contextHelpDialog{box-sizing:border-box;width:calc(100% - 28px);max-width:460px;max-height:72dvh;margin:auto;padding:0;border:1px solid #a9c8b5;border-radius:16px;background:#fff;color:#203c30;overflow:hidden}#contextHelpDialog[open]{display:flex;flex-direction:column}#contextHelpDialog::backdrop{background:#132b244d}body:has(#contextHelpDialog[open]){overflow:hidden}.context-help-bar{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px 8px 16px;border-bottom:1px solid #dae7df;background:#f1f7ef}#contextHelpTitle{margin:0;font-size:17px;line-height:1.5}#contextHelpClose{flex:none;min-width:44px;height:44px;margin:0;padding:0;border:0;font-size:25px;background:transparent;color:#264d3a}#contextHelpBody{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 16px 16px;font-size:14px;line-height:1.7}#contextHelpBody h3{font-size:16px}#contextHelpBody p{margin:10px 0}#contextHelpBody summary{cursor:pointer;padding:9px 0;font-weight:700}#contextHelpBody a{overflow-wrap:anywhere}#contextHelpBody .reason-sources{font-size:12px;color:#53695c;margin-top:16px}.context-help-actions{display:grid;gap:8px;margin-top:14px}.context-help-actions button{font-size:13px;min-height:44px}.help-index-group{margin-top:14px;padding-top:4px;border-top:1px solid #dce7de}.help-index-group h3{font-size:16px;margin:10px 0 6px}.help-index-entry{display:block;box-sizing:border-box;width:100%;text-align:left;min-height:44px;padding:10px 8px;border:0;border-bottom:1px solid #edf1ed;background:transparent;color:#2c5d49;font-size:14px;cursor:pointer}#contextHelpSearch{box-sizing:border-box;width:100%;margin:4px 0 8px}.beginner-reasons label{font-size:13px}@media(max-width:350px){#tidy .tidy-place>summary{gap:5px}#tidy .tidy-place-name{font-size:14px}#tidy .tidy-place-progress-count{font-size:12px}#tidy .tidy-place>summary.with-chibi>.chibi-icon{width:32px;height:32px}.context-help-button{flex-basis:32px;width:32px!important;min-width:32px!important}}`;document.head.append(helpStyle);

 const todayPanel=el('div');todayPanel.id='todayAchievements';todayPanel.setAttribute('role','status');
 const todayText=el('span');
 todayPanel.append(el('strong','今日できたこと'),todayText);
 $('homeOtherSuggestions').before(todayPanel);
 const badgePanel=el('details',undefined,'card');badgePanel.id='achievementBadges';badgePanel.append(el('summary','トロフィー・バッジ'));
 const tree=el('div',undefined,'preparedness-tree'),treeArt=el('div',undefined,'preparedness-tree-art');
 treeArt.setAttribute('role','img');
 const plant=el('span',undefined,'preparedness-illustration preparedness-plant');
 plant.setAttribute('aria-hidden','true');
 function selectIllustration(node,cell){
  node.style.backgroundPosition=(cell%4*100/3)+'% '+(Math.floor(cell/4)*50)+'%';
 }
 const friends=[['tako','水やりするたこ'],['tricera','草を摘まんで食べるトリケラさん'],['shimaenaga','羽ばたいてやって来るシマエナガさん']].map(([id,name],index)=>{
  const art=el('span',undefined,'preparedness-friend-badge preparedness-tree-friend');
  art.dataset.friend=id;art.setAttribute('aria-hidden','true');selectIllustration(art,index);
  return {art,name};
 });
 const sceneGroup=el('span',undefined,'preparedness-pose preparedness-group');sceneGroup.setAttribute('aria-hidden','true');sceneGroup.hidden=true;
 treeArt.append(plant,...friends.map(friend=>friend.art),sceneGroup);
 let sceneChoice=null;
 const poseNames={solo:'仲間たち',ride:'たこがトリケラさんに乗り、シマエナガさんも一緒',lift:'シマエナガさんがたこの帽子をつかんで飛び、トリケラさんも一緒',sleep:'トリケラさんの背中で眠るシマエナガさんとたこ',drink:'みんなでペットボトルの水を飲む',exercise:'みんなでラジオ体操'};
 function renderTreeScene(stage,reroll,allTrophies=false){
  if(!sceneChoice||reroll||sceneChoice.stage!==stage||sceneChoice.allTrophies!==allTrophies){
   const modes=stage===3&&allTrophies?['solo','ride','lift','sleep','drink','exercise']:['solo'];
   sceneChoice={stage,allTrophies,mode:modes[Math.floor(Math.random()*modes.length)],variants:friends.map(()=>Math.floor(Math.random()*3))};
  }
  const {mode,variants}=sceneChoice;homeScene.dataset.treePose=mode;
  friends.forEach(({art},index)=>{
   art.hidden=index>=stage;art.classList.remove('preparedness-pose');art.style.removeProperty('left');art.style.removeProperty('right');art.style.removeProperty('top');art.style.removeProperty('transform');art.style.removeProperty('bottom');
   const variant=variants[index];art.dataset.variant=String(variant);const cells=[[0,0,1],[11,2,3],[2,4,5]];
   if(variant||index===1){art.classList.add('preparedness-pose');selectIllustration(art,cells[index][variant])}else selectIllustration(art,index);
  });
  sceneGroup.hidden=mode==='solo';sceneGroup.dataset.pose=mode;
  if(mode!=='solo'){
   if(mode==='drink'||mode==='exercise')sceneGroup.style.backgroundPosition=mode==='drink'?'center top':'center bottom';
   else selectIllustration(sceneGroup,{ride:6,lift:7,sleep:8}[mode]);
   const third={ride:2,lift:1,sleep:0}[mode];
   friends.forEach(({art},index)=>{art.hidden=index!==third;if(index===third){art.style.top='auto';art.style.left=mode==='lift'?'0':'auto';art.style.right=mode==='lift'?'auto':'0'}});
  }
  const watering=stage>0&&variants[0]===0&&(mode==='solo'||mode==='sleep'),tako=friends[0].art;
  tako.dataset.watering=String(watering);
  if(watering){
   const fromRight=mode==='sleep';tako.style.left=fromRight?'auto':'calc(50% - 74px)';tako.style.right=fromRight?'calc(50% - 74px)':'auto';tako.style.transform=fromRight?'scaleX(-1)':'none';tako.style.bottom='26px';
  }
  treeArt.dataset.characters=friends.slice(0,stage).map(f=>f.art.dataset.friend).join(',');
  treeArt.setAttribute('aria-label',[['種','芽','若木','大きな木'][stage],stage?poseNames[mode]:'',...friends.slice(0,stage).map(f=>f.art.dataset.friend)].filter(Boolean).join('、'));
 }
 const treeCopy=el('div'),treeStage=el('p');treeStage.id='preparednessTreeStage';
 const treeName=el('span'),treeCount=el('span',undefined,'preparedness-count');treeStage.append(treeName,treeCount);
 treeCopy.append(el('h3','防災の木'),treeStage);tree.append(treeCopy,treeArt);
 tree.id='homePreparednessTree';treeCopy.className='preparedness-tree-copy';attachHelp(treeCopy.querySelector('h3'),'tree');
 const homeScene=document.querySelector('#home .game-mascot-scene');
 homeScene.insertBefore(tree,homeScene.querySelector('.refresh-speech'));
 tree.append(homeScene.querySelector('.refresh-speech'));
 const trophies=el('ul',undefined,'preparedness-trophies');trophies.id='preparednessTrophies';
 const trophySection=el('section'),trophyHeading=el('h3','トロフィー');trophySection.id='preparednessTrophySection';
 trophySection.append(trophyHeading,trophies);
 const badgeSection=el('section'),badges=el('ul',undefined,'milestone-badges');
 badgeSection.id='preparednessRecordBadges';
 badgeSection.append(el('h3','片付け・備蓄のバッジ'),badges);
 const collection=el('dialog');collection.id='achievementCollection';
 const collectionTitle=el('h2','バッジ・トロフィー');collectionTitle.id='achievementCollectionTitle';
 collection.setAttribute('aria-labelledby',collectionTitle.id);
 const closeCollection=action('×',()=>collection.close());closeCollection.id='achievementCollectionClose';
 closeCollection.setAttribute('aria-label','バッジ・トロフィーを閉じる');closeCollection.autofocus=true;
 const collectionBar=el('div',undefined,'achievement-collection-bar'),collectionBarInner=el('div');
 collectionBarInner.append(collectionTitle,closeCollection);collectionBar.append(collectionBarInner);
 const collectionScroll=el('div',undefined,'achievement-collection-scroll'),collectionContent=el('div',undefined,'achievement-collection-content');
 collectionContent.append(badgeSection,trophySection);collectionScroll.append(collectionContent);
 collection.append(collectionBar,collectionScroll);document.body.append(collection);
 const collectionEntry=action('バッジ・トロフィーを見る',()=>openCollection());
 collectionEntry.id='openAchievementCollection';collectionEntry.setAttribute('aria-haspopup','dialog');collectionEntry.setAttribute('aria-controls',collection.id);
 function openCollection(section){
  if(collection.open)return;
  collection.showModal();
  closeCollection.focus({preventScroll:true});
  collectionScroll.scrollTop=0;
  if(section==='trophies')trophySection.scrollIntoView({block:'start'});
 }
 function clearCollectionLink(){
  const url=new URL(location.href);
  if(url.searchParams.get('page')==='more'&&['collection','badges','trophies'].includes(url.searchParams.get('focus'))){
   url.searchParams.set('focus','achievements');
   try{history.replaceState(history.state,'',url)}catch(e){}
  }
 }
 collection.addEventListener('close',()=>{
  clearCollectionLink();
  if(activePage==='more'&&!document.querySelector('dialog[open]'))collectionEntry.focus();
 });
 function achievementItem(id,label,art,date,earned,destination,open){
  const row=el('li');row.dataset.earned=String(earned);
  const details=el('details',undefined,'achievement-item');details.dataset.achievement=id;details.open=open;
  const summary=el('summary'),chevron=el('span','⌄','achievement-item-chevron');
  chevron.setAttribute('aria-hidden','true');
  art.setAttribute('aria-hidden','true');
  summary.append(art,el('span',label,'milestone-badge-label'),chevron);
  const content=el('div',undefined,'achievement-item-data'),when=el('p');
  if(!earned)when.textContent='まだ獲得していません';
  else if(validSupplyDate(date)){
   const [year,month,day]=date.split('-').map(Number);
   const time=el('time',year+'年'+month+'月'+day+'日');time.dateTime=date;
   when.append('獲得日 ',time);
  }else when.textContent='獲得日の記録なし';
  const link=action(destination.label,()=>{
   clearCollectionLink();
   collection.close();
   if(destination.roomId)openTidyAlbumRecord(destination.roomId);
   else show(destination.page);
  });
  content.append(when,link);details.append(summary,content);row.append(details);return row;
 }
 function roomBadgeCell(place){
  switch(place){
   case '玄関':return 4;
   case 'リビング':return 5;
   case '寝室':return 6;
   case 'キッチン':return 7;
   case '洗面・トイレ':return 8;
   case '浴室':return 9;
   default:return /収納|押入れ|押し入れ|クローゼット/.test(place)?11:10;
  }
 }
 const milestone=el('p',undefined,'milestone-notice');milestone.id='milestoneNotice';milestone.setAttribute('role','status');
 badgePanel.append(collectionEntry,milestone,action('できたことを共有する',openShare));
 familyGroup.before(badgePanel);
 const completedRooms=()=>readTidyPlaces().filter(item=>item.done);
 const trophyRules=[
  ['safety-first','住まいの安全を1項目確認',s=>s.safety>0,'homeSafety'],
  ['safety-priority','優先する安全点検を完了',s=>s.priority,'homeSafety'],
  ['safety-all','住まいの安全点検をすべて完了',s=>s.allSafety,'homeSafety'],
  ['tidy-first','1か所の片付けを完了',s=>s.rooms>=1,'tidy'],
  ['tidy-three','3か所の片付けを完了',s=>s.rooms>=3,'tidy'],
  ['stock-first','備蓄品を1品登録',s=>s.stock>=1,'supplies'],
  ['stock-five','備蓄品を5品登録',s=>s.stock>=5,'supplies'],
  ['clean-first','掃除を1項目完了',s=>s.cleaned,'cleanPractice']
 ];
 const achievementPages={
  homeSafety:{key:homeSafetyKey,label:'住まいの安全点検へ'},
  tidy:{key:tidyKey,label:'お片付けノートへ'},
  supplies:{key,label:'備蓄管理へ'},
  cleanPractice:{key:'toto-clean-practice-v1',label:'掃除へ'}
 };
 const checkedSafety=state=>Object.keys(state).filter(id=>homeSafetySections.some(section=>section.items.some(([item])=>item===id))&&['done','na'].includes(state[id]));
 function readAchievements(){
  try{
   const record=JSON.parse(localStorage.getItem(achievementKey));
   return record===null?{trophies:[],daily:null}:validAchievementRecord(record)?record:null;
  }catch(e){return null}
 }
 function renderBadges(change){
  const date=todayLocalDate(),saved=readAchievements(),rooms=completedRooms(),stock=readSaved(key,[]).length;
  const safety=checkedSafety(readHomeSafety()),clean=Object.values(readCleanPracticeRaw());
  const stats={rooms:rooms.length,stock,safety:safety.length,priority:criticalSafetyState().remaining.length===0,allSafety:homeSafetyCounts().unknown===0,cleaned:clean.some(item=>item.done)};
  const earned=new Set(saved?.trophies??[]),earnedOn={...saved?.earnedOn};
  let stockBadgeOn=saved?.stockBadgeOn;
  for(const [id,,goal,page] of trophyRules){
   if(earned.has(id)||!goal(stats))continue;
   earned.add(id);
   if(change?.key===achievementPages[page].key)earnedOn[id]=date;
  }
  let daily=saved?.daily?.date===date?saved.daily:null;
  if(change){
   try{
    const before=JSON.parse(change.before),after=JSON.parse(change.value);
    if(change.key===homeSafetyKey){
     const previous=new Set(checkedSafety(before??{}));
     const completed=checkedSafety(after).filter(id=>!previous.has(id));
     if(completed.length)daily={date,stock:daily?.stock??0,safety:[...new Set([...(daily?.safety??[]),...completed])]};
    }
    if(change.key===key){
     const additions=after.length-(before?.length??0);
     if(additions>0)daily={date,safety:daily?.safety??[],stock:Math.min(9999,(daily?.stock??0)+additions)};
     if(additions>0&&!before?.length){
      stockBadgeOn=date;
      milestone.textContent='はじめての備蓄登録、おつかれさまでした！';
     }
    }
   }catch(e){}
  }
  const next={trophies:[...earned],daily:daily??saved?.daily??null};
  if(Object.keys(earnedOn).length)next.earnedOn=earnedOn;
  if(stockBadgeOn)next.stockBadgeOn=stockBadgeOn;
  if(saved&&JSON.stringify(saved)!==JSON.stringify(next))verifiedSaveJson(achievementKey,next);
  const updateToday=[
   ['安全点検',daily?.safety.filter(id=>safety.includes(id)).length??0,'項目'],
   ['片付け',rooms.filter(room=>room.completedAt===date).length,'か所'],
   ['掃除',clean.filter(item=>item.done&&todayLocalDate(new Date(item.at))===date).length,'項目'],
   ['備蓄登録',daily?.stock??0,'品']
  ].filter(([,count])=>count).map(([label,count,unit])=>label+' '+count+unit).join('・');
  const line=updateToday||'まだ記録はありません';
  if(todayText.textContent!==line)todayText.textContent=line;

  const stage=earned.size>=6?3:earned.size>=3?2:earned.size>=1?1:0;
  const stageName=['種','芽','若木','大きな木'][stage];
  const stageChanged=homeScene.dataset.treeStage!==String(stage);
  homeScene.dataset.treeStage=String(stage);
  homeScene.setAttribute('aria-label','成長する防災の木');
  if(stageChanged)document.dispatchEvent(new Event('toto-tree-stage-changed'));
  selectIllustration(plant,stage);
  renderTreeScene(stage,false,earned.size>=trophyRules.length);
  treeName.textContent=stageName;
  treeCount.textContent='トロフィー '+earned.size+'/'+trophyRules.length;
  const openItems=new Set([...collectionContent.querySelectorAll('.achievement-item[open]')].map(item=>item.dataset.achievement));
  trophies.replaceChildren(...trophyRules.map(([id,title,,page],index)=>{
   const unlocked=earned.has(id),art=el('span',undefined,'preparedness-illustration preparedness-trophy-art');
   selectIllustration(art,index+4);
   const destination={page,label:achievementPages[page].label};
   return achievementItem(id,title+'（'+(unlocked?'獲得済み':'未獲得')+'）',art,earnedOn[id],unlocked,destination,openItems.has(id));
  }));
  badges.replaceChildren(...rooms.map(room=>{
   const id='room:'+room.id,art=el('span',undefined,'preparedness-friend-badge milestone-badge-art');
   selectIllustration(art,roomBadgeCell(room.place));
   return achievementItem(id,room.place+'の片付け4項目を完了',art,room.completedAt,true,{roomId:room.id,label:room.place+'のチェックリストへ'},openItems.has(id));
  }));
  if(stock){
   const art=el('span',undefined,'preparedness-friend-badge milestone-badge-art');
   selectIllustration(art,3);
   badges.append(achievementItem('stock-badge','備蓄品を登録（'+stock+'品）',art,stockBadgeOn,true,{page:'supplies',label:'備蓄管理へ'},openItems.has('stock-badge')));
  }
  if(!badges.children.length)badges.append(el('li','片付けを完了した場所と、登録した備蓄品の数が表示されます。'));
 }
 $('tidyPlaceChecklistTitle').after(el('p','進捗は登録した場所の作業を終えた割合です。家具の固定や避難経路も別に確認しましょう。','notice'));
 for(const id of ['tidy','tidyAlbum'])$(id).append(action('できたことを共有する',openShare));
 $('roomReflectionDialog').append(action('この達成を共有する',()=>{$('roomReflectionDialog').close();openShare()}));
 $('livingCelebrationStep').append(action('できたことを共有する',()=>{$('livingMilestoneDialog').close();openShare()}));

 const shareDialog=el('dialog');shareDialog.id='achievementShareDialog';shareDialog.setAttribute('aria-labelledby','achievementShareTitle');
 const shareTitle=el('h2','共有する内容を選ぶ');shareTitle.id='achievementShareTitle';shareDialog.append(shareTitle,el('p','送信前に、下の文章と選んだ写真を確認してください。','notice'));
 function choice(id,text){const label=el('label'),check=el('input');check.type='checkbox';check.id=id;label.append(check,el('span',text));shareDialog.append(label);check.onchange=updateShare;return check}
 const addressCheck=choice('shareAddress','住所・地域を含める'),address=el('textarea');address.id='shareAddressText';address.className='field';address.rows=2;address.maxLength=200;address.placeholder='共有してよい住所・地域だけ入力';address.setAttribute('aria-label','共有する住所・地域');address.hidden=true;address.oninput=updateShare;shareDialog.append(address);
 const familyCheck=choice('shareFamily','家族・ペットの表示名、人数、用品・支援メモを含める');
 const photoHost=el('div');photoHost.id='sharePhotos';shareDialog.append(photoHost);
 const previewLabel=el('label','共有文の確認');previewLabel.htmlFor='sharePreview';const preview=el('textarea');preview.id='sharePreview';preview.readOnly=true;preview.className='field';
 const shareStatus=el('p');shareStatus.id='shareStatus';shareStatus.setAttribute('role','status');const downloads=el('div');
 let photoChoices=[];
 function updateShare(){
  const lines=['ととのえ防災で、できたことを記録しました。','片付け '+completedRooms().length+'か所／備蓄登録 '+(supplyStorageReadable()?supplies.length:0)+'品'];
  address.hidden=!addressCheck.checked;
  if(addressCheck.checked&&address.value.trim())lines.push('住所・地域\n'+address.value.trim());
  if(familyCheck.checked)for(const item of loadFamilyProfiles())lines.push([item.label||familyKinds[item.type].name,item.count+(item.type==='pet'?'匹':'人'),item.suppliesNote,item.foodNote,item.supportNote].filter(Boolean).join('／'));
  lines.push('https://minimalisttako.github.io/totonoe-bousai-web/');preview.value=lines.join('\n\n');downloads.replaceChildren();
  photoChoices.filter(p=>p.check.checked).forEach((p,i)=>{const link=el('a','選択した写真'+(i+1)+'を保存','secondary');link.href=p.data;link.download='totonoe-photo-'+(i+1)+'.jpg';downloads.append(link)});
 }
 async function sendShare(){
  const files=photoChoices.filter(p=>p.check.checked).map((p,i)=>{const bytes=Uint8Array.from(atob(p.data.split(',')[1]),c=>c.charCodeAt(0));return new File([bytes],'totonoe-photo-'+(i+1)+'.jpg',{type:'image/jpeg'})});
  const data={title:'ととのえ防災でできたこと',text:preview.value};if(files.length)data.files=files;
  if(!navigator.share||(files.length&&(!navigator.canShare||!navigator.canShare({files})))){shareStatus.textContent='共有文をコピーし、選んだ写真を保存して投稿先で添付できます。';return}
  try{await navigator.share(data);shareStatus.textContent='共有操作を完了しました。'}catch(e){shareStatus.textContent=e.name==='AbortError'?'共有をキャンセルしました。':'共有できませんでした。文章をコピーして投稿先に貼り付けられます。'}
 }
 async function copyShare(){try{await navigator.clipboard.writeText(preview.value);shareStatus.textContent='共有文をコピーしました。'}catch(e){preview.focus();preview.select();shareStatus.textContent='文章を選択しました。端末のコピー操作を使ってください。'}}
 shareDialog.append(previewLabel,preview,action('選んだ内容を共有する',sendShare),action('共有文をコピー',copyShare),downloads,shareStatus,action('閉じる',()=>shareDialog.close()));document.body.append(shareDialog);
 function openShare(){
  addressCheck.checked=false;familyCheck.checked=false;address.value='';shareStatus.textContent='';photoChoices=[];photoHost.replaceChildren(el('p','写真を添付する場合は、写り込んだ住所や顔なども確認してください。','notice'));
  for(const item of readTidyPlaces())for(const field of ['beforePhoto','afterPhoto','livingAfterPhoto']){
   if(!validTidyPhoto(item[field]))continue;
   const label=el('label'),check=el('input'),image=el('img');check.type='checkbox';image.src=item[field];image.alt='共有する写真の候補';
   label.append(check,image,el('span',item.place+'／'+({beforePhoto:'片付け前',afterPhoto:'片付け後',livingAfterPhoto:'暮らしの変化'})[field]));photoHost.append(label);photoChoices.push({check,data:item[field]});check.onchange=updateShare;
  }
  updateShare();shareDialog.showModal();
 }

 // Unsaved text stays in the current browser tab, and successful submission removes it.
 const draftKey='toto-form-drafts-v1';let drafts={},submittingForm=null;
 try{const value=JSON.parse(sessionStorage.getItem(draftKey)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))drafts=value}catch(e){}
 const draftStatus=el('p',undefined,'notice');draftStatus.id='draftStatus';draftStatus.setAttribute('role','status');document.querySelector('header').append(draftStatus);
 function formKey(form){const section=form.closest('main > section');if(!section||section.id==='reviews'||form.method==='dialog')return null;return section.id+':'+(form.id||[...section.querySelectorAll('form')].indexOf(form))}
 function fields(form){return [...form.querySelectorAll('input[id],textarea[id],select[id]')].filter(n=>!n.readOnly&&!['file','password','hidden','submit','button'].includes(n.type))}
 function syncDraftFields(form){
  if(form.querySelector('#scategory'))updateSupplyCompareHint();
  if(form.querySelector('#tidyPlace'))toggleTidyCustom();
  if(form.querySelector('#familyType'))renderFamilySuggestedItems();
 }
 function saveDrafts(){try{sessionStorage.setItem(draftKey,JSON.stringify(drafts))}catch(e){draftStatus.textContent='入力途中の内容を一時保存できません。画面を閉じる前に記録を保存してください。'}}
 function forgetDraft(form){const id=formKey(form);if(!id)return;delete drafts[id];saveDrafts();delete form.dataset.draftApplied;form.querySelector('.draft-resume')?.remove()}
 function clearDrafts(){drafts={};saveDrafts();document.querySelectorAll('.draft-resume').forEach(n=>n.remove())}
 function restoreDrafts(){
  for(const form of $(activePage).querySelectorAll('form')){
   const id=formKey(form),values=drafts[id];if(!id||!values||form.dataset.draftApplied==='true')continue;
   for(const select of form.querySelectorAll('select[id]')){
    if(typeof values[select.id]==='string')select.value=values[select.id];
   }
   syncDraftFields(form);
   for(const n of fields(form)){if(!Object.hasOwn(values,n.id))continue;const value=values[n.id];if(['checkbox','radio'].includes(n.type)){if(typeof value==='boolean')n.checked=value}else if(typeof value==='string'&&value.length<=5000)n.value=value}
   form.dataset.draftApplied='true';const note=el('div',undefined,'draft-resume');note.append(el('span','入力途中の内容を戻しました。写真は必要に応じて選び直してください。'),action('入力途中の内容を取り消す',()=>{forgetDraft(form);form.reset();syncDraftFields(form);delete form.dataset.draftApplied}));form.prepend(note);
   for(let parent=form.parentElement;parent&&parent!==$(activePage);parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  }
 }
 document.addEventListener('input',event=>{const n=event.target,form=n.form;if(!form||!fields(form).includes(n))return;const id=formKey(form);if(!id)return;const values={};for(const f of fields(form))values[f.id]=['checkbox','radio'].includes(f.type)?f.checked:f.value.slice(0,5000);drafts[id]=values;saveDrafts()});
 document.addEventListener('change',event=>{if(event.target.matches('select,input[type=checkbox],input[type=radio]'))event.target.dispatchEvent(new Event('input',{bubbles:true}))});
 document.addEventListener('submit',event=>{submittingForm=event.target;setTimeout(()=>{submittingForm=null},0)},true);
 document.addEventListener('toto-record-saved',event=>{
  const change=event.detail;
  if(change.key===achievementKey)return;
  if(submittingForm)forgetDraft(submittingForm);
  if([key,tidyKey,homeSafetyKey,'toto-clean-practice-v1'].includes(change.key))renderBadges(change);
 });
 window.addEventListener('toto-data-restored',()=>{milestone.textContent='';renderBadges();clearDrafts()});
 window.addEventListener('storage',event=>{
  if(event.key===null||[achievementKey,key,tidyKey,homeSafetyKey,'toto-clean-practice-v1'].includes(event.key))renderBadges();
 });
 let displayedDay=todayLocalDate();
 function refreshAchievementDate(){
  const date=todayLocalDate();
  if(document.hidden||displayedDay===date)return;
  displayedDay=date;
  renderBadges();
 }
 window.addEventListener('pageshow',refreshAchievementDate);
 document.addEventListener('visibilitychange',refreshAchievementDate);
 setInterval(refreshAchievementDate,30000);

 let fromHistory=false,shown=activePage;
 function syncUrl(id,replace){if(fromHistory)return;const url=new URL(location.href);url.searchParams.set('page',id);url.hash='';try{history[replace?'replaceState':'pushState']({...history.state,totonoePage:id,totonoeDepth:replace?(history.state?.totonoeDepth||0):(history.state?.totonoeDepth||0)+1},'',url)}catch(e){}}
 const previousShow=show;
 show=function(id){if(id==='home'&&activePage!=='home')sceneChoice=null;const result=previousShow.apply(this,arguments);if(activePage===id){if(id!==shown){syncUrl(id,false);shown=id}restoreDrafts();renderBadges();draftStatus.hidden=id==='emergency'}return result};
 if(!entryPage||(validPage(entryPage)&&entryPage===activePage))syncUrl(activePage,true);
 window.addEventListener('popstate',()=>{const id=new URL(location.href).searchParams.get('page')||'home';fromHistory=true;try{show(validPage(id)?id:'home');shown=activePage}finally{fromHistory=false}});
 const previousBack=goBackPage;goBackPage=function(){if(history.state?.totonoeDepth>0){history.back();return}previousBack()};

 // The first explanation is followed by region selection and hazard-map confirmation.
 const previousFinish=finishTutorial;
 finishTutorial=function(){const replay=tutorialReplay;const result=previousFinish.apply(this,arguments);if(!replay&&!hazardIsConfirmed()){setupActive=true;openHazardGate(false)}return result};
 let setupActive=false;
 const previousHazardFinish=$('hazardFinish').onclick;
 $('hazardFinish').onclick=function(){previousHazardFinish.apply(this,arguments);if(setupActive&&hazardIsConfirmed()){setupActive=false;$('stockGateDialog').close();show(targetPage)}};
 const setupCard=$('hazardStartCard');document.querySelector('#home .refresh-home-mission').before(setupCard);
 function startSetup(){
  if(activePage==='emergency'||['backup','reviewBackup','evacuationVideos'].includes(entryPage)||document.querySelector('dialog[open]'))return;
  if(tutorialNeedsGate(activePage)){setupActive=true;tutorialPendingPage=targetPage;openTutorial();return}
  if(!hazardIsConfirmed()){setupActive=true;openHazardGate(false)}
 }
 renderBadges();restoreDrafts();syncHazardGate();
 let customRoomHelpKey='';
 function syncCustomRoomHelp(){
  let places;try{places=[...new Set(readTidyPlaces().map(record=>record.place).filter(place=>place&&!Object.prototype.hasOwnProperty.call(tidyReasonTemplates,place)))].sort()}catch(e){return}
  const key=JSON.stringify(places);if(key===customRoomHelpKey)return;customRoomHelpKey=key;
  for(const [id,topic] of helpTopics)if(topic.customRoom)helpTopics.delete(id);
  for(const place of places){const id='room:'+place;addHelp(id,place+'で気をつけたいこと','片付け・掃除',tidyReasonFor(place),()=>show('tidy'),'片付けノートを開く');helpTopics.get(id).customRoom=true}
  renderHelpIndex();
 }
 const pageHelp={home:'home',learn:'learn',minimalistGuide:'minimalism',select:'sorting',set:'organizing',stock:'stock',supplies:'inventory',reviews:'reviews',diagnosis:'diagnosis',emergency:'emergency',evacuation:'evacuation',homeSafety:'safety',pouch:'pouch',goBag:'goBag',tidy:'tidyChecklist',seasonalCheck:'seasonal',readiness:'readiness',family:'family',training:'training',moving:'moving',outage:'outage',examStudy:'exam',weather:'weather',events:'events',practiceQuiz:'quiz',helpGuide:'deviceStorage',cleanPractice:'clean',tidyAlbum:'album',more:'more'};
 const helpFieldTopics={
  sqty:'quantity',sunit:'unit',scategory:'category',sfactor:'waterCapacity',smeasureFactor:'foodServings',sexp:'expiry',slocation:'stockLocation',schecked:'stockInspection',snextCheck:'stockInspection',scheckInterval:'inspectionInterval',starget:'stockTarget',
  calcPeople:'familyNumbers',calcDays:'calculator',calcCustomDays:'calculator',calcToiletPerDay:'toilet',stockSetupPeople:'familyNumbers',stockSetupDays:'calculator',stockSetupToilet:'toilet',
  evHazard:'hazardMemo',evPlace:'destination',evRoute:'route',evTiming:'timing',evContacts:'contacts',evMeeting:'meeting',evacuationNextReview:'reviewPlan',
  familyType:'family',familyLabel:'family',familyCount:'familyNumbers',familySuppliesNote:'familyNeeds',familyFoodNote:'familyNeeds',familySupportNote:'familyNeeds',
  tidyPlace:'tidyAdd',tidyCustom:'tidyAdd',tidyNext:'tidyNotes',tidyBefore:'tidyNotes',tidyExportText:'tidyExport',tidyAlbumFilter:'album',
  cleanResetDays:'cleanSchedule',cleanResetTime:'cleanSchedule',seasonalType:'seasonal',drillDate:'training',drillType:'training',drillNote:'training',trainingHistoryFilter:'training',
  outagePeople:'outage',outageDays:'outage',outageCustomDays:'outage',outageToilet:'outage',outageToiletStock:'outage',
  weatherOffice:'weatherRegion',weatherArea:'weatherRegion',weatherStation:'weatherRegion',warningCity:'warnings',sharedRegionOffice:'weatherRegion',sharedRegionCity:'weatherRegion',
  eventPrefecture:'events',eventCity:'events',eventKind:'events',eventMonth:'events',practiceTopic:'quiz',practiceGuideSearch:'quizReview',
  reviewProduct:'reviewWrite',reviewCategory:'reviewWrite',reviewStars:'reviewWrite',reviewComment:'reviewWrite',reviewPhotoInput:'reviewPhotos',sharedReviewSearch:'reviews',reviewSearch:'reviews',
  pouchName:'pouch',pouchNote:'pouch',pouchNextCheck:'pouchChecks',goBagName:'goBag',supplySearch:'filters',supplyFilter:'filters',tidySearch:'filters',tidyFilter:'filters',pouchSearch:'filters',pouchFilter:'filters',
  fullBackupFile:'restore',allBackupText:'restore',backupText:'backupTypes',reviewBackupFile:'backupTypes',reviewBackupText:'backupTypes',supportReportText:'support',emergencyChecklistEdit:'emergency',replenishmentCopyText:'shopping'
 };
 const helpHeadingRules={
  home:[[/ハザード/,'hazard'],[/優先|やること|おすすめ/,'priorities'],[/天気|気温/,'weather'],[/警報|注意報/,'warnings'],[/お知らせ|期限|点検/,'reminders'],[/できたこと|防災の木/,'tree']],
  learn:[[/試験|無料学習/,'exam'],[/4ステップ/,'tidyChecklist'],[/3ステップ/,'stock'],[/動画|夏と冬|在宅|離れる|自宅で過ごす/,'videos']],
  minimalistGuide:[[/理想|暮らし|ミニマリスト/,'minimalism'],[/整理|選ぶ|手放/,'sorting'],[/整頓|収納/,'organizing'],[/掃除/,'clean']],
  supplies:[[/BOS/,'bos'],[/無印|Anker|おすすめ/,'recommendations'],[/補充|買い物/,'shopping'],[/使う・買い足す|先に使う/,'useStock'],[/アプリ全体|機種変更/,'backup'],[/レビュー.*バックアップ/,'backupTypes'],[/バックアップ|コピー・貼り付け/,'backupTypes'],[/復元/,'restore'],[/食料の内容量/,'foodServings'],[/備蓄目安|人数と日数/,'calculator'],[/飲料水の内訳/,'waterCapacity'],[/持ち出し/,'goBag'],[/備蓄を登録|品を登録/,'supplyAdd'],[/検索・絞り込み/,'filters'],[/保管場所・点検/,'stockInspection'],[/必要なもの/,'stock']],
  tidy:[[/写真|Before|After/,'tidyPhotos'],[/メモ|作業|困りごと/,'tidyNotes'],[/新しい|場所を追加/,'tidyAdd'],[/文章|書き出す/,'tidyExport'],[/検索|絞り込み/,'filters'],[/動画|実例/,'videos'],[/削除/,'deleteRestore']],
  reviews:[[/公開投稿とアカウント|ログイン/,'account'],[/端末のレビュー/,'reviewPublic'],[/レビューを書く/,'reviewWrite'],[/投稿|レビュー/,'reviews']],
  emergency:[[/最新|災害情報/,'warnings'],[/メモ|コピー/,'emergencyMemo'],[/編集|チェック/,'emergency']],
  evacuation:[[/在宅|安全なら/,'destination'],[/見直し/,'reviewPlan'],[/訓練|確認の記録/,'training']],
  homeSafety:[[/寝る場所|家具/,'safetyBedroom'],[/経路|動線/,'safetyRoute']],
  pouch:[[/点検|持ち物/,'pouchChecks'],[/実例|一例/,'videos'],[/検索/,'filters']],goBag:[[/実例|一例/,'videos']],
  family:[[/人数|頭数/,'familyNumbers'],[/個別|支援|備えの確認/,'familyNeeds']],
  examStudy:[[/間違|解説|検索/,'quizReview'],[/例題/,'quiz'],[/動画|音声/,'exam']],practiceQuiz:[[/結果|間違/,'quizReview']],
  weather:[[/警報|注意報/,'warnings'],[/気温|地点/,'weatherRegion']],
  helpGuide:[[/機種変更|復元/,'restore'],[/保存でき|見つから/,'saveFailure'],[/保存される/,'deviceStorage'],[/通信|オフライン/,'offline'],[/プライバシー/,'privacy'],[/問い合わせ/,'feedback'],[/公開状況/,'releaseNews'],[/初めて|はじめて/,'start']],
  cleanPractice:[[/設定|解除|時刻|間隔/,'cleanSchedule']],
  more:[[/削除.*取り消し/,'deleteRestore'],[/機能を探す/,'featureSearch'],[/お気に入り/,'favorites'],[/バックアップ|機種変更/,'backup'],[/オフライン|ホーム画面/,'offline'],[/表示|簡易/,'display'],[/吹き出し|コメント/,'speech'],[/期限|点検のお知らせ/,'reminders'],[/カレンダー|通知/,'calendar'],[/講座|料金|相談/,'lecture'],[/ワークシート|見本|PDF/,'worksheet'],[/更新|公開|リリース|試作/,'releaseNews'],[/不具合報告用|動作診断|整合性|スモーク|検証|データの総合点検/,'support'],[/プライバシー/,'privacy'],[/保存状態|保存状況/,'deviceStorage'],[/はじめて|初めて|使い方/,'start']]
 };
 const helpSpecificScopes=[
  ['#favoritesTitle','favorites'],['#feedbackTitle','feedback'],['#shoppingTitle','shopping'],['#lectureInformation h2,#workshopDetails h3','lecture'],['#appUpdateNews>summary','releaseNews'],['#reminderCard h2','reminders'],['#displaySettings h2,#simpleDisplayCard h2','display'],
  ['#achievementCollectionTitle,#achievementBadges>h2,#preparednessTrophySection>h3,#preparednessRecordBadges>h3','tree'],['#achievementShareDialog h2,#achievementShareDialog h3,#achievementShareDialog summary,#achievementShareDialog label','share'],
  ['#fullBackupDialog h2,#fullBackupDialog summary','backup'],['#stockSetupTitle','calculator'],['#sharedRegionTitle','weatherRegion'],['#hazardGateTitle','hazard']
 ];
 const pageHelpSelector=Object.keys(pageHelp).map(id=>'#'+id).join(',');
 function helpText(node){const copy=node.cloneNode(true);copy.querySelectorAll('.context-help-button,input,select,textarea,.chibi-icon').forEach(n=>n.remove());return copy.textContent.trim()}
 function headingTopic(node,page){const text=helpText(node);for(const [match,id] of helpHeadingRules[page]||[])if(match.test(text))return id;return pageHelp[page]}
 function bindBeginnerHelp(){
  syncCustomRoomHelp();
  helpTargetQueue=new Map();
  document.querySelectorAll('.context-help-button').forEach(button=>helpTargetQueue.set(button.parentElement,button.dataset.contextHelpTopic));
  for(const [selector,id] of helpSpecificScopes)document.querySelectorAll(selector).forEach(node=>attachHelp(node,id));
  document.querySelectorAll('label[for]').forEach(label=>{const id=helpFieldTopics[label.htmlFor];if(id)attachHelp(label,id)});
  document.querySelectorAll('.supply-edit .supply-label').forEach(label=>{
   const text=helpText(label),rules=[[/食数|食料|内容量/,'foodServings'],[/容量|リットル/,'waterCapacity'],[/目標/,'stockTarget'],[/分類/,'category'],[/単位/,'unit'],[/数量/,'quantity'],[/繰り返し/,'inspectionInterval'],[/点検/,'stockInspection'],[/期限/,'expiry'],[/保管/,'stockLocation'],[/品名/,'supplyAdd']];
   const match=rules.find(([pattern])=>pattern.test(text));if(match)attachHelp(label,match[1]);
  });
  document.querySelectorAll('main section h2,main section h3,main section summary').forEach(node=>{
   if(node.closest('#preparednessReasons,#contextHelpDialog,.tidy-place,.refresh-speech,.page-feedback-footer,.help-index-group'))return;
   if(node.closest('a,button')||node.querySelector(':scope>.context-help-button'))return;
   const section=node.closest(pageHelpSelector);if(!section)return;const page=section.id;
   if(page==='more'&&!helpHeadingRules.more.some(([pattern])=>pattern.test(helpText(node)))&&node!==section.querySelector('h2'))return;
   if(page==='practiceQuiz'&&node.tagName!=='H2')return;
   attachHelp(node,headingTopic(node,page));
  });
  // The small home widgets are created separately from page headings.
  for(const [selector,id] of [['#homeWeatherPlace','weatherRegion'],['#homeWarningLabel','warnings'],['#todayAchievements>strong','tree']]){const node=document.querySelector(selector);if(node)attachHelp(node,id)}
  // Keep one copy of each explanation within a card or fold, preferring its heading.
  // Gather first so newly rendered fields cannot steal the heading's help button.
  const targets=[...helpTargetQueue].filter(([node,id])=>node.isConnected&&helpTopics.has(id));helpTargetQueue=null;
  const groups=new Map();
  for(const [node,id] of targets){
   const scope=node.closest('details,.card,dialog')||node.closest('section')||node.parentElement;
   if(!groups.has(scope))groups.set(scope,new Map());
   const topics=groups.get(scope);if(!topics.has(id))topics.set(id,[]);topics.get(id).push(node);
  }
  for(const topics of groups.values())for(const [id,nodes] of topics){
   const preferred=nodes.find(node=>node.matches('summary'))||nodes.find(node=>node.matches('h2,h3'))||nodes[0];
   for(const node of nodes){
    if(node===preferred){attachHelp(node,id);continue}
    node.querySelector(':scope>.context-help-button')?.remove();node.classList.remove('context-help-heading');
   }
  }
 }
 // Keep field help on editors and cards created after the initial render.
 let beginnerHelpQueued=false;
 const beginnerHelpObserver=new MutationObserver(records=>{
  const changed=records.some(record=>!record.target.closest?.('#contextHelpDialog,#preparednessReasons')&&([...record.removedNodes].some(node=>node.nodeType===1&&node.matches('.context-help-button'))||[...record.addedNodes].some(node=>node.nodeType===1&&!node.matches('.context-help-button,.context-help-label-text,.help-book-icon,.help-button-label')&&!node.closest?.('.context-help-button'))));
  if(!changed||beginnerHelpQueued)return;beginnerHelpQueued=true;queueMicrotask(()=>{beginnerHelpQueued=false;bindBeginnerHelp()});
 });
 bindBeginnerHelp();beginnerHelpObserver.observe(document.body,{childList:true,subtree:true});
 // Expose a read-only audit of topics and page coverage for release verification.
 window.TotonoeHelpAudit=()=>({topics:[...helpTopics.values()].map(({id,title,category})=>({id,title,category})),pages:{...pageHelp}});

 $(activePage).append(document.querySelector('.page-feedback-footer'));

 const beginnerHelpStyle=el('style');beginnerHelpStyle.textContent=`
 .context-help-button{display:inline-flex!important;align-items:center;justify-content:center;gap:4px;flex:0 0 68px;min-width:68px!important;width:68px!important;height:44px;padding:4px!important;border:1px solid #aac8b6;background:#f8fbf7!important;border-radius:22px;font-size:11px!important;line-height:1.2;color:#347255}
 .context-help-button>.help-book-icon{display:block;width:19px;height:19px;flex:none}.context-help-button>.help-button-label{display:inline;font-size:12px!important;font-weight:700;color:inherit;line-height:1.2}
 label.context-help-label{display:block!important;position:relative;min-width:0}label.context-help-label>.context-help-label-text{display:block;min-height:34px;padding-right:76px;line-height:1.5}label.context-help-label>.context-help-button{position:absolute;top:-5px;right:0}
 #contextHelpCategory{width:100%;box-sizing:border-box;margin:4px 0 10px}.help-index-group>summary{font-size:15px;font-weight:700;cursor:pointer;min-height:44px;padding:10px 3px;line-height:1.5}.help-index-group{border:1px solid #dce7de;border-radius:10px;padding:2px 9px;margin:8px 0}.help-index-group .help-index-entry:last-child{border-bottom:0}
 #homePreparednessTree .context-help-button{flex-basis:58px;min-width:58px!important;width:58px!important;border:0;height:36px;min-height:36px!important;background:transparent!important}
 @media(max-width:350px){.context-help-button{flex-basis:62px;min-width:62px!important;width:62px!important}.context-help-button>.help-book-icon{width:17px;height:17px}#tidy .tidy-place>summary{gap:4px}#tidy .tidy-place-name{font-size:13px}#tidy .tidy-place-progress-count{font-size:11px}}
 `;document.head.append(beginnerHelpStyle);
 const focus=entryUrl.searchParams.get('focus');
 if(entryPage==='homeSafety'&&focus==='route')openHomeSafetySection(1,false);
 if(entryPage==='home'&&focus==='achievements'&&activePage==='home')show('more');
 if(entryPage==='learn'&&['toiletReason','bosReason'].includes(focus))requestAnimationFrame(()=>showContextHelp(focus==='toiletReason'?'toilet':'bos'));
 const wantsCollection=entryPage==='more'&&['collection','badges','trophies'].includes(focus);
 const targets={reasons:'preparednessReasons',today:'todayAchievements',checklist:'tidyPlaceChecklist',family:'moreFamilyGroup',settings:'moreSettingsGroup',author:'moreAuthorGroup',achievements:'achievementBadges'};
 if(targets[focus])requestAnimationFrame(()=>{
  const target=$(targets[focus]);
  for(let node=target;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
  target.style.scrollMarginTop=(document.querySelector('header').offsetHeight+12)+'px';
  target.scrollIntoView({block:'start'});
 });
 if(wantsCollection&&activePage==='more'&&!document.querySelector('dialog[open]'))openCollection(focus);
 if(entryUrl.searchParams.get('share')==='1'&&!document.querySelector('dialog[open]'))openShare();
 if(entryUrl.searchParams.get('guide')==='1'){tutorialPendingPage=targetPage;tutorialState={...tutorialState,step:0};openTutorial(true)}else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>window.totoStories?window.totoStories.startSetup(startSetup):startSetup(),{once:true});else if(window.totoStories)window.totoStories.startSetup(startSetup);else startSetup();
})();
