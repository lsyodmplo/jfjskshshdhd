// sw.js - Service Worker cho RPG Maker AI Translator ULTIMATE v4.0

const CACHE_NAME = 'rpg-translator-ultimate-v4.0';
const VERSION = 'v4.0.0'; // Thay đổi khi cập nhật lớn
const CACHE_KEY = `\( {CACHE_NAME}- \){VERSION}`;

const ASSETS_TO_CACHE = [
    './',
    'index.html',
    'style.css',
    'script.js',
    'autotrans.js',
    'manifest.json',
    // Fonts từ Google (cache để offline)
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Inter:wght@300;400;500;600&display=swap',
    'https://kit.fontawesome.com/8f2b3d7e9a.js',
    // tsParticles CDN
    'https://cdn.jsdelivr.net/npm/tsparticle@2.12.0/tsparticle.bundle.min.js',
    // Fallback icon nếu chưa có icon thực tế
    'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌟</text></svg>'
];

// INSTALL - Cache tất cả tài nguyên cần thiết
self.addEventListener('install', event => {
    console.log('[SW] Installing Service Worker...');
    event.waitUntil(
        caches.open(CACHE_KEY)
            .then(cache => {
                console.log('[SW] Caching app shell');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('[SW] Cache completed');
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('[SW] Cache failed:', err);
            })
    );
});

// ACTIVATE - Dọn dẹp cache cũ khi có version mới
self.addEventListener('activate', event => {
    console.log('[SW] Activating new Service Worker...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_KEY && cacheName.startsWith(CACHE_NAME)) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => {
            console.log('[SW] Claiming clients');
            return self.clients.claim();
        })
    );
});

// FETCH - Chiến lược Cache First, then Network (với fallback offline)
self.addEventListener('fetch', event => {
    // Chỉ xử lý các request GET và cùng origin (tránh lỗi CORS với API)
    if (event.request.method !== 'GET') return;
    
    // Bỏ qua các request đến DeepSeek API (không cache key hay response)
    if (event.request.url.includes('api.deepseek.com')) {
        return fetch(event.request);
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Nếu có trong cache → trả về ngay (nhanh)
                if (cachedResponse) {
                    // Đồng thời update cache ở background nếu cần
                    event.waitUntil(updateCache(event.request));
                    return cachedResponse;
                }

                // Nếu không có → fetch từ network
                return fetch(event.request)
                    .then(networkResponse => {
                        // Cache response mới (nếu hợp lệ)
                        if (networkResponse && networkResponse.status === 200) {
                            const responseToCache = networkResponse.clone();
                            event.waitUntil(
                                caches.open(CACHE_KEY)
                                    .then(cache => cache.put(event.request, responseToCache))
                            );
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Nếu offline và không có cache → fallback page (tùy chọn sau này)
                        return caches.match('index.html');
                    });
            })
    );
});

// Helper: Update cache trong background
async function updateCache(request) {
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            const cache = await caches.open(CACHE_KEY);
            await cache.put(request, response);
        }
    } catch (err) {
        // Silent fail - không ảnh hưởng user
    }
}

// Optional: Hỗ trợ thông báo khi có update (nâng cao)
// self.addEventListener('message', event => {
//     if (event.data === 'skipWaiting') {
//         self.skipWaiting();
//     }
// });