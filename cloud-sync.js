/* Inventár projektov — synchronizácia Google Drive appDataFolder (v0.5)
   OAuth Client ID je verejný identifikátor, nie heslo. Access token držíme iba v pamäti.
   Spoločné údaje majú vždy jedného vlastníka: používateľa prihláseného cez Google.
*/
(() => {
  'use strict';
  const CLIENT_ID = '486989499459-he3gv12aak7tv37bn7q7381c9vvjek47.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILENAME = 'inventar-projektov.json';
  const BASE_KEY = 'inventar-projektov-drive-base-v1';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const el = id => document.getElementById(id);
  const bridge = window.inventoryBridge;
  if (!bridge) return;

  let token = null, expiresAt = 0, tokenClient = null;
  let fileId = null, busy = false, dirtyDuringSync = false, scheduled = null;
  let cloudPreview = null, cloudRevision = null;
  let blocked = false;

  const readLocal = () => bridge.read();
  const serialized = obj => JSON.stringify(obj);
  const empty = obj => !obj.categories.length && !obj.projects.length && !obj.tasks.length;
  const valid = x => x && x.version === 1 && ['categories','projects','tasks'].every(k => Array.isArray(x[k]));
  const base = () => localStorage.getItem(BASE_KEY);
  const setBase = s => localStorage.setItem(BASE_KEY, s);
  const disconnected = () => !token || Date.now() >= expiresAt;
  function notice(text, tone = 'normal') {
    el('cloud-status').textContent = text;
    el('cloud-status').className = 'cloud-status ' + (tone === 'error' ? 'cloud-error' : tone === 'success' ? 'cloud-ok' : '');
  }
  function showConflict(show, local, remote) {
    el('cloud-conflict').hidden = !show;
    if (show) {
      const c = d => `${d.projects.length} projektov / ${d.tasks.length} úloh`;
      el('cloud-conflict-info').textContent = `Toto zariadenie: ${c(local)}. Google Disk: ${c(remote)}. Zvoľ, ktoré údaje chceš zachovať, alebo najprv exportuj zálohy.`;
    }
  }
  function modal() {
    if (!el('cloud-dialog').open) el('cloud-dialog').showModal();
  }
  function updateButtons() {
    el('cloud-connect').textContent = disconnected() ? 'Pripojiť Google Disk' : 'Pripojené ku Google Disku';
    el('cloud-connect').disabled = !disconnected();
    el('cloud-sync-now').disabled = disconnected() || busy;
    el('cloud-sync-now').textContent = busy ? 'Synchronizujem…' : 'Synchronizovať teraz';
    el('cloud-toolbar').textContent = disconnected() ? 'Google Disk' : blocked ? 'Google Disk ⚠' : 'Google Disk ✓';
  }
  async function request(url, options = {}) {
    if (disconnected()) throw Error('Pripojenie ku Google Disku vypršalo. Pripoj sa znovu.');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', 'Bearer ' + token);
    const response = await fetch(url, { ...options, headers, cache: 'no-store' });
    if (!response.ok) {
      let message = '';
      try { const e = await response.json(); message = e.error?.message || ''; } catch (_) {}
      if (response.status === 401) { expiresAt = 0; updateButtons(); }
      throw Error(`Google Disk: HTTP ${response.status}${message ? ' – ' + message : ''}`);
    }
    return response;
  }
  async function findFile() {
    const q = encodeURIComponent(`name = '${FILENAME}' and trashed = false`);
    const url = `${API}?spaces=appDataFolder&q=${q}&fields=${encodeURIComponent('nextPageToken,files(id,name,modifiedTime)')}&pageSize=100`;
    const result = await (await request(url)).json();
    if (result.nextPageToken) throw Error('Na Disku je priveľa záznamov; synchronizácia sa z bezpečnostných dôvodov zastavila.');
    const files = result.files || [];
    if (files.length > 1) throw Error('Na Google Disku existuje viacero súborov inventára. Synchronizácia sa zastavila, aby sa nič neprepísalo.');
    return files[0] || null;
  }
  async function download(id) {
    const x = await (await request(`${API}/${encodeURIComponent(id)}?alt=media`)).json();
    if (!valid(x)) throw Error('Údaje na Google Disku nemajú očakávaný formát. Nič som nezmenil.');
    return x;
  }
  async function create(data) {
    const boundary = 'inventar_' + (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2))).replaceAll('-', '');
    const metadata = JSON.stringify({ name:FILENAME, parents:['appDataFolder'], mimeType:'application/json' });
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${serialized(data)}\r\n--${boundary}--`;
    const response = await request(`${UPLOAD}?uploadType=multipart&fields=id,modifiedTime`, {
      method:'POST', headers:{ 'Content-Type':`multipart/related; boundary=${boundary}` }, body
    });
    return response.json();
  }
  async function upload(id, data) {
    const response = await request(`${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=id,modifiedTime`, {
      method:'PATCH', headers:{'Content-Type':'application/json; charset=UTF-8'}, body:serialized(data)
    });
    return response.json();
  }
  function makeDownload(data, filename) {
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  function stamp() { return new Date().toISOString().replaceAll(':','-').slice(0,19); }
  function pull(x) {
    const str = serialized(x);
    bridge.replace(x);
    setBase(str); // Uložené až po úspešnom zápise do lokálneho úložiska.
    showConflict(false);
    notice('Údaje z Google Disku boli načítané.', 'success');
  }
  async function performSync() {
    if (disconnected()) { notice('Najprv pripoj Google účet.', 'error'); return; }
    if (busy) { dirtyDuringSync = true; return; }
    busy = true; updateButtons();
    try {
      if (!navigator.onLine) { notice('Bez internetu. Zmeny zostávajú uložené lokálne.'); return; }
      const remoteMeta = await findFile();
      const local = readLocal(), localStr = serialized(local), previous = base();
      if (!remoteMeta) {
        // Cloud is empty. On the first device, create the file from local data.
        const result = await create(local);
        fileId = result.id;
        cloudRevision = result.modifiedTime || null;
        setBase(localStr);
        blocked = false; cloudPreview = null;
        showConflict(false);
        notice('Inventár bol prvýkrát uložený na Google Disk.', 'success');
        return;
      }
      fileId = remoteMeta.id;
      const remote = await download(fileId), remoteStr = serialized(remote);
      cloudRevision = remoteMeta.modifiedTime;
      if (serialized(readLocal()) !== localStr) throw Error('Lokálne údaje sa počas synchronizácie zmenili. Zopakuj synchronizáciu.');
      if (localStr === remoteStr) {
        setBase(remoteStr); blocked = false; cloudPreview = null; showConflict(false);
        notice('Zariadenie a Google Disk sú synchronizované.', 'success');
      } else if ((previous !== null && localStr === previous) || (previous === null && empty(local))) {
        pull(remote); blocked = false; cloudPreview = null;
      } else if ((previous !== null && remoteStr === previous) || (previous === null && empty(remote))) {
        // Recheck immediately before overwriting. This isn't an atomic lock, but prevents accidental stale edits.
        const meta2 = await findFile();
        if (!meta2 || meta2.id !== fileId || meta2.modifiedTime !== cloudRevision) {
          throw Error('Cloud sa medzitým zmenil. Zopakuj synchronizáciu.');
        }
        const latestRemote = await download(fileId);
        if (serialized(latestRemote) !== remoteStr || serialized(readLocal()) !== localStr) {
          throw Error('Údaje sa počas synchronizácie zmenili. Zopakuj synchronizáciu.');
        }
        const saved = await upload(fileId, local);
        cloudRevision = saved.modifiedTime;
        setBase(localStr); blocked = false; cloudPreview = null; showConflict(false);
        notice('Tvoje zmeny boli uložené na Google Disk.', 'success');
      } else {
        blocked = true; cloudPreview = remote;
        showConflict(true, local, remote);
        notice('Konflikt: na tomto zariadení aj na Disku sú odlišné zmeny. Nič som neprepísal.', 'error');
        modal();
      }
    } catch (error) {
      notice(error.message || 'Synchronizácia sa nepodarila.', 'error');
      if (error.message?.includes('vypršalo') || error.message?.includes('HTTP 401')) modal();
    } finally {
      busy = false; updateButtons();
      if (dirtyDuringSync) {
        dirtyDuringSync = false;
        if (!blocked && !disconnected()) scheduleSync();
      }
    }
  }
  function scheduleSync() {
    clearTimeout(scheduled);
    if (disconnected() || blocked) return;
    scheduled = setTimeout(performSync, 1800);
  }
  function connect() {
    if (!window.google?.accounts?.oauth2) {
      notice('Načítanie Google prihlasovania zlyhalo. Skontroluj internet a obnov stránku.', 'error');
      return;
    }
    if (!tokenClient) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id:CLIENT_ID,
        scope:SCOPE,
        callback: response => {
          if (response.error || !response.access_token) {
            notice('Google prihlásenie nebolo dokončené: '+(response.error_description||response.error||''), 'error'); return;
          }
          token=response.access_token;
          expiresAt=Date.now()+Math.max(60,(Number(response.expires_in)||3600)-120)*1000;
          blocked=false; updateButtons();
          notice('Google Disk pripojený. Kontrolujem zmeny…');
          performSync();
        },
        error_callback: err => notice('Nepodarilo sa otvoriť prihlásenie Google. Skontroluj povolenie vyskakovacích okien: '+(err?.type||''), 'error')
      });
    }
    tokenClient.requestAccessToken({prompt:'select_account'});
  }
  async function confirmPull() {
    if (!cloudPreview || busy) return;
    if (!confirm('NAČÍTAŤ Z DISKU? Lokálne údaje v tomto prehliadači sa nahradia. Najprv sa stiahne ich záložná kópia. Pokračovať?')) return;
    busy=true; updateButtons();
    try {
      const meta=await findFile();
      if (!meta || meta.id!==fileId || meta.modifiedTime!==cloudRevision) throw Error('Disk sa zmenil. Zopakuj synchronizáciu.');
      const latest=await download(fileId);
      if (serialized(latest)!==serialized(cloudPreview)) throw Error('Disk sa medzitým zmenil. Zopakuj synchronizáciu.');
      makeDownload(readLocal(),`inventar-lokalna-zaloha-${stamp()}.json`);
      pull(latest); blocked=false; cloudPreview=null;
    } catch(err) { notice(err.message,'error'); }
    finally {busy=false;updateButtons();}
  }
  async function confirmPush() {
    if (!cloudPreview || !fileId || busy) return;
    if (!confirm('PREPÍSAŤ GOOGLE DISK? Údaje na Disku sa nahradia obsahom tohto zariadenia. Predtým sa stiahne záloha dát z Disku. Pokračovať?')) return;
    makeDownload(cloudPreview,`inventar-cloud-zaloha-${stamp()}.json`);
    // Don't trust a stale cloud preview; rescan and demand identical data before updating.
    busy=true; updateButtons();
    try {
      const meta=await findFile();
      if (!meta || meta.id!==fileId || meta.modifiedTime!==cloudRevision) throw Error('Disk sa zmenil. Najprv opätovne načítaj údaje a rozhodni sa znova.');
      const current=await download(fileId);
      if (serialized(current)!==serialized(cloudPreview)) throw Error('Disk sa medzitým zmenil. Synchronizáciu zopakuj.');
      const local=readLocal(), result=await upload(fileId,local);
      cloudRevision=result.modifiedTime;
      setBase(serialized(local)); blocked=false; cloudPreview=null;
      showConflict(false);
      notice('Lokálne údaje boli uložené na Google Disk.', 'success');
    } catch(err) { notice(err.message,'error'); }
    finally {busy=false;updateButtons();}
  }
  el('cloud-toolbar').addEventListener('click', () => { modal(); updateButtons(); });
  el('cloud-close').addEventListener('click', () => el('cloud-dialog').close());
  el('cloud-connect').addEventListener('click', connect);
  el('cloud-sync-now').addEventListener('click', performSync);
  el('cloud-use-drive').addEventListener('click', confirmPull);
  el('cloud-use-local').addEventListener('click', confirmPush);
  el('cloud-download-remote').addEventListener('click', () => {if(cloudPreview)makeDownload(cloudPreview,`inventar-cloud-zaloha-${stamp()}.json`);});
  window.addEventListener('inventory:changed',scheduleSync);
  window.addEventListener('online',scheduleSync);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) scheduleSync(); });
  window.setInterval(() => { if(!document.hidden && !disconnected()) scheduleSync(); else updateButtons(); },60000);
  updateButtons();
  notice('Zatiaľ nepripojené. Projekty zostávajú bezpečne uložené v tomto zariadení.');
})();
