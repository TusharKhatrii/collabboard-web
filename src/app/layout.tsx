import type { Metadata } from "next";
import { Instrument_Serif, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-serif",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "CollabBoard",
  description: "A shared whiteboard for teams, in real time.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}