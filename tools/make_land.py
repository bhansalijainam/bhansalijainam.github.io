"""Writes assets/data/land.bin, the land/sea map the globe's dots are filtered by.

One bit per half-degree cell (720 x 360, north to south, west to east, most
significant bit first), 1 for land. Antarctica is left out so the dots go where
people are.

    pip install numpy global-land-mask
    python tools/make_land.py
"""
import os

import numpy as np
from global_land_mask import globe

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets/data/land.bin')
W, H = 720, 360

lat = 90 - (np.arange(H) + 0.5) * 180 / H
lon = -180 + (np.arange(W) + 0.5) * 360 / W
LON, LAT = np.meshgrid(lon, lat)
land = globe.is_land(LAT, LON)
land[LAT < -60] = False

with open(OUT, 'wb') as f:
    f.write(np.packbits(land.astype(np.uint8), axis=None, bitorder='big').tobytes())
print(os.path.relpath(OUT, ROOT), os.path.getsize(OUT), 'bytes,', f'{land.mean():.1%} land')
