#!/usr/bin/env python3
"""Generate ikon adblock-browser (PNG 1024 + icns).
Desain: rounded-square gelap + shield oranye + simbol no-entry putih."""
import os, subprocess
from PIL import Image, ImageDraw

SIZE = 4096            # digambar 4x lalu di-downscale (anti-alias)
OUT = 1024
BUILD = os.path.join(os.path.dirname(__file__), '..', 'build')
os.makedirs(BUILD, exist_ok=True)

ORANGE = (232, 93, 4, 255)
ORANGE_DARK = (194, 77, 3, 255)
WHITE = (255, 255, 255, 255)

# ── latar: rounded-square gelap dengan gradasi ──
def gradient(size, top, bottom):
    g = Image.linear_gradient('L').resize((size, size))
    return Image.composite(Image.new('RGBA', (size, size), bottom),
                           Image.new('RGBA', (size, size), top), g)

img = gradient(SIZE, (44, 46, 52, 255), (13, 14, 16, 255))
mask = Image.new('L', (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=int(SIZE * 0.22), fill=255)
icon = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
icon.paste(img, (0, 0), mask)

d = ImageDraw.Draw(icon)
S = SIZE
cx = S / 2

# ── shield ──
shield = [
    (cx - 0.30 * S, 0.21 * S),
    (cx + 0.30 * S, 0.21 * S),
    (cx + 0.25 * S, 0.52 * S),
    (cx, 0.83 * S),
    (cx - 0.25 * S, 0.52 * S),
]
d.polygon(shield, fill=ORANGE)
d.line(shield + [shield[0]], fill=ORANGE_DARK, width=int(0.012 * S), joint='curve')

# ── simbol no-entry (lingkaran + garis diagonal) ──
cy = 0.47 * S
r = 0.115 * S
w = int(0.030 * S)
d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=WHITE, width=w)
d0 = 0.068 * S
d.line([(cx + d0, cy - d0), (cx - d0, cy + d0)], fill=WHITE, width=w)

# ── downscale ke 1024 & simpan ──
master = icon.resize((OUT, OUT), Image.LANCZOS)
png_path = os.path.join(BUILD, 'icon.png')
master.save(png_path, 'PNG')
print('PNG master:', png_path)

# ── buat iconset + icns via iconutil ──
iconset = os.path.join(BUILD, 'icon.iconset')
os.makedirs(iconset, exist_ok=True)
sizes = {
    'icon_16x16.png': 16, 'icon_16x16@2x.png': 32,
    'icon_32x32.png': 32, 'icon_32x32@2x.png': 64,
    'icon_128x128.png': 128, 'icon_128x128@2x.png': 256,
    'icon_256x256.png': 256, 'icon_256x256@2x.png': 512,
    'icon_512x512.png': 512, 'icon_512x512@2x.png': 1024,
}
for name, sz in sizes.items():
    icon.resize((sz, sz), Image.LANCZOS).save(os.path.join(iconset, name), 'PNG')

icns_path = os.path.join(BUILD, 'icon.icns')
subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', icns_path], check=True)
print('ICNS:', icns_path, f'({os.path.getsize(icns_path)} bytes)')
