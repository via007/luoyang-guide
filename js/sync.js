/* ==========================================================================
   sync.js —— 双人实时同步（Supabase）+ 本机 localStorage 降级
   --------------------------------------------------------------------------
   设计要点：
   · 没填凭据 / 断网 / 请求失败 → 一律退回 localStorage，页面功能完全不受影响
   · checklist 与 route 分列存储，互不覆盖
   · Realtime 订阅 postgres_changes，两台手机改动秒级互见
   · 写入做防抖，避免连续勾选打爆请求
   · 注：路线改版成「真实地图」后，路线不再可编辑，route 列暂时闲置
     （保留列与订阅是为了不动线上表结构；将来若加「自定义标记」可直接复用）

   用法：
     await Sync.init();                       // 拉取远端状态
     Sync.get('checklist')                    // 读
     Sync.set('checklist', obj)               // 写（自动落 localStorage + 推远端）
     Sync.on('checklist', fn)                 // 远端有更新时回调
   ========================================================================== */
window.Sync = (function () {
  "use strict";

  /* ---- 配置：填上你的 Supabase 项目信息即可开启同步（见 SUPABASE_SETUP.md） ---- */
  var SUPABASE_URL = "https://gmtslmqczbsjmwohbivd.supabase.co";       // 形如 https://abcdefgh.supabase.co
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtdHNsbXFjemJzam13b2hiaXZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3ODAzMjEsImV4cCI6MjEwNTM1NjMyMX0.tAaOX__gVK4NPtlfX2AQ6WvunA-oh-cAj_zQYbYgDLg"; // Settings → API → anon public
  var TRIP_ID = "luoyang-2026-10";              // 两人约定同一个 id 即共享同一份数据

  var CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
  var COLUMNS = ["checklist", "route"];
  var LS_PREFIX = "ly_";
  var SAVE_DEBOUNCE = 600;

  var client = null;
  var status = "local";            // local | live | error
  var listeners = {};              // { checklist: [fn], route: [fn] }
  var cache = {};                  // 本机镜像，读写都先过这里
  var timers = {};                 // 每个字段的写入防抖
  var statusListeners = [];
  var applyingRemote = false;      // 防止远端回灌触发再次写回

  /* ---------------- 本机存储 ---------------- */
  function lsKey(col) { return LS_PREFIX + col + "_v1"; }

  function lsGet(col) {
    try {
      var raw = localStorage.getItem(lsKey(col));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function lsSet(col, val) {
    try { localStorage.setItem(lsKey(col), JSON.stringify(val)); } catch (e) {}
  }

  /* 一次性迁移：把旧版散落的 key 收进新的命名空间 */
  function migrateLegacy() {
    try {
      /* 旧清单：ly5_b1 / ly5_p1 … 值为 "1" / "0" */
      if (!lsGet("checklist")) {
        var legacyCheck = {};
        var moved = false;
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf("ly5_") === 0) {
            legacyCheck[k.slice(4)] = localStorage.getItem(k) === "1";
            moved = true;
          }
        }
        if (moved) lsSet("checklist", legacyCheck);
      }

      /* 旧路线：ly_route_v2（{nodes,edges}）→ 新 key ly_route_v1 */
      if (!lsGet("route")) {
        var legacyRoute = null;
        try { legacyRoute = JSON.parse(localStorage.getItem("ly_route_v2") || "null"); } catch (e) {}
        if (legacyRoute && legacyRoute.nodes) lsSet("route", legacyRoute);
      }
    } catch (e) {}
  }

  /* ---------------- 状态广播 ---------------- */
  function setStatus(s) {
    if (status === s) return;
    status = s;
    statusListeners.forEach(function (fn) { try { fn(s); } catch (e) {} });
  }

  function emit(col) {
    (listeners[col] || []).forEach(function (fn) {
      try { fn(cache[col]); } catch (e) { console.error(e); }
    });
  }

  /* ---------------- 远端读写 ---------------- */
  function loadSdk() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve();
      var s = document.createElement("script");
      s.src = CDN;
      s.async = true;
      s.onload = function () {
        window.supabase && window.supabase.createClient
          ? resolve()
          : reject(new Error("supabase-js 加载后未暴露 createClient"));
      };
      s.onerror = function () { reject(new Error("supabase-js CDN 加载失败")); };
      document.head.appendChild(s);
    });
  }

  function isConfigured() {
    return /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(SUPABASE_URL) &&
           typeof SUPABASE_ANON_KEY === "string" &&
           SUPABASE_ANON_KEY.length > 40 &&
           SUPABASE_ANON_KEY.indexOf("YOUR_") !== 0;
  }

  /* 拉远端一行；没有就按本机现状建行 */
  function pullRow() {
    return client.from("trips").select("*").eq("id", TRIP_ID).maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data) return res.data;
        var seed = {};
        COLUMNS.forEach(function (col) { seed[col] = cache[col] || {}; });
        seed.id = TRIP_ID;
        return client.from("trips").insert(seed).select().maybeSingle()
          .then(function (ins) {
            if (ins.error) throw ins.error;
            return ins.data;
          });
      });
  }

  function applyRow(row) {
    if (!row) return;
    applyingRemote = true;
    COLUMNS.forEach(function (col) {
      if (row[col] !== undefined && row[col] !== null) {
        cache[col] = row[col];
        lsSet(col, row[col]);
      }
    });
    applyingRemote = false;
  }

  function subscribeRealtime() {
    client.channel("trip-" + TRIP_ID)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "trips", filter: "id=eq." + TRIP_ID },
        function (payload) {
          if (!payload || !payload.new) return;
          applyRow(payload.new);
          COLUMNS.forEach(function (col) { emit(col); });
        })
      .subscribe(function (s) {
        setStatus(s === "SUBSCRIBED" ? "live" : status);
      });
  }

  function push(col) {
    if (!client || applyingRemote) return;
    var payload = { id: TRIP_ID, updated_at: new Date().toISOString() };
    payload[col] = cache[col];
    client.from("trips").upsert(payload).then(function (res) {
      if (res.error) {
        console.warn("同步写入失败，已保留本机副本：", res.error.message);
        setStatus("error");
      } else {
        setStatus("live");
      }
    });
  }

  /* ---------------- 对外 API ---------------- */
  var api = {
    /* 初始化：无论成功失败都 resolve，页面照常渲染 */
    init: function () {
      migrateLegacy();
      COLUMNS.forEach(function (col) {
        if (cache[col] === undefined) cache[col] = lsGet(col) || {};
      });

      if (!isConfigured()) return Promise.resolve("local");

      return loadSdk()
        .then(function () {
          client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: false }
          });
          return pullRow();
        })
        .then(function (row) {
          applyRow(row);
          subscribeRealtime();
          setStatus("live");
          /* 首次拉到远端后广播一次，让已注册的视图用远端状态重画 */
          COLUMNS.forEach(function (col) { emit(col); });
          return "live";
        })
        .catch(function (err) {
          console.warn("同步不可用，已切回本机保存：", err && err.message);
          client = null;
          setStatus("error");
          return "error";
        });
    },

    get: function (col) { return cache[col] || {}; },

    set: function (col, val) {
      cache[col] = val;
      lsSet(col, val);
      clearTimeout(timers[col]);
      timers[col] = setTimeout(function () { push(col); }, SAVE_DEBOUNCE);
    },

    /* 远端更新回调；返回取消订阅函数 */
    on: function (col, fn) {
      (listeners[col] = listeners[col] || []).push(fn);
      return function () {
        listeners[col] = (listeners[col] || []).filter(function (f) { return f !== fn; });
      };
    },

    onStatus: function (fn) {
      statusListeners.push(fn);
      fn(status);
    },

    status: function () { return status; },
    isConfigured: isConfigured
  };

  return api;
})();
