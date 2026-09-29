import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "La Foulée Auvergnate — Calendrier des courses",
  description: "Découvre les courses de trail et sur route en Auvergne : dates, distances, départements et favoris.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
