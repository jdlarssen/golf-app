import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PwaBoot } from "@/components/PwaBoot";
import { IosInstallHint } from "@/components/IosInstallHint";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tørny",
  description: "Turneringsapp for golf — for kompiser og klubber",
  applicationName: "Tørny",
  appleWebApp: {
    capable: true,
    title: "Tørny",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

// Next.js 16 requires themeColor / colorScheme / viewport in a separate
// `viewport` export — they are deprecated under `metadata`.
export const viewport: Viewport = {
  themeColor: "#16a34a",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="nb-NO"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <IosInstallHint />
        <PwaBoot />
      </body>
    </html>
  );
}
