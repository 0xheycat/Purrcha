import type { Metadata } from "next";
import { JetBrains_Mono, Barlow, Archivo_Black } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "./providers";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const barlow = Barlow({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const archivoBlack = Archivo_Black({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const publicUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://0xheycat.xyz/work/purrcha";

export const metadata: Metadata = {
  metadataBase: new URL(publicUrl),
  alternates: { canonical: publicUrl },
  title: "Purrcha — Private Multi-modal ChatGPT On-Chain | Ritual Chain",
  description:
    "Purrcha is a private multi-modal ChatGPT running on Ritual Chain (1979). TEE-secured LLM + Image precompiles, ECIES-encrypted conversation history, on-chain verifiable receipts.",
  applicationName: "Purrcha",
  authors: [{ name: "0xheycat", url: "https://github.com/0xheycat" }],
  creator: "0xheycat",
  publisher: "0xheycat",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Purrcha — Private Multi-modal ChatGPT On-Chain",
    description: "TEE-secured LLM + Image precompiles on Ritual Chain 1979.",
    type: "website",
    url: publicUrl,
    siteName: "Purrcha",
  },
  twitter: {
    card: "summary_large_image",
    title: "Purrcha — Private Multi-modal ChatGPT On-Chain",
    description: "TEE-secured LLM + Image precompiles on Ritual Chain 1979.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${jetbrainsMono.variable} ${barlow.variable} ${archivoBlack.variable} antialiased bg-bg text-gray-400`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
