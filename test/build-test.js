const { buildEpiDoc } = require("../generator.js");
const example = {
  filename: "SNS_2.xml", editor: "Epiwen contributor",
  titleEn: "Mañjuśrī Prajñā stele, Mount Shuiniu (two faces)",
  titleZh: "水牛山《文殊師利所説摩訶般若波羅蜜經》碑（兩面）",
  authority: "Epiwen / Altergraphy",
  licence: "CC BY 4.0", licenceTarget: "https://creativecommons.org/licenses/by/4.0/",
  country: "China 中國", currentRegion: "Shandong 山東", currentSettlement: "Wenshang 汶上",
  repository: "in situ 原處", inventoryNo: "SNS_2",
  summary: "Northern Qi stele: Mañjuśrī Prajñā sūtra on the recto, donor colophon on the verso.",
  material: "limestone 石灰岩", materialRef: "aat:300011286",
  objectType: "stele 碑", objectTypeRef: "sst:stele",
  heightCm: "210", widthCm: "92", depthCm: "24",
  condition: "weathered; lower register effaced 風化，下段漫漶",
  layoutColumns: "1", layoutLines: "12",
  script: "regular script 楷書", scriptRef: "sst:regular-script",
  origDateText: "北齊武平六年", calendar: "#chinese", datingMethod: "#reign-era",
  whenISO: "0575", notBefore: "0575", notAfter: "0575",
  origPlace: "Mount Shuiniu 水牛山",
  langIdent: "zh", langLabel: "Literary Chinese 漢文",
  keywords: [{ ref: "sst:perfection-of-wisdom", label: "Perfection of Wisdom 般若" }],
  texts: [
    { label: "碑陽 recto", subtype: "recto", lang: "zh-Hant",
      sutraTitleZh: "文殊師利所説摩訶般若波羅蜜經", sutraTitleEn: "Sūtra of the Perfection of Wisdom Spoken by Mañjuśrī", cbeta: "T08n0232",
      editionText: "文殊師利白佛言\n世尊云何名般若波羅蜜\n佛言般若波羅蜜無邊無際",
      translationText: "Mañjuśrī addressed the Buddha: 'World-Honoured One, what is the Perfection of Wisdom?'" },
    { label: "碑陰 verso / 題記", subtype: "verso", lang: "zh-Hant",
      editionText: "武平六年歲次乙未\n邑義等敬造",
      translationText: "In the sixth year of Wuping (575)... the donor society reverently made this." }
  ],
  facsimileUrl: "images/SNS_2.jpg",
  changeWhen: "2026-06-18", changeWho: "#epiwen", changeNote: "Initial EpiDoc encoding via the Epiwen generator."
};
process.stdout.write(buildEpiDoc(example));
