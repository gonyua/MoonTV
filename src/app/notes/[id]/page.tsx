import { Suspense } from 'react';

import NoteDetailPageClient from './NoteDetailPageClient';

interface NotePageProps {
  params: { id: string };
}

export const metadata = {
  title: '笔记详情 - MoonTV',
};

export const runtime = 'edge';

export default function NoteDetailPage({ params }: NotePageProps) {
  return (
    <Suspense>
      <NoteDetailPageClient noteId={params.id} />
    </Suspense>
  );
}
