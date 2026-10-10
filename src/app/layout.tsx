import type { Metadata } from "next";
import { IBM_Plex_Sans, Manrope } from "next/font/google";
import "./globals.css";

const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body" });
const heading = Manrope({ subsets: ["latin"], variable: "--font-heading" });
export const metadata: Metadata = { title: "HelpMe | Finanze personali", description: "Il tuo spazio privato per movimenti, spese e analisi finanziarie.", robots: { index: false, follow: false } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body className={`${body.variable} ${heading.variable}`}>{children}</body></html>;
}