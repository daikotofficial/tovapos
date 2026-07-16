import React from 'react';
import type { Metadata, Viewport } from 'next';
import AppToaster from '@/components/ui/AppToaster';
import { PosStoreProvider } from '@/lib/pos/PosStoreProvider';
import '../styles/tailwind.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'TOVAPOS - Retail POS, Inventory, and Business Insights',
  description:
    'Retail POS for supermarkets, pharmacies, and product-selling businesses with sales records, inventory, vendors, customers, reports, access control, and offline sync.',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/site.webmanifest',
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
  return (
    <html lang="en">
      <body>
        <PosStoreProvider>
          {children}
          <AppToaster />
        </PosStoreProvider>
      </body>
    </html>
  );
}
