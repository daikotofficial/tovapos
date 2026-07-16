const CACHE_NAME = 'tovapos-shell-v5';
const APP_SHELL = [
  '/',
  '/sign-up-login',
  '/dashboard',
  '/sales',
  '/inventory-management',
  '/sync-logs',
  '/support',
  '/site.webmanifest',
  '/assets/brand/tovapos-mark.svg',
  '/assets/brand/tovapos-logo.svg',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const isAuthenticationPage =
    url.pathname === '/sign-up-login' ||
    url.pathname === '/forgot-password' ||
    url.pathname === '/reset-password' ||
    url.pathname === '/verify-email' ||
    url.pathname === '/resend-verification';
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    isAuthenticationPage ||
    url.searchParams.has('token')
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return (await caches.match('/')) || Response.error();
        return Response.error();
      })
  );
});
