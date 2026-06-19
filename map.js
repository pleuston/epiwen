/* map.js — site locations on Leaflet (vendored locally in leaflet/).
 *
 * Base layers (radio): streets / satellite / terrain / light.
 * Overlays (checkbox): the site markers + selectable historical borders
 * (500/600/700/800 CE), lazy-loaded from local GeoJSON in overlays/.
 * Reads data/site-index.json. Tiles + historical data are external sources,
 * credited in the attribution control.
 */
(function () {
  "use strict";

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function parseLonLat(str) {
    if (!str) return null;
    var p = String(str).split(",").map(function (s) { return parseFloat(s.trim()); });
    if (p.length < 2 || isNaN(p[0]) || isNaN(p[1])) return null;
    var lon = p[0], lat = p[1];
    var isLon = function (v) { return v >= 60 && v <= 140; };
    var isLat = function (v) { return v >= 3 && v <= 55; };
    if (!isLon(lon) && isLon(lat) && isLat(lon)) { var t = lon; lon = lat; lat = t; }
    return { lon: lon, lat: lat };
  }

  function toast(msg, isErr) {
    var el = document.getElementById("toast"); if (!el) return;
    el.textContent = msg; el.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { el.className = ""; }, isErr ? 6000 : 3000);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var mapEl = document.getElementById("map");
    function sizeMap() {
      var top = mapEl.getBoundingClientRect().top;
      mapEl.style.height = Math.max(320, window.innerHeight - top - 4) + "px";
    }
    sizeMap();

    var map = L.map(mapEl, { scrollWheelZoom: true }).setView([34, 104], 4);

    // ── Base layers ──────────────────────────────────────────────────────────
    var osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    });
    var sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
    });
    var topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17, subdomains: "abc",
      attribution: '© <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)'
    });
    var light = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, subdomains: "abcd", attribution: "© OpenStreetMap, © CARTO"
    });
    osm.addTo(map);

    window.addEventListener("resize", function () { sizeMap(); map.invalidateSize(); });

    // ── Site markers (clustered) ──────────────────────────────────────────────
    var cluster = L.markerClusterGroup({
      maxClusterRadius: 45, showCoverageOnHover: false, spiderfyOnMaxZoom: true
    });

    // ── Historical border overlays (lazy-loaded local GeoJSON) ────────────────
    var HIST = [
      { label: "Borders · 500 CE (N. Wei)", file: "overlays/borders_500.geojson", color: "#8e44ad" },
      { label: "Borders · 600 CE (Sui)",    file: "overlays/borders_600.geojson", color: "#16846b" },
      { label: "Borders · 700 CE (Tang)",   file: "overlays/borders_700.geojson", color: "#b9770e" },
      { label: "Borders · 800 CE (Tang)",   file: "overlays/borders_800.geojson", color: "#1f6fb0" }
    ];
    var overlays = { "Sites": cluster };
    HIST.forEach(function (h) {
      h.layer = L.geoJSON(null, {
        style: { color: h.color, weight: 1.5, opacity: 0.9, fillColor: h.color, fillOpacity: 0.06 },
        onEachFeature: function (f, lyr) {
          var nm = (f.properties && (f.properties.NAME || f.properties.ABBREVN)) || "";
          if (nm) lyr.bindTooltip(esc(nm), { sticky: true });
        }
      });
      h.loaded = false;
      overlays[h.label] = h.layer;
    });

    // lazy-load a historical layer the first time it is switched on
    map.on("overlayadd", function (e) {
      var h = HIST.filter(function (x) { return x.layer === e.layer; })[0];
      if (!h || h.loaded) return;
      h.loaded = true;
      fetch(h.file).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (gj) { if (gj) h.layer.addData(gj); })
        .catch(function () { h.loaded = false; toast("Could not load " + h.label, true); });
    });

    L.control.layers(
      { "Streets": osm, "Satellite": sat, "Terrain": topo, "Light": light },
      overlays, { collapsed: true }
    ).addTo(map);
    map.attributionControl.addAttribution(
      'Historical borders: <a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener">historical-basemaps</a>'
    );

    // ── Site data ──────────────────────────────────────────────────────────────
    fetch("data/site-index.json?v=" + Date.now())
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (recs) {
        var childParents = {};
        recs.forEach(function (r) { if (r.parent) childParents[r.parent] = true; });

        var bounds = [];
        recs.forEach(function (r) {
          if (r.kind && r.kind !== "site") return;
          var ll = parseLonLat(r.coordinates);
          if (!ll) return;
          var isParent = !!childParents[r.id];
          var icon = L.divIcon({
            className: "site-divicon",
            html: '<div class="map-marker' + (isParent ? " is-parent" : "") + '"></div>',
            iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8]
          });
          var m = L.marker([ll.lat, ll.lon], { icon: icon, title: r.title_en || r.id });
          m.bindPopup(
            "<h4>" + esc(r.title_en || r.id) +
              (r.title_zh ? ' <span class="pp-sub">' + esc(r.title_zh) + "</span>" : "") + "</h4>" +
            (r.province_en ? '<div class="pp-sub">' + esc(r.province_en) + "</div>" : "") +
            '<a class="btn small" href="sites.html?site=' + encodeURIComponent(r.id) + '">Open in Sites →</a>'
          );
          cluster.addLayer(m);
          bounds.push([ll.lat, ll.lon]);
        });

        map.addLayer(cluster);
        var countEl = document.getElementById("map-count");
        if (countEl) countEl.textContent = bounds.length;
        map.invalidateSize();
        if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
        else toast("No site coordinates to plot", true);
      })
      .catch(function (e) { toast("Could not load sites: " + e.message, true); });
  });
})();
