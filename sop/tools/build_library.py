#!/usr/bin/env python3
"""Build an SOP library file (sop-library.json) for the SOP Library app.

Reads a folder of SOP files (.docx, .pdf, .txt) and extracts, for each SOP:
code, version, department, language, dates, purpose/scope, responsibilities,
glossary, procedure outline, related documents, the forms / templates /
annexes / logbooks it defines (with their fields when the SOP is a .docx),
revision history and searchable text.

The output stays on your machine. Load it in the app with "Import library".

Usage:
    python3 build_library.py INPUT_DIR -o sop-library.json
        [--manifest files.json]   # optional Drive listing: [{id,title,...}]
        [--overrides DIR]         # optional <name>.json files merged on top
        [--source-name "SOP's 1"] [--source-url URL]

Files may be named after the SOP ("SOPQA0118F-Onc-02 Gestion des Logbook.docx")
or after a Drive file id when a manifest maps ids to titles. Scanned PDFs have
no text layer; describe them with an override file to include their content.
Only the Python standard library is needed (pdftotext is used for PDFs if present).
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

DEPARTMENTS = {
    "QA": "Quality Assurance", "QC": "Quality Control", "VL": "Validation",
    "GS": "General System", "HSE": "Health, Safety & Environment", "PR": "Production",
    "WH": "Warehouse", "EN": "Engineering", "CM": "Compliance", "RD": "Research & Development",
    "IT": "Information Technology", "LO": "Logistics", "PL": "Planning", "SC": "Supply Chain",
    "RA": "Regulatory Affairs", "TO": "Technical Operations",
}

# Section headings (accents removed, lower case) -> section key.
HEADINGS = {
    "intro": ["introduction", "background"],
    "purpose": ["purpose", "objective", "objectif", "objet", "but", "aim", "objectifs"],
    "scope": ["scope", "domaine d'application", "domaine d application", "mise en application",
              "champ d'application", "application"],
    "hse": ["health and safety", "health safety and environment", "health, safety and environment",
            "health, safety & environment", "health safety & environment", "health safety environment",
            "sante et securite", "sante, securite et environnement", "sante securite et environnement",
            "sante, securite et environnements", "sante et surete", "santes et securite", "hse",
            "health, safety and environnement", "safety"],
    "resp": ["responsibilities", "responsibility", "responsabilites", "responsabilite"],
    "tools": ["related tools and instruments", "outils et instruments associes", "outils et instruments relatifs",
              "outils et instrument associes", "tools and instruments", "outils et instruments associe",
              "related tools", "outils et instruments"],
    "materials": ["related materials", "materiel associe", "materiels associe", "materiels associes",
                  "matieres associees", "matieres utilisees", "materiaux relatifs", "matiere associer",
                  "related material", "materiel associes", "matiere associee", "matieres associes"],
    "glossary": ["glossary", "glossaire", "definitions", "abbreviations", "definitions and abbreviations"],
    "related": ["related documents", "associated documents", "documents associes", "documents associer",
                "documents relatifs", "reference documents", "documents associe", "document associes"],
    "procedure": ["procedure", "procedures", "numbering system procedural flow", "procedure detaillee"],
    "distribution": ["distribution list", "liste de distribution", "distribution"],
    "training": ["training", "formation", "training and frequency", "formation et frequence"],
    "references": ["references", "reference"],
    "history": ["sop history", "historique de pos", "historique pos", "historique sop", "historique des sop",
                "revision history", "document history", "historique", "historique de la pos",
                "historique de sop", "sop history:"],
}
HEADING_LOOKUP = {v: k for k, vals in HEADINGS.items() for v in vals}

SOP_RE = re.compile(r"\bSOP\s?([A-Z]{2,3})\s?(\d{3,4})\s?([EF])?(?:\s?/\s?(Onc|ONC|One))?", re.I)
ATT_RE = re.compile(
    r"(?<![A-Z0-9])([A-Z]{2,3})\s?(\d{4})\s?([EF])?\s?(?:/\s?(?:Onc|ONC|One)\s?)?/\s?"
    r"(FE|FF|TE|TF|AE|AF|LB|F|T|A)\s?(\d{1,2})(?:\s?[/-]\s?(\d{1,2}))?(?![0-9])")
DATE_RE = re.compile(r"\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b")
FILE_RE = re.compile(
    r"^SOP\s?(?P<dept>[A-Z]{2,3})(?P<num>\d{4})(?P<lang>[EF])?"
    r"(?:[-_ .]*(?P<onc>Onc|ONC))?(?:[-_ .]*(?P<ver>\d{1,2})(?!\d))?(?P<rest>.*)$")

ATT_HEADER_LINE_RE = re.compile(
    r"^\s*p?(form|forme|fiche|template|attachment|annex|annexe)\s*\.?\s*(no|n°|nr|number)\.?\b", re.I)
LOGBOOK_RE = re.compile(r"log\s?-?book|logbook|registre|register|\blog\b|journal de bord|usage log", re.I)


def norm(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).strip().lower()


def clean(s):
    s = s.replace(" ", " ").replace("\\", "")
    return re.sub(r"[ \t]+", " ", s).strip()


# ---------------------------------------------------------------- docx

def cell_paragraphs(tc):
    out = []
    for p in tc.iter(W + "p"):
        t = "".join((n.text or "") if n.tag == W + "t" else ("\t" if n.tag == W + "tab" else "")
                    for n in p.iter() if n.tag in (W + "t", W + "tab"))
        t = clean(t)
        if t:
            out.append(t)
    return out


def docx_blocks(path):
    """Top-level paragraphs and tables in document order.
    Paragraph: ("p", text). Table: ("t", rows) where each cell is a list of paragraph strings."""
    z = zipfile.ZipFile(path)
    root = ET.fromstring(z.read("word/document.xml"))
    body = root.find(W + "body")
    blocks = []

    def walk(el):
        for child in el:
            if child.tag == W + "p":
                t = clean("".join((n.text or "") if n.tag == W + "t" else " "
                                  for n in child.iter() if n.tag in (W + "t", W + "tab")))
                if t:
                    blocks.append(("p", t))
            elif child.tag == W + "tbl":
                rows = []
                for tr in child.findall(W + "tr"):
                    rows.append([cell_paragraphs(tc) for tc in tr.findall(W + "tc")])
                blocks.append(("t", rows))
            elif child.tag in (W + "sdt", W + "sdtContent", W + "customXml"):
                walk(child)
    walk(body)
    return blocks


def blocks_to_lines(blocks):
    lines = []
    for kind, val in blocks:
        if kind == "p":
            lines.append(val)
            continue
        rows = val
        first = [" ".join(c) for c in rows[0]] if rows else []
        bilingual = len(first) >= 2 and norm(first[0]) == "english" and norm(first[1]).startswith("fran")
        if bilingual:
            for r in rows[1:]:
                if r:
                    lines.extend(r[0])
            continue
        for r in rows:
            cells = [" ".join(c) for c in r]
            cells = [c for c in cells if c]
            if not cells:
                continue
            # a single-cell row holding several paragraphs reads better as lines
            if len(cells) == 1 and len(r) and sum(len(c) for c in r) > 1:
                lines.extend(p for c in r for p in c)
            else:
                lines.append(" | ".join(cells))
    return lines


# ---------------------------------------------------------------- pdf

def pdf_text(path):
    try:
        out = subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True,
                             timeout=180).stdout
    except (OSError, subprocess.TimeoutExpired):
        return ""
    lines = []
    for ln in out.splitlines():
        ln = clean(re.sub(r"\s{3,}", " | ", ln.strip()))
        if not ln or re.match(r"^QMex \| Document Management", ln) or ln in ("Effective", "Effectiv e"):
            continue
        lines.append(ln)
    return "\n".join(lines)


# ---------------------------------------------------------------- parsing helpers

def heading_key(line):
    s = re.sub(r"^\s*\d+(?:\.\d+)*\\?\.?\s*", "", line)
    s = s.split("|")[0]
    s = s.strip().rstrip(":").strip()
    if not s or len(s) > 60 or len(s.split()) > 7:
        return None
    n = norm(s).rstrip(":").strip()
    n = re.sub(r"^\d+\.?\s*", "", n)
    return HEADING_LOOKUP.get(n)


def split_sections(lines):
    sections, order = {}, []
    current = "_front"
    sections[current] = []
    seen = set()
    for ln in lines:
        if ATT_HEADER_LINE_RE.match(ln):
            current = "_attachments"
            sections.setdefault(current, [])
        key = heading_key(ln)
        # Inside attachment pages only the revision history heading starts a section
        # (some SOPs print their history after the attachments).
        if current == "_attachments" and not (key == "history" and key not in seen):
            key = None
        if key:
            if key in seen:
                current = "_dup"          # second language copy of a section
                sections.setdefault(current, [])
                continue
            seen.add(key)
            current = key
            order.append(key)
            sections[current] = []
            continue
        sections.setdefault(current, []).append(ln)
    return sections, order


def to_date(s):
    m = DATE_RE.search(s or "")
    if not m:
        return None
    d, mo, y = (int(x) for x in m.groups())
    if y < 100:
        y += 2000
    try:
        return dt.date(y, mo, d).isoformat()
    except ValueError:
        return None


def att_parts(m):
    base = f"{m.group(1).upper()}{m.group(2)}{(m.group(3) or '').upper()}"
    kind = m.group(4).upper()
    num = int(m.group(5))
    ver = m.group(6)
    return base, kind, num, (f"{int(ver):02d}" if ver else None)


def good_title(t):
    t = (t or "").strip(" .:;|\"\u201c\u201d")
    if not (4 <= len(t) <= 120) or ATT_RE.search(t) or SOP_RE.search(t):
        return False
    if not (t[0].isupper() or t[0].isdigit() or t[0] in "«\"\u201c"):
        return False
    return not re.match(r"^(and|or|et|ou|to|the|as|of|de|du|des|for|in)\b", t, re.I)


def tidy_title(t):
    t = re.sub(r"\s+", " ", t or "").strip(" .:;|,-")
    return t.strip("\"\u201c\u201d«» ")


def att_type(kind, title):
    if LOGBOOK_RE.search(title or ""):
        return "logbook"
    return {"F": "form", "T": "template", "A": "annex", "L": "logbook"}.get(kind[0], "form")


def att_code(base, kind, num, ver, onc):
    code = f"{base}{'/Onc' if onc else ''}/{kind}{num:02d}"
    return code + (f"/{ver}" if ver else "")


def strip_code_prefix(text, m):
    rest = text[m.end():]
    rest = re.sub(r"^[\s:|\-–)]+", "", rest)
    return clean(rest.split("|")[0] if "|" in rest[:3] else rest.replace(" | ", " ").strip())


def parse_related(lines):
    """Lines of the Related Documents section -> [{code, title}]."""
    out, pending = [], None
    for ln in lines:
        if re.match(r"^(document\s*(no|n°|number)|titre|document title)", norm(ln)):
            continue
        parts = [p.strip() for p in ln.split("|")]
        m_sop = SOP_RE.match(parts[0]) if parts else None
        m_att = ATT_RE.match(parts[0]) if parts else None
        m_other = re.match(r"^([A-Z]{2,4}\d{3,4}[EF]?(?:/Onc)?(?:/[A-Z]\d{2})?)\b", parts[0]) if parts else None
        m = m_att or m_sop or m_other
        if m:
            code = clean(parts[0][:m.end()])
            title = " ".join(p for p in parts[1:] if p) or clean(parts[0][m.end():].lstrip(":- "))
            pending = {"code": code, "title": title}
            out.append(pending)
            if title:
                pending = None
            continue
        if pending is not None and ln and not heading_key(ln):
            pending["title"] = clean(ln.replace("|", " "))
            pending = None
    for r in out:
        r["title"] = re.sub(r"\s+", " ", r["title"]).strip(" .|")
    return [r for r in out if len(r["code"]) >= 5]


def parse_glossary(lines):
    out = []
    for ln in lines:
        m = re.match(r"^([^:]{1,60}?)\s*:\s*(.+)$", ln.replace(" | ", " "))
        if m and len(m.group(2)) > 1:
            out.append({"term": m.group(1).strip(), "def": m.group(2).strip()})
    return out[:80]


HISTORY_HEADER_RE = re.compile(r"^(ver\.?|no\.?|ver\.? no\.?|version|effective date|date effective|date d'effet|"
                               r"revision summary|resume de (la )?revision|resume des revisions|date de revision|"
                               r"date|historique.*|sop history.*)$")


def parse_history_lines(lines):
    """History tables flattened to one value per line (nested tables)."""
    rows = []
    for ln in lines:
        n = norm(ln)
        if HISTORY_HEADER_RE.match(n):
            continue
        m = re.match(r"^0?(\d{1,2})\.?$", ln.strip())
        if m:
            rows.append({"ver": f"{int(m.group(1)):02d}", "date": None, "summary": ""})
            continue
        if not rows:
            continue
        if rows[-1]["date"] is None and not rows[-1]["summary"] and to_date(ln) and len(ln) <= 22:
            rows[-1]["date"] = to_date(ln)
            continue
        rows[-1]["summary"] = (rows[-1]["summary"] + " " + clean(ln)).strip()[:600]
    return rows


def parse_history(lines):
    if lines and sum(1 for ln in lines if "|" in ln) < 2:
        return parse_history_lines(lines)
    rows = []
    for ln in lines:
        if "|" not in ln:
            if rows and not re.match(r"^\d{1,2}\b", ln):
                rows[-1]["summary"] = (rows[-1]["summary"] + " " + ln).strip()[:600]
            continue
        parts = [p.strip() for p in ln.split("|")]
        if re.match(r"^(ver|version)", norm(parts[0])):
            continue
        m = re.match(r"^0?(\d{1,2})\.?$", parts[0])
        if not m:
            if rows:
                rows[-1]["summary"] = (rows[-1]["summary"] + " " + " ".join(parts)).strip()
            continue
        ver = f"{int(m.group(1)):02d}"
        date, summary = None, []
        for p in parts[1:]:
            if not date and to_date(p) and len(p) <= 22:
                date = to_date(p)
            elif p:
                summary.append(p)
        rows.append({"ver": ver, "date": date, "summary": clean(" ".join(summary))[:600]})
    return rows


def outline_from(lines):
    out = []
    for ln in lines:
        s = ln.split("|")[0].strip()
        if 3 <= len(s) <= 90 and not s.endswith(".") and not ATT_RE.search(s) \
                and (s.endswith(":") or (s[:1].isupper() and len(s.split()) <= 9)) \
                and not re.match(r"^(etape|step|note|eg|e\.g|for example|example|exemple|where|ou\b|ex\b)", norm(s)) \
                and not re.search(r"\S\s?:\s?\S", s):
            s = s.rstrip(":").strip()
            if s not in out and not re.match(r"^\d", s):
                out.append(s)
        if len(out) >= 24:
            break
    return out


def list_items(lines, limit=20):
    items = []
    for ln in lines:
        s = clean(ln.replace("|", " "))
        if s and s not in items:
            items.append(s)
    return items[:limit]


# ---------------------------------------------------------------- attachments in docx

NOISE_FIELD_RE = re.compile(
    r"((not\s)?comply|(non[- ]?)?conform[e]?|c|nc|yes|no|oui|non|pass|fail|n/?a|ok|x|\s|/)+")
HEADER_CELL_RE = re.compile(r"^(form|forme|fiche|template|templte|attachment|annex|annexe|formulaire|modele|"
                            r"pattachment|logbook|log book)\s*\.?\s*(no|n°|nr|number)?", re.I)


def docx_attachments(blocks):
    """Find attachment blocks (header table with a code) and the fields of the tables after them."""
    found, current = [], None
    for kind, val in blocks:
        if kind == "t":
            flat = [" ".join(c) for r in val for c in r]
            joined = " | ".join(flat)
            m = ATT_RE.search(joined)
            is_header = bool(m) and len(val) <= 3 and any(HEADER_CELL_RE.match(x.strip()) for x in flat if x)
            if is_header:
                base, k, num, ver = att_parts(m)
                title = ""
                for x in flat:
                    if x and not HEADER_CELL_RE.match(x.strip()) and not ATT_RE.search(x):
                        title = clean(x)
                        break
                current = {"base": base, "kind": k, "num": num, "ver": ver,
                           "onc": "/Onc" in joined or "/ONC" in joined, "title": title, "fields": []}
                found.append(current)
                continue
            if current is not None:
                current["fields"].extend(table_fields(val))
        elif kind == "p" and current is not None:
            pass
    for a in found:
        seen, fields = set(), []
        for f in a["fields"]:
            f = re.split(r"[…]{2,}|\.{4,}|_{3,}", f)[0].strip(" :;|\uf063☐□")
            k = norm(f)
            if NOISE_FIELD_RE.fullmatch(k):
                continue
            if k in seen or not k or len(f) > 80 or re.fullmatch(r"[\d\s.,:/()%-]+", f) \
                    or re.fullmatch(r"(yes|no|na|n/a|oui|non|conforme|non[- ]conforme|☐|□|x)", k):
                continue
            seen.add(k)
            fields.append(f)
        a["fields"] = fields[:32]
    return found


def table_fields(rows):
    fields = []
    texts = [[clean(" ".join(c)) for c in r] for r in rows]
    if not texts:
        return fields
    first = [t for t in texts[0] if t]
    distinct = list(dict.fromkeys(first))
    data_rows = [r for r in texts[1:] if any(r)]
    empty_body = sum(1 for r in texts[1:] if not any(r)) >= max(1, len(texts) // 3)
    if len(distinct) >= 3 and (empty_body or len(texts) <= 3 or len(data_rows) <= 2):
        fields.extend(distinct)
        if len(texts) > 1:
            second = [t for t in texts[1] if t and t not in distinct]
            if len(second) >= 2 and all(len(t) < 40 for t in second):
                fields.extend(second)
        return fields
    for r in texts:
        cells = [t for t in r if t]
        if not cells:
            continue
        label = cells[0]
        if len(cells) <= 2 or all(len(c) < 25 for c in cells[1:]):
            fields.append(label)
    return fields


# ---------------------------------------------------------------- one document

def parse_filename(name):
    stem = os.path.splitext(name)[0]
    stem = stem.replace("’", "'")
    m = FILE_RE.match(stem)
    if not m:
        return {}
    rest = m.group("rest") or ""
    ver = m.group("ver")
    if not ver:
        mv = re.match(r"^[-_ .]*(\d{1,2})(?!\d)", rest)
        if mv:
            ver, rest = mv.group(1), rest[mv.end():]
    title = re.sub(r"\(\d\)$", "", rest).strip(" -_.")
    title = re.sub(r"\s*\(\d+\)\s*$", "", title)
    title = re.sub(r"\s+(updated|copie|- copie)$", "", title, flags=re.I).strip(" -_.")
    return {
        "dept": m.group("dept"), "num": m.group("num"), "lang": m.group("lang"),
        "site": "Onc" if m.group("onc") or re.search(r"/onc|-onc", stem, re.I) else "General",
        "version": f"{int(ver):02d}" if ver else None, "title": title,
    }


def detect_lang(text):
    t = " " + norm(text[:20000]) + " "
    fr = sum(t.count(w) for w in (" le ", " la ", " les ", " des ", " du ", " et ", " procedure ", " cette "))
    en = sum(t.count(w) for w in (" the ", " and ", " of ", " to ", " this ", " should ", " is "))
    return "F" if fr > en * 1.2 else "E"


def qmex_header(text):
    meta = {}
    m = re.search(r"Document Nr[\s|]+(SOP[A-Z]{2,3}\d{4}[EF]?)\s*\|?\s*Rev\.?:?\s*(\d+)", text)
    if m:
        meta["version"] = f"{int(m.group(2)):02d}"
    m = re.search(r"Document Name[\s|]+(.+)", text)
    if m:
        t = clean(m.group(1).split("|")[0])
        if t and not t.lower().startswith("other"):
            meta["title"] = t
    m = re.search(r"Effective Date[\s|]+(\d{1,2}/\d{1,2}/\d{4})", text)
    if m:
        meta["effectiveDate"] = to_date(m.group(1))
    m = re.search(r"Validity Date[\s|]+(\d{1,2}/\d{1,2}/\d{4})", text)
    if m:
        meta["reviewDate"] = to_date(m.group(1))
    return meta


def build_sop(path, display_name, drive_id=None, extra=None):
    ext = os.path.splitext(path)[1].lower() if path else ""
    info = parse_filename(display_name)
    blocks, lines, extraction = [], [], "metadata"
    if path and ext == ".docx":
        try:
            blocks = docx_blocks(path)
            lines = blocks_to_lines(blocks)
            extraction = "docx"
        except (zipfile.BadZipFile, KeyError, ET.ParseError):
            pass
    elif path and ext == ".pdf":
        txt = pdf_text(path)
        if len(txt) > 500:
            lines, extraction = txt.splitlines(), "pdf"
    elif path and ext == ".txt":
        lines, extraction = open(path, encoding="utf-8", errors="replace").read().splitlines(), "text"

    text = "\n".join(lines)
    sections, order = split_sections(lines)
    sop = {
        "id": drive_id or os.path.splitext(display_name)[0],
        "file": display_name,
        "fileType": (os.path.splitext(display_name)[1] or ext).lstrip(".").lower(),
        "driveUrl": f"https://drive.google.com/file/d/{drive_id}/view" if drive_id else None,
        "dept": info.get("dept"), "num": info.get("num"),
        "lang": info.get("lang"), "site": info.get("site", "General"),
        "version": info.get("version"), "title": info.get("title") or "",
        "effectiveDate": None, "reviewDate": None, "issueDate": None,
        "extraction": extraction,
    }
    if extraction == "pdf":
        q = qmex_header(text)
        for k, v in q.items():
            if v and (k != "title" or not sop["title"]):
                sop[k] = v if k != "version" or not sop["version"] else sop["version"]

    sop["intro"] = " ".join(sections.get("intro", []))[:1200]
    sop["purpose"] = " ".join(sections.get("purpose", []))[:1200]
    sop["scope"] = " ".join(sections.get("scope", []))[:1200]
    sop["hse"] = " ".join(sections.get("hse", []))[:800]
    sop["responsibilities"] = list_items(sections.get("resp", []), 14)
    sop["tools"] = list_items(sections.get("tools", []), 12)
    sop["materials"] = list_items(sections.get("materials", []), 16)
    sop["glossary"] = parse_glossary(sections.get("glossary", []))
    sop["related"] = parse_related(sections.get("related", []))
    sop["outline"] = outline_from(sections.get("procedure", []))
    sop["distribution"] = list_items(sections.get("distribution", []), 16)
    sop["training"] = " ".join(sections.get("training", []))[:400]
    sop["references"] = list_items(sections.get("references", []), 12)
    sop["history"] = parse_history(sections.get("history", []))

    # Attachments: defined in the document (docx tables) + mentioned anywhere.
    # Key on department + number (the E/F letter and the E in "FE" vary between mentions).
    def key_of(base, kind, num):
        return (base.rstrip("EF") if len(base) > 6 else base, kind[0], num)

    atts, titles = {}, {}
    for r in sop["related"]:
        m = ATT_RE.match(r["code"])
        if m and good_title(r["title"]):
            titles[key_of(*att_parts(m)[:3])] = r["title"]

    def upsert(base, kind, num, ver, onc, title, fields, defined):
        key = key_of(base, kind, num)
        a = atts.get(key)
        if a is None:
            atts[key] = a = {"base": base, "kind": kind, "num": num, "ver": ver, "onc": onc,
                             "title": "", "fields": [], "defined": False}
        if len(base) > len(a["base"]):
            a["base"] = base
        if len(kind) > len(a["kind"]):
            a["kind"] = kind
        if ver and (not a["ver"] or int(ver) > int(a["ver"])):
            a["ver"] = ver
        a["onc"] = a["onc"] or onc
        if title and (not a["title"] or defined and not a["defined"]):
            a["title"] = title
        if fields and len(fields) > len(a["fields"]):
            a["fields"] = fields
        a["defined"] = a["defined"] or defined

    if blocks:
        for a in docx_attachments(blocks):
            t = a["title"] if good_title(a["title"]) else ""
            upsert(a["base"], a["kind"], a["num"], a["ver"], a["onc"], t, a["fields"], True)
    for m in ATT_RE.finditer(text):
        base, kind, num, ver = att_parts(m)
        onc = bool(re.search(r"/\s?(onc|one)", m.group(0), re.I))
        after = text[m.end():m.end() + 160].split("\n")[0]
        guess = clean(re.sub(r"^[\s:|\-\u2013)\"\u201c]+", "", after).split("|")[0])
        guess = re.split(r"\s(?:as per|according to|selon|should|must|which|where)\b|[.;(]", guess)[0].strip()
        upsert(base, kind, num, ver, onc, guess if good_title(guess) else "", [], False)
    for key, t in titles.items():
        if key in atts and (not atts[key]["title"] or not atts[key]["defined"]):
            atts[key]["title"] = t

    own_base = f"{sop['dept']}{sop['num']}" if sop["dept"] else None
    sop["attachments"] = []
    for key, a in sorted(atts.items(), key=lambda kv: kv[0]):
        own = bool(own_base) and key[0] == own_base
        title = tidy_title(a["title"])
        sop["attachments"].append({
            "code": att_code(a["base"], a["kind"], a["num"], a["ver"], a["onc"] or (sop["site"] == "Onc" and own)),
            "base": a["base"], "kind": a["kind"], "num": a["num"], "version": a["ver"],
            "title": title, "type": att_type(a["kind"], title), "fields": a["fields"],
            "own": own, "defined": a["defined"],
        })

    refs = []
    for m in SOP_RE.finditer(text):
        code = f"SOP{m.group(1).upper()}{m.group(2).zfill(4)}"
        if code != f"SOP{sop['dept']}{sop['num']}" and code not in refs:
            refs.append(code)
    sop["sopRefs"] = refs

    apply_history(sop)
    if not sop["lang"] and text:
        sop["lang"] = detect_lang(text)
    sop["text"] = re.sub(r"[ \t]+", " ", text)[:45000]

    if extra:
        merge_override(sop, extra)
    return sop


# PDF page footers and the scattered letters of an "Effective" watermark.
HISTORY_JUNK_RES = (re.compile(r"\s+Page \d+ (?:of|sur|/) ?\d+.*$", re.I), re.compile(r"(?:\s+\S{1,2},?){3,}\s*$"))


def apply_history(sop):
    hist = sop["history"]
    if not hist:
        return
    # Versions only go up; a restart means the rows below belong to another table.
    for i in range(1, len(hist)):
        if int(hist[i]["ver"]) <= int(hist[i - 1]["ver"]):
            del hist[i:]
            break
    for h in hist:
        for junk in HISTORY_JUNK_RES:
            h["summary"] = junk.sub("", h["summary"] or "").strip()
    file_ver = int(sop["version"]) if (sop["version"] or "").isdigit() else None
    top = max(int(h["ver"]) for h in hist)
    # A table numbered far past the file version with no dates is not a history table.
    if file_ver and top > file_ver + 2 and not any(h["date"] for h in hist):
        sop["history"] = []
        return
    last = hist[-1]
    sop["version"] = sop["version"] or last["ver"]
    dated = [h for h in hist if h["date"]]
    if dated:
        sop["lastEffectiveDate"] = dated[-1]["date"]
        if dated[-1]["ver"] == last["ver"]:
            sop["effectiveDate"] = sop["effectiveDate"] or dated[-1]["date"]
    # Only a version newer than this file is a pending revision. The current version's
    # row is often left undated because the effective date is set in the eDMS.
    if file_ver and int(last["ver"]) > file_ver:
        sop["pendingRevision"] = last["ver"]


PURPOSE_LEAD_RE = re.compile(
    r"^(the\s+(purpose|aim|objective)\s+of\s+this\s+(\(?sop\)?|procedure|standard operating procedure)"
    r"\s*(\(sop\))?\s+(is\s+)?to\s+|le\s+but\s+de\s+cette\s+(procedure|pos|sop)\s*(\(sop\))?\s+est\s+de\s+|"
    r"cette\s+procedure\s+a\s+pour\s+(objectif|but|objet)\s+de\s+|this\s+procedure\s+aims\s+to\s+)", re.I)


def title_from_purpose(purpose):
    p = purpose.strip()
    m = PURPOSE_LEAD_RE.match(norm(p))
    if not m:
        return ""
    rest = p[m.end():] if len(norm(p[:m.end()])) == m.end() else p[len(m.group(0)):]
    rest = re.sub(r"^(describe|outline|define|lay down|provide|give|décrire|decrire|définir|definir|dicter)\s+"
                  r"(the\s+|les\s+|la\s+|le\s+|l'|des\s+|comment\s+)?", "", rest.strip(), flags=re.I)
    rest = re.split(r"[.;]| au niveau| utilisés? dans| (?:at|in|à) (?:[A-Z][\w-]+ ){1,2}(?:Pharma\w*|Company|Site|Plant|Laborator\w+|Group)\b", rest)[0].strip()
    if len(rest) > 90:
        rest = rest[:90].rsplit(" ", 1)[0] + "…"
    return rest[:1].upper() + rest[1:] if rest else ""


def merge_override(sop, o):
    simple = ("title", "version", "effectiveDate", "reviewDate", "issueDate", "purpose", "scope",
              "intro", "hse", "training", "preparedBy", "approvedBy", "code")
    for k in simple:
        if o.get(k):
            v = o[k]
            if k.endswith("Date"):
                v = to_date(v) or v
            if k == "code":
                m = re.match(r"SOP([A-Z]{2,3})(\d{4})([EF])?", v)
                if m:
                    sop["dept"], sop["num"] = m.group(1), m.group(2)
                    sop["lang"] = sop["lang"] or m.group(3)
                continue
            sop[k] = v
    for k in ("tools", "materials", "outline", "responsibilities", "distribution", "references"):
        if o.get(k):
            sop[k] = o[k]
    if o.get("related"):
        have = {r["code"] for r in sop["related"]}
        sop["related"] += [{"code": c, "title": t} for c, t in o["related"] if c not in have]
        for c, _ in o["related"]:
            m = SOP_RE.match(c)
            if m:
                code = f"SOP{m.group(1).upper()}{m.group(2).zfill(4)}"
                if code not in sop["sopRefs"] and code != f"SOP{sop['dept']}{sop['num']}":
                    sop["sopRefs"].append(code)
    if o.get("history"):
        sop["history"] = [{"ver": v, "date": to_date(d), "summary": s} for v, d, s in o["history"]]
        sop.pop("pendingRevision", None)
        apply_history(sop)
    for code, title, fields in o.get("attachments", []):
        m = ATT_RE.match(code)
        if not m:
            continue
        base, kind, num, ver = att_parts(m)
        own = base.startswith(f"{sop['dept']}{sop['num']}")
        entry = next((a for a in sop["attachments"] if a["base"] == base and a["kind"] == kind and a["num"] == num), None)
        if entry is None:
            entry = {"base": base, "kind": kind, "num": num, "fields": [], "own": own, "defined": True}
            sop["attachments"].append(entry)
        entry.update({"code": att_code(base, kind, num, ver, "/onc" in code.lower()), "version": ver,
                      "title": title, "type": att_type(kind, title), "own": own, "defined": True})
        if fields:
            entry["fields"] = fields
    if sop["extraction"] in ("metadata", "pdf") and (o.get("purpose") or o.get("attachments")):
        sop["extraction"] = "curated"


# ---------------------------------------------------------------- library

def finalize(sops, known_titles):
    today = dt.date.today()
    fam = {}
    for s in sops:
        s["code"] = f"SOP{s['dept']}{s['num']}{s['lang'] or ''}" if s["dept"] else s["file"]
        s["family"] = f"{s['dept']}{s['num']}" if s["dept"] else s["id"]
        if not s["title"]:
            s["title"] = known_titles.get(s["family"], "") or title_from_purpose(s.get("purpose", ""))
            s["titleDerived"] = True
        if not s["title"]:
            s["title"] = s["code"]
        s["title"] = re.sub(r"\s+", " ", s["title"]).strip()
        if s["effectiveDate"] and not s["reviewDate"]:
            d = dt.date.fromisoformat(s["effectiveDate"])
            try:
                s["reviewDate"] = d.replace(year=d.year + 3).isoformat()
            except ValueError:
                s["reviewDate"] = (d + dt.timedelta(days=365 * 3)).isoformat()
            s["reviewEstimated"] = True
        fam.setdefault((s["family"], s["site"]), []).append(s)
    for (family, site), group in fam.items():
        group.sort(key=lambda s: (int(s["version"] or 0), s["extraction"] != "metadata"), reverse=True)
        top = group[0]
        for s in group:
            if s is top:
                s["status"] = "current"
            elif s["version"] == top["version"]:
                s["status"] = "duplicate"
                s["duplicateOf"] = top["id"]
            else:
                s["status"] = "superseded"
                s["supersededBy"] = top["id"]
    for s in sops:
        r = s.get("reviewDate")
        if r and s["status"] == "current":
            days = (dt.date.fromisoformat(r) - today).days
            s["reviewState"] = "overdue" if days < 0 else ("due" if days <= 90 else "ok")
    return sops


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("-o", "--output", default="sop-library.json")
    ap.add_argument("--manifest")
    ap.add_argument("--overrides")
    ap.add_argument("--source-name", default="SOP library")
    ap.add_argument("--source-url")
    a = ap.parse_args()

    manifest = {}
    if a.manifest:
        for r in json.load(open(a.manifest, encoding="utf-8")):
            manifest[r["id"]] = r
    files = {}
    for name in sorted(os.listdir(a.input)):
        stem, ext = os.path.splitext(name)
        if ext.lower() in (".docx", ".pdf", ".txt"):
            files.setdefault(stem, os.path.join(a.input, name))
    entries = []
    if manifest:
        for fid, r in manifest.items():
            entries.append((files.get(fid), r["title"], fid))
    else:
        for stem, path in files.items():
            entries.append((path, os.path.basename(path), None))

    sops = []
    for path, title, fid in entries:
        extra = None
        if a.overrides:
            for key in (fid, os.path.splitext(title)[0]):
                p = os.path.join(a.overrides, f"{key}.json") if key else None
                if p and os.path.exists(p):
                    extra = json.load(open(p, encoding="utf-8"))
                    break
        try:
            sops.append(build_sop(path, title, fid, extra))
        except Exception as e:  # keep going: one bad file must not stop the library
            print(f"warning: {title}: {e}", file=sys.stderr)

    # Titles of SOPs as cited by other SOPs, used for files whose name has no title.
    known = {}
    for s in sops:
        for r in s["related"]:
            m = SOP_RE.match(r["code"])
            if m and r["title"]:
                known.setdefault(f"{m.group(1).upper()}{m.group(2).zfill(4)}", r["title"])
    finalize(sops, known)
    sops.sort(key=lambda s: (s["dept"] or "ZZ", s["num"] or "", s["site"] != "Onc", -int(s["version"] or 0)))

    lib = {
        "schema": "sop-library/1",
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": {"name": a.source_name, "url": a.source_url},
        "departments": DEPARTMENTS,
        "sops": sops,
    }
    with open(a.output, "w", encoding="utf-8") as fh:
        json.dump(lib, fh, ensure_ascii=False, separators=(",", ":"))
    n_att = sum(len(s["attachments"]) for s in sops)
    print(f"{len(sops)} SOPs, {n_att} attachment links -> {a.output}")


if __name__ == "__main__":
    main()
