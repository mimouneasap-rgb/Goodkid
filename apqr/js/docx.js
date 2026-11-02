// Minimal, dependency-free Word (.docx) writer: headings (with a contents
// field), paragraphs with **bold** markup, bullets, styled tables, PNG images,
// page breaks, a landscape section, and a header/footer with page numbers.
import { zip } from "./xlsx.js";

const x = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
const hex = (c) => String(c || "").replace("#", "").toUpperCase();
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

export const PAGE = { w: 11906, h: 16838, margin: 1000 };
export const CONTENT_P = PAGE.w - PAGE.margin * 2; // 9906 dxa
export const CONTENT_L = PAGE.h - PAGE.margin * 2; // 14838 dxa

export class Docx {
  constructor({ title = "Report", author = "APQR Master Tracker", header = "", footer = "", accent = "13315C" } = {}) {
    this.meta = { title, author, header, footer, accent: hex(accent) };
    this.body = [];
    this.media = [];
    this.width = CONTENT_P;
    this.landscape = false;
    this.docPr = 0;
  }

  /* ---------------------------------------------------------------- text */
  runs(text, { bold, italic, color, size, font } = {}) {
    const out = [];
    const re = /\*\*([^*]+)\*\*/g;
    let last = 0, m;
    const s = String(text ?? "");
    const run = (t, b) => `<w:r><w:rPr>${font ? `<w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>` : ""}${b || bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}${color ? `<w:color w:val="${hex(color)}"/>` : ""}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ""}</w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`;
    while ((m = re.exec(s))) { if (m.index > last) out.push(run(s.slice(last, m.index))); out.push(run(m[1], true)); last = m.index + m[0].length; }
    if (last < s.length || !out.length) out.push(run(s.slice(last)));
    return out.join("");
  }
  p(text, o = {}) {
    const ppr = `<w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ""}${o.keepNext ? "<w:keepNext/>" : ""}${o.pageBreakBefore ? "<w:pageBreakBefore/>" : ""}${o.border ? `<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="${hex(o.border)}"/></w:pBdr>` : ""}${o.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(o.shade)}"/>` : ""}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 100}"/>${o.indent ? `<w:ind w:left="${o.indent}"/>` : ""}${o.align ? `<w:jc w:val="${o.align}"/>` : ""}</w:pPr>`;
    this.body.push(`<w:p>${ppr}${this.runs(text, o)}</w:p>`);
    return this;
  }
  h1(text, o = {}) { return this.p(text, { style: "Heading1", ...o }); }
  h2(text) { return this.p(text, { style: "Heading2" }); }
  h3(text) { return this.p(text, { style: "Heading3" }); }
  caption(text) { return this.p(text, { style: "Caption", align: "center", after: 200 }); }
  note(text) { return this.p(text, { size: 17, color: "5A6472", italic: true, after: 120 }); }
  callout(title, lines, { fill = "E7F0FC", color = "1D5AA6" } = {}) {
    this.p(`**${title}**`, { shade: fill, border: color, color, after: 0, before: 60, indent: 160 });
    for (const l of [].concat(lines)) this.p(l, { shade: fill, border: color, after: 0, indent: 160, size: 19 });
    this.p("", { after: 120 });
    return this;
  }
  bullet(text) {
    this.body.push(`<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="60"/></w:pPr>${this.runs(text)}</w:p>`);
    return this;
  }
  pageBreak() { this.body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); return this; }
  toc(title = "Contents") {
    this.p(title, { style: "TOCHeading" });
    this.body.push(`<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:rPr><w:color w:val="6B7290"/></w:rPr><w:t>Open in Word and accept “update fields” (or right-click here › Update Field) to build the contents.</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`);
    return this;
  }

  /* --------------------------------------------------------------- tables */
  /**
   * headers: string[]; rows: (string | {text, fill, color, bold, align})[][]
   * widths: relative numbers (scaled to the content width)
   */
  table(headers, rows, widths, { size = 17, headFill = this.meta.accent, zebra = true, align = [], first = false } = {}) {
    const W = this.width;
    const tot = widths.reduce((a, b) => a + b, 0);
    const ws = widths.map((w) => Math.round((w / tot) * W));
    ws[ws.length - 1] += W - ws.reduce((a, b) => a + b, 0);
    const cell = (c, i, o = {}) => {
      const v = c !== null && typeof c === "object" ? c : { text: c };
      const fill = v.fill || o.fill;
      const al = v.align || o.align || align[i] || "left";
      return `<w:tc><w:tcPr><w:tcW w:w="${ws[i]}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${hex(fill)}"/>` : ""}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="30" w:after="30"/><w:jc w:val="${al}"/></w:pPr>${this.runs(v.text ?? "", { bold: v.bold || o.bold || (first && i === 0), color: v.color || o.color, size: v.size || o.size || size })}</w:p></w:tc>`;
    };
    const head = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${headers.map((h, i) => cell(h, i, { fill: headFill, color: "FFFFFF", bold: true, size: size - 1 })).join("")}</w:tr>`;
    const body = rows.map((r, ri) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cell(c, i, { fill: zebra && ri % 2 ? "F4F6FA" : undefined })).join("")}</w:tr>`).join("");
    this.body.push(`<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D3D8E6"/><w:left w:val="single" w:sz="4" w:color="D3D8E6"/><w:bottom w:val="single" w:sz="4" w:color="D3D8E6"/><w:right w:val="single" w:sz="4" w:color="D3D8E6"/><w:insideH w:val="single" w:sz="4" w:color="D3D8E6"/><w:insideV w:val="single" w:sz="4" w:color="D3D8E6"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${ws.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${head}${body}</w:tbl>`);
    this.p("", { after: 80 });
    return this;
  }
  /** A row of big-number tiles. tiles: [{ label, value, sub, color }] */
  tiles(tiles) {
    const W = this.width;
    const w = Math.floor(W / tiles.length);
    const cells = tiles.map((t) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${hex(t.fill || "F4F6FA")}"/><w:tcMar><w:top w:w="100" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>
      <w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${this.runs(t.label, { size: 16, color: "5A6472", bold: true })}</w:p>
      <w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${this.runs(t.value, { size: 40, bold: true, color: t.color || "0D1330" })}</w:p>
      <w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${this.runs(t.sub || "", { size: 15, color: "6B7290" })}</w:p></w:tc>`).join("");
    this.body.push(`<w:tbl><w:tblPr><w:tblW w:w="${w * tiles.length}" w:type="dxa"/><w:tblBorders><w:insideV w:val="single" w:sz="18" w:color="FFFFFF"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${tiles.map(() => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr></w:tbl>`);
    this.p("", { after: 120 });
    return this;
  }
  /** Full-width coloured band with a title (cover). */
  band(lines, { fill = "0B1232" } = {}) {
    const W = this.width;
    const ps = lines.map((l) => `<w:p><w:pPr><w:spacing w:after="${l.after ?? 80}"/></w:pPr>${this.runs(l.text, { size: l.size || 22, bold: l.bold, color: l.color || "FFFFFF" })}</w:p>`).join("");
    this.body.push(`<w:tbl><w:tblPr><w:tblW w:w="${W}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="${W}"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="3400" w:hRule="atLeast"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${W}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${hex(fill)}"/><w:tcMar><w:top w:w="500" w:type="dxa"/><w:left w:w="500" w:type="dxa"/><w:bottom w:w="400" w:type="dxa"/><w:right w:w="500" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr>${ps}</w:tc></w:tr></w:tbl>`);
    this.p("", { after: 200 });
    return this;
  }

  /* --------------------------------------------------------------- images */
  /** png: Uint8Array; pxW/pxH: pixel size (aspect); width: dxa (defaults to content width) */
  image(png, pxW, pxH, { width, caption } = {}) {
    const n = this.media.length + 1;
    this.media.push({ name: `image${n}.png`, data: png, rid: `rIdImg${n}` });
    const wd = Math.min(width || this.width, this.width);
    const cx = Math.round(wd * 635);
    const cy = Math.round(cx * (pxH / pxW));
    const id = ++this.docPr;
    this.body.push(`<w:p><w:pPr><w:keepNext/><w:spacing w:before="60" w:after="40"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Chart ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="image${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
    if (caption) this.caption(caption);
    return this;
  }

  /* ------------------------------------------------------------- sections */
  sectPr(landscape) {
    const w = landscape ? PAGE.h : PAGE.w, h = landscape ? PAGE.w : PAGE.h;
    return `<w:sectPr><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="${w}" w:h="${h}"${landscape ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="1200" w:right="${PAGE.margin}" w:bottom="1000" w:left="${PAGE.margin}" w:header="500" w:footer="450" w:gutter="0"/></w:sectPr>`;
  }
  /** Close the current section and continue in landscape (or portrait). */
  orientation(landscape) {
    if (landscape === this.landscape) return this;
    this.body.push(`<w:p><w:pPr>${this.sectPr(this.landscape)}</w:pPr></w:p>`);
    this.landscape = landscape;
    this.width = landscape ? CONTENT_L : CONTENT_P;
    return this;
  }

  /* ---------------------------------------------------------------- build */
  async build() {
    const m = this.meta;
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${this.body.join("")}${this.sectPr(this.landscape)}</w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="1A2233"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="0F766E"/></w:pBdr><w:spacing w:before="240" w:after="140"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${m.accent}"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="1E4A7A"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="0F766E"/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="160"/></w:pPr><w:rPr><w:b/><w:color w:val="${m.accent}"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${CONTENT_P}"/></w:tabs><w:spacing w:before="80" w:after="40"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${CONTENT_P}"/></w:tabs><w:spacing w:after="20"/><w:ind w:left="300"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="40" w:after="200"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:color w:val="5A6472"/><w:sz w:val="17"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="500" w:hanging="260"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="1D5AA6"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;
    const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="500" w:hanging="260"/></w:pPr><w:rPr><w:color w:val="0F766E"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
    const tabPos = CONTENT_P;
    const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}><w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="${m.accent}"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${tabPos}"/></w:tabs><w:spacing w:after="0"/></w:pPr>${this.runs(m.header, { bold: true, color: m.accent, size: 16 })}<w:r><w:rPr><w:color w:val="6B7290"/><w:sz w:val="16"/></w:rPr><w:tab/><w:t xml:space="preserve">${x(m.title)}</w:t></w:r></w:p></w:hdr>`;
    const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="D3D8E6"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="${tabPos}"/></w:tabs><w:spacing w:after="0"/></w:pPr>${this.runs(m.footer, { color: "6B7290", size: 15 })}<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:tab/><w:t xml:space="preserve">Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve"> of </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;
    const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/><w:updateFields w:val="true"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdSet" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdHdr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${this.media.map((md) => `<Relationship Id="${md.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${md.name}"/>`).join("")}</Relationships>`;
    const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(m.title)}</dc:title><dc:creator>${x(m.author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>APQR Master Tracker</Application></Properties>`;
    const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const pkgRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    const blob = await zip([
      { name: "[Content_Types].xml", data: types },
      { name: "_rels/.rels", data: pkgRels },
      { name: "docProps/core.xml", data: core },
      { name: "docProps/app.xml", data: app },
      { name: "word/document.xml", data: doc },
      { name: "word/styles.xml", data: styles },
      { name: "word/numbering.xml", data: numbering },
      { name: "word/settings.xml", data: settings },
      { name: "word/header1.xml", data: header },
      { name: "word/footer1.xml", data: footer },
      { name: "word/_rels/document.xml.rels", data: rels },
      ...this.media.map((md) => ({ name: `word/media/${md.name}`, data: md.data })),
    ]);
    return new Blob([blob], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }
}
