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

const DESCRIPTION =
  "A real-time voice agent you can talk to in the browser or on a phone call, with every stage of every turn measured, including the ones that miss.";

export const metadata: Metadata = {
  metadataBase: new URL("https://sonar-voice-agent.vercel.app"),
  title: "Sonar · a real-time voice agent, measured",
  description: DESCRIPTION,
  openGraph: {
    title: "Sonar · a real-time voice agent, measured",
    description: DESCRIPTION,
    url: "/",
    siteName: "Sonar",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Sonar", description: DESCRIPTION },
};

export const viewport = { themeColor: "#1b1d18" };

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
