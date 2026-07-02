/*
 * [Trial P3] HustlyTasker push-only service worker.
 *
 * Deliberately handles ONLY `push` + `notificationclick`. It does NOT intercept
 * `fetch` and does NOT cache anything, so it cannot affect navigation, data, or
 * the rest of the app — it exists purely to display web-push notifications.
 */

self.addEventListener('install', () => {
    // Activate immediately so a freshly-registered SW can receive pushes.
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
    let data = {}
    try { data = event.data ? event.data.json() : {} } catch (_e) { data = {} }

    const title = data.title || 'HustlyTasker'
    const options = {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: data.tag || undefined,
        data: { url: data.url || '/' },
    }
    event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = (event.notification.data && event.notification.data.url) || '/'
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus an existing tab if one is already open; else open a new one.
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus()
                    if ('navigate' in client && url !== '/') { try { client.navigate(url) } catch (_e) {} }
                    return
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(url)
        })
    )
})
