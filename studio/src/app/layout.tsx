import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NarraView Studio",
  description: "Content Management for NarraView Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#0A0A0C] text-white min-h-screen flex flex-col`}>
        <nav className="border-b border-white/10 bg-[#0C0C0F]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center">
                <Link href="/" className="text-xl font-bold tracking-widest text-white/80 hover:text-white transition-colors">
                  NARRAVIEW <span className="text-[#F5B800]">STUDIO</span>
                </Link>
                <div className="ml-10 flex items-baseline space-x-4">
                  <Link href="/" className="text-white/60 hover:text-white px-3 py-2 rounded-md text-sm font-medium transition-colors">
                    Content Library
                  </Link>
                </div>
              </div>
              <div>
                <span className="text-xs text-white/40 uppercase tracking-wider">Admin Portal</span>
              </div>
            </div>
          </div>
        </nav>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
