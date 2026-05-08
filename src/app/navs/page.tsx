import { Suspense } from 'react';

import NavsPageClient from './NavsPageClient';

export const metadata = {
  title: '导航 - navs',
  manifest: '/manifest-navs.json',
  appleWebApp: {
    capable: true,
    title: 'navs',
    statusBarStyle: 'black',
  },
  icons: {
    apple: [
      {
        url: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icons/icon-256x256.png',
        sizes: '256x256',
        type: 'image/png',
      },
    ],
  },
};

export const runtime = 'edge';

export default function NavsPage() {
  return (
    <Suspense
      fallback={
        <div className='flex h-screen items-center justify-center'>
          <div className='text-gray-500'>加载中...</div>
        </div>
      }
    >
      <NavsPageClient />
    </Suspense>
  );
}
