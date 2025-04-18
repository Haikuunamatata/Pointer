import type { Metadata } from 'next';
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "../components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pointer - Your Local AI Code Editor",
  description: "A modern code editor with built-in AI assistance that runs entirely on your machine. Experience local AI coding with privacy and zero latency.",
  keywords: "code editor, AI coding, local AI, privacy-first, code completion, local development, AI assistant, programming, development tools",
  authors: [{ name: "Das_F1sHy312" }],
  creator: "Das_F1sHy312",
  publisher: "Das_F1sHy312",
  openGraph: {
    title: "Pointer - Your Local AI Code Editor",
    description: "A modern code editor with built-in AI assistance that runs entirely on your machine. Experience local AI coding with privacy and zero latency.",
    type: "website",
    locale: "en_US",
    siteName: "Pointer",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pointer - Your Local AI Code Editor",
    description: "A modern code editor with built-in AI assistance that runs entirely on your machine. Experience local AI coding with privacy and zero latency.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body 
        className={`${inter.className} bg-background text-white`}
        suppressHydrationWarning
      >
        <Navbar />
        {children}
      </body>
    </html>
  );
}
