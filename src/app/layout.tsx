import React from 'react';
import type { Metadata, Viewport } from 'next';
import AppToaster from '@/components/ui/AppToaster';
import { PosStoreProvider } from '@/lib/pos/PosStoreProvider';
import '../styles/tailwind.css';

const siteUrl = new URL(
  process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    'https://tovapos.com.ng'
);
const seoTitle = 'TOVAPOS | Retail POS, Inventory, VAT Receipts, and Stock Control';
const seoDescription =
  'TOVAPOS is a retail POS and inventory platform for supermarkets, pharmacies, mini-marts, boutiques, wholesalers, and product-selling teams, with checkout, VAT receipts, stock control, staff permissions, reports, and offline-aware sync.';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: seoTitle,
    template: '%s | TOVAPOS',
  },
  description: seoDescription,
  applicationName: 'TOVAPOS',
  keywords: [
    'TOVAPOS',
    'retail POS software',
    'inventory management software',
    'pharmacy POS',
    'supermarket POS',
    'mini mart POS',
    'boutique POS',
    'barcode POS',
    'VAT receipt software',
    'stock control software',
    'offline POS',
    'POS software Nigeria',
    'retail POS Nigeria',
    'inventory software Nigeria',
    'POS software Abuja',
    'inventory software Abuja',
    'Abuja retail software',
    'Nigeria retail business software',
  ],
  authors: [{ name: 'Daikoto', url: 'https://daikot.com.ng' }],
  creator: 'Daikoto',
  publisher: 'Daikoto',
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
  openGraph: {
    type: 'website',
    locale: 'en_NG',
    url: '/',
    siteName: 'TOVAPOS',
    title: seoTitle,
    description: seoDescription,
    images: [
      {
        url: '/assets/images/tovapos-hero.png',
        width: 1200,
        height: 630,
        alt: 'TOVAPOS retail POS and inventory platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: seoTitle,
    description: seoDescription,
    images: ['/assets/images/tovapos-hero.png'],
  },
  category: 'technology',
  appleWebApp: {
    capable: true,
    title: 'TOVAPOS',
    statusBarStyle: 'black-translucent',
  },
  other: {
    'msapplication-TileColor': '#071412',
    'msapplication-config': '/browserconfig.xml',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl.origin}/#organization`,
        name: 'TOVAPOS',
        url: siteUrl.origin,
        logo: `${siteUrl.origin}/assets/brand/tovapos-logo.svg`,
        founder: {
          '@type': 'Organization',
          name: 'Daikoto',
          url: 'https://daikot.com.ng',
        },
        areaServed: [
          { '@type': 'Country', name: 'Nigeria' },
          { '@type': 'City', name: 'Abuja' },
          { '@type': 'AdministrativeArea', name: 'Federal Capital Territory' },
        ],
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${siteUrl.origin}/#software`,
        name: 'TOVAPOS',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: siteUrl.origin,
        image: `${siteUrl.origin}/assets/images/tovapos-hero.png`,
        description: seoDescription,
        offers: [
          {
            '@type': 'Offer',
            name: 'Starter',
            priceCurrency: 'NGN',
            price: '5000',
            availability: 'https://schema.org/InStock',
          },
          {
            '@type': 'Offer',
            name: 'Pro',
            priceCurrency: 'NGN',
            price: '15000',
            availability: 'https://schema.org/InStock',
          },
        ],
        audience: {
          '@type': 'BusinessAudience',
          audienceType:
            'Retail businesses, supermarkets, pharmacies, mini-marts, boutiques, and wholesalers',
          geographicArea: [
            { '@type': 'Country', name: 'Nigeria' },
            { '@type': 'City', name: 'Abuja' },
          ],
        },
        featureList: [
          'Retail point of sale',
          'Inventory and batch tracking',
          'Barcode checkout',
          'VAT receipts',
          'Staff permissions',
          'Customer and vendor records',
          'Reports',
          'Offline-aware sync',
        ],
        publisher: {
          '@id': `${siteUrl.origin}/#organization`,
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl.origin}/#website`,
        name: 'TOVAPOS',
        url: siteUrl.origin,
        inLanguage: 'en-NG',
        publisher: {
          '@id': `${siteUrl.origin}/#organization`,
        },
      },
    ],
  };
  const themeScript = `
    (function () {
      try {
        var path = window.location.pathname || '';
        var theme = path.indexOf('/admin') === 0
          ? window.localStorage.getItem('tovapos.adminTheme')
          : window.localStorage.getItem('tovapos.themeMode');
        if (theme !== 'dark' && theme !== 'light') theme = 'light';
        document.documentElement.dataset.theme = theme;
      } catch (_) {
        document.documentElement.dataset.theme = 'light';
      }
    })();
  `;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body>
        <PosStoreProvider>
          {children}
          <AppToaster />
        </PosStoreProvider>
      </body>
    </html>
  );
}
