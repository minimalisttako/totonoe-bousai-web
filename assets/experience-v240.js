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
 function feedbackBody() {return 'ととのえ防災 ご意見・不具合\nページ：'+pageTitle(feedbackPage)+'\nバージョン：v240\n\n'+feedbackText.value}
 function updateFeedbackLink(){email.href='mailto:totonoe.bousai.support@gmail.com?subject='+encodeURIComponent('ととのえ防災 ご意見・不具合（'+pageTitle(feedbackPage)+'）')+'&body='+encodeURIComponent(feedbackBody())}
 feedbackText.addEventListener('input',updateFeedbackLink);
 function openFeedback(){feedbackPage=activePage;feedbackContext.textContent='対象ページ：'+pageTitle(feedbackPage)+'。備蓄・住所・写真などの記録は自動添付しません。';feedbackStatus.textContent='';feedbackFallback.hidden=true;updateFeedbackLink();feedbackDialog.showModal()}
 const updates=element('details',undefined,'card experience-card');updates.id='appUpdateNews';updates.append(element('summary','更新のお知らせ'));
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
   "ととのえる３ステップ": 1,
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
   const place=label(node).split(/\s\d+\//u)[0];
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
 .milestone-badges{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0}.milestone-badges li{background:#eef5eb;border:1px solid #c5dcb5;border-radius:12px;padding:7px 11px;font-size:14px}
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

 const badgePanel=el('div',undefined,'card');badgePanel.id='achievementBadges';badgePanel.append(el('h2','実際にできたこと'));
 const badges=el('ul',undefined,'milestone-badges'),milestone=el('p',undefined,'milestone-notice');milestone.id='milestoneNotice';milestone.setAttribute('role','status');
 badgePanel.append(badges,el('p','チェック済みの作業と登録の記録です。災害時の安全性は、その時の状況に合わせて確認してください。','notice'),milestone,action('できたことを共有する',openShare));
 document.querySelector('#home .refresh-home-mission').after(badgePanel);
 const completedRooms=()=>readTidyPlaces().filter(item=>item.done);
 function renderBadges(){
  badges.replaceChildren();
  for(const room of completedRooms())badges.append(el('li','✓ '+room.place+'の片付け4項目を完了'));
  if(supplyStorageReadable()&&supplies.length)badges.append(el('li','✓ 備蓄品を登録（'+supplies.length+'品）'));
  if(!badges.children.length)badges.append(el('li','場所の片付けや備蓄の登録を進めると、ここに記録が並びます。'));
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
  if(submittingForm)forgetDraft(submittingForm);
  const {key:savedKey,before,value}=event.detail;
  if(savedKey===key){try{const old=before===null?[]:JSON.parse(before),items=JSON.parse(value);if(Array.isArray(old)&&!old.length&&Array.isArray(items)&&items.length)milestone.textContent='はじめての備蓄登録、おつかれさまでした！家にある1品を記録できました。'}catch(e){}}
  queueMicrotask(renderBadges);
 });
 window.addEventListener('toto-data-restored',()=>{milestone.textContent='';renderBadges();clearDrafts()});

 let fromHistory=false,shown=activePage;
 function syncUrl(id,replace){if(fromHistory)return;const url=new URL(location.href);url.searchParams.set('page',id);url.hash='';try{history[replace?'replaceState':'pushState']({...history.state,totonoePage:id,totonoeDepth:replace?(history.state?.totonoeDepth||0):(history.state?.totonoeDepth||0)+1},'',url)}catch(e){}}
 const previousShow=show;
 show=function(id){const result=previousShow.apply(this,arguments);if(activePage===id){if(id!==shown){syncUrl(id,false);shown=id}restoreDrafts();renderBadges();draftStatus.hidden=id==='emergency'}return result};
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
 $(activePage).append(document.querySelector('.page-feedback-footer'));
 const focus=entryUrl.searchParams.get('focus');
 const targets={family:'moreFamilyGroup',settings:'moreSettingsGroup',author:'moreAuthorGroup',achievements:'achievementBadges'};
 if(targets[focus])requestAnimationFrame(()=>{
  const target=$(targets[focus]);
  target.style.scrollMarginTop=(document.querySelector('header').offsetHeight+12)+'px';
  target.scrollIntoView({block:'start'});
 });
 if(entryUrl.searchParams.get('share')==='1'&&!document.querySelector('dialog[open]'))openShare();
 if(entryUrl.searchParams.get('guide')==='1'){tutorialPendingPage=targetPage;tutorialState={...tutorialState,step:0};openTutorial()}else queueMicrotask(startSetup);
})();
