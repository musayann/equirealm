// Regenerates every app icon from Natural Earth land (world-atlas):
//   node scripts/make-icons.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const { geoEqualEarth, geoPath, geoGraticule } = require("d3-geo");
const { feature } = require("topojson-client");
const sharp = require("sharp");

const land = feature(
  JSON.parse(readFileSync(require.resolve("world-atlas/land-110m.json"), "utf8")),
  "land",
);

// Everything is laid out on a 512 canvas; the map sits inside a rounded tile.
const S = 512;

/**
 * detail: graticule and fine coastlines for large sizes; tiny sizes get bolder
 * land and no grid, which would otherwise blur into a grey wash at 16px.
 * pad: inset of the map from the tile edge. rx: tile corner radius.
 */
function svg({ detail, pad, rx }) {
  const extent = [
    [pad, pad],
    [S - pad, S - pad],
  ];
  const path = geoPath(geoEqualEarth().fitExtent(extent, { type: "Sphere" })).digits(0);
  // Drop islands too small to see; keeps the SVG light.
  const minArea = detail ? 12 : 120;
  const trimmed = {
    type: "MultiPolygon",
    coordinates: land.features
      .flatMap((f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates))
      .filter((rings) => path.area({ type: "Polygon", coordinates: rings }) >= minArea),
  };
  // Resample the outline finely so its curved sides don't look faceted.
  const sphere = geoPath(
    geoEqualEarth().fitExtent(extent, { type: "Sphere" }).precision(0.05),
  ).digits(1)({ type: "Sphere" });
  const grat = detail
    ? `<path d="${path(geoGraticule().step([30, 30])())}" fill="none" stroke="#7fb8e0" stroke-opacity=".28" stroke-width="3"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="o" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f86c4"/>
      <stop offset="1" stop-color="#155a8e"/>
    </linearGradient>
    <clipPath id="c"><path d="${sphere}"/></clipPath>
  </defs>
  <rect width="${S}" height="${S}" rx="${rx}" fill="#0b1622"/>
  <path d="${sphere}" fill="url(#o)"/>
  <g clip-path="url(#c)">
    ${grat}
    <path d="${path(trimmed)}" fill="#e9c9a3" ${detail ? 'stroke="#e9c9a3" stroke-width="2"' : 'stroke="#e9c9a3" stroke-width="7" stroke-linejoin="round"'}/>
  </g>
  <path d="${sphere}" fill="none" stroke="#cfe6f5" stroke-opacity=".9" stroke-width="${detail ? 6 : 12}"/>
</svg>`;
}

const large = svg({ detail: true, pad: 34, rx: 112 });
const small = svg({ detail: false, pad: 6, rx: 112 });
// Maskable icons get cropped to a circle: full-bleed tile, map inside the 80% safe zone.
const maskable = svg({ detail: true, pad: 66, rx: 0 });

const png = (source, n) =>
  sharp(Buffer.from(source), { density: 300 }).resize(n, n).png().toBuffer();

writeFileSync(join(ROOT, "app/icon.svg"), large);
writeFileSync(join(ROOT, "app/apple-icon.png"), await png(large, 180));
writeFileSync(join(ROOT, "public/icon-192.png"), await png(large, 192));
writeFileSync(join(ROOT, "public/icon-512.png"), await png(large, 512));
writeFileSync(join(ROOT, "public/icon-maskable-512.png"), await png(maskable, 512));

// favicon.ico with PNG-encoded entries.
const sizes = [16, 32, 48];
const entries = await Promise.all(sizes.map((n) => png(n >= 48 ? large : small, n)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((n, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(n, e);
  header.writeUInt8(n, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(entries[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += entries[i].length;
});
writeFileSync(join(ROOT, "app/favicon.ico"), Buffer.concat([header, ...entries]));

console.log("Icons written to app/ and public/");
