/* modern-corpora-page.js — searchable register of modern (20th–21st c.) Chinese
 * epigraphic corpora, from the obsidian-vault geographic fan-out. Left tree facets
 * by national / province (region → province) / site (category → site) / supplement;
 * the right pane is a sortable, variant-folded table. Reads corpora.json (no auth). */
(function () {
  "use strict";
  var all = [], sel = null;   // sel = {section?, region?, province?, category?, site?}

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fold(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function el(id) { return document.getElementById(id); }
  function yearNum(r) { var m = String(r.year || "").match(/\d{4}/); return m ? parseInt(m[0], 10) : 0; }
  function matches(r, f) {
    if (!f) return true;
    if (f.section && r.section !== f.section) return false;
    if (f.region && r.region !== f.region) return false;
    if (f.province !== undefined && (r.province || "") !== f.province) return false;
    if (f.locality !== undefined && (r.locality || "") !== f.locality) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.site && r.site !== f.site) return false;
    return true;
  }

  // ── tree (region → province → county/locality · category → site) ──────────────
  var REGION_ORDER = ["華北", "東北", "華東", "中南", "西南", "西北", "港澳台"];
  function mk(label, sub, count, depth, onClick, hasChildren) {
    var row = document.createElement("div");
    row.className = "ct-row"; row.style.paddingLeft = (depth * 0.8) + "rem";
    row.innerHTML = '<span class="ct-caret' + (hasChildren ? "" : " leaf") + '">▶</span>' +
      '<span class="ct-label">' + esc(label) + (sub ? ' <span class="ct-zh">' + esc(sub) + "</span>" : "") +
      '</span><span class="ct-count">' + count + "</span>";
    row.addEventListener("click", onClick);
    return row;
  }
  function toggle(row, kids) { var c = row.querySelector(".ct-caret"); var open = kids.classList.toggle("open"); c.classList.toggle("open", open); }
  function leaf(parent, label, count, depth, filter) {
    var r = mk(label, "", count, depth, function () { setFilter(filter, r); }, false);
    parent.appendChild(r); return r;
  }
  function branch(parent, label, sub, count, depth, onSelect, buildKids) {
    var wrap = document.createElement("div"); wrap.className = "ct-node";
    var kids = document.createElement("div"); kids.className = "ct-children";
    var head = mk(label, sub, count, depth, function (e) {
      if (e.target.classList.contains("ct-caret")) toggle(head, kids);
      else if (onSelect) onSelect(head);
    }, true);
    wrap.appendChild(head); wrap.appendChild(kids); parent.appendChild(wrap);
    buildKids(kids);
  }
  function bucket(recs, key) {
    var t = {}; recs.forEach(function (r) { var k = r[key] || ""; (t[k] = t[k] || []).push(r); }); return t;
  }
  function bySize(o) { return Object.keys(o).sort(function (a, b) { return o[b].length - o[a].length || a.localeCompare(b); }); }

  function renderTree() {
    var box = el("ct-tree"); box.innerHTML = "";
    var rootRow = mk("All corpora", "", all.length, 0, function () { setFilter(null, rootRow); }, false);
    box.appendChild(rootRow);
    var nat = all.filter(function (r) { return r.section === "national"; });
    if (nat.length) { var natRow = mk("全國 national", "", nat.length, 0, function () { setFilter({ section: "national" }, natRow); }, false); box.appendChild(natRow); }

    // 省 → region → province → county/locality
    var prov = all.filter(function (r) { return r.section === "province"; });
    var byReg = bucket(prov, "region");
    branch(box, "省 by province", "", prov.length, 0, null, function (regBox) {
      REGION_ORDER.concat(Object.keys(byReg).filter(function (k) { return REGION_ORDER.indexOf(k) < 0; })).forEach(function (reg) {
        var recs = byReg[reg]; if (!recs) return;
        branch(regBox, reg, "", recs.length, 1, function (h) { setFilter({ section: "province", region: reg }, h); }, function (provBox) {
          var byP = bucket(recs, "province");
          if (byP[""]) leaf(provBox, "（全區 region-wide）", byP[""].length, 2, { section: "province", region: reg, province: "" });
          bySize(byP).forEach(function (p) {
            if (!p) return;
            branch(provBox, p, "", byP[p].length, 2, function (h) { setFilter({ province: p }, h); }, function (locBox) {
              var byL = bucket(byP[p], "locality");
              if (byL[""]) leaf(locBox, "（全省 province-wide）", byL[""].length, 3, { province: p, locality: "" });
              bySize(byL).forEach(function (l) { if (l) leaf(locBox, l, byL[l].length, 3, { province: p, locality: l }); });
            });
          });
        });
      });
    });

    // 名山與遺址 → category → site
    var site = all.filter(function (r) { return r.section === "site"; });
    var byCat = bucket(site, "category");
    branch(box, "名山與遺址 sites", "", site.length, 0, null, function (catBox) {
      bySize(byCat).forEach(function (cat) {
        branch(catBox, cat, "", byCat[cat].length, 1, function (h) { setFilter({ section: "site", category: cat }, h); }, function (siteBox) {
          var byS = bucket(byCat[cat], "site");
          bySize(byS).forEach(function (s) { if (s) leaf(siteBox, s, byS[s].length, 2, { site: s }); });
        });
      });
    });

    var sea = all.filter(function (r) { return r.section === "overseas"; });
    if (sea.length) { var seaRow = mk("東南亞 / overseas", "", sea.length, 0, function () { setFilter({ section: "overseas" }, seaRow); }, false); box.appendChild(seaRow); }
  }
  function setFilter(f, row) {
    sel = f;
    document.querySelectorAll(".ct-row.active").forEach(function (r) { r.classList.remove("active"); });
    if (row) row.classList.add("active");
    el("ct-search").value = ""; render();
  }

  // ── table ────────────────────────────────────────────────────────────────────
  var sortKey = "title", sortDir = "asc";
  var COLS = [
    { label: "Title 書名", key: "title" },
    { label: "Author 編者", key: "author" },
    { label: "Description", key: null },
    { label: "Year", key: "year", num: true },
    { label: "Publisher", key: "publisher" },
    { label: "Place", key: "place" },
    { label: "Holdings", key: null }
  ];
  function sortVal(r, key) {
    if (key === "title") return fold(r.title_zh || r.title_pinyin || "");
    if (key === "author") return fold(r.author || "");
    if (key === "year") return yearNum(r);
    if (key === "publisher") return fold(r.publisher || "");
    if (key === "place") return fold(r.place || "~");
    return "";
  }
  function cmp(a, b) {
    var va = sortVal(a, sortKey), vb = sortVal(b, sortKey);
    var p = (typeof va === "number") ? va - vb : String(va).localeCompare(String(vb));
    if (p !== 0) return sortDir === "desc" ? -p : p;
    return fold(a.title_zh || "").localeCompare(fold(b.title_zh || ""));
  }
  function catLink(r, lib) {
    var has = !!(r.isbn && r.isbn[0]), q = has ? r.isbn[0] : (r.title_zh || "");
    if (lib === "sbb") return (r.sbb_ppn && r.sbb_ppn[0]) ? "https://stabikat.de/Record/" + encodeURIComponent(r.sbb_ppn[0])
      : "https://stabikat.de/Search/Results?lookfor=" + encodeURIComponent(q) + "&type=" + (has ? "ISN" : "AllFields");
    if (lib === "k10") return "https://opac.k10plus.de/DB=2.1/CMD?ACT=SRCHA&IKT=" + (has ? "7" : "1016") + "&TRM=" + encodeURIComponent(q);
    if (lib === "harvard") return "https://hollis.harvard.edu/primo-explore/search?query=any,contains," + encodeURIComponent(q) + "&tab=everything&search_scope=everything&vid=HVD2&mode=basic";
    return "#";
  }
  function compactYear(r) {
    var y = String(r.year || ""); if (!y) return "—";
    var m = y.match(/(c\.\s*)?\d{4}\s*[–\-\/]\s*(\d{4}|今|present|ongoing)|(c\.\s*)?\d{4}|\d{3,4}0s|\d{1,2}(th|st|nd|rd)/);
    return m ? m[0].replace(/\s+/g, "") : y;
  }
  function holds(r) {
    var h = r.holdings || {}, b = [];
    function lib(cls, lbl, key, ttl) {
      return '<a class="mc-hold ' + cls + '" target="_blank" rel="noopener" href="' + esc(catLink(r, key)) +
        '" title="' + ttl + ' — search catalogue ↗">' + lbl + " ↗</a>";
    }
    if (h.harvard) b.push(lib("harvard", "Harvard", "harvard", "Harvard-Yenching (HOLLIS)"));
    if (h.sbb) {
      if (r.sbb_signatur && r.sbb_signatur.length) {
        var sig = r.sbb_signatur;
        var first = sig[0].replace(/\s*[;,].*$/, "").replace(/[-–]\d+$/, "");   // base shelf mark (drop volume suffix)
        var ttl = "Staatsbibliothek zu Berlin · Signatur " + sig.join(", ");
        b.push('<a class="mc-hold sbb" target="_blank" rel="noopener" href="' + esc(catLink(r, "sbb")) +
          '" title="' + esc(ttl) + ' ↗">SBB ' + esc(first) + (sig.length > 1 ? ' <span class="mc-more">+' + (sig.length - 1) + '</span>' : '') + '</a>');
        if (r.sbb_online && r.sbb_online.length)
          b.push('<a class="mc-hold sbb-dig" target="_blank" rel="noopener" href="' + esc(r.sbb_online[0]) +
            '" title="Staatsbibliothek zu Berlin — digitised table of contents ↗">TOC ↗</a>');
      } else b.push(lib("sbb", "SBB", "sbb", "Staatsbibliothek zu Berlin (StaBiKat)"));
    }
    if (h.k10plus) b.push(lib("k10", "K10+", "k10", "K10plus union catalogue"));
    if (h.vault) b.push('<span class="mc-hold vault" title="already in vault">vault</span>');
    if ((r.web || r.biblio) && !b.length) {
      var ev = r.evidence ? String(r.evidence).match(/https?:\/\/[^\s)]+/) : null;
      if (r.verification_pending) {
        b.push(ev ? '<a class="mc-hold pending" target="_blank" rel="noopener" href="' + esc(ev[0]) + '" title="attested in 新編碑刻集書目 (李仁淵 / 海交史); catalogue verification pending ↗">海交史 ⧗</a>'
                  : '<span class="mc-hold pending" title="verification pending">pending</span>');
      } else {
        var c = r.web_catalog || "";
        var short = /ndl/i.test(c) ? "NDL" : /cinii|nii/i.test(c) ? "CiNii" : /worldcat/i.test(c) ? "WorldCat"
          : /k10|gvk/i.test(c) ? "K10+" : /nlc|国家图书馆|國家圖書館|国图/i.test(c) ? "NLC"
          : /讀秀|读秀|duxiu/i.test(c) ? "讀秀" : /harvard|hollis/i.test(c) ? "Harvard" : /stabikat|sbb/i.test(c) ? "SBB"
          : (c ? "catalog" : "catalog");
        var lbl = short + " ✓";
        var ttl = "confirmed in " + (c || "a library catalogue") + " ↗";
        b.push(ev ? '<a class="mc-hold web ok" target="_blank" rel="noopener" href="' + esc(ev[0]) + '" title="' + esc(ttl) + '">' + lbl + ' ↗</a>'
                  : '<span class="mc-hold web ok" title="' + esc(ttl) + '">' + lbl + '</span>');
      }
    }
    return b.join("");
  }
  function cleanAuthor(a) { return (a || "").replace(/\s*\([^)]*\)/g, "").replace(/\s+(主編|編|輯校|編著|著|纂)$/,"").trim(); }
  function rowHtml(r) {
    var place = r.section === "national" ? "全國 national"
      : (r.section === "province" && !r.province) ? (r.region || "") + "地區"
      : (r.place || "—");
    var sub = (r.locality && r.locality !== place) ? r.locality : (r.admin || "");
    var desc = r.scope || "";
    return '<tr>' +
      '<td><div class="ct-name">' + (r.gapfill ? '<span class="mc-plus" title="gap-fill addition">✚ </span>' : "") +
        '<a href="corpus.html?id=' + encodeURIComponent(r.id) + '">' + esc(r.title_zh || "?") + "</a></div>" +
        (r.title_pinyin ? '<div class="ct-city">' + esc(r.title_pinyin) + "</div>" : "") + "</td>" +
      "<td>" + (r.author ? esc(cleanAuthor(r.author)) : '<span class="ct-city">—</span>') + "</td>" +
      '<td class="mc-desc">' + (desc ? '<span title="' + esc(desc) + '">' + esc(desc.length > 70 ? desc.slice(0, 68) + "…" : desc) + "</span>" : '<span class="ct-city">—</span>') + "</td>" +
      '<td class="num mc-year" title="' + esc(r.year || "") + '">' + (r.year ? esc(compactYear(r)) : "—") + "</td>" +
      "<td>" + (r.publisher ? '<span class="ct-zh">' + esc(r.publisher.replace(/\s*\([^)]*\)/g, "")) + "</span>" : '<span class="ct-city">—</span>') + "</td>" +
      '<td class="mc-place">' + esc(place) + (sub ? '<div class="ct-city">' + esc(sub) + "</div>" : "") + "</td>" +
      "<td>" + (holds(r) || '<span class="ct-city">—</span>') + "</td></tr>";
  }
  function render() {
    var q = fold(el("ct-search").value.trim());
    var list = all.filter(function (r) { return matches(r, sel); });
    if (q) list = list.filter(function (r) {
      return fold((r.title_zh || "") + " " + (r.title_pinyin || "") + " " + (r.author || "") + " " + (r.publisher || "") + " " + (r.place || "")).indexOf(q) !== -1;
    });
    list.sort(cmp);
    el("coll-title").textContent = !sel ? "All modern corpora"
      : sel.locality ? (sel.province + " · " + sel.locality)
      : (sel.locality === "" && sel.province) ? (sel.province + "（全省 province-wide）")
      : sel.province ? sel.province
      : (sel.province === "") ? ((sel.region || "") + "地區 (region-wide)")
      : sel.site ? sel.site
      : sel.category ? sel.category
      : sel.region ? sel.region
      : sel.section === "national" ? "全國 national series"
      : sel.section === "overseas" ? "東南亞 — overseas Chinese epigraphy" : "Modern corpora";
    var nh = list.filter(function (r) { return r.holdings && (r.holdings.harvard || r.holdings.sbb || r.holdings.k10plus); }).length;
    el("coll-crumb").textContent = list.length + " corpus" + (list.length === 1 ? "" : "/corpora") + (nh ? " · " + nh + " with located holdings" : "");
    if (!list.length) { el("coll-cards").innerHTML = '<p class="catalog-loading">No corpora here.</p>'; return; }
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
      else { sortKey = k; sortDir = (k === "year") ? "desc" : "asc"; }
      render();
    });
    fetch("modern-corpora.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      all = (d && d.corpora) || [];
      renderTree(); render();
    }).catch(function () { el("ct-tree").innerHTML = '<div class="catalog-loading">Could not load modern-corpora.json.</div>'; });
  });
})();
