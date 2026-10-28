import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - Real-Time Stock Market Tracker & Alerts`,
    template: "%s | ${SITE_NAME}",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "stock market",
    "stock tracker",
    "real-time stock prices",
    "stock alerts",
    "watchlist",
    "TradingView",
    "stock analysis",
    "market insights",
    "portfolio tracker",
    "stock prices",
    "financial markets",
    "investment tracking",
  ],
  authors: [{ name: "Yero" }],
  creator: "Yero",
  publisher: "Yero",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} - Real-Time Stock Market Tracker & Alerts`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: `${SITE_URL}/assets/screenshots/Screenshot-dashboard.webp`,
        width: 1200,
        height: 630,
        alt: "Marketgist Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - Real-Time Stock Market Tracker & Alerts`,
    description: SITE_DESCRIPTION,
    images: [`${SITE_URL}/assets/screenshots/Screenshot-dashboard.webp`],
    creator: "@HoneyzRich",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // Add your verification codes here when available
    // google: "your-google-verification-code",
    // yandex: "your-yandex-verification-code",
  },
  alternates: {
    canonical: SITE_URL,
    types: {
      "application/rss+xml": [
        { url: `${SITE_URL}/api/rss`, title: `${SITE_NAME} RSS Feed` },
      ],
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Render every page per request: the CSP nonce from proxy.ts only reaches
  // pages rendered at request time, and a prerendered page would be blocked
  await connection();

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    creator: {
      "@type": "Organization",
      name: "Yero",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Yero",
    },
  };

  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <ErrorBoundary>{children}</ErrorBoundary>
        <ErrorBoundary>
          <Toaster />
        </ErrorBoundary>
      </body>
    </html>
  );
}
