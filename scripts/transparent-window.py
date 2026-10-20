#!/usr/bin/env python3
"""Make Paseo.app's window transparent with macOS blur (vibrancy).

Paseo creates an opaque window, so a theme alone can't show the desktop.
This patches the installed app in place:

  1. app.asar main.js: the main BrowserWindow gets transparent + vibrancy.
  2. app.asar window-manager.js: the renderer can't reset the window to an
     opaque background color.
  3. app-dist/index.html: the page's dark default background becomes transparent.

Edits to app.asar keep the same byte length, so the archive layout is unchanged
(Paseo ships with asar integrity validation disabled). Originals are backed up
as *.orig next to each file. Paseo updates replace the app and undo the patch;
re-run `apply` after each update.

Usage: transparent-window.py apply|restore|status [--app /Applications/Paseo.app]
"""

import argparse
import shutil
import sys
from pathlib import Path

MAIN_OLD = (
    b"        show: false,\n"
    b"        backgroundColor: (0, window_manager_js_1.getWindowBackgroundColor)(systemTheme),"
)
# macOS blur material. "hud" is the darkest; "under-window" is lighter and milkier.
VIBRANCY = "hud"
MAIN_NEW = (
    f'show:false,transparent:true,vibrancy:"{VIBRANCY}",'
    f'visualEffectState:"active",backgroundColor:"#00000000",'
).encode()

CHROME_OLD = b"win.setBackgroundColor(nextUpdate.backgroundColor);"
CHROME_NEW = b'win.setBackgroundColor("#00000000");'

HTML_OLD = "background-color: #181b1a;"
HTML_NEW = "background-color: transparent;"


def pad(new: bytes, old: bytes) -> bytes:
    if len(new) > len(old):
        sys.exit(f"replacement longer than original ({len(new)} > {len(old)})")
    return new + b" " * (len(old) - len(new))


ASAR_EDITS = [(MAIN_OLD, pad(MAIN_NEW, MAIN_OLD)), (CHROME_OLD, pad(CHROME_NEW, CHROME_OLD))]


def paths(app: Path):
    res = app / "Contents" / "Resources"
    return res / "app.asar", res / "app-dist" / "index.html"


def state(asar: Path, html: Path) -> str:
    data = asar.read_bytes()
    text = html.read_text()
    patched = [new in data for _, new in ASAR_EDITS] + [HTML_NEW in text]
    original = [data.count(old) == 1 for old, _ in ASAR_EDITS] + [HTML_OLD in text]
    if all(patched):
        return "patched"
    if all(original):
        return "original"
    return "unknown"


def apply(app: Path):
    asar, html = paths(app)
    # Re-applying (e.g. after changing VIBRANCY) starts from the backups.
    for f in (asar, html):
        backup = f.with_name(f.name + ".orig")
        if backup.exists():
            shutil.copy2(backup, f)
    s = state(asar, html)
    if s != "original":
        sys.exit("Paseo's files don't match what this script expects "
                 "(new Paseo version?). Nothing changed.")

    for f in (asar, html):
        backup = f.with_name(f.name + ".orig")
        shutil.copy2(f, backup)

    data = asar.read_bytes()
    for old, new in ASAR_EDITS:
        data = data.replace(old, new, 1)
    asar.write_bytes(data)
    html.write_text(html.read_text().replace(HTML_OLD, HTML_NEW))
    print("Patched. Quit Paseo (Cmd+Q) and reopen it.")


def restore(app: Path):
    restored = False
    for f in paths(app):
        backup = f.with_name(f.name + ".orig")
        if backup.exists():
            shutil.move(backup, f)
            restored = True
    print("Restored originals. Restart Paseo." if restored else "No backups found.")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("command", choices=["apply", "restore", "status"])
    p.add_argument("--app", default="/Applications/Paseo.app", type=Path)
    args = p.parse_args()
    if args.command == "apply":
        apply(args.app)
    elif args.command == "restore":
        restore(args.app)
    else:
        print(state(*paths(args.app)))


if __name__ == "__main__":
    main()
