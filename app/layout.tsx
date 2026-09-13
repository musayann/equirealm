import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Equal Earth",
  description:
    "A full-screen, zoomable Equal Earth world map with political, relief, satellite and night-light layers.",
};

export const viewport: Viewport = {
  themeColor: "#0b1622",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full overflow-hidden overscroll-none bg-slate-950">{children}</body>
    </html>
  );
}
