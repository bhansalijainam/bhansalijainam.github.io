# bhansalijainam.github.io

Portfolio of Jainam Bhansali, applied AI engineer. A static site: no build step, no dependencies.

## How it is put together

| File | What it does |
| --- | --- |
| `index.html` | All content. Edit copy, projects and links here. |
| `assets/css/main.css` | Layout, type and colour. The palette is the token block at the top. |
| `assets/js/main.js` | Scroll-driven motion: pinned sections, text reveals, marquee, menu. |
| `assets/js/scene.js` | The 27,000 dots, drawn with plain WebGL. They form the portrait, the process stack and the globe. |
| `assets/data/portrait.bin` | Dot positions for the portrait, generated from `assets/images/Profile.jpeg`. |
| `assets/data/land.bin` | Land/sea map for the globe. |
| `assets/fonts/` | Schibsted Grotesk and IBM Plex Mono, self-hosted (SIL Open Font License). |

Without WebGL or JavaScript the page still reads top to bottom, with a still of the portrait.
With "reduce motion" switched on, nothing is pinned or animated.

## Preview locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. The page must be served; opening the file directly blocks the data files.

## Changing the portrait

The portrait is a stipple of `assets/images/Profile.jpeg`. To use another photo, replace that
file, adjust the crop and face constants at the top of `tools/make_portrait.py`, and run:

```bash
pip install numpy scipy opencv-python-headless pillow
```

```bash
python tools/make_portrait.py
```

## Adding a project

Copy one `<a class="card">` block in the Work section of `index.html` and change its text and link.
The drawing inside each card is an inline SVG diagram of the method, not output from the project.
