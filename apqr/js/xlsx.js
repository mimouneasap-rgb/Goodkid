// Minimal, dependency-free .xlsx reader and writer.
//
// Reading: unzips the workbook (DecompressionStream "deflate-raw"), then parses
// workbook.xml, sharedStrings.xml, styles.xml and each worksheet with small
// regex scanners. Date cells (by number format) come back as ISO strings
// "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM". Works in modern browsers and Node 18+.
//
// Writing: builds a valid Office Open XML workbook from arrays of rows, with a
// handful of fixed styles (header, date, datetime, percent, title, note).

const td = new TextDecoder();
const te = new TextEncoder();

/* ------------------------------------------------------------------ ZIP read */

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file (zip directory not found). Save the file as Excel Workbook (.xlsx) and try again.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nameLen));
    files.set(name, { method, csize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: [...files.keys()],
    async read(name) {
      const f = files.get(name) || files.get(name.replace(/^\//, ""));
      if (!f) return null;
      const lnameLen = dv.getUint16(f.local + 26, true);
      const lextraLen = dv.getUint16(f.local + 28, true);
      const start = f.local + 30 + lnameLen + lextraLen;
      const data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return data;
      if (f.method === 8) return inflateRaw(data);
      throw new Error(`Unsupported zip compression method ${f.method}`);
    },
    async text(name) {
      const b = await this.read(name);
      return b ? td.decode(b) : null;
    },
  };
}

/* ------------------------------------------------------------------ XML bits */

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export function decodeXml(s) {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
      if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENT[e.toLowerCase()] ?? m;
    })
    .replace(/_x([0-9A-F]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
}

function attrs(s) {
  const out = {};
  const re = /([\w:]+)\s*=\s*"([^"]*)"|([\w:]+)\s*=\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(s))) out[m[1] || m[3]] = decodeXml(m[2] ?? m[4]);
  return out;
}

function textOf(xml) {
  // Concatenate <t> runs, ignoring phonetic runs.
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m;
  while ((m = re.exec(clean))) out += m[1] ? decodeXml(m[1]) : "";
  return out;
}

/* ------------------------------------------------------------------- dates */

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
function isDateFormat(code) {
  if (!code) return false;
  const c = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  if (/^general$/i.test(c.trim())) return false;
  return /[dmyhs]/i.test(c) && !/^[#0.,%\s]+$/.test(c);
}

const pad = (n) => String(n).padStart(2, "0");
export function serialToIso(serial, date1904 = false) {
  const ms = Math.round((serial + (date1904 ? 1462 : 0) - 25569) * 86400000);
  const d = new Date(ms);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const h = d.getUTCHours(), mi = d.getUTCMinutes();
  return h || mi ? `${day}T${pad(h)}:${pad(mi)}` : day;
}
export function isoToSerial(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  return ms / 86400000 + 25569;
}

/* ------------------------------------------------------------- read workbook */

function colIndex(ref) {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}
export function colName(i) {
  let s = "";
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

function resolveTarget(target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = ("xl/" + target).split("/");
  const out = [];
  for (const p of parts) { if (p === "..") out.pop(); else if (p !== ".") out.push(p); }
  return out.join("/");
}

/**
 * Read an .xlsx file. Returns { sheets: [{ name, rows }] } where rows is a
 * sparse 2-D array (rows[r][c]) of string | number | boolean | ISO date string.
 * Only sheets whose name passes `filter` are parsed (all by default).
 */
export async function readXlsx(buffer, { filter } = {}) {
  const zip = await unzip(buffer);
  const wbXml = await zip.text("xl/workbook.xml");
  if (!wbXml) throw new Error("This file does not look like an Excel workbook (xl/workbook.xml missing).");
  const date1904 = /date1904\s*=\s*"(1|true)"/i.test(wbXml);
  const relsXml = (await zip.text("xl/_rels/workbook.xml.rels")) || "";
  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]);
    rels[a.Id] = resolveTarget(a.Target);
  }
  const ssXml = (await zip.text("xl/sharedStrings.xml")) || "";
  const shared = [];
  for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) shared.push(m[1] ? textOf(m[1]) : "");

  const stylesXml = (await zip.text("xl/styles.xml")) || "";
  const fmts = {};
  for (const m of stylesXml.matchAll(/<numFmt\b([^>]*)\/?>/g)) { const a = attrs(m[1]); fmts[+a.numFmtId] = a.formatCode; }
  const cellXfs = (/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml) || [])[1] || "";
  const dateStyle = [];
  for (const m of cellXfs.matchAll(/<xf\b([^>]*?)(\/>|>)/g)) {
    const id = +attrs(m[1]).numFmtId || 0;
    dateStyle.push(BUILTIN_DATE.has(id) || isDateFormat(fmts[id]));
  }

  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const a = attrs(m[1]);
    const name = a.name;
    if (filter && !filter(name)) { sheets.push({ name, rows: null }); continue; }
    const rid = a["r:id"] || Object.entries(a).find(([k]) => /:id$/.test(k))?.[1];
    const path = rels[rid];
    const xml = path ? await zip.text(path) : null;
    sheets.push({ name, rows: xml ? parseSheet(xml, shared, dateStyle, date1904) : [] });
  }
  return { sheets };
}

function parseSheet(xml, shared, dateStyle, date1904) {
  const rows = [];
  const data = (/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml) || [])[1] || "";
  let autoRow = 0;
  for (const rm of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const ra = attrs(rm[1]);
    const r = ra.r ? +ra.r - 1 : autoRow;
    autoRow = r + 1;
    if (!rm[2]) continue;
    const row = [];
    let autoCol = 0;
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ca = attrs(cm[1]);
      const c = ca.r ? colIndex(ca.r) : autoCol;
      autoCol = c + 1;
      const inner = cm[2] || "";
      const t = ca.t || "n";
      let v;
      if (t === "inlineStr") v = textOf(inner);
      else {
        const vm = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner);
        if (!vm) continue;
        const raw = vm[1];
        if (t === "s") v = shared[+raw] ?? "";
        else if (t === "str") v = decodeXml(raw);
        else if (t === "b") v = raw === "1";
        else if (t === "e") v = null;
        else if (t === "d") v = raw.slice(0, 16);
        else {
          v = Number(raw);
          if (Number.isNaN(v)) v = decodeXml(raw);
          else if (dateStyle[+ca.s || 0] && v > 0 && v < 2958466) v = serialToIso(v, date1904);
        }
      }
      if (v === null || v === undefined || v === "") continue;
      row[c] = v;
    }
    if (row.length) rows[r] = row;
  }
  return rows;
}

/* ------------------------------------------------------------------ ZIP write */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflateRaw(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch { return null; }
}

export async function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const raw = typeof data === "string" ? te.encode(data) : data;
    const nameBytes = te.encode(name);
    const crc = crc32(raw);
    const deflated = await deflateRaw(raw);
    const useDeflate = deflated && deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const head = new Uint8Array(30 + nameBytes.length);
    const hv = new DataView(head.buffer);
    hv.setUint32(0, 0x04034b50, true);
    hv.setUint16(4, 20, true);
    hv.setUint16(6, 0x0800, true);
    hv.setUint16(8, useDeflate ? 8 : 0, true);
    hv.setUint16(10, 0, true);
    hv.setUint16(12, 0x21, true);
    hv.setUint32(14, crc, true);
    hv.setUint32(18, body.length, true);
    hv.setUint32(22, raw.length, true);
    hv.setUint16(26, nameBytes.length, true);
    head.set(nameBytes, 30);
    chunks.push(head, body);
    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, useDeflate ? 8 : 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    central.push(cen);
    offset += head.length + body.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cenSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/* ------------------------------------------------------------ write workbook */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

// Style ids written into styles.xml below.
export const S = { none: 0, header: 1, date: 2, datetime: 3, pct: 4, title: 5, note: 6, input: 7, bold: 8 };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy hh:mm"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>
<fonts count="5"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF0B2545"/><name val="Calibri"/></font><font><i/><sz val="9"/><color rgb="FF5A6472"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF13315C"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2B3"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD5DAE1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(ref, cell) {
  if (cell === null || cell === undefined || cell === "") return "";
  let v = cell, s = 0;
  if (typeof cell === "object" && !(cell instanceof Date)) { v = cell.v; s = cell.s || 0; if (v === null || v === undefined || v === "") return s ? `<c r="${ref}" s="${s}"/>` : ""; }
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s ? ` s="${s}"` : ""}><v>${v}</v></c>`;
  if (typeof v === "boolean") return `<c r="${ref}" t="b"${s ? ` s="${s}"` : ""}><v>${v ? 1 : 0}</v></c>`;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v) && (s === S.date || s === S.datetime || s === 0)) {
    const serial = isoToSerial(v);
    const style = s || (v.length > 10 ? S.datetime : S.date);
    return `<c r="${ref}" s="${style}"><v>${serial}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ""}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml({ rows, widths = [], freeze }) {
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const pane = freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze - 1}" topLeftCell="A${freeze}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
  const body = rows.map((row, r) => {
    if (!row || !row.length) return "";
    const cells = row.map((cell, c) => cellXml(colName(c) + (r + 1), cell)).join("");
    return cells ? `<row r="${r + 1}">${cells}</row>` : "";
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}${cols}<sheetData>${body}</sheetData></worksheet>`;
}

/** sheets: [{ name, rows, widths?, freeze? }] -> Blob */
export async function writeXlsx(sheets) {
  const safe = sheets.map((s) => ({ ...s, name: s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) }));
  const entries = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${safe.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safe.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safe.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${safe.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: STYLES },
    ...safe.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return zip(entries);
}

/* ---------------------------------------------------------------------- CSV */

export function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== "")).map((r) => r.map((c) => c.trim()));
}
