// Service Worker for THREAD PWA
const CACHE_NAME = 'thread-v1'
const OFFLINE_URL = '/offline.html'

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/manifest.json'
      ])
    })
  )
  self.skipWaiting()
})

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

// Fetch event
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  // Skip API requests
  if (event.request.url.includes('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone)
          })
        }
        return response
      })
      .catch(() => {
        // Try cache first
        return caches.match(event.request).then((cached) => {
          return cached || caches.match(OFFLINE_URL)
        })
      })
  )
})

// Push notification event
self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()
  
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [100, 50, 100],
    data: data.data || {},
    actions: data.actions || [],
    tag: data.tag || 'thread-notification',
    renotify: true
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'THREAD', options)
  )
})

// Notification click event
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const action = event.action
  const data = event.notification.data || {}

  // Handle actions
  if (action === 'open' || !action) {
    event.waitUntil(
      clients.openWindow(data.url || '/')
    )
  } else if (action === 'worn') {
    // Mark outfit as worn via API
    event.waitUntil(
      fetch(`/api/v1/outfits/${data.outfit_id}/worn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).then(() => clients.openWindow('/'))
    )
  } else if (action === 'loved') {
    event.waitUntil(
      fetch(`/api/v1/outfits/${data.outfit_id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: 1 })
      }).then(() => clients.openWindow('/'))
    )
  } else if (action === 'meh') {
    event.waitUntil(
      fetch(`/api/v1/outfits/${data.outfit_id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: -1 })
      }).then(() => clients.openWindow('/'))
    )
  }
})

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-feedback') {
    event.waitUntil(syncFeedback())
  }
})

async function syncFeedback() {
  // Get queued feedback from IndexedDB and sync
  // This is a placeholder - would need actual implementation
  console.log('Background sync triggered')
}
