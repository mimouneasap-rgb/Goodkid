"""Turn the CLL vs AX workbook into release/data.js so the app opens with it loaded.

    python3 release/extract-data.py path/to/CLL_Recieved_vs_AX.xlsx

data.js is git-ignored: the repository is public and the workbook holds
company batch data. Without data.js the app asks for the workbook instead.
Requires openpyxl (pip install openpyxl).
"""
import datetime, json, os, sys
import openpyxl

def cell(v):
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, str):
        v = v.replace("\xa0", " ").strip()
        return v or None
    return v

def main(src):
    wb = openpyxl.load_workbook(src, data_only=True)
    sheets = {}
    for ws in wb:
        rows = []
        for r in ws.iter_rows(values_only=True):
            r = [cell(c) for c in r]
            while r and r[-1] is None:
                r.pop()
            rows.append(r)
        while rows and not rows[-1]:
            rows.pop()
        sheets[ws.title] = rows
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.js")
    payload = {"name": os.path.basename(src), "sheets": sheets}
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.RELEASE_WORKBOOK = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"Wrote {out}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
