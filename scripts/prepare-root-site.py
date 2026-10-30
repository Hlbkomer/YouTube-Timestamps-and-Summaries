#!/usr/bin/env python3
"""Generate redirects from the legacy root website to the project website."""

import argparse
import html
import json
from pathlib import Path
import shutil
import zipfile


ROOT = Path(__file__).resolve().parent.parent
SITE_URL = "https://hlbkomer.github.io/YouTube-Timestamps-and-Summaries/"


def redirect_document(target):
    escaped = html.escape(target, quote=True)
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Timestamps &amp; Summaries for YT</title>
  <link rel="canonical" href="{escaped}">
  <meta http-equiv="refresh" content="0;url={escaped}">
  <script>window.location.replace({json.dumps(target)} + window.location.search + window.location.hash);</script>
</head>
<body>
  <p>This page has moved. <a href="{escaped}">Continue to Timestamps &amp; Summaries for YT</a>.</p>
</body>
</html>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, help="Also create a ZIP for the separate root-site repository")
    args = parser.parse_args()
    destination = ROOT / "github-pages-root-site"
    destination.mkdir(exist_ok=True)
    pages = {"index.html": "", "support.html": "support.html", "privacy.html": "privacy.html", "terms.html": "terms.html"}
    for name, path in pages.items():
        (destination / name).write_text(redirect_document(SITE_URL + path))
    verification = "googled3c6774e67286b7f.html"
    shutil.copy2(ROOT / "docs/root-site-assets" / verification, destination / verification)
    # Remove only the obsolete files owned by the previous site generator.
    (destination / "styles.css").unlink(missing_ok=True)
    for name in ("companion-app.png", "youtube-sidebar.png", "youtube-summary.png"):
        (destination / "readme-assets" / name).unlink(missing_ok=True)
    (destination / "README.md").write_text("""# Legacy website redirects

The app has one website: https://hlbkomer.github.io/YouTube-Timestamps-and-Summaries/

The root homepage and the old Support, Privacy and Terms URLs redirect to the
matching project pages. JavaScript preserves query strings and fragment links;
a meta refresh and a plain link provide fallbacks.

The website source, shared layout and stylesheet live in the app repository's
`docs/` directory. Generate this redirect bundle there with
`python3 scripts/prepare-root-site.py`, then copy its HTML files and README here.
Remove the obsolete `styles.css` and the three generated `readme-assets/` images.
Preserve the Google verification file and unrelated repository assets.
App Store publication is managed separately.
""")
    if args.zip:
        args.zip.parent.mkdir(parents=True, exist_ok=True)
        names = list(pages) + ["README.md", verification]
        with zipfile.ZipFile(args.zip, "w", zipfile.ZIP_DEFLATED) as archive:
            for name in names:
                archive.write(destination / name, name)
        print(args.zip.resolve())


if __name__ == "__main__":
    main()
