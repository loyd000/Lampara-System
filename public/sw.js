const CACHE_NAME = "app-assets-v2";
const OFFLINE_URL = "/offline.html";
// The SPA shell (any navigated path serves this same document — Vercel
// rewrites every route to it), cached under one fixed key regardless of which
// path was actually requested.
const SHELL_URL = "/";
// Not precached at install time — see the "navigate" branch below for why,
// and how it stays paired with the exact hashed assets it references.
const urlsToCache = [
    OFFLINE_URL,
    // The icon site.webmanifest actually points at — cached so the OS can
    // still resolve the installed app's icon with no connectivity.
    "/icon/app-icon-512.png",
    "/site.webmanifest",
];

// Install event - cache the offline page and icons. The app shell is
// deliberately NOT precached here — see the "navigate" branch below, which
// caches it opportunistically instead, in lockstep with its own assets.
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

    // Navigation requests are network-first. On success, the shell is cached
    // under the fixed SHELL_URL key — always overwritten with whatever was
    // *just* fetched, never a stale build. This is what keeps it safe: the
    // browser requests this document's script/link tags immediately after,
    // within the same successful page load, and the generic same-origin
    // handler below caches those exact content-hashed URLs as a side effect —
    // so the cached shell and the cached assets it references are always
    // captured together, from the same moment, never mixed across deploys.
    //
    // On failure, fall back to that cached shell first (a cold reload/fresh
    // tab while offline still boots the app, with whatever was last loaded
    // successfully — this is what makes the offline Ocular Report queue
    // reachable from a dead start, not just a session that was already open).
    // Only fall back to the static offline page if nothing has ever loaded
    // successfully on this device.
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(SHELL_URL, responseToCache));
                    }
                    return response;
                })
                .catch(() =>
                    caches.match(SHELL_URL).then(
                        (shell) =>
                            shell ??
                            caches
                                .match(OFFLINE_URL)
                                .then((cached) => cached ?? new Response("Offline", { status: 503 })),
                    ),
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
