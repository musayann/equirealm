import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { geoEqualEarth, geoGraticule, geoPath } from "d3-geo";
import { feature, mesh, neighbors } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { ImageResponse } from "next/og";
import { colourCountries, PALETTE_SLOTS } from "@/lib/data";
import { siteConfig } from "@/lib/site";
import { getBaseStyle } from "@/lib/styles";

export const alt = "Equirealm: a political world map on the Equal Earth projection";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MAP_WIDTH = 1080;
// Header (~160px) + gap + map must fit inside 630px with the bottom padding.
const MAP_HEIGHT = 390;

/** Draws the political base map the app opens with, as an SVG string. */
async function worldSvg(): Promise<string> {
  const topo = JSON.parse(
    await readFile(join(process.cwd(), "public/data/countries-110m.json"), "utf8"),
  ) as Topology;
  const countriesObject = topo.objects.countries as GeometryCollection;
  const countries = feature(topo, countriesObject);
  const colours = colourCountries(neighbors(countriesObject.geometries), PALETTE_SLOTS);

  const { theme } = getBaseStyle("political");
  const fills = theme.countryFills ?? [theme.land];

  const projection = geoEqualEarth()
    .rotate([-11, 0])
    .fitSize([MAP_WIDTH, MAP_HEIGHT], { type: "Sphere" })
    // Fine resampling keeps the outline's curved sides smooth at this size.
    .precision(0.1);
  const path = geoPath(projection);
  const sphere = path({ type: "Sphere" }) ?? "";

  const countryPaths = countries.features
    .map((f, i) => `<path d="${path(f) ?? ""}" fill="${fills[colours[i] % fills.length]}"/>`)
    .join("");
  const borders = path(mesh(topo, countriesObject, (a, b) => a !== b)) ?? "";
  const graticule = path(geoGraticule().step([30, 30])()) ?? "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}">
  <path d="${sphere}" fill="${theme.ocean}"/>
  <path d="${graticule}" fill="none" stroke="${theme.graticule}" stroke-opacity="0.5" stroke-width="1"/>
  ${countryPaths}
  <path d="${borders}" fill="none" stroke="${theme.border}" stroke-width="1"/>
  <path d="${sphere}" fill="none" stroke="${theme.outline}" stroke-width="1.5"/>
</svg>`;
}

export default async function Image() {
  const svg = await worldSvg();
  const { theme } = getBaseStyle("political");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "48px 60px 40px",
          background: theme.backdrop,
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 64, letterSpacing: -2, lineHeight: 1, color: "#1e2a36" }}>
              {siteConfig.name}
            </div>
            <div style={{ marginTop: 12, fontSize: 28, color: "#5b6b7a" }}>
              {siteConfig.tagline}
            </div>
          </div>
          <div style={{ fontSize: 22, color: theme.outline }}>{new URL(siteConfig.url).host}</div>
        </div>
        <img
          alt=""
          src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
          width={MAP_WIDTH}
          height={MAP_HEIGHT}
          style={{ marginTop: 28 }}
        />
      </div>
    ),
    size,
  );
}
