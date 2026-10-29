"""Build the standalone index.html from page.html.

page.html is the source (it is also what is published as a Claude Artifact).
Hosts such as Vercel or GitHub Pages need a full document, so this wraps the
source with a doctype, charset, viewport and a small reset.
Run: python3 build.py
"""
import pathlib

root = pathlib.Path(__file__).parent
src = (root / "page.html").read_text(encoding="utf-8")
cut = src.index("<header")
head, body = src[:cut], src[cut:]
head = head.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', "")
reset = (
    ":root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);"
    "padding-bottom:env(safe-area-inset-bottom,0px)}"
    "body{margin:0}img{max-width:100%}[hidden]{display:none!important}"
)
doc = (
    "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n"
    "<style>" + reset + "</style>\n" + head + "</head>\n<body>\n" + body + "</body>\n</html>\n"
)
(root / "index.html").write_text(doc, encoding="utf-8")
print("wrote index.html", len(doc), "bytes")
