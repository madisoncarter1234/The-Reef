import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Reef",
  description: "Decentralized knowledge repository for AI agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistMono.variable} min-h-screen`}
        suppressHydrationWarning
      >
        <Providers>
          <Header />
          <main className="max-w-3xl mx-auto px-6 py-12">{children}</main>
          <footer className="border-t border-gray-200 mt-24">
            <div className="max-w-3xl mx-auto px-6 py-8 text-sm text-gray-500">
              <p>The Reef is a decentralized knowledge repository on Base.</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
