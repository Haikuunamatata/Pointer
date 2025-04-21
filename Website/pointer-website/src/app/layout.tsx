import type { Metadata } from 'next';
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "../components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pointer - Your Local AI Code Editor",
  description: "A modern code editor with built-in AI assistance that runs entirely on your machine. Experience local AI coding with privacy and zero latency.",
  keywords: ["code editor", "AI coding", "local AI", "privacy-first", "code completion", "local development", "AI assistant", "programming", "development tools"],
  authors: [{ name: "Das_F1sHy312" }],
  creator: "Das_F1sHy312",
  publisher: "Das_F1sHy312",
  openGraph: {
    title: "Pointer - Your Local AI Code Editor",
    description: "A modern code editor with built-in AI assistance that runs entirely on your machine. Experience local AI coding with privacy and zero latency.",
    type: "website",
    locale: "en_US",
    siteName: "Pointer",
    images: [
      {
        url: '/metadata.png',
        width: 1200,
        height: 630,
        alt: 'Pointer - Your Local AI Code Editor',
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pointer - Your Local AI Code Editor",
    description: "A modern code editor with built-in AI assistance that runs entirely on your machine. Experience local AI coding with privacy and zero latency.",
    images: ['/metadata.png'],
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
  },
  icons: {
    icon: [
      { url: '/logo.png', sizes: 'any' },
    ],
    apple: [
      { url: '/logo.png', sizes: 'any' },
    ],
  },
  alternates: {
    types: {
      'application/rss+xml': [
        { url: 'https://pointer.com/atom.xml', title: 'Pointer Blog | RSS Feed' },
        { url: 'https://pointer.com/rss.xml', title: 'Pointer Blog | RSS Feed' },
      ],
      'application/json': [
        { url: 'https://pointer.com/rss.json', title: 'Pointer Blog | RSS Feed' },
      ],
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
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="next-size-adjust" content="" />
        <link rel="icon" href="/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png" />
        <meta name="apple-mobile-web-app-title" content="Pointer" />
        <meta name="theme-color" content="var(--background)" />
        <script src="/_vercel/speed-insights/script.js" defer data-sdkn="@vercel/speed-insights/next" data-sdkv="1.1.0" data-route="/" />
        <script src="/_vercel/insights/script.js" defer data-sdkn="@vercel/analytics/next" data-sdkv="1.4.0" data-disable-auto-track="1" />
      </head>
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
