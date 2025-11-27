import { Suspense } from 'react';

import NavsPageClient from './NavsPageClient';

export const metadata = {
  title: '导航 - MoonTV',
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
