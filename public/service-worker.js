/* eslint-disable no-restricted-globals */
const CACHE_NAME = "lead-system-v9-20260301";

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

function toScopedPath(path = "") {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  if (!path) {
    return normalizedBase;
  }

  return `${normalizedBase}${path}`.replace(/([^:]\/)\/+/g, "$1");
}

const urlsToCache = [
  toScopedPath(""),
  toScopedPath("index.html"),
  toScopedPath("manifest.json"),
  toScopedPath("logo.png")
];

// Instalacao do Service Worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Ativacao do Service Worker
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      )
    )
  );
  self.clients.claim();
});

// Estrategia de cache: Network First para API e Cache First para estaticos
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const isApiRequest = request.url.includes("/api/") || request.url.includes("localhost:3000");
  const isNavigationRequest = request.mode === "navigate";
  const isAssetRequest = /\.(js|css|map|json)$/i.test(new URL(request.url).pathname);

  if (isNavigationRequest) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "error") {
            return response;
          }

          const navClone = response.clone();
          const indexClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, navClone);
            cache.put(toScopedPath("index.html"), indexClone);
          });

          return response;
        })
        .catch(() =>
          caches.match(request).then((response) => {
            if (response) {
              return response;
            }

            return caches.match(toScopedPath("index.html")) || new Response("Offline - recurso nao disponivel");
          })
        )
    );
    return;
  }

  if (isApiRequest) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "error") {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return response;
        })
        .catch(() =>
          caches.match(request).then((response) => response || new Response("Offline - recurso nao disponivel"))
        )
    );
    return;
  }

  if (isAssetRequest) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === "error") {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return response;
        })
        .catch(() =>
          caches.match(request).then((response) => response || new Response("Offline - recurso nao disponivel"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === "error") {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => new Response("Offline - recurso nao disponivel"));
    })
  );
});

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

