"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { select } from "d3-selection";
import "d3-transition";
import {
  zoom as createZoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3-zoom";
import ControlPanel from "@/components/ControlPanel";
import {
  loadGeolines,
  loadImage,
  loadLakes,
  loadPlaces,
  loadRivers,
  loadWorld,
  type ExtraData,
  type WorldData,
} from "@/lib/data";
import { getProjectionSpec, type ProjectionId } from "@/lib/projections";
import { buildProjection, computeBaseView, renderMap, type RenderState } from "@/lib/render";
import {
  DEFAULT_LAYERS,
  getBaseStyle,
  type BaseStyleId,
  type LayerId,
  type TextureId,
} from "@/lib/styles";

const MAX_ZOOM = 96;
/** Above this zoom the 50 m datasets are worth their download and draw cost. */
const DETAIL_ZOOM = 2.5;

type Snapshot = Omit<RenderState, "base" | "transform">;

export default function EqualEarthMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);

  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);
  const frameRef = useRef(0);
  const zoomLabelAt = useRef(0);

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [dpr, setDpr] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panelOverride, setPanelOverride] = useState<boolean | null>(null);

  const [styleId, setStyleId] = useState<BaseStyleId>("political");
  const [projectionId, setProjectionId] = useState<ProjectionId>("equalEarth");
  const [lambda0, setLambda0] = useState(11);
  const [layers, setLayers] = useState<Record<LayerId, boolean>>(DEFAULT_LAYERS);

  const [world110, setWorld110] = useState<WorldData | null>(null);
  const [world50, setWorld50] = useState<WorldData | null>(null);
  const [extras, setExtras] = useState<ExtraData>({});
  const [textures, setTextures] = useState<Partial<Record<TextureId, HTMLImageElement>>>({});

  const detailed = zoomLevel >= DETAIL_ZOOM;
  const world = detailed && world50 ? world50 : world110;
  const chrome = getBaseStyle(styleId).chrome;

  // ---- Rendering loop -------------------------------------------------------

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const snapshot = snapshotRef.current;
    if (!canvas || !snapshot || snapshot.width <= 0 || snapshot.height <= 0) return;

    renderMap(canvas, {
      ...snapshot,
      base: computeBaseView(
        snapshot.projectionId,
        snapshot.lambda0,
        snapshot.width,
        snapshot.height,
      ),
      transform: transformRef.current,
    });
  }, []);

  const scheduleRender = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  }, [draw]);

  // Keep the snapshot in step with React state, then repaint. No dependency
  // array: every committed render should reach the canvas.
  useEffect(() => {
    snapshotRef.current = {
      width: size.width,
      height: size.height,
      dpr,
      projectionId,
      lambda0,
      styleId,
      layers,
      world,
      extras,
      textures,
    };
    scheduleRender();
  });

  useEffect(
    () => () => {
      // Clearing the id matters as much as cancelling: Strict Mode unmounts and
      // remounts, and a stale id would make scheduleRender() early-return forever.
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    },
    [],
  );

  // Open by default, but collapsed on a phone where it would cover the map.
  // Derived rather than stored so the server and the first client render agree.
  const panelOpen = panelOverride ?? (size.width === 0 || size.width >= 640);

  // ---- Sizing ---------------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const rect = container.getBoundingClientRect();
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
      setDpr(Math.min(window.devicePixelRatio || 1, 2));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // ---- Pan & zoom -----------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const behavior = createZoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .on("zoom", (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        transformRef.current = event.transform;
        scheduleRender();

        // The readout and the detail threshold only need a coarse update rate.
        const now = performance.now();
        if (now - zoomLabelAt.current > 120) {
          zoomLabelAt.current = now;
          setZoomLevel(event.transform.k);
        }
      })
      .on("end", (event: D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        setZoomLevel(event.transform.k);
      });

    zoomRef.current = behavior;
    select(canvas).call(behavior);
    return () => {
      select(canvas).on(".zoom", null);
      zoomRef.current = null;
    };
  }, [scheduleRender]);

  // Re-clamp panning whenever the viewport changes shape.
  useEffect(() => {
    const canvas = canvasRef.current;
    const behavior = zoomRef.current;
    if (!canvas || !behavior || size.width <= 0 || size.height <= 0) return;

    const extent: [[number, number], [number, number]] = [
      [0, 0],
      [size.width, size.height],
    ];
    behavior.extent(extent).translateExtent(extent);
    select(canvas).call(behavior.transform, transformRef.current);
  }, [size]);

  const zoomBy = useCallback((factor: number) => {
    const canvas = canvasRef.current;
    const behavior = zoomRef.current;
    if (!canvas || !behavior) return;
    select(canvas).transition().duration(220).call(behavior.scaleBy, factor);
  }, []);

  const resetView = useCallback(() => {
    const canvas = canvasRef.current;
    const behavior = zoomRef.current;
    if (!canvas || !behavior) return;
    select(canvas).transition().duration(420).call(behavior.transform, zoomIdentity);
  }, []);

  // ---- Data -----------------------------------------------------------------

  useEffect(() => {
    let alive = true;
    loadWorld("110m")
      .then((data) => alive && setWorld110(data))
      .catch(console.error);
    Promise.all([loadLakes("110m"), loadRivers("110m")])
      .then(([lakes110m, rivers110m]) => alive && setExtras((prev) => ({ ...prev, lakes110m, rivers110m })))
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!detailed) return;
    let alive = true;
    loadWorld("50m")
      .then((data) => alive && setWorld50(data))
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, [detailed]);

  useEffect(() => {
    if (!detailed) return;
    let alive = true;
    if (layers.lakes) {
      loadLakes("50m")
        .then((lakes50m) => alive && setExtras((prev) => ({ ...prev, lakes50m })))
        .catch(console.error);
    }
    if (layers.rivers) {
      loadRivers("50m")
        .then((rivers50m) => alive && setExtras((prev) => ({ ...prev, rivers50m })))
        .catch(console.error);
    }
    return () => {
      alive = false;
    };
  }, [detailed, layers.lakes, layers.rivers]);

  useEffect(() => {
    let alive = true;
    if (layers.geolines) {
      loadGeolines()
        .then((geolines) => alive && setExtras((prev) => ({ ...prev, geolines })))
        .catch(console.error);
    }
    if (layers.cities) {
      loadPlaces()
        .then((places) => alive && setExtras((prev) => ({ ...prev, places })))
        .catch(console.error);
    }
    return () => {
      alive = false;
    };
  }, [layers.geolines, layers.cities]);

  useEffect(() => {
    const needed = new Set<TextureId>();
    const base = getBaseStyle(styleId).theme.texture;
    if (base) needed.add(base);
    if (layers.hillshade) needed.add("hillshade");

    let alive = true;
    for (const id of needed) {
      if (textures[id]) continue;
      loadImage(`/textures/${id}.jpg`)
        .then((image) => alive && setTextures((prev) => ({ ...prev, [id]: image })))
        .catch(console.error);
    }
    return () => {
      alive = false;
    };
  }, [styleId, layers.hillshade, textures]);

  // ---- Cursor readout -------------------------------------------------------

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const readout = readoutRef.current;
    const snapshot = snapshotRef.current;
    const canvas = canvasRef.current;
    if (!readout || !snapshot || !canvas || snapshot.width <= 0) return;

    const rect = canvas.getBoundingClientRect();
    const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
    const projection = buildProjection({
      projectionId: snapshot.projectionId,
      lambda0: snapshot.lambda0,
      base: computeBaseView(
        snapshot.projectionId,
        snapshot.lambda0,
        snapshot.width,
        snapshot.height,
      ),
      transform: transformRef.current,
    });

    const inverted = projection.invert?.(point);
    if (!inverted || Number.isNaN(inverted[0]) || Number.isNaN(inverted[1])) {
      readout.textContent = "—";
      return;
    }

    // invert() happily returns points beyond the map outline; round-trip to
    // confirm the cursor is actually over the globe.
    const roundTrip = projection(inverted);
    if (
      !roundTrip ||
      Math.hypot(roundTrip[0] - point[0], roundTrip[1] - point[1]) > 0.6 ||
      Math.abs(inverted[1]) > 90.0001
    ) {
      readout.textContent = "—";
      return;
    }

    readout.textContent = formatLatLon(inverted[1], inverted[0]);
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (readoutRef.current) readoutRef.current.textContent = "—";
  }, []);

  // ---- UI -------------------------------------------------------------------

  const toggleLayer = useCallback((id: LayerId) => {
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const togglePanel = useCallback(() => setPanelOverride(!panelOpen), [panelOpen]);

  const dark = chrome === "dark";
  const hud = dark
    ? "bg-slate-950/75 text-slate-200 ring-white/10"
    : "bg-white/80 text-slate-700 ring-slate-900/10";

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ background: getBaseStyle(styleId).theme.backdrop }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`World map: ${getBaseStyle(styleId).label} base map, ${getProjectionSpec(projectionId).label} projection`}
        className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
        style={{ width: size.width, height: size.height }}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      />

      <ControlPanel
        chrome={chrome}
        open={panelOpen}
        onToggle={togglePanel}
        styleId={styleId}
        onStyleChange={setStyleId}
        layers={layers}
        onLayerToggle={toggleLayer}
        projectionId={projectionId}
        onProjectionChange={setProjectionId}
        lambda0={lambda0}
        onLambda0Change={setLambda0}
        loading={!world110}
      />

      <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
        <div
          className={`pointer-events-auto flex flex-col overflow-hidden rounded-xl shadow-lg ring-1 backdrop-blur-md ${hud}`}
        >
          <button
            type="button"
            onClick={() => zoomBy(1.7)}
            className={`h-9 w-9 text-lg leading-none ${dark ? "hover:bg-white/10" : "hover:bg-slate-900/10"}`}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1 / 1.7)}
            className={`h-9 w-9 border-t text-lg leading-none ${
              dark ? "border-white/10 hover:bg-white/10" : "border-slate-900/10 hover:bg-slate-900/10"
            }`}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            onClick={resetView}
            className={`h-9 w-9 border-t text-[11px] leading-none ${
              dark ? "border-white/10 hover:bg-white/10" : "border-slate-900/10 hover:bg-slate-900/10"
            }`}
            aria-label="Reset view"
            title="Reset view"
          >
            ⤢
          </button>
        </div>

        <div
          className={`pointer-events-none rounded-lg px-2.5 py-1 font-mono text-[11px] tabular-nums shadow-lg ring-1 backdrop-blur-md ${hud}`}
        >
          <span ref={readoutRef}>—</span>
          <span className="opacity-50"> · </span>
          <span>{zoomLevel.toFixed(1)}×</span>
        </div>
      </div>

      {!world110 && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
          <div className={`rounded-xl px-4 py-2 text-sm shadow-lg ring-1 backdrop-blur-md ${hud}`}>
            Loading world data…
          </div>
        </div>
      )}
    </div>
  );
}

function formatLatLon(lat: number, lon: number): string {
  const normalisedLon = ((lon + 180) % 360 + 360) % 360 - 180;
  const latText = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
  const lonText = `${Math.abs(normalisedLon).toFixed(2)}°${normalisedLon >= 0 ? "E" : "W"}`;
  return `${latText} ${lonText}`;
}
