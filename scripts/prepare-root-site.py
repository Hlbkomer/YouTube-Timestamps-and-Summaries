#!/usr/bin/env python3
"""Refresh the legacy root-site bundle from the project's website and policies."""

import argparse
import html
from pathlib import Path
import re
import shutil
import zipfile


ROOT = Path(__file__).resolve().parent.parent
SITE_URL = "https://hlbkomer.github.io/YouTube-Timestamps-and-Summaries/"


def without_frontmatter(text):
    if text.startswith("---\n"):
        return text.split("---", 2)[2].strip()
    return text.strip()


def inline(text):
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    return re.sub(r"\[([^\]]+)\]\(((?:https?://|mailto:)[^\s)]+)\)", r'<a href="\2">\1</a>', text)


def policy_html(text):
    """Render the headings, lists and paragraphs used by our two policy files."""
    blocks = []
    for block in re.split(r"\n\s*\n", without_frontmatter(text)):
        lines = block.splitlines()
        heading = re.fullmatch(r"(#{1,6}) (.+)", block)
        if heading:
            level = len(heading[1])
            slug = re.sub(r"[^a-z0-9]+", "-", heading[2].lower()).strip("-")
            blocks.append(f'<h{level} id="{slug}">{inline(heading[2])}</h{level}>')
        elif all(line.startswith("- ") for line in lines):
            blocks.append("<ul>" + "".join(f"<li>{inline(line[2:])}</li>" for line in lines) + "</ul>")
        else:
            if any(line.startswith(("```", "<", "|")) for line in lines):
                raise ValueError("Policy uses markup this small renderer does not support")
            blocks.append("<p>" + inline(" ".join(lines)) + "</p>")
    return "\n".join(blocks)


def document(title, body, head=""):
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>{head}</head><body>{body}</body></html>
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, help="Also create a ZIP for the separate root-site repository")
    args = parser.parse_args()
    destination = ROOT / "github-pages-root-site"
    destination.mkdir(exist_ok=True)
    for name in ["styles.css", "googled3c6774e67286b7f.html"]:
        shutil.copy2(ROOT / "docs/root-site-assets" / name, destination / name)
    homepage = without_frontmatter((ROOT / "docs/index.md").read_text())
    wrapper = '<style>body{margin:0 auto;max-width:1280px;padding:0 32px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:#065fd4}</style>'
    canonical = f'<link rel="canonical" href="{SITE_URL}">'
    (destination / "index.html").write_text(document("Timestamps & Summaries for YT", homepage, canonical + wrapper))
    navigation = '<header class="header"><a class="brand" href="./">Timestamps &amp; Summaries for YT</a><nav class="nav"><a href="./">Home</a><a href="support.html">Support</a><a href="privacy.html">Privacy Policy</a><a href="terms.html">Terms of Service</a></nav></header>'
    for name, title in [("privacy", "Privacy Policy"), ("terms", "Terms of Service"), ("support", "Support")]:
        content = policy_html((ROOT / f"docs/{name}.md").read_text())
        body = f'<main class="page">{navigation}<article class="card content">{content}</article></main>'
        head = f'<link rel="stylesheet" href="styles.css"><link rel="canonical" href="{SITE_URL}{name}.html">'
        (destination / f"{name}.html").write_text(document(f"{title} | Timestamps & Summaries for YT", body, head))
    assets = destination / "readme-assets"
    assets.mkdir(exist_ok=True)
    for name in ["companion-app.png", "youtube-sidebar.png", "youtube-summary.png"]:
        shutil.copy2(ROOT / "docs/readme-assets" / name, assets / name)
    (destination / "README.md").write_text("# Timestamps & Summaries for YT — Public Site\n\nThe support and marketing site for [version 1.2](https://github.com/Hlbkomer/YouTube-Timestamps-and-Summaries/releases/tag/v1.2).\n\n- [Home](https://hlbkomer.github.io/)\n- [Support](https://hlbkomer.github.io/support.html)\n- [Privacy](https://hlbkomer.github.io/privacy.html)\n- [Terms](https://hlbkomer.github.io/terms.html)\n\nGenerated from the main project repository's `docs/` pages and website images. Refresh there with `python3 scripts/prepare-root-site.py --zip build/root-site-1.2.zip`, then copy the bundle to this repository. Preserve the included Google verification file. App Store submission is managed separately.\n")
    if args.zip:
        args.zip.parent.mkdir(parents=True, exist_ok=True)
        names = ["index.html", "privacy.html", "terms.html", "support.html", "styles.css", "README.md", "googled3c6774e67286b7f.html"]
        files = [destination / name for name in names] + list(assets.glob("*.png"))
        with zipfile.ZipFile(args.zip, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in files:
                archive.write(path, path.relative_to(destination))
        print(args.zip.resolve())


if __name__ == "__main__":
    main()
