// ============================================================
// CTG SERVICE WORKER - نظام العمل بدون إنترنت
// ============================================================
const CACHE_NAME = 'ctg-cache-v1';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 أيام

// الملفات الأساسية التي تُحفظ دائماً
const CORE_ASSETS = [
  './',
  './index.html'
];

// المكتبات الخارجية التي تُحفظ في الكاش
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// ============================================================
// INSTALL - تثبيت وحفظ الملفات الأساسية
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // حفظ الملفات الأساسية (index.html)
      await cache.addAll(CORE_ASSETS).catch(e => {
        console.warn('SW: core assets cache failed:', e);
      });
      // حفظ مكتبات CDN واحدة واحدة (عشان لو واحدة فشلت ما تأثرش على الباقي)
      for (const url of CDN_ASSETS) {
        try {
          const response = await fetch(url, { mode: 'cors' });
          if (response.ok) await cache.put(url, response);
        } catch (e) {
          console.warn('SW: CDN cache failed for:', url);
        }
      }
      console.log('✅ SW: تم حفظ الملفات الأساسية');
    }).catch(e => console.warn('SW install error:', e))
  );
  self.skipWaiting();
});

// ============================================================
// ACTIVATE - تنظيف الكاش القديم
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => {
      console.log('✅ SW: تم تفعيل Service Worker');
      return self.clients.claim();
    })
  );
});

// ============================================================
// FETCH - اعتراض الطلبات
// استراتيجية: Network First مع Fallback على Cache
// ============================================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // تجاهل Firebase requests (تتعامل معها IDB في الكود الرئيسي)
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') && url.pathname.includes('firebase') ||
    url.hostname.includes('gstatic.com')
  ) {
    return; // اتركها تفشل بشكل طبيعي لو أوف لاين، IDB هتتكفل
  }

  // للـ HTML الرئيسي: Network First ثم Cache
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // حفظ نسخة جديدة في الكاش
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // أوف لاين: رجّع النسخة المحفوظة
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            return caches.match('./index.html'); // fallback
          });
        })
    );
    return;
  }

  // للمكتبات والـ CSS والـ JS: Cache First ثم Network
  if (
    event.request.url.includes('cdnjs.cloudflare.com') ||
    event.request.url.includes('fonts.googleapis.com') ||
    event.request.url.includes('fonts.gstatic.com') ||
    event.request.url.includes('font-awesome')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        // مش في الكاش، حاول من النت وخزّن
        return fetch(event.request, { mode: 'cors' }).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // فشل كل حاجة
          return new Response('/* offline */', { headers: { 'Content-Type': 'text/css' } });
        });
      })
    );
    return;
  }

  // باقي الطلبات: Network First
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ============================================================
// MESSAGE - استقبال رسائل من الصفحة الرئيسية
// ============================================================
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
