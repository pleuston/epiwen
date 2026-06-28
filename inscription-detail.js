/* inscription-detail.js — one inscription (inscription.html?id=insc-…).
 * Reads inscriptions.json (app repo, no auth) + premodern.json to resolve each
 * attesting work to its page. Shows alt names, date, place, every work that records
 * it (title-in-work + juan), and rubbing surrogates. */
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function el(id) { return document.getElementById(id); }
  var ID = new URLSearchParams(location.search).get("id");
  var byWorkId = {};

  function fact(label, val) {
    if (val == null || val === "") return "";
    return "<dt>" + esc(label) + "</dt><dd>" + val + "</dd>";
  }
  function workCell(wid) {
    var r = byWorkId[wid];
    if (r) return '<a href="source.html?id=' + encodeURIComponent(r.id) + '">' + esc(r.title_zh) + "</a>" +
      (r.author_zh ? ' <span class="cd-note">' + esc(r.author_zh) + "</span>" : "");
    return esc(wid || "—");
  }

  function render(i) {
    var atts = (i.attestations || []);
    var attHtml = atts.length
      ? '<h3>Recorded in <span class="cd-note">(' + atts.length + " works)</span></h3>" +
        '<table class="cd-att"><thead><tr><th>Work 著作</th><th>Title in work</th><th>卷</th></tr></thead><tbody>' +
        atts.map(function (a) {
          return "<tr><td>" + workCell(a.work_id) + "</td><td>" +
            (a.title_in_work ? esc(a.title_in_work) : '<span class="cd-note">—</span>') +
            (a.note ? '<div class="cd-note">' + esc(a.note) + "</div>" : "") + "</td><td>" +
            (a.juan ? esc(a.juan) : "") + "</td></tr>";
        }).join("") + "</tbody></table>"
      : "";

    var surr = (i.surrogates || []);
    var surrHtml = surr.length
      ? '<h3>Rubbings &amp; surrogates</h3><ul class="cd-list">' + surr.map(function (s) {
          return '<li><a href="' + esc(s.ref) + '" target="_blank" rel="noopener">' + esc(s.title || s.ref) + " ↗</a>" +
            (s.type ? ' <span class="cd-note">' + esc(s.type) + "</span>" : "") + "</li>";
        }).join("") + "</ul>"
      : "";

    var altHtml = (i.alt || []).length ? i.alt.map(esc).join("<br>") : "";

    el("cd-content").innerHTML =
      "<h1>" + esc(i.name_zh || "?") + "</h1>" +
      (i.name_pinyin ? '<p class="cd-sub">' + esc(i.name_pinyin) + "</p>" : "") +
      '<h3>Inscription</h3><dl class="cd-facts">' +
        fact("Name 石刻", esc(i.name_zh || "")) +
        fact("Date", i.origDate ? esc(i.origDate) : "") +
        fact("Place", i.origPlace ? esc(i.origPlace) : "") +
        fact("Other names", altHtml) +
      "</dl>" + attHtml + surrHtml;
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!ID) { el("cd-content").innerHTML = '<p class="catalog-loading">No inscription id given.</p>'; return; }
    Promise.all([
      fetch("inscriptions.json").then(function (r) { return r.ok ? r.json() : null; }),
      fetch("premodern.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (rs) {
      ((rs[1] && rs[1].works) || []).forEach(function (w) { if (w.work_id) byWorkId[w.work_id] = w; });
      var i = ((rs[0] && rs[0].inscriptions) || []).filter(function (x) { return x.id === ID; })[0];
      if (!i) { el("cd-content").innerHTML = '<p class="catalog-loading">Inscription “' + esc(ID) + '” not found.</p>'; return; }
      document.title = "Epiwen · " + (i.name_zh || "Inscription");
      render(i);
    }).catch(function () { el("cd-content").innerHTML = '<p class="catalog-loading">Could not load inscriptions.json.</p>'; });
  });
})();
