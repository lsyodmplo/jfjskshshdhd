// sw.js - Service Worker cho RPG Maker AI Translator ULTIMATE v5.0

const CACHE_NAME = 'rpg-translator-ultimate-v5';
const VERSION = '5.0.0';
const STATIC_CACHE = `\( {CACHE_NAME}- \){VERSION}`;

const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'style.css',
    'script.js',
    'autotrans.js',
    'manifest.json',
    // Fonts Google (cache để offline mượt)
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Inter:wght@300;400;500;600;700&display=swap',
    'https://kit.fontawesome.com/8f2b3d7e9a.js',
    // tsParticles
    'https://cdn.jsdelivr.net/npm/tsparticle@2.12.0/tsparticle.bundle.min.js',
    // Fallback icon
    'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌟</text></svg>'
];

// INSTALL - Cache tất cả tài nguyên chính
self.addEventListener('install', event => {
    console.log('[SW v5.0] Đang cài đặt Service Worker...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Đang cache các tài nguyên chính...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('[SW] Cache hoàn tất');
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('[SW] Lỗi cache:', err);
            })
    );
});

// ACTIVATE - Dọn dẹp cache cũ khi update version
self.addEventListener('activate', event => {
    console.log('[SW v5.0] Đang kích hoạt Service Worker mới...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName.startsWith(CACHE_NAME) && cacheName !== STATIC_CACHE) {
                        console.log('[SW] Xóa cache cũ:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => {
            console.log('[SW] Đã claim clients');
            return self.clients.claim();
        })
    );
});

// FETCH - Chiến lược Cache First → Network (với fallback offline)
self.addEventListener('fetch', event => {
    // Chỉ xử lý GET requests
    if (event.request.method !== 'GET') return;

    // Bỏ qua API DeepSeek (không cache key/response)
    if (event.request.url.includes('api.deepseek.com')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Bỏ qua chrome-extension:// và các request không phải http/https
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Nếu có trong cache → trả về ngay (siêu nhanh)
                if (cachedResponse) {
                    // Đồng thời update cache ở background
                    event.waitUntil(updateCacheInBackground(event.request));
                    return cachedResponse;
                }

                // Không có cache → fetch từ network
                return fetch(event.request)
                    .then(networkResponse => {
                        if (!networkResponse || networkResponse.status !== 200 || 
                            networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
                            return networkResponse;
                        }

                        const responseClone = networkResponse.clone();
                        event.waitUntil(
                            caches.open(STATIC_CACHE)
                                .then(cache => cache.put(event.request, responseClone))
                        );
                        return networkResponse;
                    })
                    .catch(() => {
                        // Offline + không có cache → fallback về index.html (SPA behavior)
                        return caches.match('index.html');
                    });
            })
    );
});

// Helper: Update cache nhẹ nhàng ở background
async function updateCacheInBackground(request) {
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            const cache = await caches.open(STATIC_CACHE);
            await cache.put(request, response);
        }
    } catch (err) {
        // Silent fail - không làm phiền user
    }
}

// Optional: Thông báo khi có update mới (nâng cao)
// self.addEventListener('message', event => {
//     if (event.data === 'skipWaiting') {
//         self.skipWaiting();
//     }
// });