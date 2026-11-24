/* Everyday use, record protection and workshop information. */
(function () {
 'use strict';
 const preferenceKey = 'toto-experience-v1';
 const allowedPages = ['home','learn','tidy','supplies','more','emergency','homeSafety','evacuation','pouch','goBag','training','family','weather','readiness','seasonalCheck','outage','minimalistGuide','examStudy','moving','tidyAlbum'];
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
  if(storageKey!==preferenceKey){lastSavedAt=new Date().toLocaleString('ja-JP');lastFailure='';saveMessage('この端末への保存を確認しました。');}
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
 const toolbar=element('div',undefined,'experience-toolbar');
 const favoriteToggle=button('お気に入りに追加',toggleFavorite);favoriteToggle.id='favoritePageToggle';
 const feedback=button('感想・不具合を送る',openFeedback);feedback.id='pageFeedback';toolbar.append(favoriteToggle,feedback);document.querySelector('header').append(toolbar);
 const favoritesCard=card('favoritePages','お気に入り');const moreShortcuts=$('more').querySelector('.refresh-menu-grid');if(moreShortcuts)moreShortcuts.after(favoritesCard);else $('more').append(favoritesCard);
 const homeFavorites=card('homeFavorites','お気に入り');
 const homeMission=document.querySelector('#home .refresh-home-mission');
 if(homeMission)homeMission.before(homeFavorites);else $('home').append(homeFavorites);
 function pageTitle(page) {return pageNames[page]||page}
 function renderFavorites() {
  [favoritesCard,homeFavorites].forEach(host=>{
   host.replaceChildren(element('h2','お気に入り'));host.hidden=!preferences.favorites.length&&host===homeFavorites;
   if(!preferences.favorites.length)host.append(element('p','使いたいページで「お気に入りに追加」を押してください。最大8件登録できます。','notice'));
   const row=element('div',undefined,'experience-favorites');
   preferences.favorites.forEach(page=>{
    const item=element('div',undefined,'experience-favorite-item');
    const open=button(pageTitle(page),()=>show(page));open.classList.add('experience-favorite-open');
    const remove=button('お気に入り解除',()=>removeFavorite(page));remove.classList.add('experience-favorite-remove');remove.setAttribute('aria-label',pageTitle(page)+'のお気に入り解除');
    item.append(open,remove);row.append(item);
   });host.append(row);
  });
  favoriteToggle.disabled=!allowedPages.includes(activePage);
  favoriteToggle.textContent=preferences.favorites.includes(activePage)?'お気に入りから外す':'お気に入りに追加';favoriteToggle.setAttribute('aria-pressed',String(preferences.favorites.includes(activePage)));
 }
 function removeFavorite(page) {
  loadPreferences();
  if(savePreferences({...preferences,favorites:preferences.favorites.filter(saved=>saved!==page)}))saveMessage('「'+pageTitle(page)+'」のお気に入りを解除しました。');
 }
 function toggleFavorite() {
  loadPreferences();const favorites=preferences.favorites.slice();const index=favorites.indexOf(activePage);
  if(index>=0)favorites.splice(index,1);else if(favorites.length<8)favorites.push(activePage);else{saveMessage('お気に入りは8件までです。「その他」からページを開いて外してください。');return}
  if(savePreferences({...preferences,favorites}))saveMessage(index>=0?'お気に入りから外しました。':'お気に入りに追加しました。');
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
 function feedbackBody() {return 'ととのえ防災 ご意見・不具合\nページ：'+pageTitle(feedbackPage)+'\nバージョン：v231\n\n'+feedbackText.value}
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
 show=function(page){const result=originalShow.apply(this,arguments);renderFavorites();renderReminders();if(activePage==='supplies'){renderSupplyTools();renderOptionalSetup()}return result};
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
