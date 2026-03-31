import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Vogeltagebuch",
  description: "Vogelbeobachtungen erfassen und durchsuchen",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="bg-stone-50 text-stone-900 min-h-screen">
        <nav className="bg-white border-b border-stone-200 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-6">
            <Link href="/" className="text-xl font-bold text-emerald-700">
              🐦 Vogeltagebuch
            </Link>
            <div className="flex gap-4 text-sm">
              <Link
                href="/"
                className="text-stone-600 hover:text-emerald-700 transition-colors"
              >
                Neue Beobachtung
              </Link>
              <Link
                href="/beobachtungen"
                className="text-stone-600 hover:text-emerald-700 transition-colors"
              >
                Beobachtungen
              </Link>
              <Link
                href="/vogelarten"
                className="text-stone-600 hover:text-emerald-700 transition-colors"
              >
                Vogelarten
              </Link>
            </div>
          </div>
        </nav>
        <main className="max-w-4xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
