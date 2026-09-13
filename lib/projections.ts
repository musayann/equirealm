import { geoEqualEarth, geoNaturalEarth1, type GeoProjection } from "d3-geo";
import {
  geoBoggs,
  geoEckert4,
  geoMollweide,
  geoRobinson,
  geoSinusoidal,
} from "d3-geo-projection";

export type ProjectionId =
  | "equalEarth"
  | "mollweide"
  | "eckert4"
  | "sinusoidal"
  | "boggs"
  | "robinson"
  | "naturalEarth1";

export interface ProjectionSpec {
  id: ProjectionId;
  label: string;
  /** Short note shown in the UI. */
  note: string;
  /** True when the projection preserves relative area. */
  equalArea: boolean;
  factory: () => GeoProjection;
}

/**
 * Every projection here is pseudocylindrical: parallels are straight horizontal
 * lines and meridians are evenly spaced along each parallel. The raster
 * reprojection in `lib/raster.ts` relies on that property, so do not add a
 * projection (Winkel tripel, azimuthals, conics...) that breaks it.
 */
export const PROJECTIONS: ProjectionSpec[] = [
  {
    id: "equalEarth",
    label: "Equal Earth",
    note: "Šavrič, Patterson & Jenny, 2018",
    equalArea: true,
    factory: geoEqualEarth,
  },
  {
    id: "mollweide",
    label: "Mollweide",
    note: "Classic equal-area ellipse",
    equalArea: true,
    factory: geoMollweide,
  },
  {
    id: "eckert4",
    label: "Eckert IV",
    note: "Equal-area, flat poles",
    equalArea: true,
    factory: geoEckert4,
  },
  {
    id: "sinusoidal",
    label: "Sinusoidal",
    note: "Equal-area, strong shear",
    equalArea: true,
    factory: geoSinusoidal,
  },
  {
    id: "boggs",
    label: "Boggs eumorphic",
    note: "Equal-area, sinusoidal blend",
    equalArea: true,
    factory: geoBoggs,
  },
  {
    id: "robinson",
    label: "Robinson",
    note: "Compromise, not equal-area",
    equalArea: false,
    factory: geoRobinson,
  },
  {
    id: "naturalEarth1",
    label: "Natural Earth",
    note: "Compromise, not equal-area",
    equalArea: false,
    factory: geoNaturalEarth1,
  },
];

const byId = new Map(PROJECTIONS.map((p) => [p.id, p]));

export function getProjectionSpec(id: ProjectionId): ProjectionSpec {
  return byId.get(id) ?? PROJECTIONS[0];
}

/** A fresh projection instance rotated so `lambda0` is the central meridian. */
export function createProjection(id: ProjectionId, lambda0: number): GeoProjection {
  return getProjectionSpec(id).factory().rotate([-lambda0, 0, 0]);
}

export const CENTRAL_MERIDIANS = [
  { value: 0, label: "0° Greenwich" },
  { value: 11, label: "11° E — Equal Earth default" },
  { value: -30, label: "30° W — Atlantic" },
  { value: 150, label: "150° E — Pacific" },
  { value: 90, label: "90° E — Asia" },
];
