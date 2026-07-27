import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import SyncStatus from "@/components/SyncStatus";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import EasterEgg from "@/components/EasterEgg";
import SchnellZugabeFab from "@/components/SchnellZugabeFab";

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
        {/* pb-28 auf Mobil: Platz fuer den Schnellzugabe-FAB, damit er keine
            Bedienelemente am Listenende verdeckt. */}
        <main className="max-w-4xl mx-auto px-4 pt-6 pb-28 sm:pb-6">
          {children}
        </main>
        <EasterEgg />
        <SchnellZugabeFab />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
