import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "NEO Target Planner",
  description:
    "Find tonight's observable Near-Earth Objects for your telescope. Open-source tool for observatories and citizen scientists.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <nav className="border-b border-gray-800 bg-[var(--bg-secondary)]">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg">
              <span className="text-[var(--accent)]">NEO</span>
              <span>Target Planner</span>
            </Link>
            <div className="flex items-center gap-6 text-sm">
              <Link
                href="/"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Targets
              </Link>
              <Link
                href="/docs"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Docs
              </Link>
              <a
                href="https://github.com/JacksonHolland/neo-planner"
                target="_blank"
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
