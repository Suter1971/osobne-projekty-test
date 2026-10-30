/* Osobné projekty — offline prevádzka; používateľské údaje sú v localStorage, nie v cache. */
const PREFIX = 'osobne-projekty-firebase-test-pwa-';
const CACHE = PREFIX + 'v07-test-notifications-stage2';
const FIREBASE_MODULES = [
  'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging.js'
];
const FILES = [
  './', './index.html', './firebase-sync.js', './sync-core.mjs', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './apple-touch-icon.png', './favicon.ico', './favicon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await cache.addAll(FILES);
    // Nonessential cross-origin pre-cache; fail open if offline while updating.
    await Promise.allSettled(FIREBASE_MODULES.map(x=>cache.add(x)));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(names => Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const firebaseModule = url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/13.1.0/');
  if (!firebaseModule && (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname))) return;

  // Navigations: latest version online, cached app when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put('./index.html', copy)));
        }
        return response;
      }).catch(async () => (await caches.match('./index.html')) || Response.error())
    );
    return;
  }

  // Static PWA files: cached for offline operation.
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
      }
      return response;
    }))
  );
});

// Firebase Cloud Messaging background message handling (only after server setup).
importScripts('https://www.gstatic.com/firebasejs/13.1.0/firebase-app-compat.js',
              'https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js');
firebase.initializeApp({
 apiKey:'AIzaSyC44vjVPx8Q-iIIEaOuA_QvVxBGwFY5a7U',
 authDomain:'inventar-projektov.firebaseapp.com',
 projectId:'inventar-projektov',
 messagingSenderId:'486989499459',
 appId:'1:486989499459:web:0059c539ee089327ca58f6'
});
const messaging=firebase.messaging();
messaging.onBackgroundMessage(payload=>{
 // Server will send data-only payloads so the SW owns the notification exactly once.
 const data=payload.data||{};
 if(!data.title)return;
 self.registration.showNotification(data.title,{
  body:data.body||'',icon:'./icon-192.png',tag:data.tag||undefined,
  data:{url:new URL('./',self.registration.scope).href}
 });
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  for(const client of clients){if(client.url.startsWith(self.registration.scope)){await client.focus();return;}}
  await self.clients.openWindow(self.registration.scope);
 }));
});
