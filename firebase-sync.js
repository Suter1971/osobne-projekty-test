/* Osobné projekty / v0.6 — Firebase authentication and append-only per-account sync.
   No Google Drive data are deleted or written. Legacy localStorage key is untouched.
   Store each change as one immutable Firestore document to detect divergent offline edits. */
import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore, collection, doc, onSnapshot, setDoc, getDoc, deleteDoc} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {blankData, projectHistory, diffToOps, validOp, same, headsFor} from './sync-core.mjs';

const firebaseConfig = {
  apiKey: 'AIzaSyC44vjVPx8Q-iIIEaOuA_QvVxBGwFY5a7U',
  authDomain: 'inventar-projektov.firebaseapp.com',
  projectId: 'inventar-projektov',
  storageBucket: 'inventar-projektov.firebasestorage.app',
  messagingSenderId: '486989499459',
  appId: '1:486989499459:web:0059c539ee089327ca58f6'
};
const $ = id => document.getElementById(id);
const bridge = window.inventoryBridge;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const uuid = () => crypto.randomUUID();
// Test and production MUST NOT share Firestore collections or local browser data.
const TEST_MODE = true; // TEST iba: samostatné cloudové aj lokálne úložisko.
const NOTIF_PREF_COLLECTION = TEST_MODE ? 'testSettings' : 'settings';
const PUSH_DEVICES_COLLECTION = TEST_MODE ? 'testPushDevices' : 'pushDevices';
const PUBLIC_VAPID_KEY = 'BKB3wrViDITqOHa8nKWkE2aQFTch3j9IBtDKC85CJOoxmFgA7R2Bfx0kkWdpDhdQn-0-gOn9u0FOS47dG4czino';
const CHANGES_COLLECTION = TEST_MODE ? 'testChanges' : 'changes';
const STORAGE_PREFIX = TEST_MODE ? 'inventar-firebase-revisions-test-v1:' : 'inventar-firebase-revisions-v1:';
const DEVICE_KEY = 'inventar-firebase-device-v1';
let deviceId;
try { deviceId = localStorage.getItem(DEVICE_KEY); if (!deviceId) {deviceId=uuid();localStorage.setItem(DEVICE_KEY,deviceId);} }
catch(_) {deviceId=uuid();}
let uid=null, ops={}, pending=new Set(), initialized=false, unsub=null, busy=false;
let lastView=blankData(), conflicts=[], generation=0, onlineSnapshot=false;
let flushing=false, suppress=false, warned=false;
let readyForEdits=false, recoveryBlocked=false;
const backupName = () => `osobne-projekty-konflikt-${new Date().toISOString().slice(0,10)}.json`;
function status(message,bad=false) {
  $('cloud-status').textContent=message;
  $('cloud-status').className=bad?'cloud-status cloud-error':'cloud-status';
}
function accountKey(id) {return STORAGE_PREFIX+id;}
function persist() {
  if(!uid)return;
  try {localStorage.setItem(accountKey(uid),JSON.stringify({ops:Object.values(ops),pending:[...pending],initialized}));}
  catch(e){status('Nepodarilo sa uložiť históriu synchronizácie. Urob Export JSON a uvoľni úložisko.',true); throw e;}
}
function restore(userId) {
  let parsed;
  try {parsed=JSON.parse(localStorage.getItem(accountKey(userId))||'null');}catch(e){throw Error('Lokálnu históriu sa nepodarilo načítať; najskôr ju zálohuj.');}
  ops={};pending=new Set(); initialized=false;
  if (!parsed)return;
  if (!Array.isArray(parsed.ops)||!Array.isArray(parsed.pending))throw Error('Lokálna história má neznámy formát.');
  for(const op of parsed.ops) {if(!validOp(op))throw Error('Neplatná lokálna história.');ops[op.id]=op;}
  pending=new Set(parsed.pending.filter(x=>typeof x==='string'&&ops[x]));
  initialized=Boolean(parsed.initialized);
}
function lockUi(locked) {
  document.body.classList.toggle('auth-locked',!uid);
  document.body.classList.toggle('sync-locked',Boolean(uid&&locked));
  const label=TEST_MODE?'Firebase TEST':'Firebase';
  $('cloud-toolbar').textContent=!uid?'Prihlásiť Google':conflicts.length?label+' ⚠':pending.size?label+' ↻':label+' ✓';
  $('cloud-toolbar').classList.toggle('firebase-toolbar-conflict', Boolean(uid&&conflicts.length));
  $('account-signout').hidden=!uid;
  $('account-label').textContent=auth.currentUser?.email||'';
  $('auth-gate').hidden=Boolean(uid);
}
function updateUi() {
  const blocked=recoveryBlocked||!initialized||conflicts.length>0;
  readyForEdits=Boolean(uid&&!blocked);
  lockUi(blocked);
  if(recoveryBlocked)status('Pozor: lokálna kópia a história zmien sa nezhodujú. Exportuj JSON; nič neprepíšem.',true);
  else if(!uid)status('Najprv sa prihlás cez Google účet.');
  else if(conflicts.length)status(`${conflicts.length} konflikt(ov) medzi zariadeniami. Najprv vyber verziu na zachovanie.`,true);
  else if(!initialized)status('Načítavam inventúru z cloudu. Prvé prihlásenie vyžaduje internet.');
  else if(!navigator.onLine)status('Offline režim: zmeny zostávajú na tomto zariadení.');
  else if(pending.size)status(`Uložené lokálne, čaká na potvrdenie cloudu: ${pending.size} zmien.`);
  else status('Inventúra pripravená. Synchronizácia Firebase je aktívna.');
  $('cloud-sync-now').disabled=!uid||!navigator.onLine;
  showConflicts();
}
function applyRevisions() {
  if(recoveryBlocked){updateUi();return;}
  const merged=projectHistory(ops,lastView);
  conflicts=merged.conflicts;
  if(!same(merged.data,lastView)) {
    suppress=true;
    try {bridge.replace(merged.data);} finally {suppress=false;}
    lastView=structuredClone(merged.data);
  }
  updateUi();
}
function showConflicts() {
  const parent=$('firebase-conflicts');parent.replaceChildren();
  for(const collision of conflicts) {
    const card=document.createElement('section');card.className='firebase-conflict-item';
    const h=document.createElement('strong');h.textContent=`Konflikt: ${collision.kind} / ${collision.heads.find(x=>x.record)?.record.name||collision.entityId}`;card.append(h);
    const help=document.createElement('p');help.className='small';help.textContent='Obe verzie zostali zachované. Vyber, ktorú chceš ponechať. Pred výberom ich môžeš porovnať.';card.append(help);
    for(const head of collision.heads) {
      const details=document.createElement('details');
      const summary=document.createElement('summary');summary.textContent=`Verzia ${head.at||''} · zariadenie ${String(head.device||'').slice(0,8)}${head.record===null?' · zmazaná':''}`;
      const pre=document.createElement('pre');pre.className='firebase-preview';pre.textContent=JSON.stringify(head.record,null,2);
      const choose=document.createElement('button');choose.textContent='Použiť túto verziu';choose.type='button';choose.onclick=()=>resolveCollision(collision,head);
      details.append(summary,pre,choose);card.append(details);
    }
    parent.append(card);
  }
  $('firebase-conflict-help').hidden=!conflicts.length;
}
function resolveCollision(collision,chosen) {
  if(!confirm('Potvrdiť výber tejto verzie? Ostatné verzie zostanú uchované v histórii.'))return;
  const latest=headsFor(ops,collision.kind,collision.entityId);
  const chosenStillExists=latest.some(x=>x.id===chosen.id);
  if(!chosenStillExists) {alert('Medzitým pribudla ďalšia zmena. Skontroluj zoznam konfliktov.');applyRevisions();return;}
  const op={id:uuid(),kind:chosen.kind,entityId:chosen.entityId,parents:latest.map(x=>x.id),record:chosen.record,
    order:chosen.order,device:deviceId,at:new Date().toISOString(),protocol:1};
  ops[op.id]=op;pending.add(op.id);
  try {persist();applyRevisions();flush();}catch(e){alert('Rozhodnutie sa nepodarilo uložiť: '+e.message);}
}
function onInventoryChanged() {
  if(suppress||!uid)return;
  if(!readyForEdits) {status('Údaje ešte nie sú pripravené alebo existuje konflikt. Zmeny sú pozastavené.',true);return;}
  const now=bridge.read();
  let changes;
  try {changes=diffToOps(lastView,now,ops,uuid,deviceId);}catch(e){status(e.message,true);return;}
  if(!changes.length)return;
  const oldOps={...ops},oldPending=new Set(pending);
  for(const op of changes){ops[op.id]=op;pending.add(op.id);}
  try {persist();lastView=structuredClone(now);updateUi();flush();}
  catch(err){ops=oldOps;pending=oldPending;status('Zápis synchronizačnej histórie zlyhal. Exportuj JSON.',true);}
}
async function flush() {
  if(flushing||!uid||!navigator.onLine||!initialized||recoveryBlocked)return;
  const myGeneration=generation, myUid=uid;
  flushing=true;
  try {
    for(const operationId of [...pending]) {
      if(generation!==myGeneration||uid!==myUid||!navigator.onLine)break;
      const op=ops[operationId];
      if(!op){pending.delete(operationId);persist();continue;}
      try {
        await setDoc(doc(db,'users',myUid,CHANGES_COLLECTION,operationId),op);
        if(generation!==myGeneration||uid!==myUid)break;
        pending.delete(operationId);persist();updateUi();
      } catch(e) {status('Cloud synchronizácia zatiaľ neprešla: '+e.message,true);break;}
    }
  } finally {flushing=false;}
}
function subscribe(myGeneration,myUid) {
  // No per-entity document is overwritten. OnSnapshot returns immutable revisions.
  unsub=onSnapshot(collection(db,'users',myUid,CHANGES_COLLECTION), {includeMetadataChanges:true}, snap=>{
    if(myGeneration!==generation||myUid!==uid)return;
    let newRecords=0;
    for(const d of snap.docs) {
      const op=d.data();
      if(d.id!==op.id||!validOp(op)) {status('Cloud obsahuje neznámy záznam. Synchronizácia zastavená.',true);return;}
      if(!ops[op.id]){ops[op.id]=op;newRecords++;}
    }
    if(!snap.metadata.fromCache){initialized=true;onlineSnapshot=true;}
    try {persist();applyRevisions();if(initialized)flush();} catch(e){status('Nepodarilo sa uložiť údaje zo servera. '+e.message,true);}
  },err=>status('Spojenie s databázou nefunguje: '+err.message,true));
}

// v0.7 – Independent settings, never written to immutable revision history.
const cloudDialog=$('cloud-dialog');
const settingsPanel=document.createElement('section');
settingsPanel.innerHTML=`<hr class="divider"><h3>Upozornenia 0.7 (TEST)</h3>
  <label style="display:flex;align-items:center;gap:9px"><input type="checkbox" id="weekly-email-enabled" style="width:18px;height:18px"> Pondelkový e-mailový prehľad</label>
  <p class="cloud-help">Každý pondelok o 09:00. Odosielanie zatiaľ nie je spustené.</p>
  <button id="register-push-device" type="button">Povoliť upozornenia na tomto telefóne</button>
  <button id="unregister-push-device" type="button" hidden>Vypnúť upozornenia na tomto telefóne</button>
  <p id="notifications-status" class="cloud-help" role="status"></p>`;
cloudDialog.insertBefore(settingsPanel,$('cloud-close').parentElement);
const notificationsStatus=()=>$('notifications-status');
function notifyStatus(s){notificationsStatus().textContent=s;}
let notificationUserVersion=0;
let storedPushToken=null;
async function getMessagingSdk(){return import('https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging.js');}
async function loadNotificationSettings(){
 const thisVersion=++notificationUserVersion, current=uid;
 $('weekly-email-enabled').disabled=!current;
 $('register-push-device').disabled=!current;
 if(!current){$('weekly-email-enabled').checked=false;notifyStatus('Prihlás sa do účtu.');return;}
 try{
  const [prefs, device]=await Promise.all([
   getDoc(doc(db,'users',current,NOTIF_PREF_COLLECTION,'notifications')),
   getDoc(doc(db,'users',current,PUSH_DEVICES_COLLECTION,deviceId))]);
  if(thisVersion!==notificationUserVersion||current!==uid)return;
  $('weekly-email-enabled').checked=prefs.data()?.weeklyEmailEnabled===true;
  storedPushToken=device.data()?.token||null;
  $('unregister-push-device').hidden=!storedPushToken;
  notifyStatus(storedPushToken?'Zariadenie registrované (TEST). Odosielanie serverom ešte nie je zapnuté.':'Zariadenie zatiaľ nie je registrované.');
 }catch(e){if(thisVersion===notificationUserVersion)notifyStatus('Načítanie nastavení zlyhalo: '+e.message);}
}
$('weekly-email-enabled').addEventListener('change',async e=>{
 const userId=uid, enabled=e.target.checked; e.target.disabled=true;
 try{
  if(!userId)throw Error('Nie si prihlásený.');
  await setDoc(doc(db,'users',userId,NOTIF_PREF_COLLECTION,'notifications'),{weeklyEmailEnabled:enabled,updatedAt:new Date().toISOString()},{merge:true});
  if(uid===userId)notifyStatus(enabled?'E-mailový prehľad zapnutý (server zatiaľ neposiela).':'E-mailový prehľad vypnutý.');
 }catch(err){if(uid===userId){e.target.checked=!enabled;notifyStatus('Nepodarilo sa uložiť: '+err.message);}}
 finally{e.target.disabled=!uid;}
});
$('register-push-device').addEventListener('click',async e=>{
 const userId=uid;
 if(!userId){notifyStatus('Prihlás sa do účtu.');return;}
 if(!('Notification' in window)||!('serviceWorker' in navigator)||!window.isSecureContext){notifyStatus('Tento prehliadač nepodporuje Web Push.');return;}
 // IMPORTANT: notification permission is requested immediately in a direct user gesture (iOS requirement).
 const permissionPromise=Notification.requestPermission();
 e.target.disabled=true;
 try{
  const permission=await permissionPromise;
  if(permission!=='granted')throw Error('Notifikácie neboli povolené.');
  const sdk=await getMessagingSdk();
  if(!await sdk.isSupported())throw Error('Firebase Messaging nie je v tomto prehliadači dostupné.');
  const reg=await navigator.serviceWorker.ready;
  const token=await sdk.getToken(sdk.getMessaging(app),{vapidKey:PUBLIC_VAPID_KEY,serviceWorkerRegistration:reg});
  if(!token)throw Error('Telefón nevrátil FCM token.');
  if(uid!==userId)throw Error('Medzitým bol zmenený účet.');
  await setDoc(doc(db,'users',userId,PUSH_DEVICES_COLLECTION,deviceId),{token,deviceId,updatedAt:new Date().toISOString(),enabled:true,platform:navigator.userAgent.slice(0,160)});
  storedPushToken=token;
  $('unregister-push-device').hidden=false;
  notifyStatus('Telefón je registrovaný (TEST). Doručovanie spustíme po nasadení servera.');
 }catch(err){notifyStatus('Registrácia: '+err.message);}
 finally{e.target.disabled=!uid;}
});
$('unregister-push-device').addEventListener('click',async e=>{
 const userId=uid;e.target.disabled=true;
 try{
  if(!userId)throw Error('Nie si prihlásený.');
  // Delete server-side mapping first. The push subscription is not enough to authorize delivery.
  await deleteDoc(doc(db,'users',userId,PUSH_DEVICES_COLLECTION,deviceId));
  if(storedPushToken){try{const sdk=await getMessagingSdk();await sdk.deleteToken(sdk.getMessaging(app));}catch(_){/* cloud record has already been removed */}}
  storedPushToken=null;$('unregister-push-device').hidden=true;
  notifyStatus('Upozornenia na tomto telefóne vypnuté.');
 }catch(err){notifyStatus('Vypnutie sa nepodarilo: '+err.message);}
 finally{e.target.disabled=false;}
});

function accountChanged(user) {
  ++generation;
  if(unsub){unsub();unsub=null;}
  uid=null;ops={};pending=new Set();initialized=false;onlineSnapshot=false;
  conflicts=[];lastView=blankData();readyForEdits=false;recoveryBlocked=false;
  if(!user) {bridge.switchAccount(null);updateUi();loadNotificationSettings();return;}
  try {
    restore(user.uid);uid=user.uid;
    // Each user has a completely separate local dataset. Legacy v0.5 key is untouched.
    bridge.switchAccount(uid,TEST_MODE);
    lastView=bridge.read();
    if (!same(lastView,projectHistory(ops,lastView).data)) {
      recoveryBlocked=true;
      alert('Pozor: lokálne údaje sa líšia od uloženej histórie synchronizácie. Údaje ostávajú zachované. Otvor Firebase a urob Export JSON, nič sa neprepíše.');
    }
    applyRevisions();
    subscribe(generation,uid);
    loadNotificationSettings();
    if(initialized)flush();
  } catch(e) {
    uid=null;bridge.switchAccount(null);
    lockUi(true);status(e.message,true);
    alert('Lokálna databáza sa nedá bezpečne načítať. '+e.message);
  }
}
async function login() {
  try {$('auth-login').disabled=true;
    // Open the OAuth popup directly in the user click gesture (required by iOS Safari).
    // Browser Firebase Auth defaults to persistent local sessions; do not await setPersistence here.
    await signInWithPopup(auth,provider);
  } catch(e) {alert('Google prihlásenie nebolo dokončené: '+e.message);}
  finally {$('auth-login').disabled=false;}
}
$('auth-login').onclick=login;
$('account-signout').onclick=async()=>{if(pending.size&&!confirm('Niektoré zmeny čakajú na synchronizáciu. Odhlásiť sa? Zostanú uložené v tomto zariadení.'))return;await signOut(auth);};
$('cloud-toolbar').onclick=()=>{if(!uid)login();else {$('cloud-dialog').showModal();updateUi();}};
$('cloud-close').onclick=()=>$('cloud-dialog').close();
$('cloud-sync-now').onclick=()=>{flush();updateUi();};
window.addEventListener('inventory:changed',onInventoryChanged);
window.addEventListener('online',()=>{updateUi();flush();});
window.addEventListener('offline',updateUi);
window.addEventListener('visibilitychange',()=>{if(!document.hidden){updateUi();flush();}});
window.setInterval(()=>{if(!document.hidden){updateUi();flush();}},30000);
updateUi();
onAuthStateChanged(auth,accountChanged,err=>status('Autentifikácia zlyhala: '+err.message,true));
