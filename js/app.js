/* ==========================================================================
   app.js —— 渲染 + 交互
   所有内容来自 window.TRIP_DATA（js/data.js），状态读写走 window.Sync
   ========================================================================== */
(function () {
  "use strict";

  var D = window.TRIP_DATA;
  var $ = function (id) { return document.getElementById(id); };

  function setHtml(id, html) { var n = $(id); if (n) n.innerHTML = html; }

  /* 高德 URI：统一由关键词拼，避免每处重复写编码 */
  function amapUri(kw) {
    return "https://uri.amap.com/search?keyword=" + encodeURIComponent(kw) + "&city=" + encodeURIComponent("洛阳") + "&callnative=1";
  }

  function btnHtml(b) {
    var href = b.amap ? amapUri(b.kw) : b.href;
    var cls = "btn" + (b.amap ? " amap" : "");
    var ext = b.amap ? "" : ' target="_blank" rel="noopener"';
    return '<a class="' + cls + '" href="' + href + '"' + ext + ">" + b.t + "</a>";
  }

  function tagsHtml(tags) {
    return (tags || []).map(function (t) {
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
    setHtml("heroSeal", m.seal);
    setHtml("heroMeta",
      '<div class="hm"><div class="l">出行</div><div class="v">' + m.dates + '</div><div class="s">' + m.datesSub + "</div></div>" +
      '<div class="hm"><div class="l">人数</div><div class="v">' + m.people + '</div><div class="s">' + m.peopleSub + "</div></div>" +
      '<div class="hm"><div class="l">天气</div><div class="v">' + m.weather + '</div><div class="s">' + m.weatherSub + "</div></div>");
  }

  function renderHome() {
    setHtml("trains", D.trains.map(function (t) {
      return '<div class="train">' +
        '<div class="who' + (t.him ? " him" : "") + '">' + t.who + "</div>" +
        '<div style="flex:1">' +
          '<div class="tno">' + t.no + ' <span class="tag ' + (t.him ? "blue" : "gold") + '">' + t.from + " → " + t.to + "</span></div>" +
          '<div class="muted">' + t.dep + ' 发 → <span class="arr">' + t.arr + " 抵达</span> · " + t.dur + " · 二等座 " + t.price + "</div>" +
        "</div></div>";
    }).join(""));

    setHtml("arrivalNotice", '<div class="notice">' + D.arrivalNotice + "</div>");

    setHtml("weather", D.weather.map(function (w) {
      return '<div class="wcell"><div class="d">' + w.d + '</div><div class="ic">' + w.icon + "</div><div>" + w.desc + '</div><div class="t">' + w.t + "</div></div>";
    }).join(""));

    setHtml("weatherBtns", D.weatherBtns.map(btnHtml).join(""));

    setHtml("overview", D.overviewRows.map(function (r) {
      return "<tr><td><b>" + r.d + "</b> " + r.dow + "</td><td>" + r.plan + "</td></tr>";
    }).join(""));

    setHtml("bookingTimeline", D.bookingTimeline.map(function (b, i) {
      var circled = "①②③④⑤⑥⑦⑧⑨"[i] || "·";
      return circled + " <b>" + b.when + "</b> — " + b.text;
    }).join("<br>"));
  }

  /* ======================================================================
     行程
     ====================================================================== */
  function slotHtml(s) {
    return '<div class="tl"><div class="time">' + s.time + '</div><div class="what">' + s.what + "</div>" +
      (s.note ? '<div class="note">' + s.note + "</div>" : "") + "</div>";
  }

  function renderPlan() {
    setHtml("dayPills", D.days.map(function (d, i) {
      return '<button class="daypill' + (i === 0 ? " on" : "") + '" data-d="' + d.id + '" type="button">' + d.pill + "</button>";
    }).join(""));

    setHtml("dayList", D.days.map(function (d) {
      var body = d.slots && d.slots.length
        ? '<div class="timeline">' + d.slots.map(slotHtml).join("") + "</div>"
        : "";
      var alt = (d.alt || []).map(function (a) {
        return "<h4>" + a.title + '</h4><div class="timeline">' + a.slots.map(slotHtml).join("") + "</div>";
      }).join("");
      return '<div class="daycard" id="' + d.id + '">' +
        '<div class="dayhead"><span class="dnum">' + d.numCn + '</span><span class="dttl">' + d.date + " · " + d.dow +
        '</span><span class="dsub">' + d.sub + "</span></div>" +
        '<div class="card">' + body + alt + "</div></div>";
    }).join(""));

    /* 点 pill 滚到对应天，并高亮 */
    var pills = $("dayPills");
    pills.addEventListener("click", function (e) {
      var btn = e.target.closest(".daypill");
      if (!btn) return;
      pills.querySelectorAll(".daypill").forEach(function (x) { x.classList.remove("on"); });
      btn.classList.add("on");
      var el = $(btn.getAttribute("data-d"));
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* ======================================================================
     路线：每天怎么走
     ====================================================================== */
  function renderLegs() {
    setHtml("legsByDay", D.route.legsByDay.map(function (day) {
      return '<div class="card"><h4>' + day.h4 + "</h4>" + day.legs.map(function (l) {
        return '<div class="leg">' +
          '<div class="ab">' + l.from + " → " + l.to + '<span class="km">' + l.km + "</span></div>" +
          '<div class="how">' + l.how + "</div>" +
          (l.btns ? '<div class="btnrow">' + l.btns.map(btnHtml).join("") + "</div>" : "") +
          "</div>";
      }).join("") + "</div>";
    }).join(""));
  }

  /* ======================================================================
     景区 / 美食 / 交通
     ====================================================================== */
  function renderSights() {
    setHtml("sights", D.sights.map(function (s) {
      return "<details" + (s.open ? " open" : "") + ">" +
        '<summary><span class="ttl"><span class="no">' + s.no + "</span>" + s.name + tagsHtml(s.tags) +
        '</span><span class="arrow">▶</span></summary>' +
        '<div class="detail-body">' +
          s.kvs.map(function (kv) {
            return '<div class="kv"><div class="k">' + kv.k + '</div><div class="v">' + kv.v + "</div></div>";
          }).join("") +
          (s.btns ? '<div class="btnrow">' + s.btns.map(btnHtml).join("") + "</div>" : "") +
        "</div></details>";
    }).join(""));
  }

  function renderFoods() {
    setHtml("foodNotice", D.foodNotice);
    setHtml("foods", D.foods.map(function (f) {
      return "<details" + (f.open ? " open" : "") + ">" +
        '<summary><span class="ttl"><span class="no">' + f.no + "</span>" + f.name + tagsHtml(f.tags) +
        '</span><span class="arrow">▶</span></summary>' +
        '<div class="detail-body">' + f.body +
          (f.btns ? '<div class="btnrow">' + f.btns.map(btnHtml).join("") + "</div>" : "") +
        "</div></details>";
    }).join(""));

    setHtml("souvenir",
      "<h3>" + D.souvenir.title + "</h3>" +
      '<p style="font-size:13.5px">' + D.souvenir.body + "</p>" +
      '<div class="btnrow">' + D.souvenir.btns.map(btnHtml).join("") + "</div>");
  }

  function renderTrans() {
    setHtml("trainRows", "<tr><th>人</th><th>车次</th><th>区间</th><th>时间</th><th>票价</th></tr>" +
      D.trans.trainRows.map(function (r) {
        return "<tr><td>" + r.who + "</td><td>" + r.no + "</td><td>" + r.route + "</td><td>" + r.time + "</td><td>" + r.price + "</td></tr>";
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
     路线编辑器（SVG）—— 状态同步
     ====================================================================== */
  function initRouteEditor() {
    var R = D.route;
    var DAYC = R.dayColors, DAYN = R.dayNames;
    var DEF = { nodes: R.defaultNodes, edges: R.defaultEdges };

    var svg = $("rmap");
    var NS = "http://www.w3.org/2000/svg";
    var sel = null, drag = null, moved = false;

    /* 读本机/远端已有的路线；没有就用默认 */
    var saved = window.Sync.get("route");
    var state = (saved && saved.nodes && saved.nodes.length)
      ? saved
      : { nodes: JSON.parse(JSON.stringify(DEF.nodes)), edges: JSON.parse(JSON.stringify(DEF.edges)) };

    function save() { window.Sync.set("route", state); }
    function nodeById(id) {
      for (var i = 0; i < state.nodes.length; i++) if (state.nodes[i].id === id) return state.nodes[i];
      return null;
    }
    function edgeColor(e) { var n = nodeById(e[0]); return n ? (DAYC[n.day] || "#8a7a6a") : "#8a7a6a"; }

    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      /* 河流装饰 */
      var r1 = document.createElementNS(NS, "path");
      r1.setAttribute("d", "M0,300 C140,285 280,312 420,292 C540,276 610,300 680,288");
      r1.setAttribute("stroke", "#b9cfe3"); r1.setAttribute("stroke-width", "10");
      r1.setAttribute("fill", "none"); r1.setAttribute("opacity", ".35"); r1.setAttribute("stroke-linecap", "round");
      svg.appendChild(r1);

      /* 连线 + 箭头 */
      state.edges.forEach(function (e) {
        var a = nodeById(e[0]), b = nodeById(e[1]);
        if (!a || !b) return;
        var c = edgeColor(e);
        var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
        var ux = dx / len, uy = dy / len;
        var x1 = a.x + ux * 16, y1 = a.y + uy * 16, x2 = b.x - ux * 20, y2 = b.y - uy * 20;

        var line = document.createElementNS(NS, "line");
        line.setAttribute("x1", x1); line.setAttribute("y1", y1);
        line.setAttribute("x2", x2); line.setAttribute("y2", y2);
        line.setAttribute("stroke", c); line.setAttribute("stroke-width", "3"); line.setAttribute("opacity", ".85");
        svg.appendChild(line);

        var px = -uy, py = ux, s = 6;
        var tri = document.createElementNS(NS, "polygon");
        tri.setAttribute("points",
          (x2 + ux * 10) + "," + (y2 + uy * 10) + " " +
          (x2 + px * s) + "," + (y2 + py * s) + " " +
          (x2 - px * s) + "," + (y2 - py * s));
        tri.setAttribute("fill", c);
        svg.appendChild(tri);
      });

      /* 节点 */
      state.nodes.forEach(function (n) {
        var g = document.createElementNS(NS, "g");
        g.setAttribute("data-id", n.id);
        g.style.cursor = "grab";
        var c = DAYC[n.day] || "#8a7a6a";

        var halo = document.createElementNS(NS, "circle");
        halo.setAttribute("cx", n.x); halo.setAttribute("cy", n.y); halo.setAttribute("r", "17");
        halo.setAttribute("fill", c); halo.setAttribute("opacity", sel === n.id ? "0.35" : "0.12");
        g.appendChild(halo);

        var dot = document.createElementNS(NS, "circle");
        dot.setAttribute("cx", n.x); dot.setAttribute("cy", n.y); dot.setAttribute("r", "10");
        dot.setAttribute("fill", c); dot.setAttribute("stroke", "#fff"); dot.setAttribute("stroke-width", "2.5");
        g.appendChild(dot);

        var t = document.createElementNS(NS, "text");
        t.setAttribute("x", n.x); t.setAttribute("y", n.y - 22);
        t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", "13");
        t.setAttribute("font-family", "Songti SC,SimSun,serif"); t.setAttribute("font-weight", "700");
        t.setAttribute("fill", "currentColor"); t.setAttribute("stroke", "var(--rmap-bg)"); t.setAttribute("stroke-width", "4");
        t.setAttribute("paint-order", "stroke");
        t.textContent = n.name;
        g.appendChild(t);

        if (sel === n.id) {
          var ring = document.createElementNS(NS, "circle");
          ring.setAttribute("cx", n.x); ring.setAttribute("cy", n.y); ring.setAttribute("r", "15");
          ring.setAttribute("fill", "none"); ring.setAttribute("stroke", "var(--verm)"); ring.setAttribute("stroke-width", "2.5");
          ring.setAttribute("stroke-dasharray", "4 3");
          g.appendChild(ring);
        }

        g.addEventListener("pointerdown", function (ev) { onDown(ev, n.id); });
        svg.appendChild(g);
      });

      updateSel();
    }

    function svgPos(ev) {
      var pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    }

    function onDown(ev, id) {
      ev.preventDefault();
      var p = svgPos(ev);
      var n = nodeById(id);
      drag = { id: id, dx: p.x - n.x, dy: p.y - n.y };
      moved = false;
    }

    svg.addEventListener("pointermove", function (ev) {
      if (!drag) return;
      var p = svgPos(ev);
      var n = nodeById(drag.id);
      if (!n) return;
      var nx = Math.min(660, Math.max(20, p.x - drag.dx));
      var ny = Math.min(500, Math.max(30, p.y - drag.dy));
      if (Math.abs(nx - n.x) > 3 || Math.abs(ny - n.y) > 3) moved = true;
      n.x = nx; n.y = ny;
      render();
    });

    svg.addEventListener("pointerup", function () {
      if (!drag) return;
      var id = drag.id;
      drag = null;
      if (moved) { save(); return; }

      /* 轻点：第一次选中，第二次连线 */
      if (sel === null) sel = id;
      else if (sel === id) sel = null;
      else {
        var exists = state.edges.some(function (e) { return e[0] === sel && e[1] === id; });
        if (!exists) state.edges.push([sel, id]);
        sel = null; save();
      }
      render();
    });

    svg.addEventListener("pointerleave", function () { drag = null; });
    svg.addEventListener("pointercancel", function () { drag = null; });

    function updateSel() {
      var box = $("rsel");
      if (sel) {
        var n = nodeById(sel);
        box.style.display = "block";
        box.textContent = "已选中：" + (n ? n.name : "") + " — 再点另一个节点即可连线";
      } else {
        box.style.display = "none";
      }
    }

    $("btnAdd").addEventListener("click", function () {
      var name = prompt("节点名称（如：白马寺、小街天府）");
      if (!name) return;
      var d = prompt("属于第几天？输入 1-5（D1抵达 D2石窟+洛博 D3隋唐城 D4汉服 D5机动）", "3");
      d = parseInt(d, 10);
      if (!(d >= 1 && d <= 5)) d = 3;
      state.nodes.push({ id: "u" + Date.now(), name: name, x: 340, y: 260, day: d });
      save(); render();
    });

    $("btnRename").addEventListener("click", function () {
      if (!sel) { alert("先点选一个节点"); return; }
      var n = nodeById(sel);
      var name = prompt("新名称", n.name);
      if (name) { n.name = name; save(); render(); }
    });

    $("btnDelEdge").addEventListener("click", function () {
      if (!sel) { alert("先点选一个节点"); return; }
      state.edges = state.edges.filter(function (e) { return e[0] !== sel && e[1] !== sel; });
      save(); render();
    });

    $("btnDelNode").addEventListener("click", function () {
      if (!sel) { alert("先点选一个节点"); return; }
      state.nodes = state.nodes.filter(function (n) { return n.id !== sel; });
      state.edges = state.edges.filter(function (e) { return e[0] !== sel && e[1] !== sel; });
      sel = null; save(); render();
    });

    $("btnClear").addEventListener("click", function () {
      if (!confirm("清空所有连线？（节点保留）")) return;
      state.edges = []; save(); render();
    });

    $("btnReset").addEventListener("click", function () {
      if (!confirm("恢复默认路线？你的修改会被覆盖")) return;
      state = { nodes: JSON.parse(JSON.stringify(DEF.nodes)), edges: JSON.parse(JSON.stringify(DEF.edges)) };
      sel = null; save(); render();
    });

    /* 图例 */
    var legend = $("rlegend");
    legend.innerHTML = Object.keys(DAYN).map(function (d) {
      return "<span><i style='background:" + DAYC[d] + "'></i>" + DAYN[d] + "</span>";
    }).join("");

    /* 远端改了路线 → 重画 */
    window.Sync.on("route", function (remote) {
      if (!remote || !remote.nodes) return;
      state = remote;
      sel = null;
      render();
    });

    render();
  }

  /* ======================================================================
     高德真实地图（Key 存本机，不参与同步）
     ====================================================================== */
  function initAmap() {
    var AK_KEY = "ly_amap_key", AK_SEC = "ly_amap_sec";
    var form = $("amapForm"), box = $("amapBox"), msg = $("akMsg");
    var loaded = false;

    setHtml("amapHelp", D.route.amap.helperHtml);

    function get(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
    function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    function show(text, isErr) {
      msg.style.display = "block";
      msg.textContent = text;
      msg.style.color = isErr ? "var(--verm-d)" : "var(--sub)";
    }

    function loadMap(key, sec) {
      if (loaded) return;
      loaded = true;
      window._AMapSecurityConfig = { securityJsCode: sec };
      var s = document.createElement("script");
      s.src = "https://webapi.amap.com/maps?v=2.0&key=" + encodeURIComponent(key);
      s.onload = function () {
        box.classList.add("on");
        form.style.display = "none";
        try {
          var map = new window.AMap.Map("amapBox", { zoom: 12, center: [112.454, 34.619], viewMode: "2D" });
          (D.route.defaultNodes || []).forEach(function (n) {
            if (!n.lng || !n.lat) return;
            new window.AMap.Marker({ position: [n.lng, n.lat], title: n.name, map: map });
          });
        } catch (e) {
          show("地图初始化失败：" + e.message, true);
          loaded = false;
        }
      };
      s.onerror = function () {
        show("高德脚本加载失败，请检查 Key 是否为「Web端(JS API)」类型、以及网络是否可达。", true);
        loaded = false;
      };
      document.head.appendChild(s);
    }

    var k = get(AK_KEY), sec = get(AK_SEC);
    if (k) { $("akKey").value = k; $("akSec").value = sec; loadMap(k, sec); }

    $("akSave").addEventListener("click", function () {
      var key = $("akKey").value.trim(), s2 = $("akSec").value.trim();
      if (!key) { show("请先粘贴 Key", true); return; }
      set(AK_KEY, key); set(AK_SEC, s2);
      loaded = false;
      loadMap(key, s2);
      $("akReset").style.display = "inline-block";
    });

    $("akReset").addEventListener("click", function () {
      if (!confirm("清除本机保存的高德 Key？")) return;
      set(AK_KEY, ""); set(AK_SEC, "");
      location.reload();
    });

    if (k) $("akReset").style.display = "inline-block";
  }

  /* ======================================================================
     UI：tab / 倒计时 / 同步状态 / 主题
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
        window.scrollTo(0, 0);
      });
    });
  }

  function initCountdown() {
    var target = new Date(D.meta.countdownISO).getTime();
    var el = $("cd");
    if (!el) return;
    var d = Math.ceil((target - Date.now()) / 86400000);
    if (d > 0) el.innerHTML = "距出发还有 <b>" + d + "</b> 天";
    else if (d === 0) el.innerHTML = "<b>今天出发</b> · 一路平安";
    else el.innerHTML = "旅途愉快 · 神都欢迎你";
  }

  function initSyncBar() {
    var bar = $("syncBar"), text = $("syncText");
    window.Sync.onStatus(function (s) {
      bar.className = "syncbar" + (s === "live" ? " live" : s === "error" ? " err" : " off");
      text.textContent = s === "live" ? "已同步 · 两人共享" : s === "error" ? "离线保存（同步不可用）" : "本机保存";
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
    renderPlan();
    renderLegs();
    renderSights();
    renderFoods();
    renderTrans();
    renderMemo();
    initRouteEditor();
    initAmap();
  }

  function boot() {
    /* Sync.init() 会同步播种本机缓存（远端部分是异步的），
       所以先调它、再渲染，首屏就能拿到上次的勾选与路线。 */
    var ready = window.Sync.init();

    renderAll();
    initTabs();
    initCountdown();
    initSyncBar();
    initTheme();
    initSW();

    /* 远端数据到达后（init 内部会广播），兜底重画一次进度条 */
    ready.then(function () { paintAll(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
