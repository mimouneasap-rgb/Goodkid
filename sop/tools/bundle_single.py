#!/usr/bin/env python3
"""Pack the SOP Library app into one self-contained HTML file.

The CSS and the ES modules are inlined, so the file can be opened or hosted
anywhere that takes a single page. No SOP data is included: the page starts
with the demo library and the viewer imports sop-library.json as usual.

  python3 sop/tools/bundle_single.py -o sop-library-app.html
  python3 sop/tools/bundle_single.py --embed -o page.html   # claude.ai page body

--embed writes the page body without <!doctype>/<html>/<head>/<body> (the host
adds its own) and switches the app to its embedded mode: no printing, no
service worker, and file saves go through the host's download prompt.
"""
import argparse
import re
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
MODULES = [("model", "js/model.js"), ("store", "js/store.js"), ("demo", "js/demo-data.js")]
IMPORT_RE = re.compile(r'^import\s+(.+?)\s+from\s+"\./([\w-]+)\.js";\s*$', re.M | re.S)
EXPORT_RE = re.compile(r"^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+(\w+)", re.M)


def module_var(path):
    return "__" + {"model": "model", "store": "store", "demo-data": "demo"}[path]


def wrap_module(name, code):
    names = EXPORT_RE.findall(code)
    code = re.sub(r"^export\s+", "", code, flags=re.M)
    return f"const __{name} = (() => {{\n{code}\nreturn {{ {', '.join(names)} }};\n}})();\n"


def unwrap_imports(code):
    """Turn main.js's imports into reads from the wrapped modules."""
    lines = []

    def repl(m):
        what, src = m.group(1).strip(), module_var(m.group(2))
        star = re.match(r"\*\s+as\s+(\w+)$", what)
        lines.append(f"const {star.group(1)} = {src};" if star else f"const {what} = {src};")
        return ""

    code = IMPORT_RE.sub(repl, code)
    return "\n".join(lines) + "\n" + code


def build(embed):
    html = (APP / "index.html").read_text(encoding="utf-8")
    css = (APP / "css/sop.css").read_text(encoding="utf-8")
    js = "".join(wrap_module(n, (APP / p).read_text(encoding="utf-8")) for n, p in MODULES)
    js += unwrap_imports((APP / "js/main.js").read_text(encoding="utf-8"))
    flag = "globalThis.SOP_EMBED = true;\n" if embed else ""
    script = f"<script>\n\"use strict\";\n{flag}(() => {{\n{js}\n}})();\n</script>"

    title = re.search(r"<title>.*?</title>", html, re.S).group(0)
    fonts = re.search(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]+>', html).group(0)
    body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    body = re.sub(r'\s*<script type="module" src="js/main\.js"></script>', "", body)
    style = f"<style>\n{css}\n</style>"
    if embed:
        return f"{title}\n{fonts}\n{style}\n{body.strip()}\n{script}\n"
    head = re.search(r"<head>(.*)</head>", html, re.S).group(1)
    head = re.sub(r'\s*<link rel="(?:manifest|icon|apple-touch-icon|stylesheet)" href="(?!https://fonts)[^"]*"[^>]*>', "", head)
    return f"<!doctype html>\n<html lang=\"en\">\n<head>{head.rstrip()}\n{style}\n</head>\n<body>{body}\n{script}\n</body>\n</html>\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-o", "--output", default="sop-library-app.html")
    ap.add_argument("--embed", action="store_true", help="page body for a claude.ai page")
    args = ap.parse_args()
    out = build(args.embed)
    Path(args.output).write_text(out, encoding="utf-8")
    print(f"{len(out) // 1024} KB -> {args.output}")


if __name__ == "__main__":
    main()
