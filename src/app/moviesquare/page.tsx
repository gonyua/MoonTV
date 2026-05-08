import { Suspense } from 'react';

import MoviesquarePageClient from './MoviesquarePageClient';

export const metadata = {
  title: '电影票房榜 - moviesquare',
  manifest: '/manifest-moviesquare.json',
  appleWebApp: {
    capable: true,
    title: 'moviesquare',
    statusBarStyle: 'black',
  },
  icons: {
    apple: [
      {
        url: '/icons/moviesquare-icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icons/moviesquare-icon-256x256.png',
        sizes: '256x256',
        type: 'image/png',
      },
    ],
  },
};

export const runtime = 'edge';

export default function MoviesquarePage() {
  return (
    <Suspense
      fallback={
        <div className='flex min-h-screen items-center justify-center bg-white text-gray-500 dark:bg-black dark:text-gray-400'>
          加载中...
        </div>
      }
    >
      <MoviesquarePageClient />
    </Suspense>
  );
}
