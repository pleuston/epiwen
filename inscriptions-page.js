/* inscriptions-page.js — curated inscription↔work concordance. Left tree filters by
 * period; the right pane is a sortable, variant-folded table; each row opens the
 * inscription. ?work=<work_id> filters to inscriptions attesting one work. Reads
 * inscriptions.json (+ premodern.json for a work-title heading), app repo, no auth. */
(function () {
  "use strict";
  var PERIODS = [
    ["pre-Qin/Han 先秦秦漢", -2000, 220], ["Six Dyn. 魏晉南北朝", 220, 589], ["Sui–Tang 隋唐", 589, 907],
    ["Song–Yuan 宋元", 907, 1368], ["Ming 明", 1368, 1644], ["Qing 清", 1644, 1912], ["modern 近現代", 1912, 3000]
  ];
  var all = [], sel = null, workFilter = null, workTitle = "";

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fold(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function el(id) { return document.getElementById(id); }
  function yearOf(i) { var w = i.origDate; if (!w) return null; var m = String(w).match(/-?\d+/); return m ? parseInt(m[0], 10) : null; }
  function periodOf(i) { var y = yearOf(i); if (y == null) return null; for (var k = 0; k < PERIODS.length; k++) if (y >= PERIODS[k][1] && y < PERIODS[k][2]) return PERIODS[k][0]; return null; }
  function attCount(i) { return (i.attestations || []).filter(function (a) { return !workFilter || a.work_id === workFilter; }).length; }
  function matches(i) {
    if (workFilter && !(i.attestations || []).some(function (a) { return a.work_id === workFilter; })) return false;
    if (sel && sel.period && periodOf(i) !== sel.period) return false;
    return true;
  }

  function node(label, count, onClick) {
    var r = document.createElement("div");
    r.className = "ct-row";
    r.innerHTML = '<span class="ct-label">' + esc(label) + '</span><span class="ct-count">' + count + "</span>";
    r.addEventListener("click", onClick);
    return r;
  }
  function renderTree() {
    var box = el("ct-tree"); box.innerHTML = "";
    var rootRow = node("All inscriptions", all.filter(function (i) { return !workFilter || matchesWork(i); }).length, function () { setFilter(null, rootRow); });
    box.appendChild(rootRow);
    PERIODS.forEach(function (pr) {
      var n = all.filter(function (i) { return (!workFilter || matchesWork(i)) && periodOf(i) === pr[0]; }).length;
      if (!n) return;
      var r = node(pr[0], n, function () { setFilter({ period: pr[0] }, r); });
      box.appendChild(r);
    });
  }
  function matchesWork(i) { return !workFilter || (i.attestations || []).some(function (a) { return a.work_id === workFilter; }); }
  function setFilter(f, row) {
    sel = f;
    document.querySelectorAll(".ct-row.active").forEach(function (r) { r.classList.remove("active"); });
    if (row) row.classList.add("active");
    el("ct-search").value = "";
    render();
  }

  var sortKey = "atts", sortDir = "desc";
  var COLS = [
    { label: "Inscription 石刻", key: "name" },
    { label: "Date", key: "date" },
    { label: "Attesting works", key: "atts", num: true },
    { label: "Rubbings", key: "rub", num: true }
  ];
  function sortVal(i, key) {
    if (key === "name") return fold(i.name_pinyin || i.name_zh || "");
    if (key === "date") return yearOf(i) == null ? 99999 : yearOf(i);
    if (key === "atts") return attCount(i);
    if (key === "rub") return (i.surrogates || []).length;
    return "";
  }
  function cmp(a, b) {
    var va = sortVal(a, sortKey), vb = sortVal(b, sortKey);
    var pr = (typeof va === "number") ? va - vb : String(va).localeCompare(String(vb));
    if (pr !== 0) return sortDir === "desc" ? -pr : pr;
    return attCount(b) - attCount(a) || fold(a.name_pinyin || "").localeCompare(fold(b.name_pinyin || ""));
  }
  function rowHtml(i) {
    var alt = (i.alt || []).length ? '<div class="ct-city">' + esc(i.alt.slice(0, 2).join(" · ")) + ((i.alt.length > 2) ? " +" + (i.alt.length - 2) : "") + "</div>" : "";
    return '<tr>' +
      '<td><div class="ct-name"><a href="inscription.html?id=' + encodeURIComponent(i.id) + '">' + esc(i.name_zh || "?") + "</a></div>" +
        (i.name_pinyin ? '<div class="ct-city">' + esc(i.name_pinyin) + "</div>" : "") + alt + "</td>" +
      "<td>" + (i.origDate ? esc(i.origDate) : '<span class="ct-city">—</span>') + "</td>" +
      '<td class="num">' + attCount(i) + "</td>" +
      '<td class="num">' + ((i.surrogates || []).length || "—") + "</td></tr>";
  }
  function render() {
    var q = fold(el("ct-search").value.trim());
    var list = all.filter(matches);
    if (q) list = list.filter(function (i) {
      return fold((i.name_zh || "") + " " + (i.name_pinyin || "") + " " + (i.alt || []).join(" ")).indexOf(q) !== -1;
    });
    list.sort(cmp);
    el("coll-title").textContent = workFilter ? "Inscriptions in " + (workTitle || workFilter) : (sel && sel.period ? sel.period : "Inscription concordance");
    el("coll-crumb").innerHTML = list.length + " inscription" + (list.length === 1 ? "" : "s") +
      (workFilter ? ' · <a href="inscriptions.html">all inscriptions</a>' : "");
    if (!list.length) { el("coll-cards").innerHTML = '<p class="catalog-loading">No inscriptions here.</p>'; return; }
    var thead = "<thead><tr>" + COLS.map(function (col) {
      var arrow = sortKey === col.key ? (sortDir === "desc" ? " ▼" : " ▲") : "";
      return '<th class="sortable" data-key="' + col.key + '">' + esc(col.label) + arrow + "</th>";
    }).join("") + "</tr></thead>";
    el("coll-cards").innerHTML = '<table class="coll-table">' + thead + "<tbody>" + list.map(rowHtml).join("") + "</tbody></table>";
  }

  document.addEventListener("DOMContentLoaded", function () {
    workFilter = new URLSearchParams(location.search).get("work");
    el("ct-search").addEventListener("input", render);
    el("coll-cards").addEventListener("click", function (e) {
      var th = e.target.closest ? e.target.closest("th.sortable") : null;
      if (!th) return;
      var k = th.getAttribute("data-key");
      if (sortKey === k) sortDir = sortDir === "desc" ? "asc" : "desc";
      else { sortKey = k; sortDir = (k === "atts" || k === "rub") ? "desc" : "asc"; }
      render();
    });
    fetch("inscriptions.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      all = (d && d.inscriptions) || [];
      renderTree(); render();
      if (workFilter) fetch("premodern.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (pm) {
        var w = ((pm && pm.works) || []).filter(function (x) { return x.work_id === workFilter; })[0];
        if (w) { workTitle = w.title_zh; render(); }
      }).catch(function () {});
    }).catch(function () { el("ct-tree").innerHTML = '<div class="catalog-loading">Could not load inscriptions.json.</div>'; });
  });
})();
