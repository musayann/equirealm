import { getProjectionSpec, type ProjectionId } from "./projections";

/**
 * Reprojection lookup table for a pseudocylindrical projection, sampled at unit
 * scale with the origin at [0, 0] and no rotation.
 *
 * Because parallels are straight and meridians are evenly spaced along them,
 * every output scanline corresponds to exactly one latitude, and the whole
 * 360° of longitude for that latitude is a horizontal segment of known width.
 * That makes reprojecting an equirectangular image a matter of stretching one
 * source row per output row — cheap enough to redo on every frame, so the
 * raster stays sharp at any zoom instead of being scaled up as a bitmap.
 */
interface ProjectionTable {
  /** Projected y (screen-down) for latitude 90 − 180·i/steps, strictly increasing. */
  y: Float64Array;
  /** Half the projected width of that parallel, i.e. the distance to 180° of longitude. */
  halfWidth: Float64Array;
  steps: number;
}

const TABLE_STEPS = 4096;
const tableCache = new Map<ProjectionId, ProjectionTable>();

function buildTable(id: ProjectionId): ProjectionTable {
  const projection = getProjectionSpec(id)
    .factory()
    .rotate([0, 0, 0])
    .scale(1)
    .translate([0, 0]);

  const steps = TABLE_STEPS;
  const y = new Float64Array(steps + 1);
  const halfWidth = new Float64Array(steps + 1);

  for (let i = 0; i <= steps; i += 1) {
    const lat = 90 - (180 * i) / steps;
    const centre = projection([0, lat]);
    const edge = projection([180 - 1e-9, lat]);
    y[i] = centre ? centre[1] : NaN;
    halfWidth[i] = centre && edge ? Math.abs(edge[0] - centre[0]) : 0;
  }

  // Guard against non-monotonic samples at the poles so the walk below is safe.
  for (let i = 1; i <= steps; i += 1) {
    if (!(y[i] > y[i - 1])) y[i] = y[i - 1] + 1e-12;
  }

  return { y, halfWidth, steps };
}

export function getProjectionTable(id: ProjectionId): ProjectionTable {
  let table = tableCache.get(id);
  if (!table) {
    table = buildTable(id);
    tableCache.set(id, table);
  }
  return table;
}

/** An equirectangular source: an image, or a canvas holding a prepared one. */
export interface RasterSource {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface RasterOptions {
  projectionId: ProjectionId;
  /** Central meridian in degrees east. */
  lambda0: number;
  /** Projection scale in the target context's pixel units. */
  scale: number;
  /** Projection translate in the target context's pixel units. */
  translate: [number, number];
  width: number;
  height: number;
}

/** Smallest source slice height we will ask the browser to sample. */
const MIN_SLICE = 0.02;

/**
 * Paints an equirectangular image (lon −180…180, lat 90…−90) into `ctx` under
 * the given pseudocylindrical projection, one scanline at a time.
 */
export function drawReprojectedRaster(
  ctx: CanvasRenderingContext2D,
  image: RasterSource,
  options: RasterOptions,
): void {
  const { projectionId, lambda0, scale, translate, width, height } = options;
  const { source, width: srcWidth, height: srcHeight } = image;
  if (!srcWidth || !srcHeight || scale <= 0) return;

  const table = getProjectionTable(projectionId);
  const { y: tableY, halfWidth: tableHalfWidth, steps } = table;
  const [tx, ty] = translate;

  // Source column fraction that lands on the left edge of the map.
  const leftFraction = lambda0 / 360 - Math.floor(lambda0 / 360);

  // Latitude fraction (0 at the north pole, 1 at the south) for each row edge.
  const rowFraction = new Float64Array(height + 1);
  let index = 0;
  for (let row = 0; row <= height; row += 1) {
    const projected = (row - ty) / scale;
    if (projected < tableY[0] || projected > tableY[steps]) {
      rowFraction[row] = NaN;
      continue;
    }
    while (index < steps - 1 && tableY[index + 1] < projected) index += 1;
    while (index > 0 && tableY[index] > projected) index -= 1;
    const span = tableY[index + 1] - tableY[index];
    const t = span > 0 ? (projected - tableY[index]) / span : 0;
    rowFraction[row] = (index + t) / steps;
  }

  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  for (let row = 0; row < height; row += 1) {
    const top = rowFraction[row];
    const bottom = rowFraction[row + 1];
    if (Number.isNaN(top) || Number.isNaN(bottom)) continue;

    const sourceY = top * srcHeight;
    const sourceHeight = Math.max((bottom - top) * srcHeight, MIN_SLICE);

    // Half-width of this parallel, sampled at the middle of the row.
    const mid = ((top + bottom) / 2) * steps;
    const i = Math.min(steps - 1, Math.max(0, Math.floor(mid)));
    const frac = mid - i;
    const halfWidth =
      (tableHalfWidth[i] * (1 - frac) + tableHalfWidth[i + 1] * frac) * scale;
    if (halfWidth <= 0) continue;

    const left = tx - halfWidth;
    const total = halfWidth * 2;

    // Clip to the visible span so extreme zoom does not hand the compositor a
    // destination rectangle thousands of screens wide.
    const visibleLeft = Math.max(left, 0);
    const visibleRight = Math.min(left + total, width);
    if (visibleRight <= visibleLeft) continue;

    const startFraction = leftFraction + (visibleLeft - left) / total;
    const endFraction = leftFraction + (visibleRight - left) / total;

    let cursor = startFraction;
    while (cursor < endFraction - 1e-12) {
      const segmentEnd = Math.min(endFraction, Math.floor(cursor) + 1);
      const segmentLength = segmentEnd - cursor;
      if (segmentLength > 1e-12) {
        const wrapped = cursor - Math.floor(cursor);
        ctx.drawImage(
          source,
          wrapped * srcWidth,
          sourceY,
          segmentLength * srcWidth,
          sourceHeight,
          left + (cursor - leftFraction) * total,
          row,
          segmentLength * total,
          1,
        );
      }
      cursor = segmentEnd;
    }
  }

  ctx.imageSmoothingEnabled = smoothing;
}
