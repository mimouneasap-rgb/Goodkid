// Minimal, dependency-free .xlsx reader and writer.
// Reading: unzip with the platform's DecompressionStream and pull cell values out
// of the sheet XML. Dates come back as Excel serial numbers (see
// model.normaliseDateCell). Writing: inline-string worksheets with a bold, frozen,
// filterable header row, zipped with CompressionStream.

// ---------- zip ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

/** Map of path → Uint8Array for the entries whose names pass `want`. */
async function unzip(buffer, want = () => true) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This is not a valid .xlsx file.");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("The .xlsx file is damaged.");
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    const data = bytes.subarray(start, start + size);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, await pipe(data, new DecompressionStream("deflate-raw")));
    else throw new Error(`Unsupported compression in ${name}.`);
  }
  return files;
}

async function zip(entries) {
  const encoder = new TextEncoder();
  const deflate = typeof CompressionStream === "function";
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(text);
    const data = deflate ? await pipe(raw, new CompressionStream("deflate-raw")) : raw;
    const crc = crc32(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, deflate ? 8 : 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, deflate ? 8 : 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, raw.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ---------- XML helpers ----------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescapeXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

function escapeXml(s) {
  // Drop characters XML 1.0 does not allow.
  return String(s).replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unescapeXml(m[1]) : null;
};

/** Text of every <t> run inside a string item, skipping phonetic runs. */
function runText(xml) {
  return unescapeXml(xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")
    .match(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?t\b[^>]*\/>/g)
    ?.map((t) => t.replace(/^<[^>]*>/, "").replace(/<\/[^>]*>$/, "").replace(/^<[^>]*\/>$/, "")).join("") ?? "");
}

function colIndex(ref) {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function colName(i) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// ---------- read ----------

/** Read every worksheet as an array of row arrays (strings, numbers, booleans). */
export async function readXlsx(buffer) {
  const files = await unzip(buffer, (n) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(n));
  const text = (name) => (files.has(name) ? new TextDecoder().decode(files.get(name)) : "");
  const shared = (text("xl/sharedStrings.xml").match(/<(?:\w+:)?si\b[^>]*>[\s\S]*?<\/(?:\w+:)?si>/g) || []).map(runText);
  const rels = new Map((text("xl/_rels/workbook.xml.rels").match(/<Relationship\b[^>]*>/g) || []).map((r) => [attr(r, "Id"), attr(r, "Target")]));
  const sheets = [];
  for (const tag of text("xl/workbook.xml").match(/<(?:\w+:)?sheet\b[^>]*>/g) || []) {
    const name = attr(tag, "name");
    const target = rels.get(attr(tag, "r:id")) || "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const xml = text(path);
    if (!xml) continue;
    const rows = [];
    for (const rowMatch of xml.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
      const r = Number(attr(rowMatch[0].slice(0, rowMatch[0].indexOf(">") + 1), "r")) - 1 || rows.length;
      const row = [];
      let next = 0;
      for (const cell of rowMatch[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const open = `<c${cell[1]}>`;
        const ref = attr(open, "r");
        const idx = ref ? colIndex(ref) : next;
        next = idx + 1;
        const body = cell[2] || "";
        const type = attr(open, "t");
        const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
        let value = "";
        if (type === "s") value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = runText(body);
        else if (type === "str" || type === "e") value = v === undefined ? "" : unescapeXml(v);
        else if (type === "b") value = v === "1";
        else if (v !== undefined) value = Number(v);
        row[idx] = value;
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = "";
      rows[r] = row;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name, rows });
  }
  return sheets;
}

// ---------- write ----------

function filterNames(sheets) {
  const names = sheets.map((s, i) => (s.rows.length
    ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escapeXml(s.name.replace(/'/g, "''"))}'!$A$1:$${colName(Math.max(0, s.columns.length - 1))}$${s.rows.length + 1}</definedName>`
    : "")).join("");
  return names ? `<definedNames>${names}</definedNames>` : "";
}

/**
 * sheets: [{ name, columns: [header…], rows: [[value…]…] }]. Strings are written
 * inline, numbers as numbers; the header row is bold, frozen and filterable.
 */
export async function writeXlsx(sheets) {
  const used = new Set();
  const safe = sheets.map((s, i) => {
    let name = String(s.name || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    while (used.has(name.toLowerCase())) name = `${name.slice(0, 28)} ${i}`;
    used.add(name.toLowerCase());
    return { ...s, name };
  });
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${safe.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safe.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${filterNames(safe)}</workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safe.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${safe.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E2A5E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
  ];
  safe.forEach((s, i) => {
    const width = s.columns.map((h, c) => Math.min(60, Math.max(String(h).length, ...s.rows.slice(0, 300).map((r) => String(r[c] ?? "").length)) + 2));
    const cell = (v, r, c, style = "") => {
      const ref = `${colName(c)}${r}`;
      if (v === null || v === undefined || v === "") return "";
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
      if (typeof v === "boolean") return `<c r="${ref}"${style} t="b"><v>${v ? 1 : 0}</v></c>`;
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`;
    };
    const lastCol = colName(Math.max(0, s.columns.length - 1));
    const body = [`<row r="1">${s.columns.map((h, c) => cell(h, 1, c, ' s="1"')).join("")}</row>`,
      ...s.rows.map((row, r) => `<row r="${r + 2}">${row.map((v, c) => cell(v, r + 2, c)).join("")}</row>`)].join("");
    files.push([`xl/worksheets/sheet${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${width.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>${body}</sheetData>${s.rows.length ? `<autoFilter ref="A1:${lastCol}${s.rows.length + 1}"/>` : ""}</worksheet>`]);
  });
  return zip(files);
}
