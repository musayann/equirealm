# Equal Earth

A full-screen, zoomable world map on the **Equal Earth** projection, built with Next.js and
`d3-geo`. Switch between a political map, shaded relief, satellite imagery and night lights, and
toggle vector overlays on top of any of them.

```bash
npm run dev    # http://localhost:3000
npm run build && npm start
```

## What's in it

**Base maps** — pick one:

| Style | Source |
| --- | --- |
| Political | Countries filled from a greedy graph colouring, so no two neighbours ever share a colour |
| Relief | Natural Earth hypsometric tints with shaded relief (`HYP_50M_SR_W`) |
| Satellite | NASA Blue Marble composite |
| Night lights | NASA Earth at Night |
| Minimal | Quiet dark base for building overlays on |

**Overlays** — combine freely: country borders, coastline, hillshade, rivers, lakes, graticule,
tropics & polar circles, cities (capitals and everything over 1M), and country labels placed by
available room with collision avoidance.

**Projections** — Equal Earth by default, plus Mollweide, Eckert IV, Sinusoidal and Boggs
(all equal-area), and Robinson and Natural Earth (compromise). The central meridian can be moved
to recentre the map on the Atlantic, Asia or the Pacific.

Scroll or pinch to zoom, drag to pan, double-click to zoom in. Panning is clamped so the map
cannot be dragged off-screen, and the cursor's latitude/longitude is shown bottom-right.

## How it works

Everything is drawn into a single `<canvas>`. The projection is a plain `d3-geo` projection; pan
and zoom come from `d3-zoom`, whose transform is folded into the projection's `scale` and
`translate` each frame, so vectors are re-projected and stay crisp at every zoom level rather than
being scaled up as a bitmap. Country and river geometry swaps from Natural Earth 110m to 50m past
2.5×.

### Reprojecting the raster layers

The imagery ships as equirectangular JPEGs, so it has to be warped into the target projection.
Doing that per pixel would be far too slow in JavaScript, but every projection offered here is
**pseudocylindrical**: parallels are straight horizontal lines, and meridians are evenly spaced
along each parallel. That means each output scanline corresponds to exactly one latitude, and the
whole 360° of longitude on that line is a horizontal segment of known width — so one row of the
source image, stretched horizontally, *is* the correct output row.

`lib/raster.ts` builds a lookup table of (projected y, half-width) sampled at unit scale once per
projection, then walks the visible rows and issues one `drawImage` per row. It is cheap enough to
redo on every frame, so the imagery is resampled from the source at the current zoom instead of
being magnified — which is why the relief stays sharp when you zoom in.

Two consequences worth knowing if you extend this:

- **Do not add a non-pseudocylindrical projection** (Winkel tripel, azimuthals, conics) to
  `lib/projections.ts` without replacing the raster path — the scanline assumption breaks.
- The raster is reprojected into an off-screen buffer capped at ~3 megapixels. Browsers drop GPU
  acceleration for 2D canvases past a few megapixels, and these per-scanline draws get roughly ten
  times more expensive when that happens — enough to take a retina window from 60fps to 5fps.
  The buffer is scaled up to full device resolution on composite; vectors and labels are always
  drawn at full resolution, so only the photographic imagery is resampled.

Shaded relief uses ~206, not white, as its "flat ground" value, so blending it straight over the
map would tint every pixel including the oceans. `lib/render.ts` rescales it once so flat ground
lands on 128 — neutral for the soft-light blend it is composited with.

## Layout

```
app/                  Next.js app router shell
components/
  EqualEarthMap.tsx   Canvas, pan/zoom, data loading, render scheduling
  ControlPanel.tsx    Layer and projection controls
lib/
  projections.ts      Projection registry (pseudocylindrical only)
  styles.ts           Base-map themes and layer definitions
  data.ts             TopoJSON/GeoJSON loading, country colouring, image cache
  raster.ts           Scanline raster reprojection
  render.ts           The frame: base, overlays, labels
public/data/          Natural Earth vectors, pre-trimmed
public/textures/      Relief, hillshade, satellite, night imagery
```

## Data provenance

All bundled data is public domain or NASA imagery, pre-processed to keep the payload small.

Vectors — [Natural Earth](https://www.naturalearthdata.com/) via
[world-atlas](https://github.com/topojson/world-atlas) (countries) and
[natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) (rivers, lakes,
geographic lines, populated places). Properties were stripped to the fields actually drawn.

Imagery — Natural Earth rasters, converted from the source GeoTIFFs:

```bash
curl -O https://naturalearth.s3.amazonaws.com/50m_raster/HYP_50M_SR_W.zip   # relief
curl -O https://naturalearth.s3.amazonaws.com/50m_raster/SR_50M.zip         # hillshade
# macOS; use ImageMagick or GDAL elsewhere
sips -s format jpeg -s formatOptions 68 -Z 5400 HYP_50M_SR_W.tif --out public/textures/relief.jpg
sips -s format jpeg -s formatOptions 62 -Z 4096 SR_50M.tif      --out public/textures/hillshade.jpg
```

`satellite.jpg` and `night.jpg` are the NASA Blue Marble and Earth at Night composites
distributed with [three-globe](https://github.com/vasturiano/three-globe).
