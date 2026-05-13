// sw.js - Service Worker pour SGA v8.0
    // FINAL1 //
const CACHE_NAME = 'sga-v8.0';
const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './style.css',
    './manifest.json',
    './logo.png',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js'
];

self.addEventListener('install', event => {
    console.log('🔧 Service Worker - Installation');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('🚀 Service Worker - Activation');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('🗑️ Ancien cache supprimé:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) return response;
                return fetch(event.request).catch(() => {
                    return new Response('Hors ligne - contenu non disponible', {
                        status: 503,
                        statusText: 'Service Unavailable'
                    });
                });
            })
    );
});
