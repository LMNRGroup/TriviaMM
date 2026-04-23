import type { Metadata } from "next";
import { Oxanium, Space_Grotesk } from "next/font/google";
import "./globals.css";

const displayFont = Oxanium({
  subsets: ["latin"],
  variable: "--font-display",
});

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Trivia Battle",
  description: "Arena competitiva de trivia con pantalla principal y control móvil.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${displayFont.variable} ${bodyFont.variable}`} lang="es">
      <body>{children}</body>
    </html>
  );
}
