"""把名录（Excel / TSV）转成本方案用的 glossary.json 与 glossary.csv。

用法:
    python build_glossary.py 名录.xlsx
    python build_glossary.py glossary.tsv

输出（与脚本同目录）:
    glossary.json  {"brown shrike": "红尾伯劳", ...}
    glossary.csv   english,chinese
"""
import csv, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))


def from_xlsx(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = []
    # 优先「懂鸟」表（目/科/中文名/英文名/学名）
    if "懂鸟" in wb.sheetnames:
        for r in wb["懂鸟"].iter_rows(min_row=2, values_only=True):
            if len(r) >= 4 and r[3] and r[2]:
                rows.append((str(r[3]), str(r[2])))
    # 合并名录补充
    if "合并名录" in wb.sheetnames:
        for r in wb["合并名录"].iter_rows(min_row=2, values_only=True):
            if len(r) >= 3 and r[1] and (r[2] or r[3] or r[4]):
                rows.append((str(r[1]), str(r[2] or r[3] or r[4])))
    return rows


def from_tsv(path):
    rows = []
    for i, line in enumerate(open(path, encoding="utf-8").read().splitlines()):
        if i == 0 and "english" in line.lower():
            continue
        p = line.split("\t")
        if len(p) >= 2 and p[0].strip() and p[1].strip():
            rows.append((p[0].strip(), p[1].strip().lstrip("*")))
    return rows


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else ""
    if not src or not os.path.exists(src):
        print("用法: python build_glossary.py <名录.xlsx|glossary.tsv>")
        return
    rows = from_xlsx(src) if src.lower().endswith((".xlsx", ".xlsm")) else from_tsv(src)
    gloss = {}
    for en, zh in rows:
        k = en.strip().lower()
        zh = zh.strip().lstrip("*")
        if len(k) >= 2 and zh and (k not in gloss or len(zh) < len(gloss[k])):
            gloss[k] = zh

    with open(os.path.join(HERE, "glossary.json"), "w", encoding="utf-8") as f:
        json.dump(gloss, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(HERE, "glossary.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["english", "chinese"])
        for k in sorted(gloss):
            w.writerow([k, gloss[k]])
    print("entries", len(gloss))


if __name__ == "__main__":
    main()
