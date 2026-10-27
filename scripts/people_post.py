"""Post-process people bank: center-crop square, export <id>.jpg (512, q88) and <id>@256.jpg, build sheet.jpg.
Run: <skill venv python> -I people_post.py [ids...]   (<skill venv python> = python3 scripts/paths.py --python)"""
import json, os, sys
from PIL import Image, ImageDraw
D = os.path.expanduser("~/.claude/skills/estudio-video/assets/people")
ids = [m["id"] for m in json.load(open(f"{D}/manifest.json"))]
for i in (sys.argv[1:] or ids):
    p = f"{D}/src/{i}.png"
    if not os.path.exists(p): continue
    im = Image.open(p).convert("RGB"); w, h = im.size; s = min(w, h)
    im = im.crop(((w-s)//2, (h-s)//2, (w-s)//2+s, (h-s)//2+s))
    im.resize((512, 512), Image.LANCZOS).save(f"{D}/{i}.jpg", quality=88)
    im.resize((256, 256), Image.LANCZOS).save(f"{D}/{i}@256.jpg", quality=88)
T = 256; sheet = Image.new("RGB", (T*4, T*4), "white"); d = ImageDraw.Draw(sheet)
for n, i in enumerate(ids):
    f = f"{D}/{i}@256.jpg"
    if not os.path.exists(f): continue
    x, y = (n % 4)*T, (n//4)*T
    sheet.paste(Image.open(f), (x, y)); d.rectangle((x, y, x+44, y+20), fill="black"); d.text((x+6, y+4), i, fill="white")
sheet.save(f"{D}/sheet.jpg", quality=88)
