// sw.js - Service Worker cho RPG Maker AI Translator ULTIMATE v6.0

const CACHE_NAME = 'rpg-translator-ultimate-v6';
const VERSION = '6.0.0';
const CACHE_KEY = `\( {CACHE_NAME}- \){VERSION}`;

const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'style.css',
    'script.js',
    'autotrans.js',
    'manifest.json',
    // Google Fonts
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Inter:wght@300;400;500;600;700&display=swap',
    // Font Awesome
    'https://kit.fontawesome.com/8f2b3d7e9a.js',
    // tsParticles
    'https://cdn.jsdelivr.net/npm/tsparticle@2.12.0/tsparticle.bundle.min.js',
    // Fallback icon
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌟</text></svg>'
];

// INSTALL - Cache tất cả tài nguyên cần thiết
self.addEventListener('install', event => {
    console.log('[SW v6.0] Đang cài đặt...');
    event.waitUntil(
        caches.open(CACHE_KEY)
            .then(cache => {
                console.log('[SW] Đang cache tài nguyên...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
            .catch(err => console.error('[SW] Lỗi cache install:', err))
    );
});

// ACTIVATE - Dọn dẹp cache cũ khi có version mới
self.addEventListener('activate', event => {
    console.log('[SW v6.0] Đang kích hoạt...');
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.map(key => {
                    if (key.startsWith(CACHE_NAME) && key !== CACHE_KEY) {
                        console.log('[SW] Xóa cache cũ:', key);
                        return caches.delete(key);
                    }
                })
            ))
            .then(() => self.clients.claim())
    );
});

// FETCH - Cache First, fallback Network, rồi offline page
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    // Bỏ qua API DeepSeek (không cache)
    if (event.request.url.includes('api.deepseek.com')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Bỏ qua chrome-extension và các scheme lạ
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) {
                    // Có cache → trả ngay + update background
                    event.waitUntil(updateCache(event.request));
                    return cached;
                }

                // Không cache → fetch network
                return fetch(event.request)
                    .then(response => {
                        if (response && response.status === 200) {
                            const clone = response.clone();
                            event.waitUntil(
                                caches.open(CACHE_KEY)
                                    .then(cache => cache.put(event.request, clone))
                            );
                        }
                        return response;
                    })
                    .catch(() => {
                        // Offline → fallback về index.html
                        return caches.match('index.html');
                    });
            })
    );
});

// Update cache nhẹ ở background
async function updateCache(request) {
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            const cache = await caches.open(CACHE_KEY);
            await cache.put(request, response);
        }
    } catch (err) {
        // Silent
    }
}