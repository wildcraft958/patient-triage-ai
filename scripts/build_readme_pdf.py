"""Render README.md to the PDF the submission asks for.

    uv run --with markdown --no-project python scripts/build_readme_pdf.py out.pdf

Needs a Chrome or Brave already listening for DevTools on port 9222:

    /Applications/Brave\\ Browser.app/Contents/MacOS/Brave\\ Browser \\
        --remote-debugging-port=9222

The screenshots the README embeds are read from docs/, so re-capture those
first if the console has changed. Printing happens in a tab of its own, so
whatever is already open is left alone.
"""

import base64
import json
import os
import pathlib
import re
import secrets
import socket
import struct
import sys
import time
import urllib.request

import markdown

ROOT = pathlib.Path(__file__).resolve().parents[1]
CDP = "http://127.0.0.1:9222"

# The badge row and the table of contents are for someone reading the
# repository. A PDF has its own outline and no badges to click.
DROP_BADGES = re.compile(r"^\s*\[!\[.*?\n", re.M)
DROP_TOC = re.compile(r"^## Table of contents\n(?:.*\n)*?(?=^## )", re.M)

CSS = """
@page { size: A4; margin: 15mm 14mm 14mm; }
:root { --p:#A100FF; --pd:#6215B8; --ink:#241435; --line:#E4D6F6; --tint:#F7F2FD; }
* { box-sizing: border-box; }
body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
       font-size: 9.6pt; line-height: 1.55; color: var(--ink); margin: 0;
       -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font-size: 19pt; margin: 26px 0 8px; letter-spacing: -0.4px; page-break-after: avoid; }
h2 { font-size: 14pt; margin: 24px 0 8px; padding-bottom: 5px;
     border-bottom: 2px solid var(--line); page-break-after: avoid; }
h3 { font-size: 11.4pt; margin: 17px 0 5px; page-break-after: avoid; }
h4 { font-size: 10pt; margin: 13px 0 4px; page-break-after: avoid; }
p, li { margin: 0 0 7px; }
ul, ol { margin: 0 0 9px; padding-left: 18px; }
a { color: var(--pd); text-decoration: none; }
code { font-family: ui-monospace, Menlo, monospace; font-size: 8.4pt;
       background: var(--tint); padding: 1px 4px; border-radius: 3px; color: var(--pd); }
pre { background: var(--tint); border: 1px solid var(--line); border-radius: 5px;
      padding: 9px 11px; overflow: hidden; page-break-inside: avoid; margin: 0 0 10px; }
pre code { background: none; padding: 0; color: var(--ink); font-size: 8.1pt; line-height: 1.5; }
blockquote { margin: 12px 0; padding: 9px 14px; border-left: 3px solid var(--p);
             background: var(--tint); page-break-inside: avoid; }
blockquote p { margin: 0; font-weight: 700; color: var(--pd); }
table { width: 100%; border-collapse: collapse; margin: 10px 0 14px;
        font-size: 8.6pt; page-break-inside: avoid; }
th { text-align: left; background: var(--tint); color: var(--pd);
     border: 1px solid var(--line); padding: 6px 8px; font-size: 8pt; }
td { border: 1px solid var(--line); padding: 6px 8px; vertical-align: top; }
img { max-width: 100%; display: block; margin: 10px 0 4px;
      border: 1px solid var(--line); border-radius: 5px; page-break-inside: avoid; }
hr { border: 0; border-top: 1px solid var(--line); margin: 20px 0; }
/* The lockup is the document's own first image and is not a screenshot, so it
   takes none of the framing the screenshots get. */
img[src$="logo.png"] { border: 0; border-radius: 0; width: 300px; margin: 0 0 20px; }
"""


def render_html(dest: pathlib.Path) -> pathlib.Path:
    src = (ROOT / "README.md").read_text()
    src = DROP_TOC.sub("", DROP_BADGES.sub("", src))
    body = markdown.markdown(
        src, extensions=["tables", "fenced_code", "attr_list", "sane_lists"])
    # every image resolves against the repository, not against the temp file
    body = body.replace('src="docs/', f'src="file://{ROOT}/docs/')
    dest.write_text(
        "<!doctype html><meta charset=utf-8>"
        f"<title>PatientTriage.ai README</title><style>{CSS}</style>{body}")
    return dest


# --- the smallest CDP client that can drive a print ---------------------------

def _ws(url):
    _, rest = url.split("://", 1)
    hostport, path = rest.split("/", 1)
    host, port = hostport.split(":")
    s = socket.create_connection((host, int(port)), timeout=30)
    key = base64.b64encode(secrets.token_bytes(16)).decode()
    s.sendall((f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\n"
               f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n"
               "Sec-WebSocket-Version: 13\r\n\r\n").encode())
    buf = b""
    while b"\r\n\r\n" not in buf:
        buf += s.recv(4096)
    return s


def _send(s, obj):
    p = json.dumps(obj).encode()
    mask, n = os.urandom(4), len(p)
    if n < 126:
        hdr = b"\x81" + bytes([0x80 | n])
    elif n < 65536:
        hdr = b"\x81" + bytes([0x80 | 126]) + struct.pack(">H", n)
    else:
        hdr = b"\x81" + bytes([0x80 | 127]) + struct.pack(">Q", n)
    s.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(p)))


def _recv(s):
    def rd(n):
        b = b""
        while len(b) < n:
            c = s.recv(n - len(b))
            if not c:
                raise EOFError("the browser closed the connection")
            b += c
        return b
    while True:
        h = rd(2)
        ln = h[1] & 127
        if ln == 126:
            ln = struct.unpack(">H", rd(2))[0]
        elif ln == 127:
            ln = struct.unpack(">Q", rd(8))[0]
        payload = rd(ln)
        if h[0] & 0x0F == 1:
            return json.loads(payload)


def _session(url):
    sock, seq = _ws(url), [0]

    def cmd(method, params=None):
        seq[0] += 1
        _send(sock, {"id": seq[0], "method": method, "params": params or {}})
        while True:
            reply = _recv(sock)
            if reply.get("id") == seq[0]:
                return reply
    return cmd


def print_pdf(html: pathlib.Path, out: pathlib.Path) -> None:
    try:
        tabs = json.load(urllib.request.urlopen(f"{CDP}/json", timeout=5))
    except OSError as exc:
        sys.exit(f"no browser on {CDP} ({exc}). See this file's docstring.")
    browser = _session(next(t for t in tabs if t["type"] == "page")["webSocketDebuggerUrl"])
    tab_id = browser("Target.createTarget", {"url": "about:blank"})["result"]["targetId"]
    time.sleep(1)
    tab = next(t for t in json.load(urllib.request.urlopen(f"{CDP}/json"))
               if t["id"] == tab_id)
    try:
        cmd = _session(tab["webSocketDebuggerUrl"])
        cmd("Page.navigate", {"url": f"file://{html}"})
        time.sleep(4)  # the embedded screenshots have to decode before printing
        r = cmd("Page.printToPDF", {"printBackground": True, "preferCSSPageSize": True})
        out.write_bytes(base64.b64decode(r["result"]["data"]))
    finally:
        browser("Target.closeTarget", {"targetId": tab_id})


if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "README.pdf").resolve()
    html = render_html(out.with_suffix(".html"))
    print_pdf(html, out)
    html.unlink()
    print(f"{out}  {out.stat().st_size // 1024} KB")
