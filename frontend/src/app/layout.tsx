import type { Metadata } from "next";
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
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
