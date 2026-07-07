/* sites-browser.js — hierarchical site tree + dual-view (HTML/XML) detail pane.
 *
 * Tree:  main site  ->  section  ->  object (cave)  ->  inscription sigla [brackets]
 * Detail: click a site/cave -> right pane shows pure data + prose description,
 *         toggled between rendered HTML and raw XML.
 *
 * Data: data/site-index.json (built by AI/scripts/build_site_data.py).
 * XML:  catalog/<id>_site.xml (structured), publication/Site_<id>.xml (prose).
 */
(function () {
  "use strict";

  var TEI = "http://www.tei-c.org/ns/1.0";

  var allRecords = [];
  var publicRecords = [];
  var byId = {};
  var byParent = {};        // parentId -> [records]
  var selectedId = null;
  var viewMode = "html";    // "html" | "xml"
  var cache = {};           // id -> { siteXml, proseXml }

  // ── utils ──────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function el(id) { return document.getElementById(id); }
  function label(r) {
    return esc(r.title_en || r.id) +
      (r.title_zh ? ' <span class="tree-label-zh">' + esc(r.title_zh) + "</span>" : "");
  }
  // Curatorial source of an EpiDoc-CN record: the Stone Sutras project (Heidelberger
  // Akademie der Wissenschaften) vs an Academia Sinica (ASCDC) import. Mirrors
  // catalog.js's DATA_SOURCE_INFO — keep the two in sync.
  var DATA_SOURCE_INFO = {
    HAdW:  { title: "Heidelberger Akademie der Wissenschaften — Stone Sutras project",
             url: "https://github.com/StoneSutras/sutras-data" },
    ASCDC: { title: "Academia Sinica Center for Digital Cultures — 佛教藝術圖典與知識系統",
             url: "https://buddhism.ascdc.sinica.edu.tw" }
  };
  function dsBadge(r) {
    var info = r && DATA_SOURCE_INFO[r.data_source];
    return info ? '<span class="badge-ds" title="' + esc(info.title) + '">' + esc(r.data_source) + "</span>" : "";
  }
  function toast(msg, isErr) {
    var t = el("toast"); if (!t) return;
    t.textContent = msg; t.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { t.className = ""; }, isErr ? 6000 : 3000);
  }

  // ── load ─────────────────────────────────────────────────────────────────────

  function load() {
    el("site-tree").innerHTML = '<div class="catalog-loading">Loading sites…</div>';
    publicRecords = [];   // sites now come from the Stone Sutras corpus + enabled collections
    mergePrivate(true);
  }

  function rebuildIndexes(records) {
    allRecords = records;
    byId = {}; byParent = {};
    records.forEach(function (r) {
      byId[r.id] = r;
      (byParent[r.parent || ""] = byParent[r.parent || ""] || []).push(r);
    });
  }

  // Sites come from the Stone Sutras corpus collection (default-on) + any enabled
  // collections (each carries collections/<pkg>/site-index.json). Re-run on toggle.
  function mergePrivate(initial) {
    var tree = el("site-tree");
    if (!window.EpiCollections || !EpiCollections.loadIndex) {
      tree.innerHTML = '<div class="catalog-loading">Collections unavailable.</div>'; return;
    }
    var defJob = EpiCollections.loadDefaultSiteIndex
      ? EpiCollections.loadDefaultSiteIndex() : Promise.resolve([]);
    Promise.all([defJob, EpiCollections.loadIndex("site")]).then(function (res) {
      var def = res[0] || [], priv = res[1] || [];
      // Dedup by id; private/backend entries win over the public default copy.
      var byKey = {};
      def.forEach(function (e) { if (e && e.id) byKey[e.id] = e; });
      priv.forEach(function (e) { if (e && e.id) byKey[e.id] = e; });
      var merged = Object.keys(byKey).map(function (k) { return byKey[k]; });
      rebuildIndexes(publicRecords.concat(merged));
      if (!allRecords.length) {
        tree.innerHTML = '<div class="catalog-loading">No sites — enable the Stone Sutras corpus in the Collections menu, ' +
          'or check your token can read the backend.</div>';
      } else {
        var s = el("site-search");
        renderTree(s ? s.value : "");
      }
      if (initial) {
        var want = new URLSearchParams(location.search).get("site");   // deep-link from the map
        if (want && byId[want]) showDetail(want);
      } else if (selectedId && byId[selectedId]) {
        showDetail(selectedId);
      }
    }).catch(function (e) {
      tree.innerHTML = '<div class="catalog-loading">Error: ' + esc(e.message) + "</div>";
    });
  }

  // ── tree ───────────────────────────────────────────────────────────────────

  function renderTree(query) {
    var tree = el("site-tree");
    tree.innerHTML = "";
    var roots = (byParent[""] || []).slice().sort(function (a, b) {
      return (a.title_en || a.id).localeCompare(b.title_en || b.id);
    });
    var fold = window.EpiVariants ? EpiVariants.fold : function (s) { return String(s == null ? "" : s).toLowerCase(); };
    var q = fold((query || "").trim());
    if (q) {
      roots = roots.filter(function (r) {
        return fold((r.title_en || "") + " " + (r.title_zh || "") + " " +
                (r.id || "") + " " + (r.province_en || "")).indexOf(q) !== -1;
      });
    }
    el("site-count").textContent = "(" + roots.length + (q ? " match" : " top-level") + ")";
    if (!roots.length) { tree.innerHTML = '<div class="catalog-loading">No sites.</div>'; return; }
    roots.forEach(function (r) { tree.appendChild(renderSite(r, q && roots.length <= 3)); });
  }

  function caret(open) {
    var c = document.createElement("span");
    c.className = "tree-caret" + (open ? " open" : "");
    c.textContent = "▶";
    return c;
  }
  function leafCaret() {
    var c = document.createElement("span");
    c.className = "tree-caret leaf"; c.textContent = "▶";
    return c;
  }

  // a clickable row that opens the detail pane
  function detailRow(rec, extraClass) {
    var row = document.createElement("div");
    row.className = "tree-row" + (extraClass ? " " + extraClass : "");
    row.dataset.id = rec.id;
    row.addEventListener("click", function (e) {
      e.stopPropagation();
      showDetail(rec.id);
    });
    return row;
  }

  function renderSite(site, autoOpen) {
    var wrap = document.createElement("div");
    wrap.className = "tree-site";

    var kids = (byParent[site.id] || []);
    var hasKids = kids.length > 0;
    var expandable = hasKids;

    var row = detailRow(site);
    var car = expandable ? caret(autoOpen) : leafCaret();
    row.appendChild(car);
    var lab = document.createElement("span");
    lab.innerHTML = label(site) + '<span class="tree-id">' + esc(site.id) + "</span>" +
      (site.has_description ? '<span class="badge-desc">desc</span>' : "") + dsBadge(site);
    row.appendChild(lab);
    wrap.appendChild(row);

    if (!expandable) return wrap;

    var children = document.createElement("div");
    children.className = "tree-children" + (autoOpen ? " open" : "");

    if (hasKids) {
      var sectioned = kids.some(function (k) { return k.section; });
      if (sectioned) {
        renderSections(children, kids);
      } else {
        kids.slice()
          .sort(kidSort)
          .forEach(function (k) { children.appendChild(renderObject(k)); });
      }
    }

    wrap.appendChild(children);

    car.addEventListener("click", function (e) {
      e.stopPropagation();
      children.classList.toggle("open");
      car.classList.toggle("open");
    });
    return wrap;
  }

  // group a site's children by section -> caves
  function renderSections(container, kids) {
    var order = [], groups = {};
    kids.forEach(function (k) {
      var sec = k.section || "(none)";
      if (!groups[sec]) { groups[sec] = []; order.push(sec); }
      groups[sec].push(k);
    });
    order.sort();
    order.forEach(function (sec) {
      var grp = groups[sec];
      var secRec = grp.filter(function (k) { return !k.cave; })[0];
      var caves = grp.filter(function (k) { return k.cave; })
        .sort(function (a, b) { return (parseInt(a.cave, 10) || 0) - (parseInt(b.cave, 10) || 0); });

      var secWrap = document.createElement("div");
      secWrap.className = "tree-section";
      var hasCaveKids = caves.length > 0;

      var row = secRec ? detailRow(secRec) : document.createElement("div");
      if (!secRec) row.className = "tree-row";
      var car = hasCaveKids ? caret(false) : leafCaret();
      row.insertBefore(car, row.firstChild || null);
      var lab = document.createElement("span");
      lab.innerHTML = "Section " + esc(sec) +
        (secRec && secRec.has_description ? '<span class="badge-desc">desc</span>' : "") + dsBadge(secRec);
      row.appendChild(lab);
      secWrap.appendChild(row);

      if (hasCaveKids) {
        var box = document.createElement("div");
        box.className = "tree-children";
        caves.forEach(function (c) { box.appendChild(renderObject(c)); });
        secWrap.appendChild(box);
        car.addEventListener("click", function (e) {
          e.stopPropagation();
          box.classList.toggle("open"); car.classList.toggle("open");
        });
      }
      container.appendChild(secWrap);
    });
  }

  // document order (seq) where the index provides it, else alphabetical
  function kidSort(a, b) {
    if (a.seq != null && b.seq != null) return a.seq - b.seq;
    return (a.title_en || a.id).localeCompare(b.title_en || b.id);
  }

  // the display siglum of an inscription node (short id, .text disambiguator dropped)
  function siglumOf(rec) {
    var s = rec.catalog_file ? rec.catalog_file.replace(/\.xml$/i, "") : (rec.id || "");
    return s.replace(/\.text$/, "");
  }
  function inscriptionsOf(id) {
    return (byParent[id] || []).filter(function (k) { return k.kind === "inscription"; })
      .slice().sort(kidSort);
  }
  // clickable inscription sigla for one object (e.g. CLS_1 · CLS_2 · CLS_3 · CLS_4)
  function siglaChips(id) {
    return inscriptionsOf(id).map(function (k) {
      return '<a href="#" class="siglum" data-goto="' + esc(k.id) + '" title="' +
        esc(k.title_zh || k.title_en || k.id) + '">' + esc(siglumOf(k)) + "</a>";
    }).join(" ");
  }

  // an object bearer (◆) lists its inscription SIGLA inline; sections/subsites
  // nest their object children.
  function renderObject(obj) {
    var wrap = document.createElement("div");
    var childObjs = (byParent[obj.id] || [])
      .filter(function (k) { return k.kind !== "inscription"; }).sort(kidSort);
    var sigla = obj.kind === "object" ? siglaChips(obj.id) : "";
    var expandable = childObjs.length > 0;

    var row = detailRow(obj);
    var car = expandable ? caret(false) : leafCaret();
    row.appendChild(car);
    var icon = obj.kind === "object" ? "◆ " : "";
    var lab = document.createElement("span");
    lab.innerHTML = esc(icon) + label(obj) +
      '<span class="tree-id">' + esc(obj.id) + "</span>" +
      (obj.has_description ? '<span class="badge-desc">desc</span>' : "") + dsBadge(obj);
    row.appendChild(lab);
    wrap.appendChild(row);

    if (sigla) {
      var sig = document.createElement("div");
      sig.className = "tree-sigla";
      sig.innerHTML = "── " + sigla;
      Array.prototype.forEach.call(sig.querySelectorAll(".siglum"), function (a) {
        a.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation(); showDetail(a.getAttribute("data-goto"));
        });
      });
      wrap.appendChild(sig);
    }
    if (expandable) {
      var box = document.createElement("div");
      box.className = "tree-children";
      childObjs.forEach(function (k) { box.appendChild(renderObject(k)); });
      wrap.appendChild(box);
      car.addEventListener("click", function (e) {
        e.stopPropagation();
        box.classList.toggle("open"); car.classList.toggle("open");
      });
    }
    return wrap;
  }

  // ── detail pane ──────────────────────────────────────────────────────────────

  function showDetail(id) {
    var rec = byId[id];
    if (!rec) return;
    selectedId = id;
    document.querySelectorAll(".tree-row.selected").forEach(function (r) { r.classList.remove("selected"); });
    var rowEl = document.querySelector('.tree-row[data-id="' + cssEsc(id) + '"]');
    if (rowEl) rowEl.classList.add("selected");

    el("preview-title").innerHTML = esc(rec.title_en || rec.id) +
      (rec.title_zh ? " " + esc(rec.title_zh) : "") +
      ' <span class="catalog-date">(' + esc(rec.id) + ")</span>";

    // Only catalog-backed records (genuine sites) are editable
    var editLink = el("site-edit-link");
    editLink.style.display = rec.catalog_file ? "" : "none";
    editLink.onclick = function () {
      var c = cache[id] || {};
      var xml = c.siteXml || "";
      // EpiDoc-CN files route to their tier's editor with the shared package as
      // write target so Save round-trips; legacy sites keep the c:object form.
      var kind = xml && window.EpiDocCN ? EpiDocCN.detect(xml) : null;
      var sh = window.EpiCollections && EpiCollections.sharedPkg && rec.collection
        ? EpiCollections.sharedPkg(rec.collection) : null;
      var target = sh ? { owner: sh.owner, repo: sh.repo, branch: sh.branch,
                          path: "collections/" + sh.id + "/" } : null;
      if (kind === "site") {
        sessionStorage.setItem("epiwen_preload_site_tei", JSON.stringify({
          rawXml: xml, filename: rec.catalog_file || (id + "_site.xml"), _writeTarget: target }));
        window.location.href = "site-editor.html";
      } else if (kind === "objectfile") {
        sessionStorage.setItem("epiwen_preload_object", JSON.stringify({
          rawXml: xml, filename: rec.catalog_file, _writeTarget: target }));
        window.location.href = "object-editor.html";
      } else if (kind === "inscription") {
        sessionStorage.setItem("epiwen_preload", JSON.stringify({
          rawXml: xml, filename: rec.catalog_file, _writeTarget: target }));
        window.location.href = "editor.html";
      } else {
        sessionStorage.setItem("epiwen_preload_site", JSON.stringify({ id: id, xml: xml }));
        window.location.href = "site-editor.html";
      }
    };

    el("site-detail").innerHTML = '<div class="catalog-loading">Loading…</div>';

    if (cache[id]) { renderDetail(rec); return; }

    Promise.all([fetchSiteFile(rec, rec.catalog_file), fetchSiteFile(rec, rec.prose_file)]).then(function (res) {
      cache[id] = { siteXml: res[0], proseXml: res[1] };
      if (selectedId === id) renderDetail(rec);
    });
  }

  // Site XML/prose for a corpus/collection site comes from inside the collection;
  // a core site (legacy) from the repo root. catalog_file/prose_file are relative.
  function fetchSiteFile(rec, file) {
    if (!file) return Promise.resolve("");
    if (rec._defaultCorpus && window.EpiCollections && EpiCollections.fetchDefaultCorpusFile)
      return EpiCollections.fetchDefaultCorpusFile(file).catch(function () { return ""; });
    if (rec.source === "private" && rec.collection && window.EpiCollections && EpiCollections.fetchRecordXml)
      return EpiCollections.fetchRecordXml(rec.collection, file).catch(function () { return ""; });
    return EpiData.fetch(file).then(okText).catch(function () { return ""; });
  }

  function volLabel(v) {
    if (!v) return "forthcoming";
    var m = /volume(\d+)/.exec(v);
    return m ? "Sichuan vol " + m[1] : v;
  }

  function childSummary(rec) {
    if (rec.kind === "object" || rec.kind === "inscription") return "";
    var kids = byParent[rec.id] || [];
    if (!kids.length) return "";
    function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
    var secs = kids.filter(function (k) { return k.kind === "section"; }).length;
    var objs = kids.filter(function (k) { return k.kind === "object"; }).length;
    var caves = kids.filter(function (k) { return k.kind === "cave"; }).length;
    var insc = 0;                                     // all descendant inscriptions
    (function walk(id) {
      (byParent[id] || []).forEach(function (k) {
        if (k.kind === "inscription") insc += 1; else walk(k.id);
      });
    })(rec.id);
    var parts = [];
    if (secs) parts.push(plural(secs, "subsite"));
    if (objs) parts.push(plural(objs, "object"));
    if (caves) parts.push(plural(caves, "cave"));
    if (insc) parts.push(plural(insc, "inscription"));
    return parts.join(" · ");
  }

  function okText(r) { return r.ok ? r.text() : ""; }
  function cssEsc(s) { return String(s).replace(/(["\\])/g, "\\$1"); }

  function renderDetail(rec) {
    var c = cache[rec.id] || {};
    el("site-detail").innerHTML = (viewMode === "xml")
      ? renderXml(c)
      : renderHtml(rec, c);
  }

  function renderHtml(rec, c) {
    var h = '<dl class="detail-dl">';
    function row(k, v) { if (v) h += "<dt>" + k + "</dt><dd>" + esc(v) + "</dd>"; }
    row("Type", rec.kind === "section" ? "section" : (rec.subtype || rec.kind));
    if (rec.parent) {
      var p = byId[rec.parent];
      h += '<dt>Parent</dt><dd><a href="#" data-goto="' + esc(rec.parent) + '">' +
           esc(p ? (p.title_en || rec.parent) : rec.parent) + "</a></dd>";
    }
    if (rec.volume || rec.kind === "section")
      row("Volume", volLabel(rec.volume));
    row("Province", [rec.province_en, rec.province_zh].filter(Boolean).join(" · "));
    row("Coordinates", rec.coordinates);
    var dsInfo = DATA_SOURCE_INFO[rec.data_source];
    if (dsInfo) h += '<dt>Source</dt><dd><a href="' + esc(dsInfo.url) + '" target="_blank" rel="noopener">' +
      esc(rec.data_source) + '</a> <span class="hp-ds-title">' + esc(dsInfo.title) + "</span></dd>";
    h += "</dl>";

    var summary = childSummary(rec);
    if (summary) h += '<div class="detail-section-head">' + summary + "</div>";

    // Description — from the record's own XML, whichever tier it is:
    // site → note type="description"; object → msContents summary / description
    // note; inscription → msContents summary.
    var desc = detailDesc(c.siteXml);
    if (desc) {
      h += '<div class="detail-section-head">Description</div>';
      h += '<div class="prose-body">' + esc(desc) + "</div>";
    } else if (c.proseXml) {
      h += '<div class="detail-section-head">Description</div>';
      h += '<div class="prose-body">' + teiBodyToHtml(c.proseXml) + "</div>";
    } else if (rec.has_description) {
      h += '<div class="prose-body"><em>Description file referenced but not loaded.</em></div>';
    }

    // Structure — objects + their inscription sigla (from the site index).
    h += relatedHtml(rec);

    setTimeout(bindGoto, 0);
    return h;
  }

  // pull a human description out of any EpiDoc-CN tier
  function detailDesc(xml) {
    var kind = xml && window.EpiDocCN ? EpiDocCN.detect(xml) : null;
    if (!kind) return "";
    try {
      if (kind === "site") {
        var found = "";
        (function walk(p) {
          if (!p || found) return;
          (p.notes || []).forEach(function (nn) { if (nn.type === "description" && !found) found = nn.xml; });
          (p.subsites || []).forEach(walk);
        })(EpiDocCN.parseSite(xml).place);
        return found;
      }
      if (kind === "objectfile") {
        var o = EpiDocCN.parseObject(xml).obj || {};
        var d = (o.msContents && (o.msContents.summaryZh || o.msContents.summaryEn)) || "";
        (o.notes || []).forEach(function (nn) { if (nn.type === "description" && !d) d = nn.xml; });
        return d;
      }
      if (kind === "inscription") {
        var mc = EpiDocCN.parseInscription(xml).msContents;
        return mc ? (mc.summaryZh || mc.summaryEn || "") : "";
      }
    } catch (e) {}
    return "";
  }

  // objects + inscription sigla under a record (site → ◆ objects → sigla)
  function relatedHtml(rec) {
    if (rec.kind === "object") {
      var s = siglaChips(rec.id);
      return s ? '<div class="detail-section-head">Inscriptions</div>' +
        '<div class="prose-body">' + s + "</div>" : "";
    }
    function lst(pid) {
      var objs = (byParent[pid] || [])
        .filter(function (k) { return k.kind !== "inscription"; }).slice().sort(kidSort);
      if (!objs.length) return "";
      return '<ul class="site-objects">' + objs.map(function (o) {
        var icon = o.kind === "object" ? "◆ " : "";
        var sig = siglaChips(o.id);
        return "<li>" + esc(icon) + '<a href="#" data-goto="' + esc(o.id) + '">' + label(o) + "</a>" +
          (sig ? ' <span class="sigla">── ' + sig + "</span>" : "") + lst(o.id) + "</li>";
      }).join("") + "</ul>";
    }
    var sub = lst(rec.id);
    return sub ? '<div class="detail-section-head">Objects &amp; inscriptions</div>' + sub : "";
  }

  function renderXml(c) {
    var h = "";
    if (c.siteXml) {
      h += '<div class="detail-section-head">Catalog (structured)</div>';
      h += '<pre class="site-xml">' + esc(c.siteXml) + "</pre>";
    }
    if (c.proseXml) {
      h += '<div class="detail-section-head">Description (TEI prose)</div>';
      h += '<pre class="prose-xml">' + esc(c.proseXml) + "</pre>";
    }
    return h || '<div class="prose-body" style="color:var(--text-muted)"><em>No XML.</em></div>';
  }

  function bindGoto() {
    document.querySelectorAll("#site-detail [data-goto]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        showDetail(a.getAttribute("data-goto"));
      });
    });
  }

  // ── minimal TEI body -> HTML ──────────────────────────────────────────────────

  function teiBodyToHtml(xml) {
    try {
      var doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) return "<em>Unparseable TEI.</em>";
      var bodies = doc.getElementsByTagNameNS(TEI, "body");
      var body = bodies.length ? bodies[0] : doc.documentElement;
      var out = nodeToHtml(body);
      return out.trim() ? out : "<em>(empty description)</em>";
    } catch (e) { return "<em>Error rendering description.</em>"; }
  }

  function nodeToHtml(node) {
    var out = "";
    for (var i = 0; i < node.childNodes.length; i++) {
      var n = node.childNodes[i];
      if (n.nodeType === 3) { out += esc(n.nodeValue); continue; }
      if (n.nodeType !== 1) continue;
      var name = n.localName || n.nodeName.split(":").pop();
      var inner = nodeToHtml(n);
      var blank = !inner.replace(/<br>/g, "").trim();
      switch (name) {
        case "head":    if (!blank) out += "<h4>" + inner + "</h4>"; break;
        case "p":       if (!blank) out += "<p>" + inner + "</p>"; break;
        case "div":     out += inner; break;
        case "lb":      out += "<br>"; break;
        case "hi":      out += "<em>" + inner + "</em>"; break;
        case "foreign": out += '<span class="foreign">' + inner + "</span>"; break;
        case "term":    out += '<span class="term">' + inner + "</span>"; break;
        case "title":   out += "<em>" + inner + "</em>"; break;
        case "note":    out += ' <span class="note">(' + inner + ")</span> "; break;
        case "ref": case "ptr": out += inner; break;
        case "list":    out += "<ul>" + inner + "</ul>"; break;
        case "item":    out += "<li>" + inner + "</li>"; break;
        default:        out += inner;
      }
    }
    return out;
  }

  // ── view toggle + search ─────────────────────────────────────────────────────

  function setView(mode) {
    viewMode = mode;
    el("view-html").classList.toggle("active", mode === "html");
    el("view-xml").classList.toggle("active", mode === "xml");
    if (selectedId && byId[selectedId]) renderDetail(byId[selectedId]);
  }

  document.addEventListener("DOMContentLoaded", function () {
    load();
    if (window.EpiCollections) EpiCollections.onChange(mergePrivate);
    el("view-html").addEventListener("click", function () { setView("html"); });
    el("view-xml").addEventListener("click", function () { setView("xml"); });
    var s = el("site-search");
    var t = null;
    s.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () { renderTree(s.value); }, 150);
    });
  });
})();
