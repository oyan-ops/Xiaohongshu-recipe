// 最小化 service worker:仅供 PWA 安装识别,不拦截任何请求。
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
