/* rubbing-app.js — form and TEI/XML serializer for rubbing records.
 * Companion to editor.html (inscription records); same design patterns.
 * Vocabulary from vocab.js (V = window.VOCAB), rubbing branch.
 * XML output: TEI msDesc type="rubbing" linked to source inscription via
 *   <relatedItem type="surrogateOf">.
 */
(function () {
  "use strict";
  var V = window.VOCAB;

  // ===== XML BUILDER ===========================================================
  function ex(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function ea(s) { return ex(s).replace(/"/g, "&quot;"); }
  function tv(v)  { return v == null ? "" : String(v).trim(); }

  // el(tag, attrs, inner): attrs = plain object, inner = string | array | null.
  // Returns null when the element would be completely empty (no attrs, no content).
  // Returns self-closing <tag/> when attrs present but inner is empty/null.
  function el(tag, attrs, inner) {
    var a = "";
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (tv(attrs[k])) a += " " + k + '="' + ea(tv(attrs[k])) + '"';
      });
    }
    if (inner === null || inner === undefined || (typeof inner === "string" && inner === "")) {
      if (!a) return null;
      return "<" + tag + a + "/>";
    }
    var b = Array.isArray(inner) ? inner.filter(Boolean).join("\n") : String(inner);
    if (!a && !b.trim()) return null;
    return "<" + tag + a + ">" + b + "</" + tag + ">";
  }

  // One <person> — either a fixed creation-chain identity (nameZh/namePinyin
  // + birth/death) or a free-form agent (bare name + floruit). Returns null
  // when nothing was actually filled in, so empty rows never emit a tag.
  function buildPersonEl(roleLabel, roleRef, nameZh, namePinyin, name, birth, death, floruit) {
    var pch = [];
    if (tv(nameZh))     pch.push(el("persName", { "xml:lang": "zh" }, ex(tv(nameZh))));
    if (tv(namePinyin)) pch.push(el("persName", { "xml:lang": "und-Latn-pinyin" }, ex(tv(namePinyin))));
    if (tv(name) && !tv(nameZh) && !tv(namePinyin)) pch.push(el("persName", null, ex(tv(name))));
    if (tv(birth))   pch.push(el("birth",   null, ex(tv(birth))));
    if (tv(death))   pch.push(el("death",   null, ex(tv(death))));
    if (tv(floruit)) pch.push(el("floruit", null, ex(tv(floruit))));
    if (!pch.length) return null;
    return el("person", roleRef ? { role: roleLabel, ref: roleRef } : { role: roleLabel }, pch);
  }

  function buildXML(s) {
    var X = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<?xml-model href="http://www.stoa.org/epidoc/schema/latest/tei-epidoc.rng"' +
        ' schematypens="http://relaxng.org/ns/structure/1.0"?>',
      '<TEI xmlns="http://www.tei-c.org/ns/1.0">'
    ];

    /* titleStmt — type distinguishes the rubbing's own title from the title
       of the original work it reproduces (same type applies to all three
       language variants, since they name the same thing). */
    var titleAttr = tv(s.titleTypeToken) ? { type: tv(s.titleTypeToken) } : null;
    var ts = el("titleStmt", null, [
      el("title",  Object.assign({ "xml:lang": "en" },              titleAttr || {}), ex(tv(s.titleEn))),
      el("title",  Object.assign({ "xml:lang": "und-Latn-pinyin" }, titleAttr || {}), ex(tv(s.titlePinyin))),
      el("title",  Object.assign({ "xml:lang": "zh-Hant" },         titleAttr || {}), ex(tv(s.titleZh))),
      el("editor", null,                        ex(tv(s.editor)))
    ]);

    /* publicationStmt */
    var licEl = tv(s.licenceTarget)
      ? el("licence", { target: tv(s.licenceTarget) }, ex(tv(s.licence)))
      : el("licence", null, ex(tv(s.licence)));
    var ps = el("publicationStmt", null, [
      el("authority", null, ex(tv(s.authority) || "Epiwen / Altergraphy")),
      el("idno", { type: "filename" }, ex(tv(s.filename))),
      licEl ? el("availability", null, licEl) : null
    ]);

    /* msIdentifier */
    var msId = el("msIdentifier", null, [
      el("country",     null, ex(tv(s.country))),
      el("region",      null, ex(tv(s.region))),
      el("settlement",  null, ex(tv(s.settlement))),
      el("institution", null, ex(tv(s.institution))),
      el("repository",  null, ex(tv(s.repository))),
      el("idno", { type: "inventory" }, ex(tv(s.inventoryNo)))
    ]);

    /* physDesc — support */
    var suppChildren = [
      el("objectType",
        { ref: tv(s.objectTypeRef) || "https://opentheso.huma-num.fr/?idc=802596&idt=th770" },
        ex(tv(s.objectTypeLabel) || "拓片 Rubbing"))
    ];
    if (tv(s.formatRef)) {
      suppChildren.push("<p>" +
        el("term", { type: "rubbingFormat", ref: tv(s.formatRef) }, ex(tv(s.formatLabel))) +
        "</p>");
    }
    if (tv(s.paperRef) || tv(s.paperLabel)) {
      suppChildren.push(el("material",
        tv(s.paperRef) ? { ref: tv(s.paperRef) } : null,
        ex(tv(s.paperLabel))));
    }
    if (s.paperAttrs && s.paperAttrs.length) {
      var paTerms = s.paperAttrs.map(function (a) {
        return el("term", { ref: tv(a.ref) }, ex(a.en + (a.zh ? " / " + a.zh : "")));
      }).filter(Boolean).join(", ");
      suppChildren.push(el("note", { type: "paperAttributes" }, paTerms));
    }
    if (tv(s.heightCm) || tv(s.widthCm)) {
      suppChildren.push(el("dimensions", { type: "sheet", unit: "cm" }, [
        el("height", null, ex(tv(s.heightCm))),
        el("width",  null, ex(tv(s.widthCm)))
      ]));
    }
    if (tv(s.mountHeightCm) || tv(s.mountWidthCm)) {
      suppChildren.push(el("dimensions", { type: "mount", unit: "cm" }, [
        el("height", null, ex(tv(s.mountHeightCm))),
        el("width",  null, ex(tv(s.mountWidthCm)))
      ]));
    }
    var suppDesc = el("supportDesc", null, [
      el("support",   null, suppChildren),
      el("condition", null, ex(tv(s.condition)))
    ]);
    var objDesc = el("objectDesc",
      tv(s.formatLabel) ? { form: tv(s.formatLabel) } : null,
      suppDesc);

    /* physDesc — handDesc (inking) */
    var hnote = [];
    if (tv(s.inkingTechniqueRef)) {
      hnote.push(el("term",
        { type: "inkingTechnique", ref: tv(s.inkingTechniqueRef) },
        ex(tv(s.inkingTechniqueLabel))));
    }
    if (tv(s.inkingSubtypeRef)) {
      hnote.push(el("term",
        { type: "inkingSubtype", ref: tv(s.inkingSubtypeRef) },
        ex(tv(s.inkingSubtypeLabel))));
    }
    if (tv(s.inkingMediumRef)) {
      hnote.push(el("term",
        { type: "inkingMedium", ref: tv(s.inkingMediumRef) },
        ex(tv(s.inkingMediumLabel))));
    }
    if (tv(s.inkingIntensity)) {
      hnote.push(el("note", { type: "inkingIntensity" }, ex(tv(s.inkingIntensity)) + "/10"));
    }
    var handDesc = hnote.length ? el("handDesc", null, el("handNote", null, hnote)) : null;

    /* physDesc — additions (paratext). Colophons and seals are repeatable —
       a mounted rubbing can carry several owner colophons or seal
       impressions — so each renders as its own <p>, with author/date or
       owner folded into the label when given. */
    function paratextPs(list, typeToken, defaultLabel, textKey, metaFn) {
      return (list || []).map(function (item) {
        if (!tv(item[textKey])) return null;
        var meta = metaFn(item).map(tv).filter(Boolean).join(", ");
        var lbl = defaultLabel + (meta ? " (" + meta + ")" : "");
        return "<p type=\"" + typeToken + "\"><label>" + ex(lbl) + "</label>: " + ex(tv(item[textKey])) + "</p>";
      }).filter(Boolean);
    }
    var addParts = [];
    addParts = addParts.concat(paratextPs(s.paratexts, "colophon", "Colophon 跋", "text",
      function (pt) { return [pt.author, pt.date]; }));
    addParts = addParts.concat(paratextPs(s.seals, "seal", "Seal 印章", "text",
      function (sl) { return [sl.owner]; }));
    if (tv(s.objectInscriptions))  addParts.push("<p><label>Inscriptions 器物題記</label>: " + ex(tv(s.objectInscriptions)) + "</p>");
    if (tv(s.markTypeLabel) || tv(s.markLocation)) {
      addParts.push(el("note", { type: "mark", subtype: tv(s.markTypeToken) },
        [
          tv(s.markTypeLabel) ? el("term", null, ex(tv(s.markTypeLabel))) : null,
          tv(s.markLocation)  ? el("locus", null, ex(tv(s.markLocation))) : null
        ]));
    }
    var additions = addParts.length ? el("additions", null, addParts.join("\n")) : null;

    var physDesc = el("physDesc", null, [objDesc, handDesc, additions]);

    /* history — three creation stages tracked separately (French/EFEO
       rubbing schema): the original work's composition, the engraving of
       the stone/object, and the taking of THIS rubbing. Each origin only
       appears if something was actually filled in for that stage. */
    function placeNameEls(zh, pinyin) {
      var pn = [];
      if (tv(zh))     pn.push(el("placeName", { "xml:lang": "zh" }, ex(tv(zh))));
      if (tv(pinyin)) pn.push(el("placeName", { "xml:lang": "und-Latn-pinyin" }, ex(tv(pinyin))));
      return pn.length ? pn : null;
    }
    var origOriginalWork = (tv(s.dateOriginalWork) || tv(s.dynastyOriginalWork))
      ? el("origin", { type: "originalWork" }, [
          tv(s.dateOriginalWork) ? el("origDate",
            tv(s.dateOriginalWorkISO) ? { when: tv(s.dateOriginalWorkISO) } : null,
            ex(tv(s.dateOriginalWork))) : null,
          tv(s.dynastyOriginalWork) ? el("note", { type: "dynasty" }, ex(tv(s.dynastyOriginalWork))) : null
        ])
      : null;
    var origEngraving = (tv(s.dateEngraving) || tv(s.dynastyEngraving) || tv(s.placeEngravingZh) || tv(s.placeEngravingPinyin))
      ? el("origin", { type: "engraving" }, [
          tv(s.dateEngraving) ? el("origDate",
            tv(s.dateEngravingISO) ? { when: tv(s.dateEngravingISO) } : null,
            ex(tv(s.dateEngraving))) : null,
          tv(s.dynastyEngraving) ? el("note", { type: "dynasty" }, ex(tv(s.dynastyEngraving))) : null,
          el("origPlace", null, placeNameEls(s.placeEngravingZh, s.placeEngravingPinyin))
        ])
      : null;
    var origRubbing = (tv(s.dateCreated) || tv(s.placeRubbingZh) || tv(s.placeRubbingPinyin))
      ? el("origin", { type: "rubbing" }, [
          tv(s.dateCreated) ? el("origDate",
            tv(s.dateCreatedISO) ? { when: tv(s.dateCreatedISO) } : null,
            ex(tv(s.dateCreated))) : null,
          el("origPlace",
            tv(s.placeRubbingTypeToken) ? { type: tv(s.placeRubbingTypeToken) } : null,
            placeNameEls(s.placeRubbingZh, s.placeRubbingPinyin))
        ])
      : null;
    var history = el("history", null, [
      origOriginalWork, origEngraving, origRubbing,
      el("provenance",   null, ex(tv(s.provenance))),
      el("acquisition",
        tv(s.dateAcquiredISO) ? { when: tv(s.dateAcquiredISO) } : null,
        ex(tv(s.acquisition)))
    ]);

    /* additional / listBibl */
    var bibs = [];
    if (tv(s.inscriptionFile)) {
      bibs.push(el("relatedItem", { type: "surrogateOf" },
        el("bibl", null,
          el("ptr", { target: tv(s.inscriptionFile) }, null))));
    }
    if (tv(s.concordanceRef)) {
      bibs.push(el("bibl",
        { type: "concordance", ref: tv(s.concordanceRef) },
        "Concordance: " + ex(tv(s.concordanceLabel))));
    }
    if (tv(s.techniqueRef)) {
      bibs.push(el("bibl",
        { type: "rubbingTechnique", ref: tv(s.techniqueRef) },
        "Technique: " + ex(tv(s.techniqueLabel))));
    }
    if (tv(s.copyingRef)) {
      bibs.push(el("bibl",
        { type: "copyingTechnique", ref: tv(s.copyingRef) },
        ex(tv(s.copyingLabel))));
    }
    if (tv(s.rubObjectTypeRef)) {
      bibs.push(el("bibl",
        { type: "rubbedObjectType", ref: tv(s.rubObjectTypeRef) },
        ex(tv(s.rubObjectTypeLabel))));
    }
    tv(s.bibliography).split("\n").map(function (l) { return l.trim(); }).filter(Boolean)
      .forEach(function (l) { bibs.push(el("bibl", null, ex(l))); });
    var additional = bibs.length
      ? el("additional", null, el("listBibl", null, bibs))
      : null;

    /* listPerson — the three fixed creation-chain identities (original
       artist / engraver / rubbing-taker) first, then any free-form agents
       (collector, sponsor, etc.). */
    var persons = [];
    var oa = s.originalArtist || {}, eng = s.engraver || {}, rub = s.rubber || {};
    var pOriginal = buildPersonEl("Original artist 原作者", null, oa.nameZh, oa.namePinyin, null, oa.birth, oa.death, null);
    if (pOriginal) persons.push(pOriginal);
    var pEngraver = buildPersonEl("Engraver 刻工", null, eng.nameZh, eng.namePinyin, null, eng.birth, eng.death, null);
    if (pEngraver) persons.push(pEngraver);
    var pRubber = buildPersonEl("Rubbing-taker 拓工", null, rub.nameZh, rub.namePinyin, null, rub.birth, rub.death, null);
    if (pRubber) persons.push(pRubber);
    (s.agents || []).forEach(function (ag) {
      if (!tv(ag.name) && !tv(ag.roleLabel)) return;
      var p = buildPersonEl(tv(ag.roleLabel), tv(ag.roleRef), null, null, ag.name, null, null, ag.date);
      if (p) persons.push(p);
    });
    var listPerson = persons.length ? el("listPerson", null, persons) : null;

    var msDesc = el("msDesc", { type: "rubbing" },
      [msId, physDesc, history, additional, listPerson]);

    var fileDesc = el("fileDesc", null, [ts, ps, el("sourceDesc", null, msDesc)]);

    /* revisionDesc */
    var rev = null;
    if (tv(s.changeWhen) || tv(s.changeWho) || tv(s.changeNote)) {
      var ca = {};
      if (tv(s.changeWhen)) ca.when = tv(s.changeWhen);
      if (tv(s.changeWho))  ca.who  = tv(s.changeWho);
      rev = el("revisionDesc", null, el("change", ca, ex(tv(s.changeNote))));
    }

    X.push(el("teiHeader", null, [fileDesc, rev]));

    /* text body */
    var bodyParts = [];
    if (tv(s.commentary)) {
      bodyParts.push(el("div", { type: "commentary" }, el("p", null, ex(tv(s.commentary)))));
    }
    X.push("<text>\n<body>\n" + (bodyParts.join("\n") || "") + "\n</body>\n</text>");
    X.push("</TEI>");
    return X.filter(Boolean).join("\n");
  }

  // ===== STATE =================================================================
  var state = {
    authority: "Epiwen / Altergraphy",
    agents: [{}],
    paratexts: [{}],
    seals: [{}],
    paperAttrs: [],
    originalArtist: {},
    engraver: {},
    rubber: {}
  };

  function setVal(key, v) {
    var el2 = document.getElementById("f-" + key);
    if (el2) el2.value = v == null ? "" : v;
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ===== VOCAB PICK HANDLERS ===================================================
  function label(o) { return (o.zh ? o.zh + " · " : "") + o.en; }

  function pickFormat(o) {
    state.formatLabel = label(o); state.formatRef = o.ref;
  }
  function pickInkTechnique(o) {
    state.inkingTechniqueLabel = label(o);
    state.inkingTechniqueRef   = o.ref;
    // clear subtype when technique changes
    state.inkingSubtypeLabel = ""; state.inkingSubtypeRef = "";
    refreshSubtypes();
  }
  function pickInkSubtype(o) {
    state.inkingSubtypeLabel = label(o); state.inkingSubtypeRef = o.ref;
  }
  function pickInkMedium(o) {
    state.inkingMediumLabel = label(o); state.inkingMediumRef = o.ref;
  }
  function pickPaperType(o) {
    state.paperLabel = label(o); state.paperRef = o.ref;
  }
  function pickConcordance(o) {
    state.concordanceLabel = o.en; state.concordanceRef = o.ref;
  }
  function pickTechnique(o) {
    state.techniqueLabel = label(o); state.techniqueRef = o.ref;
  }
  function pickRubObject(o) {
    state.rubObjectTypeLabel = label(o); state.rubObjectTypeRef = o.ref;
  }
  function pickCopyTech(o) {
    state.copyingLabel = label(o); state.copyingRef = o.ref;
  }
  function pickLicence(o) {
    state.licence = o.label; state.licenceTarget = o.target;
    setVal("licenceTarget", o.target);
  }
  function pickObjectType(o) {
    state.objectTypeLabel = label(o); state.objectTypeRef = o.ref;
  }
  function pickTitleType(o) {
    state.titleTypeLabel = label(o); state.titleTypeToken = o.token;
  }
  function pickPlaceRubbingType(o) {
    state.placeRubbingTypeLabel = label(o); state.placeRubbingTypeToken = o.token;
  }
  function pickMarkType(o) {
    state.markTypeLabel = label(o); state.markTypeToken = o.token;
  }

  function refreshSubtypes() {
    var sel = document.getElementById("f-_inkingSubtype");
    if (!sel) return;
    var opts = [];
    var tech = tv(state.inkingTechniqueLabel);
    if (tech.indexOf("Dry") !== -1 || tech.indexOf("干") !== -1)    opts = V.INKING_DRY_SUBTYPES;
    else if (tech.indexOf("Wet") !== -1 || tech.indexOf("湿") !== -1) opts = V.INKING_WET_SUBTYPES;
    sel._opts = opts;
    sel.innerHTML = '<option value="">—</option>' +
      opts.map(function (o, i) {
        return '<option value="' + i + '">' + esc(label(o)) + "</option>";
      }).join("");
    sel.disabled = (opts.length === 0);
  }

  // ===== FORM SECTIONS =========================================================
  var SECTIONS = [
    { en: "Identity", zh: "著錄", fields: [
      { key: "filename",    en: "File name",     zh: "檔名",     ph: "RUB_1.xml" },
      { key: "titleEn",     en: "English title", zh: "英文標題" },
      { key: "titlePinyin", en: "Pinyin title",  zh: "拼音標題" },
      { key: "titleZh",     en: "Chinese title", zh: "中文標題" },
      { type: "vocab", key: "_titleType", en: "Title type", zh: "標題類型",
        hint_en: "Is this the rubbing's own title, or the title of the original work it reproduces?",
        hint_zh: "此為拓本本身之標題，或所拓原作之標題？",
        options: V.TITLE_TYPES,
        label: function (o) { return label(o); }, pick: pickTitleType },
      { key: "editor",      en: "Editor",         zh: "編者" }
    ]},
    { en: "Object type", zh: "物件類型", fields: [
      { type: "vocab", key: "_objectType", en: "Reproduction type", zh: "複製類型",
        hint_en: "Hand-taken rubbing vs. a photographic/print facsimile",
        hint_zh: "手拓拓片，或攝影/印刷複製品",
        options: V.OBJECT_TYPES,
        label: function (o) { return label(o); }, pick: pickObjectType }
    ]},
    { en: "Inscription reference", zh: "銘文參照", fields: [
      { key: "inscriptionFile",
        en: "Source inscription file", zh: "銘文檔名", ph: "SNS_2.xml",
        hint_en: "Filename of the inscription this rubbing was taken from",
        hint_zh: "本拓本所從之銘文檔名" }
    ]},
    { en: "Holding & identifier", zh: "收藏與編號", fields: [
      { row: [
        { key: "country",    en: "Country",    zh: "國別",  ph: "France 法國" },
        { key: "region",     en: "Region",     zh: "省/區", ph: "Île-de-France" },
        { key: "settlement", en: "Settlement", zh: "市/縣", ph: "Paris 巴黎" }
      ]},
      { key: "institution", en: "Institution",             zh: "機構",   ph: "Bibliothèque nationale de France" },
      { key: "repository",  en: "Repository / collection", zh: "收藏部門", ph: "Estampes et photographies" },
      { key: "inventoryNo", en: "Inventory no.",           zh: "索書號" }
    ]},
    { en: "Format", zh: "支持物形制", fields: [
      { type: "vocab", key: "_format", en: "Support format", zh: "支持物形式",
        options: V.RUBBING_FORMATS,
        label: function (o) { return label(o); }, pick: pickFormat },
      { row: [
        { key: "heightCm", type: "number", en: "Height (cm)", zh: "高" },
        { key: "widthCm",  type: "number", en: "Width (cm)",  zh: "寬" }
      ]},
      { row: [
        { key: "mountHeightCm", type: "number", en: "Mount height (cm)", zh: "裱件高" },
        { key: "mountWidthCm",  type: "number", en: "Mount width (cm)",  zh: "裱件寬" }
      ]},
      { key: "condition", en: "Condition", zh: "保存狀況" }
    ]},
    { en: "Inking", zh: "墨 / 拓印技法", fields: [
      { type: "vocab", key: "_inkingTechnique",
        en: "Inking technique", zh: "拓印技法",
        options: V.INKING_TECHNIQUES,
        label: function (o) { return label(o); }, pick: pickInkTechnique },
      { type: "vocab", key: "_inkingSubtype",
        en: "Subtype (dry/wet variant)", zh: "細分技法",
        options: [],
        label: function (o) { return label(o); }, pick: pickInkSubtype },
      { type: "vocab", key: "_inkingMedium",
        en: "Ink medium / pigment", zh: "墨料",
        options: V.INKING_MEDIA,
        label: function (o) { return label(o); }, pick: pickInkMedium },
      { key: "inkingIntensity", type: "number",
        en: "Ink intensity (1–10)", zh: "墨色深淺（1–10）",
        hint_en: "Grey scale: 1 = lightest, 10 = blackest",
        hint_zh: "1 = 最淡，10 = 最深" }
    ]},
    { en: "Paper", zh: "紙張", fields: [
      { type: "vocab", key: "_paperType",
        en: "Paper type", zh: "紙張類型",
        options: V.PAPER_TYPES,
        label: function (o) { return label(o); }, pick: pickPaperType },
      { custom: "paperAttributes" }
    ]},
    { en: "Relationship with original", zh: "與原石的關係", fields: [
      { type: "vocab", key: "_concordance",
        en: "Concordance with original", zh: "與原石一致程度",
        options: V.CONCORDANCE_LEVELS,
        label: function (o) {
          return o.en + (o.zh ? " / " + o.zh : "") +
            (o.definition ? "  — " + o.definition.slice(0, 45) + "…" : "");
        }, pick: pickConcordance },
      { type: "vocab", key: "_technique",
        en: "Rubbing technique", zh: "拓製方式",
        options: V.CONTACT_TECHNIQUES,
        label: function (o) {
          return (o.contact ? "[contact] " : "[no contact] ") + label(o);
        }, pick: pickTechnique },
      { type: "vocab", key: "_rubObject",
        en: "Rubbed object type", zh: "拓製對象類型",
        options: V.RUBBED_OBJECT_TYPES,
        label: function (o) { return label(o); }, pick: pickRubObject }
    ]},
    { en: "Other copying technique", zh: "其他複製方式", fields: [
      { type: "vocab", key: "_copyTech",
        en: "Copying technique", zh: "複製技法",
        options: V.OTHER_COPY_TECHNIQUES,
        label: function (o) { return label(o); }, pick: pickCopyTech }
    ]},
    { en: "Paratext", zh: "旁白文字（跋語、印章、記號）", fields: [
      { custom: "paratexts" },
      { custom: "seals" },
      { key: "objectInscriptions", type: "textarea", en: "Inscriptions on object", zh: "器物題記",
        hint_en: "Collector's notes, catalogue marks etc. written on the object — distinct from the rubbed text itself",
        hint_zh: "器物本身所題之文字（如藏家題識、編目記號），非拓製之銘文本身" },
      { type: "vocab", key: "_markType", en: "Mark type", zh: "記號類型",
        options: V.MARK_TYPES,
        label: function (o) { return label(o); }, pick: pickMarkType },
      { key: "markLocation", en: "Mark location", zh: "記號位置",
        hint_en: "Where on the object the mark appears" }
    ]},
    { en: "Creation", zh: "創作與製作", fields: [
      { custom: "originalArtist" },
      { row: [
        { key: "dateOriginalWork",    en: "Date of original work", zh: "原作創作年代" },
        { key: "dateOriginalWorkISO", en: "ISO year",              zh: "公曆年" }
      ]},
      { key: "dynastyOriginalWork", en: "Dynasty (original work)", zh: "原作朝代" },
      { custom: "engraver" },
      { row: [
        { key: "dateEngraving",    en: "Date of engraving", zh: "刻製年代" },
        { key: "dateEngravingISO", en: "ISO year",          zh: "公曆年" }
      ]},
      { key: "dynastyEngraving", en: "Dynasty (engraving)", zh: "刻製朝代" },
      { row: [
        { key: "placeEngravingZh",     en: "Place of engraving (Chinese)", zh: "刻製地點（中文）" },
        { key: "placeEngravingPinyin", en: "Place of engraving (pinyin)",  zh: "刻製地點（拼音）" }
      ]},
      { custom: "rubber" },
      { row: [
        { key: "dateCreated",    en: "Date of rubbing",     zh: "拓製年代", ph: "1880年代" },
        { key: "dateCreatedISO", en: "ISO year",            zh: "公曆年",  ph: "1880" }
      ]},
      { row: [
        { key: "placeRubbingZh",     en: "Place of rubbing (Chinese)", zh: "拓製地點（中文）" },
        { key: "placeRubbingPinyin", en: "Place of rubbing (pinyin)",  zh: "拓製地點（拼音）" }
      ]},
      { type: "vocab", key: "_placeRubbingType", en: "Place type", zh: "地點類型",
        hint_en: "Was this rubbing taken directly off the object (in situ) or from a surrogate elsewhere?",
        hint_zh: "此拓本是直接就原物拓製（原址），或就異地之複製品拓製？",
        options: V.PLACE_TYPES,
        label: function (o) { return label(o); }, pick: pickPlaceRubbingType }
    ]},
    { en: "Other persons", zh: "其他相關人物", fields: [
      { custom: "agents" }
    ]},
    { en: "Dates & provenance", zh: "紀年與收藏史", fields: [
      { key: "dateParatext",   en: "Date on paratext",   zh: "旁白年代",
        hint_en: "Date appearing in colophon or seal" },
      { row: [
        { key: "dateAcquired",    en: "Date acquired",    zh: "入藏日期", ph: "1920" },
        { key: "dateAcquiredISO", en: "ISO year",          zh: "公曆年",  ph: "1920" }
      ]},
      { key: "provenance",  type: "textarea", en: "Provenance / collection history", zh: "流傳歷史" },
      { key: "acquisition", en: "Acquisition note", zh: "入藏說明" }
    ]},
    { en: "Commentary & bibliography", zh: "注釋與參考文獻", fields: [
      { key: "commentary",   type: "textarea", en: "Commentary / comments", zh: "注釋" },
      { key: "bibliography", type: "textarea", en: "Bibliography (one per line)", zh: "參考文獻（每行一條）" }
    ]},
    { en: "Publication & revision", zh: "出版與修訂", fields: [
      { key: "authority", en: "Authority", zh: "發布機構" },
      { type: "vocab", key: "_licence", en: "Licence", zh: "授權",
        options: V.LICENCES,
        label: function (o) { return o.label; }, pick: pickLicence },
      { key: "licenceTarget", en: "Licence URL", zh: "授權連結" },
      { row: [
        { key: "changeWhen", en: "Change date", zh: "修訂日期", ph: "2026-06-19" },
        { key: "changeWho",  en: "Change by",   zh: "修訂者" },
        { key: "changeNote", en: "Change note", zh: "修訂說明" }
      ]}
    ]}
  ];

  // ===== CUSTOM BLOCKS =========================================================

  // -- Paper attributes (checkboxes) --
  var _paBox = null;
  function renderPaperAttributesBlock() {
    var wrap = document.createElement("div"); wrap.className = "field";
    wrap.innerHTML = '<span class="label">' +
      '<span class="en">Paper attributes</span>' +
      '<span class="zh">紙張特性</span></span>';
    _paBox = document.createElement("div"); _paBox.className = "checkbox-group";
    V.PAPER_ATTRIBUTES.forEach(function (attr, i) {
      var lbl = document.createElement("label"); lbl.className = "check-label";
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.id = "pa-" + i; cb.value = i;
      cb.addEventListener("change", function () {
        var idx = parseInt(cb.value, 10);
        var pos = state.paperAttrs.findIndex(function (a) {
          return a.ref === V.PAPER_ATTRIBUTES[idx].ref;
        });
        if (cb.checked && pos === -1) state.paperAttrs.push(V.PAPER_ATTRIBUTES[idx]);
        else if (!cb.checked && pos !== -1) state.paperAttrs.splice(pos, 1);
        update();
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(
        " " + attr.en + (attr.zh ? " / " + attr.zh : "")));
      _paBox.appendChild(lbl);
    });
    wrap.appendChild(_paBox);
    return wrap;
  }

  // -- Fixed creator identity (original artist / engraver / rubbing-taker) --
  // Unlike the repeatable "agents" list below, each of these is exactly one
  // person (or unknown), so no add/remove — just four fields.
  function renderCreatorBlock(stateKey, titleEn, titleZh) {
    var box = document.createElement("div"); box.className = "textblock";
    var head = document.createElement("div"); head.className = "textblock-head";
    head.innerHTML = "<strong><span class=\"en\">" + esc(titleEn) + "</span>" +
      "<span class=\"zh\">" + esc(titleZh) + "</span></strong>";
    box.appendChild(head);

    var row1 = document.createElement("div"); row1.className = "field row";
    var row2 = document.createElement("div"); row2.className = "field row";

    function sub(labelEn, labelZh, subKey, row) {
      var wrap = document.createElement("div");
      wrap.innerHTML = '<span class="label"><span class="en">' + esc(labelEn) +
        '</span><span class="zh">' + esc(labelZh) + "</span></span>";
      var inp = document.createElement("input"); inp.type = "text";
      inp.value = (state[stateKey] && state[stateKey][subKey]) || "";
      inp.addEventListener("input", function () {
        state[stateKey] = state[stateKey] || {};
        state[stateKey][subKey] = inp.value;
        update();
      });
      wrap.appendChild(inp); row.appendChild(wrap);
    }
    sub("Name (pinyin)",  "姓名（拼音）", "namePinyin", row1);
    sub("Name (Chinese)", "姓名（中文）", "nameZh",     row1);
    sub("Birth",          "生年",         "birth",      row2);
    sub("Death",          "卒年",         "death",      row2);

    box.appendChild(row1); box.appendChild(row2);
    return box;
  }

  // -- Generic repeatable block of plain text-input rows (paratexts, seals):
  // add/remove rows just like the agents block, but with caller-supplied
  // sub-fields instead of the fixed name/role/date shape agents needs.
  function renderRepeatableTextBlock(stateKey, subFields, titleEn, titleZh, addEn, addZh) {
    var wrap = document.createElement("div");
    var box = document.createElement("div");
    wrap.appendChild(box);

    function renderRows() {
      box.innerHTML = "";
      var list = state[stateKey] || (state[stateKey] = [{}]);
      list.forEach(function (item, i) {
        var rowBox = document.createElement("div"); rowBox.className = "textblock";
        var head = document.createElement("div"); head.className = "textblock-head";
        head.innerHTML = "<strong>" +
          '<span class="en">' + esc(titleEn) + '</span><span class="zh">' + esc(titleZh) + "</span>" +
          " " + (i + 1) + "</strong>";
        if (list.length > 1) {
          var del = document.createElement("button");
          del.type = "button"; del.className = "btn small";
          del.innerHTML = '− <span class="en">remove</span><span class="zh">刪除</span>';
          del.addEventListener("click", function () { list.splice(i, 1); renderRows(); update(); });
          head.appendChild(del);
        }
        rowBox.appendChild(head);

        var row = document.createElement("div"); row.className = "field row";
        subFields.forEach(function (sf) {
          var fwrap = document.createElement("div");
          fwrap.innerHTML = '<span class="label"><span class="en">' + esc(sf.en) +
            '</span><span class="zh">' + esc(sf.zh) + "</span></span>";
          var ctrl = sf.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
          if (ctrl.tagName === "INPUT") ctrl.type = "text";
          ctrl.value = item[sf.key] || "";
          ctrl.addEventListener("input", function () { item[sf.key] = ctrl.value; update(); });
          fwrap.appendChild(ctrl);
          row.appendChild(fwrap);
        });
        rowBox.appendChild(row);
        box.appendChild(rowBox);
      });
    }

    var addBtn = document.createElement("button");
    addBtn.type = "button"; addBtn.className = "btn";
    addBtn.innerHTML = '+ <span class="en">' + esc(addEn) + '</span><span class="zh">' + esc(addZh) + "</span>";
    addBtn.addEventListener("click", function () {
      (state[stateKey] || (state[stateKey] = [])).push({});
      renderRows(); update();
    });
    wrap.appendChild(addBtn);
    renderRows();
    return wrap;
  }

  // -- Agents (repeatable person block) --
  var _agBox = null;
  function renderAgentsBlock() {
    var wrap = document.createElement("div");
    _agBox = document.createElement("div"); _agBox.id = "agents-container";
    wrap.appendChild(_agBox);
    var addBtn = document.createElement("button");
    addBtn.type = "button"; addBtn.className = "btn";
    addBtn.innerHTML = '+ <span class="en">Add person</span><span class="zh">增加人物</span>';
    addBtn.addEventListener("click", function () {
      state.agents.push({}); renderAgents(); update();
    });
    wrap.appendChild(addBtn);
    renderAgents();
    return wrap;
  }
  function renderAgents() {
    if (!_agBox) return;
    _agBox.innerHTML = "";
    state.agents.forEach(function (ag, i) { _agBox.appendChild(renderAgentRow(ag, i)); });
  }
  function renderAgentRow(ag, i) {
    var box  = document.createElement("div"); box.className = "textblock";
    var head = document.createElement("div"); head.className = "textblock-head";
    head.innerHTML = "<strong>" +
      '<span class="en">Person</span><span class="zh">人物</span>' +
      " " + (i + 1) + "</strong>";
    if (state.agents.length > 1) {
      var del = document.createElement("button");
      del.type = "button"; del.className = "btn small";
      del.innerHTML = '− <span class="en">remove</span><span class="zh">刪除</span>';
      del.addEventListener("click", function () {
        state.agents.splice(i, 1); renderAgents(); update();
      });
      head.appendChild(del);
    }
    box.appendChild(head);

    var row = document.createElement("div"); row.className = "field row";

    // name
    var nWrap = document.createElement("div");
    nWrap.innerHTML = '<span class="label"><span class="en">Name</span><span class="zh">姓名</span></span>';
    var nIn = document.createElement("input"); nIn.type = "text"; nIn.value = ag.name || "";
    nIn.addEventListener("input", function () { ag.name = nIn.value; update(); });
    nWrap.appendChild(nIn); row.appendChild(nWrap);

    // role
    var rWrap = document.createElement("div");
    rWrap.innerHTML = '<span class="label"><span class="en">Role</span><span class="zh">角色</span></span>';
    var rSel = document.createElement("select");
    rSel.innerHTML = '<option value="">—</option>' +
      V.AGENT_ROLES.map(function (r, j) {
        return '<option value="' + j + '">' + esc(label(r)) + "</option>";
      }).join("");
    if (ag.roleRef) {
      for (var j = 0; j < V.AGENT_ROLES.length; j++) {
        if (V.AGENT_ROLES[j].ref === ag.roleRef) { rSel.value = String(j); break; }
      }
    }
    rSel.addEventListener("change", function () {
      var j = parseInt(rSel.value, 10);
      if (!isNaN(j)) { ag.roleLabel = V.AGENT_ROLES[j].en; ag.roleRef = V.AGENT_ROLES[j].ref; }
      else            { ag.roleLabel = ""; ag.roleRef = ""; }
      update();
    });
    rWrap.appendChild(rSel); row.appendChild(rWrap);

    // date
    var dWrap = document.createElement("div");
    dWrap.innerHTML = '<span class="label"><span class="en">Active / date</span><span class="zh">活動年代</span></span>';
    var dIn = document.createElement("input"); dIn.type = "text"; dIn.value = ag.date || "";
    dIn.addEventListener("input", function () { ag.date = dIn.value; update(); });
    dWrap.appendChild(dIn); row.appendChild(dWrap);

    box.appendChild(row);
    return box;
  }

  // ===== FORM RENDERER =========================================================
  function labelSpan(f) {
    return '<span class="label">' +
      '<span class="en">' + esc(f.en) + "</span>" +
      (f.zh ? '<span class="zh">' + esc(f.zh) + "</span>" : "") +
      "</span>";
  }
  function renderField(f) {
    if (f.custom === "paperAttributes") return renderPaperAttributesBlock();
    if (f.custom === "agents")          return renderAgentsBlock();
    if (f.custom === "originalArtist")  return renderCreatorBlock("originalArtist", "Original artist", "原作者");
    if (f.custom === "engraver")        return renderCreatorBlock("engraver", "Engraver", "刻工");
    if (f.custom === "rubber")          return renderCreatorBlock("rubber", "Rubbing-taker", "拓工");
    if (f.custom === "paratexts") return renderRepeatableTextBlock("paratexts",
      [
        { key: "text",   type: "textarea", en: "Text",             zh: "內容" },
        { key: "author", en: "Author / writer", zh: "作者" },
        { key: "date",   en: "Date",             zh: "年代" }
      ],
      "Colophon / note", "跋文題記", "Add paratext", "增加旁白文字");
    if (f.custom === "seals") return renderRepeatableTextBlock("seals",
      [
        { key: "text",  en: "Seal text",           zh: "印文" },
        { key: "owner", en: "Owner / attribution",  zh: "鈐印者" }
      ],
      "Seal", "印章", "Add seal", "增加印章");

    var wrap = document.createElement("div"); wrap.className = "field";

    if (f.type === "vocab") {
      wrap.innerHTML = labelSpan(f);
      var sel = document.createElement("select"); sel.id = "f-" + f.key;
      sel.innerHTML = '<option value="">—</option>' +
        f.options.map(function (o, i) {
          return '<option value="' + i + '">' + esc(f.label(o)) + "</option>";
        }).join("");
      if (f.key === "_inkingSubtype") sel.disabled = true;
      sel.addEventListener("change", function () {
        var opts = sel._opts || f.options;
        var i = parseInt(sel.value, 10);
        if (!isNaN(i)) { f.pick(opts[i]); update(); }
      });
      wrap.appendChild(sel);
      return wrap;
    }

    var ctrl;
    if (f.type === "textarea") {
      ctrl = document.createElement("textarea");
    } else {
      ctrl = document.createElement("input");
      ctrl.type = (f.type === "number") ? "number" : "text";
    }
    ctrl.id = "f-" + f.key;
    if (f.ph) ctrl.placeholder = f.ph;
    wrap.innerHTML = labelSpan(f);
    ctrl.addEventListener("input", function () { state[f.key] = ctrl.value; update(); });
    wrap.appendChild(ctrl);

    if (f.hint_en || f.hint_zh) {
      var hint = document.createElement("div"); hint.className = "hint";
      hint.innerHTML =
        (f.hint_en ? '<span class="en">' + esc(f.hint_en) + "</span>" : "") +
        (f.hint_zh ? '<span class="zh">' + esc(f.hint_zh) + "</span>" : "");
      wrap.appendChild(hint);
    }
    return wrap;
  }
  function renderRow(fields) {
    var row = document.createElement("div"); row.className = "field row";
    fields.forEach(function (f) {
      var c = renderField(f); c.classList.remove("field"); row.appendChild(c);
    });
    return row;
  }
  function renderForm() {
    var root = document.getElementById("form");
    SECTIONS.forEach(function (sec) {
      var h = document.createElement("div"); h.className = "section-title";
      h.innerHTML = '<span class="en">' + esc(sec.en) + "</span>" +
                    '<span class="zh">' + esc(sec.zh) + "</span>";
      root.appendChild(h);
      sec.fields.forEach(function (f) {
        if (f.row) root.appendChild(renderRow(f.row));
        else       root.appendChild(renderField(f));
      });
    });
    setVal("authority", state.authority);
  }

  // ===== HTML PREVIEW CARD =====================================================
  function buildPreviewHTML(s) {
    function row(lbl, val) {
      if (!val && val !== 0) return "";
      return "<dt>" + esc(lbl) + "</dt><dd>" + esc(String(val)) + "</dd>";
    }
    function sec(title, rows) {
      var r = rows.filter(Boolean).join("");
      if (!r) return "";
      return '<section class="hp-section"><h4 class="hp-st">' + esc(title) +
             '</h4><dl class="hp-dl">' + r + "</dl></section>";
    }
    function personRow(labelEn, p) {
      p = p || {};
      var name = [p.nameZh, p.namePinyin].filter(Boolean).join(" · ");
      if (!name) return "";
      var val = name;
      var dates = [p.birth, p.death].filter(Boolean).join("–");
      if (dates) val += " (" + dates + ")";
      return row(labelEn, val);
    }

    var html = '<div class="hp-preview">';
    html += sec("Identity", [
      row("File",         s.filename),
      row("Title EN",     s.titleEn),
      row("Title pinyin", s.titlePinyin),
      row("Title ZH",     s.titleZh),
      row("Title type",   s.titleTypeLabel),
      row("Editor",       s.editor)
    ]);
    if (tv(s.objectTypeLabel)) {
      html += sec("Object type", [row("Reproduction type", s.objectTypeLabel)]);
    }
    if (tv(s.inscriptionFile)) {
      html += sec("Inscription reference", [row("Source file", s.inscriptionFile)]);
    }
    html += sec("Holding", [
      row("Country",     s.country),
      row("Region",      s.region),
      row("Settlement",  s.settlement),
      row("Institution", s.institution),
      row("Repository",  s.repository),
      row("Inventory",   s.inventoryNo)
    ]);
    html += sec("Format", [
      row("Format",    s.formatLabel),
      (s.heightCm || s.widthCm)
        ? row("H × W", [s.heightCm, s.widthCm].filter(Boolean).join(" × ") + " cm")
        : "",
      (s.mountHeightCm || s.mountWidthCm)
        ? row("Mount H × W", [s.mountHeightCm, s.mountWidthCm].filter(Boolean).join(" × ") + " cm")
        : "",
      row("Condition", s.condition)
    ]);
    html += sec("Inking", [
      row("Technique",  s.inkingTechniqueLabel),
      row("Subtype",    s.inkingSubtypeLabel),
      row("Medium",     s.inkingMediumLabel),
      s.inkingIntensity ? row("Intensity", s.inkingIntensity + "/10") : ""
    ]);
    html += sec("Paper", [
      row("Type",       s.paperLabel),
      s.paperAttrs && s.paperAttrs.length
        ? row("Attributes", s.paperAttrs.map(function (a) { return a.en; }).join(", "))
        : ""
    ]);
    html += sec("Relationship with original", [
      row("Concordance",   s.concordanceLabel),
      row("Technique",     s.techniqueLabel),
      row("Rubbed object", s.rubObjectTypeLabel)
    ]);
    if (tv(s.copyingLabel)) {
      html += sec("Other copying technique", [row("Technique", s.copyingLabel)]);
    }
    var paratextRows = (s.paratexts || [])
      .filter(function (pt) { return tv(pt.text); })
      .map(function (pt, i) {
        var meta = [pt.author, pt.date].filter(tv).join(", ");
        return row("Colophon " + (i + 1) + (meta ? " (" + meta + ")" : ""), pt.text);
      });
    var sealRows = (s.seals || [])
      .filter(function (sl) { return tv(sl.text); })
      .map(function (sl, i) {
        return row("Seal " + (i + 1) + (tv(sl.owner) ? " (" + sl.owner + ")" : ""), sl.text);
      });
    html += sec("Paratext", paratextRows.concat(sealRows).concat([
      row("Inscriptions on object", s.objectInscriptions),
      row("Mark type",     s.markTypeLabel),
      row("Mark location", s.markLocation)
    ]));
    html += sec("Creation", [
      personRow("Original artist", s.originalArtist),
      row("Date of original work", s.dateOriginalWork),
      s.dateOriginalWorkISO ? row("ISO year", s.dateOriginalWorkISO) : "",
      row("Dynasty (original work)", s.dynastyOriginalWork),
      personRow("Engraver", s.engraver),
      row("Date of engraving", s.dateEngraving),
      s.dateEngravingISO ? row("ISO year", s.dateEngravingISO) : "",
      row("Dynasty (engraving)", s.dynastyEngraving),
      (s.placeEngravingZh || s.placeEngravingPinyin)
        ? row("Place of engraving", [s.placeEngravingZh, s.placeEngravingPinyin].filter(Boolean).join(" · "))
        : "",
      personRow("Rubbing-taker", s.rubber),
      row("Date of rubbing", s.dateCreated),
      s.dateCreatedISO ? row("ISO year", s.dateCreatedISO) : "",
      (s.placeRubbingZh || s.placeRubbingPinyin)
        ? row("Place of rubbing", [s.placeRubbingZh, s.placeRubbingPinyin].filter(Boolean).join(" · "))
        : "",
      row("Place type", s.placeRubbingTypeLabel)
    ]);
    if (s.agents && s.agents.length) {
      var agRows = s.agents
        .filter(function (a) { return tv(a.name) || tv(a.roleLabel); })
        .map(function (a) {
          var label2 = a.roleLabel || "person";
          var val = tv(a.name) || "—";
          if (a.date) val += " (" + a.date + ")";
          return row(label2, val);
        });
      if (agRows.length) html += sec("Other persons", agRows);
    }
    html += sec("Dates & provenance", [
      row("Date on paratext", s.dateParatext),
      row("Date acquired",    s.dateAcquired),
      row("Provenance",       s.provenance)
    ]);
    if (tv(s.commentary)) html += sec("Commentary", [row("Note", s.commentary)]);
    html += "</div>";
    return html;
  }

  // ===== UPDATE ================================================================
  function cleanState() {
    var d = {};
    Object.keys(state).forEach(function (k) { d[k] = state[k]; });
    return d;
  }
  function update() {
    var xml = buildXML(cleanState());
    var out = document.getElementById("out");
    if (out) out.textContent = xml;
    var ph = document.getElementById("preview-html");
    if (ph) ph.innerHTML = buildPreviewHTML(state);
    var v = document.getElementById("validity");
    if (v) {
      var ready = tv(state.filename) && tv(state.inscriptionFile);
      v.textContent = ready ? "✓ ready" : "filename + inscription ref required";
      v.style.color = ready ? "var(--ok)" : "var(--muted)";
    }
  }

  // ===== DOM WIRING ============================================================
  document.addEventListener("DOMContentLoaded", function () {
    renderForm();
    refreshSubtypes();
    update();

    // Language toggle
    Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"), function (btn) {
      btn.addEventListener("click", function () {
        document.body.className = "lang-" + btn.dataset.lang;
        Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"), function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
      });
    });

    // View toggle
    var btnPrev = document.getElementById("btn-view-preview");
    var btnXml  = document.getElementById("btn-view-xml");
    var pHtml   = document.getElementById("preview-html");
    var pXml    = document.getElementById("preview-xml");
    function setView(mode) {
      if (pHtml) pHtml.style.display = mode === "preview" ? "" : "none";
      if (pXml)  pXml.style.display  = mode === "xml"     ? "" : "none";
      if (btnPrev) btnPrev.classList.toggle("active", mode === "preview");
      if (btnXml)  btnXml.classList.toggle("active",  mode === "xml");
    }
    if (btnPrev) btnPrev.addEventListener("click", function () { setView("preview"); });
    if (btnXml)  btnXml.addEventListener("click",  function () { setView("xml"); });

    // Reset
    var btnReset = document.getElementById("btn-reset");
    if (btnReset) btnReset.addEventListener("click", function () {
      if (!confirm("Reset all fields? / 清空所有欄位？")) return;
      state.filename = ""; state.titleEn = ""; state.titlePinyin = ""; state.titleZh = "";
      state.titleTypeLabel = ""; state.titleTypeToken = "";
      state.editor = ""; state.inscriptionFile = "";
      state.objectTypeLabel = ""; state.objectTypeRef = "";
      state.country = ""; state.region = ""; state.settlement = "";
      state.institution = ""; state.repository = ""; state.inventoryNo = "";
      state.formatLabel = ""; state.formatRef = "";
      state.heightCm = ""; state.widthCm = "";
      state.mountHeightCm = ""; state.mountWidthCm = ""; state.condition = "";
      state.inkingTechniqueLabel = ""; state.inkingTechniqueRef = "";
      state.inkingSubtypeLabel = "";  state.inkingSubtypeRef = "";
      state.inkingMediumLabel = "";   state.inkingMediumRef = "";
      state.inkingIntensity = "";
      state.paperLabel = ""; state.paperRef = ""; state.paperAttrs = [];
      state.concordanceLabel = ""; state.concordanceRef = "";
      state.techniqueLabel = ""; state.techniqueRef = "";
      state.rubObjectTypeLabel = ""; state.rubObjectTypeRef = "";
      state.copyingLabel = ""; state.copyingRef = "";
      state.paratexts = [{}]; state.seals = [{}]; state.objectInscriptions = "";
      state.markTypeLabel = ""; state.markTypeToken = ""; state.markLocation = "";
      state.agents = [{}];
      state.originalArtist = {}; state.engraver = {}; state.rubber = {};
      state.dateOriginalWork = ""; state.dateOriginalWorkISO = ""; state.dynastyOriginalWork = "";
      state.dateEngraving = ""; state.dateEngravingISO = ""; state.dynastyEngraving = "";
      state.placeEngravingZh = ""; state.placeEngravingPinyin = "";
      state.dateCreated = ""; state.dateCreatedISO = "";
      state.placeRubbingZh = ""; state.placeRubbingPinyin = "";
      state.placeRubbingTypeLabel = ""; state.placeRubbingTypeToken = "";
      state.dateParatext = "";
      state.dateAcquired = ""; state.dateAcquiredISO = "";
      state.provenance = ""; state.acquisition = "";
      state.commentary = ""; state.bibliography = "";
      state.authority = "Epiwen / Altergraphy";
      state.licence = ""; state.licenceTarget = "";
      state.changeWhen = ""; state.changeWho = ""; state.changeNote = "";

      var formEl = document.getElementById("form");
      if (formEl) formEl.innerHTML = "";
      _agBox = null; _paBox = null;
      renderForm(); refreshSubtypes(); update();
    });

    // Copy XML
    var btnCopy = document.getElementById("btn-copy");
    if (btnCopy) btnCopy.addEventListener("click", function () {
      var xml = buildXML(cleanState());
      if (navigator.clipboard) {
        navigator.clipboard.writeText(xml).then(function () {
          var prev = btnCopy.textContent;
          btnCopy.textContent = "Copied!";
          setTimeout(function () { btnCopy.textContent = prev; }, 1800);
        });
      }
    });

    // Download
    var btnDl = document.getElementById("btn-download");
    if (btnDl) btnDl.addEventListener("click", function () {
      var xml  = buildXML(cleanState());
      var fname = tv(state.filename) || "rubbing.xml";
      if (!fname.endsWith(".xml")) fname += ".xml";
      var blob = new Blob([xml], { type: "application/xml" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fname;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });

    // GitHub save + settings
    var _btnSave = document.getElementById("btn-save-github");
    var _btnCfg  = document.getElementById("btn-gh-settings");
    if (_btnSave) _btnSave.addEventListener("click", function () {
      if (window.EpiGitHub) {
        EpiGitHub.save(buildXML(cleanState()), tv(state.filename) || "rubbing.xml");
      }
    });
    if (_btnCfg) _btnCfg.addEventListener("click", function () {
      if (window.EpiGitHub) EpiGitHub.showSettings();
    });
    var _btnDel = document.getElementById("btn-delete-github");
    if (_btnDel) _btnDel.addEventListener("click", function () {
      var fn = tv(state.filename);
      if (!window.EpiGitHub || !fn) return;
      var ask = (window.EpiModal && EpiModal.confirm)
        ? EpiModal.confirm({ title: "Delete entry", message: "Do you really want to delete this entry?",
                             confirmText: "Delete", cancelText: "Cancel", danger: true })
        : Promise.resolve(window.confirm("Do you really want to delete this entry?"));
      ask.then(function (ok) {
        if (!ok) return;
        EpiGitHub.del(fn, function () {
          setTimeout(function () { window.location.href = "catalog.html?tab=rubbings"; }, 800);
        });
      });
    });

    // Preload from catalog "Edit" button (via sessionStorage)
    var _preloadRaw = sessionStorage.getItem("epiwen_preload_rubbing");
    if (_preloadRaw) {
      sessionStorage.removeItem("epiwen_preload_rubbing");
      try {
        var _preload = JSON.parse(_preloadRaw);
        Object.keys(_preload).forEach(function (k) { state[k] = _preload[k]; });
        var _formEl = document.getElementById("form");
        if (_formEl) _formEl.innerHTML = "";
        _agBox = null; _paBox = null;
        renderForm(); refreshSubtypes(); update();
        if (_preload._writeTarget && window.EpiGitHub && EpiGitHub.setTarget) {
          EpiGitHub.setTarget(_preload._writeTarget);
        }
        if (_btnDel && tv(state.filename) && state._canDelete) _btnDel.style.display = "";
      } catch (e) { console.warn("epiwen_preload_rubbing parse error", e); }
    }
  });

})();
