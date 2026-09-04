const CACHE = 'xd-appcel-v49';
const ASSETS = ['./', './index.html', './styles.css?v=20260901-100528', './app.js?v=20260901-100528', './manifest.webmanifest?v=20260827-025600', './assets/img/helmet-icon.png'];

self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('xd-appcel-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));

// MEDIDO NO IPHONE EM 2026-09-01: com o catalogo offline baixado, o Cache
// Storage tem ~25.700 entradas. Em arranque frio, o Safari leva ~30s so para
// abrir o armazenamento - o service worker acordava em 2ms e a resposta so
// saia aos 29.500ms. Por isso NADA aqui pode esperar o cache: disparamos cache
// e rede juntos e usamos quem responder primeiro. Com internet, a rede ganha e
// o app abre na hora; sem internet, o cache responde, mesmo que demore.
const NUNCA = () => new Promise(() => {});

// So o SHELL entra neste cache. O catalogo (data/, images/, thumbs/, fonts/,
// vendor/) tem cache proprio, gerenciado pela pagina do catalogo; guardar aqui
// tambem duplicaria centenas de MB no aparelho.
function guardavel(request) {
  if (request.method !== 'GET') return false;
  const p = new URL(request.url).pathname;
  const escopo = new URL(self.registration.scope).pathname;
  if (!p.startsWith(escopo)) return false;
  if (p.indexOf('/catalogo-xd/') !== -1) return false;
  return true;
}

function daRede(request) {
  return fetch(request).then(response => {
    if (response && response.status === 200 && guardavel(request)) {
      const copia = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copia)).catch(() => {});
    }
    return response;
  }).catch(() => null);
}

function doCache(request) {
  return caches.open(CACHE).then(cache => cache.match(request)).catch(() => null);
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const t0 = Date.now();
    const medidas = { cacheMs: -1, redeMs: -1 };
    const rede = daRede(event.request).then(r => { medidas.redeMs = Date.now() - t0; return r; });
    const cache = doCache(event.request).then(r => { medidas.cacheMs = Date.now() - t0; return r; });
    if (event.request.mode === 'navigate') {
      event.waitUntil(Promise.allSettled([rede, cache]).then(async () => {
        const cs = await self.clients.matchAll({ includeUncontrolled: true });
        cs.forEach(cl => cl.postMessage({ tipo: 'diag-sw', cacheMs: medidas.cacheMs, redeMs: medidas.redeMs }));
      }));
    }
    // corrida: cada lado so entra se tiver resposta de verdade
    const vencedor = await Promise.race([
      cache.then(r => r || NUNCA()),
      rede.then(r => r || NUNCA()),
      new Promise(resolve => setTimeout(() => resolve(null), 15000))
    ]);
    if (vencedor) return vencedor;
    const tardio = (await rede) || (await cache);
    if (tardio) return tardio;
    if (event.request.mode === 'navigate') {
      const abrigo = await doCache(new Request('./index.html', { headers: event.request.headers }));
      if (abrigo) return abrigo;
    }
    return new Response('', { status: 504, statusText: 'sem resposta' });
  })());
});
