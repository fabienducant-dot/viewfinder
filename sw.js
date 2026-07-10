/* Service Worker SDZ App — met en cache l'appli pour un fonctionnement hors-ligne.
   Toutes les données (bibliothèque, connaissances, historique) restent dans localStorage
   sur l'appareil : ce cache ne concerne que les fichiers de l'application elle-même.

   IMPORTANT : le document principal (index.html) est toujours vérifié sur le réseau EN PREMIER,
   pour qu'une mise à jour déployée sur Netlify soit visible immédiatement à la prochaine ouverture,
   au lieu de rester bloqué sur une version mise en cache. Seuls les fichiers statiques qui ne
   changent presque jamais (icônes) utilisent une stratégie cache-d'abord. */

const CACHE_NAME = "viewfinder-cache-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/favicon-32.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const isAppDocument = event.request.mode === "navigate" || event.request.url.endsWith("/index.html") || event.request.url.endsWith("/");

  if (isAppDocument) {
    // Réseau d'abord : garantit qu'une nouvelle version déployée est vue tout de suite.
    // Le cache ne sert que si le téléphone est hors-ligne.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Fichiers statiques (icônes, manifest) : cache d'abord, réseau en secours.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
