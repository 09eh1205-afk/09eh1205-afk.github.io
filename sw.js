/* 3분할 차트 — 홈 화면 앱 설치용 최소 서비스워커.
   캐시를 쓰지 않고 항상 네트워크에서 받아오므로 차트/시세가 오래된 값으로 남지 않습니다. */
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  var url;
  try { url = new URL(event.request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;      // 외부 시세/차트 요청은 그대로 통과
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});
