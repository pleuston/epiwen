/* epigrapher-detail.js — one epigrapher (epigrapher.html?id=person-…).
 * Reads persons.json (app repo, no auth): name forms (字/號), dates, offices, bio,
 * and the works the person authored (→ source.html). */
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function el(id) { return document.getElementById(id); }
  var ID = new URLSearchParams(location.search).get("id");

  function fact(label, val) {
    if (val == null || val === "" || (Array.isArray(val) && !val.length)) return "";
    return "<dt>" + esc(label) + "</dt><dd>" + val + "</dd>";
  }
  function dateStr(p) {
    var b = p.birth && p.birth.when, d = p.death && p.death.when;
    if (b || d) {
      var txt = (p.birth && p.birth.text) || (p.death && p.death.text) || "";
      return esc((b || "?") + "–" + (d || "?")) + (txt ? ' <span class="cd-note">' + esc(txt) + "</span>" : "");
    }
    if (p.floruit) return "fl. " + esc((p.floruit.notBefore || "") + (p.floruit.notAfter ? "–" + p.floruit.notAfter : "") || p.floruit.text || "");
    return "";
  }

  function render(p) {
    var sub = [];
    if (p.name_pinyin) sub.push(esc(p.name_pinyin));
    var ds = dateStr(p); if (ds) sub.push(ds);

    var names = [];
    (p.zi || []).forEach(function (z) { names.push("字 " + esc(z)); });
    (p.hao || []).forEach(function (h) { names.push("號 " + esc(h)); });
    (p.other_names || []).forEach(function (o) { names.push(esc(o.type) + " " + esc(o.name)); });

    var facts = '<dl class="cd-facts">' +
      fact("Name 姓名", esc(p.name_zh || "") + (p.name_pinyin ? ' <span class="cd-note">' + esc(p.name_pinyin) + "</span>" : "")) +
      fact("Dates", dateStr(p)) +
      fact("Dynasty", p.dynasty ? esc(p.dynasty) : "") +
      fact("字 / 號 / aliases", names.length ? names.join(" · ") : "") +
      fact("Offices 官職", (p.offices || []).length ? p.offices.map(esc).join(" · ") : "") +
      fact("Role", p.role ? esc(p.role) : "") +
      "</dl>";

    var bio = p.bio ? '<h3>Biography</h3><p class="cd-bio">' + esc(p.bio) + "</p>" : "";

    var works = "";
    if (p.works && p.works.length) {
      works = '<h3>金石著作 — works authored <span class="cd-note">(' + p.works.length + ")</span></h3><ul class=\"cd-list\">" +
        p.works.map(function (w) {
          return '<li><a href="source.html?id=' + encodeURIComponent(w.id) + '">' + esc(w.title_zh) + "</a>" +
            (w.year ? ' <span class="cd-yr">' + esc(w.year) + "</span>" : "") +
            (w.skslxb ? ' <span class="cd-tag">SKSLXB</span>' : "") + "</li>";
        }).join("") + "</ul>";
    } else {
      works = '<h3>金石著作 — works authored</h3><p class="cd-note">No works in the register are attributed to this person yet.</p>';
    }

    el("cd-content").innerHTML =
      "<h1>" + esc(p.name_zh || "?") + "</h1>" +
      (sub.length ? '<p class="cd-sub">' + sub.join(" · ") + "</p>" : "") +
      facts + bio + works;
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!ID) { el("cd-content").innerHTML = '<p class="catalog-loading">No person id given.</p>'; return; }
    fetch("persons.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var p = ((d && d.persons) || []).filter(function (x) { return x.id === ID; })[0];
      if (!p) { el("cd-content").innerHTML = '<p class="catalog-loading">Person “' + esc(ID) + '” not found.</p>'; return; }
      document.title = "Epiwen · " + (p.name_zh || "Epigrapher");
      render(p);
    }).catch(function () { el("cd-content").innerHTML = '<p class="catalog-loading">Could not load persons.json.</p>'; });
  });
})();
