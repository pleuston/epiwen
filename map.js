/* map.js — dependency-free slippy map for site locations.
 *
 * Pure vanilla JS: Web-Mercator projection + OpenStreetMap raster tiles
 * positioned as <img> elements. No Leaflet, no build step. Reads
 * data/site-index.json and plots every record with coordinates.
 */
(function () {
  "use strict";

  var TILE = 256;
  var TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  var MIN_Z = 3, MAX_Z = 17;

  var z = 5;
  var originX = 0, originY = 0;   // world-pixel coordinate at the container's top-left
  var W = 0, H = 0;

  var mapEl, tilesEl, markersEl;
  var popupEl = null;
  var sites = [];                 // [{id,title,title_zh,province,lon,lat,isParent}]

  // ── projection ──────────────────────────────────────────────────────────────

  function lon2wx(lon) { return (lon + 180) / 360 * TILE * Math.pow(2, z); }
  function lat2wy(lat) {
    var s = Math.sin(lat * Math.PI / 180);
    s = Math.max(-0.9999, Math.min(0.9999, s));
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * Math.pow(2, z);
  }

  function parseLonLat(str) {
    if (!str) return null;
    var p = String(str).split(",").map(function (s) { return parseFloat(s.trim()); });
    if (p.length < 2 || isNaN(p[0]) || isNaN(p[1])) return null;
    var lon = p[0], lat = p[1];
    // Guard against swapped lon/lat (corpus is China: lon 60–140, lat 3–55)
    var isLon = function (v) { return v >= 60 && v <= 140; };
    var isLat = function (v) { return v >= 3 && v <= 55; };
    if (!isLon(lon) && isLon(lat) && isLat(lon)) { var t = lon; lon = lat; lat = t; }
    return { lon: lon, lat: lat };
  }

  // ── rendering ───────────────────────────────────────────────────────────────

  function render() { renderTiles(); renderMarkers(); }

  function renderTiles() {
    var n = Math.pow(2, z);
    var x0 = Math.floor(originX / TILE), x1 = Math.floor((originX + W) / TILE);
    var y0 = Math.floor(originY / TILE), y1 = Math.floor((originY + H) / TILE);
    var html = "";
    for (var ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (var tx = x0; tx <= x1; tx++) {
        var wx = ((tx % n) + n) % n;          // wrap horizontally
        var left = Math.round(tx * TILE - originX);
        var top  = Math.round(ty * TILE - originY);
        var url = TILE_URL.replace("{z}", z).replace("{x}", wx).replace("{y}", ty);
        html += '<img class="tile" alt="" draggable="false" src="' + url +
                '" style="left:' + left + "px;top:" + top + 'px">';
      }
    }
    tilesEl.innerHTML = html;
  }

  function renderMarkers() {
    markersEl.innerHTML = "";
    sites.forEach(function (s) {
      var left = lon2wx(s.lon) - originX;
      var top  = lat2wy(s.lat) - originY;
      if (left < -30 || left > W + 30 || top < -30 || top > H + 30) return;
      var m = document.createElement("div");
      m.className = "map-marker" + (s.isParent ? " is-parent" : "");
      m.style.left = left + "px"; m.style.top = top + "px";
      m.title = s.title + (s.title_zh ? " " + s.title_zh : "");
      m.addEventListener("click", function (e) { e.stopPropagation(); openPopup(s, left, top); });
      markersEl.appendChild(m);
    });
  }

  // ── popup ───────────────────────────────────────────────────────────────────

  function closePopup() { if (popupEl) { popupEl.remove(); popupEl = null; } }

  function openPopup(s, left, top) {
    closePopup();
    popupEl = document.createElement("div");
    popupEl.className = "map-popup";
    popupEl.style.left = left + "px";
    popupEl.style.top = top + "px";
    popupEl.innerHTML =
      "<h4>" + esc(s.title) + (s.title_zh ? ' <span class="pp-sub">' + esc(s.title_zh) + "</span>" : "") + "</h4>" +
      (s.province ? '<div class="pp-sub">' + esc(s.province) + "</div>" : "") +
      '<a class="btn small" href="sites.html?site=' + encodeURIComponent(s.id) + '">Open in Sites →</a>';
    popupEl.addEventListener("click", function (e) { e.stopPropagation(); });
    markersEl.appendChild(popupEl);
  }

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ── interaction: pan ──────────────────────────────────────────────────────────

  var dragging = false, sx = 0, sy = 0, moved = false;

  function onDown(e) {
    dragging = true; moved = false;
    var pt = point(e);
    sx = pt.x; sy = pt.y;
    mapEl.classList.add("dragging");
  }
  function onMove(e) {
    if (!dragging) return;
    var pt = point(e);
    var dx = pt.x - sx, dy = pt.y - sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    tilesEl.style.transform = "translate(" + dx + "px," + dy + "px)";
    markersEl.style.transform = "translate(" + dx + "px," + dy + "px)";
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    mapEl.classList.remove("dragging");
    var pt = point(e, true);
    if (pt) { originX -= (pt.x - sx); originY -= (pt.y - sy); }
    tilesEl.style.transform = ""; markersEl.style.transform = "";
    if (moved) closePopup();
    render();
  }
  function point(e, allowChanged) {
    var t = e.touches && e.touches[0] ? e.touches[0]
          : (allowChanged && e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
    var r = mapEl.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  // ── interaction: zoom (keeps the point under the cursor fixed) ─────────────────

  function zoomBy(delta, fx, fy) {
    var nz = Math.max(MIN_Z, Math.min(MAX_Z, z + delta));
    if (nz === z) return;
    if (fx == null) { fx = W / 2; fy = H / 2; }
    var scale = Math.pow(2, nz - z);
    originX = (originX + fx) * scale - fx;
    originY = (originY + fy) * scale - fy;
    z = nz;
    closePopup();
    render();
  }

  // ── fit all markers in view ───────────────────────────────────────────────────

  function fitBounds() {
    var pts = sites;
    if (!pts.length) { setCenter(104, 34, 4); return; }
    var minLon = 999, maxLon = -999, minLat = 999, maxLat = -999;
    pts.forEach(function (s) {
      minLon = Math.min(minLon, s.lon); maxLon = Math.max(maxLon, s.lon);
      minLat = Math.min(minLat, s.lat); maxLat = Math.max(maxLat, s.lat);
    });
    var cLon = (minLon + maxLon) / 2, cLat = (minLat + maxLat) / 2;
    // pick the largest zoom at which the bbox fits with padding
    var pad = 0.85;
    for (var test = MAX_Z; test >= MIN_Z; test--) {
      z = test;
      var w = Math.abs(lon2wx(maxLon) - lon2wx(minLon));
      var h = Math.abs(lat2wy(maxLat) - lat2wy(minLat));
      if (w <= W * pad && h <= H * pad) break;
    }
    setCenter(cLon, cLat, z);
  }

  function setCenter(lon, lat, zz) {
    z = zz;
    originX = lon2wx(lon) - W / 2;
    originY = lat2wy(lat) - H / 2;
  }

  // ── sizing ────────────────────────────────────────────────────────────────────

  function resize() {
    var top = mapEl.getBoundingClientRect().top;
    mapEl.style.height = Math.max(320, window.innerHeight - top - 4) + "px";
    W = mapEl.clientWidth; H = mapEl.clientHeight;
  }

  // ── load + init ────────────────────────────────────────────────────────────────

  function toast(msg, isErr) {
    var el = document.getElementById("toast"); if (!el) return;
    el.textContent = msg; el.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { el.className = ""; }, isErr ? 6000 : 3000);
  }

  document.addEventListener("DOMContentLoaded", function () {
    mapEl = document.getElementById("map");
    tilesEl = document.getElementById("map-tiles");
    markersEl = document.getElementById("map-markers");
    resize();

    mapEl.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    mapEl.addEventListener("touchstart", onDown, { passive: true });
    mapEl.addEventListener("touchmove", onMove, { passive: true });
    mapEl.addEventListener("touchend", onUp);
    mapEl.addEventListener("click", function () { if (!moved) closePopup(); });
    mapEl.addEventListener("wheel", function (e) {
      e.preventDefault();
      var pt = point(e);
      zoomBy(e.deltaY < 0 ? 1 : -1, pt.x, pt.y);
    }, { passive: false });
    document.getElementById("map-zoom-in").addEventListener("click", function () { zoomBy(1); });
    document.getElementById("map-zoom-out").addEventListener("click", function () { zoomBy(-1); });
    window.addEventListener("resize", function () { resize(); render(); });

    fetch("data/site-index.json?v=" + Date.now())
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (recs) {
        var childParents = {};
        recs.forEach(function (r) { if (r.parent) childParents[r.parent] = true; });
        recs.forEach(function (r) {
          if (r.kind && r.kind !== "site") return;     // only place-sites, not caves/sections
          var ll = parseLonLat(r.coordinates);
          if (!ll) return;
          sites.push({
            id: r.id, title: r.title_en || r.id, title_zh: r.title_zh || "",
            province: r.province_en || "", lon: ll.lon, lat: ll.lat,
            isParent: !!childParents[r.id]
          });
        });
        document.getElementById("map-count").textContent = sites.length;
        fitBounds();
        render();
        if (!sites.length) toast("No site coordinates to plot", true);
      })
      .catch(function (e) { toast("Could not load sites: " + e.message, true); });
  });
})();
