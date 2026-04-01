import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import SyncStatus from "@/components/SyncStatus";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Vogeltagebuch",
  description: "Vogelbeobachtungen erfassen und durchsuchen",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vogeltagebuch",
  },
};

export const viewport: Viewport = {
  themeColor: "#047857",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="bg-stone-50 text-stone-900 min-h-screen">
        <Navigation />
        <SyncStatus />
        <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
