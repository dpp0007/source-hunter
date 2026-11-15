import "./globals.css";
import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-serif" });

export const metadata: Metadata = { title: "Source Hunter", description: "Highlight a claim. Trace it back to where it began." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
