import type { MetadataRoute } from 'next';

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.APP_URL ||
  'https://tovapos.com.ng';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/sign-up-login'],
        disallow: [
          '/admin',
          '/admin/',
          '/admin-control',
          '/api/',
          '/categories',
          '/credit-sales',
          '/customers',
          '/dashboard',
          '/expense-heads',
          '/expenses',
          '/inventory-management',
          '/notifications',
          '/reports',
          '/sales',
          '/settings',
          '/support',
          '/sync-logs',
          '/users',
          '/vendors',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
