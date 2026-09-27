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

const description =
  "A real-time voice agent you can talk to or phone, with every stage of every turn measured.";

export const metadata: Metadata = {
  // Absolute URLs for the preview image, so LinkedIn and other link unfurlers can fetch it.
  metadataBase: new URL("https://sonar-voice-agent.vercel.app"),
  title: "Sonar",
  description,
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Sonar",
    title: "Sonar: it picks up the phone",
    description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Sonar's live call page with its latency panel" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sonar: it picks up the phone",
    description,
    images: ["/og.png"],
  },
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
