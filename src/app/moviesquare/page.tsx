import { Suspense } from 'react';

import MoviesquarePageClient from './MoviesquarePageClient';

export const metadata = {
  title: '电影票房榜 - moviesquare',
  manifest: '/manifest-moviesquare.json',
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
