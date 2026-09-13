import EqualEarthMap from "@/components/EqualEarthMap";
import { siteConfig } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: siteConfig.name,
  url: siteConfig.url,
  description: siteConfig.description,
  applicationCategory: "ReferenceApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript",
  isAccessibleForFree: true,
  inLanguage: "en-GB",
  offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
  author: { "@type": "Person", name: siteConfig.author.name, url: siteConfig.author.url },
  sameAs: [siteConfig.repo],
};

export default function Home() {
  return (
    <main className="relative h-dvh w-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* The map is a canvas, so describe it for screen readers and crawlers. */}
      <div className="sr-only">
        <h1>Equirealm: interactive Equal Earth world map</h1>
        <p>
          Explore the world on the equal-area Equal Earth projection. Choose a political, shaded
          relief, satellite, night lights or minimal base map; overlay country borders, coastlines,
          hillshade, rivers, lakes, graticules, tropics and polar circles, cities and country
          labels; and switch between the Equal Earth, Mollweide, Eckert IV, Sinusoidal, Boggs,
          Robinson and Natural Earth projections. Scroll or pinch to zoom and drag to pan.
        </p>
      </div>

      <EqualEarthMap />

      <noscript>
        <p className="absolute inset-x-0 bottom-8 z-30 text-center text-sm text-slate-700">
          Equirealm needs JavaScript to draw the map.
        </p>
      </noscript>
    </main>
  );
}
