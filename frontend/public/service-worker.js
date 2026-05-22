/* eslint-disable no-restricted-globals */
const IS_LOCAL_DEV =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname === "::1";

if (IS_LOCAL_DEV) {
  self.addEventListener("install", (event) => {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      Promise.all([
        self.registration.unregister(),
        caches.keys().then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter((cacheName) => cacheName.startsWith("lead-system-"))
              .map((cacheName) => caches.delete(cacheName))
          )
        ),
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) =>
          Promise.all(clients.map((client) => client.navigate(client.url)))
        )
      ])
    );
  });
} else {
const SHELL_CACHE_NAME = "lead-system-shell-v23-20260521";
const RUNTIME_CACHE_NAME = "lead-system-runtime-v16-20260521";

function getBasePath() {
  try {
    if (self.registration && self.registration.scope) {
      return new URL(self.registration.scope).pathname;
    }
  } catch (error) {
    console.error("Erro ao resolver base path do Service Worker:", error);
  }

  return "/";
}

const basePath = getBasePath();
const shellCacheKey = toScopedPath("__app_shell__");

function toScopedPath(path = "") {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  if (!path) {
    return normalizedBase;
  }

  return `${normalizedBase}${path}`.replace(/([^:]\/)\/+/g, "$1");
}

function shouldHandleNavigation(request) {
  if (request.mode !== "navigate") return false;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return false;
  return true;
}

function shouldCacheRuntime(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  // Uploads (user-generated content like product images, logos, covers) must
  // always go to the network so freshly uploaded media is visible immediately.
  // Otherwise the previous version persists in cache and the catalog appears
  // stale to customers right after a brand updates an image.
  if (url.pathname.startsWith("/uploads/")) return false;
  if (url.pathname.startsWith("/pwa/")) return false;
  if (url.pathname.startsWith("/assets/")) return true;
  return ["script", "style", "font", "manifest", "worker"].includes(request.destination);
}

// Instalacao do Service Worker
self.addEventListener("install", (event) => {
  event.waitUntil(Promise.resolve());
  self.skipWaiting();
});

// Ativacao do Service Worker
//
// PWA stability note (Bug-5 fix): we KEEP old runtime caches alive even when
// the shell cache name bumps. Reason: Vite generates hashed chunk filenames
// like AdminDashboard-{hash}.js. When a tab is open with an old bundle and we
// purge the old runtime cache, that tab's React.lazy() calls fail with 404 →
// blank screen. The frontend has a ChunkLoadError handler that triggers a
// reload, but we also keep up to 2 runtime caches around so the transition
// is smooth even before the reload fires.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        /* Keep only the active shell + active runtime + the SINGLE most recent old runtime.
         * Older shells get cleaned, but old runtime caches can serve hash-stamped chunks
         * for already-open tabs while they're still alive. */
        const shellCaches = cacheNames.filter((n) => n.startsWith("lead-system-shell-") && n !== SHELL_CACHE_NAME);
        const runtimeCaches = cacheNames
          .filter((n) => n.startsWith("lead-system-runtime-") && n !== RUNTIME_CACHE_NAME)
          .sort()
          .reverse(); // most recent old first
        /* Delete: all old shells (we always have shellCacheKey as the latest) + runtime older than the most recent old */
        const toDelete = [...shellCaches, ...runtimeCaches.slice(1)];
        return Promise.all(toDelete.map((cacheName) => caches.delete(cacheName)));
      }),
      self.registration.navigationPreload
        ? self.registration.navigationPreload.enable().catch(() => Promise.resolve())
        : Promise.resolve(),
    ])
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (shouldHandleNavigation(request)) {
    event.respondWith(handleNavigationRequest(event));
    return;
  }

  if (shouldCacheRuntime(request)) {
    event.respondWith(handleRuntimeRequest(request));
  }
});

async function handleNavigationRequest(event) {
  const { request } = event;

  try {
    const preloadResponse = await event.preloadResponse;
    const networkResponse = preloadResponse || (await fetch(request));

    if (networkResponse && networkResponse.ok) {
      const shellCache = await caches.open(SHELL_CACHE_NAME);
      await shellCache.put(shellCacheKey, networkResponse.clone());
      await shellCache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (_error) {
    // Fall through to cache recovery.
  }

  const shellCache = await caches.open(SHELL_CACHE_NAME);
  const exactMatch = await shellCache.match(request);
  if (exactMatch) return exactMatch;

  const cachedShell = await shellCache.match(shellCacheKey);
  if (cachedShell) return cachedShell;

  return new Response("Offline - recurso nao disponivel", { status: 503 });
}

async function handleRuntimeRequest(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
  const cached = await runtimeCache.match(request);

  if (cached) {
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          runtimeCache.put(request, response.clone());
        }
      })
      .catch(() => Promise.resolve());
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      runtimeCache.put(request, response.clone());
    }
    return response;
  } catch (_error) {
    return new Response("Offline - recurso nao disponivel", { status: 503 });
  }
}

// Suporte para notificacoes push
self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const options = {
    body: data.body || "Nova notificacao",
    icon: toScopedPath("logo.png"),
    badge: toScopedPath("logo.png"),
    tag: data.tag || "lead-system",
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [
      { action: "open", title: "Abrir" },
      { action: "close", title: "Fechar" }
    ],
    data: data.data || {}
  };

  event.waitUntil(self.registration.showNotification(data.title || "Lead System", options));
});

// Tratamento de cliques em notificacoes
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl = event.notification?.data?.url || toScopedPath("");
  const urlToOpen = new URL(rawUrl, self.location.origin).toString();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i += 1) {
        const client = clientList[i];
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }

      return Promise.resolve();
    })
  );
});

// Tratamento do fechamento de notificacoes
self.addEventListener("notificationclose", (event) => {
  console.log("Notificacao fechada:", event.notification.tag);
});

// Background sync para sincronizar dados offline
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-messages") {
    event.waitUntil(syncOfflineMessages());
  }
});

async function syncOfflineMessages() {
  try {
    const db = await openIndexedDB();
    const unsentMessages = await getUnsentMessages(db);

    for (const message of unsentMessages) {
      try {
        await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message)
        });

        await markMessageAsSent(db, message.id);
      } catch (error) {
        console.error("Erro ao sincronizar mensagem:", error);
      }
    }
  } catch (error) {
    console.error("Erro na sincronizacao:", error);
  }
}

async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("LeadSystemDB", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function getUnsentMessages(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["unsentMessages"], "readonly");
    const store = transaction.objectStore("unsentMessages");
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function markMessageAsSent(db, messageId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["unsentMessages"], "readwrite");
    const store = transaction.objectStore("unsentMessages");
    const request = store.delete(messageId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(null);
  });
}
}
