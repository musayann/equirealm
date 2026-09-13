import { geoGraticule, geoPath, type GeoProjection } from "d3-geo";
import type { Feature, Geometry, Point } from "geojson";
import type { ExtraData, PlaceProps, WorldData } from "./data";
import { createProjection, type ProjectionId } from "./projections";
import { drawReprojectedRaster, type RasterSource } from "./raster";
import { getBaseStyle, type BaseStyleId, type LayerId, type TextureId } from "./styles";

/** d3 accepts a bare Sphere object; GeoJSON's types do not model it. */
const SPHERE = { type: "Sphere" } as unknown as Feature<Geometry>;

const FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export interface ViewTransform {
  k: number;
  x: number;
  y: number;
}

export interface BaseView {
  scale: number;
  translate: [number, number];
}

export interface RenderState {
  width: number;
  height: number;
  dpr: number;
  projectionId: ProjectionId;
  lambda0: number;
  base: BaseView;
  transform: ViewTransform;
  styleId: BaseStyleId;
  layers: Record<LayerId, boolean>;
  world: WorldData | null;
  extras: ExtraData;
  textures: Partial<Record<TextureId, HTMLImageElement>>;
}

/** Fits the whole sphere into `width` × `height` with a little breathing room. */
let baseViewCache: { key: string; value: BaseView } | null = null;

export function computeBaseView(
  projectionId: ProjectionId,
  lambda0: number,
  width: number,
  height: number,
  padding = 12,
): BaseView {
  const key = `${projectionId}|${lambda0}|${width}|${height}|${padding}`;
  if (baseViewCache?.key === key) return baseViewCache.value;

  const projection = createProjection(projectionId, lambda0);
  const inset = Math.min(padding, width / 8, height / 8);
  projection.fitExtent(
    [
      [inset, inset],
      [Math.max(inset + 1, width - inset), Math.max(inset + 1, height - inset)],
    ],
    SPHERE,
  );
  const translate = projection.translate();
  const value: BaseView = {
    scale: projection.scale(),
    translate: [translate[0], translate[1]],
  };
  baseViewCache = { key, value };
  return value;
}

/** The projection for the current pan/zoom, in CSS pixels. */
export function buildProjection(state: {
  projectionId: ProjectionId;
  lambda0: number;
  base: BaseView;
  transform: ViewTransform;
}): GeoProjection {
  const { base, transform } = state;
  return createProjection(state.projectionId, state.lambda0)
    .scale(base.scale * transform.k)
    .translate([
      base.translate[0] * transform.k + transform.x,
      base.translate[1] * transform.k + transform.y,
    ]);
}

function graticuleStep(k: number): number {
  if (k < 1.5) return 30;
  if (k < 3) return 15;
  if (k < 7) return 10;
  if (k < 16) return 5;
  if (k < 40) return 2;
  return 1;
}

function toRasterSource(image: HTMLImageElement): RasterSource | null {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return null;
  return { source: image, width, height };
}

/**
 * Natural Earth's shaded relief uses ~206 as its "flat ground" value rather
 * than white or mid-grey, so blending it straight over the map would tint
 * every pixel — oceans included. Rescale it once so flat ground lands on 128,
 * which is the neutral value for the soft-light blend used below.
 */
const NEUTRAL_HILLSHADE_BRIGHTNESS = 127.5 / 206;
const NEUTRAL_HILLSHADE_CONTRAST = 1 / NEUTRAL_HILLSHADE_BRIGHTNESS;

const neutralHillshadeCache = new WeakMap<HTMLImageElement, RasterSource>();

function toNeutralHillshade(image: HTMLImageElement): RasterSource | null {
  const cached = neutralHillshadeCache.get(image);
  if (cached) return cached;

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.filter = `brightness(${NEUTRAL_HILLSHADE_BRIGHTNESS}) contrast(${NEUTRAL_HILLSHADE_CONTRAST})`;
  ctx.drawImage(image, 0, 0);

  const prepared: RasterSource = { source: canvas, width, height };
  neutralHillshadeCache.set(image, prepared);
  return prepared;
}

function makeBufferPool(): (width: number, height: number) => CanvasRenderingContext2D | null {
  let canvas: HTMLCanvasElement | null = null;
  return (width, height) => {
    if (!canvas) canvas = document.createElement("canvas");
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return ctx;
  };
}

/** Holds the composited base map at full device resolution. */
const getBuffer = makeBufferPool();
/** Holds a single reprojected raster, at or below the resolution budget. */
const getRasterBuffer = makeBufferPool();

/**
 * Browsers drop GPU acceleration for 2D canvases past a few megapixels, and
 * the per-scanline draw calls this reprojection makes get roughly ten times
 * more expensive once that happens — enough to take a retina window from 60fps
 * to 5fps. Keeping the raster buffer under the budget keeps it on the fast
 * path; scaling the result up to device resolution costs nothing and is
 * invisible on photographic imagery.
 */
const RASTER_PIXEL_BUDGET = 3_000_000;
const MAX_RASTER_ROWS = 1500;

function rasterScaleFor(width: number, height: number, dpr: number): number {
  const area = Math.max(1, width * height);
  return Math.max(
    0.6,
    Math.min(dpr, Math.sqrt(RASTER_PIXEL_BUDGET / area), MAX_RASTER_ROWS / Math.max(1, height)),
  );
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function drawHaloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  halo: string,
  haloWidth = 3,
): void {
  ctx.lineWidth = haloWidth;
  ctx.strokeStyle = halo;
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function renderMap(canvas: HTMLCanvasElement, state: RenderState): void {
  const { width, height, dpr, layers, world, extras, textures } = state;
  const ctx = canvas.getContext("2d");
  if (!ctx || width <= 0 || height <= 0) return;

  const deviceWidth = Math.round(width * dpr);
  const deviceHeight = Math.round(height * dpr);
  if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
    canvas.width = deviceWidth;
    canvas.height = deviceHeight;
  }

  const style = getBaseStyle(state.styleId);
  const theme = style.theme;
  const projection = buildProjection(state);
  const path = geoPath(projection, ctx);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = theme.backdrop;
  ctx.fillRect(0, 0, deviceWidth, deviceHeight);

  // ---- Base: ocean, raster or land fills, hillshade — composited through a
  // buffer so the map edge gets an antialiased mask instead of stair steps.
  const bufferCtx = getBuffer(deviceWidth, deviceHeight);
  if (bufferCtx) {
    const bufferPath = geoPath(projection, bufferCtx);

    bufferCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bufferCtx.fillStyle = theme.ocean;
    bufferCtx.beginPath();
    bufferPath(SPHERE);
    bufferCtx.fill();

    const rasterScale = rasterScaleFor(width, height, dpr);
    const rasterWidth = Math.max(1, Math.round(width * rasterScale));
    const rasterHeight = Math.max(1, Math.round(height * rasterScale));

    /** Reprojects one raster off-screen, then composites it over the buffer. */
    const paintRaster = (
      source: RasterSource,
      composite: GlobalCompositeOperation,
      alpha: number,
    ) => {
      const rasterCtx = getRasterBuffer(rasterWidth, rasterHeight);
      if (!rasterCtx) return;

      drawReprojectedRaster(rasterCtx, source, {
        projectionId: state.projectionId,
        lambda0: state.lambda0,
        scale: projection.scale() * rasterScale,
        translate: [
          projection.translate()[0] * rasterScale,
          projection.translate()[1] * rasterScale,
        ],
        width: rasterWidth,
        height: rasterHeight,
      });

      bufferCtx.setTransform(1, 0, 0, 1, 0, 0);
      bufferCtx.globalCompositeOperation = composite;
      bufferCtx.globalAlpha = alpha;
      bufferCtx.drawImage(
        rasterCtx.canvas,
        0,
        0,
        rasterWidth,
        rasterHeight,
        0,
        0,
        deviceWidth,
        deviceHeight,
      );
      bufferCtx.globalAlpha = 1;
      bufferCtx.globalCompositeOperation = "source-over";
      bufferCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const textureImage = theme.texture ? textures[theme.texture] : undefined;
    const texture = textureImage ? toRasterSource(textureImage) : null;
    if (texture) {
      paintRaster(texture, "source-over", 1);
    } else if (world) {
      const fills = theme.countryFills;
      if (fills) {
        for (const country of world.countries) {
          bufferCtx.fillStyle = fills[country.colorIndex % fills.length];
          bufferCtx.beginPath();
          bufferPath(country.feature);
          bufferCtx.fill();
        }
      } else {
        bufferCtx.fillStyle = theme.land;
        bufferCtx.beginPath();
        bufferPath(world.land);
        bufferCtx.fill();
      }
    }

    const hillshadeImage = textures.hillshade;
    const hillshade =
      layers.hillshade && hillshadeImage ? toNeutralHillshade(hillshadeImage) : null;
    if (hillshade) {
      paintRaster(hillshade, "soft-light", 0.95);
    }

    // Antialiased clip to the map outline.
    bufferCtx.globalCompositeOperation = "destination-in";
    bufferCtx.fillStyle = "#000";
    bufferCtx.beginPath();
    bufferPath(SPHERE);
    bufferCtx.fill();
    bufferCtx.globalCompositeOperation = "source-over";

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bufferCtx.canvas, 0, 0);
  }

  // ---- Vector overlays, drawn straight onto the visible canvas.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const k = state.transform.k;
  const detailed = k >= 2.5;

  if (layers.lakes) {
    const lakes = detailed && extras.lakes50m ? extras.lakes50m : extras.lakes110m;
    if (lakes) {
      ctx.fillStyle = theme.lake;
      ctx.strokeStyle = theme.lakeStroke;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      path(lakes);
      ctx.fill();
      ctx.stroke();
    }
  }

  if (layers.rivers) {
    const rivers = detailed && extras.rivers50m ? extras.rivers50m : extras.rivers110m;
    if (rivers) {
      ctx.strokeStyle = theme.river;
      ctx.lineWidth = Math.min(1.5, 0.85 + k * 0.06);
      ctx.beginPath();
      path(rivers);
      ctx.stroke();
    }
  }

  if (layers.graticule) {
    const step = graticuleStep(k);
    const graticule = geoGraticule().step([step, step]).precision(1);
    ctx.strokeStyle = theme.graticule;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    path(graticule());
    ctx.stroke();
  }

  if (layers.geolines && extras.geolines) {
    ctx.strokeStyle = theme.geoline;
    ctx.lineWidth = 0.9;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    path(extras.geolines);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (world && layers.borders) {
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = theme.borderWidth;
    ctx.beginPath();
    path(world.borders);
    ctx.stroke();
  }

  if (world && layers.coastline) {
    ctx.strokeStyle = theme.coast;
    ctx.lineWidth = theme.coastWidth;
    ctx.beginPath();
    path(world.coast);
    ctx.stroke();
  }

  const placed: Rect[] = [];

  if (layers.cities && extras.places) {
    drawCities(ctx, projection, extras.places.features, theme, k, width, height, placed);
  }

  if (layers.labels && world) {
    drawCountryLabels(ctx, projection, world, theme, width, height, placed);
  }

  // Map outline last so it sits above every overlay.
  ctx.strokeStyle = theme.outline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  path(SPHERE);
  ctx.stroke();
}

function drawCountryLabels(
  ctx: CanvasRenderingContext2D,
  projection: GeoProjection,
  world: WorldData,
  theme: ReturnType<typeof getBaseStyle>["theme"],
  width: number,
  height: number,
  placed: Rect[],
): void {
  const scale = projection.scale();
  const candidates = [...world.countries].sort((a, b) => b.area - a.area);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const country of candidates) {
    if (!country.name) continue;
    const point = projection(country.centroid);
    if (!point) continue;
    const [x, y] = point;
    if (x < -40 || y < -20 || x > width + 40 || y > height + 20) continue;

    // sqrt(solid angle) is a decent stand-in for the country's angular width,
    // and multiplying by the projection scale turns it into pixels.
    const room = Math.sqrt(country.area) * scale;
    if (room < 26) continue;

    const size = Math.max(10, Math.min(15, room / 7));
    ctx.font = `500 ${size}px ${FONT_STACK}`;
    const textWidth = ctx.measureText(country.name).width;
    if (textWidth > room * 1.35) continue;

    const rect: Rect = {
      x0: x - textWidth / 2 - 3,
      y0: y - size * 0.7,
      x1: x + textWidth / 2 + 3,
      y1: y + size * 0.7,
    };
    if (placed.some((other) => overlaps(rect, other))) continue;
    placed.push(rect);

    drawHaloText(ctx, country.name, x, y, theme.label, theme.labelHalo);
  }
}

function drawCities(
  ctx: CanvasRenderingContext2D,
  projection: GeoProjection,
  features: Feature<Geometry, PlaceProps>[],
  theme: ReturnType<typeof getBaseStyle>["theme"],
  k: number,
  width: number,
  height: number,
  placed: Rect[],
): void {
  const minPopulation = k < 1.5 ? 7e6 : k < 3 ? 4e6 : k < 6 ? 2e6 : 0;
  const showLabels = k >= 1.8;
  const size = 10;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${size}px ${FONT_STACK}`;

  const visible = features
    .filter((f) => {
      const props = f.properties;
      const capital = props?.adm0cap === 1;
      const population = props?.pop_max ?? 0;
      return capital ? k >= 1.2 : population >= minPopulation;
    })
    .sort((a, b) => (b.properties?.pop_max ?? 0) - (a.properties?.pop_max ?? 0));

  for (const cityFeature of visible) {
    const geometry = cityFeature.geometry as Point;
    if (geometry?.type !== "Point") continue;
    const point = projection(geometry.coordinates as [number, number]);
    if (!point) continue;
    const [x, y] = point;
    if (x < 0 || y < 0 || x > width || y > height) continue;

    const capital = cityFeature.properties?.adm0cap === 1;
    const radius = capital ? 3 : 2.2;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = theme.city;
    ctx.strokeStyle = theme.cityStroke;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    const name = cityFeature.properties?.name;
    if (!showLabels || !name) continue;

    const textWidth = ctx.measureText(name).width;
    const rect: Rect = {
      x0: x + radius + 2,
      y0: y - size * 0.65,
      x1: x + radius + 5 + textWidth,
      y1: y + size * 0.65,
    };
    if (placed.some((other) => overlaps(rect, other))) continue;
    placed.push(rect);

    drawHaloText(ctx, name, x + radius + 3, y, theme.label, theme.labelHalo, 2.5);
  }
}
