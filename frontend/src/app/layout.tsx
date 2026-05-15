import type { Metadata } from "next";
import Link from "next/link";

import Galaxy from "@/components/Galaxy";
import "./globals.css";

export const metadata: Metadata = {
  title: "Targets",
  description: "Class-first follow-up target service.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <div className="fixed inset-0 -z-10">
          <Galaxy
            starSpeed={0.1}
            rotationSpeed={0}
            speed={0.1}
            mouseInteraction={false}
            twinkleIntensity={0.1}
            density={1.7}
            glowIntensity={0.2}
            repulsionStrength={1}
          />
        </div>
        <nav className="border-b border-white/15 bg-black/70 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-wide text-white">
              Targets
            </Link>
            <div className="flex items-center gap-6 text-sm text-white/85">
              <Link href="/" className="hover:text-white transition-colors">
                Find
              </Link>
              <Link href="/docs" className="hover:text-white transition-colors">
                Docs
              </Link>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
