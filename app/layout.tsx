import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeController } from "@/components/theme-toggle";
import { themeInitScript } from "@/lib/theme";
import { Suspense } from "react";
import { AuthProvider } from "@/components/auth/auth-provider";
import { brandFaviconId, darkBrandIcon, lightBrandIcon } from "@/lib/brand-assets";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://sceenyk.vercel.app"),
  title: "Sceenyk — Create the scene you imagine",
  description:
    "Turn ideas, videos, and product images into finished content. One connected creative flow for scenes, stories, and everything you imagine.",
  applicationName: "Sceenyk",
  icons: { apple: { url: lightBrandIcon, type: "image/png" } },
  openGraph: {
    type: "website",
    siteName: "Sceenyk",
    title: "Sceenyk — Create the scene you imagine",
    description: "Turn ideas and media into video content in one creative flow.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sceenyk — Create the scene you imagine",
    description: "Turn ideas and media into video content in one creative flow.",
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
              className="sceenyk-container py-10 text-muted-foreground"
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
