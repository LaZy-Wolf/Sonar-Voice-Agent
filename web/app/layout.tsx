import type { Metadata } from "next";
import { Archivo, Archivo_Narrow, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Signage grotesk: a panel legend is signage, which is what this face was drawn for.
const archivo = Archivo({ variable: "--font-body", subsets: ["latin"] });

const archivoNarrow = Archivo_Narrow({
  variable: "--font-legend",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

// Every latency figure is read column to column and must not shimmy as it updates.
const jetbrains = JetBrains_Mono({
  variable: "--font-figure",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Sonar",
  description:
    "A real-time voice agent you can talk to or phone, with every stage of every turn measured.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${archivoNarrow.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full font-[family-name:var(--font-body)]">{children}</body>
    </html>
  );
}
