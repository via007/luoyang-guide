/* ==========================================================================
   sw.js —— 离线缓存
   策略：
   · 同源 app shell：network-first（联网时优先展示最新行程，离线时回缓存）
   · 第三方 CDN（supabase-js）：network-first，失败回缓存
   · 其余（Supabase API 的 POST 等）：完全不拦截

   ⚠️ 每次部署改了 css/js，把 VERSION 号 +1，否则手机会一直用旧缓存。
   ========================================================================== */
var VERSION = "v10";
var CACHE = "shendu-" + VERSION;

var SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/data.js",
  "./js/sync.js",
  "./js/app.js",
  "./art/luoyang-tang.jpg",
  "./art/yingtian-tang.jpg",
  "./art/kaifeng-song.jpg",
  "./art/luoyi-night.jpg",
  "./art/qingming-garden.jpg",
  "./art/wansui-martial.jpg",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

var CDN_HOSTS = ["cdn.jsdelivr.net"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* 单个资源失败不阻断整体安装 */
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;

  /* 只处理 GET；Supabase 的写请求等一律放行 */
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  var sameOrigin = url.origin === self.location.origin;
  var isCdn = CDN_HOSTS.indexOf(url.hostname) !== -1;
  if (!sameOrigin && !isCdn) return;   /* Supabase API 等：交给网络 */

  if (isCdn) {
    /* CDN：network-first，离线时回缓存 */
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req);
      })
    );
    return;
  }

  /* 同源：联网时优先读最新内容，离线时用缓存 */
  e.respondWith(
    fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return caches.match(req).then(function (cached) { return cached || caches.match("./index.html"); }); })
  );
});
