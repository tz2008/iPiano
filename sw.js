// sw.js — Service Worker：缓存核心资源，支持 iPad 添加到主屏幕后离线使用
'use strict';
var CACHE = 'music-tutor-v2'; // v2：新增 js/glyphs.js，改缓存名强制老用户更新
var ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/core.js',
  './js/courses.js',
  './js/songs.js',
  './js/library.js',
  './js/audio.js',
  './js/pitch.js',
  './js/midi.js',
  './js/follow.js',
  './js/stats.js',
  './js/recorder.js',
  './js/profiles.js',
  './js/backup.js',
  './js/weekly.js',
  './js/challenge.js',
  './js/sight.js',
  './js/glyphs.js',
  './js/staff.js',
  './js/gamify.js',
  './js/practice.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(ASSETS);
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        // 缓存同源资源
        if (res.ok && e.request.url.indexOf(self.location.origin) === 0) {
          var clone = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
        }
        return res;
      });
    }).catch(function () {
      return caches.match('./index.html');
    })
  );
});
