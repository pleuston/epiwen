/* source-detail.js — one premodern epigraphy work (source.html?id=…).
 * Reads premodern.json (app repo, no auth): metadata, author → epigrapher page,
 * SKSLXB placement + Kuhn & Stahl catalogue concordances, curated editions and
 * work-to-work relations (from edep_sino works.xml), the work's 目錄 (per-work
 * table of contents, toc/<work_id>.json), the inscriptions it records (curated
 * concordance), and matching Epiwen bibliography entries (EpiData). No paratexts. */
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fold(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function el(id) { return document.getElementById(id); }
  var ID = new URLSearchParams(location.search).get("id");
  var SERIES_ZH = { 1: "第一輯", 2: "第二輯", 3: "第三輯", 4: "第四輯" };
  var CAT_LABEL = { HY: "Harvard-Yenching 哈佛燕京", LC: "LC", UC: "UC", FZ: "方志 gazetteer", SKTBSY: "SKTBSY" };
  var byId = {}, byWorkId = {};

  function fact(label, val) {
    if (val == null || val === "" || val === false) return "";
    return "<dt>" + esc(label) + "</dt><dd>" + val + "</dd>";
  }
  function yesno(v) { return v === true ? "yes" : v === false ? "no" : v == null ? "" : esc(v); }
  function workLink(wid, fallbackTitle) {
    var r = byWorkId[wid];
    if (r) return '<a href="source.html?id=' + encodeURIComponent(r.id) + '">' + esc(r.title_zh) + "</a>";
    return esc(fallbackTitle || wid || "");
  }
  function catRefs(cat) {
    if (!cat) return "";
    return Object.keys(cat).map(function (k) {
      var v = cat[k]; if (v == null || v === "" || v === false) return "";
      return '<span title="' + esc(CAT_LABEL[k] || k) + '"><b>' + esc(k) + "</b> " + (v === true ? "✓" : "<code>" + esc(v) + "</code>") + "</span>";
    }).filter(Boolean).join(" &nbsp; ");
  }

  function render(c, biblio) {
    var authorHtml = c.author_id
      ? '<a href="epigrapher.html?id=' + encodeURIComponent(c.author_id) + '">' + esc(c.author_zh || c.author_pinyin || "?") + "</a>"
      : esc(c.author_zh || c.author_pinyin || "");
    var sub = [];
    if (c.title_pinyin) sub.push(esc(c.title_pinyin));
    if (c.author_zh || c.author_pinyin) sub.push(authorHtml + (c.author_dates ? " (" + esc(c.author_dates) + ")" : ""));
    var tags = c.in_skslxb
      ? '<span class="cd-tag agg" title="' + esc(c.source || "") + '">石刻史料新編 ' + (SERIES_ZH[c.skslxb_series] || "") + "</span>"
      : '<span class="cd-tag inst">premodern epigraphy work</span>';

    // Work facts
    var compiled = c.compiled ? (esc(c.compiled.text || "") + (c.compiled.when ? " <span class=\"cd-note\">(" + esc(c.compiled.when) + ")</span>" : "")) : "";
    var work = '<h3>Work</h3><dl class="cd-facts">' +
      fact("Title 著作", esc(c.title_zh || "") + (c.title_pinyin ? ' <span class="ct-zh">' + esc(c.title_pinyin) + "</span>" : "")) +
      fact("Author 撰者", authorHtml) +
      fact("Dates", c.author_dates ? esc(c.author_dates) : "") +
      fact("Dynasty", c.dynasty ? esc(c.dynasty) : "") +
      fact("Compiled", compiled) +
      fact("Juan 卷", c.juan ? c.juan : "") +
      fact("Period covered", c.period_covered ? esc(c.period_covered) : "") +
      fact("Transcriptions", c.transcriptions ? esc(c.transcriptions) : "") +
      fact("Epitaphs 墓誌", c.has_epitaphs != null ? yesno(c.has_epitaphs) : "") + "</dl>";

    // SKSLXB placement
    var sk = "";
    if (c.in_skslxb) {
      var dl = fact("Series 輯", (SERIES_ZH[c.skslxb_series] || c.skslxb_series) + " (" + c.skslxb_series + ")") +
        fact("Locator", c.skslxb_locator ? "<code>" + esc(c.skslxb_locator) + "</code> <span class=\"cd-note\">series.volume:page</span>" : "<span class=\"cd-note\">series only — precise locator unresolved</span>") +
        fact("Pages", c.skslxb_pages ? esc(c.skslxb_pages) : "") +
        fact("K&S page", c.ks_page ? "p. " + esc(c.ks_page) : "");
      var refs = catRefs(c.catalogue);
      if (refs) dl += "<dt>Concordances</dt><dd>" + refs + "</dd>";
      sk = '<h3>石刻史料新編 (SKSLXB) placement</h3><dl class="cd-facts">' + dl + "</dl>" +
        '<p style="margin:.6rem 0 0"><a class="cd-back" style="margin:0" href="skslxb.html?series=' + c.skslxb_series + "#" + encodeURIComponent(c.id) + '">View in 石刻史料新編 contents →</a></p>';
    }

    // Editions
    var eds = "";
    if (c.editions && c.editions.length) {
      eds = '<h3>Editions <span class="cd-note">(' + c.editions.length + ")</span></h3><ul class=\"cd-list\">" +
        c.editions.map(function (e) {
          return "<li>" + esc(e.edition || "") +
            (e.publisher ? ' <span class="cd-note">· ' + esc(e.publisher) + "</span>" : "") +
            (e.date ? ' <span class="cd-note">· ' + esc(e.date) + "</span>" : "") +
            (e.in_collection ? '<br><span class="cd-note">in: ' + esc(e.in_collection) + "</span>" : "") + "</li>";
        }).join("") + "</ul>";
    }

    // Relations
    var rel = "";
    if (c.relations && c.relations.length) {
      rel = '<h3>Related works</h3><ul class="cd-list">' + c.relations.map(function (r) {
        return "<li><span class=\"cd-rel\">" + esc((r.type || "").replace(/-/g, " ")) + "</span> " + workLink(r.target, r.target_title) + "</li>";
      }).join("") + "</ul>";
    }

    // Bibliography matches
    var bib = "";
    if (biblio && biblio.length) {
      bib = '<h3>Bibliography</h3><ul class="cd-list">' + biblio.map(function (b) {
        var cite = [b.author && (Array.isArray(b.author) ? b.author.join(", ") : b.author), b.year, b.title || b.title_zh || b.reference].filter(Boolean).join(". ");
        return '<li><a href="bibliography.html?q=' + encodeURIComponent(c.title_zh || "") + '">' + esc(cite || b.key) + "</a>" +
          (b.title_zh && b.title_zh !== b.title ? ' <span class="ct-zh">' + esc(b.title_zh) + "</span>" : "") + "</li>";
      }).join("") + "</ul>";
    }

    var vault = c.vault_page ? '<h3>Source notes</h3><p class="cd-note">Vault work page: ' + esc(c.vault_page) +
      ". Author links, editions, and relations from the edep_sino works register; catalogue concordances + SKSLXB dates from Kuhn &amp; Stahl 1991. No paratexts (序/跋/提要).</p>" : "";

    el("cd-content").innerHTML =
      "<h1>" + esc(c.title_zh || c.title_pinyin || "(untitled)") + "</h1>" +
      (sub.length ? '<p class="cd-sub">' + sub.join(" · ") + "</p>" : "") +
      '<div class="cd-tags">' + tags + "</div>" +
      work + sk + eds + rel +
      '<div id="cd-inscr"></div><div id="cd-toc"></div>' +
      bib + vault;

    if (c.recorded_count) renderRecorded(c);
    if (c.toc_count && c.toc_key) renderToc(c);
  }

  // curated inscriptions this work attests (from inscriptions.json)
  function renderRecorded(c) {
    el("cd-inscr").innerHTML = '<h3>Recorded inscriptions <span class="cd-note">(' + c.recorded_count +
      ' catalogued)</span></h3><p class="cd-note">' + c.recorded_count +
      ' inscription' + (c.recorded_count === 1 ? "" : "s") + ' in the curated concordance cite this work — ' +
      '<a href="inscriptions.html?work=' + encodeURIComponent(c.work_id) + '">browse them →</a></p>';
  }

  // the work's 目錄 (broad per-work table of contents)
  function renderToc(c) {
    fetch("toc/" + encodeURIComponent(c.toc_key) + ".json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.entries) return;
      var rows = d.entries, CAP = 800;
      var box = el("cd-toc");
      box.innerHTML = '<h3>目錄 — table of contents <span class="cd-note">(' + rows.length + " entries)</span></h3>" +
        '<input type="search" id="toc-q" class="catalog-searchbox" placeholder="Filter 目錄…" style="max-width:22rem;margin:.2rem 0 .5rem">' +
        '<div id="toc-wrap"></div>';
      function draw() {
        var q = fold((el("toc-q").value || "").trim());
        var list = q ? rows.filter(function (e) { return fold((e.title || "") + " " + (e.attribution || "")).indexOf(q) !== -1; }) : rows;
        var shown = list.slice(0, CAP);
        el("toc-wrap").innerHTML = '<table class="cd-toctable"><thead><tr><th>#</th><th>Inscription</th><th>Attribution</th><th>卷</th><th>WYG</th></tr></thead><tbody>' +
          shown.map(function (e) {
            return "<tr><td class=\"num\">" + (e.seq != null ? e.seq : "") + "</td><td>" + esc(e.title || "") + "</td><td>" +
              (e.attribution ? esc(e.attribution) : '<span class="cd-note">—</span>') + "</td><td class=\"num\">" +
              (e.juan != null ? e.juan : "") + "</td><td class=\"cd-note\">" + esc(e.wyg || e.sbck || "") + "</td></tr>";
          }).join("") + "</tbody></table>" +
          (list.length > CAP ? '<p class="cd-note">showing first ' + CAP + " of " + list.length + " — filter to narrow</p>" : "");
      }
      el("toc-q").addEventListener("input", draw); draw();
    }).catch(function () {});
  }

  function loadBiblio(c) {
    if (!c.title_zh || c.title_zh.length < 2) return Promise.resolve([]);
    function asArr(b) { return Array.isArray(b) ? b : (b && (b.entries || b.items)) || []; }
    var def = fetch("corpus/biblio-index.json").then(function (r) { return r.ok ? r.json() : []; }).then(asArr).catch(function () { return []; });
    var back = (window.EpiData && EpiData.token && EpiData.token())
      ? EpiData.json("data/biblio-index.json").then(asArr).catch(function () { return []; }) : Promise.resolve([]);
    return Promise.all([def, back]).then(function (rs) {
      var byKey = {}; rs[0].concat(rs[1]).forEach(function (b) { if (b && b.key) byKey[b.key] = b; });
      var t = c.title_zh;
      return Object.keys(byKey).map(function (k) { return byKey[k]; }).filter(function (b) {
        var z = b.title_zh || b.title || ""; return z && z.indexOf(t) !== -1;
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!ID) { el("cd-content").innerHTML = '<p class="catalog-loading">No work id given.</p>'; return; }
    fetch("premodern.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var works = (d && d.works) || [];
      works.forEach(function (w) { byId[w.id] = w; if (w.work_id) byWorkId[w.work_id] = w; });
      var c = byId[ID];
      if (!c) { el("cd-content").innerHTML = '<p class="catalog-loading">Work “' + esc(ID) + '” not found.</p>'; return; }
      document.title = "Epiwen · " + (c.title_zh || c.title_pinyin || "Source");
      render(c, []);
      loadBiblio(c).then(function (bib) { if (bib.length) render(c, bib); }).catch(function () {});
    }).catch(function () { el("cd-content").innerHTML = '<p class="catalog-loading">Could not load premodern.json.</p>'; });
  });
})();
