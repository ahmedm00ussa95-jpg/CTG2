// ============================================================
// CTG SERVICE WORKER v3
// ============================================================
const CACHE = 'ctg-v3';

const CORE = ['./', './index.html'];

const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async cache => {
      await cache.addAll(CORE).catch(err => console.warn('Core cache fail:', err));
      for (const url of CDN) {
        try {
          const res = await fetch(url, { mode: 'cors' });
          if (res.ok) await cache.put(url, res);
        } catch(e) { console.warn('CDN cache fail:', url); }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Firebase Realtime DB — لا نتدخل أبداً (اتركه للمتصفح)
  if (url.hostname.includes('firebaseio.com')) return;

  // Firebase SDK على gstatic — أوف لاين: نرجع خطأ فوري بدل الانتظار
  if (url.hostname.includes('gstatic.com') || url.hostname.includes('firebasestorage')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'application/javascript' }
      }))
    );
    return;
  }

  // googleapis firebase — نفس المعالجة
  if (url.hostname.includes('googleapis.com')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'application/javascript' }
      }))
    );
    return;
  }

  // Google Fonts — Cache First
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(() => new Response('', {headers:{'Content-Type':'text/css'}}));
      })
    );
    return;
  }

  // CDN — Cache First
  if (url.hostname.includes('cdnjs.cloudflare.com')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        }).catch(() => new Response('', {headers:{'Content-Type':'application/javascript'}}));
      })
    );
    return;
  }

  // HTML (الملف الرئيسي) — Cache First أوف لاين، Network First أون لاين
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request)
            .then(cached => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // باقي الطلبات
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
