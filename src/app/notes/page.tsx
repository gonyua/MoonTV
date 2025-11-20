import { Suspense } from 'react';

import NotesPageClient from './NotesPageClient';

export const metadata = {
  title: '我的笔记 - MoonTV',
};

export const runtime = 'edge';

export default function NotesPage() {
  return (
    <Suspense>
      <NotesPageClient />
    </Suspense>
  );
}
