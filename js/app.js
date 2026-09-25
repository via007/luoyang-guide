/* ==========================================================================
   app.js —— 渲染 + 交互
   所有内容来自 window.TRIP_DATA（js/data.js），状态读写走 window.Sync
   ========================================================================== */
(function () {
  "use strict";

  var D = window.TRIP_DATA;
  var $ = function (id) { return document.getElementById(id); };

  function setHtml(id, html) {
    var n = $(id); if (!n) return;
    n.innerHTML = html;
    /* 页面只保留时间、路线和预约信息；旧资料中的金额不展示。 */
    var walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT), node;
    while ((node = walker.nextNode())) {
      node.nodeValue = node.nodeValue
        .replace(/[约≈]?[¥￥]\s*\d+(?:[.～~\-]\d+)?(?:\s*[×x]\s*\d+)?/g, "")
        .replace(/(?:人均|每人|起步价|门市价|票价)\s*\d+(?:[.～~\-]\d+)?(?:\s*元)?/g, "")
        .replace(/\d+(?:[.～~\-]\d+)?\s*元(?:\s*[/／]\s*人)?(?:起)?/g, "")
        .replace(/\b\d+\s*[×x]\s*\d+\b(?=\s*[·，。；]|\s*$)/g, "")
        .replace(/免费/g, "")
        .replace(/（\s*[·、，；]\s*/g, "（")
        .replace(/（\s*）/g, "")
        .replace(/\s+[·、，；]\s*(?=[·、，；])/g, " ");
    }
  }

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* tab 切到某个页面时的回调（地图容器藏在隐藏 tab 里时尺寸为 0，必须等显示后再初始化） */
  var tabHooks = {};
  function onTabShow(id, fn) { (tabHooks[id] = tabHooks[id] || []).push(fn); }
  function fireTabShow(id) {
    (tabHooks[id] || []).forEach(function (fn) {
      try { fn(); } catch (e) { console.error(e); }
    });
  }

  /* 高德 URI：统一由关键词拼，避免每处重复写编码 */
  function amapUri(kw) {
    return "https://uri.amap.com/search?keyword=" + encodeURIComponent(kw) + "&city=" + encodeURIComponent(/开封|清明上河园|万岁山|大相国寺|包公祠/.test(kw) ? "开封" : "洛阳") + "&callnative=1";
  }

  function btnHtml(b) {
    var href = b.amap ? amapUri(b.kw) : b.href;
    var cls = "btn" + (b.amap ? " amap" : "");
    var ext = b.amap ? "" : ' target="_blank" rel="noopener"';
    return '<a class="' + cls + '" href="' + href + '"' + ext + ">" + b.t + "</a>";
  }

  function tagsHtml(tags) {
    return (tags || []).filter(function (t) { return !/[¥￥元]|人均|免费|票价|价位/.test(t.t); }).map(function (t) {
      return '<span class="tag ' + (t.cls || "") + '">' + t.t + "</span>";
    }).join("");
  }

  /* ======================================================================
     总览
     ====================================================================== */
  function renderHero() {
    var m = D.meta;
    setHtml("heroTitle", m.title);
    setHtml("heroSub", m.sub);
  }

  function ticketHtml(t) {
    return '<article class="ticket-card"><div class="ticket-top"><span class="ticket-who">' + escHtml(t.who) +
      '</span><strong>' + escHtml(t.no) + '</strong></div><div class="ticket-line"><div><b>' + escHtml(t.dep) +
      '</b><small>' + escHtml(t.from) + '</small></div><span class="ticket-arrow">→</span><div><b>' + escHtml(t.arr) +
      '</b><small>' + escHtml(t.to) + '</small></div></div><p>' + escHtml(t.note) + '</p></article>';
  }

  /* 景区/美食横跨洛阳、开封两座城市，按城市插一条小标题 */
  function byCity(list, cardFn) {
    var out = "", cur = "";
    (list || []).forEach(function (it) {
      if (it.city && it.city !== cur) {
        cur = it.city;
        out += '<div class="sec">' + escHtml(cur) + "</div>";
      }
      out += cardFn(it);
    });
    return out;
  }

  function renderHome() {
    var now = Date.now();
    var next = D.tickets.find(function (t) { return new Date('2026-10-' + t.day.split('/')[1].padStart(2, '0') + 'T' + t.dep + ':00+08:00').getTime() > now; }) || D.tickets[D.tickets.length - 1];
    setHtml("nextMove", '<div class="focus-kicker">下一段车程 <span>' + next.day + '</span></div><div class="focus-main"><strong>' + next.dep +
      '</strong><div><b>' + escHtml(next.no) + ' · ' + escHtml(next.who) + '</b><span>' + escHtml(next.from) + ' → ' + escHtml(next.to) +
      '</span></div></div><div class="focus-foot">' + escHtml(next.note) + '</div>');

    setHtml("weather", D.weather.map(function (w) {
      return '<div class="wcell"><div class="d">' + w.d + '</div><div class="ic">' + w.icon + "</div><div>" + w.desc + '</div><div class="t">' + w.t + "</div></div>";
    }).join(""));
    setHtml("weatherBtns", D.weatherBtns.map(btnHtml).join(""));

    setHtml("overview", D.overviewRows.map(function (r) {
      return '<div class="overview-row"><span>' + r.d + '</span><small>周' + r.dow + '</small><b>' + r.plan + '</b></div>';
    }).join(""));

    setHtml("bookingTimeline", D.bookingTimeline.map(function (b, i) {
      return '<div class="booking-row"><span>' + b.when + '</span><div>' + b.text + '</div></div>';
    }).join(""));
  }

  /* 住宿：与景区卡同一套折叠卡样式（details/summary 的样式是通用的） */
  function renderStays() {
    setHtml("stays", (D.stays || []).map(function (s) {
      return "<details" + (s.open ? " open" : "") + ">" +
        '<summary><span class="ttl"><span class="no">' + s.no + "</span>" + s.name + tagsHtml(s.tags) +
        '</span><span class="arrow">▶</span></summary>' +
        '<div class="detail-body">' +
          s.kvs.filter(function (kv) { return !/^(门票|票价|价格|费用|优惠)$/.test(kv.k); }).map(function (kv) {
            return '<div class="kv"><div class="k">' + kv.k + '</div><div class="v">' + kv.v + "</div></div>";
          }).join("") +
          (s.btns ? '<div class="btnrow">' + s.btns.map(btnHtml).join("") + "</div>" : "") +
        "</div></details>";
    }).join(""));
  }

  /* ======================================================================
     行程
     ====================================================================== */
  function slotHtml(s) {
    return '<div class="tl"><div class="time">' + s.time + '</div><div class="what">' + s.what + "</div>" +
      (s.note ? '<details class="slot-note"><summary>查看提示</summary><div class="note">' + s.note + "</div></details>" : "") + "</div>";
  }

  /* 一段交通：从哪到哪、多远、怎么走、要不要一键导航 */
  function legHtml(l) {
    return '<div class="leg">' +
      '<div class="ab">' + l.from + " → " + l.to + '<span class="km">' + l.km + "</span></div>" +
      '<div class="how">' + l.how + "</div>" +
      (l.btns ? '<div class="btnrow">' + l.btns.map(btnHtml).join("") + "</div>" : "") +
      "</div>";
  }

  /* 行程卡 = 今天去哪（时间轴）+ 今晚住哪 + 今天怎么走 + 预计花费
     路线页只剩两张地图，交通段落跟着当天走，用的时候不用来回切 tab */
  function renderPlan() {
    var dayOfMonth = new Date().getMonth() === 9 ? new Date().getDate() : 1;
    var selected = Math.max(0, Math.min(5, dayOfMonth - 1));
    $("p-plan").classList.toggle("song-era", selected >= 3);
    setHtml("dayPills", D.days.map(function (d, i) {
      return '<button class="daypill' + (i === selected ? " on" : "") + '" data-d="' + d.id + '" type="button">' + d.pill + "</button>";
    }).join(""));

    var stayByNo = {};
    (D.stays || []).forEach(function (s) { stayByNo[s.no] = s; });

    setHtml("dayList", D.days.map(function (d) {
      var out = d.slots && d.slots.length
        ? '<div class="timeline">' + d.slots.map(slotHtml).join("") + "</div>"
        : "";

      var s = stayByNo[d.stayNo];
      if (s) {
        out += '<div class="dsec"><div class="dsec-h">今晚住</div>' +
          '<div class="dstay"><span class="no">' + s.no + "</span>" + escHtml(s.name) + tagsHtml(s.tags) + "</div></div>";
      }

      if (d.legs && d.legs.length) {
        out += '<details class="day-extra"><summary>今天怎么走 <span class="arrow">＋</span></summary><div class="detail-body">' + d.legs.map(legHtml).join("") + "</div></details>";
      }

      var song = D.days.indexOf(d) >= 3;
      return '<div class="daycard' + (song ? ' song' : ' tang') + (D.days.indexOf(d) === selected ? ' active' : '') + '" id="' + d.id + '">' +
        '<div class="dayhead"><span class="day-era">' + (song ? '大宋 · 东京汴梁' : '大唐 · 神都洛阳') + '</span><span class="dnum">' + d.numCn + '</span><span class="dttl">' + d.date + " · " + d.dow +
        '</span><span class="dsub">' + d.sub + "</span></div>" +
        '<div class="card">' + out + "</div></div>";
    }).join(""));

    /* 一次只显示一天，减少长页面滚动 */
    var pills = $("dayPills");
    pills.addEventListener("click", function (e) {
      var btn = e.target.closest(".daypill");
      if (!btn) return;
      pills.querySelectorAll(".daypill").forEach(function (x) { x.classList.remove("on"); });
      btn.classList.add("on");
      $("dayList").querySelectorAll(".daycard").forEach(function (x) { x.classList.remove("active"); });
      var el = $(btn.getAttribute("data-d"));
      if (el) {
        el.classList.add("active");
        $("p-plan").classList.toggle("song-era", el.classList.contains("song"));
        document.body.classList.toggle("song-header", el.classList.contains("song"));
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  /* ======================================================================
     路线：只剩两张地图 + 跨城转场提示
     ====================================================================== */
  function renderRoute() {
    if (D.route.transfer) setHtml("routeTransfer", D.route.transfer);
  }

  /* ======================================================================
     景区 / 美食 / 交通
     ====================================================================== */
  function renderSights() {
    setHtml("sights", byCity(D.sights, function (s) {
      return "<details" + (s.open ? " open" : "") + ">" +
        '<summary><span class="ttl"><span class="no">' + s.no + "</span>" + s.name + tagsHtml(s.tags) +
        '</span><span class="arrow">▶</span></summary>' +
        '<div class="detail-body">' +
          s.kvs.filter(function (kv) { return !/^(门票|票价|价格|费用|优惠)$/.test(kv.k); }).map(function (kv) {
            return '<div class="kv"><div class="k">' + kv.k + '</div><div class="v">' + kv.v + "</div></div>";
          }).join("") +
          (s.btns ? '<div class="btnrow">' + s.btns.map(btnHtml).join("") + "</div>" : "") +
        "</div></details>";
    }));
  }

  function renderFoods() {
    setHtml("foodNotice", D.foodNotice);
    setHtml("foods", byCity(D.foods, function (f) {
      return "<details" + (f.open ? " open" : "") + ">" +
        '<summary><span class="ttl"><span class="no">' + f.no + "</span>" + f.name + tagsHtml(f.tags) +
        '</span><span class="arrow">▶</span></summary>' +
        '<div class="detail-body">' + f.body +
          (f.btns ? '<div class="btnrow">' + f.btns.map(btnHtml).join("") + "</div>" : "") +
        "</div></details>";
    }));

    setHtml("souvenir",
      "<h3>" + D.souvenir.title + "</h3>" +
      '<p style="font-size:13.5px">' + D.souvenir.body + "</p>" +
      '<div class="btnrow">' + D.souvenir.btns.map(btnHtml).join("") + "</div>");
  }

  function renderTrans() {
    var day = "";
    setHtml("trainRows", D.tickets.map(function (t) {
      var heading = t.day !== day ? '<div class="ticket-date">' + (day = t.day) + '<span>' + ({ '10/1': '抵达', '10/4': '转场', '10/6': '返程' }[t.day]) + '</span></div>' : '';
      return heading + ticketHtml(t);
    }).join(""));
    setHtml("trainNote", D.trans.trainNote);

    setHtml("intraCity", D.trans.intraCity.map(function (kv) {
      return '<div class="kv"><div class="k">' + kv.k + '</div><div class="v">' + kv.v + "</div></div>";
    }).join(""));

    setHtml("navlines", D.trans.navlines.map(function (n) {
      return '<div class="navline"><span class="nm">' + n.name + '</span>' +
        '<a class="btn amap" style="flex:none;min-width:0" href="' + amapUri(n.kw) + '">高德</a></div>';
    }).join(""));
  }

  /* ======================================================================
     备忘：清单（同步 + 持久化）
     ====================================================================== */
  var checkState = {};
  var checkBoxes = { booking: [], packing: [] };

  function renderMemo() {
    checkState = window.Sync.get("checklist") || {};

    function group(list) {
      return list.map(function (item) {
        return '<label class="check"><input type="checkbox" data-k="' + item.k + '">' +
          '<span class="box"></span><span>' + item.text + "</span></label>";
      }).join("");
    }
    setHtml("checkBooking", group(D.memo.booking));
    setHtml("checkPacking", group(D.memo.packing));
    setHtml("memoNotes", D.memo.notes.map(function (n) {
      return '<div class="kv"><div class="k">' + n.k + '</div><div class="v">' + n.v + "</div></div>";
    }).join(""));

    checkBoxes.booking = Array.prototype.slice.call($("checkBooking").querySelectorAll("input"));
    checkBoxes.packing = Array.prototype.slice.call($("checkPacking").querySelectorAll("input"));

    [["booking", "pbBooking", "plBooking"], ["packing", "pbPacking", "plPacking"]].forEach(function (cfg) {
      var col = cfg[0], bar = $(cfg[1]), label = $(cfg[2]);
      var boxes = checkBoxes[col];

      function paint() {
        var done = boxes.filter(function (b) { return b.checked; }).length;
        bar.style.width = (boxes.length ? Math.round(done / boxes.length * 100) : 0) + "%";
        label.textContent = done + " / " + boxes.length + " 已完成";
      }

      boxes.forEach(function (cb) {
        cb.addEventListener("change", function () {
          checkState[cb.getAttribute("data-k")] = cb.checked;
          window.Sync.set("checklist", checkState);
          paint();
        });
      });

      /* 应用一份状态（本地或远端） */
      function apply(state) {
        boxes.forEach(function (cb) { cb.checked = !!state[cb.getAttribute("data-k")]; });
        paint();
      }
      apply(checkState);

      /* 本地或远端状态变化 → 这一组重画 */
      window.Sync.on("checklist", function (state) {
        checkState = state || {};
        apply(checkState);
      });
    });
  }

  /* 供 boot 在远端数据到达后强制重画两条进度（两组监听已各自 apply，这里兜底） */
  function paintAll() {
    [["booking", "pbBooking", "plBooking"], ["packing", "pbPacking", "plPacking"]].forEach(function (cfg) {
      var boxes = checkBoxes[cfg[0]];
      if (!boxes || !boxes.length) return;
      var done = boxes.filter(function (b) { return b.checked; }).length;
      $(cfg[1]).style.width = Math.round(done / boxes.length * 100) + "%";
      $(cfg[2]).textContent = done + " / " + boxes.length + " 已完成";
    });
  }

  /* ======================================================================
     真实地图（高德 JS API 2.0）
     每个城市一张图，节点落在真实坐标上，按天着色 + 按天筛选
     Key 读 D.route.amap（公开客户端密钥，绑域名白名单），两台手机免配置
     ====================================================================== */
  function initAmap() {
    var R = D.route || {};
    var A = R.amap || {};
    if (!A.key) return;

    var DAYC = R.dayColors || {}, DAYN = R.dayNames || {};
    var cities = R.cities || [];
    function colorOf(day) { return DAYC[day] || "#8a7a6a"; }

    var loading = null;
    function loadScript() {
      if (loading) return loading;
      loading = new Promise(function (resolve, reject) {
        if (window.AMap) return resolve();
        window._AMapSecurityConfig = { securityJsCode: A.securityJsCode || "" };
        var s = document.createElement("script");
        s.src = "https://webapi.amap.com/maps?v=2.0&key=" + encodeURIComponent(A.key);
        s.onload = function () { window.AMap ? resolve() : reject(new Error("高德脚本未就绪")); };
        s.onerror = function () { reject(new Error("高德脚本加载失败")); };
        document.head.appendChild(s);
      });
      return loading;
    }

    /* 一张城市地图 = 一个独立实例：自己的容器、筛选条、图例、显隐状态 */
    function makeCity(city) {
      var suf = "_" + city.id;
      var box = $("amapBox" + suf);
      if (!box) return null;

      var nodes = (city.nodes || []).filter(function (n) { return n.lng && n.lat; });
      var edges = city.edges || [];
      var days = city.days || [];
      var map = null, infoWin = null, markers = [], lines = [];
      var on = {};
      days.forEach(function (d) { on[d] = true; });

      function nodeById(id) {
        for (var i = 0; i < nodes.length; i++) if (nodes[i].id === id) return nodes[i];
        return null;
      }
      /* 折线归属「目的地」所在的那一天，这样按天筛选和当天日程对得上 */
      function edgeDay(e) { var to = nodeById(e[1]); return to ? to.day : null; }

      function msg(text, isErr) {
        var el = $("amapMsg" + suf);
        if (!el) return;
        el.style.display = text ? "block" : "none";
        el.textContent = text || "";
        el.style.color = isErr ? "var(--verm-d)" : "var(--sub)";
      }

      function markerHtml(n) {
        return '<div class="amk" style="--c:' + colorOf(n.day) + '">' +
               "<i></i><b>" + escHtml(n.name) + "</b></div>";
      }
      function infoHtml(n) {
        return '<div class="aminfo"><h5>' + escHtml(n.name) + "</h5>" +
               '<p class="d">' + escHtml(DAYN[n.day] || "") + "</p>" +
               '<a class="btn amap" href="' + amapUri(n.kw || n.name) + '">去这里 · 高德导航</a></div>';
      }

      function draw(AMap) {
        map = new AMap.Map("amapBox" + suf, {
          zoom: city.zoom || 12,
          center: city.center,
          viewMode: "2D"
        });
        infoWin = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -10) });

        nodes.forEach(function (n) {
          var mk = new AMap.Marker({
            position: [n.lng, n.lat], content: markerHtml(n),
            anchor: "left-center", title: n.name,
            zIndex: 100 + (n.day || 0), map: map
          });
          mk.on("click", function () {
            infoWin.setContent(infoHtml(n));
            infoWin.open(map, [n.lng, n.lat]);
          });
          mk.__day = n.day;
          markers.push(mk);
        });

        edges.forEach(function (e) {
          var a = nodeById(e[0]), b = nodeById(e[1]);
          if (!a || !b) return;
          var d = edgeDay(e);
          var pl = new AMap.Polyline({
            path: [[a.lng, a.lat], [b.lng, b.lat]],
            strokeColor: colorOf(d), strokeWeight: 3, strokeOpacity: 0.85,
            lineJoin: "round", lineCap: "round", showDir: true, zIndex: 50, map: map
          });
          pl.__day = d;
          lines.push(pl);
        });

        map.setFitView(null, false, [70, 70, 70, 70]);

        /* 装下全域时缩放很小，老城那一片会挤成一团：低缩放只留圆点，放大再显示名称 */
        map.on("zoomend", syncLabelMode);
        syncLabelMode();
        applyFilter();
      }

      function syncLabelMode() {
        if (map && box) box.classList.toggle("zoomed-out", map.getZoom() < (city.labelZoom || 12));
      }
      function applyFilter() {
        markers.forEach(function (mk) { on[mk.__day] ? mk.show() : mk.hide(); });
        lines.forEach(function (pl) { on[pl.__day] ? pl.show() : pl.hide(); });
      }

      function buildFilter() {
        var wrap = $("amapFilter" + suf);
        if (!wrap) return;
        wrap.innerHTML = days.map(function (d) {
          return '<button type="button" class="daychip on" data-day="' + d +
                 '" style="--c:' + colorOf(d) + '"><i></i>' + escHtml(DAYN[d] || ("D" + d)) + "</button>";
        }).join("") + '<button type="button" class="daychip all" data-day="all">全部显示</button>';

        wrap.addEventListener("click", function (ev) {
          var btn = ev.target.closest ? ev.target.closest(".daychip") : null;
          if (!btn) return;
          var d = btn.getAttribute("data-day");
          if (d === "all") { days.forEach(function (k) { on[k] = true; }); }
          else { on[d] = !on[d]; }
          wrap.querySelectorAll(".daychip").forEach(function (b) {
            var bd = b.getAttribute("data-day");
            if (bd === "all") return;
            b.classList.toggle("on", !!on[bd]);
          });
          applyFilter();
        });
      }

      function buildLegend() {
        var el = $("alegend" + suf);
        if (!el) return;
        el.innerHTML = days.map(function (d) {
          return "<span><i style='background:" + colorOf(d) + "'></i>" + escHtml(DAYN[d] || ("D" + d)) + "</span>";
        }).join("");
      }

      function ensure() {
        if (map) { map.resize(); return; }
        loadScript()
          .then(function () { draw(window.AMap); msg(""); })
          .catch(function (e) {
            msg("地图加载失败：" + e.message + "（行程文字不受影响）", true);
            loading = null;
          });
      }

      buildFilter();
      buildLegend();
      msg("地图加载中…");
      return { ensure: ensure };
    }

    var insts = cities.map(makeCity).filter(Boolean);

    /* 地图容器在隐藏 tab 里尺寸为 0，必须等 tab 显示后再初始化 */
    onTabShow("p-route", function () { insts.forEach(function (m) { m.ensure(); }); });
    if ($("p-route") && $("p-route").classList.contains("active")) {
      insts.forEach(function (m) { m.ensure(); });
    }
  }

  /* ======================================================================
     UI：tab / 主题
     ====================================================================== */
  function initTabs() {
    var btns = document.querySelectorAll("#nav button");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        document.querySelectorAll(".tabpage").forEach(function (p) { p.classList.remove("active"); });
        var t = $(b.getAttribute("data-p"));
        if (t) t.classList.add("active");
        document.body.classList.toggle("compact-header", b.getAttribute("data-p") !== "p-home");
        document.body.classList.toggle("song-header", b.getAttribute("data-p") === "p-plan" && $("p-plan").classList.contains("song-era"));
        fireTabShow(b.getAttribute("data-p"));
        window.scrollTo(0, 0);
      });
    });
  }

  function initTheme() {
    var btn = $("themeBtn");
    var KEY = "ly_theme";
    function current() {
      try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
    }
    function apply(mode) {
      if (mode) document.documentElement.setAttribute("data-theme", mode);
      else document.documentElement.removeAttribute("data-theme");
      var dark = mode === "dark" ||
        (!mode && window.matchMedia("(prefers-color-scheme: dark)").matches);
      btn.textContent = dark ? "☀️" : "🌙";
    }
    apply(current());
    btn.addEventListener("click", function () {
      var cur = current();
      var next = cur === "dark" ? "light" : cur === "light" ? "" : "dark";
      try { next ? localStorage.setItem(KEY, next) : localStorage.removeItem(KEY); } catch (e) {}
      apply(next);
    });
  }

  function initSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "http:" && location.protocol !== "https:") return;
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function (e) {
        console.warn("Service worker 注册失败：", e.message);
      });
    });
  }

  /* ======================================================================
     启动：先渲染（不等网络），再拉远端状态
     ====================================================================== */
  function renderAll() {
    renderHero();
    renderHome();
    renderStays();
    renderPlan();
    renderRoute();
    renderSights();
    renderFoods();
    renderTrans();
    renderMemo();
    initAmap();
  }

  function boot() {
    /* Sync.init() 会同步播种本机缓存（远端部分是异步的），
       所以先调它、再渲染，首屏就能拿到上次的勾选与路线。 */
    var ready = window.Sync.init();

    renderAll();
    initTabs();
    initTheme();
    initSW();

    /* 远端数据到达后（init 内部会广播），兜底重画一次进度条 */
    ready.then(function () { paintAll(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
