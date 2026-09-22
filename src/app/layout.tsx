import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { PwaBoot } from "@/components/pwa/PwaBoot";
import { Toaster } from "@/components/Toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "MUI Team", template: "%s · MUI Team" },
  description: "Roles, responsibilities, tasks and deadlines for the Mic'd Up Initiative team.",
  applicationName: "MUI Team",
  appleWebApp: { capable: true, title: "MUI Team", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0D1F35",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
        <PwaBoot />
      </body>
    </html>
  );
}
