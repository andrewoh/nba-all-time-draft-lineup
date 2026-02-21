import type { Metadata } from 'next';
import '@/app/globals.css';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'NBA All-Time Random Draft Lineup',
  description:
    'Draft five random NBA franchises, lock in all-time legends, and compare greatness scores with friends.'
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
        <main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
