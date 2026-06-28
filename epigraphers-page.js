/* epigraphers-page.js — register of the people who authored premodern epigraphy
 * works (金石學). Left tree filters by dynasty / authored-works; the right pane is a
 * sortable, variant-folded table; each row opens the person's page. Reads
 * persons.json (app repo, no auth). */
(function () {
  "use strict";
  var DYN_ORDER = ["Han 漢", "Six Dyn. 魏晉南北朝", "Sui–Tang 隋唐", "Song 宋", "Yuan 元", "Ming 明", "Qing 清", "modern 近現代"];
  var all = [], sel = null;   // sel = {dynasty} | {hasWorks:true} | null

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fold(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function el(id) { return document.getElementById(id); }
  function yr(p, which) { var b = p[which]; return b && b.when ? b.when : ""; }
  function dates(p) {
    var b = yr(p, "birth"), d = yr(p, "death");
    if (b || d) return esc(b || "?") + "–" + esc(d || "?");
    if (p.floruit) return "fl. " + esc((p.floruit.notBefore || "") + (p.floruit.notAfter ? "–" + p.floruit.notAfter : "") || p.floruit.text || "");
    return "";
  }
  function matches(p, f) {
    if (!f) return true;
    if (f.hasWorks && !p.work_count) return false;
    if (f.dynasty && p.dynasty !== f.dynasty) return false;
    return true;
  }

  function node(label, sub, count, onClick) {
    var r = document.createElement("div");
    r.className = "ct-row";
    r.innerHTML = '<span class="ct-label">' + esc(label) + (sub ? ' <span class="ct-zh">' + esc(sub) + "</span>" : "") + '</span><span class="ct-count">' + count + "</span>";
    r.addEventListener("click", onClick);
    return r;
  }
  function renderTree() {
    var box = el("ct-tree"); box.innerHTML = "";
    var rootRow = node("All epigraphers", "", all.length, function () { setFilter(null, rootRow); });
    box.appendChild(rootRow);
    var nW = all.filter(function (p) { return p.work_count; }).length;
    var wRow = node("With authored works", "", nW, function () { setFilter({ hasWorks: true }, wRow); });
    box.appendChild(wRow);
    DYN_ORDER.forEach(function (dy) {
      var n = all.filter(function (p) { return p.dynasty === dy; }).length;
      if (!n) return;
      var r = node(dy, "", n, function () { setFilter({ dynasty: dy }, r); });
      box.appendChild(r);
    });
  }
  function setFilter(f, row) {
    sel = f;
    document.querySelectorAll(".ct-row.active").forEach(function (r) { r.classList.remove("active"); });
    if (row) row.classList.add("active");
    el("ct-search").value = "";
    render();
  }

  var sortKey = "works", sortDir = "desc";
  var COLS = [
    { label: "Name 姓名", key: "name" },
    { label: "字 / 號", key: null },
    { label: "Dates", key: "born" },
    { label: "Dynasty", key: "dynasty" },
    { label: "Works", key: "works", num: true }
  ];
  function sortVal(p, key) {
    if (key === "name") return fold(p.sort || p.name_pinyin || p.name_zh || "");
    if (key === "born") return yr(p, "birth") ? parseInt(yr(p, "birth"), 10) : 99999;
    if (key === "dynasty") return p.dynasty || "~";
    if (key === "works") return p.work_count || 0;
    return "";
  }
  function cmp(a, b) {
    var va = sortVal(a, sortKey), vb = sortVal(b, sortKey);
    var pr = (typeof va === "number") ? va - vb : String(va).localeCompare(String(vb));
    if (pr !== 0) return sortDir === "desc" ? -pr : pr;
    return (b.work_count || 0) - (a.work_count || 0) || fold(a.sort || "").localeCompare(fold(b.sort || ""));
  }
  function rowHtml(p) {
    var names = (p.zi || []).map(function (z) { return "字 " + esc(z); })
      .concat((p.hao || []).map(function (h) { return "號 " + esc(h); })).join(" · ");
    return '<tr>' +
      '<td><div class="ct-name"><a href="epigrapher.html?id=' + encodeURIComponent(p.id) + '">' + esc(p.name_zh || "?") + "</a></div>" +
        (p.name_pinyin ? '<div class="ct-city">' + esc(p.name_pinyin) + "</div>" : "") + "</td>" +
      "<td>" + (names ? '<span class="ct-zh">' + names + "</span>" : '<span class="ct-city">—</span>') + "</td>" +
      "<td>" + (dates(p) || '<span class="ct-city">—</span>') + "</td>" +
      "<td>" + (p.dynasty ? esc(p.dynasty) : '<span class="ct-city">—</span>') + "</td>" +
      '<td class="num">' + (p.work_count ? p.work_count : "—") + "</td></tr>";
  }
  function render() {
    var q = fold(el("ct-search").value.trim());
    var list = all.filter(function (p) { return matches(p, sel); });
    if (q) list = list.filter(function (p) {
      return fold((p.name_zh || "") + " " + (p.name_pinyin || "") + " " + (p.zi || []).join(" ") + " " + (p.hao || []).join(" ")).indexOf(q) !== -1;
    });
    list.sort(cmp);
    el("coll-title").textContent = sel ? (sel.dynasty || "Epigraphers with authored works") : "All epigraphers";
    el("coll-crumb").textContent = list.length + " " + (list.length === 1 ? "person" : "people") +
      " · " + list.reduce(function (s, p) { return s + (p.work_count || 0); }, 0) + " authored works";
    if (!list.length) { el("coll-cards").innerHTML = '<p class="catalog-loading">No people here.</p>'; return; }
    var thead = "<thead><tr>" + COLS.map(function (col) {
      if (!col.key) return "<th>" + esc(col.label) + "</th>";
      var arrow = sortKey === col.key ? (sortDir === "desc" ? " ▼" : " ▲") : "";
      return '<th class="sortable" data-key="' + col.key + '">' + esc(col.label) + arrow + "</th>";
    }).join("") + "</tr></thead>";
    el("coll-cards").innerHTML = '<table class="coll-table">' + thead + "<tbody>" + list.map(rowHtml).join("") + "</tbody></table>";
  }

  document.addEventListener("DOMContentLoaded", function () {
    el("ct-search").addEventListener("input", render);
    el("coll-cards").addEventListener("click", function (e) {
      var th = e.target.closest ? e.target.closest("th.sortable") : null;
      if (!th) return;
      var k = th.getAttribute("data-key");
      if (sortKey === k) sortDir = sortDir === "desc" ? "asc" : "desc";
      else { sortKey = k; sortDir = (k === "works") ? "desc" : "asc"; }
      render();
    });
    fetch("persons.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      all = (d && d.persons) || [];
      renderTree(); render();
    }).catch(function () { el("ct-tree").innerHTML = '<div class="catalog-loading">Could not load persons.json.</div>'; });
  });
})();
