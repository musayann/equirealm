/** Site-wide identity used by metadata, the sitemap, robots.txt, the manifest and JSON-LD. */
export const siteConfig = {
  name: "Equirealm",
  title: "Equirealm — interactive Equal Earth world map",
  description:
    "Explore a full-screen, zoomable Equal Earth world map with political, relief, satellite and night-light layers, rivers, cities and seven map projections.",
  tagline: "Interactive world map on the Equal Earth projection",
  /** Override with NEXT_PUBLIC_SITE_URL when deploying anywhere else. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://map.aros.app").replace(/\/+$/, ""),
  repo: "https://github.com/musayann/equirealm",
  author: { name: "Yannick Musafiri", url: "https://github.com/musayann" },
  themeColor: "#0b1622",
  keywords: [
    "Equal Earth projection",
    "equal-area world map",
    "interactive world map",
    "zoomable world map",
    "political map",
    "shaded relief map",
    "satellite world map",
    "night lights map",
    "Mollweide projection",
    "Robinson projection",
    "map projections",
    "Natural Earth",
    "d3-geo",
  ],
};
