import type { Viewport } from "next";
import { Geist_Mono, Montserrat, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ClearLegacyServiceWorker } from "./_components/ClearLegacyServiceWorker";
import { NavigationProgressProvider } from "./_components/NavigationProgressProvider";
import { SiteOrganizationJsonLd } from "./_components/SiteOrganizationJsonLd";
import { buildRootSiteMetadata } from "@/lib/site-metadata";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = buildRootSiteMetadata();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ff5c26",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt"
      className={`${playfair.variable} ${montserrat.variable} ${geistMono.variable} min-h-dvh antialiased`}
    >
      <head>
        <SiteOrganizationJsonLd />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Vyria" />
      </head>
      <body className="flex min-h-dvh flex-col font-sans">
        <ClearLegacyServiceWorker />
        <NavigationProgressProvider>{children}</NavigationProgressProvider>
      </body>
    </html>
  );
}
