// sw.js - Service Worker pour SGA v8.0
const CACHE_NAME = 'sga-v1';
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
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) return response;
                return fetch(event.request).catch(() => {
                    // Si hors ligne et ressource non trouvée, retourne une page d'erreur
                    return new Response('Hors ligne - contenu non disponible', {
                        status: 503,
                        statusText: 'Service Unavailable'
                    });
                });
            })
    );
});