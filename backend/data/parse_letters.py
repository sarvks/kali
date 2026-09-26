import pymupdf, re, glob, json, os

SRC = "/tmp/kali_letters/Kali's Letters to Humanity"

para = []          # list of str (paragraph) or ("MARK", num)
buf = []


def flush():
    if buf:
        joined = " ".join(buf).strip()
        joined = re.sub(r"\s+", " ", joined)
        if joined:
            para.append(joined)
        buf.clear()


for f in sorted(glob.glob(os.path.join(SRC, "*.pdf"))):
    doc = pymupdf.open(f)
    for page in doc:
        d = page.get_text("dict")
        pagelines = []
        for block in d["blocks"]:
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                text = "".join(s["text"] for s in spans).strip()
                if not text:
                    continue
                x1 = max(s["bbox"][2] for s in spans)
                pagelines.append((round(line["bbox"][1], 1), text, x1))
        pagelines.sort(key=lambda t: t[0])
        rights = [x for _, _, x in pagelines]
        maxr = max(rights) if rights else 0
        for _, text, x1 in pagelines:
            if "›" in text:
                flush()
                continue
            if re.match(r"^\d{1,3}$", text):
                continue
            if re.search(r"\d+\.\s*MT-KALI", text):
                continue
            if text.strip().lower() in ("table of contents",):
                continue
            m = re.match(r"^MT-KALI-(\d{4})$", text)
            if m:
                flush()
                para.append(("MARK", m.group(1)))
                continue
            buf.append(text)
            if x1 < maxr - 40:      # short line -> paragraph end
                flush()
flush()

# build letters
letters = []
cur = None
i = 0
while i < len(para):
    p = para[i]
    if isinstance(p, tuple) and p[0] == "MARK":
        num = p[1]
        title = ""
        j = i + 1
        if j < len(para) and isinstance(para[j], str) and not para[j].startswith("Beloved"):
            title = para[j]
            i = j + 1
        else:
            i = j
        cur = {"id": f"MT-KALI-{num}", "number": int(num), "title": title, "body": []}
        letters.append(cur)
        continue
    if cur is not None and isinstance(p, str):
        cur["body"].append(p)
    i += 1

for l in letters:
    l["body"] = "\n\n".join(l["body"]).strip()

nums = [l["number"] for l in letters]
print("letters:", len(letters), "range", min(nums), "->", max(nums), "unique", len(set(nums)))
print("short bodies (<200):", len([l for l in letters if len(l["body"]) < 200]))
print("missing titles:", len([l for l in letters if not l["title"]]))
print("avg body len:", sum(len(l["body"]) for l in letters)//len(letters))
s = next(l for l in letters if l["number"] == 1)
print("--- 0001 TITLE:", s["title"])
print(s["body"][:500])
print("...para count sample:", s["body"].count("\n\n") + 1)

os.makedirs("/app/backend/data", exist_ok=True)
with open("/app/backend/data/letters.json", "w") as fh:
    json.dump(letters, fh, ensure_ascii=False)
print("wrote", os.path.getsize("/app/backend/data/letters.json"), "bytes")
