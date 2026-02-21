import type { Metadata } from 'next';
import type { Viewport } from 'next';
import '@/app/globals.css';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'NBA All-Time Random Draft Lineup',
  description:
    'Draft five random NBA franchises, lock in all-time legends, and compare greatness scores with friends.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'All-Time Draft'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1d4ed8'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <main className="app-main">{children}</main>
      </body>
    </html>
  );
}
