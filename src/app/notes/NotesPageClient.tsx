'use client';

import { Clock3, NotebookTabs, Plus, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { getAllNotes, NoteItem, subscribeToNotes } from '@/lib/notes.client';
import { createPreview, formatNoteDate } from '@/lib/notes.utils';

import PageLayout from '@/components/PageLayout';

export default function NotesPageClient() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setNotes(getAllNotes());
    setIsLoaded(true);

    const unsubscribe = subscribeToNotes((updated) => {
      setNotes([...updated]);
    });
    return unsubscribe;
  }, []);

  const totalNotes = useMemo(() => notes.length, [notes]);

  return (
    <PageLayout activePath='/notes'>
      <div className='px-4 sm:px-10 py-6 sm:py-10'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8'>
          <div>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2'>
              <NotebookTabs className='w-6 h-6 text-green-600' />
              我的笔记
            </h1>
            <p className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
              保存观影心得、待看片单或任何灵感想法，支持 Markdown 格式。
            </p>
          </div>
          <Link
            href='/notes/new'
            className='inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-white font-medium shadow-lg shadow-green-500/30 hover:bg-green-700 transition-colors duration-200'
          >
            <Plus className='w-4 h-4' />
            新建笔记
          </Link>
        </div>

        {totalNotes === 0 && isLoaded ? (
          <EmptyState />
        ) : (
          <div className='grid gap-4 lg:gap-6'>
            {notes.map((note) => (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                className='group rounded-2xl border border-gray-100 bg-white/80 px-5 py-4 shadow-sm hover:shadow-lg hover:border-green-100 transition-all duration-200 dark:bg-gray-900/70 dark:border-gray-800 dark:hover:border-green-500/40'
              >
                <div className='flex items-center justify-between gap-2'>
                  <h2 className='text-lg font-semibold text-gray-900 dark:text-gray-100 group-hover:text-green-700 dark:group-hover:text-green-400'>
                    {note.title}
                  </h2>
                  <span className='inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400'>
                    <Clock3 className='w-3.5 h-3.5' />
                    {formatNoteDate(note.updatedAt)}
                  </span>
                </div>
                <p className='mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2'>
                  {createPreview(note.content)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function EmptyState() {
  return (
    <div className='rounded-3xl border border-dashed border-gray-200 bg-white/70 p-8 text-center dark:border-gray-800 dark:bg-gray-900/60'>
      <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300'>
        <Wand2 className='h-7 w-7' />
      </div>
      <h3 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
        还没有笔记
      </h3>
      <p className='mt-2 text-sm text-gray-500 dark:text-gray-400'>
        记录观影心得、收藏片源或整理 TODO，点击右上角的新建按钮开始吧。
      </p>
    </div>
  );
}
