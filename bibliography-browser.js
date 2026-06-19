/* bibliography-browser.js — two-pane bibliography browser with full MODS citation rendering */
(function () {
  "use strict";

  var NS = "http://www.loc.gov/mods/v3";
  var CJK_LANGS = ["zh", "ja", "ko"];

  var allRecords    = [];
  var currentFilter = "all";
  var currentQuery  = "";
  var yearMin       = 0;
  var yearMax       = 9999;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function toast(msg, isErr) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { el.className = ""; }, isErr ? 6000 : 3000);
  }

  function txt(el) {
    return el ? (el.textContent || "").trim() : "";
  }

  function getLang(el) {
    return el.getAttribute("lang") ||
           el.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang") || "";
  }

  function isCJK(lang) { return CJK_LANGS.indexOf(lang) !== -1; }

  function childrenNS(parent, local) {
    return Array.prototype.filter.call(parent.children, function (c) {
      return c.localName === local && c.namespaceURI === NS;
    });
  }

  // ── MODS parser ───────────────────────────────────────────────────────────

  function parseName(nameEl) {
    var parts = Array.prototype.slice.call(nameEl.getElementsByTagNameNS(NS, "namePart"));
    var roleEls = nameEl.getElementsByTagNameNS(NS, "roleTerm");
    var role = roleEls[0] ? txt(roleEls[0]).toLowerCase() : "author";

    function notCJK(p) { return !isCJK(getLang(p)); }

    var family = "", given = "";
    var prefList = ["", "de", "pinyin", "romaji", "mccunereischauer"];
    for (var pi = 0; pi < prefList.length; pi++) {
      var pref = prefList[pi];
      var fParts = parts.filter(function (p) {
        return p.getAttribute("type") === "family" &&
               (p.getAttribute("transliteration") || "") === pref && notCJK(p);
      });
      var gParts = parts.filter(function (p) {
        return p.getAttribute("type") === "given" &&
               (p.getAttribute("transliteration") || "") === pref && notCJK(p);
      });
      if (fParts.length) {
        family = txt(fParts[0]);
        given  = gParts.length ? txt(gParts[0]) : "";
        break;
      }
    }

    // CJK script form
    var cjkFamily = "", cjkGiven = "";
    parts.forEach(function (p) {
      if (!isCJK(getLang(p))) return;
      if (p.getAttribute("type") === "family") cjkFamily = txt(p);
      if (p.getAttribute("type") === "given")  cjkGiven  = txt(p);
    });

    return { family: family, given: given, cjkFamily: cjkFamily, cjkGiven: cjkGiven, role: role };
  }

  function parseTitleInfos(parent) {
    return childrenNS(parent, "titleInfo");
  }

  function getMainTitle(tis) {
    var ti = tis.find(function (t) { return !t.getAttribute("type") && !t.getAttribute("transliteration"); });
    if (!ti) ti = tis[0];
    if (!ti) return "";
    var t = ti.getElementsByTagNameNS(NS, "title")[0];
    var s = ti.getElementsByTagNameNS(NS, "subTitle")[0];
    return txt(t) + (s ? ": " + txt(s) : "");
  }

  function getTranslitTitle(tis) {
    var ti = tis.find(function (t) { return t.getAttribute("transliteration") && !t.getAttribute("type"); });
    if (!ti) return "";
    var t = ti.getElementsByTagNameNS(NS, "title")[0];
    var s = ti.getElementsByTagNameNS(NS, "subTitle")[0];
    return txt(t) + (s ? ": " + txt(s) : "");
  }

  function getNativeTitle(tis) {
    var ti = tis.find(function (t) {
      return !t.getAttribute("type") && !t.getAttribute("transliteration") && isCJK(getLang(t));
    });
    if (!ti) return "";
    return txt(ti.getElementsByTagNameNS(NS, "title")[0]);
  }

  function getTranslatedTitle(tis) {
    var ti = tis.find(function (t) { return t.getAttribute("type") === "translated"; });
    if (!ti) return "";
    return txt(ti.getElementsByTagNameNS(NS, "title")[0]);
  }

  function getReferenceTitle(tis) {
    var ti = tis.find(function (t) { return t.getAttribute("type") === "reference"; });
    if (!ti) return "";
    return txt(ti.getElementsByTagNameNS(NS, "title")[0]);
  }

  function getPublisher(originEl) {
    if (!originEl) return { place: "", publisher: "" };
    // Place: prefer non-CJK placeTerm with transliteration, then non-CJK, then first
    var placeTerms = Array.prototype.slice.call(originEl.getElementsByTagNameNS(NS, "placeTerm"));
    var pt = placeTerms.find(function (p) { return !isCJK(getLang(p)); }) || placeTerms[0];
    var place = txt(pt);

    // Publisher: nameParts inside publisher element
    var pubEl = originEl.getElementsByTagNameNS(NS, "publisher")[0];
    var publisher = "";
    if (pubEl) {
      var npEls = Array.prototype.slice.call(pubEl.getElementsByTagNameNS(NS, "namePart"));
      var np = npEls.find(function (p) { return !isCJK(getLang(p)); }) || npEls[0];
      if (np) {
        publisher = txt(np);
      } else {
        // Fallback: plain text inside publisher
        publisher = txt(pubEl);
      }
    }
    return { place: place, publisher: publisher };
  }

  function getYear(originEl) {
    if (!originEl) return "";
    var dis = Array.prototype.slice.call(originEl.getElementsByTagNameNS(NS, "dateIssued"));
    var di = dis.find(function (d) { return !d.getAttribute("point"); }) ||
             dis.find(function (d) { return d.getAttribute("point") === "start"; }) ||
             dis[0];
    if (!di) return "";
    return txt(di).slice(0, 4);
  }

  function parseMods(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, "application/xml");
    var root = doc.documentElement;
    if (root.localName === "parsererror") return null;
    var mods = (root.localName === "mods") ? root : root.getElementsByTagNameNS(NS, "mods")[0];
    if (!mods) return null;

    var titleInfos   = parseTitleInfos(mods);
    var nameEls      = childrenNS(mods, "name");
    var allNames     = nameEls.map(parseName);
    var authors      = allNames.filter(function (n) { return n.role === "author" || (!n.role); });
    var editors      = allNames.filter(function (n) { return n.role === "editor"; });
    var translators  = allNames.filter(function (n) { return n.role === "translator"; });

    var originEl = mods.getElementsByTagNameNS(NS, "originInfo")[0] || null;
    var pub  = getPublisher(originEl);
    var year = getYear(originEl);
    var issEl = originEl ? originEl.getElementsByTagNameNS(NS, "issuance")[0] : null;
    var issuance = issEl ? txt(issEl) : "";

    // Host related item
    var hostEl = null;
    childrenNS(mods, "relatedItem").forEach(function (ri) {
      if (ri.getAttribute("type") === "host") hostEl = ri;
    });

    var host = null;
    if (hostEl) {
      var hTis       = parseTitleInfos(hostEl);
      var hOriginEl  = hostEl.getElementsByTagNameNS(NS, "originInfo")[0] || null;
      var hIssEl     = hOriginEl ? hOriginEl.getElementsByTagNameNS(NS, "issuance")[0] : null;
      var hIssuance  = hIssEl ? txt(hIssEl) : "";
      var hPub       = getPublisher(hOriginEl);
      var hYear      = getYear(hOriginEl);

      var partEl   = hostEl.getElementsByTagNameNS(NS, "part")[0] || null;
      var volume = "", issue = "", pageStart = "", pageEnd = "", partDate = "";
      if (partEl) {
        var details = Array.prototype.slice.call(partEl.getElementsByTagNameNS(NS, "detail"));
        details.forEach(function (d) {
          var t = d.getAttribute("type");
          if (t === "volume")           volume = txt(d);
          else if (t === "issue" || t === "no") issue = txt(d);
        });
        var extEl = partEl.getElementsByTagNameNS(NS, "extent")[0];
        if (extEl) {
          pageStart = txt(extEl.getElementsByTagNameNS(NS, "start")[0]);
          pageEnd   = txt(extEl.getElementsByTagNameNS(NS, "end")[0]);
        }
        var pdEl = partEl.getElementsByTagNameNS(NS, "date")[0];
        partDate = pdEl ? txt(pdEl).slice(0, 4) : "";
      }

      var hNameEls  = childrenNS(hostEl, "name");
      var hEditors  = hNameEls.map(parseName).filter(function (n) {
        return n.role === "editor" || n.role === "author";
      });

      host = {
        title:      getMainTitle(hTis),
        translit:   getTranslitTitle(hTis),
        native:     getNativeTitle(hTis),
        translated: getTranslatedTitle(hTis),
        issuance:   hIssuance,
        year:       hYear || partDate,
        place:      hPub.place,
        publisher:  hPub.publisher,
        editors:    hEditors,
        volume:     volume,
        issue:      issue,
        pageStart:  pageStart,
        pageEnd:    pageEnd,
      };
      if (!year) year = host.year;
    }

    // Notes
    var notes = {};
    Array.prototype.slice.call(mods.getElementsByTagNameNS(NS, "note")).forEach(function (n) {
      var t = n.getAttribute("type") || "general";
      notes[t] = txt(n);
    });

    return {
      key:        mods.getAttribute("ID") || "",
      reference:  getReferenceTitle(titleInfos),
      title:      getMainTitle(titleInfos),
      translit:   getTranslitTitle(titleInfos),
      native:     getNativeTitle(titleInfos),
      translated: getTranslatedTitle(titleInfos),
      authors:    authors,
      editors:    editors,
      translators: translators,
      year:       year,
      place:      pub.place,
      publisher:  pub.publisher,
      issuance:   issuance,
      host:       host,
      notes:      notes
    };
  }

  // ── Citation formatter ─────────────────────────────────────────────────────

  function formatNameFirst(n) {
    // "Family, Given CJK" — first author
    var s = n.family || "";
    if (n.given) s += ", " + n.given;
    if (n.cjkFamily || n.cjkGiven) s += " " + (n.cjkFamily + n.cjkGiven);
    return s.trim();
  }

  function formatNameSubseq(n) {
    // "Given Family CJK" — subsequent authors
    var s = (n.given ? n.given + " " : "") + (n.family || "");
    if (n.cjkFamily || n.cjkGiven) s += " " + (n.cjkFamily + n.cjkGiven);
    return s.trim() || (n.cjkFamily + n.cjkGiven);
  }

  function formatNameList(names, roleLabel) {
    // roleLabel: "" | ", ed." | ", eds." | ", trans."
    if (!names.length) return "";
    var parts = [];
    names.forEach(function (n, i) {
      parts.push(i === 0 ? formatNameFirst(n) : formatNameSubseq(n));
    });
    var joined = "";
    if (parts.length === 1) joined = parts[0];
    else if (parts.length === 2) joined = parts[0] + " and " + parts[1];
    else joined = parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1];
    return joined + (roleLabel || "");
  }

  function nameBlock(parsed) {
    // Authors, or editors-as-authors for edited volumes
    if (parsed.authors.length) {
      return formatNameList(parsed.authors, "");
    } else if (parsed.editors.length) {
      var suf = parsed.editors.length === 1 ? ", ed." : ", eds.";
      return formatNameList(parsed.editors, suf);
    }
    return "";
  }

  function titleBlock(translit, native, main, translated, italic) {
    // Build: translit native [translated]
    // italic=true wraps the primary form in <em>
    var parts = [];
    var primary = translit || main || "";
    if (primary) parts.push(italic ? "<em>" + esc(primary) + "</em>" : esc(primary));
    if (native)  parts.push("<span lang=\"zh\">" + esc(native) + "</span>");
    if (translated && !primary.match(/[a-zA-Z]/)) {
      // only show translation when primary is non-Latin
      parts.push("[" + esc(translated) + "]");
    }
    return parts.join(" ");
  }

  function pagesStr(start, end) {
    if (!start) return "";
    return end && end !== start ? start + "–" + end : start;
  }

  function pubInfo(place, publisher, year) {
    var parts = [];
    if (place || publisher) parts.push((place ? esc(place) : "") + (publisher ? ": " + esc(publisher) : ""));
    if (year) parts.push(esc(year));
    return parts.join(", ");
  }

  function formatCitation(p) {
    // Returns an HTML string representing the full Chicago-style citation
    var html = "";
    var nb = nameBlock(p);
    if (nb) html += "<strong>" + esc(nb) + ".</strong> ";

    if (p.translators.length) {
      html += "Trans. " + esc(formatNameList(p.translators, "")) + ". ";
    }

    var h = p.host;

    if (!h) {
      // ── Monograph ────────────────────────────────────────────────────────
      html += titleBlock(p.translit, p.native, p.title, p.translated, true) + ". ";
      var pi = pubInfo(p.place, p.publisher, p.year);
      if (pi) html += pi + ".";

    } else if (h.issuance === "continuing") {
      // ── Journal article ───────────────────────────────────────────────────
      html += "“" + titleBlock(p.translit, p.native, p.title, p.translated, false) + ".” ";
      // Journal title
      html += titleBlock(h.translit, h.native, h.title, h.translated, true);
      // Volume/issue/year/pages
      var locStr = "";
      if (h.volume && h.issue)   locStr = " " + esc(h.volume) + ", no. " + esc(h.issue) + " (" + esc(h.year) + ")";
      else if (h.volume)         locStr = " " + esc(h.volume) + " (" + esc(h.year) + ")";
      else if (h.issue)          locStr = " no. " + esc(h.issue) + " (" + esc(h.year) + ")";
      else if (h.year)           locStr = " (" + esc(h.year) + ")";
      var pp = pagesStr(h.pageStart, h.pageEnd);
      if (locStr) html += locStr + ": " + (pp || "—") + ".";

    } else {
      // ── Book chapter ──────────────────────────────────────────────────────
      html += "“" + titleBlock(p.translit, p.native, p.title, p.translated, false) + ".” ";
      html += "In ";
      html += titleBlock(h.translit, h.native, h.title, h.translated, true);
      if (h.editors.length) {
        var edSuf = h.editors.length === 1 ? ", ed. " : ", eds. ";
        html += edSuf + esc(formatNameList(h.editors, ""));
      }
      html += ". ";
      var pi2 = pubInfo(h.place, h.publisher, h.year || p.year);
      if (pi2) html += pi2;
      var pp2 = pagesStr(h.pageStart, h.pageEnd);
      if (pp2) html += ", " + pp2;
      html += ".";
    }

    return html;
  }

  // ── Load index ────────────────────────────────────────────────────────────

  function loadIndex() {
    var list = document.getElementById("biblio-list");
    list.innerHTML = '<div class="catalog-loading">Loading bibliography index…</div>';
    fetch("data/biblio-index.json?v=" + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        allRecords = data;
        renderList();
      })
      .catch(function (err) {
        list.innerHTML = '<div class="catalog-loading">Error: ' + esc(err.message) + '</div>';
      });
  }

  // ── Filter + render list ──────────────────────────────────────────────────

  function filteredRecords() {
    var q = currentQuery.toLowerCase();
    return allRecords.filter(function (r) {
      if (currentFilter !== "all" && r.pub_type !== currentFilter) return false;
      var yr = parseInt(r.year, 10) || 0;
      if (yearMin && yr && yr < yearMin) return false;
      if (yearMax < 9999 && yr && yr > yearMax) return false;
      if (q) {
        var hay = [r.reference || "", r.title || "", r.title_zh || "",
                   (r.author || []).join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderList() {
    var recs = filteredRecords();
    var countEl = document.getElementById("biblio-count");
    if (countEl) countEl.textContent = recs.length + " of " + allRecords.length;
    var list = document.getElementById("biblio-list");
    if (!recs.length) {
      list.innerHTML = '<div class="catalog-loading">No records match.</div>';
      return;
    }
    var frag = document.createDocumentFragment();
    recs.forEach(function (rec) { frag.appendChild(buildListItem(rec)); });
    list.innerHTML = "";
    list.appendChild(frag);
  }

  function buildListItem(rec) {
    var div = document.createElement("div");
    div.className = "catalog-item";
    div.dataset.biblioKey = rec.key;

    var info = document.createElement("div");
    info.className = "catalog-item-info";

    var refEl = document.createElement("div");
    refEl.className = "catalog-title";
    refEl.textContent = rec.reference || rec.key;
    info.appendChild(refEl);

    if (rec.title) {
      var tEl = document.createElement("div");
      tEl.className = "catalog-date";
      tEl.textContent = rec.title.length > 72 ? rec.title.slice(0, 70) + "…" : rec.title;
      info.appendChild(tEl);
    }

    div.appendChild(info);
    div.addEventListener("click", function () { selectRecord(rec, div); });
    return div;
  }

  function selectRecord(rec, itemEl) {
    var prev = document.querySelector(".catalog-item.selected");
    if (prev) prev.classList.remove("selected");
    if (itemEl) itemEl.classList.add("selected");
    showDetailLoading(rec);
  }

  // ── Detail pane ───────────────────────────────────────────────────────────

  function showDetailLoading(rec) {
    var titleEl = document.getElementById("preview-title");
    if (titleEl) titleEl.textContent = rec.reference || rec.key;
    var contentEl = document.getElementById("biblio-detail-content");
    if (contentEl) contentEl.innerHTML = '<div class="catalog-loading">Loading…</div>';

    // Fetch full MODS XML (relative URL works both locally and on Pages)
    var relPath = "biblio/" + rec.group + "/" + rec.key + ".xml";
    fetch(relPath)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (xmlText) {
        var parsed = parseMods(xmlText);
        showDetailFull(rec, parsed, xmlText);
      })
      .catch(function (err) {
        showDetailFallback(rec, err.message);
      });
  }

  function showDetailFull(rec, parsed, rawXml) {
    var titleEl = document.getElementById("preview-title");
    if (titleEl) titleEl.textContent = rec.reference || rec.key;
    var contentEl = document.getElementById("biblio-detail-content");
    if (!contentEl) return;

    var html = '<div style="padding:1rem 1.2rem">';

    // Full citation block
    html += '<div class="biblio-citation" style="font-size:.97em;line-height:1.7;margin-bottom:1.1rem">';
    if (parsed) {
      html += formatCitation(parsed);
    } else {
      html += "<em>Could not parse MODS record.</em>";
    }
    html += '</div>';

    // Metadata strip
    html += '<div class="biblio-meta" style="font-size:.8em;color:var(--text-muted);margin-bottom:.9rem;display:flex;gap:1rem;flex-wrap:wrap">';
    html += '<span><strong>Key</strong> <code>' + esc(rec.key) + '</code></span>';
    html += '<span><strong>Type</strong> ' + esc(rec.pub_type || "—") + '</span>';
    html += '<span><strong>Group</strong> ' + esc(rec.group || "—") + '</span>';
    html += '</div>';

    // Actions
    html += '<div style="display:flex;gap:.5rem;flex-wrap:wrap">';
    html += '<button class="btn small primary" id="biblio-edit-btn">Edit</button>';
    html += '<button class="btn small" id="biblio-copy-btn">Copy XML</button>';
    html += '</div>';
    html += '</div>';

    contentEl.innerHTML = html;

    document.getElementById("biblio-edit-btn").addEventListener("click", function () {
      sessionStorage.setItem("epiwen_preload_biblio", JSON.stringify({
        key:      rec.key,
        group:    rec.group,
        reference: rec.reference,
        pub_type: rec.pub_type,
        xml:      rawXml
      }));
      window.location.href = "biblio-editor.html";
    });

    document.getElementById("biblio-copy-btn").addEventListener("click", function () {
      navigator.clipboard.writeText(rawXml)
        .then(function () { toast("XML copied to clipboard"); })
        .catch(function (e) { toast("Copy failed: " + e.message, true); });
    });
  }

  function showDetailFallback(rec, errMsg) {
    var contentEl = document.getElementById("biblio-detail-content");
    if (!contentEl) return;
    contentEl.innerHTML =
      '<div style="padding:1rem 1.2rem">' +
      '<p class="catalog-date">Could not load XML: ' + esc(errMsg) + '</p>' +
      '<table class="docs-table"><tbody>' +
      '<tr><th>Reference</th><td>' + esc(rec.reference || rec.key) + '</td></tr>' +
      '<tr><th>Author(s)</th><td>' + esc((rec.author || []).join("; ")) + '</td></tr>' +
      '<tr><th>Year</th><td>' + esc(rec.year || "—") + '</td></tr>' +
      '<tr><th>Type</th><td>' + esc(rec.pub_type || "—") + '</td></tr>' +
      '</tbody></table></div>';
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    loadIndex();

    document.getElementById("biblio-search").addEventListener("input", function () {
      currentQuery = this.value.trim();
      renderList();
    });

    document.querySelectorAll(".biblio-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".biblio-tab-btn").forEach(function (b) {
          b.classList.remove("active");
        });
        this.classList.add("active");
        currentFilter = this.dataset.filter;
        renderList();
      });
    });

    var yearMinEl = document.getElementById("year-min");
    var yearMaxEl = document.getElementById("year-max");
    if (yearMinEl) yearMinEl.addEventListener("input", function () {
      yearMin = parseInt(this.value, 10) || 0;
      renderList();
    });
    if (yearMaxEl) yearMaxEl.addEventListener("input", function () {
      yearMax = parseInt(this.value, 10) || 9999;
      renderList();
    });
  });
})();
