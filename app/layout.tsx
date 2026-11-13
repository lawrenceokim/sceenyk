import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeController } from "@/components/theme-toggle";
import { themeInitScript } from "@/lib/theme";
import { Suspense } from "react";
import { AuthProvider } from "@/components/auth/auth-provider";
import { brandFaviconId, darkBrandIcon, lightBrandIcon } from "@/lib/brand-assets";
import { applicationOrigin } from "@/lib/application-origin";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(applicationOrigin()),
  title: "Sceenyk — Create the scene you imagine",
  description:
    "Create short AI videos from scene ideas and image references. Discover reusable creator templates or publish your own on Sceenyk Marketplace.",
  applicationName: "Sceenyk",
  icons: { apple: { url: lightBrandIcon, type: "image/png" } },
  openGraph: {
    type: "website",
    siteName: "Sceenyk",
    title: "Sceenyk — Create the scene you imagine",
    description: "Create short AI videos, reuse creator templates, and explore Sceenyk Marketplace.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sceenyk — Create the scene you imagine",
    description: "Create short AI videos, reuse creator templates, and explore Sceenyk Marketplace.",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <head>
        <link id={brandFaviconId} rel="icon" type="image/png" href={darkBrandIcon} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeController />
        <Suspense
          fallback={
            <p
              role="status"
              className={`
      [@layer_components]:w-[100%] [@layer_components]:max-w-[var(--content-width)] [@layer_components]:ml-[auto]
      [@layer_components]:mr-[auto] [@layer_components]:pl-[var(--page-gutter)] [@layer_components]:pr-[var(--page-gutter)]
      sceenyk-container py-10 text-muted-foreground
    `}
            >
              Loading Sceenyk…
            </p>
          }
        >
          <AuthProvider>{children}</AuthProvider>
        </Suspense>
      </body>
    </html>
  );
}
