#!/usr/bin/env python3
"""
build-favicons.py — regenerate the aimazze.com favicon set from the approved mark.

Source of truth is assets/brand/logo-mark.png, the final approved AIMAZZE "A"
logomark already committed to this repo (same art the desktop app's icon set is
built from). Nothing here draws or restyles the mark — it only crops, scales and
pads it into the sizes browsers ask for.

Two deliberate choices, both learned from the app's icon work:

  1. PAD, don't fill the tile. aimazze-app shipped an icon that bled
     edge-to-edge at 16px and had to be repadded (aimazze-app 5257add). The
     mark occupies MARK_SCALE of the tile's longest side, centred, so the
     strokes stay readable at 16x16.
  2. Opaque porcelain plate, not transparency. The mark is dark teal
     (#0C6E62). On a transparent background it very nearly vanishes into a
     dark-mode browser tab strip, and iOS composites apple-touch-icon
     transparency onto black. A #F4F6F8 plate (the site's --bg) reads as
     brand in both light and dark chrome.

Usage:  python scripts/build-favicons.py     (run from the repo root)
Requires Pillow. Regenerate and re-deploy if the mark itself ever changes.
"""

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "brand" / "logo-mark.png"

PLATE = (244, 246, 248, 255)  # --bg / porcelain, from chambers.css
MARK_SCALE = 0.80             # mark's longest side, as a fraction of the tile
ICO_SIZES = (16, 32, 48)      # multi-resolution favicon.ico


def tile(mark, size):
    """Centre the cropped mark on an opaque square porcelain tile."""
    w, h = mark.size
    ratio = (size * MARK_SCALE) / max(w, h)
    scaled = mark.resize((max(1, round(w * ratio)), max(1, round(h * ratio))), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), PLATE)
    out.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return out


def main():
    if not SOURCE.exists():
        sys.exit(f"source mark not found: {SOURCE}")

    src = Image.open(SOURCE).convert("RGBA")
    bbox = src.getchannel("A").getbbox()
    if bbox is None:
        sys.exit(f"source mark has no opaque pixels: {SOURCE}")
    mark = src.crop(bbox)  # trim the source's own uneven transparent margin

    written = []

    # PNG favicons, declared explicitly in every page <head>.
    for size in (16, 32):
        path = ROOT / f"favicon-{size}x{size}.png"
        tile(mark, size).convert("RGB").save(path, "PNG", optimize=True)
        written.append(path)

    # apple-touch-icon: 180x180, opaque, no rounding (iOS masks it itself).
    path = ROOT / "apple-touch-icon.png"
    tile(mark, 180).convert("RGB").save(path, "PNG", optimize=True)
    written.append(path)

    # Android / PWA manifest icons.
    for size in (192, 512):
        path = ROOT / f"android-chrome-{size}x{size}.png"
        tile(mark, size).convert("RGB").save(path, "PNG", optimize=True)
        written.append(path)

    # Multi-resolution favicon.ico (16/32/48) for legacy + Windows shortcuts.
    # Render each size from the mark rather than letting Pillow downsample one
    # big frame, so the 16px frame gets its own clean LANCZOS pass.
    path = ROOT / "favicon.ico"
    frames = [tile(mark, s).convert("RGB") for s in ICO_SIZES]
    frames[-1].save(path, format="ICO", sizes=[(s, s) for s in ICO_SIZES],
                    append_images=frames[:-1])
    written.append(path)

    for p in written:
        print(f"  {p.relative_to(ROOT).as_posix():<32} {p.stat().st_size:>7} bytes")


if __name__ == "__main__":
    main()
