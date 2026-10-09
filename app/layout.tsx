import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeController } from "@/components/theme-toggle";
import { themeInitScript } from "@/lib/theme";
import { Suspense } from "react";
import { AuthProvider } from "@/components/auth/auth-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sceenyk — Create the scene you imagine",
  description:
    "Turn ideas, videos, and product images into finished content. One connected creative flow for scenes, stories, and everything you imagine.",
  icons: { icon: "/brand-mark.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
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
