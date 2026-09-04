const CACHE = 'xd-appcel-v1';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './assets/img/helmet-icon.png', './assets/video/abertura.mp4'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('fetch', event => event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request))));
