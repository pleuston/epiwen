/* epidoc-cn.js — shared model for the Epiwen / EpiDoc-CN profile (sample shape 2026-07).
 *
 * The three-level model: SITE (TEI <place>) → OBJECT (TEI <object>) → INSCRIPTION
 * (EpiDoc <msDesc> + delegated <div type="edition">), mutually linked; controlled
 * vocabularies resolve against epiwen-taxonomies.xml (@ana="#category.id").
 *
 * Provides, on window.EpiDocCN:
 *   detect(xml)            -> "site" | "objectfile" | "inscription" | "taxonomy" | null
 *   parseSite / parseObject / parseInscription (xml -> state)
 *   buildSite / buildObject / buildInscription (state -> xml)
 *   parseTaxonomies(xml)   -> { objectTypes:[{id,zh,en,ref}], materials:[…], … }
 *   loadTaxonomies()       -> Promise<tax> (collection epidoc-cn, bundled fallback)
 *
 * Fidelity rule: everything the forms model is structured state; every element the
 * forms do NOT model is captured verbatim (inner XML) in `_x` raw buckets and
 * re-emitted on build, so editing never silently drops encoded data. XML comments
 * are not preserved (they are documentation, not data); the samples' upstream-wart
 * notes are elements and survive.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EpiDocCN = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TEI_NS = "http://www.tei-c.org/ns/1.0";
  var XML_NS = "http://www.w3.org/XML/1998/namespace";

  // ---------------------------------------------------------------- utilities
  function ln(el) { return el.localName || String(el.nodeName).replace(/^.*:/, ""); }
  function kids(el, name) {
    var out = [];
    if (!el) return out;
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 1 && (!name || ln(n) === name)) out.push(n);
    }
    return out;
  }
  function firstKid(el, name) { return kids(el, name)[0] || null; }
  function desc(el, name) {
    var out = [], all = el ? el.getElementsByTagName("*") : [];
    for (var i = 0; i < all.length; i++) if (ln(all[i]) === name) out.push(all[i]);
    return out;
  }
  function attr(el, name) { return el ? (el.getAttribute(name) || "") : ""; }
  function xmlId(el) { return el ? (el.getAttributeNS(XML_NS, "id") || el.getAttribute("xml:id") || "") : ""; }
  function xmlLang(el) { return el ? (el.getAttributeNS(XML_NS, "lang") || el.getAttribute("xml:lang") || "") : ""; }
  function txt(el) { return el ? String(el.textContent || "").trim() : ""; }
  function collapse(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  var _ser = null;
  function serializeNode(node) {
    if (!_ser) _ser = new XMLSerializer();
    return _ser.serializeToString(node)
      .replace(/ xmlns="http:\/\/www\.tei-c\.org\/ns\/1\.0"/g, "");
  }
  /* inner XML of an element, TEI default-ns declarations stripped, trimmed.
   * Comments are KEPT (consistent with outer()) — a comment-only element like
   * the template's <funder><!-- {confirm} --></funder> must survive. */
  function inner(el) {
    if (!el) return "";
    var s = "";
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      s += n.nodeType === 3 ? escText(n.nodeValue) : serializeNode(n);
    }
    return s.replace(/^\s+|\s+$/g, "");     // full end-trim: "\n  <ab/>" and "  <ab/>" must round-trip alike
  }
  /* whole element as raw XML (for _x buckets) */
  function outer(el) { return serializeNode(el); }

  function escText(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escAttr(s) { return escText(s).replace(/"/g, "&quot;"); }

  // ------------------------------------------------------------- node builder
  // N(tag, attrs, ...children) -> node | null (pruned when empty)
  // NK = keep even if empty; RAW(xml) = verbatim fragment; C(text) = comment
  function clean(attrs) {
    var out = {};
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v != null && String(v).trim() !== "") out[k] = String(v).trim();
    });
    return out;
  }
  function flat(arr) {
    var out = [];
    arr.forEach(function (c) {
      if (Array.isArray(c)) out = out.concat(flat(c));
      else if (c != null && !(typeof c === "string" && c === "")) out.push(c);
    });
    return out;
  }
  function N(tag, attrs) {
    var ch = flat([].slice.call(arguments, 2));
    var a = clean(attrs);
    if (!Object.keys(a).length && !ch.length) return null;
    return { tag: tag, attrs: a, ch: ch };
  }
  function NK(tag, attrs) {
    return { tag: tag, attrs: clean(attrs), ch: flat([].slice.call(arguments, 2)) };
  }
  function RAW(xml) { return xml && String(xml).trim() ? { raw: String(xml) } : null; }

  function ser(node, depth) {
    var pad = new Array(depth + 1).join("  ");
    if (node == null) return "";
    if (typeof node === "string") return pad + escText(node);
    if (node.raw != null) {
      // verbatim fragment: re-indent its first line only; keep internal layout
      return node.raw.split("\n").map(function (l, i) {
        return i === 0 ? pad + l.replace(/^\s+/, "") : l;
      }).join("\n");
    }
    var a = Object.keys(node.attrs).map(function (k) {
      return " " + k + '="' + escAttr(node.attrs[k]) + '"';
    }).join("");
    if (!node.ch.length) return pad + "<" + node.tag + a + "/>";
    if (node.ch.length === 1 && typeof node.ch[0] === "string")
      return pad + "<" + node.tag + a + ">" + escText(node.ch[0]) + "</" + node.tag + ">";
    if (node.ch.length === 1 && node.ch[0] && node.ch[0].raw != null && node.ch[0].raw.indexOf("\n") === -1)
      return pad + "<" + node.tag + a + ">" + node.ch[0].raw + "</" + node.tag + ">";
    var innerStr = node.ch.map(function (c) { return ser(c, depth + 1); })
      .filter(function (s) { return s !== ""; }).join("\n");
    return pad + "<" + node.tag + a + ">\n" + innerStr + "\n" + pad + "</" + node.tag + ">";
  }

  // ------------------------------------------------------------- fixed blocks
  var PREFIXES = [
    { ident: "crm", pattern: "(.+)", repl: "http://www.cidoc-crm.org/cidoc-crm/$1" },
    { ident: "crmtex", pattern: "(.+)", repl: "http://www.cidoc-crm.org/extensions/crmtex/$1" },
    { ident: "sutras", pattern: "(.+)", repl: "https://github.com/StoneSutras/sutras-data/blob/master/$1" }
  ];
  function prefixDefNode(list) {
    var src = (list && list.length) ? list : PREFIXES;
    return N("listPrefixDef", null, src.map(function (p) {
      return N("prefixDef", { ident: p.ident, matchPattern: p.pattern, replacementPattern: p.repl });
    }));
  }
  function parsePrefixes(doc) {
    return desc(doc.documentElement, "prefixDef").map(function (p) {
      return { ident: attr(p, "ident"), pattern: attr(p, "matchPattern"), repl: attr(p, "replacementPattern") };
    });
  }

  function availabilityNode(av) {
    av = av || {};
    return N("availability", { status: av.status || "restricted" },
      RAW("<p>" + escText(av.text || "Draft sample, not for publication.") + "</p>"),
      // licence rides INSIDE availability (0.1-sample header template)
      av.licence ? N("licence", { target: av.licence.target }, RAW(av.licence.xml)) : null,
      (av._x || []).map(RAW));
  }

  // ------------------------------------------------------------------- detect
  function parseDoc(xml) {
    var doc = new DOMParser().parseFromString(xml, "application/xml");
    return doc.getElementsByTagName("parsererror").length ? null : doc;
  }
  function detect(xml) {
    var doc = typeof xml === "string" ? parseDoc(xml) : xml;
    if (!doc || !doc.documentElement) return null;
    var rootEl = doc.documentElement;
    if (ln(rootEl) !== "TEI") return null;
    if (desc(rootEl, "classDecl").length && desc(rootEl, "taxonomy").length) return "taxonomy";
    if (desc(rootEl, "listPlace").length) return "site";
    if (desc(rootEl, "listObject").length) return "objectfile";
    if (desc(rootEl, "msDesc").length) return "inscription";
    // a site-DESCRIPTION document: prose body, place metadata carried in the
    // teiHeader (profileDesc/settingDesc/place). Rendered as a site's prose;
    // not itself a catalog row.
    if (desc(rootEl, "settingDesc").length &&
        desc(desc(rootEl, "settingDesc")[0], "place").length) return "sitedesc";
    return null;
  }

  // ------------------------------------------------------------ shared pieces
  function parseHeaderCommon(doc) {
    var out = { titles: [], titleZh: "", titleEn: "", authority: "", idnoType: "", idno: "",
                availability: null, sourceBibls: [], prefixes: [],
                respStmts: [], funder: null, editionStmt: null, encodingItems: null };
    var titleStmt = desc(doc.documentElement, "titleStmt")[0];
    kids(titleStmt, "title").forEach(function (t) {
      var item = { lang: xmlLang(t), type: attr(t, "type"), text: collapse(txt(t)) };
      out.titles.push(item);
      if (item.lang === "zh" && !item.type && !out.titleZh) out.titleZh = item.text;
      else if (item.lang === "en" && !item.type && !out.titleEn) out.titleEn = item.text;
    });
    // display fallbacks when every title is typed (e.g. only @type="abbreviated")
    if (!out.titleZh) { var z = out.titles.filter(function (t) { return t.lang === "zh"; })[0]; if (z) out.titleZh = z.text; }
    if (!out.titleEn) { var e = out.titles.filter(function (t) { return t.lang === "en"; })[0]; if (e) out.titleEn = e.text; }
    // 0.1-sample boilerplate: respStmt(s) + funder in titleStmt, editionStmt after it
    kids(titleStmt, "respStmt").forEach(function (rs) {
      out.respStmts.push({ resp: collapse(txt(firstKid(rs, "resp"))), name: collapse(txt(firstKid(rs, "name"))) });
    });
    var funderEl = firstKid(titleStmt, "funder");
    if (funderEl) out.funder = { xml: inner(funderEl) };
    var edStmt = desc(doc.documentElement, "editionStmt")[0];
    if (edStmt) {
      var edEl = firstKid(edStmt, "edition");
      out.editionStmt = { n: attr(edEl, "n"), text: collapse(txt(edEl)) };
    }
    var pub = desc(doc.documentElement, "publicationStmt")[0];
    out.authority = txt(firstKid(pub, "authority"));
    var idnoEl = firstKid(pub, "idno");
    if (idnoEl) { out.idnoType = attr(idnoEl, "type"); out.idno = txt(idnoEl); }
    var avEl = firstKid(pub, "availability");
    if (avEl) {
      out.availability = { status: attr(avEl, "status"), text: "", licence: null, _x: [] };
      kids(avEl).forEach(function (k) {
        var name = ln(k);
        if (name === "p" && !out.availability.text) out.availability.text = collapse(txt(k));
        else if (name === "licence") out.availability.licence = { target: attr(k, "target"), xml: inner(k) };
        else out.availability._x.push(outer(k));
      });
    }
    var srcDesc = desc(doc.documentElement, "sourceDesc")[0];
    kids(srcDesc, "bibl").forEach(function (b) { out.sourceBibls.push(inner(b)); });
    out.prefixes = parsePrefixes(doc);
    // encodingDesc children in DOCUMENT ORDER (projectDesc / editorialDecl /
    // listPrefixDef / …): prefixes stay editable, everything else rides raw.
    var encEl = desc(doc.documentElement, "encodingDesc")[0];
    if (encEl) {
      out.encodingItems = kids(encEl).map(function (k) {
        return ln(k) === "listPrefixDef" ? { kind: "prefixes" } : { kind: "raw", xml: outer(k) };
      });
    }
    return out;
  }
  function titleNodes(st) {
    if (st.titles && st.titles.length) {
      return st.titles.map(function (t) {
        return t.text ? N("title", { "xml:lang": t.lang, type: t.type }, t.text) : null;
      });
    }
    return [st.titleZh ? N("title", { "xml:lang": "zh" }, st.titleZh) : null,
            st.titleEn ? N("title", { "xml:lang": "en" }, st.titleEn) : null];
  }
  function titleStmtNode(st) {
    return NK("titleStmt", null, titleNodes(st),
      (st.respStmts || []).map(function (rs) {
        return N("respStmt", null,
          N("resp", null, rs.resp), rs.name ? N("name", null, rs.name) : null);
      }),
      st.funder ? N("funder", null, RAW(st.funder.xml)) : null);
  }
  function editionStmtNode(st) {
    return st.editionStmt
      ? N("editionStmt", null, N("edition", { n: st.editionStmt.n }, st.editionStmt.text))
      : null;
  }
  function headerNodes(st, defIdnoType) {
    return NK("fileDesc", null,
      titleStmtNode(st),
      editionStmtNode(st),
      NK("publicationStmt", null,
        N("authority", null, st.authority || "Epiwen / EpiDoc-CN profile — sample"),
        N("idno", { type: st.idnoType || defIdnoType }, st.idno),
        availabilityNode(st.availability)),
      NK("sourceDesc", null,
        (st.sourceBibls || []).map(function (b) { return N("bibl", null, RAW(b)); }),
        st._sourceExtra ? st._sourceExtra.map(RAW) : null));
  }
  function encodingNode(st) {
    // preserve the parsed child order (projectDesc / editorialDecl / listPrefixDef);
    // docs authored fresh in the editors get the prefix block alone.
    if (st.encodingItems && st.encodingItems.length) {
      return N("encodingDesc", null, st.encodingItems.map(function (it) {
        return it.kind === "prefixes" ? prefixDefNode(st.prefixes) : RAW(it.xml);
      }));
    }
    return N("encodingDesc", null, prefixDefNode(st.prefixes), (st._encodingExtra || []).map(RAW));
  }

  /* term-carrying classified element: <objectType ana ref><term zh/><term en/></objectType> */
  function parseClassified(el) {
    if (!el) return null;
    var o = { ana: attr(el, "ana"), ref: attr(el, "ref"), zh: "", en: "", text: "" };
    kids(el, "term").forEach(function (t) {
      if (xmlLang(t) === "zh") o.zh = txt(t);
      else if (xmlLang(t) === "en") o.en = collapse(txt(t));
    });
    if (!kids(el, "term").length) o.text = collapse(txt(el));
    return (o.ana || o.ref || o.zh || o.en || o.text) ? o : null;
  }
  function classifiedNode(tag, o, extraAttrs) {
    if (!o || !(o.ana || o.ref || o.zh || o.en || o.text)) return null;
    var a = Object.assign({ ana: o.ana, ref: o.ref }, extraAttrs || {});
    if (o.text && !o.zh && !o.en) return N(tag, a, o.text);
    return N(tag, a,
      o.zh ? N("term", { "xml:lang": "zh" }, o.zh) : null,
      o.en ? N("term", { "xml:lang": "en" }, o.en) : null);
  }

  /* dimensions: { type, unit, parts:[{el,n,unit,atLeast,atMost,text}] } */
  function parseDims(el) {
    var d = { type: attr(el, "type"), n: attr(el, "n"), unit: attr(el, "unit"), parts: [] };
    kids(el).forEach(function (p) {
      d.parts.push({ el: ln(p), n: attr(p, "n"), unit: attr(p, "unit"),
                     atLeast: attr(p, "atLeast"), atMost: attr(p, "atMost"), text: txt(p) });
    });
    return d;
  }
  function dimsNode(d) {
    if (!d || !d.parts || !d.parts.length) return null;
    return N("dimensions", { type: d.type, n: d.n, unit: d.unit }, d.parts.map(function (p) {
      return N(p.el || "height", { n: p.n, unit: p.unit, atLeast: p.atLeast, atMost: p.atMost }, p.text);
    }));
  }

  /* bilingual paragraphs + typed notes: condition, decoNote, provenance …
   * pZh/pEn hold the first plain paragraph per language as INNER XML (mixed
   * content like <orgName> in provenance survives); paragraphs carrying
   * @corresp/@ana (per-edition statements in the combined/monolith shape) and
   * any further plain ones ride in psExtra, order-preserved after the pair. */
  function parsePs(el) {
    var o = { pZh: "", pEn: "", psExtra: [], notes: [] };
    kids(el, "p").forEach(function (p) {
      var corresp = attr(p, "corresp"), ana = attr(p, "ana");
      var isZh = xmlLang(p) === "zh";
      if (!corresp && !ana && isZh && !o.pZh) o.pZh = inner(p).trim();
      else if (!corresp && !ana && !isZh && !o.pEn) o.pEn = inner(p).trim();
      else o.psExtra.push({ lang: xmlLang(p), corresp: corresp, ana: ana, xml: inner(p).trim() });
    });
    kids(el, "note").forEach(function (nEl) {
      o.notes.push({ type: attr(nEl, "type"), lang: xmlLang(nEl), xml: inner(nEl) });
    });
    return o;
  }
  function psNodes(o) {
    if (!o) return [];
    return flat([
      o.pZh ? N("p", { "xml:lang": "zh" }, RAW(o.pZh)) : null,
      o.pEn ? N("p", { "xml:lang": "en" }, RAW(o.pEn)) : null,
      (o.psExtra || []).map(function (pp) {
        return N("p", { "xml:lang": pp.lang, corresp: pp.corresp, ana: pp.ana }, RAW(pp.xml));
      }),
      (o.notes || []).map(function (nn) {
        return N("note", { type: nn.type, "xml:lang": nn.lang }, RAW(nn.xml));
      })
    ]);
  }

  function noteNodes(notes) {
    return (notes || []).map(function (nn) {
      return N("note", { type: nn.type, "xml:lang": nn.lang }, RAW(nn.xml));
    });
  }
  function parseNotesOf(el) {
    return kids(el, "note").map(function (nEl) {
      return { type: attr(nEl, "type"), lang: xmlLang(nEl), xml: inner(nEl) };
    });
  }

  /* layout: columns/ruledLines + ORDERED children (p | rs | note | raw) */
  function parseLayout(el) {
    if (!el) return null;
    var o = { columns: attr(el, "columns"), ruledLines: attr(el, "ruledLines"),
              writtenLines: attr(el, "writtenLines"),
              // the inscribed field IS a layout (champ épigraphique, decision A″):
              // it may carry an identity + CRM typing of its own
              id: xmlId(el), corresp: attr(el, "corresp"), ana: attr(el, "ana"), items: [] };
    kids(el).forEach(function (k) {
      var name = ln(k);
      if (name === "p") o.items.push({ kind: "p", lang: xmlLang(k), text: collapse(txt(k)) });
      else if (name === "rs") {
        var c = parseClassified(k) || {};
        o.items.push({ kind: "rs", type: attr(k, "type"), ana: c.ana, ref: c.ref, zh: c.zh, en: c.en, text: c.text });
      }
      else if (name === "note") o.items.push({ kind: "note", type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
      else o.items.push({ kind: "raw", xml: outer(k) });
    });
    return o;
  }
  function layoutNode(o) {
    if (!o) return null;
    return N("layout", { "xml:id": o.id, columns: o.columns, ruledLines: o.ruledLines,
                         writtenLines: o.writtenLines, corresp: o.corresp, ana: o.ana },
      (o.items || []).map(function (it) {
        if (it.kind === "p") return it.text ? N("p", { "xml:lang": it.lang || "en" }, it.text) : null;
        if (it.kind === "rs") return classifiedNode("rs", it, { type: it.type });
        if (it.kind === "note") return N("note", { type: it.type, "xml:lang": it.lang }, RAW(it.xml));
        return RAW(it.xml);
      }));
  }

  /* history: origin(origDate + notes + origPlace + agents) + provenance + extras.
   * Agents (decision 2026-07-02): <persName @role> children of origin, each
   * optionally paired with an immediately following <note type="role-source">
   * — they export as ONE E12 Production with P14.1-qualified agents. */
  function parseHistory(el) {
    if (!el) return null;
    var h = { date: null, dateNotes: [], place: null, agents: [], provenance: null, _x: [] };
    var origin = firstKid(el, "origin");
    if (origin) {
      h.originItems = [];               // ordered view of the origin children
      var od = firstKid(origin, "origDate");
      if (od) h.date = { when: attr(od, "when"), notBefore: attr(od, "notBefore"),
                         notAfter: attr(od, "notAfter"), evidence: attr(od, "evidence"), text: txt(od) };
      var lastAgent = null;
      kids(origin).forEach(function (k) {
        var name = ln(k);
        if (name === "origDate") {
          h.originItems.push({ kind: "date" });
        } else if (name === "persName") {
          lastAgent = { role: attr(k, "role"), ref: attr(k, "ref"), lang: xmlLang(k),
                        text: inner(k), noteLang: "", noteXml: "" };
          h.agents.push(lastAgent);
          h.originItems.push({ kind: "agent", idx: h.agents.length - 1 });
        } else if (name === "note") {
          // a role-source note directly after a persName belongs to that agent
          if (lastAgent && attr(k, "type") === "role-source" && !lastAgent.noteXml) {
            lastAgent.noteLang = xmlLang(k); lastAgent.noteXml = inner(k);
          } else {
            h.dateNotes.push({ type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
            h.originItems.push({ kind: "note", idx: h.dateNotes.length - 1 });
          }
        } else if (name === "origPlace") {
          var pn = firstKid(k, "placeName");
          if (pn) h.place = { ref: attr(pn, "ref"), lang: xmlLang(pn), text: txt(pn) };
          h.originItems.push({ kind: "place" });
        } else {
          h.originItems.push({ kind: "raw", xml: outer(k) });
        }
      });
    }
    var prov = firstKid(el, "provenance");
    if (prov) { h.provenance = parsePs(prov); h.provenance.type = attr(prov, "type"); h.provenance.when = attr(prov, "when"); }
    kids(el).forEach(function (k) {
      if (ln(k) !== "origin" && ln(k) !== "provenance") h._x.push(outer(k));
    });
    return h;
  }
  function historyNode(h) {
    if (!h) return null;
    var od = h.date ? N("origDate", { when: h.date.when, notBefore: h.date.notBefore,
      notAfter: h.date.notAfter, evidence: h.date.evidence }, h.date.text) : null;
    var op = h.place ? N("origPlace", null,
      N("placeName", { ref: h.place.ref, "xml:lang": h.place.lang || "zh" }, h.place.text)) : null;
    function agentNodes(a) {
      return [N("persName", { role: a.role, ref: a.ref, "xml:lang": a.lang || "zh" }, RAW(a.text)),
              a.noteXml ? N("note", { type: "role-source", "xml:lang": a.noteLang }, RAW(a.noteXml)) : null];
    }
    var originKids;
    if (h.originItems && h.originItems.length) {
      // ordered path: rebuild the origin exactly as parsed; editor-added agents
      // (not yet in the order list) append at the end
      var seenAgents = {};
      originKids = flat(h.originItems.map(function (it) {
        if (it.kind === "date") return od;
        if (it.kind === "note") return h.dateNotes[it.idx]
          ? N("note", { type: h.dateNotes[it.idx].type, "xml:lang": h.dateNotes[it.idx].lang }, RAW(h.dateNotes[it.idx].xml)) : null;
        if (it.kind === "place") return op;
        if (it.kind === "agent") { seenAgents[it.idx] = true; return h.agents[it.idx] ? agentNodes(h.agents[it.idx]) : null; }
        return RAW(it.xml);
      }));
      (h.agents || []).forEach(function (a, i) {
        if (!seenAgents[i]) originKids = originKids.concat(agentNodes(a));
      });
      // editor-added date/place on a doc whose origin lacked them
      var hasDate = h.originItems.some(function (it) { return it.kind === "date"; });
      var hasPlace = h.originItems.some(function (it) { return it.kind === "place"; });
      if (od && !hasDate) originKids.unshift(od);
      if (op && !hasPlace) originKids.push(op);
    } else {
      originKids = flat([od, noteNodes(h.dateNotes), op,
        flat((h.agents || []).map(agentNodes))]);
    }
    var prov = h.provenance ? N("provenance", { type: h.provenance.type, when: h.provenance.when }, psNodes(h.provenance)) : null;
    return N("history", null,
      originKids.filter(Boolean).length ? NK("origin", null, originKids) : null,
      prov, (h._x || []).map(RAW));
  }

  /* physDesc for both objects and inscriptions.
   * support and handNote keep their children as ORDERED typed items (the samples
   * interleave note/dimensions freely); forms edit slots via the find helpers. */
  function parseSupportItems(sup) {
    var items = [];
    if (sup) kids(sup).forEach(function (k) {
      var name = ln(k);
      if (name === "objectType" || name === "material") {
        var c = parseClassified(k) || {};
        items.push({ kind: name, ana: c.ana, ref: c.ref, zh: c.zh, en: c.en, text: c.text });
      }
      else if (name === "dimensions") items.push({ kind: "dimensions", dims: parseDims(k) });
      else if (name === "note") items.push({ kind: "note", type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
      else items.push({ kind: "raw", xml: outer(k) });
    });
    return items;
  }
  function supportItemNodes(items) {
    return (items || []).map(function (it) {
      if (it.kind === "objectType" || it.kind === "material") return classifiedNode(it.kind, it);
      if (it.kind === "dimensions") return dimsNode(it.dims);
      if (it.kind === "note") return N("note", { type: it.type, "xml:lang": it.lang }, RAW(it.xml));
      return RAW(it.xml);
    });
  }
  function parseHandItems(hn) {
    var items = [];
    kids(hn).forEach(function (k) {
      var name = ln(k);
      if (name === "p") items.push({ kind: "p", lang: xmlLang(k), text: collapse(txt(k)) });
      else if (name === "dimensions") items.push({ kind: "dimensions", dims: parseDims(k) });
      else if (name === "ptr") items.push({ kind: "ptr", type: attr(k, "type"), target: attr(k, "target") });
      else if (name === "note") items.push({ kind: "note", type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
      else items.push({ kind: "raw", xml: outer(k) });
    });
    return items;
  }
  function handItemNodes(items) {
    return (items || []).map(function (it) {
      if (it.kind === "p") return it.text ? N("p", { "xml:lang": it.lang || "en" }, it.text) : null;
      if (it.kind === "dimensions") return dimsNode(it.dims);
      if (it.kind === "ptr") return N("ptr", { type: it.type || "glyph-metrics", target: it.target });
      if (it.kind === "note") return N("note", { type: it.type, "xml:lang": it.lang }, RAW(it.xml));
      return RAW(it.xml);
    });
  }
  function parsePhys(el) {
    if (!el) return null;
    var ph = { form: "", supportItems: [], condition: null, layout: null, deco: [], hand: null, hands: [], _x: [] };
    var od = firstKid(el, "objectDesc");
    ph.form = attr(od, "form");
    var sd = od ? firstKid(od, "supportDesc") : null;
    ph.supportItems = parseSupportItems(sd ? firstKid(sd, "support") : null);
    var cond = sd ? firstKid(sd, "condition") : null;
    if (cond) { ph.condition = parsePs(cond); ph.condition.ana = attr(cond, "ana"); }
    var ld = od ? firstKid(od, "layoutDesc") : null;
    // a layoutDesc may hold ONE layout per inscribed field (champ épigraphique,
    // combined shape) — the editor binds the first, the rest ride along
    ph.layouts = ld ? kids(ld, "layout").map(parseLayout) : [];
    ph.layout = ph.layouts[0] || null;
    var dd = firstKid(el, "decoDesc");
    if (dd) kids(dd, "decoNote").forEach(function (dn) {
      var o = parsePs(dn); o.ana = attr(dn, "ana"); ph.deco.push(o);
    });
    var hd = firstKid(el, "handDesc");
    if (hd) {
      ph.hands = kids(hd, "handNote").map(function (hn) {
        return { id: xmlId(hn), scope: attr(hn, "scope"), script: attr(hn, "script"),
                 scriptRef: attr(hn, "scriptRef"), ana: attr(hn, "ana"), items: parseHandItems(hn) };
      });
      ph.hand = ph.hands[0] || null;   // editors bind the first hand; extra hands
    }                                  // (per-field, combined shape) ride along
    kids(el).forEach(function (k) {
      var name = ln(k);
      if (name !== "objectDesc" && name !== "decoDesc" && name !== "handDesc") ph._x.push(outer(k));
    });
    return ph;
  }
  function physNode(ph) {
    if (!ph) return null;
    var supKids = supportItemNodes(ph.supportItems).filter(Boolean);
    var support = supKids.length ? NK("support", null, supKids) : null;
    var condition = ph.condition
      ? N("condition", { ana: ph.condition.ana }, psNodes(ph.condition)) : null;
    var supportDesc = (support || condition) ? NK("supportDesc", null, support, condition) : null;
    var layoutList = (ph.layouts && ph.layouts.length) ? ph.layouts : (ph.layout ? [ph.layout] : []);
    // the editor binds ph.layout (=== layouts[0] after parse; a NEW object built
    // in the editor sets ph.layout only)
    if (ph.layout && layoutList[0] !== ph.layout) layoutList = [ph.layout].concat(layoutList.slice(1));
    var layoutNodes = layoutList.map(layoutNode).filter(Boolean);
    var objectDesc = (supportDesc || layoutNodes.length || ph.form)
      ? NK("objectDesc", { form: ph.form }, supportDesc,
          layoutNodes.length ? NK("layoutDesc", null, layoutNodes) : null) : null;
    var deco = (ph.deco || []).length
      ? N("decoDesc", null, ph.deco.map(function (d) { return N("decoNote", { ana: d.ana }, psNodes(d)); })) : null;
    var handsList = (ph.hands && ph.hands.length) ? ph.hands : (ph.hand ? [ph.hand] : []);
    var hand = handsList.length
      ? N("handDesc", null, handsList.map(function (hn) {
          return N("handNote", { "xml:id": hn.id, scope: hn.scope, script: hn.script, scriptRef: hn.scriptRef, ana: hn.ana },
            handItemNodes(hn.items));
        })) : null;
    return N("physDesc", null, objectDesc, hand, deco, (ph._x || []).map(RAW));
  }
  /* find helpers for the forms (edit slots inside ordered item lists) */
  function findItem(items, kind) {
    for (var i = 0; i < (items || []).length; i++) if (items[i].kind === kind) return items[i];
    return null;
  }
  function upsertItem(items, kind, make, atStart) {
    var it = findItem(items, kind);
    if (!it) { it = make(); atStart ? items.unshift(it) : items.push(it); }
    return it;
  }

  /* msContents: summary + msItems */
  function parseMsContents(el) {
    if (!el) return null;
    var mc = { summaryEn: "", summaryZh: "", items: [] };
    kids(el, "summary").forEach(function (s) {
      if (xmlLang(s) === "zh") mc.summaryZh = txt(s); else mc.summaryEn = collapse(txt(s));
    });
    kids(el, "msItem").forEach(function (mi) {
      var it = { n: attr(mi, "n"), corresp: attr(mi, "corresp"), ana: attr(mi, "ana"),
                 locusTarget: "", locusText: "", titles: [], notes: [], mainLang: "", _x: [] };
      kids(mi).forEach(function (k) {
        var name = ln(k);
        if (name === "locus") { it.locusTarget = attr(k, "target"); it.locusText = txt(k); }
        else if (name === "title") it.titles.push({ lang: xmlLang(k), type: attr(k, "type"), ref: attr(k, "ref"), text: collapse(txt(k)) });
        else if (name === "note") it.notes.push({ type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
        else if (name === "textLang") it.mainLang = attr(k, "mainLang");
        else it._x.push(outer(k));
      });
      mc.items.push(it);
    });
    return mc;
  }
  function msContentsNode(mc) {
    if (!mc) return null;
    return N("msContents", null,
      mc.summaryEn ? N("summary", { "xml:lang": "en" }, mc.summaryEn) : null,
      mc.summaryZh ? N("summary", { "xml:lang": "zh" }, mc.summaryZh) : null,
      (mc.items || []).map(function (it) {
        var hasLocus = it.locusTarget || it.locusText;
        return N("msItem", { n: it.n, corresp: it.corresp, ana: it.ana },
          hasLocus ? (it.locusText ? N("locus", { target: it.locusTarget }, it.locusText)
                                   : N("locus", { target: it.locusTarget })) : null,
          (it.titles || []).map(function (t) {
            return t.text ? N("title", { "xml:lang": t.lang || "zh", type: t.type, ref: t.ref }, t.text) : null;
          }),
          noteNodes(it.notes),
          // unmodeled children (canonical <bibl>s of the 0.1 template) sit
          // between the titles/notes and textLang — emit BEFORE textLang.
          (it._x || []).map(RAW),
          it.mainLang ? N("textLang", { mainLang: it.mainLang }) : null);
      }));
  }

  // ---------------------------------------------------------------- SITE ----
  function parsePlaceEl(el) {
    var p = { id: xmlId(el), type: attr(el, "type"), subtype: attr(el, "subtype"), ana: attr(el, "ana"),
              nameZh: "", nameEn: "", names: [], country: {}, region: {}, settlement: {},
              geo: "", notes: [], objectPtrs: [], subsites: [], _x: [] };
    kids(el).forEach(function (k) {
      var name = ln(k);
      if (name === "placeName") {
        // ORDERED name list — carries the reserved transliteration slot
        // (xml:lang="zh-Latn-x-pinyin") between zh and en. nameZh/nameEn stay
        // the editor accessors onto the first name of each language.
        var plang = xmlLang(k);
        var entry = { lang: plang, text: plang === "zh" ? txt(k) : collapse(txt(k)) };
        p.names.push(entry);
        if (plang === "zh" && !p.nameZh) p.nameZh = entry.text;
        else if (plang === "en" && !p.nameEn) p.nameEn = entry.text;
      } else if (name === "country" || name === "region" || name === "settlement") {
        var slot = p[name]; var lang = xmlLang(k) === "zh" ? "zh" : "en";
        if (!slot[lang]) slot[lang] = name === "country" || lang === "zh" ? txt(k) : collapse(txt(k));
      } else if (name === "location") {
        var g = firstKid(k, "geo"); if (g) p.geo = txt(g);
      } else if (name === "note") {
        p.notes.push({ type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
      } else if (name === "linkGrp" && attr(k, "type") === "objects") {
        kids(k, "ptr").forEach(function (pt) { p.objectPtrs.push(attr(pt, "target")); });
      } else if (name === "place") {
        p.subsites.push(parsePlaceEl(k));
      } else {
        p._x.push(outer(k));
      }
    });
    return p;
  }
  function placeNode(p) {
    function bi(tag, slot) {
      return [slot.zh ? N(tag, { "xml:lang": "zh" }, slot.zh) : null,
              slot.en ? N(tag, { "xml:lang": "en" }, slot.en) : null];
    }
    // reconcile the ordered name list with the nameZh/nameEn editor accessors:
    // the first name of each language takes the (possibly edited) accessor text
    var nameNodes;
    if (p.names && p.names.length) {
      var zhDone = false, enDone = false;
      nameNodes = p.names.map(function (nm) {
        var text = nm.text;
        if (nm.lang === "zh" && !zhDone) { zhDone = true; text = p.nameZh || text; }
        else if (nm.lang === "en" && !enDone) { enDone = true; text = p.nameEn || text; }
        return text ? N("placeName", { "xml:lang": nm.lang }, text) : null;
      });
      if (!zhDone && p.nameZh) nameNodes.unshift(N("placeName", { "xml:lang": "zh" }, p.nameZh));
      if (!enDone && p.nameEn) nameNodes.push(N("placeName", { "xml:lang": "en" }, p.nameEn));
    } else {
      nameNodes = [p.nameZh ? N("placeName", { "xml:lang": "zh" }, p.nameZh) : null,
                   p.nameEn ? N("placeName", { "xml:lang": "en" }, p.nameEn) : null];
    }
    return NK("place", { "xml:id": p.id, type: p.type, subtype: p.subtype, ana: p.ana },
      nameNodes,
      bi("country", p.country || {}), bi("region", p.region || {}), bi("settlement", p.settlement || {}),
      p.geo ? N("location", null, N("geo", null, p.geo)) : null,
      noteNodes(p.notes),
      (p.objectPtrs || []).length ? N("linkGrp", { type: "objects" },
        p.objectPtrs.map(function (tgt) { return N("ptr", { type: "object", target: tgt }); })) : null,
      (p._x || []).map(RAW),
      (p.subsites || []).map(placeNode));                    // nested places LAST
  }
  /* profileDesc/revisionDesc on SITE and OBJECT files ride raw (structured
   * parsing of both is the inscription parser's job — the header template
   * demonstrates them there; here they just must not be lost). Likewise any
   * body children beside the listPlace/listObject (the champ variant carries
   * edition/bibliography divs on an object file). */
  function parseHeaderTail(doc, st, listName) {
    var pd = desc(doc.documentElement, "profileDesc")[0];
    st._profileRaw = pd ? outer(pd) : "";
    var rv = desc(doc.documentElement, "revisionDesc")[0];
    st._revisionRaw = rv ? outer(rv) : "";
    st._bodyX = [];
    var textEl = kids(doc.documentElement, "text")[0];
    var body = textEl ? firstKid(textEl, "body") : null;
    if (body) kids(body).forEach(function (k) {
      if (ln(k) !== listName) st._bodyX.push(outer(k));
    });
  }
  function parseSite(xml) {
    var doc = parseDoc(xml); if (!doc) return null;
    var st = parseHeaderCommon(doc);
    st.model = "site";
    st.fileId = xmlId(doc.documentElement);
    var lp = desc(doc.documentElement, "listPlace")[0];
    st.place = lp ? parsePlaceEl(firstKid(lp, "place")) : parsePlaceEl(doc.createElement("place"));
    parseHeaderTail(doc, st, "listPlace");
    return st;
  }
  function buildSite(st) {
    var TEI = NK("TEI", { xmlns: TEI_NS, "xml:id": st.fileId },
      NK("teiHeader", null, headerNodes(st, "site"), encodingNode(st),
        st._profileRaw ? RAW(st._profileRaw) : null,
        st._revisionRaw ? RAW(st._revisionRaw) : null),
      NK("text", null, NK("body", null, NK("listPlace", null, placeNode(st.place)),
        (st._bodyX || []).map(RAW))));
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ser(TEI, 0) + "\n";
  }

  // -------------------------------------------------------------- OBJECT ----
  function parseObjectEl(el, isPart) {
    var o = { id: xmlId(el), type: attr(el, "type"), subtype: attr(el, "subtype"),
              n: attr(el, "n"), ana: attr(el, "ana"),
              ident: { country: {}, region: {}, settlement: {}, nameZh: "", nameEn: "", idnoSupport: "",
                       // museum slots (0.1-sample): the OBJECT's current keeper —
                       // institution (governing body) / repository (museum) /
                       // collection + inventory idno; paired with provenance
                       // type="moved" in history. Rubbing collections stay on
                       // the witnesses; the site of origin stays in origPlace.
                       institution: {}, repository: {}, collection: {},
                       idnoInventory: "", idnoInventoryPresent: false, _x: [] },
              msContents: null, phys: null, history: null, notes: [], parts: [], _x: [] };
    kids(el).forEach(function (k) {
      var name = ln(k);
      if (name === "objectIdentifier") {
        kids(k).forEach(function (c) {
          var cn = ln(c), lang = xmlLang(c) === "zh" ? "zh" : "en";
          if (cn === "objectName") {
            if (lang === "zh") o.ident.nameZh = o.ident.nameZh || txt(c);
            else o.ident.nameEn = o.ident.nameEn || collapse(txt(c));
          } else if (cn === "country" || cn === "region" || cn === "settlement" ||
                     cn === "institution" || cn === "repository" || cn === "collection") {
            if (!o.ident[cn][lang]) o.ident[cn][lang] = cn === "country" || lang === "zh" ? txt(c) : collapse(txt(c));
          } else if (cn === "idno") {
            var ity = attr(c, "type");
            if (ity === "support") o.ident.idnoSupport = txt(c);
            else if (ity === "inventory") { o.ident.idnoInventory = txt(c); o.ident.idnoInventoryPresent = true; }
            else o.ident._x.push(outer(c));
          } else {
            o.ident._x.push(outer(c));
          }
        });
      }
      else if (name === "msContents") o.msContents = parseMsContents(k);
      else if (name === "physDesc") o.phys = parsePhys(k);
      else if (name === "history") o.history = parseHistory(k);
      else if (name === "note") o.notes.push({ type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
      else if (name === "object") o.parts.push(parseObjectEl(k, true));
      else o._x.push(outer(k));
    });
    return o;
  }
  function objectNode(o) {
    function bi(tag, slot) {
      return [(slot.zh ? N(tag, { "xml:lang": "zh" }, slot.zh) : null),
              (slot.en ? N(tag, { "xml:lang": "en" }, slot.en) : null)];
    }
    var identKids = flat([
      bi("country", o.ident.country || {}), bi("region", o.ident.region || {}),
      bi("settlement", o.ident.settlement || {}),
      o.ident.nameZh ? N("objectName", { "xml:lang": "zh" }, o.ident.nameZh) : null,
      o.ident.nameEn ? N("objectName", { "xml:lang": "en" }, o.ident.nameEn) : null,
      o.ident.idnoSupport ? N("idno", { type: "support" }, o.ident.idnoSupport) : null,
      // museum slots after the support key (0.1-sample order)
      bi("institution", o.ident.institution || {}), bi("repository", o.ident.repository || {}),
      bi("collection", o.ident.collection || {}),
      (o.ident.idnoInventory || o.ident.idnoInventoryPresent)
        ? N("idno", { type: "inventory" }, o.ident.idnoInventory) : null,
      (o.ident._x || []).map(RAW)
    ]);
    return NK("object", { "xml:id": o.id, type: o.type, subtype: o.subtype, n: o.n, ana: o.ana },
      identKids.length ? NK("objectIdentifier", null, identKids) : null,
      msContentsNode(o.msContents),
      physNode(o.phys),
      historyNode(o.history),
      noteNodes(o.notes),
      (o._x || []).map(RAW),
      (o.parts || []).map(objectNode));                      // nested objects LAST
  }
  function parseObject(xml) {
    var doc = parseDoc(xml); if (!doc) return null;
    var st = parseHeaderCommon(doc);
    st.model = "objectfile";
    st.fileId = xmlId(doc.documentElement);
    var lo = desc(doc.documentElement, "listObject")[0];
    // a listObject may hold SIBLING top-level objects; the editor binds the
    // first, the rest ride along
    st.objs = lo ? kids(lo, "object").map(function (o) { return parseObjectEl(o); }) : [];
    st.obj = st.objs[0] || null;
    parseHeaderTail(doc, st, "listObject");
    return st;
  }
  function buildObject(st) {
    var objList = (st.objs && st.objs.length) ? st.objs : (st.obj ? [st.obj] : []);
    var TEI = NK("TEI", { xmlns: TEI_NS, "xml:id": st.fileId },
      NK("teiHeader", null, headerNodes(st, "object"), encodingNode(st),
        st._profileRaw ? RAW(st._profileRaw) : null,
        st._revisionRaw ? RAW(st._revisionRaw) : null),
      NK("text", null, NK("body", null, NK("listObject", null, objList.map(objectNode)),
        (st._bodyX || []).map(RAW))));
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ser(TEI, 0) + "\n";
  }

  // --------------------------------------------------------- INSCRIPTION ----
  function parseWitness(w) {
    var wit = { id: xmlId(w), n: attr(w, "n"), ana: attr(w, "ana"), corresp: attr(w, "corresp"), items: [] };
    var bibl = firstKid(w, "bibl") || w;
    kids(bibl).forEach(function (k) {
      var name = ln(k);
      if (name === "rs" && attr(k, "type") === "witness-type") {
        var c = parseClassified(k); wit.items.push({ kind: "rs", ana: c && c.ana, zh: c && c.zh, en: c && c.en });
      } else if (name === "date") {
        wit.items.push({ kind: "date", when: attr(k, "when"), text: txt(k) });
      } else if (name === "orgName") {
        wit.items.push({ kind: "orgName", role: attr(k, "role"), lang: xmlLang(k), text: txt(k) });
      } else if (name === "placeName") {
        wit.items.push({ kind: "placeName", lang: xmlLang(k), text: txt(k) });
      } else if (name === "idno") {
        wit.items.push({ kind: "idno", type: attr(k, "type"), text: txt(k) });
      } else if (name === "extent") {
        wit.items.push({ kind: "extent", text: txt(k) });
      } else if (name === "note") {
        wit.items.push({ kind: "note", type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
      } else {
        wit.items.push({ kind: "raw", xml: outer(k) });
      }
    });
    return wit;
  }
  function witnessNode(wit) {
    return N("witness", { "xml:id": wit.id, n: wit.n, corresp: wit.corresp, ana: wit.ana },
      NK("bibl", null, (wit.items || []).map(function (it) {
        switch (it.kind) {
          case "rs": return N("rs", { type: "witness-type", ana: it.ana },
            it.zh ? N("term", { "xml:lang": "zh" }, it.zh) : null,
            it.en ? N("term", { "xml:lang": "en" }, it.en) : null);
          case "date": return N("date", { when: it.when }, it.text);
          case "orgName": return N("orgName", { role: it.role || "repository", "xml:lang": it.lang }, it.text);
          case "placeName": return N("placeName", { "xml:lang": it.lang }, it.text);
          case "idno": return N("idno", { type: it.type || "accession" }, it.text);
          case "extent": return N("extent", null, it.text);
          case "note": return N("note", { type: it.type, "xml:lang": it.lang }, RAW(it.xml));
          default: return RAW(it.xml);
        }
      })));
  }
  function parseInscription(xml) {
    var doc = parseDoc(xml); if (!doc) return null;
    var st = parseHeaderCommon(doc);
    st.model = "inscription";
    st.fileId = xmlId(doc.documentElement);
    var rootEl = doc.documentElement;

    var msDesc = desc(rootEl, "msDesc")[0];
    st.corresp = attr(msDesc, "corresp");
    st.msDescAna = attr(msDesc, "ana");
    // msIdentifier as an ORDERED item list (msPart/combined interleave standard
    // TEI institution/repository and several idno/altIdentifier children); the
    // named fields remain the editor accessors onto the first item of each kind.
    st.msIdent = { country: "", region: "", settlement: "", idnoEdition: "", idnoSupport: "",
                   idnoSegment: "", altType: "", altIdno: "", items: [], _x: [] };
    var mi = msDesc ? firstKid(msDesc, "msIdentifier") : null;
    if (mi) kids(mi).forEach(function (k) {
      var name = ln(k);
      if (name === "country" || name === "region" || name === "settlement") {
        st.msIdent.items.push({ kind: name, lang: xmlLang(k), text: txt(k) });
        if (!st.msIdent[name]) st.msIdent[name] = txt(k);
      }
      else if (name === "idno") {
        var ty = attr(k, "type");
        st.msIdent.items.push({ kind: "idno", type: ty, ana: attr(k, "ana"), text: txt(k) });
        if (ty === "edition" && !st.msIdent.idnoEdition) st.msIdent.idnoEdition = txt(k);
        else if (ty === "support" && !st.msIdent.idnoSupport) { st.msIdent.idnoSupport = txt(k); st.msIdent.idnoSupportAna = attr(k, "ana"); }
        else if (ty === "segment" && !st.msIdent.idnoSegment) st.msIdent.idnoSegment = txt(k);
      }
      else if (name === "altIdentifier") {
        st.msIdent.items.push({ kind: "alt", type: attr(k, "type"), idno: txt(firstKid(k, "idno")) });
        if (!st.msIdent.altType && !st.msIdent.altIdno) {
          st.msIdent.altType = attr(k, "type");
          st.msIdent.altIdno = txt(firstKid(k, "idno"));
        }
      }
      else st.msIdent.items.push({ kind: "raw", xml: outer(k) });
    });
    st.msContents = msDesc ? parseMsContents(firstKid(msDesc, "msContents")) : null;
    st.phys = msDesc ? parsePhys(firstKid(msDesc, "physDesc")) : null;
    st.history = msDesc ? parseHistory(firstKid(msDesc, "history")) : null;
    // unmodeled msDesc children (e.g. <msPart> in the not-adopted variant) ride raw
    st._msDescX = [];
    if (msDesc) kids(msDesc).forEach(function (k) {
      var name = ln(k);
      if (name !== "msIdentifier" && name !== "msContents" && name !== "physDesc" && name !== "history")
        st._msDescX.push(outer(k));
    });

    st.witnesses = [];
    // ONLY the sourceDesc-level witness list (E-WIT rubbings); an edition div may
    // carry its own inline <listWit> of text witnesses, which must stay there.
    var srcDesc = msDesc ? msDesc.parentNode : desc(rootEl, "sourceDesc")[0];
    var lw = srcDesc ? firstKid(srcDesc, "listWit") : null;
    if (lw) kids(lw, "witness").forEach(function (w) { st.witnesses.push(parseWitness(w)); });

    st.languages = desc(rootEl, "langUsage").length
      ? kids(desc(rootEl, "langUsage")[0], "language").map(function (l) {
          return { ident: attr(l, "ident"), label: txt(l) };
        })
      : [];

    // profileDesc/textClass (0.1-sample): genre catRef(s) resolving in
    // epiwen-taxonomies.xml#textGenres + tradition keywords
    st.textClass = null;
    var tcEl = desc(rootEl, "textClass")[0];
    if (tcEl) {
      st.textClass = { catRefs: [], keywords: [], _x: [] };
      kids(tcEl).forEach(function (k) {
        var name = ln(k);
        if (name === "catRef") st.textClass.catRefs.push({ scheme: attr(k, "scheme"), target: attr(k, "target"), corresp: attr(k, "corresp") });
        else if (name === "keywords") {
          st.textClass.keywords.push({ scheme: attr(k, "scheme"),
            terms: kids(k, "term").map(function (t) { return { lang: xmlLang(t), text: txt(t) }; }) });
        } else st.textClass._x.push(outer(k));
      });
    }
    // profileDesc extras beyond langUsage/textClass (e.g. calendarDesc)
    st._profileX = [];
    var pdEl = desc(rootEl, "profileDesc")[0];
    if (pdEl) kids(pdEl).forEach(function (k) {
      var name = ln(k);
      if (name !== "langUsage" && name !== "textClass") st._profileX.push(outer(k));
    });

    // revisionDesc: the change log (@status; change @when @who)
    st.revision = null;
    var rvEl = desc(rootEl, "revisionDesc")[0];
    if (rvEl) {
      st.revision = { status: attr(rvEl, "status"),
        changes: kids(rvEl, "change").map(function (c) {
          return { when: attr(c, "when"), who: attr(c, "who"), xml: inner(c).trim() };
        }) };
    }

    var textEl = kids(rootEl, "text")[0];
    st.textNext = attr(textEl, "next"); st.textPrev = attr(textEl, "prev");
    st.edition = { lang: "lzh", mode: "ptr", ptrTarget: "", inlineText: "", id: "", corresp: "", hand: "" };
    st.bibls = [];                       // ordered: {canonical:true,taisho,range} | {xml}
    st._bodyX = [];
    st._bodyOrder = [];                  // document order of body children
    var body = textEl ? firstKid(textEl, "body") : null;
    if (body) kids(body).forEach(function (d) {
      var ty = ln(d) === "div" ? attr(d, "type") : "";
      if (ty === "edition" && st._bodyOrder.indexOf("edition") === -1) {
        st._bodyOrder.push("edition");
        st.edition.lang = xmlLang(d) || "lzh";
        st.edition.id = xmlId(d); st.edition.corresp = attr(d, "corresp"); st.edition.hand = attr(d, "hand");
        // delegated form: the div holds ONLY <ab><ptr type="transcription"/></ab>
        var dKids = kids(d), ab = firstKid(d, "ab");
        var abKids = ab ? kids(ab) : [];
        var ptr = abKids.length === 1 && ln(abKids[0]) === "ptr" ? abKids[0] : null;
        if (dKids.length === 1 && ptr && attr(ptr, "type") === "transcription" && !txt(ab)) {
          st.edition.mode = "ptr"; st.edition.ptrTarget = attr(ptr, "target");
        } else {
          // inline form: the WHOLE div content verbatim (ab with the transcription,
          // optionally preceded by a listWit of text witnesses)
          st.edition.mode = "inline";
          st.edition.inlineText = inner(d);
        }
      } else if (ty === "bibliography") {
        // 0.1-sample: MULTIPLE typed listBibl blocks (canonical / transcription /
        // illustration / discussion), bibl @type epigraphic|modern with citekey
        // idno + citedRange. Canonical bibls become editable fields (ALL idnos
        // kept — cbeta AND taisho); every other bibl rides verbatim.
        if (st._bodyOrder.indexOf("bibliography") === -1) st._bodyOrder.push("bibliography");
        st.biblLists = st.biblLists || [];
        kids(d, "listBibl").forEach(function (lb) {
          var list = { type: attr(lb, "type"), bibls: [] };
          kids(lb, "bibl").forEach(function (b) {
            var bKids = kids(b);
            var simple = attr(b, "type") === "canonical" &&
              bKids.every(function (k) { return ln(k) === "idno" || ln(k) === "citedRange" || ln(k) === "note"; });
            if (simple) {
              var entry = { canonical: true, subtype: attr(b, "subtype"), idnos: [], range: "", noteXml: "" };
              bKids.forEach(function (k) {
                if (ln(k) === "idno") entry.idnos.push({ type: attr(k, "type"), text: txt(k) });
                else if (ln(k) === "citedRange") entry.range = txt(k);
                else entry.noteXml = inner(k);
              });
              list.bibls.push(entry);
            } else list.bibls.push({ xml: outer(b) });
          });
          st.biblLists.push(list);
        });
        // legacy accessor: st.bibls = the canonical list's entries (editor binding)
        var canonList = null;
        st.biblLists.forEach(function (l) { if (!canonList && (l.type === "canonical" || !l.type)) canonList = l; });
        st.bibls = canonList ? canonList.bibls : [];
      } else {
        st._bodyOrder.push({ raw: st._bodyX.length });
        st._bodyX.push(outer(d));
      }
    });
    if (!st.biblLists) st.biblLists = [];
    return st;
  }
  function buildInscription(st) {
    var mi = st.msIdent || {};
    var msIdentifier;
    if (mi.items && mi.items.length) {
      // ordered path: emit the parsed sequence, first-of-kind text taken from
      // the (possibly edited) accessor fields
      var done = {};
      var miNodes = mi.items.map(function (it) {
        if (it.kind === "country" || it.kind === "region" || it.kind === "settlement") {
          var text = it.text;
          if (!done[it.kind]) { done[it.kind] = true; text = mi[it.kind]; }
          return text ? N(it.kind, { "xml:lang": it.lang || "zh" }, text) : null;
        }
        if (it.kind === "idno") {
          var t2 = it.text, key = "idno." + it.type, accessor = false;
          if ((it.type === "edition" || it.type === "support" || it.type === "segment") && !done[key]) {
            done[key] = true; accessor = true;
            t2 = it.type === "edition" ? mi.idnoEdition : it.type === "support" ? mi.idnoSupport : mi.idnoSegment;
          }
          // non-accessor idnos exist because the source carries them — keep even
          // when textless (e.g. a comment-only inventory placeholder)
          if (accessor && !t2) return null;
          return N("idno", { type: it.type, ana: it.ana }, t2);
        }
        if (it.kind === "alt") {
          var aType = it.type, aIdno = it.idno;
          if (!done.alt) { done.alt = true; aType = mi.altType || it.type; aIdno = mi.altIdno; }
          return aIdno ? N("altIdentifier", { type: aType }, N("idno", null, aIdno)) : null;
        }
        return RAW(it.xml);
      });
      msIdentifier = NK("msIdentifier", null, miNodes, (mi._x || []).map(RAW));
    } else {
      msIdentifier = NK("msIdentifier", null,
        mi.country ? N("country", { "xml:lang": "zh" }, mi.country) : null,
        mi.region ? N("region", { "xml:lang": "zh" }, mi.region) : null,
        mi.settlement ? N("settlement", { "xml:lang": "zh" }, mi.settlement) : null,
        mi.idnoEdition ? N("idno", { type: "edition" }, mi.idnoEdition) : null,
        mi.idnoSupport ? N("idno", { type: "support", ana: mi.idnoSupportAna }, mi.idnoSupport) : null,
        mi.idnoSegment ? N("idno", { type: "segment" }, mi.idnoSegment) : null,
        mi.altIdno ? N("altIdentifier", { type: mi.altType || "sutras-data" }, N("idno", null, mi.altIdno)) : null,
        (mi._x || []).map(RAW));
    }
    var msDesc = NK("msDesc", { corresp: st.corresp, ana: st.msDescAna },
      msIdentifier, msContentsNode(st.msContents), physNode(st.phys), historyNode(st.history),
      (st._msDescX || []).map(RAW));
    var listWit = (st.witnesses || []).length
      ? N("listWit", null, st.witnesses.map(witnessNode)) : null;

    var fileDesc = NK("fileDesc", null,
      titleStmtNode(st),
      editionStmtNode(st),
      NK("publicationStmt", null,
        N("authority", null, st.authority || "Epiwen / EpiDoc-CN profile — sample"),
        N("idno", { type: st.idnoType || "filename" }, st.idno),
        availabilityNode(st.availability)),
      NK("sourceDesc", null, msDesc, listWit,
        (st.sourceBibls || []).map(function (b) { return N("bibl", null, RAW(b)); })));

    var langs = (st.languages && st.languages.length)
      ? st.languages : [{ ident: "lzh", label: "Literary Chinese" }];
    var textClass = null;
    if (st.textClass && (st.textClass.catRefs.length || st.textClass.keywords.length || st.textClass._x.length)) {
      textClass = N("textClass", null,
        st.textClass.catRefs.map(function (cr) { return N("catRef", { scheme: cr.scheme, target: cr.target, corresp: cr.corresp }); }),
        st.textClass.keywords.map(function (kw) {
          return N("keywords", { scheme: kw.scheme }, kw.terms.map(function (t) {
            return N("term", { "xml:lang": t.lang }, t.text);
          }));
        }),
        st.textClass._x.map(RAW));
    }
    var profileDesc = N("profileDesc", null,
      N("langUsage", null, langs.map(function (l) {
        return N("language", { ident: l.ident }, l.label);
      })),
      textClass,
      (st._profileX || []).map(RAW));

    var revisionDesc = (st.revision && st.revision.changes && st.revision.changes.length)
      ? N("revisionDesc", { status: st.revision.status },
          st.revision.changes.map(function (c) {
            return N("change", { when: c.when, who: c.who }, RAW(c.xml));
          }))
      : null;

    var editionDiv;
    if (st.edition && st.edition.mode === "inline") {
      // inlineText is the div's whole content (e.g. optional <listWit> + <ab>…</ab>);
      // bare text without any <ab> wrapper is wrapped for TEI validity.
      var edInner = String(st.edition.inlineText || "");
      if (edInner && edInner.indexOf("<ab") === -1) edInner = "<ab>" + edInner + "</ab>";
      editionDiv = NK("div", { type: "edition", "xml:id": st.edition.id, "xml:lang": st.edition.lang || "lzh",
                               corresp: st.edition.corresp, hand: st.edition.hand },
        RAW(edInner || "<ab/>"));
    } else {
      editionDiv = NK("div", { type: "edition", "xml:id": st.edition && st.edition.id, "xml:lang": (st.edition && st.edition.lang) || "lzh",
                               corresp: st.edition && st.edition.corresp, hand: st.edition && st.edition.hand },
        NK("ab", null, N("ptr", { type: "transcription", target: st.edition ? st.edition.ptrTarget : "" })));
    }
    function canonicalBiblNode(b) {
      if (!b.canonical) return RAW(b.xml);
      // legacy editor entries carry {taisho, range}; template entries carry idnos[]
      var idnos = (b.idnos && b.idnos.length) ? b.idnos
        : (b.taisho ? [{ type: "taisho", text: b.taisho }] : []);
      return N("bibl", { type: "canonical", subtype: b.subtype },
        idnos.map(function (i) { return N("idno", { type: i.type }, i.text); }),
        b.range ? N("citedRange", null, b.range) : null,
        b.noteXml ? N("note", null, RAW(b.noteXml)) : null);
    }
    var lists = (st.biblLists && st.biblLists.length)
      ? st.biblLists.slice()
      : ((st.bibls || []).length ? [{ type: "canonical", bibls: st.bibls }] : []);
    // editor-added canonical refs on a doc whose bibliography had no canonical list
    if ((st.bibls || []).length && !lists.some(function (l) { return l.bibls === st.bibls; }))
      lists.unshift({ type: "canonical", bibls: st.bibls });
    var biblDiv = lists.length
      ? N("div", { type: "bibliography" }, lists.map(function (l) {
          return N("listBibl", { type: l.type }, l.bibls.map(canonicalBiblNode));
        }))
      : null;

    // body children in DOCUMENT ORDER where parsed (a file may place commentary
    // after the bibliography); canonical EpiDoc order for editor-built docs.
    var bodyKids;
    if (st._bodyOrder && st._bodyOrder.length) {
      var edDone = false, biDone = false;
      bodyKids = st._bodyOrder.map(function (o) {
        if (o === "edition") { edDone = true; return editionDiv; }
        if (o === "bibliography") { biDone = true; return biblDiv; }
        return RAW(st._bodyX[o.raw]);
      });
      if (!edDone) bodyKids.unshift(editionDiv);
      if (!biDone && biblDiv) bodyKids.push(biblDiv);
    } else {
      bodyKids = flat([editionDiv, (st._bodyX || []).map(RAW), biblDiv]);
    }
    var TEI = NK("TEI", { xmlns: TEI_NS, "xml:id": st.fileId },
      NK("teiHeader", null, fileDesc, encodingNode(st), profileDesc, revisionDesc),
      NK("text", { next: st.textNext, prev: st.textPrev },
        NK("body", null, bodyKids)));
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ser(TEI, 0) + "\n";
  }

  // ----------------------------------------------------------- taxonomies ---
  function parseTaxonomies(xml) {
    var doc = parseDoc(xml); if (!doc) return null;
    var out = {};
    desc(doc.documentElement, "taxonomy").forEach(function (tx) {
      var id = xmlId(tx), cats = [];
      kids(tx, "category").forEach(function (c) {
        var cat = { id: xmlId(c), zh: "", en: "", ref: "" };
        kids(c, "catDesc").forEach(function (cd) {
          var g = firstKid(cd, "gloss");
          if (xmlLang(cd) === "zh") cat.zh = txt(g || cd);
          else {
            cat.en = collapse(txt(g || cd));
            var refEl = firstKid(cd, "ref");
            if (refEl && attr(refEl, "type") === "getty") cat.ref = attr(refEl, "target");
          }
        });
        cats.push(cat);
      });
      out[id] = cats;
    });
    return out;
  }
  /* bundled snapshot of epiwen-taxonomies.xml (ids + short glosses + verified Getty refs) */
  var FALLBACK_TAX = {
    objectTypes: [
      { id: "object.stele", zh: "碑", en: "stele", ref: "http://vocab.getty.edu/aat/300007023" },
      { id: "object.rock-face", zh: "摩崖", en: "rock-face", ref: "http://vocab.getty.edu/aat/300404733" },
      { id: "object.boulder", zh: "刻經石／巨石", en: "inscribed boulder", ref: "http://vocab.getty.edu/aat/300404733" },
      { id: "object.panel", zh: "組合刻面", en: "multi-text panel", ref: "http://vocab.getty.edu/aat/300404733" },
      { id: "object.cave", zh: "石窟", en: "rock-cut text cave", ref: "" },
      { id: "object.cave-wall", zh: "窟壁", en: "cave wall", ref: "" },
      { id: "object.jingchuang", zh: "經幢", en: "sutra pillar", ref: "" }
    ],
    materials: [
      { id: "material.granite.biotite", zh: "黑雲母花崗岩", en: "biotite granite", ref: "http://vocab.getty.edu/aat/300011183" },
      { id: "material.granite.leuco", zh: "淡色花崗岩", en: "leucogranite", ref: "http://vocab.getty.edu/aat/300011183" },
      { id: "material.granite.biotite-hornblende", zh: "黑雲母角閃石花崗岩", en: "biotite-hornblende granite", ref: "http://vocab.getty.edu/aat/300011183" },
      { id: "material.limestone.fossiliferous", zh: "含化石石灰岩", en: "fossiliferous limestone", ref: "http://vocab.getty.edu/aat/300011286" }
    ],
    conditions: [
      { id: "condition.excellent", zh: "極佳", en: "excellent", ref: "" },
      { id: "condition.good", zh: "良好／尚佳", en: "good", ref: "" },
      { id: "condition.fair", zh: "尚可", en: "fair", ref: "" },
      { id: "condition.slightly-damaged", zh: "微損", en: "slightly damaged", ref: "" },
      { id: "condition.poor", zh: "劣", en: "poor", ref: "" },
      { id: "condition.lost", zh: "佚失（舊存）", en: "stone lost", ref: "" }
    ],
    executions: [
      { id: "execution.v-cut", zh: "“V”形刻法", en: "V-shaped cut", ref: "http://vocab.getty.edu/aat/300053847" },
      { id: "execution.u-cut", zh: "“U”形刻法", en: "U-shaped cut", ref: "http://vocab.getty.edu/aat/300053847" },
      { id: "execution.kan-cut", zh: "“凵”形刻法", en: "rectangular-U cut", ref: "http://vocab.getty.edu/aat/300053847" },
      { id: "execution.feibai", zh: "飛白刻", en: "flying-white carving", ref: "" },
      { id: "execution.unknown", zh: "未知", en: "unknown", ref: "" }
    ],
    surfaceTreatments: [
      { id: "polishing.polished", zh: "磨光（有）", en: "surface polished", ref: "" },
      { id: "polishing.unpolished", zh: "未磨（無）", en: "not polished (attested absent)", ref: "" }
    ],
    scripts: [
      { id: "script.kaishu", zh: "楷書", en: "regular script", ref: "" },
      { id: "script.lishu", zh: "隸書", en: "clerical script", ref: "" }
    ],
    shapes: [
      { id: "shape.vertical-rectangle", zh: "縱長方形", en: "vertical rectangle", ref: "" },
      { id: "shape.horizontal-rectangle", zh: "橫長方形", en: "horizontal rectangle", ref: "" }
    ],
    features: [
      { id: "decor.none", zh: "無紋飾", en: "no decoration (attested absent)", ref: "" },
      { id: "decor.border", zh: "飾帶／邊飾", en: "carved ornamental border", ref: "" },
      { id: "frame.present", zh: "有邊框", en: "frame present", ref: "" },
      { id: "frame.none", zh: "無邊框", en: "no frame (attested absent)", ref: "" }
    ],
    witnessTypes: [
      { id: "witness.rubbing", zh: "拓本", en: "ink rubbing", ref: "" },
      { id: "witness.woodcut", zh: "摹刻（木刻翻刻拓本）", en: "woodcut reproduction of a rubbing", ref: "" }
    ],
    // the third axis (0.1-sample): object-type ≠ text-genre ≠ witness;
    // referenced from profileDesc/textClass/catRef
    textGenres: [
      { id: "genre.jiewen", zh: "節文", en: "sutra excerpt", ref: "" },
      { id: "genre.keming", zh: "刻銘", en: "engraved title / name-engraving", ref: "" },
      { id: "genre.timing", zh: "題名", en: "donor colophon (name record)", ref: "" },
      { id: "genre.tiji", zh: "題記", en: "colophon / dedicatory record", ref: "" },
      { id: "genre.foming", zh: "佛名", en: "Buddha name", ref: "" }
    ],
    tradition: [
      { id: "tradition.buddhist", zh: "佛", en: "Buddhist", ref: "" }
    ]
  };
  var _taxCache = null;
  function loadTaxonomies() {
    if (_taxCache) return Promise.resolve(_taxCache);
    var viaCollection = (typeof window !== "undefined" && window.EpiCollections && EpiCollections.fetchRecordXml)
      ? EpiCollections.fetchRecordXml("epidoc-cn", "epiwen-taxonomies.xml")
          .then(function (xml) { return parseTaxonomies(xml); })
      : Promise.reject(new Error("no collections module"));
    return viaCollection
      .then(function (tax) { _taxCache = tax && tax.objectTypes ? tax : FALLBACK_TAX; return _taxCache; })
      .catch(function () { _taxCache = FALLBACK_TAX; return _taxCache; });
  }

  return {
    detect: detect,
    parseSite: parseSite, buildSite: buildSite,
    parseObject: parseObject, buildObject: buildObject,
    parseInscription: parseInscription, buildInscription: buildInscription,
    parseTaxonomies: parseTaxonomies, loadTaxonomies: loadTaxonomies,
    findItem: findItem, upsertItem: upsertItem,
    FALLBACK_TAX: FALLBACK_TAX
  };
});
