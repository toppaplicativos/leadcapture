/* eslint-disable no-restricted-globals */
const SHELL_CACHE_NAME = "lead-system-shell-v98-20260709";
const RUNTIME_CACHE_NAME = "lead-system-runtime-v90-20260709";

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
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            const isLeadSystemCache =
              cacheName.startsWith("lead-system-v") ||
              cacheName.startsWith("lead-system-shell-") ||
              cacheName.startsWith("lead-system-runtime-");

            if (!isLeadSystemCache) return Promise.resolve();
            if (cacheName === SHELL_CACHE_NAME || cacheName === RUNTIME_CACHE_NAME) {
              return Promise.resolve();
            }
            return caches.delete(cacheName);
          })
        )
      ),
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

  let data = {};
  try {
    data = event.data.json();
  } catch (_err) {
    data = { title: "LeadCapture", body: event.data.text() };
  }

  const meta = data.data || {};
  const priority = meta.priority || "normal";
  const hasSound = !!meta.sound;

  const options = {
    body: data.body || "Nova notificacao",
    icon: toScopedPath("logo.png"),
    badge: toScopedPath("logo.png"),
    tag: data.tag || "lead-system",
    requireInteraction: data.requireInteraction || priority === "critical",
    silent: !hasSound,
    vibrate: meta.vibrate || (priority === "critical" ? [300, 100, 300] : undefined),
    actions: data.actions || [
      { action: "open", title: "Abrir" },
      { action: "close", title: "Fechar" }
    ],
    data: meta
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "LeadCapture", options),
      trackPushInteraction({
        interaction: "displayed",
        notification_id: meta.notification_id,
        event_key: meta.event,
        url: meta.url,
      }),
    ])
  );
});

function trackPushInteraction(payload) {
  return fetch("/api/push/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => Promise.resolve());
}

// Tratamento de cliques em notificacoes
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const meta = event.notification?.data || {};
  const rawUrl = meta.url || toScopedPath("");
  const urlToOpen = new URL(rawUrl, self.location.origin).toString();

  event.waitUntil(
    Promise.all([
      trackPushInteraction({
        interaction: "clicked",
        notification_id: meta.notification_id,
        event_key: meta.event,
        url: rawUrl,
      }),
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
    }),
    ]),
  );
});

// Tratamento do fechamento de notificacoes
self.addEventListener("notificationclose", (event) => {
  const meta = event.notification?.data || {};
  event.waitUntil(
    trackPushInteraction({
      interaction: "dismissed",
      notification_id: meta.notification_id,
      event_key: meta.event,
    })
  );
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

