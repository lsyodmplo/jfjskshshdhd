// RPG Maker AI Translator Pro - Service Worker v3.0.0

const CACHE_NAME = 'rpg-translator-v3.0.0';
const STATIC_CACHE = 'rpg-translator-static-v3.0.0';

// Files to cache for offline functionality
const STATIC_FILES = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/autotrans.js',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('Service Worker: Caching static files');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                console.log('Service Worker: Static files cached');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Cache failed', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
                            console.log('Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip API calls (let them fail gracefully)
    if (url.hostname === 'api.deepseek.com') {
        return;
    }
    
    // Handle static files
    if (STATIC_FILES.some(file => request.url.includes(file.replace('/', '')))) {
        event.respondWith(
            caches.match(request)
                .then((response) => {
                    if (response) {
                        return response;
                    }
                    
                    return fetch(request)
                        .then((response) => {
                            // Don't cache if not successful
                            if (!response || response.status !== 200 || response.type !== 'basic') {
                                return response;
                            }
                            
                            // Clone response for cache
                            const responseToCache = response.clone();
                            
                            caches.open(STATIC_CACHE)
                                .then((cache) => {
                                    cache.put(request, responseToCache);
                                });
                            
                            return response;
                        });
                })
                .catch(() => {
                    // Return offline page for navigation requests
                    if (request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                })
        );
    }
    
    // Handle other requests with network-first strategy
    else {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Don't cache API responses or non-successful responses
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(request, responseToCache);
                        });
                    
                    return response;
                })
                .catch(() => {
                    // Try to serve from cache
                    return caches.match(request);
                })
        );
    }
});

// Background sync for offline translation queue
self.addEventListener('sync', (event) => {
    if (event.tag === 'translation-queue') {
        event.waitUntil(processTranslationQueue());
    }
});

// Handle translation queue when back online
async function processTranslationQueue() {
    try {
        // Get queued translations from IndexedDB
        const queue = await getTranslationQueue();
        
        if (queue.length > 0) {
            console.log('Service Worker: Processing translation queue', queue.length);
            
            // Notify main app about queue processing
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'QUEUE_PROCESSING',
                    count: queue.length
                });
            });
        }
    } catch (error) {
        console.error('Service Worker: Queue processing failed', error);
    }
}

// Mock function for translation queue (would use IndexedDB in real implementation)
async function getTranslationQueue() {
    // In a real implementation, this would read from IndexedDB
    return [];
}

// Handle push notifications (for future features)
self.addEventListener('push', (event) => {
    if (event.data) {
        const data = event.data.json();
        
        const options = {
            body: data.body,
            icon: '/icon-192.png',
            badge: '/badge-72.png',
            vibrate: [100, 50, 100],
            data: data.data,
            actions: [
                {
                    action: 'open',
                    title: 'Mở ứng dụng',
                    icon: '/icon-open.png'
                },
                {
                    action: 'close',
                    title: 'Đóng',
                    icon: '/icon-close.png'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Handle messages from main app
self.addEventListener('message', (event) => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'CACHE_TRANSLATION':
            // Cache translation results for offline access
            cacheTranslationResult(data);
            break;
            
        case 'GET_CACHE_SIZE':
            getCacheSize().then(size => {
                event.ports[0].postMessage({ size });
            });
            break;
            
        default:
            console.log('Service Worker: Unknown message type', type);
    }
});

// Cache translation results
async function cacheTranslationResult(data) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' }
        });
        await cache.put(`/translation/${data.id}`, response);
        console.log('Service Worker: Translation result cached', data.id);
    } catch (error) {
        console.error('Service Worker: Failed to cache translation', error);
    }
}

// Get total cache size
async function getCacheSize() {
    try {
        const cacheNames = await caches.keys();
        let totalSize = 0;
        
        for (const cacheName of cacheNames) {
            const cache = await caches.open(cacheName);
            const requests = await cache.keys();
            
            for (const request of requests) {
                const response = await cache.match(request);
                if (response) {
                    const blob = await response.blob();
                    totalSize += blob.size;
                }
            }
        }
        
        return totalSize;
    } catch (error) {
        console.error('Service Worker: Failed to calculate cache size', error);
        return 0;
    }
}

// Periodic cleanup
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'cache-cleanup') {
        event.waitUntil(cleanupOldCache());
    }
});

// Clean up old cache entries
async function cleanupOldCache() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const requests = await cache.keys();
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        
        for (const request of requests) {
            const response = await cache.match(request);
            if (response) {
                const dateHeader = response.headers.get('date');
                if (dateHeader) {
                    const responseDate = new Date(dateHeader).getTime();
                    if (now - responseDate > maxAge) {
                        await cache.delete(request);
                        console.log('Service Worker: Cleaned up old cache entry', request.url);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Service Worker: Cache cleanup failed', error);
    }
}

console.log('Service Worker: Loaded v3.0.0');