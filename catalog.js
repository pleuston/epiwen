/* catalog.js — loads records from GitHub and renders the searchable catalog
 * on index.html. Pure DOM, no framework, no build step. */
(function () {
  "use strict";

  var OWNER  = "pleuston";
  var REPO   = "epiwen-epidoc-generator";
  var BRANCH = "main";
  var API    = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/records";
  var RAW    = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + BRANCH + "/records/";
  var GH_EDIT = "https://github.com/" + OWNER + "/" + REPO + "/edit/" + BRANCH + "/records/";

  var allRecords = [];  // populated after load
  var currentXml = ""; // xml shown in right pane

  // ---- fetch helpers -------------------------------------------------------
  function ghFetch(url) {
    return fetch(url, { headers: { Accept: "application/vnd.github.v3+json" } })
      .then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("GitHub API " + r.status);
        return r.json();
      });
  }
  function rawFetch(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }

  // ---- XML parsing ---------------------------------------------------------
  var NS = "http://www.tei-c.org/ns/1.0";
  function qns(node, tag) { return Array.from(node.getElementsByTagNameNS(NS, tag)); }
  function first(node, tag) { return node.getElementsByTagNameNS(NS, tag)[0] || null; }
  function txt(el) { return el ? el.textContent.trim() : ""; }

  function parseRecord(name, xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, "application/xml");
    var err = doc.getElementsByTagName("parsererror");
    if (err.length) return { name: name, titleEn: name, titleZh: "", when: "", dateText: "", parts: [] };

    var titles = qns(doc, "title");
    // titleStmt titles only (exclude msItem titles)
    var stmtTitles = titles.filter(function (t) {
      var p = t.parentNode; return p && p.localName === "titleStmt";
    });
    var titleEn = txt(stmtTitles.find(function (t) { return t.getAttribute("xml:lang") === "en"; }));
    var titleZh = txt(stmtTitles.find(function (t) { return t.getAttribute("xml:lang") === "zh-Hant"; }));

    var origDate = first(doc, "origDate");
    var when = origDate
      ? (origDate.getAttribute("when") || origDate.getAttribute("notBefore") || "")
      : "";
    var dateText = txt(origDate);

    var settlement = txt(first(doc, "settlement"));
    var region     = txt(first(doc, "region"));

    // textparts
    var parts = [];
    qns(doc, "div").forEach(function (div) {
      if (div.getAttribute("type") !== "textpart") return;
      var n       = div.getAttribute("n") || "";
      var subtype = div.getAttribute("subtype") || "";
      var head    = txt(first(div, "head"));
      var lang    = div.getAttribute("xml:lang") || "";
      var msItems = qns(doc, "msItem");
      var msItem  = msItems.find(function (m) { return m.getAttribute("n") === n; }) || null;
      var itemTitles = msItem ? qns(msItem, "title") : [];
      var sutra = txt(itemTitles.find(function (t) { return t.getAttribute("xml:lang") === "zh-Hant"; })
                   || itemTitles[0] || null);
      parts.push({ n: n, subtype: subtype, head: head, lang: lang, sutra: sutra });
    });

    // single-text fallback (no textpart divs)
    if (!parts.length) {
      var msItems = qns(doc, "msItem");
      if (msItems.length) {
        var itemTitles = qns(msItems[0], "title");
        var sutra = txt(itemTitles.find(function (t) { return t.getAttribute("xml:lang") === "zh-Hant"; })
                     || itemTitles[0] || null);
        var locus = txt(first(msItems[0], "locus"));
        parts.push({ n: "1", subtype: "", head: locus, lang: "", sutra: sutra });
      }
    }

    return {
      name: name, titleEn: titleEn, titleZh: titleZh,
      when: when, dateText: dateText, settlement: settlement, region: region,
      parts: parts, rawXml: xmlText
    };
  }

  // ---- HTML helpers --------------------------------------------------------
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---- render --------------------------------------------------------------
  function renderCatalog(records) {
    var list = document.getElementById("catalog-list");
    if (!records.length) {
      list.innerHTML = '<div class="catalog-empty">' +
        'No records yet. <a href="editor.html">Add the first inscription →</a></div>';
      return;
    }
    list.innerHTML = "";
    records.forEach(function (rec) {
      list.appendChild(buildItem(rec));
    });
  }

  function buildItem(rec) {
    var item = document.createElement("div");
    item.className = "catalog-item";
    // search index: all text in lowercase
    var idx = [rec.name, rec.titleEn, rec.titleZh, rec.dateText, rec.settlement, rec.region]
      .concat(rec.parts.map(function (p) { return p.sutra + " " + p.head; }))
      .join(" ").toLowerCase();
    item.dataset.idx = idx;

    // monument row
    var monument = document.createElement("div");
    monument.className = "catalog-monument";

    var info = document.createElement("div");
    info.className = "catalog-info";
    info.innerHTML =
      '<code class="catalog-filename">' + esc(rec.name) + '</code>' +
      (rec.titleEn || rec.titleZh
        ? '<div class="catalog-title">' +
          (rec.titleEn ? '<span class="catalog-title-en">' + esc(rec.titleEn) + '</span>' : '') +
          (rec.titleZh ? '<span class="catalog-title-zh">' + esc(rec.titleZh) + '</span>' : '') +
          '</div>'
        : '') +
      ((rec.dateText || rec.when || rec.settlement)
        ? '<span class="catalog-date">' +
          esc([rec.dateText || rec.when, rec.settlement].filter(Boolean).join(' · ')) +
          '</span>'
        : '');

    var actions = document.createElement("div");
    actions.className = "catalog-actions";

    var previewBtn = document.createElement("button");
    previewBtn.type = "button"; previewBtn.className = "btn small";
    previewBtn.textContent = "Preview";
    previewBtn.addEventListener("click", function () { showPreview(rec, item); });

    var copyBtn = document.createElement("button");
    copyBtn.type = "button"; copyBtn.className = "btn small";
    copyBtn.textContent = "Copy XML";
    copyBtn.addEventListener("click", function () { flashCopy(rec.rawXml, copyBtn); });

    var editLink = document.createElement("a");
    editLink.href = GH_EDIT + encodeURIComponent(rec.name);
    editLink.target = "_blank"; editLink.rel = "noopener";
    editLink.className = "btn small";
    editLink.textContent = "Edit on GitHub";

    actions.appendChild(previewBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(editLink);
    monument.appendChild(info);
    monument.appendChild(actions);
    item.appendChild(monument);

    // textparts (indented)
    if (rec.parts.length) {
      var ul = document.createElement("ul");
      ul.className = "catalog-parts";
      rec.parts.forEach(function (p) {
        var li = document.createElement("li");
        li.className = "catalog-part";
        var label = p.head || (p.subtype || ("Text " + p.n));
        li.innerHTML =
          '<span class="catalog-part-label">' + esc(label) + '</span>' +
          (p.sutra ? ' <span class="catalog-part-sutra">' + esc(p.sutra) + '</span>' : '') +
          (p.lang  ? ' <code class="catalog-part-lang">'  + esc(p.lang)  + '</code>'  : '');
        ul.appendChild(li);
      });
      item.appendChild(ul);
    }

    return item;
  }

  // ---- preview pane --------------------------------------------------------
  var selectedItem = null;

  function showPreview(rec, item) {
    if (selectedItem) selectedItem.classList.remove("selected");
    selectedItem = item;
    item.classList.add("selected");

    document.getElementById("preview-title").textContent = rec.name;
    document.getElementById("preview-copy").style.display = "";
    var out = document.getElementById("preview-out");
    out.textContent = rec.rawXml;
    currentXml = rec.rawXml;
  }

  // ---- clipboard -----------------------------------------------------------
  function flashCopy(xml, btn) {
    if (!navigator.clipboard || !xml) return;
    navigator.clipboard.writeText(xml).then(function () {
      var prev = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(function () { btn.textContent = prev; }, 1800);
    });
  }

  // ---- search --------------------------------------------------------------
  function filterCatalog(term) {
    var q = term.toLowerCase();
    Array.prototype.forEach.call(document.querySelectorAll(".catalog-item"), function (el) {
      el.style.display = (!q || el.dataset.idx.indexOf(q) !== -1) ? "" : "none";
    });
  }

  // ---- init ----------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {

    document.getElementById("preview-copy").addEventListener("click", function () {
      flashCopy(currentXml, this);
    });

    document.getElementById("catalog-search").addEventListener("input", function () {
      filterCatalog(this.value);
    });

    ghFetch(API)
      .then(function (files) {
        if (!files) { renderCatalog([]); return; }

        var xmlFiles = files
          .filter(function (f) { return /\.xml$/i.test(f.name); })
          .sort(function (a, b) { return a.name.localeCompare(b.name); });

        if (!xmlFiles.length) { renderCatalog([]); return; }

        // fetch each XML; collect all, then render
        var records = [];
        var remaining = xmlFiles.length;
        var done = function () {
          records.sort(function (a, b) { return a.name.localeCompare(b.name); });
          allRecords = records;
          renderCatalog(records);
        };
        xmlFiles.forEach(function (f) {
          rawFetch(RAW + f.name)
            .then(function (xml) {
              records.push(parseRecord(f.name, xml));
            })
            .catch(function () {
              // skip broken files silently
            })
            .then(function () {
              remaining -= 1;
              if (!remaining) done();
            });
        });
      })
      .catch(function (e) {
        document.getElementById("catalog-list").innerHTML =
          '<div class="catalog-empty">Could not load records from GitHub: ' +
          esc(e.message) + '</div>';
      });
  });
})();
