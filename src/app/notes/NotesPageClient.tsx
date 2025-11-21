'use client';

import { Clock3, Plus, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { getAllNotes, NoteItem, subscribeToNotes } from '@/lib/notes.client';
import { createPreview, formatNoteDate } from '@/lib/notes.utils';

import { NotesStandaloneLayout } from './NotesStandaloneLayout';

export default function NotesPageClient() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      try {
        const all = await getAllNotes();
        if (isActive) {
          setNotes(all);
        }
      } finally {
        if (isActive) {
          setIsLoaded(true);
        }
      }
    };

    load();

    const unsubscribe = subscribeToNotes((updated) => {
      setNotes([...updated]);
    });
    return () => {
      isActive = false;
      unsubscribe();
    };
  }, []);

  const totalNotes = useMemo(() => notes.length, [notes]);

  return (
    <NotesStandaloneLayout
      leftSlot={
        <Link
          href='/notes/new'
          className='inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-white font-medium shadow-lg shadow-green-500/30 transition-colors duration-200 hover:bg-green-700'
        >
          <Plus className='h-4 w-4' />
          新建笔记
        </Link>
      }
    >
      <div className='space-y-6'>
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
    </NotesStandaloneLayout>
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
        记录任意灵感，点击左上角的新建按钮开始吧。
      </p>
    </div>
  );
}
