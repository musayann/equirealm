import { geoArea, geoCentroid } from "d3-geo";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  MultiLineString,
  MultiPolygon,
  Polygon,
} from "geojson";
import { feature, mesh, neighbors } from "topojson-client";
import type { GeometryCollection, GeometryObject, Topology } from "topojson-specification";

export type Resolution = "110m" | "50m";

export interface CountryDatum {
  id: string;
  name: string;
  feature: Feature<Polygon | MultiPolygon, { name?: string }>;
  /** [lon, lat] of the spherical centroid, used as a label anchor. */
  centroid: [number, number];
  /** Spherical area in steradians; scale-independent proxy for on-screen size. */
  area: number;
  /** Index into the theme's country palette. */
  colorIndex: number;
}

export interface WorldData {
  resolution: Resolution;
  countries: CountryDatum[];
  land: Feature<Geometry>;
  borders: MultiLineString;
  coast: MultiLineString;
}

export interface ExtraData {
  rivers110m?: FeatureCollection;
  rivers50m?: FeatureCollection;
  lakes110m?: FeatureCollection;
  lakes50m?: FeatureCollection;
  geolines?: FeatureCollection;
  places?: FeatureCollection<Geometry, PlaceProps>;
}

export interface PlaceProps {
  name?: string;
  adm0cap?: number;
  pop_max?: number;
  adm0name?: string;
}

/**
 * Greedy graph colouring over the country adjacency list so that no two
 * bordering countries share a palette slot. Highest-degree countries are
 * coloured first, which keeps the colour count low in practice.
 */
export function colourCountries(adjacency: number[][], paletteSize: number): number[] {
  const colours = new Array<number>(adjacency.length).fill(-1);
  const order = adjacency
    .map((_, i) => i)
    .sort((a, b) => adjacency[b].length - adjacency[a].length);

  for (const i of order) {
    const taken = new Set<number>();
    for (const j of adjacency[i]) {
      if (colours[j] >= 0) taken.add(colours[j]);
    }
    let c = 0;
    while (taken.has(c)) c += 1;
    colours[i] = c;
  }
  return colours.map((c) => c % paletteSize);
}

export const PALETTE_SLOTS = 9;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return (await res.json()) as T;
}

const worldCache = new Map<Resolution, Promise<WorldData>>();

export function loadWorld(resolution: Resolution): Promise<WorldData> {
  const cached = worldCache.get(resolution);
  if (cached) return cached;

  const pending = (async () => {
    const topo = await fetchJson<Topology>(`/data/countries-${resolution}.json`);
    const countriesObject = topo.objects.countries as GeometryCollection<{ name?: string }>;
    const landObject = topo.objects.land as unknown as GeometryObject;

    const collection = feature(topo, countriesObject) as unknown as FeatureCollection<
      Polygon | MultiPolygon,
      { name?: string }
    >;
    const adjacency = neighbors(countriesObject.geometries);
    const colours = colourCountries(adjacency, PALETTE_SLOTS);

    const countries: CountryDatum[] = collection.features.map((f, i) => ({
      id: String(f.id ?? i),
      name: f.properties?.name ?? "",
      feature: f,
      centroid: geoCentroid(f) as [number, number],
      area: geoArea(f),
      colorIndex: colours[i],
    }));

    return {
      resolution,
      countries,
      land: feature(topo, landObject) as unknown as Feature<Geometry>,
      borders: mesh(topo, countriesObject, (a, b) => a !== b) as MultiLineString,
      coast: mesh(topo, landObject) as MultiLineString,
    } satisfies WorldData;
  })();

  worldCache.set(resolution, pending);
  return pending;
}

const extraCache = new Map<string, Promise<FeatureCollection>>();

function loadCollection(file: string): Promise<FeatureCollection> {
  const cached = extraCache.get(file);
  if (cached) return cached;
  const pending = fetchJson<FeatureCollection>(`/data/${file}`);
  extraCache.set(file, pending);
  return pending;
}

export function loadRivers(resolution: Resolution) {
  return loadCollection(`rivers-${resolution}.geojson`);
}

export function loadLakes(resolution: Resolution) {
  return loadCollection(`lakes-${resolution}.geojson`);
}

export function loadGeolines() {
  return loadCollection("geolines.geojson");
}

export function loadPlaces() {
  return loadCollection("places.geojson") as Promise<FeatureCollection<Geometry, PlaceProps>>;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image ${src}`));
    img.src = src;
  });
  imageCache.set(src, pending);
  return pending;
}
