import { Suspense } from 'react';

import NewNotePageClient from './NewNotePageClient';

export const metadata = {
  title: '新建笔记 - MoonTV',
};

export const runtime = 'edge';

export default function NewNotePage() {
  return (
    <Suspense>
      <NewNotePageClient />
    </Suspense>
  );
}
