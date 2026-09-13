export type BaseStyleId = "political" | "relief" | "satellite" | "night" | "minimal";
export type TextureId = "relief" | "satellite" | "night" | "hillshade";

export interface Theme {
  /** Fill painted inside the map outline before anything else. */
  ocean: string;
  /** Land fill for styles that draw vector land instead of a raster. */
  land: string;
  /** Per-country fills, cycled through a greedy graph colouring. */
  countryFills?: string[];
  border: string;
  borderWidth: number;
  coast: string;
  coastWidth: number;
  graticule: string;
  geoline: string;
  river: string;
  lake: string;
  lakeStroke: string;
  city: string;
  cityStroke: string;
  label: string;
  labelHalo: string;
  outline: string;
  /** Page background outside the map outline. */
  backdrop: string;
  /** Raster painted inside the map outline, if any. */
  texture?: TextureId;
}

const POLITICAL_FILLS = [
  "#e9c9a3",
  "#b8cfa7",
  "#f0c4b3",
  "#a9c5da",
  "#d8c2de",
  "#d0d8a2",
  "#f3dba7",
  "#b2d5cd",
  "#e2b9a9",
];

export interface BaseStyleSpec {
  id: BaseStyleId;
  label: string;
  blurb: string;
  theme: Theme;
  /** UI chrome tint that reads well over this map. */
  chrome: "dark" | "light";
}

export const BASE_STYLES: BaseStyleSpec[] = [
  {
    id: "political",
    label: "Political",
    blurb: "Countries coloured so no two neighbours match",
    chrome: "light",
    theme: {
      backdrop: "#eef3f7",
      ocean: "#c3dbeb",
      land: "#e6dcc8",
      countryFills: POLITICAL_FILLS,
      border: "#ffffff",
      borderWidth: 1,
      coast: "#6d8496",
      coastWidth: 0.7,
      graticule: "#8fb0c6",
      geoline: "#8a7f6a",
      river: "#7fb0d4",
      lake: "#bcd9ec",
      lakeStroke: "#7fa8c4",
      city: "#33404d",
      cityStroke: "#ffffff",
      label: "#3b4653",
      labelHalo: "rgba(255,255,255,0.85)",
      outline: "#7d94a6",
    },
  },
  {
    id: "relief",
    label: "Relief",
    blurb: "Natural Earth hypsometric tints with shaded relief",
    chrome: "light",
    theme: {
      backdrop: "#eef3f7",
      ocean: "#b8d3e6",
      land: "#dcd3bd",
      texture: "relief",
      border: "rgba(60,54,44,0.55)",
      borderWidth: 0.8,
      coast: "rgba(45,60,72,0.6)",
      coastWidth: 0.6,
      graticule: "rgba(70,80,90,0.28)",
      geoline: "rgba(90,70,40,0.55)",
      river: "rgba(60,120,170,0.85)",
      lake: "#a9cbe3",
      lakeStroke: "rgba(60,100,130,0.6)",
      city: "#2c3540",
      cityStroke: "rgba(255,255,255,0.9)",
      label: "#33302a",
      labelHalo: "rgba(255,255,255,0.8)",
      outline: "#8fa0ad",
    },
  },
  {
    id: "satellite",
    label: "Satellite",
    blurb: "NASA Blue Marble composite",
    chrome: "dark",
    theme: {
      backdrop: "#0a0f16",
      ocean: "#0d2138",
      land: "#2e3d2a",
      texture: "satellite",
      border: "rgba(255,255,255,0.42)",
      borderWidth: 0.8,
      coast: "rgba(255,255,255,0.25)",
      coastWidth: 0.5,
      graticule: "rgba(255,255,255,0.16)",
      geoline: "rgba(255,220,150,0.4)",
      river: "rgba(120,190,235,0.7)",
      lake: "#123048",
      lakeStroke: "rgba(140,190,220,0.4)",
      city: "#ffd88a",
      cityStroke: "rgba(0,0,0,0.6)",
      label: "#f2f5f8",
      labelHalo: "rgba(0,0,0,0.7)",
      outline: "rgba(255,255,255,0.35)",
    },
  },
  {
    id: "night",
    label: "Night lights",
    blurb: "City lights from orbit",
    chrome: "dark",
    theme: {
      backdrop: "#05070c",
      ocean: "#04070d",
      land: "#12161f",
      texture: "night",
      border: "rgba(120,170,210,0.35)",
      borderWidth: 0.7,
      coast: "rgba(120,170,210,0.28)",
      coastWidth: 0.5,
      graticule: "rgba(140,180,220,0.12)",
      geoline: "rgba(200,180,120,0.3)",
      river: "rgba(90,140,190,0.4)",
      lake: "#060a12",
      lakeStroke: "rgba(110,150,190,0.3)",
      city: "#ffe6a8",
      cityStroke: "rgba(0,0,0,0.7)",
      label: "#cfe0f0",
      labelHalo: "rgba(0,0,0,0.8)",
      outline: "rgba(130,170,210,0.3)",
    },
  },
  {
    id: "minimal",
    label: "Minimal",
    blurb: "Quiet dark base for overlays",
    chrome: "dark",
    theme: {
      backdrop: "#080c12",
      ocean: "#0b1622",
      land: "#22303f",
      border: "rgba(150,180,205,0.35)",
      borderWidth: 0.8,
      coast: "rgba(150,180,205,0.5)",
      coastWidth: 0.6,
      graticule: "rgba(140,175,205,0.14)",
      geoline: "rgba(200,180,120,0.28)",
      river: "rgba(90,150,200,0.6)",
      lake: "#0b1622",
      lakeStroke: "rgba(120,160,195,0.45)",
      city: "#8fd0ff",
      cityStroke: "rgba(0,0,0,0.65)",
      label: "#c8d6e4",
      labelHalo: "rgba(8,12,18,0.85)",
      outline: "rgba(150,180,205,0.4)",
    },
  },
];

const styleById = new Map(BASE_STYLES.map((s) => [s.id, s]));

export function getBaseStyle(id: BaseStyleId): BaseStyleSpec {
  return styleById.get(id) ?? BASE_STYLES[0];
}

export type LayerId =
  | "graticule"
  | "borders"
  | "coastline"
  | "rivers"
  | "lakes"
  | "cities"
  | "labels"
  | "geolines"
  | "hillshade";

export interface LayerSpec {
  id: LayerId;
  label: string;
  hint: string;
}

export const LAYERS: LayerSpec[] = [
  { id: "borders", label: "Country borders", hint: "Admin-0 boundaries" },
  { id: "coastline", label: "Coastline", hint: "Land–ocean edge" },
  { id: "hillshade", label: "Hillshade", hint: "Shaded relief, multiplied over the base" },
  { id: "rivers", label: "Rivers", hint: "Natural Earth river centrelines" },
  { id: "lakes", label: "Lakes", hint: "Major inland water bodies" },
  { id: "graticule", label: "Graticule", hint: "Meridians and parallels" },
  { id: "geolines", label: "Tropics & circles", hint: "Equator, tropics, polar circles" },
  { id: "cities", label: "Cities", hint: "Capitals and cities over 1M" },
  { id: "labels", label: "Country labels", hint: "Names, placed by available room" },
];

export const DEFAULT_LAYERS: Record<LayerId, boolean> = {
  borders: true,
  coastline: true,
  hillshade: false,
  rivers: false,
  lakes: true,
  graticule: true,
  geolines: false,
  cities: false,
  labels: true,
};
