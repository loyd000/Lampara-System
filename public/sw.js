const CACHE_NAME = "app-assets-v1";
const OFFLINE_URL = "/offline.html";
// Never precache "/" (the app shell). Its HTML embeds Vite-hashed asset URLs
// that change on every publish, so a cached shell points at dead chunks.
const urlsToCache = [
    OFFLINE_URL,
    // The icon site.webmanifest actually points at — cached so the OS can
    // still resolve the installed app's icon with no connectivity.
    "/lampara-icon-white.png",
    "/site.webmanifest",
];

// Install event - cache the offline page and icons (never the app shell).
// allSettled so one missing asset does not abort the whole install.
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => Promise.allSettled(urlsToCache.map((url) => cache.add(url))))
            .then(() => self.skipWaiting()),
    );
});

// Fetch event - network first, fall back to cache
self.addEventListener("fetch", (event) => {
    // Only handle GET requests - POST/PUT/DELETE cannot be cached
    if (event.request.method !== "GET") {
        return;
    }

    // Never intercept cross-origin requests. External CDNs and third parties already set their own HTTP cache headers
    let url;
    try {
        url = new URL(event.request.url);
    } catch {
        return;
    }
    if (url.origin !== self.location.origin) {
        return;
    }

    // Never intercept auth paths.
    if (url.pathname.startsWith("/auth")) {
        return;
    }

    // Navigation requests are network-only. On failure, fall back to the
    // dedicated offline page, NEVER the cached app shell — a stale "/" references
    // dead Vite chunk hashes after a publish and white-screens the app.
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request).catch(() =>
                caches
                    .match(OFFLINE_URL)
                    .then((cached) => cached ?? new Response("Offline", { status: 503 })),
            ),
        );
        return;
    }

    // Network-first for other same-origin GET requests
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Only cache successful responses (status 200-299)
                if (!response.ok) {
                    return response;
                }
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                return response;
            })
            .catch(() => caches.match(event.request)),
    );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    }),
                );
            })
            .then(() => self.clients.claim()),
    );
});

// There were `push` and `notificationclick` handlers here. Nothing ever
// subscribed — no `pushManager.subscribe()` call exists anywhere in the app —
// so they could not fire, while looking for all the world like web push was a
// working feature. Notifications are email, sent by the `notify` edge function.
//
// If push is wanted later it needs: a subscription registered at sign-in, VAPID
// keys, a table of subscriptions per user, and a sender. Handlers alone are not
// half of that feature; they are none of it.
