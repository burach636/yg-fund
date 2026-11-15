// YG Fund – minimal service worker so the browser offers "Install app" / pin to the taskbar.
// It caches nothing: every request goes to the network as usual (data must always be fresh).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* network as usual */ });
