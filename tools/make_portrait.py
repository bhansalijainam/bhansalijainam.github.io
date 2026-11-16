"""Turns assets/images/Profile.jpeg into the dots the site draws.

Writes
  assets/data/portrait.bin            27,000 points: position, depth, size, colour
  assets/images/portrait-stipple.webp the same dots as a still, for browsers without WebGL

Method: split the figure into two "plates" (ink for skin, hair and beard; coral for the
shirt), build a darkness map for each, then place dots by weighted Voronoi stippling
(Lloyd relaxation), so dots crowd where the photo is dark and never clump.

The constants below are tuned for this photo (flat black backdrop, subject centred).
A different photo needs new crop, collar and face values.

    pip install numpy scipy opencv-python-headless pillow
    python tools/make_portrait.py
"""
import os
import struct

import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets/images/Profile.jpeg')
OUT_BIN = os.path.join(ROOT, 'assets/data/portrait.bin')
OUT_STILL = os.path.join(ROOT, 'assets/images/portrait-stipple.webp')

X0, X1, Y0, Y1 = 55, 615, 205, 860     # crop: head and shoulders
COLLAR_Y = 560                          # the shirt starts about here
FACE = (345, 385)                       # centre of the face; the dots gather here first
N_INK, N_CORAL = 18200, 8800            # must add up to the count in assets/js/scene.js
S = 2                                   # work at twice the photo's resolution

INK = (17, 19, 42)
CORAL = (244, 69, 47)


def silhouette(im):
    """The subject, cut from the black backdrop. Flooding in from the borders keeps
    dark hair and lenses, which a plain threshold would remove."""
    h, w = im.shape[:2]
    dark = (cv2.cvtColor(im, cv2.COLOR_BGR2GRAY) < 16).astype(np.uint8)
    flood = dark.copy()
    scratch = np.zeros((h + 2, w + 2), np.uint8)
    for x in range(0, w, 3):
        for y in (0, h - 1):
            if flood[y, x] == 1:
                cv2.floodFill(flood, scratch, (x, y), 2)
    for y in range(0, h, 3):
        for x in (0, w - 1):
            if flood[y, x] == 1:
                cv2.floodFill(flood, scratch, (x, y), 2)
    fg = (flood != 2).astype(np.uint8) * 255
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    _, labels, stats, _ = cv2.connectedComponentsWithStats(fg)
    fg = np.where(labels == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]), 255, 0).astype(np.uint8)
    return cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))


def stipple(density, n, seed, iters=22):
    """Weighted Voronoi stippling: n points whose spacing follows `density`."""
    h, w = density.shape
    rng = np.random.default_rng(seed)
    cdf = np.cumsum(density.ravel().astype(np.float64))
    cdf /= cdf[-1]
    idx = np.searchsorted(cdf, rng.random(n))
    pts = np.stack([idx % w, idx // w], 1).astype(np.float64) + rng.random((n, 2))
    ys, xs = np.nonzero(density > 2e-3)
    weight = density[ys, xs].astype(np.float64)
    pix = np.stack([xs, ys], 1).astype(np.float64) + 0.5
    for _ in range(iters):
        _, nearest = cKDTree(pts).query(pix, workers=-1)
        total = np.bincount(nearest, weight, n)
        ok = total > 0
        pts[ok, 0] = np.bincount(nearest, weight * pix[:, 0], n)[ok] / total[ok]
        pts[ok, 1] = np.bincount(nearest, weight * pix[:, 1], n)[ok] / total[ok]
        if (~ok).any():
            idx = np.searchsorted(cdf, rng.random((~ok).sum()))
            pts[~ok] = np.stack([idx % w, idx // w], 1) + rng.random(((~ok).sum(), 2))
    return pts


def main():
    photo = cv2.imread(SRC, cv2.IMREAD_COLOR)
    fg = silhouette(photo)

    im = cv2.resize(photo[Y0:Y1, X0:X1], None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)
    fg = cv2.resize(fg[Y0:Y1, X0:X1], None, fx=S, fy=S, interpolation=cv2.INTER_LINEAR)
    H, W = fg.shape
    yy = np.arange(H)[:, None] * np.ones((1, W))
    collar = int((COLLAR_Y - Y0) * S)
    gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)

    # --- mask: drop the backdrop showing through the gaps between arms and torso
    mask = fg > 127
    hole = cv2.morphologyEx(((gray < 20) & mask).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    count, labels, stats, centres = cv2.connectedComponentsWithStats(hole)
    below = yy > (600 - Y0) * S
    mask &= ~(cv2.dilate(((gray < 30) & below).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0)
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8)).astype(bool)
    for i in range(1, count):
        # holes sit below the collar; hair, beard and lenses are above it
        if stats[i, cv2.CC_STAT_AREA] > 600 and centres[i][1] > (600 - Y0) * S:
            mask[cv2.dilate((labels == i).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0] = False

    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV).astype(np.float32)
    hue, sat, val = hsv[..., 0] * 2, hsv[..., 1] / 255, hsv[..., 2] / 255
    lum_eq = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8)).apply(gray).astype(np.float32) / 255
    lum = gray.astype(np.float32) / 255

    # --- the two plates
    skin = (hue > 11) & (hue < 28) & (sat > 0.28) & (val > 0.34) & mask
    skin = cv2.morphologyEx(skin.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    skin = cv2.morphologyEx(skin, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)).astype(bool)
    dark = (val < 0.40) & mask
    shirt = mask & ~skin & ~dark & (yy > collar - 40 * S)
    shirt = cv2.morphologyEx(shirt.astype(np.uint8), cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    _, labels, stats, _ = cv2.connectedComponentsWithStats(shirt)
    shirt = labels == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    shirt = cv2.morphologyEx(shirt.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8)).astype(bool) & mask
    shirt &= ~skin

    # --- darkness maps
    sharp = np.clip(lum_eq + 0.9 * (lum_eq - cv2.GaussianBlur(lum_eq, (0, 0), 3)), 0, 1)
    soft = cv2.GaussianBlur(lum, (0, 0), 1.6)
    edge = np.clip(np.hypot(cv2.Sobel(soft, cv2.CV_32F, 1, 0), cv2.Sobel(soft, cv2.CV_32F, 0, 1)) * 2.4, 0, 1)
    d_ink = np.clip(np.clip(1 - sharp, 0, 1) ** 1.55 * 1.05 + 0.30 * edge, 0, 1)
    d_skin = np.clip(1 - sharp, 0, 1) ** 2.05 * 0.95 + 0.22 * edge + 0.02    # skin stays open and light
    d_ink = np.minimum(np.where(skin, d_skin, d_ink), 0.76)                  # keep dot texture in the blacks
    d_ink = np.where(yy < collar, d_ink, np.minimum(d_ink * 0.82, 0.46))     # the head gets most of the ink
    d_coral = 0.07 + 1.0 * np.clip((sat - 0.08) * 3.6, 0, 1) ** 1.2 + 0.45 * np.clip(0.84 - lum, 0, 1) + 0.2 * edge
    d_coral = np.clip(d_coral, 0, 0.6)

    # an ink keyline round the outer silhouette, as on a two-colour print
    flood = mask.astype(np.uint8).copy()
    cv2.floodFill(flood, np.zeros((H + 2, W + 2), np.uint8), (0, 0), 2)
    filled = flood != 2
    rim = filled & ~cv2.erode(filled.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(bool) & mask
    shirt &= ~rim
    d_ink = np.where(rim, np.maximum(d_ink, 0.6), d_ink)

    # thin out towards the bottom, where the figure dissolves into loose dots
    fade = np.clip((H - yy) / (0.30 * H), 0, 1) ** 0.8
    d_ink = d_ink * (mask & ~shirt) * fade
    d_coral = d_coral * shirt * fade

    p_ink = stipple(d_ink, N_INK, seed=1)
    p_coral = stipple(d_coral, N_CORAL, seed=2)

    # --- depth: a rounded relief from the silhouette, raised over the face and nose
    relief = np.sqrt(np.clip(cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5) / (62 * S), 0, 1))
    relief = cv2.GaussianBlur(relief, (0, 0), 5 * S)
    fx, fy = (FACE[0] - X0) * S, (FACE[1] - Y0) * S
    xx = np.arange(W)[None, :]
    bump = lambda cx, cy, sx, sy: np.exp(-(((xx - cx) / sx) ** 2 + ((yy - cy) / sy) ** 2))
    relief = relief + 0.16 * bump(fx, fy, 70 * S, 95 * S) + 0.10 * bump(fx, fy + 22 * S, 16 * S, 30 * S)
    relief = relief + 0.05 * (lum - 0.5)
    relief = np.clip(relief / relief.max(), 0, 1)

    def sample(a, p):
        return a[np.clip(p[:, 1].astype(int), 0, H - 1), np.clip(p[:, 0].astype(int), 0, W - 1)]

    pts = np.vstack([p_ink, p_coral])
    depth = np.concatenate([sample(relief, p_ink), sample(relief, p_coral)])
    size = np.concatenate([sample(d_ink, p_ink), sample(d_coral, p_coral)])
    tint = np.concatenate([np.zeros(N_INK), np.ones(N_CORAL)])
    n = len(pts)
    order = np.random.default_rng(7).permutation(n)        # shuffled so any subset is an even sample
    pts, depth, size, tint = pts[order], depth[order], size[order], tint[order]

    # header: count, aspect ratio, face centre (in the units scene.js uses); then one array per field
    face = (((FACE[0] - X0) / (X1 - X0) - 0.5) * (W / H), 0.5 - (FACE[1] - Y0) / (Y1 - Y0))
    os.makedirs(os.path.dirname(OUT_BIN), exist_ok=True)
    with open(OUT_BIN, 'wb') as f:
        f.write(struct.pack('<Ifff', n, W / H, float(face[0]), float(face[1])))
        f.write(np.clip(pts[:, 0] / W * 65535, 0, 65535).astype('<u2').tobytes())
        f.write(np.clip(pts[:, 1] / H * 65535, 0, 65535).astype('<u2').tobytes())
        f.write(np.clip(depth * 255, 0, 255).astype('u1').tobytes())
        f.write(np.clip(size * 255, 0, 255).astype('u1').tobytes())
        f.write((tint * 255).astype('u1').tobytes())
    print(os.path.relpath(OUT_BIN, ROOT), os.path.getsize(OUT_BIN), 'bytes,', n, 'points')

    # --- still: the same dots, coral under ink, on a transparent ground
    height, ss = 640, 3
    sc = height / H
    still = Image.new('RGBA', (int(W * sc) * ss, int(H * sc) * ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(still)
    for i in np.argsort(tint)[::-1]:
        r = 1.15 * (0.78 + 0.5 * size[i]) * ss * (height / 760)
        cx, cy = pts[i, 0] * sc * ss, pts[i, 1] * sc * ss
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(CORAL if tint[i] else INK) + (255,))
    still.resize((int(W * sc), int(H * sc)), Image.LANCZOS).save(OUT_STILL, quality=72, method=6)
    print(os.path.relpath(OUT_STILL, ROOT), os.path.getsize(OUT_STILL), 'bytes')


if __name__ == '__main__':
    main()
